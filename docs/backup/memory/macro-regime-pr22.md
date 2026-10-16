---
name: macro-regime-pr22
description: PR #22 (MERGED 2026-10-08 14:52 KST) — 경기 리포트 + 업종별 호재·악재 macro.py, 7 free warnings, report-only (backtest showed no drawdown benefit)
metadata:
  type: project
  modified: 2026-10-08T05:10:16.208Z
---

User asked "경기 분석도 가능?" → "고고" on 2026-10-08. PR #22 (branch claude/macro-regime-ak7rdk).
- macro.py: 7 Yahoo warnings (10Y<3M inversion, 10Y +1%p/6m, WTI +50%/1y, KRW +5%/3m, HYG/IEF<200d, copper/gold<200d, VIX20>25). 0-1 확장, 2-3 둔화, 4+ 위축 경고. FRED (UNRATE, SAHMREALTIME, CPI, ICSA) shown for reference only.
- macro.yml daily 06:50 KST → paper/macro.json; Telegram Monday + on regime change. App home "경기 국면" card; appended to 리스크관리부 line.
- Backtest (docs/macro-backtest.md): regime filters did NOT reduce KR MDD (-3.2%); US cut MDD slightly but cost far more return than simply lowering SPY weight (flat 40%: +5.1%/-7.2% vs current +5.7%/-9.5%). So rules unchanged.
- FRED/ecos/google blocked from cloud container; Yahoo works.
- Snapshot 2026-10-08: 확장 (1/7, oil +56% yoy), 10Y rate jump 0.99%p near. Fed hiked to 3.75-4.00% Sep 2026, US unemployment 4.2%, BoK 3.00%.

Related: [[movers-pr21]], [[phone-dashboard]]

Update 2026-10-08: user asked "산업별로 호재나 악재 … 섹터별로 그룹화(필터)". Added to the same PR #22: sectors.py (Yahoo industry → 16 Korean sectors, KR OVERRIDES; paper/sectors.json seeded 400 stocks, fundamentals workflow fills new ones), sector 5d/20d median flow + Google News RSS headline tone (keyword good/bad), Telegram "[업종별 호재·악재]", pick opinion "업종: …", app home sector card with chip filter shared with 관심 tab all-stocks (localStorage "sector"). Reference only, rules unchanged.
Also in #22: stock screen "업종과 연관 업종" card + small #업종 tags under stock name (RELATED map in sectors.py). PR #22 merged 2026-10-08.
