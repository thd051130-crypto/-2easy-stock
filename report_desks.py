"""리포트 부서: 다섯 팀이 앞 팀 자료를 넘겨받아 리포트 한 장을 만들어요. 사고팔기 판단은 안 해요.

  1. 시장팀   지수·환율·경기 경고 → "오늘 시장 분위기"와 경기 경고가 가리키는 업종을 일정·정책팀에 넘겨요
  2. 일정·정책팀  시장팀 자료 + 큰 발표 일정·실적 발표·정부 정책 → 업종별 호재·악재 점수를 업종팀에 넘겨요
  3. 업종팀   일정·정책팀 점수 + 실제 업종 주가 흐름 → 정책과 주가가 같은 방향인지 보고, 볼 업종을 종목팀에 넘겨요
  4. 종목팀   업종팀이 고른 업종 안에서 많이 움직인 종목·수급·재무 등급·조용한 거래량 → 종목 메모를 편집팀에 넘겨요
  5. 편집팀   네 팀 자료를 묶어 맨 위 세 줄 요약 + 팀별 자세히 + "자료가 넘어간 흐름" 한 장으로 만들어요

자료는 다른 워크플로가 이미 저장한 파일만 읽어요 (새로 받지 않아요, 유료 API 안 씀):
  paper/world.json, macro.json, events.json, calendar.json, policies.json, <시장>/daily.json, kr/flows.json, <시장>/fundamentals.json
결과: paper/report.json (앱 메시지함 '오늘의 리포트') + 텔레그램 한 통 (메시지함에도 저장)

  python report_desks.py --dry-run     # 보내지 않고 출력만
"""

import argparse
import datetime as dt
import json
import pathlib

import tgfmt

KST = dt.timezone(dt.timedelta(hours=9))
PAPER = pathlib.Path("paper")
FLAGS = {"kr": "🇰🇷", "us": "🇺🇸"}
MARKET_NAMES = {"kr": "국장", "us": "미장"}
INDEX = {"kr": "코스피", "us": "S&P500"}
EVENT_DAYS = 7  # 일정·정책팀이 보는 앞으로의 날수
BIG_CAP = {"kr": 1e13, "us": 2e11}  # 실적 발표를 챙겨 볼 시가총액 (국장 10조 원, 미장 2,000억 달러)

# 경기 경고(macro.py) → 영향을 받는 업종 (1 호재, -1 악재). 시장팀이 일정·정책팀에 넘겨요
MACRO_TILT = {
    "oil_jump": [("에너지·정유", 1, "유가 급등"), ("운송", -1, "연료비 부담"), ("화학·소재", -1, "원료비 부담")],
    "rate_jump": [("금융", 1, "금리 급등"), ("인터넷·게임·SW", -1, "금리 급등"), ("건설·부동산", -1, "금리 급등")],
    "won_drop": [("자동차", 1, "원화 약세로 수출 유리"), ("조선·방산·기계", 1, "원화 약세로 수출 유리"), ("운송", -1, "원화 약세")],
    "inversion": [("금융", -1, "장단기 금리 역전")],
    "credit": [("금융", -1, "신용 경계")],
    "copper": [("화학·소재", -1, "원자재 약세")],
    "fear": [("금융", -1, "공포 지수 높음")],
}


def read_json(path):
    try:
        return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def pct(x, digits=1):
    return "-" if x is None else f"{x:+.{digits}%}"


def load_inputs(paper=PAPER):
    paper = pathlib.Path(paper)
    return dict(
        world=read_json(paper / "world.json") or {}, macro=read_json(paper / "macro.json") or {},
        events=(read_json(paper / "events.json") or {}).get("events") or [],
        calendar=(read_json(paper / "calendar.json") or {}).get("events") or [],
        policies=(read_json(paper / "policies.json") or {}).get("items") or [],
        signals={mk: read_json(paper / mk / "daily.json") or {} for mk in ("kr", "us")},
        flows=read_json(paper / "kr" / "flows.json") or {},
        funds={mk: (read_json(paper / mk / "fundamentals.json") or {}).get("stocks") or {} for mk in ("kr", "us")},
    )


# ---------------------------------------------------------------- 1. 시장팀

