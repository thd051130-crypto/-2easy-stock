#!/usr/bin/env python3
"""경제 일정 달력: 미국 금리 결정(FOMC), 한국은행 금리 결정(금통위), 선물·옵션 만기일, 국장 실적 시즌, 종목 실적 발표·배당락.

전부 무료예요 (키 필요 없음).
  - FOMC: 연준 홈페이지 일정표 (federalreserve.gov/monetarypolicy/fomccalendars.htm)
  - 금통위: 한국은행 홈페이지 '통화정책방향 결정회의 일정' 표
  - 만기일: 규칙으로 계산 (국장 매달 둘째 목요일, 미장 매달 셋째 금요일, 3·6·9·12월은 선물까지 같이 만기).
    거래소 휴일이면 하루 앞당겨질 수 있어요
  - 국장 실적 시즌: 우리 규칙이 새로 사지 않는 기간 (strategy.EARNINGS_SEASONS)
  - 종목 실적 발표일·배당락: fundamentals.py가 매주 받는 야후 자료 (감시 종목·텔레그램으로 넣은 종목·가상계좌 보유 종목)
미국 물가(CPI)·고용 발표일은 미국 노동부 홈페이지가 자동 접속을 막아서 아직 못 넣었어요.

매일 06:50 macro 워크플로가 돌려서 paper/calendar.json에 저장하고(앱 홈 '다가오는 일정'),
월요일엔 텔레그램으로 '[이번 주 일정]'을 보내요. 홈페이지를 못 받으면 지난번에 받은 날짜를 그대로 써요.
매매 규칙은 안 바꿔요 (국장 실적 시즌 쉬기는 원래 규칙이에요).

사용법:
    python econ_calendar.py --save paper/calendar.json            # 저장만
    python econ_calendar.py --save paper/calendar.json --report   # 저장 + 텔레그램
"""

import argparse
import calendar
import datetime as dt
import json
import pathlib
import re

import requests

import strategy
import watchlist
from markets import MARKETS

KST = dt.timezone(dt.timedelta(hours=9))
HEADERS = {"User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36"}
FOMC_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
BOK_URL = "https://www.bok.or.kr/portal/singl/crncyPolicyDrcMtg/listYear.do?mtgSe=A&menuNo=200755"
MONTHS = {m: i for i, m in enumerate(calendar.month_name) if m}
AHEAD = 120   # 앞으로 며칠 치를 저장할지
BEHIND = 7    # 지난 일정도 며칠은 남겨요 (앱에서 '어제 있었던 일'로)
WEEK = 7      # 텔레그램 주간 일정 범위
EARN_MAX = 12  # 텔레그램 주간 일정에 넣을 실적 발표 종목 수


