#!/usr/bin/env python3
"""투자 공부 '전문가 리포트': 증권사가 무료로 올린 리포트(PDF) 제목·증권사·날짜·링크를 모아요.

네이버페이 증권 리서치(finance.naver.com/research) 목록에서 시황·투자 전략·경제·산업·채권 다섯 묶음을 받아요.
리포트 원문은 증권사가 공개한 PDF라 링크만 저장하고 내용은 옮기지 않아요. 키·계좌 필요 없음.
매일 장 마감 작업(daily 워크플로)이 돌려요. 이 클라우드 작업 환경에선 네이버가 막혀 있어 GitHub Actions에서만 받아져요.
받은 건 지난 파일과 합쳐 묶음마다 최근 30일·40개까지 쌓아요 (못 받은 날도 예전 목록은 그대로).

사용법:
    python reading.py              # paper/reading.json 갱신
    python reading.py --html 파일  # 저장해 둔 목록 HTML로 시험 (네트워크 없이)
"""

import argparse
import datetime as dt
import html
import json
import pathlib
import re
import urllib.parse

import requests

BASE = "https://finance.naver.com/research/"
CATS = [  # (키, 이름, 목록 주소)
    ("market", "시황", "market_info_list.naver"),
    ("invest", "투자 전략", "invest_list.naver"),
    ("economy", "경제 분석", "economy_list.naver"),
    ("industry", "산업 분석", "industry_list.naver"),
    ("bond", "채권", "debenture_list.naver"),
]
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
           "Referer": "https://finance.naver.com/research/"}
KEEP_DAYS, KEEP_N = 30, 40
KST = dt.timezone(dt.timedelta(hours=9))
OUT = pathlib.Path("paper/reading.json")

ROW = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S | re.I)
CELL = re.compile(r"<td[^>]*>(.*?)</td>", re.S | re.I)
TAG = re.compile(r"<[^>]+>")
HREF = re.compile(r'href="([^"]+)"', re.I)
DATE = re.compile(r"^(\d{2})\.(\d{2})\.(\d{2})$")


def text(s):
    return re.sub(r"\s+", " ", html.unescape(TAG.sub(" ", s))).strip()


def parse(page, cat):
    """목록 HTML → [{title, broker, date, pdf, link, sector?}]. 표 모양이 조금 바뀌어도 되게 칸 내용으로 찾아요."""
    out = []
    for row in ROW.findall(page):
        cells = CELL.findall(row)
        if len(cells) < 4:
            continue
        title = link = pdf = date = None
        rest = []
        for c in cells:
            hrefs = HREF.findall(c)
            t = text(c)
            read = next((h for h in hrefs if "_read.naver" in h), None)
            pdfh = next((h for h in hrefs if h.lower().split("?")[0].endswith(".pdf")), None)
            if read and not title:
                title, link = t, urllib.parse.urljoin(BASE, html.unescape(read))
            elif pdfh:
                pdf = urllib.parse.urljoin(BASE, html.unescape(pdfh))
            elif DATE.match(t) and not date:
                m = DATE.match(t)
                date = f"20{m.group(1)}-{m.group(2)}-{m.group(3)}"
            elif t and not t.isdigit():
                rest.append(t)
        if not (title and date):
            continue
        # 산업 분석은 [업종, 제목, 증권사, …], 나머지는 [제목, 증권사, …]
        item = dict(title=title, date=date, link=link, pdf=pdf or "")
        if cat == "industry" and len(rest) >= 2:
            item["sector"], item["broker"] = rest[0], rest[1]
        elif rest:
            item["broker"] = rest[-1] if cat == "industry" else rest[0]
        out.append(item)
    return out


def fetch(path):
    r = requests.get(BASE + path, headers=HEADERS, timeout=20)
    r.raise_for_status()
    r.encoding = "euc-kr"  # 네이버 금융은 아직 EUC-KR
    return r.text


def merge(old, new, today):
    cut = (dt.date.fromisoformat(today) - dt.timedelta(days=KEEP_DAYS)).isoformat()
    seen, out = set(), []
    for x in sorted([*new, *(old or [])], key=lambda x: x.get("date") or "", reverse=True):
        key = x.get("pdf") or x.get("link") or x["title"]
        if key in seen or (x.get("date") or "") < cut:
            continue
        seen.add(key)
        out.append(x)
    return out[:KEEP_N]


def run(out=OUT, get=fetch):
    old = json.loads(out.read_text()) if out.exists() else {}
    today = dt.datetime.now(KST).date().isoformat()
    got, fails = {}, []
    for key, name, path in CATS:
        try:
            got[key] = parse(get(path), key)
        except Exception as e:  # 한 묶음이 안 돼도 나머지는 받아요
            fails.append(f"{name}: {e}")
            got[key] = []
    data = {"updated": dt.datetime.now(KST).isoformat(timespec="minutes"), "source": "네이버페이 증권 리서치",
            "cats": [[k, n] for k, n, _ in CATS],
            "items": {k: merge((old.get("items") or {}).get(k), got[k], today) for k, _, _ in CATS}}
    if not any(got.values()):  # 하나도 못 받았으면 지난 파일을 그대로 둬요
        return old, fails
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return data, fails


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=pathlib.Path, default=OUT)
    parser.add_argument("--html", type=pathlib.Path, help="저장해 둔 목록 HTML로 시험 (시황 묶음으로 읽어요)")
    args = parser.parse_args()
    if args.html:
        for x in parse(args.html.read_text(encoding="euc-kr", errors="replace"), "market")[:10]:
            print(x)
        return
    data, fails = run(args.out)
    for k, n in (data.get("cats") or []):
        items = (data.get("items") or {}).get(k) or []
        print(f"{n}: {len(items)}개" + (f", 최근 {items[0]['date']} {items[0].get('broker', '')} {items[0]['title']}" if items else ""))
    for f in fails:
        print("못 받음 -", f)


if __name__ == "__main__":
    main()
