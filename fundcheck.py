"""재무 점검: 야후 파이낸스 무료 재무 요약(ROE, 부채비율, 이익 증가율, 이익률, PER)으로 등급을 매기고 실적 발표일을 알려 줘요.

야후는 과거 시점의 재무 자료를 무료로 주지 않아서 백테스트를 할 수 없어요.
그래서 매수 규칙을 바꾸지 않고 '참고 등급'으로만 붙여요 (신호 후보, 종목 화면, 리포트 종목팀이 같이 써요).
예전 부서별 보고(departments.py)의 펀더멘탈부 부분만 남긴 파일이에요. 리포트 부서는 report_desks.py.
"""

import math

# 펀더멘탈 점검 기준 (하나씩 통과하면 1점)
ROE_MIN = 0.08        # 자기자본이익률 8% 이상
DEBT_MAX = 150.0      # 부채비율(야후 debtToEquity, %) 150% 이하. 은행·보험은 원래 높아서 빼고 봐요
PER_MAX = 25.0        # PER 25배 이하 (없으면 예상 PER)
FIN_SECTORS = {"Financial Services"}


def fetch_info(symbol):
    """야후 무료 재무 요약. 실패하면 빈 dict (신호 계산은 그대로 진행)."""
    try:
        import yfinance as yf

        return yf.Ticker(symbol).info or {}
    except Exception as e:  # 네트워크·레이트리밋
        print(f"{symbol} 재무 요약 못 받음: {e}")
        return {}


def _num(x):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(x) or math.isinf(x) else x


def fundamentals(info):
    """야후 info → 우리가 쓰는 숫자만."""
    per = _num(info.get("trailingPE"))
    per_kind = "PER"
    if per is None and _num(info.get("forwardPE")) is not None:
        per, per_kind = _num(info.get("forwardPE")), "예상 PER"
    growth = _num(info.get("earningsGrowth"))
    if growth is None:
        growth = _num(info.get("earningsQuarterlyGrowth"))
    return dict(roe=_num(info.get("returnOnEquity")), debt=_num(info.get("debtToEquity")),
                growth=growth, margin=_num(info.get("profitMargins")), per=per, per_kind=per_kind,
                pbr=_num(info.get("priceToBook")), financial=info.get("sector") in FIN_SECTORS)


def grade(f):
    """점검 항목별 통과 여부와 등급. 자료가 없는 항목은 점수에서 빼요."""
    checks = []
    if f["margin"] is not None or f["roe"] is not None:
        profit = f["margin"] if f["margin"] is not None else f["roe"]
        checks.append(("흑자", profit > 0))
    if f["roe"] is not None:
        checks.append((f"ROE {f['roe']:.0%}", f["roe"] >= ROE_MIN))
    if f["debt"] is not None and not f["financial"]:
        checks.append((f"부채비율 {f['debt']:.0f}%", f["debt"] <= DEBT_MAX))
    if f["growth"] is not None:
        checks.append((f"이익 증가율 {f['growth']:+.0%}", f["growth"] >= 0))
    if f["per"] is not None:
        checks.append((f"{f['per_kind']} {f['per']:.1f}배", 0 < f["per"] <= PER_MAX))
    if len(checks) < 2:
        return dict(grade="자료 없음", score=None, total=len(checks), checks=checks)
    score = sum(ok for _, ok in checks)
    ratio = score / len(checks)
    label = "주의" if (checks[0][0] == "흑자" and not checks[0][1]) or ratio < 0.5 else "양호" if ratio >= 0.75 else "보통"
    return dict(grade=label, score=score, total=len(checks), checks=checks)


def fundamental_line(name, g):
    if g["score"] is None:
        return f"{name}: 야후 재무 자료가 부족해서 판단 보류"
    passed = [c for c, ok in g["checks"] if ok]
    failed = [c for c, ok in g["checks"] if not ok]
    text = f"{name} {g['grade']}({g['score']}/{g['total']})"
    if passed:
        text += f" 좋음: {', '.join(passed)}"
    if failed:
        text += f" / 약함: {', '.join(failed)}"
    if g["grade"] == "주의":
        text += " → 규칙상 매수 신호지만 건너뛰는 것도 방법이에요"
    return text


def next_earnings(symbol):
    """야후가 아는 다음 실적 발표일 (datetime.date). 모르면 None."""
    try:
        import yfinance as yf

        dates = (yf.Ticker(symbol).calendar or {}).get("Earnings Date") or []
        return min(dates) if dates else None
    except Exception as e:
        print(f"{symbol} 실적 발표일 못 받음: {e}")
        return None


def earnings_line(symbol, today, fetch=next_earnings):
    """'실적: 10-28 발표 예정 (23일 뒤)'. 10일 안이면 경고를 붙여요. 모르면 None."""
    day = fetch(symbol)
    if day is None or day < today:
        return None
    left = (day - today).days
    line = f"실적: {day:%m-%d} 발표 예정 ({left}일 뒤)"
    return line + ". 발표 전후로 크게 움직일 수 있어요" if left <= 10 else line


def check_picks(picks, suffix=".KS", fetch=fetch_info):
    """후보 종목마다 펀더멘탈 등급을 붙여요 (picks의 각 dict에 'fund' 추가)."""
    for p in picks:
        g = grade(fundamentals(fetch(f"{p['code']}{suffix}")))
        p["fund"] = dict(grade=g["grade"], score=g["score"], total=g["total"],
                         line=fundamental_line(p["name"], g))
    return picks
