---
name: owner-risk-issues
description: 주간 '🔥 이번 주 이슈'·'기업·경영자' 주제·⚠️ 악재 강조·⚠️ 리스크 일정(risk_events.json)·초대형주 실적 — 2026-11-15, 검수 대기, PR 취소됨
metadata:
  type: project
---
2026-11-15 사용자: "엔비디아 젠슨황 같은 오너리스크 같이 증시에 영향 가는 이슈가 왜 이번주 이슈에 안 뜨는 거야?" → "핫뉴스에만 뜨네".
- 원인: 주간 리포트 '⚡ 이번 주 사건'은 숫자 사건(지수 급변·큰 발표 결과·경기 판정)만 봄, 뉴스 안 봄. 젠슨 황 기사는 핫 뉴스에만 있었고 주제 분류에 경영자 칸이 없어 주제 없음/무역·관세로 붙음.
- 고침(브랜치 claude/project-thread-ldocw5, PR 아직 없음, 미리보기 /mnt/project-files/owner-risk-preview/):
  - news.py TOPICS 맨 앞 '기업·경영자'(CEO·사임·퇴진·스캔들·수사·횡령·젠슨 황·머스크 등). 검색어 추가: 국장 "오너 리스크 주가", 미장 "CEO 사임 주가 급락".
  - news.json에 week{kr,us}: 한 주 핫 뉴스 기록(keep_hot days=8, 최대 40개). 앱 hot 칸(16개)과 따로.
  - weekly.py issue_desk: --news(워크플로가 live 브랜치 news.json 받아 넘김)에서 이번 주 것, 같은 사건 묶고 언론 많은 6개 → 날짜 순. 지난주부터 이어진 건 '지난주부터'. 주제는 news.topic으로 다시 붙임. 텔레그램 [이번 주 이슈] 칸.
  - 앱 주간 리포트 '⚡ 이번 주 사건' 아래 '🔥 이번 주 이슈' 카드(시장 탭별, 기업·경영자 배지 빨강).
- 같은 날 사용자 "ELS 만기 같은 리스크 있는 일 미리 알려줘", "악영향 가는 뉴스 강조해서": news.py BAD 낱말 → bad 플래그(앱 BAD_NEWS와 같게), 앱 '⚠️ 악재' 배지·핫 뉴스에서 악재 먼저·홈 지금 뉴스 줄 '⚠️ 악재 N건'. paper/risk_events.json(사람이 적음, 첫 줄 12-01 '9천피' ELS 만기) → econ_calendar kind risk(달력 ⚠️·주간 일정), risk_alert 7일 전·하루 전 텔레그램(macro 워크플로 매일). econ_calendar BIG_EARN(엔비디아·테슬라 등 12개) 실적 날짜를 yfinance로 매일 → calendar.json big_earn. 엔비디아 실적 2026-11-17(미국).
- 다른 스레드의 핫 뉴스 '모두 읽음' 화면 밀림 수정(커밋 90a88f5)을 같은 브랜치에 cherry-pick. 사용자가 합친 PR을 요청했다가 "pr 취소해"(PR은 안 올림). 브랜치 claude/project-thread-ldocw5에 세 커밋 다 있음. 미리보기 v2: /mnt/project-files/owner-risk-preview/v2/.
**How to apply:** 사용자 검수 뒤 "올려"면 PR (docs/backup 같이). 종목 뉴스 전체를 넣는 건 아님 — 언론 3곳 이상 다룬 핫 뉴스만. 관련 [[live-news]], [[weekly-lab]].
