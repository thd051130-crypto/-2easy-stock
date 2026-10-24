#!/usr/bin/env python3
"""매일 장 마감 뒤 시세 자료: 많이 움직인 종목과 이유, 업종 흐름, 주가 그대로·거래량 급증, 지수 캔들, 관심종목 시세.

사고팔기 신호는 없어요 (2026-10-24 사용자가 매매 규칙·가상계좌를 없앰). 텔레그램은 리포트 부서(report_desks.py)가 보내요.
결과: paper/<시장>/daily.json → 앱(dashboard.py)과 리포트 부서가 읽어요.
데이터는 야후 파이낸스 일봉(무료)이라 계좌나 증권사 API 키가 없어도 돌아가요.

사용법:
    python daily.py --market kr --save-json paper/kr/daily.json
    python daily.py --market us --csv data/us_daily_recent.csv   # 받아 둔 데이터로
"""

import argparse
import datetime as dt
import json
import pathlib
import tempfile

import pandas as pd

import health
import marketdata as md
import movers
import quiet_volume
import sectors
from markets import MARKETS

KST = dt.timezone(dt.timedelta(hours=9))
LOOKBACK_DAYS = 500  # 200일선 계산에 필요한 거래일(약 280일)보다 넉넉하게


def index_series(index_close, days=260):
    """대시보드 지수 차트용: 최근 days거래일 종가와 50·200일선."""
    ma50, ma200 = index_close.rolling(50).mean(), index_close.rolling(200).mean()
    tail = index_close.index[-days:]

    def nums(s):
        return [None if pd.isna(x) else round(float(x), 2) for x in s.loc[tail]]

    return dict(dates=[f"{d:%Y-%m-%d}" for d in tail], close=nums(index_close), ma50=nums(ma50), ma200=nums(ma200))


def stock_summary(closes, market, days=60):
    """관심종목 화면용: 종목별 마지막 종가, 전일 대비 등락률, 최근 days거래일(약 3개월) 종가."""
    names = dict(MARKETS[market]["universe"])
    out = []
    for code, name in names.items():
        if code not in closes:
            continue
        s = closes[code].dropna()
        if len(s) < 2:
            continue
        spark = [round(float(x)) if market == "kr" else round(float(x), 2) for x in s.iloc[-days:]]
        out.append(dict(code=code, name=name, day=f"{s.index[-1]:%Y-%m-%d}", close=round(float(s.iloc[-1]), 2),
                        d1=round(float(s.iloc[-1] / s.iloc[-2] - 1), 4), spark=spark, **screen_stats(s)))
    return out


def screen_stats(s):
    """조건 검색용: 200일선 대비(%), RSI14, 52주(252거래일) 최고가 대비(%). 기간이 모자라면 그 값은 빼요."""
    out = {}
    last = float(s.iloc[-1])
    if len(s) >= 200:
        out["ma200"] = round(last / float(s.iloc[-200:].mean()) - 1, 4)
    if len(s) >= 15:
        d = s.diff().iloc[-14:]
        up, down = float(d.clip(lower=0).mean()), float(-d.clip(upper=0).mean())
        out["rsi14"] = round(100.0 if down == 0 else 100 - 100 / (1 + up / down), 1)
    out["hi52"] = round(last / float(s.iloc[-252:].max()) - 1, 4)
    return out


def ohlc_payload(h, date_fmt="%Y-%m-%d"):
    """Open·High·Low·Close(·Volume) 표를 대시보드 JSON 모양(dates, o, h, l, c, v)으로. 거래량이 없으면 v는 빼요."""
    def col(name):
        return [round(float(x), 2) for x in h[name]]

    out = dict(dates=[f"{d:{date_fmt}}" for d in h.index], o=col("Open"), h=col("High"), l=col("Low"), c=col("Close"))
    if "Volume" in h:
        out["v"] = [int(x) for x in h["Volume"].fillna(0)]
    return out


def monthly_ohlc(h):
    """야후 월봉을 한 달에 한 줄로 정리해요 (이번 달이 두 줄로 오는 경우가 있어서 달별로 다시 묶어요)."""
    h = h.copy()
    h.index = pd.to_datetime(h.index).tz_localize(None)
    g = h.groupby(h.index.to_period("M"))
    m = pd.DataFrame({"Open": g["Open"].first(), "High": g["High"].max(), "Low": g["Low"].min(), "Close": g["Close"].last()})
    if "Volume" in h:
        m["Volume"] = g["Volume"].sum()
    m.index = m.index.to_timestamp()
    return m


