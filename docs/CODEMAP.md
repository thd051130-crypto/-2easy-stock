# 코드 지도
지도로 자리 찾기 → `grep -n "function 이름" site/app.js` → 그 줄부터 100~200줄만 읽기. 줄 번호는 대략(2026-11-20).
새로 뽑기: `grep -n "^// ------" site/app.js` (구역) · `grep -n "^/\*" site/style.css` (디자인)

## 흐름
Actions → 파이썬 → `paper/*.json` → pages.yml: `dashboard.py`(site/→_site/, data.json) + `stock_pages.py` + `industry_map.py` + `slim.py`(주석 빼기) → Pages. 뉴스만 live 브랜치 news.json.
`site/sw.js` 껍데기 바꾸면 `CACHE` 번호 올리기. 테스트: `python -m pytest tests/test_<스크립트>.py`.

## site/app.js
화면 → 칸 목록은 `VIEWS`(~552), 버튼 연결은 `render`(~647), 도구 탭은 `PERF_TABS`(~2783), 홈 더 보기는 `homeMoreRows`(~2806).
```
1-455     설정·주소 이동 go/back/openStock·도우미 esc/money/pct·뉴스 저장·load
457-645   움직임 drawIn/countUp · 화면 고정 keepTap/holdHeight/keepRow
900       급락 점검 dropCard
964       관심·전체 종목·조건 검색 watchCard/screenerCard/bindWatch
1211      종목 이름 검색 scoreOf/loadSymbols
1370      의견 보내기 feedbackCard
1450      메시지함·리포트·지난 리포트·주간 reportCards/pastCards/weeklyCards/inboxCard
1825      문장 검색·테마 searchCard/findStocks/themeCard
2100      산업 지도 mapLayout/mapSvg/mapCard/bindMap
2880      지금 뉴스·핫 뉴스 newsCard/hotCard
2944      투자 공부 learnView/learn*Cards/storyCard/bindLearn
3764      지수 차트 그림 drawTrend/smaOf/rsiOf · 3943 비교 차트 compareCard · 4287 지수 차트 칸 trendCard/maPanel/indChips
4439      적립식 계산기 savingsCard/bindSavings
5010      세계 지수 worldTicker/worldCard · 5156 경기 macroCard·정책 policyCard
5271      공시 · 5299 장 상황 · 5336 큰 발표 bigEventsCard · 5402 일정 달력 calendarCard/earningsCard
5519      히트맵·업종·급등락·수급 heatmapCard/moversCard/flowsCard
5725      종목 화면 stockHeadCard/bindStock/fundHtml · 6108 candleChart/chartGestures/lineChart
6493      처음 안내·사용법 guideShow/helpCard · 6654 resetFolds · 6698 foldNotes
6723      폭락 대비 stressCard · 6787 체크리스트 checkCard · 6861 목표 goalCard
6959      자산 기록 ast*/assetCard/astTree/bindAsset
7534      실험실 labCard · 7770 수익률 달력 retCalendarCard
```

## site/style.css
1-120 색 토큰(다크 ~40·~74) · 265 아래 메뉴 · 283 홈 · 411 종목 · 511 산업 지도 · 663 적립식 · 798 목표 · 861 큰 발표 · 895 핫 뉴스 · 942 세계 지수 · 968 일정 · 1051 주간 · 1111 실험실 · 1220 자산 기록

## 파이썬 (만드는 것 · 언제)
- daily.py(+movers·sectors·quiet_volume·marketdata), flows.py, report_desks.py(+market_story·analyst_view), learn_cases.py, reading.py → daily.yml 국장 17:30·미장 07:30
- macro.py, econ_calendar.py, policies.py → macro.yml 06:50 · world.py → world.yml 07:05 · news.py → 30분마다
- weekly.py → 토 09:30 · fundamentals·fundcheck·symbols·returns·lab·etf_monthly → 토 09:00
- bot.py(+commands·watchlist·tgfmt·inbox, big_events 호출) → 15분마다 · disclosures.py → 평일 08:10
- health.py 고장 감시 · keys.py 키 만료 09:00 · report_archive.py 지난 리포트 · themes.py 테마 사전 · all_stocks.py 종목 파일

기능·구역·스크립트를 더하거나 옮기면 같은 PR에서 이 지도도 고치기.
