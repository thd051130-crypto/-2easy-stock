---
name: pr18-stock-search-bot
description: PR #18 (merged 2026-10-05 13:32 KST) — chart indicators, stock screen (3y chart + financials), full-listing search, Telegram bot for watchlist additions and price alerts, screen effects
metadata:
  type: project
  modified: 2026-10-05T04:56:37.513Z
---

PR #18 on branch claude/project-thread-0yinae (thread "폰 대시보드 웹앱") comes from the user's "다 고고" (2026-10-05) to four add-ons built in order: 보조지표 → 재무제표 → 편의기능 → 효과(VFX). All four are in #18 (VFX commit b89ac4b, 2026-10-05). VFX: render() adds fx-rise/fade/push/pop/swap classes on #app (set by go/back/selectMarket, never on re-renders such as star toggles), cnt() spans count up visible numbers for 0.7 s, sigLook() tints the signal card on actionable days and glows once per new signal day (localStorage seen_signal_<mk>). prefers-reduced-motion turns all of it off.

- Indicators: MA / Bollinger(20, 2) / volume / RSI(14) toggles on candle charts.
- Stock screen: stock_pages.py builds stocks/<mk>/<code>.json at pages deploy (3y daily, 150 s budget per market). fundamentals.py plus a weekly `fundamentals` workflow (Sat 09:00 KST) write paper/<mk>/fundamentals.json. KR PER/PBR are computed from the last 4 quarters of net income and from equity.
- Search: symbols.py (Yahoo screener through the yfinance session) writes paper/symbols/kr.json (~4,180 rows) and us.json (~5,040: cap ≥ $200M plus the top 1,000 ETFs). The fundamentals workflow refreshes them. The app and bot share the matching rules (norm/spell/BRAND_KO). Preferred shares don't carry the common stock's legal name as an alias, so "삼성전자" resolves to the common stock.
- Telegram bot: bot.py plus a `telegram-bot` workflow (cron every 15 min).
  - The static app sends commands via t.me/<bot>?start=c_<base64url cmd> deep links.
  - State: paper/watch.json (extras, max 30 per market), alerts.json (max 20, checked against Yahoo 5m bars after creation), bot.json (the username enables the app's '추가' button).
  - Order: commit first, then confirm the getUpdates offset. Pages is dispatched via `gh workflow run`, because GITHUB_TOKEN pushes don't trigger push events.
  - It answers only the TELEGRAM_CHAT_ID chat.
  - First run 2026-10-05 13:53 KST (manual dispatch after merge): committed paper/bot.json, empty watch.json/alerts.json, redeployed pages, so the app's '추가' and alert buttons are live.
- Extras are display-only. They never enter strategy closes, signals or paper_trade CSVs.

Related: [[phone-dashboard]], [[user-korean-ui]]
