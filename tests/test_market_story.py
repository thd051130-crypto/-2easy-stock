import market_story as ms


def series(sym, name, closes, start=1):
    dates = [f"2026-{9 + (i // 28):02d}-{1 + i % 28:02d}" for i in range(len(closes))]
    return dict(sym=sym, name=name, dates=dates, closes=closes)


def calm(n, base=100.0, wiggle=0.002):
    return [base * (1 + wiggle * (1 if i % 2 else -1)) for i in range(n)]


def make_inputs(sox_jump=0.06, kospi_move=0.04, chip_r1=0.06):
    n = 60
    sox = calm(n)
    sox[-2] = sox[-3] * (1 + sox_jump)  # 국장 날짜엔 미국 자료를 그 전날 것으로 봐요
    sox[-1] = sox[-2]
    ks = calm(n)
    ks[-1] = ks[-2] * (1 + kospi_move)
    world = dict(groups=[dict(name="x", items=[series("^SOX", "필라델피아 반도체", sox), series("^KS11", "코스피", ks),
                                              series("^KQ11", "코스닥", ks[:])])])
    day = world["groups"][0]["items"][1]["dates"][-1]
    sectors = [dict(name="반도체", r1=chip_r1, r5=0.05, r20=0.02), dict(name="IT·전자", r1=chip_r1, r5=0.04, r20=-0.2),
               dict(name="2차전지", r1=0.09, r5=0.05, r20=-0.21, day_best=dict(code="A", name="에이", r1=0.1, r20=-0.2),
                    day_worst=dict(code="B", name="비", r1=-0.05, r20=0.3))]
    return dict(world=world, signals={"kr": dict(day=day, sectors=sectors)}, events=[], calendar=[], flows={})


def test_chip_chain_confirmed_relative_to_index():
    s = ms.build(make_inputs())["kr"]
    chip = next(c for c in s["chains"] if c["key"] == "chip")
    assert chip["verdict"] == "확인"
    assert "반도체" in s["title"]
    kinds = {x["kind"] for x in s["expect"]}
    assert "bad_priced" in kinds and "alone_down" in kinds  # 많이 빠진 업종 반등, 업종은 올랐는데 혼자 하락


def test_chip_not_passed_through_gets_note():
    s = ms.build(make_inputs(kospi_move=-0.02, chip_r1=-0.03))["kr"]
    chip = next(c for c in s["chains"] if c["key"] == "chip")
    assert chip["verdict"] == "반대" and "덜 전해졌어요" in chip["note"]
    assert "덜 전해진 날" in s["title"]


def test_append_log_replaces_same_day(tmp_path):
    story = ms.build(make_inputs())
    ms.append_log(tmp_path, story)
    out = ms.append_log(tmp_path, story)
    assert len(out["kr"]) == 1 and out["kr"][0]["chains"][0]["text"]


def test_analyst_view_plain_checks_and_scenarios():
    s = ms.build(make_inputs())["kr"]
    p = s["pro"]
    assert p["plain"].startswith("오늘 코스피") and "반도체" in p["plain"]
    assert any(x["h"] == "주인공" for x in p["points"])
    assert {c["q"] for c in p["checks"]} >= {"여러 업종이 같이 오르는가", "반도체가 버티는가"}
    assert [x["name"] for x in p["scenarios"]] == ["반등이 이어지는 경우", "반등을 되돌리는 경우"]


def test_watch_lists_upcoming_big_events():
    inp = make_inputs()
    day = inp["signals"]["kr"]["day"]
    import datetime as dt
    nxt = (dt.date.fromisoformat(day) + dt.timedelta(days=1)).isoformat()
    inp["events"] = [dict(date=nxt, at=f"{nxt}T22:30+09:00", ko="소비자물가(CPI) 전월 대비", tier1=True, forecast="0.3%", flag="🇺🇸")]
    w = ms.build(inp)["kr"]["pro"]["watch"]
    assert w and "금리 인하 기대 ↓" in w[0]["hi"]
