import datetime as dt
import json

import econ_calendar as ec

FOMC = """<h4>2026 FOMC Meetings</h4>
<div class="row fomc-meeting" "><div class="fomc-meeting__month col-xs-5"><strong>January</strong></div>
<div class="fomc-meeting__date col-xs-4 col-lg-1">27-28</div><div class="col-xs-12">Minutes (Released February 18, 2026)</div></div>
<div class="row fomc-meeting" "><div class="fomc-meeting__month col-xs-5"><strong>March</strong></div>
<div class="fomc-meeting__date col-xs-4 col-lg-1">17-18*</div><div class="col-xs-12">Minutes (Released February 18, 2026)</div></div>
<div class="row fomc-meeting" "><div class="fomc-meeting__month col-xs-5"><strong>August</strong></div>
<div class="fomc-meeting__date col-xs-4 col-lg-1">22 (notation vote)</div><div class="col-xs-12">Minutes (Released February 18, 2026)</div></div>
<div class="row fomc-meeting" "><div class="fomc-meeting__month col-xs-5"><strong>October</strong></div>
<div class="fomc-meeting__date col-xs-4 col-lg-1">27-28</div><div class="col-xs-12">Minutes (Released February 18, 2026)</div></div>
<div class="row fomc-meeting" "><div class="fomc-meeting__month col-xs-5"><strong>December</strong></div>
<div class="fomc-meeting__date col-xs-4 col-lg-1">8-9*</div><div class="col-xs-12">Minutes (Released February 18, 2026)</div></div>
<h4>2027 FOMC Meetings</h4>
<div class="row fomc-meeting" "><div class="fomc-meeting__month col-xs-5"><strong>January</strong></div>
<div class="fomc-meeting__date col-xs-4 col-lg-1">26-27</div><div class="col-xs-12">Minutes (Released February 18, 2026)</div></div>
<div class="row fomc-meeting" "><div class="fomc-meeting__month col-xs-5"><strong>April/May</strong></div>
<div class="fomc-meeting__date col-xs-4 col-lg-1">30-1</div><div class="col-xs-12">Minutes (Released February 18, 2026)</div></div>
<div class="row fomc-meeting" "><div class="fomc-meeting__month col-xs-5"><strong>October</strong></div>
<div class="fomc-meeting__date col-xs-4 col-lg-1">26-27</div><div class="col-xs-12">Minutes (Released February 18, 2026)</div></div>
"""

BOK = """통화정책방향 결정회의 2026년 년도선택 2027년 2026년 2025년 이동 회의일자 결정문 1) 01월 15일(목) 첨부파일
국문보도자료(2601).hwp 2026년도 제1차 금통위 의사록 02월 26일(목) 10월 22일(목) 11월 26일(목)"""


def test_parse_fomc_uses_last_day_and_skips_release_dates():
    got = ec.parse_fomc(FOMC)
    assert [x["date"] for x in got] == ["2026-01-28", "2026-03-18", "2026-10-28", "2026-12-09", "2027-01-27", "2027-05-01", "2027-10-27"]
    assert [x["sep"] for x in got][:2] == [False, True]


def test_parse_bok():
    assert ec.parse_bok(BOK) == ["2026-01-15", "2026-02-26", "2026-10-22", "2026-11-26"]
    assert ec.parse_bok("년도 없음") == []


def test_expiries_and_seasons():
    ex = ec.expiries(dt.date(2026, 10, 1), dt.date(2026, 12, 31))
    assert [(e["date"], e["market"]) for e in ex] == [
        ("2026-10-08", "kr"), ("2026-10-16", "us"), ("2026-11-12", "kr"), ("2026-11-20", "us"), ("2026-12-10", "kr"), ("2026-12-18", "us")]
    assert "동시" in ex[-1]["title"] and "동시" not in ex[0]["title"]
    se = ec.seasons(dt.date(2026, 10, 1), dt.date(2026, 11, 30))
    assert [(e["date"], e["title"]) for e in se] == [("2026-10-20", "국장 실적 시즌 시작"), ("2026-11-14", "국장 실적 시즌 끝")]


