#!/usr/bin/env python3
"""큰 발표 알림: 미국 물가(CPI)·고용·금리 결정(FOMC)처럼 지수를 크게 흔드는 발표를 미리, 그리고 결과까지 알려 줘요.
일정에 없던 큰 사건으로 지수가 갑자기 출렁여도 바로 알려 줘요.

전부 무료예요 (키 필요 없음).
  - 이번 주 큰 발표 일정·예상치·이전 값: 포렉스팩토리 무료 일정 파일 (nfs.faireconomy.media, 영향 '높음'만)
    한 주(일~토) 치만 줘서, 다음 주 일정은 일요일 오후(한국시간)부터 들어와요.
  - 발표 뒤 실제 값: FRED (미국 연준 무료 자료) CSV. FRED에 없는 발표(ISM, 의장 연설 등)는 뉴스 제목으로 대신해요.
  - 지수 반응·급변: 야후 5분봉 (S&P500 선물·나스닥 선물·코스피)
  - 뉴스 제목: 구글 뉴스 RSS
텔레그램 봇 워크플로(15분마다)가 run()을 불러요. 기록은 paper/events.json (앱 홈 '큰 발표' 칸, 다가오는 일정).
  - [큰 발표 예고]: 발표 30시간 전쯤 한 번 (밤 11시~아침 7시엔 소리 없이)
  - [곧 발표]: CPI·고용·FOMC는 1시간 전쯤 한 번 더
  - [발표 결과]: 발표 10분 뒤부터 실제 값이 나오면 예상치와 비교 + 미국 선물 반응 (3시간 넘게 못 찾으면 뉴스만)
  - [지수 급변]: 1시간 새 S&P500·나스닥 선물 1% 넘게, 코스피 1.5% 넘게 움직이면 (같은 지수·방향은 3시간에 한 번)
참고용이에요. 매매 규칙은 안 바꿔요.

사용법:
    python big_events.py --dry-run     # 지금 받아서 보낼 글만 출력 (기록·텔레그램 안 함)
"""

import argparse
import datetime as dt
import io
import json
import pathlib
import re

KST = dt.timezone(dt.timedelta(hours=9))
PATH = pathlib.Path("paper/events.json")
FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36"}
PRE_HOURS = 30       # 이만큼 앞이면 예고
SOON_MIN = 70        # 1급 발표는 이만큼 앞에서 한 번 더
POST_MIN = 10        # 발표 뒤 이만큼 지나야 결과를 찾아요
GIVE_UP_HOURS = 3    # 이만큼 지나도 실제 값이 없으면 뉴스만으로 결과를 보내요
QUIET = (23, 7)      # 이 시간(한국)엔 소리 없이
KEEP_DAYS = 21       # 지난 발표는 이만큼 남겨요
SHOCK_KEEP_DAYS = 7
SHOCK_GAP_HOURS = 3
# 다른 나라는 금리 결정만 (영향 '높음' 중에서)
OTHER_RATE = re.compile(r"(Policy Rate|Main Refinancing Rate|Official Bank Rate|Cash Rate|Overnight Rate|Loan Prime Rate)", re.I)
COUNTRY = {"USD": ("us", "🇺🇸"), "CNY": ("cn", "🇨🇳"), "JPY": ("jp", "🇯🇵"), "EUR": ("eu", "🇪🇺"), "GBP": ("gb", "🇬🇧"),
           "AUD": ("au", "🇦🇺"), "CAD": ("ca", "🇨🇦"), "CHF": ("ch", "🇨🇭"), "NZD": ("nz", "🇳🇿")}

