#!/usr/bin/env python3
"""학습팀: 매일 새벽 최신 시세로 규칙 값을 다시 맞춰 보고, 지금 규칙보다 확실히 나을 때만 바꾸자고 제안해요.

24시간 켜져 있는 AI가 아니라, GitHub Actions가 날마다 정해진 시간에 돌리는 "다시 배우기" 작업이에요.
유료 API 없이 야후 무료 일봉과 기존 백테스트 코드(kr_swing_backtest.simulate, strategy.py)만 써요.

하는 일
  1. 2010년부터 오늘까지 일봉을 받아 규칙 값 조합(국장 81개, 미장 24개)을 전부 백테스트
  2. 최근 5년 성적으로 후보 고르기: 최대 낙폭이 지금 규칙보다 나쁘지 않고 연수익을 1%p 넘게 포기하지 않는 것 중
     수익/낙폭 비율이 가장 좋은 값
  3. 걸어가며 검증(walk-forward): 2016년부터 해마다 "앞 5년으로 고른 값"을 다음 1년에 써 봤을 때가
     지금 규칙을 고정해서 쓴 것보다 나았는지 확인 (다시 고르는 방식 자체가 쓸모 있는지)
  4. 아래 세 관문을 다 통과해야 "바꾸자"고 제안해요. 규칙은 자동으로 바꾸지 않아요
     - 최근 5년: 낙폭이 같거나 작고 수익/낙폭 비율이 10% 이상 좋음
     - 2011년~ 전체: 낙폭이 지금보다 1%p 넘게 나쁘지 않음
     - 걸어가며 검증: 다시 고르는 방식이 고정 규칙보다 낙폭도, 수익/낙폭 비율도 나쁘지 않음
  5. learning/<시장>.json, learning/history.csv, docs/learning-latest.md에 남기고,
     새 제안이 나오거나 주간 보고 날이면 텔레그램으로 보내요

사용법:
    python learner.py --market kr --csv data/kr_daily.csv --dry-run   # CSV가 없으면 야후에서 받아요
    python learner.py --market both --report                          # 텔레그램 주간 보고까지
"""

import argparse
import csv
import datetime as dt
import itertools
import json
import pathlib

import numpy as np
import pandas as pd

import kr_swing_backtest as kb
import strategy
from markets import MARKETS

KST = dt.timezone(dt.timedelta(hours=9))
TRAIN_YEARS, WF_START = 5, 2016
MAX_CAGR_GIVEUP, CALMAR_GAIN, FULL_MDD_SLACK = 0.01, 1.10, 0.01

GRIDS = {
    "kr": dict(breadth_min=[0.4, 0.5, 0.6], stock_vol_max=[0.35, 0.45, 0.6], stop=[0.03, 0.05, 0.07],
               rsi_th=[5, 10, 15]),
    "us": dict(vol_max=[0.18, 0.20, 0.25, 0.30], weight=[0.3, 0.5, 0.7], ma_long=[150, 200]),
}
CURRENT = {
    "kr": dict(breadth_min=strategy.KR_BREADTH_MIN, stock_vol_max=strategy.KR_STOCK_VOL_MAX, stop=strategy.KR_STOP,
               rsi_th=strategy.KR_RSI_TH),
    "us": dict(vol_max=strategy.US_VOL_MAX, weight=strategy.US_WEIGHT, ma_long=200),
}
LABELS = {
    "breadth_min": lambda v: f"시장 폭 {v:.0%}↑", "stock_vol_max": lambda v: f"종목 변동성 {v:.0%}↓",
    "stop": lambda v: f"손절 -{v:.0%}", "rsi_th": lambda v: f"RSI2<{v}",
    "vol_max": lambda v: f"S&P500 변동성 {v:.0%}↓", "weight": lambda v: f"비중 {v:.0%}", "ma_long": lambda v: f"{v}일선",
}


def label(params):
    return ", ".join(LABELS[k](v) for k, v in params.items())


def combos(market):
    grid = GRIDS[market]
    return [dict(zip(grid, values)) for values in itertools.product(*grid.values())]


def key(params):
    return tuple(sorted(params.items()))


