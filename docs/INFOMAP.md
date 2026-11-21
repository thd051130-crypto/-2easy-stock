# 정보 지도 (코드 말고 나머지 전부)
코드는 `docs/CODEMAP.md`. 이 지도가 맞는지는 `python tools/check.py map`이 확인해요 (경로·예약 시간·키 이름).

## 자료 파일: 누가 만들고 · 언제 · 앱 어디에
Actions가 파이썬을 돌려 `paper/`에 커밋 → `pages.yml`이 `dashboard.py`로 `_site/data.json` 등을 만들어 올려요.
| 파일 | 만드는 것 | 워크플로 | 앱에서 |
|---|---|---|---|
| `paper/kr/daily.json` `paper/us/daily.json` | daily.py (+movers·sectors·quiet_volume) | daily.yml | 홈 지수·급등락·히트맵 |
| `paper/kr/flows.json` | flows.py | daily.yml | 수급 |
| `paper/report.json` `paper/story_log.json` | report_desks.py (+market_story·analyst_view) | daily.yml | 리포트·연결 고리 |
| `paper/reports/` | report_archive.py | daily.yml | 지난 리포트 (`_site/reports/index.json`) |
| `paper/learn_cases.json` `paper/reading.json` | learn_cases.py · reading.py | daily.yml | 투자 공부 (`_site/learn.json`) |
| `paper/macro.json` `paper/calendar.json` `paper/policy_news.json` | macro.py · econ_calendar.py · policies.py --news | macro.yml | 경기·일정 달력·큰 발표·정책 |
| `paper/world.json` | world.py | world.yml | 세계 지수 바·화면·국고채 |
| `paper/events.json` | big_events.py (bot.py가 부름) | telegram-bot.yml | 큰 발표 칸 |
| `paper/watch.json` `paper/alerts.json` `paper/bot.json` | bot.py · watchlist.py | telegram-bot.yml | 관심 종목 |
| `paper/kr/disclosures.json` | disclosures.py | disclosures.yml | 공시 (생겼을 때만) |
| `paper/weekly.json` | weekly.py | weekly.yml | 주간 리포트 |
| `paper/kr/fundamentals.json` `paper/us/fundamentals.json` `paper/symbols/` `paper/sectors.json` | fundamentals·symbols·sectors·returns·lab·etf_monthly | fundamentals.yml | 종목 화면·검색·적립식·실험실 |
| `paper/health.json` | health.py weekly | health.yml | 주간 점검 한 줄 |
| `paper/inbox/` | inbox.py (알림 보내는 워크플로 전부) | 여러 개 | 메시지함 (`_site/inbox.json`) |
| `paper/policies.json` `paper/risk_events.json` `paper/learn_notes.json` | 손으로 (Claude가 고침) | 없음 | 정책·리스크 일정·공부 노트 |
| `news.json` (live 브랜치) | news.py | news.yml | 지금 뉴스·핫 뉴스 (앱이 바로 읽음) |
| 전 종목 차트 (`_site/stocks/`) | all_stocks.py → Actions 파일 stocks-kr/us 7일 | all-stocks.yml → pages.yml | 종목 화면 |
| `_site/themes.json` `_site/industry.json` | themes.py · industry_map.py | pages.yml | 문장 검색·산업 지도 |
| `api_keys.json` | 손으로 (만료일만, 키 값 X) | keys.yml | 키 만료 알림 |

