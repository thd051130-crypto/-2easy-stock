"""장외/키 없이 전체 파이프라인(신호 → Claude → 알림)을 확인하는 가짜 시세."""
from __future__ import annotations

import asyncio
from datetime import datetime

from .bot import Bot
from .kis import KST
from .models import Baseline, Tick


def make_tick(code: str, price: int, prev_close: int, acml_volume: int, hhmmss: str,
              date: str | None = None) -> Tick:
    return Tick(
        code=code, date=date or datetime.now(KST).strftime("%Y%m%d"), time=hhmmss, price=price,
        change=price - prev_close, change_pct=round((price / prev_close - 1) * 100, 2),
        open=prev_close, high=max(price, prev_close), low=min(price, prev_close),
        ask1=price + 100, bid1=price, volume=500, acml_volume=acml_volume,
        acml_value=acml_volume * price, trade_strength=118.0,
        ask_remain=80_000, bid_remain=120_000)


async def run_simulation(bot: Bot, code: str) -> None:
    """전일종가 70,000 / 20일선 70,500 / 20일 평균거래량 100만주 가정.

    10:00 시작 → 20일선 돌파(MA_BREAKOUT) → +5% 돌파(SURGE) → 거래량 2배(VOLUME_SPIKE).
    """
    prev = 70_000
    bot.engine.baselines[code] = Baseline(code=code, prev_close=prev, ma=70_500.0,
                                          avg_volume=1_000_000.0, ma_window=20, last_date="")
    steps = [(70_000, 300_000), (70_300, 450_000), (70_700, 700_000), (71_200, 900_000),
             (72_500, 1_200_000), (73_600, 1_600_000), (73_900, 2_100_000)]
    workers = [asyncio.create_task(bot._worker()) for _ in range(2)]
    for i, (price, vol) in enumerate(steps):
        bot.on_tick(make_tick(code, price, prev, vol, f"10{i:02d}00"))
        await asyncio.sleep(0)
    await bot.queue.join()
    for w in workers:
        w.cancel()
