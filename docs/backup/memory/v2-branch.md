---
name: v2-branch
description: V2 개발은 -2easy-stock 저장소의 develop-v2 브랜치에서 (2026-10-31), main은 V1 보존 — PR base는 develop-v2
metadata:
  type: project
  modified: 2026-10-31T11:51:36.263Z
---
2026-10-31 사용자가 구조안을 주고 "따로 진행시켜": 같은 저장소(-2easy-stock)에서 main = V1 보존, develop-v2 = V2 개발.
- develop-v2는 main(2026-10-31)에서 만듦. docs/business/에 02·03 진단 문서, docs/v2/README.md에 V2 목표(라이선스 문제 없는 공급자 교체, Adapter 구조, 데이터 메타)와 브랜치 규칙.
- V2 작업 브랜치는 v2/<작업이름>, develop-v2에서 따고 PR도 develop-v2로. main으로 PR·머지 금지.
- ChatGPT도 같은 규칙(develop-v2 기준)으로 쓰라고 안내함.
- 남은 위험: 공개 저장소라 Yahoo 원본이 git 이력에 남음. 03 문서 추천(새 저장소 + 옛 저장소 비공개)은 사용자 결정 대기.
**Why:** 데이터 라이선스 문제 해결 전 V1을 안전하게 남기고 V2를 따로 키우려고 → [[data-provider-audit]], [[business-strategy]].
**How to apply:** V2 작업은 develop-v2 최신에서 시작, PR base를 develop-v2로. V1 버그 수정만 main으로.
