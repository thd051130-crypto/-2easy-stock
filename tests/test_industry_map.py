import pandas as pd

import industry_map as im
import themes


def test_every_theme_is_a_node_and_links_name_real_themes():
    names = {t["name"] for t in themes.THEMES}
    grouped = [n for _, _, ns in im.GROUPS for n in ns]
    assert len(grouped) == len(set(grouped))
    assert set(grouped) | im.SEARCH_ONLY == names and not set(grouped) & im.SEARCH_ONLY
    names -= im.SEARCH_ONLY  # 선은 지도에 있는 산업끼리만
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
    assert len(kr["전력·전력기기"]["stocks"][0]) == 6  # [코드, 이름, 종가, 5일, 1일, 20일]
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


def test_minor_themes_are_real_nodes():
    names = {t["name"] for t in themes.THEMES}
    assert im.MINOR <= names
    nodes = {n["name"]: n for n in im.static_map()["nodes"]}
    assert nodes["희토류·핵심광물"].get("minor") is True
    assert "minor" not in nodes["조선"]


def test_sizes_sum_every_member_cap():
    tj = {"themes": [dict(name="AI반도체·HBM", kr=[["005930", "삼성전자"], ["000660", "SK하이닉스"], ["005930", "삼성전자"]], us=[]),
                     dict(name="스마트폰·IT부품", kr=[["005930", "삼성전자"], ["999999", "없는종목"]], us=[]),
                     dict(name="조선", kr=[["888888", "시총없음"]], us=[])]}
    cap_of = {"005930.KS": 1000.0, "000660.KS": 600.0}
    sz = im.sizes(tj, "kr", cap_of, lambda c: f"{c}.KS")
    assert sz == {"AI반도체·HBM": [1600, 2], "스마트폰·IT부품": [1000, 1]}  # 같은 종목 두 번은 한 번만, 시총 없는 산업은 빠져요


def test_build_adds_sizes_when_caps_given():
    tj = {"themes": [dict(name="조선", kr=[["009540", "HD한국조선해양"]], us=[["HII", "헌팅턴 잉걸스"]])]}
    out = im.build(tj, fetch=lambda symbols: pd.DataFrame(), caps=lambda syms: {s: 5.0 for s in syms})
    assert out["size"] == {"kr": {"조선": [5, 1]}, "us": {"조선": [5, 1]}}
