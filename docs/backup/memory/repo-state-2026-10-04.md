---
name: repo-state-2026-10-04
description: -2easy-stock contents as of 2026-10-04 — open PR #1 (KIS monitor) and #2 (swing backtest), main is otherwise empty
metadata:
  type: project
  modified: 2026-10-04T10:26:57.565Z
---

As of 2026-10-04, main of thd051130-crypto/-2easy-stock only has README.md. Work lives in open PRs made by other threads: #1 KIS realtime monitor + Telegram (branch claude/project-thread-7jk31n), #2 Korean large-cap swing signal backtest (branch claude/project-thread-tdl99p). No issues.

On 2026-10-04 the user said "키움증권 해외계좌", meaning they also want to work with a Kiwoom overseas (US stock) account. Kiwoom REST API (openapi.kiwoom.com) reportedly added US-stock endpoints around 2026-07: usa20100 quote, ust21070 balance, ust20000/20001 order, ust31490 orderable USD, ust21120 FX. Source: third-party PR ahnchul0-hue/GBV#1 plus news. The official sample repo only shows domestic examples, so verify against the official docs before relying on these IDs.

**Why:** the cloud can't reach brokerage APIs, so the user has to run live tests locally. See [[kis-realtime-monitor]].
**How to apply:** check open PRs before assuming the repo is empty.
