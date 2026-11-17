---
name: fed-calendar-sync
description: 홈 '큰 발표' 칸과 일정 달력 연준 일정 통일 (2026-11-15)
metadata:
  type: project
---
2026-11-15 사용자: "연준 발표내용 서로 다른데 통일해" (홈에는 11.17 02:00 연준 의장 연설이 있는데 달력에는 없었음).
- 원인: 홈 칸은 events.json(15분마다 갱신, 다음 주 일정은 일요일 오후부터 들어옴)을 쓰고, 달력 calendar.json은 06:50 하루 한 번만 만들어서 다음 주 큰 발표가 빠지거나 FRED 이름(예: '미국 소매판매')으로 달랐음.
- 고침: econ_calendar.big_rows()로 정리하고, dashboard.fresh_calendar()가 배포 때마다 달력 kind big 줄을 최신 events.json + calendar.json releases로 다시 만듦. 홈 칸 줄 앞에 달력과 같은 🚨(tier1)/📌 표시. 남은 시간이 24시간을 넘으면 한국 날짜 차이로 'N일 뒤'(달력 D-n과 맞춤).
- 사용자 검수 뒤 "올려"(2026-11-16) → PR.
