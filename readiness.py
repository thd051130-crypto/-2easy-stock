"""실전 전환 판정표: 가상계좌 기록으로 "진짜 돈을 넣어도 되는 단계인지"를 숫자로 판정해요.

감으로 시작하지 않으려고 만든 관문이에요. 전부 통과하면 소액(예: 10만 원)으로 시작해 볼 만한 단계라고 알려 줘요.
  1. 기간: 가상계좌를 60거래일(약 3개월) 넘게 기록했는지
  2. 낙폭: 가상계좌 최대 낙폭이 백테스트 최대 낙폭의 1.5배 안인지 (규칙이 과거처럼 작동하는지)
  3. 거래 수: 결과를 믿을 만큼 거래가 끝났는지 (국장 스윙만 10건, 추세 규칙은 거래가 드물어서 안 봐요)
  4. 고장: 지난 주간 점검(paper/health.json)에서 자동 실행이 전부 정상이었는지
수익률은 관문에 넣지 않았어요. 하락을 줄이는 규칙이라 오르는 장에선 지수보다 덜 버는 게 정상이에요.
학습팀(learner.py) 제안으로 규칙을 바꾸면 그때부터 기간을 다시 세는 게 맞아요 (가상계좌 폴더를 지우고 새로 시작).
dashboard.py와 paper_trade.py(금요일 결산)가 같이 써요. pandas 없이 돌아가요.
"""

MIN_DAYS = 60
MDD_SLACK = 1.5

# 계좌 → (이름, 백테스트 최대 낙폭, 끝난 거래 최소 건수). 숫자는 README·docs의 2011~ 백테스트
ACCOUNTS = {
    "kr": ("국장 알림 규칙", -0.032, 10),
    "us": ("미장 알림 규칙", -0.095, 0),
    "etf": ("ETF(원화) 계좌", -0.084, 0),
}


def evaluate(key, days, mdd, trades, health=None):
    """days: 기록한 거래일 수, mdd: 시작 뒤 최대 낙폭(음수), trades: 끝난 거래 수, health: paper/health.json 내용.
    반환: {"name", "ready", "checks": [{"label", "ok", "detail"}], "verdict"}"""
    name, ref_mdd, min_trades = ACCOUNTS[key]
    limit = ref_mdd * MDD_SLACK
    checks = [
        dict(label="기간", ok=days >= MIN_DAYS,
             detail=f"{days}거래일 기록 (필요 {MIN_DAYS}거래일" + (f", {MIN_DAYS - days}일 남음)" if days < MIN_DAYS else ")")),
        dict(label="낙폭", ok=mdd >= limit,
             detail=f"최대 낙폭 {mdd:.1%} (백테스트 {ref_mdd:.1%}의 {MDD_SLACK}배인 {limit:.1%}까지 괜찮아요)"),
    ]
    if min_trades:
        checks.append(dict(label="거래 수", ok=trades >= min_trades, detail=f"끝난 거래 {trades}건 (필요 {min_trades}건)"))
    if health is None:
        checks.append(dict(label="고장", ok=False, detail="아직 주간 점검 기록이 없어요 (일요일에 처음 생겨요)"))
    else:
        bad = [w["label"] for w in health.get("workflows", []) if not w.get("ok")]
        checks.append(dict(label="고장", ok=not bad,
                           detail="지난 주간 점검 전부 정상" if not bad else "지난 주간 점검 확인 필요: " + ", ".join(bad)))
    ready = all(c["ok"] for c in checks)
    if ready:
        verdict = "관문을 전부 통과했어요. 소액(예: 10만 원)으로 같은 규칙을 따라 해 볼 만한 단계예요."
    elif not checks[1]["ok"]:
        verdict = "가상계좌 낙폭이 백테스트보다 훨씬 커요. 규칙이 지금 시장에서 과거처럼 작동하지 않는 것 같아 실전은 미뤄요."
    else:
        left = ", ".join(c["label"] for c in checks if not c["ok"])
        verdict = f"아직이에요 ({left}). 가상계좌로 더 지켜봐요."
    return dict(name=name, ready=ready, checks=checks, verdict=verdict)


def lines(r):
    """텔레그램용 문장."""
    out = [f"[실전 전환 판정 · {r['name']}] {'통과' if r['ready'] else '아직'}"]
    out += [f"{'✅' if c['ok'] else '⬜'} {c['label']}: {c['detail']}" for c in r["checks"]]
    out.append(r["verdict"])
    return out
