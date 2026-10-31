# 이지스톡 데이터 공급자 교체 진단 (2026-10-31)

- 범위: **분석만**. 코드·브랜치·PR·설정·가입·결제 변경 없음.
- 기준 코드: `thd051130-crypto/-2easy-stock` main 최신 커밋 `d6627d6` (2026-10-31).
- 앞 문서: `docs/business/01-strategy-2026-10-31.md` (수익화 1차 진단).

## 표기 규칙

| 표시 | 뜻 |
|---|---|
| **[코드]** | 저장소 파일·함수를 직접 읽고 확인한 사실 |
| **[공식·발췌]** | 공급자 공식 사이트 문구. 단, 이 클라우드 환경은 tiingo.com·twelvedata.com·sec.gov·krx.co.kr·eoddata.com·opendart 접속이 막혀 있어 **검색엔진이 보여 준 공식 페이지 발췌로 확인**함. 계약 전 원문 재확인 필요 |
| **[2차]** | 공급자가 아닌 제3자 자료(패키지 설명·비교 사이트) |
| **[추정]** | 근거 있는 판단이지만 확인 안 됨 |
| **[확인 필요]** | 조사했지만 공식 원문을 못 봄. 사실로 쓰면 안 됨 |

---

## 0. 결론 먼저 (5줄)

1. **지금 이지스톡의 시세·재무·배당·환율·지수·종목 목록은 거의 전부 Yahoo(yfinance)** 이고, 14개 파일이 yfinance를 직접 불러요 [코드]. 이 데이터는 **공개 저장소(`paper/`)에 커밋되고 GitHub Pages에서 JSON으로 그대로 내려받을 수 있어** 사실상 "원본 재배포" 상태예요 [코드]. Yahoo 약관은 개인용 라이선스이고 상업적 이용은 서면 허락이 필요해요 [공식·발췌]. **→ 상업화 전 최대 위험.**
2. **월 5만 원(약 $37) 안에서 "상업적 재배포가 확인된" 주가 데이터는 찾지 못했어요.** Twelve Data는 한국거래소가 Pro($229/월, 약 31만 원)부터, Tiingo·EODData는 재배포가 **별도 문의/견적** [공식·발췌]. KRX·코스콤은 요금 비공개 [확인 필요].
3. **재무·공시·경제지표는 공공 API로 거의 바꿀 수 있어요.** 국내 OpenDART(재무·배당·공시)·ECOS(금리·환율), 미국 SEC EDGAR(재무, 공공 정보 재사용 가능 [공식·발췌])·FRED(일부 지표).
4. 그래서 추천은 **"공공 API 중심 + 미장 주가 범위 축소" (조합 1+5, 월 0원)** 로 먼저 옮기고, **Tiingo·EODData·KRX에 재배포 견적을 받은 뒤** 주가를 유료로 붙일지 정하는 순서예요.
5. 코드 구조상 **yfinance가 돌려주는 표(DataFrame) 모양을 그대로 내주는 Adapter 한 겹**만 만들면, 분석 엔진(daily·returns·report_desks…)과 프론트엔드(app.js)는 거의 안 고쳐도 돼요.

---

## 1. 현재 데이터 공급 구조

### 1-1. 공급자 전체 목록 [코드]

| 공급자 | 무엇 | 쓰는 파일 → 함수 | 방식 |
|---|---|---|---|
| **Yahoo Finance (yfinance)** | 일봉·월봉·5분봉, 재무, 배당·분할, 환율, 세계 지수·원자재·VIX·BTC, 종목 목록(스크리너), 업종, 애널리스트 목표가, 실적일·배당락일, 시가총액 | 아래 1-2 표 (14개 파일) | `yf.Ticker().history()`, `yf.download()`, `Ticker.info/.income_stmt/.quarterly_*/.calendar/.fast_info`, `YfData`, `EquityQuery/ETFQuery` |
| OpenDART | 공시 목록 | `disclosures.py` `fetch_day()` | REST, 키 `DART_API_KEY` |
| 한국은행 ECOS | 국고채 3년·10년 | `world.py` `ecos_get()`·`ecos_rates()` | REST, 키 `ECOS_API_KEY` |
| FRED | 미국 2년 금리·장단기차, 경제지표 실제값, 발표 일정 | `world.py` `fetch()`(DGS2·T10Y2Y), `macro.py` `fred()`·`us_economy()`, `big_events.py` `fred()`, `econ_calendar.py` `fetch_fred()` | 키 없는 CSV·HTML |
| 네이버 증권 (내부 JSON) | 외국인·기관 수급, ETF 한글 이름, 증권사 리서치 목록 | `flows.py` `fetch()`, `symbols.py` `naver_etf_names()`, `reading.py` `fetch()` | 비공식 JSON 수집 |
| 구글 뉴스 RSS | 사건 뉴스, 종목 이유 뉴스, 업종·정책 뉴스 | `news.py` `fetch()`, `movers.py` `google_news()`, `sectors.py`, `policies.py` `fetch_news()` | RSS |
| faireconomy.media (ForexFactory 계열) | 이번 주 큰 발표 일정·예상치 | `big_events.py` `fetch_ff()` | JSON 파일 |
| 연준·한국은행 홈페이지 | FOMC·금통위 일정표 | `econ_calendar.py` `fetch()` | HTML |
| 한국투자증권 KIS | 실시간 체결가 (수동 실행 시험용) | `realtime_monitor.py` | WebSocket (지금 앱 데이터엔 안 씀) |
| 텔레그램·GitHub API | 알림, 실행 기록 | `bot.py`, `health.py` | 데이터 공급자 아님 |

### 1-2. Yahoo / yfinance 사용 위치 (전수) [코드]

