#!/usr/bin/env python3
"""백테스트: 과거에 이렇게 섞어 들고 있었으면 얼마나 오르고 얼마나 떨어졌나 (공부·검증용)

Claude 토큰을 아끼려고 만든 구조예요.
  1. 계산은 이 스크립트가 다 하고, 화면에는 요약 몇 줄만 찍어요. 자세한 숫자는 backtest/results/<이름>.json에.
  2. 일봉은 backtest/prices/<기호>.csv에 쌓아 두고, 다음부터는 새로 생긴 날짜만 야후에서 받아요.
  3. 무거운 실행은 GitHub Actions(backtest.yml, 폰에서 Run workflow)가 하고 결과 파일만 커밋해요.
  4. 오류가 나도 마지막 몇 줄만 찍고, 전체는 backtest/last_error.log에 둬요.

전략은 backtest/strategies.json에 적어요 (폰에서 GitHub 파일 고치기로 바꿀 수 있어요).
  {"이름": {"desc": "설명", "assets": {"sp500": 60, "usmid": 40}, "rebalance": "Q",
           "filter": {"ma": 200, "to": "cash"}, "bench": "sp500"}}
  - assets: lab.py 자산 키(kospi·sp500·usmid·gold·cash…) 또는 야후 기호(SCHD, 005930.KS). 비율은 합이 100 아니어도 나눠 맞춰요.
  - rebalance: M(매달) Q(분기) Y(매년) N(안 함). 기본 Q.
  - filter(없어도 됨): 각 자산이 n일 이동평균 아래로 내려가면 그 몫을 to 자산으로 옮겨요. 달 마지막 날에만 봐요.
  - bench: 비교할 자산 (기본: 첫 자산 그대로 들고 있기).
매매 신호가 아니에요. 과거 숫자일 뿐 앞으로를 보장하지 않아요. 세금은 빼고, 비용은 사고판 금액의 0.1%로 쳐요.

사용법:
    python backtest.py                     # 전략 전부 → 한 줄씩 비교표
    python backtest.py 60-40               # 하나만 → 요약 몇 줄
    python backtest.py --mix "sp500:60,usmid:40" --rebalance Y   # 파일 안 고치고 바로
    python backtest.py --start 2010-01-01 --offline   # 받지 않고 쌓아 둔 일봉만
    python backtest.py --list              # 전략 이름만
"""

import argparse
import datetime as dt
import json
import pathlib
import sys
import time
import traceback

import pandas as pd

import lab

ROOT = pathlib.Path("backtest")
PRICES = ROOT / "prices"
RESULTS = ROOT / "results"
STRATS = ROOT / "strategies.json"
LATEST = ROOT / "LATEST.md"
ERRLOG = ROOT / "last_error.log"
KST = dt.timezone(dt.timedelta(hours=9))
FX = lab.FX
ALIAS = {a[0]: (a[2], a[3], a[1]) for a in lab.ASSETS}  # 키 → (야후 기호, 통화, 이름)
FEE = 0.001  # 사고판 금액의 0.1%
START = "2000-01-01"
NOTE = "※ 공부용 과거 숫자예요. 매매 신호가 아니고 앞으로를 보장하지 않아요 (세금 뺌, 비용 0.1%)."


# ---------------------------------------------------------------- 일봉 쌓아 두기
def resolve(asset):
    """자산 이름 → (야후 기호, 통화, 보여 줄 이름)."""
    if asset in ALIAS:
        return ALIAS[asset]
    sym = asset.upper()
    cur = "krw" if sym.endswith((".KS", ".KQ")) else "usd"
    return sym, cur, sym


def cache_path(sym):
    return PRICES / (sym.replace("^", "_").replace("=", "_").replace("/", "_") + ".csv")


def read_cache(sym):
    p = cache_path(sym)
    if not p.exists():
        return None
    s = pd.read_csv(p, index_col=0, parse_dates=True)["close"]
    return s.dropna()


def merge(old, new):
    """쌓아 둔 일봉 + 새로 받은 일봉. 분배금이 생기면 야후가 옛 수정 종가를 통째로 바꿔서,
    겹치는 첫날 비율로 옛 값을 같이 맞춰요 (수익률은 그대로)."""
    if old is None or old.empty:
        return new
    if new is None or new.empty:
        return old
    first = new.index[0]
    if first in old.index and old[first] > 0:
        ratio = new[first] / old[first]
        if abs(ratio - 1) > 1e-4:
            old = old * ratio
    out = pd.concat([old[old.index < first], new])
    return out[~out.index.duplicated(keep="last")].sort_index()


