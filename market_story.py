"""분석팀: 오늘 숫자들을 'A 때문에 B, B 때문에 C·D' 사슬로 이어서 시황을 풀어요. 사고팔기 판단은 안 해요.

리포트 부서(report_desks.py)의 여섯 번째 팀이에요. 새 자료를 받지 않고, 이미 저장된 파일만 읽어요 (유료 API·AI 안 씀):
  paper/world.json(세계 지수·금리·환율·유가·VIX 기록), events.json(큰 발표 결과), calendar.json(실적 발표 날),
  <시장>/daily.json(업종 하루·5일·20일 흐름, 많이 움직인 종목), kr/flows.json(외국인 하루 순매수)

하는 일
  1. 연결 고리: 시장이 잘 알려진 경로(금리 → 성장주, 반도체 → 코스피, 환율 → 외국인 …)마다
     '출발점'이 평소보다 크게 움직였는지 보고, 끝에 있는 업종·지수가 정말 그 방향으로 갔는지 숫자로 맞춰 봐요.
     맞으면 '확인', 반대로 갔으면 '엇갈림'(다른 힘이 더 셌다는 뜻 → 그 힘이 뭔지도 찾아요).
  2. 기대와 반영: 실적 발표 뒤 빠진 종목, 업종은 오르는데 혼자 빠진 종목, 많이 오른 업종이 쉬는 날처럼
     '좋은 소식이 이미 가격에 들어 있었다'고 볼 만한 움직임을 골라요.
  3. 한 줄 해설: 가장 센 사슬로 오늘을 한 문장으로 묶어요.
결과는 report.json의 story 칸(앱 리포트·투자 공부 '오늘 왜'), paper/story_log.json(투자 공부 '사례집'의 최근 사건)에 남아요.
숫자로 맞춰 본 연결이지 원인을 증명한 건 아니에요. 그래서 '확인'도 '숫자가 그 방향으로 움직였다'는 뜻이에요.
"""

import datetime as dt
import json
import pathlib
import re

import analyst_view
import learn_cases as lc

KEEP_LOG = 250  # 시장마다 최근 250거래일(약 1년)
INDEXES = {"kr": [("^KS11", "코스피"), ("^KQ11", "코스닥")], "us": [("^GSPC", "S&P500"), ("^IXIC", "나스닥")]}
MOVE_SECTOR = 0.005  # 업종 하루 ±0.5% 넘게 움직여야 '그 방향'으로 쳐요
MOVE_INDEX = 0.003


def pct(x, d=1):
    return "-" if x is None else f"{x * 100:+.{d}f}%"


def bp(x):
    return "-" if x is None else f"{round(x * 100):+d}bp"


def won(x):
    a = abs(x)
    s = f"{a / 1e12:,.1f}조" if a >= 1e12 else f"{a / 1e8:,.0f}억"
    return ("+" if x >= 0 else "-") + s + " 원"


# ---------------------------------------------------------------- 숫자 꺼내기

class Board:
    """그날 쓸 숫자판: 세계 지수(그날 기준으로 맞춤) + 업종 + 종목 + 외국인 수급."""

    def __init__(self, inputs, market):
        self.market = market
        self.sig = (inputs.get("signals") or {}).get(market) or {}
        self.w = lc.load_world(inputs.get("world") or {}, market)
        own = self.w.get(INDEXES[market][0][0])
        day = self.sig.get("day")
        if own and own.dates and not day:
            day = own.dates[-1]
        self.day = day
        self.sectors = {s["name"]: s for s in self.sig.get("sectors") or []}
        self.inputs = inputs
        own_m = self.move(INDEXES[market][0][0])
        self.idx_d1 = own_m and own_m["d1"]

    def move(self, sym, diff=False):
        """(마지막 값, 하루 변화, 평소 하루 크기의 몇 배). 자료가 없으면 None."""
        s = self.w.get(sym)
        if not s or not self.day:
            return None
        i = s.at(self.day, s.before)
        if i is None or i < 1:
            return None
        c = s.closes[max(0, i - 121): i + 1]
        ch = (lambda a, b: a - b) if diff else (lambda a, b: a / b - 1 if b else 0.0)
        d = [ch(c[k], c[k - 1]) for k in range(1, len(c))]
        base = d[:-1]
        sd = (sum((x - sum(base) / len(base)) ** 2 for x in base) / len(base)) ** 0.5 if len(base) > 20 else 0.0
        return dict(last=c[-1], d1=d[-1], z=abs(d[-1]) / sd if sd else 0.0, day=s.dates[i], name=s.name)

    def sector(self, name):
        s = self.sectors.get(name)
        if not s:
            return None
        r1 = s.get("r1")
        return dict(r1=r1, r5=s.get("r5"), r20=s.get("r20"), row=s)

    def foreign(self):
        """국장 큰 종목(수급 자료가 있는 50개쯤)의 외국인 하루 순매수 합 (원). 그날 자료가 아니면 None."""
        f = self.inputs.get("flows") or {}
        total, n = 0.0, 0
        for s in (f.get("stocks") or {}).values():
            ds, fr, cl = s.get("dates") or [], s.get("frg") or [], s.get("close") or []
            if ds and ds[-1] == self.day and fr and cl and fr[-1] is not None and cl[-1]:
                total += fr[-1] * cl[-1]
                n += 1
        return total if n >= 10 else None


