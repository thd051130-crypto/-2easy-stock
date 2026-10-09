import json
import re

import themes


def test_build_drops_unlisted_codes_and_adds_us_industry_peers(tmp_path):
    sym = tmp_path / "symbols"
    sym.mkdir()
    (sym / "kr.json").write_text(json.dumps({"rows": [["267260", "HD현대일렉트릭", "KS", "s", ""]]}))
    (sym / "us.json").write_text(json.dumps({"rows": [["GEV", "GE Vernova", "", "s", ""]]}))
    sectors = tmp_path / "sectors.json"
    sectors.write_text(json.dumps({"kr": {}, "us": {"BE": ["전력·유틸리티", "Electrical Equipment & Parts"],
                                                    "AAPL": ["IT·전자", "Consumer Electronics"]}}))
    out = themes.build(sym, sectors)
    power = next(t for t in out["themes"] if t["name"] == "전력·전력기기")
    assert power["kr"] == [["267260", "HD현대일렉트릭"]]
    assert power["us"] == [["GEV", "GE 버노바"]]
    assert power["more_us"] == ["BE"]
    assert "찾아줘" in out["filler"]


def test_keys_are_unique_per_theme_and_etf_patterns_compile():
    for t in themes.THEMES:
        keys = t["keys"].split()
        assert len(keys) == len(set(keys)), t["name"]
        re.compile(t["etf"])
        assert t["kr"] or t["us"]