def index_candles(symbol, years=5):
    """대시보드 캔들 차트용 지수 일봉(시가·고가·저가·종가·거래량) years년치 + 월봉·년봉용 전체 기간 월봉(monthly).
    일봉을 못 받으면 None (화면은 선 그래프로 대신해요). 월봉만 못 받으면 화면이 일봉을 묶어서 그려요."""
    cols = ["Open", "High", "Low", "Close"]

    def table(h):  # 거래량은 있으면 같이 (보조지표 거래량 막대)
        return h[cols + ["Volume"] if "Volume" in h else cols].dropna(subset=cols)

    try:
        import yfinance as yf

        ticker = yf.Ticker(symbol)
        h = table(ticker.history(period=f"{years}y", auto_adjust=False))
    except Exception as e:  # 네트워크, 레이트리밋 등
        print(f"지수 캔들 데이터를 못 받았어요: {e!r}")
        return None
    if h.empty:
        return None
    h.index = pd.to_datetime(h.index).tz_localize(None)
    out = ohlc_payload(h)
    try:
        mh = table(ticker.history(period="max", interval="1mo", auto_adjust=False))
        if not mh.empty:
            out["monthly"] = ohlc_payload(monthly_ohlc(mh), "%Y-%m")
    except Exception as e:
        print(f"지수 월봉 데이터를 못 받았어요 (월봉·년봉은 일봉을 묶어서 그려요): {e!r}")
    return out


def usdkrw():
    """원달러 환율 마지막 종가 (야후 KRW=X). 못 받으면 None."""
    try:
        import yfinance as yf

        h = yf.Ticker("KRW=X").history(period="10d")
        return round(float(h["Close"].dropna().iloc[-1]), 2)
    except Exception as e:
        print(f"환율을 못 받았어요: {e!r}")
        return None


def save_json(path, payload):
    payload = dict(payload, generated=dt.datetime.now(KST).isoformat(timespec="minutes"))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")


def add_movers(payload, args, path, today, closes, index_close, volumes, wide_closes):
    """많이 움직인 종목과 추정 이유(movers.py), 주가 그대로·거래량 급증(quiet_volume.py)을 붙여요. 실패해도 나머지는 그대로 저장해요."""
    m = MARKETS[args.market]
    try:
        names = dict(m["universe"])
        if args.market == "kr":
            wpath, wnames = path.with_name("kr_wide_recent.csv"), md.wide_kr()
        else:  # 미장은 넓은 범위 종목을 여기서 받아요 (신호에는 안 써요)
            wpath, wnames = path.with_name("us_wide_recent.csv"), md.wide_us()
            if args.csv is None or not wpath.exists():
                md.download(wpath, start=f"{today - dt.timedelta(days=LOOKBACK_DAYS):%Y-%m-%d}", universe=wnames,
                            index=m["index"], suffix=m["suffix"], pause=0.5)
            _, wide_closes, _ = md.load_csv(wpath, m["index"])
        names.update(wnames)
        every, vols = closes, volumes
        if wide_closes is not None and wpath.exists():
            extra = [c for c in wide_closes if c in wnames and c not in every]
            every = every.join(wide_closes[extra])
            wvol = md.load_volume(wpath, closes.index, m["index"])
            if vols is not None and wvol is not None:
                vols = vols.join(wvol[[c for c in extra if c in wvol]])
        result = movers.compute(every, index_close, vols, names, m["index_name"], lang="ko")
    except (Exception, SystemExit) as e:
        print(f"많이 움직인 종목 이유 계산 실패: {e!r}")
        return payload
    payload = dict(payload, movers=result)
    try:  # 주가는 그대로인데 거래량만 급증한 종목 (참고, quiet_volume.py)
        quiet = quiet_volume.compute(every, vols, names)
    except Exception as e:
        print(f"거래량 급증 종목 계산 실패: {e!r}")
        return payload
    return dict(payload, quiet_volume=quiet)


