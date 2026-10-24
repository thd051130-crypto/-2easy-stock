import json

import learn_cases


import datetime as dt

DAYS = [(dt.date(2026, 9, 1) + dt.timedelta(days=i)).isoformat() for i in range(40)]  # 마지막 두 날: 10-09, 10-10


def item(sym, closes, name=None):
    return dict(sym=sym, name=name or sym, closes=closes, dates=DAYS[:len(closes)])


def world():
    flat = [100.0 + (i % 2) * 0.5 for i in range(40)]  # 평소엔 조금씩만 출렁여요
    return {"groups": [{"name": "x", "items": [
        item("^KS11", flat[:-1] + [96.0], name="코스피"),
        item("^GSPC", flat, name="S&P500"),
        item("^SOX", flat[:-2] + [93.0, 93.0], name="필라델피아 반도체"),
        item("^TNX", [4.0] * 40),
        item("KRW=X", flat),
        item("^VIX", [15.0] * 40),
    ]}]}


def test_kr_case_uses_us_data_from_night_before():
    w = learn_cases.load_world(world(), "kr")
    c = learn_cases.build_case(w, DAYS[-1], "kr")
    assert c["day"] == DAYS[-1] and c["d1"] < -0.03
    # 그 전날 밤(국장 열리기 전) 반도체 -7%는 평소보다 훨씬 커서 크게 의심
    chip = next(x for x in c["causes"] if x["key"] == "chip")
    assert chip["hit"] == 2
    # 미장은 같은 날짜 자료를 그대로 봐요 (S&P500은 평소대로라 d1이 작아요)
    w2 = learn_cases.load_world(world(), "us")
    assert abs(learn_cases.build_case(w2, DAYS[-1], "us")["d1"]) < 0.01


def test_event_results_become_causes():
    ev = {"events": [{"group": "inflation", "tier1": True, "actual": "3.7%", "forecast": "3.6%", "ko": "CPI 1년", "at": "2026-10-07T21:30+09:00"},
                     {"group": "jobs", "tier1": True, "actual": None, "ko": "고용", "at": "2026-10-07T21:30+09:00"}]}
    [c] = learn_cases.event_causes(ev, "2026-10-08")
    assert c["key"] == "infl" and "3.7%" in c["text"] and c["hit"] == 2


def test_run_backfill_and_merge(tmp_path):
    (tmp_path / "world.json").write_text(json.dumps(world()))
    out = learn_cases.run(tmp_path, backfill=3)
    assert [c["day"] for c in out["kr"]] == DAYS[-1:-4:-1]
    again = learn_cases.run(tmp_path)  # 같은 날을 다시 돌리면 덮어써요
    assert len(again["kr"]) == 3
