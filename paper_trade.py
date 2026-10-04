#!/usr/bin/env python3
"""알림 규칙대로 실제로 샀다고 치고 가상계좌를 매일 기록해요. 진짜 주문은 하지 않아요.

규칙은 strategy.py (알림과 같아요).
  - 국장 30만 원: 신호가 나오면 다음 거래일 시가에 종목당 10%씩 매수, 최대 5종목.
    종가가 5일선 위, 10거래일 경과, 매수가 대비 -5% 손절 중 하나면 다음 날 시가에 매도
  - 미장 300달러: S&P500 추세가 살아 있으면 다음 거래일 시가에 계좌 50%를 SPY로, 꺾이면 다음 날 시가에 전부 매도
  - 계좌가 작아서 1주를 못 사는 경우가 많아 기본은 소수점 매수로 기록해요 (--whole-shares면 정수 주식만)
  - 수수료·세금·슬리피지는 백테스트와 같고, 현금 이자는 넣지 않았어요. 미장은 환율 변동을 빼고 달러로만 계산해요

기록은 paper/<시장>/ 폴더에 남아요 (GitHub 앱에서 표로 볼 수 있어요).
  - state.json : 현금, 보유 종목, 다음 날 시가 주문
  - trades.csv : 끝난 거래 (매수가, 매도가, 수익률, 보유일)
  - equity.csv : 날마다 계좌 평가금액과 지수

사용법:
    python paper_trade.py --market kr --csv data/kr_daily_recent.csv   # 하루치 반영, 체결이 있으면 텔레그램
    python paper_trade.py --market us --csv data/us_daily_recent.csv
    python paper_trade.py ... --summary                                 # 요일과 상관없이 주간 결산도 보내기
    python paper_trade.py ... --dry-run                                 # 전송 없이 출력만
"""

import argparse
import datetime as dt
import json
import math
import os
import pathlib
from zoneinfo import ZoneInfo

import pandas as pd

import kr_swing_backtest as kb
import rulebook
import strategy
from markets import MARKETS, name_of

TIMEZONES = {"kr": ZoneInfo("Asia/Seoul"), "us": ZoneInfo("America/New_York")}
EXIT_REASONS = {"kr": "종가가 5일선 위", "us": "S&P500 추세 꺾임"}
TRADE_COLUMNS = ["code", "name", "qty", "buy_date", "buy_price", "sell_date", "sell_price", "pnl", "ret", "days",
                 "reason"]
EQUITY_COLUMNS = ["date", "cash", "stocks", "equity", "index"]
DISCLAIMER = "가상매매 기록이라 실제 체결가와 다를 수 있고, 과거·가상 성과가 미래 수익을 보장하지 않아요."


def new_state(market, capital=None, fractional=True):
    capital = capital or MARKETS[market]["capital"]
    return dict(market=market, capital=capital, fractional=fractional, start=None, index_start=None, cash=capital,
                equity=capital, last_day=None, positions=[], pending_buys=[], pending_sells=[])


def money(market, x, sign=False):
    plus = "+" if sign and x > 0 else ""
    return f"{plus}{x:,.0f}원" if market == "kr" else f"{plus}{x:,.2f}달러"


