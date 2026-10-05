"""텔레그램 봇에게 묻는 명령: 오늘 신호, 계좌, 종목 진단, 내 판단 기록장(메모).

bot.py의 Bot.handle이 관심·알림 명령이 아닐 때 여기로 넘겨요. 답은 15분마다 도는 telegram-bot 워크플로가 보내요.
  오늘 / 오늘 미장          저장된 오늘 신호 요약 (paper/<시장>/signal.json)
  계좌                      가상계좌 넷(국장·미장·ETF·규칙표)과 원화 합계
  종목 삼성전자             1년 일봉으로 한 줄 진단 (200일선, RSI, 신고가, 변동성, 알림 조건, 재무 등급, 실적 발표일)
  메모 삼성전자 산다 반도체 회복   내 판단을 남겨요 (산다/안 산다). 20거래일 뒤 결과를 알림 규칙과 비교해요
  메모 목록 / 메모 성적 / 메모 삭제 3
내 판단 기록장은 paper/memos.json에 남고, 금요일 저녁 첫 실행 때 "[내 판단 주간 결산]"을 보내요.
"""

import json
import re

import strategy
import watchlist
from markets import MARKETS

MEMO_HORIZON = 20      # 판단 결과를 보는 거래일
MAX_MEMOS = 200        # 오래된 메모부터 지워요
BUY_WORDS = ("산다", "살래", "살 듯", "사자", "매수", "살거", "살 거", "산다고", "산다.", "담는다", "담기", "사", "살")
SKIP_WORDS = ("안 산다", "안산다", "안 살", "안살", "안 사", "안사", "패스", "관망", "매도", "판다", "팔", "보류", "별로")
HELP = ("• 오늘 (국장/미장) : 오늘 신호 요약\n"
        "• 계좌 : 가상계좌 수익률과 원화 합계\n"
        "• 종목 삼성전자 : 그 종목 한 줄 진단\n"
        "• 메모 삼성전자 산다 (이유) / 메모 카카오 안 산다 : 내 판단 기록\n"
        "• 메모 목록 / 메모 성적 / 메모 삭제 3")
HEADS = ("오늘", "신호", "계좌", "가상계좌", "종목", "진단", "메모", "판단")


def handle(bot, text):
    """처리했으면 답 문장, 이 모듈 명령이 아니면 None."""
    words = re.sub(r"\s+", " ", text or "").strip().split(" ")
    if not words or words[0] not in HEADS:
        return None
    head, rest = words[0], words[1:]
    if head in ("오늘", "신호"):
        market = MARKET_WORDS.get(rest[0]) if rest else None
        return today(bot.paper, market)
    if head in ("계좌", "가상계좌"):
        return accounts(bot.paper)
    if head in ("종목", "진단"):
        if not rest:
            return "진단할 종목을 같이 보내 주세요. 예: 종목 삼성전자"
        return diagnose(bot, " ".join(rest))
    return memo(bot, rest)


MARKET_WORDS = {"국장": "kr", "한국": "kr", "kr": "kr", "미장": "us", "미국": "us", "us": "us"}


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def money(m, x):
    return f"{x:,.0f}원" if m == "kr" else f"{x:,.2f}달러"


# ---------------------------------------------------------------- 오늘 신호

def today(paper, market=None):
    out = []
    for m in [market] if market else ["kr", "us"]:
        s = read_json(paper / m / "signal.json")
        name = MARKETS[m]["name"]
        if not s:
            out.append(f"[{name}] 아직 저장된 신호가 없어요.")
            continue
        head = f"[{name}] {s['day']} 종가 기준"
        if m == "kr":
            if not s.get("ok"):
                lines = [head, s.get("pause") or "오늘은 새로 사지 않는 날이에요."]
            elif not s.get("picks"):
                lines = [head, "매수 신호 없음 (조건은 살아 있어요)"]
            else:
                lines = [head, f"매수 후보 {len(s['picks'])}개"]
                lines += [f"- {p['name']} 종가 {p['close']:,.0f}원, 손절 {p['stop']:,.0f}원" for p in s["picks"][:5]]
            if s.get("wide"):
                lines.append("넓은 범위(참고): " + ", ".join(p["name"] for p in s["wide"][:5]))
        else:
            act = {"buy": f"{s.get('etf', 'SPY')} 매수 신호", "hold": f"{s.get('etf', 'SPY')} 보유 유지",
                   "sell": "전부 팔고 현금", "cash": "현금 유지"}.get(s.get("action"), "-")
            lines = [head, f"S&P500 {s['index']:,.0f} → {act}"]
        if s.get("rulebook"):
            lines.append("규칙표 후보: " + ", ".join(p["name"] for p in s["rulebook"][:5]))
        out.append("\n".join(lines))
    out.append("자세한 이유는 대시보드 신호 화면에 있어요.")
    return "\n\n".join(out)


