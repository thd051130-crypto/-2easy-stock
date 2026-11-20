---
name: load-speed
description: 첫 화면 로딩 빠르게(2026-11-18) — 대기화면+가로 진행률, data.json 미리 받기, 공부 자료 learn.json 분리, 서비스워커 버전 파일 캐시, 측정 방법·숫자
metadata:
  type: project
---

2026-11-18 사용자 "로딩속도 줄이기 하자" + "최적화도 같이" + "처음 화면을 대기화면처럼 만들고 불러와" + "화면 밑에는 진행률 표시, 가로 슬라이드바로". 코드 간략화는 "위에 있는 거 끝나고 하자"(로딩 작업 다음 순서). 모델은 Opus 5.5 추천, 바꾸라고 하면 그 모델로 다시 짜기.

바꾼 것 (PR #137 머지 2026-11-18):
- index.html 머리 인라인 스크립트(window.BOOT)가 app.js 받는 동안 data.json(cache no-cache → 안 바뀌면 304)과 news.json을 미리 받음. app.js load()가 BOOT.data/BOOT.news를 이어받음.
- #app 안 대기화면(.boot: 회색 칸 + 아래 고정 가로 진행률 막대 .boot-prog, 받은 바이트 기준 %, 대기 중 .foot 숨김). render가 통째로 바꿈.
- dashboard.py split_learn: learn_cases·reading·story_log → <out>/learn.json, data.json엔 reading_days(날짜별 개수)만. 앱은 홈 그린 1.5초 뒤 loadLearn(), 공부 화면 먼저 열면 '공부 자료 불러오는 중…'.
- homeMoreRows(d, only): 칸 HTML을 함수로 받아 칸 화면 열 때 그 칸만 만듦.
- sw.js v6: ?v= 붙은 파일·fonts·icons는 캐시 먼저(예전 버전 지움), 나머지는 그대로 네트워크 먼저.

측정(느린 4G 400ms·1.44Mbps + CPU 4배, 로컬 서버 /tmp 스크립트): 처음 연 폰 홈 6.3→5.4초, 다시 열 때 3.0→1.2초, 공부 화면 HTML 전후 동일. 남은 큰 것: app.js 184KB(gz), 글꼴 첫 방문 ~230KB. 압축기(rjsmin)는 템플릿 문자열을 깨서 못 씀, npx 설치는 막힘.
탭 전환은 JS보다 화면 그리기(레이아웃)가 대부분, 스크롤 긴 작업 없음. content-visibility는 화면 위치가 튈 수 있어 안 씀 → [[ui-no-jump-rule]].

코드 간략화 1차 (2026-11-19 00:2x KST, 사용자 "휴대폰 꺼야 해서 멈추고 내일 못한 부분 계속"): 브랜치 claude/project-thread-oy4mm0 커밋 332c37b 푸시만(PR 없음, 검수 전). 안 쓰는 CSS 17줄·shares 함수 지움, localStorage 저장 42곳 → remember(k,v), moreView 뒤로 버튼 중복 제거, slim.py(배포본만 주석·들여쓰기 빼기, dashboard.stamp_assets에서 호출, tests/test_slim.py) → app.js gz 193→159KB, css 24→19KB. 확인: pytest 265, 77개 화면 HTML 전후 동일. 2026-11-19 17:3x KST: main 합침(8a0ae52), 새 jump-audit 1752번 밀림 0·오류 0, 77개 화면 동일, 처음 열 때 4.8→4.6초. 사용자 "올리고 머지해"(11-19 18:42 KST) → PR로 머지. 점검은 새 tools/jump-audit.js(--changed) 쓰면 빠름 → [[jump-audit-tool]].
