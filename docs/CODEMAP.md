# 코드 지도 (CODEMAP)

코드를 고치기 전에 이 지도부터 보고, **필요한 곳만** 찾아 읽으세요. `site/app.js`(약 7,900줄)를 통째로 읽으면 크레딧을 많이 써요.

- 줄 번호는 2026-11-20 기준 **대략** 값이에요. 정확한 자리는 함수 이름으로 찾으세요:
  `grep -n "function assetCard" site/app.js` → 그 줄부터 `Read`(offset·limit)로 100~200줄만.
- app.js 구역 목록 새로 뽑기: `grep -n "^// ------" site/app.js`
- app.js 함수 목록 새로 뽑기: `grep -nE "^(async )?function |^const [A-Za-z_]+ = \(" site/app.js`

## 1. 전체 흐름

```
GitHub Actions(예약 실행) → 파이썬 스크립트 → paper/*.json (main 브랜치에 커밋)
  → pages.yml: dashboard.py가 site/ 를 _site/ 로 복사 + data.json 등 생성 + slim.py로 주석 빼기
  → GitHub Pages 배포 → 폰에서 site/app.js가 data.json 등을 읽어 화면을 그림
장중 뉴스만 예외: news.yml → live 브랜치 news.json (앱이 바로 읽음)
```

