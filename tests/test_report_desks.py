import datetime as dt

import report_desks as rd

WORLD = dict(groups=[dict(name="한국", items=[dict(name="코스피", kind="idx", last=5500.0, d1=-0.035, w1=-0.01, m1=-0.2)]),
                     dict(name="미국", items=[dict(name="S&P500", kind="idx", last=7600.0, d1=0.004, w1=0.01, m1=0.04)]),
                     dict(name="환율", items=[dict(name="원/달러", kind="krw", last=1324.0, d1=0.0, m1=-0.02)])])
MACRO = dict(regime="확장", score=1, total=7, signals=[dict(key="oil_jump", name="유가 급등", warn=True, now="WTI 103달러"),
                                                     dict(key="credit", name="신용 경계", warn=False, now="-")])
POLICIES = [dict(region="kr", title="자사주 소각 의무화", effects=[dict(sector="금융", tone=1), dict(sector="지주·기타", tone=1)]),
            dict(region="world", title="중동 전쟁", effects=[dict(sector="에너지·정유", tone=1), dict(sector="운송", tone=-1)]),
            dict(region="us", title="반도체 관세", effects=[dict(sector="반도체", tone=-1)])]


def sector(name, r5, best):
    return dict(name=name, r5=r5, r20=r5 * 2, vs_index=r5, codes=[best], best=dict(code=best, name=best, r5=r5 * 3),
                worst=dict(code=best + "w", name=best + "w", r5=-0.01))


SIGNALS = {
    "kr": dict(sectors=[sector("반도체", 0.05, "A"), sector("금융", 0.02, "B"), sector("운송", 0.01, "C"),
                        sector("에너지·정유", -0.06, "D"), sector("자동차", -0.03, "E")],
               sector_of={"A": "반도체", "X": "반도체", "B": "금융", "D": "에너지·정유"},
               movers=dict(up=[dict(code="X", name="엑스", r5=0.3, main="뉴스: 실적", reasons=["실적 뉴스"])], down=[]),
               quiet_volume=dict(rows=[dict(code="Q", name="큐", ratio=2.5, r5=0.01)]),
               sector_links={"반도체": [["IT·전자", "서버 수요"]]}),
    "us": dict(sectors=[sector("반도체", -0.02, "NVDA")]),
}
FLOWS = dict(day="2026-10-22", stocks={"X": dict(sum=dict(day="2026-10-22", frg5_won=5e9, inst5_won=1e9))})


def inputs():
    events = [dict(date="2026-10-28", at="2026-10-28T03:00+09:00", flag="🇺🇸", ko="FOMC 금리 결정", tier1=True),
              dict(date="2026-12-01", at="2026-12-01T22:30+09:00", flag="🇺🇸", ko="먼 발표", tier1=True)]
    calendar = [dict(date="2026-10-27", market="kr", kind="earn", title="삼성전자 실적 발표", code="005930", cap=1e15),
                dict(date="2026-10-27", market="kr", kind="earn", title="작은 회사 실적 발표", code="1", cap=1e9)]
    return dict(world=WORLD, macro=MACRO, events=events, calendar=calendar, policies=POLICIES, signals=SIGNALS,
                flows=FLOWS, funds={"kr": {"X": dict(grade=dict(grade="양호"))}, "us": {}})


def test_market_desk_tone_and_tilt():
    m = rd.market_desk(WORLD, MACRO)
    assert m["markets"]["kr"]["tone"] == "약함" and m["markets"]["us"]["tone"] == "강함"
    assert {t["sector"] for t in m["tilt"]} == {"에너지·정유", "운송", "화학·소재"}  # 유가 급등만 경고


def test_policy_desk_scores_by_market_region():
    m = rd.market_desk(WORLD, MACRO)
    p = rd.policy_desk(m, inputs()["events"], inputs()["calendar"], POLICIES, dt.date(2026, 10, 24))
    kr = {r["sector"]: r["score"] for r in p["sectors"]["kr"]}
    us = {r["sector"]: r["score"] for r in p["sectors"]["us"]}
    assert kr["에너지·정유"] == 2 and kr["운송"] == -2 and kr["금융"] == 1 and "반도체" not in kr
    assert us["반도체"] == -1 and "금융" not in us  # 미장은 미국·세계 정책만
    assert [e["title"] for e in p["big"]] == ["FOMC 금리 결정"]  # 7일 밖은 빼요
    assert [e["title"] for e in p["earn"]] == ["삼성전자 실적 발표"]  # 큰 회사만
    assert "국장" in p["caution"]


