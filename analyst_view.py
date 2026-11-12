"""분석가 시각: 분석팀(market_story.py)이 이은 사슬 위에 '20년차 분석가라면 오늘을 이렇게 본다'를 쉬운 말로 얹어요.

사람(분석가)이 시황을 볼 때 하는 순서를 규칙으로 옮겼어요. 유료 API·AI 안 쓰고, 이미 저장된 숫자만 써요.
  1. 쉽게 말하면     오늘을 한두 문장으로
  2. 오늘의 성격     골고루 오른 날인지, 대형주 몇 개가 끌어올린 날인지 / 하락 추세 속 반등인지, 상승 추세 속 조정인지
  3. 분석가의 해석   주인공(가장 센 사슬)·조연·엇박자, 그리고 이런 날 분석가가 경계하는 함정
  4. 확인할 것       반등(하락)이 이어지려면 맞아야 하는 숫자들 — 지금 값과 우호·부담 표시
  5. 시나리오        이어지는 경우 / 되돌리는 경우, 각각 무엇이 신호인지 (사고팔기 신호 아님)
  6. 내일 볼 것      앞으로 이틀 안 큰 발표: 예상보다 높으면·낮으면 어디로 이어지는지
"""

import datetime as dt

ROUTE = {  # 큰 발표 → 결과별 연결 (높으면 / 낮으면)
    "infl": ("물가", "금리 인하 기대 ↓ → 미국 금리·달러 ↑ → 성장주·국장 부담", "금리 인하 기대 ↑ → 금리·달러 ↓ → 성장주·국장 숨통"),
    "jobs": ("고용", "경기 뜨거움 → 금리 인하 늦어짐 → 금리 ↑ (단, 너무 약하면 '침체 걱정'으로 오히려 하락)",
             "경기 식음 → 금리 인하 빨라짐 → 금리 ↓ (단, 너무 약하면 침체 걱정)"),
    "cb": ("금리 결정", "예상보다 높게: 돈값 ↑ → 성장주·신흥국 부담", "예상보다 낮게: 돈값 ↓ → 성장주·신흥국 숨통"),
    "growth": ("성장률", "경기 좋음 → 이익 기대 ↑, 대신 금리 인하 늦어질 수", "경기 둔화 → 이익 기대 ↓, 금리 인하 기대 ↑"),
}


def group_of(title):
    t = title or ""
    if any(k in t for k in ("물가", "CPI", "PCE", "PPI")):
        return "infl"
    if any(k in t for k in ("고용", "일자리", "실업", "임금")):
        return "jobs"
    if any(k in t for k in ("금리 결정", "FOMC", "기준금리")):
        return "cb"
    if "GDP" in t or "성장률" in t:
        return "growth"
    return None


def has_final(word):
    """마지막 한글 글자에 받침이 있는지 (조사 고르기: 이에요/예요, 이/가)."""
    for ch in reversed(word or ""):
        if "가" <= ch <= "힣":
            return (ord(ch) - 0xAC00) % 28 != 0
        if ch.isdigit():
            return ch in "013678"
    return False


def ida(word):
    return f"{word}{'이에요' if has_final(word) else '예요'}"


def iga(word):
    return f"{word}{'이' if has_final(word) else '가'}"


def pct(x, d=1):
    return "-" if x is None else f"{x * 100:+.{d}f}%"


def index_context(b):
    """지수의 큰 그림: 20일 흐름, 1년 고점 대비, 며칠째 같은 방향."""
    from market_story import INDEXES
    s = b.w.get(INDEXES[b.market][0][0])
    if not s or not b.day:
        return None
    i = s.at(b.day, s.before)
    if i is None or i < 21:
        return None
    c = s.closes
    streak, k = 0, i
    way = 1 if c[i] >= c[i - 1] else -1
    while k > 0 and (1 if c[k] >= c[k - 1] else -1) == way:
        streak += 1
        k -= 1
    return dict(d1=c[i] / c[i - 1] - 1, m20=c[i] / c[i - 20] - 1, dd=c[i] / max(c[max(0, i - 251): i + 1]) - 1,
                streak=streak * way, name=INDEXES[b.market][0][1])