# ---------------------------------------------------------------- 계좌

def accounts(paper):
    import dashboard

    lines, total, fx = ["가상계좌 (최근 종가 기준)"], 0.0, None
    for m in ("kr", "us"):
        s = read_json(paper / m / "signal.json") or {}
        fx = fx or s.get("usdkrw")
    rows = [("국장 알림", paper / "kr", "kr", 1.0), ("미장 알림", paper / "us", "us", fx),
            ("ETF(원화)", paper / "etf", "kr", 1.0), ("국장 규칙표", paper / "kr" / "rulebook", "kr", 1.0),
            ("미장 규칙표", paper / "us" / "rulebook", "us", fx)]
    for label, folder, m, rate in rows:
        a = dashboard.account(folder, m)
        if not a:
            lines.append(f"- {label}: 아직 첫 기록 전")
            continue
        hold = ", ".join(p["name"] for p in a["positions"]) or "보유 없음"
        lines.append(f"- {label}: {money(m, a['equity'])} ({a['gain']:+.1%}, 최대 낙폭 {a['mdd']:.1%}) · {hold}")
        if "규칙표" not in label and rate:
            total += a["equity"] * rate
    if total:
        lines.append(f"알림 규칙 계좌 셋 합계 약 {total:,.0f}원" + (f" (환율 {fx:,.0f}원)" if fx else ""))
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
    import kr_swing_backtest as kb

    last = float(close.iloc[-1])
    lines = [f"[종목 진단] {name}({code}) {close.index[-1]:%m-%d} 종가 {money(m, last)}"]
    if len(close) >= 200:
        ma200 = float(close.rolling(200).mean().iloc[-1])
        lines.append(f"- 200일선 {money(m, ma200)}의 {'위' if last > ma200 else '아래'} ({last / ma200 - 1:+.1%})")
    rsi14, rsi2 = float(kb.rsi(close, 14).iloc[-1]), float(kb.rsi(close, 2).iloc[-1])
    tag = " (눌림)" if rsi2 < 10 else " (과열)" if rsi14 > 70 else ""
    lines.append(f"- RSI14 {rsi14:.0f}, RSI2 {rsi2:.0f}{tag}")
    high20 = float(close.rolling(20).max().iloc[-1])
    lines.append(f"- 20일 최고가 {money(m, high20)}보다 {last / high20 - 1:+.1%}, "
                 f"최근 20일 변동성 연 {float(strategy.volatility(close).iloc[-1]):.0%}")
    ret = lambda n: last / float(close.iloc[-n - 1]) - 1 if len(close) > n else None  # noqa: E731
    lines.append(f"- 1개월 {ret(21):+.1%}, 3개월 {ret(63):+.1%}" + (f", 1년 {ret(252):+.1%}" if ret(252) is not None else ""))
    sig = read_json(bot.paper / m / "signal.json") or {}
    if any(p["code"] == code for p in sig.get("picks", [])):
        lines.append("- 오늘 알림 규칙 매수 후보예요")
    elif any(p["code"] == code for p in sig.get("wide", [])):
        lines.append("- 오늘 넓은 범위 후보(참고)예요")
    elif code in MARKETS[m]["universe"]:
        lines.append("- 알림 규칙이 보는 종목이지만 오늘은 후보가 아니에요")
    else:
        lines.append("- 알림 규칙이 보는 대형주 목록 밖 종목이에요 (신호는 안 나와요)")
    fund = ((read_json(bot.paper / m / "fundamentals.json") or {}).get("stocks") or {}).get(code)
    if fund and fund.get("grade"):
        g = fund["grade"]
        lines.append(f"- 재무 등급 {g['grade']} ({g['score']}/{g['total']}): " + ", ".join(c[0] for c in g["checks"] if c[1]))
    if earnings is None:
        import departments

        earnings = departments.earnings_line
    line = earnings(symbol, bot.now().date())
    if line:
        lines.append(f"- {line}")
    lines.append("참고용 숫자예요. 사고팔기는 직접 판단해 주세요.")
    return "\n".join(lines)


