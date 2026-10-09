#!/usr/bin/env python3
"""산업 연관 지도: 테마 36개(themes.py)를 산업 점으로, 서로 이어진 산업을 선으로 묶어요. 앱 '산업 지도' 화면이 읽어요.

전부 무료예요 (유료 AI·유료 API 안 씀).
  - 선(LINKS): 사람이 정리한 연결. 앞 산업이 뒤 산업에 물건을 대거나(공급망), 뒤 산업이 커지면 앞 산업이 필요해지는
    관계예요. '같은 요인'은 금리·유가·한류처럼 같은 바람을 타는 산업, '반대'는 한쪽이 좋으면 다른 쪽엔 부담인 관계.
  - 주가 동행: 산업마다 대표 종목(국장·미장 각각 앞 5개)의 하루 등락률 평균으로 산업 주가를 만들고,
    최근 120거래일 동안 두 산업이 같이 움직인 정도(상관계수, -1~1)를 선마다 붙여요.
    사람이 안 이은 산업 중에 유난히 같이 움직인 쌍(0.6 이상이면서 그 시장 상위 5%)은 '주가로 찾은 연결'로 따로 보여 줘요.
  - 흐름: 산업 대표 종목의 5·20거래일 등락률 중간값과 종목별 5일 등락률.
연결은 참고용이에요. 매매 규칙·신호·가상계좌는 안 바꿔요.

dashboard.py가 배포 때 주가 없이 <out>/industry.json(점·선)을 쓰고, pages 워크플로가 이어서
`python industry_map.py --out _site`로 야후 시세를 받아 흐름·주가 동행을 채워요. 못 받아도 지도는 떠요.
"""

import argparse
import datetime as dt
import json
import pathlib

import themes

KST = dt.timezone(dt.timedelta(hours=9))
PER_THEME = 5     # 산업 하나에 시세를 받는 대표 종목 수 (시장마다)
CORR_DAYS = 120   # 주가 동행을 재는 기간 (거래일)
HIDDEN_MIN = 0.6  # 사람이 안 이은 쌍을 '주가로 찾은 연결'로 보여 주는 상관계수 (최소)
HIDDEN_TOP = 0.95  # 국장은 다 같이 오르내려서 상관이 높게 나와요. 그래서 그 시장 전체 쌍 중 상위 5% 안이어야 해요
HIDDEN_PER = 2    # 산업 하나에 붙이는 '주가로 찾은 연결' 최대 수

# 묶음: 지도에서 같은 색·가까운 자리
GROUPS = [
    ("tech", "반도체·IT", ["AI반도체·HBM", "반도체 장비·소재", "AI·소프트웨어", "데이터센터", "인터넷·게임", "양자컴퓨터",
                           "사이버보안"]),
    ("energy", "전력·에너지", ["전력·전력기기", "원전·SMR", "태양광·풍력", "2차전지", "수소·연료전지", "정유·화학·에너지"]),
    ("industry", "산업재·운송", ["자동차·전기차", "로봇·휴머노이드", "조선", "방산", "우주항공", "해운·물류", "철강·비철금속",
                               "건설·부동산"]),
    ("consumer", "소비·헬스", ["바이오·제약", "비만치료제", "미용·의료기기", "화장품·K뷰티", "엔터·K팝·콘텐츠", "음식료·K푸드",
                             "유통·이커머스", "여행·항공·카지노", "통신"]),
    ("finance", "금융·자산", ["은행·금융지주", "증권", "보험", "고배당", "가상자산·비트코인", "금·귀금속"]),
]

