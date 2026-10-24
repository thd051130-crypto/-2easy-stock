import json

import reading

DATA = {"hasNext": True, "items": [
    {"nid": "37912", "title": "마켓레이더 - 코스피 5,400↓", "content": "<p><strong>KOSPI는 2.6% 하락</strong></p><p><br>:META(-7.0%)&nbsp;약세<br>:반대매매 진정</p>",
     "brokerName": "신한투자증권", "writeDate": "2026-10-23"},
    {"nid": "1", "title": "", "writeDate": "2026-10-23"},
    {"nid": "46614", "title": "방어 and Beyond", "content": "<p>음식료</p>", "brokerName": "DS투자증권", "writeDate": "2026-10-23",
     "analystName": "장지혜", "industryKoreanName": "음식료"},
]}


def test_parse_json_items():
    a, b = reading.parse(DATA, "market")
    assert a["id"] == "market:37912" and a["broker"] == "신한투자증권" and a["date"] == "2026-10-23"
    assert a["summary"] == "KOSPI는 2.6% 하락\n:META(-7.0%) 약세\n:반대매매 진정"
    assert b["sector"] == "음식료" and b["analyst"] == "장지혜"
    assert a["url"] == "https://stock.naver.com/research/daily/37912"


def test_url_only_for_known_detail_pages():
    [x] = reading.parse({"items": [{"nid": "5", "title": "t", "writeDate": "2026-10-23"}]}, "nowhere")
    assert "url" not in x


def test_summary_is_cut():
    long = {"items": [{"nid": "9", "title": "t", "writeDate": "2026-10-23", "content": "가" * 1000}]}
    [x] = reading.parse(long, "market")
    assert len(x["summary"]) == reading.SUMMARY + 1 and x["summary"].endswith("…")


def test_run_merges_keeps_old_and_survives_failures(tmp_path):
    out = tmp_path / "reading.json"
    out.write_text(json.dumps({"items": {"market": [dict(id="market:old", title="옛 리포트", date="2099-01-01")]}}))

    def get(cat):
        if cat == "market":
            return DATA
        raise RuntimeError("막힘")
    data, fails = reading.run(out, get)
    assert [x["title"] for x in data["items"]["market"]] == ["옛 리포트", "마켓레이더 - 코스피 5,400↓", "방어 and Beyond"]
    assert len(fails) == 4 and data["home"].startswith("https://stock.naver.com")


def test_run_keeps_file_when_nothing_fetched(tmp_path):
    out = tmp_path / "reading.json"
    out.write_text('{"items":{"market":[]}}')

    def get(cat):
        raise RuntimeError("막힘")
    data, fails = reading.run(out, get)
    assert out.read_text() == '{"items":{"market":[]}}' and len(fails) == 5
