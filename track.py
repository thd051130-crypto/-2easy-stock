"""추천 종목 기록과 추천일부터의 수익률 (대시보드 성과 화면의 "추천 종목 성과").

paper/<시장>/picks.csv 에 날마다 알림이 고른 종목을 남겨요 (swing-signals가 저장소에 같이 커밋해요).
  date   : 신호를 낸 날 (그날 종가 기준으로 골라요)
  src    : signal = 알림 규칙 (국장 매수 후보, 미장은 SPY 매수 신호), rulebook = 내 규칙표 후보
  replay : 1이면 기록을 시작하기 전 날짜를 같은 규칙으로 다시 계산해서 채운 줄이에요 (그날 보낸 알림은 아님)

수익률은 추천일 종가에서 그 뒤 종가까지예요 (야후 수정주가라 배당 포함). 실제 매수는 다음 날 시가라 조금 달라요.
같은 종목이 며칠 연달아 후보에 오르면 처음 오른 날 한 번만 추천으로 세요.
"""

import csv
import statistics

import pandas as pd

import rulebook
import strategy
from markets import MARKETS

COLUMNS = ["date", "src", "code", "name", "close", "replay"]
SOURCES = {"signal": "알림 규칙", "rulebook": "내 규칙표"}
REPLAY_DAYS = 120  # 기록 파일이 처음 생길 때 같은 규칙으로 채우는 과거 거래일 수 (약 6개월)
REPEAT_GAP = 10    # 같은 종목이 이 거래일 안에 다시 후보에 오르면 같은 추천으로 봐요
PATH_DAYS = 20     # 평균 그래프: 추천 후 며칠까지
SPARK_DAYS = 60    # 종목별 작은 그래프: 추천 후 며칠까지
RECENT = 30        # 화면에 보여 줄 최근 추천 수 (출처별)
HORIZONS = (5, 10, 20)


def etf_name():
    return f"{strategy.US_ETF} (S&P500 ETF)"


def _row(closes, i, src, code, name, replay):
    return dict(date=f"{closes.index[i]:%Y-%m-%d}", src=src, code=code, name=name,
                close=round(float(closes[code].iloc[i]), 2), replay=replay)


def replay(market, closes, index_close, volumes, days=REPLAY_DAYS):
    """마지막 날을 뺀 최근 days거래일 동안 지금 규칙이 골랐을 종목 (마지막 날은 오늘 신호로 따로 남겨요)."""
    names = MARKETS[market]["universe"]
    stocks = [c for c in closes.columns if c in names]
    n = len(closes)
    days_idx = range(max(1, n - 1 - days), n - 1)
    rows = []
    if market == "kr":  # compute_signals와 같은 계산
        f = strategy.kr_frames(closes, index_close)
        entry, rank = f["entry"].fillna(False), f["rank"]
        for i in days_idx:
            codes = sorted(entry.columns[entry.iloc[i].to_numpy(bool)], key=lambda c: -rank[c].iloc[i])
            rows += [_row(closes, i, "signal", c, names.get(c, c), 1) for c in codes]
    elif strategy.US_ETF in closes:  # 미장 알림은 S&P500이 조건을 새로 만족한 날 SPY 매수
        ok = strategy.us_ok(index_close)[0].reindex(closes.index).fillna(False)
        rows += [_row(closes, i, "signal", strategy.US_ETF, etf_name(), 1) for i in days_idx
                 if ok.iloc[i] and not ok.iloc[i - 1] and pd.notna(closes[strategy.US_ETF].iloc[i])]
    ind = rulebook.indicators(closes[stocks], volumes[stocks] if volumes is not None else None, index_close)
    for i in days_idx:
        rows += [_row(closes, i, "rulebook", c, names.get(c, c), 1) for c in rulebook.candidates(rulebook.day_row(ind, i))]
    return rows


