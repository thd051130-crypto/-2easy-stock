import datetime as dt

import numpy as np
import pandas as pd
import pytest

import kr_swing_backtest as kb
import paper_trade as pt


def synthetic(days=400):
    opens, closes, index_close = kb.synthetic(n_stocks=12, seed=3)
    return opens.iloc[-days:], closes.iloc[-days:], index_close.iloc[-days:]


@pytest.mark.parametrize("fractional", [False, True])
def test_day_by_day_matches_backtest_simulation(fractional):
    """하루씩 기록한 가상계좌가 백테스트 simulate(현금 이자 0)와 같은 결과를 내야 해요."""
    opens, closes, index_close = synthetic()
    state = pt.new_state(300000, fractional)
    state["last_day"] = "2000-01-01"  # 데이터 첫날부터 진행
    trades, rows, _ = [], [], []
    for k in range(250, len(closes) + 1, 37):  # 며칠씩 몰아서 받아도(휴장, 실패 후 재실행) 결과가 같아야 해요
        t, r, _ = pt.advance(state, opens.iloc[:k], closes.iloc[:k], index_close.iloc[:k])
        trades += t
        rows += r
    ok = kb.regime(index_close, closes, True)
    entry, exit_, rank, max_hold = kb.dip_after_breakout(closes, ok)
    curve, _, bt_trades, _ = kb.simulate(opens, closes, entry, exit_, rank, max_hold, pt.COST,
                                         capital=None if fractional else 300000, cash_rate=0)
    assert len(bt_trades) > 3
    assert len(trades) == len(bt_trades)
    # 같은 날 여러 종목을 팔면 기록 순서만 다를 수 있어서 정렬해서 비교해요
    assert sorted(t["ret"] for t in trades) == pytest.approx(sorted(round(r, 4) for r, _ in bt_trades), abs=1e-4)
    mine = pd.Series([r["equity"] for r in rows], index=pd.to_datetime([r["date"] for r in rows]))
    assert mine.to_numpy() == pytest.approx((curve * 300000).loc[mine.index].to_numpy(), abs=1)


def test_first_run_only_queues_todays_signals():
    opens, closes, index_close = synthetic()
    state = pt.new_state(300000)
    trades, rows, events = pt.advance(state, opens, closes, index_close)
    assert trades == [] and events == [] and len(rows) == 1
    assert state["start"] == state["last_day"] == str(closes.index[-1].date())
    assert state["equity"] == 300000
    # 같은 데이터로 다시 돌려도 아무 일도 안 일어나요 (수동 재실행)
    assert pt.advance(state, opens, closes, index_close) == ([], [], [])


@pytest.mark.parametrize("fractional", [False, True])
def test_expensive_stock_skipped_only_for_whole_shares(fractional):
    idx = pd.bdate_range("2026-01-01", periods=3)
    opens = pd.DataFrame({"000660": [500000.0] * 3}, idx)
    closes = opens.copy()
    index_close = pd.Series([3000.0] * 3, idx)
    state = pt.new_state(300000, fractional)
    state.update(last_day=str(idx[0].date()), start=str(idx[0].date()), kospi_start=3000.0,
                 pending_buys=[dict(code="000660", name="SK하이닉스", signal_date=str(idx[0].date()))])
    _, _, events = pt.advance(state, opens.iloc[:2], closes.iloc[:2], index_close.iloc[:2])
    if fractional:
        assert state["positions"][0]["qty"] == pytest.approx(60000 / (500000 * pt.BUY_MULT))
        assert "SK하이닉스 0.120주" in events[0]
    else:
        assert state["positions"] == []
        assert "1주도 못 사요" in events[0]


def test_weekly_summary_compares_with_kospi(tmp_path):
    state = pt.new_state(300000)
    state.update(start="2026-10-05", kospi_start=3000.0, cash=240000.0, equity=310000.0,
                 positions=[dict(code="005930", name="삼성전자", qty=1, buy_date="2026-10-08",
                                 buy_price=60000.0, cost=60039.0)])
    equity = pd.DataFrame([dict(date="2026-10-02", cash=300000, stocks=0, equity=300000, kospi=3000.0),
                           dict(date="2026-10-09", cash=240000, stocks=70000, equity=310000, kospi=3030.0)])
    trades = pd.DataFrame([dict(code="105560", name="KB금융", qty=1, buy_date="2026-10-05", buy_price=80000,
                                sell_date="2026-10-07", sell_price=82000, pnl=1800, ret=0.0225, days=2,
                                reason="종가가 5일선 위")])
    closes = pd.DataFrame({"005930": [70000.0]}, pd.to_datetime(["2026-10-09"]))
    text = pt.weekly_summary(state, trades, equity, dt.date(2026, 10, 9), closes)
    assert "300,000원 → 310,000원 (+3.3%)" in text
    assert "코스피 +1.0%" in text
    assert "승률 100%" in text
    assert "삼성전자 1주" in text
    assert "보장하지 않아요" in text
    pt.save(tmp_path, state, trades, equity)
    s2, t2, e2 = pt.load(tmp_path, 300000)
    assert s2 == state and t2["code"].tolist() == ["105560"] and len(e2) == 2
