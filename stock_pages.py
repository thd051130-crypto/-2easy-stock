#!/usr/bin/env python3
"""대시보드 종목 화면 파일을 만들어요: <out>/stocks/<시장>/<코드>.json

pages 워크플로가 dashboard.py 다음에 돌려요 (`python stock_pages.py --out _site`).
  - candles: 최근 3년 일봉(시가·고가·저가·종가·거래량). 야후 원래 가격(액면분할만 반영, 배당은 빼지 않음)이라
    증권사 앱 차트와 같아요. 대시보드 다른 화면과 맞추려고 오늘 신호 날짜(signal.json의 day)까지만 넣어요.
  - fund: paper/<시장>/fundamentals.json(fundamentals.py가 매주 갱신)의 그 종목 재무 요약
야후를 못 받은 종목은 재무만으로 파일을 만들어요 (화면엔 '차트 자료 없음').
실패해도 오류로 끝내지 않아요 (대시보드 배포가 멈추지 않게).
"""

import argparse
import json
import pathlib
import time

import pandas as pd

import fundamentals
from markets import MARKETS

YEARS = 3


def daily(symbol, years=YEARS, retries=3, pause=0.5):
    """야후 일봉. 못 받으면 None."""
    import yfinance as yf

    for attempt in range(retries):
        try:
            h = yf.Ticker(symbol).history(period=f"{years}y", auto_adjust=False)
            if h is not None and not h.empty:
                return h
        except Exception as e:  # 네트워크·레이트리밋
            print(f"{symbol} 시세 재시도 {attempt + 1}/{retries}: {e!r}")
        time.sleep(pause * 4 * (attempt + 1))
    return None


def candles(h, market, until=None):
    """야후 일봉 표 → {"dates", "o", "h", "l", "c", "v"}. 국장은 원 단위 정수, 미장은 센트까지. until 날짜 뒤는 빼요."""
    cols = ["Open", "High", "Low", "Close"]
    if h is None or any(c not in h for c in cols):
        return None
    h = h[cols + (["Volume"] if "Volume" in h else [])].dropna(subset=cols)
    idx = pd.to_datetime(h.index)
    if idx.tz is not None:
        idx = idx.tz_localize(None)
    h = h.set_axis(idx)
    if until:
        h = h[h.index <= pd.Timestamp(until)]
    if h.empty:
        return None

    def col(name):
        if market == "kr":
            return [int(round(float(x))) for x in h[name]]
        return [round(float(x), 2) for x in h[name]]

    out = dict(dates=[f"{d:%Y-%m-%d}" for d in h.index], o=col("Open"), h=col("High"), l=col("Low"), c=col("Close"))
    if "Volume" in h:
        out["v"] = [int(x) for x in h["Volume"].fillna(0)]
    return out


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def build(out, market, paper=pathlib.Path("paper"), fetch=daily, pause=0.3, budget=None):
    """종목마다 파일 하나. budget초가 지나면 남은 종목은 시세를 받지 않고 재무만 넣어요 (배포가 늦어지지 않게).
    반환: (차트까지 만든 수, 재무만 만든 수)."""
    fund = (read_json(paper / market / "fundamentals.json") or {}).get("stocks", {})
    until = (read_json(paper / market / "signal.json") or {}).get("day")
    folder = out / "stocks" / market
    folder.mkdir(parents=True, exist_ok=True)
    full = only_fund = 0
    start = time.monotonic()
    for code, name in fundamentals.stocks(market).items():
        late = budget is not None and time.monotonic() - start > budget
        c = None if late else candles(fetch(fundamentals.symbol(market, code)), market, until)
        f = fund.get(code)
        if c is None and f is None:
            continue
        payload = dict(code=code, name=name, market=market, candles=c, fund=f)
        (folder / f"{code}.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        full += c is not None
        only_fund += c is None
        if not late:
            time.sleep(pause)  # 야후가 막지 않게 종목 사이에 잠깐 쉬어요
    return full, only_fund


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("_site"))
    ap.add_argument("--market", action="append", choices=sorted(MARKETS), help="여러 번 쓸 수 있어요 (기본: 둘 다)")
    ap.add_argument("--budget", type=float, default=150, help="시장마다 시세를 받는 최대 시간(초)")
    args = ap.parse_args()
    for market in args.market or ["kr", "us"]:
        try:
            full, only_fund = build(args.out, market, budget=args.budget)
            print(f"{MARKETS[market]['name']} 종목 화면 {full}개 (차트 없이 재무만 {only_fund}개)")
        except Exception as e:  # 배포는 계속해요
            print(f"{MARKETS[market]['name']} 종목 화면을 못 만들었어요: {e!r}")


if __name__ == "__main__":
    main()