# 영어 이름(앞부분이 맞으면) → 한국어 이름, 묶음, 1급(1시간 전 한 번 더) 여부. 위에서부터 먼저 맞는 걸 써요
NAMES = [
    ("Core CPI m/m", "근원 소비자물가(CPI) 전월 대비", "inflation", True),
    ("Core CPI y/y", "근원 소비자물가(CPI) 1년", "inflation", True),
    ("CPI m/m", "소비자물가(CPI) 전월 대비", "inflation", True),
    ("CPI y/y", "소비자물가(CPI) 1년", "inflation", True),
    ("Core PCE Price Index m/m", "근원 PCE 물가 전월 대비", "inflation", False),
    ("Core PCE Price Index y/y", "근원 PCE 물가 1년", "inflation", False),
    ("Core PPI m/m", "근원 생산자물가(PPI) 전월 대비", "inflation", False),
    ("PPI m/m", "생산자물가(PPI) 전월 대비", "inflation", False),
    ("Non-Farm Employment Change", "비농업 일자리 수(고용 지표)", "jobs", True),
    ("Unemployment Rate", "실업률", "jobs", True),
    ("Average Hourly Earnings m/m", "시간당 임금 전월 대비", "jobs", False),
    ("Unemployment Claims", "주간 실업수당 청구", "jobs", False),
    ("JOLTS Job Openings", "구인 건수(JOLTS)", "jobs", False),
    ("ADP Non-Farm Employment Change", "ADP 민간 고용", "jobs", False),
    ("Federal Funds Rate", "미국 기준금리 결정(FOMC)", "rate", True),
    ("FOMC Statement", "FOMC 성명", "rate", True),
    ("FOMC Press Conference", "연준 의장 기자회견", "rate", True),
    ("FOMC Meeting Minutes", "FOMC 회의록", "rate", False),
    ("Fed Chair", "연준 의장 연설", "rate", False),
    ("Advance GDP q/q", "GDP 속보치(분기, 연율)", "growth", False),
    ("Prelim GDP q/q", "GDP 잠정치(분기, 연율)", "growth", False),
    ("Final GDP q/q", "GDP 확정치(분기, 연율)", "growth", False),
    ("Core Retail Sales m/m", "근원 소매판매 전월 대비", "growth", False),
    ("Retail Sales m/m", "소매판매 전월 대비", "growth", False),
    ("ISM Manufacturing PMI", "ISM 제조업 지수", "growth", False),
    ("ISM Services PMI", "ISM 서비스업 지수", "growth", False),
    ("CB Consumer Confidence", "소비자신뢰지수", "growth", False),
    ("Prelim UoM Consumer Sentiment", "미시간대 소비심리", "growth", False),
    ("BOJ Policy Rate", "일본 기준금리 결정", "rate", False),
    ("Main Refinancing Rate", "유럽 기준금리 결정", "rate", False),
    ("Official Bank Rate", "영국 기준금리 결정", "rate", False),
]
# 높게 나오면 보통 주가에 어떤가 (참고용 한 줄)
MEANING = {
    "inflation": "물가가 예상보다 높으면 금리 인상 걱정으로 주가엔 보통 부담, 낮으면 보통 호재예요.",
    "jobs": "고용이 너무 세면 금리 걱정, 너무 약하면 경기 걱정이라 예상과 크게 다를 때 출렁여요.",
    "rate": "금리를 예상보다 올리면 주가엔 보통 부담, 내리면 보통 호재예요. 의장 발언으로 방향이 바뀌기도 해요.",
    "growth": "예상보다 좋으면 경기 기대로 호재, 너무 좋으면 금리 걱정이 붙기도 해요.",
}
# 실제 값 찾기: 발표 이름 → (FRED 시리즈, 계산법, 단위). m: 전월 대비 %, y: 1년 %, d: 전월 대비 증감(천 명), l: 그대로
FRED_OF = {
    "Core CPI m/m": ("CPILFESL", "m", "%"), "Core CPI y/y": ("CPILFENS", "y", "%"),
    "CPI m/m": ("CPIAUCSL", "m", "%"), "CPI y/y": ("CPIAUCNS", "y", "%"),
    "Core PCE Price Index m/m": ("PCEPILFE", "m", "%"), "Core PCE Price Index y/y": ("PCEPILFE", "y", "%"),
    "PPI m/m": ("PPIFIS", "m", "%"),
    "Non-Farm Employment Change": ("PAYEMS", "d", "K"), "Unemployment Rate": ("UNRATE", "l", "%"),
    "Average Hourly Earnings m/m": ("CES0500000003", "m", "%"),
    "Unemployment Claims": ("ICSA", "k", "K"),
    "Federal Funds Rate": ("DFEDTARU", "l2", "%"),
    "Advance GDP q/q": ("A191RL1Q225SBEA", "l", "%"), "Prelim GDP q/q": ("A191RL1Q225SBEA", "l", "%"),
    "Final GDP q/q": ("A191RL1Q225SBEA", "l", "%"),
    "Retail Sales m/m": ("RSAFS", "m", "%"),
}
SHOCK = [("ES=F", "S&P500 선물", 0.010), ("NQ=F", "나스닥 선물", 0.010), ("^KS11", "코스피", 0.015)]
REACT = [("ES=F", "S&P500 선물"), ("NQ=F", "나스닥 선물")]


