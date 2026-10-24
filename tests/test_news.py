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


def test_build_merges_queries_and_tags_topics():
    def fake(q, lang="ko", n=6):
        if q == "코스피 증시":
            return [dict(title="한은 기준금리 동결", source="s", at="2026-10-24T10:00+09:00", link="https://x")]
        if q == "원달러 환율":
            return [dict(title="환율 1,380원대 마감", source="s", at="2026-10-24T11:00+09:00", link="https://y"),
                    dict(title="한은 기준금리  동결", source="s2", at="2026-10-24T09:00+09:00", link="https://z")]
        return []
    now = dt.datetime(2026, 10, 24, 13, 43, tzinfo=news.KST)
    out = news.build(fetch=fake, now=now)
    assert out["updated"] == "2026-10-24T13:43+09:00"
    assert [(x["title"], x["topic"]) for x in out["kr"]] == [("환율 1,380원대 마감", "환율"), ("한은 기준금리 동결", "금리")]
    assert out["us"] == []


def test_topic():
    assert news.topic("트럼프, 중국산 관세 인상 예고") == "무역·관세"
    assert news.topic("Fed signals rate cut") == "금리"
    assert news.topic("corporate earnings beat") == "실적"  # corporate의 rate는 금리가 아니에요
    assert news.topic("삼성전자 신제품 공개") is None
    assert news.topic("American Express (AXP) stock trades down") is None  # trades는 무역이 아니에요