def world_items(world):
    return {it["name"]: it for g in world.get("groups") or [] for it in g.get("items") or []}


def index_score(it):
    """지수 하나의 분위기 점수: 1달 흐름이 주, 전날 급락이면 1점 더 빼요."""
    if not it:
        return 0
    m1, d1 = it.get("m1") or 0, it.get("d1") or 0
    s = -2 if m1 <= -0.08 else -1 if m1 <= -0.03 else 1 if m1 >= 0.03 else 0
    return s - (1 if d1 <= -0.02 else 0)


def tone_of(score):
    return "약함" if score <= -2 else "강함" if score >= 1 else "보통"


def market_desk(world, macro):
    items = world_items(world)
    out = dict(markets={}, facts=[], tilt=[], warns=[])
    for mk, name in INDEX.items():
        it = items.get(name)
        s = index_score(it)
        out["markets"][mk] = dict(tone=tone_of(s), score=s, index=name, d1=it and it.get("d1"),
                                  w1=it and it.get("w1"), m1=it and it.get("m1"))
    for name in ("코스피", "코스닥", "S&P500", "나스닥", "필라델피아 반도체", "원/달러", "미국 10년 국채 금리", "VIX 공포 지수", "WTI 유가", "금 (온스)"):
        it = items.get(name)
        if it:
            out["facts"].append(dict(name=name, last=it.get("last"), kind=it.get("kind"), d1=it.get("d1"), m1=it.get("m1")))
    for s in macro.get("signals") or []:
        if s.get("warn"):
            out["warns"].append(dict(key=s["key"], name=s["name"], now=s.get("now")))
            out["tilt"] += [dict(sector=sec, tone=t, why=why, src="경기") for sec, t, why in MACRO_TILT.get(s["key"], [])]
    out["regime"] = macro.get("regime")
    out["macro_score"] = f"{macro.get('score')}/{macro.get('total')}" if macro.get("total") else None
    return out


# ---------------------------------------------------------------- 2. 일정·정책팀

def upcoming(events, calendar, today, days=EVENT_DAYS):
    end = (today + dt.timedelta(days=days)).isoformat()
    start = today.isoformat()
    big = [dict(date=e["date"], time=(e.get("at") or "")[11:16], flag=e.get("flag") or "", title=e.get("ko") or e.get("title"),
                forecast=e.get("forecast"))
           for e in events if e.get("tier1") and start <= e.get("date", "") <= end]
    earn = [dict(date=c["date"], market=c.get("market"), title=c.get("title"), code=c.get("code"), mine=bool(c.get("mine")))
            for c in calendar if c.get("kind") == "earn" and start <= c.get("date", "") <= end
            and (c.get("mine") or (c.get("cap") or 0) >= BIG_CAP.get(c.get("market"), 1e99))]
    return big, earn


REGIONS = {"kr": ("kr", "world"), "us": ("us", "world")}  # 시장마다 보는 정책 지역


def tilt_scores(tilts):
    scores = {}
    for t in tilts:
        row = scores.setdefault(t["sector"], dict(sector=t["sector"], score=0, good=[], bad=[]))
        row["score"] += t["tone"]
        (row["good"] if t["tone"] > 0 else row["bad"]).append(f"{t['src']}: {t['why']}")
    return sorted(scores.values(), key=lambda r: -r["score"])


def policy_desk(market, events, calendar, policies, today):
    """시장팀이 넘긴 경기 업종 + 정부 정책(시장마다 그 나라·세계) → 시장별 업종 점수.
    시장 분위기가 약하면 큰 발표를 더 조심하라고 붙여요."""
    big, earn = upcoming(events, calendar, today)
    sectors = {}
    for mk, regions in REGIONS.items():
        pol = [dict(sector=e["sector"], tone=e["tone"], why=p["title"], src="정책")
               for p in policies if p.get("region") in regions for e in p.get("effects") or [] if e.get("tone")]
        sectors[mk] = tilt_scores(market["tilt"] + pol)
    weak = [MARKET_NAMES[mk] for mk, m in market["markets"].items() if m["tone"] == "약함"]
    caution = f"{'·'.join(weak)} 분위기가 약해서 큰 발표 날 더 크게 흔들릴 수 있어요" if weak and big else None
    return dict(big=big, earn=earn, sectors=sectors, caution=caution)


