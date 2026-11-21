import json

import pandas as pd
import pytest

import backtest as bt


def days(n, start="2020-01-01"):
    return pd.bdate_range(start, periods=n)


def test_merge_rescales_old_history_after_dividend():
    idx = days(5)
    old = pd.Series([100.0, 101, 102, 103, 104], index=idx)
    # 분배금 뒤 야후가 옛 값을 2% 낮춰 다시 줌 + 새 날 하나
    new = pd.Series([102 * 0.98, 103 * 0.98, 104 * 0.98, 105.0], index=list(idx[2:]) + [idx[-1] + pd.offsets.BDay()])
    out = bt.merge(old, new)
    assert len(out) == 6
    assert out.iloc[0] == pytest.approx(98.0)
    assert out.pct_change().iloc[1] == pytest.approx(0.01)  # 수익률은 그대로


def test_despike_removes_one_day_glitch_only():
    s = pd.Series([100.0, 101, 130, 102, 103, 80, 79], index=days(7))
    out, n = bt.despike(s)
    assert n == 1 and out.iloc[2] == 101  # 하루만 튄 값만, 진짜로 떨어진 건 그대로
    assert out.iloc[5] == 80


def test_run_rebalances_and_stats():
    idx = days(300)
    a = pd.Series(100.0, index=idx)
    a.iloc[150:] = 50.0  # 반토막
    b = pd.Series(100.0, index=idx)
    eq, trades = bt.run(pd.DataFrame({"a": a, "b": b}), {"a": 1, "b": 1}, "N", fee=0)
    assert eq.iloc[-1] == pytest.approx(0.75) and trades == 0
    s = bt.stats(eq)
    assert s["mdd"] == pytest.approx(-0.25)
    eq2, trades2 = bt.run(pd.DataFrame({"a": a, "b": b}), {"a": 1, "b": 1}, "M", fee=0)
    assert trades2 >= 1 and eq2.iloc[-1] == pytest.approx(0.75)


def test_filter_moves_to_cash_without_looking_ahead():
    idx = days(400)
    up = list(range(100, 300))
    a = pd.Series(up + [up[-1] * 0.5] * 200, index=idx, dtype=float)  # 200일째 반토막 뒤 그대로
    cash = pd.Series(100.0, index=idx)
    eq, _ = bt.run(pd.DataFrame({"a": a, "cash": cash}), {"a": 1}, "N", {"ma": 50, "to": "cash"}, fee=0)
    # 떨어진 그날은 못 피하고(미래를 안 봄), 달말에 빠져나간 뒤로는 그대로
    assert eq.iloc[200] == pytest.approx(eq.iloc[199] * 0.5)
    assert eq.iloc[-1] == pytest.approx(eq.iloc[260])


def test_main_offline_writes_short_summary(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    idx = days(300)
    (tmp_path / "backtest/prices").mkdir(parents=True)
    for sym, step in [("SPY", 0.1), ("KRW_X", 0.0)]:
        vals = [1000.0 + i * step for i in range(300)]
        pd.Series(vals, index=idx).rename("close").rename_axis("date").to_csv(tmp_path / f"backtest/prices/{sym}.csv")
    (tmp_path / "backtest/strategies.json").write_text(json.dumps({"_help": "x", "s": {"assets": {"sp500": 1}}}))
    assert bt.main(["--offline"]) == 0
    out = capsys.readouterr().out.strip().split("\n")
    assert len(out) <= 10 and out[0].startswith("[s]")
    assert (tmp_path / "backtest/results/s.json").exists() and (tmp_path / "backtest/LATEST.md").exists()
