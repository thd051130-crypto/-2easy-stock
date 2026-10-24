"""증시에 영향을 줄 만한 사건 뉴스 제목을 30분마다 받아요 (구글 뉴스 RSS, 무료·키 없음).

  - 국장·미장마다 금리·환율·관세·유가·전쟁·수출 같은 검색어로 최근 하루 제목을 모아 새 것부터 15개
  - 제목 낱말로 금리·환율·무역·유가 같은 주제를 붙여요
  - 종목 하나하나 뉴스는 안 받아요 (사용자 2026-10-24: 증시 전체에 영향 줄 사건만)
결과는 news.json 하나. news 워크플로가 이 파일만 담은 `live` 브랜치로 올리고,
앱은 raw.githubusercontent.com에서 바로 읽어요 (앱 전체를 다시 올리지 않아서 가벼워요).
뉴스는 자동 수집이라 틀릴 수 있어요. 기사 원문을 확인하세요.
"""

import argparse
import concurrent.futures
import datetime as dt
import email.utils
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

KST = dt.timezone(dt.timedelta(hours=9))
# (검색어, 언어). 증시 전체를 움직일 만한 사건 위주로
MARKET_QUERIES = {
    "kr": [("코스피 증시", "ko"), ("한국은행 기준금리", "ko"), ("원달러 환율", "ko"), ("반도체 수출", "ko"),
           ("외국인 순매도 증시", "ko"), ("정부 증시 대책", "ko")],
    "us": [("뉴욕증시", "ko"), ("연준 금리", "ko"), ("미국 물가 고용 지표", "ko"), ("관세 무역", "ko"),
           ("국제유가", "ko"), ("S&P500 나스닥 마감", "ko")],  # 영어 검색은 종목 하나 기사('X stock trades down')가 많아서 뺐어요
}
QUERY_N = 6     # 검색어마다 몇 개
MARKET_N = 15   # 시장마다 남길 개수
DAYS = 1        # 최근 며칠 기사
# 제목 낱말 → 주제 (앞에 있는 것부터 봐요)
TOPICS = [
    ("금리", r"금리|연준|Fed|FOMC|한은|기준금리|국채|채권|\brates?\b"),
    ("물가·지표", r"물가|CPI|PCE|고용|실업|GDP|성장률|PMI|소매판매|inflation|jobs|payroll"),
    ("환율", r"환율|원·달러|원달러|달러|엔화|위안|dollar|yen"),
    ("무역·관세", r"관세|무역|수출|수입|제재|tariffs?\b|\btrade war|export"),
    ("유가·원자재", r"유가|원유|OPEC|금값|구리|원자재|oil|crude|gold"),
    ("지정학", r"전쟁|중동|이란|이스라엘|러시아|우크라이나|북한|대만|미사일|war|iran|israel"),
    ("정책", r"정부|대책|규제|법안|세제|예산|policy|regulat"),
    ("실적", r"실적|영업이익|어닝|earnings|revenue|profit"),
]
WORKERS = 6     # 동시에 받을 개수 (너무 많으면 구글이 막아요)


def rss_url(query, lang="ko", days=DAYS):
    hl, gl = ("ko", "KR") if lang == "ko" else ("en-US", "US")
    return (f"https://news.google.com/rss/search?q={urllib.parse.quote(query + f' when:{days}d')}"
            f"&hl={hl}&gl={gl}&ceid={gl}:{hl.split('-')[0]}")


def parse(text, n):
    """RSS → [{title, source, at(한국시간), link}], 새 것부터."""
    out = []
    for item in ET.fromstring(text).iter("item"):
        title = (item.findtext("title") or "").strip()
        source = (item.findtext("source") or "").strip()
        if source and title.endswith(" - " + source):
            title = title[: -len(source) - 3]
        try:
            at = email.utils.parsedate_to_datetime(item.findtext("pubDate")).astimezone(KST).isoformat(timespec="minutes")
        except (TypeError, ValueError):
            at = None
        if title:
            out.append(dict(title=title, source=source, at=at, link=(item.findtext("link") or "").strip()))
    out.sort(key=lambda x: x["at"] or "", reverse=True)
    return out[:n]


def fetch(query, lang="ko", n=QUERY_N, timeout=10, retries=2):
    """못 받으면 [] (한 줄 실패로 전체가 멈추지 않게)."""
    req = urllib.request.Request(rss_url(query, lang), headers={"User-Agent": "Mozilla/5.0"})
    for i in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return parse(r.read().decode("utf-8", "replace"), n)
        except Exception as e:  # noqa: BLE001 — 네트워크·XML 오류 모두 그 줄만 건너뛰어요
            if i == retries:
                print(f"뉴스를 못 받았어요 ({query}): {e!r}")
                return []
            time.sleep(2 * (i + 1))


def merge(lists, n=MARKET_N):
    """여러 검색 결과를 합쳐 같은 제목은 하나만, 새 것부터 n개."""
    seen, out = set(), []
    for x in sorted((x for l in lists for x in l), key=lambda x: x["at"] or "", reverse=True):
        key = x["title"].replace(" ", "")
        if key not in seen:
            seen.add(key)
            out.append(x)
    return out[:n]


def topic(title):
    for name, pat in TOPICS:
        if re.search(pat, title, re.I):
            return name
    return None


def build(fetch=fetch, now=None):
    now = now or dt.datetime.now(KST)
    with concurrent.futures.ThreadPoolExecutor(WORKERS) as pool:
        jobs = {m: [pool.submit(fetch, q, lang, QUERY_N) for q, lang in qs] for m, qs in MARKET_QUERIES.items()}
    out = {m: [dict(x, topic=topic(x["title"])) for x in merge([f.result() for f in fs])] for m, fs in jobs.items()}
    return dict(updated=now.isoformat(timespec="minutes"), **out)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("news.json"))
    args = parser.parse_args()
    data = build()
    got = {m: len(data[m]) for m in MARKET_QUERIES}
    print(f"사건 뉴스 국장 {got['kr']}개, 미장 {got['us']}개 ({data['updated']})")
    if not any(got.values()):
        raise SystemExit("뉴스를 하나도 못 받았어요")  # 빈 파일로 덮지 않게
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
