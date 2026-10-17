---
name: ma-settings-pr65
description: PR #65 — 캔들 차트 이동평균선 설정(범례 표시 누르면 선 4개 기간·켜기, localStorage ma_set)
metadata:
  type: project
---

User asked 2026-10-17: 그래프 왼쪽 위 이동평균선 누르면 바꿀 수 있게. PR #65, branch claude/project-thread-b4vv79.
- site/app.js: MA_SET (localStorage `ma_set`, 4칸 {p,on}), 기본 5·20 꺼짐, 50·200 켜짐(예전 모양 유지). frameCandles가 켜 둔 선만 `mas`로 계산(일 단위, 년봉 없음), candleChart·세부정보 상자가 그대로 씀.
- 범례의 이동평균선 이름(`.ma-edit`, "설정" 글자·테두리 없음, 사용자 요청) 누르면 `maPanel()` (−/+·숫자 2~300일·켜짐/꺼짐, 빠른 버튼 5·20·60·120 등, 처음대로). bindMa(app)는 render 끝에서.
- 색: --ma1 보라, --ma2 분홍, --ma50, --ma200 (style.css .ma1~.ma4).
- 비교 차트는 이동평균선 없음(사용자 요청 유지). Previews /mnt/project-files/ma-settings-preview/.

Related: [[chart-hilo-vs-now-pr46]], [[compare-search-pr39]], [[phone-dashboard]]
