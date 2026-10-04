from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping

REAL_REST = "https://openapi.koreainvestment.com:9443"
REAL_WS = "ws://ops.koreainvestment.com:21000"
PAPER_REST = "https://openapivts.koreainvestment.com:29443"
PAPER_WS = "ws://ops.koreainvestment.com:31000"

MAX_SUBSCRIPTIONS = 41  # KIS 웹소켓 세션당 등록 한도


def load_dotenv(path: str | Path = ".env") -> None:
    """의존성 없이 .env 읽기. 이미 설정된 환경변수는 덮어쓰지 않는다."""
    p = Path(path)
    if not p.is_file():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


def parse_watchlist(raw: str) -> dict[str, str]:
    """'005930:삼성전자,000660' → {'005930': '삼성전자', '000660': ''}"""
    out: dict[str, str] = {}
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        code, _, name = item.partition(":")
        code = code.strip()
        if not (len(code) == 6 and code.isalnum()):
            raise ValueError(f"종목코드는 6자리여야 합니다: {code!r}")
        out[code] = name.strip()
    return out


@dataclass(frozen=True)
class Config:
    kis_app_key: str = ""
    kis_app_secret: str = ""
    kis_env: str = "paper"  # paper | real
    telegram_token: str = ""
    telegram_chat_id: str = ""
    claude_model: str = "claude-opus-5-5"
    claude_effort: str = "low"  # 알림은 속도가 중요 → low
    claude_timeout: float = 25.0
    max_claude_per_hour: int = 30
    watchlist: Mapping[str, str] = field(default_factory=dict)
    # 신호 조건
    surge_pct: float = 5.0  # ±5%, 10%, 15%... 단계마다 1회
    volume_mult: float = 2.0  # 누적거래량 ≥ N일 평균 일거래량 × 배수
    ma_window: int = 20
    ma_buffer_pct: float = 0.2  # 이평선 돌파 판정 여유 (깜빡임 방지)
    cooldown_sec: int = 1800
    max_alerts_per_symbol_day: int = 6
    active_from: str = "090000"
    active_to: str = "152000"  # 동시호가(15:20~) 제외
    state_dir: Path = Path(".state")

    @property
    def rest_base(self) -> str:
        return REAL_REST if self.kis_env == "real" else PAPER_REST

    @property
    def ws_url(self) -> str:
        return REAL_WS if self.kis_env == "real" else PAPER_WS

    @property
    def rest_delay(self) -> float:
        """REST 호출 간격. 모의투자는 초당 2건 제한이라 넉넉히."""
        return 0.6 if self.kis_env != "real" else 0.1

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Config":
        e = os.environ if env is None else env
        g = lambda k, d="": e.get(k, d).strip()  # noqa: E731
        return cls(
            kis_app_key=g("KIS_APP_KEY"),
            kis_app_secret=g("KIS_APP_SECRET"),
            kis_env=g("KIS_ENV", "paper").lower(),
            telegram_token=g("TELEGRAM_BOT_TOKEN"),
            telegram_chat_id=g("TELEGRAM_CHAT_ID"),
            claude_model=g("CLAUDE_MODEL", "claude-opus-5-5"),
            claude_effort=g("CLAUDE_EFFORT", "low"),
            claude_timeout=float(g("CLAUDE_TIMEOUT_SEC", "25")),
            max_claude_per_hour=int(g("MAX_CLAUDE_CALLS_PER_HOUR", "30")),
            watchlist=parse_watchlist(g("WATCHLIST")),
            surge_pct=float(g("SURGE_PCT", "5")),
            volume_mult=float(g("VOLUME_MULT", "2")),
            ma_window=int(g("MA_WINDOW", "20")),
            ma_buffer_pct=float(g("MA_BUFFER_PCT", "0.2")),
            cooldown_sec=int(g("COOLDOWN_MIN", "30")) * 60,
            max_alerts_per_symbol_day=int(g("MAX_ALERTS_PER_SYMBOL_DAY", "6")),
            active_from=g("ACTIVE_FROM", "090000"),
            active_to=g("ACTIVE_TO", "152000"),
            state_dir=Path(g("STATE_DIR", ".state")),
        )

    def problems(self, *, need_kis: bool = True, need_telegram: bool = True) -> list[str]:
        out: list[str] = []
        if self.kis_env not in ("paper", "real"):
            out.append("KIS_ENV는 paper 또는 real")
        if need_kis and not (self.kis_app_key and self.kis_app_secret):
            out.append("KIS_APP_KEY / KIS_APP_SECRET 필요")
        if need_telegram and not (self.telegram_token and self.telegram_chat_id):
            out.append("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 필요")
        if not 2 <= self.ma_window <= 60:
            out.append("MA_WINDOW는 2~60 (일봉 1회 조회로 가져올 수 있는 범위)")
        if not self.watchlist:
            out.append("WATCHLIST 비어 있음 (예: 005930:삼성전자,000660:SK하이닉스)")
        elif len(self.watchlist) > MAX_SUBSCRIPTIONS:
            out.append(f"WATCHLIST는 최대 {MAX_SUBSCRIPTIONS}종목")
        return out
