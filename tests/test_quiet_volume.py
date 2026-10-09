import numpy as np
import pandas as pd

import quiet_volume as q


def frame(n=60, seed=2):
    """A: 주가 그대로·거래량 3배, B: 거래량 3배인데 주가 +10%, C: 평소대로, D: 오늘 시세 없음."""
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2026-07-01", periods=n)
    closes = pd.DataFrame({k: 100 * np.exp(np.cumsum(rng.normal(0, 0.002, n))) for k in "ABCD"}, index=idx)
    closes.iloc[-5:, 1] *= np.linspace(1.02, 1.10, 5)
    closes.iloc[-1, 3] = np.nan
    vol = pd.DataFrame(1000.0, index=idx, columns=closes.columns)
    vol.iloc[-5:, [0, 1, 3]] = 3000.0
    vol.iloc[-2, 0] = 5000.0
    return closes, vol


def test_finds_flat_price_with_volume_spike():
    closes, vol = frame()
    out = q.compute(closes, vol, {"A": "에이"})
    assert [r["code"] for r in out["rows"]] == ["A"]
    a = out["rows"][0]
    assert a["name"] == "에이" and a["ratio"] == 3.4 and a["peak"] == 5.0 and abs(a["r5"]) <= 0.03
    assert out["total"] == 1 and out["count"] == 3
    text = q.section(out, "국장")
    assert "[거래량만 급증 · 참고]" in text and "1. 에이 거래량 3.4배 (가장 많은 날 5.0배)" in text
    assert q.summary_line(out).startswith("🔍 주가 그대로·거래량 급증: 에이 ×3.4(")


def test_empty_and_missing_volume():
    closes, vol = frame()
    calm = vol.copy()
    calm[:] = 1000.0
    out = q.compute(closes, calm)
    assert out["rows"] == [] and "조건에 맞는 종목이 없어요" in q.section(out, "미장")
    assert q.summary_line(out) is None
    assert q.compute(closes, None)["rows"] == []
