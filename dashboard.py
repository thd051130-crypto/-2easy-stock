#!/usr/bin/env python3
"""폰으로 보는 대시보드(GitHub Pages)에 올릴 data.json을 만들어요.

paper/<시장>/ 에 쌓인 기록만 읽어요 (네트워크·pandas 필요 없음).
  - daily.json : 매일 시세 자료 (많이 움직인 종목·업종·지수 캔들·관심종목 시세, daily.py)
  - paper/report.json : 오늘의 리포트 (리포트 부서, report_desks.py)
  - paper/weekly.json : 주간 리포트 (토요일 아침, weekly.py)
  - paper/reports/ : 지난 리포트 보관함 → _site/reports/ (report_archive.py, 앱 '📅 지난 리포트' 달력)
  - paper/learn_cases.json, reading.json : 투자 공부 사례 일지·증권사 무료 리포트 목록 (learn_cases.py, reading.py)
  - paper/learn_notes.json : 투자 공부 '공부 노트' (평일 장 마감 뒤 한 편씩 손으로 더해요, 새 용어는 용어집에)
  - paper/story_log.json : 투자 공부 사례집 '앱이 기록한 최근 사건' (분석팀 market_story.py)
    → 사례 일지·리포트 목록·사례집 기록은 <out>/learn.json으로 따로 (홈에 안 써서, 앱이 홈을 그린 뒤 받아요)
    → 지수 5년 일봉은 <out>/charts.json으로 따로 (차트 화면·실험실만 써서)
  - paper/watch.json, alerts.json, bot.json : 텔레그램으로 넣은 관심종목·가격 알림 (bot.py)
  - paper/health.json : 주간 점검 (health.py)
  - paper/macro.json : 경기 국면 (macro.py)
  - paper/policies.json, policy_news.json : 정부 정책과 최근 뉴스 (policies.py)
  - paper/world.json : 세계 지수·환율 (world.py)
  - paper/calendar.json : 경제 일정 (econ_calendar.py)
  - 장중 뉴스는 data.json에 안 넣고 주소(news_url)만 넣어요. 앱이 live 브랜치의 news.json을 바로 읽어요 (news.py)
  - paper/events.json   : 큰 발표(CPI·고용·FOMC) 예상·결과, 지수 급변 (big_events.py)
  - paper/kr/disclosures.json : 국장 종목 공시 (disclosures.py, 오픈DART 키가 있을 때만)
  - paper/kr/flows.json : 국장 외국인·기관 수급 (flows.py) → 홈 경고·요약만 (종목별 막대는 stock_pages.py)
  - paper/symbols/ : 검색용 전체 종목 목록 (symbols.py) → <out>/symbols/ 로 복사
  - paper/inbox/ : 텔레그램으로 보낸 알림 (inbox.py) → <out>/inbox.json (앱 메시지함, 열 때만 받아요)
  - themes.py : 문장 검색용 테마 사전 → <out>/themes.json
  - industry_map.py : 산업 지도 점·선 → <out>/industry.json (시세·주가 동행은 pages 워크플로가 이어서 채워요)

사용법:
    python dashboard.py                 # site/ 를 _site/ 로 복사하고 _site/data.json 생성
    python dashboard.py --out preview   # 다른 폴더로
"""

import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import shutil

import flows
import inbox
import industry_map
import policies
import report_archive
import slim
import themes
import watchlist
from markets import MARKETS

KST = dt.timezone(dt.timedelta(hours=9))
REPO = "thd051130-crypto/-2easy-stock"  # 저장소 이름을 모를 때 (내 PC에서 돌릴 때)


def read_json(path):
    return json.loads(path.read_text()) if path.exists() else None


FUND_KEYS = ("name", "per", "loss", "pbr", "div", "roe", "debt", "financial", "cap", "target", "events")


def fund_table(path):
    """조건 검색·히트맵·실적 일정용 종목별 재무 한 줄 (fundamentals.json에서 화면에 쓰는 것만).
    등급은 [등급, 점수, 만점]으로 줄여요. 종목 화면의 연간·분기 재무제표는 stock_pages.py가 따로 붙여요."""
    stocks = (read_json(path) or {}).get("stocks") or {}
    out = {}
    for code, f in stocks.items():
        row = {k: f.get(k) for k in FUND_KEYS if f.get(k) not in (None, {}, False)}
        g = f.get("grade") or {}
        if g.get("score") is not None:
            row["grade"] = [g.get("grade"), g["score"], g.get("total")]
        out[code] = row
    return out



