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


def _meta(rmt, price, end, kind="INDEX", tz="Asia/Seoul"):
    return {"instrumentType": kind, "exchangeTimezoneName": tz, "regularMarketTime": pd.Timestamp(rmt, tz=tz),
            "regularMarketPrice": price, "currentTradingPeriod": {"regular": {"end": pd.Timestamp(end, tz=tz)}}}


def test_settle_drops_intraday_bar():
    # 한국 11:17 (장중): 오늘 막대는 장중 값이라 빼요. 어제(11-05)가 빠져 있으면 지난 기록으로 채워요
    s = pd.Series([5683.8, 5058.4], index=pd.to_datetime(["2026-11-04", "2026-11-06"]))
    m = _meta("2026-11-06 11:16", 5058.4, "2026-11-06 15:00")
    out, live = world.settle(s, m, now=pd.Timestamp("2026-11-06 11:17", tz="Asia/Seoul"))
    assert list(out) == [5683.8] and live == "2026-11-06"
    old = pd.Series([5683.8, 5383.8, 5058.0], index=pd.to_datetime(["2026-11-04", "2026-11-05", "2026-11-06"]))
    full = world.fill_gaps(out, old, live)
    assert list(full) == [5683.8, 5383.8]  # 지난 기록의 장중 값(11-06)은 안 써요
    assert abs(full.iloc[-1] / full.iloc[-2] - 1 - (-0.0528)) < 1e-3


def test_settle_adds_missing_closed_day():
    # 한국 00:26 (장 끝남): 야후 일봉에 11-05가 아직 없으면 시세 정보의 종가로 채워요
    s = pd.Series([5648.8, 5683.8], index=pd.to_datetime(["2026-11-03", "2026-11-04"]))
    m = _meta("2026-11-05 20:05", 5383.8, "2026-11-06 15:00")
    out, live = world.settle(s, m, now=pd.Timestamp("2026-11-06 00:26", tz="Asia/Seoul"))
    assert live is None and out.index[-1] == pd.Timestamp("2026-11-05") and out.iloc[-1] == 5383.8


def test_settle_keeps_closed_day_and_fx():
    s = pd.Series([7688.6, 7353.7], index=pd.to_datetime(["2026-11-04", "2026-11-05"]))
    m = _meta("2026-11-05 16:00", 7353.7, "2026-11-05 16:00", tz="America/New_York")
    out, live = world.settle(s, m, now=pd.Timestamp("2026-11-05 17:00", tz="America/New_York"))
    assert list(out) == [7688.6, 7353.7] and live is None
    fx = _meta("2026-11-06 11:00", 1450.0, "2026-11-06 23:59", kind="CURRENCY", tz="Europe/London")
    assert world.settle(s, fx, now=pd.Timestamp("2026-11-05 12:00", tz="Europe/London"))[0] is s


def test_snapshot_fills_gap_from_saved():
    c = closes()
    old = world.saved_series(world.snapshot(c))
    ks = c["^KS11"]
    c["^KS11"] = ks.drop(ks.index[-2])  # 야후가 어제를 빼먹음
    rows = {r["sym"]: r for g in world.snapshot(c, old=old, live={})["groups"] for r in g["items"]}
    assert rows["^KS11"]["dates"][-2] == ks.index[-2].date().isoformat()
