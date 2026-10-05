import datetime as dt

import numpy as np
import pandas as pd

import kr_swing_signals as ks


def series(values):
    return pd.Series(values, index=pd.bdate_range("2024-01-01", periods=len(values)), dtype=float)


def dip_after_high():
    """250일 꾸준히 오르다 신고가 → 사흘 급락: 마지막 날 조합 신호가 나와야 해요."""
    up = list(np.linspace(100, 200, 250))
    return series(up + [190, 180, 172])


def test_signal_on_dip_after_new_high():
    closes = pd.DataFrame({"005930": dip_after_high(), "000660": series(np.linspace(100, 200, 253))})
    index_close = series(np.linspace(2000, 3000, 253))
    market, picks = ks.compute_signals(closes, index_close)
    assert market["kospi_ok"]
    assert [p["code"] for p in picks] == ["005930"]
    assert picks[0]["name"] == "삼성전자"
    assert picks[0]["rsi2"] < 10


def test_no_new_buys_when_kospi_below_200ma():
    closes = pd.DataFrame({"005930": dip_after_high()})
    index_close = series(np.linspace(3000, 2000, 253))
    market, picks = ks.compute_signals(closes, index_close)
    assert not market["kospi_ok"]
    assert picks == []
    text = ks.format_message(market, picks, 300000, market["day"].date())
    assert "200일선 아래" in text


def test_message_shares_and_stale_note():
    market = dict(day=pd.Timestamp("2026-10-02"), kospi=3000.0, kospi_ma200=2800.0, kospi_ok=True, max_hold=10)
    picks = [dict(code="005930", name="삼성전자", close=50000.0, rsi2=5.0, ma5=52000.0),
             dict(code="000660", name="SK하이닉스", close=200000.0, rsi2=7.0, ma5=210000.0)]
    for p in picks:
        p.update(high20=p["close"] * 1.05, ma200=p["close"] * 0.9, vol20=0.3, days_since_high=4)
    text = ks.format_message(market, picks, 300000, dt.date(2026, 10, 4))
    assert "1주도 못 삼" in text  # 종목당 10% = 3만 원
    assert "손절" in text and "46,500원" in text
    assert "이유: 4거래일 전 20일 신고가" in text and "위험:" in text
    assert "마지막 거래일" in text


def test_split_message_keeps_lines_under_limit():
    text = "\n".join("가" * 30 for _ in range(10))
    parts = ks.split_message(text, limit=100)
    assert all(len(p) <= 100 for p in parts)
    assert "\n".join(parts) == text


def test_kr_opinion_reason_and_risks():
    market = dict(kospi=3000.0, kospi_ma50=2980.0, kospi_ma200=2800.0)
    p = dict(close=88000.0, high20=100000.0, rsi2=4.2, ma200=80000.0, vol20=0.55, days_since_high=3)
    reason, risk = ks.kr_opinion(p, market)
    assert "3거래일 전 20일 신고가" in reason and "-12.0% 눌림" in reason and "RSI2 4" in reason
    assert "큰 편" in risk and "추세 꺾임" in risk and "50일선에 가까워" in risk
    calm = dict(p, close=97000.0, vol20=0.2)
    assert "특별한 경고 없음" in ks.kr_opinion(calm, dict(market, kospi_ma50=2700.0))[1]


def test_days_since_high():
    assert ks.days_since_high(series(list(range(1, 30)) + [25, 24])) == 2


def test_us_trend_states():
    up = series(np.linspace(4000, 6000, 260))
    us = ks.compute_us(up)
    assert us["ok"] and us["was_ok"]
    text = ks.format_us(us, 300, us["day"].date(), etf_close=600.0)
    assert "보유 유지" in text and "150달러" in text and "0.250주" in text
    assert "이유: S&P500이 200일선보다" in text and "청산 기준:" in text and "1년 고점 대비" in text
    down = series(list(np.linspace(4000, 6000, 250)) + list(np.linspace(5900, 4500, 30)))
    us = ks.compute_us(down)
    assert not us["ok"]
    assert "현금 유지" in ks.format_us(us, 300, us["day"].date()) or "매도 신호" in ks.format_us(us, 300, us["day"].date())


def test_us_buy_signal_on_cross():
    us = dict(day=pd.Timestamp("2026-10-02"), spx=6000.0, ma50=5800.0, ma200=5700.0, ok=True, was_ok=False,
              vol20=0.3, from_high=-0.02)
    text = ks.format_us(us, 300, dt.date(2026, 10, 3))
    assert "매수 신호" in text and "평소 15% 안팎보다 커요" in text
    us.update(ok=False, was_ok=True, spx=5600.0)
    text = ks.format_us(us, 300, dt.date(2026, 10, 3))
    assert "매도 신호" in text and "200일선 아래라" in text and "다시 매수 신호" in text


def test_rulebook_section_lists_candidates_with_plan():
    import kr_swing_backtest as kb
    opens, closes, index_close = kb.synthetic(n_stocks=30, seed=1)
    closes.columns = list(kb.UNIVERSE)[:30]
    text, picks = ks.rulebook_section(opens, closes, None, index_close, "kr")
    assert "[규칙표 후보]" in text and "거래량 데이터가 없어서" in text
    for p in picks:
        assert p["opinion"][1].startswith("계획: 내일 시가에 1차 30%")
