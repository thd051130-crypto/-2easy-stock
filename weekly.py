"""주간 리포트: 토요일 아침에 한 주를 한 장으로 묶어요. 평일 리포트를 다 못 봤어도 주말에 한 번에 따라잡게요.

  1. 이번 주 지수   세계 지수·환율·금리·원자재의 1주 등락, 코스피·S&P500은 요일별로
  2. 이번 주 업종   국장·미장 업종 5일 흐름 상위·하위
  3. 이번 주 사건   지수 급변, 큰 발표 결과, 경기 판정이 바뀌었는지
  4. 다음 주 일정   월~금 큰 발표·금리 결정·옵션 만기·대형주/관심종목 실적

자료는 다른 워크플로가 이미 저장한 파일만 읽어요 (새로 받지 않아요, 유료 API 안 씀):
  paper/world.json, macro.json, events.json, calendar.json, <시장>/daily.json
결과: paper/weekly.json (앱 리포트 화면 '주간' 탭) + 텔레그램 한 통 (메시지함에도 저장)
사고팔기 판단은 안 해요. 급등락 종목은 넣지 않아요 (사용자 2026-10-24 '급등락 종목은 빼자').

  python weekly.py --dry-run     # 보내지 않고 출력만
"""

import argparse
import datetime as dt
import json
import pathlib

import tgfmt
from report_desks import FLAGS, KST, MARKET_NAMES, PAPER, BIG_CAP, pct, read_json, world_items

# 이번 주 지수 줄에 보여 줄 것 (world.json 이름)
WEEK_FACTS = ["코스피", "코스닥", "S&P500", "나스닥", "필라델피아 반도체", "일본 닛케이225", "원/달러",
              "미국 10년 국채 금리", "한국 국고채 3년 금리", "VIX 공포 지수", "WTI 유가", "금 (온스)", "비트코인"]
DAY_INDEX = {"kr": "코스피", "us": "S&P500"}
CAL_KINDS = ("big", "rate", "expiry")


def load_inputs(paper=PAPER):
    paper = pathlib.Path(paper)
    events = read_json(paper / "events.json") or {}
    return dict(world=read_json(paper / "world.json") or {}, macro=read_json(paper / "macro.json") or {},
                events=events.get("events") or [], shocks=events.get("shocks") or [],
                calendar=(read_json(paper / "calendar.json") or {}).get("events") or [],
                signals={mk: read_json(paper / mk / "daily.json") or {} for mk in ("kr", "us")})


def week_range(today):
    """(이번 주 월요일, 금요일, 다음 주 월요일, 금요일). 평일에 돌리면 '이번 주'는 그날까지예요."""
    mon = today - dt.timedelta(days=today.weekday())
    nmon = mon + dt.timedelta(days=7)
    return mon, mon + dt.timedelta(days=4), nmon, nmon + dt.timedelta(days=4)


def day_moves(it, mon, fri):
    """지수 하나의 이번 주 요일별 등락 [(요일, 등락)]."""
    if not it or not it.get("dates"):
        return []
    rows = list(zip(it["dates"], it["closes"]))
    out = []
    for i in range(1, len(rows)):
        d = dt.date.fromisoformat(rows[i][0])
        if mon <= d <= fri:
            out.append(("월화수목금토일"[d.weekday()], rows[i][1] / rows[i - 1][1] - 1))
    return out


def index_desk(world, mon, fri):
    items = world_items(world)
    facts = [dict(name=n, last=items[n].get("last"), kind=items[n].get("kind"), w1=items[n].get("w1"), m1=items[n].get("m1"))
             for n in WEEK_FACTS if n in items]
    days = {mk: dict(index=name, w1=(items.get(name) or {}).get("w1"), days=day_moves(items.get(name), mon, fri))
            for mk, name in DAY_INDEX.items()}
    return dict(facts=facts, days=days)


def sector_week(signals, top=3):
    out = {}
    for mk, sig in signals.items():
        rows = sorted((s for s in sig.get("sectors") or [] if s.get("r5") is not None), key=lambda s: -s["r5"])
        if not rows:
            continue
        pick = lambda s: dict(name=s["name"], r5=s["r5"], r20=s.get("r20"), vs_index=s.get("vs_index"),
                              best=(s.get("best") or {}).get("name"), worst=(s.get("worst") or {}).get("name"))
        out[mk] = dict(day=sig.get("day"), up=[pick(s) for s in rows[:top]], down=[pick(s) for s in rows[::-1][:top]])
    return out


