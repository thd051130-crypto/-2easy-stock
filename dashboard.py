#!/usr/bin/env python3
"""폰으로 보는 대시보드(GitHub Pages)에 올릴 data.json을 만들어요.

paper/<시장>/ 에 쌓인 기록만 읽어요 (네트워크·pandas 필요 없음).
  - signal.json : 오늘의 신호와 지수 추세 (kr_swing_signals.py --save-json)
  - state.json, equity.csv, trades.csv : 가상계좌 (paper_trade.py)
  - paper/watch.json, alerts.json, bot.json : 텔레그램으로 넣은 관심종목·가격 알림 (bot.py)
  - paper/etf/ : 국내 상장 ETF 원화 가상계좌 (paper_trade.py --rule etf)
  - paper/health.json : 주간 점검 (health.py)
  - paper/macro.json : 경기 국면 (macro.py)
  - paper/world.json : 세계 지수·환율 (world.py)
  - paper/calendar.json : 경제 일정 (econ_calendar.py)
  - paper/kr/disclosures.json : 국장 종목 공시 (disclosures.py, 오픈DART 키가 있을 때만)
  - paper/kr/flows.json : 국장 외국인·기관 수급 (flows.py) → 홈 경고·요약만 (종목별 막대는 stock_pages.py)
  - paper/symbols/ : 검색용 전체 종목 목록 (symbols.py) → <out>/symbols/ 로 복사
  - themes.py : 문장 검색용 테마 사전 → <out>/themes.json
  - industry_map.py : 산업 지도 점·선 → <out>/industry.json (시세·주가 동행은 pages 워크플로가 이어서 채워요)

사용법:
    python dashboard.py                 # site/ 를 _site/ 로 복사하고 _site/data.json 생성
    python dashboard.py --out preview   # 다른 폴더로
"""

import argparse
import csv
import datetime as dt
import hashlib
import json
import pathlib
import shutil

import commands
import flows
import industry_map
import readiness
import review
import strategy
import themes
import watchlist
from markets import MARKETS

KST = dt.timezone(dt.timedelta(hours=9))
RECENT_TRADES = 30

RULES = {
    "kr": [
        f"코스피가 50일선과 200일선 둘 다 위이고, 대형주 {strategy.KR_BREADTH_MIN:.0%} 이상이 200일선 위일 때만 새로 사요.",
        "종목이 200일선 위이고, 최근 10일 안에 20일 신고가를 낸 뒤 RSI2가 10 아래로 눌리면 다음 날 시가에 사요.",
        f"최근 20일 변동성이 연 {strategy.KR_STOCK_VOL_MAX:.0%} 넘게 출렁이는 종목은 건너뛰어요.",
        f"종목당 계좌의 {strategy.KR_WEIGHT:.0%}, 최대 5종목이라 다 차도 절반은 현금이에요.",
        f"종가가 5일선 위, 10거래일 경과, 매수가 대비 -{strategy.KR_STOP:.0%} 아래 마감 중 하나면 다음 날 시가에 팔아요.",
        "실적 발표 시즌(1·4·7·10월 20일 ~ 다음 달 중순)엔 새로 사지 않아요. 이미 산 종목은 평소처럼 팔아요.",
        "백테스트(2011~): 연 +4.5%, 최대 낙폭 -3.2% (코스피 보유는 연 +8.3%, 최대 낙폭 -44%).",
        "펀더멘탈부 등급(ROE·부채·이익·PER)은 참고용이에요. 과거 재무 자료가 무료로 없어 검증하지 못해 규칙에는 안 넣었어요.",
    ],
    "us": [
        f"S&P500이 200일선 위이고 50일선도 200일선 위면 계좌의 {strategy.US_WEIGHT:.0%}를 {strategy.US_ETF}로 들고 있어요.",
        f"S&P500 20일 변동성이 연 {strategy.US_VOL_MAX:.0%}를 넘어도 현금으로 쉬어요.",
        "조건이 깨지면 다음 날 시가에 전부 팔고 현금으로 기다려요.",
        "미장 개별주 스윙은 국내 증권사 수수료(0.25%)를 내면 백테스트에서 손실이라 쓰지 않아요.",
        "백테스트(2011~, 배당 포함): 연 +5.7%, 최대 낙폭 -9.5% (S&P500 보유는 연 +12.2%, 최대 낙폭 -34%).",
    ],
}


