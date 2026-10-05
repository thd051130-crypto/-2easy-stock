import json

import numpy as np
import pandas as pd
import pytest

import fundamentals as fu


def statement(cols, rows):
    """야후 재무제표 모양: 행 = 항목, 열 = 기간 끝 날짜 (최근 기간이 앞)."""
    idx = pd.to_datetime(cols)
    return pd.DataFrame(rows, index=idx).T


def test_series_oldest_first_and_drops_empty_periods():
    t = statement(["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"], {
        "Total Revenue": [400.0, 300.0, np.nan, 200.0, 100.0],
        "Operating Income": [40.0, 30.0, np.nan, -5.0, 10.0],
        "Net Income": [1.0, 1.0, np.nan, 1.0, 1.0],
        "Net Income Common Stockholders": [35.0, 25.0, np.nan, -8.0, 9.0],
    })
    s = fu.series(t, 4, "%Y")
    # 최근 4개 기간 중 값이 하나도 없는 2023년은 빠져요. 순이익은 지배주주 몫을 먼저 써요
    assert s == dict(dates=["2022", "2024", "2025"], revenue=[200.0, 300.0, 400.0], op=[-5.0, 30.0, 40.0],
                     net=[-8.0, 25.0, 35.0])
    assert fu.series(None, 4, "%Y") is None
    assert fu.series(pd.DataFrame(), 4, "%Y") is None


def test_series_without_operating_income_row():
    t = statement(["2026-06-30", "2026-03-31"], {"Total Revenue": [10.0, 9.0], "Net Income": [2.0, 1.5]})
    s = fu.series(t, 6, "%Y-%m")
    assert s["dates"] == ["2026-03", "2026-06"] and s["op"] == [None, None] and s["net"] == [1.5, 2.0]


def test_ttm_needs_four_consecutive_quarters():
    q = dict(dates=["2025-06", "2025-09", "2025-12", "2026-03", "2026-06"], net=[1.0, 2.0, 3.0, 4.0, 5.0])
    assert fu.ttm(q, "net") == 14.0
    assert fu.ttm(dict(q, dates=["2025-03", "2025-06", "2025-12", "2026-03", "2026-06"]), "net") is None  # 9월 분기가 빠짐
    assert fu.ttm(dict(q, net=[1.0, 2.0, None, 4.0, 5.0]), "net") is None
    assert fu.ttm(dict(dates=["2026-03", "2026-06"], net=[1.0, 2.0]), "net") is None
    assert fu.ttm(None, "net") is None


QUARTERLY = dict(dates=["2025-09", "2025-12", "2026-03", "2026-06"], revenue=[100.0] * 4, op=[10.0] * 4,
                 net=[25.0, 25.0, 25.0, 25.0])


def test_summarize_computes_per_pbr_when_yahoo_leaves_them_out():
    # 한국 종목처럼 trailingPE·priceToBook이 비어 있으면 시가총액 ÷ 최근 4분기 순이익, ÷ 자본총계
    info = dict(marketCap=1000.0, forwardPE=3.9, returnOnEquity=0.12, debtToEquity=40.0, dividendYield=1.37)
    r = fu.summarize("kr", "005930", info, None, QUARTERLY, equity=500.0)
    assert r["name"] == "삼성전자" and r["per"] == 10.0 and r["pbr"] == 2.0 and not r["loss"]
    assert r["fwd_per"] == 3.9 and r["div"] == 1.37 and r["roe"] == 0.12
    assert ["PER 10.0배", True] in r["grade"]["checks"]  # 등급도 화면에 보이는 PER로
    json.dumps(r, allow_nan=False)


def test_summarize_uses_yahoo_values_when_sane_and_flags_losses():
    r = fu.summarize("us", "AAPL", dict(marketCap=1000.0, trailingPE=30.0, priceToBook=40.0), None, QUARTERLY, 500.0)
    assert (r["per"], r["pbr"]) == (30.0, 40.0)
    # 야후가 단위를 틀리게 준 PBR(0.001배)은 재무제표로 다시 계산해요
    r = fu.summarize("us", "BRK-B", dict(marketCap=1000.0, trailingPE=12.0, priceToBook=0.001), None, QUARTERLY, 800.0)
    assert r["pbr"] == 1.25
    # 적자면 PER 대신 적자 표시
    loss = dict(QUARTERLY, net=[-5.0, -5.0, 1.0, 2.0])
    r = fu.summarize("kr", "000660", dict(marketCap=1000.0), None, loss, None)
    assert r["per"] is None and r["loss"] and r["pbr"] is None
    # 분기가 모자라면 지난 회계연도 순이익으로
    annual = dict(dates=["2024", "2025"], revenue=[1.0, 2.0], op=[None, None], net=[40.0, 50.0])
    r = fu.summarize("kr", "105560", dict(marketCap=1000.0), annual, None, None)
    assert r["per"] == 20.0


def test_update_keeps_last_value_when_a_stock_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(fu.time, "sleep", lambda s: None)
    path = tmp_path / "kr" / "fundamentals.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(dict(stocks={"000660": dict(code="000660", per=7.0)})))

    def fetch(market, code):
        if code == "000660":
            raise ValueError("야후 막힘")
        return dict(code=code, per=10.0)

    got, failed = fu.update(path, "kr", ["005930", "000660", "035420"], fetch=fetch)
    saved = json.loads(path.read_text())["stocks"]
    assert got == 2 and failed == ["000660"]
    assert saved["000660"]["per"] == 7.0 and saved["005930"]["per"] == 10.0 and set(saved) == {"005930", "000660", "035420"}


def test_stocks_include_spy_for_us_only():
    assert "SPY" in fu.stocks("us") and "SPY" not in fu.stocks("kr")
    assert fu.symbol("kr", "005930") == "005930.KS" and fu.symbol("us", "BRK-B") == "BRK-B"


@pytest.mark.parametrize("x, want", [("1.5", 1.5), (None, None), (float("nan"), None), ("abc", None), (float("inf"), None)])
def test_num(x, want):
    assert fu.num(x) == want
