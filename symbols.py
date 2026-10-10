#!/usr/bin/env python3
"""종목 검색용 전체 종목 목록을 만들어요: paper/symbols/<시장>.json

야후 파이낸스 스크리너(무료)에서 받아요.
  - 국장: 코스피·코스닥 전 종목과 ETF·ETN. 이름은 야후 한국어 이름(법인 이름)에서 (주)·주식회사를 떼고 써요.
  - 미장: 시가총액 2억 달러 넘는 주식과 상장된 ETF 전부. 많이 찾는 종목은 한국어 이름(테슬라, 슈드…)도 붙여요.
웹앱 검색 화면과 텔레그램 봇(이름으로 종목 찾기)이 같이 써요. 상장 종목은 자주 안 바뀌어서 매주 한 번 새로 받아요.

한 줄 = [코드, 이름, 시장(KS 코스피 / KQ 코스닥 / 미장은 빈칸), 종류(s 주식 / e ETF·ETN), 다른 이름들("|"로 이어 붙임)]

사용법:
    python symbols.py                # 국장·미장 둘 다
    python symbols.py --market kr    # 국장만
"""

import argparse
import datetime as dt
import json
import pathlib
import re
import time

from markets import MARKETS

KST = dt.timezone(dt.timedelta(hours=9))
SCREENER = "https://query1.finance.yahoo.com/v1/finance/screener"
US_MIN_CAP = 2e8   # 미장 주식은 시가총액 2억 달러 넘는 것만 (너무 작은 종목까지 넣으면 목록만 커져요)
US_ETFS = None     # 미장 ETF는 상장된 것 전부 (자산 규모 큰 순서로 받아요)

# ---------------------------------------------------------------- 이름 다듬기

CORP = re.compile(r"\(주\)|㈜|주식회사|\(유\)|유한회사")
HANGUL = re.compile(r"[가-힣]")
# 야후 한국어 이름은 법인 이름이라 SK가 '에스케이'로 적힌 경우가 많아요. 화면에는 흔히 쓰는 영문 약칭으로 보여 줘요.
GROUP = [("케이티앤지", "KT&G"), ("에스케이", "SK"), ("엘지", "LG"), ("케이티", "KT"), ("씨제이", "CJ"), ("지에스", "GS"),
         ("에이치디", "HD"), ("디비", "DB"), ("엘에스", "LS"), ("엔에이치", "NH"), ("케이비", "KB"), ("비엔케이", "BNK"),
         ("에이치엘", "HL")]
# 국내 ETF 브랜드 (한국어 이름에서 브랜드부터 잘라 써요: '삼성KODEX200…투자신탁' → 'KODEX 200…')
BRANDS = ["KODEX", "TIGER", "PLUS", "RISE", "SOL", "ACE", "HANARO", "KOSEF", "KIWOOM", "ARIRANG", "TIMEFOLIO", "TIME",
          "WON", "1Q", "KoAct", "BNK", "UNICORN", "FOCUS", "TREX", "KStar", "KINDEX", "HK", "VITA", "WOORI", "ITF",
          "TRUSTON", "DAISHIN343", "SMART", "마이티", "에셋플러스", "히어로즈", "파워", "마이다스"]


def clean(s):
    return re.sub(r"\s+", " ", CORP.sub(" ", s or "")).strip()


def preferred(short_name):
    """야후 짧은 이름의 '(1P)' '(2PB)'는 우선주 표시예요."""
    return re.search(r"\((\d?)P(B?)\)", short_name or "")


def kr_stock_name(long_name, short_name):
    """'에스케이바이오팜 주식회사' → 'SK바이오팜', 우선주는 '삼성전자우'·'현대자동차2우B'처럼."""
    name = clean(long_name) or (short_name or "").strip()
    for ko, en in GROUP:
        if name == ko or (name.startswith(ko) and HANGUL.match(name[len(ko):len(ko) + 1] or "")):
            name = en + name[len(ko):]
            break
    pref = preferred(short_name)
    if pref:
        name += ("" if pref.group(1) in ("", "1") else pref.group(1)) + "우" + pref.group(2)
    return name


