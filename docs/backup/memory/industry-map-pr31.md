---
name: industry-map-pr31
description: PR #31 (merged 2026-10-09 11:17 KST) — 산업 연관 지도 화면 (#kr/map/<산업>), industry_map.py → industry.json
metadata:
  type: project
  modified: 2026-10-09T02:15:28.250Z
---

PR #31 on branch claude/project-thread-lkzs05: phone app screen "산업 연관 지도" (layer screen like search, hash #kr/map/<theme name>).
- industry_map.py: nodes = 36 themes from themes.py (GROUPS 5 clusters, SHORT labels), LINKS 62 hand-written (kind s 공급망 a→b / c 같은 요인 / n 반대). dashboard.py writes static _site/industry.json; pages.yml then runs `industry_map.py --out _site` (Yahoo batch, ~30s) adding flows (r5/r20 median of top-5 rep stocks per market), corr (120 trading days) per link, hidden pairs (corr ≥ max(0.6, 95th pct), no shared stocks, ≤2 per node).
- KR raw correlations are all high (market beta, median 0.43) — that's why the percentile floor.
- Entry: home sectors card button, search theme chips, theme result card. Reference only, no rule changes.
- Previews: /mnt/project-files/industry-map-preview/.
Related: [[theme-search-pr30]], [[phone-dashboard]]
