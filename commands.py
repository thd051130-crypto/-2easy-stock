"""텔레그램 봇에게 묻는 명령: 오늘의 리포트, 종목 진단.

bot.py의 Bot.handle이 관심·알림 명령이 아닐 때 여기로 넘겨요. 답은 15분마다 도는 telegram-bot 워크플로가 보내요.
  오늘 / 리포트             저장된 오늘의 리포트 맨 위 요약 (paper/report.json, report_desks.py)
  종목 삼성전자             1년 일봉으로 한 줄 진단 (200일선, RSI, 신고가, 변동성, 재무 등급, 실적 발표일)
내 판단 기록장(메모)은 아무도 안 써서 없앴어요 (사용자 2026-10-24).
"""

import json
import re

import marketdata as md

HELP = ("• 오늘 : 오늘의 리포트 요약\n"
        "• 종목 삼성전자 : 그 종목 한 줄 진단")
HEADS = ("오늘", "리포트", "종목", "진단")


def handle(bot, text):
    """처리했으면 답 문장, 이 모듈 명령이 아니면 None."""
    words = re.sub(r"\s+", " ", text or "").strip().split(" ")
    if not words or words[0] not in HEADS:
        return None
    head, rest = words[0], words[1:]
    if head in ("오늘", "리포트"):
        return today(bot.paper)
    if not rest:
        return "진단할 종목을 같이 보내 주세요. 예: 종목 삼성전자"
    return diagnose(bot, " ".join(rest))


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def money(m, x):
    return f"{x:,.0f}원" if m == "kr" else f"{x:,.2f}달러"


# ---------------------------------------------------------------- 오늘의 리포트

def today(paper):
    r = read_json(paper / "report.json")
    if not r:
        return "아직 저장된 리포트가 없어요."
    lines = [f"[오늘의 리포트] {r['day']}"] + [f"- {x}" for x in r.get("headline") or []]
    lines += ["", "자료가 넘어간 흐름"] + [f"- {x}" for x in r.get("chain") or []]
    lines.append("자세한 내용은 앱 메시지함의 오늘의 리포트에 있어요.")
    return "\n".join(lines)


# ---------------------------------------------------------------- 종목 진단

def history(symbol):
    import yfinance as yf

    h = yf.Ticker(symbol).history(period="2y", auto_adjust=True)
    return h["Close"].dropna() if h is not None and len(h) else None


def diagnose(bot, query, fetch=history, earnings=None):
    hit, candidates = bot.find(query)
    if not hit:
        return bot.not_found(query, candidates, "종목")
    m, row = hit
    code, name = row[0], row[1]
    symbol = f"{code}.{row[2]}" if m == "kr" else code
    close = fetch(symbol)
    if close is None or len(close) < 60:
        return f"{name}({code}) 시세를 충분히 못 받았어요. 잠시 뒤 다시 보내 주세요."
    last = float(close.iloc[-1])
    lines = [f"[종목 진단] {name}({code}) {close.index[-1]:%m-%d} 종가 {money(m, last)}"]
    if len(close) >= 200:
        ma200 = float(close.rolling(200).mean().iloc[-1])
        lines.append(f"- 200일선 {money(m, ma200)}의 {'위' if last > ma200 else '아래'} ({last / ma200 - 1:+.1%})")
    rsi14, rsi2 = float(md.rsi(close, 14).iloc[-1]), float(md.rsi(close, 2).iloc[-1])
    tag = " (눌림)" if rsi2 < 10 else " (과열)" if rsi14 > 70 else ""
    lines.append(f"- RSI14 {rsi14:.0f}, RSI2 {rsi2:.0f}{tag}")
    high20 = float(close.rolling(20).max().iloc[-1])
    lines.append(f"- 20일 최고가 {money(m, high20)}보다 {last / high20 - 1:+.1%}, "
                 f"최근 20일 변동성 연 {float(md.volatility(close).iloc[-1]):.0%}")
    ret = lambda n: last / float(close.iloc[-n - 1]) - 1 if len(close) > n else None  # noqa: E731
    lines.append(f"- 1개월 {ret(21):+.1%}, 3개월 {ret(63):+.1%}" + (f", 1년 {ret(252):+.1%}" if ret(252) is not None else ""))
    fund = ((read_json(bot.paper / m / "fundamentals.json") or {}).get("stocks") or {}).get(code)
    if fund and fund.get("grade"):
        g = fund["grade"]
        lines.append(f"- 재무 등급 {g['grade']} ({g['score']}/{g['total']}): " + ", ".join(c[0] for c in g["checks"] if c[1]))
    if earnings is None:
        import fundcheck

        earnings = fundcheck.earnings_line
    line = earnings(symbol, bot.now().date())
    if line:
        lines.append(f"- {line}")
    lines.append("참고용 숫자예요. 사고팔기는 직접 판단해 주세요.")
    return "\n".join(lines)
