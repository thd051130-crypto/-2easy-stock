---
name: actions-schedule-delay
description: GitHub 예약 실행이 10-28쯤부터 6~10시간 늦음 → 클라우드플레어 정시 알람(feedback-worker.js JOBS, 5분마다 workflow_dispatch) + sched-gate.yml로 늦은 예약 실행 건너뛰기 (2026-11-20)
metadata:
  type: project
  modified: 2026-11-20T13:06:24.801Z
---
2026-11-20 사용자 "국장 자료 왜 멈췄어?" → 코드 탓 아님. GitHub schedule이 늦게 옴: daily 국장 08:30 UTC가 실제 16:10~19:00 UTC(한국 새벽 1~4시), 미장 22:30 UTC도 02:00~04:40 UTC. 10-27까지는 제시간. world·all-stocks·news도 밀림/빠짐.
- 증상: 저녁엔 전날 국장 자료. 수동 daily만 돌리면 국장 시세는 오늘 것이지만 홈 지수·리포트 숫자(world.json)는 어제 것 → world → all-stocks kr → daily kr 순서로 돌려야 다 맞음.
- 처음엔 사용자 "지금처럼 두기", 같은 날 22시 "오늘 국장 정보 안 들어온 거 고치자" → 고치기로.
- 고친 방법: cloudflare/feedback-worker.js(의견 우체통과 같은 Worker)에 scheduled + JOBS 표. Cron Trigger "*/5 * * * *" 하나로 시각표대로 workflow_dispatch(main). 비밀 값 GH_TOKEN(fine-grained, 이 저장소만, Actions 읽기·쓰기). 실패하면 텔레그램 하루 한 번.
- .github/workflows/sched-gate.yml(재사용): schedule로 온 실행은 최근 N분 안 같은 워크플로 dispatch(daily·all-stocks는 run-name의 kr/us로 구분)가 있으면 건너뜀. 알람이 멈추면 예약 실행이 예전처럼 대신 돎.
- tests/test_alarm_worker.py: 워크플로 cron과 JOBS가 같은지 확인. cron 바꾸면 JOBS도.
- 2026-11-21 22:45 KST 첫 정시 실행 성공(news workflow_dispatch 13:45:25 UTC). 막혔던 것 3가지: ①폰 붙여넣기 때 옛 코드 끝이 남아 깨짐 ②새 버전이 '최신'만 되고 활성 아님 → 배포 탭 ⋯ '버전 승격' ③토큰에 저장소·권한이 없었음(Only select -2easy-stock + Actions Read and write). Cloudflare 로그(관찰 가능성)에 'Handler does not export a scheduled()'면 ②, 텔레그램 403 'Resource not accessible by personal access token'이면 ③.
- pages 배포 'Found 0 artifact(s)' 실패(11-20·21 3번)는 GitHub 쪽 지연 → PR #151로 기다림+재시도.
**How to apply:** 자료가 늦다는 말이 오면 Actions에서 event가 workflow_dispatch인지 보기(아니면 알람 멈춤 → GH_TOKEN 만료 의심). 토큰 만료 2027-11-20 (사용자 답), api_keys.json GH_TOKEN에 적어 keys.yml이 미리 알림 [[api-key-expiry]]. [[feedback-page]]
