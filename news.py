"""증시에 영향을 줄 만한 사건 뉴스 제목을 30분마다 받아요 (구글 뉴스 RSS, 무료·키 없음).

  - 국장·미장마다 금리·환율·관세·유가·전쟁·수출 같은 검색어로 최근 하루 제목을 모아 새 것부터 15개
  - 제목 낱말로 금리·환율·무역·유가 같은 주제를 붙여요
  - 종목 하나하나 뉴스는 안 받아요 (사용자 2026-10-24: 증시 전체에 영향 줄 사건만)
  - 🔥 핫 뉴스: 여러 언론이 같은 사건을 다루면(제목 핵심 낱말 2개 이상 겹치는 기사가 언론 3곳 이상) 따로 묶어요.
    24시간이 지나도 HOT_DAYS일 동안 남겨요 (지난 news.json을 --prev로 받아 이어 붙여요).
    앱은 읽기(기사 누르기) 전까지 이 폰에 따로 남겨 둬요 (사용자 2026-10-24 "핫 뉴스는 따로, 읽기 전까지")
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
QUERY_N = 15    # 검색어마다 몇 개 (핫 뉴스를 세려고 넉넉히 받아요)
MARKET_N = 15   # 시장마다 남길 개수
DAYS = 1        # 최근 며칠 기사 (구글 검색 조건)
MAX_HOURS = 24  # 이보다 오래된 기사는 빼요 (구글 조건이 가끔 더 오래된 것도 섞어서). 시각 없는 기사도 빼요
HOT_SOURCES = 3  # 같은 사건을 다룬 언론이 이만큼 넘으면 핫 뉴스
HOT_SHARE = 2    # 제목 핵심 낱말이 이만큼 겹치면 같은 사건
HOT_N = 8        # 시장마다 핫 뉴스 몇 개까지
HOT_DAYS = 7     # 핫 뉴스를 며칠 남길지
# 어디에나 나오는 낱말은 같은 사건을 가리는 데 안 써요
STOP = set("""증시 코스피 코스닥 뉴욕증시 국내 미국 한국 국내증시 미 美 韓 中 日 마감 개장 장중 상승 하락 급등 급락 강세 약세 오늘 내일 어제
주가 시장 투자자 전망 종합 속보 단독 지수 기자 뉴스 이번 지난 올해 내년 전날 마켓 포커스 오전 오후 대비 영향 기록 가능성
상승세 하락세 소폭 일제히 출발 거래 뉴욕 월가 연합뉴스 사진 영상 포토 만에 수준 관련 있다 있는 있습니다 정부 경제
the and for stock stocks market markets""".split())
JOSA = "은는을를에의도로와과"  # 이·가·서·만은 낱말 끝에도 많이 와서(국제유가·만에) 안 떼요
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


def fresh(items, now, hours=MAX_HOURS):
    """최근 hours시간 안 기사만."""
    cut = (now - dt.timedelta(hours=hours)).isoformat(timespec="minutes")
    return [x for x in items if x.get("at") and x["at"] >= cut]


def words(title):
    """제목 핵심 낱말 (조사 한 글자 떼고, 흔한 낱말·한 글자 빼고)."""
    out = set()
    for w in re.findall(r"[0-9A-Za-z가-힣]+", title):
        if len(w) > 2 and w[-1] in JOSA:
            w = w[:-1]
        w = w.lower()
        if len(w) >= 2 and w not in STOP and not re.fullmatch(r"\d+(일|월|년|주째)?", w):
            out.add(w)
    return out


def hot(items, n=HOT_N):
    """같은 사건을 다룬 기사 묶음 중 언론이 HOT_SOURCES곳 넘는 것 → [{대표 기사, sources(언론 수), key(핵심 낱말)}], 큰 묶음부터."""
    ws = [words(x["title"]) for x in items]
    groups = []  # [기사 번호들]
    for i in range(len(items)):
        for g in groups:
            if len(ws[i] & ws[g[0]]) >= HOT_SHARE:  # 묶음 첫 기사와 비교 (줄줄이 이어 붙어 다른 사건까지 묶이지 않게)
                g.append(i)
                break
        else:
            groups.append([i])
    out = []
    for g in groups:
        srcs = {items[i].get("source") or items[i]["title"] for i in g}
        if len(srcs) < HOT_SOURCES:
            continue
        common = {}
        for i in g:
            for w in ws[i]:
                common[w] = common.get(w, 0) + 1
        key = sorted(common, key=lambda w: (-common[w], w))[:4]
        best = max(g, key=lambda i: (len(ws[i] & set(key)), items[i]["at"] or ""))  # 핵심 낱말이 가장 많이 든 최신 기사
        first = min(items[i]["at"] or "9" for i in g)
        out.append(dict(items[best], sources=len(srcs), key=key, since=first))
    out.sort(key=lambda x: (x["sources"], x["at"] or ""), reverse=True)  # 언론 많은 것, 같으면 새 것부터
    return out[:n]


def keep_hot(new, prev, now, days=HOT_DAYS, n=HOT_N):
    """이번 핫 뉴스 + 지난번 핫 뉴스(HOT_DAYS일 안). 같은 사건(핵심 낱말 2개 이상 겹침)은 이번 것으로, 처음 본 시각은 이어 가요."""
    cut = (now - dt.timedelta(days=days)).isoformat(timespec="minutes")
    out = list(new)
    for p in prev or []:
        if (p.get("at") or "") < cut:  # 마지막 기사가 HOT_DAYS일 넘게 지났으면 빼요
            continue
        same = next((x for x in out if len(set(x.get("key") or []) & set(p.get("key") or [])) >= HOT_SHARE), None)
        if same:
            same["since"] = min(same["since"], p["since"])
            same["sources"] = max(same["sources"], p.get("sources") or 0)
        else:
            out.append(p)
    return out[: n * 2]  # 이번 것 먼저, 지난 것은 뒤에


def build(fetch=fetch, now=None, prev=None):
    now = now or dt.datetime.now(KST)
    with concurrent.futures.ThreadPoolExecutor(WORKERS) as pool:
        jobs = {m: [pool.submit(fetch, q, lang, QUERY_N) for q, lang in qs] for m, qs in MARKET_QUERIES.items()}
    got = {m: [fresh(f.result(), now) for f in fs] for m, fs in jobs.items()}
    out = {m: [dict(x, topic=topic(x["title"])) for x in merge(ls)] for m, ls in got.items()}
    # 핫 뉴스는 같은 기사가 여러 검색어에 걸려도 한 번만 세요 (merge로 같은 제목 하나로)
    out["hot"] = {m: [dict(x, topic=topic(x["title"])) for x in keep_hot(hot(merge(ls, n=10**6)), ((prev or {}).get("hot") or {}).get(m), now)]
                  for m, ls in got.items()}
    return dict(updated=now.isoformat(timespec="minutes"), **out)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("news.json"))
    parser.add_argument("--prev", type=pathlib.Path, help="지난번 news.json (핫 뉴스를 이어 가요). 없거나 깨져도 괜찮아요")
    args = parser.parse_args()
    prev = None
    if args.prev:
        try:
            prev = json.loads(args.prev.read_text())
        except (OSError, ValueError):
            print("지난 뉴스 파일이 없어서 핫 뉴스를 새로 시작해요")
    data = build(prev=prev)
    got = {m: len(data[m]) for m in MARKET_QUERIES}
    print(f"사건 뉴스 국장 {got['kr']}개, 미장 {got['us']}개, 핫 뉴스 국장 {len(data['hot']['kr'])}개·미장 {len(data['hot']['us'])}개 ({data['updated']})")
    for m in MARKET_QUERIES:
        for x in data["hot"][m]:
            print(f"  🔥 {m} 언론 {x['sources']}곳 {x['title']} ({' '.join(x['key'])})")
    if not any(got.values()):
        raise SystemExit("뉴스를 하나도 못 받았어요")  # 빈 파일로 덮지 않게
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
