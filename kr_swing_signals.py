#!/usr/bin/env python3
"""오늘의 매매 신호(국장·미장)를 계산해서 텔레그램으로 보내요. 주문은 하지 않아요.

규칙은 하락을 줄이는 쪽으로 고른 보수적 규칙이에요 (strategy.py, docs/conservative-backtest.md).
  국장: 코스피가 50·200일선 위일 때만, 돌파 후 눌림(RSI2 < 10) 종목을 종목당 계좌 10%씩 최대 5종목
        매도는 종가가 5일선 위, 10거래일 경과, 매수가 대비 -5% 손절 중 하나가 되면 다음 날 시가
  미장: S&P500이 200일선 위이고 50일선도 200일선 위면 계좌 50%를 S&P500 ETF(SPY 등)로, 아니면 현금

데이터는 야후 파이낸스 일봉(무료)이라 계좌나 증권사 API 키가 없어도 돌아가요.
신호마다 규칙으로 계산한 매매 의견(매수 이유, 손절가, 청산 조건, 위험 요인)을 붙여요. 유료 API는 쓰지 않아요.

사용법:
    python kr_swing_signals.py              # 국장 계산 후 텔레그램 전송
    python kr_swing_signals.py --market us  # 미장 (S&P500 추세)
    python kr_swing_signals.py --dry-run    # 전송 없이 메시지만 출력
    python kr_swing_signals.py --csv my.csv # 받아 둔 데이터로 계산 (형식은 kr_swing_backtest.py와 같음)
    python kr_swing_signals.py --save-csv data/kr_daily_recent.csv  # 받은 데이터를 남겨서 paper_trade.py에 넘기기
    python kr_swing_signals.py --save-json paper/kr/signal.json      # 대시보드(dashboard.py)가 읽을 오늘 신호 저장
"""

import argparse
import datetime as dt
import json
import os
import pathlib
import tempfile

import pandas as pd

import kr_swing_backtest as kb
import rulebook
import strategy
from markets import MARKETS

KST = dt.timezone(dt.timedelta(hours=9))
LOOKBACK_DAYS = 500  # 200일선 계산에 필요한 거래일(약 280일)보다 넉넉하게
TELEGRAM_LIMIT = 4000  # 텔레그램 한 메시지 최대 4096자


def compute_signals(closes, index_close):
    """마지막 거래일 기준 매수 후보와 시장 상태를 돌려줘요."""
    f = strategy.kr_frames(closes, index_close)
    entry, rank, max_hold = f["entry"], f["rank"], f["max_hold"]
    day = closes.index[-1]
    rsi2 = kb.rsi(closes).iloc[-1]
    ma5, ma200 = closes.rolling(5).mean().iloc[-1], closes.rolling(200).mean().iloc[-1]
    high20 = closes.rolling(20).max().iloc[-1]
    vol20 = closes.pct_change(fill_method=None).rolling(20).std().iloc[-1] * 252 ** 0.5
    picks = []
    for code in entry.columns[entry.iloc[-1].fillna(False).to_numpy(bool)]:
        picks.append(dict(code=code, name=kb.UNIVERSE.get(code, code), close=float(closes[code].iloc[-1]),
                          rsi2=float(rsi2[code]), ma5=float(ma5[code]), ma200=float(ma200[code]),
                          high20=float(high20[code]), rank=float(rank[code].iloc[-1]), vol20=float(vol20[code]),
                          days_since_high=days_since_high(closes[code]),
                          recent=[round(float(x)) for x in closes[code].dropna().iloc[-20:]]))
    picks.sort(key=lambda p: -p["rank"])
    index_ma200, index_ma50 = index_close.rolling(200).mean().iloc[-1], index_close.rolling(50).mean().iloc[-1]
    market = dict(day=day, kospi=float(index_close.iloc[-1]), kospi_ma200=float(index_ma200),
                  kospi_ma50=float(index_ma50), kospi_ok=bool(f["ok"].iloc[-1]), max_hold=max_hold)
    return market, picks


