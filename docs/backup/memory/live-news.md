---
name: live-news
description: 증시 사건 뉴스 30분마다(news.py → live 브랜치 news.json → 앱이 raw에서 바로 읽음), 종목 뉴스 없음 — 사용자 결정 (2026-10-24, PR #99)
metadata:
  type: project
---
2026-10-24 사용자: "뉴스나 데이터를 빠릿빠릿하게 받아올 방법" → 결정 카드에서 **뉴스만 자주** 고름 (장중 10분 시세 갱신·기존 주기 늘리기는 안 고름). 이어서 "관심종목 뉴스는 상관없어, 증시에 영향을 줄 만한 사건 뉴스면 돼".
- 그때 갱신 주기: 시세는 하루 2번(국장 16:10~17:30, 미장 06:20~07:30), 정책 뉴스 하루 1번(macro 06:50).
- news.py(stdlib만) + .github/workflows/news.yml: 30분마다(cron 13,43) 구글 뉴스 RSS. 국장·미장마다 검색어 6개(금리·환율·수출·외국인·정부 대책 / 뉴욕증시·연준·물가 고용·관세·유가·S&P500 나스닥 마감 — 영어 "stock market"은 종목 하나 기사가 많아 뺌, PR #101), 최근 하루, 같은 제목 하나로, 새 것부터 15개. 제목 낱말로 topic(금리·물가·지표·환율·무역·관세·유가·원자재·지정학·정책·실적). 종목별 뉴스 없음. news.json = {updated, kr:[...], us:[...]}. orphan 커밋 하나로 `live` 브랜치 force push (pages 재배포 안 함).
- dashboard.py가 data.json에 news_url(raw.githubusercontent.com/<repo>/live/news.json, CORS 허용) 넣음. app.js loadNews(): data.json과 같이 받고 2.5초만 기다림, 늦으면 홈 줄 요약만 paintNews().
- 앱: 홈 '더 보기' 맨 위 📰 지금 뉴스 → 누르면 #kr/more/news 화면.
- 이 클라우드 환경에선 news.google.com 막힘 → Actions에서만 확인 가능.
**Why:** 사용자는 장중에도 증시 큰 소식을 보고 싶어 함. 진짜 실시간 시세는 증권사 API 필요(계좌 없음, 키움 IP 보류).
**How to apply:** 종목 뉴스를 다시 넣지 말 것(요청 시만). 시세 장중 갱신을 원하면 같은 live 브랜치 방식으로 확장. 관련 [[home-cleanup-pr64]], [[ui-no-jump-rule]].
