---
name: bad-news-rule
description: 핫 뉴스·지금 뉴스 '⚠️ 악재' 판정 규칙 — 낱말 + 풀림 예외 + 묶음 절반 규칙 (2026-11-24 사용자 "차선책 진행해")
metadata:
  type: project
---
2026-11-24 사용자 "핫 뉴스 악재 선별 기준이 어떻게 돼?" → "키워드를 보고 판단하는거지?" → AI가 기사를 읽고 판단하는 건 유료 API라 예산 규칙에 걸림 → "일단 차선책을 택하자고 진행해".
- 판정은 제목 낱말만 봄 (AI 판단 아님). news.py BAD/GOOD/NOT_GOOD/BAD_SHARE, 앱 site/js/core.js BAD_NEWS/GOOD_NEWS/NOT_GOOD_NEWS/badTitle/isBad — 둘을 같게 유지.
- 1) 풀림 예외: 악재 낱말이 있어도 완화·해소·진정·반등·회복·딛고·극복·철회·타결·휴전 등이 있으면 악재 아님 ("우려 완화", "폭락 딛고 급반등").
  그 풀림이 실패·지연·결렬·역부족·불투명·'~에도'면 다시 악재 ("반등 실패", "완화 카드 역부족", "반등에도 위험 신호").
- 2) 묶음 판정: news.py hot()이 같은 사건 기사 중 악재 기사가 절반(BAD_SHARE 0.5) 이상이면 bad, bads·n 저장. build tag와 weekly.py는 bads 있으면 그 값 그대로. 앱 isBad도 bads 있을 때만 서버 bad를 믿고, 없으면 제목으로.
- 3) 낱말 추가: 반토막·검은 월요일·블랙 먼데이·휘청·출렁·위험 신호·매도세·후폭풍.
- 11-24 live news.json 103개 제목으로 비교: 바뀐 것 8개 (악재→아님 4: 폭락 딛고 급반등 등, 아님→악재 4: 검은 월요일·반토막 등). 묶음 판정 효과는 다음 수집부터 보임.
- 브랜치 claude/project-thread-uwvip2, 미리보기 /mnt/project-files/bad-news-rule-preview/ (before·after). 검수 대기 → PR.
**How to apply:** 악재 오판 제보가 오면 GOOD/NOT_GOOD/BAD에 낱말 추가 (news.py·core.js 둘 다, tests/test_news.py에 예시). 관련 [[live-news]], [[owner-risk-issues]].
