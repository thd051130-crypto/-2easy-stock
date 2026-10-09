import json

import flows as fl

RAW = [  # 네이버 응답 모양 (최근 날짜부터)
    dict(bizdate="20261008", foreignerPureBuyQuant="-1,307,041", foreignerHoldRatio="46.35%", organPureBuyQuant="-4,087,636",
         individualPureBuyQuant="+5,259,380", closePrice="263,000"),
    dict(bizdate="20261007", foreignerPureBuyQuant="-118,283", foreignerHoldRatio="46.38%", organPureBuyQuant="-819,541",
         individualPureBuyQuant="+957,691", closePrice="269,000"),
    dict(bizdate="20261006", foreignerPureBuyQuant="-2,064,174", foreignerHoldRatio="46.37%", organPureBuyQuant="-193,422",
         individualPureBuyQuant="+1,273,618", closePrice="273,000"),
    dict(bizdate="20261002", foreignerPureBuyQuant="+350,942", foreignerHoldRatio="46.41%", organPureBuyQuant="+614,278",
         individualPureBuyQuant="-2,217,946", closePrice="276,000"),
    dict(bizdate="bad", foreignerPureBuyQuant="1"),
]


def test_parse_oldest_first_and_numbers():
    f = fl.parse(RAW)
    assert f["dates"] == ["2026-10-02", "2026-10-06", "2026-10-07", "2026-10-08"]
    assert f["frg"] == [350942, -2064174, -118283, -1307041] and f["inst"][-1] == -4087636
    assert f["close"][-1] == 263000 and f["hold"][-1] == 46.35 and f["ind"][0] == -2217946
    assert fl.parse([]) is None and fl.parse(None) is None


def test_streak():
    assert fl.streak([1, -1, -2, -3]) == -3
    assert fl.streak([-1, 2, 3]) == 2
    assert fl.streak([1, 0]) == 0
    assert fl.streak([]) == 0


def test_summarize():
    m = fl.summarize(fl.parse(RAW))
    assert m["day"] == "2026-10-08" and m["frg_streak"] == -3 and m["inst_streak"] == -3
    assert m["frg5"] == 350942 - 2064174 - 118283 - 1307041
    assert m["frg5_won"] == 350942 * 276000 - 2064174 * 273000 - 118283 * 269000 - 1307041 * 263000
    assert m["hold"] == 46.35 and m["hold_chg"] == -0.06


def test_update_keeps_old_and_warnings(tmp_path, monkeypatch):
    monkeypatch.setattr(fl.time, "sleep", lambda s: None)
    path = tmp_path / "flows.json"
    path.write_text(json.dumps(dict(stocks={"000660": dict(name="SK하이닉스", dates=["2026-10-01"], sum=dict(day="2026-10-01"))})))
    buy = [dict(r, foreignerPureBuyQuant="+10", organPureBuyQuant="+5") for r in RAW[:4]]
    data = {"005930": fl.parse(RAW), "035420": fl.parse(buy)}
    got, failed = fl.update(path, {"005930": "삼성전자", "035420": "NAVER", "000660": "SK하이닉스"}, fetch=data.get)
    assert (got, failed) == (2, ["000660"])
    saved = json.loads(path.read_text())
    assert saved["day"] == "2026-10-08" and set(saved["stocks"]) == {"005930", "035420", "000660"}
    w = fl.warnings(saved)
    assert [x["code"] for x in w] == ["005930"] and w[0]["frg_streak"] == 3 and w[0]["sold"] > 0
    top = fl.top_flows(saved)
    assert [x["code"] for x in top["buy"]] == ["035420"] and [x["code"] for x in top["sell"]] == ["005930"]
    s = fl.for_stock(saved, "005930")
    assert s["frg"][-1] == -1307041 and s["sum"]["frg_streak"] == -3 and "close" not in s
    assert fl.for_stock(saved, "999999") is None and fl.warnings(None) == []
