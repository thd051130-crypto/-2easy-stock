---
name: telegram-format-pr27
description: Telegram alerts are HTML-formatted via tgfmt.py (summary on top, folded details) with matplotlib charts via tgchart.py — PR #27, 2026-10-08
metadata:
  type: project
  modified: 2026-10-08T09:53:53.814Z
---

2026-10-08 the user said Telegram messages were too text-heavy. PR #27 (branch claude/telegram-readable-9m5nhi, merged 2026-10-08 18:56 KST) adds:
- tgfmt.py: turns "[제목] 부제" plain text into HTML (emoji + bold headers, expandable blockquote folding, 4096-char splitting); senders fall back to plain text if HTML is rejected. realtime_monitor.send_telegram(text, collapse=False), send_html, send_photo.
- kr_swing_signals: index chart photo with a short summary caption, then folded details (`--preview-dir` saves what would be sent).
- tgchart.py: matplotlib charts; Korean font is loaded from the koreanize-matplotlib package's font files (its own code is not imported because it needs distutils, which Python 3.12 lacks). Installed only in swing-signals and test workflows.

**How to apply:** new alerts should keep the "[제목]" section convention so they get formatted automatically. Previews are in /mnt/project-files/telegram-preview/. Related: [[swing-signal-alert]], [[paper-trading-log]]
