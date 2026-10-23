---
name: design-system
description: 이지스톡 앱 디자인 규칙 (2026-10-23 디자인 다듬기 PR) — Pretendard 글꼴 직접 올림, 색·간격·모서리 토큰, 카드 제목 16px
metadata:
  type: project
---

2026-10-23 사용자 "이지스톡 전체적인 디자인 다듬어봐" (frontend-design·design-critique 플러그인 사용). 기능은 그대로, 보이는 것만 다듬음. 메시지함 PR #84 변경도 같은 PR에 합침 (사용자: 충돌 나니까 합쳐서 올리자).
- 글꼴: Pretendard Variable를 site/fonts/에 직접 올림 (npm pretendard@1.3.9의 dynamic-subset woff2 92개 + fonts/pretendard.css, 필요한 글자 조각만 받음). 클라우드 컨테이너에서 jsdelivr CDN은 막혀 있어서 npm pack으로 받음. index.html이 style.css보다 먼저 부름, sw.js SHELL에 포함.
- 토큰(site/style.css :root): --radius 18px(카드), --radius-s 12px(카드 안 작은 칸, 옛 10px 전부 바꿈), --card-shadow(밝은 화면만), --pop-shadow(말풍선·떠 있는 버튼), --bar-bg/--nav-bg(위·아래 막대 반투명+blur), --font. 밝은 화면 카드 #fff on #f3f2ef, 글자 #1d1c1a. 어두운 화면 글자 #f3f2ed(순백 아님), 카드 #1c1c1a on #121211.
- 글자 크기: 카드 제목 h2 16px/700 진한 글자(전엔 13px 회색), 제목 옆 small 12px, headline 22px, hero 32px, big 28px, stat 17px. 숫자는 tabular-nums 유지.
- 아래 화면 버튼: 고른 화면 아이콘 뒤에 파란 알약 배경. 큰 발표 칸은 굵은 테두리 대신 얇은 테두리+왼쪽 주황 줄.
- 수익률 달력 0.0% 날은 빨강 대신 무색(calColor).
- 지킨 것: 오르면 빨강·내리면 파랑, 가격축 오른쪽, 화면 그대로 규칙 [[ui-no-jump-rule]] (홈 버튼 25개 눌러 위치 변화 0 확인).
**How to apply:** 새 칸·버튼은 이 토큰을 쓰고 새 고정 색·px 모서리 만들지 말 것. 미리보기 /mnt/project-files/design-polish-preview/ (0-before-*, 1-after-*). 관련 [[phone-dashboard]], [[home-cleanup-pr64]].