def node(t, v=None, s=None):
    return dict(t=t, v=v, s=s)


def end(t, val, want, size=MOVE_SECTOR, fmt=pct, judge=None, sub=None):
    """사슬 끝: 기대한 방향(want +1/-1)으로 움직였는지. ok True 맞음, False 반대, None 거의 그대로·자료 없음.
    judge: 방향을 볼 값 (업종은 지수 대비 초과분, 다 같이 오른 날 '같이 올랐을 뿐'을 맞음으로 치지 않게)."""
    if val is None:
        return None
    j = val if judge is None else judge
    ok = None if abs(j) < size else (j > 0) == (want > 0)
    return dict(t=t, v=fmt(val), s=1 if val > 0 else -1 if val < 0 else 0, ok=ok, want=want, sub=sub)


def verdict(ends):
    ends = [e for e in ends if e]
    good = sum(e["ok"] is True for e in ends)
    bad = sum(e["ok"] is False for e in ends)
    if good and not bad:
        return "확인"
    if bad and not good:
        return "반대"
    return "엇갈림" if good and bad else "미미"


def sector_end(b, name, want, label=None):
    """업종 하루 흐름. 맞음·반대는 지수보다 얼마나 더(덜) 움직였나로 봐요."""
    s = b.sector(name)
    if not s or s["r1"] is None:
        return None
    rel = s["r1"] - b.idx_d1 if b.idx_d1 is not None else None
    sub = f"{INDEXES[b.market][0][1]}보다 {rel * 100:+.1f}%p" if rel is not None else None
    return end(f"{label or name} 업종", s["r1"], want, judge=rel, sub=sub)


def index_end(b, k, want):
    sym, name = INDEXES[b.market][k]
    m = b.move(sym)
    return end(name, m and m["d1"], want, MOVE_INDEX)


def make(key, kind, title, nodes, why, ends, lesson, z=0.0, note=None):
    ends = [e for e in ends if e]
    if not ends:
        return None
    v = verdict(ends)
    good, bad = sum(e["ok"] is True for e in ends), sum(e["ok"] is False for e in ends)
    return dict(key=key, kind=kind, title=title, nodes=nodes, why=why, ends=ends, verdict=v, note=note, lesson=lesson,
                strength=round(ROOT.get(kind, 1) + min(z, 4) * 0.5 + good * 0.5 - bad * 0.3, 2))


# 출발점이 '원인'에 가까울수록 앞에 둬요 (공포 지수는 보통 다른 일의 결과라 뒤로)
ROOT = {"infl": 3, "jobs": 3, "cb": 3, "expect": 1.5, "chip": 2.5, "rate": 2, "fx": 1.5, "oil": 1.5, "global": 1.2, "local": 1, "fear": 0.5}


# ---------------------------------------------------------------- 1. 큰 발표 결과 → 금리 → 주가

NUM = re.compile(r"-?\d+(?:\.\d+)?")


def num(s):
    m = NUM.search(str(s or "").replace(",", ""))
    return float(m.group()) if m else None


EVENT_SENSE = {  # 예상보다 높게 나오면 금리를 올리는 쪽(+1)인지
    "inflation": (1, "물가가 예상보다 높으면 연준이 금리를 늦게 내리거나 더 올릴 수 있어요"),
    "jobs": (1, "일자리가 예상보다 많으면 경기가 뜨거워 금리 인하가 늦어질 수 있어요"),
}