def days_since_high(close, n=20):
    """마지막으로 n일 신고가를 낸 날이 몇 거래일 전인지."""
    hits = (close >= close.rolling(n).max()).to_numpy()[::-1]
    return int(hits.argmax()) if hits.any() else None


def kr_opinion(p, market):
    """규칙으로 만든 국장 매매 의견 두 줄 (이유, 위험)."""
    pull = p["close"] / p["high20"] - 1
    reason = []
    if p.get("days_since_high") is not None:
        reason.append(f"{p['days_since_high']}거래일 전 20일 신고가")
    reason.append(f"고점 대비 {pull:.1%} 눌림")
    reason.append(f"RSI2 {p['rsi2']:.0f}로 단기 과매도")
    reason.append(f"200일선보다 {p['close'] / p['ma200'] - 1:+.0%} 위라 장기 추세는 살아 있음")
    risks = []
    vol = p.get("vol20")
    if vol is not None:
        risks.append(f"최근 변동성 연 {vol:.0%}" + ("로 큰 편이라 손절에 닿기 쉬워요" if vol > 0.4 else ""))
    if pull < -0.10:
        risks.append("고점 대비 10% 넘게 빠져서 눌림이 아니라 추세 꺾임일 수 있어요")
    gap50 = market["kospi"] / market["kospi_ma50"] - 1 if market.get("kospi_ma50") else None
    if gap50 is not None and gap50 < 0.02:
        risks.append(f"코스피가 50일선에 가까워({gap50:+.1%}) 곧 신규 매수가 멈출 수 있어요")
    if not risks[1:] and (vol is None or vol <= 0.4):
        risks.append("지금 숫자로는 특별한 경고 없음")
    return f"   이유: {', '.join(reason)}", f"   위험: {'; '.join(risks)}"


def format_message(market, picks, capital, today):
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
            lines.extend(kr_opinion(p, market))
    lines.append("")
    lines.append("백테스트(2011~) 기준 연 +4.8%, 최대 낙폭 -8%, 최악의 해 -3%였어요 (코스피 보유는 연 +8.3%, 최대 낙폭 -44%). "
                 "수익은 적게, 하락은 작게 고른 규칙이고 하락이 아예 없진 않아요. "
                 "과거 성과가 미래를 보장하진 않아요. 이 알림은 참고용이고 주문은 직접 판단해서 하세요.")
    return "\n".join(lines)


def compute_us(index_close):
    """S&P500 추세 상태와 어제 대비 바뀌었는지 돌려줘요."""
    ma50, ma200 = index_close.rolling(50).mean(), index_close.rolling(200).mean()
    ok = (index_close > ma200) & (ma50 > ma200)
    vol20 = index_close.pct_change().rolling(20).std().iloc[-1] * 252 ** 0.5
    high = index_close.iloc[-252:].max()
    return dict(day=index_close.index[-1], spx=float(index_close.iloc[-1]), ma50=float(ma50.iloc[-1]),
                ma200=float(ma200.iloc[-1]), ok=bool(ok.iloc[-1]), was_ok=bool(ok.iloc[-2]),
                vol20=float(vol20), from_high=float(index_close.iloc[-1] / high - 1))


