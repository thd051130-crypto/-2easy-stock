#!/usr/bin/env python3
"""고장 감시: 자동 작업이 실패하면 바로, 일요일엔 한 주 동안 잘 돌았는지 텔레그램으로 알려 줘요.

알림이 안 온 날이 "쉬는 날"인지 "고장"인지 구분할 수 있게 하려는 거예요.
  - 워크플로가 실패하면 마지막 단계에서 `python health.py fail`이 "[고장]" 알림을 보내요.
    15분마다 도는 telegram-bot처럼 같은 실패가 이어지면 처음 한 번만 보내요 (바로 전 실행도 실패였으면 조용히).
  - 매일 자료를 만들기 전에 check_data()로 시세 데이터를 점검해요 (daily.py가 불러요).
    대형주 30% 넘게 시세가 비었거나 지수가 없으면 그날 자료를 만들지 않고 "[고장]"으로 알려요.
  - `python health.py weekly`: 지난 7일 워크플로 실행 결과를 세서 "[주간 점검]"을 보내고 paper/health.json에 남겨요
    (대시보드가 읽어요).

GitHub API는 워크플로가 주는 GITHUB_TOKEN으로 읽어요 (actions: read 권한). 유료 서비스는 안 써요.
"""

import argparse
import datetime as dt
import json
import os
import pathlib
import urllib.parse
import urllib.request

import inbox
import tgfmt

KST = dt.timezone(dt.timedelta(hours=9))
API = "https://api.github.com"
PATH = pathlib.Path("paper/health.json")
ERROR_NOTE = pathlib.Path("data/health_error.txt")  # 작업이 멈춘 이유를 남기면 고장 알림에 붙여요
MISSING_MAX = 0.30   # 이보다 많은 종목이 비면 그날 자료를 만들지 않아요
JUMP_MAX = 0.30      # 하루 ±30% 넘게 움직인 종목은 데이터 오류일 수 있어서 경고
STALE_BDAYS = 3      # 지수 마지막 날짜가 평일 기준 이만큼 넘게 지났으면 경고 (연휴면 정상)

# 워크플로 이름 → (한국어 이름, 한 주에 몇 번 성공해야 정상인지; None이면 세지 않음)
WORKFLOWS = {
    "daily": ("매일 시세·오늘의 리포트", 10),
    "telegram-bot": ("텔레그램 봇", None),
    "pages": ("대시보드 배포", None),
    "fundamentals": ("재무·종목 목록", 1),
    "weekly": ("주간 리포트", 1),
    "macro": ("경기 리포트", 5),
    "world": ("세계 지수·환율", 5),
    "all-stocks": ("전 종목 차트", 10),
    "disclosures": ("공시 알림", None),
    "news": ("장중 뉴스", None),
}


# ---------------------------------------------------------------- 시세 데이터 점검

def check_data(closes, index_close, codes, today, names=None):
    """(신호를 멈출 문제, 경고) 두 목록을 돌려줘요. 문장은 텔레그램에 그대로 붙여요."""
    import numpy as np
    import pandas as pd

    names = names or {}
    errors, warnings = [], []
    idx = index_close.dropna() if index_close is not None else pd.Series(dtype=float)
    if idx.empty:
        return ["지수 시세를 못 받았어요."], warnings
    codes = list(codes)
    present = [c for c in codes if c in closes.columns and closes[c].notna().any()]
    missing = [c for c in codes if c not in present]
    last = idx.index[-1]
    stale = [c for c in present if closes[c].last_valid_index() is None or closes[c].last_valid_index() < last]
    bad = len(missing) + len(stale)
    if codes and bad / len(codes) > MISSING_MAX:
        errors.append(f"종목 {len(codes)}개 중 {bad}개 시세가 비었거나 마지막 날({last:%m-%d})이 빠졌어요.")
    elif bad:
        who = ", ".join(names.get(c, c) for c in (missing + stale)[:5]) + (" 등" if bad > 5 else "")
        warnings.append(f"시세가 빈 종목 {bad}개는 오늘 계산에서 빠졌어요: {who}")
    gap = int(np.busday_count(last.date(), today)) if last.date() < today else 0
    if gap > STALE_BDAYS:
        warnings.append(f"지수 마지막 날짜가 {last:%m-%d}이에요 (평일 {gap}일 전). 연휴가 아니면 야후 데이터가 늦는 거예요.")
    if len(closes) >= 2 and present:
        move = (closes[present].iloc[-1] / closes[present].iloc[-2] - 1).dropna()
        jumps = move[move.abs() > JUMP_MAX]
        if len(jumps):
            who = ", ".join(f"{names.get(c, c)} {r:+.0%}" for c, r in jumps.items())
            warnings.append(f"하루에 30% 넘게 움직인 종목이 있어요 (데이터 오류일 수 있어요): {who}")
    return errors, warnings


