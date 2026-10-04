#!/usr/bin/env python3
"""사용자 매매 규칙표(rulebook.py)를 지금 쓰는 보수적 규칙(strategy.py)과 같은 조건으로 비교해요.

같은 조건: 2011년부터, 종가 신호·다음 날 시가 체결, 시장별 수수료·세금·슬리피지, 남는 현금 연 2.5% 이자, 소수점 매수.

사용법:
    python rulebook_backtest.py --out docs/rulebook-backtest.md
    (data/kr_daily_v.csv, data/us_daily_v.csv: kr_swing_backtest.download로 받은 거래량 포함 일봉)
"""

import argparse
import pathlib

import numpy as np
import pandas as pd

import conservative_backtest as cb
import kr_swing_backtest as kb
import rulebook as rb
import strategy
from markets import MARKETS

VARIANTS = {
    "내 규칙표 그대로": dict(),
    "내 규칙표 + 지수 200일선 필터": dict(index_filter=True),
    "(참고) 손절 -5%, 익절 +2/4/6%로 넓힘": dict(index_filter=True, STOP=0.05,
                                           TAKE_PROFIT=((0.02, 0.3), (0.04, 0.3), (0.06, 0.4))),
}


def rulebook_row(name, opens, closes, volumes, index_close, market, cost, index_filter=False, **params):
    saved = {k: getattr(rb, k) for k in params}
    for k, v in params.items():
        setattr(rb, k, v)
    try:
        curve, sells, _ = rb.run(opens, closes, volumes, index_close, market, cost, start=kb.TEST_START,
                                 index_filter=index_filter, cash_rate=kb.CASH_RATE)
    finally:
        for k, v in saved.items():
            setattr(rb, k, v)
    years = len(curve) / 252
    d = pd.DataFrame(sells)
    stops = d[d["reason"].str.startswith("손절")]["ret"] if len(d) else pd.Series(dtype=float)
    tps = d[d["reason"].str.startswith("익절")]["ret"] if len(d) else pd.Series(dtype=float)
    return dict(name=name, trades=len(d) / years, win=(d["ret"] > 0).mean() if len(d) else np.nan,
                stop_avg=stops.mean(), tp_avg=tps.mean(), **cb.risk_stats(curve))


def simulate_row(name, opens, closes, index_close, frames_fn, cost):
    f = frames_fn(closes, index_close)
    keep = closes.index >= kb.TEST_START
    curve, _, trades, _ = kb.simulate(opens[keep], closes[keep], f["entry"][keep], f["exit"][keep], f["rank"][keep],
                                      f["max_hold"], cost, stop=f["stop"], weight=f["weight"])
    r = np.array([t[0] for t in trades]) if trades else np.array([np.nan])
    return dict(name=name, trades=len(trades) / (keep.sum() / 252), win=np.nanmean(r > 0), stop_avg=np.nan,
                tp_avg=np.nan, **cb.risk_stats(curve))


def evaluate(market, path):
    m = MARKETS[market]
    opens, closes, index_close = kb.load_csv(path, m["index"])
    volumes = kb.load_volume(path, closes.index, m["index"])
    stocks = [c for c in closes.columns if c != strategy.US_ETF]
    rows = [rulebook_row(name, opens[stocks], closes[stocks], volumes[stocks], index_close, market, m["cost"], **kw)
            for name, kw in VARIANTS.items()]
    if market == "kr":
        rows.append(simulate_row("지금 규칙 (돌파 후 눌림, 종목당 10%, -5% 손절)", opens[stocks], closes[stocks],
                                 index_close, strategy.kr_frames, m["cost"]))
    else:
        etf = [strategy.US_ETF]
        rows.append(simulate_row("지금 규칙 (SPY 절반 추세)", opens[etf], closes[etf], index_close, strategy.us_frames,
                                 m["cost"]))
    idx = index_close[index_close.index >= kb.TEST_START]
    rows.append(dict(name=f"{m['index_name']} 그냥 보유 (배당 제외)", trades=0, win=np.nan, stop_avg=np.nan,
                     tp_avg=np.nan, **cb.risk_stats(idx / idx.iloc[0])))
    return rows


def table(market, rows):
    m = MARKETS[market]
    p = kb.pct
    out = [f"### {m['name']}\n",
           "| 규칙 | 연평균 | 최대 낙폭 | 최악의 해 | 2019~ 연평균 | 2019~ 최대 낙폭 | 연 매도 횟수 | 승률(매도 기준) | 손절 평균 | 익절 평균 |",
           "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for r in rows:
        win = "-" if pd.isna(r["win"]) else f"{r['win']:.0%}"
        out.append(f"| {r['name']} | {p(r['cagr'])} | {p(r['mdd'], 0)} | {p(r['worst_year'], 0)} | "
                   f"{p(r['second_cagr'])} | {p(r['second_mdd'], 0)} | {r['trades']:.0f} | {win} | "
                   f"{p(r['stop_avg'])} | {p(r['tp_avg'])} |")
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--kr", type=pathlib.Path, default=pathlib.Path("data/kr_daily_v.csv"))
    parser.add_argument("--us", type=pathlib.Path, default=pathlib.Path("data/us_daily_v.csv"))
    parser.add_argument("--out", type=pathlib.Path)
    args = parser.parse_args()
    lines = ["## 내 매매 규칙표 백테스트 (2011~)\n"]
    for market, path in (("kr", args.kr), ("us", args.us)):
        lines += table(market, evaluate(market, path)) + [""]
    cost_kr, cost_us = MARKETS["kr"]["cost"], MARKETS["us"]["cost"]
    rt = lambda c: 2 * c["fee"] + c["tax"] + 2 * c["slip"]  # noqa: E731
    lines.append(f"왕복 비용: 국장 약 {rt(cost_kr):.2%} (수수료 0.015%×2, 거래세 0.20%, 슬리피지 0.05%×2), "
                 f"미장 약 {rt(cost_us):.2%} (수수료 0.25%×2, 슬리피지 0.05%×2, 환전 비용 제외). "
                 "익절 +1%면 국장은 비용 빼고 약 +0.7%, 미장은 약 +0.4%만 남아요. "
                 "손절은 종가로 확인하고 다음 날 시가에 팔아서, 밤사이 갭 때문에 평균이 -2%보다 깊어요.")
    lines.append("")
    lines.append("규칙 구현과 기본값은 rulebook.py 맨 위 설명에 있어요. 지수는 배당 제외. 과거 성과가 미래를 보장하진 않아요.")
    text = "\n".join(lines)
    print(text)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
