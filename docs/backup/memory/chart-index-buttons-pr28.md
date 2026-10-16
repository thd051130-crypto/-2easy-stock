---
name: chart-index-buttons-pr28
description: PR #28 (MERGED 2026-10-08 19:18 KST) — 차트 화면 지수 버튼: 세계 지수 13개 캔들 차트, stock_pages.py가 _site/indexes/<sym>.json 생성
metadata:
  type: project
  modified: 2026-10-08T10:03:11.399Z
---

User asked (2026-10-08) 차트 메뉴에 코스피·S&P 말고 다른 지수도 버튼으로. PR #28, branch claude/project-thread-j7ayk0.
- stock_pages.build_indexes: world.GROUPS kind "idx" 13개 → indexes/<index_file(sym)>.json (야후 period=max, full candles), 종목보다 먼저 실행.
- app.js: idx-chips 가로 스크롤 버튼 줄, CHART_IDX(localStorage chart_idx) 시장별, 기본 OWN_IDX(^KS11/^GSPC)는 기존 signal candles 사용. 다른 지수는 참고용.
- 주의: `dashboard.py --out ""` 하면 현재 폴더를 rmtree 해요 (실수로 클론 날린 적 있음). 항상 out 경로를 명시.
- Previews: /mnt/project-files/chart-index-preview/.

Related: [[world-markets-pr23]], [[phone-dashboard]]