def brand_of(s):
    low = (s or "").lower()
    hits = [(low.find(b.lower()), b) for b in BRANDS if b.lower() in low]
    return min(hits)[1] if hits else None


def korean_etf_name(long_name, short_name):
    """한국어 이름에서 브랜드부터 '상장지수투자신탁' 앞까지: 'KODEX 200선물인버스2X'. 못 만들면 None."""
    if not (long_name and HANGUL.search(long_name)):
        return None
    b = brand_of(long_name)
    if not b or brand_of(short_name) not in (None, b):  # 브랜드 이름이 바뀐 종목(KStar → RISE)은 한국어 이름이 옛날 거라 안 써요
        return None
    rest = long_name[long_name.lower().find(b.lower()) + len(b):]
    rest = re.split(r"(?:증권\s*)?상장\s*지수|\s*[\[(]", rest)[0].strip()
    return f"{b} {rest}" if rest else None


def kr_etf_name(long_name, short_name):
    """한국어 이름으로 만든 이름, 없으면 야후 영문 이름."""
    return korean_etf_name(long_name, short_name) or (short_name or "").strip() or clean(long_name)


# ---------------------------------------------------------------- 검색 (웹앱 app.js의 같은 이름 함수와 똑같이 맞춰요)

LETTERS = dict(a="에이", b="비", c="씨", d="디", e="이", f="에프", g="지", h="에이치", i="아이", j="제이", k="케이", l="엘",
               m="엠", n="엔", o="오", p="피", q="큐", r="알", s="에스", t="티", u="유", v="브이", w="더블유", x="엑스",
               y="와이", z="지")
# 한글로 친 ETF 브랜드 → 영문 ('코덱스 200' → 'kodex200')
BRAND_KO = {"코덱스": "kodex", "타이거": "tiger", "에이스": "ace", "라이즈": "rise", "플러스": "plus", "하나로": "hanaro",
            "아리랑": "arirang", "키움": "kiwoom", "코세프": "kosef", "쏠": "sol"}


def norm(s):
    """찾기용으로 다듬기: 소문자, (주)·띄어쓰기·기호 빼기."""
    return re.sub(r"[^0-9a-z가-힣]", "", CORP.sub("", (s or "").lower()))


def spell(s):
    """한글 바로 옆 영문을 한글 읽기로: 'sk하이닉스' → '에스케이하이닉스', '삼성sdi' → '삼성에스디아이'."""
    def sub(m):
        near = s[m.start() - 1:m.start()] + s[m.end():m.end() + 1]
        return "".join(LETTERS[c] for c in m.group()) if HANGUL.search(near) else m.group()
    return re.sub(r"[a-z]+", sub, s)


def query_keys(q):
    n = norm(q)
    keys = [n, spell(n)]
    for ko, en in BRAND_KO.items():
        if ko in n:
            keys.append(n.replace(ko, en))
    return [k for i, k in enumerate(keys) if k and k not in keys[:i]]


def name_keys(row):
    names = [row[1]] + [a for a in (row[4] if len(row) > 4 else "").split("|") if a]
    keys = []
    for name in names:
        n = norm(name)
        keys += [n, spell(n)]
        if "자동차" in n:  # '현대차'로도 찾게
            keys.append(n.replace("자동차", "차"))
    return [k for i, k in enumerate(keys) if k and k not in keys[:i]]


def score(row, keys, qs):
    """작을수록 잘 맞아요. 안 맞으면 None. 0 코드 그대로, 1 이름 그대로, 2 이름 앞부분, 3 코드 앞부분, 4 이름 일부."""
    code = row[0].lower()
    if any(code == q for q in qs):
        return 0
    best = None
    for q in qs:
        for k in keys:
            s = 1 if k == q else 2 if k.startswith(q) else 4 if q in k else None
            if s is not None and (best is None or s < best):
                best = s
        if code.startswith(q) and (best is None or 3 < best):
            best = 3
    return best


