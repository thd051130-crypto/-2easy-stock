"""많이 오른·내린 종목과 '왜 움직였는지' 추정 이유 (무료 규칙 + 무료 뉴스 제목).

알림 종목에 넓은 범위 종목(국장 코스피 상위 200, 미장 시가총액 상위 150)까지 합쳐서 최근 5거래일 수익률 순으로 골라요.
이유는 아래 규칙으로 계산한 '추정'이에요. 유료 API는 쓰지 않아요.
  - 시장 영향: 같은 기간 지수 수익률과 비교 (시장이 다 올랐는지, 이 종목만 올랐는지)
  - 업종·테마 동반: 최근 120일 동안 같이 움직인 종목 3개(일간 수익률 상관이 높은 순)도 같이 올랐는지
  - 거래량: 최근 5일 중 가장 많은 날이 그 전 20일 평균의 몇 배인지 (큰돈이 들어왔는지)
  - 급등한 날, 52주 신고가
  - 뉴스 제목: 구글 뉴스 RSS(무료, 키 없음)에서 최근 7일 제목 2개. 제목 낱말로 실적·수주·신제품·증권가·유가·정책 등을 표시
뉴스는 자동 수집이라 틀릴 수 있어요. 매매 판단 전에 기사 원문을 확인하세요.
"""

import datetime as dt
import email.utils
import re
import urllib.parse
import xml.etree.ElementTree as ET

import numpy as np
import pandas as pd

TOP = 5            # 오른 종목 몇 개
FALL = 3           # 내린 종목 몇 개
MIN_MOVE = 0.03    # 5일 ±3% 넘게 움직인 종목만
NEWS_DAYS = 7
PEERS = 3

# 제목 낱말 → 이유 분류 (앞에 있는 것부터 봐요)
TOPICS = [
    ("실적", r"실적|영업이익|매출|어닝|흑자|적자|분기|earnings|revenue|profit|guidance|quarter"),
    ("수주·계약", r"수주|계약|공급|납품|deal|contract|order|partnership|agreement"),
    ("신제품·출시", r"출시|신작|신제품|공개|launch|unveil|release|debut"),
    ("증권가 전망", r"목표주가|목표가|상향|하향|매수 의견|투자의견|upgrade|downgrade|price target|rating"),
    ("유가·원자재", r"유가|원유|정제마진|원자재|구리|금값|oil|crude|brent|commodity"),
    ("AI·반도체", r"AI|인공지능|반도체|HBM|데이터센터|칩|semiconductor|chip|data center"),
    ("2차전지", r"2차전지|이차전지|배터리|전고체|ESS|battery|EV "),
    ("바이오·신약", r"임상|신약|FDA|허가|바이오|clinical|trial|approval|drug"),
    ("정책·규제", r"정부|정책|규제|관세|금리|법안|tariff|regulat|policy|fed|rate cut"),
    ("인수·합병", r"인수|합병|M&A|지분|분할|acquire|acquisition|merger|stake|spin"),
    ("주주환원", r"배당|자사주|소각|주주환원|dividend|buyback|repurchase"),
    ("지정학", r"전쟁|중동|이란|이스라엘|러시아|우크라이나|북한|war|iran|israel|missile"),
]


def _ret(close, n):
    c = close.dropna()
    return float(c.iloc[-1] / c.iloc[-1 - n] - 1) if len(c) > n and c.iloc[-1 - n] else None


def peers(closes, code, n=PEERS, days=120, skip=5):
    """최근 days일 일간 수익률 상관이 가장 높은 종목 n개 (같은 업종·테마일 가능성이 커요).
    이번에 같이 튄 것만으로 짝이 되지 않게 최근 skip일은 빼고 봐요."""
    rets = closes.pct_change(fill_method=None).iloc[-days - skip:-skip]
    if code not in rets or rets[code].count() < days // 2:
        return []
    corr = rets.corrwith(rets[code]).drop(code, errors="ignore").dropna()
    corr = corr[corr >= 0.3]
    return list(corr.sort_values(ascending=False).index[:n])


def volume_ratio(volume, days=5, base=20):
    """최근 days일 중 가장 많은 거래량 ÷ 그 전 base일 평균. 모르면 None."""
    if volume is None:
        return None
    v = volume.dropna()
    if len(v) < days + base:
        return None
    avg = v.iloc[-days - base:-days].mean()
    return float(v.iloc[-days:].max() / avg) if avg > 0 else None


def topics(titles):
    found = []
    for label, pattern in TOPICS:
        if any(re.search(pattern, t, re.I) for t in titles) and label not in found:
            found.append(label)
    return found