# ---------------------------------------------------------------- 일정

def name_of(title):
    for key, ko, group, tier1 in NAMES:
        if title.startswith(key) or (key == "Fed Chair" and "Fed Chair" in title):
            return ko, group, tier1
    return title, "other", False


def parse_ff(rows):
    """포렉스팩토리 일정 → 큰 발표 목록. 미국은 영향 '높음' 전부, 다른 나라는 금리 결정만."""
    out = []
    for r in rows or []:
        if r.get("impact") != "High" or r.get("country") not in COUNTRY:
            continue
        title = (r.get("title") or "").strip()
        if r["country"] != "USD" and not OTHER_RATE.search(title):
            continue
        try:
            at = dt.datetime.fromisoformat(r["date"]).astimezone(KST)
        except (KeyError, ValueError):
            continue
        ko, group, tier1 = name_of(title)
        code, flag = COUNTRY[r["country"]]
        out.append(dict(id=f"{r['country']}|{title}|{at:%Y-%m-%dT%H:%M}", at=at.isoformat(timespec="minutes"),
                        date=f"{at:%Y-%m-%d}", country=code, flag=flag, title=title, ko=ko, group=group, tier1=tier1,
                        forecast=(r.get("forecast") or "").strip(), previous=(r.get("previous") or "").strip()))
    return out


def fetch_ff():
    import requests

    r = requests.get(FF_URL, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.json()


def merge(old, new, now):
    """새로 받은 일정과 지난 기록을 합쳐요. 보낸 표시(pre·soon·post)와 실제 값은 그대로 두고, 예상치·이전 값만 새 걸로.
    이번 주 파일에서 사라진 미래 일정(시간이 바뀐 것)은 지워요."""
    by = {e["id"]: e for e in old or []}
    new_ids = {e["id"] for e in new}
    # 이번 주(일~토, 미국 동부 기준) 범위. 이 안의 미래 일정이 새 파일에 없으면 시간이 바뀐 거예요
    first = min((dt.date.fromisoformat(e["date"]) for e in new), default=None)
    sunday = first - dt.timedelta(days=(first.weekday() + 1) % 7) if first else None
    week = (f"{sunday:%Y-%m-%d}", f"{sunday + dt.timedelta(days=7):%Y-%m-%d}") if sunday else None
    out = []
    for e in new:
        keep = by.get(e["id"], {})
        out.append({**keep, **e, **{k: keep[k] for k in ("pre", "soon", "post", "actual", "base", "news", "react") if k in keep}})
    cutoff = (now - dt.timedelta(days=KEEP_DAYS)).isoformat()
    for e in old or []:
        if e["id"] in new_ids or e["at"] < cutoff:
            continue
        moved = week and week[0] <= e["date"] <= week[1] and dt.datetime.fromisoformat(e["at"]) > now and not e.get("post")
        if not moved:
            out.append(e)
    return sorted(out, key=lambda e: (e["at"], not e.get("tier1"), e["id"]))


# ---------------------------------------------------------------- 실제 값 (FRED)

def fred(series, timeout=20):
    """FRED 무료 CSV → pandas Series (실패하면 None)."""
    import pandas as pd
    import requests

    try:
        # 브라우저 흉내(User-Agent)를 내면 FRED가 막아요. 그냥 받아요
        r = requests.get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}", timeout=timeout)
        r.raise_for_status()
        s = pd.read_csv(io.StringIO(r.text), index_col=0, parse_dates=True).iloc[:, 0]
        return pd.to_numeric(s, errors="coerce").dropna()
    except Exception as e:
        print(f"FRED {series} 못 받음: {e!r}")
        return None


