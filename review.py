"""매매 복기 노트: 가상계좌에서 끝난 거래마다 왜 샀고, 왜 팔았고, 결과가 어땠는지 한 줄로 정리해요.

trades.csv(산 날·판 날·이유·수익률)와 equity.csv(날마다 지수 종가)만 읽어요. 네트워크 필요 없음.
  - 산 이유: 계좌마다 규칙이 하나라서 규칙 이름으로 (국장 알림 규칙, 미장 SPY 추세, ETF, 규칙표)
  - 판 이유: trades.csv의 reason 그대로
  - 같은 기간 지수: 산 날 종가 → 판 날 종가 (기록 시작 전 날짜면 비워요)
  - 평가: 지수보다 나았는지, 손절이 손실을 막았는지
대시보드(dashboard.py)는 거래마다 붙여 앱 성과 화면에, 금요일 결산(paper_trade.py)은 이번 주 잘된·안 된 거래 하나씩.
"""

BUY_REASONS = {
    "kr": "코스피 상승장에서 신고가 뒤 눌림(RSI2 10 아래)",
    "us": "S&P500이 200일선 위 (추세 좋음)",
    "etf": "S&P500이 200일선 위 (추세 좋음)",
    "rulebook": "규칙표 조건 통과 (200일선 위, RSI14 45~60, 거래량 늘어남)",
}


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def index_change(index_by_date, buy_date, sell_date):
    """산 날 → 판 날 지수 변화. 그날 기록이 없으면 그 전 가장 가까운 날로, 기록 시작 전이면 None."""
    days = sorted(index_by_date)

    def at(day):
        prev = [d for d in days if d <= day]
        return index_by_date[prev[-1]] if prev else None

    a, b = at(buy_date), at(sell_date)
    return round(b / a - 1, 4) if a and b else None


def verdict(ret, idx, reason):
    """한 줄 평가."""
    if ret is None:
        return ""
    gap = None if idx is None else (ret - idx) * 100
    if ret > 0:
        if gap is None:
            return f"{ret:+.1%} 벌었어요."
        return (f"{ret:+.1%} 벌었고 같은 기간 지수보다 {gap:+.1f}%p 나았어요." if gap >= 0
                else f"{ret:+.1%} 벌었지만 그냥 지수를 들고 있었으면 {-gap:.1f}%p 더 벌었어요.")
    if "손절" in (reason or ""):
        return f"손절 규칙대로 {ret:+.1%}에서 끊었어요. 더 빠지기 전에 막는 게 이 규칙의 역할이에요."
    if gap is not None and gap >= 0:
        return f"{ret:+.1%} 손실이지만 지수({idx:+.1%})보다는 덜 빠졌어요."
    return f"{ret:+.1%} 손실이에요." + ("" if idx is None else f" 같은 기간 지수는 {idx:+.1%}.")


def notes(trades, index_by_date, kind):
    """trades: trades.csv 줄(dict) 오래된 순 → 복기 노트 (같은 순서). kind: kr|us|etf|rulebook."""
    out = []
    for t in trades:
        ret = num(t.get("ret"))
        idx = index_change(index_by_date, t["buy_date"], t["sell_date"])
        out.append(dict(code=t["code"], name=t["name"], buy_date=t["buy_date"], sell_date=t["sell_date"],
                        ret=ret, index=idx, buy=BUY_REASONS.get(kind, ""), sell=t.get("reason") or "",
                        verdict=verdict(ret, idx, t.get("reason"))))
    return out


def week_lines(week_notes):
    """금요일 결산용: 이번 주 끝난 거래 중 가장 잘된 것·안 된 것 (하나면 하나만)."""
    rows = [n for n in week_notes if n["ret"] is not None]
    if not rows:
        return []
    best, worst = max(rows, key=lambda n: n["ret"]), min(rows, key=lambda n: n["ret"])
    lines = ["이번 주 복기"]
    for label, n in [("잘된 거래", best)] + ([("아쉬운 거래", worst)] if worst is not best else []):
        lines.append(f"- {label}: {n['name']} {n['buy_date'][5:]}→{n['sell_date'][5:]}, 판 이유 {n['sell']}. {n['verdict']}")
    return lines