# ---------------------------------------------------------------- 3. 업종팀

def match_of(tilt, r5):
    """정책·경기 점수와 실제 5일 흐름이 같은 방향인지."""
    if not tilt or r5 is None:
        return None
    return "맞음" if (tilt > 0) == (r5 > 0) else "엇갈림"


def sector_desk(policy, signals, top=3):
    out = {}
    for mk, sig in signals.items():
        tilt = {r["sector"]: r["score"] for r in policy["sectors"].get(mk, [])}
        rows = [s for s in sig.get("sectors") or [] if s.get("r5") is not None]
        rows.sort(key=lambda s: -s["r5"])
        if not rows:
            continue
        pick = lambda s: dict(name=s["name"], r5=s["r5"], r20=s.get("r20"), vs_index=s.get("vs_index"),
                              tilt=tilt.get(s["name"], 0), match=match_of(tilt.get(s["name"]), s["r5"]),
                              best=s.get("best"), worst=s.get("worst"), codes=s.get("codes") or [],
                              news=((s.get("news") or [{}])[0] or {}).get("title"))
        strong = [pick(s) for s in rows[:top]]
        seen = {x["name"] for x in strong}
        # 정책·경기 점수가 큰데 주가는 반대로 가는 업종도 종목팀에 넘겨요
        gap = [pick(s) for s in rows if abs(tilt.get(s["name"], 0)) >= 2 and match_of(tilt.get(s["name"]), s["r5"]) == "엇갈림"
               and s["name"] not in seen][:2]
        seen |= {x["name"] for x in gap}
        weak = [pick(s) for s in rows[::-1][:2] if s["name"] not in seen]
        links = (sig.get("sector_links") or {}).get(strong[0]["name"]) or []
        out[mk] = dict(strong=strong, weak=weak, gap=gap, next=[f"{a} ({b})" for a, b in links[:3]],
                       focus=[x["name"] for x in strong + gap])
    return out


# ---------------------------------------------------------------- 4. 종목팀

def stock_desk(sectors, signals, flows, funds, per_sector=2):
    flow_buy, flow_sell = {}, {}
    if flows:
        day = flows.get("day")
        for code, s in (flows.get("stocks") or {}).items():
            m = s.get("sum") or {}
            if m.get("day") == day and "frg5_won" in m:
                won = m["frg5_won"] + m.get("inst5_won", 0)
                (flow_buy if won > 0 else flow_sell)[code] = won
    out = {}
    for mk, sec in sectors.items():
        sig = signals.get(mk) or {}
        smap = sig.get("sector_of") or {}
        movers = (sig.get("movers") or {}).get("up", []) + (sig.get("movers") or {}).get("down", [])
        by_code = {m["code"]: m for m in movers}
        picks = []
        for name in sec["focus"]:
            codes = [m["code"] for m in movers if smap.get(m["code"]) == name]
            row = next(x for x in sec["strong"] + sec["gap"] if x["name"] == name)
            b = row.get("best") if row["r5"] >= 0 else row.get("worst")  # 업종 방향과 같은 대표 종목
            if b and b.get("code") not in codes:
                codes.append(b["code"])
            for code in codes[:per_sector]:
                m = by_code.get(code) or next((b for b in (row.get("best"), row.get("worst")) if b and b.get("code") == code), {})
                f = funds.get(mk, {}).get(code) or {}
                g = (f.get("grade") or {}).get("grade")
                notes = []
                if m.get("main"):
                    notes.append(m["main"])
                if g and g != "자료 없음":
                    notes.append(f"재무 {g}")
                if code in flow_buy:
                    notes.append("외국인·기관 5일 순매수")
                elif code in flow_sell:
                    notes.append("외국인·기관 5일 순매도")
                picks.append(dict(sector=name, code=code, name=m.get("name") or f.get("name") or code, r5=m.get("r5"), notes=notes,
                                  why=(m.get("reasons") or [None])[0]))
        quiet = [dict(code=q["code"], name=q.get("name") or q["code"], ratio=q.get("ratio"), r5=q.get("r5"))
                 for q in (sig.get("quiet_volume") or {}).get("rows") or []][:3]
        out[mk] = dict(picks=picks, quiet=quiet)
    return out