# ---------------------------------------------------------------- 내 판단 기록장

def load_memos(paper):
    d = watchlist.read(paper / "memos.json", {})
    return dict(next=int(d.get("next") or 1), items=list(d.get("items") or []), last_report=d.get("last_report"))


def view_of(words):
    text = " ".join(words)
    if any(w in text for w in SKIP_WORDS):
        return -1
    if any(w in words for w in BUY_WORDS) or any(w in text for w in BUY_WORDS[:9]):
        return 1
    return None


def memo(bot, rest):
    memos = bot.memos
    if not rest or rest[0] in ("목록", "보기", "리스트"):
        return memo_list(memos)
    if rest[0] in ("성적", "결과", "결산"):
        return memo_report(memos, refresh=bot.memo_prices)
    if rest[0] in ("삭제", "지우기", "빼기"):
        ids = {int(x) for x in rest[1:] if x.isdigit()}
        if not ids:
            return "지울 메모 번호를 같이 보내 주세요. '메모 목록'에서 번호를 볼 수 있어요."
        before = len(memos["items"])
        memos["items"] = [x for x in memos["items"] if x["id"] not in ids]
        return f"메모 {before - len(memos['items'])}개를 지웠어요." if before != len(memos["items"]) else "그 번호의 메모가 없어요."
    # 종목 이름이 몇 낱말일 수 있어서, 판단 낱말이 나오기 전까지를 종목으로 봐요
    cut = next((i for i, w in enumerate(rest) if view_of([w]) is not None or w in ("안",)), len(rest))
    query, tail = " ".join(rest[:cut]), rest[cut:]
    view = view_of(tail)
    if not query or view is None:
        return "이렇게 보내 주세요. 예: 메모 삼성전자 산다 반도체 회복 / 메모 카카오 안 산다"
    hit, candidates = bot.find(query)
    if not hit:
        return bot.not_found(query, candidates, "메모")
    m, row = hit
    symbol = f"{row[0]}.{row[2]}" if m == "kr" else row[0]
    price = bot.last_price(symbol)
    if not price:
        return f"{row[1]}({row[0]}) 지금 가격을 못 받아서 기록하지 못했어요. 잠시 뒤 다시 보내 주세요."
    note = " ".join(w for w in tail if view_of([w]) is None and w != "안")
    item = dict(id=memos["next"], date=f"{bot.now():%Y-%m-%d}", market=m, code=row[0], name=row[1], symbol=symbol,
                view=view, price=round(price, 2), note=note[:100])
    memos["next"] += 1
    memos["items"] = (memos["items"] + [item])[-MAX_MEMOS:]
    word = "산다" if view > 0 else "안 산다"
    return (f"메모 {item['id']}번: {row[1]} {word} @ {money(m, price)}\n"
            f"{MEMO_HORIZON}거래일 뒤 결과를 알림 규칙과 같이 보여 드려요 (금요일 '내 판단 주간 결산', 또는 '메모 성적').")


def memo_list(memos):
    if not memos["items"]:
        return "아직 메모가 없어요. 예: 메모 삼성전자 산다 반도체 회복"
    lines = ["내 판단 기록 (최근 15개)"]
    for x in memos["items"][-15:]:
        word = "산다" if x["view"] > 0 else "안 산다"
        now = f" → {x['ret']:+.1%}" if x.get("ret") is not None else ""
        lines.append(f"{x['id']}. {x['date'][5:]} {x['name']} {word} @ {money(x['market'], x['price'])}{now}"
                     + (f" · {x['note']}" if x.get("note") else ""))
    return "\n".join(lines)


