"""주가에 영향을 주는 정부 정책 (국내·미국·세계). 참고용이고 매매 규칙은 안 바꿔요.

  - 정책 목록: paper/policies.json (손으로 정리). 정책이 새로 나오거나 바뀌면 그 파일을 고쳐요.
      region kr|us|world, status, date(발표·시행일), next(다음 확인할 날), summary,
      effects [{sector: sectors.py 업종 이름, tone: 1 호재 · -1 악재 · 0 엇갈림, why}],
      query {ko, en} (뉴스 검색어), sources [{name, url}]
  - 최근 뉴스 제목: 매일 macro 워크플로가 `python policies.py --news`로 구글 뉴스 RSS(무료)에서
      정책마다 최근 7일 제목 2개를 paper/policy_news.json에 적어요.
  - 앱: dashboard.py가 둘을 합쳐 data.json `policies`로 (홈 '정부 정책' 칸, 업종 칸·종목 화면에도 표시)

손으로 확인: python policies.py --check
"""
import argparse
import datetime as dt
import json
import pathlib

import sectors

PATH = pathlib.Path("paper/policies.json")
NEWS_PATH = pathlib.Path("paper/policy_news.json")
REGIONS = ("kr", "us", "world")
NEWS_DAYS = 7
STALE_DAYS = 45  # 이만큼 손으로 다시 안 보면 앱에 '오래됨' 표시


def load(path=PATH):
    try:
        return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def problems(data):
    """정책 파일에서 고칠 곳 목록 (빈 목록이면 괜찮아요)."""
    out, seen = [], set()
    for i, p in enumerate((data or {}).get("items") or []):
        tag = p.get("id") or f"{i}번"
        if not p.get("id") or p["id"] in seen:
            out.append(f"{tag}: id가 없거나 겹쳐요")
        seen.add(p.get("id"))
        if p.get("region") not in REGIONS:
            out.append(f"{tag}: region은 kr·us·world 중 하나")
        for key in ("title", "summary", "date"):
            if not p.get(key):
                out.append(f"{tag}: {key}가 비었어요")
        for e in p.get("effects") or []:
            if e.get("sector") not in sectors.NAMES:
                out.append(f"{tag}: 업종 '{e.get('sector')}'는 sectors.py에 없어요")
            if e.get("tone") not in (-1, 0, 1):
                out.append(f"{tag}: tone은 1·0·-1")
        if not p.get("sources"):
            out.append(f"{tag}: 출처가 없어요")
    return out


def fetch_news(data, fetch=None, days=NEWS_DAYS):
    """정책 id → 최근 뉴스 제목 [{title, source, date, link, lang}] (국내 정책은 한국어, 나머지는 한국어+영어)."""
    if fetch is None:
        import movers
        fetch = movers.google_news
    out = {}
    for p in (data or {}).get("items") or []:
        q = p.get("query") or {}
        news = fetch(q["ko"], lang="ko", days=days, n=2) if q.get("ko") else []
        if p.get("region") != "kr" and q.get("en"):
            news = news[:1] + fetch(q["en"], lang="en", days=days, n=1)
        out[p["id"]] = news
    return out


def sector_summary(items):
    """업종 → [호재 수, 악재 수, 엇갈림 수]. 앱 '한눈에' 줄에 써요."""
    out = {}
    for p in items:
        for e in p.get("effects") or []:
            row = out.setdefault(e["sector"], [0, 0, 0])
            row[0 if e["tone"] > 0 else 1 if e["tone"] < 0 else 2] += 1
    return out


def payload(paper_dir, today=None):
    """data.json에 넣을 {reviewed, stale, items(뉴스 포함), by_sector}. 정책 파일이 없으면 None."""
    paper_dir = pathlib.Path(paper_dir)
    data = load(paper_dir / "policies.json")
    if not data or not data.get("items"):
        return None
    news = (load(paper_dir / "policy_news.json") or {}).get("items") or {}
    today = today or dt.date.today()
    items = [dict(p, news=news.get(p["id"]) or []) for p in data["items"]]
    for p in items:
        p.pop("query", None)
    reviewed = data.get("reviewed")
    stale = bool(reviewed) and (today - dt.date.fromisoformat(reviewed)).days > STALE_DAYS
    return dict(reviewed=reviewed, stale=stale, news_day=(load(paper_dir / "policy_news.json") or {}).get("day"),
                items=items, by_sector=sector_summary(items))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--path", type=pathlib.Path, default=PATH)
    parser.add_argument("--news", action="store_true", help="정책별 최근 뉴스 제목을 받아 저장")
    parser.add_argument("--save", type=pathlib.Path, default=NEWS_PATH)
    parser.add_argument("--check", action="store_true", help="정책 파일 검사만")
    args = parser.parse_args()
    data = load(args.path)
    bad = problems(data)
    for line in bad:
        print("⚠️", line)
    print(f"정책 {len((data or {}).get('items') or [])}개, 마지막 정리 {(data or {}).get('reviewed')}")
    if args.check:
        raise SystemExit(1 if bad else 0)
    if args.news:
        items = fetch_news(data)
        if not any(items.values()) and args.save.exists():
            print("뉴스 제목을 하나도 못 받아서 예전 기록을 그대로 둬요")
            return
        day = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat()
        args.save.write_text(json.dumps(dict(day=day, items=items), ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"뉴스 제목 {sum(len(v) for v in items.values())}개 → {args.save}")


if __name__ == "__main__":
    main()
