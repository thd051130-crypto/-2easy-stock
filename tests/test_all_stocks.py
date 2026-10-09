import json

import pandas as pd

import all_stocks as al


def yahoo(days, freq="B", start=100.0):
    idx = pd.date_range("2025-01-01", periods=days, freq=freq, tz="Asia/Seoul")
    c = [start + i for i in range(days)]
    return pd.DataFrame({"Open": c, "High": [x + 2 for x in c], "Low": [x - 1 for x in c], "Close": c,
                         "Volume": [1000.0] * days}, index=idx)


def test_build_writes_lite_files_and_quotes(tmp_path):
    rows = [["083650", "비에이치아이", "KQ", "s", "BHI"], ["005930", "삼성전자", "KS", "s", ""], ["999999", "없는종목", "KS", "s", ""]]
    asked = []

    def fetch(tickers, interval, period):
        asked.append((tuple(tickers), interval, period))
        if interval == "1d":
            return {"083650.KQ": yahoo(300), "005930.KS": yahoo(1)}  # 삼성전자는 하루뿐이라 빠져요
        return {"083650.KQ": yahoo(24, freq="MS")}

    made, quotes, day = al.build("kr", rows, tmp_path, rets={"083650": ["2005-12", 31.7, 0, -91, 10.0, [], []]},
                                 fetch=fetch, pause=0)
    assert made == 1 and list(quotes) == ["083650"]
    assert asked == [(("083650.KQ", "005930.KS", "999999.KS"), "1d", "2y"), (("083650.KQ", "005930.KS", "999999.KS"), "1mo", "max")]
    x = json.loads((tmp_path / "083650.json").read_text())
    assert x["lite"] is True and x["exch"] == "KQ" and x["kind"] == "s" and x["ret"][1] == 31.7
    assert len(x["candles"]["dates"]) == 300 and len(x["candles"]["monthly"]["dates"]) == 24
    q = quotes["083650"]
    assert q[0] == 399 and q[1] == round(399 / 398 - 1, 4) and q[2] == round(399 / 336 - 1, 4)  # 63거래일 전 (앱 3개월 추세선 첫 점과 같아요)
    assert q[3] is not None and q[4] == 0.0 and q[5] == 100.0
    assert day == x["candles"]["dates"][-1]
    assert not (tmp_path / "005930.json").exists()


def test_quote_handles_short_history():
    c = {"c": [100, 110], "dates": ["2026-10-07", "2026-10-08"]}
    q = al.quote(c)
    assert q[0] == 110 and q[1] == 0.1 and q[2] == 0.1 and q[3] is None and q[4] == 0.0
