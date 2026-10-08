import numpy as np
import pandas as pd

import movers
import wide


def frame(n=260, seed=1):
    """A·B는 같이 움직이는 업종(마지막 5일 같이 급등), C는 혼자 급락, D는 조용."""
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2025-01-01", periods=n)
    common = rng.normal(0, 0.01, n)
    rets = {
        "A": common + rng.normal(0, 0.003, n),
        "B": common + rng.normal(0, 0.003, n),
        "C": rng.normal(0, 0.01, n),
        "D": rng.normal(0, 0.002, n),
    }
    rets["A"][-5:] += 0.03
    rets["B"][-5:] += 0.025
    rets["C"][-1] -= 0.12
    closes = pd.DataFrame({k: 100 * np.exp(np.cumsum(v)) for k, v in rets.items()}, index=idx)
    index_close = pd.Series(1000 * np.exp(np.cumsum(rng.normal(0, 0.001, n))), index=idx)
    vol = pd.DataFrame(1000.0, index=idx, columns=closes.columns)
    vol.iloc[-2, 0] = 5000.0
    return closes, index_close, vol


def test_rank_and_reasons():
    closes, index_close, vol = frame()
    names = {"A": "에이", "B": "비", "C": "씨", "D": "디"}
    news = {"에이 주가": [dict(title="에이, 3분기 영업이익 사상 최대", source="신문", date="2026-10-07", link="x")]}
    out = movers.compute(closes, index_close, vol, names, "코스피", fetch_news=lambda q: news.get(q, []))
    assert [p["code"] for p in out["up"]][:2] == ["A", "B"]
    assert [p["code"] for p in out["down"]] == ["C"]
    a = out["up"][0]
    assert a["main"] == "뉴스: 실적"
    assert any("업종·테마" in r for r in a["reasons"])
    assert any("거래량이 평소의 5.0배" in r for r in a["reasons"])
    b = out["up"][1]
    assert b["main"] == "업종·테마 동반"
    c = out["down"][0]
    assert any("하루에 -" in r for r in c["reasons"])
    text = movers.section(out, "국장")
    assert "[왜 움직였나 · 추정]" in text and "▲ 많이 오른 종목" in text and "뉴스: 에이, 3분기" in text


def test_topics_and_rss():
    assert movers.topics(["Meta rises on AI assistant launch", "목표주가 상향"]) == ["신제품·출시", "증권가 전망", "AI·반도체"]
    rss = """<rss><channel><item><title>삼성전기 급등 - 한국경제</title><source>한국경제</source>
      <pubDate>Tue, 06 Oct 2026 01:00:00 GMT</pubDate><link>https://n/1</link></item></channel></rss>"""
    assert movers.parse_rss(rss) == [dict(title="삼성전기 급등", source="한국경제", date="2026-10-06", link="https://n/1")]


def test_quiet_market_has_no_rows():
    closes, index_close, _ = frame()
    calm = closes[["D"]]
    out = movers.compute(calm, index_close, None, {}, "코스피", fetch_news=None)
    assert out["up"] == [] and out["down"] == []
    assert "±3% 넘게 움직인 종목이 없어요" in movers.section(out, "국장")


def test_us_universe_skips_base_and_share_classes():
    rows = [["AAPL", "애플", "", "s", "Apple Inc."], ["NVDA", "엔비디아", "", "s", "NVIDIA Corporation"],
            ["GOOG", "알파벳 C", "", "s", "Alphabet Inc."], ["GOOGL", "알파벳", "", "s", "Alphabet Inc."],
            ["BRK-B", "버크셔", "", "s", "Berkshire Hathaway Inc. New"], ["BRK-A", "버크셔 A", "", "s", "Berkshire Hathaway Inc."],
            ["QQQ", "QQQ", "", "e", "Invesco QQQ"], ["TSLA", "테슬라", "", "s", "Tesla, Inc."]]
    assert wide.us_universe(n=5, rows=rows) == {"NVDA": "엔비디아", "TSLA": "테슬라"}
