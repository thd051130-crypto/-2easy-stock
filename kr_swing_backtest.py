#!/usr/bin/env python3
"""한국 대형주 스윙 규칙 백테스트: 종가에 신호, 다음 날 시가 매매, 최대 5종목 동시 보유.

easy-stock의 swing_backtest.py(미국 주식)를 한국 시장용으로 옮긴 버전이에요.
- 비용: 매수·매도 수수료, 매도 시 증권거래세, 슬리피지를 따로 반영해요.
- 규칙: RSI2 눌림목, 20일 신고가 돌파, 돌파 후 눌림(조합), 각각 코스피 200일선 필터 유무.
- 임계값 스윕: 앞 구간(학습)에서 고른 값이 뒤 구간(검증)에서도 통하는지 같이 보여줘요.

사용법:
    python kr_swing_backtest.py                 # yfinance로 받아서 data/kr_daily.csv에 저장 후 실행
    python kr_swing_backtest.py --csv my.csv    # date,ticker,open,close 형식 CSV로 실행
    python kr_swing_backtest.py --synthetic     # 가짜 데이터로 코드만 점검
    python kr_swing_backtest.py --capital 300000  # 정수 주식 수로 소액 계좌 시뮬레이션 추가
"""

import argparse
import itertools
import pathlib

import numpy as np
import pandas as pd

# 2015년 말 코스피 시가총액 상위권 위주 (지금 잘나가는 종목을 고르는 생존편향을 줄이려고 과거 기준으로 골랐어요).
# 그 뒤 상장폐지·합병된 종목(옛 삼성물산 000830, 옛 우리은행 000030 등)은 데이터가 없어 빠져 있어서 편향이 완전히 없진 않아요.
UNIVERSE = {
    "005930": "삼성전자", "000660": "SK하이닉스", "005380": "현대차", "015760": "한국전력",
    "028260": "삼성물산", "012330": "현대모비스", "090430": "아모레퍼시픽", "032830": "삼성생명",
    "035420": "NAVER", "000270": "기아", "051910": "LG화학", "055550": "신한지주",
    "017670": "SK텔레콤", "034730": "SK", "051900": "LG생활건강", "105560": "KB금융",
    "018260": "삼성에스디에스", "066570": "LG전자", "033780": "KT&G", "096770": "SK이노베이션",
    "005490": "POSCO홀딩스", "003550": "LG", "000810": "삼성화재", "086790": "하나금융지주",
    "009540": "HD한국조선해양", "011170": "롯데케미칼", "010950": "S-Oil", "024110": "기업은행",
    "035250": "강원랜드", "004020": "현대제철", "006400": "삼성SDI", "030200": "KT",
    "010130": "고려아연", "009150": "삼성전기", "000720": "현대건설", "034220": "LG디스플레이",
    "036570": "엔씨소프트", "021240": "코웨이", "010140": "삼성중공업", "097950": "CJ제일제당",
    "139480": "이마트", "023530": "롯데쇼핑", "078930": "GS", "000100": "유한양행",
    "086280": "현대글로비스", "032640": "LG유플러스", "029780": "삼성카드", "004170": "신세계",
}
INDEX = "^KS11"
START, TEST_START, SPLIT = "2010-01-01", "2011-01-01", "2019-01-01"
MAX_POSITIONS = 5
CASH_RATE = 0.025  # 놀고 있는 돈은 CMA 연 2.5% 가정

# fee: 매수·매도 각각 증권사 수수료, tax: 매도 시 거래세+농특세, slip: 시가 체결 시 불리하게 밀리는 정도(각 방향)
COSTS = {
    "기본": dict(fee=0.00015, tax=0.0020, slip=0.0005),
    "보수적": dict(fee=0.00015, tax=0.0020, slip=0.0020),
}


# ---------------------------------------------------------------- 데이터

def load_csv(path, index=INDEX):
    df = pd.read_csv(path, dtype={"ticker": str}, parse_dates=["date"])
    opens = df.pivot(index="date", columns="ticker", values="open").sort_index()
    closes = df.pivot(index="date", columns="ticker", values="close").sort_index()
    if index not in closes:
        raise SystemExit(f"{path}에 지수({index}) 행이 없어요.")
    index_close = closes.pop(index).dropna()
    opens = opens.drop(columns=[index], errors="ignore")
    calendar = index_close.index
    return opens.reindex(calendar), closes.reindex(calendar), index_close


