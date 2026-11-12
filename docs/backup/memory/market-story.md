---
name: market-story
description: 분석팀(market_story.py) '오늘의 연결 고리'(A→B→C·D 인과 사슬) + 투자 공부 '사례집' 탭(과거 큰 사건 14개 + 앱이 기록한 최근 사건) — PR #125 머지(2026-11-11 20:2x KST), #126 story_log 60일 채움 머지
metadata:
  type: project
---
2026-11-10 사용자: 시황·투자 공부가 "검색하면 나오는 내용", "A사건 때문에 B, B 때문에 C·D 같은 상관관계", "반도체가 뭐 때문에 올랐다, 뭐가 반영돼 기대감이 떨어져 이 주식이 떨어졌다", "전문가처럼 분석, 투자공부는 사건별 요약 정리해서 포트폴리오처럼".
- 유료 API·AI 안 씀: 규칙 엔진. market_story.py = 리포트 부서 '분석팀'(report_desks.build가 호출 → report.json story{kr,us}, 헤드라인 맨 위 '오늘의 연결 고리', 텔레그램 [분석팀] 칸). 경로: 큰 발표(예상 대비) → 금리 → 성장주/원화, 반도체(SOX→국장 반도체·코스피), 금리, 환율(원/달러→외국인·수출주), 유가(정유↔운송·화학), VIX(코스닥 대비·금), 밤사이 미국, 엔화 급등, 해외 조용하면 국내 사정. 끝 칸은 업종 하루 r1을 **지수 대비**로 판정(다 같이 오른 날 착시 방지). 확인/엇갈림/반대/미미 + 반대면 '다른 힘이 더 셌다' 메모. '기대와 반영': 실적 뒤 하락(20일 +10%↑=재료 소멸), 업종은 오르는데 혼자 하락, 많이 오른 업종 쉼(지수보다 -2%p), 많이 빠진 업종 반등(지수보다 +2%p).
- sectors.py 업종 행에 r1·day_best·day_worst(하루, 그 전 20일) 추가.
- paper/story_log.json 시장마다 250일 (dashboard는 60일만 story_log로). `python market_story.py --backfill 60`으로 세계 지수만으로 과거 채움(#126에서 돌림).
- 앱: 리포트 화면·투자 공부 '오늘 왜' 맨 위 🧠 카드(연결 그림 flowHtml), 투자 공부 새 탭 '사례집'(묶음 칩, 앱 기록 + site/casebook.js 과거 사건 14개, 오늘과 닮은 사례 먼저, '그 뒤 5거래일'). casebook.js는 index.html·sw.js(easystock-v5)·stamp_assets에 추가.
- 미리보기 /mnt/project-files/story-preview/, 브랜치 claude/project-thread-kij9v6. 화면 고정 점검 버튼 283개 밀림 0.
- 2026-11-11 사용자 "20년차 경제분석가 수준 견해를 쉽게" → analyst_view.py(분석가 시각): 쉽게 말하면, 오늘의 성격(넓은/좁은 움직임, 하락 추세 속 반등 등), 해석(주인공·조연·엇박자·가격 속 기대·함정), 확인할 것(외국인·원화·미국 금리·VIX·업종 퍼짐·반도체, 오르는 힘 기준 ✓✗), 시나리오 2개, 내일 볼 것(큰 발표 높으면/낮으면). 사례집 14개에 pro(분석가의 눈)·myth(흔한 착각). 미리보기 /mnt/project-files/story-preview/v2/. 사슬 표시는 '확인' 먼저.
- 2026-11-11 사용자 "pr올려서 머지하고 더 업그레이드" → 업그레이드 2차(검수 대기, 브랜치 claude/project-thread-kij9v6): sectors.py day_lead(업종 방향으로 가장 크게 간 3종목), 사슬에 leaders(낙폭 과대 반등/주도주 강화/차익 실현/추세 하락)·spill(sector_links로 연결 산업에 번졌나, 지수 대비), analyst_view.track 분석팀 성적표(story_log의 같은 nature 날 그 뒤 5거래일), story_log에 nature 저장, load_inputs에 story_log. 미리보기 story-preview/v3/. 머지 뒤 backfill 다시 돌려 nature 채우기.
**How to apply:** 검수 통과 전 PR 금지. 사고팔기 신호 금지, '✓는 원인 증명 아님' 문구 유지. 사례 숫자는 대략값. 관련 [[learn-section]], [[report-desks]], [[ui-no-jump-rule]].
