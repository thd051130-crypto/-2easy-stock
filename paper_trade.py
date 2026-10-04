#!/usr/bin/env python3
"""스윙 신호를 30만 원 가상계좌로 실제로 샀다고 치고 매일 기록해요. 진짜 주문은 하지 않아요.

규칙은 kr_swing_signals.py와 똑같아요 (돌파 후 눌림 + 코스피 200일선 필터).
  - 장 마감 뒤 신호가 나오면 다음 거래일 시가에 매수, 종목당 평가금액의 1/5, 최대 5종목
  - 30만 원이면 종목당 6만 원이라 요즘 대형주는 1주도 못 사는 경우가 대부분이에요. 그래서 기본은
    소수점 매수(한투·키움·토스 등의 국내주식 소수점 거래처럼)로 기록하고, --whole-shares면 정수 주식만 사요
  - 종가가 5일선 위로 올라오거나 10거래일이 지나면 다음 거래일 시가에 매도
  - 수수료·거래세·슬리피지는 백테스트 "기본" 비용과 같고, 현금 이자와 배당은 넣지 않았어요

기록은 paper/ 폴더에 남아요 (GitHub 앱에서 표로 볼 수 있어요).
  - paper/state.json : 현금, 보유 종목, 다음 날 시가 주문
  - paper/trades.csv : 끝난 거래 (매수가, 매도가, 수익률, 보유일)
  - paper/equity.csv : 날마다 계좌 평가금액과 코스피

사용법:
    python paper_trade.py --csv data/kr_daily_recent.csv   # 하루치 반영, 체결이 있으면 텔레그램
    python paper_trade.py --csv ... --summary              # 요일과 상관없이 주간 결산도 보내기
    python paper_trade.py --csv ... --dry-run              # 전송 없이 출력만
"""

import argparse
import datetime as dt
import json
import math
import os
import pathlib

import pandas as pd

import kr_swing_backtest as kb

KST = dt.timezone(dt.timedelta(hours=9))
COST = kb.COSTS["기본"]
BUY_MULT = 1 + COST["fee"] + COST["slip"]
SELL_MULT = 1 - COST["fee"] - COST["tax"] - COST["slip"]
TRADE_COLUMNS = ["code", "name", "qty", "buy_date", "buy_price", "sell_date", "sell_price", "pnl", "ret", "days",
                 "reason"]
EQUITY_COLUMNS = ["date", "cash", "stocks", "equity", "kospi"]
DISCLAIMER = "가상매매 기록이라 실제 체결가와 다를 수 있고, 과거·가상 성과가 미래 수익을 보장하지 않아요."


def new_state(capital, fractional=True):
    return dict(capital=capital, fractional=fractional, start=None, kospi_start=None, cash=capital, equity=capital, last_day=None,
                positions=[], pending_buys=[], pending_sells=[])


