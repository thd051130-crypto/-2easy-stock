#!/usr/bin/env python3
"""KIS(한국투자증권) WebSocket 실시간 체결가 수신 + 텔레그램 알림. 주문은 하지 않고 시세만 받아요.

프레임 형식과 필드 순서는 공식 샘플(https://github.com/koreainvestment/open-trading-api)과 대조했어요.
  - 국내 H0STCNT0: examples_user/domestic_stock/domestic_stock_functions_ws.py ccnl_krx (46필드)
  - 해외 HDFSCNT0: legacy/websocket/python/ws_overseas_stock.py menulist (26필드, 맨 앞 실시간종목코드 포함)
  - 해외 실시간은 실전 계정만 되고, 모의투자에선 받을 수 없어요.

사용법:
  python realtime_monitor.py                  # 시세 수신 시작 (종목별 첫 체결 때 텔레그램 알림 1회)
  python realtime_monitor.py --raw            # 받은 원문 프레임도 같이 출력 (파싱 대조용)
  python realtime_monitor.py --check          # 승인키 발급만 확인하고 종료
  python realtime_monitor.py --test-telegram  # 텔레그램 테스트 메시지 전송
  python realtime_monitor.py --chat-id        # 봇에 보낸 메시지에서 TELEGRAM_CHAT_ID 찾기

.env: KIS_APP_KEY, KIS_APP_SECRET, KIS_ENV(real|mock, 기본 mock), KIS_MARKET(kr|us, 기본 kr),
      KIS_SYMBOLS(쉼표 구분, 선택), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
"""

import argparse
import asyncio
import json
import os

import requests
import websockets
from dotenv import load_dotenv

load_dotenv()

ENVS = {
    "real": ("https://openapi.koreainvestment.com:9443", "ws://ops.koreainvestment.com:21000"),
    "mock": ("https://openapivts.koreainvestment.com:29443", "ws://ops.koreainvestment.com:31000"),
}
# tr_id, 종목 키(tr_key), 한 건의 필드 이름(응답 순서대로)
MARKETS = {
    "kr": {
        "tr_id": "H0STCNT0",
        "symbols": {"005930": "삼성전자", "000660": "SK하이닉스"},
        "fields": [
            "code", "time", "price", "sign", "diff", "rate", "wavg", "open", "high", "low",
            "ask1", "bid1", "volume", "acc_volume", "acc_amount", "sell_count", "buy_count", "net_buy_count",
            "strength", "sell_volume", "buy_volume", "ccld_dvsn", "buy_rate", "prev_vol_rate",
            "open_time", "open_sign", "open_diff", "high_time", "high_sign", "high_diff",
            "low_time", "low_sign", "low_diff", "biz_date", "new_mkop_cls", "halted",
            "ask1_qty", "bid1_qty", "total_ask_qty", "total_bid_qty", "turnover",
            "prev_same_time_vol", "prev_same_time_vol_rate", "hour_cls", "mrkt_trtm_cls", "vi_price",
        ],
    },
    "us": {
        "tr_id": "HDFSCNT0",
        # D + 거래소(NAS/NYS/AMS) + 티커
        "symbols": {"DNASNVDA": "NVDA", "DNASTSLA": "TSLA", "DNASAAPL": "AAPL", "DNASAMD": "AMD", "DNASMETA": "META"},
        "fields": ["rsym", "code", "zdiv", "local_date", "local_day", "local_time", "kr_date", "kr_time",
                   "open", "high", "low", "price", "sign", "diff", "rate", "bid", "ask", "bid_vol", "ask_vol",
                   "volume", "acc_volume", "amount", "bid_ratio", "ask_ratio", "strength", "session"],
    },
}