def read_json(path):
    return json.loads(path.read_text()) if path.exists() else None


def read_rows(path):
    if not path.exists():
        return []
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def account(folder, market, kind=None):
    """가상계좌 요약. 아직 첫 기록 전이면 None. kind: 매매 복기용 규칙 이름 (kr|us|etf|rulebook, 기본 market)."""
    state = read_json(folder / "state.json")
    equity = [dict(date=r["date"], equity=num(r["equity"]), index=num(r["index"]), cash=num(r["cash"]))
              for r in read_rows(folder / "equity.csv")]
    if not state or not equity:
        return None
    capital, index_start = state["capital"], state.get("index_start") or equity[0]["index"]
    peak, mdd, curve = 0.0, 0.0, []
    for r in equity:
        peak = max(peak, r["equity"])
        mdd = min(mdd, r["equity"] / peak - 1)
        curve.append(dict(date=r["date"], account=round(r["equity"] / capital - 1, 5),
                          index=round(r["index"] / index_start - 1, 5)))
    last = equity[-1]
    names = {p["code"]: p["name"] for p in state["positions"]}
    positions = []
    for p in state["positions"]:
        price = p.get("last_price") or p["buy_price"]
        positions.append(dict(code=p["code"], name=p["name"], qty=round(p["qty"], 4), buy_date=p["buy_date"],
                              buy_price=round(p["buy_price"], 2), price=round(price, 2),
                              value=round(p["qty"] * price, 2), ret=round(p["qty"] * price / p["cost"] - 1, 4)))
    trades = []
    rows = read_rows(folder / "trades.csv")
    notes = review.notes(rows, {r["date"]: r["index"] for r in equity if r["index"]}, kind or market)
    for t, n in zip(rows, notes):
        trades.append(dict(code=t["code"], name=t["name"], buy_date=t["buy_date"], sell_date=t["sell_date"],
                           buy_price=num(t["buy_price"]), sell_price=num(t["sell_price"]), pnl=num(t["pnl"]),
                           ret=num(t["ret"]), days=int(num(t["days"]) or 0), reason=t["reason"],
                           buy_why=n["buy"], index_ret=n["index"], verdict=n["verdict"]))
    rets = [t["ret"] for t in trades if t["ret"] is not None]
    return dict(
        capital=capital, start=state["start"], last_day=last["date"], equity=last["equity"], cash=last["cash"],
        gain=round(last["equity"] / capital - 1, 5), index_gain=round(last["index"] / index_start - 1, 5),
        mdd=round(mdd, 5), curve=curve, positions=positions,
        pending_buys=[o["name"] for o in state.get("pending_buys", [])],
        pending_sells=[names.get(o["code"], o["code"]) for o in state.get("pending_sells", [])],
        trades=trades[::-1][:RECENT_TRADES], trade_count=len(trades),
        win_rate=round(sum(r > 0 for r in rets) / len(rets), 4) if rets else None,
        realized=round(sum(t["pnl"] or 0 for t in trades), 2))


RULEBOOK_RULES = [
    "내 매매 규칙표를 알림과 따로 가상계좌로 검증하는 중이에요 (국장 1,000만 원, 미장 7,470달러(약 1,000만 원)).",
    "종목이 200일선 위, 60일선 > 200일선, RSI14 45~60, 거래량이 20일 평균 이상이면 사요. 하루 +5%·5일 +10% 넘게 오른 종목은 추격하지 않아요.",
    "종목당 계좌의 20%를 30/30/40%로 나눠 사요. 2·3차는 종가가 직전 매수가보다 오를 때만 (물타기 금지).",
    "평균가 +1/+2/+3%에서 30/30/40%씩 익절, 종가가 평균가 -2% 아래면 다음 날 시가에 전부 손절.",
    "계좌가 하루 -1%, 그 주 -2%, 그 달 -4%면 각각 다음 날, 그 주, 그 달 동안 새로 사지 않아요.",
    "백테스트(2011~): 국장 연 -2.3%, 최대 낙폭 -50% / 미장 연 -5.1%, 최대 낙폭 -56%. 그래서 알림 규칙은 바꾸지 않았어요.",
]


