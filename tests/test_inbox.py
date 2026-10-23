"""앱 메시지함(inbox.py) 테스트: 보낸 알림을 한 통씩 저장하고, 최근 것부터 읽고, 오래된 건 지워요."""

import datetime as dt
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import inbox  # noqa: E402

NOW = dt.datetime(2026, 10, 23, 18, 5, 0, tzinfo=inbox.KST)


def test_add_only_in_actions_or_inbox_dir(tmp_path, monkeypatch):
    monkeypatch.delenv("INBOX_DIR", raising=False)
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    assert inbox.add("<b>x</b>", "macro", now=NOW) is None  # 내 컴퓨터·테스트에선 안 쌓여요
    monkeypatch.setenv("INBOX_DIR", str(tmp_path))
    path = inbox.add_text("[경기 리포트] 10-23\n확장 국면", "macro", collapse=True)
    item = json.loads(path.read_text(encoding="utf-8"))
    assert item["title"] == "경기 리포트" and item["src"] == "macro"
    assert "<b>경기 리포트</b>" in item["html"]


def test_same_second_makes_two_files_and_load_is_newest_first(tmp_path, monkeypatch):
    monkeypatch.setenv("INBOX_DIR", str(tmp_path))
    a = inbox.add("<b>첫째</b>", "bot", now=NOW)
    b = inbox.add("<b>둘째</b>", "bot", now=NOW)
    c = inbox.add("<b>셋째</b>", "signal", photo=True, now=NOW + dt.timedelta(minutes=1))
    assert len({a, b, c}) == 3
    items = inbox.load(tmp_path, now=NOW)
    assert items[0]["title"] == "셋째" and items[0]["photo"] is True
    assert len(inbox.load(tmp_path, now=NOW, limit=2)) == 2


def test_load_and_prune_skip_old(tmp_path, monkeypatch):
    monkeypatch.setenv("INBOX_DIR", str(tmp_path))
    inbox.add("<b>옛날</b>", "macro", now=NOW - dt.timedelta(days=100))
    inbox.add("<b>두 달 전</b>", "macro", now=NOW - dt.timedelta(days=70))
    inbox.add("<b>오늘</b>", "macro", now=NOW)
    assert [x["title"] for x in inbox.load(tmp_path, now=NOW)] == ["오늘"]
    assert inbox.prune(tmp_path, now=NOW) == 1
    assert len(list(tmp_path.glob("*/*.json"))) == 2
    assert not (tmp_path / (NOW - dt.timedelta(days=100)).strftime("%Y-%m")).exists()  # 빈 달 폴더도 지워요