def event_chains(b):
    events = b.inputs.get("events") or []
    if isinstance(events, dict):
        events = events.get("events") or []
    if not b.day:
        return []
    # 국장은 그 전날 밤(한국 시간 그날 아침 9시 전)까지 나온 발표, 미장은 그날 뉴욕 장 마감(다음 날 06시 KST) 전까지
    close = dt.datetime.fromisoformat(f"{b.day}T09:00+09:00") if b.market == "kr" else \
        dt.datetime.fromisoformat(f"{b.day}T06:00+09:00") + dt.timedelta(days=1)
    out, seen = [], set()
    for e in events:
        g = e.get("group")
        if g not in ("inflation", "jobs", "rate") or not e.get("actual") or not (e.get("tier1") or g == "rate"):
            continue
        try:
            at = dt.datetime.fromisoformat(e["at"])
        except (KeyError, ValueError):
            continue
        if not (close - dt.timedelta(hours=24) <= at <= close) or g in seen:
            continue
        a, f = num(e["actual"]), num(e.get("forecast"))
        name = e.get("ko") or e.get("title") or ""
        if a is None or f is None:
            continue
        seen.add(g)
        sense = 1
        if "실업" in name:
            sense = -1  # 실업률은 높을수록 경기가 식는 쪽
        hot = (a > f) - (a < f)
        if g == "rate":
            hot = (a > f) - (a < f)
            label = "예상보다 높게 결정" if hot > 0 else "예상보다 낮게 결정" if hot < 0 else "예상대로 결정"
        else:
            label = "예상보다 높음" if a > f else "예상보다 낮음" if a < f else "예상과 같음"
        tnx = b.move("US2Y", diff=True) or b.move("^TNX", diff=True)
        rate_v = tnx and tnx["d1"]
        push = hot * sense  # +1 금리 올리는 쪽, -1 내리는 쪽, 0 예상대로
        first = node(f"{e.get('flag', '')} {name} {e['actual']}", f"예상 {e.get('forecast')}", push or None)
        if push == 0:
            # 예상대로 나온 날: 시장이 이미 가격에 넣어 둔 결과라 크게 안 움직였는지 봐요
            m = b.move(INDEXES[b.market][0][0])
            if m is None:
                continue
            calm = abs(m["d1"]) < 0.007
            idx_end = dict(t=INDEXES[b.market][0][1], v=pct(m["d1"]), s=1 if m["d1"] > 0 else -1 if m["d1"] < 0 else 0, ok=calm, want=0,
                           sub="크게 안 움직임" if calm else "예상대로인데 크게 움직임")
            out.append(make(
                "expect_event", "expect", f"{name} 예상대로 → {'이미 반영, 지수 조용' if calm else '지수는 다른 이유로 움직임'}",
                [first, node("모두가 예상한 숫자", "이미 가격에 들어 있음")],
                ["결과가 예상과 같으면 새 정보가 없어요", "그래서 지수는 보통 크게 안 움직여요"],
                [idx_end],
                "주가는 '좋다·나쁘다'보다 '예상보다 좋다·나쁘다'에 움직여요. 예상대로면 이미 반영돼 있어요.", z=0.5,
                note=None if calm else f"예상대로였는데도 {INDEXES[b.market][0][1]}가 {pct(m['d1'])} 움직였다면 다른 소식(업종·수급)이 더 셌어요."))
            continue
        why_hot = EVENT_SENSE.get(g, (1, "예상보다 높게 결정되면 돈 빌리는 값이 비싸져요"))[1]
        cut = "금리 인하 기대가 줄어요" if push > 0 else "금리 인하 기대가 커져요"
        ends = [end("미국 금리(2년)" if b.move("US2Y") else "미국 10년 금리", rate_v, push, 0.02, bp)]
        if b.market == "us":
            ends += [index_end(b, 1, -push), sector_end(b, "인터넷·게임·SW", -push)]
        else:
            fx = b.move("KRW=X")
            ends += [end("원/달러", fx and fx["d1"], push, 0.002), index_end(b, 0, -push)]
        out.append(make(
            f"event_{g}", g if g != "rate" else "cb", f"{name} {label} → {cut}",
            [first, node(cut), node("미국 금리 " + ("↑" if push > 0 else "↓"))],
            [why_hot if push > 0 else why_hot.replace("높으면", "낮으면").replace("많으면", "적으면").replace("늦어질", "빨라질").replace("늦게 내리거나 더 올릴", "더 빨리 내릴"),
             "금리 인하 기대가 바뀌면 국채 금리가 먼저 움직여요",
             "금리가 오르면 미래 이익의 지금 가치가 줄어 성장주가 먼저 빠지고, 달러가 강해져요" if push > 0
             else "금리가 내리면 성장주가 먼저 오르고, 달러가 약해져 신흥국(한국)으로 돈이 들어오기 쉬워요"],
            ends, "큰 발표는 숫자 자체보다 '예상과의 차이'가 금리를 움직이고, 금리가 주가를 움직여요.", z=2.5))
    return [c for c in out if c]


# ---------------------------------------------------------------- 2. 시장 경로들

def rate_chain(b):
    m = b.move("^TNX", diff=True)
    if not m or not (m["z"] >= 1.5 or abs(m["d1"]) >= 0.08):
        return None
    up = 1 if m["d1"] > 0 else -1
    ends = [sector_end(b, "인터넷·게임·SW", -up), sector_end(b, "바이오·헬스", -up), sector_end(b, "금융", up)]
    if b.market == "us":
        ends.insert(0, index_end(b, 1, -up))
    return make("rate", "rate", f"미국 금리 {'급등' if up > 0 else '급락'} → 성장주 {'부담' if up > 0 else '숨통'}",
                [node("미국 10년 국채 금리", f"{m['last']:.2f}% ({bp(m['d1'])})", up),
                 node("미래 이익의 지금 가치 " + ("↓" if up > 0 else "↑"))],
                ["금리가 오르면 먼 미래 이익을 지금 값으로 바꿀 때 더 많이 깎여요" if up > 0 else "금리가 내리면 먼 미래 이익이 덜 깎여요",
                 "이익이 먼 미래에 몰린 성장주(인터넷·SW·바이오)가 가장 민감하고, 은행은 이자 장사라 반대로 움직이기 쉬워요"],
                ends, "금리는 모든 자산의 '할인율'이에요. 금리가 크게 움직인 날은 성장주와 은행주가 반대로 가는지 보세요.", z=m["z"])


