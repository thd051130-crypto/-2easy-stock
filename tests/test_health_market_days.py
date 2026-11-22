"""장 쉬는 날엔 장중 뉴스 고장 알림을 안 보내요 (사용자 2026-11-22)."""
import datetime as dt

import health


def test_weekend_is_closed():
    assert health.market_closed(dt.date(2026, 11, 22))  # 일요일
    assert health.market_closed(dt.date(2026, 11, 21))  # 토요일


def test_weekday_is_open():
    assert not health.market_closed(dt.date(2026, 11, 23))  # 월요일


def test_one_market_open_still_sends():
    assert not health.market_closed(dt.date(2026, 11, 26))  # 미국 추수감사절이지만 국장은 열려요
    assert health.market_closed(dt.date(2026, 12, 25))  # 성탄절은 둘 다 쉬어요


def test_fail_skips_on_closed_day(monkeypatch, capsys):
    sent = []
    monkeypatch.setattr(health, "market_closed", lambda d: True)
    monkeypatch.setattr(health, "send_telegram", sent.append)
    monkeypatch.setattr("sys.argv", ["health.py", "fail", "--workflow", "news", "--market-days"])
    health.main()
    assert sent == [] and "쉬는 날" in capsys.readouterr().out
