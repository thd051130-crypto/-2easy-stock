---
name: policies-pr44
description: PR #44 정부 정책 칸 (policies.py, paper/policies.json 손으로 정리, 앱 홈·업종 칸·종목 화면) — 2026-10-11 머지됨
metadata:
  type: project
  modified: 2026-10-11T01:37:54.252Z
---

PR #44 (branch claude/project-thread-971yxs, merged 2026-10-11 15:18 KST): 앱 홈 "정부 정책" 칸 (경기 국면 아래).
- paper/policies.json: 손으로 정리하는 정책 목록 (region kr/us/world, status, date, next, summary, effects[{sector(sectors.NAMES), tone 1/0/-1, why}], query, sources). 파일 순서대로 보여 주고 처음 5개만, 나머지 '더 보기'. `reviewed` 날짜 45일 지나면 앱에 '오래됨'.
- policies.py --news: macro 워크플로(매일 06:50 KST)가 구글 뉴스 RSS 제목 → paper/policy_news.json. --check로 파일 검사.
- 업종 칸(업종 고르면)·종목 화면에 "🏛️ 관련 정부 정책" 접힌 목록, 누르면 홈 정책 펼침.
- 2026-10-11 기준 13개: 연준 3.75~4.00%(9/16 인상, Warsh 의장), 한은 3.00%(8/27), 한미 관세 15%·대미투자 3,500억 달러, 이란 전쟁·OPEC+ 동결(브렌트 ~104달러), 미·중 휴전 2027-01-10까지, 2027 예산안, 자사주 소각 의무화(2026-03-06), 반도체 232조 25%, 301조 관세 한국 12.5%(7/24), 의약품 관세 한국 15%, 배당 분리과세, 일본은행 10/30.
- 정책은 바뀌면 손으로 고쳐야 함 (자동 판정 무료 방법 없음). 참고용, 매매 규칙 그대로.
- Previews: /mnt/project-files/policy-preview/. Related: [[macro-regime-pr22]], [[phone-dashboard]]
