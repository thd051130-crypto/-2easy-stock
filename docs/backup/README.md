# Claude 작업 기록 백업

Claude 프로젝트 쪽에만 있던 메모와 문서를 복사해 둔 곳이에요. Claude 구독을 끊어도 이 폴더는 저장소에 남아요.
앱과 가상매매 기록은 원래 이 저장소에 있어서 따로 백업할 필요가 없어요.

- 마지막 백업: 2026-10-24 (매매 규칙 없앰·리포트 부서 5팀, 메시지함 손잡이, 아래 버튼 접기, 채권·원자재·리츠 지표, 세계 지수 타일, 국고채 ECOS, 종목 검색 너그럽게, 세계 지수 바·한국·미국 지수, 버튼 화면 고정 전수 점검, 장중 뉴스 30분마다, 더 보기 칸 화면, 더 보기 맨 아래 지수 칸 뺌, 산업 지도 점 크기 = 시가총액 합, 목표 초기화 버튼, 일정 달력 고정, 가로 버튼 줄 위치 고정, 메모·점검 탭 없앰, 주간 리포트·포트폴리오 실험실까지)
- 공개 저장소라서 개인 사정에 관한 문장은 지우고 올렸어요.
- 미리보기 사진과 업로드한 사진은 넣지 않았어요.

## 무엇이 어디에 있나

| 폴더 | 내용 |
|---|---|
| [memory/MEMORY.md](memory/MEMORY.md) | **전체 요약.** PR별로 무엇을 만들었는지, 사용자가 정한 것 |
| [memory/](memory/) | 기능별 자세한 메모 51개 (파일 이름 끝 숫자 = PR 번호) |
| [files/proposals/](files/proposals/) | 기능 제안서 2개 (2026-10-05 시스템 성장, 2026-10-09 새 기능) |
| [files/audits/](files/audits/) | Claude 설정 점검 기록 (2026-10-09) |
| [files/reviews/](files/reviews/) | 두 AI 평가 검토 (2026-10-23) |
| [files/report-team/](files/report-team/) | 리포트팀 무료 전문 리포트 조사 지침 (2026-10-23) |
| [files/prompts/](files/prompts/) | 규칙팀 역할 프롬프트 (2026-10-23) |

## 지금까지 정한 것 (핵심)

- 수익률보다 **낙폭 최소화** (보수적). 국장과 미장 둘 다.
- 유료 API(Claude API 등)는 쓰지 않아요. 매매 의견도 무료 규칙으로 만들어요.
- 매매 규칙은 학습팀 제안을 사용자가 고른 것만 바꿔요 (PR #19, #43).
- 가상계좌 5개는 2026-10-08에 모두 1,000만 원(미장 7,470달러)으로 새로 시작했어요.
- 새 정보 칸(뉴스, 경기, 정책, 지도 등)은 참고용이고 매매 규칙은 안 바꿔요.
- 텔레그램 봇 토큰 같은 비밀값은 저장소 "Secrets"에만 있고 여기엔 없어요.

## 기능별 메모 찾기

- 앱 화면 전체: [phone-dashboard](memory/phone-dashboard.md)
- 가상매매·규칙: [paper-trading-log](memory/paper-trading-log.md), [user-rulebook](memory/user-rulebook.md), [learner-pr43](memory/learner-pr43.md)
- 텔레그램 알림·봇: [telegram-format-pr27](memory/telegram-format-pr27.md), [pr18-stock-search-bot](memory/pr18-stock-search-bot.md)
- 적립식 계산기: [shares-label-pr47](memory/shares-label-pr47.md)
- 산업 지도: [industry-map-pr50](memory/industry-map-pr50.md)
- 급락 점검: [drop-check-pr61](memory/drop-check-pr61.md)

## 새 Claude에게 이어서 맡길 때

새 대화에서 "docs/backup/memory/MEMORY.md 읽고 이어서 해 줘"라고 하면 돼요.
