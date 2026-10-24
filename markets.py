"""국장(코스피 대형주)과 미장(S&P 500 대형주) 설정을 한곳에 모아 둬요."""

import marketdata as md

MARKETS = {
    "kr": dict(name="국장", index_name="코스피", universe=md.UNIVERSE, index=md.INDEX, suffix=".KS", currency="원"),
    "us": dict(name="미장", index_name="S&P500", universe=md.US_UNIVERSE, index="^GSPC", suffix="", currency="달러"),
}


def name_of(market, code):
    return MARKETS[market]["universe"].get(code, code)