def google_news(query, lang="ko", days=NEWS_DAYS, n=2, timeout=10, today=None):
    """구글 뉴스 RSS 제목 [{title, source, date, link}]. 못 받으면 []."""
    import requests

    hl, gl = ("ko", "KR") if lang == "ko" else ("en-US", "US")
    url = (f"https://news.google.com/rss/search?q={urllib.parse.quote(query + f' when:{days}d')}"
           f"&hl={hl}&gl={gl}&ceid={gl}:{hl.split('-')[0]}")
    try:
        r = requests.get(url, timeout=timeout, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        return parse_rss(r.text, n=n)
    except Exception as e:
        print(f"뉴스 제목을 못 받았어요 ({query}): {e!r}")
        return []


def parse_rss(text, n=2):
    out = []
    for item in ET.fromstring(text).iter("item"):
        title = (item.findtext("title") or "").strip()
        source = (item.findtext("source") or "").strip()
        if source and title.endswith(" - " + source):
            title = title[: -len(source) - 3]
        try:
            day = email.utils.parsedate_to_datetime(item.findtext("pubDate")).date().isoformat()
        except (TypeError, ValueError):
            day = None
        out.append(dict(title=title, source=source, date=day, link=(item.findtext("link") or "").strip()))
        if len(out) >= n:
            break
    return out


def explain(code, closes, index_close, volumes=None, names=None, index_name="지수", news=None, days=5):
    """한 종목의 움직임과 이유 줄들. news는 google_news 결과(없으면 빈 목록)."""
    names = names or {}
    close = closes[code].dropna()
    r = _ret(close, days)
    idx = _ret(index_close, days)
    up = r >= 0
    word = "올랐" if up else "내렸"
    reasons = []
    main = solo = None

    titles = [x["title"] for x in news or []]
    tags = topics(titles)
    if tags:
        main = f"뉴스: {'·'.join(tags[:2])}"
        reasons.append(f"최근 뉴스 제목에 {'·'.join(tags[:3])} 이야기가 나와요")

    pc = peers(closes, code)
    if pc:
        prets = [x for x in (_ret(closes[p], days) for p in pc) if x is not None]
        avg = float(np.mean(prets)) if prets else None
        pnames = "·".join(names.get(p, p) for p in pc)
        if avg is not None and (avg >= 0.03 if up else avg <= -0.03) and abs(avg) >= abs(r) * 0.4:
            reasons.append(f"같이 움직이던 {pnames}도 평균 {avg:+.1%} {word}어요 → 업종·테마 흐름")
            main = main or "업종·테마 동반"
        elif avg is not None:
            reasons.append(f"같이 움직이던 {pnames}는 평균 {avg:+.1%}라 이 종목만의 소식일 가능성이 커요")

    if idx is not None:
        if (idx > 0) == up and abs(idx) >= abs(r) * 0.6:
            reasons.append(f"{index_name}도 {idx:+.1%}라 시장 전체 영향이 커요")
            main = main or "시장 전체"
        else:
            reasons.append(f"{index_name} {idx:+.1%}보다 {r - idx:+.1%}p 더 {'움직였' if up else '빠졌'}어요")
            solo = "이 종목만의 움직임"

    vr = volume_ratio(volumes[code]) if volumes is not None and code in volumes else None
    if vr is not None:
        if vr >= 2:
            reasons.append(f"거래량이 평소의 {vr:.1f}배로 늘어 큰 {'매수세' if up else '매도세'}가 들어왔어요")
            main = main or ("큰 매수세" if up else "큰 매도세")
        elif vr < 1.2:
            reasons.append("거래량은 평소 수준이라 힘은 약할 수 있어요")

    d1 = close.pct_change(fill_method=None).iloc[-days:]
    big = d1.idxmax() if up else d1.idxmin()
    if pd.notna(big) and abs(d1[big]) >= 0.05:
        reasons.append(f"{big:%m-%d} 하루에 {d1[big]:+.1%} (소식이 나온 날일 가능성)")
    if up and len(close) >= 250 and close.iloc[-1] >= close.iloc[-250:].max():
        reasons.append("52주 신고가예요")

    return dict(code=code, name=names.get(code, code), close=round(float(close.iloc[-1]), 2), r5=round(r, 4),
                r1=round(float(d1.iloc[-1]), 4), r20=None if _ret(close, 20) is None else round(_ret(close, 20), 4),
                main=main or solo or "뚜렷한 이유 못 찾음", reasons=reasons, news=news or [])


def rank(closes, days=5, top=TOP, fall=FALL, min_move=MIN_MOVE):
    """(많이 오른 종목 코드, 많이 내린 종목 코드)"""
    r = closes.apply(lambda c: _ret(c, days)).dropna()
    r = r[closes.iloc[-1].reindex(r.index).notna()]  # 오늘 시세가 없는 종목은 빼요
    ups = r[r >= min_move].sort_values(ascending=False).index[:top]
    downs = r[r <= -min_move].sort_values().index[:fall]
    return list(ups), list(downs)


def compute(closes, index_close, volumes=None, names=None, index_name="지수", lang="ko", fetch_news=google_news):
    """대시보드·알림용 {'up': [...], 'down': [...], 'count': 본 종목 수}."""
    names = names or {}
    ups, downs = rank(closes)
    out = dict(count=int(closes.iloc[-1].notna().sum()), days=5)
    for key, codes in (("up", ups), ("down", downs)):
        rows = []
        for code in codes:
            name = names.get(code, code)
            news = fetch_news(f"{name} 주가" if lang == "ko" else f"{name} stock") if fetch_news else []
            rows.append(explain(code, closes, index_close, volumes, names, index_name, news))
        out[key] = rows
    return out


def section(result, market_name):
    if not result:
        return ""
    lines = ["", f"[왜 움직였나 · 추정] {market_name} {result['count']}개 종목 중 최근 5거래일 많이 움직인 종목"]
    for key, head in (("up", "많이 오른 종목"), ("down", "많이 내린 종목")):
        rows = result.get(key) or []
        if not rows:
            continue
        lines.append(f"▲ {head}" if key == "up" else f"▼ {head}")
        for i, p in enumerate(rows, 1):
            lines.append(f"{i}. {p['name']} {p['r5']:+.1%} (오늘 {p['r1']:+.1%}) · {p['main']}")
            lines.extend(f"   - {x}" for x in p["reasons"][:3])
            for n in p["news"][:1]:
                lines.append(f"   뉴스: {n['title']}" + (f" ({n['source']})" if n["source"] else ""))
    if len(lines) == 2:
        lines.append("최근 5거래일 ±3% 넘게 움직인 종목이 없어요.")
    lines.append("이유는 규칙과 뉴스 제목으로 짐작한 거예요. 사기 전에 기사 원문을 꼭 확인하세요.")
    return "\n".join(lines)
