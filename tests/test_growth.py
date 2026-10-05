"""고장 감시, ETF 계좌, 실전 전환 판정, 실적 시즌, 넓은 범위 후보, 텔레그램 새 명령(오늘·계좌·종목·메모) 테스트."""

import datetime as dt
import json

import numpy as np
import pandas as pd

import bot as botmod
import commands
import dashboard
import etf_backtest as etfb
import health
import paper_trade as pt
import readiness
import strategy
import track
import wide


def closes_frame(n=300, cols=("A", "B", "C", "D"), start="2025-01-01"):
    idx = pd.bdate_range(start, periods=n)
    return pd.DataFrame({c: 100 + np.arange(n) * 0.1 + i for i, c in enumerate(cols)}, index=idx)


# ---------------------------------------------------------------- 고장 감시

def test_check_data_stops_when_many_stocks_missing():
    c = closes_frame()
    c.loc[c.index[-1], ["A", "B"]] = np.nan  # 마지막 날 절반이 빠짐
    idx = c["C"]
    errors, _ = health.check_data(c, idx, ["A", "B", "C", "D"], c.index[-1].date())
    assert errors and "4개 중 2개" in errors[0]


def test_check_data_warns_on_few_missing_jumps_and_stale_index():
    c = closes_frame(cols=[f"S{i}" for i in range(10)])
    c.loc[c.index[-1], "S0"] = np.nan
    c.loc[c.index[-1], "S1"] = c["S1"].iloc[-2] * 1.5
    errors, warnings = health.check_data(c, c["S2"], list(c.columns), c.index[-1].date() + dt.timedelta(days=10),
                                         {"S0": "가", "S1": "나"})
    assert not errors
    text = " ".join(warnings)
    assert "가" in text and "나 +50%" in text and "평일" in text


def test_failure_message_and_weekly_summary():
    msg = health.failure_message("swing-signals", "https://x/1", "ETF 계좌", "야후 오류")
    assert msg.startswith("[고장] 매매 신호") and "ETF 계좌" in msg and "야후 오류" in msg
    runs = {"swing-signals": [dict(conclusion="success")] * 10,
            "telegram-bot": [dict(conclusion="success"), dict(conclusion="failure", created_at="2026-10-01T00:00:00Z")],
            "learner": [dict(conclusion="success")] * 5}
    r = health.summarize(runs, dt.datetime(2026, 10, 4, 10, tzinfo=health.KST))
    ok = {w["workflow"]: w["ok"] for w in r["workflows"]}
    assert ok == {"swing-signals": True, "telegram-bot": False, "learner": False} and r["ok"] is False
    assert "확인 필요" in health.weekly_message(r)


def test_record_error_appends(tmp_path):
    path = tmp_path / "e.txt"
    health.record_error("하나", path)
    health.record_error("둘", path)
    assert path.read_text(encoding="utf-8") == "하나\n둘\n"


# ---------------------------------------------------------------- 실적 시즌

def test_earnings_season_blocks_new_kr_buys():
    days = pd.DatetimeIndex(["2026-01-19", "2026-01-20", "2026-02-15", "2026-02-16", "2026-10-25"])
    assert strategy.earnings_season(days).tolist() == [False, True, True, False, True]
    assert strategy.season_end(pd.Timestamp("2026-10-25")) == pd.Timestamp("2026-11-14")
    assert strategy.season_end(pd.Timestamp("2026-12-01")) is None
    c = closes_frame(n=400)
    on = strategy.kr_frames(c, c.mean(axis=1))
    off = strategy.kr_frames(c, c.mean(axis=1), earnings_pause=False)
    season = strategy.earnings_season(c.index)
    assert not on["ok"][season].any() and off["ok"][season].any()


# ---------------------------------------------------------------- ETF 계좌

