#!/usr/bin/env python3
"""경기 국면 백테스트: 경기 경고(macro.py)가 많을 때 매수를 줄이면 하락이 줄어드는지 봐요.

1. 경기 판정이 위험을 미리 알려 주는지: 2008년~ 판정별로 3개월 뒤 수익률과 그 사이 최대 낙폭
2. 알림 규칙에 넣어 보기
   - 국장: 경고 k개 이상이면 신규 매수 쉬기 / 종목당 비중 10% → 5%
   - 미장: 경고 k개 이상이면 SPY 현금으로 / 비중 50% → 25%
   - 공정한 비교: 경기와 상관없이 비중만 줄인 것 (평균 투자 비중을 비슷하게)
   - 경고 하나씩만 따로 써 보기
규칙은 '같은 비중을 그냥 덜 들고 있는 것'보다 낙폭과 수익이 둘 다 나을 때만 바꿔요.

국장은 한국 장 마감(15:30) 때 미국 지표가 전날 것이라 하루 늦춰서 써요.

사용법:
    python macro_backtest.py --out docs/macro-backtest.md
    # data/kr_daily.csv, data/us_spy.csv (learner.py가 받는 것), data/macro_daily.csv (없으면 받아요) 필요
"""

import argparse
import pathlib

import numpy as np
import pandas as pd

import desk_backtest as db
import kr_swing_backtest as kb
import learner
import macro
import strategy
from markets import MARKETS


def align(series, index, lag):
    """경기 지표 날짜를 시장 달력에 맞추고 lag 거래일 늦춰요."""
    return series.reindex(index.union(series.index)).ffill().reindex(index).shift(lag)


def predictive(macro_d, index_close, start="2008-01-01", horizon=63, lag=0):
    """판정별 3개월 뒤 수익률·하락 확률·그 사이 최대 낙폭."""
    px = index_close.dropna()
    arr = px.to_numpy(float)
    mdd = np.full(len(arr), np.nan)
    for k in range(len(arr) - horizon):
        w = arr[k:k + horizon + 1]
        mdd[k] = w.min() / w[0] - 1
    df = pd.DataFrame({"fwd": px.shift(-horizon) / px - 1, "mdd": mdd}, index=px.index)
    df["regime"] = align(macro.score(macro_d), px.index, lag).map(lambda n: None if pd.isna(n) else macro.regime_of(n))
    df = df.loc[start:].dropna()
    rows = []
    for name in ("확장", "둔화", "위축 경고"):
        g = df[df["regime"] == name]
        if len(g):
            rows.append(dict(name=name, share=len(g) / len(df), fwd=g["fwd"].mean(), down=(g["fwd"] < 0).mean(),
                             mdd=g["mdd"].mean(), crash=(g["mdd"] < -0.10).mean()))
    return rows, (df.index[0], df.index[-1])


def index_history(path, start="2007-01-01"):
    """판정 검증용 지수 (S&P500, 코스피). 알림 규칙 자료는 2010년부터라 2008년 금융위기를 보려고 따로 받아요."""
    if not path.exists():
        import yfinance as yf

        out = {}
        for symbol in ("^GSPC", "^KS11"):
            h = yf.Ticker(symbol).history(start=start, auto_adjust=True)["Close"]
            h.index = pd.to_datetime(h.index).tz_localize(None).normalize()
            out[symbol] = h
        pd.DataFrame(out).to_csv(path)
    return pd.read_csv(path, index_col=0, parse_dates=True)


def kr_variants(closes, index_close, w):
    base = strategy.kr_frames(closes, index_close)
    s = align(w.sum(axis=1), closes.index, 1).fillna(0)
    out = {"★ 지금 규칙 (경기 안 봄)": base}
    for k in (2, 3, 4):
        out[f"경고 {k}개↑면 신규 매수 쉬기"] = dict(base, entry=base["entry"] & strategy.broadcast(s < k, closes))
        out[f"경고 {k}개↑면 종목당 10% → 5%"] = dict(base, weight=pd.Series(np.where(s >= k, base["weight"] / 2,
                                                                               base["weight"]), closes.index))
    for key, name, _ in macro.SIGNALS:
        one = align(w[key].astype(float), closes.index, 1).fillna(0) > 0
        out[f"{name}일 때만 쉬기"] = dict(base, entry=base["entry"] & strategy.broadcast(~one, closes))
    return out


def _us_scaled(base, closes, low, hi_w, lo_w):
    """low인 날은 비중 lo_w, 아니면 hi_w. 바뀌는 날 팔고 다음 날 새 비중으로 다시 사요."""
    change = strategy.broadcast(low != low.shift(fill_value=False), closes)
    return dict(base, exit=base["exit"] | change, weight=pd.Series(np.where(low, lo_w, hi_w), closes.index))