def us_opinion(us):
    """규칙으로 만든 미장 매매 의견 (이유, 청산 기준, 위험)."""
    gap200 = us["spx"] / us["ma200"] - 1
    gap50 = us["ma50"] / us["ma200"] - 1
    if us["ok"]:
        reason = f"S&P500이 200일선보다 {gap200:+.1%} 위, 50일선도 200일선보다 {gap50:+.1%} 위라 상승 추세예요"
        exit_ = (f"S&P500 종가가 200일선(약 {us['ma200']:,.0f}) 아래로 내려가거나 50일선이 200일선 아래로 가면 매도 신호 "
                 f"(지금보다 약 {gap200:.1%} 더 빠지면)")
    else:
        why = "200일선 아래" if gap200 <= 0 else "50일선이 200일선 아래"
        reason = f"S&P500이 {why}라 하락·횡보 추세로 보고 현금으로 쉬어요 (200일선 대비 {gap200:+.1%})"
        exit_ = (f"S&P500 종가가 200일선(약 {us['ma200']:,.0f}) 위이고 50일선({us['ma50']:,.0f})도 200일선 위로 "
                 "올라오면 다시 매수 신호")
    risks = [f"최근 변동성 연 {us.get('vol20', float('nan')):.0%}"
             + (" (평소 15% 안팎보다 커요)" if us.get("vol20", 0) > 0.22 else "")]
    if us.get("from_high") is not None:
        risks.append(f"1년 고점 대비 {us['from_high']:.1%}")
    if us["ok"] and gap200 > 0.10:
        risks.append(f"200일선과 {gap200:.0%} 떨어져 있어서 매도 신호 전에 그만큼 빠질 수 있어요 "
                     f"(ETF는 계좌 절반이라 계좌 영향은 그 절반)")
    risks.append("환율이 내리면 원화 기준 수익이 줄어요")
    return [f"이유: {reason}", f"청산 기준: {exit_}", f"위험: {'; '.join(risks)}"]


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
    lines.extend(us_opinion(us))
    lines.append("미장 개별주 단타는 국내 증권사 수수료(0.25%)를 내면 백테스트에서 손실이라 지수 ETF만 봐요.")
    lines.append("")
    lines.append("백테스트(2011~, SPY 배당 포함) 연 +5.5%, 최대 낙폭 -11%, 최악의 해 -6%였어요 "
                 "(S&P500 보유는 연 +12.2%, 최대 낙폭 -34%). 하락이 아예 없진 않고, 환율 변동과 세금은 빠져 있어요. "
                 "과거 성과가 미래를 보장하진 않아요. 주문은 직접 판단해서 하세요.")
    return "\n".join(lines)


def index_series(index_close, days=260):
    """대시보드 지수 차트용: 최근 days거래일 종가와 50·200일선."""
    ma50, ma200 = index_close.rolling(50).mean(), index_close.rolling(200).mean()
    tail = index_close.index[-days:]

    def nums(s):
        return [None if pd.isna(x) else round(float(x), 2) for x in s.loc[tail]]

    return dict(dates=[f"{d:%Y-%m-%d}" for d in tail], close=nums(index_close), ma50=nums(ma50), ma200=nums(ma200))


def kr_payload(market, picks, index_close):
    """대시보드가 읽는 오늘의 국장 신호 (paper/kr/signal.json)."""
    rows = [dict(code=p["code"], name=p["name"], close=round(p["close"], 2), rsi2=round(p["rsi2"], 1),
                 ma5=round(p["ma5"], 2), stop=round(p["close"] * (1 - strategy.KR_STOP), 2),
                 opinion=[line.strip() for line in kr_opinion(p, market)]) for p in picks]
    return dict(market="kr", day=f"{market['day']:%Y-%m-%d}", index=round(market["kospi"], 2),
                ma50=round(market["kospi_ma50"], 2), ma200=round(market["kospi_ma200"], 2), ok=market["kospi_ok"],
                picks=rows, max_positions=kb.MAX_POSITIONS, series=index_series(index_close))


def us_payload(us, index_close, etf_close=None):
    """대시보드가 읽는 오늘의 미장 신호 (paper/us/signal.json)."""
    if us["ok"] and not us["was_ok"]:
        action = "buy"
    elif us["ok"]:
        action = "hold"
    elif us["was_ok"]:
        action = "sell"
    else:
        action = "cash"
    return dict(market="us", day=f"{us['day']:%Y-%m-%d}", index=round(us["spx"], 2), ma50=round(us["ma50"], 2),
                ma200=round(us["ma200"], 2), ok=us["ok"], action=action, etf=strategy.US_ETF, opinion=us_opinion(us),
                etf_close=round(etf_close, 2) if etf_close else None, series=index_series(index_close))