def get_approval_key(rest_url, app_key, app_secret):
    resp = requests.post(f"{rest_url}/oauth2/Approval", timeout=10,
                         json={"grant_type": "client_credentials", "appkey": app_key, "secretkey": app_secret})
    if resp.status_code != 200:
        raise SystemExit(f"승인키 발급 실패 {resp.status_code}: {resp.text[:300]}\n"
                         f"→ KIS_ENV(real/mock)와 앱키 종류가 맞는지 확인하세요 (모의투자 앱키는 따로 발급돼요)")
    return resp.json()["approval_key"]


def subscribe_message(approval_key, tr_id, tr_key):
    return json.dumps({
        "header": {"approval_key": approval_key, "custtype": "P", "tr_type": "1", "content-type": "utf-8"},
        "body": {"input": {"tr_id": tr_id, "tr_key": tr_key}},
    })


def parse_frame(raw, fields):
    """'0|TR_ID|건수|값^값^...' 형식을 필드 이름 dict 목록으로.

    한 프레임에 여러 건이 오면 값이 '^'로 이어 붙어 와요(공식 샘플도 건수만큼 잘라서 씀).
    '1'로 시작하는 프레임은 AES 암호화된 체결통보라 시세 파서로는 읽을 수 없어 빈 목록을 돌려줘요.
    """
    parts = raw.split("|", 3)
    if len(parts) < 4 or parts[0] != "0":
        return []
    try:
        count = int(parts[2])
    except ValueError:
        return []
    values = parts[3].split("^")
    if count <= 0 or len(values) % count:
        return []
    width = len(values) // count
    return [dict(zip(fields, values[k * width:(k + 1) * width])) for k in range(count)]


def send_telegram(text):
    token, chat_id = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip(), (os.getenv("TELEGRAM_CHAT_ID") or "").strip()
    if not token or not chat_id:
        print("(텔레그램 미설정: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)", flush=True)
        return False
    try:
        resp = requests.post(f"https://api.telegram.org/bot{token}/sendMessage", timeout=10,
                             json={"chat_id": chat_id, "text": text})
    except requests.RequestException as e:
        print(f"텔레그램 전송 실패: {e!r}", flush=True)
        return False
    if not resp.ok:
        print(f"텔레그램 전송 실패 {resp.status_code}: {resp.text[:200]}", flush=True)
    return resp.ok


def find_chat_id():
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit(".env에 TELEGRAM_BOT_TOKEN을 먼저 넣으세요")
    token = token.strip()
    updates = requests.get(f"https://api.telegram.org/bot{token}/getUpdates", timeout=10).json()
    if not updates.get("ok"):
        raise SystemExit(f"텔레그램이 토큰을 거부했어요 ({updates.get('description')}). "
                         "BotFather에서 토큰을 다시 Copy 해서 TELEGRAM_BOT_TOKEN을 고쳐 넣으세요")
    me = requests.get(f"https://api.telegram.org/bot{token}/getMe", timeout=10).json().get("result", {})
    print(f"토큰 정상: @{me.get('username')}")
    chats = {u["message"]["chat"]["id"]: u["message"]["chat"].get("first_name") or u["message"]["chat"].get("title")
             for u in updates.get("result", []) if "message" in u}
    if not chats:
        raise SystemExit(f"@{me.get('username')} 대화방에서 시작(START)을 누르고 아무 메시지나 보낸 뒤 다시 실행하세요")
    for chat_id, name in chats.items():
        print(f"TELEGRAM_CHAT_ID={chat_id}  ({name})")


def format_tick(label, tick):
    return f"{label} {tick['price']} ({tick.get('rate', '?')}%) 거래량 {tick.get('volume', '?')}"