ETF_RULES = [
    "미장 알림과 같은 신호를 국내 상장 ETF로 원화 계좌에서 따라 하는 가상계좌예요 (1,000만 원, 1주 단위).",
    f"S&P500이 200일선 위이고 50일선도 200일선 위이며 20일 변동성이 연 {strategy.US_VOL_MAX:.0%} 이하면 계좌의 50%를 "
    "TIGER 미국S&P500(360750)으로, 아니면 현금이에요.",
    "국장 마감 뒤 신호를 보고 다음 거래일 시가에 사고팔아요. 국내 ETF라 ISA·연금저축 계좌에서 그대로 살 수 있어요.",
    "백테스트(2011~, 원화): 연 +7.1%, 최대 낙폭 -8.4% (그냥 보유는 연 +15.0%, 최대 낙폭 -30.2%). "
    "코스피 ETF를 더한 안은 낙폭이 커서 뺐어요 (docs/etf-backtest.md).",
]


FUND_KEYS = ("name", "per", "loss", "pbr", "div", "roe", "debt", "financial", "cap", "target", "events")


def fund_table(path):
    """조건 검색·배당 달력·히트맵·실적 일정용 종목별 재무 한 줄 (fundamentals.json에서 화면에 쓰는 것만).
    등급은 [등급, 점수, 만점]으로 줄여요. 종목 화면의 연간·분기 재무제표는 stock_pages.py가 따로 붙여요."""
    stocks = (read_json(path) or {}).get("stocks") or {}
    out = {}
    for code, f in stocks.items():
        row = {k: f.get(k) for k in FUND_KEYS if f.get(k) not in (None, {}, False)}
        g = f.get("grade") or {}
        if g.get("score") is not None:
            row["grade"] = [g.get("grade"), g["score"], g.get("total")]
        out[code] = row
    return out


def readiness_of(key, acct, health):
    if not acct:
        return None
    return readiness.evaluate(key, len(acct["curve"]), acct["mdd"], acct["trade_count"], health)


def total_assets(markets, etf_acct, fx):
    """가상계좌 세 개(국장·미장·ETF)를 원화로 합친 내 자산. 계좌가 하나도 없거나 환율이 없으면 None."""
    if not fx:
        return None
    parts = []
    for label, acct, rate in (("국장", markets["kr"]["account"], 1.0), ("미장", markets["us"]["account"], fx),
                              ("ETF", etf_acct, 1.0)):
        if acct:
            stocks = acct["equity"] - acct["cash"]
            parts.append(dict(label=label, equity=round(acct["equity"] * rate), cash=round(acct["cash"] * rate),
                              stocks=round(stocks * rate), capital=round(acct["capital"] * rate),
                              usd=rate != 1.0))
    if not parts:
        return None
    equity, capital = sum(p["equity"] for p in parts), sum(p["capital"] for p in parts)
    cash = sum(p["cash"] for p in parts)
    usd = sum(p["equity"] for p in parts if p["usd"])
    return dict(equity=equity, capital=capital, gain=round(equity / capital - 1, 5), cash_share=round(cash / equity, 4),
                usd_share=round(usd / equity, 4), fx=fx, parts=parts)


