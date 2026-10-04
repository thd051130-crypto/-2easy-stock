#!/usr/bin/env python3
"""수익보다 하락(최대 낙폭)을 줄이는 쪽으로 규칙을 비교해요. 국장(코스피 대형주)과 미장(S&P 500 대형주) 둘 다.

후보 규칙
  1. 기존: 돌파 후 눌림 + 지수 200일선 필터 (지금 알림 규칙)
  2. 1 + 손절: 종가가 매수가보다 5% 넘게 빠지면 다음 날 판다
  3. 2 + 이중 필터: 지수가 200일선과 50일선 둘 다 위일 때만 산다
  4. 3 + 종목당 10%: 5종목이 다 차도 절반은 현금
  5. 지수 추세 보유: 지수가 200일선 위면 지수(ETF) 전부, 아래면 현금
  6. 저변동 추세: 200일선·50일선 위 종목 중 변동성 낮은 5개, 50일선 깨지면 판다, 지수 이중 필터
  7. (미장만) SPY 절반 추세: S&P500이 200일선 위이고 50일선도 200일선 위면 계좌 50%를 SPY, 아니면 현금

★ 표시가 알림·가상매매에 쓰는 규칙이에요 (strategy.py). 최대 낙폭이 가장 작고 현금 이자보다는 나은 쪽으로 골랐어요.

사용법:
    python conservative_backtest.py --out docs/conservative-backtest.md
"""

import argparse
import pathlib

import numpy as np
import pandas as pd

import kr_swing_backtest as kb
import strategy
from markets import MARKETS

STOP = 0.05
WEIGHT = 0.10


def market_filter(index_close, closes, double):
    ok = index_close > index_close.rolling(200).mean()
    if double:
        ok &= index_close > index_close.rolling(50).mean()
    return pd.DataFrame(np.repeat(ok.to_numpy()[:, None], closes.shape[1], axis=1), closes.index, closes.columns)


def low_vol_trend(closes, market_ok, n=60):
    vol = closes.pct_change().rolling(n).std()
    ma50, ma200 = closes.rolling(50).mean(), closes.rolling(200).mean()
    entry = (closes > ma50) & (closes > ma200) & market_ok
    return entry, (closes < ma50) | ~market_ok, -vol, None


def rules(closes, index_close):
    """이름 → (entry, exit, rank, max_hold, stop, weight)"""
    single, double = market_filter(index_close, closes, False), market_filter(index_close, closes, True)
    base = kb.dip_after_breakout(closes, single)
    strict = kb.dip_after_breakout(closes, double)
    return {
        "1. 기존 (돌파 후 눌림 + 200일선)": (*base, None, None),
        "2. 1 + 손절 -5%": (*base, STOP, None),
        "3. 2 + 지수 50·200일선 이중 필터": (*strict, STOP, None),
        "4. 3 + 종목당 10% (최대 절반 투자)": (*strict, STOP, WEIGHT),  # = strategy.kr_frames
        "6. 저변동 추세 + 이중 필터": (*low_vol_trend(closes, double), None, None),
        "6b. 6 + 종목당 10%": (*low_vol_trend(closes, double), None, WEIGHT),
    }


def index_timing(index_close, cost, cash_rate=kb.CASH_RATE):
    """지수가 200일선 위면 다음 날부터 지수 보유, 아래면 현금 (종가 기준 근사, 배당 제외)."""
    hold = (index_close > index_close.rolling(200).mean()).shift(1, fill_value=False)
    ret = index_close.pct_change().fillna(0)
    cash = (1 + cash_rate) ** (1 / 252) - 1
    switch = hold.astype(int).diff().abs().fillna(0)
    trade_cost = cost["fee"] + cost["slip"] + cost["tax"] / 2
    daily = np.where(hold, ret, cash) - switch * trade_cost
    return pd.Series(np.cumprod(1 + daily), index_close.index), hold.mean(), int(switch.sum())


def risk_stats(curve):
    s = kb.curve_stats(curve)
    monthly = curve.resample("ME").last().pct_change().dropna()
    yearly = curve.resample("YE").last().pct_change().dropna()
    second = curve[curve.index >= kb.SPLIT]
    second = second / second.iloc[0]
    return dict(cagr=s["cagr"], mdd=s["mdd"], worst_year=yearly.min(), down_months=(monthly < 0).mean(),
                worst_month=monthly.min(), second_cagr=kb.cagr(second),
                second_mdd=(second / second.cummax() - 1).min(), sharpe=s["sharpe"])


