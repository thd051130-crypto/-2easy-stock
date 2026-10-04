"""대시보드 '신호 조건' 카드용: 종목마다 규칙 조건을 하나씩 채점하고, 신호까지 무엇이 남았는지 계산해요.

국장 규칙(strategy.kr_frames, kb.dip_after_breakout)을 조건별로 풀어 쓴 거라 규칙을 바꾸면 여기도 같이 바꿔야 해요.
  1. 코스피가 50일선과 200일선 위        2. 종목 종가가 200일선 위
  3. 어제까지 10거래일 안에 20일 신고가    4. RSI2 < 10
미장은 지수 ETF만 사서 개별 종목 규칙이 없어요. 관심종목은 S&P500에 쓰는 추세 조건(종가 > 200일선, 50일선 > 200일선)을
그 종목에 대 본 참고용이에요.

관심종목은 watchlist.txt에 적어요 (한 줄에 하나, `kr 035720 카카오` / `us NVDA 엔비디아`).
"""

import pathlib

import pandas as pd

import kr_swing_backtest as kb

RSI_TH, HIGH_N, HIGH_WITHIN = 10, 20, 10
WATCHLIST = pathlib.Path("watchlist.txt")


def read_watchlist(path=WATCHLIST):
    """{'kr': {코드: 이름}, 'us': {티커: 이름}}. 형식이 틀린 줄은 건너뛰어요."""
    out = {"kr": {}, "us": {}}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split("#", 1)[0].split()
        if len(parts) < 2 or parts[0].lower() not in out:
            continue
        market, code = parts[0].lower(), parts[1].upper()
        if market == "kr":
            code = code.removesuffix(".KS").removesuffix(".KQ")
            if not (len(code) == 6 and code.isalnum()):
                continue
        out[market][code] = " ".join(parts[2:]) or code
    return out


def rsi_trigger(close, th=RSI_TH):
    """내일 종가가 이 가격 아래로 마감하면 RSI2가 th 아래로 내려가요 (kb.rsi와 같은 계산을 거꾸로 풀었어요)."""
    delta = close.dropna().diff()
    a = 1 / 2
    gain = delta.clip(lower=0).ewm(alpha=a, adjust=False).mean().iloc[-1]
    loss = (-delta.clip(upper=0)).ewm(alpha=a, adjust=False).mean().iloc[-1]
    # 내일 하락 d: gain' = g(1-a), loss' = l(1-a) + a·d → RSI < th ⇔ loss' > gain'·(100-th)/th
    k = (100 - th) / th
    drop = max(0.0, (1 - a) * (k * gain - loss) / a)
    return float(close.dropna().iloc[-1] - drop)


def _num(x, digits=2):
    return None if x is None or pd.isna(x) else round(float(x), digits)


