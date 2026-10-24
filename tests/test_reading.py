import json

import reading

PAGE = """<table class="type_1"><tr><th>제목</th><th>증권사</th></tr>
<tr><td><a href="market_info_read.naver?nid=1&amp;page=1">코스피 반등 시도</a></td><td>OO증권</td>
<td class="file"><a href="https://stock.pstatic.net/stock-research/market/1/a.pdf" target="_blank"><img alt="PDF"></a></td>
<td class="date">26.10.24</td><td class="date">120</td></tr>
<tr><td colspan="5" class="blank"></td></tr>
<tr><td><a href="market_info_read.naver?nid=2">채권 금리 점검</a></td><td>XX투자증권</td><td class="file"></td>
<td class="date">26.10.23</td><td class="date">9</td></tr></table>"""

INDUSTRY = """<tr><td><a href="/research/industry_list.naver?upjong=반도체">반도체</a></td>
<td><a href="industry_read.naver?nid=7">메모리 가격 반등</a></td><td>OO증권</td>
<td class="file"><a href="https://stock.pstatic.net/x/b.pdf">PDF</a></td><td class="date">26.10.24</td><td class="date">3</td></tr>"""


def test_parse_rows_with_and_without_pdf():
    out = reading.parse(PAGE, "market")
    assert [x["title"] for x in out] == ["코스피 반등 시도", "채권 금리 점검"]
    assert out[0]["broker"] == "OO증권" and out[0]["date"] == "2026-10-24"
    assert out[0]["pdf"].endswith("a.pdf") and out[0]["link"].startswith("https://finance.naver.com/research/market_info_read")
    assert out[1]["pdf"] == ""


def test_parse_industry_keeps_sector():
    [x] = reading.parse(INDUSTRY, "industry")
    assert x["title"] == "메모리 가격 반등" and x["sector"] == "반도체" and x["broker"] == "OO증권"


def test_run_merges_keeps_old_and_survives_failures(tmp_path):
    out = tmp_path / "reading.json"
    out.write_text(json.dumps({"items": {"market": [dict(title="옛 리포트", date="2099-01-01", pdf="old.pdf")]}}))

    def get(path):
        if path.startswith("market"):
            return PAGE
        raise RuntimeError("막힘")
    data, fails = reading.run(out, get)
    assert [x["title"] for x in data["items"]["market"]][:1] == ["옛 리포트"]
    assert len(data["items"]["market"]) == 3 and len(fails) == 4


def test_run_keeps_file_when_nothing_fetched(tmp_path):
    out = tmp_path / "reading.json"
    out.write_text('{"items":{"market":[]}}')

    def get(path):
        raise RuntimeError("막힘")
    data, fails = reading.run(out, get)
    assert out.read_text() == '{"items":{"market":[]}}' and len(fails) == 5
