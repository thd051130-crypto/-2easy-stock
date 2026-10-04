from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from dataclasses import replace

from .advisor import Advisor
from .bot import Bot, build
from .config import Config, load_dotenv
from .kis import KisAuth, KisRest, compute_baseline
from .notifier import ConsoleNotifier, TelegramNotifier
from .simulate import make_tick, run_simulation


def _notifier(cfg: Config, force_console: bool = False):
    if force_console or not (cfg.telegram_token and cfg.telegram_chat_id):
        return ConsoleNotifier()
    return TelegramNotifier(cfg.telegram_token, cfg.telegram_chat_id)


def _advisor(cfg: Config, enabled: bool = True) -> Advisor | None:
    if not enabled:
        return None
    if not os.environ.get("ANTHROPIC_API_KEY"):
        logging.getLogger("stockbot").warning("ANTHROPIC_API_KEY 없음 → Claude 의견 없이 신호만 알림")
        return None
    return Advisor(cfg)


async def cmd_run(cfg: Config) -> int:
    problems = cfg.problems()
    if problems:
        print("설정 오류:\n - " + "\n - ".join(problems), file=sys.stderr)
        return 2
    bot = build(cfg, _notifier(cfg), _advisor(cfg))
    await bot.run()
    return 0


async def cmd_simulate(cfg: Config, args) -> int:
    if not cfg.watchlist:
        cfg = replace(cfg, watchlist={"005930": "삼성전자"})
    code = next(iter(cfg.watchlist))
    # 시뮬레이션은 시간이 임의라 거래시간 필터를 열어둔다
    cfg = replace(cfg, active_from="000000", active_to="235959")
    bot = Bot(cfg, _notifier(cfg, force_console=not args.telegram), _advisor(cfg, not args.no_claude))
    await run_simulation(bot, code)
    return 0


async def cmd_check(cfg: Config) -> int:
    ok = True

    def report(name: str, good: bool, detail: str = "") -> None:
        nonlocal ok
        ok &= good
        print(f"{'✅' if good else '❌'} {name} {detail}")

    for p in cfg.problems():
        report("설정", False, p)
    if cfg.kis_app_key and cfg.kis_app_secret:
        try:
            auth = KisAuth(cfg)
            await auth.token()
            report("KIS 접근토큰", True, f"({cfg.kis_env})")
            await auth.approval_key()
            report("KIS 웹소켓 접속키", True)
            if cfg.watchlist:
                code = next(iter(cfg.watchlist))
                c = await KisRest(cfg, auth).daily_candles(code, cfg.ma_window)
                b = compute_baseline(code, c, cfg.ma_window)
                report(f"KIS 일봉 {code}", b is not None,
                       f"전일종가 {b.prev_close:,} / {b.ma_window}일선 {b.ma:,.0f}" if b else f"{len(c)}개 (부족)")
        except Exception as e:
            report("KIS", False, f"{type(e).__name__}: {e}")
    if cfg.telegram_token and cfg.telegram_chat_id:
        try:
            await TelegramNotifier(cfg.telegram_token, cfg.telegram_chat_id).send("✅ stockbot 텔레그램 연결 테스트")
            report("텔레그램", True, "(메시지가 왔는지 확인하세요)")
        except Exception as e:
            report("텔레그램", False, str(e))
    adv = _advisor(cfg)
    if adv:
        bot = Bot(cfg, ConsoleNotifier(), adv)
        bot.on_tick(make_tick("005930", 74_000, 70_000, 2_000_000, "100000"))
        sig = bot.queue.get_nowait() if not bot.queue.empty() else None
        if sig is None:  # 기준값 없이도 급등 신호는 발생
            report("Claude", False, "테스트 신호 생성 실패")
        else:
            op = await adv.opine(sig)
            report("Claude", op is not None, f"({cfg.claude_model}) → {op.action} {op.confidence}/10" if op else "응답 없음")
    else:
        report("Claude", False, "ANTHROPIC_API_KEY 없음")
    return 0 if ok else 1


def main() -> None:
    load_dotenv()
    ap = argparse.ArgumentParser(prog="stockbot", description=__doc__)
    ap.add_argument("-v", "--verbose", action="store_true")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("run", help="실시간 감시 시작 (24/7 상주)")
    sub.add_parser("check", help="KIS / 텔레그램 / Claude 연결 점검")
    s = sub.add_parser("simulate", help="가짜 시세로 신호→Claude→알림 전체 흐름 시험")
    s.add_argument("--telegram", action="store_true", help="콘솔 대신 실제 텔레그램으로 전송")
    s.add_argument("--no-claude", action="store_true", help="Claude 호출 생략")
    args = ap.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)  # URL(토큰 포함)이 로그에 남지 않게
    logging.getLogger("httpx2").setLevel(logging.WARNING)
    cfg = Config.from_env()
    try:
        if args.cmd == "run":
            code = asyncio.run(cmd_run(cfg))
        elif args.cmd == "simulate":
            code = asyncio.run(cmd_simulate(cfg, args))
        else:
            code = asyncio.run(cmd_check(cfg))
    except KeyboardInterrupt:
        code = 130
    sys.exit(code)


if __name__ == "__main__":
    main()
