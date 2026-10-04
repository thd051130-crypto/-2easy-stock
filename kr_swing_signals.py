#!/usr/bin/env python3
"""오늘의 매매 신호(국장·미장)를 계산해서 텔레그램으로 보내요. 주문은 하지 않아요.

규칙은 하락을 줄이는 쪽으로 고른 보수적 규칙이에요 (strategy.py, docs/conservative-backtest.md).
  국장: 코스피가 50·200일선 위일 때만, 돌파 후 눌림(RSI2 < 10) 종목을 종목당 계좌 10%씩 최대 5종목
        매도는 종가가 5일선 위, 10거래일 경과, 매수가 대비 -5% 손절 중 하나가 되면 다음 날 시가
  미장: S&P500이 200일선 위이고 50일선도 200일선 위면 계좌 50%를 S&P500 ETF(SPY 등)로, 아니면 현금

데이터는 야후 파이낸스 일봉(무료)이라 계좌나 증권사 API 키가 없어도 돌아가요.
ANTHROPIC_API_KEY가 있으면 국장 신호마다 Claude가 짧은 의견(이유, 손절 참고선, 리스크)을 붙여요.

사용법:
    python kr_swing_signals.py              # 국장 계산 후 텔레그램 전송
    python kr_swing_signals.py --market us  # 미장 (S&P500 추세)
    python kr_swing_signals.py --dry-run    # 전송 없이 메시지만 출력
    python kr_swing_signals.py --csv my.csv # 받아 둔 데이터로 계산 (형식은 kr_swing_backtest.py와 같음)
    python kr_swing_signals.py --save-csv data/kr_daily_recent.csv  # 받은 데이터를 남겨서 paper_trade.py에 넘기기
"""

import argparse
import datetime as dt
import os
import pathlib
import tempfile

import pandas as pd

import kr_swing_backtest as kb
import strategy
from markets import MARKETS

KST = dt.timezone(dt.timedelta(hours=9))
LOOKBACK_DAYS = 500  # 200일선 계산에 필요한 거래일(약 280일)보다 넉넉하게
CLAUDE_MODEL = "claude-opus-5-5"
TELEGRAM_LIMIT = 4000  # 텔레그램 한 메시지 최대 4096자


def compute_signals(closes, index_close):
    """마지막 거래일 기준 매수 후보와 시장 상태를 돌려줘요."""
    f = strategy.kr_frames(closes, index_close)
    entry, rank, max_hold = f["entry"], f["rank"], f["max_hold"]
    day = closes.index[-1]
    rsi2 = kb.rsi(closes).iloc[-1]
    ma5, ma200 = closes.rolling(5).mean().iloc[-1], closes.rolling(200).mean().iloc[-1]
    high20 = closes.rolling(20).max().iloc[-1]
    picks = []
    for code in entry.columns[entry.iloc[-1].fillna(False).to_numpy(bool)]:
        picks.append(dict(code=code, name=kb.UNIVERSE.get(code, code), close=float(closes[code].iloc[-1]),
                          rsi2=float(rsi2[code]), ma5=float(ma5[code]), ma200=float(ma200[code]),
                          high20=float(high20[code]), rank=float(rank[code].iloc[-1]),
                          recent=[round(float(x)) for x in closes[code].dropna().iloc[-20:]]))
    picks.sort(key=lambda p: -p["rank"])
    index_ma200, index_ma50 = index_close.rolling(200).mean().iloc[-1], index_close.rolling(50).mean().iloc[-1]
    market = dict(day=day, kospi=float(index_close.iloc[-1]), kospi_ma200=float(index_ma200),
                  kospi_ma50=float(index_ma50), kospi_ok=bool(f["ok"].iloc[-1]), max_hold=max_hold)
    return market, picks


