#!/usr/bin/env python3
"""텔레그램 봇: 봇에게 보낸 명령으로 관심종목을 넣고, 정한 가격에 닿으면 알려 줘요.

서버가 없어서 GitHub Actions(telegram-bot 워크플로)가 15분마다 이 파일을 돌려요. 그사이 봇에게 온 메시지를 읽고(getUpdates),
기다리는 가격 알림을 야후 5분봉으로 확인해요. 명령은 TELEGRAM_CHAT_ID 대화방에서 온 것만 받아요.

봇에게 보내는 말:
  관심 카카오             대시보드 목록에 없는 종목을 관심종목으로 넣어요 (시세·차트·재무제표가 생겨요)
  관심 빼기 카카오        다시 빼요
  관심 목록               넣은 종목 보기
  알림 삼성전자 300000    그 가격에 닿으면 알려 줘요 (지금보다 높으면 '이상', 낮으면 '이하'). 30만, 250.5달러도 돼요
  알림 목록 / 알림 삭제 2
  도움말
웹앱의 '추가'·'텔레그램으로 알림 받기' 버튼은 같은 명령을 시작 링크(t.me/봇?start=c_…)에 담아 보내요.
기록: paper/watch.json, paper/alerts.json, paper/bot.json (watchlist.py). 매매 신호·가상매매와는 따로예요.

사용법:
    python bot.py                 # 메시지 처리 + 알림 확인 (워크플로에 결과를 GITHUB_OUTPUT으로 넘겨요)
    python bot.py --confirm 123   # 처리한 메시지를 텔레그램 대기열에서 지워요 (기록을 저장(커밋)한 다음에)
"""

import argparse
import base64
import datetime as dt
import json
import os
import re

import symbols
import watchlist
from markets import MARKETS

KST = dt.timezone(dt.timedelta(hours=9))
KIND = {("kr", "KS", "s"): "코스피", ("kr", "KQ", "s"): "코스닥", ("kr", "KS", "e"): "국내 ETF", ("kr", "KQ", "e"): "국내 ETF",
        ("us", "", "s"): "미국 주식", ("us", "", "e"): "미국 ETF"}
MARKET_WORDS = {"kr": "kr", "국장": "kr", "한국": "kr", "코스피": "kr", "코스닥": "kr",
                "us": "us", "미장": "us", "미국": "us"}
HELP = ("이지스톡 봇이에요. 이렇게 보내 주세요.\n"
        "• 관심 카카오 : 대시보드 목록에 없는 종목을 관심종목으로 넣어요\n"
        "• 관심 빼기 카카오 / 관심 목록\n"
        "• 알림 삼성전자 300000 : 그 가격에 닿으면 알려 드려요 (30만, 250.5달러도 돼요)\n"
        "• 알림 목록 / 알림 삭제 2\n"
        "15분마다 확인해서 답이 조금 늦을 수 있어요. 국장 시세는 20분쯤 늦게 들어와요.")


def money(market, x):
    return f"{x:,.0f}원" if market == "kr" else f"{x:,.2f}달러"


def josa(word, pair):
    """받침에 맞는 조사: josa('300,000원', ('을', '를')) → '을'."""
    last = (word or " ")[-1]
    batchim = "가" <= last <= "힣" and (ord(last) - 0xAC00) % 28 != 0
    return pair[0] if batchim else pair[1]


def parse_price(s):
    """'300,000' '30만' '30만원' '$250.5' '250.5달러' → 숫자. 못 읽으면 None."""
    m = re.fullmatch(r"\$?(\d+(?:\.\d+)?)(만|천)?(원|달러|\$)?", (s or "").replace(",", "").strip())
    if not m:
        return None
    v = float(m.group(1)) * {"만": 10000, "천": 1000}.get(m.group(2), 1)
    return v if v > 0 else None


def decode_start(text):
    """'/start c_<base64url>' → 그 안의 명령. 시작 링크가 아니면 그대로."""
    m = re.fullmatch(r"/start(?:@\w+)?(?:\s+(\S+))?", text.strip())
    if not m:
        return text
    payload = m.group(1) or ""
    if not payload.startswith("c_"):
        return "도움말"
    try:
        raw = payload[2:]
        return base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return "도움말"


