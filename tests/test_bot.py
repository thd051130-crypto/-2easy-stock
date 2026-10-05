import base64
import datetime as dt
import json

import pandas as pd
import pytest

import bot as tb

KST = dt.timezone(dt.timedelta(hours=9))
ROWS = {
    "kr": [["005930", "삼성전자", "KS", "s", "SamsungElec"], ["005935", "삼성전자우", "KS", "s", "SamsungElec(1P)"],
           ["035720", "카카오", "KS", "s", "Kakao"],
           ["323410", "카카오뱅크", "KS", "s", "KakaoBank"], ["293490", "카카오게임즈", "KQ", "s", "Kakao Games"],
           ["069500", "KODEX 200", "KS", "e", ""]],
    "us": [["TSLA", "테슬라", "", "s", "Tesla, Inc."], ["GS", "골드만삭스", "", "s", "The Goldman Sachs Group, Inc."],
           ["SPY", "S&P500 ETF (SPDR)", "", "e", "SPDR S&P 500 ETF Trust"]],
}
NOW = dt.datetime(2026, 10, 5, 10, 0, tzinfo=KST)


def start(cmd):
    return "/start c_" + base64.urlsafe_b64encode(cmd.encode()).decode().rstrip("=")


def make(tmp_path, prices=None, bars=None):
    prices = prices or {"005930.KS": 276000.0, "TSLA": 250.0, "035720.KS": 60000.0}
    return tb.Bot(paper=tmp_path, rows=ROWS, last_price=lambda s: prices.get(s), intraday=lambda s: (bars or {}).get(s),
                  now=lambda: NOW)


@pytest.mark.parametrize("text, want", [
    ("도움말", ("help", None, [])),
    ("/start", ("help", None, [])),
    ("관심", ("watch_list", None, [])),
    ("관심 목록", ("watch_list", None, [])),
    ("관심 카카오", ("watch_add", None, ["카카오"])),
    ("관심추가  카카오", ("watch_add", None, ["카카오"])),
    ("관심 미장 테슬라", ("watch_add", "us", ["테슬라"])),
    ("관심 빼기 kr 035720", ("watch_remove", "kr", ["035720"])),
    ("알림 삼성전자 30만", ("alert_add", None, ["삼성전자", "30만"])),
    ("알림삭제 2", ("alert_remove", None, ["2"])),
    ("알림", ("alert_list", None, [])),
    ("안녕", ("unknown", None, ["안녕"])),
    (start("관심 kr 035720"), ("watch_add", "kr", ["035720"])),  # 웹앱 시작 링크
    ("/start c_%%%", ("help", None, [])),
])
def test_parse(text, want):
    assert tb.parse(text) == want


@pytest.mark.parametrize("s, want", [("300,000", 300000.0), ("30만", 300000.0), ("30만원", 300000.0), ("1.5만", 15000.0),
                                     ("$250.5", 250.5), ("250.5달러", 250.5), ("0", None), ("abc", None), ("", None)])
def test_parse_price(s, want):
    assert tb.parse_price(s) == want


def test_find_exact_unique_or_candidates(tmp_path):
    b = make(tmp_path)
    assert b.find("카카오")[0] == ("kr", ROWS["kr"][2])        # 이름이 딱 맞으면 그 종목
    assert b.find("삼성전자")[0][1][0] == "005930"              # 우선주(삼성전자우)보다 보통주
    assert b.find("삼성전자우")[0][1][0] == "005935"
    assert b.find("035720")[0][1][0] == "035720"
    assert b.find("게임즈")[0][1][0] == "293490"                # 하나만 맞으면 그 종목
    assert b.find("GS")[0] == ("us", ROWS["us"][1])             # 코드 그대로가 먼저
    hit, candidates = b.find("카카")
    assert hit is None and [row[0] for _, row in candidates] == ["035720", "323410", "293490"]
    assert b.find("없는종목") == (None, [])
    assert b.find("테슬라", "kr") == (None, [])                 # 시장을 정하면 그 시장에서만


def test_watch_add_remove_list(tmp_path):
    b = make(tmp_path)
    assert "넣었어요: 카카오게임즈(293490, 코스닥)" in b.handle("관심 카카오게임즈")
    assert "이미 넣어 둔" in b.handle(start("관심 kr 293490"))
    assert "이미 대시보드 목록(국장 대형주)" in b.handle("관심 삼성전자")    # 알림 종목은 ☆로
    assert "이미 대시보드 목록(미장 대형주)" in b.handle("관심 SPY")
    assert "여러 개" in b.handle("관심 카카") and "→ 관심 323410" in b.handle("관심 카카")
    assert "못 찾았어요" in b.handle("관심 없는종목")
    b.handle("관심 테슬라")
    assert b.watch["kr"] == [dict(code="293490", name="카카오게임즈", symbol="293490.KQ", exch="KQ", kind="s", added="2026-10-05")]
    assert b.watch["us"][0]["symbol"] == "TSLA" and b.added == [("kr", "293490"), ("us", "TSLA")]
    assert b.handle("관심 목록") == "텔레그램으로 넣은 관심종목\n국장: 카카오게임즈(293490)\n미장: 테슬라(TSLA)"
    assert "뺐어요: 테슬라(TSLA)" in b.handle("관심 빼기 테슬라")
    assert "없어요" in b.handle("관심 빼기 테슬라")
    assert b.save() and json.loads((tmp_path / "watch.json").read_text())["kr"][0]["code"] == "293490"
    assert not b.save()  # 바뀐 게 없으면 다시 안 써요


