#!/usr/bin/env python3
"""업종별 호재·악재: 종목을 한국어 업종 15개로 묶고, 업종마다 주가 흐름과 뉴스 제목의 호재·악재를 세요.

전부 무료예요 (유료 AI·유료 API 안 씀).
  - 업종: 야후 파이낸스 무료 '업종(industry)'을 한국어 업종으로 바꿔요. 야후가 삼성전자를 '가전'으로 두는 것처럼
    어긋나는 국장 대형주는 OVERRIDES로 고쳐요. 매주 fundamentals 워크플로가 paper/sectors.json에 저장해요
    (업종은 거의 안 바뀌어서 새 종목만 받아요).
  - 주가 흐름: 업종 안 종목들의 최근 5·20거래일 등락률 중간값, 지수보다 나았는지, 200일선 위 비율
  - 뉴스: 구글 뉴스 RSS(무료, 키 없음)에서 업종 검색어로 최근 7일 제목 5개를 받아
    '수혜·호조·상승·사상 최대' 같은 낱말은 호재, '우려·부진·하락·규제' 같은 낱말은 악재로 세요
뉴스 판정은 제목 낱말로 짐작한 거라 틀릴 수 있고, 과거 뉴스를 무료로 모을 방법이 없어 백테스트를 못 해요.
그래서 매매 규칙은 안 바꾸고 알림·매수 후보 의견·앱 화면에 참고로만 붙여요.

사용법:
    python sectors.py            # 업종 지도(paper/sectors.json)에 없는 종목만 야후에서 받아 채워요
    python sectors.py --refresh  # 전부 다시 받기
"""

import argparse
import datetime as dt
import json
import pathlib
import re
import time

import numpy as np
import pandas as pd

KST = dt.timezone(dt.timedelta(hours=9))
PATH = pathlib.Path("paper/sectors.json")
NEWS_N = 5

# (업종, 야후 industry 정규식, 국장 뉴스 검색어, 미장 뉴스 검색어). 위에서부터 맞춰 봐요
SECTORS = [
    ("반도체", r"Semiconductor", "반도체 업황", "semiconductor stocks"),
    ("2차전지", r"^$", "2차전지 업황", "EV battery stocks"),  # 야후 업종이 '전기장비'라 OVERRIDES로만 들어와요
    ("IT·전자", r"Consumer Electronics|Electronic Comp|Communication Equipment|Computer Hardware|Scientific & Tech"
               r"|Electronics", "전자부품 업황", "tech hardware stocks"),
    ("인터넷·게임·SW", r"Software|Internet|Information Technology Services|Electronic Gaming",
     "인터넷 게임 소프트웨어 주가", "software stocks"),
    ("자동차", r"Auto", "자동차 업황", "auto stocks"),
    ("조선·방산·기계", r"Aerospace|Defense|Machinery|Farm & Heavy|Tools|Industrial Distribution|Specialty Business",
     "조선 방산 업황", "aerospace defense industrial stocks"),
    ("전력·유틸리티", r"Utilities|Electrical Equipment|Solar", "전력기기 전력 업황", "utilities power grid stocks"),
    ("에너지·정유", r"Oil|Gas|Coal|Energy|Refining", "정유 에너지 업황", "oil energy stocks"),
    ("화학·소재", r"Chemical|Steel|Metal|Mining|Aluminum|Copper|Gold|Silver|Building Materials|Paper|Packaging"
                r"|Lumber|Agricultural Inputs", "화학 철강 업황", "materials chemicals stocks"),
    ("금융", r"Bank|Insurance|Capital Markets|Credit Services|Financial|Asset Management|Mortgage|Shell Compan",
     "은행 금융주", "bank stocks"),
    ("바이오·헬스", r"Biotech|Drug|Medical|Health|Pharma|Diagnostic", "바이오 제약 업황", "healthcare biotech stocks"),
    ("건설·부동산", r"Construction|Real Estate|REIT|Engineering|Building Products", "건설 업황", "homebuilder construction stocks"),
    ("통신·미디어", r"Telecom|Entertainment|Broadcasting|Advertising|Publishing", "통신 미디어 엔터 주가",
     "telecom media stocks"),
    ("운송", r"Airline|Trucking|Railroad|Freight|Marine|Logistics|Airport", "해운 항공 운송 업황",
     "transportation stocks"),
    ("소비재·유통", r"Retail|Apparel|Household|Foods|Beverage|Tobacco|Restaurant|Leisure|Resort|Casino|Lodging|Travel"
                 r"|Personal|Grocery|Food Distribution|Department|Footwear|Luxury|Confection|Farm Products|Discount|Home Improvement"
                 r"|Education|Furnishing", "유통 소비재 화장품 주가", "consumer stocks"),
]
OTHER = "지주·기타"