def test_us_signal_moves_to_next_korean_day():
    us = pd.Series([1.0, 2.0, 3.0], index=pd.DatetimeIndex(["2026-10-01", "2026-10-02", "2026-10-05"]))
    kr = pd.DatetimeIndex(["2026-10-02", "2026-10-05", "2026-10-06"])
    # 국장 10-02엔 뉴욕 10-01 종가, 10-05(월)엔 10-02(금), 10-06엔 10-05 종가까지만 알아요
    assert etfb.us_on_kr_days(us, kr).tolist() == [1.0, 2.0, 3.0]


def test_etf_paper_account_buys_tiger_when_sp500_trend_is_up(tmp_path):
    n = 260
    days = pd.bdate_range("2025-01-01", periods=n)
    rows = []
    for i, d in enumerate(days):
        rows.append(dict(date=d, ticker=etfb.US_ETF, open=20000 + i * 10, close=20000 + i * 10, volume=1))
        rows.append(dict(date=d, ticker="^KS11", open=3000, close=3000 + i, volume=0))
        rows.append(dict(date=d - pd.Timedelta(days=1), ticker="^GSPC", open=5000, close=5000 + i * 5, volume=0))
    path = tmp_path / "etf.csv"
    pd.DataFrame(rows).to_csv(path, index=False)
    opens, closes, kospi, spx = etfb.load_live(path)
    state = pt.new_state("kr", 700000, fractional=False)
    state["rule"] = "etf"
    state["last_day"] = str(days[-3].date())
    _, rows_out, events = pt.advance(state, opens, closes, kospi, f=etfb.live_frames(closes, kospi, spx),
                                     cost=etfb.COST, names=etfb.NAMES, exit_reason="S&P500 추세 꺾임")
    assert len(rows_out) == 2 and any("매수 TIGER 미국S&P500" in e for e in events)
    pos = state["positions"][0]
    assert float(pos["qty"]).is_integer() and pos["cost"] <= 700000 * etfb.WEIGHT
    assert pt.title(state) == "ETF(원화)"


# ---------------------------------------------------------------- 실전 전환 판정

def test_readiness_gates():
    health_ok = dict(workflows=[dict(label="x", ok=True)])
    r = readiness.evaluate("kr", 70, -0.02, 12, health_ok)
    assert r["ready"] and "소액" in r["verdict"]
    r = readiness.evaluate("kr", 30, -0.02, 3, None)
    assert not r["ready"] and [c["label"] for c in r["checks"] if not c["ok"]] == ["기간", "거래 수", "고장"]
    r = readiness.evaluate("us", 90, -0.30, 0, health_ok)
    assert not r["ready"] and "낙폭" in r["verdict"] and len(r["checks"]) == 3  # 미장은 거래 수를 안 봐요
    assert readiness.lines(r)[0].startswith("[실전 전환 판정 · 미장")


def test_dashboard_total_in_won():
    markets = dict(kr=dict(account=dict(equity=700000, cash=700000, capital=700000)),
                   us=dict(account=dict(equity=550, cash=300, capital=500)))
    t = dashboard.total_assets(markets, None, 1400.0)
    assert t["equity"] == 700000 + 770000 and t["capital"] == 700000 + 700000
    assert t["usd_share"] == round(770000 / 1470000, 4) and t["cash_share"] == round((700000 + 420000) / 1470000, 4)
    assert dashboard.total_assets(markets, None, None) is None


# ---------------------------------------------------------------- 넓은 범위 후보

def test_wide_universe_top_common_stocks_outside_alert_list():
    rows = [["005930", "삼성전자", "KS", "s", ""], ["005935", "삼성전자우", "KS", "s", ""],
            ["012450", "한화에어로스페이스", "KS", "s", ""], ["005387", "현대자동차2우B", "KS", "s", ""],
            ["247540", "에코프로비엠", "KQ", "s", ""], ["069500", "KODEX 200", "KS", "e", ""]]
    assert wide.universe(n=10, rows=rows) == {"012450": "한화에어로스페이스"}


