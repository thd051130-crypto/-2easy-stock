#!/usr/bin/env python3
"""부서 강화안 백테스트: 이전 규칙에 마켓부·리스크관리부 조건을 하나씩 더하면 하락이 줄어드는지 봐요.
★ 표시가 이 비교로 고른 지금 규칙이에요 (strategy.py).

국장 (이전: 돌파 후 눌림 + 지수 이중 필터 + 종목당 10% + 손절 -5%)에 더해 보는 것
  - 마켓부: 시장 폭(대형주 중 200일선 위 비율) 50% 이상일 때만 새로 사기
  - 마켓부: 코스피 20일 변동성 연 25% 이하일 때만 새로 사기
  - 리스크관리부: 최근 20일 변동성이 연 45% 넘는 종목은 건너뛰기
  - 리스크관리부: 손절 -3% / -7%
미장 (이전: S&P500 추세면 SPY 50%)에 더해 보는 것
  - 마켓부: 시장 폭 50% 이상 / S&P500 변동성 연 25% 이하일 때만 보유

펀더멘탈부는 야후가 과거 시점 재무 자료를 무료로 주지 않아서 여기서 검증할 수 없어요 (참고 등급으로만 써요).

사용법:
    python desk_backtest.py --out docs/desk-backtest.md   # data/kr_daily.csv, data/us_daily.csv, data/us_spy.csv 필요
"""

import argparse
import pathlib

import pandas as pd

import conservative_backtest as cb
import departments as dp
import kr_swing_backtest as kb
import strategy
from markets import MARKETS

# 2026-10-04 비교 당시 값 그대로 (지금 규칙은 학습팀 제안으로 시장 폭 40%, 손절 -7%로 바뀌었어요)
BREADTH_MIN, INDEX_VOL_MAX, STOCK_VOL_MAX, OLD_STOP = 0.50, strategy.US_VOL_MAX, strategy.KR_STOCK_VOL_MAX, 0.05


def kr_variants(closes, index_close):
    trend = strategy.kr_frames(closes, index_close)["trend"]
    entry, exit_, rank, max_hold = kb.dip_after_breakout(closes, strategy.broadcast(trend, closes))
    base = dict(entry=entry, exit=exit_, rank=rank, max_hold=max_hold, stop=OLD_STOP, weight=strategy.KR_WEIGHT)
    b = dp.breadth(closes) >= BREADTH_MIN
    calm = dp.index_vol(index_close) <= INDEX_VOL_MAX
    stock_calm = strategy.volatility(closes) <= STOCK_VOL_MAX

    def with_(mask=None, stop=OLD_STOP):
        entry = base["entry"] & mask if mask is not None else base["entry"]
        return dict(base, entry=entry, stop=stop)

    return {
        "이전 규칙": with_(),
        "+ 마켓부: 시장 폭 50% 이상": with_(strategy.broadcast(b, closes)),
        "+ 마켓부: 코스피 변동성 25% 이하": with_(strategy.broadcast(calm, closes)),
        "+ 리스크부: 변동성 큰 종목(45%↑) 제외": with_(stock_calm),
        "+ 리스크부: 손절 -3%": with_(stop=0.03),
        "+ 리스크부: 손절 -7%": with_(stop=0.07),
        "★ 시장 폭 + 변동성 큰 종목 제외 (지금 규칙)": with_(strategy.broadcast(b, closes) & stock_calm),
    }


def us_variants(closes, index_close, breadth_closes):
    trend = strategy.broadcast(strategy.us_ok(index_close)[1], closes)
    base = dict(strategy.us_frames(closes, index_close), entry=trend, exit=~trend)
    b = (dp.breadth(breadth_closes).reindex(closes.index).ffill() >= BREADTH_MIN)
    calm = dp.index_vol(index_close) <= INDEX_VOL_MAX

    def with_(mask=None):
        if mask is None:
            return base
        ok = strategy.broadcast(mask, closes)
        return dict(base, entry=base["entry"] & ok, exit=base["exit"] | ~ok)

    return {"이전 규칙": with_(), "+ 마켓부: 시장 폭 50% 이상": with_(b),
            "★ + 마켓부: S&P500 변동성 25% 이하 (지금 규칙)": with_(calm), "+ 둘 다": with_(b & calm)}


def run(opens, closes, variants, cost):
    keep = closes.index >= kb.TEST_START
    years = keep.sum() / 252
    rows = []
    for name, f in variants.items():
        curve, exposure, trades, _ = kb.simulate(opens[keep], closes[keep], f["entry"][keep], f["exit"][keep],
                                                 f["rank"][keep], f["max_hold"], cost, stop=f["stop"],
                                                 weight=f["weight"])
        rows.append(dict(name=name, exposure=exposure, trades=len(trades) / years, **cb.risk_stats(curve)))
    return rows, (closes.index[keep][0], closes.index[-1])


def table(title, rows, info):
    p = kb.pct
    lines = [f"### {title} ({info[0]:%Y-%m} ~ {info[1]:%Y-%m})\n",
             "| 규칙 | 연평균 | 최대 낙폭 | 최악의 해 | 최악의 달 | 2019~ 연평균 | 2019~ 최대 낙폭 | 평균 투자 비중 | 연 거래 |",
             "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for r in rows:
        lines.append(f"| {r['name']} | {p(r['cagr'])} | {p(r['mdd'], 1)} | {p(r['worst_year'], 1)} | "
                     f"{p(r['worst_month'], 1)} | {p(r['second_cagr'])} | {p(r['second_mdd'], 1)} | "
                     f"{r['exposure']:.0%} | {r['trades']:.0f} |")
    return lines


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--kr", type=pathlib.Path, default=pathlib.Path("data/kr_daily.csv"))
    parser.add_argument("--us", type=pathlib.Path, default=pathlib.Path("data/us_daily.csv"))
    parser.add_argument("--us-etf", type=pathlib.Path, default=pathlib.Path("data/us_spy.csv"))
    parser.add_argument("--out", type=pathlib.Path)
    args = parser.parse_args()

    lines = ["## 부서 강화안 백테스트 (하락 줄이기 우선)\n"]
    opens, closes, index_close = kb.load_csv(args.kr, MARKETS["kr"]["index"])
    rows, info = run(opens, closes, kr_variants(closes, index_close), MARKETS["kr"]["cost"])
    lines += table("국장", rows, info) + [""]

    _, us_closes, _ = kb.load_csv(args.us, MARKETS["us"]["index"])
    opens, closes, index_close = kb.load_csv(args.us_etf, MARKETS["us"]["index"])
    rows, info = run(opens, closes, us_variants(closes, index_close, us_closes), MARKETS["us"]["cost"])
    lines += table("미장 (SPY, 배당 포함)", rows, info) + [""]
    lines.append("종가에 신호, 다음 날 시가 매매, 남는 돈은 연 2.5% 이자, 비용은 conservative_backtest.py와 같아요. "
                 "펀더멘탈부는 과거 재무 자료가 무료로 없어 검증하지 못했어요. 과거 성과가 미래를 보장하진 않아요.")
    text = "\n".join(lines)
    print(text)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
