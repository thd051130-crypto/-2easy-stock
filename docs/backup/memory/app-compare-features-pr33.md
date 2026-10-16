---
name: app-compare-features-pr33
description: PR #33 (2026-10-09) adds 11 features borrowed from other stock apps — flows, heatmap, compare chart, targets, screener, dividends, savings calc, econ calendar, DART disclosures, glossary, first-account checklist
metadata:
  type: project
  modified: 2026-10-09T02:49:38.943Z
---

On 2026-10-09 the user asked to build every proposed "features other apps have" item except a weekly Shorts script. All 11 went into PR #33 (branch claude/project-thread-33yti7), merged 2026-10-09 11:52 KST.

- flows.py: Naver mobile API m.stock.naver.com/api/stock/<code>/trend?pageSize=60 (works from GitHub Actions, not from the cloud container) → paper/kr/flows.json, run in swing-signals KR step.
- fundamentals.py now saves `target` (Yahoo analyst consensus) and `events` (exdiv/paydiv/div_rate/earn). Yahoo dividend timestamps are 00:00 UTC, so they are read as UTC dates.
- kr_swing_signals.stock_summary adds ma200/rsi14/hi52 (screener). dashboard.py data.json gets markets.<mk>.funds (compact fundamentals), kr.flows, kr.disclosures, calendar.
- econ_calendar.py (in the macro workflow): parses the Fed FOMC calendar by fomc-meeting__month/__date cells and the BOK 금통위 year page. BLS (CPI) returns 403 to bots, so CPI is not included. Telegram "[이번 주 일정]" goes out on Mondays.
- disclosures.py plus a new disclosures workflow (hourly on weekdays) needs the Secret DART_API_KEY (free from opendart). Without it, it skips silently.
- UI: all in site/app.js. term() adds ? buttons (TERMS dictionary); the glossary is on the search screen.

Previews are in /mnt/project-files/features-preview/. Related: [[phone-dashboard]], [[macro-regime-pr22]]
