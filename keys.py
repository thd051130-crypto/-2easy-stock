#!/usr/bin/env python3
"""API 키 만료 미리 알림 + 막힘 감지 (매일 아침 한 번, 알릴 게 없으면 조용히).

1. 만료일: api_keys.json의 expires 날짜를 세서 30·14·7·3·1일 전과 당일(그 뒤로도 매일)에 "[키 만료 예정]"을 보내요.
   DART·ECOS는 만료일을 물어볼 API가 없어서 날짜는 직접 적어요. 모르면 null.
2. 막힘: 저장소 Secrets에 있는 키로 실제 한 번 불러 봐서 인증 오류가 나면 "[키 막힘]"을 보내요.
   네트워크 오류·호출 한도 초과는 키 문제가 아니라서 알리지 않아요.
   막힌 날이 이어지면 처음 한 번만 보내요 (바로 전 실행도 실패였으면 조용히). 막히면 실행은 실패(빨간불)로 끝나요.
키 값은 출력·알림에 절대 남기지 않아요. 무료 API만 불러요.
"""

import argparse
import datetime as dt
import json
import os
import pathlib
import sys

import requests

KST = dt.timezone(dt.timedelta(hours=9))
PATH = pathlib.Path("api_keys.json")
WARN_DAYS = (30, 14, 7, 3, 1, 0)


def _dart(key, get):
    j = get("https://opendart.fss.or.kr/api/list.json", params={"crtfc_key": key, "page_count": 1}, timeout=20).json()
    status = str(j.get("status", ""))
    # 000 정상, 013 자료 없음, 020 한도 초과(키는 살아 있음) / 010 등록 안 된 키, 011 사용할 수 없는 키, 012 접근 안 되는 IP, 901 개인정보 보유기간 만료 키
    return (status in ("010", "011", "012", "901")), f"{status} {j.get('message', '')}".strip()


def _ecos(key, get):
    j = get(f"https://ecos.bok.or.kr/api/KeyStatisticList/{key}/json/kr/1/1", timeout=20).json()
    res = j.get("RESULT") or {}
    code = str(res.get("CODE", ""))
    # INFO-100 인증키가 유효하지 않음, ERROR-? 형식 오류
    return code == "INFO-100", f"{code} {res.get('MESSAGE', '')}".strip() if code else "정상"


PINGS = {"DART_API_KEY": _dart, "ECOS_API_KEY": _ecos}


def due(expires, today):
    """만료까지 남은 날 (알릴 날이 아니면 None)."""
    if not expires:
        return None
    left = (dt.date.fromisoformat(expires) - today).days
    return left if left in WARN_DAYS or left < 0 else None


def expiry_lines(cfg, today):
    out = []
    for info in cfg.get("keys", {}).values():
        left = due(info.get("expires"), today)
        if left is None:
            continue
        when = "오늘 만료" if left == 0 else (f"{-left}일 전에 만료됐어요" if left < 0 else f"D-{left}")
        out += [f"[키 만료 예정] {info['name']}", f"{when} · {info['expires']} 만료",
                f"막히면 멈추는 것: {info.get('uses', '')}", f"연장: {info.get('renew', '')}", ""]
    return out


def blocked(cfg, env, get=requests.get):
    """[(키 이름, 이유, 막히는 것)] — 키가 있는데 인증 오류가 난 것만."""
    out = []
    for secret, ping in PINGS.items():
        key = (env.get(secret) or "").strip()
        if not key:
            continue
        info = cfg.get("keys", {}).get(secret, {"name": secret})
        try:
            bad, why = ping(key, get)
        except Exception as e:  # 네트워크 문제는 키 문제가 아니에요. 키가 주소에 들어가서 오류 글은 남기지 않아요
            print(f"참고: {info['name']} 확인 못 함 ({type(e).__name__})")
            continue
        print(f"{info['name']}: {'막힘' if bad else '정상'} ({why})")
        if bad:
            out.append((info["name"], why, info.get("uses", "")))
    return out


def blocked_lines(rows):
    out = []
    for name, why, uses in rows:
        out += [f"[키 막힘] {name}", f"오늘 불러 보니 인증 오류가 났어요 ({why})", f"막힌 것: {uses}",
                "새 키를 받아 저장소 Secrets에 다시 넣어 주세요", ""]
    return out


def previous_failed():
    """바로 전 keys 실행도 실패였는지 (같은 막힘 알림을 매일 반복하지 않게)."""
    import health

    token, repo, run_id = os.getenv("GITHUB_TOKEN"), os.getenv("GITHUB_REPOSITORY"), os.getenv("GITHUB_RUN_ID")
    if not (token and repo and run_id):
        return False
    try:
        return health.previous_failed(repo, token, "keys", run_id)
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="보내지 않고 화면에만")
    args = ap.parse_args()
    cfg = json.loads(PATH.read_text(encoding="utf-8"))
    today = dt.datetime.now(KST).date()
    bad = blocked(cfg, os.environ)
    lines = expiry_lines(cfg, today)
    if bad and not previous_failed():
        lines = blocked_lines(bad) + lines
    text = "\n".join(lines).strip()
    if text:
        print(text)
        if not args.dry_run:
            import health

            if not health.send_telegram(text):
                raise SystemExit("텔레그램 전송 실패")
    else:
        print("알릴 것 없음")
    if bad:
        sys.exit(1)  # 빨간불로 남겨서 다음 날 같은 알림을 다시 보내지 않게


if __name__ == "__main__":
    main()
