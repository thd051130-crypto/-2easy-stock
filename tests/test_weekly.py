import datetime as dt

import tgfmt
import weekly as wk

SAT = dt.date(2026, 10, 24)
DATES = ["2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]
WORLD = dict(groups=[dict(name="한국", items=[dict(name="코스피", kind="idx", last=110.0, w1=0.1, m1=-0.2,
                                                   dates=DATES, closes=[100, 101, 99, 102, 105, 110])]),
                     dict(name="미국", items=[dict(name="S&P500", kind="idx", last=7600.0, w1=-0.01, m1=0.04, dates=[], closes=[])]),
                     dict(name="채권 금리", items=[dict(name="미국 10년 국채 금리", kind="rate", last=4.99, w1=-0.11, m1=-0.13)]),
                     dict(name="원자재", items=[dict(name="금 (온스)", kind="usd", last=4007.9, w1=-0.0414, m1=-0.072)])])
SIGNALS = {"kr": dict(day="2026-10-23", sectors=[dict(name="반도체", r5=0.05, best=dict(name="A")), dict(name="운송", r5=-0.04, worst=dict(name="B")),
                                                  dict(name="금융", r5=None)],
                      movers=dict(up=[dict(code="X", name="엑스", r5=0.3, main="뉴스: 실적")], down=[dict(code="Y", name="와이", r5=-0.2, reasons=["큰 매도"])])),
           "us": {}}


def inputs():
    events = [dict(date="2026-10-21", at="2026-10-21T21:30+09:00", flag="🇺🇸", ko="소비자물가", tier1=True, actual="0.3%", forecast="0.2%"),
              dict(date="2026-10-28", at="2026-10-28T03:00+09:00", flag="🇺🇸", ko="FOMC 금리 결정", tier1=True),
              dict(date="2026-11-10", at="2026-11-10T22:30+09:00", flag="🇺🇸", ko="먼 발표", tier1=True)]
    shocks = [dict(at="2026-10-20T10:02+09:00", label="코스피", way="down", move=-0.021, news=[dict(title="급락 뉴스")]),
              dict(at="2026-10-12T10:00+09:00", label="코스피", way="up", move=0.02)]
    calendar = [dict(date="2026-10-27", market="kr", kind="earn", title="삼성전자 실적 발표", code="005930", cap=1e15),
                dict(date="2026-10-27", market="kr", kind="earn", title="작은 회사 실적 발표", code="1", cap=1e9),
                dict(date="2026-10-29", market="us", kind="earn", title="아마존 실적 발표", code="AMZN", cap=1e9, mine=True),
                dict(date="2026-10-30", market="kr", kind="expiry", title="국장 옵션 만기"),
                dict(date="2026-10-28", market="us", kind="big", title="FOMC 금리 결정", big=True),
                dict(date="2026-10-29", market="us", kind="big", title="작은 발표", big=False)]
    macro = dict(regime="확장", prev_regime="둔화", score=1, total=7, history=[dict(score=2), dict(score=1)],
                 signals=[dict(key="oil_jump", name="유가 급등", warn=True)])
    return dict(world=WORLD, macro=macro, events=events, shocks=shocks, calendar=calendar, signals=SIGNALS)


def test_week_range_on_saturday():
    assert wk.week_range(SAT) == (dt.date(2026, 10, 19), dt.date(2026, 10, 23), dt.date(2026, 10, 26), dt.date(2026, 10, 30))


def test_build():
    r = wk.build(inputs(), today=SAT)
    assert r["week"] == ["2026-10-19", "2026-10-23"]
    days = r["index"]["days"]["kr"]["days"]
    assert [d for d, _ in days] == ["월", "화", "수", "목", "금"] and abs(days[0][1] - 0.01) < 1e-9
    assert r["sectors"]["kr"]["up"][0]["name"] == "반도체" and r["sectors"]["kr"]["down"][0]["name"] == "운송"
    assert r["movers"]["kr"]["down"][0]["why"] == "큰 매도" and "us" not in r["movers"]
    ev = r["events"]
    assert len(ev["shocks"]) == 1 and ev["shocks"][0]["news"] == "급락 뉴스"  # 지난주 급변은 빼요
    assert ev["done"][0]["actual"] == "0.3%"
    n = r["next"]
    assert [e["title"] for e in n["big"]] == ["FOMC 금리 결정"]  # 먼 발표는 다음 주가 아니에요
    assert [c["title"] for c in n["cal"]] == ["국장 옵션 만기"]  # 같은 FOMC는 한 번만, 작은 발표는 빼요
    assert [c["title"] for c in n["earn"]] == ["삼성전자 실적 발표", "아마존 실적 발표"]  # 대형주 + 내 관심종목
    assert r["headline"][0].startswith("이번 주: 코스피 +10.0%")
    assert "다음 주 큰 일정" in r["headline"][-1]


def test_text_and_html():
    r = wk.build(inputs(), today=SAT)
    t = wk.format_text(r)
    assert "미국 10년 국채 금리 4.99% (1주 -0.11%p)" in t
    assert "금 (온스) 4,007.90 (1주 -4.14%, 1달 -7.2%)" in t
    assert "경기 판정 확장 (전엔 둔화)" in t and "⭐" in t
    assert "사고팔기 판단은 안 해요" in t
    parts = tgfmt.compose(wk.summary_html(r), t)
    assert parts and "주간 리포트" in parts[0] and "10.19~10.23" in parts[0]


def test_empty_inputs():
    r = wk.build(dict(world={}, macro={}, events=[], shocks=[], calendar=[], signals={"kr": {}, "us": {}}), today=SAT)
    t = wk.format_text(r)
    assert "큰 사건 없음" in t and "아직 잡힌 큰 일정 없음" in t