def load_volume(path, calendar, index=INDEX):
    """거래량 (date x ticker, load_csv와 같은 날짜). 예전 CSV처럼 volume 열이 없으면 None."""
    df = pd.read_csv(path, dtype={"ticker": str}, parse_dates=["date"])
    if "volume" not in df:
        return None
    vol = df.pivot(index="date", columns="ticker", values="volume").sort_index()
    return vol.drop(columns=[index], errors="ignore").reindex(calendar)


def download(path, pause=1.5, retries=5, start=START, universe=None, index=INDEX, suffix=".KS"):
    """야후는 한꺼번에 받으면 429(요청 과다)를 자주 줘서 종목별로 쉬어 가며 받고, 실패하면 간격을 늘려 다시 시도해요."""
    import time

    import yfinance as yf

    symbols = [f"{code}{suffix}" for code in (universe or UNIVERSE)] + [index]
    frames = []
    for symbol in symbols:
        part = None
        for attempt in range(retries):
            try:
                part = yf.Ticker(symbol).history(start=start, auto_adjust=True)
                if not part.empty:
                    break
            except Exception as e:  # 레이트리밋 등
                print(f"{symbol} 재시도 {attempt + 1}/{retries}: {e}")
            time.sleep(pause * 2 ** attempt)
        time.sleep(pause)
        if part is None or part.empty:
            print(f"경고: {symbol} 데이터 없음, 제외")
            continue
        part = part[["Open", "Close", "Volume"]].dropna(how="all", subset=["Open", "Close"])
        part.index = pd.to_datetime(part.index).tz_localize(None).normalize()
        frames.append(pd.DataFrame({"date": part.index, "ticker": symbol.removesuffix(suffix) if suffix else symbol,
                                    "open": part["Open"].to_numpy(), "close": part["Close"].to_numpy(),
                                    "volume": part["Volume"].to_numpy()}))
    if not frames:
        raise SystemExit("다운로드된 데이터가 없어요. 네트워크(야후 파이낸스 접속)를 확인하거나 --csv로 데이터를 넣어 주세요.")
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.concat(frames).to_csv(path, index=False)
    print(f"{path}에 저장했어요.")


def synthetic(n_stocks=30, seed=0):
    """코드 점검용 가짜 데이터. 결과 숫자에는 의미가 없어요."""
    rng = np.random.default_rng(seed)
    calendar = pd.bdate_range(START, "2026-09-30")
    T = len(calendar)
    market = rng.normal(0.0003, 0.011, T)
    rets = market[:, None] + rng.normal(0.0001, 0.017, (T, n_stocks))
    closes = 10000 * np.exp(np.cumsum(rets, axis=0))
    gaps = rng.normal(0, 0.006, (T, n_stocks))
    opens = np.vstack([closes[:1], closes[:-1]]) * np.exp(gaps)
    tickers = [f"{i:06d}" for i in range(n_stocks)]
    index_close = pd.Series(2000 * np.exp(np.cumsum(market)), index=calendar)
    return (pd.DataFrame(opens, calendar, tickers), pd.DataFrame(closes, calendar, tickers), index_close)


# ---------------------------------------------------------------- 신호

def rsi(close, n=2):
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + gain / loss)


def regime(index_close, closes, on):
    """코스피가 200일선 위일 때만 새로 매수 (on=False면 항상 허용)."""
    ok = index_close > index_close.rolling(200).mean() if on else pd.Series(True, index_close.index)
    return pd.DataFrame(np.repeat(ok.to_numpy()[:, None], closes.shape[1], axis=1), closes.index, closes.columns)


def pullback(closes, market_ok, th=10, exit_ma=5, max_hold=10):
    """RSI2 눌림목: 200일선 위 종목이 RSI2 < th로 급락하면 매수, 종가가 exit_ma일선 위로 오면 매도."""
    rsi2 = rsi(closes)
    entry = (closes > closes.rolling(200).mean()) & (rsi2 < th) & market_ok
    return entry, closes > closes.rolling(exit_ma).mean(), -rsi2, max_hold


def breakout(closes, market_ok, n=20, exit_n=10):
    """신고가 돌파: 종가가 직전 n일 최고가를 넘으면 매수, 직전 exit_n일 최저가 아래로 내려가면 매도."""
    entry = (closes > closes.rolling(n).max().shift(1)) & market_ok
    return entry, closes < closes.rolling(exit_n).min().shift(1), closes / closes.shift(n), None


