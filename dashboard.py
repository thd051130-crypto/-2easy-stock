#!/usr/bin/env python3
"""폰으로 보는 대시보드(GitHub Pages)에 올릴 data.json을 만들어요.

paper/<시장>/ 에 쌓인 기록만 읽어요 (네트워크·pandas 필요 없음).
  - daily.json : 매일 시세 자료 (많이 움직인 종목·업종·지수 캔들·관심종목 시세, daily.py)
  - paper/report.json : 오늘의 리포트 (리포트 부서, report_desks.py)
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
                calendar=(read_json(paper_dir / "calendar.json") or {}).get("events"), events=read_json(paper_dir / "events.json"),
                world=read_json(paper_dir / "world.json"),
                report=read_json(paper_dir / "report.json"),
                # 30분마다 news 워크플로가 live 브랜치에 올리는 장중 뉴스 (앱이 바로 읽어요)
                news_url=f"https://raw.githubusercontent.com/{os.environ.get('GITHUB_REPOSITORY') or REPO}/live/news.json")


def site_version(site_dir):
    """웹앱 파일이 바뀌면 달라지는 짧은 값. 앱을 열어 둔 사이 새 화면이 배포됐는지 앱이 알아채는 데 써요."""
    h = hashlib.sha1()
    for path in sorted(p for p in site_dir.rglob("*") if p.is_file()):
        h.update(path.relative_to(site_dir).as_posix().encode())
        h.update(path.read_bytes())
    return h.hexdigest()[:12]


def stamp_assets(out_dir):
    """index.html이 부르는 app.js·style.css 주소 끝에 내용 해시를 붙여요 (app.js?v=…).
    파일이 바뀌면 주소도 바뀌어서, 폰 브라우저가 메모리에 들고 있던 예전 파일을 다시 쓰지 않아요."""
    index = out_dir / "index.html"
    html = index.read_text(encoding="utf-8")
    for name in ("app.js", "style.css"):
        asset = out_dir / name
        if asset.exists():
            digest = hashlib.sha1(asset.read_bytes()).hexdigest()[:10]
            html = html.replace(f'"{name}"', f'"{name}?v={digest}"')
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
        shutil.copytree(args.paper / "symbols", args.out / "symbols")
    # 문장 검색용 테마 사전 ('전력 관련 종목 찾아줘')
    (args.out / "themes.json").write_text(json.dumps(themes.build(args.paper / "symbols", args.paper / "sectors.json"),
                                                     ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # 산업 지도 점·선 (시세 없이). pages 워크플로가 industry_map.py로 흐름·주가 동행을 채워 덮어써요
    industry_map.write(args.out, industry_map.static_map())
    # 앱 메시지함: 텔레그램으로 보낸 알림 최근 60일. data.json에는 마지막 시각만 (안 읽은 표시용)
    mail = inbox.load(args.paper / "inbox")
    (args.out / "inbox.json").write_text(json.dumps({"items": mail}, ensure_ascii=False, separators=(",", ":")),
                                         encoding="utf-8")
    data = dict(build(args.paper), site_version=site_version(args.site), inbox_last=mail[0]["t"] if mail else None)
    (args.out / "data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    for key, m in data["markets"].items():
        print(f"{m['name']}: 매일 자료 {'있음' if m['daily'] else '없음'}")
    print(f"오늘의 리포트 {'있음' if data['report'] else '없음'}")
    print(f"{args.out}/ 준비 완료")


if __name__ == "__main__":
    main()