def kr_checks(closes, index_close, names):
    """종목별 국장 규칙 채점. 충족 조건이 많은 순(같으면 RSI2 낮은 순)으로 돌려줘요."""
    ok_index = bool((index_close > index_close.rolling(200).mean()).iloc[-1]
                    and (index_close > index_close.rolling(50).mean()).iloc[-1])
    rows = []
    for code in closes.columns:
        c = closes[code].dropna()
        if len(c) < 201:
            continue
        close, ma200 = float(c.iloc[-1]), float(c.rolling(200).mean().iloc[-1])
        rsi2 = float(kb.rsi(c).iloc[-1])
        new_high = (c >= c.rolling(HIGH_N).max()).to_numpy()
        past = new_high[-HIGH_WITHIN - 1:-1][::-1]  # 어제부터 거꾸로 10거래일
        ago = int(past.argmax()) + 1 if past.any() else None
        checks = [
            dict(key="index", label="코스피 추세", ok=ok_index),
            dict(key="ma200", label="200일선 위", ok=close > ma200, detail=f"{close / ma200 - 1:+.1%}"),
            dict(key="high", label="10일 안 20일 신고가", ok=ago is not None,
                 detail=f"{ago}거래일 전" if ago else ("오늘" if new_high[-1] else "최근 없음")),
            dict(key="rsi", label="RSI2 10 미만", ok=rsi2 < RSI_TH, detail=f"{rsi2:.0f}"),
        ]
        todo = []
        if not ok_index:
            todo.append("코스피가 50·200일선 위로 올라와야 해요")
        if close <= ma200:
            todo.append(f"200일선({ma200:,.0f}원) 위로 올라와야 해요")
        drop = None
        if ago is None and new_high[-1]:
            todo.append("오늘 20일 신고가가 나왔어요. 내일부터 RSI2가 10 아래로 눌리기를 기다려요")
        elif ago is None:
            todo.append("최근 10거래일 안에 20일 신고가가 먼저 나와야 해요" + (" (RSI2는 이미 낮아요)" if rsi2 < RSI_TH else ""))
        elif rsi2 >= RSI_TH:
            trigger = rsi_trigger(c)
            drop = trigger / close - 1
            left = f"신고가 조건은 {HIGH_WITHIN - ago}거래일 더 유효"
            if drop > -0.15:
                todo.append(f"다음 거래일 약 {trigger:,.0f}원({drop:+.1%}) 아래로 마감하면 RSI2가 10 아래로 내려가요 ({left})")
            else:
                todo.append(f"며칠에 걸쳐 더 눌려야 해요. 하루에 끝나려면 약 {trigger:,.0f}원({drop:+.1%}) 아래로 마감해야 해요 ({left})")
        else:
            drop = 0.0
        rows.append(dict(code=code, name=names.get(code, code), close=_num(close), met=sum(x["ok"] for x in checks),
                         total=len(checks), signal=all(x["ok"] for x in checks), checks=checks, todo=todo,
                         rsi2=round(rsi2, 1), drop=round(drop, 4) if ago is not None else None))
    # 신호에 가까운 순: 충족 개수 → 남은 게 'RSI2 눌림'뿐인 종목 → 필요한 하락폭이 작은 순
    rows.sort(key=lambda r: (-r["met"], r["drop"] is None, -(r["drop"] or 0), r["rsi2"]))
    return rows


def us_checks(closes, names):
    """관심종목에 S&P500 추세 조건을 대 본 결과 (참고용, 가상계좌는 사지 않아요)."""
    rows = []
    for code in closes.columns:
        c = closes[code].dropna()
        if len(c) < 201:
            continue
        close = float(c.iloc[-1])
        ma50, ma200 = float(c.rolling(50).mean().iloc[-1]), float(c.rolling(200).mean().iloc[-1])
        rsi2 = float(kb.rsi(c).iloc[-1])
        checks = [
            dict(key="ma200", label="200일선 위", ok=close > ma200, detail=f"{close / ma200 - 1:+.1%}"),
            dict(key="cross", label="50일선 > 200일선", ok=ma50 > ma200, detail=f"{ma50 / ma200 - 1:+.1%}"),
        ]
        todo = []
        if close <= ma200:
            todo.append(f"200일선({ma200:,.2f}달러) 위로 올라와야 해요")
        if ma50 <= ma200:
            todo.append("50일선이 200일선 위로 올라와야 해요")
        rows.append(dict(code=code, name=names.get(code, code), close=_num(close), met=sum(x["ok"] for x in checks),
                         total=len(checks), signal=all(x["ok"] for x in checks), checks=checks, todo=todo,
                         rsi2=round(rsi2, 1)))
    rows.sort(key=lambda r: (-r["met"], r["rsi2"]))
    return rows


def download_closes(codes, market, start, calendar, pause=1.5, retries=3):
    """관심종목 종가를 야후에서 받아 지수 거래일(calendar)에 맞춰요. 못 받은 종목은 건너뛰어요."""
    import time

    import yfinance as yf

    suffixes = [".KS", ".KQ"] if market == "kr" else [""]  # 국장은 코스피 → 코스닥 순서로 찾아봐요
    cols = {}
    for code in codes:
        for suffix in suffixes:
            part = None
            for attempt in range(retries):
                try:
                    part = yf.Ticker(f"{code}{suffix}").history(start=start, auto_adjust=True)
                    break
                except Exception as e:  # 레이트리밋 등
                    print(f"{code}{suffix} 재시도 {attempt + 1}/{retries}: {e}")
                    time.sleep(pause * 2 ** attempt)
            time.sleep(pause)
            if part is not None and not part.empty:
                s = part["Close"].dropna()
                s.index = pd.to_datetime(s.index).tz_localize(None).normalize()
                cols[code] = s
                break
        else:
            print(f"관심종목 {code}: 야후에서 시세를 못 찾았어요 (종목코드 확인)")
    return pd.DataFrame(cols).reindex(calendar)
