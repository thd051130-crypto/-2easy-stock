import json

import pytest

import symbols as sy


@pytest.mark.parametrize("long_name, short_name, want", [
    ("삼성전자(주)", "SamsungElec", "삼성전자"),
    ("삼성전자(주)", "SamsungElec(1P)", "삼성전자우"),
    ("현대자동차(주)", "HyundaiMtr(2PB)", "현대자동차2우B"),
    ("삼성물산(주)", "SAMSUNG C&T(1PB)", "삼성물산우B"),
    ("에스케이바이오팜 주식회사", "SKBP", "SK바이오팜"),
    ("(주)케이티앤지", "KT&G", "KT&G"),
    ("(주) 에프엔에스테크", "FNS TECH", "에프엔에스테크"),
    ("주식회사 카카오게임즈", "Kakao Games", "카카오게임즈"),
    ("엘지이노텍(주)", "LG Innotek", "LG이노텍"),
    ("에스케이(주)", "SK", "SK"),
    (None, "Sky Labs", "Sky Labs"),
])
def test_kr_stock_name(long_name, short_name, want):
    assert sy.kr_stock_name(long_name, short_name) == want


@pytest.mark.parametrize("long_name, short_name, want", [
    ("삼성KODEX200선물인버스2X증권상장지수투자신탁[주식-파생형]", "KODEX 200 Futures Inverse 2X", "KODEX 200선물인버스2X"),
    ("삼성 KODEX 인버스 증권 상장지수투자신탁 [주식-파생형]", "KODEX INVERSE", "KODEX 인버스"),
    ("미래에셋 TIGER 미국S&P500증권상장지수투자신탁(주식)", "TIGER S&P500", "TIGER 미국S&P500"),
    # 브랜드가 바뀐 종목은 옛 한국어 이름 대신 지금 영문 이름
    ("KB KStar 200 증권 상장지수 투자신탁(주식)", "RISE 200", "RISE 200"),
    ("Samsung Kodex Sk Hynix Single Stock Leverage", "KODEX SK Hynix Single Stock Lev", "KODEX SK Hynix Single Stock Lev"),
    (None, "Hana Leverage Semiconductor ETN", "Hana Leverage Semiconductor ETN"),
])
def test_kr_etf_name(long_name, short_name, want):
    assert sy.kr_etf_name(long_name, short_name) == want


def test_norm_and_spell():
    assert sy.norm(" (주)SK 하이닉스 ") == "sk하이닉스"
    assert sy.spell("sk하이닉스") == "에스케이하이닉스"
    assert sy.spell("삼성sdi") == "삼성에스디아이"
    assert sy.spell("kodex200") == "kodex200"  # 한글 옆이 아니면 그대로
    assert sy.query_keys("코덱스 200") == ["코덱스200", "kodex200"]


ROWS = [
    ["005930", "삼성전자", "KS", "s", "SamsungElec"],
    ["005935", "삼성전자우", "KS", "s", "SamsungElec(1P)|삼성전자"],
    ["000660", "SK하이닉스", "KS", "s", "SK hynix|에스케이하이닉스"],
    ["005380", "현대차", "KS", "s", "HyundaiMtr|현대자동차"],
    ["001500", "현대차증권", "KS", "s", "Hyundai Motor Securities"],
    ["035720", "카카오", "KS", "s", "Kakao"],
    ["323410", "카카오뱅크", "KS", "s", "KakaoBank"],
    ["069500", "KODEX 200", "KS", "e", ""],
]


@pytest.mark.parametrize("q, want", [
    ("카카오", ["035720", "323410"]),          # 이름 그대로가 먼저, 그다음 앞부분이 같은 이름
    ("에스케이하이닉스", ["000660"]),
    ("sk하이닉스", ["000660"]),
    ("하이닉스", ["000660"]),
    ("현대자동차", ["005380"]),
    ("현대차", ["005380", "001500"]),
    ("005930", ["005930"]),                   # 코드 그대로가 맨 앞
    ("00593", ["005930", "005935"]),
    ("코덱스200", ["069500"]),
    ("kakao", ["035720", "323410"]),
    ("  ", []),
])
def test_search(q, want):
    assert [r[0] for r in sy.search(ROWS, q)] == want


def yahoo(symbol, long_name=None, short_name=None):
    return dict(symbol=symbol, longName=long_name, shortName=short_name)


