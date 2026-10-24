"""시세 자료: 야후 일봉 받기·읽기, 기본 종목 48개, 시가총액 상위 넓은 범위 종목, RSI·변동성·시장 폭.

매일 자료(daily.py), 리포트, 종목 진단(commands.py)이 같이 써요. 매매 규칙은 없어요 (2026-10-24 사용자가 매매 규칙을 없앰).
"""

import re

import pandas as pd

# 기본 종목: 2015년 말 코스피 시가총액 상위권 (예전 백테스트 때 고른 목록이에요. 지금은 매일 자료·리포트의 기본 종목)
UNIVERSE = {
    "005930": "삼성전자", "000660": "SK하이닉스", "005380": "현대차", "015760": "한국전력",
    "028260": "삼성물산", "012330": "현대모비스", "090430": "아모레퍼시픽", "032830": "삼성생명",
    "035420": "NAVER", "000270": "기아", "051910": "LG화학", "055550": "신한지주",
    "017670": "SK텔레콤", "034730": "SK", "051900": "LG생활건강", "105560": "KB금융",
    "018260": "삼성에스디에스", "066570": "LG전자", "033780": "KT&G", "096770": "SK이노베이션",
    "005490": "POSCO홀딩스", "003550": "LG", "000810": "삼성화재", "086790": "하나금융지주",
    "009540": "HD한국조선해양", "011170": "롯데케미칼", "010950": "S-Oil", "024110": "기업은행",
    "035250": "강원랜드", "004020": "현대제철", "006400": "삼성SDI", "030200": "KT",
    "010130": "고려아연", "009150": "삼성전기", "000720": "현대건설", "034220": "LG디스플레이",
    "036570": "엔씨소프트", "021240": "코웨이", "010140": "삼성중공업", "097950": "CJ제일제당",
    "139480": "이마트", "023530": "롯데쇼핑", "078930": "GS", "000100": "유한양행",
    "086280": "현대글로비스", "032640": "LG유플러스", "029780": "삼성카드", "004170": "신세계",
}

# 기본 종목: 2015년 말 S&P 500 시가총액 상위권
US_UNIVERSE = {
    "AAPL": "애플", "MSFT": "마이크로소프트", "XOM": "엑슨모빌", "BRK-B": "버크셔해서웨이", "JNJ": "존슨앤드존슨",
    "GE": "GE", "WFC": "웰스파고", "JPM": "JP모건", "AMZN": "아마존", "GOOGL": "알파벳",
    "META": "메타", "PG": "P&G", "VZ": "버라이즌", "PFE": "화이자", "CVX": "셰브론",
    "KO": "코카콜라", "T": "AT&T", "HD": "홈디포", "DIS": "디즈니", "MRK": "머크",
    "INTC": "인텔", "PEP": "펩시코", "CSCO": "시스코", "BAC": "뱅크오브아메리카", "ORCL": "오라클",
    "CMCSA": "컴캐스트", "C": "씨티그룹", "UNH": "유나이티드헬스", "V": "비자", "IBM": "IBM",
    "MO": "알트리아", "AMGN": "암젠", "MA": "마스터카드", "MCD": "맥도날드", "MDT": "메드트로닉",
    "GILD": "길리어드", "BMY": "BMS", "ABBV": "애브비", "WMT": "월마트", "QCOM": "퀄컴",
    "SLB": "슐럼버거", "CVS": "CVS헬스", "UNP": "유니온퍼시픽", "HON": "하니웰", "BA": "보잉",
    "MMM": "3M", "LLY": "일라이릴리", "TXN": "텍사스인스트루먼트",
}

INDEX = "^KS11"
START = "2010-01-01"


def load_csv(path, index=INDEX):
    df = pd.read_csv(path, dtype={"ticker": str}, parse_dates=["date"])
    opens = df.pivot(index="date", columns="ticker", values="open").sort_index()
    closes = df.pivot(index="date", columns="ticker", values="close").sort_index()
    if index not in closes:
        raise SystemExit(f"{path}에 지수({index}) 행이 없어요.")
    index_close = closes.pop(index).dropna()
    opens = opens.drop(columns=[index], errors="ignore")
    calendar = index_close.index
    return opens.reindex(calendar), closes.reindex(calendar), index_close