def parse(text):
    """명령 → (종류, 시장 힌트, 나머지 낱말들). 종류: help, watch_add, watch_remove, watch_list,
    alert_add, alert_remove, alert_list, unknown."""
    text = re.sub(r"\s+", " ", decode_start(text or "")).strip()
    text = re.sub(r"^(관심|알림)(목록|리스트|보기|추가|넣기|등록|설정|빼기|삭제|제거|해제|취소|지우기)", r"\1 \2", text)
    words = text.split(" ") if text else []
    if not words or words[0].lower() in ("도움말", "도움", "help", "/help", "명령어", "?"):
        return "help", None, []
    head, rest = words[0], words[1:]
    if head not in ("관심", "관심종목", "알림"):
        return "unknown", None, words
    kind = "watch" if head != "알림" else "alert"
    action = "add"
    if not rest or rest[0] in ("목록", "리스트", "보기"):
        return f"{kind}_list", None, []
    if rest[0] in ("빼기", "삭제", "제거", "해제", "취소", "지우기"):
        action, rest = "remove", rest[1:]
    elif rest[0] in ("추가", "넣기", "등록", "설정"):
        rest = rest[1:]
    market = None
    if rest and rest[0].lower() in MARKET_WORDS:
        market, rest = MARKET_WORDS[rest[0].lower()], rest[1:]
    return f"{kind}_{action}", market, rest