# ---------------------------------------------------------------- GitHub 실행 기록

# 고장 알림은 패키지 설치가 실패한 경우에도 가야 해서 표준 라이브러리(urllib)만 써요

def gh_get(path, token, **params):
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())


def send_telegram(text):
    """보기 좋게(tgfmt.py: 굵은 제목·이모지) HTML로 보내요. 거절되면 보통 글로 다시."""
    token, chat_id = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip(), (os.getenv("TELEGRAM_CHAT_ID") or "").strip()
    if not token or not chat_id:
        print("(텔레그램 미설정: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)")
        return False

    def post(**params):
        body = json.dumps(dict(params, chat_id=chat_id, disable_web_page_preview=True)).encode()
        req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=body,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.status == 200
        except Exception as e:
            print(f"텔레그램 전송 실패: {str(e).replace(token, '***')}")
            return False

    ok = True
    for part in tgfmt.render(text):
        ok = (post(text=part, parse_mode="HTML") or post(text=tgfmt.plain(part))) and ok
    inbox.add_text(text, "health")  # 앱 메시지함 (고장 알림은 실패한 실행이라 저장이 안 돼요)
    return ok


def runs_since(repo, token, workflow, since):
    """그 워크플로의 since 이후 실행 목록 (끝난 것만)."""
    out, page = [], 1
    while True:
        data = gh_get(f"/repos/{repo}/actions/workflows/{workflow}.yml/runs", token, per_page=100, page=page,
                      created=f">={since:%Y-%m-%dT%H:%M:%SZ}")
        runs = data.get("workflow_runs", [])
        out += [r for r in runs if r.get("status") == "completed"]
        if len(runs) < 100 or page >= 10:
            return out
        page += 1


def workflow_age_days(repo, token, workflow, now):
    """워크플로 파일이 main에 생긴 지 며칠 됐는지 (새로 생긴 작업은 한 주 몫을 다 채울 수 없어서)."""
    created = gh_get(f"/repos/{repo}/actions/workflows/{workflow}.yml", token).get("created_at")
    if not created:
        return None
    return (now - dt.datetime.fromisoformat(created.replace("Z", "+00:00"))).total_seconds() / 86400


def never_started(repo, token, run):
    """GitHub가 서버(러너)를 못 붙여서 한 단계도 못 돈 실행인지. 우리 코드 고장이 아니라 GitHub 쪽 사정이에요."""
    jobs = gh_get(f"/repos/{repo}/actions/runs/{run['id']}/jobs", token).get("jobs", [])
    return bool(jobs) and all(not j.get("steps") for j in jobs)


def previous_failed(repo, token, workflow, run_id):
    """바로 전에 끝난 실행도 실패였는지 (같은 고장 알림을 15분마다 보내지 않으려고)."""
    data = gh_get(f"/repos/{repo}/actions/workflows/{workflow}.yml/runs", token, per_page=10, status="completed")
    before = [r for r in data.get("workflow_runs", []) if r["id"] != int(run_id)]
    return bool(before) and before[0].get("conclusion") == "failure"


