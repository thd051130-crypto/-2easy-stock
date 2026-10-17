---
name: home-cleanup-pr64
description: 홈 화면 정리(PR #64) — 핵심 4칸만 펼치고 나머지 11칸은 '더 보기' 한 줄 요약으로 접음; 새 홈 칸 넣는 자리
metadata:
  type: project
---

PR #64 (2026-10-17 올림): 사용자가 "홈 메뉴 너무 난잡, 가시성 좋게 하거나 줄여"라고 함.
- 홈 = 신호 → 급락 점검(조건 맞을 때만) → 성과 → 세계 지수·환율 → '더 보기' 칸.
- '더 보기'(homeMoreCard, site/app.js): 일정·관심종목·왜 움직였나·히트맵·업종·수급·공시·거래량 급증·정책·경기 국면·지수를 아이콘+제목+한 줄 요약 `<details class="hm">`으로. 펼치면 원래 카드 그대로, 원래 h2는 날짜 글씨(.hm-meta)만 남김. 펼친 칸은 localStorage home_open에 기억.
- 국장 홈 8,151px → 2,414px. 기능 삭제 없음.

**Why:** 사용자는 첫 화면엔 핵심만, 나머지는 눌러서 보는 걸 원함 (PR #16 때도 같은 요청).
**How to apply:** 홈에 새 칸을 넣을 땐 기본으로 homeMoreRows에 한 줄 요약과 함께 추가하고, 꼭 바로 봐야 하는 강조 칸(큰 경제 발표 등)만 신호 칸 바로 아래에 펼쳐서 넣기. 다른 화면에서 홈의 접힌 칸으로 이동시키면 openHomeMore(key)로 먼저 펼치기. 미리보기: /mnt/project-files/home-cleanup-preview/. 관련 [[phone-dashboard]], [[drop-check-pr61]].
