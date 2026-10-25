#!/usr/bin/env python3
"""투자 공부 '전문가 리포트': 증권사가 무료로 올린 리포트의 제목·증권사·날짜·첫머리 요약을 모아요.

네이버페이 증권 리서치(stock.naver.com/research)가 화면에 쓰는 JSON에서 시황·투자 전략·경제·산업·채권 다섯 묶음을 받아요.
(2026-10 옛 목록 finance.naver.com/research/*_list.naver는 자바스크립트 화면으로 바뀌어 HTML로는 못 읽어요.)
요약은 증권사가 올린 첫머리 몇 줄만 저장하고, 원문은 네이버 리서치에서 봐요. 키·계좌 필요 없음.
매일 장 마감 작업(daily 워크플로)이 돌려요. 이 클라우드 작업 환경에선 네이버가 막혀 있어 GitHub Actions에서만 받아져요.
받은 건 지난 파일과 합쳐 묶음마다 최근 30일·40개까지 쌓아요 (못 받은 날도 예전 목록은 그대로).

사용법:
    python reading.py              # paper/reading.json 갱신
"""

import argparse
import datetime as dt
import html
import json
import pathlib
import re

import requests

API = "https://stock.naver.com/api/stockSecurity/researches/v2/{cat}?index=0&size={n}"
CATS = [  # (키, 이름, 네이버 묶음). 종목 리포트(company)는 '매수·목표주가' 의견이라 빼요 (앱은 사고팔기 판단을 안 해요)
    ("market", "시황", "market"),
    ("invest", "투자 전략", "invest"),
    ("economy", "경제 분석", "economy"),
    ("industry", "산업 분석", "industry"),
    ("bond", "채권", "debenture"),
]
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
           "Referer": "https://stock.naver.com/research"}
DETAIL = {"market": "daily", "invest": "invest", "economy": "economy", "industry": "industry", "debenture": "debenture"}  # 원문 화면 주소 (2026-10 Actions에서 확인)
PAGE = 20
SUMMARY = 360  # 요약 글자 수 (증권사가 올린 첫머리만)
KEEP_DAYS, KEEP_N = 30, 40
KST = dt.timezone(dt.timedelta(hours=9))
OUT = pathlib.Path("paper/reading.json")

TAG = re.compile(r"<[^>]+>")


def text(s):
    s = re.sub(r"<br\s*/?>|</p>", "\n", s or "", flags=re.I)
    s = html.unescape(TAG.sub("", s)).replace("\xa0", " ")
    lines = [re.sub(r"\s+", " ", x).strip() for x in s.split("\n")]
    return "\n".join(x for x in lines if x)


def parse(data, cat):
    """네이버 리서치 JSON → [{id, title, broker, date, summary, analyst?, sector?}]."""
    out = []
    for it in (data or {}).get("items") or []:
        title, date = (it.get("title") or "").strip(), it.get("writeDate") or ""
        if not title or not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
            continue
        body = text(it.get("content"))
        item = dict(id=f"{cat}:{it.get('nid')}", title=title, date=date, broker=it.get("brokerName") or "",
                    summary=body[:SUMMARY] + ("…" if len(body) > SUMMARY else ""))
        if it.get("nid") and cat in DETAIL:
            item["url"] = f"https://stock.naver.com/research/{DETAIL[cat]}/{it['nid']}"
        if it.get("analystName"):
            item["analyst"] = it["analystName"]
        if it.get("industryKoreanName"):
            item["sector"] = it["industryKoreanName"]
        out.append(item)
    return out


def fetch(cat):
    r = requests.get(API.format(cat=cat, n=PAGE), headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.json()


def merge(old, new, today):
    cut = (dt.date.fromisoformat(today) - dt.timedelta(days=KEEP_DAYS)).isoformat()
    seen, out = set(), []
    for x in sorted([*new, *(old or [])], key=lambda x: x.get("date") or "", reverse=True):
        key = x.get("id") or x["title"]
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
            got[key] = parse(get(path), path)
        except Exception as e:  # 한 묶음이 안 돼도 나머지는 받아요
            fails.append(f"{name}: {e}")
            got[key] = []
    data = {"updated": dt.datetime.now(KST).isoformat(timespec="minutes"), "source": "네이버페이 증권 리서치",
            "home": "https://stock.naver.com/research",
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
    args = parser.parse_args()
    data, fails = run(args.out)
    for k, n in (data.get("cats") or []):
        items = (data.get("items") or {}).get(k) or []
        print(f"{n}: {len(items)}개" + (f", 최근 {items[0]['date']} {items[0].get('broker', '')} {items[0]['title']}" if items else ""))
    for f in fails:
        print("못 받음 -", f)


if __name__ == "__main__":
    main()
