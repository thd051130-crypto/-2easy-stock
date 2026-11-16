import datetime as dt

import keys

CFG = {"keys": {"DART_API_KEY": {"name": "DART 키", "expires": "2026-11-22", "uses": "공시 알림", "renew": "opendart"},
                "ECOS_API_KEY": {"name": "ECOS 키", "expires": None, "uses": "국고채 금리", "renew": "ecos"}}}


class Resp:
    def __init__(self, j):
        self.j = j

    def json(self):
        return self.j


def test_due_days():
    today = dt.date(2026, 11, 15)
    assert keys.due("2026-11-22", today) == 7
    assert keys.due("2026-11-23", today) is None
    assert keys.due("2026-11-15", today) == 0
    assert keys.due("2026-11-10", today) == -5
    assert keys.due(None, today) is None


def test_expiry_lines():
    text = "\n".join(keys.expiry_lines(CFG, dt.date(2026, 11, 15)))
    assert "[키 만료 예정] DART 키" in text and "D-7" in text and "ECOS" not in text
    assert keys.expiry_lines(CFG, dt.date(2026, 11, 16)) == []


def test_blocked_only_on_auth_error():
    def get(url, params=None, timeout=None):
        if "opendart" in url:
            return Resp({"status": "010", "message": "등록되지 않은 인증키입니다."})
        return Resp({"KeyStatisticList": {"row": []}})

    rows = keys.blocked(CFG, {"DART_API_KEY": "x", "ECOS_API_KEY": "y"}, get)
    assert [r[0] for r in rows] == ["DART 키"]
    assert "[키 막힘] DART 키" in "\n".join(keys.blocked_lines(rows))


def test_limit_and_network_errors_are_not_blocked():
    def get(url, params=None, timeout=None):
        if "opendart" in url:
            return Resp({"status": "020", "message": "요청 제한 초과"})
        raise ConnectionError("down")

    assert keys.blocked(CFG, {"DART_API_KEY": "x", "ECOS_API_KEY": "y"}, get) == []
    assert keys.blocked(CFG, {}, get) == []  # 키 없으면 안 불러요


def test_ecos_invalid_key():
    get = lambda url, timeout=None: Resp({"RESULT": {"CODE": "INFO-100", "MESSAGE": "인증키가 유효하지 않습니다."}})
    assert keys._ecos("k", get)[0] is True
