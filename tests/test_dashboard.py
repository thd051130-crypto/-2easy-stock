import json
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
    html = '<link rel="stylesheet" href="style.css"><script src="app.js"></script>'

    def stamped(app_js):
        (tmp_path / "index.html").write_text(html)
        (tmp_path / "app.js").write_text(app_js)
        (tmp_path / "style.css").write_text("body{}")
        dashboard.stamp_assets(tmp_path)
        return (tmp_path / "index.html").read_text()

    first = stamped("one")
    assert re.search(r'src="app\.js\?v=[0-9a-f]{10}"', first)
    assert re.search(r'href="style\.css\?v=[0-9a-f]{10}"', first)
    second = stamped("two")
    assert second != first
    assert re.search(r'href="style\.css\?v=[0-9a-f]{10}"', second).group() == \
        re.search(r'href="style\.css\?v=[0-9a-f]{10}"', first).group()


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
