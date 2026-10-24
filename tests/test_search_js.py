"""웹앱(site/app.js) 종목 검색이 symbols.py와 같은 결과를 내는지 node로 돌려 봐요 (node가 없으면 건너뛰어요)."""

import json
import pathlib
import shutil
import subprocess

import pytest

import symbols as sy

ROOT = pathlib.Path(__file__).resolve().parent.parent
QUERIES = ["kodex 나스닥100", "코덱스 나스닥100", "나스닥100 kodex", "kodex나스닥100", "타이거 s&p500", "tiger 에스앤피500",
           "미국 나스닥100", "ㅅㅅㅈㅈ", "sk ㅎㅇㄴㅅ", "하이닉쓰", "삼성잔자", "삼전", "하닉", "슈드", "곱버스", "삼성 전자", "테슬러",
           "sol 배당다우존스", "kodex 커브드콜 나스닥", "nasdaq kodex", "005930", "TQQQ", "현대차", "카카오"]


def js_search(rows):
    src = (ROOT / "site/app.js").read_text()
    block = src[src.index("const CORP ="):src.index("const SYM = { kr: null, us: null };")]
    prog = block + """
const SYM = { kr: [], us: [] };
const rows = JSON.parse(require("fs").readFileSync(0, "utf8"));
SYM.kr = rows.map((row) => ({ row, keys: nameKeys(row) })); SYM.us = [];
const out = {};
for (const q of %s) {
  QK = null;
  const qs = queryKeys(q), hits = [];
  SYM.kr.forEach((e, i) => { const sc = scoreOf(e.row, e.keys, qs); if (sc != null) hits.push([sc, i]); });
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  out[q] = hits.slice(0, 5).map(([sc, i]) => [sc, SYM.kr[i].row[0]]);
}
console.log(JSON.stringify(out));
""" % json.dumps(QUERIES, ensure_ascii=False)
    r = subprocess.run(["node", "-e", prog], input=json.dumps(rows), capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


@pytest.mark.skipif(not shutil.which("node"), reason="node 없음")
def test_app_matches_python():
    rows = sy.load("kr") + sy.load("us")
    if len(rows) < 1000:
        pytest.skip("종목 목록 없음")
    got = js_search(rows)
    for q in QUERIES:
        want = [[s, row[0]] for s, row in sy.search_scored(rows, q, limit=5)]
        assert got[q] == want, q