async def listen(ws, market, show_raw=False):
    names = market["symbols"]
    alerted = set()
    async for raw in ws:
        if show_raw:
            print("RAW:", raw[:300], flush=True)
        if raw[0] in "01":
            ticks = parse_frame(raw, market["fields"])
            if not ticks:
                print("읽을 수 없는 프레임:", raw[:200], flush=True)
            for tick in ticks:
                key = tick.get("rsym") or tick.get("code")
                label = names.get(key) or tick.get("code")
                print(f"{label:>8} | {tick['price']:>10} | 거래량 {tick.get('volume', '?')}", flush=True)
                if key not in alerted:  # 연결 확인용: 종목마다 첫 체결 한 번만 알림
                    alerted.add(key)
                    send_telegram(f"[실시간 연결 확인] {format_tick(label, tick)}")
            continue
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            print("알 수 없는 메시지:", raw[:200], flush=True)
            continue
        header, body = msg.get("header", {}), msg.get("body") or {}
        if header.get("tr_id") == "PINGPONG":
            await ws.pong(raw)  # 서버 핑에 응답하지 않으면 연결이 끊겨요 (공식 샘플과 동일)
        elif body.get("rt_cd") not in (None, "0"):
            print(f"구독 실패 [{header.get('tr_key')}]: {body.get('msg1')}", flush=True)
        else:
            print(f"구독 응답 [{header.get('tr_key')}]: {body.get('msg1')}", flush=True)


def load_config():
    app_key, app_secret = os.getenv("KIS_APP_KEY"), os.getenv("KIS_APP_SECRET")
    if not app_key or not app_secret:
        raise SystemExit(".env에 KIS_APP_KEY, KIS_APP_SECRET을 설정하세요")
    env, market_name = os.getenv("KIS_ENV", "mock"), os.getenv("KIS_MARKET", "kr")
    if env not in ENVS or market_name not in MARKETS:
        raise SystemExit("KIS_ENV는 real|mock, KIS_MARKET은 kr|us 중 하나여야 해요")
    if env == "mock" and market_name == "us":
        print("주의: 해외 실시간 시세는 모의투자에서 지원되지 않아요. KIS_ENV=real로 바꾸세요", flush=True)
    market = dict(MARKETS[market_name])
    if os.getenv("KIS_SYMBOLS"):
        market["symbols"] = {s.strip(): s.strip() for s in os.getenv("KIS_SYMBOLS").split(",") if s.strip()}
    return app_key, app_secret, ENVS[env], market


async def run(show_raw=False):
    app_key, app_secret, (rest_url, ws_url), market = load_config()
    delay = 1
    while True:  # 끊기면 승인키부터 다시 받아 재연결 (최대 60초 간격)
        try:
            approval_key = get_approval_key(rest_url, app_key, app_secret)
            async with websockets.connect(f"{ws_url}/tryitout", ping_interval=None) as ws:
                for key in market["symbols"]:
                    await ws.send(subscribe_message(approval_key, market["tr_id"], key))
                    await asyncio.sleep(0.2)
                print(f"구독 {len(market['symbols'])}종목, 수신 대기 (국내는 평일 09:00~15:30에만 체결이 와요)", flush=True)
                delay = 1
                await listen(ws, market, show_raw)
        except (OSError, websockets.ConnectionClosed, requests.RequestException) as e:
            print(f"연결 끊김({e!r}), {delay}초 뒤 재연결", flush=True)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw", action="store_true", help="원문 프레임 출력")
    ap.add_argument("--check", action="store_true", help="승인키 발급만 확인")
    ap.add_argument("--test-telegram", action="store_true", help="텔레그램 테스트 메시지 전송")
    ap.add_argument("--chat-id", action="store_true", help="TELEGRAM_CHAT_ID 찾기")
    args = ap.parse_args()

    if args.chat_id:
        find_chat_id()
    elif args.test_telegram:
        ok = send_telegram("[easy-stock] 텔레그램 테스트 메시지예요. 이게 보이면 알림 설정 완료!")
        if not ok:
            raise SystemExit("전송 실패")
        print("전송 성공")
    elif args.check:
        app_key, app_secret, (rest_url, _), _ = load_config()
        key = get_approval_key(rest_url, app_key, app_secret)
        print(f"승인키 발급 성공 ({key[:8]}...). 이제 옵션 없이 실행하면 시세를 받아요")
    else:
        asyncio.run(run(args.raw))


if __name__ == "__main__":
    main()
