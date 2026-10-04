"""realtime_monitor 파서/수신 루프 테스트. 실행: python -m unittest discover tests"""

import asyncio
import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import realtime_monitor as rm  # noqa: E402

import websockets  # noqa: E402

# 공식 샘플(ccnl_krx) 기준 H0STCNT0 한 건 = 46필드
KR_RECORD = ["005930", "093015", "71000", "2", "500", "0.71", "70950.12", "70500", "71200", "70400",
             "71100", "71000", "120", "3456789"] + ["0"] * 32
US_RECORD = ["DNASNVDA", "NVDA", "4", "20261002", "5", "103015", "20261002", "233015", "120.1", "121.0",
             "119.5", "120.5", "2", "0.5", "0.42", "120.4", "120.5", "10", "20", "50", "123456", "1000",
             "5", "6", "101.2", "1"]


def frame(tr_id, *records):
    return f"0|{tr_id}|{len(records):03d}|" + "^".join("^".join(r) for r in records)


class ParseFrameTest(unittest.TestCase):
    def test_field_counts_match_official_samples(self):
        self.assertEqual(len(rm.MARKETS["kr"]["fields"]), 46)
        self.assertEqual(len(rm.MARKETS["us"]["fields"]), 26)

    def test_kr_single(self):
        [t] = rm.parse_frame(frame("H0STCNT0", KR_RECORD), rm.MARKETS["kr"]["fields"])
        self.assertEqual((t["code"], t["price"], t["volume"], t["acc_volume"]), ("005930", "71000", "120", "3456789"))

    def test_kr_multi_record_frame(self):
        second = ["000660"] + KR_RECORD[1:2] + ["180000"] + KR_RECORD[3:]
        ticks = rm.parse_frame(frame("H0STCNT0", KR_RECORD, second), rm.MARKETS["kr"]["fields"])
        self.assertEqual([(t["code"], t["price"]) for t in ticks], [("005930", "71000"), ("000660", "180000")])
        self.assertEqual(ticks[1]["vi_price"], "0")

    def test_us(self):
        [t] = rm.parse_frame(frame("HDFSCNT0", US_RECORD), rm.MARKETS["us"]["fields"])
        self.assertEqual((t["rsym"], t["code"], t["price"], t["volume"]), ("DNASNVDA", "NVDA", "120.5", "50"))

    def test_encrypted_and_broken_frames_are_skipped(self):
        fields = rm.MARKETS["kr"]["fields"]
        self.assertEqual(rm.parse_frame("1|H0STCNI0|001|aGVsbG8=", fields), [])
        self.assertEqual(rm.parse_frame("0|H0STCNT0|000|", fields), [])
        self.assertEqual(rm.parse_frame("0|H0STCNT0|002|a^b^c", fields), [])
        self.assertEqual(rm.parse_frame('{"header":{}}', fields), [])


class ListenTest(unittest.TestCase):
    """로컬 가짜 KIS 서버로 구독 응답 → PINGPONG → 체결 프레임 흐름을 돌려봐요."""

    def test_end_to_end_with_fake_server(self):
        received, pongs = [], []

        async def server(ws):
            for _ in range(2):
                received.append(json.loads(await ws.recv()))
            await ws.send(json.dumps({"header": {"tr_id": "H0STCNT0", "tr_key": "005930", "encrypt": "N"},
                                      "body": {"rt_cd": "0", "msg_cd": "OPSP0000", "msg1": "SUBSCRIBE SUCCESS",
                                               "output": {"iv": "x", "key": "y"}}}))
            await ws.send(json.dumps({"header": {"tr_id": "H0STCNT0", "tr_key": "000660", "encrypt": "N"},
                                      "body": {"rt_cd": "1", "msg_cd": "OPSP0011", "msg1": "invalid approval : NOT FOUND"}}))
            await ws.send(json.dumps({"header": {"tr_id": "PINGPONG", "datetime": "20261005093000"}}))
            await ws.send(frame("H0STCNT0", KR_RECORD))
            await ws.send(frame("H0STCNT0", KR_RECORD))  # 같은 종목 두 번째 체결은 알림 안 감
            await asyncio.sleep(0.2)

        async def go():
            async with websockets.serve(server, "127.0.0.1", 0) as srv:
                port = srv.sockets[0].getsockname()[1]
                async with websockets.connect(f"ws://127.0.0.1:{port}", ping_interval=None) as ws:
                    orig_pong = ws.pong

                    async def spy_pong(data=b""):
                        pongs.append(data)
                        return await orig_pong(data)
                    ws.pong = spy_pong
                    for key in rm.MARKETS["kr"]["symbols"]:
                        await ws.send(rm.subscribe_message("APPROVAL", "H0STCNT0", key))
                    try:
                        await rm.listen(ws, rm.MARKETS["kr"])
                    except websockets.ConnectionClosed:
                        pass

        with mock.patch.object(rm, "send_telegram", return_value=True) as tg:
            asyncio.run(go())

        self.assertEqual([r["body"]["input"]["tr_key"] for r in received], ["005930", "000660"])
        self.assertEqual(received[0]["header"]["approval_key"], "APPROVAL")
        self.assertEqual(len(pongs), 1)
        tg.assert_called_once()
        self.assertIn("삼성전자 71000", tg.call_args[0][0])


if __name__ == "__main__":
    unittest.main()
