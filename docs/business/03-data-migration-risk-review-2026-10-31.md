# 이지스톡 데이터 이전 위험 검토 (2026-10-31)

- 범위: **분석만**. 코드 수정·파일 삭제·브랜치·PR 없음. 02 문서는 그대로 둠.
- 앞 문서: `02-data-provider-audit-2026-10-31.md` (공급자 진단). 표기 규칙도 02와 같아요.
  - **[코드]** 저장소·파일 직접 확인 / **[공식·발췌]** 공급자 공식 페이지 문구(이 환경은 공급자 사이트 접속이 막혀 검색 발췌로 확인) / **[2차]** 제3자 자료 / **[추정]** / **[확인 필요]**
- 기준: main `d6627d6`, 전체 이력 517커밋 (이번에 얕은 복제를 전체 이력으로 받아 확인, 저장소엔 아무것도 안 올림).

---

## 0. 결론 먼저

1. **`paper/` JSON 76개 중 65개가 Yahoo 원본(7개) 또는 Yahoo 숫자를 담은 파생·혼합 자료(58개, ETF 묶음 48개 포함)**이고, 모두 **세 경로로 누구나 받을 수 있어요**: ① 공개 저장소 raw 주소 ② GitHub Pages 사이트 ③ git 이력(2026-10-04부터, `paper/`를 건드린 커밋 169개). 사이트엔 `paper/`에 없는 **전 종목 일봉 파일(국장 4,185·미장 9,637 목록 기준)** 도 올라가요 [코드].
2. **지우는 것만으로는 해결이 안 돼요.** 파일을 지워도 이력·다른 브랜치(74개)·PR 기록에 남아요. 실제 선택지는 **"저장소 비공개 전환" 또는 "새 저장소로 이사"** 이고, 둘 다 되돌리기 어려운 결정이라 사용자 결정이 필요해요.
3. **Adapter만으로 해결되는 건 주가(OHLCV) 쪽**이에요. 재무는 DART·EDGAR 구조가 Yahoo와 많이 달라서 **`fundamentals.py` 안쪽(분기 누적값 풀기, 4분기 계산, 계정 매핑)은 엔진 수정**이 필요해요. 목표가·예상 PER·배당락일·실적일은 대체 자료가 없어요.
4. **월 5만 원 안에서 "공개 웹 표시 + JSON 공개 + 광고·유료"가 모두 확인된 주가 공급자는 국내·미국 모두 없어요.** 국내는 금융위 공공 시세(무료)가 유일한 후보지만 이용허락범위·과거 기간이 **[확인 필요]**, 미국은 싼 요금제가 전부 개인용이에요 [공식·발췌].
5. 그래서 라이선스 확보 전 공개판은 **"국장 + 재무·공시·거시 + 자체 계산기"** 중심으로 가고, **미장 시세·세계 지수·ETF 수익률·목표가·5분봉 알림은 멈추는 것**을 권해요 (4장).

---

## 1. Yahoo 데이터 공개 현황

### 1-1. `paper/` JSON 전수 조사 [코드]

`paper/inbox/`(텔레그램 알림 사본 29개)를 빼면 JSON 76개예요 (`etfm/` 묶음 48개 포함).

