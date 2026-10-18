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
- 2026-10-18 사용자 "오류 확인하고 수정" + "처음부터 전부는 눌러도 작동 안 함, 처음 시작한 기간부터 표시": 0%는 보이는 구간에서 모든 항목이 다 있는 첫 칸(늦게 상장한 날, 세로 점선 "같이 출발"), 그 전은 그날 대비 %. 눈금은 딱 떨어지는 %(0% 포함, 18px 안 붙게). "처음부터 전부" 버튼·CMP_SHOW·cmpAll 없앰, 처음엔 항상 가장 오래된 날부터(일봉은 MAX_SHOW). "선" 버튼 이름은 "꺾은선".
- 2026-10-18 사용자 "그래프 시각적인 부분 고쳐"(다우 1992~ + 2023 상장 ETF 넣으니 비교 구간이 오른쪽 끝에 몰림): 처음 그릴 때 VIEW를 다 같이 있는 첫 칸부터(최소 5칸, 그 전은 밀어서), 선형 눈금 간격 (hi-lo)/6 기준으로 더 촘촘히. 실제 자료로 확인: 전 종목 파일 일봉은 2년치라 일봉·주봉 비교는 최근 2년부터. PR #83.
Previews: /mnt/project-files/compare-search-preview/, /mnt/project-files/compare-long-preview/. Local preview: `python3 dashboard.py --out <dir>`, `pip install yfinance pandas`, `python3 stock_pages.py --out <dir> --budget 120`, http.server, python playwright with executable_path=/opt/pw-browsers/chromium.
Related: [[app-compare-features-pr33]], [[phone-dashboard]]
