---
name: paper-trading-log
description: Conservative KR+US signal rules, paper accounts and Friday summary — PR #5 and #6 merged 2026-10-04
metadata:
  type: project
---

PR #5 (KR paper account) and PR #6 (conservative KR+US rules) both merged to main on 2026-10-04. First scheduled runs: KR Mon 2026-10-05 17:30 KST, US Tue 2026-10-06 07:30 KST.

User decision 2026-10-04: returns needn't be high, signals must be conservative (minimize drawdown), and cover both KR and US. Rules picked from docs/conservative-backtest.md (8 candidates, 2011~), defined once in strategy.py:
- KR: dip-after-breakout only when KOSPI > 50 & 200 MA, 10% per stock, max 5, -5% stop → CAGR +4.8%, MDD -8%.
- US: 50% SPY while S&P500 > 200MA and 50MA > 200MA, else cash → +5.5%, MDD -11%. US single-stock swing loses after 0.25% domestic-broker fee.

2026-10-08 PR #26 merged: all five paper accounts (kr, us, both rulebooks, etf) start at 10,000,000 KRW; US stays in dollars at 7,470 USD (10M / 1,339). paper_trade.load archives a record to <folder>/archive/ and restarts when saved capital != markets.py capital (earlier: PR #14 700k / $500). User is not trading for real for now.

Workflow swing-signals: KR cron 08:30 UTC weekdays, US cron 22:30 UTC weekdays; paper accounts in paper/kr and paper/us, fractional shares, committed back to main (contents: write; branch protection would break it). Friday summary per market timezone, or dispatch paper_summary=true.

Related: [[swing-signal-alert]], [[user-mobile-only]]

2026-10-04: user wants trade opinions with no API fees. PR #7 (merged 2026-10-04) replaced the paid Claude opinion (ANTHROPIC_API_KEY, anthropic dep removed) with rule-based kr_opinion/us_opinion lines (reason, stop/exit level, risks) in kr_swing_signals.py. Don't reintroduce paid API calls without asking.

2026-10-24: 이 기능은 없앴어요 → [[report-desks]].