# ---------------------------------------------------------------- 백테스트

def run_all(market, opens, closes, index_close):
    """조합마다 2011년~ 자산 곡선 (시작=1)."""
    keep = closes.index >= kb.TEST_START
    cost = MARKETS[market]["cost"]
    curves = {}
    for params in combos(market):
        f = strategy.FRAMES[market](closes, index_close, **params)
        curve, _, _, _ = kb.simulate(opens[keep], closes[keep], f["entry"][keep], f["exit"][keep], f["rank"][keep],
                                     f["max_hold"], cost, stop=f["stop"], weight=f["weight"])
        curves[key(params)] = curve
    return curves


def stats(curve):
    curve = curve.dropna()
    if len(curve) < 2:
        return dict(cagr=0.0, mdd=0.0, calmar=0.0)
    curve = curve / curve.iloc[0]
    cagr = kb.cagr(curve)
    mdd = float((curve / curve.cummax() - 1).min())
    return dict(cagr=float(cagr), mdd=mdd, calmar=float(cagr / -mdd) if mdd < 0 else float(cagr * 100))


def window(curve, start, end):
    return curve[(curve.index >= start) & (curve.index <= end)]


def pick(curves, current, start, end):
    """낙폭 우선: 지금 규칙보다 낙폭이 나쁘지 않고 연수익을 1%p 넘게 포기하지 않는 것 중 수익/낙폭 비율 1등."""
    table = {k: stats(window(c, start, end)) for k, c in curves.items()}
    cur = table[current]
    ok = [k for k, s in table.items() if s["mdd"] >= cur["mdd"] and s["cagr"] >= cur["cagr"] - MAX_CAGR_GIVEUP]
    best = max(ok, key=lambda k: (round(table[k]["calmar"], 6), k == current))
    return best, table


def walk_forward(curves, current, end):
    """WF_START년부터 해마다: 앞 TRAIN_YEARS년으로 고른 값을 그해에 써 본 곡선 vs 지금 규칙 고정."""
    daily, changed = [], 0
    for year in range(WF_START, end.year + 1):
        test_start = pd.Timestamp(year, 1, 1)
        chosen, _ = pick(curves, current, pd.Timestamp(year - TRAIN_YEARS, 1, 1), test_start - pd.Timedelta(days=1))
        rets = curves[chosen].pct_change()
        seg = rets[(rets.index >= test_start) & (rets.index <= pd.Timestamp(year, 12, 31))].dropna()
        if seg.empty:
            continue
        daily.append(seg)
        changed += chosen != current
    if not daily:
        return None
    tuned = pd.concat(daily)
    fixed = curves[current].pct_change().reindex(tuned.index).fillna(0)
    return dict(start=f"{tuned.index[0]:%Y-%m-%d}", years=len(daily), changed=int(changed),
                tuned=stats(_curve(tuned)), fixed=stats(_curve(fixed)))


def _curve(rets):
    return pd.concat([pd.Series([1.0], [rets.index[0] - pd.Timedelta(days=1)]), (1 + rets).cumprod()])


def learn(market, opens, closes, index_close):
    curves = run_all(market, opens, closes, index_close)
    current = key(CURRENT[market])
    end = closes.index[-1]
    recent_start = end - pd.DateOffset(years=TRAIN_YEARS)
    best, recent = pick(curves, current, recent_start, end)
    full = {k: stats(c) for k, c in curves.items()}
    wf = walk_forward(curves, current, end)

    cur_r, cand_r = recent[current], recent[best]
    gates = {
        "recent": best != current and cand_r["mdd"] >= cur_r["mdd"] and cand_r["calmar"] >= cur_r["calmar"] * CALMAR_GAIN,
        "full": full[best]["mdd"] >= full[current]["mdd"] - FULL_MDD_SLACK,
        "walk_forward": bool(wf) and wf["tuned"]["mdd"] >= wf["fixed"]["mdd"]
                        and wf["tuned"]["calmar"] >= wf["fixed"]["calmar"],
    }
    top = sorted(recent, key=lambda k: -recent[k]["calmar"])[:5]
    return dict(
        market=market, date=f"{end:%Y-%m-%d}", recent_start=f"{recent_start:%Y-%m-%d}", tested=len(curves),
        current=dict(params=dict(current), label=label(dict(current)), recent=cur_r, full=full[current]),
        candidate=dict(params=dict(best), label=label(dict(best)), recent=cand_r, full=full[best]),
        gates=gates, propose=all(gates.values()), walk_forward=wf,
        top=[dict(params=dict(k), label=label(dict(k)), recent=recent[k], full=full[k]) for k in top],
    )