def nature(b, ctx):
    """오늘의 성격 두 가지: 폭(골고루인가) + 추세 속 위치."""
    secs = [s for s in b.sectors.values() if s.get("r1") is not None]
    out = []
    d1 = ctx["d1"]
    if len(secs) >= 6:
        same = sum((s["r1"] > 0) == (d1 > 0) for s in secs) / len(secs)
        med = sorted(s["r1"] for s in secs)[len(secs) // 2]
        if abs(d1) >= 0.007 and same >= 0.75:
            out.append(("넓은 움직임", f"업종 {len(secs)}개 중 {round(same * len(secs))}개가 지수와 같은 쪽. 몇 종목이 아니라 시장 전체가 같이 움직인 날이에요."))
        elif abs(d1) >= 0.007 and abs(d1 - med) >= 0.01:
            out.append(("좁은 움직임", f"지수는 {pct(d1)}인데 업종 중간값은 {pct(med)}. 덩치 큰 몇 종목이 지수를 끌었고, 보통 종목 체감은 달랐어요."))
        elif abs(d1) < 0.007:
            out.append(("쉬어 가는 날", "지수는 조용하고 업종끼리 자리바꿈만 있었어요."))
        else:
            out.append(("엇갈린 날", "업종마다 방향이 갈렸어요. 시장 전체보다 업종·종목 이야기가 중요한 날이에요."))
    m20, dd = ctx["m20"], ctx["dd"]
    if m20 <= -0.08 and d1 >= 0.015:
        out.append(("하락 추세 속 큰 반등", f"한 달 {pct(m20)}, 1년 고점 대비 {pct(dd)}인 상태에서 하루 {pct(d1)}. 아직 '반등'이지 '추세 전환'이라고 부르긴 일러요."))
    elif m20 >= 0.08 and d1 <= -0.015:
        out.append(("상승 추세 속 첫 조정", f"한 달 {pct(m20)} 오른 뒤 하루 {pct(d1)}. 오른 만큼 쉬어 가는 건지, 흐름이 꺾이는 건지 시험대예요."))
    elif m20 <= -0.08:
        out.append(("하락 추세", f"한 달 {pct(m20)}, 1년 고점 대비 {pct(dd)}. 큰 그림은 아직 아래쪽이에요."))
    elif m20 >= 0.08:
        out.append(("상승 추세", f"한 달 {pct(m20)}. 큰 그림은 위쪽이에요."))
    return out


def checks(b, ctx):
    """시장이 오르는 힘을 받으려면 맞아야 할 숫자. good: True 오르는 힘 쪽, False 부담, None 모름. flip: 부담이 풀리는 모습."""
    out = []

    def add(q, now, good, why, flip):
        out.append(dict(q=q, now=now, good=good, why=why, flip=flip))

    if b.market == "kr":
        f = b.foreign()
        add("외국인이 사는가", "자료 없음" if f is None else f"큰 종목 하루 {'+' if f >= 0 else '-'}{abs(f) / 1e8:,.0f}억 원",
            None if f is None else f > 0, "국장 큰 흐름은 외국인 돈이 정해요. 외국인 없이 개인만 산 반등은 오래 못 가는 경우가 많아요.", "외국인이 사는 쪽으로 돌아서고")
        fx = b.move("KRW=X")
        fx5 = five(b, "KRW=X")
        add("원화가 안정되는가", "-" if fx is None else f"원/달러 {fx['last']:,.0f}원 · 5일 {pct(fx5)}", None if fx5 is None else fx5 <= 0,
            "원화가 강해지는 쪽이면 외국인이 들어오기 쉬워요. 반등하는데 환율이 계속 오르면 의심해요.", "원/달러가 내려와 안정되고")
    rate5 = five(b, "^TNX", diff=True)
    tnx = b.move("^TNX", diff=True)
    add("미국 금리가 진정되는가", "-" if tnx is None else f"10년 {tnx['last']:.2f}% · 5일 {'-' if rate5 is None else f'{round(rate5 * 100):+d}bp'}",
        None if rate5 is None else rate5 <= 0.05, "금리가 다시 뛰면 주식 값의 '중력'이 세져요.", "미국 금리가 내려오고")
    vix = b.move("^VIX")
    add("공포가 가라앉는가", "-" if vix is None else f"VIX {vix['last']:.1f}", None if vix is None else vix["last"] < 22,
        "VIX 20 아래면 보통, 30 위면 공포. 공포가 높은 채로 오르는 반등은 흔들리기 쉬워요.", "VIX가 20 아래로 내려오고")
    secs = [s for s in b.sectors.values() if s.get("r1") is not None]
    if secs:
        same = sum((s["r1"] > 0) for s in secs)
        add("여러 업종이 같이 오르는가", f"업종 {len(secs)}개 중 {same}개 상승", same / len(secs) >= 0.6,
            "한두 업종만 오른 반등보다, 여러 업종이 같이 오른 반등이 더 단단해요.", "여러 업종이 같이 오르고")
    chip = b.sector("반도체")
    if chip and chip["r20"] is not None and b.market == "kr":
        add("반도체가 버티는가", f"반도체 업종 하루 {pct(chip['r1'])} · 20일 {pct(chip['r20'])}", (chip["r1"] or 0) > 0,
            "코스피의 엔진은 반도체예요. 반도체 없이 지수가 오래 오르긴 어려워요.", "반도체가 다시 오르고")
    return out


def five(b, sym, diff=False):
    s = b.w.get(sym)
    if not s or not b.day:
        return None
    i = s.at(b.day, s.before)
    if i is None or i < 5:
        return None
    a, z = s.closes[i], s.closes[i - 5]
    return a - z if diff else (a / z - 1 if z else None)


def upcoming(b, days=2):
    if not b.day:
        return []
    start = dt.date.fromisoformat(b.day)
    end = (start + dt.timedelta(days=days)).isoformat()
    events = b.inputs.get("events") or []
    if isinstance(events, dict):
        events = events.get("events") or []
    out, seen = [], set()
    for e in events:
        title = e.get("ko") or e.get("title") or ""
        g = group_of(title)
        if not g or not e.get("tier1") or not (b.day < (e.get("date") or "") <= end) or e.get("actual") or g in seen:
            continue
        seen.add(g)
        name, hi, lo = ROUTE[g]
        out.append(dict(when=f"{e['date'][5:7]}.{e['date'][8:10]} {(e.get('at') or '')[11:16]}", what=f"{e.get('flag', '')} {title}",
                        forecast=e.get("forecast"), hi=hi, lo=lo,
                        tip="결과가 예상과 비슷하면 이미 반영돼 조용할 가능성이 커요. 숫자보다 '예상과의 차이'를 보세요."))
    return out[:3]


def track(b, labels, after=5):
    """분석팀 성적표: 지난 기록 중 오늘과 같은 성격이었던 날, 그 뒤 5거래일 지수가 같은 쪽으로 더 갔나."""
    from market_story import INDEXES
    s = b.w.get(INDEXES[b.market][0][0])
    log = ((b.inputs.get("story_log") or {}).get(b.market)) or []
    if not s or not log:
        return None
    for label in labels:
        days = [r for r in log if r.get("day") and r["day"] < b.day and label in (r.get("nature") or [])]
        res = []
        for r in days:
            i = s.at(r["day"], s.before)
            if i is None or i + after >= len(s.closes) or s.dates[i] != r["day"]:
                continue
            way = 1 if (r.get("d1") or 0) >= 0 else -1
            res.append((s.closes[i + after] / s.closes[i] - 1, way))
        if len(res) >= 3:
            same = sum((x > 0) == (w > 0) for x, w in res)
            avg = sum(x for x, _ in res) / len(res)
            return dict(label=label, n=len(res), same=same, avg=round(avg, 4),
                        text=f"지난 기록에서 '{label}'이었던 날은 {len(res)}번. 그 뒤 5거래일 동안 같은 쪽으로 더 간 건 {same}번이었고, "
                             f"{INDEXES[b.market][0][1]}는 평균 {pct(avg)} 움직였어요."
                             + (" 이런 날 흐름이 이어진 경우가 절반이 안 됐어요. 하루 움직임만 보고 따라가지 않는 게 좋아요." if same * 2 < len(res)
                                else " 이런 날은 흐름이 이어진 경우가 더 많았어요. 다만 횟수가 적어 참고만 해요."))
    return None


def view(b, chains, expect):
    ctx = index_context(b)
    if not ctx:
        return None
    nat = nature(b, ctx)
    chk = checks(b, ctx)
    up = ctx["d1"] >= 0
    lead = next((c for c in chains if c["verdict"] == "확인"), chains[0] if chains else None)
    support = [c for c in chains if c is not lead and c["verdict"] == "확인"][:1]
    off = sorted([c for c in chains if c["verdict"] in ("엇갈림", "반대")], key=lambda c: c["kind"] not in ("infl", "jobs", "cb"))[:1]
    name, d1 = ctx["name"], ctx["d1"]

    # 1. 쉽게 말하면
    if lead:
        head = lead["title"].split(" → ")[0]
        plain = f"오늘 {name} {pct(d1)}의 주인공은 '{head}'" + ("이에요." if has_final(head) else "예요.")
    else:
        plain = f"오늘 {name} {pct(d1)}은 바깥 변수보다 업종·종목 이야기가 움직인 날이에요."
    trend = [t for t, _ in nat if "추세" in t]
    if trend and trend[0] == "하락 추세 속 큰 반등":
        plain += " 다만 많이 빠진 뒤의 반등이라, 며칠 더 이어지는지가 진짜 시험이에요."
    elif trend and trend[0] == "상승 추세 속 첫 조정":
        plain += " 많이 오른 뒤라 이익 챙기기가 섞였어요. 하루 하락으로 흐름이 꺾였다고 보긴 일러요."

    # 2~3. 분석가의 해석
    pts = []
    if lead:
        pts.append(dict(h="주인공", t=f"{lead['title']}. " + " ".join(w.rstrip(".") + "." for w in (lead.get("why") or [])[:2])))
        ld = lead.get("leaders")
        if ld and ld.get("text"):
            names = ", ".join(f"{x['name']} {pct(x['r1'])}" for x in ld["stocks"])
            up_sec = sum(x["r1"] for x in ld["stocks"]) >= 0
            verb = "가 앞장서 올랐어요" if up_sec else "가 가장 많이 빠졌어요"
            pts.append(dict(h="이끈 종목" if up_sec else "앞장선 약세", t=f"{ld['sector']} 업종은 {names}{verb}. {ld['text']}"))
        sp = lead.get("spill")
        if sp:
            pts.append(dict(h="번진 곳", t=sp["text"]))
    if support:
        pts.append(dict(h="조연", t=f"{support[0]['title']}도 같은 쪽으로 힘을 보탰어요. 원인이 하나가 아니라 여럿이 겹친 날은 움직임이 더 커요."))
    if off:
        pts.append(dict(h="엇박자", t=off[0].get("note") or f"{off[0]['title']}: 예상과 다르게 움직였어요."))
    if expect:
        x = expect[0]
        pts.append(dict(h="가격 속 기대", t=f"{x['name']} {pct(x['r1'])}: {x['text']}"))
    # 이런 날 분석가가 경계하는 함정
    if trend and trend[0] == "하락 추세 속 큰 반등":
        pts.append(dict(h="함정", t="하루에 크게 오르는 날은 오히려 하락장 한가운데 많이 몰려 있어요. 변동이 큰 시기라 위아래로 다 크게 움직이거든요. "
                                     "그래서 분석가는 '얼마나 올랐나'보다 아래 '확인할 것'이 며칠 동안 바뀌는지를 봐요."))
    elif trend and trend[0] == "상승 추세 속 첫 조정":
        pts.append(dict(h="함정", t="오른 이유(실적·정책)가 그대로인지가 핵심이에요. 이유가 그대로면 쉬어 가기, 이유가 흔들리면 추세 변화예요."))
    elif any(t == "좁은 움직임" for t, _ in nat):
        pts.append(dict(h="함정", t="지수만 보면 시장이 좋아 보여도 내 종목은 다를 수 있어요. 지수보다 업종 흐름을 같이 보세요."))
    elif not chains:
        pts.append(dict(h="함정", t="큰 원인이 안 보이는 날 나온 뉴스 해석은 끼워 맞추기일 때가 많아요. 하루 움직임에 큰 의미를 두지 않는 것도 실력이에요."))

    # 5. 시나리오
    good = [c for c in chk if c["good"] is True]
    bad = [c for c in chk if c["good"] is False]
    flips = [c["flip"] for c in bad][:2]
    when_good = (" ".join(flips)[:-1] + "면" if flips else "지금 우호적인 숫자들이 며칠 유지되면")
    lead_from = f"{iga(lead['nodes'][0]['t'])} 반대로 크게 움직이면" if lead else "바깥 변수가 갑자기 크게 움직이면"
    if up:
        scen = [dict(name="반등이 이어지는 경우", sign=when_good, then="오르는 힘 쪽 숫자가 늘수록 흐름이 단단해져요."),
                dict(name="반등을 되돌리는 경우", sign=lead_from, then="오늘 움직임의 출발점이 뒤집히면 결과도 같이 뒤집히기 쉬워요.")]
    else:
        scen = [dict(name="하락이 멈추는 경우", sign=when_good, then="부담이 하나씩 풀리면 파는 힘이 약해져요."),
                dict(name="하락이 더 이어지는 경우", sign=(f"{lead['nodes'][0]['t']} 쪽 압력이 계속되면" if lead else "부담 숫자가 더 나빠지면"),
                     then="출발점이 그대로면 결과도 이어지기 쉬워요.")]
    score = f"{len(good)}/{len([c for c in chk if c['good'] is not None])}"
    hist = track(b, [t for t, _ in nat if "추세" in t or "반등" in t or "조정" in t] + [t for t, _ in nat])
    return dict(history=hist, plain=plain, nature=[dict(t=t, x=x) for t, x in nat], points=pts, checks=chk, score=score,
                scenarios=scen, watch=upcoming(b), context=dict(m20=round(ctx["m20"], 4), dd=round(ctx["dd"], 4), streak=ctx["streak"]))
