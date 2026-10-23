"""텔레그램으로 보낸 알림을 앱(이지스톡 메시지함)에서도 볼 수 있게 한 통씩 저장해요.

보낼 때마다 paper/inbox/<년-월>/<일시>-<보낸 곳>.json 파일 하나를 만들어요.
  - 한 통에 파일 하나라서, 여러 워크플로가 동시에 저장해도 git 충돌이 안 나요.
  - 내용은 텔레그램에 보낸 HTML 그대로 (굵게·기울임·링크·눌러서 펼치기). 사진은 설명 글만 남겨요.
  - GitHub Actions에서 돌 때만 저장해요 (내 컴퓨터 시험·테스트에서는 안 쌓여요). INBOX_DIR로 폴더를 바꿀 수 있어요.
dashboard.py가 최근 것들을 모아 앱의 inbox.json으로 만들고, health.py 주간 점검이 오래된 파일을 지워요.
표준 라이브러리만 써요 (health 워크플로는 패키지를 안 깔아요).
"""

import datetime as dt
import json
import os
import pathlib
import re

import tgfmt

KST = dt.timezone(dt.timedelta(hours=9))
DIR = pathlib.Path("paper/inbox")
KEEP_DAYS = 90   # 이보다 오래된 파일은 주간 점검이 지워요
SHOW_DAYS = 60   # 앱에는 최근 60일
SHOW_MAX = 200   # 앱에는 최대 200통
TITLE = re.compile(r"<b>([^<]{1,60})</b>")


def folder():
    path = os.getenv("INBOX_DIR")
    if path:
        return pathlib.Path(path)
    return DIR if os.getenv("GITHUB_ACTIONS") == "true" else None


def title_of(html):
    """첫 굵은 글씨(보통 '[국장 신호]' 제목)를 제목으로. 없으면 첫 줄."""
    m = TITLE.search(html)
    text = tgfmt.plain(m.group(1) if m else html).strip().split("\n")[0]
    return text[:60] or "알림"


def add(html, source, photo=False, now=None):
    """보낸 HTML 한 통 저장. 저장 안 하면(Actions 밖) None, 하면 파일 경로."""
    root = folder()
    if root is None or not str(html or "").strip():
        return None
    now = now or dt.datetime.now(KST)
    month = root / now.strftime("%Y-%m")
    month.mkdir(parents=True, exist_ok=True)
    stem = f"{now:%Y%m%d-%H%M%S}-{re.sub(r'[^a-z0-9_-]', '', source.lower()) or 'etc'}"
    path, n = month / f"{stem}.json", 1
    while path.exists():  # 같은 초에 여러 통
        n += 1
        path = month / f"{stem}-{n}.json"
    item = {"t": now.isoformat(timespec="seconds"), "src": source, "title": title_of(html), "html": html}
    if photo:
        item["photo"] = True
    path.write_text(json.dumps(item, ensure_ascii=False), encoding="utf-8")
    return path


def add_text(text, source, collapse=False):
    """보통 글(tgfmt 형식, '[제목] 부제' 줄) → 텔레그램과 같은 HTML로 바꿔 한 통으로 저장."""
    return add("\n\n".join(tgfmt.render(text, collapse, limit=10**9)), source)


def load(root=DIR, now=None, days=SHOW_DAYS, limit=SHOW_MAX):
    """최근 것부터 [{t, src, title, html}]. 깨진 파일은 건너뛰어요."""
    root = pathlib.Path(root)
    if not root.is_dir():
        return []
    cutoff = ((now or dt.datetime.now(KST)) - dt.timedelta(days=days)).strftime("%Y%m%d")
    out = []
    for path in sorted(root.glob("*/*.json"), key=lambda p: p.name, reverse=True):
        if path.name[:8] < cutoff or len(out) >= limit:
            break
        try:
            out.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            continue
    return out


def prune(root=DIR, now=None, days=KEEP_DAYS):
    """오래된 파일과 빈 달 폴더를 지워요. 반환: 지운 파일 수."""
    root = pathlib.Path(root)
    if not root.is_dir():
        return 0
    cutoff = ((now or dt.datetime.now(KST)) - dt.timedelta(days=days)).strftime("%Y%m%d")
    gone = 0
    for path in root.glob("*/*.json"):
        if path.name[:8] < cutoff:
            path.unlink()
            gone += 1
    for month in root.iterdir():
        if month.is_dir() and not any(month.iterdir()):
            month.rmdir()
    return gone
