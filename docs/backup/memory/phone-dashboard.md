---
name: phone-dashboard
description: Phone dashboard web app (site/, dashboard.py, pages workflow) — LIVE at https://thd051130-crypto.github.io/-2easy-stock/ (repo public); PRs #8, #10, #13, #15, #16 (screens + watchlist + recommendation tracking) merged
metadata:
  type: project
  modified: 2026-10-05T01:27:45.333Z
---

PR #8 (merged 2026-10-04) added a mobile PWA dashboard: site/ (index.html, app.js with own SVG charts, sw.js, manifest), dashboard.py builds data.json from paper/<mk>/{signal.json,state.json,equity.csv,trades.csv}; kr_swing_signals.py --save-json writes signal.json; pages.yml deploys on workflow_run of swing-signals + push to main.

Repo public, Pages source = GitHub Actions (user did it 2026-10-04). Chrome auto-translate shows the paid "Upgrade" button as "치받이" — warn the user not to tap it.

PR #10: index candlestick chart (KR colors up red/down blue), right-side price axis. User preference: price axis on the right, candles over lines.

PR #13 stale-screen fix: sw.js v4 revalidates every request, dashboard.py stamps app.js/style.css with a content hash and writes data.json `site_version`. github.io can't be fetched from the cloud container; verify deploys via pages workflow runs.

PR #15 (merged 2026-10-05 KST): trend buttons 일봉/주봉/월봉/년봉 (monthly from signal.json candles.monthly).

PR #16 (merged 2026-10-05 08:50 KST, user asked 관심종목 + 추천 종목 수익률 시각화 + 버튼으로 항목별 화면, 첫 페이지엔 핵심만): bottom nav 홈·신호·관심·성과·차트 (hash #kr/watch; app always opens on 홈; back button returns to 홈). Watchlist = ★ on universe stocks (KR 48, US 48+SPY), saved in localStorage watch_kr/watch_us (per browser). track.py logs daily picks to paper/<mk>/picks.csv (src signal|rulebook, replay=1 for the 120-trading-day seed), signal.json `tracked` (5/10/20-day avg vs index, avg path, recent picks' paths) and `stocks`. Repeat picks within 10 trading days count once. Watchlist stocks outside the universe arrive in PR #18 via the Telegram bot (paper/watch.json, display-only) → [[pr18-stock-search-bot]].

New signal.json fields only appear after swing-signals runs or a local regen (`kr_swing_signals.py --market <mk> --dry-run --csv data/<mk>_daily_recent.csv --save-json paper/<mk>/signal.json`; candles still need Yahoo).

Related: [[paper-trading-log]], [[user-mobile-only]], [[user-korean-ui]]
