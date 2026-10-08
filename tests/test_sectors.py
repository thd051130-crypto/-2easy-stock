import json

import numpy as np
import pandas as pd

import sectors


def test_classify_industry_and_overrides():
    assert sectors.classify("Semiconductors") == "반도체"
    assert sectors.classify("Banks - Diversified") == "금융"
    assert sectors.classify("Auto Manufacturers") == "자동차"
    assert sectors.classify("Something New", "Healthcare") == "바이오·헬스"
    assert sectors.classify(None) == sectors.OTHER
    # 야후는 삼성전자를 가전, LG에너지솔루션을 전기장비로 둬요
    assert sectors.classify("Consumer Electronics", code="005930") == "반도체"
    assert sectors.classify("Electrical Equipment & Parts", code="373220") == "2차전지"
    assert sectors.classify("Electrical Equipment & Parts") == "전력·유틸리티"


def test_tone_and_label():
    assert sectors.tone("반도체 수출 사상 최대, HBM 수혜 기대감") == 1
    assert sectors.tone("관세 우려에 2차전지 급락") == -1
    assert sectors.tone("Chip stocks surge on record AI demand") == 1
    assert sectors.tone("Banks tumble on credit concerns") == -1
    assert sectors.tone("삼성전자 주주총회 개최") == 0
    assert sectors.label(0, 0) == "뚜렷한 소식 없음"
    assert sectors.label(3, 1) == "호재 우세"
    assert sectors.label(1, 2) == "악재 우세"
    assert sectors.label(1, 1) == "호재·악재 엇갈림"


def test_sector_of_uses_map_and_overrides():
    smap = {"kr": {"000270": ["자동차", "Auto Manufacturers"], "005930": ["IT·전자", "Consumer Electronics"]},
            "us": {"NVDA": ["반도체", "Semiconductors"]}}
    assert sectors.sector_of(smap, "kr", "000270") == "자동차"
    assert sectors.sector_of(smap, "kr", "005930") == "반도체"  # 예전 지도라도 고친 값
    assert sectors.sector_of(smap, "kr", "000660") == "반도체"  # 지도에 없어도 OVERRIDES
    assert sectors.sector_of(smap, "us", "NVDA") == "반도체"
    assert sectors.sector_of(smap, "us", "XYZ") is None


def closes_frame():
    idx = pd.bdate_range("2025-01-01", periods=260)
    up = np.linspace(100, 130, 260)
    down = np.linspace(100, 80, 260)
    flat = np.full(260, 100.0)
    return pd.DataFrame({"A1": up, "A2": up * 1.01, "B1": down, "C1": flat}, index=idx), pd.Series(flat, idx)


def test_compute_groups_ranks_and_counts_news():
    closes, index_close = closes_frame()
    smap = {"kr": {"A1": ["반도체", ""], "A2": ["반도체", ""], "B1": ["자동차", ""], "C1": ["금융", ""]}}
    news = {"반도체 업황": ["반도체 호황 수혜", "HBM 사상 최대", "반도체 규제 우려"], "자동차 업황": ["관세 우려 급락"]}

    def fetch(query, lang="ko", n=5):
        return [dict(title=t, source="테스트", date="2026-10-07", link="https://example.com") for t in news.get(query, [])][:n]

    out = sectors.compute(closes, index_close, {"A1": "가", "A2": "나"}, smap, "kr", fetch_news=fetch)
    assert [s["name"] for s in out] == ["반도체", "금융", "자동차"]
    semi = out[0]
    assert semi["count"] == 2 and semi["r5"] > 0 and semi["vs_index"] > 0 and semi["above200"] == 1.0
    assert (semi["good"], semi["bad"], semi["label"]) == (2, 1, "호재 우세")
    assert semi["best"]["name"] in ("가", "나")
    assert out[2]["label"] == "악재 우세"
    assert out[1]["label"] == "뚜렷한 소식 없음"

    line = sectors.pick_line("A1", out, smap, "kr")
    assert line.startswith("업종: 반도체 5일 +") and "호재 우세(호재 2·악재 1)" in line
    text = sectors.section(out, "국장")
    assert "[업종별 호재·악재" in text and "반도체(2종목)" in text and "악재: 관세 우려 급락" in text


def test_compute_without_news_or_map():
    closes, index_close = closes_frame()
    assert sectors.compute(closes, index_close, {}, {"kr": {}}, "kr") == []
    out = sectors.compute(closes, index_close, {}, {"kr": {"A1": ["반도체", ""]}}, "kr")
    assert out[0]["news"] == [] and out[0]["label"] == "뚜렷한 소식 없음"
    assert sectors.section([], "국장") == ""


def test_update_fills_only_missing(tmp_path, monkeypatch):
    import wide

    monkeypatch.setattr(wide, "universe", lambda: {"999999": "새 회사"})
    monkeypatch.setattr(wide, "us_universe", lambda: {})
    path = tmp_path / "sectors.json"
    path.write_text(json.dumps({"kr": {"005930": ["반도체", "Consumer Electronics"]}, "us": {}}))
    calls = []

    def fetch(symbol):
        calls.append(symbol)
        if symbol == "000660.KS":
            raise RuntimeError("429")
        return "Auto Parts", "Consumer Cyclical"

    smap = sectors.update(path, fetch=fetch, pause=0)
    assert "005930.KS" not in calls  # 이미 있는 종목은 다시 안 받아요
    assert smap["kr"]["999999"] == ["자동차", "Auto Parts"]
    assert "000660" not in smap["kr"]  # 못 받은 종목은 다음에
    assert json.loads(path.read_text())["kr"]["999999"][0] == "자동차"


def test_add_sectors_joins_signal(tmp_path, monkeypatch):
    import argparse

    import kr_swing_signals as ks
    import movers

    closes, index_close = closes_frame()
    monkeypatch.setattr(sectors, "load", lambda path=None: {"kr": {"A1": ["반도체", ""], "B1": ["자동차", ""]}})
    monkeypatch.setattr(movers, "google_news", lambda q, lang="ko", n=5: [
        dict(title="반도체 수혜 기대감", source="", date=None, link="")] if "반도체" in q else [])
    payload = dict(picks=[dict(code="A1", name="가", opinion=["이유: 테스트"])],
                   movers=dict(up=[dict(code="A1")], down=[]))
    args = argparse.Namespace(market="kr")
    text, out = ks.add_sectors("신호", payload, args, tmp_path / "kr_daily_recent.csv", closes, index_close)
    assert "[업종별 호재·악재" in text and "오늘 매수 후보의 업종" in text
    assert out["picks"][0]["opinion"][-1].startswith("업종: 반도체")
    assert out["movers"]["up"][0]["sector"] == "반도체"
    assert out["sector_of"] == {"A1": "반도체", "B1": "자동차"}
    assert out["sector_links"]["반도체"][0][0] == "IT·전자"
    assert out["sectors"][0]["label"] == "호재 우세"


def test_related_sectors_point_to_real_sectors():
    for name, links in sectors.RELATED.items():
        assert name in sectors.NAMES
        assert links and all(r in sectors.NAMES and r != name and why for r, why in links)
    assert set(sectors.RELATED) == set(sectors.NAMES)  # 모든 업종에 연관 업종이 있어요
