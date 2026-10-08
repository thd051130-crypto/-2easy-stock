#!/usr/bin/env python3
"""대시보드 종목 화면 파일을 만들어요: <out>/stocks/<시장>/<코드>.json

pages 워크플로가 dashboard.py 다음에 돌려요 (`python stock_pages.py --out _site`).
  - candles: 야후에 있는 첫날(보통 상장일. 야후 자료는 국장 2000년, 미장 1962년부터라 그 전 상장 종목은 그때)부터 일봉
    (시가·고가·저가·종가·거래량). full=true면 처음부터라는 뜻이라 앱이 첫 주·첫 달 캔들을 버리지 않아요.
    야후 원래 가격(액면분할만 반영, 배당은 빼지 않음)이라 증권사 앱 차트와 같아요.
    대시보드 다른 화면과 맞추려고 오늘 신호 날짜(signal.json의 day)까지만 넣어요.
  - fund: paper/<시장>/fundamentals.json(fundamentals.py가 매주 갱신)의 그 종목 재무 요약
야후를 못 받은 종목은 재무만으로 파일을 만들어요 (화면엔 '차트 자료 없음').
텔레그램으로 넣은 관심종목(paper/watch.json)도 만들고, 그 종목들의 종가·전일 대비·최근 60일 종가를
<out>/data.json의 extras에 채워요 (알림 종목처럼 swing-signals가 시세를 받지 않아서요). 이 종목들을 먼저 받아요.
세계 지수(world.py GROUPS의 지수들)도 <out>/indexes/<기호>.json으로 처음부터 일봉을 만들어요. 차트 화면 지수 버튼이 읽어요.
실패해도 오류로 끝내지 않아요 (대시보드 배포가 멈추지 않게).
"""

import argparse
import json
import pathlib
import time

import re

import pandas as pd

import fundamentals
import watchlist
import world
from markets import MARKETS

PERIOD = "max"  # 상장일부터 (오래된 종목도 한 종목에 1초 안팎, 폰으로 받는 파일은 압축해서 100KB 남짓)


def daily(symbol, period=PERIOD, retries=3, pause=0.5):
    """야후 일봉. 못 받으면 None."""
    import yfinance as yf

    for attempt in range(retries):
        try:
            h = yf.Ticker(symbol).history(period=period, auto_adjust=False)
            if h is not None and not h.empty:
                return h
        except Exception as e:  # 네트워크·레이트리밋
            print(f"{symbol} 시세 재시도 {attempt + 1}/{retries}: {e!r}")
        time.sleep(pause * 4 * (attempt + 1))
    return None


def candles(h, market, until=None, full=False):
    """야후 일봉 표 → {"dates", "o", "h", "l", "c", "v"}. 국장은 원 단위 정수, 미장은 센트까지. until 날짜 뒤는 빼요.
    full: 처음(상장일)부터 받은 일봉이면 표시해 둬요."""
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
    if full:
        out["full"] = True
    return out


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def row_of(entry, c):
    """관심 화면 한 줄: 넣을 때 적어 둔 정보 + 마지막 종가·전일 대비·최근 60일 종가 (알림 종목 줄과 같은 모양)."""
    if not c:
        return dict(entry)
    closes = c["c"]
    d1 = closes[-1] / closes[-2] - 1 if len(closes) > 1 and closes[-2] else None
    return dict(entry, day=c["dates"][-1], close=closes[-1], d1=None if d1 is None else round(d1, 5), spark=closes[-60:])


def build(out, market, paper=pathlib.Path("paper"), fetch=daily, pause=0.3, budget=None):
    """종목마다 파일 하나. budget초가 지나면 남은 종목은 시세를 받지 않고 재무만 넣어요 (배포가 늦어지지 않게).
    반환: (차트까지 만든 수, 재무만 만든 수, 텔레그램으로 넣은 종목 줄)."""
    fund = (read_json(paper / market / "fundamentals.json") or {}).get("stocks", {})
    until = (read_json(paper / market / "signal.json") or {}).get("day")
    extra = watchlist.extras(market, paper)
    names = {code: e.get("name") or code for code, e in extra.items()}
    names.update({code: name for code, name in fundamentals.stocks(market, extras=False).items() if code not in extra})
    folder = out / "stocks" / market
    folder.mkdir(parents=True, exist_ok=True)
    full = only_fund = 0
    rows = []
    start = time.monotonic()
    for code, name in names.items():
        late = budget is not None and time.monotonic() - start > budget
        symbol = extra[code].get("symbol") if code in extra else None
        c = None if late else candles(fetch(symbol or fundamentals.symbol(market, code)), market, until, full=True)
        f = fund.get(code)
        if code in extra:
            rows.append(row_of(extra[code], c))
        if c is not None or f is not None:
            payload = dict(code=code, name=name, market=market, candles=c, fund=f)
            (folder / f"{code}.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
            full += c is not None
            only_fund += c is None
        if not late:
            time.sleep(pause)  # 야후가 막지 않게 종목 사이에 잠깐 쉬어요
    return full, only_fund, rows


def index_file(sym):
    """지수 기호 → 파일 이름 (^KS11 → KS11). 앱(indexFile)과 같은 규칙이에요."""
    return re.sub(r"[^A-Za-z0-9.]", "", sym)


def build_indexes(out, fetch=daily, pause=0.3):
    """세계 지수마다 파일 하나 (<out>/indexes/<기호>.json). 값은 소수 둘째 자리까지. 반환: 만든 수."""
    folder = out / "indexes"
    folder.mkdir(parents=True, exist_ok=True)
    made = 0
    for _, items in world.GROUPS:
        for sym, name, kind in items:
            if kind != "idx":
                continue
            c = candles(fetch(sym), "us", full=True)
            if c is not None:
                payload = dict(sym=sym, name=name, candles=c)
                (folder / f"{index_file(sym)}.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
                made += 1
            time.sleep(pause)
    return made


def fill_extras(out, market, rows):
    """<out>/data.json의 그 시장 extras를 시세가 채워진 줄로 바꿔요."""
    path = out / "data.json"
    data = read_json(path)
    if not data or market not in data.get("markets", {}):
        return False
    data["markets"][market]["extras"] = rows
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("_site"))
    ap.add_argument("--paper", type=pathlib.Path, default=pathlib.Path("paper"), help="기록 폴더")
    ap.add_argument("--market", action="append", choices=sorted(MARKETS), help="여러 번 쓸 수 있어요 (기본: 둘 다)")
    ap.add_argument("--budget", type=float, default=150, help="시장마다 시세를 받는 최대 시간(초)")
    args = ap.parse_args()
    try:  # 지수는 13개뿐이라 먼저 (종목은 시간이 모자라면 재무만 넣어요)
        print(f"세계 지수 차트 {build_indexes(args.out)}개")
    except Exception as e:
        print(f"세계 지수 차트를 못 만들었어요: {e!r}")
    for market in args.market or ["kr", "us"]:
        try:
            full, only_fund, rows = build(args.out, market, paper=args.paper, budget=args.budget)
            fill_extras(args.out, market, rows)
            print(f"{MARKETS[market]['name']} 종목 화면 {full}개 (차트 없이 재무만 {only_fund}개, 텔레그램으로 넣은 종목 {len(rows)}개)")
        except Exception as e:  # 배포는 계속해요
            print(f"{MARKETS[market]['name']} 종목 화면을 못 만들었어요: {e!r}")


if __name__ == "__main__":
    main()
