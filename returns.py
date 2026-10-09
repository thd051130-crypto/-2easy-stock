#!/usr/bin/env python3
"""적립식 계산기용 종목별 과거 수익률: paper/symbols/<시장>_returns.json

검색 목록(paper/symbols/<시장>.json)에 있는 모든 종목·ETF의 월봉을 야후 파이낸스(무료)에서 받아 숫자 네 개로 줄여요.
  - 주가 상승률: 최근 10년(상장이 더 짧으면 상장 뒤 전체) 월말 종가 기준 연 복리
  - 배당·분배율: 같은 기간 받은 배당 ÷ 그때 주가, 1년 평균
  - 최대 낙폭: 상장 뒤 전체, 배당 다시 넣은 값(수정 종가) 월말 기준
  - 상장(자료 시작) 연월
ETF 가격에는 총보수가 이미 빠져 있어서 계산기는 보수를 따로 빼지 않아요.
1년이 안 된 종목은 숫자를 안 만들어요(계산기가 '자료 부족'으로 보여요).
fundamentals 워크플로(매주 토요일)에서 symbols.py 다음에 돌려요. 못 받은 종목은 지난번 값을 둬요.

한 줄: 코드 → [시작 "YYYY-MM", 주가 상승 %/년, 배당 %/년, 최대 낙폭 %, 계산에 쓴 햇수]

사용법:
    python returns.py                    # 국장·미장 둘 다
    python returns.py --market us        # 미장만
    python returns.py --code SCHD        # 한 종목만 출력 (저장 안 함)
"""

import argparse
import datetime as dt
import json
import math
import pathlib
import time

KST = dt.timezone(dt.timedelta(hours=9))
FOLDER = pathlib.Path("paper/symbols")
WINDOW = 120   # 최근 10년(월) 수익률
MIN_MONTHS = 12
BATCH = 150


def ticker(market, row):
    """검색 목록 한 줄 → 야후 코드 (국장은 .KS/.KQ)."""
    return f"{row[0]}.{row[2] or 'KS'}" if market == "kr" else row[0].replace(".", "-")


def stats(months):
    """[(연월, 종가, 수정 종가, 배당)] 오래된 순 → [시작, 주가 %, 배당 %, 낙폭 %, 햇수]. 짧거나 이상하면 None."""
    rows = [m for m in months if m[1] and m[1] > 0 and not math.isnan(m[1])]
    if len(rows) < MIN_MONTHS + 1:
        return None
    win = rows[-(WINDOW + 1):]
    n = len(win) - 1
    years = n / 12
    price = (win[-1][1] / win[0][1]) ** (1 / years) - 1
    div = sum((m[3] or 0) / m[1] for m in win[1:] if m[3] and not math.isnan(m[3])) / years
    peak, mdd = 0.0, 0.0
    for m in rows:
        v = m[2] if m[2] and m[2] > 0 and not math.isnan(m[2]) else m[1]
        peak = max(peak, v)
        mdd = min(mdd, v / peak - 1)
    if not (-0.99 < price < 3 and 0 <= div < 1):  # 액면분할 누락 같은 이상한 값
        return None
    return [rows[0][0], round(price * 100, 1), round(div * 100, 2), round(mdd * 100), round(years, 1)]


def fetch(tickers, retries=2):
    """야후 월봉 한 묶음 → {야후 코드: [(연월, 종가, 수정 종가, 배당)]}."""
    import yfinance as yf

    for attempt in range(retries + 1):
        try:
            df = yf.download(tickers, interval="1mo", period="max", auto_adjust=False, actions=True,
                             group_by="ticker", progress=False, threads=True)
            break
        except Exception as e:  # 네트워크
            print(f"월봉 재시도 {attempt + 1}: {e!r}")
            time.sleep(5 * (attempt + 1))
    else:
        return {}
    out = {}
    for t in tickers:
        try:
            d = df[t] if getattr(df.columns, "nlevels", 1) > 1 else df
        except KeyError:
            continue
        d = d.dropna(subset=["Close"])
        if d.empty:
            continue
        divs = d["Dividends"] if "Dividends" in d else [0] * len(d)
        out[t] = [(f"{ix:%Y-%m}", float(c), float(a), float(v)) for ix, c, a, v in zip(d.index, d["Close"], d["Adj Close"], divs)]
    return out


def build(market, rows, old=None, fetch=fetch, pause=1.0):
    """검색 목록 줄들 → {코드: 숫자}. 못 받은 종목은 old 값을 써요."""
    old = old or {}
    by_t = {ticker(market, r): r[0] for r in rows}
    out, todo = {}, list(by_t)
    for i in range(0, len(todo), BATCH):
        got = fetch(todo[i:i + BATCH])
        for t in todo[i:i + BATCH]:
            s = stats(got[t]) if t in got else None
            code = by_t[t]
            if s:
                out[code] = s
            elif code in old and t not in got:
                out[code] = old[code]
        time.sleep(pause)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--market", choices=["kr", "us"])
    ap.add_argument("--code")
    args = ap.parse_args()
    if args.code:
        t = args.code if "." in args.code or not args.code.isdigit() else f"{args.code}.KS"
        print(stats(fetch([t]).get(t, [])))
        return
    for m in [args.market] if args.market else ["kr", "us"]:
        src = FOLDER / f"{m}.json"
        if not src.exists():
            print(f"{src} 없음, 건너뜀")
            continue
        rows = json.loads(src.read_text())["rows"]
        path = FOLDER / f"{m}_returns.json"
        old = json.loads(path.read_text()).get("s", {}) if path.exists() else {}
        s = build(m, rows, old)
        print(f"{m} 수익률 {len(s)}/{len(rows)}종목")
        if len(s) < len(rows) * 0.5 and len(old) > len(s):
            raise SystemExit("절반도 못 받아서 지난번 파일을 그대로 둬요")
        path.write_text(json.dumps(dict(updated=dt.datetime.now(KST).isoformat(timespec="minutes"), s=s),
                                   ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