def record_error(text, path=ERROR_NOTE):
    """작업을 멈추기 전에 이유를 남겨요. 실패 알림(health.py fail)이 읽어서 같이 보내요."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(text.strip() + "\n")


def failure_message(workflow, run_url, step=None, note=None):
    label = WORKFLOWS.get(workflow, (workflow, None))[0]
    lines = [f"[고장] {label}({workflow}) 자동 실행이 실패했어요."]
    if step:
        lines.append(f"멈춘 단계: {step}")
    if note:
        lines.append(f"이유: {note.strip()}")
    lines += ["오늘 이 작업의 알림이나 기록이 빠졌을 수 있어요. 다음 실행에서 대개 저절로 다시 돌아요.",
              f"자세한 기록: {run_url}"]
    return "\n".join(lines)


def summarize(runs_by_workflow, now, ages=None):
    """{워크플로: [실행]} → 주간 점검 결과 dict (health.json에 저장하는 모양).

    ages: {워크플로: 생긴 지 며칠} — 7일이 안 된 새 작업은 예정 횟수를 그만큼 줄여요.
    실행 dict에 github_side=True가 있으면 GitHub가 서버를 못 붙여 못 돈 것이라 고장으로 세지 않아요.
    """
    rows, ok_all = [], True
    ages = ages or {}
    for wf, runs in runs_by_workflow.items():
        label, expected = WORKFLOWS.get(wf, (wf, None))
        age = ages.get(wf)
        if expected and age is not None and age < 7:
            expected = int(expected * max(age, 0) / 7)  # 생긴 날부터 지난 날만큼만
        good = sum(r.get("conclusion") == "success" for r in runs)
        failed = [r for r in runs if r.get("conclusion") == "failure" and not r.get("github_side")]
        skipped = sum(bool(r.get("github_side")) for r in runs)
        healthy = not failed and (not expected or good + skipped >= expected)
        ok_all &= healthy
        rows.append(dict(workflow=wf, label=label, success=good, failure=len(failed), expected=expected or None,
                         github_skipped=skipped, ok=healthy,
                         last_failure=failed[0].get("created_at") if failed else None))
    return dict(checked=now.isoformat(timespec="minutes"), ok=ok_all, workflows=rows)


def weekly_message(result):
    lines = [f"[주간 점검] {result['checked'][:10]} 지난 7일 자동 실행"]
    for r in result["workflows"]:
        mark = "정상" if r["ok"] else "확인 필요"
        count = f"성공 {r['success']}회" + (f"/{r['expected']}회 예정" if r["expected"] else "")
        fail = f", 실패 {r['failure']}회" if r["failure"] else ""
        skip = f", GitHub 서버 사정으로 못 돈 것 {r['github_skipped']}회" if r.get("github_skipped") else ""
        lines.append(f"- {r['label']}: {count}{fail}{skip} → {mark}")
    lines.append("전부 정상이에요." if result["ok"] else
                 "확인 필요 항목은 Actions(작업) 화면에서 빨간 X 표시 실행을 눌러 보면 돼요. 대개 야후·GitHub 쪽 일시 오류예요.")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fail", help="워크플로 실패 알림 (워크플로 마지막 단계에서 if: failure()로)")
    f.add_argument("--workflow", required=True)
    f.add_argument("--step", help="실패한 단계 이름 (알면)")
    f.add_argument("--always", action="store_true", help="바로 전 실행이 실패였어도 보내기 (실행 자체는 성공한 부분 실패)")
    w = sub.add_parser("weekly", help="지난 7일 실행 결과 점검")
    w.add_argument("--dry-run", action="store_true")
    w.add_argument("--out", type=pathlib.Path, default=PATH)
    args = parser.parse_args()

    repo, token = os.getenv("GITHUB_REPOSITORY"), os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN")
    if args.cmd == "fail":
        run_id = os.getenv("GITHUB_RUN_ID", "0")
        url = f"{os.getenv('GITHUB_SERVER_URL', 'https://github.com')}/{repo}/actions/runs/{run_id}"
        try:
            if not args.always and repo and token and previous_failed(repo, token, args.workflow, run_id):
                print("바로 전 실행도 실패라 알림은 처음 한 번만 보냈어요.")
                return
        except Exception as e:  # 확인을 못 하면 그냥 보내요
            print(f"이전 실행 확인 실패: {e!r}")
        note = ERROR_NOTE.read_text(encoding="utf-8") if ERROR_NOTE.exists() else None
        send_telegram(failure_message(args.workflow, url, args.step, note))
        return

    now = dt.datetime.now(dt.timezone.utc)
    since = now - dt.timedelta(days=7)
    runs = {wf: runs_since(repo, token, wf, since) for wf in WORKFLOWS}
    ages = {}
    for wf, wf_runs in runs.items():
        try:
            ages[wf] = workflow_age_days(repo, token, wf, now)
            for r in wf_runs:
                if r.get("conclusion") == "failure" and never_started(repo, token, r):
                    r["github_side"] = True
        except Exception as e:  # 못 알아내면 예전처럼 그대로 세요
            print(f"{wf} 추가 확인 실패: {e!r}")
    result = summarize(runs, now.astimezone(KST), ages)
    text = weekly_message(result)
    print(text)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    print(f"메시지함 오래된 알림 {inbox.prune()}통 지움")
    if not args.dry_run and not send_telegram(text):
        raise SystemExit("텔레그램 전송 실패")


if __name__ == "__main__":
    main()