def today_rows(market, payload):
    """오늘 신호(signal.json 내용)에서 추천 종목만 뽑아요."""
    day, rows = payload["day"], []
    if market == "kr":
        rows += [dict(src="signal", code=p["code"], name=p["name"], close=p["close"]) for p in payload["picks"]]
    elif payload.get("action") == "buy" and payload.get("etf_close"):
        rows.append(dict(src="signal", code=strategy.US_ETF, name=etf_name(), close=payload["etf_close"]))
    rows += [dict(src="rulebook", code=p["code"], name=p["name"], close=p["close"]) for p in payload.get("rulebook", [])]
    return [dict(r, date=day, replay=0) for r in rows]


def read(path):
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return [dict(r, close=float(r["close"]), replay=int(r["replay"])) for r in csv.DictReader(f)]


def write(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows({k: r[k] for k in COLUMNS} for r in rows)


def update(path, market, payload, closes, index_close, volumes):
    """오늘 추천을 기록에 더해요. 기록 파일이 없으면 지난 REPLAY_DAYS거래일을 같은 규칙으로 먼저 채워요.
    같은 날을 다시 돌리면(휴일에 다시 실행 등) 그날 줄을 새로 써요."""
    rows = read(path) or replay(market, closes, index_close, volumes)
    day = payload["day"]
    rows = [r for r in rows if r["date"] != day] + today_rows(market, payload)
    rows.sort(key=lambda r: r["date"])  # 같은 날 안에서는 순위 순서 그대로
    write(path, rows)
    return rows


def _num(x, digits=4):
    return None if x is None or pd.isna(x) else round(float(x), digits)


def _mean(vals):
    return statistics.fmean(vals) if vals else None


def summary(rows, closes, index_close):
    """대시보드용: 출처별로 추천 후 N거래일 평균 수익률(같은 기간 지수와 비교)과 최근 추천 종목별 수익률."""
    rows = sorted(rows, key=lambda r: r["date"])
    pos = {f"{d:%Y-%m-%d}": i for i, d in enumerate(closes.index)}
    index_close = index_close.reindex(closes.index).ffill()
    last = len(closes) - 1
    live = [r["date"] for r in rows if not r["replay"]]
    out = dict(basis="추천일 종가", gap=REPEAT_GAP, live_from=min(live) if live else None, srcs={})
    for src, label in SOURCES.items():
        picks, seen = [], {}
        for r in rows:
            if r["src"] != src or r["date"] not in pos or r["code"] not in closes:
                continue
            i, prev = pos[r["date"]], seen.get(r["code"])
            seen[r["code"]] = i
            if prev is not None and i - prev <= REPEAT_GAP:
                continue
            s = closes[r["code"]].ffill()
            base = s.iloc[i]
            if pd.isna(base) or base <= 0:
                continue
            picks.append(dict(r, i=i, path=(s.iloc[i:i + SPARK_DAYS + 1] / base - 1).tolist(),
                              idx=(index_close.iloc[i:i + PATH_DAYS + 1] / index_close.iloc[i] - 1).tolist(),
                              now=s.iloc[last] / base - 1, last=s.iloc[last]))
        avg, idx, n = [], [], []
        for k in range(PATH_DAYS + 1):
            vals = [p["path"][k] for p in picks if len(p["path"]) > k and pd.notna(p["path"][k])]
            ivals = [p["idx"][k] for p in picks if len(p["idx"]) > k and pd.notna(p["idx"][k])]
            avg.append(_num(_mean(vals)))
            idx.append(_num(_mean(ivals)))
            n.append(len(vals))
        horizons = []
        for h in HORIZONS:
            vals = [p["path"][h] for p in picks if len(p["path"]) > h and pd.notna(p["path"][h])]
            horizons.append(dict(days=h, n=len(vals), avg=avg[h], index=idx[h],
                                 win=_num(sum(v > 0 for v in vals) / len(vals)) if vals else None))
        recent = [dict(date=p["date"], code=p["code"], name=p["name"], close=p["close"], last=_num(p["last"], 2),
                       ret=_num(p["now"]), days=last - p["i"], replay=p["replay"],
                       path=[_num(v) for v in p["path"]]) for p in picks[::-1][:RECENT]]
        out["srcs"][src] = dict(label=label, count=len(picks), first=picks[0]["date"] if picks else None,
                                avg=avg, index=idx, n=n, horizons=horizons, recent=recent)
    return out