def advance(state, opens, closes, index_close):
    """마지막으로 반영한 날 다음부터 데이터의 마지막 거래일까지 하루씩 진행해요.

    처음이면 마지막 거래일 하나만 반영해요 (그날 신호를 다음 날 시가에 사는 것부터 시작).
    반환: (새로 끝난 거래 목록, 평가금액 행 목록, 이벤트 문장 목록)
    """
    ok = kb.regime(index_close, closes, True)
    entry, exit_, rank, max_hold = kb.dip_after_breakout(closes, ok)
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
            proceeds = pos["qty"] * px * SELL_MULT
            state["cash"] += proceeds
            state["positions"].remove(pos)
            days_held = held_days(calendar, pos["buy_date"], day, max_hold)
            trade = dict(code=pos["code"], name=pos["name"], qty=round(pos["qty"], 4), buy_date=pos["buy_date"],
                         buy_price=round(pos["buy_price"], 2), sell_date=str(day.date()), sell_price=round(float(px), 2),
                         pnl=round(proceeds - pos["cost"]), ret=round(proceeds / pos["cost"] - 1, 4), days=days_held,
                         reason=order["reason"])
            trades.append(trade)
            events.append(f"{label} 매도 {pos['name']} {shares(pos['qty'])} @ {px:,.0f}원 "
                          f"({trade['ret']:+.1%}, {trade['pnl']:+,}원, {order['reason']}, {days_held}일 보유)")

        slot = state["equity"] / kb.MAX_POSITIONS
        held = {p["code"] for p in state["positions"]}
        for order in state["pending_buys"]:
            px = o.get(order["code"])
            if order["code"] in held or px is None or pd.isna(px) or len(held) >= kb.MAX_POSITIONS:
                continue
            unit = float(px) * BUY_MULT
            qty = min(slot, state["cash"]) / unit
            if not state.get("fractional", True):
                qty = math.floor(qty)
            if qty < 1 and not state.get("fractional", True) or qty <= 0:
                events.append(f"{label} 매수 건너뜀 {order['name']}: 시가 {px:,.0f}원이라 "
                              f"종목당 {slot:,.0f}원으로 1주도 못 사요")
                continue
            state["cash"] -= qty * unit
            state["positions"].append(dict(code=order["code"], name=order["name"], qty=qty, buy_date=str(day.date()),
                                           buy_price=float(px), cost=qty * unit))
            held.add(order["code"])
            events.append(f"{label} 매수 {order['name']} {shares(qty)} @ {px:,.0f}원 (약 {qty * unit:,.0f}원)")

        stocks = sum(p["qty"] * float(c[p["code"]]) for p in state["positions"])
        state["equity"] = state["cash"] + stocks
        kospi = float(index_close.loc[day])
        equity_rows.append(dict(date=str(day.date()), cash=round(state["cash"]), stocks=round(stocks),
                                equity=round(state["equity"]), kospi=round(kospi, 2)))
        if state["start"] is None:
            state["start"], state["kospi_start"] = str(day.date()), kospi

        state["pending_sells"] = []
        for p in state["positions"]:
            if held_days(calendar, p["buy_date"], day, max_hold) >= max_hold:
                state["pending_sells"].append(dict(code=p["code"], reason=f"{max_hold}거래일 경과"))
            elif bool(exit_.at[day, p["code"]]):
                state["pending_sells"].append(dict(code=p["code"], reason="종가가 5일선 위"))
        free = kb.MAX_POSITIONS - len(state["positions"]) + len(state["pending_sells"])
        held = {p["code"] for p in state["positions"]}
        today_entry, today_rank = entry.loc[day].fillna(False), rank.loc[day]
        candidates = [code for code in closes.columns
                      if today_entry[code] and code not in held and not pd.isna(today_rank[code])]
        candidates.sort(key=lambda code: -today_rank[code])
        state["pending_buys"] = [dict(code=code, name=kb.UNIVERSE.get(code, code), signal_date=str(day.date()))
                                 for code in candidates[:max(free, 0)]]
        state["last_day"] = str(day.date())
    return trades, equity_rows, events


def shares(qty):
    return f"{qty:.0f}주" if float(qty).is_integer() else f"{qty:.3f}주"


def held_days(calendar, buy_date, day, max_hold):
    """매수일부터 day까지 거래일 수. 데이터에 매수일이 없으면(아주 오래된 보유) 바로 팔도록 max_hold를 돌려줘요."""
    buy = pd.Timestamp(buy_date)
    if buy not in calendar:
        return max_hold
    return int(calendar.get_loc(day) - calendar.get_loc(buy))


def daily_message(state, events):
    gain = state["equity"] / state["capital"] - 1
    lines = ["[가상매매] 시가 체결"] + events
    lines.append(f"평가금액 {state['equity']:,.0f}원 (시작 {state['capital']:,.0f}원 대비 {gain:+.1%})")
    return "\n".join(lines)


