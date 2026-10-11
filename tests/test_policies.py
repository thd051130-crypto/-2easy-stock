import datetime as dt
import json

import policies


def test_repo_policy_file_is_valid():
    data = policies.load()
    assert data and data["items"]
    assert policies.problems(data) == []


def test_problems_catch_unknown_sector_and_missing_source():
    bad = dict(items=[dict(id="x", region="kr", title="t", summary="s", date="2026-01-01",
                           effects=[dict(sector="없는업종", tone=2)], sources=[])])
    msgs = policies.problems(bad)
    assert any("없는업종" in m for m in msgs) and any("tone" in m for m in msgs) and any("출처" in m for m in msgs)


def test_payload_merges_news_and_counts_sectors(tmp_path):
    (tmp_path / "policies.json").write_text(json.dumps(dict(reviewed="2026-08-01", items=[
        dict(id="a", region="kr", title="t", summary="s", date="2026-08-01", query=dict(ko="q"),
             effects=[dict(sector="금융", tone=1, why="w"), dict(sector="운송", tone=-1, why="w")],
             sources=[dict(name="n", url="https://x")]),
        dict(id="b", region="world", title="t", summary="s", date="2026-08-01",
             effects=[dict(sector="금융", tone=0, why="w")], sources=[dict(name="n", url="https://x")])])))
    (tmp_path / "policy_news.json").write_text(json.dumps(dict(day="2026-10-10", items=dict(a=[dict(title="뉴스")]))))
    p = policies.payload(tmp_path, today=dt.date(2026, 10, 11))
    assert p["stale"] is True and p["news_day"] == "2026-10-10"
    assert p["items"][0]["news"] == [dict(title="뉴스")] and p["items"][1]["news"] == []
    assert "query" not in p["items"][0]
    assert p["by_sector"] == {"금융": [1, 0, 1], "운송": [0, 1, 0]}
    assert policies.payload(tmp_path / "없음") is None


def test_fetch_news_uses_english_for_foreign_policies():
    data = dict(items=[dict(id="k", region="kr", query=dict(ko="한", en="e")),
                       dict(id="u", region="us", query=dict(ko="미", en="us"))])
    calls = []

    def fake(q, lang, days, n):
        calls.append((q, lang))
        return [dict(title=q)] * n
    out = policies.fetch_news(data, fetch=fake)
    assert [x["title"] for x in out["k"]] == ["한", "한"]
    assert [x["title"] for x in out["u"]] == ["미", "us"]
    assert ("e", "en") not in calls
