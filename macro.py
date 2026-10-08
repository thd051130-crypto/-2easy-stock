#!/usr/bin/env python3
"""경기 국면 판정 (경기분석부): 무료 지표로 지금이 확장인지 둔화인지 매일 점수로 매겨요.

전부 무료예요 (유료 AI·유료 API 안 씀).
  - 야후 일봉 (과거 자료가 길어서 백테스트에 써요, macro_backtest.py)
      1. 장단기 금리 역전: 미국 10년 국채 금리(^TNX) < 3개월 국채 금리(^IRX)
      2. 금리 급등: 10년 금리가 6개월 새 1%p 넘게 오름
      3. 유가 급등: WTI(CL=F)가 1년 새 50% 넘게 오름
      4. 원화 급락: 원·달러 환율(KRW=X)이 3개월 새 5% 넘게 오름
      5. 신용 경계: 하이일드 채권(HYG)이 국채(IEF)보다 약해서 비율이 200일선 아래
      6. 경기 민감 원자재 약세: 구리(HG=F)/금(GC=F) 비율이 200일선 아래
      7. 공포 지수: VIX 20일 평균이 25 넘음
    경고 0~1개 '확장', 2~3개 '둔화', 4개 이상 '위축 경고'
    2008년 금융위기를 넣으면 경고가 많을수록 3개월 안 큰 하락이 잦았지만 2010년 이후엔 차이가 없었고,
    이걸로 매수를 줄이는 규칙은 비중을 그냥 덜 들고 있는 것보다 낙폭·수익 둘 다 나아지지 않았어요 (macro_backtest.py).
    그래서 매매 규칙은 안 바꾸고, 리스크관리부 보고에 참고로만 붙여요.
  - FRED (미국 연준 무료 자료, 키 없이 CSV): 실업률·삼 법칙·물가는 참고로만 보여 줘요.
    한 달에 한 번 나오고 나중에 고쳐지는 자료라 과거 시점 그대로를 무료로 구하기 어려워서 규칙엔 안 써요.

매일 아침 판정을 paper/macro.json에 남기고(앱 홈 "경기 국면" 칸, 국장·미장 리스크관리부 보고),
텔레그램은 월요일 아침 "[경기 리포트]"와 판정이 바뀐 날 "[경기 판정 바뀜]"에만 보내요.

사용법:
    python macro.py --dry-run                    # 출력만
    python macro.py --save paper/macro.json      # 기록 (판정이 바뀌면 텔레그램)
    python macro.py --save paper/macro.json --report   # 주간 리포트도 보내기
"""

import argparse
import datetime as dt
import io
import json
import pathlib
import time

import pandas as pd

KST = dt.timezone(dt.timedelta(hours=9))
SYMBOLS = ["^TNX", "^IRX", "CL=F", "KRW=X", "HG=F", "GC=F", "HYG", "IEF", "^VIX"]
START = "1999-01-01"

# (키, 이름, 경고 기준 설명)
SIGNALS = [
    ("inversion", "장단기 금리 역전", "10년 < 3개월 국채 금리"),
    ("rate_jump", "금리 급등", "10년 금리 6개월 +1%p 넘게"),
    ("oil_jump", "유가 급등", "WTI 1년 +50% 넘게"),
    ("won_drop", "원화 급락", "환율 3개월 +5% 넘게"),
    ("credit", "신용 경계", "하이일드/국채 비율 200일선 아래"),
    ("copper", "원자재 약세", "구리/금 비율 200일선 아래"),
    ("fear", "공포 지수", "VIX 20일 평균 25 넘음"),
]
SLOW, CONTRACTION = 2, 4  # 경고 개수 기준


def fetch(start=START, pause=1.5, retries=4):
    """야후 일봉 종가 (date x symbol). 하나도 못 받으면 SystemExit."""
    import yfinance as yf

    out = {}
    for symbol in SYMBOLS:
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
            print(f"경고: {symbol} 데이터 없음")
            continue
        part.index = pd.to_datetime(part.index).tz_localize(None).normalize()
        out[symbol] = part["Close"]
    if not out:
        raise SystemExit("야후에서 경기 지표를 하나도 못 받았어요.")
    return pd.DataFrame(out).sort_index()


