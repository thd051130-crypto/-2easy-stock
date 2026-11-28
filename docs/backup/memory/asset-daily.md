---
name: asset-daily
description: 자산 기록을 달마다 하나 → 원하는 날마다 여러 번 남기기로 바꿈 (2026-11-28, 사용자 "어")
metadata:
  type: project
---

2026-11-28 사용자 "자산 기록창 매달 기록 말고 기록 하고 싶은 날 기록할 수 있게" → "어".
- 저장 열쇠: AST.months["2026-11-22"] (날짜). 예전 "2026-11" 열쇠는 astFix(tools.js)가 불러올 때 '기록한 날짜'(date) 또는 그 달 1일로 옮기고 date 칸은 지움. 백업 파일 옛 모양도 불러오면 다시 로드돼 같이 옮겨짐. localStorage 이름 'assets'·months 그대로.
- 달력 칸·그래프 = 그 달 마지막 기록(astMonKey), 배당은 그 달 기록 합(astMonDiv), 칸에 "2번" 표시. 비교 기준 = 바로 앞 기록(astPrevYm, 날짜 비교).
- 펼친 화면: 달 ‹ › + '이 달 기록' 날짜 칩(data-ast-day, 지금 것은 버튼 아닌 span) + '＋ 다른 날'(이번 달이면 오늘, 아니면 다음 빈 날, astNewKey; 누르면 바로 앞 기록 종목·주 수·투자금·예수금을 이어받아 만듦, 배당·메모는 비움). '기록한 날짜' 칸을 바꾸면 기록이 그 날로 옮겨감(그 날 기록이 있으면 안 옮기고 안내). '이 날 기록 지우기'.
- 목표 칸·지금 시세 평가·배당 달력·배당 계산기(dvHold)는 오늘까지 마지막 기록(astLastYm) 사용, 날짜는 astDayName.
- PR #168 머지 11-28 18:57 KST (브랜치 claude/project-thread-mnfq38, 11-28 사용자 "올려잇"), 미리보기 /mnt/project-files/asset-daily-preview/. 이전 내용 [[asset-record]].