| 파일 → 함수 | 받는 것 | 수정주가 | 결과 파일 |
|---|---|---|---|
| `marketdata.py` `download()` | 기본 종목 일봉(시·종·거래량) + 지수 | `auto_adjust=True` | `data/<시장>_daily_recent.csv` |
| `daily.py` `index_candles()` | 지수 일봉 캔들 + 거래량 | `False` | `paper/<시장>/daily.json` `candles` |
| `daily.py` `usdkrw()` | 원/달러 `KRW=X` | — | `daily.json` `usdkrw` |
| `stock_pages.py` `daily()` | 대시보드 종목·관심종목 상장일부터 일봉(`period="max"`), 세계 지수 일봉 | `False` | `_site/stocks/<시장>/<코드>.json`, `_site/indexes/<기호>.json` |
| `all_stocks.py` `download()` | 전 종목(국장 약 4천·미장 약 5천) 2년 일봉 + 전체 월봉 | `False` | 아티팩트 → `_site/stocks/<시장>/*.json`, `_quotes.json` |
| `returns.py` `fetch()` | 전 종목 월봉 + `Dividends` + `Adj Close` | `False`(둘 다 받음) | `paper/symbols/<시장>_returns.json` |
| `etf_monthly.py` `build()` (`returns.fetch` 재사용) | ETF 전부 월 수익률 | 수정 종가 | `paper/symbols/etfm/<시장>-<n>.json` |
| `lab.py` `fetch()` | 실험실 기본 자산 17개 월봉 | `True` | `paper/symbols/lab.json` |
| `fundamentals.py` `fetch()` | `info`(PER·PBR·시총·배당률·목표가·추천·실적일·배당락일), `income_stmt`, `quarterly_income_stmt`, `quarterly_balance_sheet`, `fast_info` | — | `paper/<시장>/fundamentals.json` |
| `fundcheck.py` `fetch_info()`, `next_earnings()` | ROE·부채비율·이익률, 실적일 | — | 리포트·봇 |
| `sectors.py` `fetch_industry()` | 업종(industry) | — | `paper/sectors.json` |
| `symbols.py` `screen()`·`fetch()` | 국장·미장 전 종목·ETF 목록 | — | `paper/symbols/<시장>.json` |
| `industry_map.py` `download()`, `download_caps()` | 테마 대표 종목 일봉, 시가총액 | `True` | `_site/industry.json` |
| `world.py` `fetch()` | 세계 지수 13개, 환율 5개, `^TNX`, TLT·CL=F·GC=F·HG=F·VNQ·VIX·BTC 등 | `True` | `paper/world.json` |
| `macro.py` `fetch()` | ^TNX·^IRX·CL=F·KRW=X·HYG·IEF·HG=F·GC=F·VIX | `True` | `paper/macro.json` |
| `big_events.py` `intraday()` | 선물·코스피 **5분봉** (급변 감지) | `False` | `paper/events.json` |
| `bot.py` `yahoo_last_price()`, `yahoo_intraday()` | 5일 일봉, **5분봉** (가격 알림) | `False` | 텔레그램 |
| `commands.py` `history()` | 2년 일봉 (봇 '종목' 진단) | `True` | 텔레그램 |

> 수정주가 기준이 파일마다 다름(`True`/`False`). 새 공급자는 **원래 가격과 수정 가격(또는 분할·배당 정보)을 둘 다** 줘야 지금 화면이 그대로 유지돼요.

### 1-3. 항목별 수집 위치 요약 [코드]

| 항목 | 위치 |
|---|---|
| 주가·거래량 | `marketdata.download`, `daily.index_candles`, `stock_pages.daily`, `all_stocks.download`, `returns.fetch`, `lab.fetch`, `industry_map.download`, `bot.yahoo_*`, `big_events.intraday`, `commands.history` |
| 재무제표 | `fundamentals.fetch` (Yahoo `income_stmt` 연 4년·분기, `quarterly_balance_sheet` 자본), `fundcheck.fetch_info`. **DART 재무는 안 씀** |
| 배당·기업행사 | `returns.fetch`(월봉 `Dividends`, 최근 12개월 배당 달·금액), `fundamentals.events()`(배당락일 `exDividendDate`, 지급일, 실적일), 분할은 Yahoo 가격 반영에만 의존 |
| 환율·경제지표 | `world.fetch`(Yahoo 환율·금리 + FRED DGS2·T10Y2Y + ECOS 국고채), `macro.fetch`·`macro.us_economy`(FRED), `daily.usdkrw`, `big_events.fred` |
| 뉴스·공시 | 뉴스 `news.py`·`movers.google_news`·`sectors`·`policies.fetch_news`(구글 RSS), 리서치 `reading.fetch`(네이버), 공시 `disclosures.fetch_day`(DART) |
| 수급 | `flows.fetch` (네이버 `m.stock.naver.com/api/stock/<코드>/trend`) |

> 참고: `paper/kr/disclosures.json`은 현재 main에 없어요(워크플로는 2026-10-30에도 성공 실행). 공시가 없는 날엔 파일을 안 남기는 구조로 보이지만 **[확인 필요]**.

### 1-4. 갱신 주기 (GitHub Actions) [코드: `.github/workflows/*.yml`]

| 워크플로 | 때 (KST) | 하는 일 |
|---|---|---|
| `all-stocks` | 평일 16:20(국장), 06:20(미장) | 전 종목 일봉·월봉 → 아티팩트(7일 보관) |
| `daily` | 평일 17:30(국장), 07:30(미장) | daily → flows → report_desks → learn_cases → reading, `paper/` 커밋 |
| `world` | 07:05, 16:10 | 세계 지수 |
| `macro` | 매일 06:50 | macro, econ_calendar, policies 뉴스 |
| `news` | 30분마다 | 구글 뉴스 → `live` 브랜치 `news.json` (force push) |
| `telegram-bot` | 15분마다 | 봇 명령, 가격 알림(5분봉), 큰 발표 |
| `disclosures` | 평일 08:10~19:10 매시 | DART 공시 |
| `fundamentals` | 토 09:00 | fundamentals → symbols → sectors → returns → lab → etf_monthly |
| `weekly`·`health` | 토 09:30, 일 10:00 | 주간 리포트, 점검 |
| `pages` | 다른 작업 뒤 | dashboard → stock_pages → industry_map → Pages 배포 |

호출 방식: yfinance는 종목마다 0.3~1.5초 쉬고 재시도(`marketdata.download` 지수 백오프), 전 종목은 묶음 `yf.download`. 못 받으면 **지난번 값 유지**(fundamentals·returns·flows 공통).

### 1-5. 저장 경로와 JSON 구조 [코드: 실제 파일 열어 확인]