def load(path):
    return pd.read_csv(path, index_col=0, parse_dates=True).sort_index()


def _col(d, name):
    return d[name] if name in d else pd.Series(float("nan"), index=d.index)


def values(d):
    """판정에 쓰는 숫자 (날짜별 DataFrame)."""
    d = d.ffill()
    oil = _col(d, "CL=F").clip(lower=1)  # 2020-04 마이너스 유가 때문에
    credit = _col(d, "HYG") / _col(d, "IEF")
    copper = _col(d, "HG=F") / _col(d, "GC=F")
    return pd.DataFrame({
        "ten": _col(d, "^TNX"), "bill": _col(d, "^IRX"),
        "spread": _col(d, "^TNX") - _col(d, "^IRX"),
        "ten_6m": _col(d, "^TNX").diff(126),
        "oil": _col(d, "CL=F"), "oil_1y": oil.pct_change(252, fill_method=None),
        "krw": _col(d, "KRW=X"), "krw_3m": _col(d, "KRW=X").pct_change(63, fill_method=None),
        "credit_gap": credit / credit.rolling(200).mean() - 1,
        "copper_gap": copper / copper.rolling(200).mean() - 1,
        "vix": _col(d, "^VIX"), "vix20": _col(d, "^VIX").rolling(20).mean(),
    })


def warnings(d):
    """날짜별 경고 여부 (자료가 없는 날은 경고 아님)."""
    v = values(d)
    return pd.DataFrame({
        "inversion": v["spread"] < 0,
        "rate_jump": v["ten_6m"] > 1.0,
        "oil_jump": v["oil_1y"] > 0.5,
        "won_drop": v["krw_3m"] > 0.05,
        "credit": v["credit_gap"] < 0,
        "copper": v["copper_gap"] < 0,
        "fear": v["vix20"] > 25,
    }).fillna(False)


def near(d):
    """경고 기준에 거의 닿은 항목 (기준의 80~90% 수준, 아직 경고는 아님)."""
    v = values(d)
    return pd.DataFrame({
        "inversion": v["spread"] < 0.25,
        "rate_jump": v["ten_6m"] > 0.8,
        "oil_jump": v["oil_1y"] > 0.4,
        "won_drop": v["krw_3m"] > 0.04,
        "credit": v["credit_gap"] < 0.01,
        "copper": v["copper_gap"] < 0.01,
        "fear": v["vix20"] > 22,
    }).fillna(False) & ~warnings(d)


def score(d):
    return warnings(d).sum(axis=1)


def regime_of(n):
    return "위축 경고" if n >= CONTRACTION else "둔화" if n >= SLOW else "확장"


def detail(key, v):
    """경고 항목 옆에 붙일 지금 숫자."""
    def f(x, fmt):
        return "자료 없음" if pd.isna(x) else fmt.format(x)

    return {
        "inversion": f(v["spread"], "10년-3개월 {:+.2f}%p") + f" (10년 {v['ten']:.2f}%, 3개월 {v['bill']:.2f}%)",
        "rate_jump": f(v["ten_6m"], "6개월 {:+.2f}%p"),
        "oil_jump": f(v["oil"], "WTI {:.0f}달러") + ", " + f(v["oil_1y"], "1년 {:+.0%}"),
        "won_drop": f(v["krw"], "{:,.0f}원") + ", " + f(v["krw_3m"], "3개월 {:+.1%}"),
        "credit": f(v["credit_gap"], "200일선 대비 {:+.1%}"),
        "copper": f(v["copper_gap"], "200일선 대비 {:+.1%}"),
        "fear": f(v["vix20"], "20일 평균 {:.1f}"),
    }[key]


# ---------------------------------------------------------------- FRED (참고)

