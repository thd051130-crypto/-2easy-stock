---
name: learner-pr43
description: PR #43 (2026-10-11) applied 2nd learner proposal - KR breadth 60%, RSI2<5, stock vol 35%, stop -5%; US unchanged
metadata:
  type: project
---

User said "학습팀 제안 적용" 2026-10-11 KST → PR #43 merged 2026-10-11 (branch claude/project-thread-gw9hbu) applied learner KR candidate from 2026-10-08 data:
breadth 40→60%, RSI2 10→5 (new strategy.KR_RSI_TH, used by wide.py/learner.py), stock vol 45→35%, stop -7→-5%.
Backtest: 5y +3.9%/-2.3% → +3.0%/-0.5%; 2011~ +4.5%/-3.2% → +3.3%/-1.1%. Fewer trades, lower return, much smaller drawdown (fits user principle).
US learner said keep → unchanged. desk_backtest.py pinned to old 50%/45%/-5% baseline.

**How to apply:** future "학습팀 제안 적용" = read docs/learning-latest.md, change strategy.py constants, fix test stop-price expectations. Related: [[learner-pr17]]