class Bot:
    """명령 처리와 알림 확인. 시세·재무는 함수로 받아서(테스트에선 가짜) 써요."""

    def __init__(self, paper=watchlist.PAPER, rows=None, last_price=None, intraday=None, now=None):
        self.paper = paper
        self.rows = rows if rows is not None else {m: symbols.load(m, paper / "symbols") for m in ("kr", "us")}
        self.last_price = last_price or yahoo_last_price
        self.intraday = intraday or yahoo_intraday
        self.now = now or (lambda: dt.datetime.now(KST))
        self.watch = watchlist.load_watch(paper)
        self.alerts = watchlist.load_alerts(paper)
        self.username = watchlist.bot_username(paper)
        self.added = []  # 이번에 넣은 종목 (재무를 바로 받으려고)
        self.saved = self.snapshot()

    # ------------------------------------------------------------ 기록

    def snapshot(self):
        return json.dumps([self.watch, self.alerts, self.username], ensure_ascii=False, sort_keys=True)

    def changed(self):
        return self.snapshot() != self.saved

    def save(self):
        if not self.changed():
            return False
        watchlist.write(self.paper / "watch.json", self.watch)
        watchlist.write(self.paper / "alerts.json", self.alerts)
        if self.username:
            watchlist.write(self.paper / "bot.json", dict(username=self.username))
        self.saved = self.snapshot()
        return True

    # ------------------------------------------------------------ 종목 찾기

    def find(self, query, market=None):
        """((시장, 줄), []) 하나로 정해지면 그 종목, 아니면 (None, 후보 [(시장, 줄)])."""
        q = query.strip()
        if not q:
            return None, []
        markets = [market] if market else ["kr", "us"]
        for m in markets:
            for row in self.rows.get(m, []):
                if row[0].lower() == q.lower():
                    return (m, row), []
        qs = symbols.query_keys(q)
        found = []
        for m in markets:
            for row in symbols.search(self.rows.get(m, []), q, limit=6):
                found.append((symbols.score(row, symbols.name_keys(row), qs), m, row))
        found.sort(key=lambda x: x[0])
        if not found:
            return None, []
        top = [f for f in found if f[0] == found[0][0]]
        if len(found) == 1 or (found[0][0] <= 1 and len(top) == 1):
            return (found[0][1], found[0][2]), []
        return None, [(m, row) for _, m, row in found[:5]]

    @staticmethod
    def label(m, row):
        return f"{row[1]}({row[0]})"

    def not_found(self, query, candidates, verb):
        if not candidates:
            return f"'{query}'에 맞는 종목을 못 찾았어요. 이름이나 코드(예: 035720, TSLA)로 다시 보내 주세요."
        lines = [f"'{query}'에 맞는 종목이 여러 개예요. 원하는 종목 코드로 다시 보내 주세요."]
        lines += [f"• {row[1]} ({KIND.get((m, row[2], row[3]), '')}) → {verb} {row[0]}" for m, row in candidates]
        return "\n".join(lines)

    # ------------------------------------------------------------ 명령

    def handle(self, text):
        kind, market, words = parse(text)
        query = " ".join(words)
        if kind == "help":
            return HELP
        if kind == "unknown":
            return "그 말은 몰라서, 아래 명령만 알아들어요.\n\n" + HELP
        if kind == "watch_list":
            return self.watch_list()
        if kind == "alert_list":
            return self.alert_list()
        if kind == "watch_add":
            return self.watch_add(query, market) if query else "넣을 종목을 같이 보내 주세요. 예: 관심 카카오"
        if kind == "watch_remove":
            return self.watch_remove(query) if query else "뺄 종목을 같이 보내 주세요. 예: 관심 빼기 카카오"
        if kind == "alert_remove":
            return self.alert_remove(query) if query else "지울 알림 번호를 같이 보내 주세요. '알림 목록'에서 번호를 볼 수 있어요."
        price = parse_price(words[-1]) if words else None
        if price is None or len(words) < 2:
            return "종목과 가격을 같이 보내 주세요. 예: 알림 삼성전자 300000"
        return self.alert_add(" ".join(words[:-1]), price, market)

    def watch_add(self, query, market):
        hit, candidates = self.find(query, market)
        if not hit:
            return self.not_found(query, candidates, "관심")
        m, row = hit
        code, name = row[0], row[1]
        if code in MARKETS[m]["universe"] or (m == "us" and code == "SPY"):
            return (f"{self.label(m, row)}: 이미 대시보드 목록({MARKETS[m]['name']} 대형주)에 있는 종목이에요. "
                    "앱 관심 화면에서 ☆를 누르면 관심종목에 들어가요.")
        mine = self.watch[m]
        if any(e["code"] == code for e in mine):
            return f"이미 넣어 둔 종목이에요: {self.label(m, row)}"
        if len(mine) >= watchlist.MAX_EXTRAS:
            return f"관심종목은 시장마다 {watchlist.MAX_EXTRAS}개까지예요. '관심 빼기 종목'으로 정리한 뒤 넣어 주세요."
        symbol = f"{code}.{row[2]}" if m == "kr" else code
        mine.append(dict(code=code, name=name, symbol=symbol, exch=row[2], kind=row[3], added=f"{self.now():%Y-%m-%d}"))
        self.added.append((m, code))
        return (f"관심종목에 넣었어요: {name}({code}, {KIND.get((m, row[2], row[3]), '')})\n"
                "대시보드가 다시 올라가면(몇 분 걸려요) 시세·차트·재무제표가 생기고, 앱 관심 화면에 ★로 들어가요.")

    def watch_remove(self, query):
        q, nq = query.strip().lower(), symbols.norm(query)
        for m in ("kr", "us"):
            exact = [e for e in self.watch[m] if e["code"].lower() == q or symbols.norm(e.get("name")) == nq]
            near = exact or [e for e in self.watch[m] if nq and nq in symbols.norm(e.get("name"))]
            if len(near) == 1:
                self.watch[m] = [e for e in self.watch[m] if e is not near[0]]
                return f"관심종목에서 뺐어요: {near[0]['name']}({near[0]['code']})"
            if len(near) > 1:
                names = ", ".join(f"{e['name']}({e['code']})" for e in near)
                return f"'{query}'에 맞는 종목이 여러 개예요: {names}. 코드로 보내 주세요. 예: 관심 빼기 {near[0]['code']}"
        return f"넣어 둔 종목 중에 '{query}'가 없어요. '관심 목록'으로 확인해 보세요."

    def watch_list(self):
        lines = [f"{MARKETS[m]['name']}: " + ", ".join(f"{e['name']}({e['code']})" for e in self.watch[m])
                 for m in ("kr", "us") if self.watch[m]]
        if not lines:
            return "아직 넣은 종목이 없어요. 예: 관심 카카오"
        return "텔레그램으로 넣은 관심종목\n" + "\n".join(lines)

    def alert_add(self, query, price, market):
        hit, candidates = self.find(query, market)
        if not hit:
            return self.not_found(query, candidates, "알림")
        m, row = hit
        active = self.alerts["active"]
        if len(active) >= watchlist.MAX_ALERTS:
            return f"알림은 {watchlist.MAX_ALERTS}개까지예요. '알림 목록'에서 번호를 보고 '알림 삭제 번호'로 정리해 주세요."
        symbol = f"{row[0]}.{row[2]}" if m == "kr" else row[0]
        try:
            now_price = self.last_price(symbol)
        except Exception as e:  # 야후가 막히면 다음에
            print(f"{symbol} 지금 가격 못 받음: {e!r}")
            now_price = None
        if not now_price:
            return "지금 가격을 못 받아서 알림을 못 만들었어요. 잠시 뒤 다시 보내 주세요."
        if abs(price - now_price) < 1e-9:
            return f"지금 가격({money(m, now_price)})과 같아요. 조금 높거나 낮은 가격으로 보내 주세요."
        direction = "up" if price > now_price else "down"
        same = next((a for a in active if a["market"] == m and a["code"] == row[0] and a["price"] == price), None)
        if same:
            return f"같은 알림이 이미 있어요 ({same['id']}번)."
        alert = dict(id=self.alerts["next"], market=m, code=row[0], name=row[1], symbol=symbol, price=price, dir=direction,
                     base=now_price, created=self.now().isoformat(timespec="seconds"))
        self.alerts["next"] += 1
        active.append(alert)
        word = "이상" if direction == "up" else "이하"
        late = " 국장 시세는 20분쯤 늦게 들어와요." if m == "kr" else ""
        now_text = money(m, now_price)
        return (f"알림을 만들었어요 ({alert['id']}번): {self.label(m, row)} {money(m, price)} {word}이 되면 알려 드릴게요.\n"
                f"지금은 {now_text}{josa(now_text, ('이에요', '예요'))}.{late}")

    def alert_list(self):
        active = self.alerts["active"]
        if not active:
            return "기다리는 가격 알림이 없어요. 예: 알림 삼성전자 300000"
        lines = [f"{a['id']}번 {a['name']} {money(a['market'], a['price'])} {'이상' if a['dir'] == 'up' else '이하'}"
                 f" ({a['created'][5:7]}.{a['created'][8:10]} 등록)" for a in active]
        return "기다리는 가격 알림\n" + "\n".join(lines) + "\n지우려면: 알림 삭제 번호"

    def alert_remove(self, query):
        active = self.alerts["active"]
        q = query.strip()
        if re.fullmatch(r"\d+", q):
            gone = [a for a in active if a["id"] == int(q)]
        else:
            nq = symbols.norm(q)
            gone = [a for a in active if a["code"].lower() == q.lower() or (nq and nq in symbols.norm(a["name"]))]
        if not gone:
            return f"'{q}'에 맞는 알림이 없어요. '알림 목록'으로 번호를 확인해 보세요."
        self.alerts["active"] = [a for a in active if a not in gone]
        if len(gone) == 1:
            a = gone[0]
            return f"알림을 지웠어요: {a['id']}번 {a['name']} {money(a['market'], a['price'])} {'이상' if a['dir'] == 'up' else '이하'}"
        return f"{gone[0]['name']} 알림 {len(gone)}개를 지웠어요."

    # ------------------------------------------------------------ 가격 알림 확인

    def check_alerts(self):
        """기다리는 알림마다 만든 뒤의 5분봉을 봐서 가격에 닿았으면 메시지를 돌려줘요 (그 알림은 done으로)."""
        import pandas as pd

        messages, keep, bars_of = [], [], {}
        for a in self.alerts["active"]:
            if a["symbol"] not in bars_of:
                try:
                    bars_of[a["symbol"]] = self.intraday(a["symbol"])
                except Exception as e:  # 야후가 막히면 다음 번에 봐요
                    print(f"{a['symbol']} 5분봉 못 받음: {e!r}")
                    bars_of[a["symbol"]] = None
            bars = bars_of[a["symbol"]]
            hit = None
            if bars is not None and len(bars):
                after = bars[bars.index > pd.Timestamp(a["created"])]
                touched = after[after["High"] >= a["price"]] if a["dir"] == "up" else after[after["Low"] <= a["price"]]
                if len(touched):
                    hit = (touched.index[0], float(after["Close"].iloc[-1]))
            if not hit:
                keep.append(a)
                continue
            at, last = hit
            at = at.tz_convert(KST) if at.tzinfo else at
            self.alerts["done"] = (self.alerts["done"] + [dict(a, hit=at.isoformat(), last=last)])[-watchlist.KEEP_DONE:]
            m = a["market"]
            target, last_text = money(m, a["price"]), money(m, last)
            word = f"{josa(target, ('을', '를'))} 넘었어요" if a["dir"] == "up" else f"{josa(target, ('으로', '로'))} 내려왔어요"
            late = " (국장 시세는 20분쯤 늦어요)" if m == "kr" else ""
            messages.append(f"[가격 알림] {a['name']}({a['code']}) {target}{word}.\n"
                            f"{at:%m.%d %H:%M}(한국시간)에 닿았고, 지금은 {last_text}{josa(last_text, ('이에요', '예요'))}{late}.")
        self.alerts["active"] = keep
        return messages


