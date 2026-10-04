"""신호 엔진: 틱을 받아 조건을 평가한다. 네트워크 호출 없음 → 웹소켓 루프에서 바로 호출해도 안전."""
from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field

from .config import Config
from .models import Baseline, Signal, Tick, hhmmss_to_sec

RECENT_TICKS = 30


@dataclass
class _SymbolState:
    date: str
    recent: deque = field(default_factory=lambda: deque(maxlen=RECENT_TICKS))
    surge_tier: int = 0
    plunge_tier: int = 0
    last_fired: dict[str, int] = field(default_factory=dict)  # rule → 마지막 발동 시각(초)
    alerts: int = 0


class SignalEngine:
    """조건 (모두 config로 조절):

    - SURGE / PLUNGE : 전일 대비 ±surge_pct 단계(5%, 10%, 15%…)를 처음 넘을 때마다 1회
    - VOLUME_SPIKE   : 누적거래량 ≥ N일 평균 일거래량 × volume_mult (쿨다운 적용)
    - MA_BREAKOUT    : 전일 종가는 N일선 아래, 현재가는 N일선 위로 (쿨다운 적용)

    장 시간(active_from~active_to) 밖의 틱은 상태만 쌓고 신호는 내지 않는다.
    """

    def __init__(self, cfg: Config, baselines: dict[str, Baseline] | None = None):
        self.cfg = cfg
        self.baselines: dict[str, Baseline] = baselines if baselines is not None else {}
        self._state: dict[str, _SymbolState] = {}
        self._from = hhmmss_to_sec(cfg.active_from)
        self._to = hhmmss_to_sec(cfg.active_to)

    def _st(self, t: Tick) -> _SymbolState:
        st = self._state.get(t.code)
        if st is None or st.date != t.date:  # 새 거래일 → 초기화
            st = self._state[t.code] = _SymbolState(date=t.date)
        return st

    def on_tick(self, t: Tick) -> Signal | None:
        if t.price <= 0:
            return None
        st = self._st(t)
        st.recent.append((t.time, t.price, t.volume))
        sec = hhmmss_to_sec(t.time)
        if not (self._from <= sec <= self._to):
            return None

        base = self.baselines.get(t.code)
        rules: list[str] = []
        reasons: list[str] = []

        # 급등/급락: 단계 돌파 시 1회
        step = self.cfg.surge_pct
        tier = math.floor(abs(t.change_pct) / step) if step > 0 else 0
        if t.change_pct > 0 and tier > st.surge_tier:
            st.surge_tier = tier
            rules.append("SURGE")
            reasons.append(f"전일 대비 {t.change_pct:+.2f}% 급등 ({tier * step:.0f}% 단계 돌파)")
        elif t.change_pct < 0 and tier > st.plunge_tier:
            st.plunge_tier = tier
            rules.append("PLUNGE")
            reasons.append(f"전일 대비 {t.change_pct:+.2f}% 급락 ({tier * step:.0f}% 단계 돌파)")

        if base and base.avg_volume > 0:
            ratio = t.acml_volume / base.avg_volume
            if ratio >= self.cfg.volume_mult and self._ready(st, "VOLUME_SPIKE", sec):
                rules.append("VOLUME_SPIKE")
                reasons.append(f"누적거래량 {t.acml_volume:,}주 = {base.ma_window}일 평균의 {ratio:.1f}배")

        if base and base.ma > 0:
            above = t.price >= base.ma * (1 + self.cfg.ma_buffer_pct / 100)
            if above and base.prev_close <= base.ma and self._ready(st, "MA_BREAKOUT", sec):
                rules.append("MA_BREAKOUT")
                reasons.append(f"{base.ma_window}일선({base.ma:,.0f}원) 상향 돌파 (전일 종가 {base.prev_close:,}원은 아래)")

        if not rules or st.alerts >= self.cfg.max_alerts_per_symbol_day:
            return None
        for r in rules:
            st.last_fired[r] = sec
        st.alerts += 1
        return Signal(code=t.code, name="", tick=t, rules=rules, reasons=reasons,
                      baseline=base, recent=list(st.recent))

    def _ready(self, st: _SymbolState, rule: str, sec: int) -> bool:
        last = st.last_fired.get(rule)
        return last is None or sec - last >= self.cfg.cooldown_sec
