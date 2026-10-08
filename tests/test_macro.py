import json

import numpy as np
import pandas as pd

import dashboard
import kr_swing_backtest as kb
import kr_swing_signals as ks
import macro


def frame(n=400, **over):
    """평온한 시장: 금리차 +1%p, 유가·환율·신용·구리 그대로, VIX 15."""
    idx = pd.bdate_range("2024-01-01", periods=n)
    base = {"^TNX": 4.0, "^IRX": 3.0, "CL=F": 70.0, "KRW=X": 1300.0, "HG=F": 4.0, "GC=F": 2000.0,
            "HYG": 80.0, "IEF": 95.0, "^VIX": 15.0}
    d = pd.DataFrame({k: np.full(n, v) for k, v in base.items()}, index=idx)
    for k, v in over.items():
        d[k] = v(d[k].to_numpy()) if callable(v) else v
    return d


def ramp(end_mult, days):
    def f(x):
        x = x.copy()
        x[-days:] = x[-days:] * np.linspace(1, end_mult, days)
        return x
    return f


def test_calm_market_is_expansion():
    d = frame()
    assert macro.score(d).iloc[-1] == 0
    snap = macro.snapshot(d)
    assert snap["regime"] == "확장" and snap["score"] == 0 and snap["total"] == 7
    assert not any(s["warn"] for s in snap["signals"])


def test_each_warning_fires():
    d = frame(**{"^IRX": 7.0, "CL=F": ramp(1.8, 200), "KRW=X": ramp(1.08, 40), "^VIX": 30.0,
                 "HYG": ramp(0.9, 60), "HG=F": ramp(0.8, 60), "^TNX": ramp(1.5, 100)})
    w = macro.warnings(d).iloc[-1]
    assert w.all(), w[~w]
    snap = macro.snapshot(d)
    assert snap["regime"] == "위축 경고" and snap["score"] == 7


def test_regime_thresholds():
    assert [macro.regime_of(n) for n in (0, 1, 2, 3, 4, 7)] == ["확장", "확장", "둔화", "둔화", "위축 경고", "위축 경고"]


def test_near_marks_without_warning():
    d = frame(**{"^IRX": 3.85})  # 금리차 +0.15%p: 아직 역전은 아니지만 가까움
    snap = macro.snapshot(d)
    inv = next(s for s in snap["signals"] if s["key"] == "inversion")
    assert inv["near"] and not inv["warn"]
    assert "🟡 장단기 금리 역전" in macro.format_report(snap)


def test_missing_symbol_is_not_a_warning():
    d = frame().drop(columns=["HYG"])
    assert macro.warnings(d)["credit"].sum() == 0
    assert "자료 없음" in macro.snapshot(d)["signals"][4]["now"]


def test_us_economy_rows_from_fred():
    months = pd.date_range("2025-01-01", periods=21, freq="MS")
    data = {"UNRATE": pd.Series(np.r_[np.full(18, 3.9), 4.1, 4.3, 4.5], months),
            "SAHMREALTIME": pd.Series([0.2, 0.6], months[-2:]),
            "CPIAUCSL": pd.Series(np.linspace(300, 312, 21), months),
            "ICSA": None}
    rows = macro.us_economy(lambda s: data[s])
    keys = {r["key"]: r for r in rows}
    assert set(keys) == {"unrate", "sahm", "cpi"}
    assert keys["unrate"]["warn"] and keys["sahm"]["warn"]
    assert macro.us_economy(lambda s: None) == []


def test_should_send_on_report_or_regime_change():
    snap = macro.snapshot(frame())
    assert macro.should_send(snap, None, True)
    assert not macro.should_send(snap, None, False)
    assert not macro.should_send(snap, {"regime": "확장"}, False)
    assert macro.should_send(snap, {"regime": "둔화"}, False)


def test_risk_line_joins_department_report():
    snap = macro.snapshot(frame())
    report = [("마켓부", "코스피 상승 추세"), ("리스크관리부", "종목당 10%")]
    out = ks.with_macro(report, snap)
    assert out[0] == report[0]
    assert out[1][1].startswith("종목당 10%. 경기 확장(경고 0/7)")
    assert ks.with_macro(report, None) == report


def test_dashboard_reads_macro(tmp_path):
    snap = macro.snapshot(frame())
    (tmp_path / "macro.json").write_text(json.dumps(snap, ensure_ascii=False))
    assert dashboard.build(tmp_path)["macro"]["regime"] == "확장"
    assert dashboard.build(tmp_path / "없음")["macro"] is None


def test_simulate_accepts_daily_weight():
    opens, closes, index_close = kb.synthetic(n_stocks=5)
    entry = pd.DataFrame(True, closes.index, closes.columns)
    exit_ = pd.DataFrame(False, closes.index, closes.columns)
    rank = pd.DataFrame(0.0, closes.index, closes.columns)
    fixed, *_ = kb.simulate(opens, closes, entry, exit_, rank, 5, kb.COSTS["기본"], weight=0.1)
    same, *_ = kb.simulate(opens, closes, entry, exit_, rank, 5, kb.COSTS["기본"],
                           weight=pd.Series(0.1, closes.index))
    assert np.allclose(fixed, same)
    half, exposure, *_ = kb.simulate(opens, closes, entry, exit_, rank, 5, kb.COSTS["기본"],
                                     weight=pd.Series(0.05, closes.index))
    assert exposure < 0.3