def search(rows, q, limit=20):
    """rows(종목 목록) 중 q에 맞는 줄을 잘 맞는 순서로. 같은 점수면 목록 순서(시가총액 큰 순)."""
    qs = query_keys(q)
    if not qs:
        return []
    found = []
    for i, row in enumerate(rows):
        s = score(row, name_keys(row), qs)
        if s is not None:
            found.append((s, i, row))
    found.sort(key=lambda x: (x[0], x[1]))
    return [row for _, _, row in found[:limit]]


# ---------------------------------------------------------------- 미장 한국어 이름 (많이 찾는 종목만, '/' 뒤는 다른 이름)

US_KO = {
    # 주식
    "AAPL": "애플", "MSFT": "마이크로소프트", "NVDA": "엔비디아", "AMZN": "아마존", "GOOGL": "알파벳 A/구글",
    "GOOG": "알파벳 C/구글", "META": "메타/페이스북", "TSLA": "테슬라", "AVGO": "브로드컴", "AMD": "AMD",
    "INTC": "인텔", "QCOM": "퀄컴", "TSM": "TSMC", "ASML": "ASML", "ARM": "ARM 홀딩스", "MU": "마이크론",
    "NFLX": "넷플릭스", "ADBE": "어도비", "CRM": "세일즈포스", "ORCL": "오라클", "PLTR": "팔란티어",
    "IONQ": "아이온큐", "RGTI": "리게티 컴퓨팅", "QBTS": "디웨이브 퀀텀", "SOUN": "사운드하운드",
    "SMCI": "슈퍼마이크로 컴퓨터", "COIN": "코인베이스", "MSTR": "스트래티지/마이크로스트래티지", "HOOD": "로빈후드",
    "UBER": "우버", "ABNB": "에어비앤비", "SHOP": "쇼피파이", "SNOW": "스노우플레이크", "NET": "클라우드플레어",
    "CRWD": "크라우드스트라이크", "PANW": "팔로알토 네트웍스", "DDOG": "데이터독", "ZS": "지스케일러",
    "MDB": "몽고DB", "U": "유니티", "RBLX": "로블록스", "SNAP": "스냅", "PINS": "핀터레스트", "SPOT": "스포티파이",
    "BABA": "알리바바", "PDD": "PDD 홀딩스/테무", "JD": "징둥닷컴", "BIDU": "바이두", "NIO": "니오", "LI": "리오토",
    "XPEV": "샤오펑", "RIVN": "리비안", "LCID": "루시드", "F": "포드", "GM": "제너럴모터스", "TM": "도요타",
    "SONY": "소니", "NKE": "나이키", "SBUX": "스타벅스", "MCD": "맥도날드", "KO": "코카콜라", "PEP": "펩시코",
    "COST": "코스트코", "WMT": "월마트", "TGT": "타깃", "HD": "홈디포", "LOW": "로우스", "DIS": "디즈니",
    "CMCSA": "컴캐스트", "T": "AT&T", "VZ": "버라이즌", "TMUS": "T모바일", "JPM": "JP모건", "BAC": "뱅크오브아메리카",
    "WFC": "웰스파고", "C": "씨티그룹", "GS": "골드만삭스", "MS": "모건스탠리", "BLK": "블랙록", "V": "비자",
    "MA": "마스터카드", "PYPL": "페이팔", "AXP": "아메리칸 익스프레스", "BRK-B": "버크셔 해서웨이 B",
    "BRK-A": "버크셔 해서웨이 A", "JNJ": "존슨앤드존슨", "PFE": "화이자", "MRK": "머크", "LLY": "일라이 릴리",
    "NVO": "노보 노디스크", "ABBV": "애브비", "UNH": "유나이티드헬스", "AMGN": "암젠", "GILD": "길리어드",
    "MRNA": "모더나", "BMY": "BMS", "TMO": "써모피셔", "ISRG": "인튜이티브 서지컬", "XOM": "엑슨모빌",
    "CVX": "셰브론", "OXY": "옥시덴탈", "BA": "보잉", "LMT": "록히드마틴", "RTX": "RTX/레이시온",
    "GE": "GE 에어로스페이스", "CAT": "캐터필러", "DE": "디어", "HON": "하니웰", "MMM": "3M", "UPS": "UPS",
    "FDX": "페덱스", "O": "리얼티 인컴", "PLD": "프로로지스", "AMT": "아메리칸 타워", "CSCO": "시스코", "IBM": "IBM",
    "TXN": "텍사스 인스트루먼트", "AMAT": "어플라이드 머티리얼즈", "LRCX": "램리서치", "KLAC": "KLA",
    "MRVL": "마벨 테크놀로지", "ON": "온세미", "ANET": "아리스타 네트웍스", "DELL": "델", "HPQ": "HP",
    "VRT": "버티브", "CEG": "컨스텔레이션 에너지", "VST": "비스트라", "OKLO": "오클로", "SMR": "뉴스케일 파워",
    "CCJ": "카메코", "NEE": "넥스트에라 에너지", "ENPH": "엔페이즈", "FSLR": "퍼스트 솔라", "RKLB": "로켓랩",
    "ASTS": "AST 스페이스모바일", "JOBY": "조비 에비에이션", "ACHR": "아처 에비에이션", "SOFI": "소파이",
    "AFRM": "어펌", "UPST": "업스타트", "DKNG": "드래프트킹스", "CVNA": "카바나", "APP": "앱러빈",
    "TTD": "트레이드 데스크", "ZM": "줌", "DOCU": "도큐사인", "TEAM": "아틀라시안", "NOW": "서비스나우",
    "INTU": "인튜이트", "WDAY": "워크데이", "ADSK": "오토데스크", "TTWO": "테이크투", "RDDT": "레딧",
    "GME": "게임스톱", "AMC": "AMC 엔터테인먼트", "CPNG": "쿠팡", "SE": "씨 리미티드", "MELI": "메르카도 리브레",
    "NU": "누 홀딩스", "GRAB": "그랩", "PM": "필립모리스", "MO": "알트리아", "ABT": "애보트", "DHR": "다나허",
    "LIN": "린데", "ACN": "액센츄어", "SPGI": "S&P 글로벌",
    # ETF
    "SPY": "S&P500 ETF (SPDR)", "VOO": "S&P500 ETF (뱅가드)", "IVV": "S&P500 ETF (아이셰어즈)",
    "QQQ": "나스닥100 ETF (인베스코)/큐큐큐", "QQQM": "나스닥100 ETF (인베스코 QQQM)", "VTI": "미국 전체 주식 ETF (뱅가드)",
    "SCHD": "미국 배당 ETF (슈왑)/슈드", "JEPI": "JP모건 프리미엄 인컴 ETF/제피", "JEPQ": "JP모건 나스닥 프리미엄 인컴 ETF/젭큐",
    "TQQQ": "나스닥100 3배 ETF", "SQQQ": "나스닥100 3배 인버스 ETF", "SOXL": "반도체 3배 ETF/속슬",
    "SOXS": "반도체 3배 인버스 ETF", "SOXX": "반도체 ETF (아이셰어즈)", "SMH": "반도체 ETF (반에크)",
    "UPRO": "S&P500 3배 ETF", "SPXL": "S&P500 3배 ETF (디렉시온)", "TLT": "미국 장기국채 20년 ETF",
    "TMF": "미국 장기국채 3배 ETF", "IEF": "미국 국채 7-10년 ETF", "SHY": "미국 단기국채 ETF",
    "SGOV": "미국 초단기국채 ETF", "BIL": "미국 초단기국채 ETF (SPDR)", "BND": "미국 채권 종합 ETF (뱅가드)",
    "AGG": "미국 채권 종합 ETF (아이셰어즈)", "HYG": "하이일드 채권 ETF", "LQD": "투자등급 회사채 ETF",
    "GLD": "금 ETF (SPDR)", "IAU": "금 ETF (아이셰어즈)", "SLV": "은 ETF", "USO": "원유 ETF",
    "XLK": "기술주 섹터 ETF", "XLF": "금융주 섹터 ETF", "XLE": "에너지 섹터 ETF", "XLV": "헬스케어 섹터 ETF",
    "XLY": "경기소비재 섹터 ETF", "XLP": "필수소비재 섹터 ETF", "XLU": "유틸리티 섹터 ETF", "XLI": "산업재 섹터 ETF",
    "VNQ": "미국 리츠 ETF", "VIG": "배당성장 ETF (뱅가드)", "DGRO": "배당성장 ETF (아이셰어즈)",
    "VYM": "고배당 ETF (뱅가드)", "DIA": "다우존스 ETF", "IWM": "러셀2000 ETF", "ARKK": "아크 이노베이션 ETF",
    "IBIT": "비트코인 현물 ETF (블랙록)", "FBTC": "비트코인 현물 ETF (피델리티)", "ETHA": "이더리움 현물 ETF (블랙록)",
    "BITO": "비트코인 선물 ETF", "KWEB": "중국 인터넷 ETF", "FXI": "중국 대형주 ETF", "EWY": "한국 MSCI ETF",
    "EWJ": "일본 MSCI ETF", "INDA": "인도 MSCI ETF", "VEA": "선진국 주식 ETF (뱅가드)",
    "VXUS": "미국 외 전 세계 주식 ETF (뱅가드)", "VT": "전 세계 주식 ETF (뱅가드)", "SCHG": "미국 성장주 ETF (슈왑)",
    "RSP": "S&P500 동일가중 ETF", "SPYD": "S&P500 고배당 ETF", "NOBL": "배당귀족 ETF", "QYLD": "나스닥100 커버드콜 ETF",
    "DIVO": "배당 커버드콜 ETF", "URA": "우라늄 ETF", "LIT": "리튬·배터리 ETF", "ICLN": "클린에너지 ETF",
    "XBI": "바이오 ETF (SPDR)", "IBB": "바이오 ETF (아이셰어즈)", "KRE": "지역은행 ETF", "MAGS": "매그니피센트7 ETF",
    "BOTZ": "로봇·AI ETF", "NVDL": "엔비디아 2배 ETF", "TSLL": "테슬라 2배 ETF",
}

