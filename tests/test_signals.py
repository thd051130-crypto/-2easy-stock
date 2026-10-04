from dataclasses import replace

from stockbot.signals import SignalEngine
from stockbot.simulate import make_tick

PREV = 70_000


def tick(price, vol=100_000, time="100000", date="20261005"):
    return make_tick("005930", price, PREV, vol, time, date)


def test_surge_fires_once_per_tier(cfg):
    e = SignalEngine(cfg)
    assert e.on_tick(tick(72_000)) is None  # +2.86%
    s = e.on_tick(tick(73_600, time="100100"))  # +5.14% → 5% 단계
    assert s and s.rules == ["SURGE"] and "5% 단계" in s.reasons[0]
    assert e.on_tick(tick(73_700, time="100200")) is None  # 같은 단계 재발동 없음
    assert e.on_tick(tick(77_200, time="100300")).rules == ["SURGE"]  # +10.3% → 10% 단계


def test_plunge(cfg):
    s = SignalEngine(cfg).on_tick(tick(66_000))  # -5.71%
    assert s.rules == ["PLUNGE"] and "급락" in s.reasons[0]


def test_volume_spike_and_cooldown(cfg, base):
    e = SignalEngine(cfg, {"005930": base})
    assert e.on_tick(tick(70_100, vol=1_900_000)) is None
    s = e.on_tick(tick(70_100, vol=2_100_000, time="100100"))
    assert s.rules == ["VOLUME_SPIKE"] and "2.1배" in s.reasons[0]
    assert e.on_tick(tick(70_100, vol=2_500_000, time="100200")) is None  # 쿨다운
    cd = cfg.cooldown_sec
    t2 = f"{10 + cd // 3600:02d}{(cd % 3600) // 60 + 2:02d}00"  # 쿨다운 경과 후
    assert e.on_tick(tick(70_100, vol=3_000_000, time=t2)).rules == ["VOLUME_SPIKE"]


def test_ma_breakout_needs_prev_close_below_ma_and_buffer(cfg, base):
    e = SignalEngine(cfg, {"005930": base})  # MA 70,500, 전일종가 70,000 (아래)
    assert e.on_tick(tick(70_520)) is None  # 버퍼(0.2% = 70,641) 미달
    s = e.on_tick(tick(70_700, time="100100"))
    assert s.rules == ["MA_BREAKOUT"] and "20일선" in s.reasons[0]
    # 전일 종가가 이미 이평선 위였다면 '돌파'가 아니다
    above = replace(base, prev_close=71_000)
    assert SignalEngine(cfg, {"005930": above}).on_tick(tick(72_000)) is None


def test_multiple_rules_merge_into_one_signal(cfg, base):
    e = SignalEngine(cfg, {"005930": base})
    s = e.on_tick(tick(73_600, vol=2_000_000))
    assert set(s.rules) == {"SURGE", "VOLUME_SPIKE", "MA_BREAKOUT"} and len(s.reasons) == 3
    assert s.recent and s.baseline is base


def test_outside_active_window_no_signal_but_state_kept(cfg):
    e = SignalEngine(cfg)
    assert e.on_tick(tick(75_000, time="085500")) is None  # 장전 예상체결
    assert e.on_tick(tick(75_000, time="152500")) is None  # 동시호가
    assert e.on_tick(tick(75_000, time="100000")).rules == ["SURGE"]


def test_new_day_resets_state(cfg):
    e = SignalEngine(cfg)
    assert e.on_tick(tick(73_600)) is not None
    assert e.on_tick(tick(73_600, time="100100")) is None
    assert e.on_tick(tick(73_600, date="20261006")) is not None  # 다음 거래일엔 다시


def test_daily_cap_per_symbol(cfg):
    cfg = replace(cfg, max_alerts_per_symbol_day=2, surge_pct=1.0)
    e = SignalEngine(cfg)
    fired = [e.on_tick(tick(PREV + 800 * n, time=f"10{n:02d}00")) for n in range(1, 6)]
    assert sum(s is not None for s in fired) == 2


def test_no_baseline_still_does_price_rules(cfg):
    assert SignalEngine(cfg).on_tick(tick(74_000, vol=9_999_999)).rules == ["SURGE"]