# 지도 점에 쓰는 짧은 이름 (폰 화면이 좁아서). 없으면 테마 이름 그대로
SHORT = {"AI반도체·HBM": "AI반도체", "반도체 장비·소재": "반도체 장비", "AI·소프트웨어": "AI·SW", "전력·전력기기": "전력기기",
         "수소·연료전지": "수소", "정유·화학·에너지": "정유·화학", "자동차·전기차": "자동차", "로봇·휴머노이드": "로봇",
         "철강·비철금속": "철강·금속", "건설·부동산": "건설", "바이오·제약": "바이오", "미용·의료기기": "의료기기",
         "화장품·K뷰티": "화장품", "엔터·K팝·콘텐츠": "엔터·K팝", "음식료·K푸드": "K푸드", "유통·이커머스": "유통",
         "여행·항공·카지노": "여행·항공", "은행·금융지주": "은행", "가상자산·비트코인": "비트코인", "금·귀금속": "금"}

# 연결 종류: s 공급망·수요 (앞 → 뒤: 앞 산업이 뒤 산업에 들어가요), c 같은 요인, n 반대
KINDS = {"s": "공급망·수요", "c": "같은 요인", "n": "반대"}

# (앞 산업, 뒤 산업, 종류, 한 줄 설명)
LINKS = [
    # 반도체·AI
    ("반도체 장비·소재", "AI반도체·HBM", "s", "HBM·첨단 공정 공장을 늘릴 때 장비·소재가 들어가요"),
    ("정유·화학·에너지", "반도체 장비·소재", "s", "특수가스·감광액 같은 반도체 소재를 화학 회사가 만들어요"),
    ("AI반도체·HBM", "데이터센터", "s", "AI 서버에 GPU·HBM이 들어가요"),
    ("데이터센터", "AI·소프트웨어", "s", "AI·클라우드 서비스가 데이터센터 연산을 빌려 써요"),
    ("AI반도체·HBM", "AI·소프트웨어", "s", "AI 서비스가 커질수록 AI 칩 주문이 늘어요"),
    ("AI반도체·HBM", "로봇·휴머노이드", "s", "로봇 두뇌에 AI 칩이 들어가요"),
    ("AI반도체·HBM", "자동차·전기차", "s", "자율주행·전장 부품에 반도체가 들어가요"),
    ("AI·소프트웨어", "로봇·휴머노이드", "s", "피지컬 AI(로봇을 움직이는 AI)"),
    ("AI·소프트웨어", "인터넷·게임", "s", "검색·광고·게임에 AI를 붙여요"),
    ("AI·소프트웨어", "사이버보안", "c", "클라우드·AI를 많이 쓸수록 보안도 같이 필요해요"),
    ("양자컴퓨터", "AI·소프트웨어", "c", "차세대 연산 기술이라 같은 기술주 자금이 몰려요"),
    ("양자컴퓨터", "사이버보안", "s", "양자컴퓨터 시대엔 양자암호가 필요해요"),
    # 전력·에너지
    ("전력·전력기기", "데이터센터", "s", "데이터센터가 늘수록 변압기·전선·전기가 더 필요해요"),
    ("원전·SMR", "데이터센터", "s", "빅테크가 AI 데이터센터 전기를 원전·SMR로 대려는 계약을 맺어요"),
    ("원전·SMR", "전력·전력기기", "s", "원전이 만든 전기를 송전망·변압기로 보내요"),
    ("태양광·풍력", "전력·전력기기", "s", "재생에너지가 늘면 전력망 연결 설비가 필요해요"),
    ("2차전지", "태양광·풍력", "s", "ESS(전기 저장 배터리)가 재생에너지와 짝이에요"),
    ("2차전지", "자동차·전기차", "s", "전기차에 배터리가 들어가요"),
    ("수소·연료전지", "자동차·전기차", "s", "수소차에 연료전지가 들어가요"),
    ("수소·연료전지", "데이터센터", "s", "연료전지 발전기로 데이터센터 전기를 대요"),
    ("정유·화학·에너지", "수소·연료전지", "s", "수소는 주로 가스·석유화학 공정에서 만들어요"),
    ("정유·화학·에너지", "2차전지", "s", "양극재·전해질 같은 배터리 소재를 화학 회사가 만들어요"),
    # 소재·산업재
    ("철강·비철금속", "2차전지", "s", "리튬·니켈 같은 금속 값이 배터리 원가예요"),
    ("철강·비철금속", "전력·전력기기", "s", "전선에 구리가, 변압기에 전기강판이 들어가요"),
    ("철강·비철금속", "조선", "s", "배를 만드는 두꺼운 철판(후판)"),
    ("철강·비철금속", "자동차·전기차", "s", "차체 강판"),
    ("철강·비철금속", "건설·부동산", "s", "철근·형강"),
    ("철강·비철금속", "태양광·풍력", "s", "해상풍력 하부 구조물이 철강이에요"),
    ("정유·화학·에너지", "조선", "s", "가스·유가가 오르면 LNG선·해양플랜트 주문이 늘어요"),
    ("조선", "해운·물류", "s", "해운사가 배를 주문해요"),
    ("조선", "방산", "s", "군함·잠수함을 조선소가 만들어요"),
    ("방산", "우주항공", "c", "미사일·위성·전투기 기술이 겹쳐요"),
    ("우주항공", "통신", "s", "저궤도 위성으로 통신을 해요"),
    ("로봇·휴머노이드", "자동차·전기차", "s", "차 공장 자동화와 자율주행 기술이 겹쳐요"),
    ("자동차·전기차", "해운·물류", "s", "자동차 운반선으로 수출해요"),
    ("건설·부동산", "원전·SMR", "s", "원전을 짓는 건설사가 수주해요"),
    ("건설·부동산", "데이터센터", "s", "데이터센터 건물을 지어요"),
    ("통신", "데이터센터", "s", "통신사가 데이터센터(IDC)를 운영해요"),
    ("정유·화학·에너지", "해운·물류", "c", "유가가 배 연료비라 운임과 같이 움직여요"),
    ("정유·화학·에너지", "여행·항공·카지노", "n", "유가가 오르면 항공사 연료비 부담이 커져요"),
    # 소비·헬스
    ("바이오·제약", "비만치료제", "s", "비만약도 제약사 신약이에요"),
    ("바이오·제약", "미용·의료기기", "c", "같은 헬스케어 자금이 움직여요"),
    ("미용·의료기기", "화장품·K뷰티", "c", "피부미용 시술과 화장품을 같이 찾아요"),
    ("엔터·K팝·콘텐츠", "화장품·K뷰티", "c", "한류가 커지면 K뷰티 수출도 같이 늘어요"),
    ("엔터·K팝·콘텐츠", "음식료·K푸드", "c", "한류 콘텐츠가 라면·과자 수출을 끌어요"),
    ("엔터·K팝·콘텐츠", "여행·항공·카지노", "s", "공연·드라마 보고 관광객이 와요"),
    ("인터넷·게임", "엔터·K팝·콘텐츠", "s", "웹툰·플랫폼·게임 IP가 드라마·공연으로 이어져요"),
    ("화장품·K뷰티", "유통·이커머스", "s", "면세점·온라인몰에서 팔아요"),
    ("화장품·K뷰티", "여행·항공·카지노", "c", "중국 관광객이 오면 면세점 화장품이 팔려요"),
    ("음식료·K푸드", "유통·이커머스", "s", "마트·편의점·온라인몰에서 팔아요"),
    ("해운·물류", "유통·이커머스", "s", "택배·물류가 온라인 쇼핑을 받쳐요"),
    ("비만치료제", "음식료·K푸드", "n", "비만약을 많이 쓰면 음식 소비가 줄 수 있어요"),
    # 금융·자산
    ("은행·금융지주", "증권", "c", "금리·밸류업(주주환원) 정책에 같이 움직여요"),
    ("은행·금융지주", "보험", "c", "금리가 오르면 둘 다 이자 수익이 늘어요"),
    ("은행·금융지주", "고배당", "c", "배당을 많이 주는 대표 업종이에요"),
    ("보험", "고배당", "c", "배당을 많이 주는 업종이에요"),
    ("통신", "고배당", "c", "꾸준히 배당하는 업종이에요"),
    ("은행·금융지주", "건설·부동산", "c", "금리가 내리면 대출·집값이 같이 움직여요"),
    ("가상자산·비트코인", "증권", "c", "거래가 활발해지면 거래 수수료가 늘어요"),
    ("가상자산·비트코인", "데이터센터", "s", "비트코인 채굴 회사들이 AI 데이터센터로 바꾸는 중이에요"),
    ("금·귀금속", "가상자산·비트코인", "c", "달러 대신 갖는 대체 자산으로 같이 묶여요"),
    ("금·귀금속", "철강·비철금속", "c", "광산·금속 값이 같이 움직여요"),
]


