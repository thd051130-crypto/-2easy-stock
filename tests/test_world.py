import datetime as dt

import numpy as np
import pandas as pd

import dashboard
import world


def closes(n=300):
    idx = pd.bdate_range("2025-08-01", periods=n)
    out = {}
    for i, sym in enumerate(world.symbols()):
        out[sym] = pd.Series(np.linspace(100 + i, 110 + i, n), index=idx)
    out["KRW=X"] = pd.Series(np.full(n, 1400.0), index=idx)
    out["CNY=X"] = pd.Series(np.full(n, 7.0), index=idx)
    out["JPYKRW=X"] = pd.Series(np.full(n, 9.0), index=idx)
    return out


def test_snapshot_groups_and_changes():
    snap = world.snapshot(closes(), now=dt.datetime(2026, 10, 8, 7, 5, tzinfo=world.KST))
    assert [g["name"] for g in snap["groups"]] == ["한국", "미국", "아시아", "유럽", "환율"]
    rows = {r["sym"]: r for g in snap["groups"] for r in g["items"]}
    ks = rows["^KS11"]
    assert ks["d1"] > 0 and ks["w1"] > ks["d1"] and ks["y1"] > ks["m1"] > 0
    assert len(ks["closes"]) == world.KEEP
    assert rows["CNYKRW"]["last"] == 200.0  # 1400원 ÷ 7위안
    assert rows["JPYKRW=X"]["last"] == 900.0  # 100엔 기준
    assert snap["updated"] == "2026-10-08T07:05+09:00"


def test_missing_symbol_is_skipped():
    c = closes()
    del c["^SOX"], c["CNY=X"]
    rows = {r["sym"] for g in world.snapshot(c)["groups"] for r in g["items"]}
    assert "^SOX" not in rows and "CNYKRW" not in rows and "^GSPC" in rows


def test_short_history_has_no_year_change():
    snap = world.snapshot(closes(40))
    assert snap["groups"][0]["items"][0]["y1"] is None


def test_dashboard_reads_world(tmp_path):
    (tmp_path / "world.json").write_text('{"updated":"2026-10-08T07:05","groups":[]}')
    assert dashboard.build(tmp_path)["world"]["updated"] == "2026-10-08T07:05"