| 파일 | 크기 | Yahoo 포함 | 내용 | 분류 |
|---|---|---|---|---|
| `paper/kr/daily.json`, `paper/us/daily.json` | 160KB, 180KB | **원본** | 지수 일봉 캔들 `candles{o,h,l,c,v}` 약 1,220일 + 월봉, 대형주 48개 종가·60일 `spark`, `usdkrw` | 원본 |
| `paper/world.json` | 168KB | **원본** (일부 FRED·ECOS) | 세계 지수·환율·원자재·VIX·BTC 종가 배열 `closes` | 원본 |
| `paper/kr/fundamentals.json`, `paper/us/fundamentals.json` | 56KB씩 | **원본** | 매출·영업이익·순이익(연 4년·분기), 시가총액, PER·PBR, 배당률, 애널리스트 목표가·투자의견, 배당락일·실적일 | 원본 |
| `paper/symbols/kr.json`, `us.json` | 260KB, 664KB | **원본** (국장 ETF 이름은 네이버) | 전 종목 코드·이름·시장·종류 (국장 4,185, 미장 9,637줄) | 원본(목록) |
| `paper/symbols/kr_returns.json`, `us_returns.json` | 276KB, 740KB | 파생 + 일부 원본 | 10년 연 상승률·배당률·최대 낙폭·위기 3번 낙폭·**1주당 배당금** | 파생(배당금은 원본) |
| `paper/symbols/lab.json` | 36KB | 파생 | 17개 자산 월 수익률(2004~), 원/달러 월 변화 | 파생 |
| `paper/symbols/etfm/*.json` (48개) | 20~80KB | 파생 | ETF 전부 20년 월 수익률 | 파생 |
| `paper/sectors.json` | 24KB | 파생 | Yahoo 업종 → 한국어 15개 업종 | 파생(분류) |
| `paper/macro.json` | 4KB | 파생 | 경고 7개 중 5개 Yahoo 수치(문장에 숫자 포함) | 파생 |
| `paper/events.json` | 20KB | 파생 일부 | 발표 일정(faireconomy)·실제값(FRED) + **지수 급변**(Yahoo 5분봉) | 혼합 |
| `paper/calendar.json` | 68KB | 일부 원본 | FOMC·금통위·만기 + **실적일·배당락일**(Yahoo) | 혼합 |
| `paper/report.json`, `weekly.json`, `learn_cases.json` | 20KB, 8KB, 104KB | 파생 | 리포트 문장 속 등락률·업종 흐름 | 파생 |
| `paper/kr/flows.json` | 148KB | ❌ (네이버 원본) | 60일 외국인·기관·개인 순매수 | 원본(타 출처) |
| `paper/reading.json` | 176KB | ❌ (네이버 리서치) | 증권사 리포트 제목·**첫머리 요약문** | 원본(타 출처, 글 저작권) |
| `paper/policy_news.json` | 12KB | ❌ (구글 뉴스) | 기사 제목·링크 | 원본(타 출처) |
| `paper/policies.json`, `learn_notes.json` | 20KB, 4KB | ❌ | 손으로 쓴 정책 정리·공부 노트 | 자체 |
| `paper/health.json` | 4KB | ❌ | 워크플로 성공·실패 수 | 자체 |
| `paper/watch.json`, `alerts.json`, `bot.json` | 4KB씩 | ❌ | 사용자 관심종목, 가격 알림, **봇 이름** | 개인 설정 |

> 덧붙임: `watch.json`(내 관심종목)과 `bot.json`(텔레그램 봇 이름)이 공개 상태예요. 데이터 라이선스와는 별개지만 비공개 전환 때 같이 정리할 대상이에요.

### 1-2. 공개 URL로 접근 가능한 데이터 [코드: `dashboard.py` `main()`, `stock_pages.py`, `.github/workflows/pages.yml`, `news.yml`]

| 경로 | 무엇 | Yahoo |
|---|---|---|
| `raw.githubusercontent.com/thd051130-crypto/-2easy-stock/main/paper/...` | 위 76개 전부 | ✅ |
| `https://thd051130-crypto.github.io/-2easy-stock/data.json` | daily·world·fundamentals 요약·macro·report… 합본 | ✅ |
| `…/stocks/kr/<코드>.json`, `…/stocks/us/<코드>.json` | **전 종목** 최근 2년 일봉 + 상장 이후 월봉 (`all_stocks.py`), 대형주·관심종목은 **상장일부터 전체 일봉** (`stock_pages.py`, `PERIOD="max"`) + 재무 + 수급 | ✅ |
| `…/stocks/<시장>/_quotes.json` | 전 종목 종가·등락·200일선·RSI | ✅ |
| `…/indexes/<기호>.json` | 세계 지수 처음부터 일봉 | ✅ |
| `…/symbols/*.json`, `…/symbols/etfm/*.json` | `paper/symbols` 통째 복사 (`shutil.copytree`) | ✅ |
| `…/industry.json`, `…/themes.json` | 산업 지도 주가 동행·흐름, 테마 | ✅(industry) |
| `…/inbox.json` | 텔레그램 알림 60일 (리포트 숫자 포함) | 파생 |
| `raw.githubusercontent.com/…/live/news.json` | 구글 뉴스 제목 | ❌ |
| Actions 아티팩트 `stocks-kr`, `stocks-us` (7일 보관) | 전 종목 일봉 묶음 | ✅ — 공개 저장소 아티팩트는 로그인한 누구나 받을 수 있는 것으로 알려짐 **[추정, 확인 필요]** |

