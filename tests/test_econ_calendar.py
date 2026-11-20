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


def test_expiries():
    ex = ec.expiries(dt.date(2026, 10, 1), dt.date(2026, 12, 31))
    assert [(e["date"], e["market"]) for e in ex] == [
        ("2026-10-08", "kr"), ("2026-10-16", "us"), ("2026-11-12", "kr"), ("2026-11-20", "us"), ("2026-12-10", "kr"), ("2026-12-18", "us")]
    assert "동시" in ex[-1]["title"] and "동시" not in ex[0]["title"]
    assert "네 마녀의 날" in ex[-1]["title"] and ex[-1]["big"] and "big" not in ex[0]


def test_expiries_move_to_previous_trading_day():
    """휴장일이면 앞 거래일로: 2025-10-09(한글날, 둘째 목요일)는 추석 연휴라 10-02, 2025-04-18(성금요일)은 04-17."""
    ex = {(e["market"], e["date"][:7]): e for e in ec.expiries(dt.date(2025, 4, 1), dt.date(2025, 10, 31))}
    assert ex[("kr", "2025-10")]["date"] == "2025-10-02" and "앞당겨졌어요" in ex[("kr", "2025-10")]["note"]
    assert ex[("us", "2025-04")]["date"] == "2025-04-17"


def test_index_holiday_and_rule_events():
    """사용자 2026-11-19 "ELS 만기일처럼 증시에 큰 영향 가는 일 국내·미국 다 반영되는 거야?" → 규칙 일정 채우기."""
    start, end = dt.date(2026, 11, 1), dt.date(2026, 12, 31)
    idx = {(e["date"], e["title"].split(" (")[0]) for e in ec.index_events(start, end)}
    assert ("2026-11-30", "MSCI 지수 정기변경") in idx           # 11월 마지막 거래일 종가
    assert ("2026-12-10", "코스피200·코스닥150 정기변경") in idx  # 12월 동시만기
    assert ("2026-12-11", "러셀 지수 재구성") in idx              # 2026년부터 12월 둘째 금요일
    assert ("2026-12-18", "S&P 500 분기 리밸런싱 · 나스닥100 연례 종목 교체") in idx
    hol = {(e["date"], e["market"], e["title"]) for e in ec.holiday_events(start, end)}
    assert ("2026-11-26", "us", "미장 휴장 (추수감사절)") in hol and ("2026-11-27", "us", "미장 조기 폐장") in hol
    assert ("2026-12-31", "kr", "국장 휴장 (연말휴장일)") in hol and ("2026-11-19", "kr", "국장 10시 개장 (수능 날)") in hol
    div = [e for e in ec.holiday_events(start, end) if e["kind"] == "divday"]
    assert [e["date"] for e in div] == ["2026-12-29"]  # 폐장일(12-30) 전 거래일
    rel = {(e["date"], e["title"], e["note"]) for e in ec.rule_releases(start, end, [dict(date="2026-10-28"), dict(date="2026-12-09")])}
    assert ("2026-11-19", "FOMC 회의록", "한국시간 04:00 발표") in rel   # 10-28 회의 3주 뒤 오후 2시(동부)
    assert ("2026-12-02", "ISM 제조업 지수", "한국시간 00:00 발표") in rel  # 12-01 첫 거래일 오전 10시
    assert ("2026-12-04", "ISM 서비스업 지수", "한국시간 00:00 발표") in rel
    assert ("2026-12-01", "한국 수출입 동향 (반도체 수출)", "한국시간 09:00 발표") in rel


def test_big_rows_skips_rule_rows_already_in_events(tmp_path):
    """이번 주 events.json에 같은 시각 FOMC 회의록이 있으면 규칙 줄은 빼요 (홈 칸과 달력이 같은 이름)."""
    ev = [dict(id="m", at="2026-11-19T04:00+09:00", date="2026-11-19", country="us", flag="🇺🇸", title="FOMC Meeting Minutes",
               ko="FOMC 회의록", group="rate", tier1=False)]
    (tmp_path / "events.json").write_text(json.dumps(dict(events=ev)))
    rows = ec.big_rows(tmp_path, [], dt.date(2026, 11, 15), dt.date(2026, 11, 22), [dict(date="2026-10-28")])
    assert [(e["date"], e["title"]) for e in rows] == [("2026-11-19", "FOMC 회의록")]


def test_build_and_week_text(tmp_path):
    (tmp_path / "kr").mkdir()
    (tmp_path / "us").mkdir()
    (tmp_path / "kr" / "fundamentals.json").write_text(json.dumps(dict(stocks={
        "005930": dict(name="삼성전자", cap=1.5e15, events=dict(earn="2026-10-28", exdiv="2026-12-29")),
        "000660": dict(name="SK하이닉스", cap=1e15, events=dict(earn="2026-10-23"))})))
    (tmp_path / "watch.json").write_text(json.dumps(dict(kr=[dict(code="000660")], us=[])))
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


def test_risk_events_and_big_earn(tmp_path):
    """⚠️ 리스크 일정(사람이 적은 파일)과 초대형주 실적 (사용자 2026-11-15)."""
    import json

    (tmp_path / "risk_events.json").write_text(json.dumps({"events": [
        dict(date="2026-12-01", market="kr", title="ELS 만기 시작", note="12월 197억 원")]}), encoding="utf-8")
    today = ec.dt.date(2026, 11, 24)
    earn = ec.big_earn(fetch=lambda code: (1794949200, 4e12) if code == "NVDA" else (None, None))
    assert [x["code"] for x in earn] == ["NVDA"] and earn[0]["date"] == "2026-11-17"
    ev = ec.build(today, [], [], tmp_path, (), earn)
    risk = [e for e in ev if e["kind"] == "risk"]
    assert risk == [dict(date="2026-12-01", market="kr", kind="risk", title="ELS 만기 시작", note="12월 197억 원")]
    assert any(e["title"] == "엔비디아 실적 발표" for e in ev)
    alert = ec.risk_alert(ev, today)
    assert alert.startswith("[⚠️ 리스크 일정 미리 알림]") and "7일 뒤 · ELS 만기 시작" in alert
    assert ec.risk_alert(ev, ec.dt.date(2026, 11, 30)).count("내일") == 1
    assert ec.risk_alert(ev, ec.dt.date(2026, 11, 27)) is None
    assert "⚠️ ELS 만기 시작 (12월 197억 원)" in ec.week_text(ev, ec.dt.date(2026, 11, 30))
