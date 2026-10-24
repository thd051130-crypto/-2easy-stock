---
name: weekly-lab
description: 주간 리포트(weekly.py, 토요일 09:30)와 포트폴리오 실험실(lab.py + 도구 탭) — 2026-10-24 사용자가 기능 후보 중 고름
metadata:
  type: project
---

2026-10-24 사용자: 기능 후보 검토 뒤 "주간리포트로 하고 포트폴리오 실험실 만들자". (같이 낸 후보 중 관심종목 위험 점검·환율 같이 보기·지수 선물 보기는 아직 안 만듦. 사용자가 "선물이 없네"라고 해서 지수 선물(ES=F·NQ=F 등, 30분 뉴스 때 같이 받기)도 후보에 있음.)

- 주간 리포트: weekly.py → paper/weekly.json + 텔레그램 한 통(메시지함 src weekly). 워크플로 weekly.yml 토요일 UTC 00:30(한국 09:30), concurrency group daily. 이미 저장된 world/macro/events/calendar/<시장>/daily.json만 읽음. 구획: 이번 주 지수(1주 등락, 코스피·S&P500 요일별), 업종 5일 상위·하위, 5일 많이 움직인 종목, 사건(events.json shocks·tier1 발표 결과·경기 판정 변화), 다음 주 월~금 일정(tier1 + calendar big/rate/expiry + 대형주·관심종목 실적).
- 앱: 리포트 화면 맨 위 '📰 오늘의 리포트 / 🗞 주간 리포트' 버튼(rpTab). 주간이 3일 안에 나왔으면 처음부터 주간. 홈 리포트 카드 아래 '주간 리포트 보기' 버튼(data-rp-week, 3일 안일 때만).
- 포트폴리오 실험실: lab.py → paper/symbols/lab.json (fundamentals 워크플로 토요일). 야후 월말 수정 종가, 미국 자산은 원/달러로 원화 환산(야후 KRW=X 월봉에 0.1 같은 틀린 값 있어 500~3000 밖은 지난달 값). 자산 9개: KODEX200, SPY, QQQ, SCHD, KOSEF국고채10년, IEF, TLT, GLD, KODEX단기채권.
- 앱 도구 탭 두 번째 '포트폴리오 실험실'(PERF_TABS lab): 예시 5개(주식만·미국 주식만·주식6:채권4·올웨더 비슷·낙폭 작게), 자산별 −/+ 10%p(합 100이면 + 막힘), 매년 되돌리기/그냥 두기, 기간 전체/10년/5년. 결과: 최대 낙폭·회복 개월·연 수익률·가장 나빴던 해를 같은 기간 코스피200만(미장 탭은 S&P500만)과 비교, 로그 눈금 선 + 낙폭 면 그래프. 비율은 localStorage lab.
- 같이 고침: report_desks.py 시장팀이 world.json 이름과 안 맞아 미국 10년 금리·VIX·WTI·금 줄이 빠져 있던 것, 금리는 %p로 표시.
**How to apply:** 실험실은 사고팔기 판단이 아닌 과거 숫자 비교로 유지. 새 자산은 lab.py ASSETS에 추가. 관련 [[report-desks]], [[ui-no-jump-rule]].