| 파일 | 구조 (요약) |
|---|---|
| `paper/<시장>/daily.json` | `{market, day, index, breadth, series{dates,close,ma50,ma200}, movers{up,down}, quiet_volume, sectors[], sector_of{}, usdkrw, candles{dates,o,h,l,c,v,monthly}, stocks[{code,name,day,close,d1,spark[60],ma200,rsi14,hi52}], generated}` |
| `paper/<시장>/fundamentals.json` | `{updated, stocks{코드:{code,name,asof,currency,per,loss,fwd_per,pbr,cap,div,roe,debt,financial,sector,grade{},annual{dates,revenue,op,net},quarterly{},target{mean,high,low,n,rec,score},events{exdiv,paydiv,div_rate,div_last,earn}}}}` |
| `paper/kr/flows.json` | `{updated, day, stocks{코드:{name,dates,frg,inst,ind,close,hold,sum}}}` |
| `paper/world.json` | `{updated, groups[{name, items[{sym,name,kind,day,last,d1,w1,m1,y1,closes[]}]}]}` |
| `paper/symbols/<시장>.json` | `{updated, rows[[코드, 이름, KS/KQ/'', s/e, 다른이름|…]]}` (국장 4,185줄) |
| `paper/symbols/<시장>_returns.json` | `{updated, s{코드:[시작연월, 연상승률%, 배당률%, MDD%, 년수, 위기3개[[낙폭,회복개월]], 배당달[[월,금액]]]}, idx, crises}` |
| `paper/symbols/lab.json` | `{updated, months[], assets[{k,name,sym,cur,note,start,r[]}], fx[]}` |
| `paper/symbols/etfm/<시장>-<n>.json` | `코드 → [시작연월, [월수익률%…]]` |
| `paper/macro.json`, `events.json`, `calendar.json`, `sectors.json`, `reading.json`, `report.json`, `weekly.json` | 보고서·일정용 가공 자료 |
| `_site/stocks/<시장>/<코드>.json` (배포 때 생성) | `candles`(상장일부터 일봉 OHLCV) + `fund` + `flows` |
| `_site/data.json` | `dashboard.build()`가 위 파일을 모두 합친 것 (`markets{kr,us}{daily,extras,alerts,funds,flows,disclosures}`, `world`, `macro`, `report`…) |

**메타데이터 현황** [코드]: 파일마다 `updated`(=collected_at 비슷), `day`(=reference_date), fundamentals 종목별 `asof`·`currency`는 있음. **`source`·`adjustment`·`license_status`·`data_status`는 어디에도 없음** (`reading.json`만 `source` 있음).

**중요** [코드]: `paper/` 아래 103개 파일이 공개 저장소에 커밋돼 있고(최근 1주 `daily.json`만 6번 커밋), 배포 사이트도 `stocks/<시장>/<코드>.json`·`symbols/*.json`을 누구나 내려받을 수 있게 둬요. → **어떤 공급자로 바꿔도 "웹 표시"가 아니라 "원본 재배포" 조건을 확인해야 함.**

### 1-6. 프론트엔드가 읽는 방식 [코드: `site/app.js`]

| 함수 | 읽는 파일 |
|---|---|
| `load()` (318행) | `data.json` (홈·리포트·관심 등 대부분) |
| `loadNews()` (248행) | `raw.githubusercontent.com/<repo>/live/news.json` |
| `loadQuotes()` (1024행) | `stocks/<시장>/_quotes.json` (조건 검색 전 종목) |
| 종목 화면 (5240행) | `stocks/<시장>/<코드>.json` |
| `loadSymbols()` (1295행) | `symbols/<시장>.json` |
| `loadReturns()` (3992행) | `symbols/<시장>_returns.json` (적립식 계산기) |
| `loadEtf()` (6324행), 6352행 | `symbols/etfm/*.json`, `symbols/lab.json` (실험실) |
| 3825행 | `indexes/<기호>.json` (차트 지수 버튼) |
| `loadThemes()`, `loadMap()`, `loadInbox()` | `themes.json`, `industry.json`, `inbox.json` |

앱은 **공급자 이름을 모르고 JSON 모양만 알아요** → JSON 모양을 유지하면 프론트는 그대로. 다만 화면 안내 문구에 "야후" 글자가 여러 곳(index.html 35행, app.js 4016·5398·5509·5523·5526·5539·6463·6621행 등) 있어 문구 수정은 필요해요.

---

## 2. 공급자별 데이터 사용 현황 (지금 → 바꿀 후보)

| 데이터 | 지금 | 국장 후보 | 미장 후보 |
|---|---|---|---|
| 일봉 OHLCV | Yahoo | 금융위 주식시세정보(공공데이터포털), KRX Open API, KRX·코스콤 계약 | Tiingo, EODData, Twelve Data |
| 수정주가·분할·배당 | Yahoo | 직접 계산 필요(공공 시세는 원가격) [추정] | Tiingo EOD(분할·배당 반영 제공 [2차]) |
| 재무제표 | Yahoo | **OpenDART** | **SEC EDGAR** |
| PER·PBR·시총 | Yahoo `info` | 시세(시총) + DART(순이익·자본) 계산 | 시세 + EDGAR 계산 |
| 배당 금액 | Yahoo | OpenDART(배당 사항) [확인 필요: API 항목] | Tiingo(divCash) [2차] / EDGAR |
| 배당락일·실적 발표일 | Yahoo `info` | 대체 공공 소스 [확인 필요] | 대체 공공 소스 없음 [추정] |
| 애널리스트 목표가 | Yahoo `info` | **대체 없음** | **대체 없음** (유료 공급자 별도 상품 [확인 필요]) |
| 환율 | Yahoo `KRW=X` | ECOS 원/달러 | FRED DEXKOUS [확인 필요: 이용 조건] |
| 금리 | Yahoo ^TNX + FRED + ECOS | ECOS | FRED |
| 세계 지수·원자재·VIX·BTC | Yahoo | — | 지수 사업자 라이선스 영역 [확인 필요] |
| 종목 목록 | Yahoo 스크리너 + 네이버 | 금융위 KRX상장종목정보(무료 [공식·발췌]) | SEC `company_tickers` (ETF 빠짐 [추정]) / 유료 공급자 목록 |
| 업종 | Yahoo industry | KRX 업종 [확인 필요] | SEC SIC 코드 [추정] |
| 수급 | 네이버 | KRX 투자자별 매매 [확인 필요] | — |
| 공시 | DART | 그대로 | EDGAR submissions |
| 5분봉 | Yahoo | 일봉 범위 밖 (가격 알림·급변 알림 영향) | 동일 |

