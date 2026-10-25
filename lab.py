#!/usr/bin/env python3
"""포트폴리오 실험실용 자산 월봉: paper/symbols/lab.json

앱 도구 → 포트폴리오 실험실이 이 파일로 "ETF를 이렇게 섞었으면 과거에 얼마나 떨어졌나"를 폰에서 바로 계산해요.
야후 파이낸스(무료) 월말 수정 종가(분배금 다시 넣은 값)를 받아, 달러 자산은 그달 원/달러로 원화로 바꿔요.
그래서 미국 자산 숫자엔 환율 효과가 들어 있어요 (위기 때 원화가 약해지면 원화 기준 낙폭이 줄어요).
사고팔기 판단은 안 해요. 과거 숫자일 뿐 앞으로를 보장하지 않아요.

한 자산: [키, 이름, 야후 기호, 통화, 설명]. 처음부터 고를 수 있는 자산이고, 다른 ETF는 앱에서 검색해 넣어요 (etf_monthly.py).
결과는 자산마다 월 수익률(%)을 달 목록에 맞춰 둬요 (상장 전 달은 null).
fundamentals 워크플로(매주 토요일)에서 돌려요. 못 받으면 지난번 파일을 그대로 둬요.

사용법:
    python lab.py              # 받아서 저장
    python lab.py --dry-run    # 출력만
"""

import argparse
import datetime as dt
import json
import pathlib

KST = dt.timezone(dt.timedelta(hours=9))
OUT = pathlib.Path("paper/symbols/lab.json")
FX = "KRW=X"
ASSETS = [
    ("kospi", "코스피200", "069500.KS", "krw", "KODEX 200"),
    ("sp500", "미국 S&P500", "SPY", "usd", "SPY (원화로 환산)"),
    ("nasdaq", "미국 나스닥100", "QQQ", "usd", "QQQ (원화로 환산)"),
    ("schd", "미국 배당주", "SCHD", "usd", "SCHD (원화로 환산)"),
    ("krbond", "한국 국고채 10년", "148070.KS", "krw", "KOSEF 국고채10년"),
    ("usmid", "미국 중기 국채", "IEF", "usd", "IEF 7~10년 (원화로 환산)"),
    ("uslong", "미국 장기 국채", "TLT", "usd", "TLT 20년+ (원화로 환산)"),
    ("gold", "금", "GLD", "usd", "GLD (원화로 환산)"),
    ("cash", "단기채(현금 대신)", "153130.KS", "krw", "KODEX 단기채권"),
    ("kosdaq", "코스닥150", "229200.KS", "krw", "KODEX 코스닥150"),
    ("dev", "선진국 주식", "VEA", "usd", "VEA 미국 밖 선진국 (원화로 환산)"),
    ("em", "신흥국 주식", "VWO", "usd", "VWO (원화로 환산)"),
    ("small", "미국 소형주", "IWM", "usd", "IWM 러셀2000 (원화로 환산)"),
    ("reit", "미국 리츠", "VNQ", "usd", "VNQ (원화로 환산)"),
    ("corp", "미국 회사채", "LQD", "usd", "LQD 우량 회사채 (원화로 환산)"),
    ("tips", "미국 물가연동채", "TIP", "usd", "TIP (원화로 환산)"),
    ("usshort", "미국 단기 국채", "SHY", "usd", "SHY 1~3년 (원화로 환산)"),
]


def fetch(start="2000-01-01"):
    import yfinance as yf  # 받을 때만

    syms = [a[2] for a in ASSETS] + [FX]
    df = yf.download(syms, start=start, interval="1mo", auto_adjust=True, progress=False, threads=True)["Close"]
    df.index = df.index.strftime("%Y-%m")
    return df[~df.index.duplicated(keep="last")]


def build(closes):
    """closes: 달(YYYY-MM) × 기호 월말 종가 DataFrame → lab.json 내용."""
    fx = closes[FX]
    fx = fx.where((fx > 500) & (fx < 3000)).ffill()  # 야후 원/달러 월봉에 가끔 0.1 같은 틀린 값이 섞여 있어요
    rets = {}
    for key, name, sym, cur, note in ASSETS:
        s = closes[sym] * fx if cur == "usd" else closes[sym]
        r = s.pct_change(fill_method=None)
        rets[key] = r
    first = min(r.first_valid_index() for r in rets.values() if r.first_valid_index() is not None)
    months = [m for m in closes.index if m >= first]
    assets = []
    for key, name, sym, cur, note in ASSETS:
        r = rets[key].reindex(months)
        vals = [None if v != v else round(float(v) * 100, 3) for v in r]  # v != v: NaN
        start = next((m for m, v in zip(months, vals) if v is not None), None)
        if start is None:
            continue
        assets.append(dict(k=key, name=name, sym=sym, cur=cur, note=note, start=start, r=vals))
    # 검색해서 넣는 미장 ETF(etf_monthly.py, 달러 그대로)를 앱이 원화로 바꿀 때 쓰는 원/달러 월 변화 (%)
    fxr = fx.pct_change(fill_method=None).reindex(months)
    fxs = [None if v != v else round(float(v) * 100, 3) for v in fxr]
    return dict(updated=dt.datetime.now(KST).isoformat(timespec="minutes"), months=months, assets=assets, fx=fxs)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=pathlib.Path, default=OUT)
    parser.add_argument("--dry-run", action="store_true", help="저장하지 않고 출력만")
    args = parser.parse_args()
    lab = build(fetch())
    for a in lab["assets"]:
        print(f"{a['name']} ({a['sym']}): {a['start']}부터 {sum(v is not None for v in a['r'])}달")
    if len(lab["assets"]) < len(ASSETS) // 2:
        raise SystemExit("자산을 절반도 못 받았어요. 지난번 파일을 그대로 둬요.")
    if not args.dry_run:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(lab, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"저장: {args.out}")


if __name__ == "__main__":
    main()
