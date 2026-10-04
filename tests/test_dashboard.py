import json

import pandas as pd

import dashboard
import kr_swing_signals as ks
import paper_trade as pt


def series(n=260, start=100.0, step=0.5):
    idx = pd.bdate_range("2024-01-01", periods=n)
    return pd.Series([start + i * step for i in range(n)], index=idx)


def test_build_without_records_shows_markets_not_started(tmp_path):
    data = dashboard.build(tmp_path)
    assert set(data["markets"]) == {"kr", "us"}
    for m in data["markets"].values():
        assert m["signal"] is None and m["account"] is None and m["rules"]


def test_signal_payload_round_trip(tmp_path):
    index_close = series()
    us = ks.compute_us(index_close)
    ks.save_json(tmp_path / "us" / "signal.json", ks.us_payload(us, index_close, 500.0))
    sig = dashboard.build(tmp_path)["markets"]["us"]["signal"]
    assert sig["action"] == "hold" and sig["ok"] is True
    assert len(sig["series"]["dates"]) == 260 and sig["series"]["ma200"][0] is None
    json.dumps(sig, allow_nan=False)  # 브라우저 JSON.parse가 못 읽는 NaN이 없어야 해요


def test_account_summary_from_paper_records(tmp_path):
    folder = tmp_path / "kr"
    state = pt.new_state("kr")
    state.update(start="2024-01-02", index_start=100.0, cash=270000.0, positions=[
        dict(code="005930", name="삼성전자", qty=0.5, buy_date="2024-01-03", buy_price=60000.0, cost=30030.0,
             last_price=66000.0)], pending_buys=[dict(code="000660", name="SK하이닉스", signal_date="2024-01-04")])
    trades = pd.DataFrame([dict(code="035420", name="NAVER", qty=0.1, buy_date="2024-01-02", buy_price=200000,
                                sell_date="2024-01-03", sell_price=210000, pnl=900.0, ret=0.045, days=1,
                                reason="종가가 5일선 위")], columns=pt.TRADE_COLUMNS)
    equity = pd.DataFrame([dict(date="2024-01-02", cash=300000, stocks=0, equity=300000, index=100.0),
                           dict(date="2024-01-03", cash=270000, stocks=27000, equity=297000, index=101.0),
                           dict(date="2024-01-04", cash=270000, stocks=33000, equity=303000, index=99.0)],
                          columns=pt.EQUITY_COLUMNS)
    pt.save(folder, state, trades, equity)

    acc = dashboard.build(tmp_path)["markets"]["kr"]["account"]
    assert acc["equity"] == 303000 and acc["gain"] == 0.01 and acc["index_gain"] == -0.01
    assert acc["mdd"] == -0.01
    assert [r["account"] for r in acc["curve"]] == [0.0, -0.01, 0.01]
    pos = acc["positions"][0]
    assert pos["price"] == 66000.0 and pos["value"] == 33000.0 and round(pos["ret"], 4) == 0.0989
    assert acc["pending_buys"] == ["SK하이닉스"]
    assert acc["trade_count"] == 1 and acc["win_rate"] == 1.0 and acc["trades"][0]["name"] == "NAVER"


def test_main_copies_site_and_writes_data(tmp_path, monkeypatch):
    site = tmp_path / "site"
    site.mkdir()
    (site / "index.html").write_text("<html></html>")
    out = tmp_path / "_site"
    monkeypatch.setattr("sys.argv", ["dashboard.py", "--paper", str(tmp_path / "paper"), "--site", str(site),
                                     "--out", str(out)])
    dashboard.main()
    assert (out / "index.html").exists()
    assert json.loads((out / "data.json").read_text())["markets"]["kr"]["name"] == "국장"
