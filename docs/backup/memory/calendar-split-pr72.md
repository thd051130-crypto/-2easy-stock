---
name: calendar-split-pr72
description: PR #72 — 일정(경제)과 실적·배당 발표 분리, FRED 발표 일정표로 CPI·고용·PCE·GDP 몇 달 치, 세계 지수 누르면 그래프, 산업 흐름 탭 스크롤 유지
metadata:
  type: project
  modified: 2026-10-17T08:01:31.692Z
---

2026-10-17 사용자 요청: "다가오는 일정과 실적·배당 발표 분리", "일정에 CPI 등 대형 이벤트 반영 확인, 없으면 추가", "세계지수환율 누르면 그래프".
- 확인 결과: 그 전엔 CPI·고용이 이번 주(events.json, 포렉스팩토리)만 있었음. bls.gov는 Actions에서도 403.
- econ_calendar.py: FRED 발표 일정표 https://fred.stlouisfed.org/releases/calendar?rid=N&y=YYYY (키 없음, User-Agent 보내지 말 것, HTML의 날짜 줄 + "7:30 am" 미국 중부 시간 → 한국시간). FRED_RELEASES: 10 CPI, 50 고용, 54 PCE, 53 GDP (1급 🚨), 46 PPI, 9 소매판매 (📌). calendar.json "releases"에 저장(못 받으면 지난번 것). 이번 주는 events.json 줄 우선(같은 날·같은 "한국시간 HH:MM 발표"면 FRED 줄 뺌), 같은 시각 발표는 한 줄로 합침. 2026-10-17 Actions에서 77개 받음(12월까지, 내년은 FRED가 아직 안 올림).
- PR #74: '다가오는 일정'은 달력(월~금 칸, 주말 일정은 금요일 칸에), 지난달~5개월 뒤 7개 달 버튼, 날짜 누르면 그날만, 지난 날·일정은 연하게. econ_calendar AHEAD 186일·BEHIND 40일. FRED 미국 발표는 FRED가 올린 해까지만(2026-10 기준 12월까지).
- 앱 홈 '더 보기': cal(다가오는 일정, 경제만) / earn(실적·배당 발표, 30일, 내 종목 + 대형주 실적 더 보기) 두 칸. calendarCard·earningsCard.
- 세계 지수·환율: 줄 누르면 아래에 lineChart 그래프(1·3·6개월·1년, localStorage world_g), 지수는 '캔들 차트로 크게 보기' → CHART_IDX. world.py가 dates 보냄.
- 산업 지도 아래 '산업 흐름'에서 산업 눌러도 scrollY 그대로(지도로 안 올라감, 사용자 요청).
Related: [[big-events-pr63]], [[perf-cleanup]], [[world-markets-pr23]], [[industry-map-pr50]]