---

## 3. 공급자별 라이선스 분석

> "무료 API" ≠ "상업적 재배포 허용". 아래 '웹 표시'는 방문자 화면에 보여 주기, '재배포'는 JSON 등 원본을 내려받게 두기, '파생'은 계산한 지표 공개.

### 국내

| 항목 | OpenDART | KRX (정보데이터시스템·Open API) | 코스콤 | 한국은행 ECOS |
|---|---|---|---|---|
| 제공 데이터 | 공시 목록·원문, 재무제표, 배당·주식총수 등 정기보고서 항목 (API 83종 [2차]) | 일별 시세, 지수, 상장종목, 투자자별 매매 등. 전 영업일까지 [2차] | 실시간·과거 시세, 참조·수급 데이터 [2차: 보도] | 금리·환율·물가 등 경제 통계 |
| API | 있음, 무료 키 [2차] | Open API 있음. **키 발급 뒤 서비스별 신청·담당자 승인 필요** [2차] | 핀테크 오픈API 플랫폼(증권사·핀테크 대상) [2차] | 있음, 무료 키 (이미 사용 중) |
| 비용 | 무료 | Open API 무료 [2차]. 정보사업자 계약 요금 **[확인 필요]** | **비공개 [확인 필요]** | 무료 (공공데이터포털 표기 [공식·발췌]) |
| 상업적 이용 | **[확인 필요]** (공공데이터라 허용 가능성 높음 [추정]) | Open API: **비상업(개인 연구·투자)만** [2차]. 상업 재제공은 정보사업자 계약 영역 [공식·발췌: 2016 정보이용정책] | 계약 [추정] | 공공데이터포털 '이용허락범위 제한 없음' [공식·발췌]. ECOS 자체 약관 원문 **[확인 필요]** |
| 웹 표시 | [확인 필요] | 홈페이지 데이터는 **사전 허락 없이 복제·배포·공표 금지** [공식·발췌: KRX 면책 고지] | 계약 조건 [확인 필요] | 출처 표시 조건 가능성 [확인 필요] |
| 재배포 | [확인 필요] | 원천 데이터 제3자 재배포 금지 [2차] | [확인 필요] | [확인 필요] |
| 파생 데이터 | [확인 필요] (공시 기반 계산은 일반적으로 문제 적음 [추정]) | 가공 표출 시 출처 "한국거래소 통계정보" 표기 [2차] | [확인 필요] | [확인 필요] |
| 제한 | 일일 호출 한도 **[확인 필요]** | 키당 하루 10,000회 [2차] | — | [확인 필요] |
| 교체 난이도 | **낮음**(공시는 이미 사용) / 재무는 중간 | 중간(승인 절차) | 높음(계약) | **낮음**(이미 사용) |
| 추천 순위 | **1** | 3 (견적·계약 대상) | 4 (견적 대상) | **1** |

**추가 후보 (요청 목록 밖, 국장 시세에 중요):** 금융위원회 **주식시세정보 API**(공공데이터포털 15094808): 무료, 개발계정 트래픽 10,000, **하루 1번, 기준일 다음 영업일 13시 이후 갱신** [공식·발췌]. 이용허락범위 칸은 확인 못 함 **[확인 필요]**. KRX상장종목정보(15094775)는 무료 [공식·발췌]. → 국장 공공 시세 1순위 후보지만, **이용허락범위 확인이 먼저**이고 **갱신이 하루 늦음**.

### 미국

| 항목 | SEC EDGAR | Tiingo | EODData | Twelve Data |
|---|---|---|---|---|
| 제공 데이터 | 공시(submissions), XBRL 재무(companyfacts·frames). **주가 없음** | 미국 주식·ETF 10만 종 이상 EOD(1962년부터, 분할·배당 반영) [2차], 뉴스·재무(별도) | 거래소별 EOD | 주가·지수·환율, 재무, **한국거래소(XKRX)도 있음** [공식·발췌] |
| API | data.sec.gov REST(JSON), 키 없음 [공식·발췌] | REST | 데이터 피드·API | REST·WebSocket |
| 비용 | 무료 [공식·발췌] | 공식 요금 못 봄. 비교 사이트: 개인 Power 연 $300, 사업 연 $499 [2차, 오래됐을 수 있음] | 상업 피드 **견적제**, 예전 예시 AMEX·NASDAQ·NYSE 월 $750 [공식·발췌, 오래된 페이지] | Grow $79/월, Pro $229/월, Ultra $999/월 (연결제 17% 할인) [공식·발췌]. 예전 가격 $29·$99·$329가 아직 퍼져 있음 |
| 상업적 이용 | 공공 정보, 무료로 접근·재사용 가능 [공식·발췌: Webmaster FAQ] | Commercial 플랜 = **내부 상업 이용만** [공식·발췌: 문서] | 내부 사업용도 상업 라이선스 필요 [공식·발췌] | 비가격 데이터는 내부 이용·표시 가능(애드온 제외) [공식·발췌]. **가격 데이터 표시 조건 [확인 필요]** |
| 웹 표시 | 가능 [공식·발췌] | **앱·웹사이트 재배포는 메일로 별도 문의** [공식·발췌] | 차트 등 **재게시·재배포는 상업 라이선스 필요** [공식·발췌] | [확인 필요] |
| 재배포 | 가능 (XBRL 원문은 공공) [공식·발췌] | 모든 플랜 금지, 별도 계약 [공식·발췌] | 상업 라이선스 [공식·발췌] | 외부 재배포는 별도 계약 [공식·발췌] |
| 파생 데이터 | 가능 [추정] | [확인 필요] | [확인 필요] | [확인 필요] |
| 제한 | **초당 10회**, User-Agent에 회사명·메일 선언 [공식·발췌] | 시간·월 종목 수 한도 [확인 필요] | — | 플랜별 크레딧 [확인 필요]. XKRX는 Pro부터 [공식·발췌: 거래소 목록] |
| 교체 난이도 | 중간 (XBRL 태그 정리) | 낮음~중간 (EOD 모양이 Yahoo와 비슷) | 중간 | 낮음~중간 |
| 추천 순위 | **1** (미장 재무) | **2** (미장 주가 견적 1순위) | 3 (견적 대상) | 4 (예산 초과, 재배포 미확인) |

