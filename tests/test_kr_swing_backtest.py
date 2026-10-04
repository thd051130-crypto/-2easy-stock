import numpy as np
import pandas as pd
import pytest

import kr_swing_backtest as kb

COST = dict(fee=0.001, tax=0.002, slip=0.001)
ZERO = dict(fee=0.0, tax=0.0, slip=0.0)


def frame(values):
    return pd.DataFrame({"A": values}, index=pd.bdate_range("2020-01-01", periods=len(values)))


def flags(n, days):
    return frame([i in days for i in range(n)])


def test_buys_next_open_and_sells_next_open_with_costs():
    opens, closes = frame([100, 110, 120, 130, 140.0]), frame([105, 115, 125, 135, 145.0])
    curve, _, trades, _ = kb.simulate(opens, closes, flags(5, {0}), flags(5, {2}), frame([0.0] * 5), None, COST,
                                      cash_rate=0.0)
    expected = 130 * (1 - 0.004) / (110 * 1.002) - 1
    assert len(trades) == 1
    assert trades[0][0] == pytest.approx(expected)
    assert trades[0][1] == 2
    # 한 종목에 자본 1/5만 들어가므로 전체 자산 변화는 거래 수익의 1/5
    assert curve.iloc[-1] == pytest.approx(1 + expected / kb.MAX_POSITIONS)


def test_max_hold_forces_exit():
    n = 8
    opens = closes = frame([100.0] * n)
    _, _, trades, _ = kb.simulate(opens, closes, flags(n, {0}), flags(n, set()), frame([0.0] * n), 3, ZERO,
                                  cash_rate=0.0)
    # 1일차 시가 매수, 3일 지난 4일차 종가에 청산 결정, 5일차 시가 매도
    assert [t[1] for t in trades] == [4]


def test_whole_shares_skip_when_unaffordable():
    opens = closes = frame([100_000.0] * 4)
    _, _, trades, skipped = kb.simulate(opens, closes, flags(4, {0}), flags(4, {2}), frame([0.0] * 4), None, ZERO,
                                        capital=300_000, cash_rate=0.0)
    assert skipped == 1 and trades == []


def test_rsi2_extremes():
    up = pd.Series(np.arange(1, 30, dtype=float))
    assert kb.rsi(up).iloc[-1] == pytest.approx(100)
    down = pd.Series(np.arange(30, 1, -1, dtype=float))
    assert kb.rsi(down).iloc[-1] == pytest.approx(0)


def test_dip_after_breakout_needs_prior_high():
    # 25일 상승(신고가) 뒤 2일 급락 → 조합 신호. 200일선 조건을 맞추려고 앞에 긴 상승 구간을 둬요.
    prices = list(np.linspace(50, 100, 230)) + [96, 92]
    closes = frame(prices)
    ok = kb.regime(pd.Series(prices, index=closes.index), closes, False)
    entry, *_ = kb.dip_after_breakout(closes, ok, th=10, n=20, within=10)
    assert entry["A"].iloc[-1]
    entry_no_high, *_ = kb.dip_after_breakout(closes, ok, th=10, n=20, within=1)
    assert not entry_no_high["A"].iloc[-1]
