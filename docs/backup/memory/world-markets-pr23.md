---
name: world-markets-pr23
description: PR #23 (MERGED 2026-10-08 15:07 KST) — 세계 지수·환율 칸: world.py → paper/world.json, world workflow 07:05/16:10 KST, app home card
metadata:
  type: project
  modified: 2026-10-08T06:00:03.170Z
---

User asked "전세계 지수나 환율을 볼 수 있는 칸" on 2026-10-08. PR #23, branch claude/world-markets-on33dc.
- world.py: Yahoo daily, 13 indices (KR/US incl. ^SOX/Asia/Europe) + KRW FX (KRW=X, JPYKRW=X ×100, EURKRW=X, CNYKRW derived = KRW=X/CNY=X because Yahoo CNYKRW=X has 1 row only, DX-Y.NYB). Keeps ~260 closes per item.
- .github/workflows/world.yml twice a day; pages.yml workflow_run includes world; health.py WORKFLOWS has world (5/week).
- App: worldCard() on home after homeSignalCard; 4 main rows always, <details id="world-all"> for all; period chips 오늘/1주/1개월/1년 (localStorage world_p, world_open). Display only, rules unchanged.
- Previews: /mnt/project-files/world-preview/.

Related: [[phone-dashboard]], [[macro-regime-pr22]]
