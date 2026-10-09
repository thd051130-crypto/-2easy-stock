"""주가는 거의 그대로인데 거래량만 크게 늘어난 종목 (참고용, 매매 규칙은 안 바꿔요).

'왜 움직였나'(movers.py)와 같은 종목들(알림 종목 + 넓은 범위 종목)을 봐요.
  - 거래량: 최근 5거래일 평균 거래량이 그 전 20거래일 평균의 2배 이상
  - 주가: 같은 5거래일 동안 종가 변동이 ±3% 이내
가격은 안 움직이는데 손바뀜이 커졌다는 뜻이라, 누가 조용히 사 모으거나(매집) 팔아 넘기는(분산) 중일 수 있어요.
어느 쪽인지는 이 숫자만으로 알 수 없어요. 뉴스·공시와 그 뒤 주가 방향을 같이 보세요.
"""

import pandas as pd

DAYS = 5          # 최근 며칠
BASE = 20         # 그 전 며칠 평균과 비교
MIN_RATIO = 2.0   # 최근 평균 ÷ 평소 평균이 이 배수 이상
MAX_MOVE = 0.03   # 최근 DAYS일 종가 변동이 ±이 안쪽
TOP = 5


def scan(closes, volumes, days=DAYS, base=BASE, min_ratio=MIN_RATIO, max_move=MAX_MOVE):
    """조건에 맞는 종목 [{code, ratio, peak, r5, r20}] (거래량 배수 큰 순)."""
    rows = []
    for code in closes.columns:
        if volumes is None or code not in volumes:
            continue
        both = pd.DataFrame({"c": closes[code], "v": volumes[code]}).dropna()
        if len(both) < days + base + 1 or pd.isna(closes[code].iloc[-1]):
            continue  # 오늘 시세가 없거나 기록이 짧은 종목은 빼요
        c, v = both["c"], both["v"]
        usual = v.iloc[-days - base:-days].mean()
        if usual <= 0:
            continue
        ratio = v.iloc[-days:].mean() / usual
        r5 = c.iloc[-1] / c.iloc[-1 - days] - 1
        if ratio < min_ratio or abs(r5) > max_move:
            continue
        r20 = c.iloc[-1] / c.iloc[-1 - base] - 1 if len(c) > base else None
        rows.append(dict(code=code, ratio=round(float(ratio), 2), peak=round(float(v.iloc[-days:].max() / usual), 2),
                         r5=round(float(r5), 4), r20=None if r20 is None else round(float(r20), 4),
                         close=round(float(c.iloc[-1]), 2)))
    rows.sort(key=lambda r: -r["ratio"])
    return rows


def compute(closes, volumes, names=None, top=TOP):
    """대시보드·알림용 {'rows': [...], 'total': 조건 맞은 수, 'count': 본 종목 수, 기준값들}."""
    names = names or {}
    rows = scan(closes, volumes)
    for r in rows:
        r["name"] = names.get(r["code"], r["code"])
    return dict(rows=rows[:top], total=len(rows), count=int(closes.iloc[-1].notna().sum()),
                days=DAYS, base=BASE, min_ratio=MIN_RATIO, max_move=MAX_MOVE)


def section(result, market_name):
    if not result:
        return ""
    lines = ["", f"[거래량만 급증 · 참고] {market_name} {result['count']}개 종목 중 최근 {result['days']}거래일 "
                 f"주가는 ±{result['max_move']:.0%} 안인데 거래량이 평소({result['base']}일 평균)의 "
                 f"{result['min_ratio']:g}배 이상인 종목"]
    rows = result.get("rows") or []
    if not rows:
        lines.append("오늘은 조건에 맞는 종목이 없어요.")
    for i, r in enumerate(rows, 1):
        r20 = f", 20일 {r['r20']:+.1%}" if r.get("r20") is not None else ""
        lines.append(f"{i}. {r['name']} 거래량 {r['ratio']:.1f}배 (가장 많은 날 {r['peak']:.1f}배) · "
                     f"주가 5일 {r['r5']:+.1%}{r20}")
    if result.get("total", 0) > len(rows):
        lines.append(f"외 {result['total'] - len(rows)}개")
    if rows:
        lines.append("매집인지 물량 넘기기인지는 숫자만으론 몰라요. 뉴스·공시와 그 뒤 주가 방향을 같이 보세요.")
    return "\n".join(lines)


def summary_line(result, esc=str, n=3):
    """텔레그램 요약 한 줄. 없으면 None."""
    rows = (result or {}).get("rows") or []
    if not rows:
        return None
    shown = " · ".join(f"{esc(r['name'])} ×{r['ratio']:.1f}({r['r5']:+.0%})" for r in rows[:n])
    more = result.get("total", len(rows)) - min(n, len(rows))
    return f"🔍 주가 그대로·거래량 급증: {shown}" + (f" 외 {more}개" if more > 0 else "")