| 파일 | 하는 일 |
|---|---|
| `site/index.html` (100줄) | 껍데기, 대기화면, 아래 메뉴 버튼 |
| `site/app.js` (7,900줄) | 화면 전부. 아래 2장 |
| `site/style.css` (1,500줄) | 디자인. 아래 3장 |
| `site/casebook.js` | 투자 공부 사례집 과거 사건 14개 (자료만) |
| `site/sw.js` | 서비스워커 캐시 (`CACHE = "easystock-vN"`, 껍데기 파일 바꾸면 N 올리기) |
| `dashboard.py` | paper/*.json → `_site/data.json`, learn.json, inbox.json, themes.json 만들기 |
| `stock_pages.py` / `all_stocks.py` | 종목 화면 파일 `stocks/<시장>/<코드>.json` |
| `slim.py` | 배포본 app.js·css 주석 빼기 (원본은 그대로) |
| `tools/jump-audit.js` | "버튼 눌러도 화면 안 움직임" 자동 점검 (ui-audit.yml이 PR마다 돌림) |
| `tests/test_<스크립트>.py` | 파이썬 스크립트마다 하나. `python -m pytest tests/test_xxx.py` 로 고친 것만 |

## 2. site/app.js 지도

### 뼈대 (맨 앞 ~1–960)
| 무엇 | 함수·변수 | 줄 |
|---|---|---|
| 설정값 (차트 기간·보조지표·이동평균선·지수 버튼, localStorage 읽기) | `FRAMES`, `IND`, `MA_SET`, `CHART_IDX` | 1–50 |
| 화면 이름 목록, 한 겹 위 화면 | `SCREENS`, `LAYERS` | ~47 |
| 주소(#kr/chart) ↔ 화면 | `fromHash`, `hashFor`, `go`, `back`, `openMore`, `openStock` | 59–455 |
| 숫자 모양 도우미 | `$`, `esc`, `money`, `price`, `pct`, `num`, `md`, `remember` | 123–250 |
| 장중 뉴스·🔥 핫 뉴스 저장 | `NEWS`, `HOT`, `loadNews`, `saveHot`, `readHot`, `undoBar` | 251–330 |
| 처음 불러오기 (data.json, learn.json) | `load`, `fetchData`, `loadLearn` | 327–380 |
| 움직임 (그래프 그려지기, 숫자 올라가기) | `drawIn`, `playMotion`, `countUp` | 457–550 |
| **화면별 칸 목록** (어느 화면에 어떤 칸이 있는지) | `VIEWS` | ~552 |
| 화면 위치 고정 (누른 버튼 그 자리) | `keepTap`, `holdHeight`, `keepRow` | 578–645 |
| **그리기 + 버튼 연결** (화면마다 bind 호출) | `render` | ~647–880 |

`VIEWS`를 보면 화면 → 칸 함수가 바로 나와요:
- 홈: `worldTicker`, `bigEventsCard`, `marketStatusCard`, `worldHomeCard`, `homeMoreCard`, `homeReportCard`
- 리포트: `rpTabsBar` + `reportCards` / `weeklyCards` / `pastCards`
- 관심: `watchCard`, `screenerCard`, `allStocksCard`
- 도구: `perfTabsBar` + `PERF_TABS`(~2783)에서 고른 탭 하나
- 차트: `trendCard`, `compareCard`
- 종목: `stockHeadCard`, `stockChartCard`, `checkCard`, `discloseStockCard`, `stockSectorCard`, 수급·재무(나중에 채움)
- 검색 `searchCard` · 지도 `mapCard` · 메시지함 `inboxCard` · 세계 `worldCard` · 의견 `feedbackCard` · 사용법 `helpCard` · 더 보기 `moreView`

### 기능별
| 기능 | 주요 함수 | 줄 |
|---|---|---|
| 급락 점검 | `dropNow`, `dropCard`, `bindDrop` | 900–960 |
| 관심종목·전체 종목·조건 검색 | `watchCard`, `allStocksCard`, `screenerCard`, `bindWatch`, `starClicked`, `toggleWatch` | 964–1210 |
| 종목 이름 검색 (너그러운 검색, 초성) | `norm`, `chosung`, `queryTokens`, `scoreOf`, `loadSymbols` | 1211–1370 |
| 의견 보내기 | `FB_URL`, `feedbackCard`, `bindFeedback` | 1370–1450 |
| 메시지함 + 오늘의 리포트 + 지난 리포트 + 주간 | `loadInbox`, `inboxHandle`, `reportCards`, `rpTabsBar`, `pastCards`, `bindPast`, `weeklyCards`, `inboxCard`, `bindInbox` | 1450–1825 |
| 문장 검색 ('전력 관련 종목') · 테마 | `searchCard`, `findStocks`, `parseAsk`, `loadThemes`, `themeCard`, `bindSearch` | 1825–2100 |
| 산업 지도 | `loadMap`, `mapLayout`, `mapSvg`, `mapPaint`, `mapConstellation`, `mapWave`, `mapCard`, `mapDetailCard`, `bindMap`, `bindMapPinch` | 2100–2780 |
| 도구 탭 목록 | `PERF_TABS`, `perfTab`, `perfTabsBar` | 2783–2805 |
| 홈 '더 보기' 줄 (뉴스·공부·급락·일정·실적…) | `homeMoreRows`, `homeMoreCard`, `moreView` | 2806–2880 |
| 지금 뉴스·핫 뉴스 칸 | `newsLi`, `hotCard`, `hotGroups`, `newsCard` | 2880–2944 |
| 투자 공부 (오늘 왜·이유·대처법·용어집·사례 일지·전문가 리포트·공부 노트·연결 고리·사례집) | `learnView`, `learnWhyCards`, `learnDriverCards`, `learnCopeCards`, `learnTermCards`, `learnCaseCard`, `learnReadCards`, `learnNoteCard`, `storyCard`, `learnCaseCards`, `bindLearn`, `openTerm` | 2944–3760 |
| 지수 차트 (캔들·이동평균·보조지표) | `drawTrend`, `groupCandles`, `smaOf`, `bandsOf`, `rsiOf`, `trendCard`, `maPanel`, `bindMa`, `indChips` | 3764–4415 |
| 비교 차트 | `cmpItems`, `compareCard`, `drawCompare`, `compareChart`, `bindCompare` | 3943–4290 |
| 주간 점검 한 줄 | `healthLine` | ~4418 |
| 적립식 계산기 | `loadReturns`, `savSim`, `savingsCard`, `savOut`, `drawSavings`, `bindSavings` | 4439–5010 |
| 세계 지수 (바·홈 칸·화면) | `worldTicker`, `spinTicker`, `worldHomeCard`, `worldCard`, `drawWorldChart` | 5010–5156 |
| 경기 리포트 · 정책 | `macroCard`, `policyCard`, `sectorPolicies` | 5156–5270 |
| 공시 | `discloseStockCard`, `discloseHomeCard` | 5271–5299 |
| 장 상황 한 줄 | `marketStatus`, `marketStatusCard` | 5299–5336 |
| 큰 발표 칸 (홈 맨 위) | `bigCalRows`, `bigEventsCard` | 5336–5407 |
| 다가오는 일정 달력 · 실적·배당 | `CAL_DAYS`, `calNear`, `calendarCard`, `pinEcon`, `earningsCard` | 5402–5519 |
| 히트맵 · 업종 · 많이 움직인 종목 · 수급 · 거래량 | `heatmapCard`, `sectorsCard`, `moversCard`, `flowsCard`, `fillFlows`, `quietVolumeCard` | 5519–5725 |
| 종목 화면 (머리·차트·재무·가격 알림) | `stockData`, `stockHeadCard`, `stockChartCard`, `bindStock`, `drawStock`, `fillFund`, `fundHtml`, `alertBox` | 5725–6108 |
| 캔들 차트 그림·손가락 확대 / 선 그래프 | `candleChart`, `chartGestures`, `lineChart` | 6108–6510 |
| 처음 쓰는 사람 안내 · 사용법 화면 | `guideShow`, `guideMaybe`, `helpCard` | 6493–6655 |
| 아래 메뉴 누르면 펼친 칸 접기 | `resetFolds` | ~6654 |
| 작은 설명 글씨 접기 | `foldNotes` | 6698–6723 |
| 폭락 대비 점검 | `stressRun`, `stressCard`, `bindStress` | 6723–6787 |
| 사기 전 체크리스트 | `checks`, `checkCard`, `fillCheck` | 6787–6861 |
| 목표 | `goalCard`, `bindGoal`, `futureValue`, `goalLine` | 6861–6959 |
| 자산 기록 (증권사→계좌→종목, 달력, 사다리 그림) | `ast*` 도우미들, `assetCard`, `astGrid`, `astDetail`, `astRows`, `astTree`, `astChartHtml`, `bindAsset` | 6959–7534 |
| 포트폴리오 실험실 | `loadEtf`, `loadLab`, `labRun`, `labCard`, `labResults`, `bindLab` | 7534–7770 |
| 수익률 달력 | `dailyReturns`, `retCalendarCard`, `bindRetCal` | 7770–7870 |
| 시작 | `load()` 호출 | 맨 끝 |

### 앱이 받는 파일 (fetch)
`data.json`(홈·거의 전부) · `learn.json`(투자 공부) · `inbox.json`(메시지함) · `reports/index.json`, `reports/<날짜>`(지난 리포트) · `themes.json` · `industry.json` · `indexes/<지수>`(차트 지수) · `stocks/<시장>/<코드>.json`, `_quotes.json`(종목) · `symbols/<시장>.json`(검색) · `symbols/<시장>_returns.json`(적립식) · `symbols/lab.json`, `symbols/etfm/*`(실험실) · live 브랜치 `news.json`(뉴스)

## 3. site/style.css 지도
구역마다 `/* 이름 */` 주석이 있어요. `grep -n "^/\*" site/style.css` 로 찾아 그 부분만 읽기.
- 1–120: 색·글꼴 토큰(`:root`, 다크 모드는 ~40·~74) → 디자인 토큰은 여기만 바꾸기
- 123 메시지함 · 164 화면 크기 맞춤 · 185 대기화면 · 265 아래 메뉴 · 283 홈 카드 · 411/446 종목 화면 · 511–627 산업 지도 · 658 비교 차트 · 663/997 적립식 · 775 폭락 대비 · 784 체크리스트 · 798 목표 · 810 수익률 달력 · 835 정책 · 861 큰 발표 · 877 더 보기 · 895 핫 뉴스 · 942 세계 지수 · 968 일정 달력 · 1015 장 상황 · 1024 지수 바 · 1051 주간 리포트 · 1111 실험실 · 1220–1400 자산 기록

## 4. 파이썬 스크립트 (자료 만들기)

| 스크립트 | 만드는 것 | 언제 (workflow) |
|---|---|---|
| `daily.py` (+`movers.py`, `sectors.py`, `quiet_volume.py`, `marketdata.py`) | `paper/<시장>/daily.json` 시세·급등락·업종·캔들 | daily.yml 국장 17:30·미장 07:30 |
| `flows.py` | `paper/kr/flows.json` 외국인·기관 수급 | daily.yml |
| `report_desks.py` (+`market_story.py`, `analyst_view.py`) | `paper/report.json` 오늘의 리포트 5팀 | daily.yml |
| `report_archive.py` | 지난 리포트 보관함 (`reports/`) | report_desks.py·weekly.py·dashboard.py가 불러 씀 |
| `learn_cases.py` · `reading.py` | 사례 일지 · 증권사 리포트 목록 | daily.yml |
| `weekly.py` | `paper/weekly.json` 주간 리포트 | weekly.yml 토 09:30 |
| `macro.py` | `paper/macro.json` 경기 국면 | macro.yml 매일 06:50 |
| `econ_calendar.py` | `paper/calendar.json` 일정 달력 | macro.yml |
| `policies.py` | 정책·정책 뉴스 | macro.yml |
| `big_events.py` | `paper/events.json` 큰 발표·지수 급변 | bot.py(15분마다)·world.py·econ_calendar.py가 불러 씀 |
| `world.py` | `paper/world.json` 세계 지수·금리·국고채(ECOS) | world.yml 화~토 07:05 |
| `news.py` | live 브랜치 `news.json` | news.yml 30분마다 |
| `disclosures.py` | `paper/kr/disclosures.json` 공시(DART) | disclosures.yml 평일 08:10 |
| `fundamentals.py`, `fundcheck.py`, `symbols.py`, `returns.py`, `lab.py`, `etf_monthly.py` | 재무·종목 목록·수익률·실험실 자료 | fundamentals.yml 토 09:00 |
| `all_stocks.py`, `stock_pages.py` | 종목 화면 파일 | all-stocks.yml, pages.yml |
| `themes.py` | 테마 사전 100개 | pages.yml (dashboard.py가 themes.json) |
| `industry_map.py` | `industry.json` 산업 지도 | pages.yml |
| `bot.py` (+`commands.py`, `watchlist.py`, `tgfmt.py`, `inbox.py`) | 텔레그램 봇·관심종목·가격 알림·메시지함 저장 | telegram-bot.yml 15분마다 |
| `health.py` | 고장 감시·주간 점검 | 각 작업 실패 시, health.yml 일 10:00 |
| `keys.py` (+`api_keys.json`) | API 키 만료 알림 | keys.yml 매일 09:00 |
| `realtime_monitor.py` | KIS 실시간 시세 (보류) | kis-live-check.yml 수동 |
| `cloudflare/feedback-worker.js` | 의견 → 텔레그램 우체통 | 클라우드플레어 |

## 5. 이 지도 고치는 법
- 기능을 더하거나 옮기거나 이름을 바꾸면 **같은 PR에서** 이 파일의 그 줄도 고치기.
- 줄 번호가 조금 밀리는 건 괜찮아요(함수 이름으로 찾으니까). 구역이 크게 옮겨지거나 새 구역·새 스크립트가 생기면 고치기.
