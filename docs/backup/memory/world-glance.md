---
name: world-glance
description: 홈 세계 지수 구조 — 맨 위 얇은 지수 바(돌아가며, 누르면 세계 지수 화면 #kr/world), 홈엔 한국·미국 지수 6개만, 탭 줄 가로 위치 유지 (2026-10-24 사용자, PR #97)
metadata:
  type: feedback
---

2026-10-24 사용자: "한국 미국 지수는 이전처럼 두되, 선택하는 버튼 누르면 화면이 메인으로 돌아오는거 취소해" → 이어서 "지수를 홈화면 상단에 얇은 바를 놔두고 돌아가면서 보여주게 하고, 클릭하면 지수 탭만 따로 보이게하자 한국미국지수는 그대로 보이게하고".
- site/app.js 홈: worldTicker()가 맨 위(큰 발표 칸보다 위) 얇은 바. 한국·미국 말고 나머지(주요 순서 먼저)를 3초마다 하나씩(spinTicker, 높이 40px 고정, sticky 아님). 누르면 data-go="world".
- worldHomeCard(): '한국·미국 지수' 6개 타일(WORLD_FIXED=["한국","미국"]) + 기간 칩 + 그래프(worldTop, #world-chart-top) + '세계 지수·환율 전체 보기'.
- 세계 지수 화면 screen "world"(LAYERS, ‹ 뒤로): worldCard() = 묶음 탭(주요·아시아·유럽·환율·금리·원자재·리츠·공포·코인, 한국·미국 탭 없음) + 타일 + 그래프(worldPick).
- '메인으로 돌아감' 원인: render()가 탭 줄을 새로 그려 가로 스크롤이 0으로. worldTabsX로 scrollLeft 기억·복원. resetFolds()에서 worldTop·worldTabsX도 비움.
**Why:** 폰에서 오른쪽 탭 고를 때마다 탭 줄이 처음으로 밀려 불편, 홈은 짧게.
**How to apply:** 가로로 밀리는 줄을 새로 만들면 scrollLeft도 기억. [[ui-no-jump-rule]], [[nav-reset-folds]], [[world-markets-pr23]].
