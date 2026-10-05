import json

import pandas as pd

import stock_pages as sp


def yahoo_daily(days, tz="Asia/Seoul", start=100.0):
    idx = pd.date_range("2026-09-28", periods=days, freq="B", tz=tz)
    c = [start + i for i in range(days)]
    return pd.DataFrame({"Open": c, "High": [x + 2.567 for x in c], "Low": [x - 1.234 for x in c],
                         "Close": [x + 0.5 for x in c], "Volume": [1000.0 * (i + 1) for i in range(days)]}, index=idx)


def test_candles_rounds_by_market_and_cuts_after_signal_day():
    h = yahoo_daily(5)  # 9/28 ~ 10/2
    kr = sp.candles(h, "kr", until="2026-10-01")
    assert kr["dates"] == ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"]
    assert kr["h"][0] == 103 and kr["c"][0] == 100 and all(isinstance(x, int) for x in kr["l"])
    assert kr["v"] == [1000, 2000, 3000, 4000]
    us = sp.candles(yahoo_daily(2, tz="America/New_York"), "us")
    assert us["h"] == [102.57, 103.57] and us["l"] == [98.77, 99.77] and us["dates"][0] == "2026-09-28"
    assert sp.candles(None, "kr") is None
    assert sp.candles(h.drop(columns="High"), "kr") is None
    assert sp.candles(h, "kr", until="2026-01-01") is None


def test_build_writes_one_file_per_stock_with_fundamentals(tmp_path):
    paper = tmp_path / "paper"
    (paper / "kr").mkdir(parents=True)
    (paper / "kr" / "fundamentals.json").write_text(json.dumps(dict(stocks={
        "005930": dict(code="005930", per=12.1), "000660": dict(code="000660", per=8.0)})))
    (paper / "kr" / "signal.json").write_text(json.dumps(dict(day="2026-10-01")))

    def fetch(symbol):  # SK하이닉스는 시세를 못 받고, 나머지는 받아요
        return None if symbol == "000660.KS" else yahoo_daily(5)

    out = tmp_path / "_site"
    full, only_fund, rows = sp.build(out, "kr", paper=paper, fetch=fetch, pause=0)
    files = sorted(p.name for p in (out / "stocks" / "kr").iterdir())
    assert full == 47 and only_fund == 1 and len(files) == 48 and rows == []
    sam = json.loads((out / "stocks" / "kr" / "005930.json").read_text())
    assert sam["name"] == "삼성전자" and sam["fund"]["per"] == 12.1 and sam["candles"]["dates"][-1] == "2026-10-01"
    hynix = json.loads((out / "stocks" / "kr" / "000660.json").read_text())
    assert hynix["candles"] is None and hynix["fund"]["per"] == 8.0
    # 재무 파일·시세 둘 다 없으면 파일을 안 만들어요
    full, only_fund, rows = sp.build(tmp_path / "empty", "kr", paper=tmp_path / "nopaper", fetch=lambda s: None, pause=0)
    assert (full, only_fund, rows) == (0, 0, [])


def test_build_stops_fetching_after_time_budget(tmp_path):
    paper = tmp_path / "paper"
    (paper / "us").mkdir(parents=True)
    (paper / "us" / "fundamentals.json").write_text(json.dumps(dict(stocks={"AAPL": dict(per=30.0)})))
    calls = []

    def fetch(symbol):
        calls.append(symbol)
        return yahoo_daily(3, tz="America/New_York")

    full, only_fund, rows = sp.build(tmp_path / "_site", "us", paper=paper, fetch=fetch, pause=0, budget=-1)
    assert calls == [] and (full, only_fund, rows) == (0, 1, [])  # 시간이 지나면 시세는 안 받고 재무 있는 종목만


def test_extras_come_first_with_their_own_symbol_and_fill_data_json(tmp_path):
    paper = tmp_path / "paper"
    (paper / "kr").mkdir(parents=True)
    (paper / "kr" / "signal.json").write_text(json.dumps(dict(day="2026-10-01")))
    (paper / "watch.json").write_text(json.dumps(dict(kr=[
        dict(code="293490", name="카카오게임즈", symbol="293490.KQ", exch="KQ", kind="s", added="2026-10-05"),
        dict(code="035720", name="카카오", symbol="035720.KS", exch="KS", kind="s", added="2026-10-05")])))
    calls = []

    def fetch(symbol):
        calls.append(symbol)
        return None if symbol == "035720.KS" else yahoo_daily(5)

    out = tmp_path / "_site"
    out.mkdir()
    (out / "data.json").write_text(json.dumps(dict(markets=dict(kr=dict(extras=[]), us=dict(extras=[])))))
    full, only_fund, rows = sp.build(out, "kr", paper=paper, fetch=fetch, pause=0)
    assert calls[:2] == ["293490.KQ", "035720.KS"] and len(calls) == 50  # 넣은 종목(코스닥은 .KQ) 먼저, 그다음 알림 종목 48개
    games = json.loads((out / "stocks" / "kr" / "293490.json").read_text())
    assert games["name"] == "카카오게임즈" and games["candles"]["dates"][-1] == "2026-10-01"
    assert not (out / "stocks" / "kr" / "035720.json").exists()  # 시세도 재무도 없으면 파일은 없어요
    assert rows[0] == dict(code="293490", name="카카오게임즈", symbol="293490.KQ", exch="KQ", kind="s", added="2026-10-05",
                           day="2026-10-01", close=104, d1=round(104 / 102 - 1, 5), spark=[100, 102, 102, 104])
    assert rows[1]["code"] == "035720" and "close" not in rows[1]  # 못 받은 종목도 줄은 있어요 (가격은 '-')
    assert sp.fill_extras(out, "kr", rows)
    assert json.loads((out / "data.json").read_text())["markets"]["kr"]["extras"] == rows
    assert not sp.fill_extras(tmp_path / "nowhere", "kr", rows)
