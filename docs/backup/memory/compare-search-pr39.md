---
name: compare-search-pr39
description: PR #39 (merged 2026-10-10 14:53 KST) compare chart gets search for indexes + all KR/US stocks (max 8) and index-chart-style frames/pan/zoom/scrub
metadata:
  type: project
---

User asked (2026-10-10) for search in the chart screen's compare chart, then "지수차트처럼 똑같이" (MA added then removed at user request). PR #39 (branch claude/project-thread-38lsc8), site/app.js:
- cmpResults reuses SYM/queryKeys/scoreOf (same as savings calculator). Keys `s:<kr|us>:<code>` (old `s:<code>` = current market still read). CMP_MAX 8, colors savColor.
- compareChart(): lines (not candles) per item, FRAMES 일/주/월/년봉 via frameCandles per item merged by key with forward fill; first visible point = 0%; log scale when ≥8x; no indicators (user removed MA 2026-10-10). PR #42: default candles per item in own color (up filled, down hollow), 선 toggle (localStorage cmp_line), height = W*0.62 clamped 170–260 (user: "넘 높아"). localStorage cmp_f.
- Gesture code extracted from candleChart into chartGestures(el, v, geo, draw, showTip), shared by both.
Previews: /mnt/project-files/compare-search-preview/. Local preview: `python3 dashboard.py --out <dir>`, `pip install yfinance pandas`, `python3 stock_pages.py --out <dir> --budget 120`, http.server, python playwright with executable_path=/opt/pw-browsers/chromium.
Related: [[app-compare-features-pr33]], [[phone-dashboard]]
