import json
import pathlib
import re

import pandas as pd

import dashboard
import daily


def series(n=260, start=100.0, step=0.5):
    idx = pd.bdate_range("2024-01-01", periods=n)
    return pd.Series([start + i * step for i in range(n)], index=idx)


def test_build_without_records(tmp_path):
    data = dashboard.build(tmp_path)
    assert set(data["markets"]) == {"kr", "us"} and data["bot"] is None and data["report"] is None
    for m in data["markets"].values():
        assert m["daily"] is None
        assert m["extras"] == [] and m["alerts"] == []


def test_build_carries_telegram_extras_alerts_and_bot_name(tmp_path):
    (tmp_path / "watch.json").write_text(json.dumps(dict(us=[dict(code="TSLA", name="테슬라", symbol="TSLA")])))
    (tmp_path / "alerts.json").write_text(json.dumps(dict(next=3, active=[
        dict(id=1, market="kr", code="005930", price=300000, dir="up"),
        dict(id=2, market="us", code="TSLA", price=200.0, dir="down")], done=[dict(id=0)])))
    (tmp_path / "bot.json").write_text(json.dumps(dict(username="Automarmae_bot")))
    data = dashboard.build(tmp_path)
    assert data["bot"] == "Automarmae_bot"
    assert data["markets"]["us"]["extras"] == [dict(code="TSLA", name="테슬라", symbol="TSLA")]
    assert [a["id"] for a in data["markets"]["kr"]["alerts"]] == [1] and [a["id"] for a in data["markets"]["us"]["alerts"]] == [2]


def test_daily_and_report_round_trip(tmp_path):
    index_close = series()
    payload = dict(market="us", day="2024-12-20", series=daily.index_series(index_close))
    daily.save_json(tmp_path / "us" / "daily.json", payload)
    (tmp_path / "report.json").write_text(json.dumps(dict(day="2024-12-20", headline=["시장 분위기: 보통"])))
    data = dashboard.build(tmp_path)
    d = data["markets"]["us"]["daily"]
    assert len(d["series"]["dates"]) == 260 and d["series"]["ma200"][0] is None
    assert data["report"]["headline"] == ["시장 분위기: 보통"]
    json.dumps(d, allow_nan=False)  # 브라우저 JSON.parse가 못 읽는 NaN이 없어야 해요


def test_main_copies_site_and_writes_data(tmp_path, monkeypatch):
    site = tmp_path / "site"
    site.mkdir()
    (site / "index.html").write_text("<html></html>")
    out = tmp_path / "_site"
    monkeypatch.setattr("sys.argv", ["dashboard.py", "--paper", str(tmp_path / "paper"), "--site", str(site),
                                     "--out", str(out)])
    dashboard.main()
    assert (out / "index.html").exists() and not (out / "symbols").exists()
    data = json.loads((out / "data.json").read_text())
    assert data["markets"]["kr"]["name"] == "국장"
    assert data["site_version"] == dashboard.site_version(site)
    # 검색용 종목 목록이 있으면 같이 올려요
    (tmp_path / "paper" / "symbols").mkdir(parents=True)
    (tmp_path / "paper" / "symbols" / "kr.json").write_text('{"rows":[]}')
    dashboard.main()
    assert (out / "symbols" / "kr.json").read_text() == '{"rows":[]}'


def test_stamp_assets_versions_script_and_style_urls(tmp_path):
    html = '<link rel="stylesheet" href="style.css"><script src="casebook.js"></script><script src="js/core.js"></script>'
    (tmp_path / "js").mkdir()

    def stamped(core_js):
        (tmp_path / "index.html").write_text(html)
        (tmp_path / "casebook.js").write_text("const CASES = [];")
        (tmp_path / "js" / "core.js").write_text(core_js)
        (tmp_path / "js" / "map.js").write_text("const MAP = 1;")  # 나중에 받는 파일: index.html엔 없고 JSV에만
        (tmp_path / "style.css").write_text("body{}")
        dashboard.stamp_assets(tmp_path)
        return (tmp_path / "index.html").read_text()

    first = stamped("const A = 1;")
    assert re.search(r'src="js/core\.js\?v=[0-9a-f]{10}"', first)
    assert re.search(r'href="style\.css\?v=[0-9a-f]{10}"', first)
    jsv = json.loads(re.search(r"window\.JSV=(\{.*?\});", first).group(1))
    assert set(jsv) == {"core", "map"}
    assert first.index("window.JSV") < first.index('src="casebook.js')
    second = stamped("const A = 2;")
    assert second != first
    jsv2 = json.loads(re.search(r"window\.JSV=(\{.*?\});", second).group(1))
    assert jsv2["map"] == jsv["map"] and jsv2["core"] != jsv["core"]  # 바뀐 파일만 새 주소
    assert re.search(r'href="style\.css\?v=[0-9a-f]{10}"', second).group() == \
        re.search(r'href="style\.css\?v=[0-9a-f]{10}"', first).group()


