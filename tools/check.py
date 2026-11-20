"""점검 한 번에: 종류를 골라 빠르게 돌려요 (사용자 말로 '백테스트 돌리기').

  python tools/check.py                 # 빠른 점검: map js test data (+ 화면 코드가 바뀌었으면 ui)
  python tools/check.py map             # 고른 종류만 (쉼표로 여러 개: map,js)
  python tools/check.py all             # 전부, 테스트·버튼 점검도 전체로
  python tools/check.py test:all ui:all # 종류 뒤 :all = 그 종류만 전체로

종류
  map   지도 정확도: docs/CODEMAP.md·docs/INFOMAP.md에 적힌 파일·함수·줄 번호·예약 시간·키 이름이 진짜와 맞는지
  js    앱 코드 문법(node --check) + index.html·sw.js·LAZY에 js 파일이 빠짐없이 들어갔는지
  test  파이썬 테스트. 빠르게는 main과 달라진 스크립트의 tests/test_<이름>.py만, :all이면 전부
  data  자료 신선도: paper/*.json·live 브랜치 news.json이 예약대로 새로 만들어졌는지 (늦으면 경고)
  ui    버튼 누르기 점검(tools/jump-audit.js). 빠르게는 --changed, :all이면 전부
  diff  화면 비교: main 코드와 지금 코드로 같은 자료를 그려 화면 사진을 비교 (tools/screen-diff.js)
옵션: --base origin/main (비교 기준) · --strict (자료 늦음도 실패로)
끝나면 종류별 한 줄 요약. 실패가 하나라도 있으면 종료 코드 1.
"""
import datetime as dt
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KST = dt.timezone(dt.timedelta(hours=9))
KINDS = ["map", "js", "test", "data", "ui", "diff"]
FAST = ["map", "js", "test", "data"]


def sh(cmd, **kw):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, **kw)


def changed_files(base):
    r = sh(["git", "diff", "--name-only", f"{base}...HEAD"])
    w = sh(["git", "diff", "--name-only", "HEAD"])
    u = sh(["git", "ls-files", "--others", "--exclude-standard"])
    if r.returncode:
        return None
    return sorted(set((r.stdout + w.stdout + u.stdout).split()))


# ---------------------------------------------------------------- map: 지도 정확도
def js_defs():
    """site/js/*.js에서 맨 왼쪽 정의(function X / const X =)의 이름 → (파일, 줄)."""
    defs = {}
    re_def = re.compile(r"^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=")
    for f in sorted((ROOT / "site/js").glob("*.js")):
        for i, ln in enumerate(f.read_text(encoding="utf-8").split("\n"), 1):
            m = re_def.match(ln)
            if m:
                defs.setdefault(m.group(1) or m.group(2), []).append((f.stem, i))
    return defs