def static_map():
    """점(산업)과 사람이 정리한 선. 주가 없이도 지도는 이걸로 그려요."""
    by_name = {t["name"]: t for t in themes.THEMES}
    nodes = []
    for gid, gname, names in GROUPS:
        for n in names:
            t = by_name[n]
            nodes.append(dict(name=n, short=SHORT.get(n, n), group=gid, why=t["why"], q=t["keys"].split()[0]))
    links = [dict(a=a, b=b, kind=k, why=w) for a, b, k, w in LINKS]
    return dict(groups=[dict(id=g, name=n) for g, n, _ in GROUPS], kinds=KINDS, nodes=nodes, links=links)


def yahoo_symbol(market, code, exch=""):
    if market == "kr":
        return f"{code}.{'KQ' if exch == 'KQ' else 'KS'}"
    return code.replace(".", "-")


def members(themes_json, market, n=PER_THEME):
    """{테마: [(코드, 이름)]} 대표 종목 앞 n개 (themes.build가 상장폐지 종목은 이미 뺐어요)."""
    return {t["name"]: [tuple(x) for x in t[market][:n]] for t in themes_json["themes"]}


def download(symbols, period="1y"):
    """야후 종가 표 (열 = 기호). 못 받으면 빈 표."""
    import pandas as pd
    import yfinance as yf

    if not symbols:
        return pd.DataFrame()
    try:
        h = yf.download(sorted(set(symbols)), period=period, auto_adjust=True, progress=False, threads=True)
    except Exception as e:  # 네트워크·레이트리밋
        print(f"야후 시세 실패: {e!r}")
        return pd.DataFrame()
    if h is None or h.empty or "Close" not in h:
        return pd.DataFrame()
    close = h["Close"]
    if not hasattr(close, "columns"):  # 기호가 하나면 Series
        close = close.to_frame(sorted(set(symbols))[0])
    return close


