#!/usr/bin/env python3
"""외국인·기관 수급: 국장 종목마다 최근 60거래일 외국인·기관·개인 순매수(주식 수)와 외국인 보유율을 모아요.

네이버 증권 모바일 무료 자료(m.stock.naver.com/api/stock/<코드>/trend)를 써요 (키·계좌 필요 없음).
swing-signals 국장 실행(평일 17:30) 때 돌려서 paper/kr/flows.json 으로 저장해요.
  - 종목 화면: 최근 20일 외국인·기관 순매수 막대, 5·20일 합계, 연속 매수·매도 일수 (stock_pages.py가 붙여요)
  - 앱 홈: '외국인·기관 같이 파는 종목' 경고 (dashboard.py가 data.json에 넣어요)
참고용이에요. 매매 규칙은 안 바꿔요 (과거 수급 자료로 백테스트를 하지 않았어요).
한 종목을 못 받아도 지난번 값을 그대로 둬요.

사용법:
    python flows.py                 # 감시 종목 + 텔레그램으로 넣은 국장 관심종목
    python flows.py --code 005930   # 한 종목만 받아서 출력
"""

import argparse
import datetime as dt
import json
import pathlib
import time

import requests

import fundamentals
from markets import MARKETS

KST = dt.timezone(dt.timedelta(hours=9))
URL = "https://m.stock.naver.com/api/stock/{code}/trend?pageSize={n}"
HEADERS = {"User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36"}
DAYS = 60       # 받아 두는 거래일 수
SHOW = 20       # 종목 화면 막대 수
STREAK_WARN = 3  # 외국인 연속 순매도가 이만큼이면 홈 경고 후보
WARN_MAX = 6


def to_int(s):
    """'+5,259,380' / '-1,307,041' / '0' → 정수. 이상하면 None."""
    try:
        return int(str(s).replace(",", "").replace("+", "").strip())
    except (TypeError, ValueError):
        return None


