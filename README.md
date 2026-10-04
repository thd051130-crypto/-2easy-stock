# -2easy-stock

KIS(한국투자증권) Open API로 실시간 체결가를 받아 텔레그램으로 알려주는 감시봇, 그리고 계좌 없이 돌아가는 스윙 신호 알림.

## 국장·미장 매매 신호 알림 (계좌 필요 없음)

`swing-signals` 워크플로가 야후 일봉으로 신호를 계산해 텔레그램으로 보내요. 규칙은 수익보다 **하락을 줄이는 쪽**으로
골랐어요 ([docs/conservative-backtest.md](docs/conservative-backtest.md), 코드는 `strategy.py`).

| | 언제 | 규칙 | 백테스트 (2011~) |
|---|---|---|---|
| 국장 | 평일 17:30 | 코스피가 50·200일선 위일 때만 돌파 후 눌림 종목을 종목당 10%씩, 5일선 위·10거래일·-5% 손절로 매도 | 연 +4.8%, 최대 낙폭 -8% (코스피 보유 +8.3%, -44%) |
| 미장 | 화~토 07:30 | S&P500이 200일선 위이고 50일선도 200일선 위면 계좌 50%를 SPY 등 S&P500 ETF로, 아니면 현금 | 연 +5.5%, 최대 낙폭 -11% (S&P500 보유 +12.2%, -34%) |

- 하락이 아예 없는 규칙은 없어요. 대신 하락 폭을 지수의 1/3~1/5로 줄이고, 그만큼 수익도 덜 나요.
- 필요한 Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (아래 감시봇과 같은 값)
- 신호마다 매매 의견(매수 이유, 손절가, 청산 조건, 위험 요인)이 붙어요. 규칙으로 계산해서 사용료가 없어요
- 바로 확인: Actions → swing-signals → Run workflow (market=both)
- 주문은 하지 않아요. 백테스트 숫자는 과거 결과일 뿐이에요.

### 내 매매 규칙표 검증

내가 정한 규칙표(200일선 위, 60일선 > 200일선, RSI14 45~60, 거래량 20일 평균 이상, 30/30/40 분할매수·익절,
손절 -2%, 하루·주·월 손실 -1/-2/-4%에서 중단)는 `rulebook.py`에 있어요. 백테스트([docs/rulebook-backtest.md](docs/rulebook-backtest.md))에서
국장 연 -2.3%·최대 낙폭 -50%, 미장 연 -5.1%·최대 낙폭 -56%라 알림 규칙은 그대로 두고, 같은 워크플로가 규칙표를 별도 가상계좌
(`paper/<시장>/rulebook/`)로 매일 기록해요. 텔레그램 알림 끝에 "[규칙표 후보]"가 붙고, 대시보드에 "내 규칙표 검증" 칸이 생겨요.

### 가상매매 기록

같은 워크플로가 신호대로 샀다고 치고 `paper_trade.py`로 기록해요 (국장 30만 원, 미장 300달러, 수수료·세금 반영, 소수점 매수).

- 시가 체결이 있는 날 "[가상매매]" 알림, 매주 금요일 "[가상매매 주간 결산]" (수익률, 최대 낙폭, 승률, 보유 종목, 지수 비교)
- 기록은 `paper/kr/`, `paper/us/`에 워크플로가 직접 커밋해요: `trades.csv`(끝난 거래), `equity.csv`(날마다 평가금액), `state.json`
- 결산을 아무 때나 받기: Actions → swing-signals → Run workflow → paper_summary 체크
- 처음부터 다시 시작하려면 그 시장의 `paper/` 폴더를 지우면 돼요

### 폰 대시보드 (GitHub Pages)

`site/` 웹앱이 오늘의 신호, 가상계좌 수익률 그래프(지수와 비교), 보유 종목, 최근 거래, 지수 추세를 한 화면에 보여 줘요.
`pages` 워크플로가 `dashboard.py`로 `paper/` 기록을 `data.json`으로 묶어 올리고, swing-signals가 끝날 때마다 다시 올려요.

- 처음 한 번: Settings → Pages → Source를 **GitHub Actions**로 → Actions → pages → Run workflow
- 주소: `https://thd051130-crypto.github.io/-2easy-stock/` → 폰 브라우저 메뉴에서 "홈 화면에 추가"하면 앱처럼 열려요
- GitHub Pages 사이트는 저장소가 비공개여도 누구나 주소로 볼 수 있어요 (무료 계정은 공개 저장소에서만 Pages를 켤 수 있어요)
- 미리 보기: `python dashboard.py --out _site && python -m http.server -d _site`

## 폰만으로 연결 확인 (GitHub Actions)

1. 텔레그램 @BotFather에서 `/newbot` → 봇 토큰 받기, 만든 봇에게 아무 메시지나 보내기
2. 모바일 브라우저로 저장소 Settings → Secrets and variables → Actions에 `KIS_APP_KEY`, `KIS_APP_SECRET`, `TELEGRAM_BOT_TOKEN` 등록
3. Actions → kis-live-check → Run workflow, mode=`chat-id` → 로그에 나온 숫자를 `TELEGRAM_CHAT_ID` Secret으로 등록
4. mode=`test-telegram` → 텔레그램에 테스트 메시지가 오면 성공
5. mode=`check` → 승인키 발급 확인 (모의투자 앱키면 kis_env=mock, 실전이면 real)
6. 평일 09:00~15:30에 mode=`live` → 로그에 체결이 찍히고 텔레그램에 "[실시간 연결 확인]" 알림

## PC에서 연결 확인 (5단계)

```bash
pip install -r requirements.txt
cp .env.example .env        # 앱키/시크릿, 텔레그램 토큰 채우기

python realtime_monitor.py --check          # 1. 승인키 발급 확인
python realtime_monitor.py --chat-id        # 2. 봇에게 아무 말 보낸 뒤 실행 → TELEGRAM_CHAT_ID 확인해서 .env에
python realtime_monitor.py --test-telegram  # 3. 텔레그램 테스트 메시지
python realtime_monitor.py --raw            # 4. 장중(평일 09:00~15:30) 실행 → 체결 수신 + 종목별 첫 체결 알림
```

- 앱키는 KIS Developers(apiportal.koreainvestment.com)에서 발급. 모의투자 앱키와 실전 앱키는 따로라 `KIS_ENV`를 맞춰야 해요.
- 텔레그램 봇 토큰은 @BotFather에서 `/newbot`으로 발급.
- `--raw`로 찍힌 원문이 이상하게 파싱되면 그 줄을 그대로 공유해 주세요.

## 테스트

```bash
pip install pytest
python -m pytest
```
