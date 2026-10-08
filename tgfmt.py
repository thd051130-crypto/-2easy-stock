"""텔레그램 메시지를 폰에서 보기 좋게 바꿔요 (HTML: 굵은 제목·이모지·눌러서 펼치는 접기).

알림 글은 지금처럼 "[제목] 부제" 줄로 구획을 나눠 쓰면 돼요. 여기서
  - [제목] 줄 → 이모지 + 굵은 제목 (부제는 기울임)
  - "1. 종목명 …" → 종목명 굵게, "▲ …"/"▼ …" 소제목 굵게, "· 부서: …" 앞부분 굵게
  - collapse=True면 둘째 구획부터 본문을 접어 둬요 (텔레그램 expandable blockquote, 눌러야 펼쳐져요)
로 바꾸고, 한 메시지 4096자 제한에 맞게 구획 단위로 나눠요. 표준 라이브러리만 써요.
"""

import html
import re

LIMIT = 3900  # 텔레그램 한 메시지 4096자 (태그는 글자 수에 안 들어가지만 넉넉하게)
CAPTION_LIMIT = 1000  # 사진 설명 1024자
DIVIDER = "━━━━━━━━━━━━━━"
APP_URL = "https://thd051130-crypto.github.io/-2easy-stock/"

ICONS = [("국장 신호", "🇰🇷"), ("미장 신호", "🇺🇸"), ("신호 자세히", "🔍"), ("규칙표", "📋"), ("부서별", "🏢"),
         ("넓은 범위", "🔭"), ("왜 움직였나", "🔥"), ("업종", "🏭"), ("데이터 점검", "⚠️"), ("주간 결산", "📊"),
         ("가상매매", "💼"), ("경기", "🌡️"), ("미국 경제", "🇺🇸"), ("학습팀", "🧠"), ("고장", "🚨"),
         ("주간 점검", "🩺"), ("종목 진단", "🔎"), ("내 판단", "📝"), ("가격 알림", "🔔"), ("관심", "⭐")]
HEADER = re.compile(r"^\[([^\]]+)\]\s*(.*)$")
NUMBERED = re.compile(r"^(\s*\d+\.\s)(\S+)(.*)$")
DEPT = re.compile(r"^(\s*·\s)([^:：]{1,14}[:：])(.*)$")


def esc(text):
    return html.escape(str(text), quote=False)


def icon(title):
    return next((e for key, e in ICONS if key in title), "📌")


def plain(text):
    """HTML → 보통 글 (HTML 전송이 거절됐을 때 대신 보내요)."""
    text = re.sub(r"<a href=\"([^\"]*)\">([^<]*)</a>", r"\2 (\1)", text)
    return html.unescape(re.sub(r"<[^>]+>", "", text))


def sections(text):
    """보통 글 → [(제목 또는 None, 부제, 본문 줄 목록)]. 제목 줄 앞의 글은 제목 없는 구획이에요."""
    out = []
    for line in text.split("\n"):
        m = HEADER.match(line)
        if m:
            out.append((m.group(1).strip(), m.group(2).strip(), []))
        elif out:
            out[-1][2].append(line)
        else:
            out.append((None, "", [line]))
    return [(t, s, trim(body)) for t, s, body in out if t or any(x.strip() for x in body)]


def trim(lines):
    while lines and not lines[0].strip():
        lines = lines[1:]
    while lines and not lines[-1].strip():
        lines = lines[:-1]
    return lines


def line_html(line):
    s = line.rstrip()
    if s.lstrip().startswith(("▲", "▼")):
        return f"<b>{esc(s)}</b>"
    m = NUMBERED.match(s) or DEPT.match(s)
    if m:
        return f"{esc(m.group(1))}<b>{esc(m.group(2))}</b>{esc(m.group(3))}"
    return esc(s)


def head_html(title, sub=""):
    head = f"{icon(title)} <b>{esc(title)}</b>"
    return head + (f"\n<i>{esc(sub)}</i>" if sub else "")


def blocks(text, collapse=False, open_first=True):
    """보통 글 → [(머리, 본문 줄(HTML) 목록, 접기 여부)]."""
    out = []
    for i, (title, sub, body) in enumerate(sections(text)):
        folded = collapse and not (open_first and i == 0) and bool(body)
        head = head_html(title, "" if folded else sub) if title else ""
        lines = ([f"<i>{esc(sub)}</i>"] if folded and sub else []) + [line_html(x) for x in body]
        out.append((head, lines, folded))
    return out


def block_html(head, lines, folded):
    body = "\n".join(lines)
    if folded and body:
        body = f"<blockquote expandable>{body}</blockquote>"
    return "\n".join(x for x in (head, body) if x)


def pack(items, limit=LIMIT):
    """(머리, 줄, 접기) 구획들을 한 메시지 limit자 이하 조각으로 묶어요. 긴 구획은 줄 단위로 쪼개요."""
    pieces = []
    for head, lines, folded in items:
        chunk, size = [], len(head)
        for line in lines:
            if chunk and size + len(line) + 40 > limit:
                pieces.append(block_html(head, chunk, folded))
                head, chunk, size = "", [], 0
            chunk.append(line)
            size += len(line) + 1
        pieces.append(block_html(head, chunk, folded))
    parts, current = [], ""
    for piece in pieces:
        if current and len(current) + len(piece) + 2 > limit:
            parts.append(current)
            current = ""
        current = f"{current}\n\n{piece}" if current else piece
    return [p for p in parts + [current] if p.strip()]


def render(text, collapse=False, limit=LIMIT, open_first=True):
    """보통 글 → 보낼 HTML 메시지 목록."""
    return pack(blocks(text, collapse, open_first), limit)


def compose(summary, detail_text, limit=LIMIT):
    """맨 위 요약(HTML, 펼쳐 둠) + 자세한 글(구획마다 접기) → 보낼 HTML 메시지 목록.
    summary가 비어 있으면(사진 설명으로 이미 보냈으면) 자세한 글만."""
    items = blocks(detail_text, collapse=True, open_first=False)
    if items:
        items[0] = ("👇 <i>자세한 내용은 눌러서 펼쳐 보세요</i>\n" + items[0][0], *items[0][1:])
    if summary:
        items = [(summary, [], False)] + items
    return pack(items, limit)


def link(label, url=APP_URL):
    return f'<a href="{esc(url)}">{esc(label)}</a>'


def pct(x, digits=1):
    return f"{x:+.{digits}%}"
