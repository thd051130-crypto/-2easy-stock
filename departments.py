"""부서별 보고: 스크리닝·기술적 분석·펀더멘탈·마켓·리스크관리·운용부가 한 줄씩 오늘 상황을 알려 줘요.

전부 무료 규칙 코드예요 (유료 AI·유료 API 안 씀).
  - 펀더멘탈부: 야후 파이낸스 무료 재무 요약(ROE, 부채비율, 이익 증가율, 이익률, PER)으로 후보 종목을 점검해요.
    야후는 과거 시점의 재무 자료를 무료로 주지 않아서 백테스트를 할 수 없어요.
    그래서 매수 규칙을 바꾸지 않고 '참고 등급'으로만 붙여요 (약하면 건너뛰는 것도 방법이라고 알려 줘요).
  - 마켓부: 지수 추세 + 시장 폭(종목 중 200일선 위 비율) + 지수 변동성. 뉴스는 무료로 믿을 만하게 읽을 방법이 없어서 안 봐요.
매수·매도 규칙 자체는 strategy.py에 있어요.
"""

import math

import pandas as pd

import strategy

# 펀더멘탈 점검 기준 (하나씩 통과하면 1점)
ROE_MIN = 0.08        # 자기자본이익률 8% 이상
DEBT_MAX = 150.0      # 부채비율(야후 debtToEquity, %) 150% 이하. 은행·보험은 원래 높아서 빼고 봐요
PER_MAX = 25.0        # PER 25배 이하 (없으면 예상 PER)
FIN_SECTORS = {"Financial Services"}


# ---------------------------------------------------------------- 펀더멘탈부

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


def check_picks(picks, suffix=".KS", fetch=fetch_info):
    """후보 종목마다 펀더멘탈 등급을 붙여요 (picks의 각 dict에 'fund' 추가)."""
    for p in picks:
        g = grade(fundamentals(fetch(f"{p['code']}{suffix}")))
        p["fund"] = dict(grade=g["grade"], score=g["score"], total=g["total"],
                         line=fundamental_line(p["name"], g))
    return picks


# ---------------------------------------------------------------- 마켓부

def breadth(closes, n=200):
    return strategy.breadth(closes, n)


def index_vol(index_close, n=20):
    return strategy.volatility(index_close, n)


def market_line(index_name, index_close, closes=None):
    gap = index_close.iloc[-1] / index_close.rolling(200).mean().iloc[-1] - 1
    trend = "상승 추세" if gap > 0 else "하락 추세"
    parts = [f"{index_name} {trend}(200일선 대비 {gap:+.1%})"]
    if closes is not None and closes.shape[1] >= 5:
        b = breadth(closes).iloc[-1]
        if not pd.isna(b):
            mood = "넓게 오름" if b >= 0.6 else "일부만 오름" if b >= 0.4 else "대부분 약함"
            parts.append(f"시장 폭 {b:.0%}가 200일선 위({mood})")
    vol = index_vol(index_close).iloc[-1]
    if not pd.isna(vol):
        parts.append(f"변동성 연 {vol:.0%}" + (" 높음" if vol > 0.25 else ""))
    return ", ".join(parts) + ". 뉴스는 무료로 믿을 만하게 볼 방법이 없어 안 봐요"


# ---------------------------------------------------------------- 부서별 보고

def kr_report(closes, index_close, market, picks, max_positions):
    above = (closes.iloc[-1] > closes.rolling(200).mean().iloc[-1]).sum()
    screening = f"대형주 {closes.shape[1]}개 중 200일선 위 {above}개, 오늘 조건 통과 {len(picks)}개"
    if picks:
        tech = (f"후보 RSI2 {min(p['rsi2'] for p in picks):.0f}~{max(p['rsi2'] for p in picks):.0f}"
                f" (10 아래면 단기 과매도), 모두 최근 20일 신고가 뒤 첫 눌림")
    else:
        tech = "돌파 뒤 눌린 종목 없음"
    funds = [p["fund"]["line"] for p in picks if "fund" in p]
    fundamental = "; ".join(funds) if funds else "오늘은 점검할 후보 없음"
    risk = (f"종목당 {strategy.KR_WEIGHT:.0%}, 최대 {max_positions}종목(다 차도 절반은 현금), 손절 -{strategy.KR_STOP:.0%}, "
            + ("지수 조건 충족" if market["kospi_ok"] else "지수 조건 미달이라 신규 매수 멈춤"))
    ops = (f"내일 시가에 최대 {min(len(picks), max_positions)}종목 가상 매수 기록" if picks and market["kospi_ok"]
           else "새 주문 없음") + ", 실제 주문은 직접 판단"
    return [("스크리닝부", screening), ("기술적 분석부", tech), ("펀더멘탈부", fundamental),
            ("마켓부", market_line("코스피", index_close, closes)), ("리스크관리부", risk), ("운용부", ops)]


def us_report(index_close, us, etf_info=None, fetch=fetch_info):
    screening = f"개별주는 수수료(0.25%) 때문에 빼고 S&P500 ETF({strategy.US_ETF}) 하나만 봐요"
    gap50 = us["ma50"] / us["ma200"] - 1
    tech = f"50일선이 200일선보다 {gap50:+.1%}" + (" (골든크로스 상태)" if gap50 > 0 else " (데드크로스 상태)")
    info = etf_info if etf_info is not None else fetch(strategy.US_ETF)
    per = _num(info.get("trailingPE"))
    if per is None:
        fundamental = "야후에서 S&P500 PER을 못 받아 판단 보류"
    else:
        level = "비싼 편" if per > 22 else "보통" if per > 15 else "싼 편"
        fundamental = f"S&P500({strategy.US_ETF}) PER {per:.1f}배로 {level} (장기 평균 16~17배). 등급만 알려 주고 규칙은 안 바꿔요"
    risk = (f"계좌 {strategy.US_WEIGHT:.0%}만 ETF, 나머지 현금. 추세가 꺾이거나 변동성이 연 {strategy.US_VOL_MAX:.0%}를 넘으면 "
            f"전부 현금 (지금 {us['vol20']:.0%})")
    act = {True: "보유/매수", False: "현금"}[us["ok"]]
    ops = f"오늘 판단: {act}, 가상계좌에 기록, 실제 주문은 직접 판단"
    return [("스크리닝부", screening), ("기술적 분석부", tech), ("펀더멘탈부", fundamental),
            ("마켓부", market_line("S&P500", index_close)), ("리스크관리부", risk), ("운용부", ops)]


def report_lines(report):
    return ["[부서별 보고]"] + [f"· {dept}: {text}" for dept, text in report]


def report_payload(report):
    return [dict(dept=dept, text=text) for dept, text in report]