# ---------------------------------------------------------------- 야후에서 받기


def screen(query, quote_type, lang, region, sort, limit=None, page=250, pause=0.3):
    """야후 스크리너를 끝까지(또는 limit개까지) 넘겨 가며 받아요. yfinance가 쿠키·crumb를 챙겨 줘요."""
    from yfinance.data import YfData

    data, out = YfData(), []
    while True:
        body = dict(offset=len(out), size=page, sortField=sort, sortType="DESC", quoteType=quote_type,
                    query=query.to_dict(), userId="", userIdType="guid")
        r = data.post(SCREENER, data=json.dumps(body, separators=(",", ":")),
                      params={"corsDomain": "finance.yahoo.com", "formatted": "false", "lang": lang, "region": region})
        r.raise_for_status()
        res = r.json()["finance"]["result"][0]
        quotes = res.get("quotes") or []
        out += quotes
        if not quotes or len(out) >= (res.get("total") or 0) or (limit and len(out) >= limit):
            return out[:limit] if limit else out
        time.sleep(pause)


def fetch(market):
    """야후 원자료: (주식 목록, ETF 목록)."""
    from yfinance import EquityQuery, ETFQuery

    if market == "kr":
        return (screen(EquityQuery("is-in", ["exchange", "KSC", "KOE"]), "EQUITY", "ko-KR", "KR", "intradaymarketcap"),
                screen(ETFQuery("eq", ["region", "kr"]), "ETF", "ko-KR", "KR", "avgdailyvol3m"))
    stocks = EquityQuery("and", [EquityQuery("is-in", ["exchange", "NMS", "NYQ", "ASE", "NGM", "NCM"]),
                                 EquityQuery("gte", ["intradaymarketcap", US_MIN_CAP])])
    return (screen(stocks, "EQUITY", "en-US", "US", "intradaymarketcap"),
            screen(ETFQuery("eq", ["region", "us"]), "ETF", "en-US", "US", "fundnetassets", limit=US_ETFS))


