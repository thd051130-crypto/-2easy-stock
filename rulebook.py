"""사용자 매매 규칙표(2026-10-04)를 하루 단위로 돌리는 엔진. 알림·가상매매·백테스트가 모두 이걸 써요.

규칙표                         → 여기서 정한 구현 (애매한 부분은 [기본값])
  원금 보존 최우선               → 아래 손실 한도를 모두 지켜요
  추세: 200일선 위               → 종가 > 200일선 (종목)
  진입: 60일선 > 200일선         → 종목 60일선 > 200일선
  RSI 45~60                      → RSI(14) 45 이상 60 이하
  거래량 20일 평균 이상          → 오늘 거래량 >= 최근 20일 평균
  급등주 추격 금지               → [오늘 +5% 넘게 올랐거나 5일간 +10% 넘게 오른 종목은 제외]
  분할매수 30/30/40              → [1차 30%는 신호 다음 날 시가. 2차 30%, 3차 40%는 종가가 직전 매수가보다
                                    올라 있고 추세가 살아 있을 때 다음 날 시가 (오를 때만 더 사요, 물타기 금지)]
  분할익절 30/30/40, 거래당 +1~3% → 종가가 평균 매수가 +1%면 30%, +2%면 30%, +3%면 남은 40%를 다음 날 시가에 매도
                                    (익절을 시작하면 더 사지 않아요)
  손절 종가 -2%                  → 종가가 평균 매수가보다 2% 넘게 낮으면 다음 날 시가에 전부 매도
  하루/주간/월간 손실 -1/-2/-4%  → [계좌가 그날 -1%면 다음 거래일, 그 주 누적 -2%면 그 주 끝까지,
                                    그 달 누적 -4%면 그 달 끝까지 신규 매수와 추가 매수를 멈춰요. 손절·익절은 계속]
  레버리지 사용 안 함            → 현금 안에서만 사요
  [그 밖] 종목당 계좌의 20%(1~3차 합계), 최대 5종목. 종가가 200일선 아래로 가거나 20거래일이 지나면 정리.
"""

import numpy as np
import pandas as pd

import kr_swing_backtest as kb
import strategy

SLOTS = 5
SLOT_WEIGHT = 1 / SLOTS
TRANCHES = (0.3, 0.3, 0.4)
TAKE_PROFIT = ((0.01, 0.3), (0.02, 0.3), (0.03, 0.4))
STOP = 0.02
RSI_LOW, RSI_HIGH = 45, 60
CHASE_DAY, CHASE_5D = 0.05, 0.10
DAY_HALT, WEEK_HALT, MONTH_HALT = -0.01, -0.02, -0.04
MAX_HOLD = 20


def indicators(closes, volumes, index_close, index_filter=False):
    ma60, ma200 = closes.rolling(60).mean(), closes.rolling(200).mean()
    rsi14 = kb.rsi(closes, 14)
    day_ret = closes.pct_change(fill_method=None)
    ret5 = closes.pct_change(5, fill_method=None)
    chase = (day_ret > CHASE_DAY) | (ret5 > CHASE_5D)
    trend = (closes > ma200) & (ma60 > ma200)
    if volumes is not None:
        vol_avg = volumes.rolling(20).mean()
        vol_ratio = volumes / vol_avg
        vol_ok = volumes >= vol_avg
    else:  # 거래량이 없는 옛 데이터면 거래량 조건은 빼요
        vol_ratio = pd.DataFrame(1.0, closes.index, closes.columns)
        vol_ok = pd.DataFrame(True, closes.index, closes.columns)
    entry = trend & (rsi14 >= RSI_LOW) & (rsi14 <= RSI_HIGH) & vol_ok & ~chase
    if index_filter:
        entry &= strategy.broadcast(index_close > index_close.rolling(200).mean(), closes)
    return dict(entry=entry.fillna(False), trend=trend.fillna(False), chase=chase.fillna(False),
                rsi14=rsi14, ma60=ma60, ma200=ma200, vol_ratio=vol_ratio, day_ret=day_ret, close=closes.ffill())


def new_book(market, capital):
    return dict(version=2, market=market, capital=capital, cash=capital, equity=capital, start=None,
                index_start=None, last_day=None, positions=[], orders=[], halt_next=False, halt_week=None,
                halt_month=None, week=None, month=None)