def dip_after_breakout(closes, market_ok, th=10, n=20, within=10, exit_ma=5, max_hold=10):
    """조합 규칙: 최근 within일 안에 n일 신고가를 낸 종목이 RSI2 < th로 눌리면 매수 (매도는 눌림목과 같음).
    두 신호는 같은 날 동시에 나올 수 없어서(신고가 날은 RSI2가 높음) '돌파 뒤 첫 눌림'으로 합쳤어요."""
    rsi2 = rsi(closes)
    new_high = (closes >= closes.rolling(n).max()).astype(float)
    recent_high = new_high.rolling(within, min_periods=1).max().shift(1) > 0
    entry = recent_high & (rsi2 < th) & (closes > closes.rolling(200).mean()) & market_ok
    return entry, closes > closes.rolling(exit_ma).mean(), -rsi2, max_hold


# ---------------------------------------------------------------- 시뮬레이션

def simulate(opens, closes, entry, exit_, rank, max_hold, cost, capital=None, cash_rate=CASH_RATE,
             stop=None, weight=None):
    """일봉 포트폴리오 시뮬레이션.

    capital이 없으면 소수 주식 허용(비율로만 계산), 있으면 그 금액으로 정수 주식만 매수해요.
    stop: 종가가 매수 시가보다 이 비율 넘게 빠지면 다음 날 시가에 손절 (예: 0.05)
    weight: 종목당 평가금액 대비 비중 (기본 1/MAX_POSITIONS, 0.1이면 5종목 다 차도 절반은 현금)
    반환: (자산 곡선(시작=1), 평균 투자 비중, 거래 목록[(수익률, 보유일)], 돈이 모자라 못 산 횟수)
    """
    buy_mult = 1 + cost["fee"] + cost["slip"]
    sell_mult = 1 - cost["fee"] - cost["tax"] - cost["slip"]
    daily_cash = (1 + cash_rate) ** (1 / 252) - 1
    o, c = opens.to_numpy(float), closes.ffill().to_numpy(float)
    ent, ext, rk = entry.fillna(False).to_numpy(bool), exit_.fillna(False).to_numpy(bool), rank.to_numpy(float)
    T, N = c.shape
    start = float(capital) if capital else 1.0
    cash, shares, cost_basis, buy_day, buy_open = start, np.zeros(N), np.zeros(N), np.zeros(N, int), np.zeros(N)
    equity, invested = np.empty(T), np.empty(T)
    trades, skipped, to_sell, to_buy = [], 0, [], []
    for i in range(T):
        for j in to_sell:
            if not np.isnan(o[i, j]):
                proceeds = shares[j] * o[i, j] * sell_mult
                cash += proceeds
                trades.append((proceeds / cost_basis[j] - 1, i - buy_day[j]))
                shares[j] = 0.0
        slot = (equity[i - 1] if i else start) * (weight or 1 / MAX_POSITIONS)
        for j in to_buy:
            if np.isnan(o[i, j]) or cash <= 0:
                continue
            px = o[i, j] * buy_mult
            qty = min(slot, cash) / px
            if capital:
                qty = np.floor(qty)
                if qty < 1:
                    skipped += 1
                    continue
            shares[j], cost_basis[j], buy_day[j], buy_open[j] = qty, qty * px, i, o[i, j]
            cash -= qty * px
        cash *= 1 + daily_cash
        value = np.nansum(shares * c[i])
        equity[i], invested[i] = cash + value, value / (cash + value)

        held = shares > 0
        selling = held & ext[i]
        if max_hold:
            selling |= held & (i - buy_day >= max_hold)
        if stop:
            selling |= held & (c[i] < buy_open * (1 - stop))
        to_sell = list(np.where(selling)[0])
        free = MAX_POSITIONS - held.sum() + selling.sum()
        candidates = np.where(ent[i] & ~held & ~np.isnan(rk[i]))[0]
        to_buy = list(candidates[np.argsort(-rk[i, candidates], kind="stable")][:max(free, 0)])
    return pd.Series(equity / start, index=closes.index), invested.mean(), trades, skipped


# ---------------------------------------------------------------- 지표

def cagr(curve):
    return (curve.iloc[-1] / curve.iloc[0]) ** (252 / max(len(curve) - 1, 1)) - 1


def curve_stats(curve):
    rets = curve.pct_change().dropna()
    excess = rets - ((1 + CASH_RATE) ** (1 / 252) - 1)
    first, second = curve[curve.index < SPLIT], curve[curve.index >= SPLIT]
    return {
        "cagr": cagr(curve),
        "mdd": (curve / curve.cummax() - 1).min(),
        "sharpe": excess.mean() / excess.std() * np.sqrt(252) if excess.std() > 0 else 0.0,
        "first": cagr(first) if len(first) > 1 else np.nan,
        "second": cagr(second) if len(second) > 1 else np.nan,
    }


