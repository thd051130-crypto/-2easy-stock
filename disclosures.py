#!/usr/bin/env python3
"""관심종목 공시 알림: 금감원 전자공시(오픈DART, 무료 키)에서 오늘 올라온 공시 중 우리 종목 것을 골라요.

  - 대상: 국장 감시 종목 + 텔레그램으로 넣은 국장 관심종목 + 가상계좌 보유 종목
  - 유상증자·전환사채·감자·최대주주 변경·횡령 같은 '주의' 공시는 바로 텔레그램으로 알려요 (낙폭을 키우는 일이 많아서)
  - 자사주 매입·배당·공급계약 같은 공시는 앱 종목 화면과 홈에만 보여요
  - 결과는 paper/kr/disclosures.json (최근 30일, 종목마다 최근 10개). 이미 알린 공시는 다시 안 보내요
키가 없으면(저장소 Secrets에 DART_API_KEY가 없으면) 아무것도 안 하고 끝나요.
키 받는 법: opendart.fss.or.kr → 인증키 신청 (무료, 폰으로 가능) → GitHub 저장소 Secrets에 DART_API_KEY로 저장.
참고용이에요. 매매 규칙은 안 바꿔요.

사용법:
    python disclosures.py                # 오늘 공시
    python disclosures.py --days 3       # 최근 3일 (처음 켤 때)
    python disclosures.py --dry-run      # 텔레그램으로 안 보내고 출력만
"""

import argparse
import datetime as dt
import json
import os
import pathlib
import time

import requests

import fundamentals
import watchlist
from econ_calendar import held_codes

KST = dt.timezone(dt.timedelta(hours=9))
URL = "https://opendart.fss.or.kr/api/list.json"
LINK = "https://dart.fss.or.kr/dsaf001/main.do?rcpNo={}"
KEEP_DAYS = 30
PER_STOCK = 10
MAX_PAGES = 60

# 낙폭을 키우는 일이 많은 공시 (보고서 이름에 들어 있는 말). 바로 텔레그램으로 알려요
WARN = ["유상증자", "전환사채", "신주인수권부사채", "교환사채", "감자", "최대주주변경", "최대주주 변경", "상장폐지", "관리종목",
        "불성실공시", "횡령", "배임", "회생절차", "영업정지", "거래정지", "매매거래정지", "소송", "부도", "해산", "투자주의", "투자경고",
        "주식등의대량보유상황보고서", "임원ㆍ주요주주특정증권등소유상황보고서", "자기주식처분"]
# 좋은 소식일 때가 많은 공시
GOOD = ["자기주식취득", "자기주식 취득", "무상증자", "현금ㆍ현물배당", "현금배당", "단일판매ㆍ공급계약", "공급계약체결", "주식소각", "자기주식소각"]
# 지분 공시는 팔았는지 샀는지 이름만으론 몰라서 '확인 필요'로 따로 적어요
STAKE = ["주식등의대량보유상황보고서", "임원ㆍ주요주주특정증권등소유상황보고서"]


def tone(name):
    """보고서 이름 → 'warn'(주의) / 'check'(지분 변동, 내용 확인) / 'good'(좋은 편) / ''(그 밖)."""
    n = name.replace(" ", "")
    if any(k.replace(" ", "") in n for k in STAKE):
        return "check"
    if any(k.replace(" ", "") in n for k in WARN):
        return "warn"
    if any(k.replace(" ", "") in n for k in GOOD):
        return "good"
    return ""


def fetch_day(key, day, get=requests.get, pause=0.2):
    """그날 올라온 모든 공시 (여러 쪽). 실패하면 예외."""
    out, page = [], 1
    while page <= MAX_PAGES:
        r = get(URL, params=dict(crtfc_key=key, bgn_de=f"{day:%Y%m%d}", end_de=f"{day:%Y%m%d}", page_no=page, page_count=100),
                timeout=20)
        r.raise_for_status()
        j = r.json()
        if j.get("status") == "013":  # 조회된 자료 없음
            break
        if j.get("status") != "000":
            raise RuntimeError(f"오픈DART {j.get('status')}: {j.get('message')}")
        out += j.get("list") or []
        if page >= int(j.get("total_page") or 1):
            break
        page += 1
        time.sleep(pause)
    return out


