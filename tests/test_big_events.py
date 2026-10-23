import datetime as dt
import json

import numpy as np
import pandas as pd

import big_events as be
import econ_calendar as ec

KST = be.KST
FF = [
    {"title": "CPI y/y", "country": "USD", "date": "2026-10-14T08:30:00-04:00", "impact": "High", "forecast": "3.6%", "previous": "3.4%"},
    {"title": "CPI m/m", "country": "USD", "date": "2026-10-14T08:30:00-04:00", "impact": "High", "forecast": "0.6%", "previous": "0.4%"},
    {"title": "Core CPI m/m", "country": "USD", "date": "2026-10-14T08:30:00-04:00", "impact": "High", "forecast": "0.2%", "previous": "0.3%"},
    {"title": "Fed Chairman Warsh Speaks", "country": "USD", "date": "2026-10-15T23:30:00-04:00", "impact": "High", "forecast": "", "previous": ""},
    {"title": "Employment Change", "country": "AUD", "date": "2026-10-14T20:30:00-04:00", "impact": "High", "forecast": "19.6K", "previous": "39.5K"},
    {"title": "BOJ Policy Rate", "country": "JPY", "date": "2026-10-29T23:00:00-04:00", "impact": "High", "forecast": "0.75%", "previous": "0.75%"},
    {"title": "Building Permits", "country": "USD", "date": "2026-10-14T08:30:00-04:00", "impact": "Medium", "forecast": "", "previous": ""},
]
MONTHS = pd.to_datetime(["2025-08-01", "2025-09-01", "2025-11-01", "2026-07-01", "2026-08-01"])


def cpi(after_release):
    """2025-10은 빠진(셧다운) 달. 발표 뒤엔 2026-09 값이 붙어요."""
    s = pd.Series([323.291, 324.245, 325.063, 332.813, 334.131], MONTHS)
    if after_release:
        s = pd.concat([s, pd.Series([336.298], pd.to_datetime(["2026-09-01"]))])
    return s


def news(q, lang="en", days=1, n=2):
    return [dict(title=f"news {q}", source="Wire", date="2026-10-14", link="")][:n]


def bars_flat(sym):
    idx = pd.date_range("2026-10-14 21:00", periods=20, freq="5min", tz=KST)
    return pd.DataFrame({"Close": np.linspace(100, 100.5, 20)}, idx)


def test_parse_ff_keeps_us_high_and_foreign_rates_only():
    got = be.parse_ff(FF)
    assert [e["title"] for e in got] == ["CPI y/y", "CPI m/m", "Core CPI m/m", "Fed Chairman Warsh Speaks", "BOJ Policy Rate"]
    cpi_e = got[0]
    assert cpi_e["at"] == "2026-10-14T21:30+09:00" and cpi_e["tier1"] and cpi_e["ko"] == "소비자물가(CPI) 1년"
    assert got[3]["ko"] == "연준 의장 연설" and got[4]["flag"] == "🇯🇵"


def test_calc_uses_dates_when_a_month_is_missing():
    last, mm = be.calc(cpi(True), "m")
    assert last == "2026-09-01" and round(mm, 1) == 0.6
    _, yy = be.calc(pd.concat([cpi(True), pd.Series([0.0], pd.to_datetime(["2025-10-01"]))]).drop(pd.Timestamp("2025-10-01")), "y")
    assert round(yy, 1) == 3.7  # 13칸 전(2025-08)이 아니라 2025-09와 비교
    assert be.calc(pd.Series([1.0, 2.0], pd.to_datetime(["2025-09-01", "2025-11-01"])), "m") is None


def test_surprise_and_number():
    assert be.surprise("3.7%", "3.6%") == "예상보다 높음"
    assert be.surprise("0.6%", "0.6%") == "예상과 같음"
    assert be.surprise("120K", "1.2M") == "예상보다 낮음"
    assert be.surprise("0.3%", "") is None


def test_step_sends_pre_then_waits_then_result():
    data = {}
    fred_before = {"CPIAUCSL": cpi(False), "CPIAUCNS": cpi(False), "CPILFESL": cpi(False)}
    # 하루 전 오후: 예고 한 번, FRED 마지막 관측일을 적어 둬요
    out, data = be.step(data, dt.datetime(2026, 10, 13, 16, 7, tzinfo=KST), FF, get=fred_before.get, bars_of=bars_flat, news=news)
    assert len(out) == 1 and out[0][0].startswith("[큰 발표 예고]") and "예상 3.6%" in out[0][0]
    cpi_e = next(e for e in data["events"] if e["title"] == "CPI y/y")
    assert cpi_e["base"] == "2026-08-01"
    out, data = be.step(data, dt.datetime(2026, 10, 13, 16, 22, tzinfo=KST), FF, get=fred_before.get, bars_of=bars_flat, news=news)
    assert out == []  # 두 번 안 보내요
    # 1시간 전: 1급 발표라 한 번 더
    out, data = be.step(data, dt.datetime(2026, 10, 14, 20, 37, tzinfo=KST), FF, get=fred_before.get, bars_of=bars_flat, news=news)
    assert [t.split("]")[0] for t, _ in out] == ["[곧 발표"]
    # 발표 20분 뒤인데 FRED에 아직 새 값이 없으면 기다려요
    out, data = be.step(data, dt.datetime(2026, 10, 14, 21, 52, tzinfo=KST), FF, get=fred_before.get, bars_of=bars_flat, news=news)
    assert out == []
    fred_after = {k: cpi(True) for k in fred_before}
    out, data = be.step(data, dt.datetime(2026, 10, 14, 22, 7, tzinfo=KST), FF, get=fred_after.get, bars_of=bars_flat, news=news)
    text = out[0][0]
    assert text.startswith("[발표 결과]") and "실제 3.7% · 예상 3.6% · 이전 3.4% → 예상보다 높음" in text
    assert "실제 0.6% · 예상 0.6%" in text and "예상과 같음" in text and "S&P500 선물 +" in text
    out, data = be.step(data, dt.datetime(2026, 10, 14, 22, 22, tzinfo=KST), FF, get=fred_after.get, bars_of=bars_flat, news=news)
    assert out == []