def test_watch_add_limit(tmp_path, monkeypatch):
    monkeypatch.setattr(tb.watchlist, "MAX_EXTRAS", 1)
    b = make(tmp_path)
    b.handle("관심 카카오")
    assert "1개까지" in b.handle("관심 카카오뱅크")


def test_alert_add_list_remove(tmp_path):
    b = make(tmp_path)
    msg = b.handle("알림 삼성전자 30만")
    assert msg.startswith("알림을 만들었어요 (1번): 삼성전자(005930) 300,000원 이상이 되면") and "지금은 276,000원이에요" in msg
    assert b.alerts["active"][0] == dict(id=1, market="kr", code="005930", name="삼성전자", symbol="005930.KS",
                                         price=300000.0, dir="up", base=276000.0, created="2026-10-05T10:00:00+09:00")
    assert "250.00달러예요" in b.handle(start("알림 us TSLA 200")) and b.alerts["active"][1]["dir"] == "down"
    assert "같은 알림이 이미 있어요 (1번)" in b.handle("알림 삼성전자 300000")
    assert "같아요" in b.handle("알림 테슬라 250")
    assert "가격을 못 받아서" in b.handle("알림 카카오게임즈 10000")
    assert "종목과 가격을" in b.handle("알림 삼성전자")
    assert b.handle("알림 목록") == ("기다리는 가격 알림\n1번 삼성전자 300,000원 이상 (10.05 등록)\n"
                                    "2번 테슬라 200.00달러 이하 (10.05 등록)\n지우려면: 알림 삭제 번호")
    assert b.handle("알림 삭제 2") == "알림을 지웠어요: 2번 테슬라 200.00달러 이하"
    assert "맞는 알림이 없어요" in b.handle("알림 삭제 9")
    assert "지웠어요" in b.handle("알림 삭제 삼성전자") and b.alerts["active"] == [] and b.alerts["next"] == 3


def bars(rows, tz="Asia/Seoul"):
    idx = pd.DatetimeIndex([pd.Timestamp(t, tz=tz) for t, *_ in rows])
    return pd.DataFrame([dict(High=h, Low=lo, Close=c) for _, h, lo, c in rows], index=idx)


def test_check_alerts_uses_bars_after_creation_only(tmp_path):
    b = make(tmp_path)
    b.handle("알림 삼성전자 300000")          # 10:00에 만든 '이상' 알림
    b.handle("알림 테슬라 200")               # '이하' 알림
    b.intraday = lambda s: {
        "005930.KS": bars([("2026-10-05 09:55", 310000, 270000, 280000),   # 만들기 전 봉은 안 봐요
                           ("2026-10-05 10:05", 299000, 276000, 298000),
                           ("2026-10-05 10:10", 301500, 297000, 300500)]),
        "TSLA": bars([("2026-10-05 10:00", 251, 249, 250)], tz="America/New_York"),
    }.get(s)
    msgs = b.check_alerts()
    assert msgs == ["[가격 알림] 삼성전자(005930) 300,000원을 넘었어요.\n"
                    "10.05 10:10(한국시간)에 닿았고, 지금은 300,500원이에요 (국장 시세는 20분쯤 늦어요)."]
    assert [a["code"] for a in b.alerts["active"]] == ["TSLA"]
    assert b.alerts["done"][0]["hit"] == "2026-10-05T10:10:00+09:00" and b.alerts["done"][0]["last"] == 300500.0
    b.intraday = lambda s: (_ for _ in ()).throw(RuntimeError("야후 막힘"))
    assert b.check_alerts() == [] and len(b.alerts["active"]) == 1  # 못 받으면 다음 번에


class FakeTelegram:
    def __init__(self, updates):
        self.updates, self.sent = updates, []

    def call(self, method, **params):
        if method == "getMe":
            return dict(username="Automarmae_bot")
        if method == "getUpdates":
            return self.updates
        raise AssertionError(method)

    def send(self, chat_id, text):
        self.sent.append((chat_id, text))


def test_run_answers_only_my_chat_and_saves(tmp_path):
    tg = FakeTelegram([
        dict(update_id=10, message=dict(chat=dict(id=111), text="관심 카카오")),
        dict(update_id=11, message=dict(chat=dict(id=999), text="관심 카카오뱅크")),   # 남의 대화방
        dict(update_id=12, message=dict(chat=dict(id=111), sticker={})),             # 글자가 아닌 메시지
    ])
    b = make(tmp_path)
    assert tb.run(tg, "111", b) == 13
    assert len(tg.sent) == 1 and tg.sent[0][0] == "111" and "카카오(035720" in tg.sent[0][1]
    assert json.loads((tmp_path / "bot.json").read_text()) == dict(username="Automarmae_bot")
    assert [e["code"] for e in json.loads((tmp_path / "watch.json").read_text())["kr"]] == ["035720"]
    assert tb.run(FakeTelegram([]), "111", make(tmp_path)) is None


def test_main_without_secrets_does_nothing(monkeypatch, capsys):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.setattr("sys.argv", ["bot.py"])
    tb.main()
    assert "할 일 없음" in capsys.readouterr().out


def test_output_appends_to_github_output(tmp_path, monkeypatch):
    path = tmp_path / "out.txt"
    monkeypatch.setenv("GITHUB_OUTPUT", str(path))
    tb.output(offset=13, changed="true")
    assert path.read_text() == "offset=13\nchanged=true\n"
