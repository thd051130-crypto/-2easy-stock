#!/usr/bin/env python3
"""세계 지수·환율·금리·원자재: 야후 무료 일봉(미국 2년 금리·장단기 차는 FRED, 한국 국고채 금리는 한국은행 ECOS)으로 모아 paper/world.json에 남겨요.

앱 홈 "세계 지수·환율" 칸이 이걸 읽어서 오늘·1주·1개월·1년 등락률과 작은 추세선을 보여 줘요.
매매 규칙엔 안 쓰고 보기용이에요. 전부 무료 (유료 API 안 씀).

사용법:
    python world.py --dry-run                  # 출력만
    python world.py --save paper/world.json    # 기록
"""

import argparse
import datetime as dt
import json
import os
import pathlib
import re
import time

import pandas as pd

KST = dt.timezone(dt.timedelta(hours=9))

# (묶음, [(야후 기호, 이름, 표시 방식)]). 표시 방식: idx 지수, krw 원화 환율, num 그냥 숫자, usd 달러 값,
# rate 금리(%) — 금리는 등락률 대신 몇 %p 바뀌었는지로 남겨요
GROUPS = [
    ("한국", [("^KS11", "코스피", "idx"), ("^KQ11", "코스닥", "idx")]),
    ("미국", [("^GSPC", "S&P500", "idx"), ("^IXIC", "나스닥", "idx"), ("^DJI", "다우", "idx"),
              ("^SOX", "필라델피아 반도체", "idx")]),
    ("아시아", [("^N225", "일본 닛케이225", "idx"), ("000001.SS", "중국 상하이종합", "idx"),
                ("^HSI", "홍콩 항셍", "idx"), ("^TWII", "대만 가권", "idx")]),
    ("유럽", [("^STOXX50E", "유로스톡스50", "idx"), ("^GDAXI", "독일 DAX", "idx"), ("^FTSE", "영국 FTSE100", "idx")]),
    ("환율", [("KRW=X", "원/달러", "krw"), ("JPYKRW=X", "원/엔 (100엔)", "krw"), ("EURKRW=X", "원/유로", "krw"),
              ("CNYKRW", "원/위안", "krw"), ("DX-Y.NYB", "달러인덱스", "num")]),
    ("채권 금리", [("US2Y", "미국 2년 국채 금리", "rate"), ("^TNX", "미국 10년 국채 금리", "rate"),
                ("US10Y2Y", "미국 장단기 금리 차 (10년-2년)", "rate"),
                ("KR3Y", "한국 국고채 3년 금리", "rate"), ("KR10Y", "한국 국고채 10년 금리", "rate"),
                ("TLT", "미국 장기 국채 ETF (TLT)", "usd")]),
    ("원자재", [("CL=F", "WTI 유가", "usd"), ("GC=F", "금 (온스)", "usd"), ("HG=F", "구리 (파운드)", "usd")]),
    ("리츠·부동산", [("VNQ", "미국 리츠 ETF (VNQ)", "usd"), ("329200.KS", "국내 리츠 ETF (TIGER 리츠부동산인프라)", "krw")]),
    ("공포·코인", [("^VIX", "VIX 공포 지수", "num"), ("BTC-USD", "비트코인", "usd")]),
]
# 야후에 기록이 짧은 환율은 다른 환율로 계산해요: 원/위안 = 원/달러 ÷ 위안/달러
DERIVED = {"CNYKRW": ("KRW=X", "CNY=X")}
# 야후에 없거나(2년 금리 선물 2YY=F는 값이 멈춰 있어요) 믿기 어려운 금리는 다른 무료 자료에서 받아요. 못 받으면 그 줄만 빠져요
#  - 미국 2년 금리, 장단기 금리 차(10년-2년, 마이너스면 역전): FRED (미국 연준 무료 CSV, 하루 늦게 나와요)
#  - 한국 국고채 금리: 한국은행 ECOS 시장금리(일별) 817Y002. 무료 인증키를 Secrets ECOS_API_KEY에 넣어야 해요
#    (네이버 금융 옛 금리 페이지는 2026-10에 없어졌어요). 키가 없으면 두 줄만 빠져요
FRED_RATE = {"US2Y": "DGS2", "US10Y2Y": "T10Y2Y"}
ECOS_TABLE = "817Y002"
ECOS_RATE = {"KR3Y": ("국고채(3년)", "010200000"), "KR10Y": ("국고채(10년)", "010210000")}  # (항목 이름, 이름으로 못 찾을 때 코드)
ECOS_URL = "https://ecos.bok.or.kr/api"
KR_RATE = ECOS_RATE
SCALE = {"JPYKRW=X": 100}  # 원/엔은 100엔 기준으로 보여 줘요
KEEP = 260  # 앱에 보낼 종가 수 (약 1년)
# 장 종료 기준 (사용자 2026-11-06): 예약 실행이 몇 시간씩 늦어 장중에 받을 때가 많아요. 거래소 장이 아직 안 끝났으면
# 오늘 막대(장중 값)는 버리고, 야후 일봉에 막 끝난 날이 아직 없으면 시세 정보의 종가로 채워요.
# 야후 정규장 끝 시각(코스피는 15:00으로 나와요, 실제 15:30)보다 이만큼 지나야 끝난 걸로 봐요
SETTLE = pd.Timedelta(minutes=40)
ALL_DAY = {"CURRENCY", "FUTURE", "CRYPTOCURRENCY"}  # 거의 24시간 거래라 장 종료가 없어요 (환율·선물·코인)