def download(sym, start, tries=3):
    import yfinance as yf  # 받을 때만

    for i in range(tries):
        try:
            df = yf.download(sym, start=start, interval="1d", auto_adjust=True, progress=False, threads=False)
            if df is not None and not df.empty:
                s = df["Close"]
                if isinstance(s, pd.DataFrame):
                    s = s.iloc[:, 0]
                s.index = pd.to_datetime(s.index).tz_localize(None).normalize()
                return s.dropna().astype(float)
        except Exception:  # 다음 번에 다시
            pass
        time.sleep(2 * (i + 1))
    return None


def prices(sym, offline=False, refresh=False):
    """기호 하나의 일봉 (쌓아 둔 것 + 새 날짜만)."""
    old = None if refresh else read_cache(sym)
    if offline:
        if old is None:
            raise SystemExit(f"{sym}: 쌓아 둔 일봉이 없어요 (--offline 빼고 한 번 받기)")
        return old, 0
    since = START if old is None or old.empty else (old.index[-1] - pd.Timedelta(days=10)).strftime("%Y-%m-%d")
    new = download(sym, since)
    if new is None:
        if old is None:
            raise SystemExit(f"{sym}: 야후에서 못 받았어요 (기호 확인)")
        return old, 0
    if sym == FX:
        new = new.where((new > 500) & (new < 3000)).dropna()  # 야후 원/달러에 가끔 틀린 값
    added = len(new.index.difference(old.index)) if old is not None else len(new)
    s = merge(old, new)
    PRICES.mkdir(parents=True, exist_ok=True)
    s.round(6).rename("close").rename_axis("date").to_csv(cache_path(sym))
    return s, added


def despike(s, jump=0.08):
    """야후 일봉에 가끔 하루만 튀는 틀린 값이 있어요 (예: 069500 2026-07-31 +24% → 다음 날 -9%).
    앞날·다음 날 둘 다와 jump 넘게, 같은 쪽으로 벌어진 날은 빼고 앞 값으로 채워요. 쌓아 둔 원본은 그대로."""
    prev, nxt = s.shift(1), s.shift(-1)
    up = (s > prev * (1 + jump)) & (s > nxt * (1 + jump))
    down = (s < prev * (1 - jump)) & (s < nxt * (1 - jump))
    bad = up | down
    return s.mask(bad).ffill(), int(bad.sum())


def load_table(assets, krw=True, offline=False, refresh=False):
    """자산들 일봉을 날짜에 맞춰 한 표로 (달러 자산은 원화로). 반환: (표, 새로 받은 날 수)."""
    cols, added, fx = {}, 0, None
    if krw and any(resolve(a)[1] == "usd" for a in assets):
        fx, n = prices(FX, offline, refresh)
        added += n
    for a in assets:
        sym, cur, _ = resolve(a)
        s, n = prices(sym, offline, refresh)
        added += n
        s, _ = despike(s)
        if krw and cur == "usd":
            s = s * fx.reindex(s.index.union(fx.index)).ffill().reindex(s.index)
        cols[a] = s
    df = pd.DataFrame(cols).sort_index().ffill()  # 국장·미장 휴일이 달라서 앞 값으로 채워요
    return df, added


# ---------------------------------------------------------------- 계산
def run(df, weights, rebalance="Q", filt=None, fee=FEE):
    """df: 날짜 × 자산 가격, weights: {자산: 비율}. 반환: (평가액 Series, 매매 횟수)."""
    w = pd.Series(weights, dtype=float)
    w = w / w.sum()
    ret = df.pct_change().fillna(0.0)
    month_end = df.index.to_series().groupby(df.index.to_period("M")).transform("max") == df.index.to_series()
    code = (rebalance or "Q").upper()[0]
    if code == "N":
        reb = pd.Series(False, index=df.index)
    else:
        per = {"M": "M", "Q": "Q", "Y": "Y"}.get(code, "Q")
        reb = df.index.to_series().groupby(df.index.to_period(per)).transform("max") == df.index.to_series()
    below = None
    if filt:
        n, to = int(filt.get("ma", 200)), filt.get("to", "cash")
        ma = df.rolling(n, min_periods=n).mean()
        below = (df < ma) & ma.notna()

    def target(i):
        t = w.copy()
        if below is not None:
            for a in w.index:
                if a != to and below.iloc[i][a]:
                    t[to] = t.get(to, 0.0) + t[a]
                    t[a] = 0.0
        return t.reindex(df.columns, fill_value=0.0)

    hold = target(0)
    value, vals, trades = 1.0, [], 0
    for i in range(len(df)):
        if i:
            r = ret.iloc[i]
            grow = hold * (1 + r)
            value = float(grow.sum()) * value
            hold = grow / grow.sum()
        # 그날 종가로 보고 그날 맞춰요 (다음 날 수익률부터 반영 → 미래를 미리 보지 않아요)
        check = month_end.iloc[i] if below is not None else False
        if reb.iloc[i] or check:
            t = target(i)
            turn = float((t - hold).abs().sum()) / 2
            if turn > 1e-6:
                value *= 1 - fee * turn * 2
                hold, trades = t, trades + 1
        vals.append(value)
    return pd.Series(vals, index=df.index), trades


