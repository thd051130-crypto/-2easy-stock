"""장중 뉴스 제목을 30분마다 받아요 (구글 뉴스 RSS, 무료·키 없음).

  - 시장 뉴스: 국장·미장마다 검색어 몇 개로 최근 하루 제목을 모아 새 것부터 12개
  - 종목 뉴스: 기본 종목(국장·미장 48개씩) + 텔레그램으로 넣은 관심종목마다 최근 하루 제목 3개
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
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

KST = dt.timezone(dt.timedelta(hours=9))
PAPER = pathlib.Path("paper")
# (검색어, 언어)
MARKET_QUERIES = {
    "kr": [("코스피", "ko"), ("코스닥", "ko"), ("국내 증시 외국인", "ko")],
    "us": [("뉴욕증시", "ko"), ("미국 증시 연준", "ko"), ("stock market today", "en")],
}
MARKET_N = 12   # 시장 뉴스 몇 개
STOCK_N = 3     # 종목마다 몇 개
DAYS = 1        # 최근 며칠 기사
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


def fetch(query, lang="ko", n=STOCK_N, timeout=10, retries=2):
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


def targets(paper=None):
    """{시장: {코드: 이름}} 기본 종목 + 텔레그램 관심종목."""
    import marketdata  # pandas를 불러서 쓸 때만
    import watchlist

    watch = watchlist.load_watch(paper or PAPER)
    out = {"kr": dict(marketdata.UNIVERSE), "us": dict(marketdata.US_UNIVERSE)}
    for m in out:
        for e in watch[m]:
            out[m].setdefault(e["code"], e.get("name") or e["code"])
    return out


def build(stocks, fetch=fetch, now=None):
    now = now or dt.datetime.now(KST)
    jobs = {}
    with concurrent.futures.ThreadPoolExecutor(WORKERS) as pool:
        for m, qs in MARKET_QUERIES.items():
            for q, lang in qs:
                jobs[(m, "market", q)] = pool.submit(fetch, q, lang, MARKET_N)
        for m, names in stocks.items():
            for code, name in names.items():
                jobs[(m, "stock", code)] = pool.submit(fetch, f"{name} 주가", "ko", STOCK_N)
    out = {m: dict(market=[], stocks={}) for m in MARKET_QUERIES}
    for m in out:
        out[m]["market"] = merge([f.result() for (mm, kind, _), f in jobs.items() if mm == m and kind == "market"])
        out[m]["stocks"] = {code: f.result() for (mm, kind, code), f in jobs.items()
                            if mm == m and kind == "stock" and f.result()}
    return dict(updated=now.isoformat(timespec="minutes"), **out)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("news.json"))
    args = parser.parse_args()
    data = build(targets())
    got = sum(len(data[m]["market"]) for m in MARKET_QUERIES)
    stocks = sum(len(data[m]["stocks"]) for m in MARKET_QUERIES)
    print(f"시장 뉴스 {got}개, 뉴스 있는 종목 {stocks}개 ({data['updated']})")
    if not got and not stocks:
        raise SystemExit("뉴스를 하나도 못 받았어요")  # 빈 파일로 덮지 않게
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
