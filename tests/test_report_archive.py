"""지난 리포트 보관함(report_archive.py) 테스트: 한 장씩 따로 남기고, 목록은 최근 것부터, git 예전 판 채우기."""

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import report_archive  # noqa: E402


def rep(day, t, head="요약"):
    return dict(day=day, generated=f"{day}T{t}+09:00", headline=[head, "둘째 줄"])


def test_save_names_by_day_time_kind_and_market(tmp_path):
    p = report_archive.save(tmp_path, "daily", rep("2026-11-17", "13:44"), "us")
    assert p == tmp_path / "reports" / "2026-11" / "2026-11-17-1344-daily-us.json"
    assert json.loads(p.read_text(encoding="utf-8"))["headline"][0] == "요약"
    assert report_archive.save(tmp_path, "daily", rep("2026-11-17", "17:40"), "kr us").name == "2026-11-17-1740-daily-both.json"
    assert report_archive.save(tmp_path, "weekly", rep("2026-11-14", "09:31"), "kr").name == "2026-11-14-0931-weekly.json"
    assert report_archive.save(tmp_path, "daily", dict(headline=["날짜 없음"])) is None
    assert report_archive.save(tmp_path, "daily", rep("2026-11-17", "13:44"), "us", overwrite=False) is None


def test_index_newest_first_with_short_fields(tmp_path):
    report_archive.save(tmp_path, "daily", rep("2026-11-13", "11:48", "금요일"), "us")
    report_archive.save(tmp_path, "weekly", dict(rep("2026-11-14", "15:53", "주간"), week=["2026-11-10", "2026-11-14"]))
    report_archive.save(tmp_path, "daily", rep("2026-11-14", "01:45"), "kr")
    (tmp_path / "reports" / "2026-11" / "junk.json").write_text("{}")
    (tmp_path / "reports" / "2026-11" / "2026-11-15-0000-daily.json").write_text("깨짐")
    rows = report_archive.index(tmp_path)
    assert [(e["d"], e["t"], e["k"]) for e in rows] == [("2026-11-14", "15:53", "weekly"), ("2026-11-14", "01:45", "daily"), ("2026-11-13", "11:48", "daily")]
    assert rows[0]["w"] == ["2026-11-10", "2026-11-14"] and "m" not in rows[0]
    assert rows[1]["m"] == "kr" and rows[1]["f"] == "2026-11/2026-11-14-0145-daily-kr.json"
    assert rows[2]["h"] == "금요일"
    assert report_archive.index(tmp_path / "없음") == []


def test_backfill_reads_old_versions_from_git(tmp_path):
    paper = tmp_path / "paper"
    paper.mkdir()
    git = lambda *a: subprocess.run(["git", *a], cwd=tmp_path, check=True, capture_output=True)  # noqa: E731
    git("init", "-q")
    git("config", "user.email", "t@t"); git("config", "user.name", "t")
    for day, t, msg in [("2026-11-12", "01:34", "매일 자료·리포트 2026-11-12 (kr)"), ("2026-11-12", "12:17", "매일 자료·리포트 2026-11-12 (us)")]:
        (paper / "report.json").write_text(json.dumps(rep(day, t)), encoding="utf-8")
        git("add", "."); git("commit", "-qm", msg)
    (paper / "weekly.json").write_text(json.dumps(rep("2026-11-14", "15:53")), encoding="utf-8")
    git("add", "."); git("commit", "-qm", "주간 리포트 2026-11-14")
    assert report_archive.backfill(paper, tmp_path) == 3
    names = sorted(p.name for p in (paper / "reports").rglob("*.json"))
    assert names == ["2026-11-12-0134-daily-kr.json", "2026-11-12-1217-daily-us.json", "2026-11-14-1553-weekly.json"]
    assert report_archive.backfill(paper, tmp_path) == 0  # 두 번 돌려도 그대로
