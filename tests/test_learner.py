import json

import pandas as pd

import kr_swing_backtest as kb
import learner


def curve(values, start="2020-01-01"):
    return pd.Series(values, index=pd.bdate_range(start, periods=len(values)), dtype=float)


def test_pick_keeps_current_on_tie_and_never_picks_deeper_drawdown():
    cur, deep, same = (("a", 1),), (("a", 2),), (("a", 3),)
    curves = {cur: curve([1, 1.1, 1.05, 1.2]), deep: curve([1, 1.5, 1.0, 1.8]), same: curve([1, 1.1, 1.05, 1.2])}
    best, table = learner.pick(curves, cur, pd.Timestamp("2019-01-01"), pd.Timestamp("2021-01-01"))
    assert best == cur  # deep은 수익이 커도 낙폭이 더 깊어서 탈락, same은 동점이라 지금 규칙 유지
    assert table[deep]["mdd"] < table[cur]["mdd"]


def test_learn_on_synthetic_data_reports_gates(monkeypatch):
    monkeypatch.setitem(learner.GRIDS, "kr", dict(breadth_min=[0.6], stock_vol_max=[0.35], stop=[0.05, 0.07],
                                                  rsi_th=[5]))
    opens, closes, index_close = kb.synthetic(n_stocks=12)
    r = learner.learn("kr", opens, closes, index_close)
    assert r["tested"] == 2
    assert set(r["gates"]) == {"recent", "full", "walk_forward"}
    assert r["propose"] == all(r["gates"].values())
    assert r["walk_forward"]["years"] >= 10
    json.dumps(r, allow_nan=False)
    text = learner.format_report(r)
    assert "국장" in text and "결론" in text


def test_only_new_proposals_are_sent_right_away(tmp_path):
    r = dict(market="kr", propose=True, candidate=dict(params=dict(stop=0.07)))
    assert learner.is_new_proposal(r, tmp_path)
    (tmp_path / "kr.json").write_text(json.dumps(r))
    assert not learner.is_new_proposal(r, tmp_path)
    assert learner.is_new_proposal(dict(r, candidate=dict(params=dict(stop=0.03))), tmp_path)
    assert not learner.is_new_proposal(dict(r, propose=False), tmp_path)


def test_current_params_are_in_grid():
    for mk in ("kr", "us"):
        assert learner.CURRENT[mk] in learner.combos(mk)
