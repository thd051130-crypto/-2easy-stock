#!/usr/bin/env python3
"""국내 상장 ETF 계좌 백테스트: 원화로, ISA·연금저축 계좌에서 그대로 따라 할 수 있는 버전이에요.

두 바구니를 각각 추세에 맞춰 들고 있다가 추세가 꺾이면 현금으로 바꿔요.
  - 코스피 바구니: KODEX 200 (069500)
  - 미국 바구니  : TIGER 미국S&P500 (360750). 2020-08 상장이라 그 전은 SPY(배당 포함) × 원달러 환율로 대신 계산해요
신호는 국장 마감(15:30) 뒤에 보고 다음 거래일 시가에 사고팔아요. 미국 바구니 신호는 그날 아침까지 끝난
뉴욕 장 S&P500 종가로 봐요 (strategy.us_ok와 같은 조건).

사용법:
    python etf_backtest.py --out docs/etf-backtest.md   # 야후에서 받아요 (data/etf_backtest.csv에 남겨 둬요)
"""

import argparse
import pathlib

import numpy as np
import pandas as pd

import conservative_backtest as cb
import desk_backtest as db
import kr_swing_backtest as kb
import strategy

KR_ETF, US_ETF = "069500", "360750"
NAMES = {KR_ETF: "KODEX 200", US_ETF: "TIGER 미국S&P500"}
# 국내 ETF는 매도 거래세가 없어요 (해외 지수 ETF는 팔 때 이익에 배당소득세 15.4%가 붙지만 ISA·연금저축에선 미뤄지거나 줄어요)
COST = dict(fee=0.00015, tax=0.0, slip=0.0005)
KR_VOL_MAX = 0.25
# 고른 규칙 (★): 미국 바구니만 계좌의 50%. 코스피 바구니를 더하면 수익은 비슷하거나 낮고 낙폭은 커져서 뺐어요
WEIGHT, SLEEVES = 0.50, (US_ETF,)
CACHE = pathlib.Path("data/etf_backtest.csv")


def download(path=CACHE):
    import yfinance as yf

    out = {}
    for sym in [f"{KR_ETF}.KS", f"{US_ETF}.KS", "SPY", "KRW=X", "^KS11", "^GSPC"]:
        h = yf.Ticker(sym).history(period="max", auto_adjust=True)
        h.index = pd.to_datetime(h.index).tz_localize(None).normalize()
        out[f"{sym}|open"], out[f"{sym}|close"] = h["Open"], h["Close"]
    df = pd.DataFrame(out)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path)
    return df


LIVE_DAYS = 500  # 200일선 계산에 넉넉하게


def download_live(path, days=LIVE_DAYS):
    """가상계좌용 최근 일봉: TIGER 미국S&P500, 코스피(달력·비교용), S&P500(신호용)을 kr_swing_backtest CSV 형식으로."""
    import datetime as dt

    start = f"{dt.date.today() - dt.timedelta(days=days):%Y-%m-%d}"
    kb.download(path, start=start, universe={f"{US_ETF}.KS": NAMES[US_ETF], "^GSPC": "S&P500"}, index="^KS11",
                suffix="")
    df = pd.read_csv(path, dtype={"ticker": str})
    df["ticker"] = df["ticker"].replace({f"{US_ETF}.KS": US_ETF})
    df.to_csv(path, index=False)


def load_live(path):
    """(opens, closes, 코스피, 국장 날짜로 맞춘 S&P500) — paper_trade.py --rule etf가 써요."""
    opens, closes, kospi = kb.load_csv(path, "^KS11")
    df = pd.read_csv(path, dtype={"ticker": str}, parse_dates=["date"])
    spx = df[df["ticker"] == "^GSPC"].set_index("date")["close"].sort_index()
    if spx.empty or US_ETF not in closes:
        raise SystemExit(f"{path}에 S&P500이나 {NAMES[US_ETF]} 시세가 없어요.")
    return opens[[US_ETF]], closes[[US_ETF]], kospi, us_on_kr_days(spx, closes.index)


def live_frames(closes, kospi, spx):
    return frames(closes, kospi, spx, WEIGHT, sleeves=SLEEVES)


def us_on_kr_days(series, kr_days):
    """뉴욕 날짜로 된 값을 국장 날짜에 맞춰요: 국장 D일 마감 때 알 수 있는 건 D일보다 앞선 뉴욕 종가예요."""
    s = series.dropna()
    s.index = s.index + pd.Timedelta(days=1)  # 뉴욕 D-1일 종가 → 국장 D일에 쓰기
    return s.reindex(s.index.union(kr_days)).ffill().reindex(kr_days)