def calc(s, how):
    """FRED 시리즈 → (마지막 관측일 'YYYY-MM-DD', 값). 빠진 달(예: 2025-10 정부 셧다운)이 있어서
    '한 칸 전'이 아니라 날짜로 한 달 전·1년 전을 찾아요. 그 날짜 값이 없으면 None."""
    import pandas as pd

    if s is None or len(s) < 2:
        return None
    t, v = s.index[-1], float(s.iloc[-1])
    last = f"{t:%Y-%m-%d}"

    def at(offset):
        x = s.get(t - offset)
        return None if x is None or pd.isna(x) else float(x)

    if how in ("m", "d"):
        prev = at(pd.DateOffset(months=1))
        if prev is None:
            return None
        return last, ((v / prev - 1) * 100 if how == "m" else v - prev)
    if how == "y":
        prev = at(pd.DateOffset(years=1))
        return None if prev is None else (last, (v / prev - 1) * 100)
    if how == "k":
        return last, v / 1000
    return last, v


def fmt_value(v, unit, how):
    if unit == "K":
        return f"{v:,.0f}K"
    return f"{v:.2f}%" if how == "l2" else f"{v:.1f}%"


def number(text):
    """'0.3%' '150K' '-1.2M' '4.25%' → 숫자 (K 단위로). 못 읽으면 None."""
    m = re.match(r"^\s*([-+]?\d+(?:\.\d+)?)\s*([KMB%]?)", text or "")
    if not m:
        return None
    x = float(m.group(1))
    return x * 1000 if m.group(2) == "M" else x


def surprise(actual, forecast):
    """실제 vs 예상 → '예상보다 높음'/'예상보다 낮음'/'예상과 같음' (예상이 없으면 None)."""
    a, f = number(actual), number(forecast)
    if a is None or f is None:
        return None
    step = 10 ** -(len(forecast.split(".")[1].rstrip("%KMB")) if "." in forecast else 0)
    if abs(a - f) < step / 2 + 1e-9:
        return "예상과 같음"
    return "예상보다 높음" if a > f else "예상보다 낮음"


def find_actual(e, get=fred, cache=None):
    """FRED에서 이번 발표 값을 찾아요. 발표 전에 본 마지막 관측일(base)보다 새 관측이 있어야 '이번 값'으로 쳐요."""
    spec = FRED_OF.get(e["title"])
    if not spec:
        return None
    series, how, unit = spec
    cache = {} if cache is None else cache
    if series not in cache:
        cache[series] = get(series)
    got = calc(cache[series], "l" if how == "l2" else how)
    if not got:
        return None
    last, v = got
    base = e.get("base")
    if base:
        if last <= base:
            return None
    else:  # 발표 전 기록이 없으면: 관측일이 발표일 기준 너무 옛날이면 안 써요
        release = dt.date.fromisoformat(e["date"])
        limit = 10 if how in ("k", "l2") else 75 if series != "A191RL1Q225SBEA" else 130
        if (release - dt.date.fromisoformat(last)).days > limit:
            return None
    return fmt_value(v, unit, how)