def test_build_and_week_text(tmp_path):
    (tmp_path / "kr").mkdir()
    (tmp_path / "us").mkdir()
    (tmp_path / "kr" / "fundamentals.json").write_text(json.dumps(dict(stocks={
        "005930": dict(name="삼성전자", cap=1.5e15, events=dict(earn="2026-10-28", exdiv="2026-12-29")),
        "000660": dict(name="SK하이닉스", cap=1e15, events=dict(earn="2026-10-23"))})))
    (tmp_path / "kr" / "state.json").write_text(json.dumps(dict(positions=[dict(code="000660")])))
    (tmp_path / "us" / "fundamentals.json").write_text(json.dumps(dict(stocks={"AAPL": dict(name="애플", cap=3e12, events=dict(earn="2026-11-02"))})))
    fomc = [dict(date="2026-10-28", sep=False)]
    ev = ec.build(dt.date(2026, 10, 19), fomc, ["2026-10-22"], tmp_path)
    titles = [e["title"] for e in ev]
    assert "미국 금리 결정 (FOMC)" in titles and "한국 금리 결정 (금통위)" in titles and "삼성전자 배당락" in titles
    assert [e for e in ev if e.get("code") == "000660"][0]["mine"]
    assert ev == sorted(ev, key=lambda e: e["date"])
    text = ec.week_text(ev, dt.date(2026, 10, 22))
    assert text.startswith("[이번 주 일정]") and "10.22(목) 🇰🇷 한국 금리 결정 (금통위)" in text
    assert "SK하이닉스 실적 발표 ⭐" in text and "삼성전자 실적 발표" in text and "FOMC" in text
    assert "삼성전자 배당락" not in text  # 다음 주 밖
    assert "큰 일정이 없어요" in ec.week_text([], dt.date(2026, 10, 22))


FRED_HTML = """<table><tbody>
<tr class="odd"> <td text-align="left" colspan="2"> <span style="font-weight: bold;">Tuesday November 10, 2026</span> </td> </tr>
<tr> <td nowrap style="width:5%; text-align:right"> 7:30 am </td> <td text-align="left"> <a href="/release?rid=10">Consumer Price Index</a> </td> </tr>
<tr class="odd"> <td text-align="left" colspan="2"> <span style="font-weight: bold;">Thursday December 10, 2026</span> </td> </tr>
<tr> <td nowrap style="width:5%; text-align:right"> 7:30 am </td> <td text-align="left"> <a href="/release?rid=10">Consumer Price Index</a> </td> </tr>
<tr> <td nowrap style="width:5%; text-align:right"> 7:30 am </td> <td text-align="left"> <a href="/release?rid=100">Other</a> </td> </tr>
</tbody></table>"""


def test_parse_fred_converts_central_time_to_kst():
    got = ec.parse_fred(FRED_HTML, 10)
    # 11월 10일은 미국 서머타임이 끝난 뒤(중부 표준시 UTC-6) → 한국시간 22:30
    assert got == [dict(at="2026-11-10T22:30+09:00", rid=10), dict(at="2026-12-10T22:30+09:00", rid=10)]


def test_release_events_merges_same_time_and_skips_this_week():
    rel = [dict(at="2026-11-10T22:30+09:00", rid=10), dict(at="2026-11-10T22:30+09:00", rid=9),
           dict(at="2026-11-06T22:30+09:00", rid=50), dict(at="2027-06-01T21:30+09:00", rid=53)]
    start, end = dt.date(2026, 11, 1), dt.date(2026, 12, 31)
    ev = ec.release_events(rel, start, end, taken={("2026-11-06", "한국시간 22:30 발표")})
    assert ev == [dict(date="2026-11-10", market="us", kind="big", title="미국 소비자물가(CPI) · 미국 소매판매", big=True,
                       note="한국시간 22:30 발표")]


def test_keep_past_keeps_old_past_meetings_only():
    today = dt.date(2026, 10, 18)
    old = [dict(date="2024-12-18", sep=True), dict(date="2026-12-09", sep=True)]
    new = [dict(date="2026-12-10", sep=True)]
    assert [x["date"] for x in ec.keep_past(new, old, today)] == ["2024-12-18", "2026-12-10"]
    assert ec.keep_past([], old, today) == old


def test_build_covers_last_year_to_next_year(tmp_path):
    ev = ec.build(dt.date(2026, 10, 18), [], [], tmp_path)
    dates = [e["date"] for e in ev]
    assert min(dates) < "2025-02-01" and max(dates) > "2027-11-30"