# 야후 업종이 실제와 다른 국장 종목 (코드 → 업종)
OVERRIDES = {
    "005930": "반도체", "005935": "반도체", "000660": "반도체", "042700": "반도체", "402340": "반도체",
    "373220": "2차전지", "006400": "2차전지", "051910": "2차전지", "003670": "2차전지", "096770": "2차전지",
    "066970": "2차전지", "450080": "2차전지", "020150": "2차전지", "005070": "2차전지",
    "267260": "전력·유틸리티", "010120": "전력·유틸리티", "298040": "전력·유틸리티", "001440": "전력·유틸리티",
    "009540": "조선·방산·기계", "010140": "조선·방산·기계", "042660": "조선·방산·기계", "329180": "조선·방산·기계",
    "028260": "지주·기타", "034730": "지주·기타", "003550": "지주·기타", "000880": "지주·기타", "078930": "지주·기타",
    "035420": "인터넷·게임·SW", "035720": "인터넷·게임·SW",
    "090430": "소비재·유통", "051900": "소비재·유통",
}
NAMES = [s[0] for s in SECTORS] + [OTHER]

GOOD = (r"호재|수혜|급등|상승|강세|호조|호황|개선|증가|최대|최고|신고가|회복|반등|훈풍|돌파|흑자|상향|수주|확대|성장|기대감"
        r"|surge|soar|rall|jump|beat|record|upgrade|boost|gain|rise|rising|strong|growth|bullish|upside")
BAD = (r"악재|급락|하락|약세|부진|감소|우려|둔화|적자|하향|리스크|위기|규제|관세|타격|쇼크|경고|손실|감산|불황|침체|폭락"
       r"|plunge|tumbl|slump|fall|drop|miss|downgrade|cut|weak|concern|fear|risk|tariff|loss|warn|bearish|slow")


def classify(industry, sector=None, code=None):
    """야후 업종 → 한국어 업종."""
    if code in OVERRIDES:
        return OVERRIDES[code]
    text = industry or ""
    for name, pattern, _, _ in SECTORS:
        if text and re.search(pattern, text, re.I):
            return name
    if sector == "Financial Services":
        return "금융"
    if sector == "Healthcare":
        return "바이오·헬스"
    return OTHER


def tone(title):
    """제목 하나의 호재(+1)·악재(-1)·중립(0) 짐작."""
    g, b = len(re.findall(GOOD, title, re.I)), len(re.findall(BAD, title, re.I))
    return 1 if g > b else -1 if b > g else 0


def label(good, bad):
    if not good and not bad:
        return "뚜렷한 소식 없음"
    return "호재 우세" if good > bad else "악재 우세" if bad > good else "호재·악재 엇갈림"


# ---------------------------------------------------------------- 업종 지도 (paper/sectors.json)

def load(path=PATH):
    try:
        return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"kr": {}, "us": {}}


def sector_of(smap, market, code):
    """{시장: {코드: [업종, 야후 업종]}} 에서 업종. 지도에 없어도 OVERRIDES는 써요."""
    if market == "kr" and code in OVERRIDES:
        return OVERRIDES[code]
    row = (smap.get(market) or {}).get(code)
    if not row:
        return None
    # 야후 업종이 있으면 지금 규칙으로 다시 분류해요 (규칙을 고쳐도 다시 받을 필요 없게)
    again = classify(row[1]) if row[1] else OTHER
    return again if again != OTHER else row[0]


def fetch_industry(symbol):
    import yfinance as yf

    info = yf.Ticker(symbol).info or {}
    return info.get("industry"), info.get("sector")


def update(path=PATH, refresh=False, fetch=fetch_industry, pause=0.4):
    """알림 종목 + 넓은 범위 종목의 업종을 채워요. 못 받은 종목은 다음 주에 다시 시도해요."""
    import wide
    from markets import MARKETS

    smap = {"kr": {}, "us": {}} if refresh else load(path)
    targets = {"kr": dict(MARKETS["kr"]["universe"], **wide.universe()),
               "us": dict(MARKETS["us"]["universe"], **wide.us_universe())}
    got = missed = 0
    for market, codes in targets.items():
        smap.setdefault(market, {})
        suffix = MARKETS[market]["suffix"]
        for code in codes:
            if code in smap[market]:
                continue
            try:
                industry, sector = fetch(f"{code}{suffix}")
            except Exception as e:  # 레이트리밋 등
                print(f"{code} 업종 못 받음: {e!r}")
                missed += 1
                time.sleep(pause * 5)
                continue
            smap[market][code] = [classify(industry, sector, code if market == "kr" else None), industry or ""]
            got += 1
            time.sleep(pause)
    smap["updated"] = dt.datetime.now(KST).isoformat(timespec="minutes")
    pathlib.Path(path).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(path).write_text(json.dumps(smap, ensure_ascii=False, indent=0, sort_keys=True) + "\n",
                                  encoding="utf-8")
    print(f"업종 새로 받음 {got}개, 못 받음 {missed}개 → {path}")
    return smap


