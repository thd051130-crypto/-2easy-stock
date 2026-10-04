"""한국투자증권(KIS) Open API: 토큰/접속키, 일봉 REST, 실시간 체결가 WebSocket."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable

import httpx
import websockets

from .config import Config
from .models import Baseline, Tick

log = logging.getLogger("stockbot.kis")

KST = timezone(timedelta(hours=9))  # 한국은 DST 없음 → tzdata 불필요

# H0STCNT0 응답 필드 순서 (46개). 공식 샘플의 컬럼 정의와 동일.
H0STCNT0_FIELDS = (
    "MKSC_SHRN_ISCD", "STCK_CNTG_HOUR", "STCK_PRPR", "PRDY_VRSS_SIGN", "PRDY_VRSS",
    "PRDY_CTRT", "WGHN_AVRG_STCK_PRC", "STCK_OPRC", "STCK_HGPR", "STCK_LWPR",
    "ASKP1", "BIDP1", "CNTG_VOL", "ACML_VOL", "ACML_TR_PBMN",
    "SELN_CNTG_CSNU", "SHNU_CNTG_CSNU", "NTBY_CNTG_CSNU", "CTTR", "SELN_CNTG_SMTN",
    "SHNU_CNTG_SMTN", "CCLD_DVSN", "SHNU_RATE", "PRDY_VOL_VRSS_ACML_VOL_RATE", "OPRC_HOUR",
    "OPRC_VRSS_PRPR_SIGN", "OPRC_VRSS_PRPR", "HGPR_HOUR", "HGPR_VRSS_PRPR_SIGN", "HGPR_VRSS_PRPR",
    "LWPR_HOUR", "LWPR_VRSS_PRPR_SIGN", "LWPR_VRSS_PRPR", "BSOP_DATE", "NEW_MKOP_CLS_CODE",
    "TRHT_YN", "ASKP_RSQN1", "BIDP_RSQN1", "TOTAL_ASKP_RSQN", "TOTAL_BIDP_RSQN",
    "VOL_TNRT", "PRDY_SMNS_HOUR_ACML_VOL", "PRDY_SMNS_HOUR_ACML_VOL_RATE", "HOUR_CLS_CODE",
    "MRKT_TRTM_CLS_CODE", "VI_STND_PRC",
)
_IDX = {name: i for i, name in enumerate(H0STCNT0_FIELDS)}
TR_ID_TICK = "H0STCNT0"


def _i(s: str) -> int:
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return 0


def _f(s: str) -> float:
    try:
        return float(s)
    except (TypeError, ValueError):
        return 0.0


def parse_realtime(raw: str) -> list[Tick]:
    """'0|H0STCNT0|004|005930^123929^...' 형태의 데이터 프레임 → Tick 목록.

    프레임 하나에 체결이 여러 건(count) 묶여 올 수 있다.
    """
    parts = raw.split("|", 3)
    if len(parts) < 4:
        raise ValueError(f"unexpected frame: {raw[:80]!r}")
    flag, tr_id, count, payload = parts
    if flag == "1":
        # 체결가 시세는 평문이 정상. 암호화(체결통보 등)는 이 봇이 구독하지 않는다.
        raise ValueError("encrypted frame (not subscribed by this bot)")
    if tr_id != TR_ID_TICK:
        return []
    width = len(H0STCNT0_FIELDS)
    fields = payload.split("^")
    ticks: list[Tick] = []
    for n in range(_i(count) or 1):
        rec = fields[n * width:(n + 1) * width]
        if len(rec) < width:
            log.warning("short record (%d/%d fields) skipped", len(rec), width)
            break
        g = lambda name: rec[_IDX[name]]  # noqa: E731
        sign = g("PRDY_VRSS_SIGN")  # 1상한 2상승 3보합 4하한 5하락
        neg = sign in ("4", "5")
        change = abs(_i(g("PRDY_VRSS"))) * (-1 if neg else 1)
        pct = abs(_f(g("PRDY_CTRT"))) * (-1 if neg else 1)
        ticks.append(Tick(
            code=g("MKSC_SHRN_ISCD"), date=g("BSOP_DATE"), time=g("STCK_CNTG_HOUR"),
            price=_i(g("STCK_PRPR")), change=change, change_pct=pct,
            open=_i(g("STCK_OPRC")), high=_i(g("STCK_HGPR")), low=_i(g("STCK_LWPR")),
            ask1=_i(g("ASKP1")), bid1=_i(g("BIDP1")),
            volume=_i(g("CNTG_VOL")), acml_volume=_i(g("ACML_VOL")),
            acml_value=_i(g("ACML_TR_PBMN")), trade_strength=_f(g("CTTR")),
            ask_remain=_i(g("TOTAL_ASKP_RSQN")), bid_remain=_i(g("TOTAL_BIDP_RSQN")),
        ))
    return ticks


@dataclass(frozen=True)
class Candle:
    date: str
    close: int
    volume: int


def compute_baseline(code: str, candles: list[Candle], window: int) -> Baseline | None:
    """완료된 일봉(오래된 순)으로 전일종가/이동평균/평균거래량 계산."""
    if len(candles) < window:
        return None
    recent = candles[-window:]
    return Baseline(
        code=code,
        prev_close=recent[-1].close,
        ma=sum(c.close for c in recent) / window,
        avg_volume=sum(c.volume for c in recent) / window,
        ma_window=window,
        last_date=recent[-1].date,
    )


class KisAuth:
    """접근토큰(REST)과 웹소켓 접속키 발급. 토큰은 24시간 유효하고 발급 빈도 제한이 있어 파일에 캐시."""

    def __init__(self, cfg: Config, http: httpx.AsyncClient | None = None):
        self.cfg = cfg
        self.http = http or httpx.AsyncClient(timeout=15)
        self._token: str | None = None
        self._token_exp: float = 0.0
        self._cache = cfg.state_dir / f"kis_token_{cfg.kis_env}.json"

    def _load_cache(self) -> None:
        try:
            d = json.loads(self._cache.read_text())
            if d.get("app_key") == self.cfg.kis_app_key and d["exp"] > time.time() + 600:
                self._token, self._token_exp = d["token"], d["exp"]
        except (OSError, ValueError, KeyError):
            pass

    def _save_cache(self) -> None:
        try:
            self._cache.parent.mkdir(parents=True, exist_ok=True)
            self._cache.write_text(json.dumps(
                {"token": self._token, "exp": self._token_exp, "app_key": self.cfg.kis_app_key}))
            self._cache.chmod(0o600)
        except OSError as e:
            log.warning("token cache write failed: %s", e)

    async def token(self, *, force: bool = False) -> str:
        if not force:
            if self._token is None:
                self._load_cache()
            if self._token and self._token_exp > time.time() + 600:
                return self._token
        r = await self.http.post(f"{self.cfg.rest_base}/oauth2/tokenP", json={
            "grant_type": "client_credentials",
            "appkey": self.cfg.kis_app_key, "appsecret": self.cfg.kis_app_secret})
        r.raise_for_status()
        d = r.json()
        self._token = d["access_token"]
        self._token_exp = time.time() + int(d.get("expires_in", 86400))
        self._save_cache()
        return self._token

    async def approval_key(self) -> str:
        r = await self.http.post(f"{self.cfg.rest_base}/oauth2/Approval", json={
            "grant_type": "client_credentials",
            "appkey": self.cfg.kis_app_key, "secretkey": self.cfg.kis_app_secret})
        r.raise_for_status()
        return r.json()["approval_key"]


class KisRest:
    DAILY_PATH = "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice"

    def __init__(self, cfg: Config, auth: KisAuth, http: httpx.AsyncClient | None = None):
        self.cfg, self.auth = cfg, auth
        self.http = http or auth.http

    async def _get(self, path: str, tr_id: str, params: dict) -> dict:
        for attempt in (1, 2):
            token = await self.auth.token(force=attempt == 2)
            r = await self.http.get(self.cfg.rest_base + path, params=params, headers={
                "authorization": f"Bearer {token}", "appkey": self.cfg.kis_app_key,
                "appsecret": self.cfg.kis_app_secret, "tr_id": tr_id, "custtype": "P"})
            d = r.json() if r.content else {}
            expired = r.status_code == 401 or d.get("msg_cd") in ("EGW00123", "EGW00121")
            if expired and attempt == 1:
                log.info("KIS token rejected, refreshing")
                continue
            r.raise_for_status()
            if d.get("rt_cd") not in (None, "0"):
                raise RuntimeError(f"KIS error {d.get('msg_cd')}: {d.get('msg1')}")
            return d
        raise RuntimeError("unreachable")

    async def daily_candles(self, code: str, window: int, today: str | None = None) -> list[Candle]:
        """완료된 일봉만 (오래된 순). 장중이면 오늘 진행 중인 봉은 제외."""
        now = datetime.now(KST)
        today = today or now.strftime("%Y%m%d")
        start = (now - timedelta(days=window * 2 + 10)).strftime("%Y%m%d")
        d = await self._get(self.DAILY_PATH, "FHKST03010100", {
            "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code,
            "FID_INPUT_DATE_1": start, "FID_INPUT_DATE_2": today,
            "FID_PERIOD_DIV_CODE": "D", "FID_ORG_ADJ_PRC": "0"})
        rows = [r for r in d.get("output2", []) if r.get("stck_bsop_date")]
        candles = [Candle(r["stck_bsop_date"], _i(r["stck_clpr"]), _i(r["acml_vol"]))
                   for r in rows if r["stck_bsop_date"] != today]
        candles.sort(key=lambda c: c.date)
        return candles

    async def baselines(self, codes: list[str]) -> dict[str, Baseline]:
        out: dict[str, Baseline] = {}
        for code in codes:
            try:
                b = compute_baseline(code, await self.daily_candles(code, self.cfg.ma_window),
                                     self.cfg.ma_window)
                if b:
                    out[code] = b
                else:
                    log.warning("%s: 일봉 %d개 미만 → 이평/거래량 신호 비활성", code, self.cfg.ma_window)
            except Exception as e:  # 한 종목 실패가 전체를 막지 않게
                log.warning("%s baseline failed: %s", code, e)
            await asyncio.sleep(self.cfg.rest_delay)
        return out


TickHandler = Callable[[Tick], None]
StatusHandler = Callable[[str], Awaitable[None]]


class KisStream:
    """실시간 체결가 구독. 끊기면 지수 백오프로 재접속하고 구독을 복구한다."""

    IDLE_TIMEOUT = 90  # PINGPONG이 ~30초 간격으로 오므로 90초 무응답이면 죽은 연결로 간주

    def __init__(self, cfg: Config, auth: KisAuth, on_tick: TickHandler,
                 on_status: StatusHandler | None = None, ws_url: str | None = None):
        self.cfg, self.auth, self.on_tick, self.on_status = cfg, auth, on_tick, on_status
        self.ws_url = ws_url or cfg.ws_url
        self.connected = asyncio.Event()
        self._reported = False

    def _subscribe_msg(self, approval: str, code: str) -> str:
        return json.dumps({
            "header": {"approval_key": approval, "custtype": "P", "tr_type": "1",
                       "content-type": "utf-8"},
            "body": {"input": {"tr_id": TR_ID_TICK, "tr_key": code}}})

    async def _session(self) -> None:
        approval = await self.auth.approval_key()
        async with websockets.connect(self.ws_url, ping_interval=None, open_timeout=15) as ws:
            for code in self.cfg.watchlist:
                await ws.send(self._subscribe_msg(approval, code))
                await asyncio.sleep(0.1)
            log.info("subscribed %d symbols (%s)", len(self.cfg.watchlist), self.cfg.kis_env)
            self.connected.set()
            if self._reported and self.on_status:
                self._reported = False
                await self.on_status("✅ KIS 실시간 연결 복구")
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=self.IDLE_TIMEOUT)
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8", "replace")
                await self._handle(ws, raw)

    async def _handle(self, ws, raw: str) -> None:
        if raw[:1] in ("0", "1"):
            try:
                for t in parse_realtime(raw):
                    self.on_tick(t)
            except Exception as e:
                log.warning("frame skipped: %s", e)
            return
        try:
            msg = json.loads(raw)
        except ValueError:
            return
        header, body = msg.get("header", {}), msg.get("body") or {}
        if header.get("tr_id") == "PINGPONG":
            await ws.pong(raw.encode())
        elif body.get("rt_cd") not in (None, "0"):
            if body.get("msg1") != "ALREADY IN SUBSCRIBE":
                log.warning("subscribe error %s: %s", header.get("tr_key"), body.get("msg1"))
        else:
            log.debug("ack %s %s", header.get("tr_key"), body.get("msg1"))

    async def run(self) -> None:
        backoff, fails = 1.0, 0
        while True:
            try:
                await self._session()  # 정상이면 영원히 안 돌아옴 → 예외로만 탈출
            except asyncio.CancelledError:
                raise
            except Exception as e:
                was_up = self.connected.is_set()
                self.connected.clear()
                if was_up:  # 정상 운영 중 끊김 → 처음부터 재시도
                    backoff, fails = 1.0, 0
                fails += 1
                log.warning("stream down (%s: %s), retry in %.0fs", type(e).__name__, e, backoff)
                if fails >= 3 and not self._reported and self.on_status:
                    self._reported = True
                    await self.on_status(f"⚠️ KIS 실시간 연결이 끊겨 재접속 중입니다 ({type(e).__name__})")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60.0)
