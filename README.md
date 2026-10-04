# -2easy-stock

KIS(한국투자증권) Open API로 실시간 체결가를 받아 텔레그램으로 알려주는 감시봇.

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
python -m unittest discover tests
```
