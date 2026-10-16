---
name: swing-backtest-kr-results
description: Real-data results of the KR large-cap swing backtest (PR #2), run 2026-10-04, and the recommended rule
metadata:
  type: project
  modified: 2026-10-04T10:34:36.595Z
---

2026-10-04 ran kr_swing_backtest.py on real Yahoo data (2011-01~2026-10, 48 stocks) in a cloud env with pypi + Yahoo open; download now per-ticker with backoff and no 429s. Pushed to PR #2 branch claude/project-thread-tdl99p (docs/swing-backtest-kr-results.md + summary/recs in docs/swing-backtest-kr.md).

Key: no default rule beat buy-and-hold after 2019 (equal-weight +15.6%/yr, KOSPI +18%). Best rule = 조합(돌파 후 눌림)+코스피 200일선 필터, default params: OOS +7.2%, MDD -18%; 30만원 계좌 +8.0%, MDD -7%, but 55% of signals unaffordable. Breakout lost money all 15 years. Pullback+filter: th 15~20, max_hold 20 held up out of sample (rank 2/45). Unfiltered pullback's in-sample best (exit_ma=3) was overfit (41/45).

**Why:** user asked whether these rules are worth using with a small account.
**How to apply:** treat rules as defensive (lower drawdown, lower return), not as a way to beat holding. [[stock-data-access]] [[repo-state-2026-10-04]]