def symbols():
    out = []
    for _, items in GROUPS:
        for sym, _, _ in items:
            if sym not in KR_RATE and sym not in FRED_RATE:
                out.extend(DERIVED.get(sym, (sym,)))
    return list(dict.fromkeys(out))


def fetch(days=400, pause=1.0, retries=3):
    """야후 일봉 종가 {기호: Series(날짜→종가)}. 못 받은 기호는 빠져요."""
    import yfinance as yf

    start = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    out = {}
    for sym in symbols():
        part, tk = None, yf.Ticker(sym)
        for attempt in range(retries):
            try:
                part = tk.history(start=start, auto_adjust=True)
                if not part.empty:
                    break
            except Exception as e:  # 레이트리밋 등
                print(f"{sym} 재시도 {attempt + 1}/{retries}: {e}")
            time.sleep(pause * 2 ** attempt)
        time.sleep(pause)
        if part is None or part.empty:
            print(f"경고: {sym} 데이터 없음")
            continue
        s = part["Close"].dropna()
        s.index = pd.to_datetime(s.index).tz_localize(None).normalize()
        s = s[~s.index.duplicated(keep="last")]
        try:
            meta = tk.history_metadata
        except Exception:  # 시세 정보가 없으면 일봉 그대로
            meta = None
        out[sym], live = settle(s, meta)
        if live:
            LIVE[sym] = live
    if not out:
        raise SystemExit("야후에서 세계 지수·환율을 하나도 못 받았어요.")
    import big_events

    for sym, code in FRED_RATE.items():
        rate = big_events.fred(code)
        if rate is not None and len(rate):
            out[sym] = rate[rate.index >= pd.Timestamp(start)]
    key = os.environ.get("ECOS_API_KEY", "").strip()
    if not key:
        print("참고: ECOS_API_KEY가 없어서 한국 국고채 금리는 빠져요")
    else:
        try:
            out.update(ecos_rates(key, start))
        except Exception as e:  # ECOS가 막히면 그 줄만 빠져요. 키가 주소에 들어가니 네트워크 오류 글은 남기지 않아요
            print(f"경고: ECOS 국고채 금리 못 받음 ({type(e).__name__})")
    return out


LIVE = {}  # 기호 → 장이 아직 안 끝난 오늘 날짜 (그날 값은 안 써요)


def _ts(x):
    return None if x is None else pd.Timestamp(x)