def index_candles(symbol, years=5):
    """대시보드 캔들 차트용 지수 일봉(시가·고가·저가·종가) years년치. 못 받으면 None (화면은 선 그래프로 대신해요)."""
    try:
        import yfinance as yf

        h = yf.Ticker(symbol).history(period=f"{years}y", auto_adjust=False)[["Open", "High", "Low", "Close"]].dropna()
    except Exception as e:  # 네트워크, 레이트리밋 등
        print(f"지수 캔들 데이터를 못 받았어요: {e!r}")
        return None
    if h.empty:
        return None
    h.index = pd.to_datetime(h.index).tz_localize(None)

    def col(name):
        return [round(float(x), 2) for x in h[name]]

    return dict(dates=[f"{d:%Y-%m-%d}" for d in h.index], o=col("Open"), h=col("High"), l=col("Low"), c=col("Close"))


def rulebook_section(opens, closes, volumes, index_close, market):
    """사용자 규칙표 후보 (가상계좌로 나란히 검증 중). 반환: (텔레그램 문장, 대시보드용 목록)."""
    stocks = [c for c in closes.columns if c in MARKETS[market]["universe"]]
    closes = closes[stocks]
    volumes = volumes[stocks] if volumes is not None else None
    ind = rulebook.indicators(closes, volumes, index_close)
    today = rulebook.day_row(ind, len(closes) - 1)
    index_ok = bool(index_close.iloc[-1] > index_close.rolling(200).mean().iloc[-1])
    picks = []
    for code in rulebook.candidates(today):
        close = float(today["close"][code])
        picks.append(dict(code=code, name=MARKETS[market]["universe"].get(code, code), close=round(close, 2),
                          opinion=rulebook.opinion(code, today, close, index_ok, market)))
    unit = "원" if market == "kr" else "달러"
    lines = ["", "[규칙표 후보] 내 매매 규칙표 기준. 백테스트에선 손실이라 가상계좌로만 검증 중이에요."]
    if volumes is None:
        lines.append("(거래량 데이터가 없어서 거래량 조건은 빼고 계산했어요.)")
    if not picks:
        lines.append("오늘은 규칙표 조건(200일선 위, 60일선 > 200일선, RSI14 45~60, 거래량 20일 평균 이상)에 맞는 종목이 없어요.")
    for i, p in enumerate(picks, 1):
        lines.append(f"{i}. {p['name']}({p['code']}) 종가 {p['close']:,.2f}{unit}".replace(".00" + unit, unit))
        lines.extend(f"   {line}" for line in p["opinion"])
    return "\n".join(lines), picks


def save_json(path, payload):
    payload = dict(payload, generated=dt.datetime.now(KST).isoformat(timespec="minutes"))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")


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
    parser.add_argument("--save-json", type=pathlib.Path, help="오늘 신호를 대시보드용 JSON으로 저장")
    args = parser.parse_args()

    from realtime_monitor import send_telegram

    m = MARKETS[args.market]
    capital = args.capital or float(os.getenv(f"CAPITAL_{args.market.upper()}") or m["capital"])
    today = dt.datetime.now(KST).date()
    path = args.csv
    if path is None:
        path = args.save_csv or pathlib.Path(tempfile.mkdtemp()) / f"{args.market}_daily_recent.csv"
        universe = m["universe"] if args.market == "kr" else dict(m["universe"], **{strategy.US_ETF: strategy.US_ETF})
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
        etf_close = float(etf.iloc[-1]) if etf is not None else None
        us = compute_us(index_close)
        text = format_us(us, capital, today, etf_close)
        payload = us_payload(us, index_close, etf_close)
    else:
        market, picks = compute_signals(closes, index_close)
        text = format_message(market, picks, capital, today)
        payload = kr_payload(market, picks, index_close)
    volumes = kb.load_volume(path, closes.index, m["index"])
    extra, rb_picks = rulebook_section(opens, closes, volumes, index_close, args.market)
    text += "\n" + extra
    payload["rulebook"] = rb_picks
    if args.save_json:
        payload["candles"] = index_candles(m["index"])
        save_json(args.save_json, payload)
    print(text)
    if not args.dry_run:
        for part in split_message(text):
            if not send_telegram(part):
                raise SystemExit("텔레그램 전송 실패 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 확인)")


if __name__ == "__main__":
    main()