def stats(eq):
    """평가액 → 숫자 요약."""
    years = (eq.index[-1] - eq.index[0]).days / 365.25
    total = eq.iloc[-1] / eq.iloc[0] - 1
    cagr = (eq.iloc[-1] / eq.iloc[0]) ** (1 / years) - 1 if years > 0 else 0.0
    peak = eq.cummax()
    dd = eq / peak - 1
    trough = dd.idxmin()
    # 가장 오래 물려 있던 기간 (고점 다시 넘을 때까지)
    under, longest, start = dd < -1e-9, 0, None
    for d, u in under.items():
        if u and start is None:
            start = d
        if not u and start is not None:
            longest, start = max(longest, (d - start).days), None
    if start is not None:
        longest = max(longest, (eq.index[-1] - start).days)
    daily = eq.pct_change().dropna()
    vol = float(daily.std() * (252 ** 0.5)) if len(daily) > 1 else 0.0
    yearly = eq.groupby(eq.index.year).last()
    first = eq.iloc[0]
    yr = (yearly / yearly.shift(1).fillna(first) - 1).round(4)
    return dict(
        start=eq.index[0].strftime("%Y-%m-%d"), end=eq.index[-1].strftime("%Y-%m-%d"), years=round(years, 1),
        total=round(float(total), 4), cagr=round(float(cagr), 4), mdd=round(float(dd.min()), 4),
        mdd_date=trough.strftime("%Y-%m"), underwater_months=round(longest / 30.44),
        vol=round(vol, 4), calmar=round(float(cagr / -dd.min()), 2) if dd.min() < 0 else None,
        worst_year=[int(yr.idxmin()), float(yr.min())], best_year=[int(yr.idxmax()), float(yr.max())],
        yearly={int(k): float(v) for k, v in yr.items()},
    )


def pct(x, sign=False):
    return f"{x * 100:+.1f}%" if sign else f"{x * 100:.1f}%"


def backtest(name, spec, start=None, krw=True, offline=False, refresh=False):
    assets = {k: float(v) for k, v in spec["assets"].items()}
    filt = spec.get("filter")
    bench = spec.get("bench") or next(iter(assets))
    need = list(dict.fromkeys(list(assets) + ([filt.get("to", "cash")] if filt else []) + [bench]))
    df, added = load_table(need, krw=krw, offline=offline, refresh=refresh)
    df = df.dropna(subset=list(dict.fromkeys(list(assets) + [bench])))
    df = df.bfill()  # 거르기로 옮겨 갈 자산이 늦게 상장했으면 그 전엔 수익률 0 (현금처럼)
    if start:
        df = df[df.index >= pd.Timestamp(start)]
    if len(df) < 60:
        raise SystemExit(f"{name}: 겹치는 날이 {len(df)}일뿐이에요 (상장이 늦은 자산이 있어요)")
    eq, trades = run(df, assets, spec.get("rebalance", "Q"), filt)
    beq, _ = run(df[[bench]], {bench: 1.0}, "N")
    s, b = stats(eq), stats(beq)
    monthly = eq.groupby(eq.index.to_period("M")).last()
    out = dict(
        name=name, desc=spec.get("desc", ""), spec=spec, krw=krw, trades=trades, fee=FEE,
        updated=dt.datetime.now(KST).isoformat(timespec="minutes"), stats=s,
        bench=dict(asset=bench, stats={k: v for k, v in b.items() if k != "yearly"}),
        monthly={str(k): round(float(v), 4) for k, v in monthly.items()},
        note=NOTE,
    )
    return out, added


def summary(r):
    """한 전략 → 요약 몇 줄 (Claude가 읽는 건 이것뿐)."""
    s, b = r["stats"], r["bench"]["stats"]
    wy, by = s["worst_year"], s["best_year"]
    return [
        f"[{r['name']}] {r['desc']}".rstrip(),
        f"기간 {s['start']}~{s['end']} ({s['years']}년, {'원화' if r['krw'] else '현지 통화'} 기준)",
        f"연평균 {pct(s['cagr'])} · 총 {pct(s['total'], True)} · 변동성 연 {pct(s['vol'])}",
        f"최대 낙폭 {pct(s['mdd'])} ({s['mdd_date']}) · 가장 길게 물린 기간 {s['underwater_months']}달",
        f"최악의 해 {wy[0]} {pct(wy[1], True)} · 최고의 해 {by[0]} {pct(by[1], True)} · 맞춘 횟수 {r['trades']}번",
        f"비교 {r['bench']['asset']} 그대로: 연평균 {pct(b['cagr'])} · 최대 낙폭 {pct(b['mdd'])} · 변동성 {pct(b['vol'])}",
    ]


