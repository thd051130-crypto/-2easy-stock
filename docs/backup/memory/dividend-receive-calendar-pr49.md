---
name: dividend-receive-calendar-pr49
description: PR #49 (2026-10-11) dividend calendar switched from ex-div dates to "when money lands in my account" dates, with after-tax amounts
metadata:
  type: project
  modified: 2026-10-11T06:38:25.174Z
---

On 2026-10-11 the user asked for the 배당 달력 to show when they actually receive the money, not the company's date. PR #49 (branch claude/project-thread-worbds) rewrites dividendCard in site/app.js.

- Receive date: US = Yahoo paydiv + 2 days (Korean broker credit). Without paydiv, uses the same stock's last exdiv→paydiv gap. KR = Yahoo has no paydiv for any KR stock, so it is estimated from exdiv: Dec → next Apr 20, late Mar/Jun/Sep → +48 days, other → +30, ETF (name regex) → +3.
- Future cycles: returns.py r[6] (last 12 months [ex month, amount]) shifted one year. divHist fills a missing quarter for quarterly payers (Samsung Sep missing from Yahoo monthly).
- Holdings and qty come from the 예상 배당금 card (DIVQ: watch/acct). With no holdings it falls back to large caps at 1 share. incomeCard bars are now by receive month, after tax.

Status: merged 2026-10-11 15:49 KST. Previews in /mnt/project-files/dividend-receive-preview/. Related: [[app-compare-features-pr33]], [[phone-dashboard]]
