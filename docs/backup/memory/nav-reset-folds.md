---
name: nav-reset-folds
description: 아래 버튼(홈·신호·관심·성과·차트) 누르면 펼친 칸·자세히 전부 접고 맨 위로 — resetFolds() in site/app.js (2026-10-24 사용자 요청)
metadata:
  type: feedback
---

2026-10-24 사용자: "세부내용 너무 많이 열어놓으면 어지러우니까 아래 버튼 누르면 기본화면으로 돌아가게 해줘".
- site/app.js `resetFolds()`: 아래 버튼을 누를 때마다(다른 화면이든 지금 화면이든) HOME_OPEN·PERF_OPEN·DESK_OPEN·POL_OPEN·SAV_OPEN·FOLD_OPEN 비우고 worldOpen·worldPick·polMore·FIRST_OPEN·calAll·cmpIdxOpen·maOpen·alertOpen·inboxOpen·econPick·calPick 처음값. localStorage home_open·perf_open·world_open도 비움. 지금 화면 버튼이면 lastView=""로 다시 그리고 맨 위.
- 그대로 두는 것(설정): 성과 선택 바(perf_tab), 국장·미장, 기간 칩, 이동평균선, 관심종목, 필터, 계산기 값, 목표.
- 화면 안 버튼·접기는 여전히 '화면 그대로' [[ui-no-jump-rule]].
**Why:** 펼친 게 쌓이면 폰 화면이 어지러움.
**How to apply:** 새로 "펼친 상태를 기억하는" 변수를 만들면 resetFolds()에도 넣기. 고른 설정(탭·기간 등)은 넣지 않기.