## 예약 실행 (GitHub Actions, cron은 UTC · 한국 = +9시간)
GitHub 예약이 몇 시간 늦어서 클라우드플레어 정시 알람(`cloudflare/feedback-worker.js` JOBS 표, 5분마다)이 제시간에 workflow_dispatch로 돌리고, 늦게 온 예약 실행은 sched-gate.yml이 건너뛰어요. cron을 바꾸면 JOBS도 같이 (tests/test_alarm_worker.py가 확인).
| 워크플로 | cron | 한국 시간 |
|---|---|---|
| daily.yml | `30 8 * * 1-5` `30 22 * * 1-5` | 국장 17:30 · 미장 07:30 |
| macro.yml | `50 21 * * *` | 매일 06:50 |
| world.yml | `5 22 * * 1-5` `10 7 * * 1-5` | 07:05 · 16:10 |
| news.yml | `13,43 * * * *` | 30분마다 |
| telegram-bot.yml | `7,22,37,52 * * * *` | 15분마다 |
| disclosures.yml | `10 23 * * 0-4` `10 0-10 * * 1-5` | 평일 08:10 · 09:10~19:10 매시 |
| all-stocks.yml | `20 7 * * 1-5` `20 21 * * 1-5` | 16:20 · 06:20 |
| fundamentals.yml | `0 0 * * 6` | 토 09:00 |
| weekly.yml | `30 0 * * 6` | 토 09:30 |
| health.yml | `0 1 * * 0` | 일 10:00 |
| keys.yml | `0 0 * * *` | 매일 09:00 |
| pages.yml | 없음 | 위 자료 워크플로가 끝나면 · main에 앱 코드 push |
| test.yml · ui-audit.yml | 없음 | PR마다 (테스트 · 버튼 누르기 점검) |
| kis-live-check.yml | 없음 | 손으로만 (한국투자 API, 보류) |
| sched-gate.yml | 없음 | 다른 워크플로가 불러 씀 (늦은 예약 건너뛰기) |

## 비밀 키 이름 (Settings → Secrets, 값은 절대 적지 않기)
`TELEGRAM_BOT_TOKEN` `TELEGRAM_CHAT_ID` 알림 전부 · `DART_API_KEY` 공시 · `ECOS_API_KEY` 국고채 · `KIS_APP_KEY` `KIS_APP_SECRET` 한국투자(보류)

## 밖의 서비스 (전부 무료)
- Yahoo 시세: marketdata.py·daily.py·world.py·stock_pages.py 등 거의 전부 · 한국은행 ECOS: world.py · DART 공시: disclosures.py
- FRED: macro.py·world.py·econ_calendar.py · 네이버: marketdata.py·flows.py·reading.py·symbols.py (둘 다 Actions에서만 됨)
- 텔레그램 봇: bot.py가 받고, 알림은 tgfmt.py 형식으로 여러 스크립트가 보냄
- 클라우드플레어 워커 `cloudflare/feedback-worker.js`: 의견 보내기 우체통(← `site/js/feedback.js`) + 정시 알람. 토큰(텔레그램·GH_TOKEN)은 클라우드플레어 Secret에만
- 앱 주소: GitHub Pages (pages.yml), 뉴스는 raw.githubusercontent.com의 live 브랜치

## 문서·메모
- `CLAUDE.md` 작업 규칙 · `docs/CODEMAP.md` 코드 지도 · `docs/INFOMAP.md` 이 지도
- `docs/backup/memory/` Claude 메모 복사본 (`docs/backup/memory/MEMORY.md`가 요약) · `docs/backup/files/` 프로젝트 문서 복사본 · `docs/backup/README.md` 백업 날짜
- 프로젝트 공유 폴더(Claude 쪽, 저장소 밖): `*-preview/` 미리보기 사진 · `docs/v2*/` V2 설계 · `business/` 수익화 진단 · `tools/` 점검 도구 사본

## 점검 (한 명령으로 종류별)
`python tools/check.py` 빠른 점검 · 종류: `map` `js` `test` `data` `ui` `diff` `shots`(검수 사진 라이트·다크) · `all` 전부 · `--help` 설명
토큰 아끼기: 통과한 종류는 파일이 안 바뀌었으면 다음엔 건너뜀(`.check-cache.json`, `--fresh`로 다시) · diff는 달라진 곳만 자른 `_screen-diff/<화면>-crop.png` · 큰 파일은 `python tools/peek.py`로 필요한 부분만