FRED = {"UNRATE": "실업률", "SAHMREALTIME": "삼 법칙", "CPIAUCSL": "물가", "ICSA": "실업수당 청구"}


def fred(series, timeout=20):
    """FRED 무료 CSV (키 없이). 실패하면 None."""
    import requests

    try:
        r = requests.get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}", timeout=timeout)
        r.raise_for_status()
        s = pd.read_csv(io.StringIO(r.text), index_col=0, parse_dates=True).iloc[:, 0]
        return pd.to_numeric(s, errors="coerce").dropna()
    except Exception as e:
        print(f"FRED {series} 못 받음: {e}")
        return None


def us_economy(get=fred):
    """미국 실업률·삼 법칙·물가 (참고). 못 받으면 빈 리스트."""
    rows = []
    un = get("UNRATE")
    if un is not None and len(un) >= 13:
        low = un.iloc[-13:-1].min()
        rows.append(dict(key="unrate", name="미국 실업률", value=f"{un.iloc[-1]:.1f}% ({un.index[-1]:%Y-%m})",
                         note=f"1년 최저 {low:.1f}%보다 {un.iloc[-1] - low:+.1f}%p", warn=bool(un.iloc[-1] - low >= 0.5)))
    sahm = get("SAHMREALTIME")
    if sahm is not None and len(sahm):
        x = sahm.iloc[-1]
        rows.append(dict(key="sahm", name="삼 법칙", value=f"{x:.2f}%p ({sahm.index[-1]:%Y-%m})",
                         note="0.5 넘으면 경기 침체가 시작됐을 가능성이 높다는 신호", warn=bool(x >= 0.5)))
    cpi = get("CPIAUCSL")
    if cpi is not None and len(cpi) >= 13:
        yoy = cpi.iloc[-1] / cpi.iloc[-13] - 1
        rows.append(dict(key="cpi", name="미국 물가", value=f"1년 {yoy:+.1%} ({cpi.index[-1]:%Y-%m})",
                         note="연준 목표 2%", warn=bool(yoy >= 0.035)))
    claims = get("ICSA")
    if claims is not None and len(claims) >= 30:
        avg4, low = claims.iloc[-4:].mean(), claims.iloc[-52:].rolling(4).mean().min()
        rows.append(dict(key="claims", name="실업수당 청구", value=f"4주 평균 {avg4 / 1000:,.0f}천 건",
                         note=f"1년 최저보다 {avg4 / low - 1:+.0%}", warn=bool(avg4 / low - 1 >= 0.2)))
    return rows


# ---------------------------------------------------------------- 보고

def snapshot(d, extra=None):
    """오늘 경기 판정 (대시보드·텔레그램용 dict)."""
    w = warnings(d)
    s = w.sum(axis=1)
    v = values(d).ffill().iloc[-1]
    today, close = w.iloc[-1], near(d).iloc[-1]
    n = int(s.iloc[-1])
    month_ago = int(s.iloc[-22]) if len(s) > 22 else n
    weekly = s.resample("W-FRI").last().dropna().iloc[-26:]
    return dict(
        day=f"{d.index[-1]:%Y-%m-%d}", score=n, total=len(SIGNALS), regime=regime_of(n),
        month_ago=month_ago, prev_regime=regime_of(month_ago),
        signals=[dict(key=k, name=name, rule=rule, warn=bool(today[k]), near=bool(close[k]),
                     now=detail(k, v)) for k, name, rule in SIGNALS],
        history=[dict(day=f"{i:%m-%d}", score=int(x)) for i, x in weekly.items()],
        us_economy=extra or [],
        action=action_line(n),
    )


