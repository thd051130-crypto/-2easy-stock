---
name: basics-audit-2026-11-21
description: 앱 기본기 빠진 것 진단(2026-11-21, 분석만) — 칸 하나 오류로 화면 전체 멈춤이 1순위, 오류 수집·이상값 검사·개인정보 안내·공유 미리보기·글자 크기
metadata:
  type: project
  modified: 2026-11-21T14:17:55.958Z
---
2026-11-21 사용자 "어플 만들 때 꼭 해야 하는데 빠진 거 있어?" → main ff879a7 코드 확인(고치지 않음).

이미 있음: 투자 권유 아님·출처·실시간 아님 문구(index.html footer), 자료 2평일 밀리면 ⚠️(home.js marketStatus), 오프라인 캐시·홈 화면 앱·아이콘(sw.js·manifest), 못 불러옴 안내(core.js load), pytest+jump-audit, 키 노출 없음.

빠진 것(중요도 순):
1. view.js render가 `VIEWS[screen](d).join("")`를 보호 없이 부름 → 칸 하나가 자료 이상으로 오류 나면 화면 전체가 안 그려짐. load()의 catch는 받기만 감싸서 처음 열 때면 대기화면 99%에 멈춤. 칸마다 try/catch + "이 칸만 못 그렸어요" (작음) ← 추천.
2. 오류 수집 없음: window.onerror 없음. 기존 클라우드플레어 워커로 오류 한 줄 → 메시지함 (무료, 다만 앱이 밖으로 보내는 요청이 생김 → [[privacy-audit]] 기준 다시 보기).
3. 숫자 이상값 검사 없음: check.py data는 신선도만. 야후 0·액면분할 값이 그대로 표시될 수 있음 (중간).
4. 개인정보 처리 안내 한 곳 없음(자산 기록=이 폰만, 의견=텔레그램) (글만, 작음).
5. 공유 미리보기 og 태그 없음, 404.html 없음 (작음).
6. 글자 크기 조절 없음, 11px 이하 29곳, px 고정 (중간).
1번 고침(2026-11-21 사용자 "레츠고"): view.js paintCards/cardFail — VIEWS 칸을 함수로 넘겨 하나씩 try, 오류 칸은 '⚠️ 이 칸은 자료가 이상해서 못 그렸어요' + CARD_ERR(최근 20개, 2번 오류 알림용), core.js load의 render도 try, more.js 도구 탭 tabHas, home.js 세계 지수 바 타이머 오류 막기. 브랜치 claude/project-thread-k2chcm, 미리보기 card-guard-preview/. 2~6번은 대기. 관련 [[bug-hunt-2026-11-20]], [[business-strategy]].
