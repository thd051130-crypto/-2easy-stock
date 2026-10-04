"""Claude에게 신호 상황을 주고 구조화된 매매 의견(JSON)을 받는다."""
from __future__ import annotations

import json
import logging
import time
from collections import deque

import anthropic

from .config import Config
from .models import Opinion, Signal

log = logging.getLogger("stockbot.advisor")

SYSTEM_PROMPT = """\
당신은 한국 주식 단기 매매 알림 봇의 분석 보조자입니다. 입력으로 한 종목의 실시간 시세와 신호 발생 이유가 주어집니다.

규칙:
- 제공된 데이터만 근거로 판단하세요. 뉴스·공시·실적·시장 전체 분위기는 알 수 없으므로 추측하거나 지어내지 말고, 리스크에 '뉴스/공시 미확인'을 포함하세요.
- 손절가는 입력에 나온 가격대(N일선, 당일 저가, 전일 종가, 당일 시가 등)에서 근거를 찾아 원 단위 정수로 제시하세요. 매수 의견이면 현재가보다 낮아야 합니다. 매도/관망이면 stop_loss_price는 0, stop_loss_reason은 '해당 없음'.
- +10% 이상 급등 추격, 거래량 없는 돌파, 호가 잔량이 한쪽으로 쏠린 경우는 보수적으로 보세요. 근거가 약하면 '관망'이 정답입니다.
- confidence는 1~10 정수 (7 이상은 근거가 여러 개 겹칠 때만).
- 한국어로 간결하게. rationale과 risks는 각각 2~3개, 항목당 한 문장."""

OPINION_SCHEMA = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["매수", "매도", "관망"]},
        "confidence": {"type": "integer"},
        "summary": {"type": "string"},
        "rationale": {"type": "array", "items": {"type": "string"}},
        "stop_loss_price": {"type": "integer"},
        "stop_loss_reason": {"type": "string"},
        "risks": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["action", "confidence", "summary", "rationale",
                 "stop_loss_price", "stop_loss_reason", "risks"],
    "additionalProperties": False,
}


def build_prompt(sig: Signal) -> str:
    t, b = sig.tick, sig.baseline
    lines = [
        f"종목: {sig.label}",
        f"체결시각: {t.time[:2]}:{t.time[2:4]}:{t.time[4:6]}",
        f"신호: {' / '.join(sig.reasons)}",
        "",
        f"현재가 {t.price:,}원 (전일 대비 {t.change:+,}원, {t.change_pct:+.2f}%)",
        f"전일종가 {t.prev_close:,} / 시가 {t.open:,} / 고가 {t.high:,} / 저가 {t.low:,}",
        f"누적거래량 {t.acml_volume:,}주, 누적거래대금 {t.acml_value / 1e8:,.1f}억원",
        f"체결강도 {t.trade_strength:.1f} (100 초과 = 매수 우위)",
        f"최우선 매도 {t.ask1:,} / 매수 {t.bid1:,}, 총 매도잔량 {t.ask_remain:,} / 총 매수잔량 {t.bid_remain:,}",
    ]
    if b:
        lines += [
            f"{b.ma_window}일 이동평균(전일까지) {b.ma:,.0f}원 → 현재가는 {((t.price / b.ma) - 1) * 100:+.1f}%",
            f"{b.ma_window}일 평균 일거래량 {b.avg_volume:,.0f}주 → 오늘 누적 {t.acml_volume / b.avg_volume:.2f}배"
            if b.avg_volume else "",
        ]
    else:
        lines.append("(일봉 기준값 없음: 이동평균/평균거래량 정보 미제공)")
    if sig.recent:
        pts = ", ".join(f"{h[:2]}:{h[2:4]}:{h[4:6]} {p:,}({v:,})" for h, p, v in sig.recent[-15:])
        lines.append(f"최근 체결(시각 가격(수량)): {pts}")
    lines.append("\n이 상황에 대한 의견을 작성하세요.")
    return "\n".join(x for x in lines if x != "")


def validate_opinion(op: Opinion, price: int) -> Opinion:
    """모델 출력의 기계적 검증. 말이 안 되는 손절가는 버린다."""
    op.confidence = max(1, min(10, op.confidence))
    if op.action == "매수":
        # 현재가보다 낮고, 현재가의 -15% 보다는 높아야 현실적인 손절가
        if not (price * 0.85 <= op.stop_loss_price < price):
            op.stop_loss_price = 0
            op.stop_loss_reason = "제시된 손절가가 기준(현재가 아래 15% 이내)을 벗어나 폐기됨 — 직접 설정 필요"
    else:
        op.stop_loss_price = 0
    return op


class RateBudget:
    """시간당 Claude 호출 수 상한 (비용 폭주 방지)."""

    def __init__(self, per_hour: int):
        self.per_hour = per_hour
        self._calls: deque[float] = deque()

    def try_acquire(self, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        while self._calls and now - self._calls[0] > 3600:
            self._calls.popleft()
        if len(self._calls) >= self.per_hour:
            return False
        self._calls.append(now)
        return True


class Advisor:
    def __init__(self, cfg: Config, client: anthropic.AsyncAnthropic | None = None):
        self.cfg = cfg
        # 알림용이라 SDK 재시도는 1회로 줄이고 전체 타임아웃을 짧게
        self.client = client or anthropic.AsyncAnthropic(timeout=cfg.claude_timeout, max_retries=1)
        self.budget = RateBudget(cfg.max_claude_per_hour)

    async def opine(self, sig: Signal) -> Opinion | None:
        """실패/거절/한도 초과 시 None → 호출 측은 의견 없는 기본 알림을 보낸다."""
        if not self.budget.try_acquire():
            log.warning("Claude 시간당 호출 한도(%d) 초과 → 의견 생략", self.cfg.max_claude_per_hour)
            return None
        try:
            resp = await self.client.messages.create(
                model=self.cfg.claude_model,
                max_tokens=4000,  # 사고 토큰 포함 상한
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": build_prompt(sig)}],
                output_config={"effort": self.cfg.claude_effort,
                               "format": {"type": "json_schema", "schema": OPINION_SCHEMA}},
            )
            if resp.stop_reason in ("refusal", "max_tokens"):
                log.warning("Claude stop_reason=%s (%s)", resp.stop_reason, resp._request_id)
                return None
            text = next(b.text for b in resp.content if b.type == "text")
            d = json.loads(text)
            op = Opinion(action=d["action"], confidence=int(d["confidence"]), summary=d["summary"],
                         rationale=list(d["rationale"]), stop_loss_price=int(d["stop_loss_price"]),
                         stop_loss_reason=d["stop_loss_reason"], risks=list(d["risks"]))
            return validate_opinion(op, sig.tick.price)
        except anthropic.APIStatusError as e:
            log.warning("Claude API error %s: %s", e.status_code, e.message)
        except anthropic.APIConnectionError as e:  # Timeout 포함
            log.warning("Claude connection error: %s", e)
        except (StopIteration, KeyError, ValueError, TypeError) as e:
            log.warning("Claude 응답 파싱 실패: %s", e)
        return None
