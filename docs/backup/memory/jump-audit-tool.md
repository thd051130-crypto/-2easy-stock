---
name: jump-audit-tool
description: 버튼 누르기 점검 도구(tools/jump-audit.js) 빠르게 — 4개 동시, --changed 빠른 모드, PR마다 ui-audit 워크플로, 허용 목록, 시간 숫자
metadata:
  type: project
---

2026-11-18 사용자 "ㅇ"(동시 누르기 + 바뀐 화면만 빠른 모드 + PR마다 Actions 자동 실행). 브랜치 claude/project-thread-2cyq49, 검수 대기.
- 도구를 저장소 tools/jump-audit.js로 옮김(프로젝트 파일 tools/jump-audit.js도 같은 것으로 바꿈). 쓰는 법: `python dashboard.py --out _site`, _site를 127.0.0.1:8765로 띄우고 `node tools/jump-audit.js [화면들] [--changed] [--quick] [--workers N]`.
- 옛 도구는 처음 사용법 안내(guide_v1)가 화면을 덮어 버튼 1562개를 '가려져서 못 누름'으로 건너뛰고 있었음 → 새 도구는 guide_v1 미리 끔.
- 빠르게 한 것: 화면 4개 동시(브라우저 하나, 화면마다 새 창), 누른 뒤 고정 0.9초 대신 화면이 0.15초 멈추면 다음(최소 0.35초, 부드럽게 내려가는 중이면 최대 2초), 오래 걸리는 화면(메시지함 409번·검색·지도)부터.
- `--changed`: git diff로 바뀐 app.js 함수 → 그 함수를 쓰는 화면만(VIEWS·render의 screen === 줄·homeMoreRows add 줄·PERF_TABS에서 따라감) + 같은 종류 버튼 3개까지. render·go·keepTap 같은 공용 함수, style.css·index.html·dashboard.py 바뀌면 전부.
- 허용 목록 tools/jump-audit-allow.txt(일부러 움직이는 버튼: 실적 더 보기, 리포트 달력 이동·날짜, 종목 #업종 태그). 목록 밖 MOVE나 오류가 있으면 종료 코드 1 → PR 체크 실패.
- .github/workflows/ui-audit.yml: site/·dashboard.py·paper/·도구가 바뀐 PR마다 전체 점검, 공개 저장소 무료 러너(ubuntu-24.04), playwright 1.63.0 고정, 결과 Summary + 7일 보관 파일.
- 시간(이 클라우드, CPU 4개): 옛 32분(1569번, 화면 31개) → 전체 3분 41초(1745번, 화면 38개: 자산 기록·공부·세계 지수·사용법·의견 추가) · 빠른 전체 1분 41초 · 함수 하나 바뀌면 4초.
- 앱 코드(app.js)는 안 건드림 (첫 화면 로딩 스레드와 충돌 피하려고) → [[load-speed]]. 규칙 → [[ui-no-jump-rule]].
