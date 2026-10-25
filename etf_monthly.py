#!/usr/bin/env python3
"""포트폴리오 실험실 ETF 검색용 월 수익률: paper/symbols/etfm/<시장>-<묶음>.json

검색 목록(paper/symbols/<시장>.json)의 ETF 전부(국장 1,500개쯤, 미장 5,600개쯤)를 야후 월봉(수정 종가, 분배금 다시 넣은 값)으로
받아 최근 20년 월 수익률(%)만 남겨요. 앱은 실험실에서 검색해 넣은 ETF가 들어 있는 묶음 파일 하나만 받아요.
미장 ETF는 달러 그대로 저장하고, 앱이 lab.json의 원/달러 월 변화로 원화로 바꿔요.
묶음 번호 = 코드 글자 번호 합 % 묶음 수 (앱 site/app.js etfShard와 같아야 해요).
fundamentals 워크플로(매주 토요일)에서 returns.py 다음에 돌려요. 못 받은 ETF는 지난번 값을 둬요.

한 줄: 코드 → [시작 연월(첫 수익률의 달), [월 수익률 %, ...]]

사용법:
    python etf_monthly.py               # 국장·미장 둘 다
    python etf_monthly.py --market kr   # 국장만
"""

import argparse
import datetime as dt
import json
import math
import pathlib
import time

import returns

KST = dt.timezone(dt.timedelta(hours=9))
FOLDER = pathlib.Path("paper/symbols")
OUT = FOLDER / "etfm"
SHARDS = {"kr": 16, "us": 32}
KEEP = 240  # 최근 20년(월)
MIN_MONTHS = 12


def shard(code, n):
    return sum(ord(c) for c in code) % n


def series(rows):
    """[(연월, 종가, 수정 종가, ...)] 오래된 순 → [시작 연월, [월 수익률 %]] (짧거나 이상하면 None)."""
    px = [(m[0], m[2] if m[2] and m[2] > 0 and not math.isnan(m[2]) else m[1]) for m in rows]
    px = [(m, v) for m, v in px if v and v > 0 and not math.isnan(v)][-(KEEP + 1):]
    if len(px) < MIN_MONTHS + 1:
        return None
    r = [round((b / a - 1) * 100, 2) for (_, a), (_, b) in zip(px, px[1:])]
    if any(x <= -95 or x > 400 for x in r):  # 분할·병합 누락 같은 틀린 값
        return None
    return [px[1][0], r]


def build(market, rows, old=None, fetch=returns.fetch, pause=1.0):
    old = old or {}
    by_t = {returns.ticker(market, r): r[0] for r in rows if r[3] == "e"}
    out, todo = {}, list(by_t)
    for i in range(0, len(todo), returns.BATCH):
        got = fetch(todo[i:i + returns.BATCH])
        for t in todo[i:i + returns.BATCH]:
            s = series(got[t]) if t in got else None
            code = by_t[t]
            if s:
                out[code] = s
            elif code in old and t not in got:
                out[code] = old[code]
        time.sleep(pause)
    return out


def load_old(market):
    old = {}
    for p in OUT.glob(f"{market}-*.json"):
        old.update(json.loads(p.read_text()).get("s", {}))
    return old


def write(market, s, out=OUT):
    out.mkdir(parents=True, exist_ok=True)
    n = SHARDS[market]
    parts = [{} for _ in range(n)]
    for code, v in s.items():
        parts[shard(code, n)][code] = v
    now = dt.datetime.now(KST).isoformat(timespec="minutes")
    for i, part in enumerate(parts):
        (out / f"{market}-{i}.json").write_text(json.dumps(dict(updated=now, s=part), ensure_ascii=False, separators=(",", ":")) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--market", choices=["kr", "us"])
    args = ap.parse_args()
    for m in [args.market] if args.market else ["kr", "us"]:
        src = FOLDER / f"{m}.json"
        if not src.exists():
            print(f"{src} 없음, 건너뜀")
            continue
        rows = json.loads(src.read_text())["rows"]
        old = load_old(m)
        s = build(m, rows, old)
        etfs = sum(1 for r in rows if r[3] == "e")
        print(f"{m} ETF 월 수익률 {len(s)}/{etfs}개")
        if len(s) < etfs * 0.4 and len(old) > len(s):
            raise SystemExit("너무 적게 받아서 지난번 파일을 그대로 둬요")
        write(m, s)


if __name__ == "__main__":
    main()