def us_variants(closes, index_close, w):
    base = strategy.us_frames(closes, index_close)
    s = align(w.sum(axis=1), closes.index, 0).fillna(0)
    out = {"★ 지금 규칙 (경기 안 봄)": base}
    for k in (2, 3, 4):
        bad = strategy.broadcast(s >= k, closes)
        out[f"경고 {k}개↑면 현금"] = dict(base, entry=base["entry"] & ~bad, exit=base["exit"] | bad)
        out[f"경고 {k}개↑면 비중 50% → 25%"] = _us_scaled(base, closes, s >= k, base["weight"], base["weight"] / 2)
    for key, name, _ in macro.SIGNALS:
        one = align(w[key].astype(float), closes.index, 0).fillna(0) > 0
        out[f"{name}일 때만 25%"] = _us_scaled(base, closes, one, base["weight"], base["weight"] / 2)
    for weight in (0.40, 0.32):
        out[f"비교: 경기 안 보고 비중만 {weight:.0%}"] = dict(base, weight=weight)
    return out


def predictive_table(title, rows, info):
    p = kb.pct
    lines = [f"### {title} ({info[0]:%Y-%m} ~ {info[1]:%Y-%m})\n",
             "| 판정 | 날짜 비중 | 3개월 뒤 평균 | 3개월 뒤 손실 확률 | 3개월 안 평균 최대 낙폭 | 3개월 안 -10% 넘게 빠질 확률 |",
             "|---|---:|---:|---:|---:|---:|"]
    for r in rows:
        lines.append(f"| {r['name']} | {r['share']:.0%} | {p(r['fwd'])} | {r['down']:.0%} | {p(r['mdd'])} | "
                     f"{r['crash']:.0%} |")
    return lines


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--csv-dir", type=pathlib.Path, default=pathlib.Path("data"))
    parser.add_argument("--out", type=pathlib.Path)
    args = parser.parse_args()
    mpath = args.csv_dir / "macro_daily.csv"
    if not mpath.exists():
        mpath.parent.mkdir(parents=True, exist_ok=True)
        macro.fetch().to_csv(mpath)
    macro_d = macro.load(mpath)
    w = macro.warnings(macro_d)

    kr = learner.load("kr", args.csv_dir / "kr_daily.csv")
    us = learner.load("us", args.csv_dir / "us_spy.csv")
    lines = ["## 경기 국면 백테스트 (하락 줄이기 우선)\n",
             "경고 7개(장단기 금리 역전, 금리 급등, 유가 급등, 원화 급락, 신용 경계, 원자재 약세, 공포 지수) 중 "
             "0~1개 확장, 2~3개 둔화, 4개 이상 위축 경고. 지표 설명은 macro.py에 있어요.\n",
             "## 1. 경기 판정이 위험을 미리 알려 주나\n"]
    idx = index_history(args.csv_dir / "macro_index.csv")
    for start, label in (("2008-01-01", "2008 금융위기 포함"), ("2010-01-01", "2010년 이후만")):
        for symbol, name, lag in (("^GSPC", "S&P500", 0), ("^KS11", "코스피", 1)):
            rows, info = predictive(macro_d, idx[symbol], start=start, lag=lag)
            lines += predictive_table(f"{name}, {label}", rows, info) + [""]
    lines += ["## 2. 알림 규칙에 넣어 보기\n"]
    rows, info = db.run(kr[0], kr[1], kr_variants(kr[1], kr[2], w), MARKETS["kr"]["cost"])
    lines += db.table("국장 알림 규칙", rows, info) + [""]
    rows, info = db.run(us[0], us[1], us_variants(us[1], us[2], w), MARKETS["us"]["cost"])
    lines += db.table("미장 알림 규칙 (SPY, 배당 포함)", rows, info) + [""]
    lines += [
        "## 결론\n",
        "- 2008년 금융위기를 넣으면 경고가 많을수록 3개월 안에 10% 넘게 빠질 확률이 커졌어요. "
        "그런데 2010년 이후만 보면 그 차이가 사라져요. 큰 위기 한 번에 기댄 신호라 믿고 매매하기엔 약해요.",
        "- 3개월 뒤 평균 수익은 어느 기간이든 판정과 거의 상관이 없었어요 (빠졌다가 다시 오르는 경우가 많아서).",
        "- 국장 알림은 이미 지수 추세·시장 폭·실적 시즌 필터 덕에 낙폭이 -3.2%라, 경기 판정을 더해도 낙폭이 줄지 않았어요.",
        "- 미장은 경고 2개↑에서 비중을 줄이면 낙폭이 조금 줄지만 수익이 훨씬 많이 줄어요. "
        "경기와 상관없이 비중만 낮춘 쪽(비교 줄)이 낙폭·수익 둘 다 더 나았어요.",
        "- 그래서 매매 규칙(strategy.py)은 안 바꾸고, 경기 판정은 리스크관리부 보고와 주간 경기 리포트에 참고로만 붙여요.",
        "",
        "종가에 신호, 다음 날 시가 매매, 남는 돈은 연 2.5% 이자, 비용은 conservative_backtest.py와 같아요. "
        "미국 실업률·물가(FRED)는 나중에 고쳐지는 자료라 여기선 안 썼어요. 과거 성과가 미래를 보장하진 않아요.",
    ]
    text = "\n".join(lines)
    print(text)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
