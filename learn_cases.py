#!/usr/bin/env python3
"""투자 공부 '사례 일지': 날마다 지수가 얼마나 움직였고 그때 크게 움직인 원인 후보가 뭐였는지 쌓아 둬요.

앱 투자 공부 → 오늘 왜 움직였나 아래 '사례 일지'에 나와요. 매일 장 마감 작업(daily 워크플로)이 리포트 다음에 돌려요.
이미 저장된 paper/world.json(세계 지수·금리·환율·유가·VIX), events.json(큰 발표 결과), report.json(업종)만 읽어요 (네트워크 없음).
원인은 '같은 때 크게 움직인 숫자'일 뿐이라 후보로만 적어요. 기준은 site/app.js DRIVERS의 now()와 같아요.

사용법:
    python learn_cases.py                 # 오늘(지수 마지막 날) 사례를 더해요
    python learn_cases.py --backfill 120  # 세계 지수 기록으로 지난 120거래일을 채워요 (처음 한 번)
"""

import argparse
import datetime as dt
import json
import pathlib

PAPER = pathlib.Path("paper")
OUT = PAPER / "learn_cases.json"
KEEP = 120  # 시장마다 최근 120거래일(약 반년). 앱 data.json에 같이 실려서 너무 길지 않게
OWN = {"kr": "^KS11", "us": "^GSPC"}
NAME = {"kr": "코스피", "us": "S&P500"}


def read_json(path):
    return json.loads(path.read_text()) if path.exists() else None


class Series:
    def __init__(self, item):
        pairs = [(d, c) for d, c in zip(item.get("dates") or [], item.get("closes") or []) if d and c is not None]
        self.dates = [d for d, _ in pairs]
        self.closes = [c for _, c in pairs]
        self.name = item.get("name") or item.get("sym")
        self.before = False  # 국장 사례에선 미국 시간 자료를 그 전날 밤 것으로 (아래 load_world)

    def at(self, day, before=False):
        """day와 같거나(before면 그 전) 마지막 거래일 자리 (없으면 None)."""
        i = None
        for k, d in enumerate(self.dates):
            if d < day or (d == day and not before):
                i = k
            else:
                break
        return i

    def change(self, day, back, diff=False):
        i = self.at(day, self.before)
        if i is None or i - back < 0:
            return None, None
        now, then = self.closes[i], self.closes[i - back]
        return now, (now - then if diff else (now / then - 1 if then else None))


US_TIME = {"^GSPC", "^IXIC", "^DJI", "^SOX", "^TNX", "US2Y", "CL=F", "GC=F", "HG=F", "^VIX", "DX-Y.NYB", "^STOXX50E", "^GDAXI", "^FTSE"}


def load_world(world, market="us"):
    """국장 날짜의 사례엔 미국·유럽 자료를 그 전 거래일 것으로 봐요 (같은 날짜의 뉴욕 장은 국장이 끝난 뒤에 열려서)."""
    out = {}
    for g in (world or {}).get("groups") or []:
        for item in g.get("items") or []:
            s = Series(item)
            s.before = market == "kr" and item["sym"] in US_TIME
            out[item["sym"]] = s
    return out


def pct(x, digits=1):
    return "-" if x is None else f"{x * 100:+.{digits}f}%"


def bp(x):
    return "-" if x is None else f"{round(x * 100):+d}bp"


def level(v, strong, some):
    v = abs(v or 0)
    return 2 if v >= strong else 1 if v >= some else 0


def market_causes(w, day, market):
    """세계 지수 기록으로 본 그날의 원인 후보 [{key, title, hit, text}]."""
    out = []

    def add(key, title, hit, text):
        if hit:
            out.append(dict(key=key, title=title, hit=hit, text=text))

    if "^TNX" in w:
        last, ch = w["^TNX"].change(day, 5, diff=True)
        if last is not None:
            add("rate", "금리", level(ch, 0.15, 0.08), f"미국 10년 {last:.2f}% · 1주 {bp(ch)}")
    fx = "KRW=X" if market == "kr" else "DX-Y.NYB"
    if fx in w:
        last, c1 = w[fx].change(day, 1)
        _, c5 = w[fx].change(day, 5)
        if last is not None:
            lim = (0.015, 0.008) if market == "kr" else (0.01, 0.006)
            hit = max(level(c5, *lim), 1 if abs(c1 or 0) >= lim[1] else 0)
            add("fx", "환율", hit, (f"원/달러 {last:,.0f}원" if market == "kr" else f"달러인덱스 {last:.1f}") + f" · 1주 {pct(c5)}")
    if "CL=F" in w:
        last, c1 = w["CL=F"].change(day, 1)
        _, c5 = w["CL=F"].change(day, 5)
        if last is not None:
            add("oil", "유가", max(level(c5, 0.05, 0.03), level(c1, 0.04, 0.02)), f"WTI {last:.1f}달러 · 하루 {pct(c1)} · 1주 {pct(c5)}")
    if "^SOX" in w:
        _, c1 = w["^SOX"].change(day, 1)
        _, c5 = w["^SOX"].change(day, 5)
        if c1 is not None:
            add("chip", "반도체·대형 기술주", max(level(c1, 0.025, 0.015), level(c5, 0.06, 0.035)), f"필라델피아 반도체 하루 {pct(c1)} · 1주 {pct(c5)}")
    others = ["^GSPC", "^IXIC"] if market == "kr" else ["^N225", "^STOXX50E"]
    moves = [(w[s].name, w[s].change(day, 1)[1]) for s in others if s in w]
    moves = [(n, c) for n, c in moves if c is not None]
    if moves:
        add("global", "다른 나라 증시", level(max(abs(c) for _, c in moves), 0.015, 0.008), " · ".join(f"{n} {pct(c)}" for n, c in moves))
    if "^VIX" in w:
        last, c1 = w["^VIX"].change(day, 1)
        if last is not None:
            hit = 2 if last >= 30 or (c1 or 0) >= 0.25 else 1 if last >= 22 or (c1 or 0) >= 0.12 else 0
            add("fear", "공포·심리", hit, f"VIX {last:.1f} · 하루 {pct(c1)}")
    return out