def score(items):
    """끝난 판단(20거래일 지난 것)으로 맞힌 비율. 산다 → 올랐으면, 안 산다 → 내렸으면 맞힘."""
    done = [x for x in items if x.get("ret20") is not None]
    if not done:
        return None
    hit = sum((x["ret20"] > 0) == (x["view"] > 0) for x in done)
    buys = [x["ret20"] for x in done if x["view"] > 0]
    skips = [x["ret20"] for x in done if x["view"] < 0]
    avg = lambda v: sum(v) / len(v) if v else None  # noqa: E731
    return dict(n=len(done), hit=hit / len(done), buy_avg=avg(buys), skip_avg=avg(skips), buys=len(buys),
                skips=len(skips))


def memo_report(memos, refresh=None, paper=None):
    if refresh:
        refresh(memos)
    if not memos["items"]:
        return "아직 메모가 없어요. 예: 메모 삼성전자 산다 반도체 회복"
    lines = ["[내 판단 주간 결산]"]
    s = score(memos["items"])
    if s:
        lines.append(f"{MEMO_HORIZON}거래일 지난 판단 {s['n']}개 중 {s['hit']:.0%} 맞힘")
        if s["buy_avg"] is not None:
            lines.append(f"- '산다' {s['buys']}개 평균 {s['buy_avg']:+.1%}")
        if s["skip_avg"] is not None:
            lines.append(f"- '안 산다' {s['skips']}개 평균 {s['skip_avg']:+.1%} (내렸으면 잘 피한 거예요)")
    else:
        lines.append(f"아직 {MEMO_HORIZON}거래일 지난 판단이 없어요.")
    pending = [x for x in memos["items"] if x.get("ret20") is None]
    if pending:
        lines.append(f"진행 중 {len(pending)}개: " + ", ".join(
            f"{x['name']}({'산다' if x['view'] > 0 else '안 산다'}"
            + (f" {x['ret']:+.1%}" if x.get("ret") is not None else "") + ")" for x in pending[-8:]))
    lines.append("같은 기간 알림 규칙 추천 성과는 대시보드 성과 화면에 있어요. 맞힌 비율이 50%를 꾸준히 넘는지가 핵심이에요.")
    return "\n".join(lines)


def refresh_prices(memos, fetch=history):
    """메모마다 지금 수익률(ret)과 20거래일 뒤 수익률(ret20)을 채워요. 시세는 종목마다 한 번만 받아요."""
    import pandas as pd

    cache = {}
    for x in memos["items"]:
        if x.get("ret20") is not None:
            continue
        if x["symbol"] not in cache:
            try:
                cache[x["symbol"]] = fetch(x["symbol"])
            except Exception as e:
                print(f"{x['symbol']} 시세 못 받음: {e!r}")
                cache[x["symbol"]] = None
        close = cache[x["symbol"]]
        if close is None or not len(close):
            continue
        close = close.copy()
        close.index = pd.to_datetime(close.index).tz_localize(None).normalize()
        after = close[close.index > pd.Timestamp(x["date"])]
        x["ret"] = round(float(close.iloc[-1]) / x["price"] - 1, 4)
        if len(after) >= MEMO_HORIZON:
            x["ret20"] = round(float(after.iloc[MEMO_HORIZON - 1]) / x["price"] - 1, 4)
    return memos


def report_week(memos, now):
    """금요일 18시(한국) 뒤 첫 실행이고 이번 주에 아직 안 보냈으면 그 주 이름('2026-W41'), 아니면 None."""
    week = f"{now:%G-W%V}"
    due = now.weekday() == 4 and now.hour >= 18 and memos.get("last_report") != week and bool(memos["items"])
    return week if due else None


def summary(paper):
    """대시보드용 요약 (네트워크 없이 저장된 값만)."""
    memos = load_memos(paper)
    if not memos["items"]:
        return None
    return dict(score=score(memos["items"]), recent=memos["items"][-10:][::-1], count=len(memos["items"]))