def frames_run(path, index, frames_fn, cost):
    opens, closes, index_close = kb.load_csv(path, index)
    f = frames_fn(closes, index_close)
    keep = closes.index >= kb.TEST_START
    curve, exposure, trades, _ = kb.simulate(opens[keep], closes[keep], f["entry"][keep], f["exit"][keep],
                                             f["rank"][keep], f["max_hold"], cost, stop=f["stop"], weight=f["weight"])
    return curve, exposure, trades, keep.sum() / 252


def evaluate(market, path, etf_path=None):
    m = MARKETS[market]
    opens, closes, index_close = kb.load_csv(path, m["index"])
    keep = closes.index >= kb.TEST_START
    o, c, idx = opens[keep], closes[keep], index_close[keep]
    years = keep.sum() / 252
    rows = []
    for name, (entry, exit_, rank, max_hold, stop, weight) in rules(closes, index_close).items():
        curve, exposure, trades, _ = kb.simulate(o, c, entry[keep], exit_[keep], rank[keep], max_hold, m["cost"],
                                                 stop=stop, weight=weight)
        rows.append(dict(name=name, exposure=exposure, trades=len(trades) / years, **risk_stats(curve)))
    curve, exposure, switches = index_timing(index_close, m["cost"])
    curve = curve[keep] / curve[keep].iloc[0]
    rows.append(dict(name=f"5. {m['index_name']} 추세 보유 (200일선 위만)", exposure=exposure,
                     trades=switches / (len(index_close) / 252), **risk_stats(curve)))
    if etf_path:
        curve, exposure, trades, yrs = frames_run(etf_path, m["index"], strategy.us_frames, m["cost"])
        rows.append(dict(name="7. SPY 절반 추세 (배당 포함)", exposure=exposure, trades=len(trades) / yrs,
                         **risk_stats(curve)))
    hold = idx / idx.iloc[0]
    rows.append(dict(name=f"비교: {m['index_name']} 그냥 보유 (배당 제외)", exposure=1.0, trades=0, **risk_stats(hold)))
    rows.sort(key=lambda r: r["name"])
    chosen = "4." if market == "kr" else "7."
    for r in rows:
        if r["name"].startswith(chosen):
            r["name"] = "★ " + r["name"]
    return rows, (c.index[0], c.index[-1], c.shape[1])


def table(market, rows, info):
    m = MARKETS[market]
    start, end, n = info
    p = kb.pct
    lines = [f"### {m['name']} ({m['index_name']} 대형주 {n}개, {start:%Y-%m} ~ {end:%Y-%m})\n",
             "| 규칙 | 연평균 | 최대 낙폭 | 최악의 해 | 손실 난 달 | 최악의 달 | 2019~ 연평균 | 2019~ 최대 낙폭 | 평균 투자 비중 | 연 거래 |",
             "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for r in rows:
        lines.append(f"| {r['name']} | {p(r['cagr'])} | {p(r['mdd'], 0)} | {p(r['worst_year'], 0)} | "
                     f"{r['down_months']:.0%} | {p(r['worst_month'], 0)} | {p(r['second_cagr'])} | "
                     f"{p(r['second_mdd'], 0)} | {r['exposure']:.0%} | {r['trades']:.0f} |")
    return lines


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--kr", type=pathlib.Path, default=pathlib.Path("data/kr_daily.csv"))
    parser.add_argument("--us", type=pathlib.Path, default=pathlib.Path("data/us_daily.csv"))
    parser.add_argument("--us-etf", type=pathlib.Path, default=pathlib.Path("data/us_spy.csv"),
                        help="SPY와 ^GSPC만 받은 파일 (7번 규칙용)")
    parser.add_argument("--out", type=pathlib.Path)
    args = parser.parse_args()
    lines = ["## 보수적 규칙 비교 (하락 줄이기 우선)\n"]
    for market, path, etf in (("kr", args.kr, None), ("us", args.us, args.us_etf)):
        rows, info = evaluate(market, path, etf)
        lines += table(market, rows, info) + [""]
    lines.append(f"종가에 신호, 다음 날 시가 매매, 종목당 자본 1/5(표시한 규칙은 10%), 남는 돈은 연 {kb.CASH_RATE:.1%} 이자. "
                 "국장 비용: 수수료 0.015%·거래세 0.20%·슬리피지 0.05%, 미장 비용: 수수료 0.25%·슬리피지 0.05%(환전 비용 제외). "
                 "지수는 배당 제외라 실제 ETF 보유보다 연 1~2%p 낮게 나와요. 과거 성과가 미래를 보장하진 않아요.")
    text = "\n".join(lines)
    print(text)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