def chip_chain(b):
    m = b.move("^SOX")
    if not m or not (m["z"] >= 1.5 or abs(m["d1"]) >= 0.03):
        return None
    up = 1 if m["d1"] > 0 else -1
    if b.market == "kr":
        ends = [sector_end(b, "반도체", up), sector_end(b, "IT·전자", up), index_end(b, 0, up)]
        first = node("밤사이 미국 필라델피아 반도체지수", pct(m["d1"]), up)
        why = ["미국 반도체 주가는 AI 서버·메모리 수요 기대를 가장 먼저 보여 줘요",
               "한국 반도체(메모리·장비·부품)는 같은 수요에 기대는 회사라 다음 날 아침 따라가기 쉬워요",
               "코스피는 반도체 비중이 커서 반도체가 움직이면 지수 전체가 끌려가요"]
    else:
        ends = [sector_end(b, "반도체", up), sector_end(b, "IT·전자", up), index_end(b, 1, up)]
        first = node("필라델피아 반도체지수", pct(m["d1"]), up)
        why = ["반도체 주가는 AI 투자·수요 기대를 가장 먼저 보여 줘요",
               "반도체 부품·서버·장비 회사가 같이 움직여요",
               "나스닥은 대형 기술주 비중이 커서 함께 끌려가요"]
    c = make("chip", "chip", f"반도체 {'반등' if up > 0 else '급락'} → {'국장 반도체·코스피' if b.market == 'kr' else '기술주·나스닥'}",
             [first, node("AI·반도체 수요 기대 " + ("↑" if up > 0 else "↓"))], why, ends,
             "반도체는 한국 증시의 '엔진'이에요. 미국 반도체가 크게 움직인 다음 날은 국내 반도체가 얼마나 따라갔는지로 국내 힘을 가늠해요.",
             z=m["z"])
    if c and c["verdict"] in ("반대", "엇갈림", "미미") and b.market == "kr":
        f = b.foreign()
        tail = f" 실제로 외국인이 큰 종목에서 하루 {won(f)} {'순매수' if f > 0 else '순매도'}했어요." if f is not None else ""
        c["note"] = (f"미국 반도체는 {pct(m['d1'])}였는데 국내로는 덜 전해졌어요. 이미 전날 미리 반영됐거나, "
                     f"국내 수급·환율 같은 다른 힘이 더 셌다는 뜻이에요.{tail}")
    return c


def fx_chain(b):
    if b.market == "kr":
        m = b.move("KRW=X")
        if not m or not (m["z"] >= 1.5 or abs(m["d1"]) >= 0.007):
            return None
        up = 1 if m["d1"] > 0 else -1  # +1 원화 약세
        f = b.foreign()
        ends = [end("외국인 순매수(큰 종목)", f, -up, 1e10, won) if f is not None else None,
                index_end(b, 0, -up), sector_end(b, "자동차", up), sector_end(b, "조선·방산·기계", up)]
        return make("fx", "fx", f"원화 {'약세' if up > 0 else '강세'} → 외국인 {'매도' if up > 0 else '매수'} 쪽",
                    [node("원/달러", f"{m['last']:,.0f}원 ({pct(m['d1'])})", up),
                     node("외국인이 들고 있는 한국 주식의 달러 값 " + ("↓" if up > 0 else "↑"))],
                    ["원/달러가 오르면(원화 약세) 같은 주가라도 달러로 바꾸면 손해예요" if up > 0 else "원/달러가 내리면(원화 강세) 한국 주식을 들고 있으면 환율로도 벌어요",
                     "그래서 외국인이 지수 대형주를 " + ("팔기" if up > 0 else "사기") + " 쉬워요. "
                     + ("대신 수출 회사(자동차·조선)는 원화 약세로 이익이 늘어요" if up > 0 else "대신 수출 회사(자동차·조선)는 원화 강세로 이익이 줄 수 있어요")],
                    ends, "환율은 외국인 돈의 방향을 알려 줘요. 원화가 크게 약해진 날은 외국인 수급과 수출주를 같이 보세요.", z=m["z"])
    m = b.move("DX-Y.NYB")
    if not m or not (m["z"] >= 1.5 or abs(m["d1"]) >= 0.006):
        return None
    up = 1 if m["d1"] > 0 else -1
    gold = b.move("GC=F")
    return make("fx", "fx", f"달러 {'강세' if up > 0 else '약세'} → 금·원자재 {'부담' if up > 0 else '숨통'}",
                [node("달러인덱스", f"{m['last']:.1f} ({pct(m['d1'])})", up), node("달러로 매기는 자산 값 " + ("↓" if up > 0 else "↑"))],
                ["금·원자재는 달러로 값을 매겨서 달러가 비싸지면 다른 나라 사람에게 비싸져요",
                 "해외 매출이 많은 미국 대기업은 달러 강세면 해외 이익이 줄어 보여요"],
                [end("금", gold and gold["d1"], -up, 0.003), sector_end(b, "화학·소재", -up)],
                "달러는 세계 돈의 온도계예요. 달러가 크게 움직이면 금·원자재·신흥국이 반대로 움직이는지 보세요.", z=m["z"])


def oil_chain(b):
    m = b.move("CL=F")
    if not m or not (m["z"] >= 1.5 or abs(m["d1"]) >= 0.04):
        return None
    up = 1 if m["d1"] > 0 else -1
    ends = [sector_end(b, "에너지·정유", up), sector_end(b, "운송", -up), sector_end(b, "화학·소재", -up)]
    return make("oil", "oil", f"유가 {'급등' if up > 0 else '급락'} → 정유 {'웃고' if up > 0 else '울고'} 항공·화학 {'부담' if up > 0 else '숨통'}",
                [node("WTI 유가", f"{m['last']:.1f}달러 ({pct(m['d1'])})", up), node("기름값 " + ("↑" if up > 0 else "↓"))],
                ["유가는 전쟁·산유국 감산(공급)이나 경기(수요) 소식에 움직여요",
                 "정유·에너지 회사는 파는 값이 오르고, 항공·해운·화학은 사 오는 원료값이 올라요" if up > 0
                 else "정유·에너지 회사는 파는 값이 내리고, 항공·해운·화학은 원료값 부담이 줄어요"],
                ends, "같은 원인이 업종마다 반대로 작용해요. 유가가 크게 움직인 날 정유와 항공이 반대로 갔는지 보세요.", z=m["z"])


