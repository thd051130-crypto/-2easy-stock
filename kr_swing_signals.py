#!/usr/bin/env python3
"""오늘의 스윙 매수 신호를 계산해서 텔레그램으로 보내요. 주문은 하지 않아요.

규칙은 백테스트(docs/swing-backtest-kr.md)에서 가장 나았던 "조합: 돌파 후 눌림 + 코스피 200일선 필터" 기본값이에요.
  - 매수 후보: 최근 10일 안에 20일 신고가를 낸 종목이 RSI2 < 10으로 눌림 (종목 200일선 위, 코스피 200일선 위)
  - 매수: 다음 날 시가, 최대 5종목, RSI2가 낮은 순서
  - 매도: 종가가 5일선 위로 올라오면 다음 날 시가, 또는 10거래일 경과

데이터는 야후 파이낸스 일봉(무료)이라 계좌나 증권사 API 키가 없어도 돌아가요.
ANTHROPIC_API_KEY가 있으면 신호마다 Claude가 짧은 의견(이유, 손절 참고선, 리스크)을 붙여요.

사용법:
    python kr_swing_signals.py              # 계산 후 텔레그램 전송
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

KST = dt.timezone(dt.timedelta(hours=9))
LOOKBACK_DAYS = 500  # 200일선 계산에 필요한 거래일(약 280일)보다 넉넉하게
CLAUDE_MODEL = "claude-opus-5-5"
TELEGRAM_LIMIT = 4000  # 텔레그램 한 메시지 최대 4096자


def compute_signals(closes, index_close):
    """마지막 거래일 기준 매수 후보와 시장 상태를 돌려줘요."""
    ok = kb.regime(index_close, closes, True)
    entry, _, rank, max_hold = kb.dip_after_breakout(closes, ok)
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
    index_ma200 = index_close.rolling(200).mean().iloc[-1]
    market = dict(day=day, kospi=float(index_close.iloc[-1]), kospi_ma200=float(index_ma200),
                  kospi_ok=bool(ok.iloc[-1, 0]), max_hold=max_hold)
    return market, picks


def format_message(market, picks, capital, today, opinions=None):
    slot = capital / kb.MAX_POSITIONS
    day = market["day"]
    lines = [f"[스윙 신호] {day:%Y-%m-%d} 종가 기준"]
    if day.date() != today:
        lines.append(f"(오늘 {today:%m-%d} 데이터는 없어서 마지막 거래일로 계산했어요. 주말·휴장이거나 야후 업데이트가 늦은 거예요.)")
    gap = market["kospi"] / market["kospi_ma200"] - 1
    state = "위 → 신규 매수 가능" if market["kospi_ok"] else "아래 → 신규 매수 쉬기"
    lines.append(f"코스피 {market['kospi']:,.0f} (200일선 {market['kospi_ma200']:,.0f}, {gap:+.1%}) {state}")
    lines.append("")
    if not picks:
        lines.append("오늘은 매수 신호가 없어요." if market["kospi_ok"] else
                     "코스피가 200일선 아래라 규칙상 새로 사지 않는 날이에요.")
    else:
        lines.append(f"매수 후보 {len(picks)}개 (RSI2 낮은 순, 최대 {kb.MAX_POSITIONS}개)")
        for i, p in enumerate(picks, 1):
            mark = "" if i <= kb.MAX_POSITIONS else " (6번째 이후, 자리 없으면 건너뜀)"
            qty = int(slot // p["close"])
            buy = f"{qty}주 ≈ {qty * p['close']:,.0f}원" if qty else f"{slot:,.0f}원으로는 1주도 못 삼"
            lines.append(f"{i}. {p['name']}({p['code']}) 종가 {p['close']:,.0f}원, RSI2 {p['rsi2']:.1f}{mark}")
            lines.append(f"   내일 시가 매수 / 종가가 5일선({p['ma5']:,.0f}원) 위면 다음 날 매도 / 최대 {market['max_hold']}거래일")
            lines.append(f"   {capital:,.0f}원 계좌 기준 종목당 {slot:,.0f}원: {buy}")
            if opinions and opinions.get(p["code"]):
                lines.append(f"   Claude: {opinions[p['code']]}")
    lines.append("")
    lines.append("백테스트(2019~) 기준 연 +7%, 최대 낙폭 -18%였고 같은 기간 그냥 보유(+15%)보다 덜 벌었어요. "
                 "과거 성과가 미래를 보장하진 않아요. 이 알림은 참고용이고 주문은 직접 판단해서 하세요.")
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
            "종가가 5일선 위면 매도, 최대 10거래일)이 아래 종목에서 매수 신호를 냈어요. "
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
    parser.add_argument("--csv", type=pathlib.Path, help="date,ticker,open,close 형식 (없으면 야후에서 받아요)")
    parser.add_argument("--capital", type=float, default=float(os.getenv("CAPITAL") or 300000),
                        help="계좌 금액(원), 종목당 1/5로 몇 주 살 수 있는지 계산 (기본 30만 원)")
    parser.add_argument("--dry-run", action="store_true", help="텔레그램으로 보내지 않고 출력만")
    parser.add_argument("--save-csv", type=pathlib.Path, help="받은 야후 데이터를 이 경로에 남겨요 (가상매매 기록이 같이 써요)")
    args = parser.parse_args()

    from realtime_monitor import send_telegram

    today = dt.datetime.now(KST).date()
    path = args.csv
    if path is None:
        path = args.save_csv or pathlib.Path(tempfile.mkdtemp()) / "kr_daily_recent.csv"
        try:
            kb.download(path, start=f"{today - dt.timedelta(days=LOOKBACK_DAYS):%Y-%m-%d}")
        except SystemExit as e:
            if not args.dry_run:
                send_telegram(f"[스윙 신호] 야후 시세를 못 받아서 오늘 신호를 계산하지 못했어요: {e}")
            raise
    opens, closes, index_close = kb.load_csv(path)
    market, picks = compute_signals(closes, index_close)
    text = format_message(market, picks, args.capital, today, claude_opinions(market, picks))
    print(text)
    if not args.dry_run:
        for part in split_message(text):
            if not send_telegram(part):
                raise SystemExit("텔레그램 전송 실패 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 확인)")


if __name__ == "__main__":
    main()
