---
name: compare-search-pr39
description: PR #39 (merged 2026-10-10 14:53 KST) compare chart gets search for indexes + all KR/US stocks (max 8) and index-chart-style frames/pan/zoom/scrub
metadata:
  type: project
---

User asked (2026-10-10) for search in the chart screen's compare chart, then "지수차트처럼 똑같이" (MA added then removed at user request). PR #39 (branch claude/project-thread-38lsc8), site/app.js:
- cmpResults reuses SYM/queryKeys/scoreOf (same as savings calculator). Keys `s:<kr|us>:<code>` (old `s:<code>` = current market still read). CMP_MAX 8, colors savColor.
- compareChart(): lines (not candles) per item, FRAMES 일/주/월/년봉 via frameCandles per item merged by key with forward fill; first visible point = 0%; log scale when ≥8x; no indicators (user removed MA 2026-10-10). PR #42: default candles per item in own color (up filled, down hollow), 선 toggle (localStorage cmp_line), height = W*0.62 clamped 170–260 (user: "넘 높아"). localStorage cmp_f.
- PR #68 (2026-10-17, 지수 바로 넣기 버벅임): cmpRows uses frameBase (no indicators/MA) cached per candles object (CMP_FRAME WeakMap) + k-way merge of already-sorted keys (was Map+sort, 0.6s at 4x CPU → ~0.15s). bindCompare redraw replaces only #cmp-card, keeps old svg until new draw; '지수 바로 넣기' fold stays open (cmpIdxOpen). Index files are full history (S&P ~25k days, 1.2MB).
- Gesture code extracted from candleChart into chartGestures(el, v, geo, draw, showTip), shared by both.
- PR #80 (2026-10-18, 사용자 "기간이 너무 짧아"): CMP_SHOW 처음 길이 일봉 250·주봉 260·월봉 240·년봉 전체 (지수 차트 FRAMES 21/26/36/60은 그대로). '처음부터 전부' 버튼(data-cmp-all): 가장 오래된 날부터, 칸이 MAX_SHOW 1300 넘으면 다음 묶음(주→월→년)으로 바꾸고 cmpAll로 전부. 꼬리는 항목마다 path 하나(186→14ms). cmpPct: 10배 넘으면 'N배'. 전 종목 파일 주봉(1wk max)을 더하는 건 Pages 1GB 한도 위험(2~3배)이라 안 함.
Previews: /mnt/project-files/compare-search-preview/, /mnt/project-files/compare-long-preview/. Local preview: `python3 dashboard.py --out <dir>`, `pip install yfinance pandas`, `python3 stock_pages.py --out <dir> --budget 120`, http.server, python playwright with executable_path=/opt/pw-browsers/chromium.
Related: [[app-compare-features-pr33]], [[phone-dashboard]]
