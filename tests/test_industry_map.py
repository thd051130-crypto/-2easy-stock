import pandas as pd

import industry_map as im
import themes


def test_every_theme_is_a_node_and_links_name_real_themes():
    names = {t["name"] for t in themes.THEMES}
    grouped = [n for _, _, ns in im.GROUPS for n in ns]
    assert sorted(grouped) == sorted(names)
    pairs = set()
    for a, b, kind, why in im.LINKS:
        assert a in names and b in names and a != b
        assert kind in im.KINDS and why
        assert frozenset((a, b)) not in pairs, (a, b)
        pairs.add(frozenset((a, b)))
    m = im.static_map()
    assert len(m["nodes"]) == len(names)
    assert {n["name"] for n in m["nodes"] if n["short"] != n["name"]} <= names


def test_build_adds_flows_and_correlations_without_network():
    tj = {"themes": [dict(name="전력·전력기기", kr=[["267260", "HD현대일렉트릭"]], us=[["GEV", "GE 버노바"]]),
                     dict(name="데이터센터", kr=[["035420", "NAVER"]], us=[["VRT", "버티브"]]),
                     dict(name="조선", kr=[["009540", "HD한국조선해양"]], us=[])]}
    days = pd.bdate_range("2026-01-01", periods=130)
    base = pd.Series(range(130), index=days, dtype=float)
    wave = pd.Series([1.0 + 0.01 * ((i * 7) % 5) for i in range(130)], index=days)

    def fetch(symbols):
        cols = {}
        for s in symbols:
            cols[s] = 100 + base * (1 if s.startswith(("267260", "035420", "GEV", "VRT")) else -0.1) + wave * (3 if "009540" in s else 1)
        return pd.DataFrame(cols)

    out = im.build(tj, {"kr": {"035420": "KS"}}, fetch=fetch)
    kr = out["flows"]["kr"]
    assert set(kr) == {"전력·전력기기", "데이터센터", "조선"}
    assert kr["전력·전력기기"]["stocks"][0][:2] == ["267260", "HD현대일렉트릭"]
    assert kr["전력·전력기기"]["r5"] > 0
    assert "전력·전력기기|데이터센터" in out["corr"]["kr"]
    assert out["day"]["kr"] == "2026-07-01"


def test_build_survives_failed_download():
    tj = {"themes": [dict(name="조선", kr=[["009540", "HD한국조선해양"]], us=[])]}
    out = im.build(tj, fetch=lambda symbols: pd.DataFrame())
    assert out["flows"] == {} and out["links"]


def test_yahoo_symbol():
    assert im.yahoo_symbol("kr", "247540", "KQ") == "247540.KQ"
    assert im.yahoo_symbol("kr", "005930", "KS") == "005930.KS"
    assert im.yahoo_symbol("us", "BRK.B") == "BRK-B"
