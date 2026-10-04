import numpy as np
import pandas as pd

import departments as dp
import kr_swing_backtest as kb
import strategy
import kr_swing_signals as ks


def series(values):
    return pd.Series(values, index=pd.bdate_range("2024-01-01", periods=len(values)), dtype=float)


GOOD = dict(returnOnEquity=0.18, debtToEquity=40.0, earningsGrowth=0.12, profitMargins=0.15, trailingPE=11.0,
            sector="Technology")
LOSS = dict(returnOnEquity=-0.05, debtToEquity=220.0, earningsGrowth=-0.4, profitMargins=-0.08, sector="Industrials")


def test_grade_good_and_loss_making():
    g = dp.grade(dp.fundamentals(GOOD))
    assert g["grade"] == "양호" and g["score"] == g["total"] == 5
    bad = dp.grade(dp.fundamentals(LOSS))
    assert bad["grade"] == "주의"
    assert "건너뛰는 것도 방법" in dp.fundamental_line("테스트", bad)


def test_grade_uses_forward_pe_and_skips_bank_debt():
    f = dp.fundamentals(dict(returnOnEquity=0.10, debtToEquity=900.0, forwardPE=6.0, sector="Financial Services"))
    assert f["per_kind"] == "예상 PER"
    g = dp.grade(f)
    assert all("부채비율" not in c for c, _ in g["checks"])  # 은행 부채비율은 빼고 봐요
    assert g["grade"] == "양호"


def test_missing_data_is_not_a_grade():
    g = dp.grade(dp.fundamentals({}))
    assert g["grade"] == "자료 없음"
    assert "판단 보류" in dp.fundamental_line("테스트", g)


def test_breadth_counts_stocks_above_200ma():
    up, down = series(np.linspace(100, 200, 250)), series(np.linspace(200, 100, 250))
    closes = pd.DataFrame({"a": up, "b": up, "c": down, "d": up})
    assert dp.breadth(closes).iloc[-1] == 0.75
    assert pd.isna(dp.breadth(closes).iloc[10])


def test_kr_report_has_six_departments_without_network():
    closes = pd.DataFrame({f"{i:06d}": series(np.linspace(100, 200, 253)) for i in range(6)})
    index_close = series(np.linspace(2000, 3000, 253))
    market = dict(kospi_ok=True)
    picks = [dict(code="005930", name="삼성전자", rsi2=5.0)]
    dp.check_picks(picks, fetch=lambda symbol: GOOD)
    report = dp.kr_report(closes, index_close, market, picks, 5)
    assert [d for d, _ in report] == ["스크리닝부", "기술적 분석부", "펀더멘탈부", "마켓부", "리스크관리부", "운용부"]
    text = "\n".join(dp.report_lines(report))
    assert "삼성전자 양호" in text and "시장 폭 100%" in text and "뉴스" in text


def test_us_report_with_pe():
    index_close = series(np.linspace(4000, 5000, 253))
    us = ks.compute_us(index_close)
    report = dict(dp.us_report(index_close, us, etf_info=dict(trailingPE=28.0)))
    assert "비싼 편" in report["펀더멘탈부"]
    assert "보유/매수" in report["운용부"]


def test_add_departments_survives_failures(monkeypatch):
    monkeypatch.setattr(dp, "fetch_info", lambda symbol: (_ for _ in ()).throw(RuntimeError("down")))
    monkeypatch.setattr(dp, "check_picks", lambda picks: (_ for _ in ()).throw(RuntimeError("down")))
    text, payload = ks.add_departments("신호", dict(picks=[]), "kr", None, None, {}, [])
    assert text == "신호" and "desks" not in payload


def test_kr_rule_pauses_when_breadth_is_narrow():
    """코스피는 오르는데 대형주 대부분이 200일선 아래면 새로 사지 않아요."""
    up, down = series(np.linspace(100, 200, 253)), series(np.linspace(200, 100, 253))
    closes = pd.DataFrame({"a": up, "b": down, "c": down, "d": down})
    index_close = series(np.linspace(2000, 3000, 253))
    market, picks = ks.compute_signals(closes, index_close)
    assert market["trend_ok"] and not market["breadth_ok"] and not market["kospi_ok"]
    assert "시장 폭" in ks.kr_pause_reason(market)


def test_kr_rule_skips_wild_stocks():
    calm = np.linspace(100, 200, 250).tolist() + [190, 180, 172]
    swing = np.array([1.06, 0.95] * 125)  # 날마다 ±5~6% 출렁이며 오르는 종목
    wild = (np.linspace(50, 200, 250) * swing).tolist()
    wild = wild + [wild[-2] * 0.9, wild[-2] * 0.82, wild[-2] * 0.76]
    closes = pd.DataFrame({"005930": series(calm), "000660": series(wild)})
    f = strategy.kr_frames(closes, series(np.linspace(2000, 3000, 253)))
    raw = kb.dip_after_breakout(closes, strategy.broadcast(f["ok"], closes))[0]
    assert raw["000660"].iloc[-1]  # 변동성 조건이 없으면 사는 자리
    assert f["entry"]["005930"].iloc[-1]
    assert not f["entry"]["000660"].iloc[-1]


def test_us_cash_when_volatility_is_high():
    calm = np.linspace(4000, 5000, 240)
    jumpy = calm[-1] * np.cumprod(1 + np.array([0.03, -0.03] * 10))
    index_close = series(list(calm) + list(jumpy))
    us = ks.compute_us(index_close)
    assert us["trend"] and not us["ok"]
    assert "변동성" in ks.us_opinion(us)[0]
