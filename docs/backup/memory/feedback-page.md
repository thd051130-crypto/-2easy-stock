---
name: feedback-page
description: 앱 맨 아래 '의견·수정 요청 보내기' → 의견 화면(#kr/feedback), 텔레그램 전달 두 길(봇 붙여넣기 / 클라우드플레어 우체통) — 2026-11-15 검수 대기
metadata:
  type: project
  modified: 2026-11-15T10:25:29.462Z
---

2026-11-15 사용자: 화면 맨 아래 버튼 → 새 페이지에서 수정 요청·의견 받고 텔레그램으로 받기. 사용자가 "앱에 입력한 걸 바로 받기" 원해서 클라우드플레어 Workers 무료 우체통 선택("ㄱ").
- 코드: 브랜치 claude/project-thread-5h5iji 커밋만(푸시·PR 전, 검수 대기). site/app.js feedbackCard/bindFeedback, FB_URL 상수(비어 있으면 봇 붙여넣기 모드), cloudflare/feedback-worker.js(앱 주소 Origin만, 1500자, IP 하루 5통·전체 50통, 비밀 값 TELEGRAM_BOT_TOKEN/CHAT_ID는 클라우드플레어에만).
- bot.py: 남의 대화방 글은 명령으로 안 돌리고 의견으로 내 대화방에 옮김(한 사람 하루 3통·전체 30통, paper/feedback.json엔 해시만).
- 2026-11-15 클라우드플레어 우체통 https://easystock-feedback.thd051130.workers.dev 배포 확인(GET에 "보내기만 받아요"), app.js FB_URL에 넣음. 사용자 "pr 다 합쳐서 머지" → 합친 PR로 올라감. 남은 일: 머지 뒤 앱에서 한 통 보내 텔레그램 도착 확인.
**How to apply:** 공개 저장소라 봇 토큰은 화면 코드에 절대 넣지 않기. 관련 [[review-before-pr]], [[ui-no-jump-rule]].
