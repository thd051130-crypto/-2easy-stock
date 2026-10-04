import asyncio
import json
from dataclasses import replace

import httpx
import pytest

from stockbot.advisor import Advisor
from stockbot.bot import Bot, seconds_until
from stockbot.kis import KST
from stockbot.models import Opinion
from stockbot.notifier import DISCLAIMER, TelegramNotifier, format_alert
from stockbot.simulate import make_tick, run_simulation
from stockbot.signals import SignalEngine
from datetime import datetime

OP = Opinion("매수", 6, "요약 <b>", ["근거 & 1", "근거 2"], 72_000, "시가 지지", ["뉴스 <미확인>", "과열"])


def sig(cfg, base):
    s = SignalEngine(cfg, {"005930": base}).on_tick(make_tick("005930", 73_600, 70_000, 2_000_000, "100000", "20261005"))
    s.name = "삼성전자"
    return s


def test_format_alert_with_opinion_escapes_html(cfg, base):
    text = format_alert(sig(cfg, base), OP)
    assert "<b>삼성전자(005930)</b>" in text and "73,600원 (+5.14%)" in text
    assert "&lt;b&gt;" in text and "&amp;" in text and "&lt;미확인&gt;" in text  # 모델 출력 escape
    assert "72,000원 (-2.2%)" in text and "신뢰도 6/10" in text and DISCLAIMER in text


def test_format_alert_without_opinion_and_length_cap(cfg, base):
    text = format_alert(sig(cfg, base), None, "Claude 의견을 받지 못해")
    assert "Claude 의견을 받지 못해" in text and "Claude 의견:" not in text
    huge = Opinion("매수", 5, "x" * 6000, [], 0, "-", [])
    assert len(format_alert(sig(cfg, base), huge)) <= 4096


async def test_telegram_send_retries_on_429_then_ok():
    seen = []

    def handler(req: httpx.Request):
        seen.append(json.loads(req.content))
        if len(seen) == 1:
            return httpx.Response(429, json={"parameters": {"retry_after": 0}})
        return httpx.Response(200, json={"ok": True})

    n = TelegramNotifier("TOKEN", "42", httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    await n.send("hi")
    assert len(seen) == 2 and seen[0]["chat_id"] == "42" and seen[0]["parse_mode"] == "HTML"


async def test_telegram_html_error_falls_back_to_plain():
    seen = []

    def handler(req: httpx.Request):
        seen.append(json.loads(req.content))
        if "parse_mode" in seen[-1]:
            return httpx.Response(400, text="Bad Request: can't parse entities")
        return httpx.Response(200, json={"ok": True})

    n = TelegramNotifier("T", "1", httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    await n.send("<b>x</b> &amp; y")
    assert seen[1]["text"] == "x & y" and "parse_mode" not in seen[1]


async def test_telegram_raises_after_retries(monkeypatch):
    async def nosleep(_): pass
    monkeypatch.setattr(asyncio, "sleep", nosleep)
    n = TelegramNotifier("T", "1", httpx.AsyncClient(transport=httpx.MockTransport(
        lambda r: httpx.Response(500))))
    with pytest.raises(RuntimeError):
        await n.send("x")


class Collect:
    def __init__(self):
        self.sent = []

    async def send(self, text):
        self.sent.append(text)


class StubAdvisor:
    def __init__(self, op):
        self.op, self.calls = op, 0

    async def opine(self, sig):
        self.calls += 1
        return self.op


async def test_simulation_end_to_end_with_opinion(cfg):
    cfg = replace(cfg, active_from="000000", active_to="235959")
    out, adv = Collect(), StubAdvisor(OP)
    bot = Bot(cfg, out, adv)
    await run_simulation(bot, "005930")
    assert adv.calls == len(out.sent) == 3  # MA 돌파 → +5% → 거래량 2배
    assert all("Claude 의견: 매수" in m for m in out.sent)
    assert "20일선" in out.sent[0] and "급등" in out.sent[1] and "거래량" in out.sent[2]


async def test_alert_still_sent_when_claude_fails(cfg):
    cfg = replace(cfg, active_from="000000", active_to="235959")
    out = Collect()
    await run_simulation(Bot(cfg, out, StubAdvisor(None)), "005930")
    assert len(out.sent) == 3 and all("신호만 전달" in m for m in out.sent)


async def test_alert_sent_without_advisor(cfg):
    cfg = replace(cfg, active_from="000000", active_to="235959")
    out = Collect()
    await run_simulation(Bot(cfg, out, None), "005930")
    assert len(out.sent) == 3 and all("Claude 의견:" not in m for m in out.sent)


async def test_slow_claude_does_not_block_tick_handler(cfg):
    cfg = replace(cfg, active_from="000000", active_to="235959")

    class Slow:
        async def opine(self, sig):
            await asyncio.sleep(5)

    bot = Bot(cfg, Collect(), Slow())
    t0 = asyncio.get_running_loop().time()
    for i in range(200):  # 틱 폭주
        bot.on_tick(make_tick("005930", 70_000 + i, 70_000, 1, f"10{i % 60:02d}00", "20261005"))
    assert asyncio.get_running_loop().time() - t0 < 0.5  # 핸들러는 즉시 반환


def test_seconds_until():
    now = datetime(2026, 10, 5, 7, 0, tzinfo=KST)
    assert seconds_until(8, 30, now) == 5400
    assert seconds_until(8, 30, datetime(2026, 10, 5, 9, 0, tzinfo=KST)) == 23.5 * 3600