def test_rows_kr_filters_and_names():
    stocks = [yahoo("005930.KS", "삼성전자(주)", "SamsungElec"), yahoo("005935.KS", "삼성전자(주)", "SamsungElec(1P)"),
              yahoo("2109801G.KS", None, "SK D&D 12R"),
              yahoo("293490.KQ", "주식회사 카카오게임즈", "Kakao Games"), yahoo("386380.KQ", None, None),
              yahoo("000660.KS", "에스케이하이닉스(주)", "SK hynix")]
    etfs = [yahoo("069500.KS", "삼성KODEX200상장지수투자신탁[주식]", "KODEX 200"), yahoo("005930.KS", "중복", "dup")]
    rows = sy.rows_kr(stocks, etfs, universe={"000660": "SK하이닉스"})
    assert rows == [
        ["005930", "삼성전자", "KS", "s", "SamsungElec"],
        ["005935", "삼성전자우", "KS", "s", "SamsungElec(1P)"],  # 우선주에 보통주 정식 이름은 안 붙여요
        ["293490", "카카오게임즈", "KQ", "s", "Kakao Games"],
        ["000660", "SK하이닉스", "KS", "s", "SK hynix|에스케이하이닉스"],  # 알림 종목은 대시보드와 같은 이름
        ["069500", "KODEX 200", "KS", "e", ""],
    ]
    assert [r[0] for r in sy.search(rows, "삼성전자")] == ["005930", "005935"]


def test_rows_kr_naver_etf_names():
    etfs = [yahoo("069500.KS", "삼성KODEX200상장지수투자신탁[주식]", "KODEX 200"),
            yahoo("498400.KS", None, "KODEX 200 Target Weekly Covered"), yahoo("52M149.KS", None, None),
            yahoo("0046A0.KS", None, None)]
    names = {"498400": "KODEX 200타겟위클리커버드콜", "0046A0": "TIGER 미국초단기국채", "0089B0": "PLUS 나스닥100미국채혼합50"}
    rows = sy.rows_kr([], etfs, universe={}, etf_names=names)
    assert rows == [
        ["069500", "KODEX 200", "KS", "e", ""],
        ["498400", "KODEX 200타겟위클리커버드콜", "KS", "e", "KODEX 200 Target Weekly Covered"],
        ["0046A0", "TIGER 미국초단기국채", "KS", "e", ""],  # 야후엔 이름이 없어도 네이버 이름으로
        ["0089B0", "PLUS 나스닥100미국채혼합50", "KS", "e", ""],  # 네이버에만 있는 새 ETF
    ]
    assert [r[0] for r in sy.search(rows, "커버드콜")] == ["498400"]
    assert [r[0] for r in sy.search(rows, "target weekly")] == ["498400"]


def test_parse_naver_etf():
    body = {"resultCode": "success", "result": {"etfItemList": [
        {"itemcode": "069500", "itemname": "KODEX 200"}, {"itemcode": "0046a0", "itemname": "TIGER  미국S&P500(H)"}]}}
    want = {"069500": "KODEX 200", "0046A0": "TIGER 미국S&P500(H)"}
    assert sy.parse_naver_etf(json.dumps(body, ensure_ascii=False).encode("cp949")) == want
    assert sy.parse_naver_etf(json.dumps(body, ensure_ascii=False).encode("utf-8")) == want
    assert sy.parse_naver_etf(b"<html>") == {}


def test_rows_us_korean_names_and_aliases():
    stocks = [yahoo("TSLA", "Tesla, Inc.", "Tesla, Inc."), yahoo("JPM-PC", "JPMorgan Pfd", "JPM Pfd"),
              yahoo("BRK-B", "Berkshire Hathaway Inc. New", "Berkshire Hathaway Inc. New"),
              yahoo("XYZ", "Some Company Incorporated", "Some Company Inc")]
    etfs = [yahoo("SCHD", "Schwab U.S. Dividend Equity ETF", "Schwab US Dividend Equity ETF")]
    rows = sy.rows_us(stocks, etfs, universe={"BRK-B": "버크셔해서웨이"})
    assert rows == [
        ["TSLA", "테슬라", "", "s", "Tesla, Inc."],
        ["BRK-B", "버크셔해서웨이", "", "s", "Berkshire Hathaway Inc. New"],
        ["XYZ", "Some Company Incorporated", "", "s", "Some Company Inc"],
        ["SCHD", "미국 배당 ETF (슈왑)", "", "e", "Schwab U.S. Dividend Equity ETF|Schwab US Dividend Equity ETF|슈드"],
    ]
    assert [r[0] for r in sy.search(rows, "슈드")] == ["SCHD"]
    assert [r[0] for r in sy.search(rows, "tsla")] == ["TSLA"]


def test_save_keeps_old_file_when_too_few(tmp_path):
    path = tmp_path / "symbols" / "kr.json"
    data = dict(updated="2026-10-05T09:00+09:00", rows=[["005930", "삼성전자", "KS", "s", ""]] * 3)
    assert sy.save(path, data, minimum=2)
    assert json.loads(path.read_text()) == data and len(path.read_text().splitlines()) == 5  # 한 줄에 한 종목
    assert not sy.save(path, dict(data, rows=[]), minimum=2)
    assert json.loads(path.read_text())["rows"] == data["rows"]
    assert sy.load("kr", tmp_path / "symbols") == data["rows"] and sy.load("us", tmp_path / "symbols") == []


def test_build_with_fake_fetch():
    fake = lambda market: ([yahoo("005930.KS", "삼성전자(주)", "SamsungElec")], [])  # noqa: E731
    data = sy.build("kr", fetch=fake, etf_names={})
    assert data["rows"] == [["005930", "삼성전자", "KS", "s", "SamsungElec"]] and data["updated"]