# ---------------------------------------------------------------- 야후 시세


def yahoo_last_price(symbol):
    import yfinance as yf

    h = yf.Ticker(symbol).history(period="5d", auto_adjust=False)
    return float(h["Close"].dropna().iloc[-1]) if h is not None and len(h) else None


def yahoo_intraday(symbol):
    import yfinance as yf

    return yf.Ticker(symbol).history(period="5d", interval="5m", auto_adjust=False)


# ---------------------------------------------------------------- 텔레그램


class Telegram:
    def __init__(self, token):
        self.token = token

    def call(self, method, **params):
        import requests

        try:
            r = requests.post(f"https://api.telegram.org/bot{self.token}/{method}", json=params, timeout=30)
            data = r.json()
        except Exception as e:  # 오류 문구에 토큰이 들어갈 수 있어서 가려요
            raise RuntimeError(f"텔레그램 {method} 실패: {str(e).replace(self.token, '***')}") from None
        if not data.get("ok"):
            raise RuntimeError(f"텔레그램 {method} 실패: {data.get('description')}")
        return data["result"]

    def send(self, chat_id, text):
        self.call("sendMessage", chat_id=chat_id, text=text[:4000], disable_web_page_preview=True)


def output(**values):
    """워크플로 다음 단계로 넘기는 값 (GITHUB_OUTPUT)."""
    path = os.getenv("GITHUB_OUTPUT")
    lines = [f"{k}={v}" for k, v in values.items()]
    print("\n".join(lines))
    if path:
        with open(path, "a") as f:
            f.write("\n".join(lines) + "\n")


