---
name: shares-label-pr47
description: PR #47 (2026-10-11, merged) shows "금액 ≈ N.N주" next to paper-trading amounts (signal picks, rulebook picks, US ETF line) + qty in trade review
metadata:
  type: project
  modified: 2026-10-11T06:31:26.813Z
---

PR #47 merged 2026-10-11 15:35 KST: site/app.js `canBuy(m, amount, unit)` prints "100만 원 ≈ 14.0주" (1 decimal, because paper accounts buy fractional shares; kr/us state.json fractional=true, ETF account false).
- 국장 매수 후보: slot = account equity × 0.1 (strategy.KR_WEIGHT).
- 규칙표 후보: "1차" = rulebook equity / 5 × 0.3 (rulebook.SLOTS, TRANCHES[0]).
- 미장 SPY line: capital/2.
- 매매 복기: dashboard.py trades now carry qty, shown via shares().
Same PR also moves 실전 첫 계좌 체크리스트 (firstAccountCard) to the end of the perf screen, folded in <details> (user: no use yet; FIRST_OPEN keeps it open until app closes).
Also: savShares() in 적립식 계산기 (price from stocks/<m>/_quotes.json, fallback dashboard close; US via fx), and savingsCard moved to top of perf screen (user asked).
Previews: /mnt/project-files/shares-preview/. Related: [[phone-dashboard]]
Follow-up PR #51 (merged 2026-10-11 16:07 KST): savShares adds price date ("10.08 종가") and "N년 뒤 모인 주식 약 N주" = (bal − cash)/fx/(px×(1+price%)^years). User thought prices were wrong; verified KR ETF prices equal Yahoo closes (10.09 한글날 휴장). 99억 results come from extrapolating 10-year CAGR (e.g. 나스닥100 22%) for 30 years.
PR #54 (merged 2026-10-11 16:20 KST): user found future-price share count "too vague" → total line now "넣은 돈 X ≈ N주 · N년 뒤 Y ≈ M주 (지금 주가로)", divided by current close only. Do not assume future prices for share counts.
PR #57 (merged 2026-10-11 16:29 KST): 적립식 계산기 accounts multi-select SAV.accts (isa/pension/irp; old SAV.acct migrated). savSplit fills ISA (2,000만/yr, 1억 total) → 연금저축 → IRP (pension+IRP share 1,800만/yr) → 일반; US-listed always 일반. Pension tax = 5.5% of gains (연금 수령 가정), no 세액공제 (assumes no taxable income yet).