def targets(paper):
    """{종목코드: 이름}: 감시 종목 + 텔레그램으로 넣은 국장 종목 + 가상계좌 보유 종목."""
    out = dict(fundamentals.stocks("kr", extras=False))
    for code, e in watchlist.extras("kr", paper).items():
        out.setdefault(code, e.get("name") or code)
    for code in held_codes(paper, "kr"):
        out.setdefault(code, code)
    return out


def pick(rows, names):
    """우리 종목 공시만 → [{code, name, title, no, day, tone, by}]."""
    out = []
    for r in rows:
        code = (r.get("stock_code") or "").strip()
        if code not in names or not r.get("rcept_no"):
            continue
        title = " ".join(str(r.get("report_nm") or "").split())
        out.append(dict(code=code, name=names[code] if names[code] != code else r.get("corp_name") or code, title=title,
                        no=r["rcept_no"], day=f"{r.get('rcept_dt', '')[:4]}-{r.get('rcept_dt', '')[4:6]}-{r.get('rcept_dt', '')[6:8]}",
                        tone=tone(title), by=r.get("flr_nm") or ""))
    return out


def merge(old, new, today):
    """지난 기록 + 새 공시 → 최근 KEEP_DAYS일, 종목마다 PER_STOCK개. 반환: (기록, 처음 본 공시)."""
    seen = {x["no"] for x in old.get("items", [])}
    fresh = [x for x in new if x["no"] not in seen]
    cut = f"{today - dt.timedelta(days=KEEP_DAYS):%Y-%m-%d}"
    items = sorted([x for x in old.get("items", []) + fresh if x["day"] >= cut], key=lambda x: (x["day"], x["no"]), reverse=True)
    count, keep = {}, []
    for x in items:
        count[x["code"]] = count.get(x["code"], 0) + 1
        if count[x["code"]] <= PER_STOCK:
            keep.append(x)
    return dict(items=keep), fresh


def alert_text(fresh):
    """'주의'·'지분 변동' 공시만 텔레그램으로. 없으면 None."""
    hot = [x for x in fresh if x["tone"] in ("warn", "check")]
    if not hot:
        return None
    lines = ["[공시 알림] 관심종목에 주의할 공시가 올라왔어요"]
    for x in hot:
        mark = "⚠️" if x["tone"] == "warn" else "🔍"
        lines.append(f"- {mark} {x['name']}: {x['title']}" + (f" ({x['by']})" if x["by"] and x["by"] != x["name"] else ""))
        lines.append(f"  {LINK.format(x['no'])}")
    lines.append("⚠️ 유상증자·전환사채·최대주주 변경 같은 공시는 주가가 내릴 때가 많아요. 🔍 지분 공시는 샀는지 팔았는지 원문을 확인하세요.")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--save", type=pathlib.Path, default=pathlib.Path("paper/kr/disclosures.json"))
    ap.add_argument("--paper", type=pathlib.Path, default=pathlib.Path("paper"))
    ap.add_argument("--days", type=int, default=1, help="오늘부터 며칠 전까지 (기본 오늘만)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    key = os.getenv("DART_API_KEY", "").strip()
    if not key:
        print("DART_API_KEY가 없어서 공시 알림을 건너뛰어요 (opendart.fss.or.kr에서 무료 키를 받아 Secrets에 넣으면 켜져요)")
        return
    today = dt.datetime.now(KST).date()
    names = targets(args.paper)
    rows = []
    for k in range(args.days):
        rows += fetch_day(key, today - dt.timedelta(days=k))
    old = json.loads(args.save.read_text()) if args.save.exists() else {}
    first = not old
    data, fresh = merge(old, pick(rows, names), today)
    data["updated"] = dt.datetime.now(KST).isoformat(timespec="minutes")
    if fresh or first:  # 새 공시가 없으면 파일을 그대로 둬서 한 시간마다 빈 커밋이 쌓이지 않게
        args.save.parent.mkdir(parents=True, exist_ok=True)
        args.save.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"공시 {len(rows)}건 중 우리 종목 {len(fresh)}건 새로 기록")
    text = alert_text(fresh)
    if text:
        print(text)
    if text and not args.dry_run and not first:  # 처음 켤 땐 지난 공시를 한꺼번에 보내지 않아요
        from realtime_monitor import send_telegram

        if not send_telegram(text):
            raise SystemExit("텔레그램 전송 실패")


if __name__ == "__main__":
    main()