def settle(s, meta, now=None):
    """장 종료 기준 일봉. (일봉, 장중이라 뺀 날짜 또는 None).
    - 거래소 장이 아직 안 끝났으면 오늘 막대(장중 값)를 빼요.
    - 장이 끝났는데 일봉에 그날이 없으면(야후 국장 지수는 하루 늦게 붙어요) 시세 정보의 종가로 채워요."""
    if not meta or meta.get("instrumentType") in ALL_DAY or not meta.get("exchangeTimezoneName"):
        return s, None
    tz = meta["exchangeTimezoneName"]
    now = pd.Timestamp(now or dt.datetime.now(dt.timezone.utc)).tz_convert(tz)
    today = pd.Timestamp(now.date())
    reg = (meta.get("currentTradingPeriod") or {}).get("regular") or {}
    end = _ts(reg.get("end"))
    open_today = end is not None and end.tz_convert(tz).date() == now.date() and now < end + SETTLE
    live = None
    if open_today and len(s) and s.index[-1] == today:
        s, live = s.iloc[:-1], today.date().isoformat()
    t, price = _ts(meta.get("regularMarketTime")), meta.get("regularMarketPrice")
    if t is not None and price and (not len(s) or pd.Timestamp(t.tz_convert(tz).date()) > s.index[-1]):
        day = pd.Timestamp(t.tz_convert(tz).date())
        if not (day == today and open_today):
            s = pd.concat([s, pd.Series([float(price)], index=[day])])
    return s, live


def ecos_get(key, *parts):
    import requests

    r = requests.get("/".join([ECOS_URL, parts[0], key, "json", "kr", *map(str, parts[1:])]), timeout=20)
    r.raise_for_status()
    data = r.json()
    if parts[0] not in data:  # 키가 틀리거나 자료가 없으면 {"RESULT": {"CODE", "MESSAGE"}}
        res = data.get("RESULT", {})
        raise RuntimeError(f"ECOS {res.get('CODE')} {res.get('MESSAGE')}")
    return data[parts[0]].get("row", [])


def ecos_codes(items):
    """ECOS 항목 목록 → {기호: 항목 코드}. 이름으로 찾고, 없으면 적어 둔 코드."""
    by_name = {re.sub(r"\s", "", x.get("ITEM_NAME", "")): x.get("ITEM_CODE") for x in items if x.get("CYCLE") in (None, "D")}
    return {sym: by_name.get(name, code) for sym, (name, code) in ECOS_RATE.items()}


def parse_ecos_rows(rows):
    """ECOS StatisticSearch 줄들 → 날짜→금리 Series (값 없는 날 빼요). 하나도 없으면 None."""
    pts = {}
    for x in rows:
        try:
            pts[pd.Timestamp(dt.datetime.strptime(x["TIME"], "%Y%m%d"))] = float(x["DATA_VALUE"])
        except (KeyError, TypeError, ValueError):
            continue
    return pd.Series(pts).sort_index() if pts else None


def ecos_rates(key, start):
    try:
        codes = ecos_codes(ecos_get(key, "StatisticItemList", 1, 100, ECOS_TABLE))
    except Exception as e:
        print(f"참고: ECOS 항목 목록 못 받아서 적어 둔 코드 씀 ({e if isinstance(e, RuntimeError) else type(e).__name__})")
        codes = {sym: code for sym, (_, code) in ECOS_RATE.items()}
    end = dt.datetime.now(KST).strftime("%Y%m%d")
    out = {}
    for sym, code in codes.items():
        try:
            rate = parse_ecos_rows(ecos_get(key, "StatisticSearch", 1, 1000, ECOS_TABLE, "D",
                                            start.replace("-", ""), end, code))
        except RuntimeError as e:  # ECOS가 돌려준 오류 코드·글 (키는 안 들어 있어요)
            print(f"경고: {sym} {e}")
            continue
        if rate is None:
            print(f"경고: {sym} ECOS 값 없음")
        else:
            out[sym] = rate
            print(f"{sym} ECOS {len(rate)}일, 마지막 {rate.index[-1].date()} {rate.iloc[-1]}%")
    return out


def series_of(sym, closes):
    if sym in DERIVED:
        a, b = (closes.get(x) for x in DERIVED[sym])
        if a is None or b is None:
            return None
        both = pd.concat([a, b], axis=1, join="inner").dropna()
        return both.iloc[:, 0] / both.iloc[:, 1]
    s = closes.get(sym)
    return None if s is None else s * SCALE.get(sym, 1)


