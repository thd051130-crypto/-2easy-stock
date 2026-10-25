---
name: learn-section
description: 📚 투자 공부 화면(홈 더 보기 → #kr/more/learn) — 오늘 왜·사례 일지·공부 노트·움직이는 이유·전문가 리포트·대처법·용어집; 평일 장 마감 뒤 매일 업데이트 (2026-10-25 PR)
metadata:
  type: project
  modified: 2026-10-24T14:41:01.477Z
---
2026-10-24 사용자: "투자정보도… 용어집부터 증시가 변한 이유·요인·대처 방식 등 교육자료". "우선 PR하지 말고 나한테 검수받고 올려". 미리보기 본 뒤 "내용이 빈약, 자주자주 업데이트", "자료를 받아올 수 없어?", 결정 카드에서 **매일 장 마감 뒤** 고름.
- site/app.js: LEARN_TABS(why·drivers·read·cope·terms). DRIVERS 15개(now(m)는 zOf: 최근 120거래일 표준편차 대비 2배↑ 크게, 1.5배↑ 움직임), 요인마다 quiz/answer. COPE 6개, CRASH_HISTORY, TERM_GROUPS(용어 82개+노트 용어). 오늘의 용어(termOfDay).
- 사례 일지: learn_cases.py(daily 워크플로, world.json 등만 읽음) → paper/learn_cases.json 120거래일. 국장 날짜엔 미국 자료를 그 전 거래일 것으로(before). 같은 z 기준.
- 공부 노트: paper/learn_notes.json {notes:[{day, market, title, tags, body[], quiz[q,a], terms{}}]} — 평일 장 마감 뒤 한 편씩 손으로(정기 작업) 더함, terms는 용어집에 합쳐짐.
- 전문가 리포트: reading.py → paper/reading.json. 네이버 리서치 옛 목록(finance.naver.com/research/*_list.naver)은 이제 JS 화면이라 HTML 파싱 불가 → 새 JSON API https://stock.naver.com/api/stockSecurity/researches/v2/<묶음>?index=0&size=15 (items[].nid,title,content(html 요약)…). 원문 주소 https://stock.naver.com/research/<daily(시황)|invest|economy|industry|debenture>/<nid> (Actions에서 확인). 이 클라우드 환경에선 naver 막힘 → Actions에서만. 시험 워크플로는 삭제함. 오늘 왜 탭에 '🏦 증권사가 본 이유' 칸(최근 5일 시황·전략 리포트 3개, 미장 탭은 미국 이야기만).
- '배우기'·'대처법 전부 보기'는 이동 버튼(lastTap=null). 점검 스크립트 사본에 learn:<탭> 추가.
**How to apply:** 검수 통과 전 PR 금지. 노트는 사실·후보 구분, 사고팔기 신호 금지. 관련 [[home-cleanup-pr64]], [[ui-no-jump-rule]], [[report-team]].
