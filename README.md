# -2easy-stock

KIS(한국투자증권) Open API로 실시간 체결가를 받아 텔레그램으로 알려주는 감시봇.

## 실계정 연결 확인 (5단계)

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
