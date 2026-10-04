"""알림·가상매매·백테스트가 같이 쓰는 보수적 규칙 (하락 줄이기 우선, docs/conservative-backtest.md에서 고름).

국장: 돌파 후 눌림 스윙을 작게
  - 매수: 코스피가 200일선과 50일선 둘 다 위, 종목이 200일선 위, 최근 10일 안에 20일 신고가 → RSI2 < 10 눌림
  - 종목당 계좌의 10%만, 최대 5종목 (다 차도 절반은 현금)
  - 매도: 종가가 5일선 위, 10거래일 경과, 또는 종가가 매수가보다 5% 넘게 빠지면 (손절) 다음 날 시가

미장: S&P500 ETF(SPY)를 추세에 맞춰 절반만
  - S&P500이 200일선 위이고 50일선도 200일선 위면 계좌의 50%를 SPY로, 아니면 전부 현금
  - 미장 개별주 스윙은 국내 증권사 수수료(0.25%)를 내면 백테스트에서 손실이라 쓰지 않아요
"""

import numpy as np
import pandas as pd

import kr_swing_backtest as kb

KR_STOP, KR_WEIGHT = 0.05, 0.10
US_ETF, US_WEIGHT = "SPY", 0.50


def broadcast(ok, closes):
    return pd.DataFrame(np.repeat(ok.to_numpy()[:, None], closes.shape[1], axis=1), closes.index, closes.columns)


def kr_frames(closes, index_close):
    ok = (index_close > index_close.rolling(200).mean()) & (index_close > index_close.rolling(50).mean())
    entry, exit_, rank, max_hold = kb.dip_after_breakout(closes, broadcast(ok, closes))
    return dict(entry=entry, exit=exit_, rank=rank, max_hold=max_hold, stop=KR_STOP, weight=KR_WEIGHT, ok=ok)


def us_frames(closes, index_close):
    ma50, ma200 = index_close.rolling(50).mean(), index_close.rolling(200).mean()
    ok = (index_close > ma200) & (ma50 > ma200)
    okdf = broadcast(ok, closes)
    return dict(entry=okdf, exit=~okdf, rank=pd.DataFrame(0.0, closes.index, closes.columns), max_hold=None,
                stop=None, weight=US_WEIGHT, ok=ok)


FRAMES = {"kr": kr_frames, "us": us_frames}