def event_desk(events, shocks, macro, mon, fri):
    start, end = mon.isoformat(), fri.isoformat() + "T99"
    shock = [dict(at=s["at"], label=s.get("label"), way=s.get("way"), move=s.get("move"),
                  news=((s.get("news") or [{}])[0] or {}).get("title"))
             for s in shocks if start <= s.get("at", "") <= end]
    done = [dict(date=e["date"], flag=e.get("flag") or "", title=e.get("ko") or e.get("title"),
                 actual=e.get("actual"), forecast=e.get("forecast"))
            for e in events if e.get("tier1") and start <= e.get("date", "") <= end[:10]]
    regime = macro.get("regime")
    hist = macro.get("history") or []
    before = hist[-2]["score"] if len(hist) >= 2 else None
    return dict(shocks=shock, done=done, regime=regime, prev_regime=macro.get("prev_regime"),
                score=macro.get("score"), total=macro.get("total"), score_before=before,
                warns=[s["name"] for s in macro.get("signals") or [] if s.get("warn")])


def next_week(events, calendar, nmon, nfri):
    start, end = nmon.isoformat(), nfri.isoformat()
    big = [dict(date=e["date"], time=(e.get("at") or "")[11:16], flag=e.get("flag") or "", title=e.get("ko") or e.get("title"),
                forecast=e.get("forecast"))
           for e in events if e.get("tier1") and start <= e.get("date", "") <= end]
    seen = {(b["date"], b["title"]) for b in big}
    cal = [dict(date=c["date"], market=c.get("market"), kind=c["kind"], title=c.get("title"), note=c.get("note"))
           for c in calendar if c.get("kind") in CAL_KINDS and start <= c.get("date", "") <= end
           and (c["kind"] != "big" or c.get("big")) and (c["date"], c.get("title")) not in seen]
    earn = [dict(date=c["date"], market=c.get("market"), title=c.get("title"), code=c.get("code"), mine=bool(c.get("mine")))
            for c in calendar if c.get("kind") == "earn" and start <= c.get("date", "") <= end
            and (c.get("mine") or (c.get("cap") or 0) >= BIG_CAP.get(c.get("market"), 1e99))]
    return dict(start=start, end=end, big=sorted(big, key=lambda x: (x["date"], x["time"])),
                cal=sorted(cal, key=lambda x: x["date"]), earn=sorted(earn, key=lambda x: (x["date"], not x["mine"])))


def headline(idx, sectors, ev, nxt):
    lines = []
    d = idx["days"]
    if d["kr"]["w1"] is not None or d["us"]["w1"] is not None:
        lines.append(f"이번 주: 코스피 {pct(d['kr']['w1'])} · S&P500 {pct(d['us']['w1'])}")
    best = [f"{FLAGS[mk]} {s['up'][0]['name']} {pct(s['up'][0]['r5'])}" for mk, s in sectors.items() if s["up"]]
    worst = [f"{FLAGS[mk]} {s['down'][0]['name']} {pct(s['down'][0]['r5'])}" for mk, s in sectors.items() if s["down"]]
    if best:
        lines.append(f"가장 강한 업종: {', '.join(best)} / 약한 업종: {', '.join(worst)}")
    n = len(nxt["big"]) + len([c for c in nxt["cal"] if c["kind"] in ("rate", "big")])
    if n:
        first = (nxt["big"] or [c for c in nxt["cal"] if c["kind"] in ("rate", "big")])[0]
        lines.append(f"다음 주 큰 일정 {n}개: {first['date'][5:]} {first['title']}" + (" 등" if n > 1 else ""))
    elif ev["shocks"]:
        lines.append(f"이번 주 지수 급변 {len(ev['shocks'])}번")
    return lines


def build(inputs, today=None):
    today = today or dt.datetime.now(KST).date()
    mon, fri, nmon, nfri = week_range(today)
    idx = index_desk(inputs["world"], mon, fri)
    sectors = sector_week(inputs["signals"])
    ev = event_desk(inputs["events"], inputs["shocks"], inputs["macro"], mon, fri)
    nxt = next_week(inputs["events"], inputs["calendar"], nmon, nfri)
    return dict(day=today.isoformat(), week=[mon.isoformat(), fri.isoformat()],
                generated=dt.datetime.now(KST).isoformat(timespec="minutes"),
                headline=headline(idx, sectors, ev, nxt), index=idx, sectors=sectors, events=ev, next=nxt)