**흥미로운 예외** [공식·발췌, Tiingo 문서]: "**사용자가 각자 자기 Tiingo 토큰을 넣는** 소프트웨어이고 그 소프트웨어가 Tiingo 데이터를 배포하지 않으면 문의 불필요". → 미장 차트를 "내 키 넣기" 방식으로 둘 수 있음. 단 브라우저에서 바로 부를 수 있는지(CORS)·사용자 불편 **[확인 필요]**.

### 지금 쓰는 비(非)목록 공급자 위험 (참고)

| 공급자 | 위험 |
|---|---|
| **Yahoo** | Yahoo 약관: 서비스 이용 목적의 **개인·취소 가능 라이선스**, 서면 허락 없는 상업적 이용 금지, 대량 접근 제한 [공식·발췌: legal.yahoo.com]. yfinance README: "Yahoo API는 개인용", Yahoo와 무관 [2차: README]. **→ 공개 저장소·사이트로 원본을 내보내는 지금 구조는 상업화 이전에도 위험** [추정] |
| 네이버 내부 JSON | 자동 수집 금지 약관·DB권 판례 보도 (01 문서) |
| 구글 뉴스 RSS | 비상업 성격 [확인 필요] |
| faireconomy | 비공식 피드 [확인 필요] |
| FRED | FRED 자체는 공공이지만 **시리즈마다 원 저작권자 조건이 다름**(예: 지수·VIX) [확인 필요] |

---

## 4. 공급자별 가격 및 견적 현황

| 공급자 | 공개 가격 | 원화 (1달러=1,350원 가정) | 5만 원 안? | 상태 |
|---|---|---|---|---|
| OpenDART·ECOS·SEC EDGAR·공공데이터포털 | 무료 | 0원 | ✅ | 약관 원문 확인만 |
| KRX Open API | 무료 [2차] | 0원 | ✅ (단 비상업) | 상업 불가로 봐야 함 |
| KRX 정보사업자 계약 | 비공개 | — | ? | **견적 필요** |
| 코스콤 | 비공개 | — | ? | **견적 필요** |
| Tiingo | 공식 못 봄 (비교 사이트 연 $300~$499) | 월 약 3.4만~5.6만 원 | 내부용은 근처, **재배포는 별도** | **재배포 견적 필요** |
| EODData | 견적제 (예전 예시 월 $750) | 약 100만 원 | ❌ (예시 기준) | 견적 필요 |
| Twelve Data Grow | $79/월 | 약 10.7만 원 | ❌ | 한국 없음 [공식·발췌] |
| Twelve Data Pro | $229/월 | 약 31만 원 | ❌ | 한국 포함, 재배포 별도 |

가격이 공개되지 않은 곳은 **추정하지 않았어요.**

---

## 5. 기존 기능 영향 분석

범례: ① 그대로 사용 ② 형식 변경 ③ 계산 로직 수정 ④ 작동 안 할 위험

| 기능 (관련 파일) | ① 그대로 | ② 형식 변경 | ③ 계산 수정 | ④ 위험 |
|---|---|---|---|---|
| **종목 상세** (`stock_pages.py`, app.js 종목 화면) | 화면·JSON(`candles`,`fund`,`flows`) 모양 | 공급자 응답 → `o,h,l,c,v` | 원가격 기준 유지(공공 시세는 원가격이라 맞음 [추정]) | **상장일부터 전체 일봉(`period="max"`)**: 공공 시세 시작 시점이 짧으면 오래된 차트 사라짐 [확인 필요]. 목표가 칸 대체 없음 |
| **재무제표** (`fundamentals.py`, `fundcheck.py`) | `annual{dates,revenue,op,net}`·`grade` 모양 | DART 계정명(매출액·영업이익·당기순이익)·EDGAR 태그(Revenues 등) → 같은 키 | PER·PBR·ROE·부채비율 직접 계산 (지금도 국장은 일부 직접 계산) | 금융업 계정 차이, 미국 회사마다 XBRL 태그가 달라 빈칸 [추정]. **목표가·투자의견·forward PER 대체 없음** |
| **기업 비교** (비교 차트, `industry_map.py`) | 비교 화면 로직 | 종목 일봉 공급원 | 시가총액(지도 점 크기) 계산 원천 변경 | 세계 지수 비교 대상(니케이·DAX 등)은 라이선스 공백 |
| **ETF 분석** (`etf_monthly.py`, `lab.py`, `symbols.py`) | 앱 실험실 계산 | ETF 목록 원천(국장: 금융위 증권상품시세 [확인 필요], 미장: SEC 목록엔 ETF 빠짐 [추정]) | **분배금 다시 넣은 수정 종가**를 직접 만들거나 공급자에서 받아야 | 미장 ETF 5,600개·20년 월 수익률: 무료 공공 소스 없음 → 유료 없으면 축소 |
| **배당 분석** (`returns.py` 배당률·배당 달, `fundamentals.events`) | 계산기 공식 | 배당 금액·날짜 원천(DART 배당 사항, Tiingo divCash) | 10년 배당률 = 배당 이력 필요 | 국장 **배당락일** 공공 소스 [확인 필요]. 미장 배당 이력은 유료 필요 [추정] |
| **차트** (app.js, `daily.index_candles`, `indexes/`) | 그리기·MA 설정·기간 버튼 | OHLCV 원천 | 없음 | 세계 지수 버튼(`^N225`, `^GDAXI` 등) 라이선스 공백 → 축소 후보 |
| **기술적 지표** (RSI·200일선·52주 고점: `daily.screen_stats`, `all_stocks.quote`, 앱 이동평균) | 계산식 그대로 | 입력 종가만 교체 | 수정/원가격 기준 통일 필요 (지금도 섞임) | 분할 반영 늦으면 가짜 급락 → **이상값 검사 필수** |
| **투자 계산** (적립식 계산기 `returns.py`, 실험실 `lab.py`, 폭락 대비 `crises`) | 앱 계산 | 월봉 원천 | 수정 종가·배당 직접 계산(공공 시세 쓸 때) | **2008 금융위기 낙폭·회복**은 2008년 이전 자료가 필요. 공공 시세 시작 연도 [확인 필요]. 원/달러 월 변화(lab `fx`)는 ECOS로 가능 [추정] |
| **뉴스·공시** (`news.py`, `disclosures.py`, `movers.py`) | 공시는 DART 그대로 | 미국 공시 넣으면 EDGAR 형식 추가 | 없음 | 뉴스(구글 RSS)·리서치(네이버)는 이번 목록 공급자로 대체 불가 → 별도 검토 |
| **검색·종목 목록** (`symbols.py`, `themes.py`, app.js 검색) | 줄 형식 `[코드,이름,시장,종류,다른이름]` | 원천 목록 → 같은 줄 | 시가총액 순 정렬 원천 변경(`wide_kr`·`wide_us` 상위 200·150) | ETF 한글 이름(지금 네이버), 미장 ETF 목록 |
| **그 외 영향** | — | — | — | **가격 알림·급변 알림(5분봉, `bot.py`, `big_events.py`)**: 일봉 공급자로는 불가 → 끄거나 '종가 기준 알림'으로 바뀜. **세계 지수·원자재·VIX·BTC(`world.py`, `macro.py` 경기 경고 7개 중 5개가 Yahoo)**: FRED 대체 가능 여부 시리즈별 [확인 필요]. **국장 리포트 17:30**: 공공 시세(다음 영업일 13시)로 바꾸면 **하루 늦은 리포트**가 됨 |

