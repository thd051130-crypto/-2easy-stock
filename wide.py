"""넓은 범위 후보: 알림 규칙과 같은 조건을 지금 코스피 시가총액 상위 200개(우선주 제외)로 넓혀 본 참고 후보예요.

알림 규칙의 종목 48개는 2015년 말 기준으로 고정해 뒀어요 (지금 잘나가는 종목만 골라 백테스트가 좋아 보이는 걸 막으려고).
그래서 그 뒤 커진 회사(예: 한화에어로스페이스, HD현대일렉트릭)는 후보에 안 나와요. 여기서는 그 회사들까지 같은 조건으로 봐요.
  - 시장 조건(코스피 50·200일선, 시장 폭)은 알림 규칙 48개로 계산한 것을 그대로 써요
  - 종목 조건: 200일선 위, 최근 10일 안에 20일 신고가 → RSI2 < 10 눌림, 20일 변동성 연 45% 이하
  - 지금 목록으로 과거를 백테스트하면 생존편향이 생겨서 검증할 수 없어요. 그래서 가상계좌에는 넣지 않고
    추천 종목 성과(track.py, src=wide)로만 실제 결과를 쌓아 봐요
종목 목록은 paper/symbols/kr.json(시가총액 순, 매주 fundamentals 워크플로가 갱신)에서 읽어요.
"""

import re

import kr_swing_backtest as kb
import strategy
import symbols
from markets import MARKETS

TOP_N = 200  # 2026-10 100개 → 200개로 늘렸어요
US_TOP_N = 150  # 미장은 신호 대신 '왜 움직였나'(movers.py)에만 써요
PREFERRED = re.compile(r"\d?우[A-C]?(\(.*\))?$")


def universe(n=TOP_N, rows=None):
    """{코드: 이름} 코스피 보통주 시가총액 상위 n개 중 알림 규칙 48개에 없는 종목."""
    rows = symbols.load("kr") if rows is None else rows
    base = MARKETS["kr"]["universe"]
    top = [r for r in rows if r[3] == "s" and r[2] == "KS" and not PREFERRED.search(r[1])][:n]
    return {r[0]: r[1] for r in top if r[0] not in base}


def us_universe(n=US_TOP_N, rows=None):
    """{코드: 이름} 미장 주식 시가총액 상위 n개 중 알림 종목 48개에 없는 종목 (같은 회사 다른 주식(GOOG)은 빼요)."""
    rows = symbols.load("us") if rows is None else rows
    base = MARKETS["us"]["universe"]
    def legal_of(r):  # 'Berkshire Hathaway Inc. New' = 'Berkshire Hathaway Inc.'
        return re.sub(r"\s+New$", "", (r[4] or "").split("|")[0])

    seen = {legal_of(r) for r in rows if r[0] in base}
    out = {}
    for r in rows:
        if len(out) >= n:
            break
        legal = legal_of(r)
        if r[3] != "s" or r[0] in base or (legal and legal in seen):
            continue
        seen.add(legal)
        out[r[0]] = r[1]
    return out


def compute(wide_closes, closes, index_close, names):
    """오늘(마지막 거래일) 넓은 범위 매수 후보. 반환: 대시보드용 목록 (RSI2 낮은 순)."""
    if wide_closes.empty:
        return []
    ok = strategy.kr_frames(closes, index_close)["ok"].reindex(wide_closes.index).fillna(False)
    entry, _, rank, _ = kb.dip_after_breakout(wide_closes, strategy.broadcast(ok, wide_closes))
    entry &= strategy.volatility(wide_closes) <= strategy.KR_STOCK_VOL_MAX
    last = entry.iloc[-1].fillna(False)
    rsi2 = kb.rsi(wide_closes).iloc[-1]
    picks = []
    for code in entry.columns[last.to_numpy(bool)]:
        close = float(wide_closes[code].iloc[-1])
        picks.append(dict(code=code, name=names.get(code, code), close=round(close, 2), rsi2=round(float(rsi2[code]), 1),
                          stop=round(close * (1 - strategy.KR_STOP), 2), rank=float(rank[code].iloc[-1])))
    picks.sort(key=lambda p: -p["rank"])
    for p in picks:
        p.pop("rank")
    return picks


def section(picks, n_names):
    lines = ["", f"[넓은 범위 후보 · 참고] 같은 조건을 지금 코스피 상위 {TOP_N}개로 넓혀 봤어요 "
                 f"(알림 48개 밖 {n_names}개). 검증 전이라 가상계좌엔 안 넣고 성과만 기록해요."]
    if not picks:
        lines.append("오늘은 넓은 범위에서도 조건에 맞는 종목이 없어요.")
    for i, p in enumerate(picks, 1):
        lines.append(f"{i}. {p['name']}({p['code']}) 종가 {p['close']:,.0f}원, RSI2 {p['rsi2']:.1f}, "
                     f"손절 기준 {p['stop']:,.0f}원")
    return "\n".join(lines)