def fear_chain(b):
    m = b.move("^VIX")
    if not m:
        return None
    jump = m["d1"] >= 0.15 and (m["z"] >= 1.5 or m["last"] >= 25)
    calm = m["d1"] <= -0.15 and m["z"] >= 1.5
    if not (jump or calm):
        return None
    up = 1 if jump else -1  # +1 공포 커짐
    gold = b.move("GC=F")
    k_small = INDEXES[b.market][1]
    small = b.move(k_small[0])
    big = b.move(INDEXES[b.market][0][0])
    gap = small and big and small["d1"] - big["d1"]
    pp = lambda x: f"{x * 100:+.1f}%p"
    ends = [index_end(b, 0, -up), end(f"{k_small[1]}({INDEXES[b.market][0][1]} 대비)", gap, -up, 0.003, pp)]
    if up > 0:  # 불안할 땐 금으로 피하는지도 봐요 (안도할 때 금은 따로 움직일 때가 많아요)
        ends.append(end("금", gold and gold["d1"], up, 0.003))
    return make("fear", "fear", f"공포 지수 {'급등' if up > 0 else '급락'} → 위험 {'회피' if up > 0 else '선호'}",
                [node("VIX 공포 지수", f"{m['last']:.1f} ({pct(m['d1'])})", up), node("투자자 마음 " + ("불안" if up > 0 else "안도"))],
                ["VIX는 앞으로 한 달 S&P500이 얼마나 출렁일지에 대한 보험료 같은 값이에요",
                 "불안하면 변동이 큰 주식(" + k_small[1] + "·작은 회사)부터 팔고 금·달러로 피해요" if up > 0
                 else "불안이 풀리면 변동이 큰 주식으로 다시 돈이 들어와요"],
                ends, "공포가 커진 날엔 '무엇이 먼저 빠졌나'가 중요해요. 변동 큰 주식이 더 빠지고 금이 오르면 진짜 위험 회피예요.", z=m["z"])


def overnight_chain(b):
    if b.market != "kr":
        return None
    m = b.move("^GSPC")
    if not m or abs(m["d1"]) < 0.01:
        return None
    up = 1 if m["d1"] > 0 else -1
    nq = b.move("^IXIC")
    c = make("global", "global", f"밤사이 미국 증시 {pct(m['d1'])} → 코스피",
             [node("전날 밤 S&P500", pct(m["d1"]), up)] + ([node("나스닥", pct(nq["d1"]), 1 if nq["d1"] > 0 else -1)] if nq else []),
             ["세계 돈은 미국 증시 분위기를 보고 다음 날 아시아로 와요", "미국이 크게 움직이면 다음 날 코스피도 같은 쪽으로 출발하기 쉬워요"],
             [index_end(b, 0, up), index_end(b, 1, up)],
             "미국이 크게 움직였는데 코스피가 반대로 갔다면, 그날은 국내 사정이 더 중요했다는 뜻이에요.", z=m["z"])
    if c and c["ends"][0]["t"] == "코스피" and c["ends"][0]["ok"] is not True:
        c["title"] = f"밤사이 미국 증시 {pct(m['d1'])}인데 코스피는 안 따라감"
    elif c:
        c["title"] = f"밤사이 미국 증시 {pct(m['d1'])} → 코스피도 같은 쪽"
    return c


def yen_chain(b):
    m = b.move("JPYKRW=X")
    if not m or not (m["d1"] >= 0.015 and m["z"] >= 2):
        return None
    nk = b.move("^N225")
    return make("yen", "global", "엔화 급등 → 엔캐리 청산 걱정",
                [node("원/엔", f"{m['last']:,.0f}원 ({pct(m['d1'])})", 1), node("싼 엔으로 빌린 돈을 갚으려는 매도")],
                ["금리가 낮은 엔을 빌려 다른 나라 주식을 산 돈(엔캐리)이 많아요",
                 "엔이 갑자기 비싸지면 빌린 돈을 갚으려고 주식을 한꺼번에 팔아요"],
                [end("닛케이", nk and nk["d1"], -1, MOVE_INDEX), index_end(b, 0, -1)],
                "2024년 8월 5일처럼 엔화가 급등한 날은 이유 없이 세계 증시가 같이 빠질 수 있어요. 빌린 돈이 움직이는 날이에요.", z=m["z"])


