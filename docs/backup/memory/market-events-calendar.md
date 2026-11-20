---
name: market-events-calendar
description: 일정 달력·홈 큰 발표 칸에 증시 구조 일정(네 마녀의 날·지수 정기변경·휴장·연말 배당락·FOMC 회의록·ISM·한국 수출입·JOLTS) 채움 — 2026-11-19, 검수 대기
metadata:
  type: project
  modified: 2026-11-19T12:01:56.348Z
---
2026-11-19 사용자: "일정에 ELS 만기일처럼 증시에 큰 영향 가는 사건들 국내·미국 다 반영되고 있는 거야?" → "알아서 채워두도록".
- 그 전에 있던 것: FOMC·금통위, FRED 큰 발표(CPI·고용·PCE·GDP·PPI·소매판매), 이번 주 포렉스팩토리 큰 발표(events.json), 월물 만기(휴장 조정 없음), 종목 실적·배당락, 초대형주 12개 실적, risk_events.json 사람이 적는 리스크(ELS 1건).
- 추가(econ_calendar.py, 전부 규칙 계산·무료): holidays 패키지(requirements.txt)로 한국거래소·뉴욕거래소 휴장일 → 만기일 앞 거래일로 당김, 3·6·9·12월 '네 마녀의 날'(big). kind index ⚖️(코스피200·코스닥150 6·12월 만기일, MSCI 2·5·8·11월 마지막 거래일(big)·MSCI 발표일 MSCI_ANNOUNCE, S&P 500 분기·12월 나스닥100, 러셀 6월 넷째·12월 둘째 금요일(2026~)), kind holiday 🛑(휴장, 미장 조기 폐장, 국장 새해 첫날·수능 날 10시 개장 SUNEUNG), kind divday 💰(국장 연말 배당락 = 폐장 전 거래일). rule_releases(kind big 📌): FOMC 회의록(회의+21일 오후 2시 동부), ISM 제조업(첫 거래일)·서비스업(셋째 거래일) 10시, 한국 수출입(매달 1일 09:00). FRED 192 JOLTS 📌.
- big_rows(…, fomc)가 규칙 줄도 만들어서 dashboard.fresh_calendar도 같은 줄 → events.json과 같은 날·시각이면 빼서 이름은 홈 칸과 같음.
- 홈 '🚨 큰 발표' 칸: 달력 자료(DATA.calendar)에서 오늘·내일 '증시 일정'(만기·정기변경·휴장·배당락·리스크·금통위·events.json에 없는 발표) 줄 추가(bigCalRows).
- 빠진 채로 둔 것(무료 규칙 자료 없음): 미국 국채 입찰(fiscaldata API 이 클라우드에선 막힘), 잭슨홀, MSCI 연례 시장분류(6월), BOJ·ECB 몇 달 치, 삼성전자 잠정실적. 이런 건 뉴스 보이면 risk_events.json에.
- 브랜치 claude/project-thread-sij38k, PR 안 올림(검수 먼저). 미리보기 /mnt/project-files/market-events-preview/. jump-audit --changed 밀림 0(허용 5).
**How to apply:** MSCI 발표일·수능 날은 해마다 새로 나오면 MSCI_ANNOUNCE·SUNEUNG에 추가. 관련 [[fed-calendar-sync]], [[owner-risk-issues]], [[calendar-split-pr72]].