def week_key(day):
    iso = day.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def step(book, day, opens, ind, index_value, cost, names):
    """하루 진행: 시가에 어제 주문 체결 → 종가로 평가·손실 한도 → 내일 시가 주문.

    opens: 그날 시가 Series, ind: indicators()의 그날 행(dict of Series).
    반환: (끝난 매도 기록 목록, 평가금액 행, 이벤트 문장 목록)
    """
    buy_mult, sell_mult = 1 + cost["fee"] + cost["slip"], 1 - cost["fee"] - cost["tax"] - cost["slip"]
    sells, events = [], []
    label = f"{day:%m-%d}"
    won = book["market"] == "kr"
    fmt = (lambda x: f"{x:,.0f}원") if won else (lambda x: f"{x:,.2f}달러")  # noqa: E731
    halted = book["halt_next"] or book["halt_week"] == week_key(day) or book["halt_month"] == f"{day:%Y-%m}"
    by_code = {p["code"]: p for p in book["positions"]}

    for order in [o for o in book["orders"] if o["side"] == "sell"]:
        pos, px = by_code.get(order["code"]), opens.get(order["code"])
        if pos is None or px is None or pd.isna(px):
            continue  # 시가가 없으면(거래정지 등) 오늘 종가에 다시 판단해요
        frac = order["frac"]
        qty, cost_part = pos["qty"] * frac, pos["cost"] * frac
        proceeds = qty * float(px) * sell_mult
        book["cash"] += proceeds
        sells.append(dict(code=pos["code"], name=pos["name"], qty=round(qty, 4), buy_date=pos["buy_date"],
                          buy_price=round(pos["buy_price"], 2), sell_date=str(day.date()),
                          sell_price=round(float(px), 2), pnl=round(proceeds - cost_part, 2),
                          ret=round(proceeds / cost_part - 1, 4), days=pos["days"], reason=order["reason"]))
        events.append(f"{label} 매도 {pos['name']} {frac:.0%} @ {fmt(px)} ({sells[-1]['ret']:+.1%}, {order['reason']})")
        if frac >= 0.999:
            book["positions"].remove(pos)
            del by_code[pos["code"]]
        else:
            pos["qty"] -= qty
            pos["cost"] -= cost_part
            pos["tp"] = order.get("tp", pos["tp"])

    for order in [o for o in book["orders"] if o["side"] == "buy"]:
        px = opens.get(order["code"])
        if px is None or pd.isna(px):
            continue
        if halted:
            events.append(f"{label} 매수 보류 {order['name']}: 손실 한도에 걸려 신규·추가 매수를 쉬어요")
            continue
        pos = by_code.get(order["code"])
        if pos is None and len(book["positions"]) >= SLOTS:
            continue
        slot = pos["slot"] if pos else book["equity"] * SLOT_WEIGHT
        k = pos["tranches"] if pos else 0
        amount = min(slot * TRANCHES[k], book["cash"])
        if amount <= 0:
            continue
        unit = float(px) * buy_mult
        qty = amount / unit
        book["cash"] -= amount
        if pos is None:
            pos = dict(code=order["code"], name=order["name"], qty=0.0, cost=0.0, buy_price=0.0, raw=0.0,
                       slot=slot, tranches=0, tp=0, days=0, buy_date=str(day.date()), last_buy=0.0)
            book["positions"].append(pos)
            by_code[pos["code"]] = pos
        pos["raw"] += qty * float(px)
        pos["qty"] += qty
        pos["cost"] += amount
        pos["buy_price"] = pos["raw"] / pos["qty"]
        pos["last_buy"] = float(px)
        pos["tranches"] = k + 1
        events.append(f"{label} {k + 1}차 매수 {order['name']} @ {fmt(px)} (약 {fmt(amount)})")

    close = ind["close"]
    for p in book["positions"]:
        p["last_price"] = float(close[p["code"]])
        if p["buy_date"] != str(day.date()):
            p["days"] += 1  # 매수한 날 종가는 0일
    stocks = sum(p["qty"] * p["last_price"] for p in book["positions"])
    prev = book["equity"]
    equity = book["cash"] + stocks
    row = dict(date=str(day.date()), cash=round(book["cash"], 2), stocks=round(stocks, 2), equity=round(equity, 2),
               index=round(float(index_value), 2))
    if book["start"] is None:
        book["start"], book["index_start"] = str(day.date()), float(index_value)

    wk, mo = week_key(day), f"{day:%Y-%m}"
    if not book["week"] or book["week"]["key"] != wk:
        book["week"] = dict(key=wk, base=prev)
    if not book["month"] or book["month"]["key"] != mo:
        book["month"] = dict(key=mo, base=prev)
    book["halt_next"] = equity / prev - 1 <= DAY_HALT
    if equity / book["week"]["base"] - 1 <= WEEK_HALT:
        book["halt_week"] = wk
    if equity / book["month"]["base"] - 1 <= MONTH_HALT:
        book["halt_month"] = mo
    book["equity"] = equity

    orders = []
    exiting = set()
    for p in book["positions"]:
        c = p["last_price"]
        reason, frac, tp = None, 1.0, p["tp"]
        if c < p["buy_price"] * (1 - STOP):
            reason = f"손절 (평균가 -{STOP:.0%} 아래)"
        elif not bool(ind["trend"].get(p["code"], False)):
            reason = "추세 이탈 (200일선 또는 60일선 아래)"
        elif p["days"] >= MAX_HOLD:
            reason = f"{MAX_HOLD}거래일 경과"
        else:
            reached = sum(c >= p["buy_price"] * (1 + t) for t, _ in TAKE_PROFIT)
            if reached > p["tp"]:
                left = sum(f for _, f in TAKE_PROFIT[p["tp"]:])
                frac = 1.0 if reached == len(TAKE_PROFIT) else sum(f for _, f in TAKE_PROFIT[p["tp"]:reached]) / left
                reason, tp = f"익절 +{TAKE_PROFIT[reached - 1][0]:.0%}", reached
        if reason:
            orders.append(dict(side="sell", code=p["code"], frac=frac, reason=reason, tp=tp))
            if frac >= 0.999:
                exiting.add(p["code"])
        elif (p["tranches"] < len(TRANCHES) and p["tp"] == 0 and c > p["last_buy"]
              and not bool(ind["chase"].get(p["code"], False))):
            orders.append(dict(side="buy", code=p["code"], name=p["name"], kind="add"))
    held = {p["code"] for p in book["positions"]}
    free = SLOTS - len(held) + len(exiting)
    entry, rank = ind["entry"], ind["vol_ratio"]
    candidates = [code for code in entry.index if bool(entry[code]) and code not in held]
    candidates.sort(key=lambda code: -(0 if pd.isna(rank[code]) else rank[code]))
    for code in candidates[:max(free, 0)]:
        orders.append(dict(side="buy", code=code, name=names.get(code, code), kind="new"))
    book["orders"] = orders
    book["last_day"] = str(day.date())
    return sells, row, events