def remember_base(e, get=fred, cache=None):
    """발표 전에 FRED 마지막 관측일을 적어 둬요 (발표 뒤 새 값인지 가리는 데 써요)."""
    spec = FRED_OF.get(e["title"])
    if not spec or e.get("base"):
        return
    cache = {} if cache is None else cache
    if spec[0] not in cache:
        cache[spec[0]] = get(spec[0])
    s = cache[spec[0]]
    if s is not None and len(s):
        e["base"] = f"{s.index[-1]:%Y-%m-%d}"


# ---------------------------------------------------------------- 지수 반응·급변 (야후)

def intraday(symbol):
    import yfinance as yf

    return yf.Ticker(symbol).history(period="5d", interval="5m", auto_adjust=False)


def move_since(bars, at):
    """at 바로 전 5분봉 종가 → 마지막 종가 변화율. 못 구하면 None."""
    import pandas as pd

    if bars is None or not len(bars):
        return None
    t = pd.Timestamp(at)
    before = bars[bars.index < t]
    if not len(before) or bars.index[-1] <= t:
        return None
    return float(bars["Close"].iloc[-1] / before["Close"].iloc[-1] - 1)


def reaction(at, bars_of):
    out = []
    for sym, label in REACT:
        m = move_since(bars_of(sym), at)
        if m is not None:
            out.append(f"{label} {m:+.1%}")
    return out


def shocks(bars_of, now, old, window=60):
    """1시간 새 크게 움직인 지수 → 새 급변 기록 목록 (같은 지수·방향은 3시간에 한 번)."""
    import pandas as pd

    out = []
    for sym, label, limit in SHOCK:
        bars = bars_of(sym)
        if bars is None or len(bars) < 3:
            continue
        last_t = bars.index[-1]
        last_t = last_t.tz_convert(KST) if last_t.tzinfo else last_t.tz_localize(KST)
        if now - last_t > dt.timedelta(minutes=40):  # 장이 닫혀 있으면 안 봐요
            continue
        past = bars[bars.index <= bars.index[-1] - pd.Timedelta(minutes=window)]
        if not len(past):
            continue
        m = float(bars["Close"].iloc[-1] / past["Close"].iloc[-1] - 1)
        if abs(m) < limit:
            continue
        way = "up" if m > 0 else "down"
        recent = [s for s in old if s["symbol"] == sym and s["way"] == way
                  and now - dt.datetime.fromisoformat(s["at"]) < dt.timedelta(hours=SHOCK_GAP_HOURS)]
        if recent:
            continue
        out.append(dict(at=now.isoformat(timespec="minutes"), symbol=sym, label=label, way=way, move=round(m, 4)))
    return out


# ---------------------------------------------------------------- 글

DAYS = "월화수목금토일"


def when(e):
    at = dt.datetime.fromisoformat(e["at"])
    return f"{at:%m.%d}({DAYS[at.weekday()]}) {at:%H:%M}"


def line_of(e, result=False):
    bits = []
    if result and e.get("actual"):
        bits.append(f"실제 {e['actual']}")
    if e.get("forecast"):
        bits.append(f"예상 {e['forecast']}")
    if e.get("previous"):
        bits.append(f"이전 {e['previous']}")
    s = f"- {e['flag']} {e['ko']}" + (f" · {' · '.join(bits)}" if bits else "")
    if result and e.get("actual"):
        word = surprise(e["actual"], e.get("forecast"))
        if word:
            s += f" → {word}"
    return s


def groups_of(events):
    """같은 시각 발표끼리 묶어요."""
    out = {}
    for e in events:
        out.setdefault(e["at"], []).append(e)
    return [out[k] for k in sorted(out)]


