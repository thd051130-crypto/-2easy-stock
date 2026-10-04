"""조립: 웹소켓 틱 → 신호 엔진 → (큐) → Claude 의견 → 텔레그램.

틱 핸들러는 절대 블로킹하지 않는다. 신호는 큐에 넣고 워커가 Claude/텔레그램 호출을 처리하므로
Claude 응답이 느려도 시세 수신이 밀리지 않는다.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from .advisor import Advisor
from .config import Config
from .kis import KST, KisAuth, KisRest, KisStream
from .models import Signal, Tick
from .notifier import Notifier, format_alert
from .signals import SignalEngine

log = logging.getLogger("stockbot")

BASELINE_REFRESH_HHMM = (8, 30)  # 매 영업일 장 시작 전 기준값 갱신
WORKERS = 2


def seconds_until(hour: int, minute: int, now: datetime | None = None) -> float:
    now = now or datetime.now(KST)
    nxt = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if nxt <= now:
        nxt += timedelta(days=1)
    return (nxt - now).total_seconds()


class Bot:
    def __init__(self, cfg: Config, notifier: Notifier, advisor: Advisor | None,
                 rest: KisRest | None = None):
        self.cfg, self.notifier, self.advisor, self.rest = cfg, notifier, advisor, rest
        self.engine = SignalEngine(cfg)
        self.queue: asyncio.Queue[Signal] = asyncio.Queue(maxsize=100)

    # 웹소켓 콜백 (동기, 즉시 반환)
    def on_tick(self, tick: Tick) -> None:
        sig = self.engine.on_tick(tick)
        if sig is None:
            return
        sig.name = self.cfg.watchlist.get(sig.code, "")
        log.info("signal %s %s: %s", sig.label, sig.rules, "; ".join(sig.reasons))
        try:
            self.queue.put_nowait(sig)
        except asyncio.QueueFull:
            log.error("signal queue full, dropped %s", sig.label)

    async def process(self, sig: Signal) -> None:
        op, note = None, ""
        if self.advisor is not None:
            op = await self.advisor.opine(sig)
            if op is None:
                note = "Claude 의견을 받지 못해 신호만 전달합니다."
        await self.notifier.send(format_alert(sig, op, note))

    async def _notify_safe(self, text: str) -> None:
        """상태 알림 실패가 감시 루프를 죽이지 않게."""
        try:
            await self.notifier.send(text)
        except Exception as e:
            log.warning("status notify failed: %s", type(e).__name__)

    async def _worker(self) -> None:
        while True:
            sig = await self.queue.get()
            try:
                await self.process(sig)
            except Exception:
                log.exception("alert failed for %s", sig.label)
            finally:
                self.queue.task_done()

    async def refresh_baselines(self) -> int:
        assert self.rest is not None
        got = await self.rest.baselines(list(self.cfg.watchlist))
        self.engine.baselines.update(got)
        log.info("baselines ready: %d/%d", len(got), len(self.cfg.watchlist))
        return len(got)

    async def _baseline_loop(self) -> None:
        while True:
            try:
                ok = await self.refresh_baselines()
            except Exception as e:
                log.warning("baseline refresh failed: %s", e)
                ok = 0
            await asyncio.sleep(300 if ok == 0 else seconds_until(*BASELINE_REFRESH_HHMM))

    async def run(self) -> None:
        assert self.rest is not None
        stream = KisStream(self.cfg, self.rest.auth, self.on_tick, on_status=self._notify_safe)
        names = ", ".join(f"{n or c}" for c, n in self.cfg.watchlist.items())
        await self._notify_safe(
            f"🤖 stockbot 시작 ({self.cfg.kis_env}) — {len(self.cfg.watchlist)}종목 감시\n{names}")
        tasks = [asyncio.create_task(self._baseline_loop()), asyncio.create_task(stream.run()),
                 *(asyncio.create_task(self._worker()) for _ in range(WORKERS))]
        try:
            await asyncio.gather(*tasks)
        finally:
            for t in tasks:
                t.cancel()


def build(cfg: Config, notifier: Notifier, advisor: Advisor | None) -> Bot:
    auth = KisAuth(cfg)
    return Bot(cfg, notifier, advisor, KisRest(cfg, auth))