def r(x):
    return None if x is None or x != x else round(float(x), 4)


def flows(close, mem, sym_of):
    """시장 하나: ({테마: {r5, r20, n, stocks}}, 테마 하루 등락률 표). close 열 = 야후 기호."""
    import pandas as pd

    close = close.sort_index()
    rets = close.pct_change(fill_method=None)
    out, series = {}, {}
    for name, rows in mem.items():
        stocks, r5s, r20s, cols = [], [], [], []
        for code, ko in rows:
            s = sym_of(code)
            if s not in close or close[s].dropna().size < 25:
                continue
            c = close[s].dropna()
            r5, r20 = c.iloc[-1] / c.iloc[-6] - 1, c.iloc[-1] / c.iloc[-21] - 1
            r5s.append(r5)
            r20s.append(r20)
            cols.append(s)
            stocks.append([code, ko, r(c.iloc[-1]), r(r5), r(c.iloc[-1] / c.iloc[-2] - 1)])
        if not stocks:
            continue
        out[name] = dict(r5=r(pd.Series(r5s).median()), r20=r(pd.Series(r20s).median()), n=len(stocks), stocks=stocks)
        series[name] = rets[cols].mean(axis=1, skipna=True)
    return out, pd.DataFrame(series).tail(CORR_DAYS)