**규모:** 사이트가 내려주는 일봉 파일만 국장·미장 합쳐 **1만 개가 넘는 종목 단위 JSON** [코드: 목록 줄 수 기준, 실제 배포 개수는 Pages 로그 확인 필요]. 이건 "차트 표시"보다 **"데이터셋 배포"** 에 가까워요 — FMP가 쓰는 기준("설명 글을 빼도 파일만으로 쓸 만한 금융 데이터셋인가?")으로 보면 분명히 해당돼요 [공식·발췌: FMP 안내].

### 1-3. git 커밋 이력에 남은 데이터 [코드: 전체 이력 517커밋]

| 항목 | 내용 |
|---|---|
| 시작 | 2026-10-04 첫 커밋부터 |
| `paper/`를 바꾼 커밋 | **169개** |
| 지금은 지웠지만 이력에 남은 파일 | `paper/kr/signal.json`·`us/signal.json`(지수·종목 **일봉 캔들 포함**, 24커밋, 2026-10-24 삭제), 가상계좌 `equity.csv`·`trades.csv`·`state.json`·`picks.csv`, `rulebook/`, `etf/`, `archive/` |
| 자주 바뀐 파일 | `world.json` 40커밋, `events.json` 16, `flows.json` 16, `reading.json`·`report.json`·`learn_cases.json` 11 |
| `data/*.csv` | `.gitignore`에 있어 **커밋된 적 없음** ✅ |
| 다른 곳 | 원격 브랜치 **74개**(대부분 main에서 갈라져 같은 데이터 포함), `live` 브랜치(뉴스만, force push라 이력 1개), PR 기록 |

**중요:** 파일을 지워도 과거 커밋에서 그대로 열려요. 이력을 지우려면 `git filter-repo` 같은 **이력 다시 쓰기 + 강제 푸시**가 필요한데, ① 되돌릴 수 없고 ② 74개 브랜치·ChatGPT 브랜치가 깨지고 ③ PR이 가리키는 커밋(`refs/pull/*`)은 저장소 주인이 못 지워 GitHub 지원팀 요청이 필요한 것으로 알려져 있어요 **[추정, GitHub 문서 확인 필요]**.

### 1-4. 상업화 전 삭제·보존·교체 구분

| 구분 | 대상 | 이유 | 할 일 |
|---|---|---|---|
| **삭제(공개에서 내림)** | Pages의 `stocks/**`, `indexes/**`, `_quotes.json`, `symbols/etfm/**`, `paper/kr|us/daily.json`의 `candles`, `world.json` `closes`, `fundamentals.json` 원본 숫자, `reading.json` 요약문 | Yahoo·네이버 원본 그대로, "데이터셋"에 해당 | 공급자 교체 전엔 공개 경로에서 빼거나 비공개로 |
| **이력 정리(결정 필요)** | git 이력 169커밋, 74개 브랜치, 아티팩트 | 지워도 남음 | (A) 저장소 **비공개 전환** (B) **새 공개 저장소**로 코드만 이사, 옛 저장소 비공개 (C) 이력 다시 쓰기 — 추천 B (5장) |
| **보존(문제 적음)** | `policies.json`, `learn_notes.json`, `health.json`, `inbox/`(숫자는 파생), 코드 전체, `site/` 화면 | 자체 작성 | 그대로 |
| **보존하되 비공개** | `watch.json`, `alerts.json`, `bot.json` | 개인 설정 | 비공개 저장소나 Secrets로 |
| **교체 후 재생성** | `symbols/*.json`(→ 금융위 상장종목·SEC 목록), `fundamentals.json`(→ DART·EDGAR), `world.json` 금리·환율(→ ECOS·FRED), `daily.json`(국장 → 금융위 시세), `sectors.json`(→ KRX 업종·SIC) | 같은 모양으로 새 출처 | 02 문서 9장 순서 |
| **교체 대상 없음 → 중단 후보** | 목표가, 배당락일·실적일, 세계 지수, ETF 월 수익률(미장), 5분봉 급변 | 4장 참고 | 라이선스 전 공개 중단 |

---

## 2. Adapter 호환성 검증

### 2-1. yfinance가 실제로 돌려주는 표 [코드: yfinance 1.7.0 패키지 소스 `scrapers/history.py`, `multi.py`]

> `requirements.txt`가 `yfinance` **버전을 고정하지 않아** Actions는 그때 최신을 깔아요. 아래는 오늘 받은 1.7.0 기준이에요.

