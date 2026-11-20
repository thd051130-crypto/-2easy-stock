---
name: asset-live
description: 자산 기록 '지금 시세로 평가' 켜기·끄기 (2026-11-20) — 마지막 기록 달 종목 × 전 종목 종가, 목표 칸도 평가금액, 검수 대기
metadata:
  type: project
  modified: 2026-11-20T12:29:20.014Z
---

2026-11-20 사용자 "2번은 온오프 기능 만들어놔 필요 없는 사람은 없앨 수 있게" (코디네이터 제안 '자산 기록을 지금 시세로 평가').
- 기본 켬. localStorage 'ast_live' = "0"이면 끔. 끄면 예전 산 돈 기준 화면 그대로(스위치 줄만 남음).
- 코드 site/app.js: AST_LIVE, astLastYm()(마지막 기록 달, 이번 달까지 — goalAstYm도 이걸 씀), astEval(ym), astLiveSw/astLiveBox/astLiveTag/astLiveLine, astDeltaAll. CSS .ast-live*.
- 시세 = savPx() 재사용: stocks/<시장>/_quotes.json 종가(all_stocks.py 매일), 없으면 대시보드 종목 종가, 미장은 DATA.fx 환율. 시세 없는 종목은 산 돈으로 셈("시세 없는 N종목" 안내). 수익률은 시세 있고 투자금 넣은 종목만.
- 화면: 달력 위 '📈 지금 시세로 평가 켜기|끄기' + 지금 평가금액·산 돈보다(+금액, %) 2칸. 펼친 달은 마지막 기록 달만 '지금 시세로' 한 줄 + 종목 줄마다 '지금 1주·평가·수익' 꼬리표. 지난 달들은 산 돈 그대로. 늘고 줄음 색 없음([[asset-record]] 규칙).
- 목표 칸([[goal-card]]): '자산 기록에서'일 때 켜져 있으면 goalNow()가 평가금액 사용, 안내 줄도 바뀜.
- 미리보기 /mnt/project-files/asset-live-preview/. 브랜치 claude/project-thread-22cy8j 커밋만(검수 대기, PR 없음).