def week_fact(f):
    if f["kind"] == "rate":
        return f"{f['name']} {f['last']:.2f}% (1주 {f['w1']:+.2f}%p)" if f["w1"] is not None else f"{f['name']} {f['last']:.2f}%"
    val = f"{f['last']:,.0f}원" if f["kind"] == "krw" else f"{f['last']:,.2f}"
    return f"{f['name']} {val} (1주 {pct(f['w1'], 2)}, 1달 {pct(f['m1'])})"


def md(day):
    d = dt.date.fromisoformat(day[:10])
    return f"{d.month}.{d.day}({'월화수목금토일'[d.weekday()]})"


def format_text(r):
    out = ["[이번 주 지수] 1주 등락"]
    out += [f"- {week_fact(f)}" for f in r["index"]["facts"]]
    for mk, x in r["index"]["days"].items():
        if x["days"]:
            out.append(f"- {FLAGS[mk]} {x['index']} 요일별: " + " ".join(f"{w} {pct(v)}" for w, v in x["days"]))
    for mk, s in r["sectors"].items():
        out += ["", f"[이번 주 업종] {FLAGS[mk]} {MARKET_NAMES[mk]} 5일 흐름"]
        out += [f"- 상위 {x['name']} {pct(x['r5'])}" + (f" (대표 {x['best']})" if x["best"] else "") for x in s["up"]]
        out += [f"- 하위 {x['name']} {pct(x['r5'])}" + (f" (대표 {x['worst']})" if x["worst"] else "") for x in s["down"]]
    ev = r["events"]
    rows = [f"- ⚡ {md(s['at'])} {s['at'][11:16]} {s['label']} {pct(s['move'])}" + (f" · {s['news']}" if s["news"] else "")
            for s in ev["shocks"][:5]]
    rows += [f"- {md(e['date'])} {e['flag']} {e['title']}" + (f": 실제 {e['actual']}" if e["actual"] else "")
            + (f" (예상 {e['forecast']})" if e["forecast"] else "") for e in ev["done"][:8]]
    if ev["regime"]:
        changed = ev["prev_regime"] and ev["prev_regime"] != ev["regime"]
        rows.append(f"- 경기 판정 {ev['regime']}" + (f" (전엔 {ev['prev_regime']})" if changed else " (그대로)")
                   + (f", 경고 {ev['score']}/{ev['total']}" if ev["total"] else "") + (f": {', '.join(ev['warns'])}" if ev["warns"] else ""))
    out += ["", "[이번 주 사건] 지수 급변·발표 결과·경기"] + (rows or ["- 큰 사건 없음"])
    n = r["next"]
    out += ["", f"[다음 주 일정] {md(n['start'])}~{md(n['end'])}"]
    rows = [(e["date"], f"{md(e['date'])} {e['time']} {e['flag']} {e['title']}" + (f" (예상 {e['forecast']})" if e["forecast"] else ""))
            for e in n["big"]]
    rows += [(c["date"], f"{md(c['date'])} {FLAGS.get(c['market'], '')} {c['title']}") for c in n["cal"]]
    rows += [(c["date"], f"{md(c['date'])} {FLAGS.get(c['market'], '')} {c['title']}" + (" ⭐" if c["mine"] else "")) for c in n["earn"][:8]]
    out += [f"- {t}" for _, t in sorted(rows, key=lambda x: x[0])] or ["- 아직 잡힌 큰 일정 없음"]
    out.append("- 사고팔기 판단은 안 해요. 공개 자료로 만든 참고용 리포트예요")
    return "\n".join(out)


def summary_html(r):
    mon, fri = (dt.date.fromisoformat(x) for x in r["week"])
    head = tgfmt.head_html("주간 리포트", f"{mon:%m.%d}~{fri:%m.%d}")
    return head + "\n" + "\n".join(f"• {tgfmt.esc(x)}" for x in r["headline"]) + "\n" + tgfmt.link("앱에서 보기")


def send(r):
    from realtime_monitor import send_html  # requests가 필요해서 보낼 때만

    import inbox

    parts = tgfmt.compose(summary_html(r), format_text(r))
    ok = all([send_html(p) for p in parts])
    inbox.add("\n\n".join(tgfmt.compose(summary_html(r), format_text(r), limit=10**9)), "weekly")
    return ok


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--paper", type=pathlib.Path, default=PAPER)
    parser.add_argument("--dry-run", action="store_true", help="보내지 않고 출력만")
    args = parser.parse_args()
    r = build(load_inputs(args.paper))
    (args.paper / "weekly.json").write_text(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("\n".join(r["headline"]) + "\n\n" + format_text(r))
    if not args.dry_run and not send(r):
        raise SystemExit("텔레그램 전송 실패 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 확인)")


if __name__ == "__main__":
    main()
