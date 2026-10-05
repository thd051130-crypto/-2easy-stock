"""텔레그램 봇으로 넣은 관심종목(대시보드 목록 밖 종목)과 가격 알림 기록을 읽고 써요.

  - paper/watch.json : {"kr": [{"code", "name", "symbol", "exch", "kind", "added"}], "us": [...]}
  - paper/alerts.json: {"next": 다음 알림 번호, "active": [기다리는 알림], "done": [최근 울린 알림]}
  - paper/bot.json   : {"username": 봇 아이디}  (웹앱의 텔레그램 시작 링크에 써요)
대시보드 화면(시세·차트·재무제표)에만 쓰고, 매매 신호·가상매매(paper_trade) 종목에는 안 넣어요.
네트워크·pandas 없이 읽고 써요 (dashboard.py도 써요).
"""

import json
import pathlib

PAPER = pathlib.Path("paper")
MAX_EXTRAS = 30   # 시장마다 넣을 수 있는 종목 수 (배포 때 종목마다 시세를 받아서 너무 많으면 느려져요)
MAX_ALERTS = 20   # 기다리는 알림 수
KEEP_DONE = 20    # 울린 알림은 최근 것만 남겨요


def read(path, default):
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return default
    return data if isinstance(data, dict) else default


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")


def load_watch(paper=None):
    w = read((paper or PAPER) / "watch.json", {})
    return {m: [e for e in (w.get(m) or []) if isinstance(e, dict) and e.get("code")] for m in ("kr", "us")}


def extras(market, paper=None):
    """{코드: 정보}, 넣은 순서대로."""
    return {e["code"]: e for e in load_watch(paper)[market]}


def load_alerts(paper=None):
    a = read((paper or PAPER) / "alerts.json", {})
    return dict(next=int(a.get("next") or 1), active=list(a.get("active") or []), done=list(a.get("done") or []))


def bot_username(paper=None):
    return read((paper or PAPER) / "bot.json", {}).get("username")