def local_chain(b, others):
    """해외 변수가 조용한데 지수만 크게 움직인 날: 국내(미장이면 미국 안) 사정."""
    m = b.move(INDEXES[b.market][0][0])
    if not m or abs(m["d1"]) < 0.015:
        return None
    if any(c["key"] in ("chip", "global", "rate", "fx", "event_inflation", "event_jobs", "event_cb", "fear", "yen", "oil") for c in others):
        return None
    up = 1 if m["d1"] > 0 else -1
    secs = sorted([s for s in b.sectors.values() if s.get("r1") is not None], key=lambda s: s["r1"] * up, reverse=True)
    ends = [index_end(b, 1, up)] + [end(f"{s['name']} 업종", s["r1"], up) for s in secs[:2]]
    f = b.foreign() if b.market == "kr" else None
    if f is not None:
        ends.insert(0, end("외국인 순매수(큰 종목)", f, up, 1e10, won))
    where = "국내" if b.market == "kr" else "미국 안"
    return make("local", "local", f"해외는 조용한데 {INDEXES[b.market][0][1]} {pct(m['d1'])} → {where} 사정",
                [node("금리·환율·해외 증시", "평소 크기"), node(f"{INDEXES[b.market][0][1]} {pct(m['d1'])}", None, up)],
                ["바깥 변수가 조용하면 원인은 안쪽에 있어요",
                 "큰손(외국인·기관) 수급, 정책·정치 소식, 비중 큰 업종 소식을 먼저 봐요" if b.market == "kr"
                 else "실적 시즌·정책·대형주 몇 개의 소식을 먼저 봐요"],
                ends, "원인을 찾을 땐 '해외 → 국내 수급 → 업종' 순서로 좁혀 가요.", z=1.5)


# ---------------------------------------------------------------- 3. 기대와 반영

def earn_days(b):
    out = {}
    if not b.day:
        return out
    d = dt.date.fromisoformat(b.day)
    for c in b.inputs.get("calendar") or []:
        if c.get("kind") == "earn" and c.get("market") == b.market and c.get("code"):
            try:
                gap = (d - dt.date.fromisoformat(c["date"])).days
            except (KeyError, ValueError):
                continue
            if 0 <= gap <= 3:
                out[c["code"]] = c["date"]
    return out


def stock_pool(b):
    """오늘 하루 흐름을 아는 종목들: 업종별 하루 최고·최저 + 많이 움직인 종목."""
    pool = {}
    for s in b.sectors.values():
        for k in ("day_best", "day_worst"):
            x = s.get(k)
            if x and x.get("r1") is not None:
                pool[x["code"]] = dict(x, sector=s["name"], sector_r1=s.get("r1"))
    smap = b.sig.get("sector_of") or {}
    mv = b.sig.get("movers") or {}
    for x in (mv.get("up") or []) + (mv.get("down") or []):
        if x.get("r1") is not None and x["code"] not in pool:
            sec = smap.get(x["code"])
            pool[x["code"]] = dict(code=x["code"], name=x.get("name") or x["code"], r1=x["r1"],
                                   r20=None if x.get("r20") is None or x.get("r1") is None else (1 + x["r20"]) / (1 + x["r1"]) - 1,
                                   sector=sec, sector_r1=(b.sectors.get(sec) or {}).get("r1"), main=x.get("main"))
    return pool


def expectations(b, tilt=None):
    tilt = tilt or {}
    out = []
    earn = earn_days(b)
    pool = stock_pool(b)
    for code, x in pool.items():
        r1, r20 = x["r1"], x.get("r20")
        if code in earn and abs(r1) >= 0.03:
            if r1 < 0 and r20 is not None and r20 >= 0.1:
                out.append(dict(kind="sell_news", code=code, name=x["name"], sector=x.get("sector"), r1=r1, r20=r20,
                                title="실적 발표 뒤 하락 · 기대가 먼저 반영",
                                text=f"발표 전 20일 동안 {pct(r20)} 올라 좋은 실적을 이미 가격에 넣어 뒀어요. 발표 뒤 '재료 소멸'로 차익 실현 매도가 나왔을 가능성이 커요 (소문에 사고 뉴스에 판다)."))
            elif r1 < 0:
                out.append(dict(kind="miss", code=code, name=x["name"], sector=x.get("sector"), r1=r1, r20=r20,
                                title="실적 발표 뒤 하락 · 기대에 못 미침?",
                                text="발표 전에 크게 오르지도 않았는데 빠졌다면 실적이나 다음 분기 전망이 시장 기대보다 낮았을 가능성이 커요."))
            else:
                out.append(dict(kind="beat", code=code, name=x["name"], sector=x.get("sector"), r1=r1, r20=r20,
                                title="실적 발표 뒤 상승 · 기대보다 좋음?",
                                text="발표 뒤 올랐다면 실적이나 전망이 시장 기대보다 좋았을 가능성이 커요. 기대가 낮았던 종목일수록 더 크게 반응해요."))
            continue
        sr = x.get("sector_r1")
        if sr is not None and sr >= 0.01 and r1 <= -0.03:
            hot = r20 is not None and r20 >= 0.2
            out.append(dict(kind="alone_down", code=code, name=x["name"], sector=x.get("sector"), r1=r1, r20=r20,
                            title="업종은 올랐는데 혼자 하락" + (" · 많이 오른 뒤 차익 실현" if hot else ""),
                            text=(f"{x.get('sector')} 업종은 {pct(sr)}인데 이 종목만 {pct(r1)}. "
                                  + (f"그 전 20일 {pct(r20)} 올라 기대가 앞서간 만큼 이익을 챙기는 매도가 나왔을 수 있어요." if hot
                                     else "업종 전체 이야기가 아니라 이 회사만의 소식(실적·공시·수주)일 가능성이 커요."))))
        elif sr is not None and sr <= -0.01 and r1 >= 0.03:
            out.append(dict(kind="alone_up", code=code, name=x["name"], sector=x.get("sector"), r1=r1, r20=r20,
                            title="업종은 빠졌는데 혼자 상승",
                            text=f"{x.get('sector')} 업종은 {pct(sr)}인데 이 종목만 {pct(r1)}. 업종 바람을 이길 만한 이 회사만의 소식이 있었을 가능성이 커요."
                                 + (f" ({x['main']})" if x.get("main") else "")))
    idx = b.idx_d1 or 0.0
    for s in b.sectors.values():
        r1, r20 = s.get("r1"), s.get("r20")
        if r1 is None or r20 is None:
            continue
        if r20 >= 0.15 and r1 <= -0.02 and r1 - idx <= -0.02:
            t = tilt.get(s["name"], 0)
            out.append(dict(kind="priced_in", sector=s["name"], name=s["name"], r1=r1, r20=r20,
                            title="많이 오른 업종이 쉬어 감 · 기대 선반영",
                            text=f"20일 동안 {pct(r20)} 오른 뒤 하루 {pct(r1)} (지수보다 {(r1 - idx) * 100:+.1f}%p)."
                                 + (f" 정책·경기 호재(+{t})가 있는데도 빠진 건, 그 호재가 이미 가격에 들어 있어 새로 살 이유가 약해졌다는 뜻일 수 있어요." if t > 0
                                    else " 좋은 이야기가 가격에 먼저 들어간 뒤엔 작은 실망에도 차익 실현이 나와요.")))
        elif r20 <= -0.15 and r1 >= 0.03 and r1 - idx >= 0.02:
            out.append(dict(kind="bad_priced", sector=s["name"], name=s["name"], r1=r1, r20=r20,
                            title="많이 빠진 업종의 반등 · 나쁜 소식 선반영",
                            text=f"20일 동안 {pct(r20)} 빠진 뒤 하루 {pct(r1)} (지수보다 {(r1 - idx) * 100:+.1f}%p). 나쁜 소식이 이미 가격에 들어가 있으면 '덜 나쁜' 소식에도 크게 올라요. 반등이 이어지는지는 며칠 더 봐야 해요."))
    order = {"sell_news": 0, "miss": 1, "beat": 2, "priced_in": 3, "bad_priced": 4, "alone_down": 5, "alone_up": 6}
    out.sort(key=lambda x: (order[x["kind"]], -abs(x["r1"])))
    return out[:6]


