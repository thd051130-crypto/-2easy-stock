---
name: perf-cleanup
description: 성과 화면 — 맨 위 가로 선택 바(PERF_TABS)로 묶음 하나씩 보기(PR #72); 그 전 PR #71 순서·접기
metadata:
  type: project
  modified: 2026-10-17T08:01:23.202Z
---

2026-10-17 사용자가 "성과칸 기능 너무 나열, 맨 위 가로 슬라이드 선택 바로 고르면 아래에 작동하게"라고 함.
- PR #72: VIEWS.perf = [perfTabsBar, ...고른 묶음]. PERF_TABS(site/app.js) 순서: 수익률 달력 → 가상계좌(계좌·보유·매매 복기) → 내 규칙표 → 추천 종목 → 적립식 계산기 → 폭락 대비 → ETF 계좌 → 실전 준비(판정·목표·첫 계좌) → 메모·점검. 고른 것 localStorage perf_tab, 바는 sticky(--top-h = 머리 높이), 바꾸면 맨 위로.
- PR #71 (그 전): 가상계좌는 금액 한 줄 + 숫자 3칸, 큰 그래프는 '수익률 그래프'로 접음(perf_open에 기억, 펼칠 때 그림). 추천 종목 성과는 평균 3칸 + 최근 3개.
- 같은 PR #72: 내 규칙표 후보(신호 화면)는 앞 3개(RB_FIRST)만 이름·가격, 매매 의견과 나머지는 접기. 홈 신호 칸도 3개 + "외 N개".

**How to apply:** 성과 화면에 새 칸은 맞는 묶음에 넣거나 PERF_TABS에 새 묶음 추가. 다른 화면에서 성과의 특정 칸으로 보내려면 perfTabKey를 먼저 바꾸기. 미리보기 /mnt/project-files/perf-tabs-preview/. 관련 [[home-cleanup-pr64]], [[phone-dashboard]], [[calendar-split-pr72]].

2026-10-24: 이 기능은 없앴어요 → [[report-desks]].

2026-10-24: 도구 탭 '메모·점검'(memoCard 내 판단 기록장 + healthCard 자동 실행 점검) 없앰. 도구 탭은 적립식 계산기·수익률 달력·폭락 대비·목표. 주간 점검 문제는 리포트 칸 healthLine 한 줄로만 보임. 저장된 tools_tab='memo'는 첫 탭으로 돌아감.