def add_sectors(payload, args, path, closes, index_close):
    """업종별 흐름과 뉴스 호재·악재(sectors.py)를 붙여요. 실패해도 나머지는 그대로 저장해요."""
    m = MARKETS[args.market]
    try:
        smap = sectors.load()
        names = dict(m["universe"])
        every = closes
        wpath = path.with_name(f"{args.market}_wide_recent.csv")
        if wpath.exists():
            _, wide_closes, _ = md.load_csv(wpath, m["index"])
            wnames = md.wide_kr() if args.market == "kr" else md.wide_us()
            names.update(wnames)
            every = every.join(wide_closes[[c for c in wide_closes if c in wnames and c not in every]])
        result = sectors.compute(every, index_close, names, smap, args.market, lang="ko" if args.market == "kr" else "en",
                                 fetch_news=movers.google_news)
    except (Exception, SystemExit) as e:
        print(f"업종별 호재·악재 계산 실패: {e!r}")
        return payload
    for key in ("up", "down"):
        for row in (payload.get("movers") or {}).get(key) or []:
            row["sector"] = sectors.sector_of(smap, args.market, row["code"])
    return dict(payload, sectors=result, sector_links=sectors.RELATED,
                sector_of={c: s for c in every.columns if (s := sectors.sector_of(smap, args.market, c))})


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--market", choices=sorted(MARKETS), default="kr")
    parser.add_argument("--csv", type=pathlib.Path, help="date,ticker,open,close(,volume) 형식 (없으면 야후에서 받아요)")
    parser.add_argument("--save-csv", type=pathlib.Path, help="받은 야후 데이터를 이 경로에 남겨요")
    parser.add_argument("--save-json", type=pathlib.Path, help="앱·리포트가 읽을 JSON (paper/<시장>/daily.json)")
    args = parser.parse_args()

    m = MARKETS[args.market]
    today = dt.datetime.now(KST).date()
    path = args.csv
    if path is None:
        path = args.save_csv or pathlib.Path(tempfile.mkdtemp()) / f"{args.market}_daily_recent.csv"
        try:
            md.download(path, start=f"{today - dt.timedelta(days=LOOKBACK_DAYS):%Y-%m-%d}", universe=m["universe"],
                        index=m["index"], suffix=m["suffix"])
        except SystemExit as e:  # 고장 알림(health.py fail)이 이 이유를 붙여서 보내요
            health.record_error(f"{m['name']} 야후 시세를 못 받아서 오늘 자료를 만들지 못했어요: {e}")
            raise
    _, closes, index_close = md.load_csv(path, m["index"])
    errors, warnings = health.check_data(closes, index_close, list(m["universe"]), today, m["universe"])
    if errors:  # 엉터리 데이터로 리포트를 만드느니 멈추고 알려요
        health.record_error(f"{m['name']} 시세 점검: " + " ".join(errors))
        raise SystemExit(" ".join(errors))
    volumes = md.load_volume(path, closes.index, m["index"])
    payload = dict(market=args.market, day=f"{index_close.index[-1]:%Y-%m-%d}", index=round(float(index_close.iloc[-1]), 2),
                   breadth=round(float(md.breadth(closes).iloc[-1]), 3), series=index_series(index_close))
    wide_closes = None
    if args.market == "kr":  # 코스피 시가총액 상위 종목도 같이 봐요 (많이 움직인 종목·업종)
        try:
            wpath = path.with_name("kr_wide_recent.csv")
            if args.csv is None or not wpath.exists():
                md.download(wpath, start=f"{today - dt.timedelta(days=LOOKBACK_DAYS):%Y-%m-%d}", universe=md.wide_kr(),
                            index=m["index"], suffix=m["suffix"], pause=0.5)
            _, wide_closes, _ = md.load_csv(wpath, m["index"])
        except (Exception, SystemExit) as e:
            print(f"넓은 범위 종목을 못 받았어요 (기본 종목만으로 계산해요): {e!r}")
    payload = add_movers(payload, args, path, today, closes, index_close, volumes, wide_closes)
    payload = add_sectors(payload, args, path, closes, index_close)
    if warnings:
        payload["data_warnings"] = warnings
    payload["usdkrw"] = usdkrw()  # 앱이 미장 금액을 원화로 바꿀 때 써요
    payload["candles"] = index_candles(m["index"])
    payload["stocks"] = stock_summary(closes, args.market)
    if args.save_json:
        save_json(args.save_json, payload)
    print(json.dumps({k: payload[k] for k in ("market", "day", "index", "breadth")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
