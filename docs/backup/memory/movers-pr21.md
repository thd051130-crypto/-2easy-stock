---
name: movers-pr21
description: PR #21 (merged 2026-10-08) — '왜 움직였나' rally/drop reasons (movers.py) and universe expansion KR wide 100→200, US +150
metadata:
  type: project
  modified: 2026-10-08T01:55:48.798Z
---

User asked 2026-10-08 "지금 상승한 기업들 왜 올랐는지 분석해봐. 종목수도 늘리고". PR #21 (branch claude/rally-reasons-6fa0n9) merged 2026-10-08 11:27 KST.
- movers.py: top 5 risers / 3 fallers over 5 trading days (±3%+), rule reasons (index compare, 3 most-correlated peers over prior 120d excluding last 5d, volume ratio, big day, 52w high) + Google News RSS headlines (free, no key) classified by keywords.
- Default chosen: KR wide.TOP_N 100→200 (~200 stocks total), US wide.us_universe top 150 by cap (~200 total) used only for movers, not signals/paper accounts.
- Shown as Telegram "[왜 움직였나 · 추정]" and dashboard home card.
- Google News and Yahoo blocked from the cloud container; works from GitHub Actions.

Related: [[phone-dashboard]], [[pr18-stock-search-bot]]