def day_row(ind, i):
    return {k: v.iloc[i] for k, v in ind.items()}


def run(opens, closes, volumes, index_close, market, cost, names=None, start=None, capital=1.0, index_filter=False,
        cash_rate=0.0):
    """백테스트: start(없으면 처음)부터 끝까지 하루씩. 반환: (평가금액 Series, 매도 기록 목록, book).
    cash_rate: 놀고 있는 현금 이자 (기존 백테스트와 같은 조건으로 비교할 때 kb.CASH_RATE)."""
    ind = indicators(closes, volumes, index_close, index_filter)
    book = new_book(market, capital)
    rows, sells = [], []
    daily_cash = (1 + cash_rate) ** (1 / 252) - 1
    for i, day in enumerate(closes.index):
        if start is not None and day < pd.Timestamp(start):
            continue
        book["cash"] *= 1 + daily_cash
        s, row, _ = step(book, day, opens.iloc[i], day_row(ind, i), index_close.iloc[i], cost, names or {})
        sells += s
        rows.append(row)
    curve = pd.Series([r["equity"] for r in rows], index=pd.to_datetime([r["date"] for r in rows])) / capital
    return curve, sells, book


def candidates(ind_today, limit=SLOTS):
    """오늘 종가 기준 규칙표 매수 후보 (거래량이 평소보다 많이 는 순)."""
    entry, rank = ind_today["entry"], ind_today["vol_ratio"]
    codes = [c for c in entry.index if bool(entry[c])]
    codes.sort(key=lambda c: -(0 if pd.isna(rank[c]) else rank[c]))
    return codes[:limit]


def opinion(code, ind_today, close, index_ok=None, market="kr"):
    """새 규칙 기준 매수 이유·주문 가격·위험 (텔레그램·대시보드 공용)."""
    rsi = float(ind_today["rsi14"][code])
    ma60, ma200 = float(ind_today["ma60"][code]), float(ind_today["ma200"][code])
    vr = float(ind_today["vol_ratio"][code])
    dr = float(ind_today["day_ret"][code])
    reason = (f"이유: 200일선보다 {close / ma200 - 1:+.0%} 위, 60일선이 200일선보다 {ma60 / ma200 - 1:+.0%} 위, "
              f"RSI14 {rsi:.0f}(45~60), 거래량 20일 평균의 {vr:.1f}배")
    f = (lambda x: f"{x:,.0f}") if market == "kr" else (lambda x: f"{x:,.2f}")  # noqa: E731
    plan = (f"계획: 내일 시가에 1차 30% → 오르면 2차 30%, 3차 40%. 손절 {f(close * (1 - STOP))} (평균가 -2%), "
            f"익절 {f(close * 1.01)} / {f(close * 1.02)} / {f(close * 1.03)} (+1/2/3%, 오늘 종가 기준)")
    risks = []
    if dr > 0.03:
        risks.append(f"오늘 {dr:+.1%} 올라서 내일 시가가 높게 시작할 수 있어요")
    if close / ma200 - 1 > 0.30:
        risks.append("200일선과 30% 넘게 벌어져 있어 되돌림이 클 수 있어요")
    if index_ok is False:
        risks.append("지수는 200일선 아래라 시장 전체는 약해요")
    if not risks:
        risks.append("지금 숫자로는 특별한 경고 없음")
    return [reason, plan, "위험: " + "; ".join(risks)]
