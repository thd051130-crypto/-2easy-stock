---
name: security-audit
description: 앱 보안 점검 기록 (2026-11-15 키 노출, 2026-11-21 워커·워크플로·앱) — 새로 밖으로 보내는 기능을 만들면 이 기준으로 다시 보기
---
- 2026-11-15: 두 저장소 전 커밋 점검. 키·토큰·채팅 ID 값은 코드·기록·paper/ 어디에도 없음(전부 Secrets). 이후 커밋 작성자 이메일은 noreply.
- 2026-11-21 (11-15 뒤 116커밋): 키 노출 없음. 클라우드플레어 워커는 토큰을 응답에 안 내보내고, 정시 알람은 Cron으로만 돌아 밖에서 못 부름. PR 워크플로(test·ui-audit)는 읽기 권한·비밀 없음. 앱은 esc()로 글자 처리, 바깥 링크는 https만, 메시지함 HTML은 b·i·https 링크만 살림.
- 고친 것: disclosures.yml이 workflow_dispatch 입력 `days`를 run에 바로 끼워 넣던 것 → env로 받고 숫자만 허용. GH_TOKEN(Actions 쓰기)이 새도 비밀·저장소 쓰기까지 번지지 않게.
- 규칙: 워크플로에서 `inputs.*`·`github.event.*`는 run 안에 `${{ }}`로 넣지 말고 env로 넘기기.
- 의견 우체통 FB_KV(무료 KV easystock-fb) 2026-11-21 연결 → 하루 개수 제한이 정확하게 세짐(Origin 검사는 앱 밖에서 흉내 가능해서 이 제한이 실제 방어). GH_TOKEN 만료 2027-11-20은 api_keys.json에 있음.