def to_pct(s):
    try:
        return float(str(s).replace("%", "").replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def parse(rows):
    """네이버 응답(최근 날짜부터) → 오래된 날짜부터 {"dates", "frg", "inst", "ind", "close", "hold"}. 쓸 줄이 없으면 None."""
    out = dict(dates=[], frg=[], inst=[], ind=[], close=[], hold=[])
    for r in reversed(rows or []):
        d = str(r.get("bizdate") or "")
        frg, inst = to_int(r.get("foreignerPureBuyQuant")), to_int(r.get("organPureBuyQuant"))
        if len(d) != 8 or frg is None or inst is None:
            continue
        out["dates"].append(f"{d[:4]}-{d[4:6]}-{d[6:]}")
        out["frg"].append(frg)
        out["inst"].append(inst)
        out["ind"].append(to_int(r.get("individualPureBuyQuant")))
        out["close"].append(to_int(r.get("closePrice")))
        out["hold"].append(to_pct(r.get("foreignerHoldRatio")))
    return out if out["dates"] else None


def streak(vals):
    """맨 끝(오늘)부터 같은 방향이 이어진 날 수. 순매수면 +, 순매도면 -, 0이면 0."""
    n, sign = 0, 0
    for v in reversed(vals):
        s = (v > 0) - (v < 0)
        if s == 0 or (sign and s != sign):
            break
        sign, n = s, n + 1
    return n * sign


def summarize(f):
    """화면에 보여 줄 숫자: 5·20일 순매수 합계(주식 수, 대략 원 = 수량 × 그날 종가), 연속 일수, 보유율 변화."""
    def total(key, k):
        return sum(f[key][-k:])

    def won(key, k):
        return sum(q * (c or 0) for q, c in zip(f[key][-k:], f["close"][-k:]))

    hold = [h for h in f["hold"] if h is not None]
    return dict(day=f["dates"][-1],
                frg5=total("frg", 5), frg20=total("frg", 20), inst5=total("inst", 5), inst20=total("inst", 20),
                frg5_won=won("frg", 5), inst5_won=won("inst", 5), frg20_won=won("frg", 20), inst20_won=won("inst", 20),
                frg_streak=streak(f["frg"]), inst_streak=streak(f["inst"]),
                hold=hold[-1] if hold else None,
                hold_chg=round(hold[-1] - hold[-21 if len(hold) > 20 else 0], 2) if len(hold) > 1 else None)


def fetch(code, n=DAYS, retries=3, pause=0.5):
    for attempt in range(retries):
        try:
            r = requests.get(URL.format(code=code, n=n), headers=HEADERS, timeout=15)
            r.raise_for_status()
            f = parse(r.json())
            if f:
                return f
            raise ValueError("빈 자료")
        except Exception as e:  # 네트워크·형식 변경
            print(f"{code} 수급 재시도 {attempt + 1}/{retries}: {e!r}")
            time.sleep(pause * 4 * (attempt + 1))
    return None


def codes():
    """감시 종목 + 텔레그램으로 넣은 국장 관심종목 (ETF도 네이버에 수급이 있어요)."""
    return fundamentals.stocks("kr")


def update(path, todo=None, fetch=fetch, pause=0.2):
    """종목마다 받아서 저장. 못 받은 종목은 지난번 값을 둬요. 반환: (받은 수, 못 받은 코드)."""
    old = json.loads(path.read_text()).get("stocks", {}) if path.exists() else {}
    todo = todo or codes()
    new, failed = {}, []
    for code, name in todo.items():
        f = fetch(code)
        if f:
            f = {k: v[-DAYS:] for k, v in f.items()}
            new[code] = dict(name=name, **f, sum=summarize(f))
        else:
            failed.append(code)
            if code in old:
                new[code] = old[code]
        time.sleep(pause)
    days = sorted({s["dates"][-1] for s in new.values() if s.get("dates")})
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(updated=dt.datetime.now(KST).isoformat(timespec="minutes"), day=days[-1] if days else None, stocks=new)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    return len(todo) - len(failed), failed


def warnings(flows, limit=WARN_MAX):
    """홈 경고: 오늘 기준 외국인이 STREAK_WARN일 이상 연속 순매도하고, 5일 동안 기관도 순매도한 종목 (판 금액이 큰 순)."""
    if not flows:
        return []
    day = flows.get("day")
    out = []
    for code, s in (flows.get("stocks") or {}).items():
        m = s.get("sum") or {}
        if m.get("day") != day or m.get("frg_streak", 0) > -STREAK_WARN or m.get("inst5", 0) >= 0:
            continue
        out.append(dict(code=code, name=s.get("name") or code, frg_streak=-m["frg_streak"],
                        sold=round(-(m["frg5_won"] + m["inst5_won"])), hold=m.get("hold"), hold_chg=m.get("hold_chg")))
    out.sort(key=lambda x: -x["sold"])
    return out[:limit]


def top_flows(flows, limit=5):
    """홈 한 줄 요약용: 5일 동안 외국인+기관 합쳐 가장 많이 산 종목과 판 종목."""
    if not flows:
        return dict(buy=[], sell=[])
    day = flows.get("day")
    rows = []
    for code, s in (flows.get("stocks") or {}).items():
        m = s.get("sum") or {}
        if m.get("day") == day:
            rows.append(dict(code=code, name=s.get("name") or code, won=round(m["frg5_won"] + m["inst5_won"])))
    rows.sort(key=lambda x: -x["won"])
    return dict(buy=[r for r in rows if r["won"] > 0][:limit], sell=[r for r in rows[::-1] if r["won"] < 0][:limit])


def for_stock(flows, code):
    """종목 화면용: 최근 SHOW일 막대 자료 + 요약."""
    s = ((flows or {}).get("stocks") or {}).get(code)
    if not s:
        return None
    keep = ("dates", "frg", "inst", "ind", "hold")
    return dict({k: s[k][-SHOW:] for k in keep if k in s}, sum=s.get("sum"))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("paper/kr/flows.json"))
    ap.add_argument("--code", help="한 종목만 받아서 출력 (저장 안 함)")
    args = ap.parse_args()
    if args.code:
        f = fetch(args.code)
        print(json.dumps(f and dict(sum=summarize(f), last=[f[k][-1] for k in ("dates", "frg", "inst", "hold")]),
                         ensure_ascii=False))
        return
    got, failed = update(args.out)
    print(f"{MARKETS['kr']['name']} 수급 {got}종목 받음" + (f", 못 받음 {len(failed)}: {' '.join(failed)}" if failed else ""))
    if got == 0:
        raise SystemExit("수급 자료를 한 종목도 못 받았어요")


if __name__ == "__main__":
    main()