def format_message(market, picks, capital, today, opinions=None):
    slot = capital * strategy.KR_WEIGHT
    day = market["day"]
    lines = [f"[국장 신호] {day:%Y-%m-%d} 종가 기준 (보수적 규칙)"]
    if day.date() != today:
        lines.append(f"(오늘 {today:%m-%d} 데이터는 없어서 마지막 거래일로 계산했어요. 주말·휴장이거나 야후 업데이트가 늦은 거예요.)")
    gap = market["kospi"] / market["kospi_ma200"] - 1
    state = "→ 신규 매수 가능" if market["kospi_ok"] else "→ 신규 매수 쉬기"
    lines.append(f"코스피 {market['kospi']:,.0f} (50일선 {market.get('kospi_ma50', float('nan')):,.0f}, "
                 f"200일선 {market['kospi_ma200']:,.0f}, {gap:+.1%}) {state}")
    lines.append("")
    if not picks:
        lines.append("오늘은 매수 신호가 없어요." if market["kospi_ok"] else
                     "코스피가 50일선이나 200일선 아래라 규칙상 새로 사지 않는 날이에요.")
    else:
        lines.append(f"매수 후보 {len(picks)}개 (RSI2 낮은 순, 최대 {kb.MAX_POSITIONS}개)")
        for i, p in enumerate(picks, 1):
            mark = "" if i <= kb.MAX_POSITIONS else " (6번째 이후, 자리 없으면 건너뜀)"
            qty = int(slot // p["close"])
            buy = f"{qty}주 ≈ {qty * p['close']:,.0f}원" if qty else f"{slot:,.0f}원으로는 1주도 못 삼"
            lines.append(f"{i}. {p['name']}({p['code']}) 종가 {p['close']:,.0f}원, RSI2 {p['rsi2']:.1f}{mark}")
            lines.append(f"   내일 시가 매수 / 종가가 5일선({p['ma5']:,.0f}원) 위면 다음 날 매도 / 최대 {market['max_hold']}거래일")
            lines.append(f"   손절: 종가가 매수가 -{strategy.KR_STOP:.0%} 아래(오늘 종가로 사면 "
                         f"{p['close'] * (1 - strategy.KR_STOP):,.0f}원)면 다음 날 시가 매도")
            lines.append(f"   {capital:,.0f}원 계좌 기준 종목당 {strategy.KR_WEIGHT:.0%}({slot:,.0f}원): {buy} (소수점 매수 가능)")
            if opinions and opinions.get(p["code"]):
                lines.append(f"   Claude: {opinions[p['code']]}")
    lines.append("")
    lines.append("백테스트(2011~) 기준 연 +4.8%, 최대 낙폭 -8%, 최악의 해 -3%였어요 (코스피 보유는 연 +8.3%, 최대 낙폭 -44%). "
                 "수익은 적게, 하락은 작게 고른 규칙이고 하락이 아예 없진 않아요. "
                 "과거 성과가 미래를 보장하진 않아요. 이 알림은 참고용이고 주문은 직접 판단해서 하세요.")
    return "\n".join(lines)


def compute_us(index_close):
    """S&P500 추세 상태와 어제 대비 바뀌었는지 돌려줘요."""
    ma50, ma200 = index_close.rolling(50).mean(), index_close.rolling(200).mean()
    ok = (index_close > ma200) & (ma50 > ma200)
    return dict(day=index_close.index[-1], spx=float(index_close.iloc[-1]), ma50=float(ma50.iloc[-1]),
                ma200=float(ma200.iloc[-1]), ok=bool(ok.iloc[-1]), was_ok=bool(ok.iloc[-2]))


def format_us(us, capital, today, etf_close=None):
    day = us["day"]
    lines = [f"[미장 신호] {day:%Y-%m-%d} (뉴욕) 종가 기준 (보수적 규칙)"]
    if day.date() < today - dt.timedelta(days=1):
        lines.append("(최근 거래일 데이터가 아니에요. 주말·휴장이거나 야후 업데이트가 늦은 거예요.)")
    gap = us["spx"] / us["ma200"] - 1
    lines.append(f"S&P500 {us['spx']:,.0f} (50일선 {us['ma50']:,.0f}, 200일선 {us['ma200']:,.0f}, {gap:+.1%})")
    lines.append("")
    weight = f"{strategy.US_WEIGHT:.0%}"
    if us["ok"] and not us["was_ok"]:
        lines.append(f"매수 신호: 다음 거래일 시가에 계좌의 {weight}를 S&P500 ETF({strategy.US_ETF} 등)로 사요.")
    elif us["ok"]:
        lines.append(f"보유 유지: 계좌의 {weight}를 S&P500 ETF로, 나머지는 현금.")
    elif us["was_ok"]:
        lines.append("매도 신호: 추세가 꺾였어요. 다음 거래일 시가에 S&P500 ETF를 전부 팔고 현금으로.")
    else:
        lines.append("현금 유지: S&P500이 200일선 아래거나 50일선이 200일선 아래라 사지 않아요.")
    if etf_close:
        amount = capital * strategy.US_WEIGHT
        lines.append(f"{capital:,.0f}달러 계좌면 {amount:,.0f}달러 ≈ {strategy.US_ETF} {amount / etf_close:.3f}주 "
                     f"(종가 {etf_close:,.2f}달러, 소수점 매수)")
    lines.append("미장 개별주 단타는 국내 증권사 수수료(0.25%)를 내면 백테스트에서 손실이라 지수 ETF만 봐요.")
    lines.append("")
    lines.append("백테스트(2011~, SPY 배당 포함) 연 +5.5%, 최대 낙폭 -11%, 최악의 해 -6%였어요 "
                 "(S&P500 보유는 연 +12.2%, 최대 낙폭 -34%). 하락이 아예 없진 않고, 환율 변동과 세금은 빠져 있어요. "
                 "과거 성과가 미래를 보장하진 않아요. 주문은 직접 판단해서 하세요.")
    return "\n".join(lines)


def claude_opinions(market, picks):
    """ANTHROPIC_API_KEY가 있을 때만 신호별 한두 문장 의견을 받아요. 실패해도 신호 알림은 그대로 보내요."""
    if not picks or not os.getenv("ANTHROPIC_API_KEY"):
        return {}
    try:
        import anthropic

        rows = "\n".join(
            f"{p['code']} {p['name']}: 종가 {p['close']:.0f}, RSI2 {p['rsi2']:.1f}, 5일선 {p['ma5']:.0f}, "
            f"200일선 {p['ma200']:.0f}, 20일 최고가 {p['high20']:.0f}, 최근 20일 종가 {p['recent']}"
            for p in picks[:kb.MAX_POSITIONS])
        prompt = (
            "한국 대형주 스윙 규칙(최근 10일 내 20일 신고가 → RSI2<10 눌림에 다음 날 시가 매수, "
            "종가가 5일선 위면 매도, 최대 10거래일, 매수가 -5% 아래 마감 시 손절, 종목당 계좌 10%)이 아래 종목에서 매수 신호를 냈어요. "
            f"코스피 {market['kospi']:.0f}, 200일선 {market['kospi_ma200']:.0f}.\n\n{rows}\n\n"
            "종목마다 한 줄씩 `코드: 의견` 형식으로만 답하세요. 의견은 한국어 두 문장 이내로, "
            "가격 데이터에서 보이는 신호 이유, 손절 참고선(가격), 주의할 리스크를 담으세요. "
            "수익을 보장하는 표현은 쓰지 말고, 위 숫자 밖의 뉴스나 실적은 지어내지 마세요.")
        client = anthropic.Anthropic(timeout=120.0)
        resp = client.beta.messages.create(
            model=CLAUDE_MODEL, max_tokens=4000, output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            messages=[{"role": "user", "content": prompt}])
        if resp.stop_reason == "refusal":
            print("Claude 의견 생략: 요청이 거절됐어요.")
            return {}
        text = "".join(b.text for b in resp.content if b.type == "text")
    except Exception as e:  # 키 오류, 잔액 부족, 네트워크 등
        print(f"Claude 의견 생략: {e!r}")
        return {}
    out = {}
    for line in text.splitlines():
        code, sep, opinion = line.strip().strip("-* `").partition(":")
        code = code.strip(" `")
        if sep and code in kb.UNIVERSE:
            out[code] = opinion.strip(" `")
    return out


def split_message(text, limit=TELEGRAM_LIMIT):
    parts, current = [], ""
    for line in text.split("\n"):
        if current and len(current) + len(line) + 1 > limit:
            parts.append(current)
            current = ""
        current = f"{current}\n{line}" if current else line
    return parts + [current]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--market", choices=sorted(MARKETS), default="kr", help="kr=국장 스윙, us=미장 S&P500 추세")
    parser.add_argument("--csv", type=pathlib.Path, help="date,ticker,open,close 형식 (없으면 야후에서 받아요)")
    parser.add_argument("--capital", type=float, help="계좌 금액 (기본 국장 30만 원, 미장 300달러)")
    parser.add_argument("--dry-run", action="store_true", help="텔레그램으로 보내지 않고 출력만")
    parser.add_argument("--save-csv", type=pathlib.Path, help="받은 야후 데이터를 이 경로에 남겨요 (가상매매 기록이 같이 써요)")
    args = parser.parse_args()

    from realtime_monitor import send_telegram

    m = MARKETS[args.market]
    capital = args.capital or float(os.getenv(f"CAPITAL_{args.market.upper()}") or m["capital"])
    today = dt.datetime.now(KST).date()
    path = args.csv
    if path is None:
        path = args.save_csv or pathlib.Path(tempfile.mkdtemp()) / f"{args.market}_daily_recent.csv"
        universe = m["universe"] if args.market == "kr" else {strategy.US_ETF: strategy.US_ETF}
        try:
            kb.download(path, start=f"{today - dt.timedelta(days=LOOKBACK_DAYS):%Y-%m-%d}", universe=universe,
                        index=m["index"], suffix=m["suffix"])
        except SystemExit as e:
            if not args.dry_run:
                send_telegram(f"[{m['name']} 신호] 야후 시세를 못 받아서 오늘 신호를 계산하지 못했어요: {e}")
            raise
    opens, closes, index_close = kb.load_csv(path, m["index"])
    if args.market == "us":
        etf = closes[strategy.US_ETF].dropna() if strategy.US_ETF in closes else None
        text = format_us(compute_us(index_close), capital, today, float(etf.iloc[-1]) if etf is not None else None)
    else:
        market, picks = compute_signals(closes, index_close)
        text = format_message(market, picks, capital, today, claude_opinions(market, picks))
    print(text)
    if not args.dry_run:
        for part in split_message(text):
            if not send_telegram(part):
                raise SystemExit("텔레그램 전송 실패 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 확인)")


if __name__ == "__main__":
    main()