**기능 삭제 없이 유지하려면** 위 ④ 중 "대체 없음"(목표가, 5분봉 알림, 해외 지수)은 **(가) 유료 계약 (나) 개인용 별도 모드 (다) 표시 축소** 중 사용자 결정이 필요해요(11장).

---

## 6. 권장 데이터 공급 아키텍처

### 6-1. 제안 구조 평가

```
공급자 → 공급자별 Adapter → 검증·정규화 → 통합 저장소 → 기존 분석 엔진 → GitHub Pages
```

- **적합.** 단, 지금 저장소에 맞추면 "통합 저장소"는 새 DB가 아니라 **지금의 `paper/*.json` + `data/*.csv` 그대로**가 맞아요. 분석 엔진(daily·returns·report_desks…)은 이미 이 파일만 읽어요 [코드].
- 실제로 새로 필요한 건 **Adapter 한 겹 + 검증 한 겹 + 메타 블록**뿐이에요.

### 6-2. 최소 변경 지점 [코드 근거]

지금 yfinance 호출은 두 모양뿐이에요.
1. `yf.Ticker(sym).history(start|period, interval, auto_adjust)` → 9곳
2. `yf.download(list, interval, period, auto_adjust, actions)` → 5곳 (+ `info`·재무표·스크리너)

→ 새 파일 하나(예: `prices.py`)에 아래 함수를 두고, **yfinance와 똑같은 DataFrame 열**(`Open, High, Low, Close, Volume, Adj Close, Dividends, Stock Splits`, 날짜 인덱스)로 돌려주면 14개 파일은 `import` 한 줄과 호출 한 줄만 바뀌어요.

| 함수 (설계안) | 대체하는 것 |
|---|---|
| `history(symbol, start=None, period=None, interval="1d", adjusted=False)` | `Ticker().history()` |
| `download(symbols, interval, period, adjusted, actions)` | `yf.download()` |
| `fundamentals(market, code)` → 지금 `summarize()`가 받는 `info/annual/quarterly/equity` 모양 | `fundamentals.fetch()` 안 |
| `listing(market)` → `[코드,이름,시장,종류,다른이름]` | `symbols.fetch()` |
| `fx(pair, start)`, `rate(name, start)` | `KRW=X`, `^TNX` 등 |

기호 번역표(예: `005930.KS` → 국장 코드, `KRW=X` → ECOS 통계코드, `^TNX` → FRED `DGS10`)는 Adapter 안에 둬요. 앱 쪽 기호(`world.json`의 `sym`)는 그대로 둬야 app.js의 `wItem("KRW=X")` 같은 곳을 안 고쳐요.

### 6-3. 검증·정규화 (새로)

- 0·음수 가격, 하루 ±30% 넘는 대형주, 분할 의심, 날짜 빠짐, 거래량 0 연속 → `data_status: "check"`.
- 공급자 두 곳이 겹치는 기간엔 종가 차이 비교(교체 검증 때).
- 지금 `health.check_data()`(대형주 30% 이상 비면 중단)가 있으니 거기에 붙이면 돼요 [코드].

### 6-4. 메타 필드 관리 가능 여부

| 필드 | 지금 | 넣을 곳 (제안) |
|---|---|---|
| source | ❌ (reading.json만) | 각 JSON 맨 위 `meta.source` (`"opendart"`, `"krx-public"`, `"tiingo"` …), 종목별 공급원이 섞이면 종목 줄에 `src` |
| reference_date | △ `day`, `asof` | `meta.reference_date` (기존 `day` 유지) |
| collected_at | △ `updated`/`generated` | `meta.collected_at` (기존 키 유지) |
| currency | △ fundamentals만 | `meta.currency` 또는 종목별 |
| adjustment | ❌ | `"raw"` / `"split"` / `"split+div"` — 지금 섞여 있어 꼭 필요 |
| license_status | ❌ | `"public"`, `"licensed-display"`, `"personal-only"`, `"unknown"` |
| data_status | ❌ | `"ok"`, `"stale"`(지난번 값 유지), `"check"` |

**파일 단위 `meta` 블록 하나**로 두면 앱은 기존 키를 그대로 읽고(무시), 하단에 출처·기준일 표시만 추가하면 돼요. 종목 줄마다 넣으면 파일이 커져서(국장 4천 종목) 권하지 않아요.

### 6-5. 공개 범위 (구조상 꼭 필요한 변경)

