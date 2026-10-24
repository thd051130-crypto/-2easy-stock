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


def test_old_news_dropped():
    now = dt.datetime(2026, 10, 24, 16, 0, tzinfo=news.KST)
    items = [dict(title="새 것", at="2026-10-24T10:00+09:00"), dict(title="어제 아침", at="2026-10-23T15:00+09:00"),
             dict(title="시각 없음", at=None)]
    assert [x["title"] for x in news.fresh(items, now)] == ["새 것"]
    out = news.build(fetch=lambda q, lang="ko", n=6: items, now=now)
    assert [x["title"] for x in out["kr"]] == ["새 것"]


def test_hot_needs_three_sources_and_keeps_until_old():
    now = dt.datetime(2026, 10, 24, 16, 0, tzinfo=news.KST)
    a = [dict(title="중동 긴장에 국제유가 급등 116달러", source=f"언론{i}", at=f"2026-10-24T1{i}:00+09:00", link="https://x") for i in range(3)]
    b = [dict(title="한은 기준금리 동결", source="한경", at="2026-10-24T12:00+09:00", link="https://y"),
         dict(title="한은 기준금리 동결 매파적", source="매경", at="2026-10-24T12:30+09:00", link="https://z")]
    h = news.hot(a + b)
    assert len(h) == 1 and h[0]["sources"] == 3 and {"중동", "국제유가"} <= set(h[0]["key"])
    assert h[0]["since"] == "2026-10-24T10:00+09:00"
    # 다음 실행: 이번엔 핫이 없어도 지난 핫은 7일 동안 남고, 같은 사건이면 하나로
    old = dict(h[0], since="2026-10-20T09:00+09:00")
    assert news.keep_hot([], [old], now) == [old]
    assert news.keep_hot(h, [old], now)[0]["since"] == "2026-10-20T09:00+09:00" and len(news.keep_hot(h, [old], now)) == 1
    stale = dict(old, at="2026-10-16T09:00+09:00")
    assert news.keep_hot([], [stale], now) == []


def test_words_drop_josa_and_common():
    assert news.words("트럼프가 관세를 올렸다…증시 급락") == {"트럼프가", "관세", "올렸다"}
    assert "국제유가" in news.words("국제유가는 23주째 상승")
