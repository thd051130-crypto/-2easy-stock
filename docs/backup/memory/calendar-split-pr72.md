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
- PR #74: '다가오는 일정'은 달력(월~금 칸, 주말 일정은 금요일 칸에), 지난달~5개월 뒤 7개 달 버튼, 날짜 누르면 그날만, 지난 날·일정은 연하게. FRED 미국 발표는 FRED가 올린 해까지만.
- 2026-10-18 요청으로 전체 기간: econ_calendar가 작년 1월~내년 12월 저장(YEARS_BACK·YEARS_AHEAD, FRED 3년 치, FOMC 지난 날짜는 keep_past로 남김). 달 버튼은 일정 있는 모든 달을 옆으로 미는 줄(.ec-months, 가로 위치 econBarX 기억, 고른 달이 안 보일 때만 가로로 맞춤), 지난달~5개월 뒤(ECON_NEAR)는 파란 칸(.cal-m.near), 나머지는 그대로.
- 앱 홈 '더 보기': cal(다가오는 일정, 경제만) / earn(실적·배당 발표, 30일, 내 종목 + 대형주 실적 더 보기) 두 칸. calendarCard·earningsCard.
- 세계 지수·환율: 줄 누르면 아래에 lineChart 그래프(1·3·6개월·1년, localStorage world_g), 지수는 '캔들 차트로 크게 보기' → CHART_IDX. world.py가 dates 보냄.
- 산업 지도 아래 '산업 흐름'에서 산업 눌러도 scrollY 그대로(지도로 안 올라감, 사용자 요청).
- 2026-10-24 달력 고정(사용자 스크린샷 "이정도 높이에서"): calendarCard가 .ec-pin(월 제목+칸, sticky, top = .top 높이를 pinEcon()이 넣음)과 .ec-list(min-height = 남은 화면 높이, 날짜 눌러 목록이 짧아져도 달력 멈춘 자리 유지)로 나뉨. 달력이 멈춘 상태에서 날짜·‹ ›를 누르면 renderEcon()이 새 목록 맨 위로 맞춤, 안 멈췄을 땐 화면 그대로. jump-audit의 more:cal 맨 아래 '자세히' MOVE는 감사 스크립트가 y=380(달력 밑)에서 눌러서 생기는 가짜.
Related: [[big-events-pr63]], [[perf-cleanup]], [[world-markets-pr23]], [[industry-map-pr50]]