def build(raw):
    """국장 날짜 기준 (opens, closes, 코스피, 미국 신호용 S&P500(국장 날짜로 맞춘 것), 실제 360750 종가)."""
    kr_days = raw[f"^KS11|close"].dropna().index
    kr_days = kr_days[kr_days >= raw[f"{KR_ETF}.KS|close"].first_valid_index()]
    fx = raw["KRW=X|close"].reindex(kr_days).ffill()
    proxy = us_on_kr_days(raw["SPY|close"], kr_days) * fx
    real_close = raw[f"{US_ETF}.KS|close"].reindex(kr_days)
    real_open = raw[f"{US_ETF}.KS|open"].reindex(kr_days)
    # 상장 전은 대용치, 상장 뒤는 실제 가격 (붙이는 날 대용치를 실제 가격 수준에 맞춰요)
    first = real_close.first_valid_index()
    scale = real_close.loc[first] / proxy.loc[first]
    us_close = (proxy * scale).where(kr_days < first, real_close)
    us_open = (proxy * scale).where(kr_days < first, real_open)
    closes = pd.DataFrame({KR_ETF: raw[f"{KR_ETF}.KS|close"].reindex(kr_days), US_ETF: us_close})
    opens = pd.DataFrame({KR_ETF: raw[f"{KR_ETF}.KS|open"].reindex(kr_days), US_ETF: us_open})
    opens = opens.where(opens > 0)  # 야후가 시가를 0으로 주는 옛날 날짜
    kospi = raw["^KS11|close"].reindex(kr_days).ffill()
    spx = us_on_kr_days(raw["^GSPC|close"], kr_days)
    return opens, closes, kospi, spx, real_close


def kr_ok(kospi, vol_max=None):
    ma50, ma200 = kospi.rolling(50).mean(), kospi.rolling(200).mean()
    ok = (kospi > ma200) & (ma50 > ma200)
    if vol_max:
        ok &= strategy.volatility(kospi) <= vol_max
    return ok


def frames(closes, kospi, spx, weight=0.5, kr_vol=None, us_vol=strategy.US_VOL_MAX, sleeves=(KR_ETF, US_ETF)):
    """두 바구니 각각 추세가 살아 있을 때만 weight만큼 들고 있어요."""
    ok = pd.DataFrame(False, closes.index, closes.columns)
    if KR_ETF in sleeves:
        ok[KR_ETF] = kr_ok(kospi, kr_vol)
    if US_ETF in sleeves:
        ok[US_ETF] = strategy.us_ok(spx, us_vol)[0]
    return dict(entry=ok, exit=~ok, rank=pd.DataFrame(0.0, closes.index, closes.columns), max_hold=None, stop=None,
                weight=weight)


def hold(closes, weight=0.5, sleeves=(KR_ETF, US_ETF)):
    ok = pd.DataFrame(False, closes.index, closes.columns)
    for s in sleeves:
        ok[s] = closes[s].notna()
    return dict(entry=ok, exit=~ok, rank=pd.DataFrame(0.0, closes.index, closes.columns), max_hold=None, stop=None,
                weight=weight)


def variants(closes, kospi, spx):
    return {
        "그냥 보유: 둘 다 50%씩": hold(closes, 0.5),
        "그냥 보유: 코스피 ETF 100%": hold(closes, 1.0, (KR_ETF,)),
        "그냥 보유: S&P500 ETF 100%": hold(closes, 1.0, (US_ETF,)),
        "추세: 각 50% (코스피·S&P500 둘 다 50·200일선 위)": frames(closes, kospi, spx, 0.5),
        "추세: 각 50% + 코스피 변동성 25% 이하": frames(closes, kospi, spx, 0.5, kr_vol=KR_VOL_MAX),
        "추세: 각 40% + 코스피 변동성 25% 이하": frames(closes, kospi, spx, 0.4, kr_vol=KR_VOL_MAX),
        "추세: 각 30% (늘 40% 이상 현금)": frames(closes, kospi, spx, 0.3),
        "추세: 각 30% + 코스피 변동성 20% 이하": frames(closes, kospi, spx, 0.3, kr_vol=0.20),
        "추세: 각 30% + 코스피 변동성 25% 이하": frames(closes, kospi, spx, 0.3, kr_vol=KR_VOL_MAX),
        "추세: S&P500 ETF만 50% (지금 미장 규칙을 원화로)": frames(closes, kospi, spx, WEIGHT, sleeves=SLEEVES),
    }


