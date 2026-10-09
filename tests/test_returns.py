import math

import returns as rt


def months(n, start=100.0, growth=0.01, div=0.0, crash_at=None):
    out, p = [], start
    for i in range(n):
        if crash_at is not None and i == crash_at:
            p *= 0.5
        out.append((f"{2000 + i // 12}-{i % 12 + 1:02d}", p, p, p * div))
        p *= 1 + growth
    return out


def test_stats_growth_dividend_drawdown():
    s = rt.stats(months(61, growth=0.01, div=0.003, crash_at=30))
    assert s[0] == "2000-01" and s[4] == 5.0
    assert s[2] == round(0.003 * 12 * 100, 2)  # 매달 0.3% → 연 3.6%
    assert s[3] == -50
    # 5년 동안 매달 1% 오르고 한 번 반토막
    expect = ((1.01 ** 60) * 0.5) ** (1 / 5) - 1
    assert math.isclose(s[1], round(expect * 100, 1))


def test_stats_uses_last_ten_years_and_needs_a_year():
    long = months(12 * 15 + 1, growth=0.0)
    long[0] = (long[0][0], 1.0, 1.0, 0.0)  # 15년 전 값은 수익률에 안 써요
    assert rt.stats(long)[1] == 0.0 and rt.stats(long)[4] == 10.0
    assert rt.stats(months(12)) is None
    assert rt.stats(months(13)) is not None


def test_stats_skips_broken_numbers():
    bad = months(30)
    bad[-1] = (bad[-1][0], bad[-1][1] * 1000, bad[-1][2], 0.0)  # 분할 누락
    assert rt.stats(bad) is None
    zero = months(30)
    zero[3] = (zero[3][0], zero[3][1], 0.0, 0.0)  # 수정 종가 0
    assert rt.stats(zero) is not None


def test_build_keeps_old_value_when_fetch_fails():
    rows = [["005930", "삼성전자", "KS", "s", ""], ["123456", "새 종목", "KQ", "s", ""], ["999999", "없는 종목", "KS", "e", ""]]

    def fake(tickers):
        assert tickers == ["005930.KS", "123456.KQ", "999999.KS"]
        return {"005930.KS": months(30), "123456.KQ": months(5)}

    out = rt.build("kr", rows, old={"999999": ["2010-01", 1.0, 0.0, -10, 10.0], "123456": ["x"]}, fetch=fake, pause=0)
    assert set(out) == {"005930", "999999"}  # 새 종목은 1년이 안 돼서 빠지고, 못 받은 종목은 지난번 값
    assert rt.ticker("us", ["BRK.B", "", "", "s", ""]) == "BRK-B"


def test_crisis_drawdown_and_recovery():
    rows = [(f"{2007 + i // 12}-{i % 12 + 1:02d}", 100.0, 100.0, 0.0, 100.0) for i in range(48)]
    # 2008-10에 월중 최저 50, 종가 60 → 2010-01에 종가 100 회복
    rows = [(ym, 60.0 if "2008-10" <= ym < "2010-01" else c, a, v, 50.0 if ym == "2008-10" else (60.0 if "2008-10" <= ym < "2010-01" else lo))
            for ym, c, a, v, lo in rows]
    c = rt.crisis(rows, "2007-06", "2009-12")
    assert c == [-50, 15]
    assert rt.crisis(rows, "2006-01", "2007-12") is None  # 자료 시작 전
    never = [r if r[0] < "2008-10" else (r[0], 60.0, 60.0, 0.0, 50.0) for r in rows]
    assert rt.crisis(never, "2007-06", "2009-12")[1] is None  # 아직 회복 못 함


def test_stats_adds_crises_and_dividend_months():
    s = rt.stats(months(30, div=0.01))
    assert len(s) == 7 and s[5] == [None, None, None]  # 2000년 시작이라 하락장 기간 자료 없음
    assert len(s[6]) == 12 and s[6][0][0] == int(months(30)[-12][0][5:7])