# ---------------------------------------------------------------- 4. 묶기

SIMILAR = {  # 사슬 → 비슷한 과거 사례 (site/casebook.js의 id)
    "chip": ["deepseek-2025", "hbm-2024"], "rate": ["fed-2022", "taper-2013"], "fx": ["martial-2024", "fed-2022"],
    "oil": ["oil-2022"], "fear": ["svb-2023", "covid-2020"], "yen": ["yen-2024"], "global": ["tariff-2025", "yen-2024"],
    "local": ["martial-2024", "legoland-2022"], "event_inflation": ["cpi-2022"], "event_jobs": ["yen-2024"],
    "event_cb": ["fed-2022"], "expect_event": ["nvda-2024"], "sell_news": ["nvda-2024", "battery-2023"],
    "priced_in": ["battery-2023", "nvda-2024"], "alone_down": ["hbm-2024"], "bad_priced": ["covid-2020", "tariff-2025"],
}


def summary(b, chains, expect):
    own = b.move(INDEXES[b.market][0][0])
    name = INDEXES[b.market][0][1]
    if not own:
        return None, []
    head = f"{name} {pct(own['d1'], 2)}"
    lines = []
    for i, c in enumerate(chains[:3]):
        e = ", ".join(f"{x['t']} {x['v']}" for x in c["ends"][:3])
        word = {"확인": "그대로 이어졌어요", "엇갈림": "일부만 이어졌어요", "반대": "반대로 갔어요", "미미": "거의 안 전해졌어요"}[c["verdict"]]
        lines.append(f"{'①②③'[i]} {c['nodes'][0]['t']} {c['nodes'][0]['v'] or ''} → {e}: {word}.")
        if c.get("note"):
            lines.append(c["note"])
    if expect:
        x = expect[0]
        lines.append(f"기대와 반영: {x['name']} {pct(x['r1'])} — {x['title']}.")
    if not chains:
        title = f"{head} · 금리·환율·반도체·유가 모두 평소 크기, 업종·종목 소식이 주인공인 날"
    else:
        c = next((x for x in chains if x["verdict"] == "확인"), chains[0])
        if c["verdict"] == "확인":
            title = f"{head} · {c['title']}"
        elif c["key"] == "chip" and b.market == "kr":
            title = f"{head} · 미국 반도체 {c['nodes'][0]['v']}가 국장엔 덜 전해진 날"
        else:
            word = {"엇갈림": "일부만 이어짐", "반대": "반대로 감", "미미": "거의 안 전해짐"}.get(c["verdict"], c["verdict"])
            title = f"{head} · {c['title']} ({word})"
    return title, lines