EVENT_KEY = {"inflation": ("infl", "물가"), "jobs": ("jobs", "고용"), "rate": ("cb", "중앙은행 회의")}


def event_causes(events, day):
    """그날까지 72시간 안에 결과가 나온 큰 발표(CPI·고용·FOMC)."""
    end = dt.datetime.fromisoformat(f"{day}T23:59+09:00")
    seen, out = set(), []
    for e in (events or {}).get("events") or []:
        g = EVENT_KEY.get(e.get("group"))
        if not g or not e.get("actual") or not (e.get("tier1") or e.get("group") == "rate"):
            continue
        try:
            at = dt.datetime.fromisoformat(e["at"])
        except (KeyError, ValueError):
            continue
        if not (end - dt.timedelta(hours=72) <= at <= end) or g[0] in seen:
            continue
        seen.add(g[0])
        fc = f" (예상 {e['forecast']})" if e.get("forecast") else ""
        out.append(dict(key=g[0], title=g[1], hit=2, text=f"{e.get('ko') or e.get('title')} 실제 {e['actual']}{fc}"))
    return out


def shock_news(events, day, market):
    """그날 앞뒤 하루 지수 급변 때 같이 나온 뉴스 제목 (최대 2개)."""
    kr = market == "kr"
    out = []
    for s in (events or {}).get("shocks") or []:
        is_kr = any(k in f"{s.get('symbol', '')}{s.get('label', '')}" for k in ("KS11", "KQ11", "코스"))
        if is_kr != kr or abs((dt.date.fromisoformat(s["at"][:10]) - dt.date.fromisoformat(day)).days) > 1:
            continue
        for n in s.get("news") or []:
            if n.get("title") and n["title"] not in [x["title"] for x in out]:
                out.append(dict(title=n["title"], link=n.get("link") or ""))
    return out[:2]


def build_case(w, day, market, events=None, report=None):
    own = w.get(OWN[market])
    if not own:
        return None
    i = own.at(day)
    if i is None or i < 1:
        return None
    day = own.dates[i]
    _, d1 = own.change(day, 1)
    _, w1 = own.change(day, 5)
    hi = max(own.closes[max(0, i - 251): i + 1])
    causes = event_causes(events, day) + market_causes(w, day, market)
    causes.sort(key=lambda c: -c["hit"])
    case = dict(day=day, index=NAME[market], d1=round(d1, 5), w1=None if w1 is None else round(w1, 5),
                dd=round(own.closes[i] / hi - 1, 5), causes=causes)
    news = shock_news(events, day, market)
    if news:
        case["news"] = news
    sec = ((report or {}).get("sectors") or {}).get(market)  # 업종은 오늘 리포트 것만 (마지막 날에만 넘겨요)
    if sec:
        case["strong"] = [dict(name=x["name"], r5=x.get("r5")) for x in (sec.get("strong") or [])[:2]]
        case["weak"] = [dict(name=x["name"], r5=x.get("r5")) for x in (sec.get("weak") or [])[:2]]
    return case


def merge(old, new_cases):
    by_day = {c["day"]: c for c in old or []}
    for c in new_cases:
        if c:
            prev = by_day.get(c["day"]) or {}
            by_day[c["day"]] = {**{k: prev[k] for k in ("strong", "weak", "news") if k in prev}, **c}
    return sorted(by_day.values(), key=lambda c: c["day"], reverse=True)[:KEEP]


def run(paper=PAPER, backfill=0):
    world = read_json(paper / "world.json")
    events, report = read_json(paper / "events.json"), read_json(paper / "report.json")
    old = read_json(paper / "learn_cases.json") or {}
    out = {"updated": dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(timespec="minutes")}
    for market, sym in OWN.items():
        w = load_world(world, market)
        own = w.get(sym)
        days = (own.dates[-backfill:] if backfill else own.dates[-1:]) if own else []
        out[market] = merge(old.get(market), [build_case(w, d, market, events, report if d == days[-1] else None) for d in days])
    (paper / "learn_cases.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--paper", type=pathlib.Path, default=PAPER)
    parser.add_argument("--backfill", type=int, default=0, help="지난 N거래일을 세계 지수 기록으로 채워요")
    args = parser.parse_args()
    out = run(args.paper, args.backfill)
    for m in OWN:
        c = (out.get(m) or [None])[0]
        print(f"{m}: 사례 {len(out.get(m) or [])}개" + (f", 최근 {c['day']} {c['index']} {pct(c['d1'], 2)} 원인 후보 {len(c['causes'])}개" if c else ""))


if __name__ == "__main__":
    main()