def trade_stats(trades, years):
    if not trades:
        return dict(n_per_year=0, win=np.nan, avg=np.nan, avg_win=np.nan, avg_loss=np.nan, payoff=np.nan, hold=np.nan)
    r, d = np.array([t[0] for t in trades]), np.array([t[1] for t in trades])
    wins, losses = r[r > 0], r[r <= 0]
    avg_win = wins.mean() if len(wins) else 0.0
    avg_loss = losses.mean() if len(losses) else 0.0
    return dict(n_per_year=len(r) / years, win=(r > 0).mean(), avg=r.mean(), avg_win=avg_win, avg_loss=avg_loss,
                payoff=avg_win / -avg_loss if avg_loss < 0 else np.inf, hold=d.mean())


def pct(x, digits=1):
    return "-" if pd.isna(x) else f"{x * 100:+.{digits}f}%"


# ---------------------------------------------------------------- 실행

def strategies(closes, index_close):
    out = {}
    for flt in (False, True):
        ok = regime(index_close, closes, flt)
        tag = " + 코스피 200일선 필터" if flt else ""
        out[f"눌림목 (RSI2<10){tag}"] = pullback(closes, ok)
        out[f"돌파 (20일 신고가){tag}"] = breakout(closes, ok)
        out[f"조합: 돌파 후 눌림{tag}"] = dip_after_breakout(closes, ok)
    return out


def report(opens, closes, index_close, capital, lines):
    keep = closes.index >= TEST_START
    o, c, idx = opens[keep], closes[keep], index_close[keep]
    years = keep.sum() / 252
    out = lines.append

    out(f"기간 {c.index[0]:%Y-%m-%d} ~ {c.index[-1]:%Y-%m-%d} ({years:.1f}년), 종목 {c.shape[1]}개, "
        f"최대 {MAX_POSITIONS}종목 동시 보유, 앞/뒤 구간 경계 {SPLIT}\n")
    out("### 포트폴리오 성과\n")
    out("| 전략 | 연평균 (기본 비용) | 연평균 (보수적 비용) | 최대 낙폭 | 샤프 | 앞 구간 | 뒤 구간 | 평균 투자 비중 |")
    out("|---|---:|---:|---:|---:|---:|---:|---:|")
    results = {}
    for name, (entry, exit_, rank, max_hold) in strategies(closes, index_close).items():
        runs = {k: simulate(o, c, entry[keep], exit_[keep], rank[keep], max_hold, cost) for k, cost in COSTS.items()}
        results[name] = (runs, (entry, exit_, rank, max_hold))
        curve, exposure, _, _ = runs["기본"]
        s = curve_stats(curve)
        out(f"| {name} | {pct(s['cagr'])} | {pct(cagr(runs['보수적'][0]))} | {pct(s['mdd'], 0)} | {s['sharpe']:.2f} | "
            f"{pct(s['first'])} | {pct(s['second'])} | {exposure * 100:.0f}% |")
    equal = (1 + c.pct_change().mean(axis=1).fillna(0)).cumprod()
    kospi = idx / idx.iloc[0]
    for name, curve in ((f"{c.shape[1]}개 같은 비중 보유", equal), ("코스피 지수 보유 (배당 제외)", kospi)):
        s = curve_stats(curve)
        out(f"| {name} | {pct(s['cagr'])} | {pct(s['cagr'])} | {pct(s['mdd'], 0)} | {s['sharpe']:.2f} | "
            f"{pct(s['first'])} | {pct(s['second'])} | 100% |")

    out("\n### 거래 통계 (기본 비용, 거래당 수익률은 비용 차감 후)\n")
    out("| 전략 | 연 거래 수 | 승률 | 거래당 평균 | 평균 이익 | 평균 손실 | 손익비 | 평균 보유일 |")
    out("|---|---:|---:|---:|---:|---:|---:|---:|")
    for name, (runs, _) in results.items():
        t = trade_stats(runs["기본"][2], years)
        out(f"| {name} | {t['n_per_year']:.0f} | {t['win'] * 100:.0f}% | {pct(t['avg'], 2)} | {pct(t['avg_win'], 2)} | "
            f"{pct(t['avg_loss'], 2)} | {t['payoff']:.2f} | {t['hold']:.1f}일 |")

    if capital:
        out(f"\n### 소액 계좌 ({capital:,.0f}원, 정수 주식만, 종목당 약 {capital / MAX_POSITIONS:,.0f}원)\n")
        out("| 전략 | 연평균 | 최대 낙폭 | 돈이 모자라 못 산 신호 | 실제 체결 거래 |")
        out("|---|---:|---:|---:|---:|")
        for name, (_, (entry, exit_, rank, max_hold)) in results.items():
            curve, _, trades, skipped = simulate(o, c, entry[keep], exit_[keep], rank[keep], max_hold, COSTS["기본"],
                                                 capital=capital)
            s = curve_stats(curve)
            out(f"| {name} | {pct(s['cagr'])} | {pct(s['mdd'], 0)} | {skipped} | {len(trades)} |")
    return results