def fresh_calendar(paper_dir, today=None):
    """달력(calendar.json, 하루 한 번 06:50) 중 큰 발표 줄만 지금 events.json으로 다시 만들어요.
    events.json은 15분마다 새로 받아서(다음 주 일정은 일요일 오후부터), 그대로 두면 홈 '큰 발표' 칸엔 있는
    연준 의장 연설이 달력엔 빠지거나 이름·등급이 달라져요 (사용자 2026-11-15 "연준 발표내용 서로 다른데 통일해")."""
    import econ_calendar

    cal = read_json(paper_dir / "calendar.json") or {}
    ev = cal.get("events")
    if not ev:
        return ev
    today = today or dt.datetime.now(KST).date()
    start = dt.date(today.year - econ_calendar.YEARS_BACK, 1, 1)
    end = dt.date(today.year + econ_calendar.YEARS_AHEAD, 12, 31)
    try:
        big = econ_calendar.big_rows(paper_dir, cal.get("releases") or [], start, end, cal.get("fomc") or [])
    except (KeyError, TypeError, ValueError):
        return ev
    return sorted([e for e in ev if e.get("kind") != "big"] + big, key=econ_calendar.sort_key)

def build(paper_dir):
    markets = {}
    watch, alerts = watchlist.load_watch(paper_dir), watchlist.load_alerts(paper_dir)["active"]
    for key, m in MARKETS.items():
        folder = paper_dir / key
        markets[key] = dict(name=m["name"], index_name=m["index_name"], currency=m["currency"],
                            daily=read_json(folder / "daily.json"),
                            # 텔레그램으로 넣은 종목 (시세는 배포 때 stock_pages.py가 채워요), 기다리는 가격 알림
                            extras=watch[key], alerts=[a for a in alerts if a.get("market") == key],
                            funds=fund_table(folder / "fundamentals.json"))
    fl = read_json(paper_dir / "kr" / "flows.json")
    markets["kr"]["disclosures"] = (read_json(paper_dir / "kr" / "disclosures.json") or {}).get("items")
    markets["kr"]["flows"] = dict(day=fl.get("day"), warn=flows.warnings(fl), **flows.top_flows(fl)) if fl else None
    fx = (markets["us"]["daily"] or {}).get("usdkrw") or (markets["kr"]["daily"] or {}).get("usdkrw")
    return dict(built=dt.datetime.now(KST).isoformat(timespec="minutes"), markets=markets, fx=fx,
                bot=watchlist.bot_username(paper_dir), health=read_json(paper_dir / "health.json"),
                macro=read_json(paper_dir / "macro.json"), policies=policies.payload(paper_dir),
                calendar=fresh_calendar(paper_dir), events=read_json(paper_dir / "events.json"),
                world=read_json(paper_dir / "world.json"),
                report=read_json(paper_dir / "report.json"), weekly=read_json(paper_dir / "weekly.json"),
                # 투자 공부: 날마다 쌓는 사례 일지(learn_cases.py)와 증권사 무료 리포트 목록(reading.py)
                learn_cases=read_json(paper_dir / "learn_cases.json"), reading=read_json(paper_dir / "reading.json"),
                learn_notes=(read_json(paper_dir / "learn_notes.json") or {}).get("notes"),
                # 사례집 '앱이 기록한 최근 사건': 분석팀(market_story.py)이 날마다 쌓은 해설, 시장마다 최근 60거래일만
                story_log={mk: rows[:60] for mk, rows in (read_json(paper_dir / "story_log.json") or {}).items()},
                # 30분마다 news 워크플로가 live 브랜치에 올리는 장중 뉴스 (앱이 바로 읽어요)
                news_url=f"https://raw.githubusercontent.com/{os.environ.get('GITHUB_REPOSITORY') or REPO}/live/news.json")


LEARN_KEYS = ("learn_cases", "reading", "story_log")


def split_learn(data):
    """투자 공부 화면에서만 쓰는 큰 자료(data.json의 약 3분의 1)를 떼어 learn.json으로 보내요.
    앱은 홈을 먼저 그리고 뒤에서 learn.json을 받아요 (첫 화면이 빨리 떠요, 2026-11-18).
    홈 '투자 공부' 줄의 '오늘 리포트 N개'는 날짜별 개수(reading_days)만 data.json에 남겨요."""
    learn = {k: data.pop(k, None) for k in LEARN_KEYS}
    # 주소 버전은 내용 해시예요. 예전엔 배포 시각(built)이라 하루 11번쯤 배포될 때마다 같은 85KB를 다시 받았어요 (2026-11-21)
    learn["v"] = data["learn_v"] = content_v(learn)
    days = {}
    for rows in ((learn.get("reading") or {}).get("items") or {}).values():
        for x in rows or []:
            if x.get("date"):
                days[x["date"]] = days.get(x["date"], 0) + 1
    data["reading_days"] = days
    return learn


def content_v(obj):
    """자료 내용이 바뀔 때만 달라지는 짧은 버전 (learn.json?v=…·charts.json?v=…). 폰은 같은 버전이면 받아 둔 걸 그대로 써요."""
    return hashlib.sha1(json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:10]


def split_charts(data):
    """지수 5년 일봉(markets.<시장>.daily.candles)은 차트 화면·실험실만 써요. data.json의 약 3분의 1이라
    charts.json으로 떼어요. 앱은 홈을 먼저 그리고 뒤에서 받아요 (자료 다이어트, 2026-11-21)."""
    charts = {"markets": {}}
    for key, m in (data.get("markets") or {}).items():
        daily = m.get("daily") or {}
        if daily.get("candles"):
            charts["markets"][key] = daily.pop("candles")
    charts["v"] = data["charts_v"] = content_v(charts["markets"])
    return charts


