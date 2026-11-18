"""지난 리포트 보관함 (사용자 2026-11-17 '리포트 모아둔거 달력으로 만들어서 저장해봐').

오늘의 리포트(report_desks.py)와 주간 리포트(weekly.py)는 paper/report.json·weekly.json을 매번 덮어써요.
그래서 만들 때마다 한 장씩 paper/reports/<년-월>/<날짜>-<시각>-<종류>.json으로 따로 남겨요.
  예) paper/reports/2026-11/2026-11-17-1344-daily-us.json, paper/reports/2026-11/2026-11-14-1553-weekly.json
  오늘의 리포트 끝 kr·us·both = 그 실행에서 새로 받은 장 (daily 워크플로의 MARKETS. 국장 마감 뒤인지 미장 마감 뒤인지)
한 번 만든 리포트에 파일 하나라서 여러 워크플로가 동시에 저장해도 git 충돌이 안 나요.

앱: dashboard.py가 보관함을 _site/reports/로 옮기고 목록(index.json)을 만들어요.
리포트 화면 '📅 지난 리포트' 탭 달력에서 날짜를 누르면 그날 리포트를 그대로 다시 봐요.

지난 기록 채우기: python report_archive.py --backfill
  git에 남은 report.json·weekly.json 예전 판을 하나씩 꺼내 보관함에 넣어요 (이미 있는 건 건너뛰어요).
"""
import argparse
import json
import pathlib
import re
import subprocess

PAPER = pathlib.Path(__file__).resolve().parent / "paper"
KINDS = {"daily": "report.json", "weekly": "weekly.json"}
NAME = re.compile(r"^(\d{4}-\d{2}-\d{2})-(\d{4})-(daily|weekly)(?:-(kr|us|both))?\.json$")


def market_tag(markets):
    """'kr' · 'us' · 'kr us' → 파일 이름 끝 표시 (모르면 빈칸)."""
    ms = set(str(markets or "").replace(",", " ").split()) & {"kr", "us"}
    return "both" if len(ms) == 2 else next(iter(ms), "")


def stamp(r):
    """리포트가 만들어진 날짜·시각 → ('2026-11-17', '1344'). 시각이 없으면 0000."""
    day = str(r.get("day") or "")[:10]
    g = str(r.get("generated") or "")
    hm = g[11:16].replace(":", "") if len(g) >= 16 and g[:10] == day else "0000"
    return day, hm if re.fullmatch(r"\d{4}", hm) else "0000"


def path_for(paper, kind, r, markets=""):
    day, hm = stamp(r)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        return None
    tag = market_tag(markets) if kind == "daily" else ""
    return paper / "reports" / day[:7] / f"{day}-{hm}-{kind}{'-' + tag if tag else ''}.json"


def save(paper, kind, r, markets="", overwrite=True):
    """리포트 한 장을 보관함에 저장해요. 저장한 경로(이미 있어서 건너뛰면 None)."""
    path = path_for(pathlib.Path(paper), kind, r or {}, markets)
    if path is None or (path.exists() and not overwrite):
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return path


def entry(path, r):
    """목록 한 줄: 날짜·시각·종류·파일·첫 줄 요약 (달력·날짜 버튼에 써요)."""
    m = NAME.match(path.name)
    day, hm, kind, tag = m.groups()
    head = [x for x in (r.get("headline") or []) if isinstance(x, str)]
    e = dict(d=day, t=f"{hm[:2]}:{hm[2:]}", k=kind, f=f"{path.parent.name}/{path.name}")
    if tag:
        e["m"] = tag
    if kind == "weekly" and r.get("week"):
        e["w"] = r["week"]
    if head:
        e["h"] = head[0][:80]
    return e


def index(paper):
    """보관함 전체 목록, 최근 것부터."""
    root = pathlib.Path(paper) / "reports"
    rows = []
    for path in root.glob("*/*.json") if root.is_dir() else []:
        if not NAME.match(path.name):
            continue
        try:
            r = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        rows.append(entry(path, r))
    return sorted(rows, key=lambda e: (e["d"], e["t"], e["k"]), reverse=True)


def backfill(paper, repo=None):
    """git에 남은 예전 판을 보관함에 채워요. 새로 넣은 개수."""
    repo = repo or pathlib.Path(paper).resolve().parent
    added = 0
    for kind, name in KINDS.items():
        rel = f"{pathlib.Path(paper).name}/{name}"
        log = subprocess.run(["git", "log", "--format=%H %s", "--", rel], cwd=repo, capture_output=True, text=True,
                             check=True).stdout.splitlines()
        for line in log:
            sha, _, msg = line.partition(" ")
            # 매일 워크플로 커밋 메시지 끝 '(kr)'·'(us)'·'(kr us)'로 어느 장 마감 뒤였는지 알아요
            m = re.search(r"\(((?:kr|us)(?: (?:kr|us))?)\)\s*$", msg)
            out = subprocess.run(["git", "show", f"{sha}:{rel}"], cwd=repo, capture_output=True, text=True)
            if out.returncode:
                continue
            try:
                r = json.loads(out.stdout)
            except ValueError:
                continue
            if isinstance(r, dict) and r.get("headline") and save(paper, kind, r, m.group(1) if m else "", overwrite=False):
                added += 1
    return added


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--paper", type=pathlib.Path, default=PAPER)
    parser.add_argument("--backfill", action="store_true", help="git 기록에서 예전 리포트 채우기")
    args = parser.parse_args()
    if args.backfill:
        print(f"예전 리포트 {backfill(args.paper)}장 채움")
    rows = index(args.paper)
    print(f"보관함 {len(rows)}장 ({rows[-1]['d'] if rows else '-'} ~ {rows[0]['d'] if rows else '-'})")


if __name__ == "__main__":
    main()