def aliases(*names, skip=()):
    """다른 이름들을 '|'로. 화면 이름과 같거나, 다른 이름의 앞부분(야후가 잘라 준 이름)이면 빼요."""
    out = []
    for n in names:
        n = (n or "").strip()
        if n and n not in skip and not any(o.startswith(n) for o in out):
            out = [o for o in out if not n.startswith(o)] + [n]
    return "|".join(out)


def rows_kr(stocks, etfs, universe=None):
    universe = MARKETS["kr"]["universe"] if universe is None else universe
    rows, seen = [], set()
    for q, kind in [(x, "s") for x in stocks] + [(x, "e") for x in etfs]:
        code, _, sfx = (q.get("symbol") or "").partition(".")
        long_name, short_name = q.get("longName"), q.get("shortName")
        if len(code) != 6 or sfx not in ("KS", "KQ") or code in seen or not (long_name or short_name):
            continue  # 신주인수권 같은 8자리 코드, 이름 없는 종목은 빼요
        seen.add(code)
        if universe.get(code):
            name = universe[code]
        elif kind == "s":
            name = kr_stock_name(long_name, short_name)
            if preferred(short_name):  # 우선주 정식 이름은 보통주와 같아서('삼성전자') 넣으면 보통주를 찾을 때 헷갈려요
                long_name = None
        else:
            name = kr_etf_name(long_name, short_name)
            if korean_etf_name(long_name, short_name):  # 한국어 원래 이름에서 만든 이름이면 그 긴 이름은 또 넣을 필요가 없어요
                long_name = None
        rows.append([code, name, sfx, kind, aliases(short_name, clean(long_name), skip=(name,))])
    return rows


