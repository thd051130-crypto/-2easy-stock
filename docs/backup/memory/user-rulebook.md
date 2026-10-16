---
name: user-rulebook
description: User's own trading rule table (2026-10-04), its backtest result, and how it runs (separate paper account, PR #11)
metadata:
  type: project
---

On 2026-10-04 the user gave a rule table: capital preservation first; target +1~3%/trade; max loss -2%/trade; stock > 200MA; 60MA > 200MA; RSI 45~60; volume >= 20-day avg; 30/30/40 scale-in and scale-out; -2% close stop; halt at -1% day / -2% week / -4% month; no leverage, no averaging down, no chasing.

Implemented in rulebook.py (defaults chosen: RSI14; adds only when close > last buy; chase = day > +5% or 5-day > +10%; halts stop new/add buys only; 20% per stock, 5 max; exit on trend break or 20 days). Backtest 2011~ (docs/rulebook-backtest.md): KR -2.3%/yr MDD -50%, US -5.1%/yr MDD -56%. Cause: -2% stop averages -3.5% after next-open gaps; +1% TP nets +0.7% KR / +0.4% US after costs.

PR #11 merged to main 2026-10-04; parallel rulebook paper accounts start with the KR run Mon 2026-10-05 17:30 KST. User chose "나란히 검증" on the decision card 2026-10-04: keep current alert rule, verify table in parallel paper account. PR #11 does the parallel option: paper/<m>/rulebook, "[규칙표 후보]" section in Telegram, dashboard card. If the user picks "규칙표로 교체", switch strategy for alerts/paper.

Related: [[paper-trading-log]]
