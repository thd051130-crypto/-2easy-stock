---
name: learner-pr17
description: PR #17 learner.py "학습팀" — daily 05:00 KST re-tuning of strategy values, proposes only, never auto-changes rules
metadata:
  type: project
  modified: 2026-10-05T00:00:43.990Z
---

PR #17 (branch claude/project-thread-emiefh, merged 2026-10-05) adds learner.py + .github/workflows/learner.yml.
- Daily 05:00 KST (cron 0 20 * * *) and weekly Saturday 10:00 KST report (cron 0 1 * * 6). Telegram only on a NEW proposal or weekly report.
- strategy.kr_frames/us_frames/us_ok now take value kwargs (defaults = current rules).
- Three gates: recent 5y MDD not worse & calmar +10%; 2011~ MDD not >1%p worse; walk-forward (2016~, retune yearly on prior 5y) not worse than fixed.
- Output: learning/kr.json, learning/us.json (dashboard can read these; site/ owned by dashboard thread), learning/history.csv, docs/learning-latest.md.
- First local run (data to 2026-10-02): KR proposes breadth 40% + stop -7% (5y +4.6%/-3.0% vs +3.1%/-3.8%; 2011~ +4.8%/-4.8% vs +4.1%/-4.4%). US keep.
- User said "고" 2026-10-05 → PR #19 (merged 2026-10-05) applied KR breadth 40% + stop -7% (strategy.py constants; desk_backtest.py pinned to old 50%/-5% baseline).

**Why:** user asked for a "teammate that keeps learning 24h"; no paid APIs, drawdown-first.
**How to apply:** never auto-apply proposals. Related: [[departments-pr12]], [[phone-dashboard]]

2026-10-24: 이 기능은 없앴어요 → [[report-desks]].
