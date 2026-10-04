import json

import httpx
import pytest

from stockbot.config import Config
from stockbot.kis import (H0STCNT0_FIELDS, Candle, KisAuth, KisRest, KisStream, compute_baseline,
                          parse_realtime)


def _record(code="005930", price="73100", sign="2", vrss="3700", ctrt="5.33", time="100001"):
    rec = ["0"] * len(H0STCNT0_FIELDS)
    for k, v in {"MKSC_SHRN_ISCD": code, "STCK_CNTG_HOUR": time, "STCK_PRPR": price,
                 "PRDY_VRSS_SIGN": sign, "PRDY_VRSS": vrss, "PRDY_CTRT": ctrt,
                 "STCK_OPRC": "69500", "STCK_HGPR": "73500", "STCK_LWPR": "69400",
                 "ASKP1": "73200", "BIDP1": "73100", "CNTG_VOL": "120", "ACML_VOL": "1500000",
                 "ACML_TR_PBMN": "105000000000", "CTTR": "121.5", "TOTAL_ASKP_RSQN": "90000",
                 "TOTAL_BIDP_RSQN": "110000", "BSOP_DATE": "20261005"}.items():
        rec[H0STCNT0_FIELDS.index(k)] = v
    return "^".join(rec)


def test_field_count_is_46():
    assert len(H0STCNT0_FIELDS) == 46


def test_parse_single_tick():
    (t,) = parse_realtime(f"0|H0STCNT0|001|{_record()}")
    assert (t.code, t.price, t.change, t.change_pct) == ("005930", 73100, 3700, 5.33)
    assert t.acml_volume == 1_500_000 and t.prev_close == 69_400 and t.date == "20261005"
    assert t.trade_strength == 121.5


def test_parse_negative_sign_handles_signed_or_unsigned_fields():
    for vrss, ctrt in (("800", "1.10"), ("-800", "-1.10")):
        (t,) = parse_realtime(f"0|H0STCNT0|001|{_record(price='72000', sign='5', vrss=vrss, ctrt=ctrt)}")
        assert t.change == -800 and t.change_pct == -1.10


def test_parse_batched_frame_and_other_tr():
    raw = f"0|H0STCNT0|003|{_record(time='100001')}^{_record(time='100002')}^{_record(time='100003')}"
    assert [t.time for t in parse_realtime(raw)] == ["100001", "100002", "100003"]
    assert parse_realtime("0|H0STASP0|001|a^b") == []


def test_parse_rejects_encrypted_and_garbage():
    with pytest.raises(ValueError):
        parse_realtime("1|H0STCNI0|001|xxxx")
    with pytest.raises(ValueError):
        parse_realtime("garbage")


def test_compute_baseline():
    candles = [Candle(f"202609{d:02d}", 100 + d, 1000 * d) for d in range(1, 26)]
    b = compute_baseline("005930", candles, 20)
    assert b.prev_close == 125 and b.last_date == "20260925"
    assert b.ma == sum(100 + d for d in range(6, 26)) / 20
    assert b.avg_volume == sum(1000 * d for d in range(6, 26)) / 20
    assert compute_baseline("005930", candles[:5], 20) is None


def _mock(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_token_cached_to_disk_and_reused(cfg):
    calls = []

    def handler(req: httpx.Request):
        calls.append(req.url.path)
        return httpx.Response(200, json={"access_token": "TOK", "expires_in": 86400})

    a1 = KisAuth(cfg, _mock(handler))
    assert await a1.token() == "TOK"
    a2 = KisAuth(cfg, _mock(handler))  # 새 인스턴스(재시작 시뮬레이션)
    assert await a2.token() == "TOK"
    assert calls == ["/oauth2/tokenP"]  # 두 번째는 디스크 캐시 사용
    assert oct((cfg.state_dir / "kis_token_paper.json").stat().st_mode & 0o777) == "0o600"


async def test_daily_candles_excludes_today_and_sorts(cfg):
    def handler(req: httpx.Request):
        if req.url.path.endswith("tokenP"):
            return httpx.Response(200, json={"access_token": "TOK", "expires_in": 86400})
        assert req.headers["tr_id"] == "FHKST03010100" and req.url.params["FID_INPUT_ISCD"] == "005930"
        return httpx.Response(200, json={"rt_cd": "0", "output2": [
            {"stck_bsop_date": "20261005", "stck_clpr": "74000", "acml_vol": "10"},  # 오늘(진행 중)
            {"stck_bsop_date": "20261002", "stck_clpr": "70000", "acml_vol": "900000"},
            {"stck_bsop_date": "20261001", "stck_clpr": "69000", "acml_vol": "800000"},
            {}]})  # 빈 행 무시

    http = _mock(handler)
    candles = await KisRest(cfg, KisAuth(cfg, http), http).daily_candles("005930", 20, today="20261005")
    assert [c.date for c in candles] == ["20261001", "20261002"]


async def test_rest_refreshes_token_once_on_expiry(cfg):
    state = {"tokens": 0, "quote": 0}

    def handler(req: httpx.Request):
        if req.url.path.endswith("tokenP"):
            state["tokens"] += 1
            return httpx.Response(200, json={"access_token": f"T{state['tokens']}", "expires_in": 86400})
        state["quote"] += 1
        if state["quote"] == 1:
            return httpx.Response(500, json={"rt_cd": "1", "msg_cd": "EGW00123", "msg1": "기간이 만료된 token"})
        return httpx.Response(200, json={"rt_cd": "0", "output2": []})

    http = _mock(handler)
    await KisRest(cfg, KisAuth(cfg, http), http).daily_candles("005930", 20)
    assert state == {"tokens": 2, "quote": 2}


class FakeWS:
    def __init__(self):
        self.pongs = []

    async def pong(self, data):
        self.pongs.append(data)


async def test_stream_handles_pingpong_ticks_and_bad_frames(cfg):
    got = []
    s = KisStream(cfg, None, got.append)
    ws = FakeWS()
    ping = json.dumps({"header": {"tr_id": "PINGPONG", "datetime": "20261005100000"}})
    await s._handle(ws, ping)
    await s._handle(ws, f"0|H0STCNT0|001|{_record()}")
    await s._handle(ws, "1|H0STCNI0|001|enc")  # 암호화 프레임: 무시하고 계속
    await s._handle(ws, "not json")
    await s._handle(ws, json.dumps({"header": {"tr_id": "H0STCNT0", "tr_key": "005930"},
                                    "body": {"rt_cd": "1", "msg1": "invalid approval"}}))
    assert ws.pongs == [ping.encode()] and len(got) == 1
