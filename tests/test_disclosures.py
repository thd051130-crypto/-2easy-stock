import datetime as dt
import json

import disclosures as ds


class Resp:
    def __init__(self, j):
        self.j = j

    def raise_for_status(self):
        pass

    def json(self):
        return self.j


def row(code, name, no, title):
    return dict(stock_code=code, corp_name=name, rcept_no=no, report_nm=title, rcept_dt="20261009", flr_nm=name)


def test_tone():
    assert ds.tone("주요사항보고서(유상증자결정)") == "warn"
    assert ds.tone("전환사채권발행결정") == "warn"
    assert ds.tone("임원ㆍ주요주주특정증권등소유상황보고서") == "check"
    assert ds.tone("주요사항보고서(자기주식취득결정)") == "good"
    assert ds.tone("분기보고서 (2026.09)") == ""


def test_fetch_day_pages_and_errors():
    pages = {1: dict(status="000", total_page=2, list=[row("005930", "삼성전자", "1", "a")]),
             2: dict(status="000", total_page=2, list=[row("000660", "SK하이닉스", "2", "b")])}
    got = ds.fetch_day("k", dt.date(2026, 10, 9), get=lambda url, params, timeout: Resp(pages[params["page_no"]]), pause=0)
    assert [r["rcept_no"] for r in got] == ["1", "2"]
    assert ds.fetch_day("k", dt.date(2026, 10, 9), get=lambda *a, **k: Resp(dict(status="013")), pause=0) == []
    try:
        ds.fetch_day("k", dt.date(2026, 10, 9), get=lambda *a, **k: Resp(dict(status="010", message="등록되지 않은 인증키")), pause=0)
        assert False
    except RuntimeError as e:
        assert "010" in str(e)


def test_pick_merge_and_alert():
    names = {"005930": "삼성전자", "000660": "SK하이닉스"}
    rows = [row("005930", "삼성전자", "20261009000001", "주요사항보고서(유상증자결정)"),
            row("000660", "SK하이닉스", "20261009000002", "주요사항보고서(자기주식취득결정)"),
            row("999999", "다른회사", "20261009000003", "유상증자결정"), row("", "비상장", "4", "x")]
    got = ds.pick(rows, names)
    assert [(x["code"], x["tone"], x["day"]) for x in got] == [("005930", "warn", "2026-10-09"), ("000660", "good", "2026-10-09")]
    old = dict(items=[dict(code="005930", no="20261009000001", day="2026-10-09", tone="warn", title="t", name="삼성전자", by=""),
                      dict(code="005930", no="20260801000001", day="2026-08-01", tone="", title="old", name="삼성전자", by="")])
    data, fresh = ds.merge(old, got, dt.date(2026, 10, 9))
    assert [x["no"] for x in fresh] == ["20261009000002"]  # 이미 본 공시는 빼요
    assert [x["no"] for x in data["items"]] == ["20261009000002", "20261009000001"]  # 30일 넘은 건 지워요
    assert ds.alert_text(fresh) is None  # 좋은 공시는 텔레그램 안 보내요
    text = ds.alert_text(got)
    assert text.startswith("[공시 알림]") and "삼성전자: 주요사항보고서(유상증자결정)" in text and "rcpNo=20261009000001" in text
    json.dumps(data, ensure_ascii=False)


def test_no_key_does_nothing(monkeypatch, tmp_path, capsys):
    monkeypatch.delenv("DART_API_KEY", raising=False)
    monkeypatch.setattr("sys.argv", ["disclosures.py", "--save", str(tmp_path / "d.json")])
    ds.main()
    assert not (tmp_path / "d.json").exists() and "DART_API_KEY" in capsys.readouterr().out
