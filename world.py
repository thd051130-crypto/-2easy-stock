#!/usr/bin/env python3
"""세계 지수·환율: 나라별 대표 지수와 원화 환율을 야후 무료 일봉으로 모아 paper/world.json에 남겨요.

앱 홈 "세계 지수·환율" 칸이 이걸 읽어서 오늘·1주·1개월·1년 등락률과 작은 추세선을 보여 줘요.
매매 규칙엔 안 쓰고 보기용이에요. 전부 무료 (유료 API 안 씀).

사용법:
    python world.py --dry-run                  # 출력만
    python world.py --save paper/world.json    # 기록
"""

import argparse
import datetime as dt
import json
import pathlib
import time

import pandas as pd

KST = dt.timezone(dt.timedelta(hours=9))

# (묶음, [(야후 기호, 이름, 표시 방식)]). 표시 방식: idx 지수, krw 원화 환율, num 그냥 숫자
GROUPS = [
    ("한국", [("^KS11", "코스피", "idx"), ("^KQ11", "코스닥", "idx")]),
    ("미국", [("^GSPC", "S&P500", "idx"), ("^IXIC", "나스닥", "idx"), ("^DJI", "다우", "idx"),
              ("^SOX", "필라델피아 반도체", "idx")]),
    ("아시아", [("^N225", "일본 닛케이225", "idx"), ("000001.SS", "중국 상하이종합", "idx"),
                ("^HSI", "홍콩 항셍", "idx"), ("^TWII", "대만 가권", "idx")]),
    ("유럽", [("^STOXX50E", "유로스톡스50", "idx"), ("^GDAXI", "독일 DAX", "idx"), ("^FTSE", "영국 FTSE100", "idx")]),
    ("환율", [("KRW=X", "원/달러", "krw"), ("JPYKRW=X", "원/엔 (100엔)", "krw"), ("EURKRW=X", "원/유로", "krw"),
              ("CNYKRW", "원/위안", "krw"), ("DX-Y.NYB", "달러인덱스", "num")]),
]
# 야후에 기록이 짧은 환율은 다른 환율로 계산해요: 원/위안 = 원/달러 ÷ 위안/달러
DERIVED = {"CNYKRW": ("KRW=X", "CNY=X")}
SCALE = {"JPYKRW=X": 100}  # 원/엔은 100엔 기준으로 보여 줘요
KEEP = 260  # 앱에 보낼 종가 수 (약 1년)


def symbols():
    out = []
    for _, items in GROUPS:
        for sym, _, _ in items:
            out.extend(DERIVED.get(sym, (sym,)))
    return list(dict.fromkeys(out))


def fetch(days=400, pause=1.0, retries=3):
    """야후 일봉 종가 {기호: Series(날짜→종가)}. 못 받은 기호는 빠져요."""
    import yfinance as yf

    start = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    out = {}
    for sym in symbols():
        part = None
        for attempt in range(retries):
            try:
                part = yf.Ticker(sym).history(start=start, auto_adjust=True)
                if not part.empty:
                    break
            except Exception as e:  # 레이트리밋 등
                print(f"{sym} 재시도 {attempt + 1}/{retries}: {e}")
            time.sleep(pause * 2 ** attempt)
        time.sleep(pause)
        if part is None or part.empty:
            print(f"경고: {sym} 데이터 없음")
            continue
        s = part["Close"].dropna()
        s.index = pd.to_datetime(s.index).tz_localize(None).normalize()
        out[sym] = s[~s.index.duplicated(keep="last")]
    if not out:
        raise SystemExit("야후에서 세계 지수·환율을 하나도 못 받았어요.")
    return out


def series_of(sym, closes):
    if sym in DERIVED:
        a, b = (closes.get(x) for x in DERIVED[sym])
        if a is None or b is None:
            return None
        both = pd.concat([a, b], axis=1, join="inner").dropna()
        return both.iloc[:, 0] / both.iloc[:, 1]
    s = closes.get(sym)
    return None if s is None else s * SCALE.get(sym, 1)


def change(s, days):
    """마지막 종가가 days일(달력) 전 그날까지의 마지막 종가보다 얼마나 변했나."""
    past = s[s.index <= s.index[-1] - pd.Timedelta(days=days)]
    return None if past.empty else round(float(s.iloc[-1] / past.iloc[-1] - 1), 5)


def item(sym, name, kind, s):
    s = s.dropna()
    if len(s) < 2:
        return None
    keep = s.iloc[-KEEP:]
    return dict(sym=sym, name=name, kind=kind, day=s.index[-1].date().isoformat(), last=round(float(s.iloc[-1]), 4),
                d1=round(float(s.iloc[-1] / s.iloc[-2] - 1), 5), w1=change(s, 7), m1=change(s, 30), y1=change(s, 365),
                closes=[float(f"{x:.6g}") for x in keep])


def snapshot(closes, now=None):
    groups = []
    for gname, items in GROUPS:
        rows = []
        for sym, name, kind in items:
            s = series_of(sym, closes)
            row = None if s is None else item(sym, name, kind, s)
            if row:
                rows.append(row)
        if rows:
            groups.append(dict(name=gname, items=rows))
    now = now or dt.datetime.now(KST)
    return dict(updated=now.isoformat(timespec="minutes"), groups=groups)


def format_text(snap):
    lines = [f"[세계 지수·환율] {snap['updated'][:16].replace('T', ' ')}"]
    for g in snap["groups"]:
        lines.append(f"· {g['name']}")
        for r in g["items"]:
            m1 = "-" if r["m1"] is None else f"{r['m1']:+.1%}"
            lines.append(f"  {r['name']} {r['last']:,.2f} ({r['d1']:+.2%}, 1개월 {m1})")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--save", type=pathlib.Path, help="기록할 파일 (paper/world.json)")
    parser.add_argument("--dry-run", action="store_true", help="출력만")
    args = parser.parse_args()
    snap = snapshot(fetch())
    print(format_text(snap))
    if args.save and not args.dry_run:
        args.save.parent.mkdir(parents=True, exist_ok=True)
        args.save.write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"{args.save} 저장")


if __name__ == "__main__":
    main()