def advance(state, opens, closes, index_close):
    """마지막으로 반영한 날 다음부터 데이터의 마지막 거래일까지 하루씩 진행해요 (kb.simulate와 같은 순서).

    처음이면 마지막 거래일 하나만 반영해요 (그날 신호를 다음 날 시가에 사는 것부터 시작).
    반환: (새로 끝난 거래 목록, 평가금액 행 목록, 이벤트 문장 목록)
    """
    market = state["market"]
    cost = MARKETS[market]["cost"]
    buy_mult, sell_mult = 1 + cost["fee"] + cost["slip"], 1 - cost["fee"] - cost["tax"] - cost["slip"]
    f = strategy.FRAMES[market](closes, index_close)
    max_hold, stop, weight = f["max_hold"], f["stop"], f["weight"] or 1 / kb.MAX_POSITIONS
    filled = closes.ffill()
    calendar = closes.index
    if state["last_day"] is None:
        days = calendar[-1:]
    else:
        days = calendar[calendar > pd.Timestamp(state["last_day"])]
    trades, equity_rows, events = [], [], []
    for day in days:
        o, c = opens.loc[day], filled.loc[day]
        label = f"{day:%m-%d}"

        for order in state["pending_sells"]:
            pos = next((p for p in state["positions"] if p["code"] == order["code"]), None)
            px = o.get(order["code"])
            if pos is None or px is None or pd.isna(px):
                continue  # 시가가 없으면(거래정지 등) 오늘 종가에 다시 판단해요
            proceeds = pos["qty"] * px * sell_mult
            state["cash"] += proceeds
            state["positions"].remove(pos)
            days_held = held_days(calendar, pos["buy_date"], day)
            trade = dict(code=pos["code"], name=pos["name"], qty=round(pos["qty"], 4), buy_date=pos["buy_date"],
                         buy_price=round(pos["buy_price"], 2), sell_date=str(day.date()), sell_price=round(float(px), 2),
                         pnl=round(proceeds - pos["cost"], 2), ret=round(proceeds / pos["cost"] - 1, 4), days=days_held,
                         reason=order["reason"])
            trades.append(trade)
            events.append(f"{label} 매도 {pos['name']} {shares(pos['qty'])} @ {money(market, px)} "
                          f"({trade['ret']:+.1%}, {money(market, trade['pnl'], True)}, {order['reason']}, "
                          f"{days_held}일 보유)")

        slot = state["equity"] * weight
        held = {p["code"] for p in state["positions"]}
        for order in state["pending_buys"]:
            px = o.get(order["code"])
            if order["code"] in held or px is None or pd.isna(px) or len(held) >= kb.MAX_POSITIONS:
                continue
            unit = float(px) * buy_mult
            qty = min(slot, state["cash"]) / unit
            if not state.get("fractional", True):
                qty = math.floor(qty)
            if qty < 1 and not state.get("fractional", True) or qty <= 0:
                events.append(f"{label} 매수 건너뜀 {order['name']}: 시가 {money(market, px)}라 "
                              f"종목당 {money(market, slot)}으로 1주도 못 사요")
                continue
            state["cash"] -= qty * unit
            state["positions"].append(dict(code=order["code"], name=order["name"], qty=qty, buy_date=str(day.date()),
                                           buy_price=float(px), cost=qty * unit))
            held.add(order["code"])
            events.append(f"{label} 매수 {order['name']} {shares(qty)} @ {money(market, px)} "
                          f"(약 {money(market, qty * unit)})")

        for p in state["positions"]:
            p["last_price"] = round(float(c[p["code"]]), 2)  # 대시보드가 평가손익을 보여 줄 때 써요
        stocks = sum(p["qty"] * float(c[p["code"]]) for p in state["positions"])
        state["equity"] = state["cash"] + stocks
        index = float(index_close.loc[day])
        equity_rows.append(dict(date=str(day.date()), cash=round(state["cash"], 2), stocks=round(stocks, 2),
                                equity=round(state["equity"], 2), index=round(index, 2)))
        if state["start"] is None:
            state["start"], state["index_start"] = str(day.date()), index

        state["pending_sells"] = []
        for p in state["positions"]:
            if stop and float(c[p["code"]]) < p["buy_price"] * (1 - stop):
                reason = f"손절 (매수가 대비 -{stop:.0%} 아래)"
            elif max_hold and held_days(calendar, p["buy_date"], day, max_hold) >= max_hold:
                reason = f"{max_hold}거래일 경과"
            elif bool(f["exit"].at[day, p["code"]]):
                reason = EXIT_REASONS[market]
            else:
                continue
            state["pending_sells"].append(dict(code=p["code"], reason=reason))
        free = kb.MAX_POSITIONS - len(state["positions"]) + len(state["pending_sells"])
        held = {p["code"] for p in state["positions"]}
        today_entry, today_rank = f["entry"].loc[day].fillna(False), f["rank"].loc[day]
        candidates = [code for code in closes.columns
                      if today_entry[code] and code not in held and not pd.isna(today_rank[code])]
        candidates.sort(key=lambda code: -today_rank[code])
        state["pending_buys"] = [dict(code=code, name=name_of(market, code), signal_date=str(day.date()))
                                 for code in candidates[:max(free, 0)]]
        state["last_day"] = str(day.date())
    return trades, equity_rows, events


