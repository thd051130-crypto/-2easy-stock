---
name: drop-check-pr61
description: PR #61 (2026-10-16) home 급락 점검 card, extras-without-price home crash fix, health.json refresh
metadata:
  type: project
  modified: 2026-10-16T13:12:19.895Z
---

PR #61 (2026-10-16): home "급락 점검" card under the signal card (dropCard in site/app.js). It shows when the market index falls more than 5% in one week or sits more than 10% below its 1-year high. It reads the index's full history from indexes/<sym>.json and lists past similar drops with what followed. Reference only; trading rules unchanged. Context: KOSPI fell -14.5% in the week to 10-16 and is -37.8% from its 2026-06-22 high of 9,115. The kr paper account stayed 0% because it was all cash.
Also fixed: a Telegram-added watch stock with no price (stock_pages.py failed) made spark() throw and blanked the whole home screen. The weekly health check was re-run (all normal), and the home warning now shows the check date.
Previews: /mnt/project-files/drop-check-preview/. Related: [[shares-label-pr47]]