def check_codemap(bad):
    text = (ROOT / "docs/CODEMAP.md").read_text(encoding="utf-8")
    block = re.search(r"## site/js/.*?```\n(.*?)```", text, re.S)
    if not block:
        bad.append("CODEMAP.md에 site/js 코드 블록이 없어요")
        return 0
    defs, n, cur, listed = js_defs(), 0, None, set()
    for ln in block.group(1).split("\n"):
        m = re.match(r"^★?([a-z]+)\.js\s+(.*)", ln)
        if m:
            cur, rest = m.group(1), m.group(2)
            listed.add(cur)
        elif cur and ln.strip():
            rest = ln
        else:
            continue
        last = None  # (~줄)은 그 구역(· 사이)의 첫 이름 자리예요
        for tok in re.finditer(r"\(~(\d+)\)|·|[A-Za-z_$][\w$]*", rest):
            if tok.group(0) == "·":
                last = None
                continue
            if tok.group(1):  # (~줄) 앞 이름이 그 근처에 있는지
                if last and last in defs:
                    lines = [l for f, l in defs[last] if f == cur]
                    if lines and min(abs(l - int(tok.group(1))) for l in lines) > 80:
                        bad.append(f"CODEMAP {cur}.js {last}(~{tok.group(1)}) → 실제 {lines[0]}줄")
                continue
            name = tok.group(0)
            if name not in defs:
                continue
            n += 1
            last = last or name
            files = {f for f, _ in defs[name]}
            if cur not in files:
                bad.append(f"CODEMAP {cur}.js에 {name}이 있다고 했는데 실제는 {', '.join(sorted(files))}.js")
    real = {f.stem for f in (ROOT / "site/js").glob("*.js")}
    for f in sorted(real - listed):
        bad.append(f"CODEMAP에 site/js/{f}.js가 없어요")
    for f in sorted(listed - real):
        bad.append(f"CODEMAP의 {f}.js는 없는 파일이에요")
    lazy = re.search(r"const LAZY = (\{.*?\});", (ROOT / "site/js/core.js").read_text(encoding="utf-8"))
    star = set(re.findall(r"^★([a-z]+)\.js", block.group(1), re.M))
    if lazy:
        lz = set(re.findall(r'"([a-z]+)"', lazy.group(1)))
        if lz != star:
            bad.append(f"CODEMAP ★ 파일 {sorted(star)} ≠ core.js LAZY {sorted(lz)}")
    css = (ROOT / "site/style.css").read_text(encoding="utf-8").split("\n")
    sec = re.search(r"## site/style.css\n(.*?)\n", text)
    for num in re.findall(r"(?:^|· )(\d+)", sec.group(1) if sec else ""):
        if int(num) > len(css):
            bad.append(f"CODEMAP style.css {num}줄 > 파일 {len(css)}줄")
    for py in set(re.findall(r"\b([a-z_]+)\.py\b", text)):
        if not any((ROOT / d / f"{py}.py").exists() for d in (".", "tests", "tools")):
            bad.append(f"CODEMAP의 {py}.py는 없는 파일이에요")
    return n


def check_infomap(bad):
    text = (ROOT / "docs/INFOMAP.md").read_text(encoding="utf-8")
    n = 0
    # 경로: 백틱 안 경로가 진짜 있는지 (빌드 결과 _site/, live 브랜치, 저장소 밖 공유 폴더, 생겼을 때만 있는 파일은 빼요)
    for ln in text.split("\n"):
        if "저장소 밖" in ln:
            continue
        for p in re.findall(r"`([^`\s]+)`", ln):
            if not re.search(r"[/.](py|js|json|md|yml)$|/$", p) or p.startswith("_site/") or p == "news.json" or "*" in p:
                continue
            if "생겼을 때만" in ln and not (ROOT / p).exists():
                continue
            n += 1
            if not (ROOT / p).exists() and not (ROOT / ".github/workflows" / p).exists():
                bad.append(f"INFOMAP 경로 없음: {p}")
    for py in set(re.findall(r"\b([a-z_]+)\.py\b", text)):
        n += 1
        if not (ROOT / f"{py}.py").exists() and not (ROOT / "tools" / f"{py}.py").exists():
            bad.append(f"INFOMAP의 {py}.py는 없는 파일이에요")
    # 예약 시간: 워크플로마다 cron이 지도와 같은지, 빠진 워크플로가 없는지
    wf = {f.name: f.read_text(encoding="utf-8") for f in (ROOT / ".github/workflows").glob("*.yml")}
    listed = set()
    for row in re.findall(r"^\| ([^|]+\.yml[^|]*) \| ([^|]+) \|", text, re.M):
        names = re.findall(r"[\w-]+\.yml", row[0])
        crons = set(re.findall(r"`([^`]+)`", row[1]))
        for name in names:
            listed.add(name)
            if name not in wf:
                bad.append(f"INFOMAP의 {name}은 없는 워크플로예요")
                continue
            real = set(re.findall(r'^\s*-\s*cron:\s*"([^"]+)"', wf[name], re.M))
            n += 1
            if real != crons:
                bad.append(f"INFOMAP {name} 예약 {sorted(crons) or '없음'} ≠ 실제 {sorted(real) or '없음'}")
    for name in sorted(set(wf) - listed):
        bad.append(f"INFOMAP 예약 표에 {name}이 없어요")
    # 비밀 키 이름
    used = set(re.findall(r"secrets\.([A-Z_]+)", "\n".join(wf.values())))
    sec = re.search(r"## 비밀 키 이름.*?\n(.*?)\n", text)
    named = set(re.findall(r"`([A-Z_]+)`", sec.group(1) if sec else ""))
    n += len(used)
    for k in sorted(used - named):
        bad.append(f"INFOMAP 비밀 키 이름에 {k}가 없어요 (워크플로가 씀)")
    for k in sorted(named - used):
        bad.append(f"INFOMAP의 비밀 키 {k}는 워크플로가 안 써요")
    return n