def advance_rulebook(book, opens, closes, volumes, index_close):
    """사용자 규칙표(rulebook.py) 가상계좌를 마지막 반영일 다음부터 하루씩 진행해요. 처음이면 마지막 거래일만."""
    market = book["market"]
    ind = rulebook.indicators(closes, volumes, index_close)
    calendar = closes.index
    days = calendar[-1:] if book["last_day"] is None else calendar[calendar > pd.Timestamp(book["last_day"])]
    names = MARKETS[market]["universe"]
    trades, rows, events = [], [], []
    for day in days:
        i = calendar.get_loc(day)
        t, row, ev = rulebook.step(book, day, opens.iloc[i], rulebook.day_row(ind, i), index_close.iloc[i],
                                   MARKETS[market]["cost"], names)
        trades += t
        rows.append(row)
        events += ev
    # 주간 결산·대시보드가 읽는 모양으로 다음 날 주문을 맞춰 둬요
    book["pending_buys"] = [dict(code=o["code"], name=o["name"]) for o in book["orders"] if o["side"] == "buy"]
    book["pending_sells"] = [dict(code=o["code"], reason=o["reason"]) for o in book["orders"] if o["side"] == "sell"]
    return trades, rows, events


def title(state):
    name = MARKETS[state["market"]]["name"]
    return f"규칙표 {name}" if state.get("version") == 2 else name


def shares(qty):
    return f"{qty:.0f}주" if float(qty).is_integer() else f"{qty:.3f}주"


def held_days(calendar, buy_date, day, missing=0):
    """매수일부터 day까지 거래일 수. 데이터에 매수일이 없으면(아주 오래된 보유) missing을 돌려줘요."""
    buy = pd.Timestamp(buy_date)
    if buy not in calendar:
        return missing
    return int(calendar.get_loc(day) - calendar.get_loc(buy))


def daily_message(state, events):
    gain = state["equity"] / state["capital"] - 1
    lines = [f"[가상매매 {title(state)}] 시가 체결"] + events
    lines.append(f"평가금액 {money(state['market'], state['equity'])} "
                 f"(시작 {money(state['market'], state['capital'])} 대비 {gain:+.1%})")
    return "\n".join(lines)


def weekly_summary(state, trades, equity, today, closes):
    """trades/equity는 지금까지 쌓인 전체 기록 DataFrame이에요."""
    market = state["market"]
    m = MARKETS[market]
    last = equity.iloc[-1]
    gain = round(last["equity"] / state["capital"] - 1, 4) + 0.0  # -0.0% 대신 +0.0%
    index_gain = round(last["index"] / state["index_start"] - 1, 4) + 0.0
    lines = [f"[가상매매 {title(state)} 주간 결산] {today:%Y-%m-%d} ({last['date']} 종가 기준)",
             f"{state['start']} 시작 {money(market, state['capital'])} → {money(market, last['equity'])} ({gain:+.1%})",
             f"같은 기간 {m['index_name']} {index_gain:+.1%} ({state['index_start']:,.0f} → {last['index']:,.0f}), "
             f"차이 {(gain - index_gain) * 100:+.1f}%p"]
    dd = equity["equity"] / equity["equity"].cummax() - 1
    lines.append(f"시작 뒤 최대 낙폭 {dd.min() + 0.0:.1%} (지금은 고점 대비 {dd.iloc[-1] + 0.0:.1%})")

    monday = pd.Timestamp(today - dt.timedelta(days=today.weekday()))
    before = equity[pd.to_datetime(equity["date"]) < monday]
    if len(before):
        base = before.iloc[-1]
        lines.append(f"이번 주 계좌 {last['equity'] / base['equity'] - 1:+.1%}, "
                     f"{m['index_name']} {last['index'] / base['index'] - 1:+.1%}")

    if len(trades):
        r = trades["ret"]
        week = trades[pd.to_datetime(trades["sell_date"]) >= monday]
        lines.append(f"끝난 거래 {len(r)}건 (이번 주 {len(week)}건), 승률 {(r > 0).mean():.0%}, "
                     f"평균 {r.mean():+.1%}, 실현손익 {money(market, trades['pnl'].sum(), True)}")
    else:
        lines.append("아직 끝난 거래가 없어요.")

    if state["positions"]:
        lines.append("보유 중")
        filled = closes.ffill()
        for p in state["positions"]:
            now = float(filled[p["code"]].iloc[-1])
            lines.append(f"- {p['name']} {shares(p['qty'])}, 매수 {money(market, p['buy_price'])} → "
                         f"{money(market, now)} ({now * p['qty'] / p['cost'] - 1:+.1%}, {p['buy_date']} 매수)")
    else:
        lines.append("보유 종목 없음")
    lines.append(f"현금 {money(market, state['cash'])}")
    if state["pending_buys"]:
        lines.append("다음 거래일 시가 매수 예정: " + ", ".join(o["name"] for o in state["pending_buys"]))
    if state["pending_sells"]:
        names = {p["code"]: p["name"] for p in state["positions"]}
        lines.append("다음 거래일 시가 매도 예정: " + ", ".join(names.get(o["code"], o["code"])
                                                       for o in state["pending_sells"]))
    lines.append("")
    lines.append(DISCLAIMER)
    return "\n".join(lines)


