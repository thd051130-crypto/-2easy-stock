import pandas as pd
import pytest

import rulebook as rb

COST = dict(fee=0.0, tax=0.0, slip=0.0)


def frame(values, code="AAA"):
    return pd.Series(values, dtype=float)


def ind_row(close, trend=True, chase=False, entry=False):
    s = lambda v: pd.Series({"AAA": v})  # noqa: E731
    return dict(entry=s(entry), trend=s(trend), chase=s(chase), rsi14=s(50.0), ma60=s(90.0), ma200=s(80.0),
                vol_ratio=s(1.5), day_ret=s(0.0), close=s(close))


def days(n):
    return pd.bdate_range("2026-01-05", periods=n)  # 월요일부터


def run_path(prices, entry_first=True, trend=True):
    """시가=종가=prices로 하루씩 진행 (첫날 종가에 신호)."""
    book = rb.new_book("kr", 1000.0)
    log = []
    for i, (day, px) in enumerate(zip(days(len(prices)), prices)):
        sells, row, events = rb.step(book, day, pd.Series({"AAA": px}), ind_row(px, trend, entry=entry_first and i == 0),
                                     3000.0, COST, {"AAA": "에이"})
        log.append((sells, row, events))
    return book, log


def test_first_tranche_is_30pct_of_slot_and_adds_only_when_rising():
    book, log = run_path([100, 100, 100.5, 100.3, 100.8])
    pos = book["positions"][0]
    # 1차 60 (1000x20%x30%), 100.5 > 100이라 2차 60, 100.8 > 100.3이라 3차는 다음 날 (+1% 넘으면 익절이 먼저)
    assert pos["tranches"] == 2
    assert pos["cost"] == pytest.approx(60 + 60)


def test_stop_loss_sells_everything_next_open():
    book, log = run_path([100, 100, 97.5, 97])
    assert book["positions"] == []
    sells = log[3][0]
    assert sells[0]["reason"].startswith("손절") and sells[0]["sell_price"] == 97


def test_take_profit_in_three_steps():
    book, log = run_path([100, 100, 101.2, 101.2, 102.1, 102.1, 103.5, 103.5])
    reasons = [s["reason"] for sells, _, _ in log for s in sells]
    assert reasons == ["익절 +1%", "익절 +2%", "익절 +3%"]
    assert book["positions"] == []


def test_daily_loss_halts_next_day_buys():
    book = rb.new_book("kr", 1000.0)
    book["positions"] = [dict(code="AAA", name="에이", qty=10.0, cost=1000.0, buy_price=100.0, raw=1000.0, slot=200,
                              tranches=3, tp=0, days=1, buy_date="2026-01-01", last_buy=100.0)]
    book["cash"] = 0.0
    d = days(3)
    rb.step(book, d[0], pd.Series({"AAA": 100.0}), ind_row(98.5), 3000.0, COST, {})  # -1.5%
    assert book["halt_next"]
    book["orders"].append(dict(side="buy", code="BBB", name="비", kind="new"))
    _, _, events = rb.step(book, d[1], pd.Series({"AAA": 98.0, "BBB": 10.0}), ind_row(98.0), 3000.0, COST, {})
    assert any("매수 보류" in e for e in events)


def test_weekly_halt_lasts_until_week_end():
    book = rb.new_book("kr", 1000.0)
    book["week"] = dict(key=rb.week_key(days(1)[0]), base=1000.0)
    book["equity"] = 1000.0
    book["positions"] = [dict(code="AAA", name="에이", qty=10.0, cost=1000.0, buy_price=100.0, raw=1000.0, slot=200,
                              tranches=3, tp=0, days=1, buy_date="2026-01-01", last_buy=100.0)]
    book["cash"] = 0.0
    for day, px in zip(days(3), (99.2, 98.4, 97.9)):  # 매일 -1% 미만, 누적 -2% 넘음
        rb.step(book, day, pd.Series({"AAA": px}), ind_row(px), 3000.0, COST, {})
    assert book["halt_week"] == rb.week_key(days(3)[2])