def site_version(site_dir):
    """웹앱 파일이 바뀌면 달라지는 짧은 값. 앱을 열어 둔 사이 새 화면이 배포됐는지 앱이 알아채는 데 써요."""
    h = hashlib.sha1()
    for path in sorted(p for p in site_dir.rglob("*") if p.is_file()):
        h.update(path.relative_to(site_dir).as_posix().encode())
        h.update(path.read_bytes())
    return h.hexdigest()[:12]


def stamp_assets(out_dir):
    """index.html이 부르는 js/*.js·casebook.js·style.css 주소 끝에 내용 해시를 붙여요 (js/core.js?v=…).
    파일이 바뀌면 주소도 바뀌어서, 폰 브라우저가 메모리에 들고 있던 예전 파일을 다시 쓰지 않아요.
    화면별로 나눈 앱 파일(2026-11-20)은 바뀐 파일만 새 주소라서, 배포 뒤에도 안 바뀐 파일은 폰에 있던 걸 그대로 써요.
    나중에 받는 파일(지도·도구·의견)은 index.html에 없어서 window.JSV에 버전을 적어 두면 core.js가 그 주소로 받아요."""
    slim.slim_dir(out_dir)  # 배포본만 주석·들여쓰기 빼기 (원본 site/는 그대로)
    index = out_dir / "index.html"
    html = index.read_text(encoding="utf-8")
    jsv = {}
    for p in sorted((out_dir / "js").glob("*.js")):
        jsv[p.stem] = hashlib.sha1(p.read_bytes()).hexdigest()[:10]
        html = html.replace(f'"js/{p.name}"', f'"js/{p.name}?v={jsv[p.stem]}"')
    for name in ("casebook.js", "style.css"):
        asset = out_dir / name
        if asset.exists():
            digest = hashlib.sha1(asset.read_bytes()).hexdigest()[:10]
            html = html.replace(f'"{name}"', f'"{name}?v={digest}"')
    if jsv:
        html = html.replace("<script src=\"casebook.js", f"<script>window.JSV={json.dumps(jsv, separators=(',', ':'))};</script>\n<script src=\"casebook.js", 1)
    index.write_text(html, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--paper", type=pathlib.Path, default=pathlib.Path("paper"), help="기록 폴더")
    parser.add_argument("--site", type=pathlib.Path, default=pathlib.Path("site"), help="웹앱 소스 폴더")
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("_site"), help="배포할 폴더")
    args = parser.parse_args()
    if args.out.exists():
        shutil.rmtree(args.out)
    shutil.copytree(args.site, args.out)
    stamp_assets(args.out)
    if (args.paper / "symbols").is_dir():  # 검색용 전체 종목 목록
        # *_divs.json(10년 배당 내역)은 종목 파일에 나눠 넣으니 통째로는 안 올려요
        shutil.copytree(args.paper / "symbols", args.out / "symbols", ignore=shutil.ignore_patterns("*_divs.json"))
    # 문장 검색용 테마 사전 ('전력 관련 종목 찾아줘')
    (args.out / "themes.json").write_text(json.dumps(themes.build(args.paper / "symbols", args.paper / "sectors.json"),
                                                     ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # 산업 지도 점·선 (시세 없이). pages 워크플로가 industry_map.py로 흐름·주가 동행을 채워 덮어써요
    industry_map.write(args.out, industry_map.static_map())
    # 앱 메시지함: 텔레그램으로 보낸 알림 최근 60일. data.json에는 마지막 시각만 (안 읽은 표시용)
    mail = inbox.load(args.paper / "inbox")
    (args.out / "inbox.json").write_text(json.dumps({"items": mail}, ensure_ascii=False, separators=(",", ":")),
                                         encoding="utf-8")
    # 지난 리포트 보관함 (report_archive.py): 한 장씩 그대로 옮기고 목록(index.json)만 따로. 앱은 '📅 지난 리포트' 탭을 열 때만 받아요
    past = report_archive.index(args.paper)
    if past:
        shutil.copytree(args.paper / "reports", args.out / "reports")
        (args.out / "reports" / "index.json").write_text(json.dumps({"items": past}, ensure_ascii=False, separators=(",", ":")),
                                                         encoding="utf-8")
    data = dict(build(args.paper), site_version=site_version(args.site), inbox_last=mail[0]["t"] if mail else None,
                reports_n=len(past))
    learn = split_learn(data)
    (args.out / "learn.json").write_text(json.dumps(learn, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    charts = split_charts(data)
    (args.out / "charts.json").write_text(json.dumps(charts, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (args.out / "data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for key, m in data["markets"].items():
        print(f"{m['name']}: 매일 자료 {'있음' if m['daily'] else '없음'}")
    print(f"오늘의 리포트 {'있음' if data['report'] else '없음'} · 지난 리포트 {len(past)}장")
    print(f"{args.out}/ 준비 완료")


if __name__ == "__main__":
    main()