def test_app_js_files_listed_in_index_or_lazy_and_service_worker():
    """화면별 앱 파일(site/js/)은 index.html에 있거나 core.js의 LAZY(나중에 받기)에 있어야 하고, 서비스워커 목록에도 있어야 해요."""
    root = pathlib.Path(__file__).resolve().parent.parent / "site"
    names = {p.stem for p in (root / "js").glob("*.js")}
    index = set(re.findall(r'<script src="js/([a-z]+)\.js"', (root / "index.html").read_text(encoding="utf-8")))
    core = (root / "js" / "core.js").read_text(encoding="utf-8")
    lazy = set(re.findall(r'"([a-z]+)"', re.search(r"const LAZY = (\{.*\});", core).group(1)))
    sw = set(re.findall(r'"([a-z]+)"', re.search(r"const APP_JS = \[(.*)\];", (root / "sw.js").read_text(encoding="utf-8")).group(1)))
    assert not index & lazy
    assert index | lazy == names
    assert sw == names


def test_site_version_changes_only_when_site_files_change(tmp_path):
    (tmp_path / "app.js").write_text("one")
    (tmp_path / "icons").mkdir()
    (tmp_path / "icons" / "icon.svg").write_text("<svg/>")
    before = dashboard.site_version(tmp_path)
    assert dashboard.site_version(tmp_path) == before
    (tmp_path / "app.js").write_text("two")
    assert dashboard.site_version(tmp_path) != before


def test_monthly_ohlc_merges_duplicate_month_rows():
    # 야후 월봉은 이번 달이 두 줄(월초 + 마지막 거래일)로 올 때가 있어요
    idx = pd.to_datetime(["2026-08-01", "2026-09-01", "2026-10-01", "2026-10-02"]).tz_localize("Asia/Seoul")
    h = pd.DataFrame({"Open": [10, 20, 30, 31], "High": [15, 25, 35, 40], "Low": [9, 19, 29, 28],
                      "Close": [14, 24, 34, 39]}, index=idx)
    m = daily.ohlc_payload(daily.monthly_ohlc(h), "%Y-%m")
    assert m == dict(dates=["2026-08", "2026-09", "2026-10"], o=[10, 20, 30], h=[15, 25, 40], l=[9, 19, 28],
                     c=[14, 24, 39])
    # 거래량이 있으면 달별로 더해서 v로 (보조지표 거래량 막대)
    h["Volume"] = [100, 200, 300, 50]
    assert daily.ohlc_payload(daily.monthly_ohlc(h), "%Y-%m")["v"] == [100, 200, 350]


def test_fund_table_keeps_screen_fields_only(tmp_path):
    import dashboard as db
    path = tmp_path / "fundamentals.json"
    path.write_text(json.dumps(dict(stocks={"005930": dict(
        name="삼성전자", per=11.8, loss=False, pbr=3.06, div=0.56, cap=1.5e15, roe=0.12, debt=40.0, financial=False,
        grade=dict(grade="B", score=3, total=4, checks=[]), annual=dict(dates=["2025"]), target=dict(mean=478905.62, n=36),
        events=dict(exdiv="2026-06-29", earn="2026-10-28"))})))
    t = db.fund_table(path)["005930"]
    assert t["grade"] == ["B", 3, 4] and t["target"]["n"] == 36 and t["events"]["earn"] == "2026-10-28"
    assert "annual" not in t and "loss" not in t and "financial" not in t and t["per"] == 11.8
    assert db.fund_table(tmp_path / "없음.json") == {}


