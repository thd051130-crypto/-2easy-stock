---
name: home-edit
description: 홈 화면 편집(2026-11-22) — 칸마다 홈·더 보기·숨김 + ▲▼ 순서, localStorage home_layout, 주소 #kr/more/edit, 브랜치 claude/project-thread-9xoi8y 검수 대기
metadata:
  type: project
---

2026-11-22 사용자: "더보기칸에 넣을 항목을 정할수 있게 하자" → 바로 "그냥 화면 편집 기능을 만들자".
- more.js `HOME_ITEMS`(맨 위 칸 big·status·world·more·report + 더 보기 줄 14개), `homeLayout()`(저장값 + 새 칸은 기본 자리), `homeCards(d)`(view.js VIEWS.home이 씀), `homeEditCard`/`bindHomeEdit`.
- 자리: 맨 위 칸은 홈/숨김, '더 보기 칸' 자체는 숨김 불가(순서만), 나머지는 홈(원래 칸 펼쳐서)/더 보기(한 줄)/숨김. 더 보기 칸 안 순서 = 편집 순서. '처음 상태로 되돌리기'.
- 들어가는 곳: 홈 맨 아래 '✏️ 홈 화면 편집' 버튼(data-more="edit" → openMore). 뒤로 버튼은 '‹ 홈'.
- 새 더 보기 줄을 homeMoreRows에 넣을 땐 HOME_ITEMS에도 [키, 아이콘, 이름] 추가해야 편집에 나와요(안 넣으면 홈에 안 보임).
- 버튼 점검: more:edit 추가, ▲▼는 줄을 따라가서 허용 목록에 넣음.
- 미리보기 /mnt/project-files/home-edit-preview/. 검수 통과 전 PR 금지 → [[review-before-pr]]. 관련 [[home-cleanup-pr64]], [[ui-no-jump-rule]].
