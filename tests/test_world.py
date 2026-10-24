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
    assert [g["name"] for g in snap["groups"]] == ["한국", "미국", "아시아", "유럽", "환율", "채권 금리", "원자재", "리츠·부동산", "공포·코인"]
    rows = {r["sym"]: r for g in snap["groups"] for r in g["items"]}
    ks = rows["^KS11"]
    assert ks["d1"] > 0 and ks["w1"] > ks["d1"] and ks["y1"] > ks["m1"] > 0
    assert len(ks["closes"]) == world.KEEP
    assert len(ks["dates"]) == world.KEEP and ks["dates"][-1] == ks["day"]  # 앱에서 누르면 그래프 가로축
    assert rows["CNYKRW"]["last"] == 200.0  # 1400원 ÷ 7위안
    assert rows["JPYKRW=X"]["last"] == 900.0  # 100엔 기준
    assert snap["updated"] == "2026-10-08T07:05+09:00"
    tnx = rows["^TNX"]  # 금리는 %p 차이
    step = tnx["closes"][-1] - tnx["closes"][-2]
    assert "KR3Y" not in rows and "US2Y" not in rows  # 네이버·FRED 금리는 따로 받아요
    assert tnx["kind"] == "rate" and abs(tnx["d1"] - step) < 2e-3 and tnx["y1"] > 1  # 1년 새 몇 %p (비율 아님)


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


def test_parse_ecos_rows():
    rows = [{"TIME": "20261023", "DATA_VALUE": "2.580"}, {"TIME": "20261022", "DATA_VALUE": "2.57"},
            {"TIME": "20261021", "DATA_VALUE": ""}]
    s = world.parse_ecos_rows(rows)
    assert list(s.index) == list(pd.to_datetime(["2026-10-22", "2026-10-23"])) and list(s) == [2.57, 2.58]
    assert world.parse_ecos_rows([]) is None
    items = [{"ITEM_NAME": "국고채(3년)", "ITEM_CODE": "X3", "CYCLE": "D"}]
    assert world.ecos_codes(items) == {"KR3Y": "X3", "KR10Y": "010210000"}
    c = closes()
    c["KR3Y"] = pd.Series([2.5, 2.6], index=pd.to_datetime(["2026-10-22", "2026-10-23"]))
    rows = {r["sym"]: r for g in world.snapshot(c)["groups"] for r in g["items"]}
    assert rows["KR3Y"]["kind"] == "rate" and abs(rows["KR3Y"]["d1"] - 0.1) < 1e-9