# ---------------------------------------------------------------- 업종별 흐름·뉴스

def _ret(c, n):
    c = c.dropna()
    return float(c.iloc[-1] / c.iloc[-1 - n] - 1) if len(c) > n and c.iloc[-1 - n] else None


def compute(closes, index_close, names, smap, market, lang="ko", fetch_news=None, news_n=NEWS_N):
    """업종별 [{name, count, r5, r20, vs_index, above200, best, worst, codes, news, good, bad, label}], 5일 등락 순."""
    groups = {}
    for code in closes.columns:
        sec = sector_of(smap, market, code)
        if sec and closes[code].notna().sum() > 25:
            groups.setdefault(sec, []).append(code)
    idx5 = _ret(index_close, 5)
    query = {s[0]: (s[2] if lang == "ko" else s[3]) for s in SECTORS}
    out = []
    for sec, codes in groups.items():
        r5 = {c: _ret(closes[c], 5) for c in codes}
        r5 = {c: v for c, v in r5.items() if v is not None}
        if not r5:
            continue
        r20 = [v for v in (_ret(closes[c], 20) for c in codes) if v is not None]
        ma200 = closes[codes].rolling(200).mean().iloc[-1]
        last = closes[codes].iloc[-1]
        valid = ma200.notna() & last.notna()
        best, worst = max(r5, key=r5.get), min(r5, key=r5.get)
        med5 = float(np.median(list(r5.values())))
        news = []
        if fetch_news and sec in query:
            for n in fetch_news(query[sec], lang=lang, n=news_n):
                news.append(dict(n, tone=tone(n["title"])))
        good, bad = sum(n["tone"] > 0 for n in news), sum(n["tone"] < 0 for n in news)
        out.append(dict(
            name=sec, count=len(codes), r5=round(med5, 4),
            r20=round(float(np.median(r20)), 4) if r20 else None,
            vs_index=None if idx5 is None else round(med5 - idx5, 4),
            above200=round(float((last[valid] > ma200[valid]).mean()), 3) if valid.any() else None,
            best=dict(code=best, name=names.get(best, best), r5=round(r5[best], 4)),
            worst=dict(code=worst, name=names.get(worst, worst), r5=round(r5[worst], 4)),
            codes=sorted(codes, key=lambda c: -(r5.get(c) if r5.get(c) is not None else -9)),
            news=news, good=good, bad=bad, label=label(good, bad)))
    out.sort(key=lambda s: -s["r5"])
    return out


def flow(s):
    """'5일 +3.2%(코스피보다 +1.1%p), 20일 +8%' """
    text = f"5일 {s['r5']:+.1%}"
    if s.get("vs_index") is not None:
        text += f"(지수보다 {s['vs_index']:+.1%}p)"
    if s.get("r20") is not None:
        text += f", 20일 {s['r20']:+.1%}"
    return text


def pick_line(code, result, smap, market):
    """매수 후보 의견에 붙일 업종 한 줄. 모르면 None."""
    sec = sector_of(smap, market, code)
    s = next((x for x in result or [] if x["name"] == sec), None)
    if s is None:
        return None
    news = f", 뉴스 {s['label']}(호재 {s['good']}·악재 {s['bad']})" if s["news"] else ""
    return f"업종: {sec} {flow(s)}{news}"


def section(result, market_name, top=3):
    """텔레그램: 강한 업종·약한 업종과 호재·악재가 뚜렷한 업종."""
    if not result:
        return ""
    lines = ["", f"[업종별 호재·악재 · 추정] {market_name} {len(result)}개 업종, 최근 5거래일 중간값"]
    strong = result[:top]
    weak = [s for s in result[::-1][:top] if s not in strong]
    for head, rows in (("▲ 강한 업종", strong), ("▼ 약한 업종", weak)):
        lines.append(head)
        for s in rows:
            lines.append(f"· {s['name']}({s['count']}종목) {flow(s)} · {s['label']}")
            hit = next((n for n in s["news"] if n["tone"]), None)
            if hit:
                lines.append(f"   {'호재' if hit['tone'] > 0 else '악재'}: {hit['title']}")
    loud = [s for s in result if s not in strong + weak and s["good"] + s["bad"] >= 2 and s["good"] != s["bad"]]
    if loud:
        lines.append("· 그 밖에 뉴스가 뚜렷한 업종: " + ", ".join(f"{s['name']} {s['label']}" for s in loud[:4]))
    lines.append("호재·악재는 뉴스 제목 낱말로 짐작한 거예요. 매매 규칙은 그대로고 참고로만 보세요.")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--refresh", action="store_true", help="이미 있는 종목도 다시 받기")
    parser.add_argument("--path", type=pathlib.Path, default=PATH)
    args = parser.parse_args()
    update(args.path, refresh=args.refresh)


if __name__ == "__main__":
    main()
