import datetime as dt

import news

RSS = """<rss><channel>
<item><title>코스피 2% 올라 - 한국경제</title><source>한국경제</source><pubDate>Fri, 24 Oct 2026 03:10:00 GMT</pubDate><link>https://n/1</link></item>
<item><title>외국인 순매수 - 연합뉴스</title><source>연합뉴스</source><pubDate>Fri, 24 Oct 2026 04:00:00 GMT</pubDate><link>https://n/2</link></item>
</channel></rss>"""


def test_parse_newest_first_in_kst():
    out = news.parse(RSS, 5)
    assert [x["title"] for x in out] == ["외국인 순매수", "코스피 2% 올라"]
    assert out[0]["at"] == "2026-10-24T13:00+09:00" and out[0]["source"] == "연합뉴스"
    assert len(news.parse(RSS, 1)) == 1


def test_merge_drops_same_title():
    a = [dict(title="코스피 상승", at="2026-10-24T10:00+09:00")]
    b = [dict(title="코스피  상승", at="2026-10-24T09:00+09:00"), dict(title="환율", at="2026-10-24T11:00+09:00")]
    assert [x["title"] for x in news.merge([a, b])] == ["환율", "코스피 상승"]


def test_build_market_and_stocks():
    def fake(q, lang="ko", n=3):
        if q == "삼성전자 주가":
            return [dict(title="삼성전자 신고가", source="s", at="2026-10-24T10:00+09:00", link="https://x")]
        if q in ("코스피", "뉴욕증시"):
            return [dict(title=f"{q} 뉴스", source="s", at="2026-10-24T09:00+09:00", link="https://y")]
        return []
    now = dt.datetime(2026, 10, 24, 13, 43, tzinfo=news.KST)
    out = news.build({"kr": {"005930": "삼성전자", "000660": "SK하이닉스"}, "us": {"AAPL": "애플"}}, fetch=fake, now=now)
    assert out["updated"] == "2026-10-24T13:43+09:00"
    assert [x["title"] for x in out["kr"]["market"]] == ["코스피 뉴스"]
    assert list(out["kr"]["stocks"]) == ["005930"]  # 뉴스 없는 종목은 빼요
    assert out["us"]["stocks"] == {} and out["us"]["market"][0]["title"] == "뉴욕증시 뉴스"


def test_targets_add_telegram_extras(tmp_path):
    (tmp_path / "watch.json").write_text('{"kr": [{"code": "012450", "name": "한화에어로스페이스"}], "us": []}')
    t = news.targets(tmp_path)
    assert t["kr"]["012450"] == "한화에어로스페이스" and "005930" in t["kr"] and "AAPL" in t["us"]
