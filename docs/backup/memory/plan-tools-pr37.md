---
name: plan-tools-pr37
description: PR #37 (2026-10-09) return calendar, crash check, trade review, savings goal, expected dividends, pre-buy checklist
metadata:
  type: project
  modified: 2026-10-09T07:25:02.712Z
---

On 2026-10-09 the user picked proposals 1~4 from /mnt/project-files/proposals/new-features-2026-10-09.md plus "예상 배당금" and "달력에 수익률". All in PR #37 (branch claude/project-thread-npkts2), merged 2026-10-09 16:36 KST.

- returns.py rows now have 7 elements: [..., crises (3 × [dd%, recovery months|null] or null), last-12-month dividends [[ex month, per share]]]; file also has idx (KOSPI/S&P crisis numbers) and crises names. Old 5-element readers still work.
- review.py: trade notes (buy reason per account kind, sell reason, index change, verdict). dashboard trades get buy_why/index_ret/verdict; Friday summary gets "이번 주 복기".
- app.js: retCalendarCard/stressCard/goalCard on 성과, incomeCard on 관심, checkCard on 종목 화면, goalLine on home. Goal and dividend qty saved in localStorage (goal, div_plan).
- Not chosen (still open ideas): manual paper trading via bot, watchlist correlation check, daily quiz card, IPO calendar.

Previews: /mnt/project-files/plan-tools-preview/ (sample account data). Related: [[phone-dashboard]], [[app-compare-features-pr33]]
