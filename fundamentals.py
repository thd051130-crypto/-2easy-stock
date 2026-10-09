#!/usr/bin/env python3
"""종목 화면 재무제표: 야후 파이낸스 무료 자료로 PER·PBR·시가총액·배당, 연간·분기 매출·영업이익·순이익을 모아요.

재무는 분기마다 바뀌어서 매주 한 번(fundamentals 워크플로) paper/<시장>/fundamentals.json 으로 저장해요.
대시보드 배포 때 stock_pages.py가 이 파일을 종목별 화면 파일에 붙여요.
  - 한국 종목은 야후가 PER·PBR을 비워 둘 때가 많아서 최근 4분기 순이익, 최근 자본총계로 직접 계산해요.
  - 한 종목을 못 받아도 지난번 값을 그대로 둬요 (야후가 잠깐 막혀도 화면이 비지 않게).

사용법:
    python fundamentals.py                 # 국장·미장 둘 다
    python fundamentals.py --market kr     # 국장만
"""

import argparse
import datetime as dt
import json
import math
import pathlib
import time

import departments
import strategy
import watchlist
from markets import MARKETS

KST = dt.timezone(dt.timedelta(hours=9))
# 재무제표 항목 (야후 이름, 앞에 있는 것부터 찾아요)
ROWS = {"revenue": ["Total Revenue"], "op": ["Operating Income"], "net": ["Net Income Common Stockholders", "Net Income"]}
EQUITY = ["Common Stock Equity", "Stockholders Equity"]
YEARS, QUARTERS = 4, 6


def stocks(market, extras=True):
    """화면에 종목 화면이 있는 종목: 알림이 보는 종목 + 미장은 SPY (+ extras면 텔레그램으로 넣은 관심종목)."""
    out = dict(MARKETS[market]["universe"])
    if market == "us":
        out[strategy.US_ETF] = strategy.US_ETF
    if extras:
        for code, e in watchlist.extras(market).items():
            out.setdefault(code, e.get("name") or code)
    return out


def symbol(market, code):
    """야후 종목 기호. 텔레그램으로 넣은 코스닥 종목은 .KQ라서 넣을 때 적어 둔 기호를 써요."""
    if code not in MARKETS[market]["universe"]:
        extra = watchlist.extras(market).get(code)
        if extra and extra.get("symbol"):
            return extra["symbol"]
    return f"{code}{MARKETS[market]['suffix']}"


def num(x):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(x) or math.isinf(x) else x


def series(table, n, date_fmt):
    """야후 재무제표(행=항목, 열=기간 끝 날짜) → 오래된 기간부터 {"dates", "revenue", "op", "net"}.
    값이 하나도 없는 기간(야후가 빈 열을 줄 때)은 빼요. 표가 없으면 None."""
    if table is None or getattr(table, "empty", True):
        return None
    cols = sorted(table.columns)[-n:]
    out = {"dates": [f"{c:{date_fmt}}" for c in cols]}
    for key, names in ROWS.items():
        name = next((r for r in names if r in table.index), None)
        out[key] = [num(table.at[name, c]) if name else None for c in cols]
    keep = [i for i in range(len(cols)) if any(out[k][i] is not None for k in ROWS)]
    return {k: [v[i] for i in keep] for k, v in out.items()} if keep else None


def ttm(quarterly, key):
    """최근 4분기 합. 4분기가 연달아 다 있어야 해요 (빠진 분기가 있으면 None)."""
    q = quarterly or {}
    dates, vals = (q.get("dates") or [])[-4:], (q.get(key) or [])[-4:]
    if len(vals) < 4 or any(v is None for v in vals):
        return None
    months = [int(d[:4]) * 12 + int(d[5:7]) for d in dates]
    if any(b - a != 3 for a, b in zip(months, months[1:])):
        return None
    return sum(vals)


def latest(table, names):
    """대차대조표에서 가장 최근 분기의 값."""
    if table is None or getattr(table, "empty", True):
        return None
    name = next((r for r in names if r in table.index), None)
    if name is None:
        return None
    for col in sorted(table.columns, reverse=True):
        v = num(table.at[name, col])
        if v is not None:
            return v
    return None


def r2(x):
    return None if x is None else round(x, 2)


REC = {"strong_buy": "적극 매수", "buy": "매수", "hold": "보유", "underperform": "비중 축소", "sell": "매도",
       "strong_sell": "적극 매도", "none": None}
# 실적 발표 시각 → 그 시장 날짜 (미장은 뉴욕 기준, 서머타임 한 시간 차이는 날짜에 거의 영향 없음).
# 배당 날짜는 야후가 그날 0시(UTC)로 줘서 UTC 그대로 읽어요.
TZ = {"kr": KST, "us": dt.timezone(dt.timedelta(hours=-5)), "utc": dt.timezone.utc}


def day_of(market, ts):
    """야후 유닉스 시각 → 'YYYY-MM-DD'. 없거나 이상하면 None."""
    ts = num(ts)
    if not ts or ts <= 0:
        return None
    return f"{dt.datetime.fromtimestamp(ts, TZ[market]).date():%Y-%m-%d}"


