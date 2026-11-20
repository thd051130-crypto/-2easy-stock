---
name: jump-audit-tool
description: 버튼 누르기 점검 도구(tools/jump-audit.js) — 가짜 시계로 232→32초, 오작동(DEAD·TEXT·LINK·ERR) 잡기, --changed 빠른 모드, PR마다 ui-audit
metadata:
  type: project
---

2026-11-18 사용자 "ㅇ"(동시 누르기 + 바뀐 화면만 빠른 모드 + PR마다 Actions 자동 실행). PR #139 머지(2026-11-19 00:16 KST, 사용자 "머지해"). GitHub에서 점검 자체 222초, 첫 실행은 chromium 설치로 총 11분 반(다음부턴 캐시).
- 도구를 저장소 tools/jump-audit.js로 옮김(프로젝트 파일 tools/jump-audit.js도 같은 것으로 바꿈). 쓰는 법: `python dashboard.py --out _site`, _site를 127.0.0.1:8765로 띄우고 `node tools/jump-audit.js [화면들] [--changed] [--quick] [--workers N]`.
- 옛 도구는 처음 사용법 안내(guide_v1)가 화면을 덮어 버튼 1562개를 '가려져서 못 누름'으로 건너뛰고 있었음 → 새 도구는 guide_v1 미리 끔.
- 빠르게 한 것: 화면 4개 동시(브라우저 하나, 화면마다 새 창), 누른 뒤 고정 0.9초 대신 화면이 0.15초 멈추면 다음(최소 0.35초, 부드럽게 내려가는 중이면 최대 2초), 오래 걸리는 화면(메시지함 409번·검색·지도)부터.
- `--changed`: git diff로 바뀐 app.js 함수 → 그 함수를 쓰는 화면만(VIEWS·render의 screen === 줄·homeMoreRows add 줄·PERF_TABS에서 따라감) + 같은 종류 버튼 3개까지. render·go·keepTap 같은 공용 함수, style.css·index.html·dashboard.py 바뀌면 전부.
- 허용 목록 tools/jump-audit-allow.txt(일부러 움직이는 버튼: 실적 더 보기, 리포트 달력 이동·날짜, 종목 #업종 태그). 목록 밖 MOVE나 오류가 있으면 종료 코드 1 → PR 체크 실패.
- .github/workflows/ui-audit.yml: site/·dashboard.py·paper/·도구가 바뀐 PR마다 전체 점검, 공개 저장소 무료 러너(ubuntu-24.04), playwright 1.63.0 고정, 결과 Summary + 7일 보관 파일.
- 시간(이 클라우드, CPU 4개): 옛 32분(1569번, 화면 31개) → 전체 3분 41초(1745번, 화면 38개: 자산 기록·공부·세계 지수·사용법·의견 추가) · 빠른 전체 1분 41초 · 함수 하나 바뀌면 4초.
- 앱 코드(app.js)는 안 건드림 (첫 화면 로딩 스레드와 충돌 피하려고) → [[load-speed]]. 규칙 → [[ui-no-jump-rule]].
- 2차 업그레이드(2026-11-20, 사용자 "버튼 백테스트 빨리 누르게 업그레이드 시켜, 2번도 하자" → 2번 = 오작동 더 잡기로 이해, 브랜치 claude/project-thread-26itac, 검수 대기): page.clock 가짜 시계로 앱 setTimeout·rAF를 바로 돌림(진짜로는 fetch 받는 동안만 기다림), reducedMotion, 밖 주소 막기·새 창 안 염, 버튼 하나에 evaluate 2번, 메시지함 창 3개로 나눔(SPLIT). 전체 232초→32초, MOVE 결과 전과 같음.
- 새로 잡는 것: DEAD(눌러도 반응 없음 — 화면 바뀜·스크롤·주소·입력칸 포커스·새 창 다 없음), TEXT(NaN·undefined·null·[object Object]·Infinity 글자, 누른 뒤엔 바뀐 곳만), LINK(깨진 주소·앱 밖 페이지 링크), ERR(pageerror·console.error·같은 서버 404 — stocks/·indexes/는 점검 빌드에 없어서 뺌). 허용 목록은 전부에 적용.
- 점검 도구 헛누름 2개 고침: 닫힌 바깥 details 안 summary(크롬은 닫힌 칸도 크기를 줌), 가로 줄 밖 잘린 탭(보이는 부분 가운데 누름).
- 찾은 앱 오작동: 자산 기록 '계좌 추가'·'증권사 추가'를 이름 비우고 누르면 반응 없음 → 이름 칸으로 커서 이동.
- 가짜 시계 주의: page.clock은 창 전체에 걸려서 새 창을 닫으면 runFor가 끊김 → 새 창은 아예 안 열게 막음.