def test_track_keeps_wide_picks_as_their_own_source():
    payload = dict(day="2026-10-05", picks=[], rulebook=[], wide=[dict(code="012450", name="한화에어로", close=10.0)])
    rows = track.today_rows("kr", payload)
    assert rows == [dict(src="wide", code="012450", name="한화에어로", close=10.0, date="2026-10-05", replay=0)]


# ---------------------------------------------------------------- 텔레그램 새 명령

def make_bot(tmp_path, price=100.0):
    rows = {"kr": [["005930", "삼성전자", "KS", "s", ""], ["035720", "카카오", "KS", "s", ""]], "us": []}
    return botmod.Bot(paper=tmp_path, rows=rows, last_price=lambda s: price,
                      now=lambda: dt.datetime(2026, 10, 5, 12, tzinfo=botmod.KST))


def test_memo_add_list_delete_and_save(tmp_path):
    b = make_bot(tmp_path)
    assert "메모 1번: 삼성전자 산다" in b.handle("메모 삼성전자 산다 반도체 회복")
    assert "메모 2번: 카카오 안 산다" in b.handle("메모 카카오 안 산다")
    assert "이렇게 보내" in b.handle("메모 삼성전자")
    items = b.memos["items"]
    assert [(x["code"], x["view"], x["note"]) for x in items] == [("005930", 1, "반도체 회복"), ("035720", -1, "")]
    assert "1. 10-05 삼성전자 산다" in b.handle("메모 목록")
    assert b.save() and json.loads((tmp_path / "memos.json").read_text())["next"] == 3
    assert "1개를 지웠어요" in b.handle("메모 삭제 2")


def test_memo_score_and_refresh():
    memos = dict(items=[dict(date="2026-01-02", symbol="X", price=100.0, view=1),
                        dict(date="2026-01-02", symbol="X", price=100.0, view=-1)])
    close = pd.Series(np.linspace(101, 130, 30), index=pd.bdate_range("2026-01-01", periods=30))
    commands.refresh_prices(memos, fetch=lambda s: close)
    assert memos["items"][0]["ret20"] == round(close.iloc[21] / 100 - 1, 4)
    s = commands.score(memos["items"])
    assert s["n"] == 2 and s["hit"] == 0.5 and s["buys"] == 1 and s["skips"] == 1
    assert "2개 중 50% 맞힘" in commands.memo_report(memos)


def test_report_week_only_friday_evening_once():
    memos = dict(items=[{}], last_report=None)
    fri = dt.datetime(2026, 10, 9, 18, 7)
    assert commands.report_week(memos, fri) == "2026-W41"
    assert commands.report_week(dict(memos, last_report="2026-W41"), fri) is None
    assert commands.report_week(memos, fri.replace(hour=17)) is None


def test_today_and_accounts_and_diagnose(tmp_path):
    (tmp_path / "kr").mkdir()
    (tmp_path / "kr" / "signal.json").write_text(json.dumps(dict(
        day="2026-10-02", ok=True, picks=[dict(code="005930", name="삼성전자", close=276000, stop=262200)],
        wide=[dict(name="한화에어로스페이스")], usdkrw=1400)))
    b = make_bot(tmp_path)
    text = b.handle("오늘 국장")
    assert "매수 후보 1개" in text and "삼성전자 종가 276,000원" in text and "넓은 범위(참고): 한화에어로스페이스" in text
    assert "아직 첫 기록 전" in b.handle("계좌")
    close = pd.Series(np.linspace(100, 200, 300), index=pd.bdate_range("2025-01-01", periods=300))
    text = commands.diagnose(b, "삼성전자", fetch=lambda s: close, earnings=lambda s, d: "실적: 10-28 발표 예정 (23일 뒤)")
    assert "200일선" in text and "오늘 알림 규칙 매수 후보" in text and "실적: 10-28" in text
    assert "그 말은 몰라서" in b.handle("아무말")
