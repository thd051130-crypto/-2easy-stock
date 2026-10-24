import json

import learn_cases


def item(sym, closes, start=1, name=None):
    return dict(sym=sym, name=name or sym, closes=closes, dates=[f"2026-10-{start + i:02d}" for i in range(len(closes))])


def world():
    flat = [100.0] * 8
    return {"groups": [{"name": "x", "items": [
        item("^KS11", flat[:-1] + [96.0], name="코스피"),
        item("^GSPC", flat, name="S&P500"),
        item("^SOX", flat[:-2] + [93.0, 93.0], name="필라델피아 반도체"),
        item("^TNX", [4.0] * 8),
        item("KRW=X", flat),
        item("^VIX", [15.0] * 8),
    ]}]}


def test_kr_case_uses_us_data_from_night_before():
    w = learn_cases.load_world(world(), "kr")
    c = learn_cases.build_case(w, "2026-10-08", "kr")
    assert c["day"] == "2026-10-08" and round(c["d1"], 3) == -0.04
    # 10-07 밤(국장 10-08 전) 반도체 -7% → 크게 의심
    chip = next(x for x in c["causes"] if x["key"] == "chip")
    assert chip["hit"] == 2
    # 미장 같은 날짜엔 그날 반도체(그대로)라 하루 변화 없음, 1주는 -7%라 여전히 후보
    w2 = learn_cases.load_world(world(), "us")
    assert learn_cases.build_case(w2, "2026-10-08", "us")["d1"] == 0


def test_event_results_become_causes():
    ev = {"events": [{"group": "inflation", "tier1": True, "actual": "3.7%", "forecast": "3.6%", "ko": "CPI 1년", "at": "2026-10-07T21:30+09:00"},
                     {"group": "jobs", "tier1": True, "actual": None, "ko": "고용", "at": "2026-10-07T21:30+09:00"}]}
    [c] = learn_cases.event_causes(ev, "2026-10-08")
    assert c["key"] == "infl" and "3.7%" in c["text"] and c["hit"] == 2


def test_run_backfill_and_merge(tmp_path):
    (tmp_path / "world.json").write_text(json.dumps(world()))
    out = learn_cases.run(tmp_path, backfill=3)
    assert [c["day"] for c in out["kr"]] == ["2026-10-08", "2026-10-07", "2026-10-06"]
    again = learn_cases.run(tmp_path)  # 같은 날을 다시 돌리면 덮어써요
    assert len(again["kr"]) == 3
