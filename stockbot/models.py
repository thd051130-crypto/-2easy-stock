from __future__ import annotations

from dataclasses import dataclass, field


def hhmmss_to_sec(hhmmss: str) -> int:
    s = hhmmss.zfill(6)
    return int(s[0:2]) * 3600 + int(s[2:4]) * 60 + int(s[4:6])


@dataclass(frozen=True)
class Tick:
    """H0STCNT0(국내주식 실시간체결가) 한 건. 가격 단위는 원."""

    code: str
    date: str  # YYYYMMDD (BSOP_DATE)
    time: str  # HHMMSS (STCK_CNTG_HOUR)
    price: int
    change: int  # 전일 대비 (부호 반영)
    change_pct: float  # 전일 대비율 % (부호 반영)
    open: int
    high: int
    low: int
    ask1: int
    bid1: int
    volume: int  # 체결 거래량 (이번 체결)
    acml_volume: int  # 누적 거래량
    acml_value: int  # 누적 거래대금
    trade_strength: float  # 체결강도 (100 초과 = 매수 우위)
    ask_remain: int  # 총 매도호가 잔량
    bid_remain: int  # 총 매수호가 잔량

    @property
    def prev_close(self) -> int:
        return self.price - self.change


@dataclass(frozen=True)
class Baseline:
    """장 시작 전 일봉으로 계산한 기준값."""

    code: str
    prev_close: int
    ma: float  # N일 이동평균 (전일까지)
    avg_volume: float  # N일 평균 일거래량
    ma_window: int
    last_date: str  # 기준이 된 마지막 일봉 날짜


@dataclass
class Signal:
    code: str
    name: str
    tick: Tick
    rules: list[str]  # SURGE / PLUNGE / VOLUME_SPIKE / MA_BREAKOUT
    reasons: list[str]  # 사람이 읽는 신호 이유
    baseline: Baseline | None
    recent: list[tuple[str, int, int]] = field(default_factory=list)  # (HHMMSS, 가격, 체결량)

    @property
    def label(self) -> str:
        return f"{self.name}({self.code})" if self.name else self.code


@dataclass
class Opinion:
    action: str  # 매수 / 매도 / 관망
    confidence: int  # 1~10
    summary: str
    rationale: list[str]
    stop_loss_price: int  # 0이면 해당 없음/검증 실패
    stop_loss_reason: str
    risks: list[str]
