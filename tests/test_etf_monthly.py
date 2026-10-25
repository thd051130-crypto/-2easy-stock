import json

import etf_monthly as em


def rows(n, start=100.0, growth=0.01):
    out, p = [], start
    for i in range(n):
        out.append((f"{2000 + i // 12}-{i % 12 + 1:02d}", p, p, 0.0, p))
        p *= 1 + growth
    return out


def test_series_returns_and_limits():
    s = em.series(rows(14))
    assert s[0] == "2000-02" and len(s[1]) == 13 and s[1][0] == 1.0
    assert em.series(rows(12)) is None  # 1년이 안 되면 빼요
    long = em.series(rows(300))
    assert len(long[1]) == em.KEEP
    bad = rows(20)
    bad[10] = (bad[10][0], 1.0, 1.0, 0.0, 1.0)  # 분할 누락 같은 틀린 값
    assert em.series(bad) is None


def test_build_only_etfs_and_keeps_old():
    syms = [["069500", "KODEX 200", "KS", "e", ""], ["005930", "삼성전자", "KS", "s", ""], ["114800", "KODEX 인버스", "KS", "e", ""]]
    got = {"069500.KS": rows(20)}
    out = em.build("kr", syms, old={"114800": ["2010-01", [1.0]]}, fetch=lambda ts: {t: got[t] for t in ts if t in got}, pause=0)
    assert set(out) == {"069500", "114800"}  # 주식은 빼고, 못 받은 ETF는 지난번 값


def test_write_shards(tmp_path):
    em.write("kr", {"069500": ["2010-01", [1.0]], "114800": ["2011-01", [2.0]]}, out=tmp_path)
    files = sorted(tmp_path.glob("kr-*.json"))
    assert len(files) == em.SHARDS["kr"]
    n = em.shard("069500", em.SHARDS["kr"])
    assert json.loads((tmp_path / f"kr-{n}.json").read_text())["s"]["069500"] == ["2010-01", [1.0]]
    assert em.shard("SCHD", 32) == sum(map(ord, "SCHD")) % 32
