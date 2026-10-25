---
name: map-spot-mode
description: 2026-10-25 산업 지도 강조 방식 '제자리'(확대|제자리 버튼) — 무작위 섞기·물결·별자리 선, 사용자가 다듬은 값
metadata:
  type: project
---

2026-10-24~25 사용자: "테마지도 강조방식 하나 더, 버튼으로 선택", "관련 테마끼리 그 자리에서 선으로, 나머지는 거의 안 보이게". 검수 받고 "올려"(10-25) → PR (branch claude/project-thread-we750o).
- site/app.js: mapMode "zoom"|"spot" (localStorage map_mode), 지도 위 '확대 | 제자리' 버튼(data-mapmode). 바꿀 때 render 안 하고 placeMap(svg, true, slow) → 화면 위치 그대로.
- 제자리: 자리는 mapShuffle()이 묶음 무시하고 무작위로 섞어 밀어내기만(지도 360×880, MAP_H_SPOT, gap 30), 시장마다 한 번, '제자리' 누를 때마다 새로 섞음. 점 0.8배(MAP_SPOT_S, 사용자 '너무 커 보여'). 관련 없는 테마 opacity .12, 눌러서 바로 그 테마로.
- 모션(사용자 '느리게', '0.8배속'): 퍼짐 2000ms ease-in-out cubic, viewBox 높이도 같이. 물결 mapWave(가로 2·세로 3px, 자리마다 위상 다름). 별자리 선 mapConstellation: 가까운 선부터 250+k·275ms 시작, 선 하나 625+길이·2ms, cubic-bezier(.35,.1,.25,1), 닿으면 테마 켜짐. 다 그린 뒤 점선 흐름(CSS imap-flow). 이 속도를 다른 그래프 그리기 모션도 씀 → [[graph-draw-motion]].
- 해 봤다가 뺀 것: 누른 테마 빛남(glow)·물결 고리("빛나는 기능은 빼자"), 이어진 테마를 한 줄 곡선으로 잇기("한줄선은 원상복구").
- 미리보기 프로젝트 공유 폴더 map-spot-preview/ (final-*.mp4).
Related: [[industry-map-size]], [[ui-no-jump-rule]], [[review-before-pr]]