def build(paper_dir):
    markets = {}
    health = read_json(paper_dir / "health.json")
    watch, alerts = watchlist.load_watch(paper_dir), watchlist.load_alerts(paper_dir)["active"]
    for key, m in MARKETS.items():
        folder = paper_dir / key
        markets[key] = dict(name=m["name"], index_name=m["index_name"], currency=m["currency"],
                            capital=m["capital"], signal=read_json(folder / "signal.json"),
                            account=account(folder, key), rules=RULES[key],
                            rulebook=dict(account=account(folder / "rulebook", key, "rulebook"), rules=RULEBOOK_RULES),
                            # 텔레그램으로 넣은 종목 (시세는 배포 때 stock_pages.py가 채워요), 기다리는 가격 알림
                            extras=watch[key], alerts=[a for a in alerts if a.get("market") == key],
                            funds=fund_table(folder / "fundamentals.json"))
        markets[key]["readiness"] = readiness_of(key, markets[key]["account"], health)
    fl = read_json(paper_dir / "kr" / "flows.json")
    markets["kr"]["disclosures"] = (read_json(paper_dir / "kr" / "disclosures.json") or {}).get("items")
    markets["kr"]["flows"] = dict(day=fl.get("day"), warn=flows.warnings(fl), **flows.top_flows(fl)) if fl else None
    etf_acct = account(paper_dir / "etf", "kr", "etf")
    markets["kr"]["etf"] = dict(account=etf_acct, rules=ETF_RULES, readiness=readiness_of("etf", etf_acct, health))
    fx = ((markets["us"]["signal"] or {}).get("usdkrw") or (markets["kr"]["signal"] or {}).get("usdkrw"))
    return dict(built=dt.datetime.now(KST).isoformat(timespec="minutes"), markets=markets,
                bot=watchlist.bot_username(paper_dir), health=health,
                macro=read_json(paper_dir / "macro.json"),
                calendar=(read_json(paper_dir / "calendar.json") or {}).get("events"), world=read_json(paper_dir / "world.json"), memos=commands.summary(paper_dir),
                total=total_assets(markets, etf_acct, fx))


def site_version(site_dir):
    """웹앱 파일이 바뀌면 달라지는 짧은 값. 앱을 열어 둔 사이 새 화면이 배포됐는지 앱이 알아채는 데 써요."""
    h = hashlib.sha1()
    for path in sorted(p for p in site_dir.rglob("*") if p.is_file()):
        h.update(path.relative_to(site_dir).as_posix().encode())
        h.update(path.read_bytes())
    return h.hexdigest()[:12]


def stamp_assets(out_dir):
    """index.html이 부르는 app.js·style.css 주소 끝에 내용 해시를 붙여요 (app.js?v=…).
    파일이 바뀌면 주소도 바뀌어서, 폰 브라우저가 메모리에 들고 있던 예전 파일을 다시 쓰지 않아요."""
    index = out_dir / "index.html"
    html = index.read_text(encoding="utf-8")
    for name in ("app.js", "style.css"):
        asset = out_dir / name
        if asset.exists():
            digest = hashlib.sha1(asset.read_bytes()).hexdigest()[:10]
            html = html.replace(f'"{name}"', f'"{name}?v={digest}"')
    index.write_text(html, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--paper", type=pathlib.Path, default=pathlib.Path("paper"), help="기록 폴더")
    parser.add_argument("--site", type=pathlib.Path, default=pathlib.Path("site"), help="웹앱 소스 폴더")
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("_site"), help="배포할 폴더")
    args = parser.parse_args()
    if args.out.exists():
        shutil.rmtree(args.out)
    shutil.copytree(args.site, args.out)
    stamp_assets(args.out)
    if (args.paper / "symbols").is_dir():  # 검색용 전체 종목 목록
        shutil.copytree(args.paper / "symbols", args.out / "symbols")
    # 문장 검색용 테마 사전 ('전력 관련 종목 찾아줘')
    (args.out / "themes.json").write_text(json.dumps(themes.build(args.paper / "symbols", args.paper / "sectors.json"),
                                                     ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # 산업 지도 점·선 (시세 없이). pages 워크플로가 industry_map.py로 흐름·주가 동행을 채워 덮어써요
    industry_map.write(args.out, industry_map.static_map())
    data = dict(build(args.paper), site_version=site_version(args.site))
    (args.out / "data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    for key, m in data["markets"].items():
        acc = m["account"]
        status = "시작 전" if acc is None else f"{acc['equity']:,.2f} ({acc['gain']:+.1%})"
        print(f"{m['name']}: 신호 {'있음' if m['signal'] else '없음'}, 가상계좌 {status}")
    print(f"{args.out}/ 준비 완료")


if __name__ == "__main__":
    main()
