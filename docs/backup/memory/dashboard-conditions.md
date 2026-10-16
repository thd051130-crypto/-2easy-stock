---
name: dashboard-conditions
description: Dashboard condition-checklist + watchlist PR #9 closed (parked) 2026-10-04; revive from commit 6b567b7 after the new trading-rule PR merges
metadata:
  type: project
  modified: 2026-10-04T13:53:37.805Z
---

2026-10-04: user said "그 신호 조건을 추가하면 좋겠다"; it was first read as a dashboard checklist, but the user clarified "조건 규칙을 추가" = add conditions to the trading RULES (handled in the paper-trading thread). PR #9 (per-stock condition checklist via conditions.py + watchlist.txt, branch claude/project-thread-0yinae) was closed so the designated branch could carry the chart-period PR; its code is commit 6b567b7 (also refs/pull/9/head). It encodes the OLD KR rule. After the new-rule PR merges, cherry-pick 6b567b7 onto a fresh branch from main, rewrite conditions.py to the new conditions, then open a new PR and ask the user to merge. Do not tell the user to merge it before then.

**How to apply:** when the user says "조건 추가", confirm whether they mean the trading rule or the display before building.

Related: [[phone-dashboard]], [[paper-trading-log]]