def pre_text(events, soon=False):
    head = "[곧 발표] 1시간쯤 뒤 · 참고용" if soon else "[큰 발표 예고] 지수가 크게 움직일 수 있어요 · 참고용"
    lines = [head]
    for g in groups_of(events):
        lines.append(f"🕘 {when(g[0])} (한국시간)")
        lines += [line_of(e) for e in g]
    groups = {e["group"] for e in events if e["group"] in MEANING}
    lines += [f"💡 {MEANING[k]}" for k in ("inflation", "jobs", "rate", "growth") if k in groups]
    lines.append("결과가 나오면 예상치와 비교해서 다시 알려 드려요.")
    return "\n".join(lines)


def post_text(group):
    e0 = group[0]
    lines = [f"[발표 결과] {when(e0)} (한국시간) · 참고용"]
    lines += [line_of(e, result=True) for e in group]
    if not any(e.get("actual") for e in group):
        lines.append("실제 값은 무료 자료에 아직 없어서 뉴스 제목으로 대신해요.")
    react = next((e["react"] for e in group if e.get("react")), None)
    if react:
        lines.append("📈 발표 뒤 반응: " + " · ".join(react))
    news = next((e["news"] for e in group if e.get("news")), [])
    lines += [f"📰 {n['title']} ({n['source']})" for n in news[:2]]
    k = next((e["group"] for e in group if e["group"] in MEANING), None)
    if k:
        lines.append(f"💡 {MEANING[k]}")
    lines.append("매매 규칙은 그대로예요.")
    return "\n".join(lines)


def shock_text(items, news):
    arrow = {"up": "급등", "down": "급락"}
    lines = ["[지수 급변] 1시간 새 크게 움직였어요 · 참고용"]
    lines += [f"- {s['label']} {s['move']:+.1%} ({arrow[s['way']]})" for s in items]
    lines += [f"📰 {n['title']} ({n['source']})" for n in news[:3]]
    lines.append("일정에 없던 소식일 수 있어요. 매매 규칙은 그대로예요.")
    return "\n".join(lines)


# ---------------------------------------------------------------- 실행

def quiet(now):
    return now.hour >= QUIET[0] or now.hour < QUIET[1]


def load(path=PATH):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def news_for(e, fetch):
    q = {"rate": "Fed rate decision", "inflation": f"US {e['title'].split(' m/m')[0].split(' y/y')[0]} inflation",
         "jobs": "US jobs report"}.get(e["group"], f"US {e['title']}") if e["country"] == "us" else e["title"]
    return fetch(q, lang="en", days=1, n=2)


