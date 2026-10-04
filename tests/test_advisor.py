import json
from types import SimpleNamespace as NS

import anthropic
import httpx

from stockbot.advisor import Advisor, RateBudget, build_prompt, validate_opinion
from stockbot.models import Opinion, Signal
from stockbot.signals import SignalEngine
from stockbot.simulate import make_tick


def signal(cfg, base, price=73_600, vol=2_000_000):
    e = SignalEngine(cfg, {"005930": base})
    s = e.on_tick(make_tick("005930", price, 70_000, vol, "100000", "20261005"))
    s.name = "삼성전자"
    return s


GOOD = {"action": "매수", "confidence": 6, "summary": "20일선 돌파+거래량 동반",
        "rationale": ["20일선 상향 돌파", "거래량 2배"], "stop_loss_price": 72_000,
        "stop_loss_reason": "돌파 전 지지선(당일 시가대)", "risks": ["뉴스/공시 미확인", "단기 과열"]}


class FakeMessages:
    def __init__(self, payload=None, exc=None, stop_reason="end_turn"):
        self.payload, self.exc, self.stop_reason, self.kwargs = payload, exc, stop_reason, None

    async def create(self, **kw):
        self.kwargs = kw
        if self.exc:
            raise self.exc
        return NS(stop_reason=self.stop_reason, _request_id="req_x",
                  content=[NS(type="thinking"), NS(type="text", text=json.dumps(self.payload))])


def advisor(cfg, **kw):
    msgs = FakeMessages(**kw)
    return Advisor(cfg, NS(messages=msgs)), msgs


def test_prompt_contains_key_facts(cfg, base):
    p = build_prompt(signal(cfg, base))
    for needle in ("삼성전자(005930)", "73,600원", "+5.14%", "70,500", "20일 이동평균", "2.00배", "최근 체결", "급등"):
        assert needle in p, needle


def test_prompt_without_baseline(cfg):
    s = SignalEngine(cfg).on_tick(make_tick("005930", 74_000, 70_000, 1, "100000", "20261005"))
    assert "일봉 기준값 없음" in build_prompt(s)


async def test_opine_success_sends_schema_and_effort(cfg, base):
    adv, msgs = advisor(cfg, payload=GOOD)
    op = await adv.opine(signal(cfg, base))
    assert (op.action, op.confidence, op.stop_loss_price) == ("매수", 6, 72_000)
    kw = msgs.kwargs
    assert kw["model"] == cfg.claude_model and kw["output_config"]["effort"] == "low"
    assert kw["output_config"]["format"]["type"] == "json_schema"
    assert "thinking" not in kw and "temperature" not in kw  # 현행 모델에서 400 나는 파라미터 금지


async def test_opine_returns_none_on_failures(cfg, base):
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    for kw in (
        dict(exc=anthropic.APIConnectionError(request=req)),
        dict(exc=anthropic.APITimeoutError(request=req)),
        dict(payload=GOOD, stop_reason="refusal"),
        dict(payload=GOOD, stop_reason="max_tokens"),
        dict(payload={"action": "매수"}),  # 필드 누락
    ):
        adv, _ = advisor(cfg, **kw)
        assert await adv.opine(signal(cfg, base)) is None, kw


async def test_hourly_budget_blocks_calls(cfg, base):
    from dataclasses import replace
    adv, msgs = advisor(replace(cfg, max_claude_per_hour=1), payload=GOOD)
    assert await adv.opine(signal(cfg, base)) is not None
    msgs.kwargs = None
    assert await adv.opine(signal(cfg, base)) is None and msgs.kwargs is None  # API 호출 자체를 안 함


def test_rate_budget_window():
    b = RateBudget(2)
    assert b.try_acquire(0) and b.try_acquire(10) and not b.try_acquire(20)
    assert b.try_acquire(3601)  # 첫 호출이 창에서 빠짐


def mk(**kw):
    d = dict(action="매수", confidence=5, summary="", rationale=[], stop_loss_price=72_000,
             stop_loss_reason="r", risks=[])
    d.update(kw)
    return Opinion(**d)


def test_validate_opinion_stop_loss_sanity():
    assert validate_opinion(mk(), 73_600).stop_loss_price == 72_000
    for bad in (73_600, 80_000, 50_000, 0):  # 현재가 이상 / 너무 멂 / 없음
        op = validate_opinion(mk(stop_loss_price=bad), 73_600)
        assert op.stop_loss_price == 0 and "직접 설정" in op.stop_loss_reason
    op = validate_opinion(mk(action="관망", stop_loss_price=70_000), 73_600)
    assert op.stop_loss_price == 0
    assert validate_opinion(mk(confidence=99), 73_600).confidence == 10