def test_fresh_calendar_uses_latest_events_for_big_rows(tmp_path):
    # 달력은 아침에 만들었고, 그 뒤 들어온 다음 주 일정(연준 의장 연설)이 홈 칸과 같게 달력에도 들어가야 해요
    import datetime as dt
    cal = dict(releases=[dict(at="2026-11-17T22:30+09:00", rid=9), dict(at="2026-11-25T22:30+09:00", rid=54)],
               events=[dict(date="2026-11-17", market="us", kind="big", title="미국 소매판매", big=False, note="한국시간 22:30 발표"),
                       dict(date="2026-11-17", market="us", kind="earn", title="홈디포 실적 발표", code="HD"),
                       dict(date="2026-11-25", market="us", kind="big", title="미국 PCE 물가 (연준이 보는 물가)", big=True, note="한국시간 22:30 발표")])
    (tmp_path / "calendar.json").write_text(json.dumps(cal))
    ev = [dict(id="a", at="2026-11-17T02:00+09:00", date="2026-11-17", country="us", flag="🇺🇸", title="Fed Chairman Warsh Speaks",
               ko="연준 의장 연설", group="rate", tier1=False),
          dict(id="b", at="2026-11-17T22:30+09:00", date="2026-11-17", country="us", flag="🇺🇸", title="Retail Sales m/m",
               ko="소매판매 전월 대비", group="growth", tier1=False)]
    (tmp_path / "events.json").write_text(json.dumps(dict(events=ev)))
    got = dashboard.fresh_calendar(tmp_path, dt.date(2026, 11, 15))
    # 규칙 일정(ISM·한국 수출입·FOMC 회의록)은 이 기간 밖이에요
    big = [(e["date"], e["title"], e["big"], e["note"]) for e in got if e["kind"] == "big" and "2026-11-15" <= e["date"] <= "2026-11-30"]
    assert big == [("2026-11-17", "연준 의장 연설", False, "한국시간 02:00 발표"),
                   ("2026-11-17", "소매판매 전월 대비", False, "한국시간 22:30 발표"),
                   ("2026-11-25", "미국 PCE 물가 (연준이 보는 물가)", True, "한국시간 22:30 발표")]
    assert any(e["kind"] == "earn" for e in got)
    assert dashboard.build(tmp_path)["calendar"]


def test_split_learn_moves_learn_only_data_out_of_data_json():
    data = dict(built="2026-11-18T22:00+09:00", markets={}, learn_notes=[1],
                reading=dict(cats=[], items=dict(market=[dict(date="2026-11-18"), dict(date="2026-11-17")],
                                                 invest=[dict(date="2026-11-18"), dict(title="날짜 없음")])),
                learn_cases=dict(kr=[1]), story_log=dict(kr=[2]))
    learn = dashboard.split_learn(data)
    # 공부 화면 전용 자료는 learn.json으로, 홈 '오늘 리포트 N개'는 날짜별 개수만 남아요
    assert set(learn) == {"learn_cases", "reading", "story_log", "v"} and learn["v"] == data["learn_v"]
    assert not any(k in data for k in dashboard.LEARN_KEYS)
    assert data["reading_days"] == {"2026-11-18": 2, "2026-11-17": 1}
    assert data["learn_notes"] == [1]  # 용어 '?' 버튼에 쓰는 노트는 그대로


def test_learn_version_follows_content_not_build_time():
    # 배포 시각만 바뀌면 learn.json 주소(v=)도 그대로라서 폰이 다시 안 받아요 (2026-11-21)
    mk = lambda built, cases: dict(built=built, markets={}, reading={}, learn_cases=cases, story_log={})
    a, b, c = mk("2026-11-21T09:00", {"kr": [1]}), mk("2026-11-21T10:00", {"kr": [1]}), mk("2026-11-21T10:00", {"kr": [2]})
    for x in (a, b, c):
        dashboard.split_learn(x)
    assert a["learn_v"] == b["learn_v"] != c["learn_v"]


def test_split_charts_moves_index_candles_out_of_data_json():
    candles = dict(dates=["2026-11-20"], o=[1], h=[1], l=[1], c=[1], v=[1])
    data = dict(markets=dict(kr=dict(daily=dict(candles=candles, series={"x": 1})), us=dict(daily=None)))
    charts = dashboard.split_charts(data)
    assert charts["markets"] == {"kr": candles} and charts["v"] == data["charts_v"]
    assert "candles" not in data["markets"]["kr"]["daily"] and data["markets"]["kr"]["daily"]["series"] == {"x": 1}
    again = dict(markets=dict(kr=dict(daily=dict(candles=dict(candles)))))
    assert dashboard.split_charts(again)["v"] == charts["v"]  # 내용이 같으면 버전도 같아요