def test_pipeline_passes_focus_sectors_to_stock_desk():
    r = rd.build(inputs(), today=dt.date(2026, 10, 24))
    kr = r["sectors"]["kr"]
    assert [s["name"] for s in kr["strong"]] == ["반도체", "금융", "운송"]
    assert {s["name"]: s["match"] for s in kr["strong"]}["운송"] == "엇갈림"  # 정책·경기는 악재인데 올랐어요
    assert [s["name"] for s in kr["gap"]] == ["에너지·정유"]  # 호재 +2인데 주가는 빠짐
    assert kr["focus"] == ["반도체", "금융", "운송", "에너지·정유"]
    picks = r["stocks"]["kr"]["picks"]
    x = next(p for p in picks if p["code"] == "X")
    assert x["sector"] == "반도체" and "재무 양호" in x["notes"] and "외국인·기관 5일 순매수" in x["notes"]
    assert next(p for p in picks if p["sector"] == "에너지·정유")["code"] == "Dw"  # 빠지는 업종은 가장 약한 종목
    assert r["stocks"]["kr"]["quiet"][0]["name"] == "큐"
    assert r["headline"][0].startswith("시장 분위기: 국장 약함")
    assert any(line.startswith("업종팀 🇰🇷 → 볼 업종 반도체") for line in r["chain"])


def test_text_and_summary_have_every_desk():
    r = rd.build(inputs(), today=dt.date(2026, 10, 24))
    text = rd.format_text(r)
    for desk in ("[시장팀]", "[일정·정책팀]", "[업종팀]", "[종목팀]", "[편집팀]"):
        assert desk in text
    assert "매수 신호" not in text and "손절" not in text
    assert "오늘의 리포트" in rd.summary_html(r) and "10.24 토" in rd.summary_html(r)


def test_build_with_empty_files(tmp_path):
    r = rd.build(rd.load_inputs(tmp_path), today=dt.date(2026, 10, 24))
    assert r["sectors"] == {} and r["stocks"] == {} and r["headline"][0].startswith("시장 분위기")
    rd.format_text(r)


def test_fact_text_rate_in_points():
    f = dict(name="미국 10년 국채 금리", kind="rate", last=4.99, d1=0.04, m1=-0.13)
    assert rd.fact_text(f) == "미국 10년 국채 금리 4.99% (+0.04%p, 1달 -0.13%p)"


NOW = dt.datetime(2026, 11, 24, 17, 30, tzinfo=rd.KST)
NEWS = dict(hot=dict(
    kr=[dict(title="옛 사건", sources=40, at="2026-11-20T10:00+09:00", key=["옛", "사건"]),
        dict(title="젠슨 황 복귀 코스피 폭등", sources=21, at="2026-11-24T17:00+09:00", key=["젠슨", "복귀", "코스피"]),
        dict(title="젠슨 황 복귀 반도체 질주", sources=5, at="2026-11-24T16:00+09:00", key=["젠슨", "복귀", "반도체"]),
        dict(title="금통위 금리 인상", sources=10, at="2026-11-24T15:00+09:00", key=["금리", "인상"])],
    us=[dict(title="젠슨 황 복귀 뉴욕 급등", sources=31, at="2026-11-24T08:00+09:00", key=["젠슨", "복귀", "뉴욕"])]))


def test_news_desk_picks_big_fresh_events():
    n = rd.news_desk(NEWS, NOW)
    assert [x["title"] for x in n["kr"]] == ["젠슨 황 복귀 코스피 폭등", "금통위 금리 인상"]  # 오래된 것·같은 사건은 빼요
    assert n["us"][0]["sources"] == 31


def test_report_headline_has_big_news_once(tmp_path):
    r = rd.build(dict(rd.load_inputs(tmp_path), news=NEWS), today=NOW.date(), now=NOW)
    news_lines = [x for x in r["headline"] if x.startswith("📰")]
    assert news_lines == ["📰 🇰🇷 큰 뉴스: 젠슨 황 복귀 코스피 폭등 (언론 21곳)"]  # 미장도 같은 사건이라 한 줄만
    assert "[뉴스팀]" in rd.format_text(r)


def test_fact_text_marks_old_close():
    f = dict(name="코스피", kind="idx", last=4708.5, d1=-0.0331, m1=-0.15, day="2026-11-23")
    assert rd.fact_text(f, "2026-11-24").endswith("· 11-23 종가")
    assert "종가" not in rd.fact_text(f, "2026-11-23")
