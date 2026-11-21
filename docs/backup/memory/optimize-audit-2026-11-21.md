---
name: optimize-audit-2026-11-21
description: 최적화 진단·자료 다이어트(2026-11-21) — 지수 일봉 charts.json 분리, learn.json 내용 해시 버전, 잰 숫자, 다음 후보(글꼴 349KB)
metadata:
  type: project
  modified: 2026-11-21T14:22:44.394Z
---

2026-11-21 사용자 "최적화 어떤걸 하면 좋을까" → 진단 뒤 사용자가 "1+2 자료 다이어트" 고름.

바꾼 것 (브랜치 claude/project-thread-l5v1sc, 검수 대기):
- dashboard.split_charts: markets.<시장>.daily.candles(지수 5년 일봉, 차트 화면·수익률 달력만 씀) → `_site/charts.json`, data.json엔 charts_v. core.js loadCharts/chartsReady/adoptCharts, 홈 그리고 0.3초 뒤 받음. 차트 화면을 먼저 열면 '차트 불러오는 중…' 뒤 다시 그림(trendCard·retCalendarCard).
- learn.json 주소 v= 배포 시각(built) → 내용 해시(learn_v, content_v). 배포 하루 ~11번마다 85KB 다시 받던 것 없앰.
- 홈 급락 점검은 indexes/<지수>.json(IDX_READY)을 써서 영향 없음. 세계 지수 closes는 홈 칸·급락 판정이 써서 data.json에 남김.

잰 숫자(로컬 빌드, gzip 서버, 느린 4G+CPU 4배): data.json 231→165KB gz(−29%, 처음엔 −43% 예상했지만 세계 closes는 홈이 써서 못 뺌). 자료 바뀐 뒤 다시 열 때 받는 자료 316→165KB(−48%). 첫 방문 홈 시간은 6.5초 안팎으로 차이가 잡음 안(글꼴 349KB·JS 139KB가 큼).
- 다음 후보: 글꼴(첫 방문 349KB, 가장 큼) → 시스템 글꼴 or 굵기·글자 줄이기. learn.js·casebook 나중에 받기(JS 139→105KB).
- Actions 7일 266번 9.4시간(공개라 무료), 클라우드플레어 하루 ~450번/10만.
관련 [[load-speed]], [[app-split]].
