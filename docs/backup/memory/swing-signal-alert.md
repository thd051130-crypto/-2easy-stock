---
name: swing-signal-alert
description: Daily swing-signal Telegram alert on GitHub Actions (no brokerage account needed) — PR #4, state as of 2026-10-04
metadata:
  type: project
  modified: 2026-10-04T11:29:46.934Z
---

PR #4 (merged 2026-10-04; first manual run delivered to Telegram) in -2easy-stock (branch claude/project-thread-5qsv5c) adds `kr_swing_signals.py` + `.github/workflows/swing-signals.yml`. It runs on weekdays at 08:30 UTC (17:30 KST) and via workflow_dispatch, uses Yahoo daily data, and applies the backtest's best rule (dip after breakout + KOSPI 200-day filter, see [[kis-realtime-monitor]] for Telegram secrets). The PR includes PR #2's backtest branch merged in, and resolves the .gitignore conflict with main.

Paid Claude opinion was removed in PR #7 (2026-10-04); opinions are now rule-based and free, see [[paper-trading-log]].

**Why:** the user can't open a brokerage account yet (2026-10-04) and wanted the next step that needs no account.
**How to apply:** the schedule only fires after merge to main. Check run results with the GitHub MCP actions tools, not by asking the user. Related: [[user-mobile-only]]
