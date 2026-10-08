#!/usr/bin/env python3
"""오늘의 매매 신호(국장·미장)를 계산해서 텔레그램으로 보내요. 주문은 하지 않아요.

규칙은 하락을 줄이는 쪽으로 고른 보수적 규칙이에요 (strategy.py, docs/conservative-backtest.md).
  국장: 코스피가 50·200일선 위일 때만, 돌파 후 눌림(RSI2 < 10) 종목을 종목당 계좌 10%씩 최대 5종목
        매도는 종가가 5일선 위, 10거래일 경과, 매수가 대비 -7% 손절 중 하나가 되면 다음 날 시가
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
import re
import tempfile

import pandas as pd

import departments
import health
import kr_swing_backtest as kb
import macro
import movers
import rulebook
import sectors
import strategy
import tgchart
import tgfmt
import track
import wide
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
    breadth = f["wide"].iloc[-1] if "wide" in f else True
    market = dict(day=day, kospi=float(index_close.iloc[-1]), kospi_ma200=float(index_ma200),
                  kospi_ma50=float(index_ma50), kospi_ok=bool(f["ok"].iloc[-1]), max_hold=max_hold,
                  trend_ok=bool(f.get("trend", f["ok"]).iloc[-1]), breadth_ok=bool(breadth),
                  season=bool(f["season"].iloc[-1]) if "season" in f else False,
                  breadth=float(strategy.breadth(closes).iloc[-1]) if closes.shape[1] else None)
    return market, picks


def days_since_high(close, n=20):
    """마지막으로 n일 신고가를 낸 날이 몇 거래일 전인지."""
    hits = (close >= close.rolling(n).max()).to_numpy()[::-1]
    return int(hits.argmax()) if hits.any() else None


def kr_pause_reason(market):
    """국장 신규 매수를 쉬는 이유."""
    if not market.get("trend_ok", False):
        return "코스피가 50일선이나 200일선 아래라 규칙상 새로 사지 않는 날이에요."
    if not market.get("breadth_ok", True):
        b = market.get("breadth")
        share = f"{b:.0%}" if b is not None else "절반 미만"
        return breadth_reason(share)
    end = strategy.season_end(market["day"]) if market.get("day") is not None else None
    if end is not None:
        return (f"실적 발표 시즌이라 {end:%m-%d}까지 새로 사지 않아요. 발표 충격을 피하려는 규칙이에요 "
                "(백테스트 최대 낙폭 -4.8% → -3.2%). 이미 산 종목은 평소처럼 팔아요.")
    return "오늘은 규칙상 새로 사지 않는 날이에요."


def breadth_reason(share):
    return (f"코스피 추세는 괜찮지만 대형주 중 200일선 위 종목이 {share}로 "
            f"{strategy.KR_BREADTH_MIN:.0%} 미만이라(시장 폭이 좁음) 새로 사지 않는 날이에요.")


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
        lines.append("오늘은 매수 신호가 없어요." if market["kospi_ok"] else kr_pause_reason(market))
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
    lines.append("백테스트(2011~) 기준 연 +4.5%, 최대 낙폭 -3.2%, 최악의 해 +1.5%였어요 (코스피 보유는 연 +8.3%, 최대 낙폭 -44%). "
                 "수익은 적게, 하락은 작게 고른 규칙이고 하락이 아예 없진 않아요. "
                 "과거 성과가 미래를 보장하진 않아요. 이 알림은 참고용이고 주문은 직접 판단해서 하세요.")
    return "\n".join(lines)


def compute_us(index_close):
    """S&P500 추세 상태와 어제 대비 바뀌었는지 돌려줘요."""
    ma50, ma200 = index_close.rolling(50).mean(), index_close.rolling(200).mean()
    ok, trend, _ = strategy.us_ok(index_close)
    vol20 = strategy.volatility(index_close).iloc[-1]
    high = index_close.iloc[-252:].max()
    return dict(day=index_close.index[-1], spx=float(index_close.iloc[-1]), ma50=float(ma50.iloc[-1]),
                ma200=float(ma200.iloc[-1]), ok=bool(ok.iloc[-1]), was_ok=bool(ok.iloc[-2]),
                vol20=float(vol20), from_high=float(index_close.iloc[-1] / high - 1), trend=bool(trend.iloc[-1]))


def us_opinion(us):
    """규칙으로 만든 미장 매매 의견 (이유, 청산 기준, 위험)."""
    gap200 = us["spx"] / us["ma200"] - 1
    gap50 = us["ma50"] / us["ma200"] - 1
    if us["ok"]:
        reason = f"S&P500이 200일선보다 {gap200:+.1%} 위, 50일선도 200일선보다 {gap50:+.1%} 위라 상승 추세예요"
        exit_ = (f"S&P500 종가가 200일선(약 {us['ma200']:,.0f}) 아래로 내려가거나 50일선이 200일선 아래로 가면 매도 신호 "
                 f"(지금보다 약 {gap200:.1%} 더 빠지면)")
    elif us.get("trend", False):
        reason = (f"추세는 살아 있지만 S&P500 변동성이 연 {us['vol20']:.0%}로 {strategy.US_VOL_MAX:.0%}를 넘어서 "
                  "급락 위험을 피해 현금으로 쉬어요")
        exit_ = f"변동성이 연 {strategy.US_VOL_MAX:.0%} 아래로 내려오고 추세가 유지되면 다시 매수 신호"
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
        lines.append("현금 유지: S&P500 추세가 약하거나 변동성이 커서 사지 않아요.")
    if etf_close:
        amount = capital * strategy.US_WEIGHT
        lines.append(f"{capital:,.0f}달러 계좌면 {amount:,.0f}달러 ≈ {strategy.US_ETF} {amount / etf_close:.3f}주 "
                     f"(종가 {etf_close:,.2f}달러, 소수점 매수)")
    lines.extend(us_opinion(us))
    lines.append("미장 개별주 단타는 국내 증권사 수수료(0.25%)를 내면 백테스트에서 손실이라 지수 ETF만 봐요.")
    lines.append("")
    lines.append("백테스트(2011~, SPY 배당 포함) 연 +5.7%, 최대 낙폭 -9.5%, 최악의 해 -5.6%였어요 "
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
                pause=None if market["kospi_ok"] else kr_pause_reason(market),
                ma50=round(market["kospi_ma50"], 2), ma200=round(market["kospi_ma200"], 2), ok=market["kospi_ok"],
                picks=rows, max_positions=kb.MAX_POSITIONS, series=index_series(index_close))


def us_payload_action(us):
    if us["ok"] and not us["was_ok"]:
        return "buy"
    if us["ok"]:
        return "hold"
    return "sell" if us["was_ok"] else "cash"


def us_payload(us, index_close, etf_close=None):
    """대시보드가 읽는 오늘의 미장 신호 (paper/us/signal.json)."""
    action = us_payload_action(us)
    return dict(market="us", day=f"{us['day']:%Y-%m-%d}", index=round(us["spx"], 2), ma50=round(us["ma50"], 2),
                ma200=round(us["ma200"], 2), ok=us["ok"], action=action, etf=strategy.US_ETF, opinion=us_opinion(us),
                etf_close=round(etf_close, 2) if etf_close else None, series=index_series(index_close))


def stock_summary(closes, market, days=60):
    """관심종목 화면용: 종목별 마지막 종가, 전일 대비 등락률, 최근 days거래일(약 3개월) 종가."""
    names = dict(MARKETS[market]["universe"])
    if market == "us":
        names[strategy.US_ETF] = track.etf_name()
    out = []
    for code, name in names.items():
        if code not in closes:
            continue
        s = closes[code].dropna()
        if len(s) < 2:
            continue
        spark = [round(float(x)) if market == "kr" else round(float(x), 2) for x in s.iloc[-days:]]
        out.append(dict(code=code, name=name, day=f"{s.index[-1]:%Y-%m-%d}", close=round(float(s.iloc[-1]), 2),
                        d1=round(float(s.iloc[-1] / s.iloc[-2] - 1), 4), spark=spark))
    return out


def ohlc_payload(h, date_fmt="%Y-%m-%d"):
    """Open·High·Low·Close(·Volume) 표를 대시보드 JSON 모양(dates, o, h, l, c, v)으로. 거래량이 없으면 v는 빼요."""
    def col(name):
        return [round(float(x), 2) for x in h[name]]

    out = dict(dates=[f"{d:{date_fmt}}" for d in h.index], o=col("Open"), h=col("High"), l=col("Low"), c=col("Close"))
    if "Volume" in h:
        out["v"] = [int(x) for x in h["Volume"].fillna(0)]
    return out


def monthly_ohlc(h):
    """야후 월봉을 한 달에 한 줄로 정리해요 (이번 달이 두 줄로 오는 경우가 있어서 달별로 다시 묶어요)."""
    h = h.copy()
    h.index = pd.to_datetime(h.index).tz_localize(None)
    g = h.groupby(h.index.to_period("M"))
    m = pd.DataFrame({"Open": g["Open"].first(), "High": g["High"].max(), "Low": g["Low"].min(), "Close": g["Close"].last()})
    if "Volume" in h:
        m["Volume"] = g["Volume"].sum()
    m.index = m.index.to_timestamp()
    return m


def index_candles(symbol, years=5):
    """대시보드 캔들 차트용 지수 일봉(시가·고가·저가·종가·거래량) years년치 + 월봉·년봉용 전체 기간 월봉(monthly).
    일봉을 못 받으면 None (화면은 선 그래프로 대신해요). 월봉만 못 받으면 화면이 일봉을 묶어서 그려요."""
    cols = ["Open", "High", "Low", "Close"]

    def table(h):  # 거래량은 있으면 같이 (보조지표 거래량 막대)
        return h[cols + ["Volume"] if "Volume" in h else cols].dropna(subset=cols)

    try:
        import yfinance as yf

        ticker = yf.Ticker(symbol)
        h = table(ticker.history(period=f"{years}y", auto_adjust=False))
    except Exception as e:  # 네트워크, 레이트리밋 등
        print(f"지수 캔들 데이터를 못 받았어요: {e!r}")
        return None
    if h.empty:
        return None
    h.index = pd.to_datetime(h.index).tz_localize(None)
    out = ohlc_payload(h)
    try:
        mh = table(ticker.history(period="max", interval="1mo", auto_adjust=False))
        if not mh.empty:
            out["monthly"] = ohlc_payload(monthly_ohlc(mh), "%Y-%m")
    except Exception as e:
        print(f"지수 월봉 데이터를 못 받았어요 (월봉·년봉은 일봉을 묶어서 그려요): {e!r}")
    return out


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


def usdkrw():
    """원달러 환율 마지막 종가 (야후 KRW=X). 못 받으면 None."""
    try:
        import yfinance as yf

        h = yf.Ticker("KRW=X").history(period="10d")
        return round(float(h["Close"].dropna().iloc[-1]), 2)
    except Exception as e:
        print(f"환율을 못 받았어요: {e!r}")
        return None


def save_json(path, payload):
    payload = dict(payload, generated=dt.datetime.now(KST).isoformat(timespec="minutes"))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")


def add_departments(text, payload, market_key, closes, index_close, state, picks):
    """부서별 보고(departments.py)를 메시지 끝과 대시보드 JSON에 붙여요. 실패해도 신호는 그대로 보내요."""
    try:
        if market_key == "us":
            report = departments.us_report(index_close, state)
        else:
            departments.check_picks(picks)
            for row, p in zip(payload["picks"], picks):
                row["fund"] = p["fund"]["grade"]
                row["opinion"].append(f"펀더멘탈: {p['fund']['line']}")
                line = departments.earnings_line(f"{p['code']}.KS", market["day"].date())
                if line:
                    row["opinion"].append(line)
            report = departments.kr_report(closes, index_close, state, picks, kb.MAX_POSITIONS)
    except Exception as e:
        print(f"부서별 보고 실패 (신호는 그대로 보내요): {e}")
        return text, payload
    report = with_macro(report, macro.read_snapshot())
    text = text + "\n\n" + "\n".join(departments.report_lines(report))
    return text, dict(payload, desks=departments.report_payload(report))


def with_macro(report, snap):
    """리스크관리부 보고 끝에 경기 국면(macro.py, paper/macro.json)을 참고로 붙여요."""
    line = macro.risk_line(snap)
    if not line:
        return report
    return [(dept, f"{text}. {line}" if dept == "리스크관리부" else text) for dept, text in report]


def add_movers(text, payload, args, path, today, closes, index_close, volumes, wide_closes):
    """많이 움직인 종목과 추정 이유(movers.py)를 메시지 끝과 대시보드 JSON에 붙여요. 실패해도 신호는 그대로 보내요."""
    m = MARKETS[args.market]
    try:
        names = dict(m["universe"])
        if args.market == "kr":
            wpath, wnames = path.with_name("kr_wide_recent.csv"), wide.universe()
        else:  # 미장은 넓은 범위 종목을 여기서 받아요 (신호에는 안 써요)
            wpath, wnames = path.with_name("us_wide_recent.csv"), wide.us_universe()
            if args.csv is None or not wpath.exists():
                kb.download(wpath, start=f"{today - dt.timedelta(days=LOOKBACK_DAYS):%Y-%m-%d}", universe=wnames,
                            index=m["index"], suffix=m["suffix"], pause=0.5)
            _, wide_closes, _ = kb.load_csv(wpath, m["index"])
        names.update(wnames)
        every, vols = closes.drop(columns=[strategy.US_ETF], errors="ignore"), volumes
        if wide_closes is not None and wpath.exists():
            extra = [c for c in wide_closes if c in wnames and c not in every]
            every = every.join(wide_closes[extra])
            wvol = kb.load_volume(wpath, closes.index, m["index"])
            if vols is not None and wvol is not None:
                vols = vols.join(wvol[[c for c in extra if c in wvol]])
        result = movers.compute(every, index_close, vols, names, m["index_name"], lang="ko")
    except (Exception, SystemExit) as e:
        print(f"많이 움직인 종목 이유 계산 실패 (신호는 그대로 보내요): {e!r}")
        return text, payload
    return text + "\n" + movers.section(result, m["name"]), dict(payload, movers=result)


def add_sectors(text, payload, args, path, closes, index_close):
    """업종별 흐름과 뉴스 호재·악재(sectors.py)를 메시지 끝·매수 후보 의견·대시보드 JSON에 붙여요.
    실패해도 신호는 그대로 보내요."""
    m = MARKETS[args.market]
    try:
        smap = sectors.load()
        names = dict(m["universe"])
        every = closes.drop(columns=[strategy.US_ETF], errors="ignore")
        wpath = path.with_name(f"{args.market}_wide_recent.csv")
        if wpath.exists():
            _, wide_closes, _ = kb.load_csv(wpath, m["index"])
            wnames = wide.universe() if args.market == "kr" else wide.us_universe()
            names.update(wnames)
            every = every.join(wide_closes[[c for c in wide_closes if c in wnames and c not in every]])
        result = sectors.compute(every, index_close, names, smap, args.market, lang="ko" if args.market == "kr" else "en",
                                 fetch_news=movers.google_news)
    except (Exception, SystemExit) as e:
        print(f"업종별 호재·악재 계산 실패 (신호는 그대로 보내요): {e!r}")
        return text, payload
    extra = []
    for row in payload.get("picks") or []:
        line = sectors.pick_line(row["code"], result, smap, args.market)
        if line:
            row.setdefault("opinion", []).append(line)
            extra.append(f"· {row['name']} → {line.removeprefix('업종: ')}")
    for key in ("up", "down"):
        for row in (payload.get("movers") or {}).get(key) or []:
            row["sector"] = sectors.sector_of(smap, args.market, row["code"])
    payload = dict(payload, sectors=result, sector_links=sectors.RELATED,
                   sector_of={c: s for c in every.columns if (s := sectors.sector_of(smap, args.market, c))})
    section = sectors.section(result, m["name"])
    if extra:
        section += "\n오늘 매수 후보의 업종\n" + "\n".join(extra)
    return text + "\n" + section, payload


def split_message(text, limit=TELEGRAM_LIMIT):
    parts, current = [], ""
    for line in text.split("\n"):
        if current and len(current) + len(line) + 1 > limit:
            parts.append(current)
            current = ""
        current = f"{current}\n{line}" if current else line
    return parts + [current]


def kr_summary(market, picks, capital):
    """텔레그램 맨 위 요약 (HTML): 오늘 할 일 → 매수 후보 → 코스피."""
    esc = tgfmt.esc
    lines = [f"🇰🇷 <b>국장 신호</b> · {market['day']:%m/%d} 종가", tgfmt.DIVIDER]
    if picks:
        top = picks[:kb.MAX_POSITIONS]
        slot = capital * strategy.KR_WEIGHT
        lines.append(f"🟢 <b>매수 후보 {len(top)}개</b> · 내일 시가에 종목당 {slot / 10000:,.0f}만 원")
        for i, p in enumerate(top, 1):
            lines.append(f"{i}. <b>{esc(p['name'])}</b> {p['close']:,.0f}원 · 손절 {p['close'] * (1 - strategy.KR_STOP):,.0f}원")
        if len(picks) > len(top):
            lines.append(f"<i>(자리 없으면 건너뛰는 후보 {len(picks) - len(top)}개 더)</i>")
    elif market["kospi_ok"]:
        lines.append("⚪ <b>오늘은 매수 신호 없음</b>")
    else:
        lines.append("⏸ <b>오늘은 새로 안 사요</b>")
        lines.append(f"<i>{esc(kr_pause_reason(market))}</i>")
    gap50 = market["kospi"] / market["kospi_ma50"] - 1
    gap200 = market["kospi"] / market["kospi_ma200"] - 1
    lines.append(f"📈 코스피 <b>{market['kospi']:,.0f}</b> · 50일선 {gap50:+.1%} · 200일선 {gap200:+.1%}")
    return lines


US_ACTIONS = {"buy": ("🟢", "매수 신호", "다음 거래일 시가에 계좌 {w}를 {etf}로"),
              "hold": ("🔵", "보유 유지", "계좌 {w}는 {etf}, 나머지 현금"),
              "sell": ("🔴", "매도 신호", "다음 거래일 시가에 {etf} 전부 팔고 현금으로"),
              "cash": ("⚪", "현금 유지", "추세가 약하거나 변동성이 커서 안 사요")}


def us_summary(us, capital, etf_close=None):
    action = us_payload_action(us)
    mark, label, what = US_ACTIONS[action]
    lines = [f"🇺🇸 <b>미장 신호</b> · {us['day']:%m/%d} (뉴욕) 종가", tgfmt.DIVIDER,
             f"{mark} <b>{label}</b>: " + what.format(w=f"{strategy.US_WEIGHT:.0%}", etf=strategy.US_ETF)]
    if etf_close and action in ("buy", "hold"):
        amount = capital * strategy.US_WEIGHT
        lines.append(f"💵 {capital:,.0f}달러 계좌 → {amount:,.0f}달러 ≈ {strategy.US_ETF} {amount / etf_close:.2f}주")
    gap50 = us["spx"] / us["ma50"] - 1
    gap200 = us["spx"] / us["ma200"] - 1
    lines.append(f"📈 S&amp;P500 <b>{us['spx']:,.0f}</b> · 50일선 {gap50:+.1%} · 200일선 {gap200:+.1%}")
    return lines


def summary_extras(payload):
    """요약 아래 한 줄씩: 규칙표 후보, 많이 오르고 내린 종목, 강하고 약한 업종, 데이터 경고, 앱 링크."""
    lines = []

    def esc(name):  # 요약 한 줄에 들어가게 긴 영문 회사명은 줄여요
        name = re.split(r",| - | \(| (?:Inc|Corp|Corporation|Holdings|Company|plc|S\.A\.)\b", str(name))[0].strip()
        return tgfmt.esc(name if len(name) <= 14 else name[:13] + "…")

    def names(rows, n=4):
        shown = " · ".join(esc(r["name"]) for r in rows[:n])
        return shown + (f" 외 {len(rows) - n}개" if len(rows) > n else "")

    def moves(rows, n=3):
        return " · ".join(f"{esc(r['name'])} {r['r5']:+.0%}" for r in rows[:n])

    rb = payload.get("rulebook") or []
    if rb:
        lines.append(f"📋 규칙표 후보 {len(rb)}개 <i>(가상 검증용)</i>: {names(rb)}")
    wide_picks = payload.get("wide") or []
    if wide_picks:
        lines.append(f"🔭 넓은 범위 후보 {len(wide_picks)}개 <i>(참고)</i>: {names(wide_picks)}")
    mv = payload.get("movers") or {}
    if mv.get("up"):
        lines.append(f"🔥 5일 급등: {moves(mv['up'])}")
    if mv.get("down"):
        lines.append(f"🧊 5일 급락: {moves(mv['down'])}")
    sec = payload.get("sectors") or []
    if sec:
        strong, weak = sec[0], sec[-1]
        line = f"🏭 강한 업종 {esc(strong['name'])} {strong['r5']:+.1%}"
        if weak is not strong:
            line += f" · 약한 업종 {esc(weak['name'])} {weak['r5']:+.1%}"
        lines.append(line)
    if payload.get("data_warnings"):
        lines.append(f"⚠️ 데이터 점검 {len(payload['data_warnings'])}건 (아래 펼쳐 보기)")
    lines.append(f"📱 {tgfmt.link('앱에서 차트·자세히 보기')}")
    return lines


def telegram_messages(summary_lines, payload, text):
    """(사진 설명용 요약 HTML, 자세한 글) — 요약은 오늘 할 일만 짧게, 나머지는 접어서 보내요."""
    summary = "\n".join(summary_lines + [""] + summary_extras(payload))
    first, _, rest = text.partition("\n")
    sub = tgfmt.HEADER.match(first)
    detail = f"[신호 자세히] {sub.group(2) if sub else ''}\n{rest}"
    return summary, detail


def send_signal(summary, detail, chart):
    """그림(요약을 설명으로) → 접힌 자세한 내용. 그림을 못 보내면 요약을 글 맨 위에 붙여요."""
    from realtime_monitor import send_html, send_photo

    photo_ok = bool(chart) and len(tgfmt.plain(summary)) <= tgfmt.CAPTION_LIMIT and send_photo(chart, summary)
    parts = tgfmt.compose("" if photo_ok else summary, detail)
    if not all([send_html(part) for part in parts]):
        raise SystemExit("텔레그램 전송 실패 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 확인)")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--market", choices=sorted(MARKETS), default="kr", help="kr=국장 스윙, us=미장 S&P500 추세")
    parser.add_argument("--csv", type=pathlib.Path, help="date,ticker,open,close 형식 (없으면 야후에서 받아요)")
    parser.add_argument("--capital", type=float, help="계좌 금액 (기본 국장 1,000만 원, 미장 7,470달러(약 1,000만 원))")
    parser.add_argument("--dry-run", action="store_true", help="텔레그램으로 보내지 않고 출력만")
    parser.add_argument("--save-csv", type=pathlib.Path, help="받은 야후 데이터를 이 경로에 남겨요 (가상매매 기록이 같이 써요)")
    parser.add_argument("--save-json", type=pathlib.Path, help="오늘 신호를 대시보드용 JSON으로 저장")
    parser.add_argument("--preview-dir", type=pathlib.Path, help="텔레그램에 보낼 요약·자세히·그림을 이 폴더에 저장 (미리보기)")
    args = parser.parse_args()

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
        except SystemExit as e:  # 고장 알림(health.py fail)이 이 이유를 붙여서 보내요
            health.record_error(f"{m['name']} 야후 시세를 못 받아서 오늘 신호를 계산하지 못했어요: {e}")
            raise
    opens, closes, index_close = kb.load_csv(path, m["index"])
    codes = list(m["universe"]) + ([strategy.US_ETF] if args.market == "us" else [])
    errors, warnings = health.check_data(closes, index_close, codes, today, m["universe"])
    if errors:  # 엉터리 데이터로 신호를 내느니 멈추고 알려요 (가상매매도 이 단계에서 같이 멈춰요)
        health.record_error(f"{m['name']} 시세 점검: " + " ".join(errors))
        raise SystemExit(" ".join(errors))
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
    text, payload = add_departments(text, payload, args.market, closes, index_close,
                                    us if args.market == "us" else market, [] if args.market == "us" else picks)
    wide_closes = None
    if args.market == "kr":  # 넓은 범위 후보 (참고, wide.py). 실패해도 신호는 그대로 보내요
        try:
            names = wide.universe()
            wpath = path.with_name("kr_wide_recent.csv")
            if args.csv is None or not wpath.exists():
                kb.download(wpath, start=f"{today - dt.timedelta(days=LOOKBACK_DAYS):%Y-%m-%d}", universe=names,
                            index=m["index"], suffix=m["suffix"], pause=0.5)
            _, wide_closes, _ = kb.load_csv(wpath, m["index"])
            wide_closes = wide_closes[[c for c in wide_closes.columns if c in names]]
            payload["wide"] = wide.compute(wide_closes, closes, index_close, names)
            text += "\n" + wide.section(payload["wide"], len(names))
        except (Exception, SystemExit) as e:
            print(f"넓은 범위 후보 계산 실패 (신호는 그대로 보내요): {e!r}")
            wide_closes = None
    text, payload = add_movers(text, payload, args, path, today, closes, index_close, volumes, wide_closes)
    text, payload = add_sectors(text, payload, args, path, closes, index_close)
    if warnings:
        text += "\n\n[데이터 점검]\n" + "\n".join(f"- {w}" for w in warnings)
        payload["data_warnings"] = warnings
    if args.save_json:
        payload["usdkrw"] = usdkrw()  # 대시보드가 국장·미장 계좌를 원화로 합칠 때 써요
        payload["candles"] = index_candles(m["index"])
        payload["stocks"] = stock_summary(closes, args.market)
        try:  # 추천 종목 기록(paper/<시장>/picks.csv)과 추천일부터의 수익률. 실패해도 신호는 그대로 보내요
            rows = track.update(args.save_json.parent / "picks.csv", args.market, payload, closes, index_close, volumes)
            every = closes.join(wide_closes[[c for c in wide_closes if c not in closes]]) if wide_closes is not None else closes
            payload["tracked"] = track.summary(rows, every, index_close)
        except Exception as e:
            print(f"추천 성과 계산 실패 (신호는 그대로 보내요): {e!r}")
        save_json(args.save_json, payload)
    print(text)
    head = us_summary(us, capital, etf_close) if args.market == "us" else kr_summary(market, picks, capital)
    summary, detail = telegram_messages(head, payload, text)
    state = "보유·매수 구간" if (us["ok"] if args.market == "us" else market["kospi_ok"]) else "쉬는 구간"
    chart = tgchart.index_chart(index_close, m["index_name"], f"50·200일선 · 지금은 {state}")
    if args.preview_dir:  # 보낼 모양 미리보기 (텔레그램 없이)
        args.preview_dir.mkdir(parents=True, exist_ok=True)
        (args.preview_dir / f"{args.market}_messages.json").write_text(
            json.dumps(dict(caption=summary, messages=tgfmt.compose("", detail)), ensure_ascii=False, indent=1))
        if chart:
            (args.preview_dir / f"{args.market}_chart.png").write_bytes(chart)
    if not args.dry_run:
        send_signal(summary, detail, chart)


if __name__ == "__main__":
    main()