# ---------------------------------------------------------------- 5. 편집팀

def fact_text(f):
    if f["kind"] == "rate":  # 금리는 등락률 대신 %p (world.py)
        return f"{f['name']} {f['last']:.2f}% ({f['d1']:+.2f}%p, 1달 {f['m1']:+.2f}%p)" if f.get("m1") is not None else f"{f['name']} {f['last']:.2f}%"
    if f["kind"] == "krw":
        val = f"{f['last']:,.0f}원"
    else:
        val = f"{f['last']:,.2f}"
    return f"{f['name']} {val} ({pct(f['d1'], 2)}, 1달 {pct(f['m1'])})"


def headline(market, policy, sectors, stocks):
    lines = []
    m = market["markets"]
    lines.append(f"시장 분위기: 국장 {m['kr']['tone']}(코스피 1달 {pct(m['kr']['m1'])}) · "
                 f"미장 {m['us']['tone']}(S&P500 1달 {pct(m['us']['m1'])})")
    flows = []
    for mk in ("kr", "us"):
        sec = sectors.get(mk)
        if sec and sec["strong"]:
            s = sec["strong"][0]
            tail = " · 정책·경기와 같은 방향" if s["match"] == "맞음" else " · 정책·경기와 엇갈림" if s["match"] else ""
            flows.append(f"{FLAGS[mk]} {s['name']} {pct(s['r5'])}{tail}")
    if flows:
        lines.append("가장 강한 업종(5일): " + ", ".join(flows))
    if policy["big"]:
        e = policy["big"][0]
        lines.append(f"다음 큰 발표: {e['date'][5:]} {e['time']} {e['flag']} {e['title']}"
                     + (f" 외 {len(policy['big']) - 1}개" if len(policy["big"]) > 1 else ""))
    elif market["warns"]:
        lines.append("경기 경고: " + ", ".join(w["name"] for w in market["warns"]))
    return lines


def chain(market, policy, sectors, stocks):
    """자료가 팀 사이로 넘어간 흐름을 한 줄씩."""
    m = market["markets"]
    warn = ", ".join(w["name"] for w in market["warns"]) or "경기 경고 없음"
    lines = [f"시장팀 → 국장 {m['kr']['tone']}, 미장 {m['us']['tone']}, {warn}"]
    for mk, rows in policy["sectors"].items():
        good = [f"{r['sector']}(+{r['score']})" for r in rows if r["score"] > 0][:2]
        bad = [f"{r['sector']}({r['score']})" for r in rows[::-1] if r["score"] < 0][:2]
        lines.append(f"일정·정책팀 {FLAGS[mk]} → 호재 많은 업종 {', '.join(good) or '없음'}, 악재 많은 업종 {', '.join(bad) or '없음'}")
    for mk, sec in sectors.items():
        hits = [f"{s['name']} {s['match']}" for s in sec["strong"] + sec["gap"] if s["match"]]
        lines.append(f"업종팀 {FLAGS[mk]} → 볼 업종 {', '.join(sec['focus'])}" + (f" (정책 비교: {', '.join(hits)})" if hits else ""))
    for mk, st in stocks.items():
        if st["picks"]:
            lines.append(f"종목팀 {FLAGS[mk]} → " + ", ".join(f"{p['name']}({p['sector']})" for p in st["picks"][:4]))
    return lines


def build(inputs, today=None):
    today = today or dt.datetime.now(KST).date()
    market = market_desk(inputs["world"], inputs["macro"])
    policy = policy_desk(market, inputs["events"], inputs["calendar"], inputs["policies"], today)
    sectors = sector_desk(policy, inputs["signals"])
    stocks = stock_desk(sectors, inputs["signals"], inputs["flows"], inputs["funds"])
    return dict(day=today.isoformat(), generated=dt.datetime.now(KST).isoformat(timespec="minutes"),
                headline=headline(market, policy, sectors, stocks), chain=chain(market, policy, sectors, stocks),
                market=market, policy=policy, sectors=sectors, stocks=stocks)