def run(tg, chat_id, bot):
    """메시지 처리 → 알림 확인 → 기록 저장. 반환: 다음 offset(처리한 메시지가 없으면 None)."""
    me = tg.call("getMe")
    bot.username = me.get("username") or bot.username
    offset = None
    for update in tg.call("getUpdates", timeout=0, allowed_updates=["message"]):
        offset = max(offset or 0, update["update_id"] + 1)
        msg = update.get("message") or {}
        if str((msg.get("chat") or {}).get("id")) != str(chat_id) or not msg.get("text"):
            continue  # 내 대화방이 아닌 메시지는 답하지 않아요
        try:
            reply = bot.handle(msg["text"])
        except Exception as e:  # 한 메시지 때문에 나머지가 막히지 않게
            print(f"명령 처리 실패: {e!r}")
            reply = "처리하다 문제가 생겼어요. 잠시 뒤 다시 보내 주세요."
        tg.send(chat_id, reply)
    for text in bot.check_alerts():
        tg.send(chat_id, text)
    bot.save()
    return offset


def add_fundamentals(bot):
    """이번에 넣은 종목의 재무를 바로 받아 둬요 (원래는 매주 토요일). 실패해도 괜찮아요."""
    import fundamentals

    for m, code in bot.added:
        try:
            fundamentals.update(bot.paper / m / "fundamentals.json", m, [code], merge=True, pause=0.2, retries=1)
        except Exception as e:
            print(f"{code} 재무 못 받음: {e!r}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--confirm", type=int, help="이 번호 앞의 메시지를 처리했다고 텔레그램에 알려요")
    args = ap.parse_args()
    token, chat_id = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip(), (os.getenv("TELEGRAM_CHAT_ID") or "").strip()
    if not token or not chat_id:
        print("텔레그램 미설정 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID): 할 일 없음")
        return
    tg = Telegram(token)
    if args.confirm:
        tg.call("getUpdates", offset=args.confirm, timeout=0, limit=1)
        print("처리한 메시지 확인 완료")
        return
    bot = Bot()
    before = bot.saved
    offset = run(tg, chat_id, bot)
    add_fundamentals(bot)
    changed = bot.saved != before or bool(bot.added)
    output(offset=offset or "", changed=str(changed).lower())


if __name__ == "__main__":
    main()
