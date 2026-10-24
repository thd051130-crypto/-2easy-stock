---
name: inbox-report
description: 앱 메시지함(오른쪽 아래 파란 동그라미 버튼): 텔레그램으로 보낸 알림 모아 보기 + 오늘의 리포트 한 장 (2026-10-23)
metadata:
  type: project
---
2026-10-23 사용자 요청: "텔레그램으로 보내는 내용을 이지스톡에서 볼 수 있게" + 아래 메뉴 바 위 오른쪽에 작은 동그란 메시지 버튼(시안 승인) + "다른 리포트 자료 참고"(증권사 모닝 브리프 구성).

- inbox.py: 보낸 알림을 paper/inbox/<년-월>/<일시>-<보낸 곳>.json 한 통에 파일 하나로 저장 (여러 워크플로가 동시에 저장해도 git 충돌 안 나게). GitHub Actions에서만 저장, INBOX_DIR로 바꿀 수 있음. 텔레그램 HTML 그대로, 사진은 설명만.
- 저장 지점: realtime_monitor.send_telegram(보낸 스크립트 이름이 src), kr_swing_signals.send_signal(요약+자세히 한 통), health.send_telegram, bot.py는 봇이 먼저 보내는 알림(가격 알림·내 판단 주간 결산·큰 발표)만. 명령에 대한 답장은 저장 안 함. 고장 알림은 실패한 실행이라 커밋 안 돼서 안 남음.
- 워크플로 커밋에 paper/inbox 추가: macro·learner·disclosures·health (swing-signals·telegram-bot은 원래 git add paper). health 주간 점검이 90일 지난 파일 지움.
- dashboard.py가 최근 60일·200통을 _site/inbox.json으로(앱은 열 때만 받음), data.json엔 inbox_last만 → 안 읽은 알림이면 버튼에 빨간 점(localStorage inbox_seen).
- 앱: 화면 #kr/inbox (층 화면, 버튼 다시 누르면 닫힘). 위에서부터 메시지함 제목 → 오늘의 리포트(한 줄 요약 3줄 + '자세히 보기': 지수·환율, 신호, 많이 움직인 종목, 국장 수급, 업종 흐름, 오늘·내일 일정, 가상계좌. data.json만으로 앱이 만듦) → 받은 알림(날짜별, 가장 최근 것만 펼침, 텔레그램 접기는 '자세히').
- 버튼 (2026-10-24 사용자: 글자 가리지 않게): 평소엔 오른쪽 가장자리 12×56px 얇은 손잡이(.inbox-btn.tucked, 빨간 점 보임). 누르거나 왼쪽으로 밀면 48px 파란 동그라미로 나오고, 그걸 누르면 메시지함. 오른쪽으로 밀거나 4초 지나면 다시 숨음. 위아래로 끌어 옮기고 localStorage inbox_y(화면 높이 비율)에 기억. app.js inboxHandle().
관련: [[telegram-format-pr27]], [[ui-no-jump-rule]], [[phone-dashboard]]