def text_of(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


def parse_fomc(html):
    """연준 일정표 → 금리 결정일(회의 마지막 날) 'YYYY-MM-DD' 목록. '*'는 경제전망 발표가 있는 회의."""
    t = text_of(html)
    out = []
    heads = list(re.finditer(r"(\d{4}) FOMC Meetings", t))
    for k, h in enumerate(heads):
        year = int(h.group(1))
        part = t[h.end(): heads[k + 1].start() if k + 1 < len(heads) else len(t)]
        part = re.sub(r"\((?:Released|Held)[^)]*\)", " ", part)  # 의사록 공개일 같은 다른 날짜는 빼요
        names = "|".join(MONTHS)
        for m in re.finditer(rf"\b({names})(?:/({names}))?\s+(\d{{1,2}})(?:-(\d{{1,2}}))?(\*?)", part):
            month = MONTHS[m.group(2) or m.group(1)]
            day = int(m.group(4) or m.group(3))
            try:
                out.append(dict(date=f"{dt.date(year, month, day):%Y-%m-%d}", sep=bool(m.group(5))))
            except ValueError:
                continue
    return sorted({x["date"]: x for x in out}.values(), key=lambda x: x["date"])


def parse_bok(html):
    """한국은행 결정회의 표 → 그 해 회의 날짜 목록. 표 위 '2026년 년도선택'의 해로 읽어요."""
    t = text_of(html)
    y = re.search(r"(\d{4})년 년도선택", t)
    if not y:
        return []
    year, out = int(y.group(1)), []
    for m in re.finditer(r"(\d{1,2})월 (\d{1,2})일\s?\(", t[y.end():]):
        try:
            out.append(f"{dt.date(year, int(m.group(1)), int(m.group(2))):%Y-%m-%d}")
        except ValueError:
            continue
    return sorted(set(out))


def fetch(url):
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.text


def nth_weekday(year, month, weekday, n):
    """그 달 n번째 요일 (weekday: 월=0 … 일=6)."""
    first = dt.date(year, month, 1)
    return first + dt.timedelta(days=(weekday - first.weekday()) % 7 + 7 * (n - 1))


def expiries(start, end):
    """국장·미장 월물 만기일 (휴일 조정 없음)."""
    out = []
    y, m = start.year, start.month
    while dt.date(y, m, 1) <= end:
        quad = m in (3, 6, 9, 12)
        for market, d, name in (("kr", nth_weekday(y, m, 3, 2), "국장 옵션 만기"), ("us", nth_weekday(y, m, 4, 3), "미장 옵션 만기")):
            if start <= d <= end:
                out.append(dict(date=f"{d:%Y-%m-%d}", market=market, kind="expiry",
                                title=name.replace("옵션", "선물·옵션 동시") if quad else name,
                                note="만기 날엔 주가가 크게 출렁일 때가 있어요" + (" (분기 동시 만기)" if quad else "")))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def seasons(start, end):
    """국장 실적 시즌(우리 규칙이 새로 사지 않는 기간)의 시작·끝."""
    out = []
    for year in range(start.year, end.year + 1):
        for m1, d1, m2, d2 in strategy.EARNINGS_SEASONS:
            for d, title in ((dt.date(year, m1, d1), "국장 실적 시즌 시작"), (dt.date(year, m2, d2), "국장 실적 시즌 끝")):
                if start <= d <= end:
                    out.append(dict(date=f"{d:%Y-%m-%d}", market="kr", kind="season", title=title,
                                    note="우리 규칙은 이 기간에 새로 사지 않아요" if "시작" in title else "다음 날부터 다시 새로 살 수 있어요"))
    return out


def held_codes(paper, market):
    """가상계좌(알림·규칙표·ETF)에 들고 있는 종목."""
    out = set()
    for folder in (paper / market, paper / market / "rulebook") + ((paper / "etf",) if market == "kr" else ()):
        try:
            out |= {p["code"] for p in json.loads((folder / "state.json").read_text()).get("positions", [])}
        except (OSError, ValueError, KeyError):
            continue
    return out


def stock_events(paper, start, end):
    """종목 실적 발표·배당락 (fundamentals.json). mine: 텔레그램으로 넣었거나 가상계좌에 있는 종목."""
    out = []
    for market in MARKETS:
        try:
            stocks = json.loads((paper / market / "fundamentals.json").read_text()).get("stocks", {})
        except (OSError, ValueError):
            continue
        mine = set(watchlist.extras(market, paper)) | held_codes(paper, market)
        for code, f in stocks.items():
            e = f.get("events") or {}
            for key, kind, title in (("earn", "earn", "실적 발표"), ("exdiv", "exdiv", "배당락")):
                d = e.get(key)
                if d and f"{start:%Y-%m-%d}" <= d <= f"{end:%Y-%m-%d}":
                    out.append(dict(date=d, market=market, kind=kind, title=f"{f.get('name') or code} {title}", code=code,
                                    cap=f.get("cap"), mine=code in mine))
    return out


def build(today, fomc, bok, paper):
    start, end = today - dt.timedelta(days=BEHIND), today + dt.timedelta(days=AHEAD)
    ev = []
    for x in fomc:
        if f"{start:%Y-%m-%d}" <= x["date"] <= f"{end:%Y-%m-%d}":
            ev.append(dict(date=x["date"], market="us", kind="rate", title="미국 금리 결정 (FOMC)",
                           note="한국시간 다음 날 새벽 3~4시 발표" + (" · 경제전망도 같이 나와요" if x["sep"] else "")))
    for d in bok:
        if f"{start:%Y-%m-%d}" <= d <= f"{end:%Y-%m-%d}":
            ev.append(dict(date=d, market="kr", kind="rate", title="한국 금리 결정 (금통위)", note="보통 오전 10시쯤 발표"))
    ev += expiries(start, end) + seasons(start, end) + stock_events(paper, start, end)
    ev.sort(key=lambda x: (x["date"], x["kind"] != "rate", -(x.get("cap") or 0)))
    return ev


def week_text(events, today, limit=EARN_MAX):
    """텔레그램 '[이번 주 일정]': 앞으로 7일. 실적 발표는 내 종목 먼저, 그다음 시가총액 큰 순으로 몇 개만."""
    end = f"{today + dt.timedelta(days=WEEK - 1):%Y-%m-%d}"
    week = [e for e in events if f"{today:%Y-%m-%d}" <= e["date"] <= end]
    big = [e for e in week if e["kind"] not in ("earn", "exdiv")]
    stocks = sorted((e for e in week if e["kind"] == "earn" or (e["kind"] == "exdiv" and e.get("mine"))),
                    key=lambda e: (not e.get("mine"), -(e.get("cap") or 0)))[:limit]
    days = "월화수목금토일"
    flag = {"kr": "🇰🇷", "us": "🇺🇸"}
    lines = ["[이번 주 일정]", f"{today:%m.%d}~{end[5:7]}.{end[8:]} · 참고용, 매매 규칙은 그대로예요"]
    for e in sorted(big + stocks, key=lambda e: e["date"]):
        d = dt.date.fromisoformat(e["date"])
        star = " ⭐" if e.get("mine") else ""
        lines.append(f"- {d:%m.%d}({days[d.weekday()]}) {flag.get(e['market'], '')} {e['title']}{star}")
    if len(lines) == 2:
        lines.append("- 이번 주엔 큰 일정이 없어요.")
    if any(e.get("mine") for e in stocks):
        lines.append("⭐ 텔레그램으로 넣은 종목이나 가상계좌에 있는 종목이에요.")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--save", type=pathlib.Path, default=pathlib.Path("paper/calendar.json"))
    ap.add_argument("--paper", type=pathlib.Path, default=pathlib.Path("paper"))
    ap.add_argument("--report", action="store_true", help="텔레그램으로 이번 주 일정 보내기")
    ap.add_argument("--dry-run", action="store_true", help="텔레그램으로 보내지 않고 출력만")
    args = ap.parse_args()
    today = dt.datetime.now(KST).date()
    old = json.loads(args.save.read_text()) if args.save.exists() else {}
    fomc, bok = old.get("fomc") or [], old.get("bok") or []
    try:
        fomc = parse_fomc(fetch(FOMC_URL)) or fomc
    except Exception as e:  # 못 받으면 지난번 날짜
        print(f"FOMC 일정을 못 받았어요 (지난번 날짜를 써요): {e!r}")
    try:
        got = parse_bok(fetch(BOK_URL))
        bok = sorted(set(got) | {d for d in bok if d[:4] != (got[0][:4] if got else "")}) if got else bok
    except Exception as e:
        print(f"금통위 일정을 못 받았어요 (지난번 날짜를 써요): {e!r}")
    events = build(today, fomc, bok, args.paper)
    args.save.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(updated=dt.datetime.now(KST).isoformat(timespec="minutes"), fomc=fomc, bok=bok, events=events)
    args.save.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    text = week_text(events, today)
    print(text)
    if args.report and not args.dry_run:
        from realtime_monitor import send_telegram

        if not send_telegram(text, collapse=False):
            raise SystemExit("텔레그램 전송 실패 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 확인)")


if __name__ == "__main__":
    main()
