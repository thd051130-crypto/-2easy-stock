import json

import watchlist as wl


def test_missing_or_broken_files_give_empty_defaults(tmp_path):
    assert wl.load_watch(tmp_path) == dict(kr=[], us=[])
    assert wl.load_alerts(tmp_path) == dict(next=1, active=[], done=[])
    assert wl.bot_username(tmp_path) is None
    (tmp_path / "watch.json").write_text("{깨진 파일")
    (tmp_path / "bot.json").write_text("[1, 2]")
    assert wl.load_watch(tmp_path) == dict(kr=[], us=[]) and wl.bot_username(tmp_path) is None


def test_extras_keep_order_and_skip_bad_rows(tmp_path):
    wl.write(tmp_path / "watch.json", dict(kr=[dict(code="293490", name="카카오게임즈"), "이상한 줄", dict(name="코드 없음"),
                                               dict(code="035720", name="카카오")]))
    assert list(wl.extras("kr", tmp_path)) == ["293490", "035720"] and wl.extras("us", tmp_path) == {}
    wl.write(tmp_path / "alerts.json", dict(next=3, active=[dict(id=2)]))
    assert wl.load_alerts(tmp_path) == dict(next=3, active=[dict(id=2)], done=[])
    wl.write(tmp_path / "bot.json", dict(username="Automarmae_bot"))
    assert wl.bot_username(tmp_path) == "Automarmae_bot"
    assert json.loads((tmp_path / "watch.json").read_text())["kr"][0]["name"] == "카카오게임즈"
