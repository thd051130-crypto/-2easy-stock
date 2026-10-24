---
name: world-glance
description: 홈 세계 지수·환율 칸 구조 — 한국·미국 지수 6개 늘 맨 위 고정, 그 아래 묶음 탭(한국·미국 탭 없음), 탭 줄 가로 위치 유지 (2026-10-24 사용자)
metadata:
  type: feedback
---

2026-10-24 사용자: "세계지수환율에서 한국 미국 지수는 이전처럼 두되, 선택하는 버튼 누르면 화면이 메인으로 돌아오는거 취소해".
- site/app.js worldCard(): 기간 칩 → 한국·미국 6개 타일(WORLD_FIXED=["한국","미국"], 탭과 상관없이 늘 보임) → 묶음 탭(주요·아시아·유럽·환율·금리·원자재·리츠·공포·코인) → 탭 타일. '한국·미국' 탭은 없앰(옛 localStorage world_tab=kr_us는 주요로). 주요 = 원/달러·미 10년·장단기 차·WTI·금·VIX.
- 그래프 두 개 따로: 맨 위 타일은 worldTop(#world-chart-top), 탭 타일은 worldPick(#world-chart). 탭 바꾸면 worldPick만 접힘. 한쪽 눌러도 다른 쪽 안 접힘(접히면 위 칸이 줄어 화면이 튐).
- '메인으로 돌아감' 원인: 무엇을 누르든 render()가 탭 줄을 새로 그려서 가로 스크롤이 0(주요 쪽)으로 돌아감. worldTabsX에 탭 줄 scrollLeft를 기억해서 다시 그릴 때 복원, 처음엔 고른 탭이 보이게. 아래 메뉴 resetFolds()에서 worldTop·worldTabsX도 비움.
**Why:** 폰에서 오른쪽 탭을 고를 때마다 탭 줄이 처음으로 밀려 불편.
**How to apply:** 가로로 밀리는 줄(탭·칩)을 새로 만들면 scrollLeft도 기억해서 복원. [[ui-no-jump-rule]], [[nav-reset-folds]], [[world-markets-pr23]].