- 공개 저장소에 원본 시세·재무 커밋 → **라이선스 공급자로 바꾸면 계속할 수 없음** [추정: 대부분 재배포 금지]. 원본은 Actions 아티팩트나 비공개 저장소에, 공개 쪽엔 **화면에 필요한 가공본만**.
- GitHub Pages도 JSON을 그대로 내려주므로, 계약 시 "정적 사이트에서 브라우저가 받는 JSON"이 허용되는지 **반드시 질문** (10장).
- GitHub Pages 상업 SaaS 금지 문제는 01 문서 D3 참고.

---

## 7. 월 5만 원 예산별 조합 비교

| 조합 | 예상 월 비용 | 상업적 이용 | 데이터 품질 | 갱신 안정성 | 유지보수 | 확장성 |
|---|---|---|---|---|---|---|
| **1. 공공 API 중심** (국장: 금융위 시세·DART·ECOS / 미장: EDGAR·FRED, 미장 주가 없음) | **0원** | 국장 시세 이용허락범위 [확인 필요], 나머지 높음 | 재무는 원본이라 오히려 좋아짐. 시세는 원가격만, 수정주가 직접 계산 | 공공 API는 안정적 [추정]. 국장 시세 **하루 늦음** | 중간 (계정 매핑·수정주가 계산) | 사용자 늘어도 비용 0, 정적 파일이라 호출량 영향 없음 |
| **2. 국장 주가 유료 + 미국 공공** (KRX·코스콤 계약) | **견적 전 알 수 없음** | 계약하면 높음 | 높음 | 높음 | 중간 | 정보사업자 요금이 가입자 수 연동일 가능성 [추정] |
| **3. 미국 주가 유료 + 국내 공공** (Tiingo 재배포 계약) | 내부용 약 3.4만~5.6만 원 [2차] + **재배포 별도 견적** | 재배포 계약 시 | 높음(분할·배당 포함) | 높음 | 낮음 | 재배포 요금 구조 [확인 필요] |
| **4. 국내외 주가 모두 유료** (Twelve Data Pro) | **약 31만 원 ($229)** | 표시·재배포 조건 [확인 필요] | 중간~높음 | 높음 | 낮음 (공급자 하나) | **예산 6배 초과** |
| **5. 범위 축소** (1 + 미장 주가·세계 지수·목표가·5분봉 알림을 끄거나 개인용으로) | **0원** | 높음 | 국장·재무·거시 중심 | 높음 | 낮음 | 견적 받으면 기능 다시 켜기 |

**판단:** 5만 원 안에서 "합법적으로 공개 가능"이 확인된 조합은 **1·5뿐**이고, 그마저 금융위 시세의 이용허락범위 확인이 전제예요. 2·3은 견적이 나와야 판단 가능, 4는 예산 초과라 억지로 맞추지 않아요.

---

## 8. 공급자 교체 우선순위

| 순위 | 대상 | 이유 |
|---|---|---|
| 1 | **국내 재무 → OpenDART** | 이미 키 있음, 원본이 더 정확, 공공 |
| 2 | **미국 재무 → SEC EDGAR** | 무료·재사용 가능 [공식·발췌] |
| 3 | **환율·금리 → ECOS·FRED** | 이미 일부 사용, 쉬움 |
| 4 | **국장 종목 목록·시세 → 금융위 공공데이터** | 이용허락범위 확인 후. 하루 늦음 감수 여부 결정 필요 |
| 5 | **미장 주가 → Tiingo(1순위 견적)·EODData(2순위 견적)** | 재배포 견적 뒤 |
| 6 | 국장 시세 정식 계약 → KRX·코스콤 | 견적 뒤, 실시간·당일 필요할 때 |
| 보류 | Twelve Data | 예산 초과 |
| 별도 | 네이버 수급·리서치, 구글 뉴스, faireconomy, 세계 지수 | 이번 목록 밖. 축소 또는 별도 조사 |

---

## 9. 단계별 실행 계획

작업량은 Claude + 사용자 검수 기준 대략치예요 [추정].

| 단계 | 할 일 | 예상 작업량 | 완료 조건 |
|---|---|---|---|
| 1. 현재 구조 조사 | 이 문서 | **완료** | 14개 yfinance 위치·JSON 구조·프론트 읽기 경로 정리 ✅ |
| 2. 라이선스 검토 | 공식 약관 원문을 **사용자 폰 브라우저 또는 사이트가 열리는 환경**에서 열어 문구 캡처 (OpenDART·ECOS·공공데이터포털 15094808·KRX Open API·Tiingo·Twelve Data·EODData·SEC·Yahoo) | 반나절 | 10장 표의 '확인 필요'가 모두 원문 인용 + 날짜로 채워짐 |
| 3. 견적 대상 선정·문의 | Tiingo(재배포), EODData, KRX 정보사업, 코스콤에 같은 질문지 발송 (**외부 발송이라 사용자 승인 필요**) | 1시간 + 답 기다림 1~3주 | 4곳 답장(가격·표시·재배포·파생·정적 사이트 JSON 허용 여부) |
| 4. 데이터 형식·Adapter 설계 | `prices.py` 함수 모양, 기호 번역표, `meta` 블록, 이상값 규칙 문서화 | 1일 | 설계 문서 + 기존 테스트(`tests/`)에 영향 목록 |
| 5. 국내 재무·공시 교체 검증 | DART 재무로 `fundamentals.json` 같은 모양 생성 → Yahoo 값과 대형주 48개 비교 (별도 브랜치, 사용자 검수) | 2~3일 | 매출·영업이익·순이익 차이 표, PER·PBR 계산 일치, 화면 캡처 검수 통과 |
| 6. 미국 재무·공시 교체 검증 | EDGAR companyfacts로 같은 작업 (미장 48개) | 2~3일 | 태그 매핑표, 빈칸 비율, 캡처 검수 |
| 7. 국내외 주가 교체 | 국장: 금융위 시세(또는 계약 공급자), 미장: 견적 결과대로. 수정주가 계산, 시작 연도 확인 | 국장 3~5일, 미장 2~3일 | 지수·대형주 종가가 기존과 1% 안 일치(원가격), 분할 종목 수동 확인, 이상값 0 |
| 8. 회귀 테스트 | `python -m pytest`, `jump-audit.js`(화면 위치 규칙), 전 화면 캡처 전후 비교, 적립식 계산기 대표 ETF 5개 결과 비교 | 1~2일 | 테스트 전부 통과, 5장 기능별 ①~④ 체크 완료 |
| 9. 상업적 이용 최종 검증 | 공급자별 계약서·약관 문구와 실제 공개 범위(저장소·사이트·JSON) 대조, 출처 표시 화면 반영 | 반나절 + 필요 시 전문가 상담 | 모든 데이터 `license_status`가 `unknown` 아님, 공개 저장소에 원본 재배포 없음 |