def change(s, days, rate=False):
    """마지막 종가가 days일(달력) 전 그날까지의 마지막 종가보다 얼마나 변했나 (금리는 %p 차이)."""
    past = s[s.index <= s.index[-1] - pd.Timedelta(days=days)]
    if past.empty:
        return None
    return round(float(s.iloc[-1] - past.iloc[-1]), 4) if rate else round(float(s.iloc[-1] / past.iloc[-1] - 1), 5)


def item(sym, name, kind, s):
    s = s.dropna()
    if len(s) < 2:
        return None
    keep, rate = s.iloc[-KEEP:], kind == "rate"
    d1 = s.iloc[-1] - s.iloc[-2] if rate else s.iloc[-1] / s.iloc[-2] - 1
    return dict(sym=sym, name=name, kind=kind, day=s.index[-1].date().isoformat(), last=round(float(s.iloc[-1]), 4),
                d1=round(float(d1), 5), w1=change(s, 7, rate), m1=change(s, 30, rate), y1=change(s, 365, rate),
                closes=[float(f"{x:.6g}") for x in keep], dates=[x.date().isoformat() for x in keep.index])


def saved_series(snap):
    """지난 기록(paper/world.json) → {기호: 날짜→값}. 야후가 하루를 빼먹은 날을 지난 기록으로 채워요."""
    out = {}
    for g in (snap or {}).get("groups", []):
        for r in g.get("items", []):
            if r.get("dates") and len(r["dates"]) == len(r.get("closes", [])):
                out[r["sym"]] = pd.Series(r["closes"], index=pd.to_datetime(r["dates"]), dtype=float)
    return out


def fill_gaps(s, old, live=None):
    """새 일봉이 우선, 빠진 날만 지난 기록으로. 장중이라 뺀 날(live)부터는 지난 기록도 안 써요."""
    if old is not None and len(old):
        s = s.combine_first(old)
    if live:
        s = s[s.index < pd.Timestamp(live)]
    return s


def snapshot(closes, now=None, old=None, live=None):
    old, live = old or {}, LIVE if live is None else live
    groups = []
    for gname, items in GROUPS:
        rows = []
        for sym, name, kind in items:
            s = series_of(sym, closes)
            if s is not None:
                s = fill_gaps(s, old.get(sym), live.get(sym))
            row = None if s is None else item(sym, name, kind, s)
            if row:
                rows.append(row)
        if rows:
            groups.append(dict(name=gname, items=rows))
    now = now or dt.datetime.now(KST)
    return dict(updated=now.isoformat(timespec="minutes"), groups=groups)


def format_text(snap):
    lines = [f"[세계 지수·환율] {snap['updated'][:16].replace('T', ' ')}"]
    for g in snap["groups"]:
        lines.append(f"· {g['name']}")
        for r in g["items"]:
            if r["kind"] == "rate":
                m1 = "-" if r["m1"] is None else f"{r['m1']:+.2f}%p"
                lines.append(f"  {r['name']} {r['last']:.2f}% ({r['d1']:+.2f}%p, 1개월 {m1})")
                continue
            m1 = "-" if r["m1"] is None else f"{r['m1']:+.1%}"
            lines.append(f"  {r['name']} {r['last']:,.2f} ({r['d1']:+.2%}, 1개월 {m1})")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--save", type=pathlib.Path, help="기록할 파일 (paper/world.json)")
    parser.add_argument("--dry-run", action="store_true", help="출력만")
    args = parser.parse_args()
    prev = None
    if args.save and args.save.exists():
        try:
            prev = json.loads(args.save.read_text(encoding="utf-8"))
        except ValueError:
            prev = None
    snap = snapshot(fetch(), old=saved_series(prev))
    print(format_text(snap))
    if args.save and not args.dry_run:
        args.save.parent.mkdir(parents=True, exist_ok=True)
        args.save.write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"{args.save} 저장")


if __name__ == "__main__":
    main()
