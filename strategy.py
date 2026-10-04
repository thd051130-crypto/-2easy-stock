"""알림·가상매매·백테스트가 같이 쓰는 보수적 규칙 (하락 줄이기 우선, docs/conservative-backtest.md에서 고름).

국장: 돌파 후 눌림 스윙을 작게
  - 매수: 코스피가 200일선과 50일선 둘 다 위, 종목이 200일선 위, 최근 10일 안에 20일 신고가 → RSI2 < 10 눌림
  - 마켓부: 대형주 중 200일선 위 종목이 절반 이상일 때만 (시장 폭)
  - 리스크관리부: 최근 20일 변동성이 연 45% 넘는 종목은 건너뛰기 (docs/desk-backtest.md에서 최대 낙폭 -8% → -4%)
  - 종목당 계좌의 10%만, 최대 5종목 (다 차도 절반은 현금)
  - 매도: 종가가 5일선 위, 10거래일 경과, 또는 종가가 매수가보다 5% 넘게 빠지면 (손절) 다음 날 시가

미장: S&P500 ETF(SPY)를 추세에 맞춰 절반만
  - S&P500이 200일선 위이고 50일선도 200일선 위면 계좌의 50%를 SPY로, 아니면 전부 현금
  - 마켓부: S&P500 20일 변동성이 연 25%를 넘으면 현금으로 (docs/desk-backtest.md에서 최대 낙폭 -11% → -9.5%)
  - 미장 개별주 스윙은 국내 증권사 수수료(0.25%)를 내면 백테스트에서 손실이라 쓰지 않아요
"""

import numpy as np
import pandas as pd

import kr_swing_backtest as kb

KR_STOP, KR_WEIGHT = 0.05, 0.10
US_ETF, US_WEIGHT = "SPY", 0.50
KR_BREADTH_MIN, KR_STOCK_VOL_MAX, US_VOL_MAX = 0.50, 0.45, 0.25


def broadcast(ok, closes):
    return pd.DataFrame(np.repeat(ok.to_numpy()[:, None], closes.shape[1], axis=1), closes.index, closes.columns)


def breadth(closes, n=200):
    """시장 폭: 종목 중 n일선 위에 있는 비율 (날짜별)."""
    ma = closes.rolling(n).mean()
    valid = ma.notna() & closes.notna()
    return (closes > ma).where(valid).sum(axis=1) / valid.sum(axis=1).replace(0, np.nan)


def volatility(close, n=20):
    """n일 변동성 (연율). Series나 DataFrame 둘 다 돼요."""
    return close.pct_change(fill_method=None).rolling(n).std() * 252 ** 0.5


def kr_frames(closes, index_close):
    trend = (index_close > index_close.rolling(200).mean()) & (index_close > index_close.rolling(50).mean())
    wide = breadth(closes) >= KR_BREADTH_MIN
    ok = trend & wide
    entry, exit_, rank, max_hold = kb.dip_after_breakout(closes, broadcast(ok, closes))
    entry &= volatility(closes) <= KR_STOCK_VOL_MAX
    return dict(entry=entry, exit=exit_, rank=rank, max_hold=max_hold, stop=KR_STOP, weight=KR_WEIGHT, ok=ok,
                trend=trend, wide=wide)


def us_ok(index_close):
    """(보유 조건, 추세 조건, 변동성 조건)"""
    ma50, ma200 = index_close.rolling(50).mean(), index_close.rolling(200).mean()
    trend = (index_close > ma200) & (ma50 > ma200)
    calm = volatility(index_close) <= US_VOL_MAX
    return trend & calm, trend, calm


def us_frames(closes, index_close):
    ok, trend, calm = us_ok(index_close)
    okdf = broadcast(ok, closes)
    return dict(entry=okdf, exit=~okdf, rank=pd.DataFrame(0.0, closes.index, closes.columns), max_hold=None,
                stop=None, weight=US_WEIGHT, ok=ok, trend=trend, calm=calm)


FRAMES = {"kr": kr_frames, "us": us_frames}
