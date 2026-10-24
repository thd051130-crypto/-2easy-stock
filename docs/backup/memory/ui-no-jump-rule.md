---
name: ui-no-jump-rule
description: 사용자 규칙 — 앱에서 버튼·칩·탭을 눌러도 화면 위치가 절대 움직이면 안 됨, 바는 sticky 금지, PR 전에 알아서 자동 확인
metadata:
  type: feedback
---

2026-10-17 사용자: "성과 슬라이드바도 화면 고정 안 되게", "앞으로 화면 변함 없게 알아서 해, 토큰 낭비한다".
- 버튼·칩·탭·접기를 눌러도 보던 화면 위치가 그대로여야 함. 선택 바·칩 줄은 기본으로 따라 내려오지(sticky) 않게.
- 앱 구조(PR #73, site/app.js): render()가 같은 화면(screen|market|stockCode)을 다시 그리면 scrollY를 지키고, keepTap()이 방금 누른 요소(data-* 속성 + 같은 표시 중 몇 번째)를 찾아 화면의 같은 높이로 맞춤(바로·다음 프레임·250ms). 칸만 outerHTML로 다시 그리는 곳도 keepTap() 호출. 다시 그리는 동안 #app min-height를 1.5초 붙잡음. overflow-anchor:none은 오히려 details 열 때 튀어서 쓰지 않음.
- main은 grid라 min-height를 붙잡으면 칸이 늘어남 → align-content:start 필수(PR #74에서 선택 바가 880px로 커진 오류).
- 같은 내용이 두 곳에 나오는 줄(예: 세계 지수 위 4개 + 전체 목록)은 키를 나눠서(main:/all:) 누른 쪽만 펼치기.
- 예외 (2026-10-18 사용자, PR #76): 정부 정책 칸의 호재·악재(▲▼ 업종 버튼, 펼친 정책의 영향 업종 줄)와 업종 칸의 "관련 정부 정책" 줄은 누르면 그 칸으로 이동. 이동 버튼 핸들러에서 render 전에 `lastTap = null`로 keepTap을 끄면 됨 (안 끄면 250ms 뒤 keepTap이 원래 자리로 되돌림). 나머지는 화면 그대로.
- 2026-10-24 전수 점검(사용자 "관심 화면 별 누르면 화면이 돌아감, 다른 탭도 전부"): keepTap()은 누른 칸(id 있는 가장 가까운 칸, tapBox) 안에서만 같은 버튼을 찾음 — 관심 ★가 내 관심종목·전체 종목 두 곳에 있어 위쪽 ★ 자리로 튀던 원인. 페이지 맨 아래에서 접기·칸 줄이기는 holdHeight()가 #app 높이를 붙잡고, 1.5초 뒤 화면 아래 빈칸이 안 보일 때 놓음(releaseHold, 스크롤 때). 검색 테마 칩 scrollTo(0,0) 없앰. 점검 스크립트(/mnt/project-files/tools/jump-audit.js, dashboard.py --out 폴더를 8765로 띄우고 `node jump-audit.js watch`): 390px로 화면마다 모든 button·summary·li·a 눌러 tapSig 위치 비교, 예외(정책↔업종, 종목 화면 #업종 태그 링크, 화면 바꾸는 버튼)만 남음. 2026-10-24(PR #99) 점검 목록에 더 보기 칸 화면 more:<칸> 추가(`node jump-audit.js home,more`). 실적 '대형주 N건 더 보기'는 펼칠 때 lastTap=null로 보던 화면 그대로(짧은 칸 화면에서 버튼을 따라가면 맨 아래로 내려가서).
**Why:** 사용자는 폰으로만 보고, 누를 때마다 다시 스크롤하는 걸 싫어하며 같은 지적을 반복하기 싫어함.
**How to apply:** 새 버튼·칸을 만들면 PR 전에 playwright로 화면마다 버튼을 다 눌러 보고 누른 요소의 화면 위치가 변하는지 확인(스크립트 예: 누르기 전후 getBoundingClientRect().top 비교). 사용자에게 묻지 말고 알아서. 관련 [[scroll-keep-pr60]], [[perf-cleanup]].
