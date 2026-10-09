import json

import numpy as np
import pandas as pd
import pytest

import kr_swing_signals as ks
import track


def calendar(n):
    return pd.bdate_range("2026-01-05", periods=n)


def test_update_seeds_with_replay_then_appends_today(tmp_path, monkeypatch):
    closes = pd.DataFrame({"005930": np.linspace(100, 130, 30)}, index=calendar(30))
    index_close = pd.Series(np.linspace(2000, 2300, 30), index=closes.index)
    seeded = [dict(date="2026-01-06", src="rulebook", code="005930", name="삼성전자", close=100.0, replay=1)]
    monkeypatch.setattr(track, "replay", lambda *a, **k: list(seeded))
    path = tmp_path / "kr" / "picks.csv"
    payload = dict(day="2026-02-13", picks=[dict(code="005930", name="삼성전자", close=130.0)], rulebook=[])
    rows = track.update(path, "kr", payload, closes, index_close, None)
    assert [(r["date"], r["src"], r["replay"]) for r in rows] == [("2026-01-06", "rulebook", 1),
                                                                    ("2026-02-13", "signal", 0)]
    # 다시 돌려도(같은 날) 줄이 늘지 않고, 기록이 있으면 과거를 다시 채우지 않아요
    monkeypatch.setattr(track, "replay", lambda *a, **k: pytest.fail("기록이 있으면 다시 채우지 않아요"))
    again = track.update(path, "kr", dict(payload, picks=[]), closes, index_close, None)
    assert [(r["date"], r["src"]) for r in again] == [("2026-01-06", "rulebook")]
    assert track.read(path) == again


def test_us_buy_signal_is_logged_as_etf():
    payload = dict(day="2026-03-02", action="buy", etf_close=500.0, rulebook=[dict(code="AAPL", name="애플", close=200.0)])
    rows = track.today_rows("us", payload)
    assert [(r["src"], r["code"]) for r in rows] == [("signal", "SPY"), ("rulebook", "AAPL")]
    assert track.today_rows("us", dict(payload, action="hold"))[0]["src"] == "rulebook"


def test_summary_returns_since_pick_and_skips_repeats():
    days = calendar(40)
    closes = pd.DataFrame({"AAA": [100.0] * 5 + [100.0 + 2 * i for i in range(35)]}, index=days)
    index_close = pd.Series([1000.0 + i for i in range(40)], index=days)
    day = lambda i: f"{days[i]:%Y-%m-%d}"  # noqa: E731
    rows = [dict(date=day(i), src="rulebook", code="AAA", name="에이", close=float(closes["AAA"].iloc[i]), replay=1)
            for i in (5, 6, 7)]  # 사흘 연달아 후보 → 첫날 한 번만
    rows.append(dict(date=day(30), src="rulebook", code="AAA", name="에이", close=160.0, replay=0))  # 23거래일 뒤 다시
    s = track.summary(rows, closes, index_close)
    rb = s["srcs"]["rulebook"]
    assert rb["count"] == 2 and rb["first"] == day(5)
    assert s["live_from"] == day(30)
    first = rb["recent"][-1]
    assert first["date"] == day(5) and first["days"] == 34
    assert first["ret"] == pytest.approx(closes["AAA"].iloc[-1] / 100 - 1, abs=1e-4)
    assert first["path"][:3] == [0.0, 0.02, 0.04]
    h5 = rb["horizons"][0]
    assert h5["days"] == 5 and h5["n"] == 2 and h5["win"] == 1.0
    assert rb["avg"][0] == 0.0 and rb["n"][0] == 2 and rb["n"][20] == 1
    assert rb["index"][1] == pytest.approx(((1006 / 1005 - 1) + (1031 / 1030 - 1)) / 2, abs=1e-4)
    assert s["srcs"]["signal"]["count"] == 0 and s["srcs"]["signal"]["avg"][0] is None
    json.dumps(s, allow_nan=False)


def test_replay_matches_live_rules():
    """과거 채우기는 오늘 신호와 같은 계산: 마지막 날에 신호가 나오는 자료로 하루 앞까지 돌리면 그날이 들어가요."""
    up = list(np.linspace(100, 200, 250))
    closes = pd.DataFrame({"005930": up + [190, 180, 172, 175]}, index=calendar(254))
    index_close = pd.Series(np.linspace(2000, 3000, 254), index=closes.index)
    market, picks = ks.compute_signals(closes.iloc[:253], index_close.iloc[:253])
    assert [p["code"] for p in picks] == ["005930"]
    rows = track.replay("kr", closes, index_close, None, days=5)
    signal_days = [r["date"] for r in rows if r["src"] == "signal"]
    assert f"{closes.index[252]:%Y-%m-%d}" in signal_days
    assert all(r["replay"] == 1 for r in rows)


def test_stock_summary_for_watchlist():
    days = calendar(260)
    closes = pd.DataFrame({"005930": np.linspace(100, 359, 260), "999999": np.linspace(1, 2, 260)}, index=days)
    out = ks.stock_summary(closes, "kr", days=30)
    assert [r["code"] for r in out] == ["005930"]  # 국장 종목 목록에 있는 것만
    r = out[0]
    assert r["name"] == "삼성전자" and r["close"] == 359.0 and r["day"] == f"{days[-1]:%Y-%m-%d}"
    assert r["d1"] == round(359 / 358 - 1, 4)
    assert len(r["spark"]) == 30 and r["spark"][-1] == 359 and r["spark"][0] == 330
    # 꾸준히 오르는 종목: 200일선 위, RSI 100, 52주 최고가 그대로
    assert r["ma200"] == round(359 / np.mean(np.linspace(100, 359, 260)[-200:]) - 1, 4) and r["rsi14"] == 100.0 and r["hi52"] == 0.0
    json.dumps(out, allow_nan=False)
    short = ks.stock_summary(closes.iloc[:20], "kr", days=30)[0]
    assert "ma200" not in short and "rsi14" in short
