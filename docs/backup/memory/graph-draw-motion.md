---
name: graph-draw-motion
description: 2026-10-25 선 그래프가 버튼 누르면 왼쪽→오른쪽으로 그려지는 모션 (산업 지도 별자리 선 속도), 검수 대기
metadata:
  type: project
  modified: 2026-10-25T00:23:30.792Z
---

2026-10-25 사용자: "적립식 계산기 버튼 눌러서 그래프 바뀔 때마다 그래프가 그려지는 모습, 속도는 산업지도랑 똑같이", "다른 선형 그래프도 다 똑같이".
- 2026-10-25 검수 통과, 사용자 "올려" → PR. 미리보기 /mnt/project-files/graph-draw-preview/.
- site/app.js drawSoon(el)·drawIn(svg, {x0, w, sel, late, px}): 방금 누른 버튼(1.5초 안, 아래 메뉴 .nav 빼고) 때문에 다시 그린 그래프만 clipPath 사각형을 rAF로 넓혀 드러냄. 끝 점·딱지(late)는 85% 지점에서 625ms로 켜짐. calm()이면 안 함. 밀기·크기 바뀜·자료 받기 때는 그대로.
- 속도 = 산업 지도 제자리 방식 별자리 선(아직 안 올린 브랜치 we750o, mapConstellation): 625ms + 선 길이 1px당 2ms, cubic-bezier(.35,.1,.25,1).
- 들어간 곳: 적립식 계산기(drawSavings), lineChart(세계 지수 그래프·지표 선 차트), 비교 차트 꺾은선(cmpLine일 때), 포트폴리오 실험실(bindLab). 캔들 차트는 선이 아니라 뺌.
Related: [[savings-per-stock-pr79]], [[ui-no-jump-rule]], [[industry-map-size]], [[review-before-pr]]