# ---------------------------------------------------------------- 보고

def pct(x, digits=1):
    return kb.pct(x, digits)


def verdict(r):
    if r["propose"]:
        return "바꾸자고 제안해요 (세 관문 모두 통과)"
    if r["candidate"]["params"] == r["current"]["params"]:
        return "지금 규칙 유지 (최근 5년에도 지금 값이 가장 나아요)"
    failed = [name for name, g in (("최근 5년", "recent"), ("2011년~ 전체", "full"), ("걸어가며 검증", "walk_forward"))
              if not r["gates"][g]]
    return f"지금 규칙 유지 ({', '.join(failed)}에서 확실히 낫지 않아요)"


def format_report(r, title="학습팀 보고"):
    m = MARKETS[r["market"]]
    cur, cand, wf = r["current"], r["candidate"], r["walk_forward"]
    lines = [f"[{title}] {m['name']} ({r['date']} 종가까지, 조합 {r['tested']}개 시험)",
             f"지금 규칙: {cur['label']}",
             f"  최근 5년 연 {pct(cur['recent']['cagr'])}, 최대 낙폭 {pct(cur['recent']['mdd'])} / "
             f"2011년~ 연 {pct(cur['full']['cagr'])}, 낙폭 {pct(cur['full']['mdd'])}"]
    if cand["params"] != cur["params"]:
        lines += [f"가장 나은 후보: {cand['label']}",
                  f"  최근 5년 연 {pct(cand['recent']['cagr'])}, 최대 낙폭 {pct(cand['recent']['mdd'])} / "
                  f"2011년~ 연 {pct(cand['full']['cagr'])}, 낙폭 {pct(cand['full']['mdd'])}"]
    if wf:
        lines.append(f"걸어가며 검증({wf['start'][:4]}~, {wf['years']}년 중 {wf['changed']}번 값 바꿈): "
                     f"다시 고르기 연 {pct(wf['tuned']['cagr'])}·낙폭 {pct(wf['tuned']['mdd'])} vs "
                     f"고정 연 {pct(wf['fixed']['cagr'])}·낙폭 {pct(wf['fixed']['mdd'])}")
    lines.append(f"결론: {verdict(r)}")
    if r["propose"]:
        lines.append("적용하려면 프로젝트 스레드에 \"학습팀 제안 적용해\"라고 말해 주세요. 규칙은 자동으로 안 바뀌어요.")
    return "\n".join(lines)


def markdown(results):
    lines = ["## 학습팀 최근 결과\n", "매일 새벽 `learner.py`가 다시 계산해서 덮어써요. 숫자는 과거 백테스트일 뿐이에요.\n"]
    for r in results:
        m = MARKETS[r["market"]]
        lines += [f"### {m['name']} ({r['date']} 종가까지)\n", f"결론: {verdict(r)}\n",
                  f"| 규칙 | 최근 5년 연평균 | 최근 5년 최대 낙폭 | 수익/낙폭 | 2011~ 연평균 | 2011~ 최대 낙폭 |",
                  "|---|---:|---:|---:|---:|---:|"]
        rows = [dict(r["current"], label="지금: " + r["current"]["label"])]
        rows += [t for t in r["top"] if t["params"] != r["current"]["params"]]
        for t in rows:
            lines.append(f"| {t['label']} | {pct(t['recent']['cagr'])} | {pct(t['recent']['mdd'])} | "
                         f"{t['recent']['calmar']:.2f} | {pct(t['full']['cagr'])} | {pct(t['full']['mdd'])} |")
        wf = r["walk_forward"]
        if wf:
            lines.append(f"\n걸어가며 검증 ({wf['start']}~): 다시 고르기 연 {pct(wf['tuned']['cagr'])}, "
                         f"낙폭 {pct(wf['tuned']['mdd'])} / 지금 규칙 고정 연 {pct(wf['fixed']['cagr'])}, "
                         f"낙폭 {pct(wf['fixed']['mdd'])}")
        lines.append("")
    return "\n".join(lines)