def step(data, now, ff=None, get=fred, bars_of=intraday, news=None):
    """한 번 돌기 → (보낼 글 목록 [(글, 소리 없이?)], 바뀐 data). 텔레그램 없이도 시험할 수 있게 나눴어요."""
    if news is None:
        import movers
        news = movers.google_news
    events = data.get("events") or []
    if ff is not None:
        events = merge(events, parse_ff(ff), now)
    cache, out = {}, []
    future = [e for e in events if dt.datetime.fromisoformat(e["at"]) > now]
    pre = [e for e in future if not e.get("pre") and dt.datetime.fromisoformat(e["at"]) - now <= dt.timedelta(hours=PRE_HOURS)]
    if pre and not quiet(now):
        out.append((pre_text(pre), False))
        for e in pre:
            e["pre"] = now.isoformat(timespec="minutes")
    soon = [e for e in future if e.get("tier1") and not e.get("soon")
            and dt.datetime.fromisoformat(e["at"]) - now <= dt.timedelta(minutes=SOON_MIN)]
    if soon:
        out.append((pre_text(soon, soon=True), quiet(now)))
        for e in soon:
            e["soon"] = now.isoformat(timespec="minutes")
    for e in future:
        if dt.datetime.fromisoformat(e["at"]) - now <= dt.timedelta(hours=PRE_HOURS):
            remember_base(e, get, cache)
    due = [e for e in events if not e.get("post") and dt.timedelta(minutes=POST_MIN) <= now - dt.datetime.fromisoformat(e["at"])]
    bars_cache = {}

    def bars(sym):
        if sym not in bars_cache:
            try:
                bars_cache[sym] = bars_of(sym)
            except Exception as ex:  # 야후가 막히면 반응 없이
                print(f"{sym} 5분봉 못 받음: {ex!r}")
                bars_cache[sym] = None
        return bars_cache[sym]

    for g in groups_of(due):
        late = now - dt.datetime.fromisoformat(g[0]["at"])
        if late > dt.timedelta(days=1):  # 너무 지난 건 조용히 끝 표시만
            for e in g:
                e["post"] = "skip"
            continue
        for e in g:
            e["actual"] = e.get("actual") or find_actual(e, get, cache)
        wants = [e for e in g if e["title"] in FRED_OF]
        if any(not e.get("actual") for e in wants) and late < dt.timedelta(hours=GIVE_UP_HOURS):
            continue  # 실제 값을 좀 더 기다려요
        g[0]["react"] = reaction(dt.datetime.fromisoformat(g[0]["at"]), bars)
        g[0]["news"] = news_for(g[0], news)
        out.append((post_text(g), quiet(now)))
        for e in g:
            e["post"] = now.isoformat(timespec="minutes")
    old_shocks = [s for s in data.get("shocks") or [] if now - dt.datetime.fromisoformat(s["at"]) < dt.timedelta(days=SHOCK_KEEP_DAYS)]
    new_shocks = shocks(bars, now, old_shocks)
    if new_shocks:
        heads = news("stock market", lang="en", days=1, n=2) + news("증시 급락" if new_shocks[0]["way"] == "down" else "증시 급등", lang="ko", days=1, n=1)
        for s in new_shocks:
            s["news"] = heads
        out.append((shock_text(new_shocks, heads), False))
    data = dict(data, events=events, shocks=old_shocks + new_shocks)
    return out, data


def run(paper=pathlib.Path("paper"), send=None, now=None, dry_run=False):
    """봇 워크플로에서 불러요. 반환: 기록이 바뀌었나 (True면 저장·앱 다시 올리기)."""
    path = paper / "events.json"
    data = load(path)
    now = now or dt.datetime.now(KST)
    try:
        ff = fetch_ff()
    except Exception as e:  # 못 받으면 지난번 일정으로
        print(f"큰 발표 일정을 못 받았어요 (지난번 일정을 써요): {e!r}")
        ff = None
    before = json.dumps({k: data.get(k) for k in ("events", "shocks")}, ensure_ascii=False, sort_keys=True)
    messages, data = step(data, now, ff)
    for text, silent in messages:
        print(text + "\n")
        if send and not dry_run:
            send(text, silent)
    after = json.dumps({k: data.get(k) for k in ("events", "shocks")}, ensure_ascii=False, sort_keys=True)
    if dry_run or before == after:
        return False
    data["updated"] = now.isoformat(timespec="minutes")
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return True


def calendar_events(paper, start, end):
    """econ_calendar용: 기간 안의 큰 발표 (같은 시각은 하나로)."""
    out = []
    # FOMC는 econ_calendar가 연준 일정표로 이미 넣어요 (몇 달 치)
    fomc = ("Federal Funds Rate", "FOMC Statement", "FOMC Press Conference")
    rows = [e for e in load(paper / "events.json").get("events") or []
            if start <= e["date"] <= end and not (e["country"] == "us" and e["title"] in fomc)]
    for g in groups_of(rows):
        tier = [e for e in g if e.get("tier1")] or g
        names = " · ".join(dict.fromkeys(e["ko"] for e in tier[:3]))
        at = dt.datetime.fromisoformat(g[0]["at"])
        out.append(dict(date=g[0]["date"], market=g[0]["country"] if g[0]["country"] == "us" else "world", kind="big",
                        title=names, big=any(e.get("tier1") for e in g), note=f"한국시간 {at:%H:%M} 발표"))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--paper", type=pathlib.Path, default=pathlib.Path("paper"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    run(args.paper, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
