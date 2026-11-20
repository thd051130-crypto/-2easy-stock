---
name: goal-card
description: 도구 화면 '목표' 카드 — 이름 바꾸기(PR #75), ↻ 초기화 버튼(2026-10-24, 두 번 눌러 확인)
metadata:
  type: project
---

site/app.js의 goalCard()/bindGoal(). 값은 GOAL(localStorage "goal"), 처음 값은 GOAL_START {title:"목표", end:"", now:0, monthly:50, target:0}. 홈 리포트 카드에 goalLine() 한 줄(D-day).
- 이름: 사용자가 목표 이름을 바꿀 수 있음, 30자 (PR #75).
- 초기화 (2026-10-24 사용자 "목표 초기화버튼도 만들자 화살표로 원을 그리는 픽토그램으로"): 카드 제목 오른쪽 둥근 ↻ SVG 버튼(RESET_ICON, data-goal-reset). 확인 창(confirm) 대신 한 번 누르면 주황(--wait-bg/fg) '한 번 더 누르면 초기화'로 바뀌고 3초 안에 다시 누르면 GOAL_START로 되돌리고 localStorage 지움. 카드는 holdHeight() 후 outerHTML + bindGoal() + keepTap() (holdHeight 없으면 카드가 짧아져 27px 튐).
- 자산 기록 잇기 (2026-11-20 사용자 "3", 검수 대기, 브랜치 claude/project-thread-m0j3nm): 목표 칸 '지금 모은 돈' 위에 '자산 기록에서|직접 입력' 버튼(GOAL.src "asset"/"manual", ""=아직 안 고름 → 기록 있고 직접 넣은 돈 0이면 자동). 자동이면 goalNow() = [[asset-record]] 마지막 기록 달(이번 달까지) 총자산(투자금+예수금, 산 돈 기준) ÷ 1만, 그 달·투자금·예수금 안내 줄. goalOut·홈 goalLine도 goalNow() 사용. 기록 없으면 '자산 기록 열기' 버튼(도구 탭 바꿈). 미리보기 /mnt/project-files/goal-asset-preview/.
**How to apply:** 목표 칸에 값을 더하면 GOAL_START에도 넣어야 초기화가 맞음. 관련 [[ui-no-jump-rule]], [[design-system]], [[plan-tools-pr37]].