def load_volume(path, calendar, index=INDEX):
    """거래량 (date x ticker, load_csv와 같은 날짜). 예전 CSV처럼 volume 열이 없으면 None."""
    df = pd.read_csv(path, dtype={"ticker": str}, parse_dates=["date"])
    if "volume" not in df:
        return None
    vol = df.pivot(index="date", columns="ticker", values="volume").sort_index()
    return vol.drop(columns=[index], errors="ignore").reindex(calendar)


def download(path, pause=1.5, retries=5, start=START, universe=None, index=INDEX, suffix=".KS"):
    """야후는 한꺼번에 받으면 429(요청 과다)를 자주 줘서 종목별로 쉬어 가며 받고, 실패하면 간격을 늘려 다시 시도해요."""
    import time

    import yfinance as yf

    symbols = [f"{code}{suffix}" for code in (universe or UNIVERSE)] + [index]
    frames = []
    for symbol in symbols:
        part = None
        for attempt in range(retries):
            try:
                part = yf.Ticker(symbol).history(start=start, auto_adjust=True)
                if not part.empty:
                    break
            except Exception as e:  # 레이트리밋 등
                print(f"{symbol} 재시도 {attempt + 1}/{retries}: {e}")
            time.sleep(pause * 2 ** attempt)
        time.sleep(pause)
        if part is None or part.empty:
            print(f"경고: {symbol} 데이터 없음, 제외")
            continue
        part = part[["Open", "Close", "Volume"]].dropna(how="all", subset=["Open", "Close"])
        part.index = pd.to_datetime(part.index).tz_localize(None).normalize()
        frames.append(pd.DataFrame({"date": part.index, "ticker": symbol.removesuffix(suffix) if suffix else symbol,
                                    "open": part["Open"].to_numpy(), "close": part["Close"].to_numpy(),
                                    "volume": part["Volume"].to_numpy()}))
    if not frames:
        raise SystemExit("다운로드된 데이터가 없어요. 네트워크(야후 파이낸스 접속)를 확인하거나 --csv로 데이터를 넣어 주세요.")
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.concat(frames).to_csv(path, index=False)
    print(f"{path}에 저장했어요.")


def rsi(close, n=2):
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + gain / loss)


def volatility(close, n=20):
    """n일 변동성 (연율). Series나 DataFrame 둘 다 돼요."""
    return close.pct_change(fill_method=None).rolling(n).std() * 252 ** 0.5


def breadth(closes, n=200):
    """시장 폭: 종목 중 n일선 위에 있는 비율 (날짜별)."""
    ma = closes.rolling(n).mean()
    valid = ma.notna() & closes.notna()
    return (closes > ma).where(valid).sum(axis=1) / valid.sum(axis=1).replace(0, float("nan"))


# ---------------------------------------------------------------- 넓은 범위 (시가총액 상위, paper/symbols/<시장>.json)

TOP_N = 200  # 2026-10 100개 → 200개로 늘렸어요
US_TOP_N = 150
PREFERRED = re.compile(r"\d?우[A-C]?(\(.*\))?$")


def wide_kr(n=TOP_N, rows=None):
    """{코드: 이름} 코스피 보통주 시가총액 상위 n개 중 기본 48개에 없는 종목."""
    import symbols  # symbols → markets → 이 파일이라 쓸 때 불러요

    rows = symbols.load("kr") if rows is None else rows
    base = UNIVERSE
    top = [r for r in rows if r[3] == "s" and r[2] == "KS" and not PREFERRED.search(r[1])][:n]
    return {r[0]: r[1] for r in top if r[0] not in base}


def wide_us(n=US_TOP_N, rows=None):
    """{코드: 이름} 미장 주식 시가총액 상위 n개 중 기본 48개에 없는 종목 (같은 회사 다른 주식(GOOG)은 빼요)."""
    import symbols

    rows = symbols.load("us") if rows is None else rows
    base = US_UNIVERSE
    def legal_of(r):  # 'Berkshire Hathaway Inc. New' = 'Berkshire Hathaway Inc.'
        return re.sub(r"\s+New$", "", (r[4] or "").split("|")[0])

    seen = {legal_of(r) for r in rows if r[0] in base}
    out = {}
    for r in rows:
        if len(out) >= n:
            break
        legal = legal_of(r)
        if r[3] != "s" or r[0] in base or (legal and legal in seen):
            continue
        seen.add(legal)
        out[r[0]] = r[1]
    return out
