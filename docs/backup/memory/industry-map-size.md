---
name: industry-map-size
description: 2026-10-24 산업 지도 점 크기 = 관련 종목 시가총액 합(국장·미장 따로), 산업 누를 때 화면 밀림 고침
metadata:
  type: project
  modified: 2026-10-24T06:04:50.770Z
---

PR #103 (branch claude/project-thread-jp0n9t; #101 미장 뉴스·#102 목표 초기화도 합쳐짐, 사용자 10-24). 2026-10-24 사용자: "산업 지도 섹터 누르면 화면이 움직여", "섹터별 산업 크기에 따라 크기를 차등적으로 비교".
- 화면 밀림 원인: 지도 위 설명(#map-sub)이 산업을 누르면 1줄→2줄 문장으로 바뀌고 '‹ 전체 보기'가 hidden→보임으로 바뀌어 지도가 아래로 밀림. 크롬은 스크롤 앵커링이 감춰 주지만 사파리(앵커링 없음)·맨 위에선 그대로 보임. jump-audit.js는 누른 요소 위치를 재는데 지도 점은 원래 움직이니 못 잡음 → 확인은 `*{overflow-anchor:none}` 넣고 .imap top이 그대로인지 재기.
- 고침: 설명 두 문장을 grid 한 칸에 겹쳐 두고 visibility로 하나만(.map-sub.focused), 전체 보기는 .map-all.off { visibility:hidden }으로 자리 유지. 초점 문장은 산업 이름 없이 고정 문장.
- 크기 자료: industry_map.py download_caps()가 야후 v7 quote(marketCap, 100개씩, 무료)로 테마 종목 전부(대표 5개만 아님)의 시총을 받아 industry.json size[시장][테마] = [시총 합, 종목 수]. 한 종목이 여러 산업이면 각각 더함(국장 스마트폰·데이터센터가 삼성전자 때문에 큼). 국장 원·미장 달러.
- 앱: mapScales() 로그 비례 0.62~1.36배 후 넓이 합을 예전(1배, minor 0.8배)과 같게 맞춤 → 지도 660 안에서 안 겹침. 시장마다 자리 따로 계산(mapReady, IMAP.lays). 점 크기는 .pill style --s, CSS scale(var(--s)). 지도 아래 '점 크기 = 산업 크기' 줄(가장 큼·작음), 산업 상세 카드에 '산업 크기 N조원 · 국장 42개 중 k위'. minor는 이제 흐린 글자만(크기는 시총).
- 초점 화면 둘레 산업은 큰 가운데 산업과 안 겹치게 rx ≥ 가운데 반폭 + 자기 반폭 + 10.
- 확대 화면 뒤 배경(PR #107, 사용자 "뒷배경에 흐릿한 섹터를 강조, 위치 확인하려고 / 관련 없는 건 채도 낮추고 관련 섹터는 살짝 올려"): 처음엔 켜진 산업 뒤 빛(glow)으로 했다가 "이게 아니야" → 관련 산업(.near·.center)의 원래 자리(ox,oy)에 묶음 색 점선 모양 .ghost.on(opacity .42), 관련 없는 .dim은 회색(색 뺌, !important로 흐름 색 칠 덮음, opacity .1).
Related: [[industry-map-pr50]], [[ui-no-jump-rule]]