def target(info):
    """애널리스트 목표주가(야후 무료 컨센서스): 평균·최고·최저·참여 수·의견. 참여한 애널리스트가 없으면 None."""
    n = num(info.get("numberOfAnalystOpinions"))
    mean = num(info.get("targetMeanPrice"))
    if not n or not mean:
        return None
    return dict(mean=r2(mean), high=r2(num(info.get("targetHighPrice"))), low=r2(num(info.get("targetLowPrice"))),
                n=int(n), rec=REC.get(info.get("recommendationKey")), score=r2(num(info.get("recommendationMean"))))


def events(market, info):
    """배당·실적 일정: 배당락일, 배당 지급일, 1주당 연 배당금·최근 1회 배당금, 다음 실적 발표일."""
    out = dict(exdiv=day_of("utc", info.get("exDividendDate")), paydiv=day_of("utc", info.get("dividendDate")),
               div_rate=r2(num(info.get("dividendRate"))), div_last=r2(num(info.get("lastDividendValue"))),
               earn=day_of(market, info.get("earningsTimestamp") or info.get("earningsTimestampStart")))
    return {k: v for k, v in out.items() if v is not None}


def summarize(market, code, info, annual, quarterly, equity, today=None):
    """화면에 보여 줄 숫자만 골라요. PER·PBR은 야후 값이 없거나 이상하면 재무제표로 계산해요."""
    cap = num(info.get("marketCap"))
    net = ttm(quarterly, "net")  # PER 계산용 순이익: 최근 4분기, 없으면 지난 회계연도
    if net is None and annual and annual["net"]:
        net = annual["net"][-1]
    per = num(info.get("trailingPE"))
    if per is None or not 0 < per < 1000:
        per = cap / net if cap and net and net > 0 else None
    pbr = num(info.get("priceToBook"))
    if pbr is None or not 0.05 < pbr < 200:  # 야후가 단위를 틀리게 줄 때가 있어요 (예: BRK-B 0.001배)
        pbr = cap / equity if cap and equity and equity > 0 else None
    f = departments.fundamentals(info)
    if per is not None:  # 펀더멘탈부 등급도 화면에 보이는 PER로 매겨요
        f.update(per=per, per_kind="PER")
    g = departments.grade(f)
    return dict(
        code=code, name=stocks(market).get(code, code), asof=f"{today or dt.datetime.now(KST).date():%Y-%m-%d}",
        currency=info.get("financialCurrency") or info.get("currency"),
        per=r2(per), loss=bool(net is not None and net <= 0), fwd_per=r2(num(info.get("forwardPE"))),
        pbr=r2(pbr), cap=cap, div=r2(num(info.get("dividendYield"))),  # 배당수익률은 % 단위 (yfinance 1.x)
        roe=r2(f["roe"]), debt=r2(f["debt"]), financial=f["financial"], sector=info.get("sector"),
        grade=dict(grade=g["grade"], score=g["score"], total=g["total"], checks=[[c, bool(ok)] for c, ok in g["checks"]]),
        annual=annual, quarterly=quarterly, target=target(info), events=events(market, info))


def fetch(market, code):
    import yfinance as yf

    t = yf.Ticker(symbol(market, code))
    info = dict(t.info or {})
    if not num(info.get("marketCap")):  # 야후 요약에 시가총액이 빠질 때가 있어요 (예: 한국전력)
        try:
            info["marketCap"] = t.fast_info.get("marketCap")
        except Exception:
            pass
    annual = series(t.income_stmt, YEARS, "%Y")
    if not num(info.get("marketCap")) and not num(info.get("trailingPE")) and annual is None:
        raise ValueError("야후 재무 자료가 비어 있어요")
    return summarize(market, code, info, annual, series(t.quarterly_income_stmt, QUARTERS, "%Y-%m"),
                     latest(t.quarterly_balance_sheet, EQUITY))


def update(path, market, codes=None, fetch=fetch, pause=0.4, retries=2, merge=False):
    """종목마다 받아서 저장. 못 받은 종목은 지난번 값을 둬요. 반환: (받은 수, 못 받은 코드).
    merge면 codes만 새로 받고 나머지 종목도 파일에 그대로 둬요 (봇이 관심종목 하나를 넣었을 때)."""
    old = json.loads(path.read_text()).get("stocks", {}) if path.exists() else {}
    new, failed = (dict(old) if merge else {}), []
    todo = list(codes or stocks(market))
    for code in todo:
        row = None
        for attempt in range(retries):
            try:
                row = fetch(market, code)
                break
            except Exception as e:  # 네트워크·레이트리밋·자료 없음
                print(f"{code} 재무 못 받음 ({attempt + 1}/{retries}): {e!r}")
                time.sleep(pause * 5 * (attempt + 1))
        if row is None:
            failed.append(code)
            row = old.get(code)
        if row is not None:
            new[code] = row
        time.sleep(pause)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(updated=dt.datetime.now(KST).isoformat(timespec="minutes"), stocks=new)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    return len(todo) - len(failed), failed


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--market", action="append", choices=sorted(MARKETS), help="여러 번 쓸 수 있어요 (기본: 둘 다)")
    ap.add_argument("--dir", type=pathlib.Path, default=pathlib.Path("paper"), help="저장 폴더 (기본 paper)")
    args = ap.parse_args()
    for market in args.market or ["kr", "us"]:
        got, failed = update(args.dir / market / "fundamentals.json", market)
        print(f"{MARKETS[market]['name']} 재무 {got}종목 받음" + (f", 못 받음 {len(failed)}: {' '.join(failed)}" if failed else ""))


if __name__ == "__main__":
    main()
