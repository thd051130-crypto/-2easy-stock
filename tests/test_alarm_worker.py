"""클라우드플레어 정시 알람(cloudflare/feedback-worker.js)과 sched-gate가 워크플로 예약 시각과 맞는지 봐요 (node가 없으면 알람 표 확인은 건너뛰어요)."""
import json
import pathlib
import re
import shutil
import subprocess

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
WF = ROOT / ".github" / "workflows"


def crons():
    """워크플로 파일 → schedule cron 목록 (sched-gate를 쓰는 것만)."""
    out = {}
    for p in sorted(WF.glob("*.yml")):
        found = re.findall(r'^\s*- cron: "([^"]+)"', p.read_text(), re.M)  # yaml 패키지 없이 읽어요
        if found:
            out[p.name] = found
    return out


def expand(cron):
    """cron → {(요일, 'HH:MM')} 5분 단위로 반올림 (알람이 5분마다 깨어나요)."""
    m, h, _, _, dow = cron.split()

    def nums(f, hi):
        r = set()
        for part in f.split(","):
            if part == "*":
                r |= set(range(hi + 1))
            elif "-" in part:
                a, b = map(int, part.split("-"))
                r |= set(range(a, b + 1))
            else:
                r.add(int(part))
        return r

    slots = set()
    for d in nums(dow, 6):
        for hh in nums(h, 23):
            for mm in nums(m, 59):
                t = (hh * 60 + round(mm / 5) * 5) % 1440
                slots.add((d % 7, f"{t // 60:02d}:{t % 60:02d}"))
    return slots


def test_every_scheduled_workflow_has_gate():
    for name in crons():
        s = (WF / name).read_text()
        assert "uses: ./.github/workflows/sched-gate.yml" in s, name
        assert f"workflow: {name}" in s, name
        assert "needs.gate.outputs.skip != 'true'" in s, name


@pytest.mark.skipif(not shutil.which("node"), reason="node 없음")
def test_alarm_table_matches_workflow_schedules():
    prog = (
        "import(process.argv[1]).then((m) => { const J = m.default._alarm.JOBS;"
        " console.log(JSON.stringify(J.map((j) => ({ wf: j.wf, at: j.at, days: j.days })))); })"
    )
    r = subprocess.run(["node", "-e", prog, str(ROOT / "cloudflare" / "feedback-worker.js")],
                       capture_output=True, text=True, check=True)
    table = {}
    for j in json.loads(r.stdout):
        table.setdefault(j["wf"], set()).update((d, t) for d in j["days"] for t in j["at"])
    want = {name: set().union(*map(expand, cs)) for name, cs in crons().items()}
    assert set(table) == set(want)
    for name in want:
        assert table[name] == want[name], name