CHOSEN = "추세: S&P500 ETF만 50% (지금 미장 규칙을 원화로)"


def check_proxy(closes, real_close, raw):
    """상장 뒤 구간에서 대용치(SPY×환율)와 실제 TIGER 미국S&P500 월 수익률이 얼마나 같이 움직였는지."""
    kr_days = closes.index
    fx = raw["KRW=X|close"].reindex(kr_days).ffill()
    proxy = us_on_kr_days(raw["SPY|close"], kr_days) * fx
    both = pd.DataFrame({"proxy": proxy, "real": real_close}).dropna()
    m = both.resample("ME").last().pct_change().dropna()
    years = len(both) / 252
    gap = (both["real"].iloc[-1] / both["real"].iloc[0]) ** (1 / years) - (both["proxy"].iloc[-1] / both["proxy"].iloc[0]) ** (1 / years)
    return m["proxy"].corr(m["real"]), gap, both.index[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--csv", type=pathlib.Path, default=CACHE, help="받아 둔 데이터 (없으면 야후에서 받아요)")
    parser.add_argument("--out", type=pathlib.Path)
    args = parser.parse_args()
    raw = pd.read_csv(args.csv, index_col=0, parse_dates=True) if args.csv.exists() else download(args.csv)
    opens, closes, kospi, spx, real_close = build(raw)
    start = max(pd.Timestamp(kb.TEST_START), closes.dropna().index[0] + pd.Timedelta(days=400))
    keep = closes.index >= start
    years = keep.sum() / 252
    rows = []
    for name, f in variants(closes, kospi, spx).items():
        curve, exposure, trades, _ = kb.simulate(opens[keep], closes[keep], f["entry"][keep], f["exit"][keep],
                                                 f["rank"][keep], None, COST, weight=f["weight"])
        star = "★ " if name == CHOSEN else ""
        rows.append(dict(name=star + name, exposure=exposure, trades=len(trades) / years, **cb.risk_stats(curve)))
    corr, gap, since = check_proxy(closes, real_close, raw)
    lines = ["## 국내 상장 ETF 계좌 백테스트 (원화, ISA·연금저축용)\n",
             f"KODEX 200(069500)과 TIGER 미국S&P500(360750)을 원화로 사고팔아요. 360750은 2020-08 상장이라 그 전은 "
             f"SPY(배당 포함) × 원달러 환율로 대신 계산했어요. {since:%Y-%m} 뒤 실제 가격과 월 수익률 상관 {corr:.2f}, "
             f"연 수익률 차이 {gap * 100:+.1f}%p (보수·환헤지·추적 오차).\n"]
    lines += db.table("두 ETF 바구니", rows, (closes.index[keep][0], closes.index[-1])) + [""]
    lines += [
        f"- ★ 고른 규칙: S&P500이 200일선 위이고 50일선도 200일선 위이며 20일 변동성이 연 {strategy.US_VOL_MAX:.0%} 이하면 "
        f"계좌의 {WEIGHT:.0%}를 TIGER 미국S&P500으로, 아니면 현금. 지금 미장 알림 규칙과 같은 신호를 원화 ETF로 따라 해요",
        "- 코스피 바구니(KODEX 200, 코스피 50·200일선 위)를 더하면 2026-07 코스피 -22% 같은 급락에 최대 낙폭이 -26~-32%까지 커졌어요. "
        f"코스피 변동성 {KR_VOL_MAX:.0%} 조건을 붙이면 -9~-17%로 줄지만, S&P500 바구니만 든 쪽이 연평균은 더 높고 낙폭은 더 작아서 뺐어요",
        "- 국장 마감 뒤 신호, 다음 거래일 시가 매매, 남는 돈 연 2.5% 이자, 수수료 0.015%·슬리피지 0.05%(각 방향), "
        "국내 ETF라 매도 거래세 없음. 세금(해외지수 ETF 매매차익 15.4%)은 계좌 종류마다 달라서 뺐어요",
        "- ★가 가상계좌(paper/etf/)로 매일 기록하는 규칙이에요. 과거 성과가 미래를 보장하진 않아요.",
    ]
    text = "\n".join(lines)
    print(text)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
