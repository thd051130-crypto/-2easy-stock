---
name: screen-fit
description: 화면 크기 자동 맞춤(2026-11-15) — 폭 변수 --page-w(폰 640·720px↑ 760·1000px↑ 1120 두 줄), 폰 가로 막대 얇게, 좁은 폰 숫자 잘림 고침
metadata:
  type: project
  modified: 2026-11-15T11:04:50.148Z
---

2026-11-15 사용자 "화면 비율에 맞게 알아서 맞춰지나?" (다른 사람 기기에 배포 얘기 중).
- 점검: playwright로 320·344(접는 폰 바깥)·360·390·430·690(접는 폰 펼침)·820(태블릿)·844×390(폰 가로)·1440(PC) × 홈·리포트·관심·도구 6탭·차트·세계 지수·산업 지도·메시지함·의견 보내기·지금 뉴스·일정·투자 공부·히트맵·미장 홈. 페이지 가로 넘침은 전부 0.
- 사용자 "화면에 맞게 비율 자동으로 조정하게 하고 pr올리고 머지해" → style.css :root --page-w(main·.foot·메시지함 손잡이가 씀): 기본 640px, 720px↑ 760px 한 줄, 1000px↑ 1120px에 main 두 줄(grid 2칸, align-items:start). section이 아닌 줄(선택 바·뒤로·지수 바)과 칸 하나뿐인 화면은 두 줄 다 차지. 아래 메뉴 폭은 640 그대로. 폰 가로(landscape, 높이≤500px)는 위 막대 여백 줄이고 아래 메뉴 아이콘·글자 옆으로(파일 맨 끝 블록, .nav 규칙보다 뒤에 둬야 먹음).
- 1440px에서 jump-audit(W·H 바꿔) home·world·report·watch 위치 변화 0.
- 좁은 폰 고친 것: style.css `@media (max-width:400px) .wr` 작은 그래프 칸 96→60px(세계 지수 '1,333…' 잘림), `@media (max-width:380px) .stat` 여백·글자 15px(투자 공부 '-0.98 / %' 줄바꿈).
- 점검 스크립트는 스크래치(fit.js)라 사라짐: dashboard.py --out 으로 _site 만들고 http.server로 띄워 확인. 캡처 프로젝트 파일 screen-fit-preview/.
**How to apply:** 새 칸을 만들면 320·344px에서도 숫자 잘림 확인. [[design-system]] [[review-before-pr]]