| 호출 | 열 | 인덱스 |
|---|---|---|
| `Ticker.history(auto_adjust=True)` (기본) | `Open, High, Low, Close, Volume, Dividends, Stock Splits` (+ 펀드는 `Capital Gains`). OHLC가 **분할+배당 반영 값으로 바뀜** | 날짜, 거래소 시간대 포함 |
| `Ticker.history(auto_adjust=False)` | 위 + **`Adj Close`**. `Close`는 **분할만 반영**, 배당은 안 뺌 | 같음 |
| `yf.download(list, group_by="column")` (기본) | 2단 열 `(값 종류, 종목)`. `actions=True`면 `Dividends`, `Stock Splits` 추가 | 날짜 |
| `yf.download(list, group_by="ticker")` | 2단 열 `(종목, 값 종류)` — `returns.py`·`all_stocks.py`가 이 방식 | 날짜 |
| 빈 배당·분할 | `0`으로 채움 | — |
| 월봉 집계(`interval="1mo"`) | Volume·Dividends 합, 분할은 곱 | 월 첫날 |

재무 쪽: `income_stmt`·`quarterly_income_stmt`·`quarterly_balance_sheet` = **행=항목 이름(영문), 열=기간 끝 날짜** 표. `info` = 값 수십 개짜리 사전.

### 2-2. 분석 엔진이 요구하는 필수 열 [코드: 파일별 열 사용 grep]

| 파일 | 필요한 열 | 수정주가 |
|---|---|---|
| `daily.py` | Open, High, Low, Close, Volume | 원가격(`False`) |
| `stock_pages.py` | Open, High, Low, Close, Volume | 원가격 |
| `marketdata.py` | Open, Close, Volume | 수정(`True`) |
| `returns.py` | Close, **Adj Close**, **Dividends**, Low (월봉) | 둘 다 |
| `etf_monthly.py` | (returns.fetch 재사용) Adj Close | 수정 |
| `lab.py`, `macro.py`, `world.py`, `industry_map.py`, `commands.py` | Close | 수정 |
| `all_stocks.py` | OHLCV (일봉·월봉) | 원가격 |
| `bot.py`, `big_events.py` | Close, High, Low (**5분봉**) | 원가격 |
| `fundamentals.py` | 표 행 `Total Revenue`, `Operating Income`, `Net Income Common Stockholders`/`Net Income`, `Common Stock Equity`/`Stockholders Equity` + `info` 키 18개 | — |
| `fundcheck.py` | `info`: trailingPE, forwardPE, earningsGrowth, earningsQuarterlyGrowth, returnOnEquity, debtToEquity, profitMargins, priceToBook, sector, `calendar["Earnings Date"]` | — |
| `sectors.py` | `info`: industry, sector | — |
| `symbols.py` | Yahoo 스크리너 결과(코드·이름·거래소·종류·시총) | — |

→ **주가 쪽 필수 = `Open/High/Low/Close/Volume` + `Adj Close` + `Dividends` (+분할 정보)**, 원가격·수정가격을 **둘 다** 만들 수 있어야 해요.

### 2-3. SEC·OpenDART 구조와 비교

