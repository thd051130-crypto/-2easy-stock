import numpy as np
import pandas as pd

import conditions
import kr_swing_backtest as kb
import kr_swing_signals as ks
import strategy


def test_read_watchlist_parses_and_skips_bad_lines(tmp_path):
    path = tmp_path / "watchlist.txt"
    path.write_text("# 메모\nkr 035720 카카오\nKR 247540.KQ\nus nvda 엔비디아  # 반도체\nkr 12 이상함\njp 7203 토요타\n\n",
                    encoding="utf-8")
    w = conditions.read_watchlist(path)
    assert w == {"kr": {"035720": "카카오", "247540": "247540"}, "us": {"NVDA": "엔비디아"}}
    assert conditions.read_watchlist(tmp_path / "없음.txt") == {"kr": {}, "us": {}}


def test_rsi_trigger_is_the_price_where_rsi2_crosses_10():
    rng = np.random.default_rng(1)
    close = pd.Series(100 * np.exp(np.cumsum(rng.normal(0.002, 0.01, 60))))
    close.iloc[-3:] = close.iloc[-4] * np.array([1.01, 1.02, 1.03])  # RSI2를 높게
    trigger = conditions.rsi_trigger(close)
    assert trigger < close.iloc[-1]
    below = kb.rsi(pd.concat([close, pd.Series([trigger * 0.999])], ignore_index=True)).iloc[-1]
    above = kb.rsi(pd.concat([close, pd.Series([trigger * 1.001])], ignore_index=True)).iloc[-1]
    assert below < 10 < above


def test_kr_checks_signal_matches_strategy_entry():
    _, closes, index_close = kb.synthetic()
    entry = strategy.kr_frames(closes, index_close)["entry"]
    # 신호가 난 날 하나를 골라 그날까지 자른 데이터로 채점하면 그 종목이 '신호'여야 해요
    days = entry.index[entry.fillna(False).any(axis=1)]
    day = days[-1]
    cut, idx = closes.loc[:day], index_close.loc[:day]
    rows = {r["code"]: r for r in conditions.kr_checks(cut, idx, {})}
    expected = set(entry.columns[entry.loc[day].fillna(False).to_numpy(bool)])
    assert {c for c, r in rows.items() if r["signal"]} == expected
    assert rows[next(iter(expected))]["met"] == 4


def test_condition_rows_marks_unknown_watchlist_codes(tmp_path, monkeypatch):
    idx = pd.bdate_range("2024-01-01", periods=260)
    index_close = pd.Series(np.linspace(100, 150, 260), idx)
    path = tmp_path / "watchlist.txt"
    path.write_text("us AAA 에이\nus ZZZ 없는종목\n", encoding="utf-8")
    monkeypatch.setattr(conditions, "download_closes",
                        lambda codes, market, start, calendar: pd.DataFrame({"AAA": np.linspace(10, 20, 260)}, idx))
    out = ks.condition_rows("us", pd.DataFrame(index=idx), index_close, path, idx[-1].date())
    rows = {r["code"]: r for r in out["watch"]}
    assert rows["AAA"]["signal"] and rows["AAA"]["name"] == "에이"
    assert rows["ZZZ"]["missing"]
