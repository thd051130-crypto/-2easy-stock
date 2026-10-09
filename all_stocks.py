#!/usr/bin/env python3
"""전 종목 종목 화면 파일: 검색 목록(paper/symbols/<시장>.json)의 모든 종목·ETF를 앱에서 바로 열 수 있게 해요.

대시보드 종목(대형주 + 텔레그램으로 넣은 종목)만 stock_pages.py가 상장일부터 일봉을 받아요. 나머지 국장 약 4천·미장 약 5천 종목은
여기서 야후(무료)를 묶음으로 받아 가볍게 만들어요. 그래서 검색에서 아무 종목이나 눌러 차트를 보고 ☆로 관심종목에 넣을 수 있어요.
  - <out>/<코드>.json : 최근 2년 일봉 + 자료 시작(보통 상장)부터 월봉 (앱이 월봉·년봉은 월봉으로, 일봉·주봉은 일봉으로 그려요)
                        + 적립식 계산기 숫자(paper/symbols/<시장>_returns.json의 그 종목 줄, 있으면)
  - <out>/_quotes.json : 종목마다 [종가, 전일 대비, 3개월 등락, 200일선 대비, 52주 고점 대비, RSI14] (조건 검색 '전 종목'용)
all-stocks 워크플로가 장 마감 뒤 돌려서 아티팩트(stocks-<시장>)로 올리면, pages 워크플로가 받아서 _site/stocks/<시장>/에 풀어요.
대시보드 종목은 그다음 stock_pages.py가 상장일부터 받은 파일로 덮어써요. 매매 규칙·가상계좌 신호는 안 바꿔요 (보기 전용).

사용법:
    python all_stocks.py --market kr --out _all/kr
    python all_stocks.py --market us --out _all/us --limit 300   # 앞쪽 300종목만 (시험용)
"""

import argparse
import datetime as dt
import json
import pathlib
import time

from kr_swing_signals import screen_stats
from returns import ticker
from stock_pages import candles

KST = dt.timezone(dt.timedelta(hours=9))
FOLDER = pathlib.Path("paper/symbols")
BATCH = 150     # 한 번에 받는 종목 수 (150종목 일봉 2년 15초, 월봉 전체 9초쯤)
DAILY = "2y"    # 일봉 기간: 200일선·52주 고점까지 계산돼요


def download(tickers, interval, period, retries=2):
    """야후 묶음 다운로드 → {야후 코드: 표}. 못 받으면 {}."""
    import yfinance as yf

    for attempt in range(retries + 1):
        try:
            df = yf.download(tickers, interval=interval, period=period, auto_adjust=False,
                             group_by="ticker", progress=False, threads=True)
            break
        except Exception as e:  # 네트워크·레이트리밋
            print(f"{interval} 재시도 {attempt + 1}: {e!r}")
            time.sleep(5 * (attempt + 1))
    else:
        return {}
    out = {}
    for t in tickers:
        try:
            d = df[t] if getattr(df.columns, "nlevels", 1) > 1 else df
        except KeyError:
            continue
        d = d.dropna(subset=["Close"]) if "Close" in d else d.iloc[0:0]
        if not d.empty:
            out[t] = d
    return out


def quote(c):
    """일봉 → [종가, 전일 대비, 3개월(63거래일) 등락, 200일선 대비, 52주 고점 대비, RSI14] (모자라면 None)."""
    import pandas as pd

    s = pd.Series(c["c"], dtype=float)
    last = float(s.iloc[-1])
    d1 = round(last / float(s.iloc[-2]) - 1, 4) if len(s) > 1 and s.iloc[-2] else None
    base = s.iloc[-64] if len(s) >= 64 else s.iloc[0]
    c3 = round(last / float(base) - 1, 4) if base else None
    st = screen_stats(s)
    return [c["c"][-1], d1, c3, st.get("ma200"), st.get("hi52"), st.get("rsi14")]


def build(market, rows, out, rets=None, fetch=download, pause=1.0):
    """종목마다 파일 하나 + 조건 검색용 시세 요약. 반환: (만든 수, 요약 dict, 가장 늦은 날짜)."""
    rets = rets or {}
    out.mkdir(parents=True, exist_ok=True)
    by_t = {ticker(market, r): r for r in rows}
    todo, made, quotes, day = list(by_t), 0, {}, None
    for i in range(0, len(todo), BATCH):
        part = todo[i:i + BATCH]
        days, months = fetch(part, "1d", DAILY), fetch(part, "1mo", "max")
        for t in part:
            row = by_t[t]
            c = candles(days.get(t), market)
            if c is None or len(c["dates"]) < 2:
                continue
            m = candles(months.get(t), market)
            if m is not None:
                c["monthly"] = m
            payload = dict(code=row[0], name=row[1], market=market, exch=row[2], kind=row[3], lite=True, candles=c,
                           fund=None, flows=None, ret=rets.get(row[0]))
            (out / f"{row[0]}.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
            quotes[row[0]] = quote(c)
            day = max(day or "", c["dates"][-1])
            made += 1
        print(f"{min(i + BATCH, len(todo))}/{len(todo)} 받음 (파일 {made}개)")
        time.sleep(pause)
    return made, quotes, day


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--market", choices=["kr", "us"], required=True)
    ap.add_argument("--out", type=pathlib.Path, required=True)
    ap.add_argument("--limit", type=int, help="앞쪽 몇 종목만 (시험용)")
    args = ap.parse_args()
    rows = json.loads((FOLDER / f"{args.market}.json").read_text())["rows"]
    if args.limit:
        rows = rows[:args.limit]
    ret_path = FOLDER / f"{args.market}_returns.json"
    rets = json.loads(ret_path.read_text()).get("s", {}) if ret_path.exists() else {}
    made, quotes, day = build(args.market, rows, args.out, rets)
    (args.out / "_quotes.json").write_text(json.dumps(
        dict(updated=dt.datetime.now(KST).isoformat(timespec="minutes"), day=day, q=quotes),
        ensure_ascii=False, separators=(",", ":")))
    print(f"{args.market} 종목 파일 {made}/{len(rows)}개")
    if made < len(rows) * 0.5:
        raise SystemExit("절반도 못 받았어요 (야후 막힘?) — 올리지 않아요")


if __name__ == "__main__":
    main()
