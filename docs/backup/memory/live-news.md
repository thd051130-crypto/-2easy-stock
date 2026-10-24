---
name: live-news
description: 장중 뉴스 30분마다(news.py → live 브랜치 news.json → 앱이 raw.githubusercontent.com에서 바로 읽음), 사용자가 '뉴스만 자주' 고름 (2026-10-24)
metadata:
  type: project
---
2026-10-24 사용자: "뉴스나 데이터를 빠릿빠릿하게 받아올 방법" → 결정 카드에서 **뉴스만 자주** 고름 (장중 10분 시세 갱신·기존 주기 늘리기는 안 고름).
- 그때 갱신 주기: 시세는 하루 2번(국장 16:10~17:30, 미장 06:20~07:30), 정책 뉴스 하루 1번(macro 06:50), 종목 뉴스는 daily 리포트 때만.
- news.py + .github/workflows/news.yml: 30분마다(cron 13,43) 구글 뉴스 RSS(stdlib urllib, 6개 동시). 시장 뉴스 국장·미장 검색어 3개씩 → 새 것부터 12개, 종목 뉴스 = marketdata.UNIVERSE·US_UNIVERSE(48개씩) + paper/watch.json 종목, "<이름> 주가" 최근 하루 3개. 결과를 orphan 커밋 하나로 `live` 브랜치에 force push (기록 안 쌓임, pages 재배포 안 함).
- dashboard.py가 data.json에 news_url(raw.githubusercontent.com/<repo>/live/news.json, CORS 허용·5분 캐시라 ?t= 붙임) 넣음. app.js loadNews(): load()에서 data.json과 같이 받고 2.5초만 기다림, 늦으면 접힌 줄만 paintNews()로 바꿈(화면 안 튀게).
- 앱: 홈 '더 보기' 맨 위 📰 지금 뉴스(시장 뉴스 + ⭐ 내 관심종목 뉴스), 종목 화면 머리 칸 아래 "오늘 뉴스"(받은 종목만).
- 한계: 앱에서만 ⭐ 누른 종목(localStorage)은 서버가 몰라서 기본 종목이 아니면 뉴스 없음. 이 클라우드 환경에선 news.google.com 막힘 → Actions에서만 확인 가능.
**Why:** 사용자는 장중에도 새 소식을 보고 싶어 함. 진짜 실시간 시세는 증권사 API 필요(계좌 없음, 키움 IP 보류).
**How to apply:** 시세도 장중 갱신을 원하면 같은 live 브랜치 방식(작은 json + raw 읽기)으로 확장. 관련 [[home-cleanup-pr64]], [[ui-no-jump-rule]], [[policies-pr44]].