def format_text(r):
    """텔레그램용 보통 글. [제목] 줄마다 tgfmt가 눌러서 펼치는 칸으로 만들어요."""
    out = [f"[시장팀] 지수·환율·경기"]
    out += [f"- {fact_text(f)}" for f in r["market"]["facts"]]
    if r["market"]["regime"]:
        out.append(f"- 경기 판정 {r['market']['regime']} (경고 {r['market']['macro_score']})"
                   + "".join(f"\n- ⚠️ {w['name']}: {w['now']}" for w in r["market"]["warns"]))
    p = r["policy"]
    out += ["", "[일정·정책팀] 앞으로 7일, 업종별 호재·악재"]
    out += [f"- {e['date'][5:]} {e['time']} {e['flag']} {e['title']}" + (f" (예상 {e['forecast']})" if e["forecast"] else "")
            for e in p["big"][:6]]
    out += [f"- {e['date'][5:]} {FLAGS.get(e['market'], '')} {e['title']}" + (" ⭐" if e["mine"] else "") for e in p["earn"][:6]]
    if p["caution"]:
        out.append(f"- {p['caution']}")
    for mk, rows in p["sectors"].items():
        for row in [x for x in rows if x["score"]][:4]:
            out.append(f"- {FLAGS[mk]} {row['sector']} {row['score']:+d}: " + "; ".join((row["good"] + row["bad"])[:3]))
    for mk, sec in r["sectors"].items():
        out += ["", f"[업종팀] {FLAGS[mk]} {MARKET_NAMES[mk]} 업종 흐름 (5일)"]
        for label, rows in (("상위", sec["strong"]), ("하위", sec["weak"]), ("정책·경기와 반대", sec["gap"])):
            for s in rows:
                tail = f", 정책·경기 {s['tilt']:+d} {s['match']}" if s["match"] else ""
                out.append(f"- {label} {s['name']} {pct(s['r5'])} (20일 {pct(s['r20'])}{tail})")
        if sec["next"]:
            out.append(f"- 연결 산업: {', '.join(sec['next'])}")
    for mk, st in r["stocks"].items():
        out += ["", f"[종목팀] {FLAGS[mk]} 볼 업종 안의 종목"]
        for s in st["picks"]:
            out.append(f"- {s['name']} ({s['sector']}) 5일 {pct(s['r5'])}" + (f": {', '.join(s['notes'])}" if s["notes"] else ""))
        for q in st["quiet"]:
            out.append(f"- 🔍 {q['name']}: 주가 그대로({pct(q['r5'])})인데 거래량 {q['ratio']:.1f}배")
    out += ["", "[편집팀] 자료가 넘어간 흐름"] + [f"- {x}" for x in r["chain"]]
    out.append("- 사고팔기 판단은 안 해요. 공개 자료로 만든 참고용 리포트예요")
    return "\n".join(out)


def summary_html(r):
    d = dt.date.fromisoformat(r["day"])
    head = tgfmt.head_html("오늘의 리포트", f"{d:%m.%d} {'월화수목금토일'[d.weekday()]}")
    return head + "\n" + "\n".join(f"• {tgfmt.esc(x)}" for x in r["headline"]) + "\n" + tgfmt.link("앱에서 보기")


def send(r):
    from realtime_monitor import send_html  # requests가 필요해서 보낼 때만

    import inbox

    parts = tgfmt.compose(summary_html(r), format_text(r))
    ok = all([send_html(p) for p in parts])
    inbox.add("\n\n".join(tgfmt.compose(summary_html(r), format_text(r), limit=10**9)), "report")
    return ok


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--paper", type=pathlib.Path, default=PAPER)
    parser.add_argument("--dry-run", action="store_true", help="보내지 않고 출력만")
    args = parser.parse_args()
    r = build(load_inputs(args.paper))
    (args.paper / "report.json").write_text(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("\n".join(r["headline"]) + "\n\n" + format_text(r))
    if not args.dry_run and not send(r):
        raise SystemExit("텔레그램 전송 실패 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 확인)")


if __name__ == "__main__":
    main()
