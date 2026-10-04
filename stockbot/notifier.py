"""알림 전송 (텔레그램 / 콘솔) 과 메시지 포맷."""
from __future__ import annotations

import asyncio
import html
import logging
from typing import Protocol

import httpx

from .models import Opinion, Signal

log = logging.getLogger("stockbot.notify")

TELEGRAM_LIMIT = 4096
DISCLAIMER = "⚠️ 참고용 알림입니다. 자동 주문 없음 · 투자 판단과 손익은 본인 책임"
RULE_EMOJI = {"SURGE": "🚀", "PLUNGE": "📉", "VOLUME_SPIKE": "📊", "MA_BREAKOUT": "📈"}
ACTION_EMOJI = {"매수": "🟢", "매도": "🔴", "관망": "⚪"}


class Notifier(Protocol):
    async def send(self, text: str) -> None: ...


def format_alert(sig: Signal, op: Opinion | None, note: str = "") -> str:
    """텔레그램 HTML 메시지. 모델/외부 문자열은 전부 escape."""
    e = lambda s: html.escape(s, quote=False)  # noqa: E731  (텔레그램은 & < > 만 필요)
    t, b = sig.tick, sig.baseline
    icon = RULE_EMOJI.get(sig.rules[0], "🔔")
    head = f"{icon} <b>{e(sig.label)}</b>  {t.price:,}원 ({t.change_pct:+.2f}%)"
    ctx = [f"{t.time[:2]}:{t.time[2:4]}:{t.time[4:6]} · 누적 {t.acml_volume:,}주 · 체결강도 {t.trade_strength:.0f}"]
    if b and b.avg_volume:
        ctx[0] += f" · 거래량 {t.acml_volume / b.avg_volume:.1f}배"
    parts = [head, "\n".join(ctx), "", "<b>신호</b>"] + [f"• {e(r)}" for r in sig.reasons]

    if op:
        stop = (f"{op.stop_loss_price:,}원 ({(op.stop_loss_price / t.price - 1) * 100:+.1f}%) — {e(op.stop_loss_reason)}"
                if op.stop_loss_price else e(op.stop_loss_reason))
        parts += [
            "", f"{ACTION_EMOJI.get(op.action, '🤖')} <b>Claude 의견: {e(op.action)}</b> (신뢰도 {op.confidence}/10)",
            e(op.summary), "", "<b>근거</b>", *[f"• {e(x)}" for x in op.rationale],
            "", f"<b>손절가</b> {stop}", "", "<b>리스크</b>", *[f"• {e(x)}" for x in op.risks],
        ]
    elif note:
        parts += ["", f"<i>{e(note)}</i>"]
    parts += ["", DISCLAIMER]
    text = "\n".join(parts)
    return text if len(text) <= TELEGRAM_LIMIT else text[:TELEGRAM_LIMIT - 1] + "…"


class TelegramNotifier:
    def __init__(self, token: str, chat_id: str, http: httpx.AsyncClient | None = None):
        self.url = f"https://api.telegram.org/bot{token}/sendMessage"
        self.chat_id = chat_id
        self.http = http or httpx.AsyncClient(timeout=10)

    async def send(self, text: str) -> None:
        for attempt in range(1, 4):
            try:
                r = await self.http.post(self.url, json={
                    "chat_id": self.chat_id, "text": text, "parse_mode": "HTML",
                    "disable_web_page_preview": True})
                if r.status_code == 429:
                    await asyncio.sleep(min(float(r.json().get("parameters", {}).get("retry_after", 2)), 30))
                    continue
                if r.status_code == 400 and "parse" in r.text.lower():
                    # HTML 파싱 실패 시 태그 없이 재전송 (알림 유실 방지)
                    r = await self.http.post(self.url, json={
                        "chat_id": self.chat_id, "text": html.unescape(_strip_tags(text))})
                r.raise_for_status()
                return
            except httpx.HTTPError as e:
                log.warning("telegram send failed (%d/3): %s", attempt, type(e).__name__)
                await asyncio.sleep(2 ** attempt)
        raise RuntimeError("telegram send failed after 3 attempts")


def _strip_tags(s: str) -> str:
    import re
    return re.sub(r"</?(b|i|code|pre)>", "", s)


class ConsoleNotifier:
    async def send(self, text: str) -> None:
        print(_strip_tags(html.unescape(text)), flush=True)
        print("-" * 40, flush=True)