def weekly_summary(state, trades, equity, today, closes):
    """trades/equity는 지금까지 쌓인 전체 기록 DataFrame이에요."""
    last = equity.iloc[-1]
    gain = round(last["equity"] / state["capital"] - 1, 4) + 0.0  # -0.0% 대신 +0.0%
    kospi_gain = round(last["kospi"] / state["kospi_start"] - 1, 4) + 0.0
    lines = [f"[가상매매 주간 결산] {today:%Y-%m-%d} ({last['date']} 종가 기준)",
             f"{state['start']} 시작 {state['capital']:,.0f}원 → {last['equity']:,.0f}원 ({gain:+.1%})",
             f"같은 기간 코스피 {kospi_gain:+.1%} ({state['kospi_start']:,.0f} → {last['kospi']:,.0f}), "
             f"차이 {(gain - kospi_gain) * 100:+.1f}%p"]

    monday = pd.Timestamp(today - dt.timedelta(days=today.weekday()))
    before = equity[pd.to_datetime(equity["date"]) < monday]
    if len(before):
        base = before.iloc[-1]
        lines.append(f"이번 주 계좌 {last['equity'] / base['equity'] - 1:+.1%}, "
                     f"코스피 {last['kospi'] / base['kospi'] - 1:+.1%}")

    if len(trades):
        r = trades["ret"]
        week = trades[pd.to_datetime(trades["sell_date"]) >= monday]
        lines.append(f"끝난 거래 {len(r)}건 (이번 주 {len(week)}건), 승률 {(r > 0).mean():.0%}, "
                     f"평균 {r.mean():+.1%}, 실현손익 {trades['pnl'].sum():+,.0f}원")
    else:
        lines.append("아직 끝난 거래가 없어요.")

    if state["positions"]:
        lines.append("보유 중")
        filled = closes.ffill()
        for p in state["positions"]:
            now = float(filled[p["code"]].iloc[-1])
            lines.append(f"- {p['name']} {shares(p['qty'])}, 매수 {p['buy_price']:,.0f}원 → {now:,.0f}원 "
                         f"({now * p['qty'] / p['cost'] - 1:+.1%}, {p['buy_date']} 매수)")
    else:
        lines.append("보유 종목 없음")
    lines.append(f"현금 {state['cash']:,.0f}원")
    if state["pending_buys"]:
        lines.append("다음 거래일 시가 매수 예정: " + ", ".join(o["name"] for o in state["pending_buys"]))
    if state["pending_sells"]:
        names = {p["code"]: p["name"] for p in state["positions"]}
        lines.append("다음 거래일 시가 매도 예정: " + ", ".join(names.get(o["code"], o["code"])
                                                       for o in state["pending_sells"]))
    lines.append("")
    lines.append(DISCLAIMER)
    return "\n".join(lines)


def load(folder, capital, fractional=True):
    path = folder / "state.json"
    state = json.loads(path.read_text()) if path.exists() else new_state(capital, fractional)
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
    parser.add_argument("--csv", type=pathlib.Path, required=True, help="date,ticker,open,close 형식 일봉")
    parser.add_argument("--dir", type=pathlib.Path, default=pathlib.Path("paper"), help="기록 폴더")
    parser.add_argument("--capital", type=float, default=300000, help="처음 만들 때 가상계좌 금액(원)")
    parser.add_argument("--whole-shares", action="store_true", help="처음 만들 때 정수 주식만 사는 계좌로 (기본은 소수점)")
    parser.add_argument("--summary", action="store_true", default=os.getenv("PAPER_SUMMARY") == "true",
                        help="금요일이 아니어도 주간 결산 보내기")
    parser.add_argument("--dry-run", action="store_true", help="텔레그램으로 보내지 않고 출력만")
    args = parser.parse_args()

    from realtime_monitor import send_telegram

    today = dt.datetime.now(KST).date()
    opens, closes, index_close = kb.load_csv(args.csv)
    state, trades, equity = load(args.dir, args.capital, not args.whole_shares)
    new_trades, new_rows, events = advance(state, opens, closes, index_close)
    trades, equity = append(trades, new_trades), append(equity, new_rows)
    save(args.dir, state, trades, equity)

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
