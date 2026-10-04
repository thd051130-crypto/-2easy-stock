# stockbot — KIS 실시간 시세 → Claude 매매 의견 → 텔레그램

```
KIS WebSocket(H0STCNT0 체결가) → 신호 엔진 → (큐) → Claude 의견 → 텔레그램
                                  └ 틱 처리는 논블로킹: Claude가 느려도 시세 수신은 안 밀림
```

**알림 전용입니다. 주문 기능은 없습니다.** Claude는 제공된 시세 데이터만 보고 의견(매수/매도/관망, 근거, 손절가, 리스크, 신뢰도)을 쓰며 뉴스·공시는 모릅니다. 투자 판단과 손익은 본인 책임입니다.

## 빠른 시작

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env     # 값 채우기 (아래 표)

stockbot simulate        # ① 키 없이도 가능: 가짜 시세로 신호→(Claude)→알림 흐름 확인
stockbot check           # ② KIS 토큰·일봉 / 텔레그램 / Claude 연결 점검
stockbot run             # ③ 실시간 감시 시작
pytest                   # 테스트 (42개, 네트워크 불필요)
```

권장 순서: `simulate` → `.env` 채우기 → `check` → **모의투자(`KIS_ENV=paper`)로 며칠** → 필요하면 실전 키로 전환.
`stockbot simulate --telegram` 은 가짜 신호를 실제 텔레그램으로 보냅니다 (Claude 키가 있으면 실제 의견 포함).

## 준비물

| 항목 | 방법 |
|---|---|
| KIS 앱키/시크릿 | [KIS Developers](https://apiportal.koreainvestment.com) 가입 → 모의투자 신청 → App Key/Secret. 모의/실전 키는 별도 |
| 텔레그램 | @BotFather → `/newbot` → 토큰. 봇에게 아무 말이나 보낸 뒤 @userinfobot 으로 chat_id 확인 |
| Anthropic | API 키 (`ANTHROPIC_API_KEY`) |

설정은 `.env` (`.env.example` 참고). 키는 코드에 넣지 않으며 `.env`는 git에서 제외됩니다.

## 신호 (기본값, `.env`로 조절)

| 신호 | 조건 | 재발동 |
|---|---|---|
| 🚀 SURGE / 📉 PLUNGE | 전일 대비 ±`SURGE_PCT`% 단계(5, 10, 15…)를 처음 넘을 때 | 단계마다 1회 |
| 📊 VOLUME_SPIKE | 누적거래량 ≥ 20일 평균 일거래량 × `VOLUME_MULT` | 쿨다운 30분 |
| 📈 MA_BREAKOUT | 전일 종가는 20일선 아래, 현재가는 20일선 +0.2% 위 | 쿨다운 30분 |

- 같은 틱에 여러 조건이 겹치면 **알림 1건·Claude 호출 1회**로 합쳐집니다.
- 장중(09:00~15:20)만 신호를 냅니다. 장전 예상체결·동시호가는 제외.
- 종목당 하루 최대 `MAX_ALERTS_PER_SYMBOL_DAY`건.
- 신호 상태(단계·쿨다운)는 메모리에만 있어, **장중에 봇을 재시작하면 이미 조건을 넘은 종목은 첫 틱에 다시 알림**이 갑니다.
- 기준값(전일 종가, 20일선, 평균 거래량)은 시작 시 + 매일 08:30(KST)에 KIS 일봉으로 갱신합니다. 일봉을 못 받아도 가격 기반 신호(SURGE/PLUNGE)는 동작합니다.
- **조건은 출발점입니다.** 본인 전략에 맞게 `stockbot/signals.py`의 `SignalEngine`을 고치세요 (네트워크 호출이 없어 테스트하기 쉽습니다: `tests/test_signals.py`).

## Claude

- 기본 모델 `claude-opus-5-5`, effort `low`. 더 싸게 쓰려면 `CLAUDE_MODEL=claude-sonnet-5-5`.
- 응답은 JSON 스키마로 강제됩니다. **손절가는 코드가 한 번 더 검증**합니다 (매수인데 현재가 이상이거나 −15%보다 멀면 폐기하고 "직접 설정 필요"로 표시).
- 실패·타임아웃(`CLAUDE_TIMEOUT_SEC`)·거절·시간당 한도(`MAX_CLAUDE_CALLS_PER_HOUR`) 초과 시 **의견 없이 신호만 즉시 알림**합니다. 알림이 Claude 때문에 유실되지는 않습니다.

## 24시간 운영

- 집 PC/서버: `deploy/stockbot.service` (systemd, 자동 재시작). 로그는 `journalctl -u stockbot -f`.
- 서버는 한국 리전이 좋습니다 (Oracle Cloud Always Free ARM 등). 파이썬 3.10+, 메모리 수십 MB면 충분.
- 웹소켓은 끊기면 1→2→4…60초 백오프로 재접속하고 **구독을 자동 복구**합니다. 90초 무응답(죽은 연결)도 재접속하며, 3회 연속 실패하면 텔레그램으로 알리고 복구 시 다시 알립니다.
- KIS 접근토큰은 `.state/`에 캐시(권한 600)해서 재시작해도 재발급하지 않습니다.

## 구조

```
stockbot/
  kis.py       토큰/접속키, 일봉 REST, H0STCNT0 파서, WebSocket(재접속·PINGPONG)
  signals.py   신호 엔진 (순수 로직)
  advisor.py   Claude 호출, 프롬프트, 스키마, 손절가 검증, 시간당 한도
  notifier.py  메시지 포맷 + 텔레그램/콘솔 전송
  bot.py       조립: 틱 → 큐 → 워커(Claude → 텔레그램), 08:30 기준값 갱신
  simulate.py  가짜 시세
tests/         파서, 신호, Claude 응답 처리, 텔레그램, 로컬 웹소켓 서버로 재접속까지
```

## 알아둘 것

- 실시간 체결가(H0STCNT0)는 KRX 종목만 해당합니다 (NXT/통합시세 아님).
- KIS 웹소켓은 세션당 구독 41종목 한도. 같은 앱키로 여러 곳에서 동시에 접속하면 서로 끊을 수 있으니 하나만 띄우세요.
- 이 저장소의 KIS 연동은 공식 필드 정의를 바탕으로 작성했고 모의 프레임/로컬 웹소켓 서버로 검증했습니다. **실제 KIS 서버 기준 첫 검증은 `stockbot check` + 모의투자 장중 관찰**로 하세요.
