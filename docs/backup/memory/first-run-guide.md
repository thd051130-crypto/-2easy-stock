---
name: first-run-guide
description: 처음 쓰는 사람 사용법 안내(5장 짚어 주기 카드, 2026-11-15) — 검수 대기, 브랜치 claude/project-thread-ic6ldh 로컬 커밋
metadata:
  type: project
  modified: 2026-11-15T11:02:43.995Z
---

2026-11-15 사용자 "맨 처음 사용시 어플 사용 방법 간단히 알려주는 기능" (앱 배포 흐름).
- 형태: 처음 홈을 열면 카드 5장(환영·국장|미장 → 아래 메뉴 5개 → 돋보기 검색·☆ 관심 → 메시지함 손잡이 → 알아 둘 것). 짚는 버튼만 밝게(box-shadow 9999px 스포트라이트), 카드는 반대쪽. 옆으로 밀기·다음·건너뛰기·Esc.
- '봤음'은 localStorage guide_v1 (이 폰에만). 저장소 못 쓰면 안 띄움. 기존 사용자(본인 포함)도 한 번은 뜸. 맨 아래 '❓ 사용법 다시 보기' 버튼.
- 남에게 안 되는 기능(텔레그램 알림 걸기·가격 알림)은 안내에서 뺌.
- 코드: site/app.js GUIDE·guideShow·guideMaybe(load() 첫 render 뒤), style.css .guide-*, index.html .guide-open.
- jump-audit 돌릴 땐 guide_v1을 미리 넣어야 안내 카드가 버튼을 가리지 않음(addInitScript).
- 자세한 사용법 화면 #kr/help (LAYERS, helpCard·HELP·HELP_OPEN, resetFolds에 포함): 화면별 10칸 접힘(홈·리포트·관심·도구·차트·종목·산업 지도·메시지함·홈 화면에 추가·알아 둘 것). 들어가는 길 = 안내 마지막 장 '📖 화면별 자세한 사용법 보기', 맨 아래 '📖 자세한 사용법'. 사용자 2026-11-15 "더 보고 싶은 사람만".
- 상태: PR로 올림 (2026-11-15 사용자 "올려").
관련 [[review-before-pr]], [[ui-no-jump-rule]], [[feedback-page]].