def load(folder, market, capital=None, fractional=True):
    path = folder / "state.json"
    state = json.loads(path.read_text()) if path.exists() else new_state(market, capital, fractional)
    trades = read_csv(folder / "trades.csv", TRADE_COLUMNS)
    equity = read_csv(folder / "equity.csv", EQUITY_COLUMNS)
    return state, trades, equity


def read_csv(path, columns):
    if path.exists():
        return pd.read_csv(path, dtype={"code": str})
    return pd.DataFrame(columns=columns)


def save(folder, state, trades, equity):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "state.json").write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")
    trades.to_csv(folder / "trades.csv", index=False)
    equity.to_csv(folder / "equity.csv", index=False)


def append(df, rows):
    if not rows:
        return df
    new = pd.DataFrame(rows, columns=df.columns)
    return new if df.empty else pd.concat([df, new], ignore_index=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--market", choices=sorted(MARKETS), default="kr")
    parser.add_argument("--rule", choices=["main", "rulebook"], default="main",
                        help="main=알림 규칙(strategy.py), rulebook=사용자 규칙표(rulebook.py)를 따로 검증")
    parser.add_argument("--csv", type=pathlib.Path, required=True, help="date,ticker,open,close(,volume) 형식 일봉")
    parser.add_argument("--dir", type=pathlib.Path, help="기록 폴더 (기본 paper/<시장>, 규칙표는 paper/<시장>/rulebook)")
    parser.add_argument("--capital", type=float, help="처음 만들 때 가상계좌 금액 (기본 국장 30만 원, 미장 300달러)")
    parser.add_argument("--whole-shares", action="store_true", help="처음 만들 때 정수 주식만 사는 계좌로 (기본은 소수점)")
    parser.add_argument("--summary", action="store_true", default=os.getenv("PAPER_SUMMARY") == "true",
                        help="금요일이 아니어도 주간 결산 보내기")
    parser.add_argument("--dry-run", action="store_true", help="텔레그램으로 보내지 않고 출력만")
    args = parser.parse_args()

    from realtime_monitor import send_telegram

    m = MARKETS[args.market]
    folder = args.dir or pathlib.Path("paper") / args.market / ("rulebook" if args.rule == "rulebook" else "")
    today = dt.datetime.now(TIMEZONES[args.market]).date()
    opens, closes, index_close = kb.load_csv(args.csv, m["index"])
    etf = [c for c in closes.columns if c == strategy.US_ETF]
    if args.rule == "rulebook":
        stocks = [c for c in closes.columns if c in m["universe"]]
        volumes = kb.load_volume(args.csv, closes.index, m["index"])
        volumes = volumes[stocks] if volumes is not None else None
        state, trades, equity = load(folder, args.market, args.capital)
        if state.get("version") != 2:
            state = rulebook.new_book(args.market, args.capital or m["capital"])
        new_trades, new_rows, events = advance_rulebook(state, opens[stocks], closes[stocks], volumes, index_close)
    else:
        if args.market == "us" and etf:  # 미장 알림 규칙은 SPY만 사고팔아요 (같은 파일에 규칙표용 개별주도 있어요)
            opens, closes = opens[etf], closes[etf]
        state, trades, equity = load(folder, args.market, args.capital, not args.whole_shares)
        new_trades, new_rows, events = advance(state, opens, closes, index_close)
    trades, equity = append(trades, new_trades), append(equity, new_rows)
    save(folder, state, trades, equity)

    messages = []
    if events:
        messages.append(daily_message(state, events))
    if (today.weekday() == 4 or args.summary) and len(equity):
        messages.append(weekly_summary(state, trades, equity, today, closes))
    if not new_rows:
        print(f"새 거래일 데이터가 없어요 (마지막 반영일 {state['last_day']}).")
    for text in messages:
        print(text + "\n")
        if not args.dry_run and not send_telegram(text):
            raise SystemExit("텔레그램 전송 실패 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 확인)")


if __name__ == "__main__":
    main()
