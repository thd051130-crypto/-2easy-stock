#!/usr/bin/env python3
"""경제 일정 달력: 미국 금리 결정(FOMC), 한국은행 금리 결정(금통위), 선물·옵션 만기일, 종목 실적 발표·배당락.

전부 무료예요 (키 필요 없음).
  - FOMC: 연준 홈페이지 일정표 (federalreserve.gov/monetarypolicy/fomccalendars.htm)
  - 금통위: 한국은행 홈페이지 '통화정책방향 결정회의 일정' 표
  - 만기일: 규칙으로 계산 (국장 매달 둘째 목요일, 미장 매달 셋째 금요일, 3·6·9·12월은 선물까지 같이 만기 = 네 마녀의 날).
    거래소 휴장일이면 앞 거래일로 당겨요 (휴장일은 holidays 패키지의 한국거래소·뉴욕거래소 달력)
  - 🛑 휴장·조기 폐장, ⚖️ 지수 정기변경(코스피200·MSCI·S&P 500·나스닥100·러셀), 💰 국장 연말 배당락,
    FOMC 회의록(회의 3주 뒤)·ISM 지수(매달 첫째·셋째 거래일)·한국 수출입(매달 1일): 전부 규칙으로 계산해요
    (사용자 2026-11-19 "ELS 만기일처럼 증시에 큰 영향 가는 일 국내·미국 다 반영되는 거야?" → "알아서 채워두도록")
  - 종목 실적 발표일·배당락: fundamentals.py가 매주 받는 야후 자료 (감시 종목·텔레그램으로 넣은 종목)
  - 초대형주 실적 (엔비디아·테슬라 등 감시 종목 밖, BIG_EARN): 야후에서 실적 날짜만 매일 받아요
  - ⚠️ 리스크 일정 (ELS 대량 만기·보호예수 해제처럼 숫자 발표는 아니지만 증시에 부담인 일): paper/risk_events.json에
    사람이 적어 둔 것. 7일 전·하루 전에 텔레그램으로 미리 알려요 (사용자 2026-11-15 "리스크 있는 일 있으면 미리 알려줘")
  - 미국 물가(CPI)·고용·PCE·GDP 같은 큰 발표: 몇 달 치 날짜는 FRED(세인트루이스 연준) 발표 일정표
    (fred.stlouisfed.org/releases/calendar, 미국 중부 시간 → 한국시간). 미국 노동부 홈페이지는 자동 접속을 막아서 FRED로 받아요.
    이번 주 일정은 big_events.py가 받아 둔 paper/events.json(예상치 포함)이 같은 시각 FRED 일정 대신 들어가요.

매일 06:50 macro 워크플로가 돌려서 paper/calendar.json에 저장하고(앱 홈 '다가오는 일정'),
월요일엔 텔레그램으로 '[이번 주 일정]'을 보내요. 홈페이지를 못 받으면 지난번에 받은 날짜를 그대로 써요.

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
from zoneinfo import ZoneInfo

import watchlist
from markets import MARKETS

KST = dt.timezone(dt.timedelta(hours=9))
HEADERS = {"User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36"}
FOMC_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
BOK_URL = "https://www.bok.or.kr/portal/singl/crncyPolicyDrcMtg/listYear.do?mtgSe=A&menuNo=200755"
FRED_CAL = "https://fred.stlouisfed.org/releases/calendar?rid={rid}&y={year}"
# FRED 발표 번호 → (한국어 이름, 지수를 크게 흔드는 1급인지). 1급은 🚨로 강조해요
FRED_RELEASES = {
    10: ("미국 소비자물가(CPI)", True),
    50: ("미국 고용 보고서 (실업률·일자리)", True),
    54: ("미국 PCE 물가 (연준이 보는 물가)", True),
    53: ("미국 GDP (경제성장률)", True),
    46: ("미국 생산자물가(PPI)", False),
    9: ("미국 소매판매", False),
    192: ("미국 구인 건수(JOLTS)", False),
}
EASTERN = ZoneInfo("America/New_York")
# MSCI 분기 리뷰 발표일 (미국 날짜, 장 마감 뒤라 한국시간 다음 날 아침). MSCI가 미리 알린 날만 적어요
MSCI_ANNOUNCE = ("2026-11-11", "2027-02-09")
# 수능 날은 국장이 1시간 늦게(10시) 열어요. 교육부가 발표한 날만
SUNEUNG = ("2025-11-13", "2026-11-19")
US_HOLIDAY_KO = {"New Year's Day": "새해 첫날", "Martin Luther King Jr. Day": "마틴 루서 킹 데이", "Washington's Birthday": "대통령의 날",
                 "Good Friday": "성금요일", "Memorial Day": "메모리얼 데이", "Juneteenth National Independence Day": "노예해방기념일",
                 "Independence Day": "독립기념일", "Labor Day": "노동절", "Thanksgiving Day": "추수감사절", "Christmas Day": "크리스마스"}
CENTRAL = ZoneInfo("America/Chicago")
MONTHS = {m: i for i, m in enumerate(calendar.month_name) if m}
YEARS_BACK = 1   # 작년 1월부터 (앱 달력에서 지난 일정도 연하게 볼 수 있어요)
YEARS_AHEAD = 1  # 내년 12월까지 (미국 발표·FOMC는 올라온 해까지만 있어요)
WEEK = 7      # 텔레그램 주간 일정 범위
EARN_MAX = 12  # 텔레그램 주간 일정에 넣을 실적 발표 종목 수
# 감시 종목(fundamentals)엔 없지만 실적 하나로 지수를 흔드는 초대형주. 실적 날짜만 받아요
BIG_EARN = {"NVDA": "엔비디아", "TSLA": "테슬라", "AVGO": "브로드컴", "AMD": "AMD", "NFLX": "넷플릭스", "COST": "코스트코",
            "MU": "마이크론", "TSM": "TSMC", "ASML": "ASML", "PLTR": "팔란티어", "CRM": "세일즈포스", "ADBE": "어도비"}
RISK_FILE = "risk_events.json"
RISK_ALERT_DAYS = (7, 1)  # 리스크 일정 며칠 전에 텔레그램으로 알릴지


def text_of(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


def parse_fomc(html):
    """연준 일정표 → 금리 결정일(회의 마지막 날) 'YYYY-MM-DD' 목록. '*'는 경제전망 발표가 있는 회의.
    표의 달(fomc-meeting__month)과 날짜(fomc-meeting__date) 칸을 짝지어 읽고, 해는 바로 위 'YYYY FOMC Meetings' 제목으로 정해요.
    서면 결의(notation vote)는 금리 결정이 아니라서 빼요."""
    heads = [(m.start(), int(m.group(1))) for m in re.finditer(r"(\d{4}) FOMC Meetings", html)]
    out = {}
    pat = re.compile(r'fomc-meeting__month[^>]*>\s*(?:<strong>)?\s*([A-Za-z/]+)\s*(?:</strong>)?\s*</div>\s*'
                     r'<div[^>]*fomc-meeting__date[^>]*>\s*([^<]+?)\s*</div>')
    for m in pat.finditer(html):
        year = next((y for pos, y in reversed(heads) if pos < m.start()), None)
        months, days = m.group(1).split("/"), m.group(2)
        if year is None or "notation" in days.lower() or months[-1] not in MONTHS:
            continue
        nums = re.findall(r"\d{1,2}", days)
        if not nums:
            continue
        try:
            d = dt.date(year, MONTHS[months[-1]], int(nums[-1]))
        except ValueError:
            continue
        out[f"{d:%Y-%m-%d}"] = dict(date=f"{d:%Y-%m-%d}", sep="*" in days)
    return sorted(out.values(), key=lambda x: x["date"])


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


def parse_fred(html, rid):
    """FRED 발표 일정표 → [{'at': 한국시간 ISO, 'rid': 번호}]. 날짜 줄('Tuesday November 10, 2026') 다음 줄에
    시각('7:30 am', 미국 중부 시간)과 그 발표 링크(release?rid=번호)가 있어요."""
    out, day = [], None
    for row in re.split(r"<tr", html):
        t = text_of(row)
        m = re.search(r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) ([A-Z][a-z]+) (\d{1,2}), (\d{4})", t)
        if m and m.group(1) in MONTHS:
            day = dt.date(int(m.group(3)), MONTHS[m.group(1)], int(m.group(2)))
            continue
        hm = re.search(r"(\d{1,2}):(\d{2}) (am|pm)", t)
        if day and hm and f"release?rid={rid}\"" in row:
            h = int(hm.group(1)) % 12 + (12 if hm.group(3) == "pm" else 0)
            at = dt.datetime(day.year, day.month, day.day, h, int(hm.group(2)), tzinfo=CENTRAL).astimezone(KST)
            out.append(dict(at=at.isoformat(timespec="minutes"), rid=rid))
    return out


def fetch_fred(today):
    """작년·올해·내년 큰 발표 날짜. FRED는 브라우저 흉내(User-Agent)를 보내면 막혀서 그냥 요청해요."""
    out = []
    for rid in FRED_RELEASES:
        for year in range(today.year - YEARS_BACK, today.year + YEARS_AHEAD + 1):
            r = requests.get(FRED_CAL.format(rid=rid, year=year), timeout=20)
            r.raise_for_status()
            out += parse_fred(r.text, rid)
    return sorted(out, key=lambda x: x["at"])


def keep_past(new, old, today):
    """새로 받은 FOMC 날짜 + 지난번에만 있던 지난 날짜 (홈페이지에서 빠진 지난 회의도 달력에 남게).
    앞으로의 날짜는 새로 받은 것만 믿어요 (일정이 바뀌었을 수 있어서). 새것이 비면 지난번 그대로."""
    if not new:
        return old
    seen = {x["date"] for x in new}
    return sorted(new + [x for x in old if x["date"] < f"{today:%Y-%m-%d}" and x["date"] not in seen], key=lambda x: x["date"])


def release_events(releases, start, end, taken=()):
    """FRED 일정 → 달력 줄. taken: 이미 events.json(이번 주, 예상치 포함)에 있는 (날짜, 메모) — 같은 시각이면 빼요."""
    out = []
    for x in releases:
        at = dt.datetime.fromisoformat(x["at"])
        name, tier1 = FRED_RELEASES.get(x["rid"], (None, False))
        d, note = f"{at:%Y-%m-%d}", f"한국시간 {at:%H:%M} 발표"
        if name and f"{start:%Y-%m-%d}" <= d <= f"{end:%Y-%m-%d}" and (d, note) not in taken:
            out.append(dict(date=d, market="us", kind="big", title=name, big=tier1, note=note))
    # 같은 시각 발표는 한 줄로 (예: CPI와 소매판매가 같은 날 같은 시각)
    merged = {}
    for e in out:
        k = (e["date"], e["note"])
        if k in merged:
            merged[k]["title"] += f" · {e['title']}"
            merged[k]["big"] = merged[k]["big"] or e["big"]
        else:
            merged[k] = e
    return list(merged.values())


def fetch(url):
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.text


def nth_weekday(year, month, weekday, n):
    """그 달 n번째 요일 (weekday: 월=0 … 일=6)."""
    first = dt.date(year, month, 1)
    return first + dt.timedelta(days=(weekday - first.weekday()) % 7 + 7 * (n - 1))


def _holidays(market, years):
    """거래소 휴장일 {date: 이름}. holidays 패키지가 없으면 빈 칸 (만기일은 휴장 조정 없이)."""
    try:
        import holidays
    except ImportError:
        return {}
    return dict(holidays.financial_holidays("XKRX" if market == "kr" else "NYSE", years=years))


_HOL = {}


def closed(market, d):
    if (market, d.year) not in _HOL:
        _HOL[(market, d.year)] = _holidays(market, d.year)
    return d.weekday() >= 5 or d in _HOL[(market, d.year)]


def trading_back(market, d):
    """d가 휴장이면 앞 거래일로."""
    while closed(market, d):
        d -= dt.timedelta(days=1)
    return d


def trading_days(market, year, month):
    """그 달 거래일 목록."""
    days = calendar.monthrange(year, month)[1]
    return [x for x in (dt.date(year, month, k) for k in range(1, days + 1)) if not closed(market, x)]


def months(start, end):
    y, m = start.year, start.month
    while dt.date(y, m, 1) <= end:
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def expiries(start, end):
    """국장·미장 월물 만기일. 휴장이면 앞 거래일. 3·6·9·12월은 네 마녀의 날(🚨)."""
    out = []
    for y, m in months(start, end):
        quad = m in (3, 6, 9, 12)
        for market, base, name in (("kr", nth_weekday(y, m, 3, 2), "국장"), ("us", nth_weekday(y, m, 4, 3), "미장")):
            d = trading_back(market, base)
            if start <= d <= end:
                note = ("주가지수 선물·옵션과 개별 주식 선물·옵션이 한꺼번에 끝나는 날이라 장 막판에 크게 출렁일 수 있어요"
                        if quad else "만기 날엔 주가가 크게 출렁일 때가 있어요")
                if d != base:
                    note += f" · {base:%m.%d} 휴장이라 앞당겨졌어요"
                out.append(dict(date=f"{d:%Y-%m-%d}", market=market, kind="expiry",
                                title=f"{name} 선물·옵션 동시만기 (네 마녀의 날)" if quad else f"{name} 옵션 만기",
                                **({"big": True} if quad else {}), note=note))
    return out


def index_events(start, end):
    """⚖️ 지수 정기변경: 지수를 따라가는 펀드가 그날 종가에 한꺼번에 사고팔아 거래량·주가가 크게 움직여요."""
    out = []

    def add(d, market, title, note, big=False):
        if start <= d <= end:
            out.append(dict(date=f"{d:%Y-%m-%d}", market=market, kind="index", title=title, note=note, **({"big": True} if big else {})))

    for y, m in months(start, end):
        if m in (6, 12):  # 코스피200·코스닥150: 6·12월 동시만기 다음 거래일부터 새 구성
            add(trading_back("kr", nth_weekday(y, m, 3, 2)), "kr", "코스피200·코스닥150 정기변경 (오늘 종가 반영)",
                "지수 펀드가 빠지는 종목을 팔고 새로 들어오는 종목을 장 마감 때 한꺼번에 사요. 다음 거래일부터 새 구성")
        if m in (2, 5, 8, 11):  # MSCI 분기 리뷰: 그달 마지막 거래일 종가
            add(trading_days("us", y, m)[-1], "world", "MSCI 지수 정기변경 (오늘 종가 반영)",
                "외국인 패시브 자금이 장 마감 때 몰려요. 국장은 이날 오후 3시 30분 종가, 미장은 그날 밤 종가", big=True)
        if m in (3, 6, 9, 12):  # S&P 500 분기 리밸런싱 (+12월 나스닥100 연례 교체): 셋째 금요일 종가
            add(trading_back("us", nth_weekday(y, m, 4, 3)), "us",
                "S&P 500 분기 리밸런싱" + (" · 나스닥100 연례 종목 교체" if m == 12 else "") + " (종가 반영)",
                "네 마녀의 날과 같은 날 종가에 지수 펀드 매매가 겹쳐요")
        if m == 6 or (m == 12 and y >= 2026):  # 러셀: 6월 넷째 금요일, 2026년부터 12월 둘째 금요일도
            add(trading_back("us", nth_weekday(y, m, 4, 4 if m == 6 else 2)), "us", "러셀 지수 재구성 (종가 반영)",
                "미국 중소형주 지수(러셀2000 등) 펀드 매매가 몰려 그날 거래량이 1년 중 손꼽게 커요")
    for x in MSCI_ANNOUNCE:
        d = dt.date.fromisoformat(x) + dt.timedelta(days=1)
        add(d, "world", "MSCI 분기 리뷰 발표 (편입·편출 종목)", "한국시간 아침 6시쯤 · 들어가는 종목은 오르고 빠지는 종목은 내리는 경우가 많아요")
    return out


def holiday_events(start, end):
    """🛑 휴장·조기 폐장·늦게 여는 날, 💰 국장 연말 배당락."""
    out = []
    for y in range(start.year, end.year + 1):
        for market, name in (("kr", "국장"), ("us", "미장")):
            for d, why in sorted(_holidays(market, y).items()):
                if start <= d <= end and d.weekday() < 5:
                    why = US_HOLIDAY_KO.get(why.replace(" (observed)", ""), why) if market == "us" else why.split(";")[0]
                    out.append(dict(date=f"{d:%Y-%m-%d}", market=market, kind="holiday", title=f"{name} 휴장 ({why})",
                                    note="이날은 장이 안 열려요"))
        # 미장 조기 폐장 (오후 1시 마감): 추수감사절 다음 날, 독립기념일 전날·크리스마스 이브 (평일이고 휴장이 아닐 때)
        thanks = nth_weekday(y, 11, 3, 4)
        for d in (thanks + dt.timedelta(days=1), dt.date(y, 7, 3), dt.date(y, 12, 24)):
            if start <= d <= end and not closed("us", d) and not (d.month == 7 and closed("us", dt.date(y, 7, 4))):
                at = dt.datetime(d.year, d.month, d.day, 13, tzinfo=EASTERN).astimezone(KST)
                out.append(dict(date=f"{d:%Y-%m-%d}", market="us", kind="holiday", title="미장 조기 폐장",
                                note=f"오후 1시(한국시간 {at:%H:%M})에 일찍 끝나요. 거래가 적어 작은 주문에도 출렁일 수 있어요"))
        kr = [x for m in (12,) for x in trading_days("kr", y, m)]
        if len(kr) >= 2 and start <= kr[-2] <= end:  # 마지막 거래일이 배당 기준일 → 그 앞 거래일이 배당락
            out.append(dict(date=f"{kr[-2]:%Y-%m-%d}", market="kr", kind="divday", title="국장 연말 배당락 (12월 결산 배당 기업)",
                            note="배당 기준일을 연말로 둔 기업은 이날 배당만큼 내려 출발해요. 요즘은 기준일을 2~3월로 옮긴 기업도 많아요"))
        first = trading_days("kr", y, 1)
        if first and start <= first[0] <= end:
            out.append(dict(date=f"{first[0]:%Y-%m-%d}", market="kr", kind="holiday", title="국장 새해 첫 거래일 (10시 개장)",
                            note="개장식 때문에 평소보다 1시간 늦게 열어요"))
    for x in SUNEUNG:
        if f"{start:%Y-%m-%d}" <= x <= f"{end:%Y-%m-%d}":
            out.append(dict(date=x, market="kr", kind="holiday", title="국장 10시 개장 (수능 날)", note="수능 날은 1시간 늦게 열고 1시간 늦게(16:30) 닫아요"))
    return out


def rule_releases(start, end, fomc=()):
    """규칙으로 정해지는 큰 발표 (kind big, 📌): FOMC 회의록(회의 3주 뒤 오후 2시), ISM 제조업(첫 거래일)·서비스업(셋째 거래일)
    오전 10시(미국 동부), 한국 수출입 동향(매달 1일 오전 9시, 주말에도 발표)."""
    out = []

    def add(at, market, title):
        k = at.astimezone(KST)
        if start <= k.date() <= end:
            out.append(dict(date=f"{k:%Y-%m-%d}", market=market, kind="big", title=title, big=False, note=f"한국시간 {k:%H:%M} 발표"))

    for x in fomc:
        d = dt.date.fromisoformat(x["date"]) + dt.timedelta(days=21)
        add(dt.datetime(d.year, d.month, d.day, 14, tzinfo=EASTERN), "us", "FOMC 회의록")
    for y, m in months(start - dt.timedelta(days=1), end):
        days = trading_days("us", y, m)
        for i, name in ((0, "ISM 제조업 지수"), (2, "ISM 서비스업 지수")):
            if len(days) > i:
                d = days[i]
                add(dt.datetime(d.year, d.month, d.day, 10, tzinfo=EASTERN), "us", name)
        add(dt.datetime(y, m, 1, 9, tzinfo=KST), "kr", "한국 수출입 동향 (반도체 수출)")
    return out


def stock_events(paper, start, end):
    """종목 실적 발표·배당락 (fundamentals.json). mine: 텔레그램으로 넣은 관심종목."""
    out = []
    for market in MARKETS:
        try:
            stocks = json.loads((paper / market / "fundamentals.json").read_text()).get("stocks", {})
        except (OSError, ValueError):
            continue
        mine = set(watchlist.extras(market, paper))
        for code, f in stocks.items():
            e = f.get("events") or {}
            for key, kind, title in (("earn", "earn", "실적 발표"), ("exdiv", "exdiv", "배당락")):
                d = e.get(key)
                if d and f"{start:%Y-%m-%d}" <= d <= f"{end:%Y-%m-%d}":
                    out.append(dict(date=d, market=market, kind=kind, title=f"{f.get('name') or code} {title}", code=code,
                                    cap=f.get("cap"), mine=code in mine))
    return out


def big_earn(old=(), fetch=None):
    """초대형주 다음 실적 날짜 [{date, code, name, cap}]. 못 받은 종목은 지난번 것."""
    if fetch is None:
        import yfinance as yf

        def fetch(code):
            info = yf.Ticker(code).info or {}
            ts = info.get("earningsTimestamp") or info.get("earningsTimestampStart")
            return ts, info.get("marketCap")
    prev = {x["code"]: x for x in old or []}
    out = []
    for code, name in BIG_EARN.items():
        try:
            ts, cap = fetch(code)
            if not ts:
                raise ValueError("실적 날짜 없음")
            out.append(dict(code=code, name=name, cap=cap,
                            date=f"{dt.datetime.fromtimestamp(ts, ZoneInfo('America/New_York')).date():%Y-%m-%d}"))
        except Exception as e:
            print(f"{name} 실적 날짜를 못 받았어요 (지난번 것을 써요): {e!r}")
            if code in prev:
                out.append(prev[code])
    return out


def risk_events(paper, start, end):
    """paper/risk_events.json의 ⚠️ 리스크 일정 → 달력 줄 (kind risk)."""
    try:
        items = json.loads((pathlib.Path(paper) / RISK_FILE).read_text(encoding="utf-8")).get("events") or []
    except (OSError, ValueError):
        return []
    return [dict(date=x["date"], market=x.get("market") or "kr", kind="risk", title=x["title"], note=x.get("note") or "",
                 **({"src": x["src"]} if x.get("src") else {}))
            for x in items if x.get("date") and x.get("title") and f"{start:%Y-%m-%d}" <= x["date"] <= f"{end:%Y-%m-%d}"]


def risk_alert(events, today, days=RISK_ALERT_DAYS):
    """⚠️ 리스크 일정이 딱 days일 뒤면 텔레그램 글, 없으면 None."""
    rows = []
    for e in events:
        if e["kind"] != "risk":
            continue
        left = (dt.date.fromisoformat(e["date"]) - today).days
        if left in days:
            d = dt.date.fromisoformat(e["date"])
            rows.append(f"- {d:%m.%d}({'월화수목금토일'[d.weekday()]}) {'내일' if left == 1 else f'{left}일 뒤'} · {e['title']}"
                        + (f"\n  {e['note']}" if e.get("note") else ""))
    if not rows:
        return None
    return "\n".join(["[⚠️ 리스크 일정 미리 알림]", *rows, "증시에 부담이 될 수 있는 일정이에요. 참고용이고 사고팔기 판단은 안 해요."])


def big_rows(paper, releases, start, end, fomc=()):
    """큰 발표 줄 (kind big): 이번 주는 events.json(홈 '큰 발표' 칸과 같은 자료), 나머지는 FRED 일정.
    dashboard.py도 배포 때마다 이걸로 다시 만들어요 — 홈 칸과 달력이 늘 같은 이름·시각·등급이 되게
    (사용자 2026-11-15 "연준 발표내용 서로 다른데 통일해")."""
    import big_events

    week = big_events.calendar_events(paper, f"{start:%Y-%m-%d}", f"{end:%Y-%m-%d}")
    taken = {(e["date"], e["note"]) for e in week}
    fred = release_events(releases, start, end, taken)
    taken |= {(e["date"], e["note"]) for e in fred}
    # 규칙 일정은 같은 날·같은 시각에 이미 줄이 있으면 빼요 (이번 주는 events.json 이름 그대로)
    return week + fred + [e for e in rule_releases(start, end, fomc) if (e["date"], e["note"]) not in taken]


def sort_key(e):
    return (e["date"], e["kind"] not in ("risk", "big", "rate", "expiry", "index", "holiday", "divday"), -(e.get("cap") or 0))


def build(today, fomc, bok, paper, releases=(), earn=()):
    start, end = dt.date(today.year - YEARS_BACK, 1, 1), dt.date(today.year + YEARS_AHEAD, 12, 31)
    ev = []
    for x in fomc:
        if f"{start:%Y-%m-%d}" <= x["date"] <= f"{end:%Y-%m-%d}":
            ev.append(dict(date=x["date"], market="us", kind="rate", title="미국 금리 결정 (FOMC)", big=True,
                           note="한국시간 다음 날 새벽 3~4시 발표" + (" · 경제전망도 같이 나와요" if x["sep"] else "")))
    for d in bok:
        if f"{start:%Y-%m-%d}" <= d <= f"{end:%Y-%m-%d}":
            ev.append(dict(date=d, market="kr", kind="rate", title="한국 금리 결정 (금통위)", note="보통 오전 10시쯤 발표"))
    ev += big_rows(paper, releases, start, end, fomc)
    ev += expiries(start, end) + index_events(start, end) + holiday_events(start, end)
    ev += stock_events(paper, start, end) + risk_events(paper, start, end)
    have = {e.get("code") for e in ev if e["kind"] == "earn"}
    ev += [dict(date=x["date"], market="us", kind="earn", title=f"{x['name']} 실적 발표", code=x["code"], cap=x.get("cap"), mine=False)
           for x in earn if x["code"] not in have and f"{start:%Y-%m-%d}" <= x["date"] <= f"{end:%Y-%m-%d}"]
    ev.sort(key=sort_key)
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
        mark = "🚨 " if e.get("big") else {"risk": "⚠️ ", "index": "⚖️ ", "holiday": "🛑 ", "divday": "💰 "}.get(e["kind"], "")
        when = f" ({e['note']})" if e["kind"] in ("big", "risk") and e.get("note") else ""
        lines.append(f"- {d:%m.%d}({days[d.weekday()]}) {flag.get(e['market'], '🌐')} {mark}{e['title']}{when}{star}")
    if len(lines) == 2:
        lines.append("- 이번 주엔 큰 일정이 없어요.")
    if any(e.get("big") and e["kind"] in ("big", "rate") for e in big):
        lines.append("🚨 지수가 크게 움직일 수 있는 발표예요. 전날과 발표 뒤에 따로 알려 드려요.")
    if any(e["kind"] in ("expiry", "index") and e.get("big") for e in big):
        lines.append("🚨⏳⚖️ 만기·지수 정기변경 날은 장 마감 때 큰 매매가 몰려 출렁일 수 있어요.")
    if any(e["kind"] == "risk" for e in big):
        lines.append("⚠️ 숫자 발표는 아니지만 증시에 부담이 될 수 있는 일정이에요. 7일 전·하루 전에 다시 알려 드려요.")
    if any(e.get("mine") for e in stocks):
        lines.append("⭐ 텔레그램으로 넣은 관심종목이에요.")
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
        fomc = keep_past(parse_fomc(fetch(FOMC_URL)), fomc, today)
    except Exception as e:  # 못 받으면 지난번 날짜
        print(f"FOMC 일정을 못 받았어요 (지난번 날짜를 써요): {e!r}")
    try:
        got = parse_bok(fetch(BOK_URL))
        bok = sorted(set(got) | {d for d in bok if d[:4] != (got[0][:4] if got else "")}) if got else bok
    except Exception as e:
        print(f"금통위 일정을 못 받았어요 (지난번 날짜를 써요): {e!r}")
    releases = old.get("releases") or []
    try:
        releases = fetch_fred(today) or releases
    except Exception as e:
        print(f"FRED 발표 일정을 못 받았어요 (지난번 날짜를 써요): {e!r}")
    earn = big_earn(old.get("big_earn"))
    events = build(today, fomc, bok, args.paper, releases, earn)
    args.save.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(updated=dt.datetime.now(KST).isoformat(timespec="minutes"), fomc=fomc, bok=bok, releases=releases,
                   big_earn=earn, events=events)
    args.save.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    text = week_text(events, today)
    print(text)
    if args.report and not args.dry_run:
        from realtime_monitor import send_telegram

        if not send_telegram(text, collapse=False):
            raise SystemExit("텔레그램 전송 실패 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 확인)")
    alert = risk_alert(events, today)
    if alert:
        print(alert)
        if not args.dry_run:
            from realtime_monitor import send_telegram

            send_telegram(alert, collapse=False)  # 못 보내도 달력 저장은 그대로


if __name__ == "__main__":
    main()
