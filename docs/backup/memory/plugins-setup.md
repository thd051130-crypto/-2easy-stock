---
name: plugins-setup
description: Claude plugins on this account as of 2026-10-09 — superpowers off, CI Optimizer on (free, no external server)
metadata:
  type: project
  modified: 2026-10-09T06:44:46.300Z
---

2026-10-09: prompt audit found the superpowers plugin injecting "1% chance → MUST invoke skill" pressure text every session, clashing with the user's 바로 실행 preference. User turned superpowers off and enabled CI Optimizer (skills ci-check, ci-timings, ci-optimizer; contained, no paid API). Audit report: /mnt/project-files/audits/prompt-audit-2026-10-09.md.

**Why:** user avoids paid services and wants fast execution without forced process.
**How to apply:** don't suggest re-enabling superpowers; CI Optimizer is available for GitHub Actions checks (not yet run). Related: [[user-korean-ui]]
