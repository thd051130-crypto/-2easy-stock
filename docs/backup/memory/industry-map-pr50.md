---
name: industry-map-pr50
description: PR #50 (merged 2026-10-11 15:49 KST) — 산업 지도·테마 검색 36→44 산업, 연결 62→89, 지도 세로 560
metadata:
  type: project
  modified: 2026-10-11T06:38:22.412Z
---

PR #50 (branch claude/project-thread-5os4k7) adds 8 themes to themes.py and industry_map.py: 광통신·네트워크, PCB·유리기판, 스마트폰·IT부품 (tech), 희토류·핵심광물, 드론·UAM (industry), 디지털헬스·의료AI (consumer), 지주사·밸류업, 핀테크·결제 (finance; owns key 원화스테이블코인). 27 new links. Extra keys on old themes (hvdc, 마스가, 로보택시, cdmo, 무비자…).
- Theme keys must be unique across themes: parseAsk picks one theme per overlapping hit, so a duplicated key silently goes to only one theme.
- app.js MAP_H 470→560 and anchors scaled, because 44 pills overlapped at 470.
- Minor nodes: industry_map.MINOR (the 8 new themes) → node.minor → app draws pill 0.8x with faded text (user asked "큰 틀에서 벗어나는거는 작게 글자도 투명하게"); layout uses n.s scale.
- PR #52 (merged 2026-10-11 16:08 KST): tapping empty map space or a dim node goes back one focus (mapTrail stack in app.js), to full view after the first one.
- PR #53 (merged 2026-10-11 16:14 KST): focus ring radius by neighbor count (ry = min(244, 110/150 + 9n)); .node.dim pointer-events:none because dim nodes drawn later stole taps from lit neighbors (드론→방산, 수소).
- PR #56 (merged 2026-10-11 16:29 KST): header .map-btn next to 이지스톡 opens map; map 5일/20일 toggle (mapDays, localStorage map_days, fv()); flows stocks rows now [code, ko, close, r5, r1, r20].
- PR #58 (merged 2026-10-11 16:34 KST): two-finger pinch on map (spread ≥1.18 → nearest lit node, pinch ≤0.85 → back; ctrl+wheel same), .imap touch-action pan-y, MAP_H 660, GAP 14; header .home-link (logo+이지스톡) → home.
- PR #59 (merged 2026-10-11 16:45 KST): pinch morphs live (mapPreview lerps nodes/opacity toward mapTargets(focus) by spread: full at 2x / 0.5x); release ≥30% commits via setMapFocus, else placeMap springs back.
- Previews: /mnt/project-files/industry-map-preview/new-*.png.
Related: [[industry-map-pr31]], [[theme-search-pr30]]
