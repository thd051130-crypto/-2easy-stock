"""국장(코스피 대형주)과 미장(S&P 500 대형주) 설정을 한곳에 모아 둬요."""

import kr_swing_backtest as kb

# 2015년 말 S&P 500 시가총액 상위권 위주 (지금 잘나가는 종목만 고르는 생존편향을 줄이려고 과거 기준으로 골랐어요).
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

MARKETS = {
    "kr": dict(name="국장", index_name="코스피", universe=kb.UNIVERSE, index=kb.INDEX, suffix=".KS",
               currency="원", capital=10_000_000,
               # 수수료(각 방향), 매도 시 거래세, 시가 슬리피지
               cost=kb.COSTS["기본"]),
    "us": dict(name="미장", index_name="S&P500", universe=US_UNIVERSE, index="^GSPC", suffix="",
               currency="달러", capital=7470,  # 1,000만 원 ÷ 1,339원 (2026-10-08 환율)
               # 국내 증권사 미국주식 수수료 0.25% 가정(이벤트가 없을 때), 거래세 대신 SEC fee 수준만, 환전 비용은 빠짐
               cost=dict(fee=0.0025, tax=0.00003, slip=0.0005)),
}


def name_of(market, code):
    return MARKETS[market]["universe"].get(code, code)
