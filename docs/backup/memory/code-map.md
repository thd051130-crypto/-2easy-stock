---
name: code-map
description: docs/CODEMAP.md 코드 지도 — 코드 고칠 때 지도 먼저 보고 grep·부분 읽기, app.js 통째로 읽지 않기 (크레딧 아끼기, 2026-11-20)
metadata:
  type: feedback
---

저장소 `docs/CODEMAP.md`에 기능 → 파일·함수·대략 줄 지도가 있어요 (2026-11-20 사용자 승인 "어", 코디네이터 제안).
CLAUDE.md 맨 위 규칙: 지도 먼저 → `grep -n "function 이름"` → 그 부분만 100~200줄 읽기. 앱 코드는 화면별 `site/js/*.js`(80~830줄, 2026-11-20 app.js에서 나눔 → [[app-split]]): 지도가 가리키는 파일만 열고 큰 파일은 grep 먼저. `site/style.css`·큰 paper/data JSON은 통째로 읽지 않기.

**Why:** 코드 고칠 때 Claude가 전체 코드를 읽느라 크레딧(사용량)을 많이 써서. 사용자 예산은 Claude 구독료뿐.
**How to apply:** 새 스레드 instructions에 "docs/CODEMAP.md 먼저" 넣기. 기능·화면·구역·스크립트를 더하거나 옮기거나 이름 바꾸면 같은 PR에서 CODEMAP.md도 고치기 (줄 번호 조금 밀리는 건 괜찮음). 관련 [[ui-no-jump-rule]], [[load-speed]].

2026-11-20: 코드 말고 자료·예약·키·서비스·문서는 `docs/INFOMAP.md`, 둘 다 `python tools/check.py map`이 확인 → [[check-tool]].
