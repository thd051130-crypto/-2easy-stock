# 코드 지도
자료 파일·예약 실행·키 이름·밖의 서비스·문서는 `docs/INFOMAP.md`. 지도가 맞는지 점검: `python tools/check.py map`.
지도로 파일 찾기 → `grep -n "function 이름" site/js/<파일>.js` → 그 줄부터 100~200줄만 읽기. 줄 번호는 대략(2026-11-20).
새로 뽑기: `grep -n "^// ------" site/js/*.js` (구역) · `grep -n "^/\*" site/style.css` (디자인)

## 흐름
Actions → 파이썬 → `paper/*.json` → pages.yml: `dashboard.py`(site/→_site/, data.json + learn.json·charts.json은 따로, 주소 v=내용 해시) + `stock_pages.py` + `industry_map.py` + `slim.py`(주석 빼기) → Pages. 뉴스만 live 브랜치 news.json.
`site/sw.js` 껍데기 바꾸면 `CACHE` 번호 올리기, 새 js 파일은 `APP_JS`에도. 점검은 `python tools/check.py` 하나로 (종류: map js test data ui diff shots, `--help`, 통과·안 바뀜이면 건너뜀). 함수 하나·JSON 모양만 보기: `python tools/peek.py`.

## site/js/ (앱 화면 코드, 2026-11-20 app.js에서 나눔)
`index.html`이 차례대로 부르는 파일 13개 + 그 화면을 열 때 받는 파일 6개(★, `core.js`의 `LAZY`).
화면 → 칸 목록은 `view.js` `VIEWS`, 버튼 연결은 `view.js` `render`, 도구 탭은 `more.js` `PERF_TABS`, 홈 더 보기는 `more.js` `homeMoreRows`, 홈 칸 순서·자리는 `more.js` `homeCards`(사용자 편집, localStorage home_layout).
여러 파일이 같이 쓰는 이름은 그냥 전역이에요(모듈 아님). 먼저 받는 파일이 ★ 파일 안의 것을 바로 부르면 안 돼요: 화면 두 곳 이상이 쓰는 건 먼저 받는 파일에 두기.
```
core.js     설정·주소 go/back/openStock/openMap·도우미 esc/money/pct·뉴스 저장·load·공부 자료 loadLearn·지수 일봉 loadCharts/chartsReady·나중에 받기 needJs/LAZY(~490)
view.js     움직임 drawIn/countUp·칸 오류 막기 paintCards/cardFail·VIEWS(~117)·화면 고정 keepTap/holdHeight/keepRow·render(~192)
watch.js    관심·전체 종목·조건 검색 watchCard/screenerCard/bindWatch
search.js   종목 이름 검색 scoreOf/loadSymbols(~108) · 문장 검색·테마 searchCard/findStocks/themeCard(~160)
inbox.js    메시지함·리포트·지난 리포트·주간 reportCards/pastCards/weeklyCards/inboxCard · 주간 점검 한 줄 healthLine
more.js     도구 탭 PERF_TABS · 홈 더 보기 homeMoreRows/moreView · 홈 화면 편집 HOME_ITEMS/homeCards/homeEditCard(주소 끝 edit) · 지금 뉴스·핫 뉴스 newsCard/hotCard
learn.js    투자 공부 learnView/learn*Cards/storyCard/bindLearn
chart.js    지수 차트 drawTrend/smaOf/rsiOf · 비교 차트 compareCard(~251) · 지수 칸 trendCard/maPanel(~559)
home.js     급락 점검 dropCard · 세계 지수 worldTicker/worldCard(~187) · 경기 macroCard·정책 policyCard · 공시 · 장 상황
            · 큰 발표 bigEventsCard(~458) · 일정 calendarCard/earningsCard(~534) · 히트맵·업종·급등락·수급(~657)
stock.js    종목 화면 stockHeadCard/bindStock/fundHtml · candleChart(~385)/chartGestures/lineChart
guide.js    처음 안내·사용법 guideShow/helpCard · 아래 메뉴 resetFolds · 설명 접기 foldNotes
tools.js    폭락 대비 stressCard(+RET/loadReturns) · 체크리스트 checkCard · 목표 goalCard(~246) · 자산 합계·시세 평가 AST/astSum/astEval/savPx(~315, 리포트의 목표 줄이 써서 여기)
main.js     서비스워커 등록 + 처음 그리기·자료 받기 (맨 마지막)
★map.js     산업 지도 mapLayout/mapSvg/mapCard/bindMap (지도 화면)
★savings.js 적립식 계산기 savingsCard/bindSavings (도구 화면)
★asset.js   자산 기록 assetCard/astTree/bindAsset · 날마다 기록(열쇠 "2026-11-22", 달 대표 astMonKey·새 날 astNewKey·이 달 기록 칩 data-ast-day) · 첫 기록 후 경과 astSinceLine · 펼친 달 요약 칸 그래프 astSumHtml(data-ast-sk) · 백업 파일 bkBox/bindBk/BK_KEYS(~200) · 배당 달력 divCalCard(~925) (도구 화면)
★divcalc.js 배당 계산기 divCalcCard/dcInfo/dcPlan/bindDivCalc · 국장/미장 구역·주기 이모지 dcFreqTag · 다음 배당락 dcNextEx · 최고점 대비·매수 신호 dcDD/dcBuyTag · 종목 창 dcPopOpen/dcPopHtml(가격·성장률 막대 dcBars·최근 배당, 종목 파일 divs) (도구 → 배당 계산기, 자산 기록 종목·asset.js 배당 달력 함수 씀)
★lab.js     실험실 labCard · 수익률 달력 retCalendarCard (도구 화면)
★feedback.js 의견 보내기 feedbackCard (의견 화면)
```

## site/style.css
1-120 색 토큰(다크 ~40·~74) · 265 아래 메뉴 · 283 홈(편집 .he-* ~896) · 411 종목 · 511 산업 지도 · 663 적립식 · 798 목표 · 861 큰 발표 · 895 핫 뉴스 · 942 세계 지수 · 968 일정 · 1051 주간 · 1111 실험실 · 1220 자산 기록 · ~1568 배당 계산기 .dc-*

## 파이썬 (만드는 것 · 언제)
- daily.py(+movers·sectors·quiet_volume·marketdata), flows.py, report_desks.py(+market_story·analyst_view, 뉴스팀은 live news.json 핫 뉴스, 연결 고리 원인 뉴스 market_story.causes_of), learn_cases.py, reading.py → daily.yml 국장 17:30·미장 07:30
- macro.py, econ_calendar.py, policies.py → macro.yml 06:50 · world.py → world.yml 07:05 · news.py → 30분마다
- weekly.py → 토 09:30 · fundamentals·fundcheck·symbols·returns·lab·etf_monthly → 토 09:00
- bot.py(+commands·watchlist·tgfmt·inbox, big_events 호출) → 15분마다 · disclosures.py → 평일 08:10
- health.py 고장 감시 · keys.py 키 만료 09:00 · report_archive.py 지난 리포트 · themes.py 테마 사전 · all_stocks.py 종목 파일
- ⏰ 정시 알람: GitHub 예약 실행이 몇 시간 늦어서 cloudflare/feedback-worker.js `JOBS` 표(5분마다)가 workflow_dispatch로 제시간에 돌림. 늦게 온 예약 실행은 sched-gate.yml이 건너뜀. cron 바꾸면 JOBS도 같이 (tests/test_alarm_worker.py)

기능·구역·스크립트를 더하거나 옮기면 같은 PR에서 이 지도도 고치기.
