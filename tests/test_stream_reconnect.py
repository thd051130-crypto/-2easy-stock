"""진짜 로컬 웹소켓 서버로 재접속·구독 복구·PINGPONG·유휴 감지를 검증."""
import asyncio
import json
from types import SimpleNamespace as NS

import pytest
from websockets.asyncio.server import serve

from stockbot.kis import KisStream
from test_kis import _record  # noqa: E402  (같은 tests 디렉터리)


class Auth:
    def __init__(self):
        self.n = 0

    async def approval_key(self):
        self.n += 1
        return f"APPROVAL{self.n}"


async def run_stream(cfg, handler, *, wait_for, idle=90):
    async with serve(handler, "127.0.0.1", 0) as server:
        port = server.sockets[0].getsockname()[1]
        got, status = [], []

        async def on_status(m):
            status.append(m)

        s = KisStream(cfg, Auth(), got.append, on_status, ws_url=f"ws://127.0.0.1:{port}")
        s.IDLE_TIMEOUT = idle
        task = asyncio.create_task(s.run())
        try:
            await asyncio.wait_for(wait_for(got, status), timeout=15)
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        return got, status


async def test_reconnects_and_resubscribes_after_server_drop(cfg):
    subs, conns = [], []

    async def handler(ws):
        conns.append(1)
        for _ in cfg.watchlist:  # 구독 요청 수신
            subs.append(json.loads(await ws.recv()))
        await ws.send(json.dumps({"header": {"tr_id": "PINGPONG"}}))
        # (pong은 제어 프레임이라 recv()로 안 보임 — 회신 자체는 test_kis의 FakeWS로 검증)
        await ws.send(f"0|H0STCNT0|001|{_record(time='10000%d' % len(conns))}")
        if len(conns) == 1:
            await asyncio.sleep(0.5)  # (websockets는 close 이후 미소비 프레임을 버리므로 소비될 시간을 준다)
            await ws.close()  # 서버가 끊음 → 재접속 기대
        else:
            await ws.wait_closed()

    async def done(got, _):
        while len(got) < 2:
            await asyncio.sleep(0.05)

    got, _ = await run_stream(cfg, handler, wait_for=done)
    assert [t.time for t in got] == ["100001", "100002"] and len(conns) >= 2
    assert subs[0]["body"]["input"] == {"tr_id": "H0STCNT0", "tr_key": "005930"}
    assert subs[0]["header"]["approval_key"] == "APPROVAL1" and subs[1]["header"]["approval_key"] == "APPROVAL2"


async def test_idle_connection_is_dropped_and_reconnected(cfg):
    conns = []

    async def handler(ws):  # 구독만 받고 아무것도 안 보내는 '죽은' 연결
        conns.append(1)
        await ws.recv()
        await ws.wait_closed()

    async def done(*_):
        while len(conns) < 2:
            await asyncio.sleep(0.05)

    await run_stream(cfg, handler, wait_for=done, idle=0.3)
    assert len(conns) >= 2
