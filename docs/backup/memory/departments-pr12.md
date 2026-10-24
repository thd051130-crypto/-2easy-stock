---
name: departments-pr12
description: PR #12 (merged 2026-10-04) adds six-department reports, free fundamentals grade, and breadth/volatility filters to strategy.py
metadata:
  type: project
  modified: 2026-10-04T14:12:45.659Z
---

PR #12 in -2easy-stock (branch claude/project-thread-i2bcpr) merged to main 2026-10-04 (after merging main with PR #11 rulebook).
- departments.py: 스크리닝·기술적 분석·펀더멘탈·마켓·리스크관리·운용부 one line each, appended to Telegram signal and `desks` in paper/<mk>/signal.json, shown as a dashboard card.
- Fundamentals = Yahoo `info` (ROE, debtToEquity, earningsGrowth, profitMargins, PER/forwardPE). KR trailingPE/priceToBook are usually None on Yahoo. No free point-in-time history → reference grade only, NOT in buy rules.
- strategy.py rule change (desk_backtest.py, docs/desk-backtest.md): KR adds breadth ≥50% of universe above 200MA + skip stocks with 20d vol >45% (CAGR 4.8→4.1%, MDD -7.8→-4.4%); US cash when S&P500 20d vol >25% (5.5→5.7%, MDD -10.9→-9.5%).
- First run with new rules: KR Mon 2026-10-05 17:30 KST; as of 10-02 close KR breadth was 48% so KR new buys pause.

**Why:** user asked to add a fundamentals desk and strengthen each desk, free only, drawdown-first.
**How to apply:** news analysis is not free/reliable → say so, don't fake. Related: [[paper-trading-log]], [[phone-dashboard]]

2026-10-24: 이 기능은 없앴어요 → [[report-desks]].
