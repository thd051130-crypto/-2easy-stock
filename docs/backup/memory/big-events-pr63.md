---
name: big-events-pr63
description: PR #63 (2026-10-17) — 큰 발표(CPI·고용·FOMC) 예고·결과 텔레그램 알림 + 지수 급변 알림 + 앱 홈 강조 칸 (big_events.py)
metadata:
  type: project
  modified: 2026-10-17T07:03:35.798Z
---

2026-10-17 사용자가 "CPI 발표 왜 안 알려줬어", "지수에 영향 가는 굵직한 사건은 바로바로, 따로 더 강조해서"라고 함.
원인: econ_calendar.py에 CPI·고용 날짜가 없었음(bls.gov는 GitHub Actions에서도 403), 텔레그램 일정 알림은 월요일 주간 일정뿐.

PR #63 (branch claude/project-thread-n9ny6i): big_events.py를 telegram-bot 워크플로(15분마다)가 bot.py 끝에서 부름 → paper/events.json.
- 일정·예상치: 포렉스팩토리 무료 nfs.faireconomy.media/ff_calendar_thisweek.json (이번 주만, nextweek는 404). 미국 영향 High 전부 + 다른 나라는 금리 결정만.
- [큰 발표 예고] 30시간 전 1번, 1급(CPI·고용·FOMC) [곧 발표] 1시간 전, [발표 결과] 10분 뒤부터 FRED 실제 값 vs 예상 + ES=F·NQ=F 반응(3시간 못 찾으면 뉴스만), [지수 급변] 1시간 새 선물 1%·코스피 1.5%. 23~07시엔 예고 미루고 결과는 소리 없이.
- 앱 홈 맨 위 "🚨 큰 발표·지수 급변" 칸(48시간 일정, 24시간 결과·급변), 다가오는 일정·주간 일정에 🚨.
- FRED 주의: 브라우저 User-Agent 보내면 막힘(그냥 요청), 2025-10 값이 비어 있음(셧다운) → 1년 전·한 달 전은 날짜로 찾기. macro.py 미국 물가가 이 때문에 4.0%로 틀렸던 것도 고침(실제 3.7%).
- 2026-09 CPI (10-14 발표): 1년 3.7%(예상 3.6%), 전월 0.6%, 근원 전월 0.3%(예상 0.2%).
매매 규칙 안 바꿈. 미리보기: /mnt/project-files/big-events-preview/. Related: [[macro-regime-pr22]], [[telegram-format-pr27]]
