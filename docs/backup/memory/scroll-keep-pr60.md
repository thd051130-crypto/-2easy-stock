---
name: scroll-keep-pr60
description: PR #60 (2026-10-11) — chip buttons jumped the page because foldNotes ran late via MutationObserver; render() now folds notes synchronously
metadata:
  type: project
  modified: 2026-10-11T11:13:08.939Z
---

PR #60 (merged 2026-10-11 20:53 KST, branch claude/project-thread-qo39ko): user reported the screen jumping up when tapping 업종 chips on home.
Cause: handlers do `y=scrollY; render(); scrollTo(0,y)`, but `.note` text got folded into `<details class="fold">` later by a MutationObserver, so cards above shrank ~140px afterward. Fix: `foldNotes(app)` right after `app.innerHTML = ...` in render(). Fixes policy/heatmap/world chips too.
Local preview tip: `python dashboard.py --out <dir>` + http.server; local data lacks watch-stock closes so spark() throws — set localStorage watch_kr/watch_us to '[]' in test.
Also: 적립식 계산기 add/remove pick keeps #sav-q at same viewport top (scrollBy diff).
Related: [[phone-dashboard]]