def table(results):
    """전략 여럿 → 한 줄씩."""
    lines = ["전략 | 연평균 | 최대 낙폭 | 물린 기간 | 변동성 | 기간"]
    for r in sorted(results, key=lambda r: r["stats"]["mdd"], reverse=True):  # 낙폭 작은 순
        s = r["stats"]
        lines.append(f"{r['name']} | {pct(s['cagr'])} | {pct(s['mdd'])} | {s['underwater_months']}달 | {pct(s['vol'])} | {s['start'][:4]}~")
    return lines


def parse_mix(text):
    out = {}
    for part in text.split(","):
        if part.strip():
            k, _, v = part.partition(":")
            out[k.strip()] = float(v or 1)
    if not out:
        raise SystemExit("--mix 예: sp500:60,usmid:40")
    return out


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("names", nargs="*", help="전략 이름 (없으면 전부, all도 전부)")
    p.add_argument("--mix", help='파일 없이 바로: "sp500:60,usmid:40"')
    p.add_argument("--rebalance", default="Q", help="--mix용 M·Q·Y·N")
    p.add_argument("--ma", type=int, help="--mix용 이동평균 거르기 (일, 예: 200)")
    p.add_argument("--start", help="시작일 YYYY-MM-DD")
    p.add_argument("--local", action="store_true", help="원화로 안 바꾸고 현지 통화 그대로")
    p.add_argument("--offline", action="store_true", help="야후에서 안 받고 쌓아 둔 일봉만")
    p.add_argument("--refresh", action="store_true", help="쌓아 둔 일봉을 버리고 처음부터 받기")
    p.add_argument("--list", action="store_true", help="전략 이름만")
    a = p.parse_args(argv)

    strats = json.loads(STRATS.read_text(encoding="utf-8")) if STRATS.exists() else {}
    strats = {k: v for k, v in strats.items() if not k.startswith("_")}
    if a.list:
        for k, v in strats.items():
            print(f"{k}: {v.get('desc', '')}")
        return 0
    if a.mix:
        spec = dict(desc="바로 입력", assets=parse_mix(a.mix), rebalance=a.rebalance)
        if a.ma:
            spec["filter"] = {"ma": a.ma, "to": "cash"}
        todo = {"mix": spec}
    else:
        names = [n for n in a.names if n != "all"] or list(strats)
        missing = [n for n in names if n not in strats]
        if missing:
            raise SystemExit(f"없는 전략: {', '.join(missing)} (있는 것: {', '.join(strats)})")
        todo = {n: strats[n] for n in names}

    results, added = [], 0
    RESULTS.mkdir(parents=True, exist_ok=True)
    for name, spec in todo.items():
        r, n = backtest(name, spec, a.start, krw=not a.local, offline=a.offline, refresh=a.refresh)
        added += n
        results.append(r)
        (RESULTS / f"{name}.json").write_text(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    lines = summary(results[0]) if len(results) == 1 else table(results)
    lines += [f"새로 받은 날 {added}개 · 자세한 숫자: backtest/results/<이름>.json", NOTE]
    print("\n".join(lines))
    stamp = dt.datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    LATEST.write_text(f"# 최근 백테스트 ({stamp})\n\n```\n" + "\n".join(lines) + "\n```\n", encoding="utf-8")
    if ERRLOG.exists():
        ERRLOG.unlink()
    return 0


def short_error(e):
    """오류는 마지막 몇 줄만 (전체는 last_error.log)."""
    full = traceback.format_exc()
    try:
        ROOT.mkdir(parents=True, exist_ok=True)
        ERRLOG.write_text(full, encoding="utf-8")
    except OSError:
        pass
    tail = [ln for ln in full.strip().split("\n") if ln.strip()][-3:]
    return "오류: " + "\n".join(tail) + f"\n(전체: {ERRLOG})"


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit as e:
        if e.code not in (None, 0):
            print(e.code if isinstance(e.code, str) else f"오류 코드 {e.code}")
            sys.exit(1)
    except Exception as e:  # noqa: BLE001
        print(short_error(e))
        sys.exit(1)
