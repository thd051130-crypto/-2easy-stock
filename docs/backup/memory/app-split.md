---
name: app-split
description: app.js(7,900줄)를 화면별 site/js/*.js 18개로 나눔 + 지도·도구·의견 화면 파일은 열 때 받기(LAZY), 쪼개기 스크립트·주의점 (2026-11-20)
metadata:
  type: project
---

2026-11-20 사용자 "1번은 진행하고"(코디네이터 제안: app.js 화면별로 쪼개기 — 크레딧 절약 + 로딩). 2026-11-20 21:51 KST 사용자 "pr합쳐서 충돌 확인하고 올려" → 버튼 점검 업그레이드(26itac)·자산 시세 평가(22cy8j)·배당 달력(umu0yg)을 main 위에 합친 뒤 쪼개기, 브랜치 claude/project-thread-vylulf 하나의 PR.
- site/app.js 없앰 → site/js/ 18개: index.html이 차례대로 부르는 13개(core·view·watch·search·inbox·more·learn·chart·home·stock·guide·tools·main) + 열 때 받는 5개(map·savings·asset·lab·feedback). 모듈 아님, 그냥 전역 이름 공유. 파일 지도는 docs/CODEMAP.md.
- 나중에 받기: core.js `LAZY = { map:[map], tools:[savings,asset,lab], feedback:[feedback] }`, needJs/needScreen, render()가 파일 없으면 "화면 불러오는 중이에요…" 띄우고 받은 뒤 다시 그림. 홈 뜨고 2.5초 뒤 preloadJs로 미리 받음. 주소로 바로 연 화면은 main.js가 자료와 같이 받기 시작.
- 다른 화면도 쓰는 것은 먼저 받는 파일로 옮김: AST·astSum 등 → tools.js(목표 줄 goalLine이 리포트에 나와서), RET·loadReturns → tools.js, savColor → chart.js, healthLine → inbox.js, mapFocus·mapTrail·openMap → core.js. resetFolds는 받은 파일만 접기(JS_GOT).
- 배포: dashboard.stamp_assets가 js/*.js 마다 ?v=해시, window.JSV에 버전(지연 파일용). slim.py는 js/*.js 전부. sw.js v7 APP_JS 목록(새 파일 만들면 추가, test_dashboard가 확인). jump-audit --changed는 site/js 파일들을 이어 붙여 계산, 가짜 시계 점검은 screenReady()로 지연 파일 받는 동안 기다림(안 그러면 도구 화면 0번 누름).
- 확인: 40개 화면 HTML 전후 같음(무작위 id만 다름), jump-audit 전후 1,807번 밀림 0(허용 7) 오류 0, pytest 통과(test_econ_calendar 2개·realtime_monitor는 원래 실패). 느린 4G+CPU 4배: 처음 열 때 10.4→9.7초, 처음 받는 JS 553→447KB(압축 전), 다시 열 때 그대로 1.2초. 배포 뒤엔 바뀐 파일만 새로 받음.
- 쪼갠 스크립트(표시 글자로 잘라서 다른 app.js 버전에도 다시 돌릴 수 있음)는 프로젝트 파일 app-split/split.py. 다른 브랜치가 app.js를 고쳤으면: 그 app.js로 split.py 다시 돌리고 → 지연 로딩 커밋 얹기. 새로 옮겨야 할 이름(합칠 때 실제로 자산 시세 평가 AST_LIVE·astEval·astLastYm·savPx를 tools.js로 옮김, goalNow가 써서) MOVES에 더하기.
**Why:** 사용자 예산은 Claude 구독료뿐이라 코드 읽는 양을 줄이고, 폰 첫 화면도 빠르게.
**How to apply:** 새 기능은 맞는 화면 파일에. 지연 파일(★) 안의 것을 홈·리포트 등 다른 화면이 부르면 먼저 받는 파일로 옮기기. 관련 [[code-map]], [[load-speed]], [[jump-audit-tool]], [[asset-record]].