---

## 10. 미확인 사항 및 외부 문의 목록

### 10-1. 원문으로 확인할 것 (돈 안 듦)

| # | 대상 | 질문 |
|---|---|---|
| 1 | Yahoo 약관 (legal.yahoo.com) | 금융 데이터 표시·재배포 조항 원문, 한국 버전 |
| 2 | OpenDART 이용약관 | 영리 이용, 출처 표시, 일일 호출 한도 |
| 3 | ECOS 이용약관·공공누리 유형 | 상업 이용·출처 표시 |
| 4 | 공공데이터포털 금융위 주식시세정보(15094808)·KRX상장종목정보(15094775)·증권상품시세정보 | 이용허락범위, 자료 시작 연도, 시가총액·상장주식수 항목 |
| 5 | KRX Open API 약관 | 비상업 조항 원문 (지금은 2차 자료) |
| 6 | SEC Website Dissemination 정책 | 재사용 조건 원문 |
| 7 | FRED 시리즈별 저작권 (DEXKOUS, DGS10, VIXCLS, DCOILWTICO 등) | 상업 웹 표시 가능 여부 |
| 8 | Tiingo 요금 페이지 | 현재 플랜 가격·한도, CORS(사용자 토큰 방식) |
| 9 | Twelve Data 가격 데이터 표시 조건 | 어떤 플랜에서 공개 웹 표시 가능한지 |
| 10 | GitHub Pages 비공개 저장소 배포 비용 | 원본을 비공개로 옮길 때 |

### 10-2. 견적·문의 질문지 (사용자 승인 후 발송)

공통 질문 (Tiingo, EODData, KRX 정보사업, 코스콤):
1. 개인이 운영하는 정적 웹사이트(GitHub Pages)에 **일봉 종가·거래량을 차트로 표시**하는 비용은?
2. 브라우저가 내려받는 **JSON 파일 형태**도 허용되는가? (재배포로 보는가)
3. 이동평균·RSI·수익률·최대 낙폭 같은 **계산 지표 공개**는?
4. 광고·유료 구독 수익이 생겨도 같은 조건인가? 방문자 수 연동 요금인가?
5. 과거 자료 시작 연도, 수정주가·배당·분할 제공 여부, 종목 수·호출 한도
6. 최소 계약 기간, 출처 표시 문구

---

## 11. 최종 추천 및 의사결정 사항

### 추천
- **지금:** 조합 **1(공공 API 중심) + 5(범위 축소)** 로 가는 설계부터. 비용 0원, 합법성 확인이 가장 쉬움.
- **순서:** 국내 재무(DART) → 미국 재무(EDGAR) → 환율·금리(ECOS·FRED) → 국장 시세(공공, 원문 확인 후) → 미장 시세(견적 결과대로).
- **Yahoo 위험 기록:** 상업적 재배포 권한 **없음**. 지금도 공개 저장소·사이트로 원본을 내보내는 상태라 **유료화·광고 전 교체 또는 비공개화 필수**.

### 사용자가 정할 것
| # | 결정 | Claude 추천 |
|---|---|---|
| 1 | 견적 메일(Tiingo·EODData·KRX·코스콤)을 보낼지 (외부 발송) | 보내기 — 답 없으면 미장 주가 판단 불가 |
| 2 | 국장 시세를 공공 API로 바꾸면 리포트가 **하루 늦어지는 것** 감수할지 | 감수하되, 당일 리포트는 "개인용 모드"로 남기는 안 검토 |
| 3 | 견적 전까지 미장 주가·세계 지수·목표가·5분봉 알림을 **공개판에서 숨길지** | 상업화(광고) 시작 전까지는 지금대로 두고, 시작 시점에 숨김 |
| 4 | 원본 데이터 커밋을 공개 저장소에서 뺄지 | 교체 7단계와 같이 진행 |
| 5 | 이 문서를 저장소 `docs/business/`에 올릴지 | 사용자 결정 (지금은 프로젝트 파일에만 저장) |

---

## 출처 (이번 조사에서 본 것)

- Tiingo 문서: https://www.tiingo.com/documentation/general (검색 발췌)
- Tiingo 가격 비교(2차): https://www.findmymoat.com/vs/tiingo-vs-trendlyne
- Twelve Data 가격: https://twelvedata.com/pricing (검색 발췌), XKRX: https://twelvedata.com/exchanges/xkrx, 비가격 데이터: https://support.twelvedata.com/en/articles/10444817-what-is-non-price-data
- EODData: https://eoddata.com/products/datafeed.aspx (검색 발췌)
- SEC: https://www.sec.gov/os/accessing-edgar-data, https://www.sec.gov/about/webmaster-frequently-asked-questions (검색 발췌)
- KRX 면책: https://data.krx.co.kr/templets/mdc/disclaimer_p1.jsp, 정보이용정책(2016): https://data.krx.co.kr/inc/datasale/Market%20Data%20Usage%20Polices_ko.pdf (검색 발췌)
- KRX Open API(2차): https://pypi.org/project/krx-openapi/
- 공공데이터포털: https://www.data.go.kr/data/15094808/openapi.do, https://www.data.go.kr/data/15094775/openapi.do, ECOS https://www.data.go.kr/data/15059632/openapi.do
- 코스콤(보도): https://www.heraldk.com/article/2026051718262363573, https://www.neudata.co/1/vendors/korea-exchange-krx
- Yahoo 약관: https://legal.yahoo.com/xw/en/yahoo/terms/otos/index.html, yfinance README(2차): https://github.com/Kylelkh/yfinance_fork
- OpenDART(2차): https://pypi.org/project/opendart-client/, https://wikidocs.net/336171