def run_map(full, base):
    bad = []
    n = check_codemap(bad) + check_infomap(bad)
    for b in bad:
        print("  ✗", b)
    return not bad, f"{n}곳 확인, 틀린 곳 {len(bad)}"


# ---------------------------------------------------------------- js: 문법·파일 목록
def run_js(full, base):
    bad, files = [], sorted((ROOT / "site/js").glob("*.js")) + [ROOT / "site/sw.js", ROOT / "site/casebook.js"]
    for f in files:
        r = sh(["node", "--check", str(f)])
        if r.returncode:
            bad.append(f"{f.relative_to(ROOT)} 문법 오류: {(r.stderr.strip().split(chr(10)) or [''])[-1]}")
    names = {f.stem for f in (ROOT / "site/js").glob("*.js")}
    html = set(re.findall(r'src="js/([a-z]+)\.js"', (ROOT / "site/index.html").read_text(encoding="utf-8")))
    lazy = re.search(r"const LAZY = (\{.*?\});", (ROOT / "site/js/core.js").read_text(encoding="utf-8"))
    lz = set(re.findall(r'"([a-z]+)"', lazy.group(1))) if lazy else set()
    sw = re.search(r"const APP_JS = \[(.*?)\]", (ROOT / "site/sw.js").read_text(encoding="utf-8"))
    swl = set(re.findall(r'"([a-z]+)"', sw.group(1))) if sw else set()
    for f in sorted(names - html - lz):
        bad.append(f"js/{f}.js를 index.html도 LAZY도 안 불러요")
    for f in sorted(names - swl):
        bad.append(f"js/{f}.js가 sw.js APP_JS에 없어요 (오프라인 캐시 빠짐)")
    for f in sorted((html | lz | swl) - names):
        bad.append(f"js/{f}.js를 부르는데 파일이 없어요")
    for b in bad:
        print("  ✗", b)
    return not bad, f"파일 {len(files)}개, 문제 {len(bad)}"