def rows_us(stocks, etfs, universe=None):
    universe = MARKETS["us"]["universe"] if universe is None else universe
    rows, seen = [], set()
    for q, kind in [(x, "s") for x in stocks] + [(x, "e") for x in etfs]:
        code = q.get("symbol") or ""
        long_name, short_name = q.get("longName"), q.get("shortName")
        if not re.fullmatch(r"[A-Z]{1,5}(-[A-Z])?", code) or code in seen or not (long_name or short_name):
            continue  # 우선주(JPM-PC 같은)·이상한 코드는 빼요
        seen.add(code)
        english = (long_name or short_name).strip()
        ko = (universe.get(code) if universe.get(code) != code else None) or US_KO.get(code, "").split("/")[0] or None
        extra = US_KO.get(code, "").split("/")[1:]
        name = ko or english
        rows.append([code, name, "", kind, aliases(english, short_name, *extra, skip=(name,))])
    return rows


def build(market, fetch=fetch):
    stocks, etfs = fetch(market)
    rows = rows_kr(stocks, etfs) if market == "kr" else rows_us(stocks, etfs)
    return dict(updated=dt.datetime.now(KST).isoformat(timespec="minutes"), rows=rows)


def save(path, data, minimum):
    """너무 적게 받았으면(야후가 막혔을 때) 지난번 목록을 그대로 둬요."""
    if len(data["rows"]) < minimum:
        print(f"{path}: {len(data['rows'])}개만 받아서 저장하지 않았어요")
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    # 한 줄에 한 종목: 매주 바뀐 종목만 커밋 차이로 보여요
    rows = ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in data["rows"])
    path.write_text(f'{{"updated":{json.dumps(data["updated"])},"rows":[\n{rows}\n]}}\n')
    return True


def load(market, folder=pathlib.Path("paper/symbols")):
    try:
        return json.loads((folder / f"{market}.json").read_text()).get("rows", [])
    except (OSError, ValueError):
        return []


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--market", action="append", choices=sorted(MARKETS), help="여러 번 쓸 수 있어요 (기본: 둘 다)")
    ap.add_argument("--dir", type=pathlib.Path, default=pathlib.Path("paper/symbols"))
    args = ap.parse_args()
    for market in args.market or ["kr", "us"]:
        try:
            data = build(market)
        except Exception as e:  # 야후가 막히면 지난번 목록을 써요
            print(f"{MARKETS[market]['name']} 종목 목록을 못 받았어요: {e!r}")
            continue
        if save(args.dir / f"{market}.json", data, minimum=1000):
            print(f"{MARKETS[market]['name']} 종목 목록 {len(data['rows'])}개")


if __name__ == "__main__":
    main()