def test_no_fred_series_gives_news_only_result_and_night_is_silent():
    data = {}
    now = dt.datetime(2026, 10, 16, 12, 50, tzinfo=KST)  # 연설(12:30) 20분 뒤
    out, data = be.step(data, now, FF[3:4], get=lambda s: None, bars_of=lambda s: None, news=news)
    assert len(out) == 1 and "[발표 결과]" in out[0][0] and "뉴스 제목으로" in out[0][0] and out[0][1] is False


def test_pre_waits_until_morning():
    ff = [dict(FF[0], date="2026-10-15T14:00:00-04:00")]  # 한국 10-16 03:00
    out, data = be.step({}, dt.datetime(2026, 10, 15, 1, 7, tzinfo=KST), ff, get=lambda s: None, bars_of=lambda s: None, news=news)
    assert out == []
    out, data = be.step(data, dt.datetime(2026, 10, 15, 7, 7, tzinfo=KST), ff, get=lambda s: None, bars_of=lambda s: None, news=news)
    assert out[0][0].startswith("[큰 발표 예고]")


def test_shock_once_per_direction():
    now = dt.datetime(2026, 10, 14, 23, 0, tzinfo=KST)
    idx = pd.date_range(now - dt.timedelta(minutes=90), now, freq="5min")
    drop = pd.DataFrame({"Close": np.r_[np.full(8, 100.0), np.linspace(100, 98.5, len(idx) - 8)]}, idx)
    bars = lambda s: drop if s == "NQ=F" else None
    out, data = be.step({}, now, [], get=lambda s: None, bars_of=bars, news=news)
    assert len(out) == 1 and out[0][0].startswith("[지수 급변]") and "나스닥 선물 -1.5% (급락)" in out[0][0]
    out, data = be.step(data, now + dt.timedelta(minutes=15), [], get=lambda s: None, bars_of=bars, news=news)
    assert out == []
    closed = lambda s: drop if s == "NQ=F" else None
    out, _ = be.step({}, now + dt.timedelta(hours=2), [], get=lambda s: None, bars_of=closed, news=news)
    assert out == []  # 마지막 봉이 오래됐으면(장 닫힘) 안 봐요


def test_shock_news_matches_market():
    heads = {"코스피 급락": ["코스피 2% 급락, 외국인 매도", "대만 태풍 상륙", "SEC 규제 강화"],
             "stocks fall S&P 500 Nasdaq": ["SEC weighs new rule", "Nasdaq futures slide on chip selloff"]}
    fetch = lambda q, lang, days, n: [dict(title=t, source="W") for t in heads.get(q, [])][:n]  # noqa: E731
    kr = be.shock_news([dict(symbol="^KS11", way="down")], fetch)
    assert [h["title"] for h in kr] == ["코스피 2% 급락, 외국인 매도"]
    us = be.shock_news([dict(symbol="NQ=F", way="down"), dict(symbol="ES=F", way="down")], fetch)
    assert [h["title"] for h in us] == ["Nasdaq futures slide on chip selloff"]


def test_merge_keeps_sent_marks_and_drops_moved_future():
    now = dt.datetime(2026, 10, 13, 12, 0, tzinfo=KST)
    first = be.merge([], be.parse_ff(FF[:1]), now)
    first[0]["pre"] = "x"
    again = be.merge(first, be.parse_ff([dict(FF[0], forecast="3.7%")]), now)
    assert again[0]["pre"] == "x" and again[0]["forecast"] == "3.7%"
    moved = be.merge(first, be.parse_ff([dict(FF[0], date="2026-10-15T08:30:00-04:00")]), now)
    assert len(moved) == 1 and moved[0]["date"] == "2026-10-15"


def test_run_writes_and_calendar_shows_big(tmp_path, monkeypatch):
    monkeypatch.setattr(be, "fetch_ff", lambda: FF)
    monkeypatch.setattr(be, "fred", lambda s: None)
    monkeypatch.setattr(be, "intraday", lambda s: None)
    import movers
    monkeypatch.setattr(movers, "google_news", news)
    sent = []
    assert be.run(tmp_path, send=lambda t, silent: sent.append(t), now=dt.datetime(2026, 10, 13, 16, 7, tzinfo=KST))
    assert sent and json.loads((tmp_path / "events.json").read_text())["events"]
    ev = ec.build(dt.date(2026, 10, 12), [dict(date="2026-10-28", sep=False)], [], tmp_path)
    big = [e for e in ev if e["kind"] == "big"]
    assert big[0]["date"] == "2026-10-14" and big[0]["big"] and "CPI" in big[0]["title"] and "21:30" in big[0]["note"]
    text = ec.week_text(ev, dt.date(2026, 10, 12))
    assert "🚨" in text and "21:30" in text
