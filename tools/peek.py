"""필요한 부분만 보기: 큰 파일을 통째로 안 열고 함수 하나·JSON 모양·CSS 규칙만 찍어요 (Claude 토큰 아끼기).

  python tools/peek.py goalCard              # 함수·상수 하나: site/js/*.js · *.py · tools/에서 찾아 그 정의만 (최대 120줄)
  python tools/peek.py goalCard --max 40     # 줄 수 제한
  python tools/peek.py paper/report.json     # JSON 모양만: 키·종류·목록 길이 (값은 안 찍음)
  python tools/peek.py paper/report.json desks.0.title   # 그 자리 값만 (길면 자름)
  python tools/peek.py site/style.css .goal-top          # 그 선택자가 든 CSS 규칙만
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOP = re.compile(r"^(?:async\s+)?function\s|^(?:const|let|var)\s+[\w$]+\s*=|^def\s|^class\s|^// -{4,}|^# -{4,}|^@")


def find_def(name):
    pat = re.compile(
        rf"^(?:async\s+)?function\s+{re.escape(name)}\b|^(?:const|let|var)\s+{re.escape(name)}\s*=|^(?:async\s+)?def\s+{re.escape(name)}\b|^class\s+{re.escape(name)}\b"
    )
    files = sorted((ROOT / "site/js").glob("*.js")) + [ROOT / "site/sw.js"] + sorted(ROOT.glob("*.py")) + sorted((ROOT / "tools").glob("*.py")) + sorted((ROOT / "tools").glob("*.js"))
    hits = []
    for f in files:
        if not f.exists():
            continue
        lines = f.read_text(encoding="utf-8").split("\n")
        for i, ln in enumerate(lines):
            if pat.match(ln):
                hits.append((f, i, lines))
    return hits


def show_def(name, cap):
    hits = find_def(name)
    if not hits:
        print(f"{name}: 정의를 못 찾았어요 (맨 왼쪽 function/const/def/class만 찾아요). grep -n \"{name}\" 로 찾아 보세요.")
        return 1
    if len(hits) > 1:
        print("여러 곳: " + " · ".join(f"{f.relative_to(ROOT)}:{i + 1}" for f, i, _ in hits))
    f, i, lines = hits[0]
    end = i + 1
    while end < len(lines) and not TOP.match(lines[end]):
        end += 1
    while end > i + 1 and not lines[end - 1].strip():
        end -= 1
    stop = min(end, i + cap)
    print(f"{f.relative_to(ROOT)}:{i + 1}-{end} ({end - i}줄{f', 앞 {cap}줄만' if end > stop else ''})")
    for n in range(i, stop):
        print(f"{n + 1:>5} {lines[n][:240]}")
    return 0


def shape(v, depth=0, maxd=3):
    pad = "  " * depth
    if isinstance(v, dict):
        if depth >= maxd:
            return [f"{pad}{{…{len(v)}개 키}}"]
        out = []
        keys = list(v)
        for k in keys[:25]:
            x = v[k]
            if isinstance(x, (dict, list)):
                out.append(f"{pad}{k}: {kind(x)}")
                out += shape(x, depth + 1, maxd)
            else:
                out.append(f"{pad}{k}: {kind(x)}")
        if len(keys) > 25:
            out.append(f"{pad}… 키 {len(keys) - 25}개 더")
        return out
    if isinstance(v, list) and v and isinstance(v[0], (dict, list)):
        return [f"{pad}[0] 모양:"] + shape(v[0], depth + 1, maxd + 1)
    return []


def kind(x):
    if isinstance(x, dict):
        return f"객체 {len(x)}키"
    if isinstance(x, list):
        inner = type(x[0]).__name__ if x else "-"
        return f"목록 {len(x)}개 ({inner})"
    if isinstance(x, str):
        return f"글 {len(x)}자"
    return type(x).__name__


def show_json(path, where):
    d = json.loads(path.read_text(encoding="utf-8"))
    if where:
        for part in where.split("."):
            d = d[int(part)] if isinstance(d, list) else d[part]
        s = json.dumps(d, ensure_ascii=False)
        print(s[:2000] + (f" … (총 {len(s)}자)" if len(s) > 2000 else ""))
        return 0
    print(f"{path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}: {path.stat().st_size // 1024}KB · {kind(d)}")
    print("\n".join(shape(d)[:80]))
    return 0


def show_css(path, sel, cap):
    lines = path.read_text(encoding="utf-8").split("\n")
    out = [f"{i + 1:>5} {ln[:240]}" for i, ln in enumerate(lines) if sel in ln]
    print(f"{path.name}: '{sel}' {len(out)}줄" + (f" (앞 {cap}줄만)" if len(out) > cap else ""))
    print("\n".join(out[:cap]))
    return 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cap = 120
    if "--max" in argv:
        k = argv.index("--max")
        cap = int(argv[k + 1])
        argv = argv[:k] + argv[k + 2:]
    target, rest = argv[0], argv[1] if len(argv) > 1 else None
    p = Path(target) if Path(target).is_absolute() else ROOT / target
    if p.suffix == ".json" and p.exists():
        return show_json(p, rest)
    if p.suffix == ".css" and p.exists():
        if not rest:
            print("CSS는 선택자를 같이 적어 주세요. 구역 줄 번호는 docs/CODEMAP.md 'site/style.css'.")
            return 1
        return show_css(p, rest, min(cap, 60))
    return show_def(target, cap)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
