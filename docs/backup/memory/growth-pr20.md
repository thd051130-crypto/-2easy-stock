---
name: growth-pr20
description: PR #20 (MERGED 2026-10-05 14:15 KST, thread "시스템 성장 제안") — failure alerts, won ETF paper account, go-live checklist, KR earnings-season pause, wide KOSPI-100 candidates, bot commands 오늘/계좌/종목/메모
metadata:
  type: project
  modified: 2026-10-05T05:13:26.201Z
---

User picked proposals 1,2,3,4,6,7,8,9 from /mnt/project-files/proposals/system-growth-2026-10-05.md (skipped 5 적립식 sim, 10 쇼츠 대본). All in PR #20, branch claude/project-thread-fg2cq6.

- health.py: `health.py fail --workflow X` step (if: failure()) in every workflow, stdlib-only, skips if previous run also failed; check_data stops signals if >30% of universe missing; health.yml Sunday 10:00 KST writes paper/health.json.
- strategy.kr_frames earnings_pause=True: no new KR buys 1·4·7·10월 20일 ~ 다음 달 중순. On PR #19 values (breadth 40%, stop -7%): CAGR 4.7→4.5%, MDD -4.8→-3.2%.
- ETF account: paper/etf/, `paper_trade.py --rule etf`, TIGER 미국S&P500 (360750) 50% on the US trend signal, whole shares, 70만 원. Adding a KODEX 200 sleeve made MDD worse (2026-07 KOSPI -22%).
- readiness.py: gates of 60 trading days, MDD within 1.5x the backtest, 10 KR trades, and health ok.
- wide.py: KOSPI top 100 by cap (symbols kr.json order), display + track src=wide only.
- commands.py hooked from bot.py's unknown branch; paper/memos.json; Friday ≥18:00 KST memo report.
- dashboard data: total (won, fx from signal.json usdkrw), markets.kr.etf, readiness, health, memos.

Related: [[phone-dashboard]], [[paper-trading-log]], [[pr18-stock-search-bot]]

2026-10-24 사용자 "메모·점검 기능은 지금 안 쓰는 것 같다" → 봇 '메모' 명령(내 판단 기록장, memos.json — 한 번도 저장된 적 없음)과 금요일 판단 결산 없앰. 고장 알림·주간 점검(health.py)은 남김.