def correlations(daily, links, mem):
    """선마다 주가 동행 {"a|b": 상관계수}와 사람이 안 이은 쌍 중 많이 같이 움직인 쌍 [(a, b, 상관계수)]."""
    import pandas as pd

    if daily.empty:
        return {}, []
    corr = daily.corr(min_periods=60)
    linked = {frozenset((l["a"], l["b"])) for l in links}
    on_link = {}
    for l in links:
        a, b = l["a"], l["b"]
        if a in corr and b in corr and corr.at[a, b] == corr.at[a, b]:
            on_link[f"{a}|{b}"] = round(float(corr.at[a, b]), 2)
    codes = {name: {c for c, _ in rows} for name, rows in mem.items()}
    names = list(corr.columns)
    every = [corr.at[a, b] for i, a in enumerate(names) for b in names[i + 1:] if corr.at[a, b] == corr.at[a, b]]
    floor = max(HIDDEN_MIN, float(pd.Series(every).quantile(HIDDEN_TOP))) if every else HIDDEN_MIN
    pairs = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            v = corr.at[a, b]
            # 같은 종목이 두 산업에 다 들어 있으면 (한국전력, LG화학…) 당연히 같이 움직여서 빼요
            if v != v or v < floor or frozenset((a, b)) in linked or codes[a] & codes[b]:
                continue
            pairs.append((a, b, round(float(v), 2)))
    pairs.sort(key=lambda x: -x[2])
    used, hidden = {}, []
    for a, b, v in pairs:
        if used.get(a, 0) >= HIDDEN_PER or used.get(b, 0) >= HIDDEN_PER:
            continue
        used[a], used[b] = used.get(a, 0) + 1, used.get(b, 0) + 1
        hidden.append([a, b, v])
    return on_link, hidden


def build(themes_json, symbol_rows=None, fetch=download):
    """앱이 읽는 industry.json. symbol_rows {시장: {코드: 거래소}} 로 국장 코스닥(.KQ)을 가려요."""
    out = static_map()
    if fetch is None:
        return out
    out["flows"], out["corr"], out["hidden"] = {}, {}, {}
    for m in ("kr", "us"):
        mem = members(themes_json, m)
        exch = (symbol_rows or {}).get(m, {})
        sym_of = lambda code, m=m, exch=exch: yahoo_symbol(m, code, exch.get(code, ""))  # noqa: E731
        close = fetch([sym_of(c) for rows in mem.values() for c, _ in rows])
        if close is None or close.empty:
            print(f"{m}: 시세를 못 받아서 흐름 없이 지도만 써요")
            continue
        fl, daily = flows(close, mem, sym_of)
        out["flows"][m] = fl
        out["corr"][m], out["hidden"][m] = correlations(daily, out["links"], mem)
        out.setdefault("day", {})[m] = str(close.dropna(how="all").index[-1].date())
        print(f"{m}: 산업 {len(fl)}개 흐름, 선 {len(out['corr'][m])}개 동행, 주가로 찾은 연결 {len(out['hidden'][m])}개")
    out["built"] = dt.datetime.now(KST).isoformat(timespec="minutes")
    return out


def symbol_rows(symbols_dir):
    rows = {}
    for m in ("kr", "us"):
        try:
            rows[m] = {r[0]: r[2] for r in json.loads((symbols_dir / f"{m}.json").read_text(encoding="utf-8"))["rows"]}
        except (OSError, ValueError, KeyError):
            rows[m] = {}
    return rows


def write(out_dir, data):
    (out_dir / "industry.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--paper", type=pathlib.Path, default=pathlib.Path("paper"))
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("_site"))
    args = parser.parse_args()
    tj = themes.build(args.paper / "symbols", args.paper / "sectors.json")
    write(args.out, build(tj, symbol_rows(args.paper / "symbols")))
    print(f"{args.out}/industry.json 준비 완료")


if __name__ == "__main__":
    main()