def build_market(inputs, market, tilt=None):
    b = Board(inputs, market)
    if not b.day or not b.w:
        return None
    chains = event_chains(b)
    for f in (chip_chain, rate_chain, fx_chain, oil_chain, fear_chain, overnight_chain, yen_chain):
        c = f(b)
        if c:
            chains.append(c)
    loc = local_chain(b, chains)
    if loc:
        chains.append(loc)
    chains.sort(key=lambda c: -c["strength"])
    chains = chains[:4]
    top = next((c for c in chains if c["verdict"] == "확인"), None)
    for c in chains:
        bad = [e for e in c["ends"] if e["ok"] is False]
        if bad and not c.get("note"):
            names = ", ".join(e["t"] for e in bad)
            c["note"] = (f"{names}: 이 경로로 보면 반대로 움직였어요. "
                         + (f"같은 날 '{top['title']}' 쪽 힘이 더 셌던 것으로 보여요." if top and top is not c
                            else "다른 소식(업종·종목 이야기, 수급)이 더 셌다는 뜻이에요."))
    # 보여 줄 땐 숫자로 이어진 사슬을 먼저, 그다음 엇갈린 사슬 (엇갈린 건 '왜 안 이어졌나'가 공부거리)
    chains.sort(key=lambda c: (c["verdict"] != "확인", -c["strength"]))
    for c in chains:
        if c["kind"] in ("infl", "jobs", "cb") and c["verdict"] in ("엇갈림", "반대"):
            c["note"] = ("발표 숫자는 금리를 움직였지만 주가는 예상과 다르게 갔어요. 시장이 이 결과를 이미 어느 정도 예상해 가격에 넣어 뒀거나, "
                         + (f"같은 날 '{top['title']}' 쪽 힘이 더 셌다는 뜻이에요." if top and top is not c else "다른 힘이 더 셌다는 뜻이에요."))
    expect = expectations(b, tilt)
    title, lines = summary(b, chains, expect)
    own = b.move(INDEXES[market][0][0])
    keys = [c["key"] for c in chains] + [x["kind"] for x in expect[:2]]
    similar = []
    for k in keys:
        for s in SIMILAR.get(k, []):
            if s not in similar:
                similar.append(s)
    try:
        pro = analyst_view.view(b, chains, expect)
    except Exception as e:  # 분석가 시각이 고장 나도 사슬은 나가요
        print(f"분석가 시각 건너뜀: {e!r}")
        pro = None
    return dict(day=b.day, market=market, index=INDEXES[market][0][1], d1=own and round(own["d1"], 5),
                title=title, lines=lines, chains=chains, expect=expect, similar=similar[:3], pro=pro)


def build(inputs, policy=None):
    tilt = {mk: {r["sector"]: r["score"] for r in rows} for mk, rows in ((policy or {}).get("sectors") or {}).items()}
    return {mk: s for mk in ("kr", "us") if (s := build_market(inputs, mk, tilt.get(mk)))}


def chain_text(c):
    """텔레그램용 한 줄: A → B → C, D"""
    ok = {True: "✓", False: "✗", None: "·"}
    head = " → ".join(n["t"] + (f" {n['v']}" if n.get("v") else "") for n in c["nodes"])
    return f"{head} → " + ", ".join(f"{e['t']} {e['v']}{ok[e['ok']]}" for e in c["ends"]) + f" [{c['verdict']}]"


def append_log(paper, story):
    """사례집 '최근 사건'용: 그날 해설을 쌓아요 (같은 날은 바꿔 써요)."""
    path = pathlib.Path(paper) / "story_log.json"
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        old = {}
    for mk, s in (story or {}).items():
        rows = {r["day"]: r for r in old.get(mk) or []}
        rows[s["day"]] = dict(day=s["day"], index=s["index"], d1=s["d1"], title=s["title"], lines=s["lines"],
                              chains=[dict(key=c["key"], kind=c["kind"], title=c["title"], verdict=c["verdict"], text=chain_text(c),
                                           lesson=c["lesson"]) for c in s["chains"]],
                              expect=[dict(kind=x["kind"], name=x["name"], title=x["title"], r1=x["r1"]) for x in s["expect"][:3]],
                              similar=s["similar"], plain=(s.get("pro") or {}).get("plain"))
        old[mk] = sorted(rows.values(), key=lambda r: r["day"], reverse=True)[:KEEP_LOG]
    path.write_text(json.dumps(old, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return old


def backfill(inputs, n=60):
    """세계 지수 기록만으로 지난 n거래일 해설을 만들어요 (업종·종목 자료는 그날 것이 없어서 지수·금리·환율 사슬만)."""
    out = {}
    for mk, idx in INDEXES.items():
        own = lc.load_world(inputs.get("world") or {}, mk).get(idx[0][0])
        if not own:
            continue
        for d in own.dates[-n - 1:-1]:
            past = dict(inputs, signals={mk: {"day": d}}, flows={}, calendar=[])
            s = build_market(past, mk)
            if s:
                out.setdefault(mk, []).append(s)
    return out


def main():
    import argparse

    import report_desks

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--paper", type=pathlib.Path, default=pathlib.Path("paper"))
    parser.add_argument("--backfill", type=int, default=0, help="지난 N거래일 해설을 세계 지수 기록으로 채워요 (처음 한 번)")
    args = parser.parse_args()
    inputs = report_desks.load_inputs(args.paper)
    if args.backfill:
        for mk, rows in backfill(inputs, args.backfill).items():
            for s in rows:
                append_log(args.paper, {mk: s})
            print(f"{mk}: {len(rows)}일 채움")
        return
    for mk, s in build(inputs).items():
        print(f"{mk} {s['day']}: {s['title']}")
        for c in s["chains"]:
            print("  " + chain_text(c))


if __name__ == "__main__":
    main()