def save(results, folder):
    folder.mkdir(parents=True, exist_ok=True)
    hist = folder / "history.csv"
    new = not hist.exists()
    with hist.open("a", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        if new:
            w.writerow(["date", "market", "propose", "candidate", "cur_recent_cagr", "cur_recent_mdd",
                        "cand_recent_cagr", "cand_recent_mdd"])
        for r in results:
            w.writerow([r["date"], r["market"], int(r["propose"]), json.dumps(r["candidate"]["params"]),
                        round(r["current"]["recent"]["cagr"], 4), round(r["current"]["recent"]["mdd"], 4),
                        round(r["candidate"]["recent"]["cagr"], 4), round(r["candidate"]["recent"]["mdd"], 4)])
    for r in results:
        (folder / f"{r['market']}.json").write_text(json.dumps(r, ensure_ascii=False, indent=1) + "\n",
                                                    encoding="utf-8")


def is_new_proposal(r, folder):
    """지난번 저장과 다른 제안일 때만 바로 알려요 (같은 제안을 매일 보내지 않으려고)."""
    if not r["propose"]:
        return False
    path = folder / f"{r['market']}.json"
    if not path.exists():
        return True
    prev = json.loads(path.read_text(encoding="utf-8"))
    return not (prev.get("propose") and prev["candidate"]["params"] == r["candidate"]["params"])


def load(market, path):
    m = MARKETS[market]
    if not path.exists():
        universe = m["universe"] if market == "kr" else {strategy.US_ETF: strategy.US_ETF}
        kb.download(path, universe=universe, index=m["index"], suffix=m["suffix"])
    opens, closes, index_close = kb.load_csv(path, m["index"])
    if market == "us":  # 미장 규칙은 SPY 한 종목만 사고팔아요
        opens, closes = opens[[strategy.US_ETF]], closes[[strategy.US_ETF]]
    return opens, closes, index_close


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--market", choices=["kr", "us", "both"], default="both")
    parser.add_argument("--csv-dir", type=pathlib.Path, default=pathlib.Path("data"),
                        help="kr_daily.csv, us_spy.csv를 찾을 곳 (없으면 받아서 저장)")
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("learning"))
    parser.add_argument("--doc", type=pathlib.Path, default=pathlib.Path("docs/learning-latest.md"))
    parser.add_argument("--report", action="store_true", help="새 제안이 없어도 텔레그램 보고 보내기 (주간 보고)")
    parser.add_argument("--dry-run", action="store_true", help="텔레그램으로 보내지 않고 출력만")
    args = parser.parse_args()

    from realtime_monitor import send_telegram

    files = {"kr": "kr_daily.csv", "us": "us_spy.csv"}
    markets = ["kr", "us"] if args.market == "both" else [args.market]
    results, messages = [], []
    for mk in markets:
        try:
            r = learn(mk, *load(mk, args.csv_dir / files[mk]))
        except SystemExit as e:
            messages.append(f"[학습팀] {MARKETS[mk]['name']} 시세를 못 받아서 오늘은 못 배웠어요: {e}")
            continue
        new = is_new_proposal(r, args.out)
        results.append(r)
        if args.report or new:
            messages.append(format_report(r, "학습팀 새 제안" if new else "학습팀 주간 보고"))
        print(format_report(r), "\n")
    if results:
        save(results, args.out)
        args.doc.parent.mkdir(parents=True, exist_ok=True)
        args.doc.write_text(markdown(results), encoding="utf-8")
    if messages and not args.dry_run:
        if not send_telegram("\n\n".join(messages)):
            raise SystemExit("텔레그램 전송 실패 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 확인)")


if __name__ == "__main__":
    main()
