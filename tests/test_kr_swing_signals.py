import datetime as dt
import sys
import types

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
    text = ks.format_message(market, picks, 300000, dt.date(2026, 10, 4), {"005930": "테스트 의견"})
    assert "1주 ≈ 50,000원" in text
    assert "1주도 못 삼" in text
    assert "Claude: 테스트 의견" in text
    assert "마지막 거래일" in text


def test_split_message_keeps_lines_under_limit():
    text = "\n".join("가" * 30 for _ in range(10))
    parts = ks.split_message(text, limit=100)
    assert all(len(p) <= 100 for p in parts)
    assert "\n".join(parts) == text


def test_claude_skipped_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert ks.claude_opinions({}, [{"code": "005930"}]) == {}


def test_claude_opinions_parsed(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    reply = "005930: 신고가 뒤 눌림이에요. 손절 참고선 48,000원.\n- `000660`: 변동성이 커요.\n잡담"

    class Client:
        def __init__(self, **kw):
            self.beta = types.SimpleNamespace(messages=types.SimpleNamespace(create=self.create))

        def create(self, **kw):
            assert kw["model"] == ks.CLAUDE_MODEL
            block = types.SimpleNamespace(type="text", text=reply)
            return types.SimpleNamespace(stop_reason="end_turn", content=[block])

    monkeypatch.setitem(sys.modules, "anthropic", types.SimpleNamespace(Anthropic=Client))
    market = dict(kospi=3000.0, kospi_ma200=2800.0)
    picks = [dict(code=c, name=c, close=1.0, rsi2=1.0, ma5=1.0, ma200=1.0, high20=1.0, recent=[1])
             for c in ("005930", "000660")]
    out = ks.claude_opinions(market, picks)
    assert out == {"005930": "신고가 뒤 눌림이에요. 손절 참고선 48,000원.", "000660": "변동성이 커요."}
