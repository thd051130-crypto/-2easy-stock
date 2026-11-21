---
name: check-tool
description: tools/check.py 종류별 빠른 점검(map·js·test·data·ui·diff) + docs/INFOMAP.md 정보 지도 (2026-11-20, 검수 대기)
metadata:
  type: project
---

사용자 "백테스트 돌리는거 종류별로 빠르게" = 점검 돌리기 (2026-11-20). 브랜치 `claude/project-thread-7h3r8t`, PR 안 올림(검수 대기 → "올려" 받으면 PR).

- `python tools/check.py` 빠른 점검 약 1초(map·js·달라진 테스트만·data, 화면 코드가 바뀌면 ui --changed 추가). `all` 전부 약 40초. 종류 뒤 `:all` = 그 종류만 전체 (`test:all` 269개 9초, `ui:all` 버튼 1,768개 28초).
- map: CODEMAP 이름이 적힌 파일에 진짜 있는지·(~줄) ±80줄·★=LAZY·INFOMAP 경로·워크플로 cron·Secrets 이름이 워크플로와 같은지. test.yml이 PR마다 `check.py map,js` 돌림 → 지도 안 고치면 빨간불.
- data: paper/*.json·live news.json 시각이 허용 시간 넘으면 경고(`--strict`면 실패). 첫 실행에서 news.json 6시간 늦음 잡음 → [[actions-schedule-delay]].
- diff: main 코드와 지금 코드로 같은 자료를 그려 화면 8개(:all 32개) 픽셀 비교, 다르면 `_screen-diff/`에 전·후·빨강 사진 (tools/screen-diff.js, 약 8초).
- `docs/INFOMAP.md`: 자료 파일(누가·언제·앱 어디), 예약 표(cron·한국 시간), 키 이름, 밖의 서비스, 문서·메모. 코드는 [[code-map]].
- 🪙 토큰 줄이기(2026-11-21, 사용자 "1,2,3 다 진행해"): ① 통과한 종류는 파일 안 바뀌면 건너뜀(.check-cache.json, --fresh) ② diff가 달라진 곳만 잘라 전·후 나란히 `_screen-diff/<화면>-crop.png` → Claude는 이것만 열기 ③ `check.py shots --out <폴더> --screens home:kr,…` 검수 사진 라이트·다크 2배 저장(Claude는 안 열고 첨부만) ④ `tools/peek.py` 함수 하나·JSON 모양·CSS 규칙만. 규칙은 CLAUDE.md "Checks and previews".
