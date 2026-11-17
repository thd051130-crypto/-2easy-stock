---
name: report-archive
description: 지난 리포트 보관함 + 리포트 화면 '📅 지난 리포트' 달력 탭 (2026-11-17, 검수 대기, 브랜치 claude/project-thread-jdq9wh)
metadata:
  type: project
---
2026-11-17 사용자 "리포트 모아둔거 달력으로 만들어서 저장해봐".

- 원인: report.json·weekly.json은 매번 덮어써서 지난 리포트가 안 남았음 (메시지함은 텔레그램 글만, 90일).
- report_archive.py: 만들 때마다 paper/reports/<년-월>/<날짜>-<HHMM>-daily-<kr|us|both>.json / -weekly.json 한 장씩. report_desks.main·weekly.main이 저장 (MARKETS 환경변수 = 그 실행에서 새로 받은 장). `--backfill`로 git 예전 판 채움 → 10-24~11-17 38장 복원(커밋 메시지 '(kr)'·'(us)'로 장 구분).
- dashboard.py가 _site/reports/로 복사 + reports/index.json 목록, data.json엔 reports_n만. weekly.yml git add에 paper/reports 추가, pages.yml paths에 report_archive.py.
- 앱: 리포트 화면 탭 '📰 오늘 · 🗞 주간 · 📅 지난 리포트'(rpTab='past'). 월~일 7칸 달력(주간이 토요일이라), 칸 표시 🇰🇷 국장 마감 뒤·🇺🇸 미장 마감 뒤·🗞 주간 순서 고정, 없는 날 점선. 날짜 누르면 그날 리포트 버튼 줄 → 아래에 그 리포트를 기존 reportCards/weeklyCards로 그대로 (DATA.report를 잠깐 바꿔 끼움, 예전 형식이면 요약만). 국장·미장 탭에 맞는 리포트 먼저. 화면 고정 점검 통과.
- 날짜는 리포트의 day(만든 한국 날짜). GitHub 예약 실행이 몇 시간 늦어 국장 리포트가 다음 날 새벽에 찍히는 날이 많음(예: 11-17 03:53 🇰🇷).
- 크기: 한 장 약 30KB, 하루 2장 → 1년 약 20MB. 커지면 오래된 것 줄이기 검토.
- 미리보기: /mnt/project-files/report-calendar-preview/ (라이트·다크 1~4). 검수 통과하면 PR.
관련 [[report-desks]], [[weekly-lab]], [[inbox-report]], [[ui-no-jump-rule]].
