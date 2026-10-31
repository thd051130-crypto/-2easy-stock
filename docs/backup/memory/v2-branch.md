---
name: v2-branch
description: V2 개발은 -2easy-stock develop-v2 브랜치(main은 V1 보존, PR base develop-v2), 설계 문서 세트 docs/v2/ README+01~10+decisions/decision-log.md
metadata:
  type: project
---
2026-10-31 사용자가 구조안을 주고 "따로 진행시켜": 같은 저장소(-2easy-stock)에서 main = V1 보존, develop-v2 = V2 개발.
- develop-v2는 main(2026-10-31)에서 만듦. docs/business/에 02·03 진단 문서(01 수익화 진단은 브랜치 claude/project-thread-vyvmp6에만).
- V2 작업 브랜치는 v2/<작업이름>, develop-v2에서 따고 PR도 develop-v2로. main으로 PR·머지 금지. PR 생성·병합은 사용자 명시 승인 후.
- ChatGPT도 같은 규칙(develop-v2 기준)으로 씀.
- 2026-10-31 V2 정의(사용자): 개인 투자자용 금융·기업 정보 플랫폼, 정보 제공만(추천·신호·AI 예측·자동매매·복잡한 포트폴리오·커뮤니티 없음), 5개 영역(통합 검색·주가·기업/재무·배당·경제), 일봉 중심·실시간 제외, 데이터 월 5만 원, 상업·웹 표시 권한 확인된 데이터만, 출처·기준일 표시.
- 설계 문서(develop-v2에 직접 커밋, 문서만): docs/v2/01-architecture-design.md = 기초 분석서(V1 코드 전수 분석·유지/개선/폐기·Adapter·공통 스키마·로드맵), README 문서 지도 + 01~10 뼈대 + decisions/decision-log.md(결정 D-01~12, 미결정 Q-01~20). 라이선스 상세는 07만, 결정은 decision-log만.
- 남은 위험: 공개 저장소라 Yahoo 원본이 git 이력에 남음. 새 저장소 이사는 사용자 결정 대기(Q-02).
**Why:** 데이터 라이선스 문제 해결 전 V1을 안전하게 남기고 V2를 따로 키우려고 → [[data-provider-audit]], [[business-strategy]].
**How to apply:** V2 작업은 develop-v2 최신에서 시작. 새 결정은 decision-log에 D/Q 번호로 기록, 다른 문서는 번호로 참조. V1 버그 수정만 main으로.
