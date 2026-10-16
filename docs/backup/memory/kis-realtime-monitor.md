---
name: kis-realtime-monitor
description: KIS realtime monitor bot — where it lives, how it runs from the phone (GitHub Actions), and setup progress (as of 2026-10-04)
metadata:
  type: project
  modified: 2026-10-04T11:23:57.883Z
---

realtime_monitor.py (KIS WebSocket ticks + Telegram alert) is on main of -2easy-stock (PR #1, #3 merged 2026-10-04). Originally from old repo thd051130-crypto/easy-stock, which this project can't reach.

Runs from the phone via the workflow_dispatch workflow `.github/workflows/kis-live-check.yml` (modes: chat-id, test-telegram, check, live) using repo secrets.

Progress on 2026-10-04: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set, and test-telegram succeeded. The `chat-id` mode found no updates even though the token was valid; the chat ID came from @userinfobot instead. The user has no KIS account, so the next step is to open one in the 한국투자 app, then request an app key at apiportal, then run check with kis_env=real, then run live on a weekday 09:00–15:30 KST.

Paused 2026-10-11: user closed the thread because a KIS account isn't feasible right now. Resume from 'open KIS account' when they bring it up.

**Why:** cloud sessions can't reach KIS or Telegram, and the user works from a phone.
**How to apply:** read run logs with the GitHub MCP actions tools instead of asking the user to paste them.