def action_line(n):
    """리스크관리부가 경기 판정을 어떻게 쓰는지. 백테스트(docs/macro-backtest.md)에서 매수를 줄여도
    같은 비중을 그냥 덜 들고 있는 것보다 나은 게 없어서, 규칙은 안 바꾸고 참고로만 알려 줘요."""
    if n >= CONTRACTION:
        return "2008년 위기 땐 이런 날 뒤에 크게 빠진 적이 많았어요. 2010년 이후엔 잘 안 맞아서 규칙은 그대로, 참고로만"
    if n >= SLOW:
        return "경고가 쌓이는 중이에요. 백테스트에서 매수를 줄여도 낙폭이 안 줄어서 규칙은 그대로 (참고)"
    return "경고가 적어 평소대로 해요"


def risk_line(snap):
    """부서별 보고 '리스크관리부' 끝에 붙이는 한 줄."""
    if not snap:
        return None
    return f"경기 {snap['regime']}(경고 {snap['score']}/{snap['total']}): {snap['action']}"


def format_report(snap):
    lines = [f"[경기 리포트] {snap['day']} 기준",
             f"판정: {snap['regime']} (경고 {snap['score']}/{snap['total']}개)"
             + ("" if snap["month_ago"] == snap["score"] else f", 한 달 전 {snap['month_ago']}개({snap['prev_regime']})"),
             f"리스크관리부: {snap['action']}", ""]
    for s in snap["signals"]:
        mark = "⚠️" if s["warn"] else "🟡" if s.get("near") else "✅"
        lines.append(f"{mark} {s['name']}: {s['now']} (경고 기준: {s['rule']})")
    if snap["us_economy"]:
        lines += ["", "[미국 경제 참고 · FRED, 규칙엔 안 씀]"]
        for r in snap["us_economy"]:
            lines.append(f"{'⚠️' if r['warn'] else '·'} {r['name']} {r['value']}, {r['note']}")
    if snap["history"]:
        lines += ["", "최근 경고 개수(주별): " + " ".join(str(h["score"]) for h in snap["history"][-12:])]
    lines += ["", "⚠️ 경고, 🟡 기준 가까움, ✅ 괜찮음. 경고 0~1개 확장, 2~3개 둔화, 4개 이상 위축 경고. 무료 시장 지표로 추정한 거라 틀릴 수 있어요. "
              "주문은 직접 판단해서 하세요."]
    return "\n".join(lines)


def read_snapshot(path=pathlib.Path("paper/macro.json")):
    try:
        return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def should_send(snap, prev, report):
    """주간 리포트 날이거나, 판정(확장·둔화·위축 경고)이 지난 기록과 달라졌을 때만 텔레그램을 보내요."""
    return report or (prev is not None and prev.get("regime") != snap["regime"])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--csv", type=pathlib.Path, help="야후 대신 이 파일 (macro_backtest.py가 저장한 형식)")
    parser.add_argument("--save", type=pathlib.Path, help="대시보드용 JSON 저장 (paper/macro.json)")
    parser.add_argument("--report", action="store_true", help="판정이 그대로여도 텔레그램 리포트 보내기 (주간)")
    parser.add_argument("--no-fred", action="store_true", help="FRED 참고 자료 건너뛰기")
    parser.add_argument("--dry-run", action="store_true", help="텔레그램으로 보내지 않고 출력만")
    args = parser.parse_args()

    d = load(args.csv) if args.csv else fetch(start=f"{dt.date.today().year - 3}-01-01")
    snap = snapshot(d, [] if args.no_fred else us_economy())
    snap["generated"] = dt.datetime.now(KST).isoformat(timespec="minutes")
    prev = read_snapshot(args.save) if args.save else None
    text = format_report(snap)
    if prev is not None and prev.get("regime") != snap["regime"]:
        text = text.replace("[경기 리포트]", f"[경기 판정 바뀜: {prev['regime']} → {snap['regime']}]", 1)
    print(text)
    if args.save:
        args.save.parent.mkdir(parents=True, exist_ok=True)
        args.save.write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    if should_send(snap, prev, args.report) and not args.dry_run:
        from realtime_monitor import send_telegram

        if not send_telegram(text, collapse=True):
            raise SystemExit("텔레그램 전송 실패 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 확인)")


if __name__ == "__main__":
    main()