| 항목 | Yahoo (지금) | OpenDART `fnlttSinglAcntAll` [2차, 공식 개발가이드 확인 필요] | SEC `companyfacts` [2차, SEC 문서 확인 필요] |
|---|---|---|---|
| 모양 | 표: 행=항목, 열=기간 | **행 = 계정 1개 × 보고서 1개**. 한 번 호출 = 회사·연도·보고서 종류 하나 | `facts.<us-gaap|ifrs-full|dei>.<개념>.units.<USD|shares>[]` 값 목록 |
| 항목 이름 | 영문 고정(`Total Revenue`) | `account_nm`(한글, 회사마다 표현 다름) + `account_id`(IFRS 태그) | 개념 이름(`Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, `OperatingIncomeLoss`, `NetIncomeLoss`, `StockholdersEquity`) — 회사마다 쓰는 개념이 다름 |
| 기간 | 열 날짜 = 기간 끝 | `bsns_year` + `reprt_code`(11013 1분기, 11012 반기, 11014 3분기, 11011 사업) | `start`·`end`·`fy`·`fp`(FY,Q1~Q3)·`form`·`filed`·`frame`(CY2024Q2 등, 없을 수 있음) |
| 분기 값 | 3개월 값 | `thstrm_amount` = 3개월, `thstrm_add_amount` = 누적 (손익) | 10-Q는 3개월·누적이 섞여 있음 |
| 4분기 | 있음 | **없음 → 사업보고서 − (1~3분기)** 계산 | **없음 → 연간 − (Q1~Q3)** 계산 |
| 연결/개별 | 구분 없음 | `fs_div` CFS(연결)/OFS(개별) 선택, 연결 없으면 OFS로 | 연결만 |
| 숫자 형식 | 숫자 | **문자열(쉼표 포함)** | 숫자 |
| 통화 | `financialCurrency` | KRW | `units` (USD, 외국 회사는 다른 통화·ifrs-full) |
| 정정 | 덮어씀 | 정정 공시 별도 | 같은 기간 값이 여러 번(`filed` 다름) → 최신 골라야 |
| 한도 | 비공식 | 하루 약 20,000건 [2차] | 초당 10회 [공식·발췌] |
| 회사 찾기 | 티커 | `corp_code`(8자리) ↔ 종목코드 매핑 파일 필요 | CIK ↔ 티커 매핑 파일 필요 |

### 2-4. 차이 분석

| 차이 | 지금 코드 | 위험 | 해결 위치 |
|---|---|---|---|
| **수정주가** | 파일마다 `True`/`False` 섞임 [코드] | 공공 국장 시세는 원가격만 줄 가능성 [추정] → `Adj Close`·`auto_adjust=True` 값을 직접 만들어야 | Adapter (분할·배당 정보가 있다면) |
| **분할** | Yahoo 반영에만 의존 | 국장 분할 이벤트를 주는 무료 API **[확인 필요]** (DART '주식분할 결정' 공시를 읽는 방법은 가능 [추정]) | Adapter + 새 수집 로직 |
| **배당** | 월봉 `Dividends`(배당락 달·1주당 금액) | DART는 **결산 기준 1주당 배당**이고 배당락 날짜가 없음 [추정] → `returns.py` 배당 달·금액이 근사치가 됨 | 엔진 수정(배당 달 계산) |
| **통화** | `summarize()`가 `cap / net`을 **통화 확인 없이** 나눔 [코드] | 외국 회사(20-F, 대만 달러 재무 + 달러 시총)면 지금도 PER이 틀릴 수 있음 — EDGAR로 바꾸면 더 드러남 | 엔진 수정(환율 맞추기) |
| **회계기간** | `asof`가 **수집한 날짜**(재무 기간 끝 아님) [코드] | `reference_date`로 쓰면 틀림. 3월 결산·애플 9월 결산 등 회계연도 ≠ 달력 | 엔진 수정(기간 끝 저장) |
| **분기 연속** | `ttm()`이 분기 날짜 간격 3개월을 요구 [코드] | DART·EDGAR 4분기 계산 실수면 PER 빈칸 | Adapter(4분기 만들기) |
| **`info` 값** | 18개 키 직접 사용 | 시총·PER·PBR·배당률·ROE·부채비율·이익률·증가율은 **계산 가능**, 목표가·투자의견·예상 PER·배당락일·실적일은 **대체 없음** | Adapter(계산) / 기능 중단 |
| **업종** | Yahoo `industry` → `sectors.MAP` | SIC 코드·KRX 업종은 이름 체계가 달라 매핑표 새로 | 엔진 수정(매핑표) |
| **시간대** | 인덱스 시간대 제거 후 날짜만 [코드: `marketdata.download`] | 공공 API는 날짜 문자열(`basDt` 20261030) [2차] | Adapter |

### 2-5. Adapter로 되는 것 / 엔진 수정이 필요한 것

| Adapter만으로 해결 | 엔진(분석 코드) 수정 필요 |
|---|---|
| 일봉·월봉 OHLCV를 yfinance와 같은 열·인덱스로 | `fundamentals.series()`·`latest()` — DART·EDGAR 응답에서 연·분기 표 만들기 |
| 원가격 ↔ 수정가격(분할·배당 정보가 들어오면) | 4분기 = 연간 − 1~3분기, 누적값 풀기 |
| `download(list, group_by=…)` 2단 열 흉내 | `fundcheck`의 `info` 의존 → 계산식으로 (ROE·부채비율·증가율·이익률) |
| 기호 번역(`005930.KS`↔코드, `KRW=X`↔ECOS, `^TNX`↔FRED DGS10) | `summarize()` 통화 맞추기, `asof` → 기간 끝 |
| 날짜 형식·시간대 | `returns.div_months()` 배당 달 계산 (배당락 날짜 없을 때) |
| 빈 배당·분할을 0으로 | `sectors.py` 업종 매핑표 (SIC·KRX) |
| 메타 블록(source·adjustment…) 붙이기 | `symbols.py` 목록 원천 바꾸기 (ETF 목록 따로) |
| 이상값 검사 | 목표가·배당락·실적일 칸: 앱(`app.js` 5526·5539행 근처)에서 "자료 없음" 처리 |
| — | 5분봉 쓰는 `bot.py`·`big_events.py`: 일봉 기준으로 바꾸거나 끔 |

**판단:** 주가는 Adapter 한 파일로 14곳 대부분이 그대로 돌아가요. 재무는 **"Adapter가 Yahoo 같은 표를 흉내"** 하는 것보다 **`fundamentals.py`의 `fetch()`를 공급자별로 새로 쓰고 `summarize()` 결과 모양(JSON)을 지키는 것**이 더 안전해요 — 앱과 리포트는 그 JSON 모양만 보니까요 [코드: `dashboard.fund_table()`, `stock_pages.py`].

---

## 3. 주가 데이터 제공 범위 (월 5만 원 ≈ $37 이하)

| 대안 | 국내 일봉 | 미국 일봉 | 과거 기간 | 월 비용 | 상업적 웹 표시 | 공개 JSON 배포 | 광고·유료 서비스 |
|---|---|---|---|---|---|---|---|
| **금융위 주식시세정보** (공공데이터포털) | ✅ 하루 1번, **다음 영업일 13시 이후** [공식·발췌] | ❌ | **[확인 필요]** | 0원 | 이용허락범위 **[확인 필요]** | **[확인 필요]** | **[확인 필요]** |
| KRX Open API | ✅ | ❌ | [확인 필요] | 0원 | ❌ 비상업만 [2차] | ❌ 재배포 금지 [2차] | ❌ |
| KRX·코스콤 정식 계약 | ✅ | ❌ | [확인 필요] | **비공개** | 계약 | 계약 | 계약 |
| Tiingo | ❌ | ✅ 1962~ [2차] | 길다 [2차] | 내부용 연 $300~$499 [2차] ≈ 월 3.4만~5.6만 원 | **별도 문의** [공식·발췌] | **금지, 별도 문의** [공식·발췌] | 별도 문의 |
| Tiingo "사용자가 자기 키 넣기" | ❌ | ✅ | — | 운영자 0원 | 문의 불필요 조건 [공식·발췌] | 우리가 배포 안 함 | 가능성 [추정] (사용자 불편, CORS **[확인 필요]**) |
| Massive (옛 Polygon) Starter | ❌ | ✅ | [확인 필요] | $29 ≈ 3.9만 원 [2차] | ❌ 개인·비전문가용 [2차] | ❌ 재배포는 비즈니스 상품 [공식·발췌] | ❌ |
| Financial Modeling Prep Starter | [확인 필요] | ✅ | [확인 필요] | $22 ≈ 3만 원 [2차] | ❌ 표시는 **별도 표시·라이선스 계약** [공식·발췌], 표시권은 월 $333 단계부터 [2차] | ❌ | ❌ |
| Alpha Vantage | 일부 [확인 필요] | ✅ | 길다 [2차] | 무료 / 유료 $49.99부터 [2차] (≈6.7만 원, 예산 초과) | ❌ 개인·비상업, 상업은 문의 [공식·발췌] | ❌ | 문의 |
| Twelve Data Grow | ❌ (한국은 Pro부터) | ✅ | [확인 필요] | $79 ≈ 10.7만 원 [공식·발췌] — **초과** | [확인 필요] | 별도 계약 [공식·발췌] | [확인 필요] |
| EODHD | ✅ [2차] | ✅ | 길다 [2차] | 개인용 요금 [2차] | 상업은 별도 맞춤 계약 [2차] | [확인 필요] | 별도 |
| EODData | [확인 필요] | ✅ | — | 견적제, 예전 예시 월 $750 [공식·발췌] | 재게시(차트 포함) 상업 라이선스 필요 [공식·발췌] | 같음 | 같음 |
| SEC EDGAR / FRED | ❌ 주가 없음 | ❌ (FRED 일부 지수는 원 저작권자 조건 [확인 필요]) | — | 0원 | — | — | — |

**정리**
- **국내:** 5만 원 안 후보는 **금융위 공공 시세 하나**. 공식 페이지에서 이용허락범위·과거 기간만 확인되면 1순위. 단 리포트가 하루 늦어져요.
- **미국:** 5만 원 안 요금제는 **전부 개인용/내부용**이고, 공개 웹 표시·JSON 배포는 별도 계약이에요 [공식·발췌 다수]. **월 5만 원 안 합법 공개는 지금 확인된 방법이 없어요.** 예외는 "사용자가 자기 Tiingo 키를 넣는" 방식뿐 [공식·발췌].
- 정적 사이트(GitHub Pages)는 구조상 **브라우저가 JSON을 통째로 받아요.** 계약할 때 "표시"만 사면 부족하고 **"클라이언트로 전달되는 파일" 허용 여부**를 꼭 물어야 해요.

---

## 4. 최종 서비스 범위 (주가 라이선스 확보 전)

### A. 계속 제공 (자체·공공 자료)

| 기능 | 조건 |
|---|---|
| 공시 알림·종목 공시 (DART) | DART 약관 원문 확인 |
| 경제 일정 달력 (FOMC·금통위 공식 일정, 만기일 규칙 계산) | 그대로 |
| 정부 정책 칸 (손 정리) | 뉴스 제목 부분은 D 참고 |
| 투자 공부 용어집·대처법·공부 노트 | 숫자 예시가 Yahoo면 교체 |
| 목표 카드, 메시지함 | 그대로 (메시지함 속 숫자는 파생) |
| 산업 연관 지도 **점·선(사람이 만든 연결)** | 주가 동행·흐름 숫자는 C |
| 테마 사전·문장 검색 | 종목 목록을 공공 목록으로 바꾼 뒤 |
| **적립식 계산기 — 사용자가 수익률을 직접 넣는 방식** | 종목별 과거 수익률 자동 채우기는 C |

### B. 공급자 교체 후 제공 (공공 자료로 바꾸면 됨)

| 기능 | 새 출처 | 바뀌는 점 |
|---|---|---|
| 재무제표·재무 등급 (국장) | OpenDART | 계정 매핑 작업, 목표가·예상 PER 빠짐 |
| 재무제표·재무 등급 (미장) | SEC EDGAR | 개념 매핑, 외국 회사 일부 빈칸 |
| 금리·환율 (국고채·원/달러·미국 금리) | ECOS·FRED | FRED 시리즈별 조건 확인 |
| 경기 국면 7개 경고 | FRED(금리·VIX·유가·하이일드 지수 등) [확인 필요: 시리즈별] | 대체 안 되는 경고는 빼고 개수 조정 |
| 국장 종목 차트·종가·RSI·200일선 | 금융위 시세 | **하루 늦음**, 과거 기간·수정주가 [확인 필요] |
| 국장 오늘의 리포트·많이 움직인 종목·업종 흐름 | 금융위 시세 | 17:30 → 다음 날 13시 이후 |
| 검색·전 종목 목록 (국장) | 금융위 KRX상장종목정보 (+ETF 목록) | ETF 한글 이름 원천 바꿈 |
| 미장 종목 목록 | SEC 티커 목록 | **ETF가 빠짐** [추정] |
| 배당 정보 (국장 1주당 배당) | OpenDART | 배당락 날짜 없음 |

### C. 라이선스 확보 전 공개판에서 중단

| 기능 | 이유 |
|---|---|
| **미장 종목 차트·종가·기술적 지표·조건 검색** | 5만 원 안 공개 가능 공급자 없음 |
| **세계 지수·원자재·VIX·BTC 그래프·세계 지수 바·차트 지수 버튼** | 지수 사업자 라이선스 영역 |
| **포트폴리오 실험실 ETF 수익률, 적립식 계산기 종목별 과거 수익률(미장)** | 수정 종가 데이터셋 배포에 해당 |
| 적립식 계산기 종목별 과거 수익률(국장) | 금융위 시세로 수정주가를 만들 수 있으면 B로 [확인 필요] |
| 애널리스트 목표가·투자의견·예상 PER | 대체 없음 |
| 실적 발표일·배당락일 (달력의 💰·실적 표시) | 대체 없음 [확인 필요: 국장 공공 소스] |
| 가격 알림·급변 알림 (5분봉) | 일봉 범위 밖 → "종가 기준 알림"으로 바꾸면 국장만 B |
| 산업 지도 주가 동행·흐름 숫자 (미장) | 미장 시세 필요 |
| 상장일부터 전체 일봉 (오래된 차트) | 공공 시세 시작 시점에 따라 [확인 필요] |

### D. 이번 범위 밖이지만 같이 멈추거나 검토할 것

| 기능 | 위험 |
|---|---|
| 외국인·기관 수급 (네이버 내부 JSON) | 자동 수집 금지 약관 (01 문서) |
| 증권사 리서치 목록·요약문 (네이버) | **요약문은 증권사 글 저작권** — 제목+링크만 남기는 쪽 검토 |
| 지금 뉴스·핫 뉴스·업종·정책 뉴스 제목 (구글 RSS) | 비상업 성격 [확인 필요] |
| 큰 발표 예상치 (faireconomy) | 비공식 피드 [확인 필요] |

> "중단"은 **공개판**에서예요. 사용자 혼자 보는 개인용(비공개)으로 남길지는 별도 결정이에요 — 다만 GitHub Pages는 지금 공개 사이트라, 개인용으로 두려면 비공개 저장소 + 비공개 배포 방법이 필요하고 비용 **[확인 필요]**.

---

## 5. 권장 순서와 사용자 결정

| 순서 | 할 일 | 되돌릴 수 있나 |
|---|---|---|
| 1 | 공식 원문 확인: 금융위 주식시세 이용허락범위·기간, OpenDART·ECOS 약관, GitHub 아티팩트 공개 범위 | ✅ 읽기만 |
| 2 | **새 공개 저장소 계획** — 코드·화면·자체 문서만 옮기고 `paper/`·이력은 안 옮김. 옛 저장소는 비공개 전환 | ❌ 비공개 전환 시 지금 사이트 주소·별·포크 영향 → **사용자 결정** |
| 3 | 새 저장소에서 B 기능부터 공공 출처로 재생성 (02 문서 9장 5~7단계) | ✅ |
| 4 | C 기능은 화면에 "라이선스 준비 중" 표시(삭제 아님, 코드는 남김) | ✅ |
| 5 | 미장 견적(Tiingo 재배포·EODData) 답에 따라 C 일부 다시 켜기 | ✅ |

**사용자가 정할 것**
1. 지금 저장소를 **비공개로 바꿀지 / 새 저장소로 이사할지 / 그대로 둘지** (추천: 새 저장소 이사, 상업화 전까지)
2. 미장 시세를 공개판에서 언제 멈출지 (추천: 광고·유료를 붙이기 전, 늦어도 새 저장소 오픈 때)
3. 국장 리포트가 **하루 늦어지는 것** 받아들일지
4. 개인용 Yahoo 버전을 따로 남길지
5. 이 문서와 02 문서를 저장소에 올릴지 (지금은 프로젝트 파일에만 저장)

---

## 출처

- yfinance 1.7.0 패키지 소스 (PyPI에서 받아 읽음: `yfinance/scrapers/history.py`, `yfinance/multi.py`)
- 금융위 주식시세정보: https://www.data.go.kr/data/15094808/openapi.do, 증권상품시세정보: https://www.data.go.kr/en/data/15094806/openapi.do, KRX상장종목정보: https://www.data.go.kr/data/15094775/openapi.do
- OpenDART 재무 API(2차): https://algolab.co.kr/blog/dart-opendart-financial-statement-api-lag-2026, https://financialdatapy.readthedocs.io/en/latest/_modules/financialdatapy/dartapi.html
- SEC companyfacts(2차): https://dev.to/m0dus/the-sec-has-a-free-financial-data-api-that-nobody-talks-about-dfi, https://apify.com/datamule/sec-edgar-financial-facts ; SEC 공식: https://www.sec.gov/os/accessing-edgar-data
- Tiingo 문서: https://www.tiingo.com/documentation/general
- Massive(옛 Polygon): https://massive.com/knowledge-base/categories/business, 가격(2차) https://qveris.ai/guides/polygon-pricing-optimized
- FMP: https://site.financialmodelingprep.com/insights/platform/can-you-use-fmp-data-in-a-public-app-website-or-client-dashboard, 가격(2차) https://multiples.vc/compare/api-pricing
- Alpha Vantage 약관: https://alphavantage.co/terms_of_service, 가격(2차) https://qveris.ai/guides/alpha-vantage-pricing-alternative
- Twelve Data: https://twelvedata.com/pricing, https://twelvedata.com/exchanges/xkrx
- EODHD(2차): https://apis.io/plans/eodhd/eodhd-plans-pricing/ ; EODData: https://eoddata.com/products/datafeed.aspx
- KRX Open API(2차): https://pypi.org/project/krx-openapi/
