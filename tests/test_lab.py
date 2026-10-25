import pandas as pd

import lab


def test_build_converts_usd_and_skips_bad_fx():
    months = ["2020-01", "2020-02", "2020-03", "2020-04"]
    data = {a[2]: [100.0, 110.0, 99.0, 99.0] for a in lab.ASSETS}
    data["SCHD"] = [None, None, 50.0, 55.0]  # 늦게 상장
    data["KRW=X"] = [1000.0, 1000.0, 0.1, 1100.0]  # 틀린 값(0.1)은 지난달 값으로
    out = lab.build(pd.DataFrame(data, index=months))
    assert out["months"] == ["2020-02", "2020-03", "2020-04"]
    a = {x["k"]: x for x in out["assets"]}
    assert a["kospi"]["r"] == [10.0, -10.0, 0.0]
    assert a["sp500"]["r"] == [10.0, -10.0, 10.0]  # 원화 환산: 99×1000 → 99×1100
    assert a["schd"]["start"] == "2020-04" and a["schd"]["r"][:2] == [None, None]
    assert out["fx"] == [0.0, 0.0, 10.0]
