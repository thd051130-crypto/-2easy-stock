import numpy as np
import pandas as pd

import fundcheck as dp
import marketdata as md


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
    assert md.breadth(closes).iloc[-1] == 0.75
    assert pd.isna(md.breadth(closes).iloc[10])
