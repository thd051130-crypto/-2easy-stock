#!/usr/bin/env python3
"""실적 발표 시즌 백테스트: 국장 분기 실적이 몰리는 때 새로 사지 않으면 하락이 줄어드는지 봐요.

실적 발표 직후엔 하루에 -10%도 나와서, 돌파 후 눌림 매수가 발표 충격을 맞기 쉬워요.
회사별 과거 발표일은 무료로 믿을 만한 자료가 없어서, 발표가 몰리는 시즌(달력)으로 시험했어요.
  - 분기 실적: 1·4·7·10월 20일 ~ 다음 달 중순 (잠정실적·확정실적 발표가 몰려요)
  - 비교: 시즌을 1주 앞뒤로 옮기기, 2주·6주로 바꾸기, 상관없는 달(3·6·9·12월)을 같은 길이로 쉬기(우연 확인용)
지금 규칙에는 ★를 넣었어요 (strategy.kr_frames의 earnings_pause). 이미 산 종목은 시즌에도 규칙대로 팔아요.

사용법:
    python earnings_backtest.py --out docs/earnings-backtest.md   # data/kr_daily.csv 필요 (kr_swing_backtest.py로 받기)
"""

import argparse
import pathlib

import desk_backtest as db
import kr_swing_backtest as kb
import strategy
from markets import MARKETS

VARIANTS = {
    "실적 시즌 상관없이 (이전 규칙)": None,
    "★ 실적 시즌(1·4·7·10월 20일 ~ 다음 달 중순) 신규 매수 쉬기": strategy.EARNINGS_SEASONS,
    "시즌 2주로 짧게 (20일 ~ 다음 달 5일)": [(1, 20, 2, 5), (4, 20, 5, 5), (7, 20, 8, 5), (10, 20, 11, 5)],
    "시즌 6주로 길게 (15일 ~ 다음 달 25일)": [(1, 15, 2, 25), (4, 15, 5, 25), (7, 15, 8, 25), (10, 15, 11, 25)],
    "시즌 1주 일찍 (13일 ~ 다음 달 8일)": [(1, 13, 2, 8), (4, 13, 5, 8), (7, 13, 8, 8), (10, 13, 11, 8)],
    "시즌 1주 늦게 (27일 ~ 다음 달 22일)": [(1, 27, 2, 22), (4, 27, 5, 22), (7, 27, 8, 22), (10, 27, 11, 22)],
    "+ 잠정실적 주간(분기 첫 10일)도 쉬기": strategy.EARNINGS_SEASONS + [(1, 1, 1, 10), (4, 1, 4, 10), (7, 1, 7, 10),
                                                                (10, 1, 10, 10)],
    "우연 확인: 상관없는 달(3·6·9·12월 5일~말일) 쉬기": [(3, 5, 3, 31), (6, 5, 6, 30), (9, 5, 9, 30), (12, 5, 12, 31)],
}


def variants(closes, index_close):
    base = strategy.kr_frames(closes, index_close, earnings_pause=False)
    out = {}
    for name, seasons in VARIANTS.items():
        if seasons is None:
            out[name] = base
            continue
        skip = strategy.earnings_season(closes.index, seasons)
        out[name] = dict(base, entry=base["entry"] & strategy.broadcast(~skip, closes))
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--kr", type=pathlib.Path, default=pathlib.Path("data/kr_daily.csv"))
    parser.add_argument("--out", type=pathlib.Path)
    args = parser.parse_args()
    opens, closes, index_close = kb.load_csv(args.kr, MARKETS["kr"]["index"])
    rows, info = db.run(opens, closes, variants(closes, index_close), MARKETS["kr"]["cost"])
    lines = ["## 실적 발표 시즌 백테스트 (국장, 하락 줄이기 우선)\n"]
    lines += db.table("국장 알림 규칙 + 실적 시즌 신규 매수 쉬기", rows, info) + [""]
    lines += [
        "- 시즌을 1주 앞뒤로 옮기거나 2주·6주로 바꿔도 최대 낙폭이 -4.8% → -3% 안팎으로 줄어서, 날짜를 딱 맞춘 우연은 아니에요.",
        "- 상관없는 달을 같은 길이로 쉬면 낙폭이 줄지 않아요(오히려 커져요). 줄어든 건 '실적 시즌'이라서예요.",
        "- 잠정실적 주간까지 쉬면 거의 같아서, 단순한 쪽(★)을 골랐어요. 쉬는 동안 거래가 줄어 연 거래 수는 30% 넘게 줄고, 연평균은 0.2%p 낮아져요.",
        "- 미장 알림은 S&P500 ETF 하나라 개별 실적 영향이 작아서 넣지 않았어요. 매수 후보마다 다음 실적 발표일은 의견 줄에 참고로 붙여요.",
        "",
        "종가에 신호, 다음 날 시가 매매, 남는 돈은 연 2.5% 이자, 비용은 conservative_backtest.py와 같아요. 과거 성과가 미래를 보장하진 않아요.",
    ]
    text = "\n".join(lines)
    print(text)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
