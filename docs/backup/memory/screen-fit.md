---
name: screen-fit
description: 화면 크기별 점검(2026-11-15) — 9가지 크기×19화면 가로 넘침 0, 좁은 폰(≤400px)에서 세계 지수 숫자 잘림·투자 공부 % 줄바꿈만 고침, 검수 대기
metadata:
  type: project
  modified: 2026-11-15T11:04:50.148Z
---

2026-11-15 사용자 "화면 비율에 맞게 알아서 맞춰지나?" (다른 사람 기기에 배포 얘기 중).
- 점검: playwright로 320·344(접는 폰 바깥)·360·390·430·690(접는 폰 펼침)·820(태블릿)·844×390(폰 가로)·1440(PC) × 홈·리포트·관심·도구 6탭·차트·세계 지수·산업 지도·메시지함·의견 보내기·지금 뉴스·일정·투자 공부·히트맵·미장 홈. 페이지 가로 넘침은 전부 0.
- 넓은 화면(태블릿·PC)은 가운데 640px 폰 폭 칸(main max-width 640) — 깨지진 않고 양옆이 빔. 폰 가로는 위 막대+아래 메뉴가 높이 1/3 차지.
- 고친 것(브랜치 claude/project-thread-zvzj2m, PR 전 검수 대기): style.css `@media (max-width:400px) .wr` 작은 그래프 칸 96→60px(세계 지수 '1,333…' 잘림), `@media (max-width:380px) .stat` 여백·글자 15px(투자 공부 '-0.98 / %' 줄바꿈).
- 점검 스크립트는 스크래치(fit.js)라 사라짐: dashboard.py --out 으로 _site 만들고 http.server로 띄워 확인. 캡처 프로젝트 파일 screen-fit-preview/.
**How to apply:** 새 칸을 만들면 320·344px에서도 숫자 잘림 확인. [[design-system]] [[review-before-pr]]
