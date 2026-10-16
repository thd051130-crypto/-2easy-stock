---
name: chart-hilo-vs-now-pr46
description: PR #46 (MERGED 2026-10-11 15:25 KST) — 캔들 차트 보이는 구간 최고·최저 대비 지금 값 차이(금액·%) 표시
metadata:
  type: project
  modified: 2026-10-11T06:23:20.517Z
---

User asked 2026-10-11: 차트에서 보이는 캔들 고점·저점과 현재가 차이 표시. PR #46, branch claude/project-thread-to24pn.
- site/app.js candleChart: 최고/최저 표시 끝에 "지금 -x%" (tspan.mark-diff up/down 색), 위 줄은 hiLoLine() "최고 X 대비 지금 -금액 (-%) · 최저 Y 대비 지금 +금액 (+%)". 지금 값 = 마지막 캔들 종가(과거로 밀어도 지금과 비교).
- 비교 차트는 안 건드림.
- 같은 PR: 어두운 화면 캔들 채도 낮춤 (사용자 요청). style.css 토큰 --c-up/--c-down (밝은 화면=--up/--down, 어두운 화면 hsl(0 42% 58%)/hsl(213 40% 58%)) 캔들·거래량·현재가 딱지·범례에만. 글자 색·히트맵은 그대로.
- Previews /mnt/project-files/hilo-preview/. 스크린샷: dashboard.py --out <경로> 후 http.server + playwright(executable_path=/opt/pw-browsers/chromium).

Related: [[phone-dashboard]], [[chart-index-buttons-pr28]]

PR #55 (MERGED 2026-10-11 16:20 KST): 표시에서 '지금' 글자 뺌(사용자 요청: "최고 X (날짜) -0.4%", "최고 X 대비 -33 (-0.4%)"). 세부정보 상자: 캔들 위아래 빈 곳(HIT_PX 14)·상자·차트 밖 누르면 닫힘 — chartGestures geo().hit(i,y), document pointerdown. 캔들·비교 차트 공통.