# ---------------------------------------------------------------- test: 파이썬 테스트
def run_test(full, base):
    cmd = [sys.executable, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider"]
    if not full:
        ch = changed_files(base)
        if ch is not None and not any(f in ("requirements.txt", "conftest.py") or f.startswith("tests/conftest") for f in ch):
            pick = set()
            for f in ch:
                m = re.match(r"(?:tests/test_)?([a-z_]+)\.py$", f)
                if m and (ROOT / f"tests/test_{m.group(1)}.py").exists():
                    pick.add(f"tests/test_{m.group(1)}.py")
                if f.startswith("site/js/search") and (ROOT / "tests/test_search_js.py").exists():
                    pick.add("tests/test_search_js.py")
                if f.startswith("site/") and (ROOT / "tests/test_dashboard.py").exists():
                    pick.add("tests/test_dashboard.py")
            if not pick:
                return True, f"{base}와 달라진 스크립트 없음 → 건너뜀 (전부: test:all)"
            cmd += sorted(pick)
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    tail = [l for l in r.stdout.strip().split("\n") if l.strip()]
    if r.returncode:
        print("\n".join("  " + l for l in tail[-25:]))
    return r.returncode == 0, (tail[-1] if tail else "결과 없음") + ("" if full else " (달라진 것만)")


# ---------------------------------------------------------------- data: 자료 신선도
# (파일, 시각 칸, 허용 시간) 허용 시간은 예약 + GitHub 늦음(몇 시간) + 주말을 넣었어요
FRESH = [
    ("paper/kr/daily.json", "generated", 80), ("paper/us/daily.json", "generated", 80),
    ("paper/kr/flows.json", "updated", 80), ("paper/report.json", "generated", 80),
    ("paper/learn_cases.json", "updated", 80), ("paper/reading.json", "updated", 80),
    ("paper/macro.json", "generated", 36), ("paper/calendar.json", "updated", 36),
    ("paper/policy_news.json", "day", 48), ("paper/world.json", "updated", 80),
    ("paper/events.json", "updated", 48), ("paper/weekly.json", "generated", 24 * 9),
    ("paper/kr/fundamentals.json", "updated", 24 * 9), ("paper/symbols/kr.json", "updated", 24 * 9),
    ("paper/sectors.json", "updated", 24 * 9), ("paper/health.json", "checked", 24 * 9),
]


def when(v):
    v = str(v)
    for fmt in ("%Y-%m-%dT%H:%M%z", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d"):
        try:
            t = dt.datetime.strptime(v, fmt)
            return t if t.tzinfo else t.replace(hour=23, minute=59, tzinfo=KST)
        except ValueError:
            pass
    return None


def run_data(full, base, strict=False):
    now, broken, late, rows = dt.datetime.now(KST), [], [], []
    for path, key, hours in FRESH:
        f = ROOT / path
        if not f.exists():
            broken.append(f"{path} 없음")
            continue
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except ValueError as e:
            broken.append(f"{path} JSON 깨짐: {e}")
            continue
        t = when(d.get(key)) if isinstance(d, dict) else None
        if not t:
            broken.append(f"{path} '{key}' 시각 없음")
            continue
        age = (now - t).total_seconds() / 3600
        rows.append((path, age, hours))
        if age > hours:
            late.append(f"{path} {age:.0f}시간 전 (허용 {hours}시간)")
    # 장중 뉴스: live 브랜치 news.json (30분마다)
    r = sh(["git", "fetch", "-q", "--depth=1", "origin", "live"], timeout=60)
    if r.returncode == 0:
        try:
            d = json.loads(sh(["git", "show", "FETCH_HEAD:news.json"]).stdout)
            t = when(d.get("updated") or d.get("generated"))
            if t:
                age = (now - t).total_seconds() / 3600
                rows.append(("live:news.json", age, 3))
                if age > 3:
                    late.append(f"live:news.json {age:.1f}시간 전 (허용 3시간)")
        except ValueError:
            broken.append("live:news.json JSON 깨짐")
    else:
        print("  · live 브랜치를 못 받아 뉴스는 건너뜀")
    for p, age, h in rows:
        mark = "🟢" if age <= h else "🔴"
        if full or age > h:
            print(f"  {mark} {p}: {age:.1f}시간 전 (허용 {h})")
    for b in broken:
        print("  ✗", b)
    for l in late:
        print("  ⚠", l)
    ok = not broken and (not late or not strict)
    return ok, f"{len(rows)}개 중 늦음 {len(late)} · 깨짐 {len(broken)}" + (" (늦음은 경고, --strict면 실패)" if late and not strict else "")


# ---------------------------------------------------------------- ui·diff: 앱 빌드해서 브라우저로
def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def build_and_serve(site=None, tmp=None):
    out = Path(tempfile.mkdtemp(prefix="site-", dir=tmp))
    cmd = [sys.executable, "dashboard.py", "--out", str(out)] + (["--site", str(site)] if site else [])
    r = sh(cmd)
    if r.returncode:
        raise RuntimeError("dashboard.py 실패: " + r.stderr.strip()[-300:])
    port = free_port()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"], cwd=out,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        try:
            socket.create_connection(("127.0.0.1", port), 0.2).close()
            break
        except OSError:
            time.sleep(0.1)
    return srv, f"http://127.0.0.1:{port}/"


def run_ui(full, base):
    srv, url = build_and_serve()
    try:
        cmd = ["node", "tools/jump-audit.js", "--base-url", url, "--base", base] + ([] if full else ["--changed"])
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    finally:
        srv.terminate()
    lines = [l for l in r.stdout.strip().split("\n") if l.strip()]
    if "허용 목록에 없는 문제:" in lines:  # 허용 목록에 있는 건(일부러 움직이는 버튼) 안 보여요
        for l in lines[lines.index("허용 목록에 없는 문제:") + 1:][:30]:
            print("  ", l.strip())
    return r.returncode == 0, (lines[-1] if lines else r.stderr.strip()[-200:]) + ("" if full else " (빠른 점검)")


def run_diff(full, base):
    tmp = Path(tempfile.mkdtemp(prefix="screen-diff-"))
    wt = tmp / "base"
    r = sh(["git", "worktree", "add", "-q", "--detach", str(wt), base])
    if r.returncode:
        return False, "기준 코드 못 꺼냄: " + r.stderr.strip()[-200:]
    a = b = None
    try:
        a, url_a = build_and_serve(wt / "site", tmp)
        b, url_b = build_and_serve(None, tmp)
        out = ROOT / "_screen-diff"
        cmd = ["node", "tools/screen-diff.js", url_a, url_b, str(out)] + ([] if full else ["--quick"])
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    finally:
        for s in (a, b):
            if s:
                s.terminate()
        sh(["git", "worktree", "remove", "--force", str(wt)])
    lines = [l for l in r.stdout.strip().split("\n") if l.strip()]
    for l in lines[:-1]:
        print("  ", l)
    return r.returncode == 0, (lines[-1] if lines else r.stderr.strip()[-200:])


RUN = {"map": run_map, "js": run_js, "test": run_test, "data": run_data, "ui": run_ui, "diff": run_diff}


def main(argv):
    if "-h" in argv or "--help" in argv:
        print(__doc__)
        return 0
    base, strict, picks = "origin/main", False, []
    it = iter(argv)
    for a in it:
        if a == "--base":
            base = next(it)
        elif a == "--strict":
            strict = True
        else:
            picks += [x for x in a.split(",") if x]
    if not picks:
        jobs = [(k, False) for k in FAST]
        ch = changed_files(base) or []
        if any(f.startswith("site/") or f == "dashboard.py" or f.startswith("tools/jump-audit") for f in ch):
            jobs.append(("ui", False))
    elif "all" in picks:
        jobs = [(k, True) for k in KINDS]
    else:
        jobs = []
        for p in picks:
            k, _, mode = p.partition(":")
            if k not in RUN:
                print(f"모르는 종류: {k} (가능: {', '.join(KINDS)}, all)")
                return 2
            jobs.append((k, mode == "all"))
    summary, fail = [], False
    for k, full in jobs:
        t0 = time.time()
        print(f"▶ {k}{' (전체)' if full else ''}")
        try:
            ok, msg = RUN[k](full, base, strict) if k == "data" else RUN[k](full, base)
        except Exception as e:  # 점검 도구가 깨져도 나머지는 계속
            ok, msg = False, f"점검 실패: {e}"
        fail |= not ok
        summary.append(f"{'✅' if ok else '❌'} {k:<5} {time.time() - t0:5.1f}초  {msg}")
    print("\n" + "\n".join(summary))
    return 1 if fail else 0


if __name__ == "__main__":
    os.chdir(ROOT)
    sys.exit(main(sys.argv[1:]))