def sweep(opens, closes, index_close, lines):
    """임계값 스윕: 앞 구간 샤프로 순위를 매기고 뒤 구간(본 적 없는 기간) 성과를 같이 봐요."""
    keep = closes.index >= TEST_START
    o, c = opens[keep], closes[keep]
    out = lines.append
    grids = {
        "눌림목": (pullback, dict(th=[5, 10, 15, 20, 30], exit_ma=[3, 5, 10], max_hold=[5, 10, 20])),
        "돌파": (breakout, dict(n=[10, 20, 55], exit_n=[5, 10, 20])),
        "조합": (dip_after_breakout, dict(th=[10, 20, 30], n=[20, 55], within=[5, 10, 20])),
    }
    for flt in (False, True):
        ok = regime(index_close, closes, flt)
        for family, (fn, grid) in grids.items():
            rows = []
            for values in itertools.product(*grid.values()):
                params = dict(zip(grid, values))
                entry, exit_, rank, max_hold = fn(closes, ok, **params)
                curve, _, trades, _ = simulate(o, c, entry[keep], exit_[keep], rank[keep], max_hold, COSTS["기본"])
                first, second = curve[curve.index < SPLIT], curve[curve.index >= SPLIT]
                s1, s2 = curve_stats(first), curve_stats(second / second.iloc[0])
                r = np.array([t[0] for t in trades]) if trades else np.array([np.nan])
                rows.append((params, s1["sharpe"], s1["cagr"], s2["sharpe"], s2["cagr"], s2["mdd"], np.nanmean(r > 0)))
            rows.sort(key=lambda x: -x[1])
            tag = " + 코스피 200일선 필터" if flt else ""
            out(f"\n#### {family}{tag}: 앞 구간 샤프 상위 5개 → 뒤 구간 성과\n")
            out("| 설정 | 앞 샤프 | 앞 연평균 | 뒤 샤프 | 뒤 연평균 | 뒤 최대 낙폭 | 전체 승률 |")
            out("|---|---:|---:|---:|---:|---:|---:|")
            for params, sh1, cg1, sh2, cg2, mdd2, win in rows[:5]:
                label = ", ".join(f"{k}={v}" for k, v in params.items())
                out(f"| {label} | {sh1:.2f} | {pct(cg1)} | {sh2:.2f} | {pct(cg2)} | {pct(mdd2, 0)} | {win * 100:.0f}% |")
            ranks = pd.Series([x[3] for x in rows]).rank(ascending=False)
            out(f"\n앞 구간 1등 설정의 뒤 구간 순위: {int(ranks.iloc[0])}/{len(rows)}등")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--csv", type=pathlib.Path, help="date,ticker,open,close 형식 (코스피 지수는 ticker=^KS11)")
    parser.add_argument("--synthetic", action="store_true", help="가짜 데이터로 코드만 점검")
    parser.add_argument("--capital", type=float, help="이 금액(원)으로 정수 주식 시뮬레이션도 추가")
    parser.add_argument("--no-sweep", action="store_true", help="임계값 스윕 생략")
    parser.add_argument("--out", type=pathlib.Path, help="결과 마크다운 저장 경로")
    args = parser.parse_args()

    if args.synthetic:
        opens, closes, index_close = synthetic()
        title = "가짜 데이터 점검 (숫자에 의미 없음)"
    else:
        path = args.csv or pathlib.Path("data/kr_daily.csv")
        if not path.exists():
            download(path)
        opens, closes, index_close = load_csv(path)
        title = "한국 대형주 스윙 규칙 백테스트"

    lines = [f"## {title}\n"]
    report(opens, closes, index_close, args.capital, lines)
    if not args.no_sweep:
        lines.append("\n### 임계값 스윕 (기본 비용)")
        sweep(opens, closes, index_close, lines)
    lines.append("\n종가에 신호, 다음 날 시가 매매, 종목당 자본 1/5, 남는 돈은 연 2.5% 이자. "
                 "코스피 지수는 배당 제외라 실제 보유 수익보다 연 1~2%p 낮게 나와요. 과거 성과가 미래를 보장하진 않아요.")
    text = "\n".join(lines)
    print(text)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
