---
name: search-forgiving
description: 종목 검색 너그럽게 (2026-10-24) — 낱말 순서·띄어쓰기 무관, '미국' 생략, 한/영 브랜드·동의어, 초성, 오타 1글자, 별명 사전 NICKNAMES
metadata:
  type: project
  modified: 2026-10-24T00:50:17.039Z
---

2026-10-24 사용자: "kodex 나스닥100"으로 "KODEX 미국나스닥100"이 안 나온다, 검색 편하게 + "종목검색 빅데이터". 브랜치 claude/project-thread-h2aj8o.
- symbols.py(봇)와 site/app.js(검색 화면·비교 차트·적립식 계산기 공통)가 같은 규칙. tests/test_search_js.py가 node로 app.js 검색 구간(`const CORP =` ~ `const SYM =`)을 떼어 돌려 Python search_scored와 같은지 확인.
- 점수: 0~4 예전 그대로(통째로 맞춤), 5 친 낱말이 다 들어 있음(순서 무관, 초성 낱말 포함), 6 붙여 친 낱말을 나눠서 맞음, 7 OPTIONAL(미국·us·etf·주식·종목·국내·한국)만 빠짐, 8 오타 허용. 오타(near, 3글자 이상 1글자·8글자 이상 2글자)는 딱 맞는 종목이 하나도 없을 때만 (app은 queryKeys에서 qs.fuzzy 정함, 마지막 검색어 QK 캐시).
- SYNONYMS(나스닥↔nasdaq, 에스앤피↔sp, 미국↔us, 배당↔dividend…)+BRAND_KO(코덱스↔kodex, 솔/쏠↔sol, 타임↔time…). SPLIT_KO로 붙여 친 낱말 나눔, 영문 브랜드는 맨 앞일 때만.
- 초성이 섞인 검색어는 통째 맞춤(qs) 안 함 → findStocks는 qs.toks 길이도 봄.
- 별명 사전 NICKNAMES(symbols.py, 국장 70여·미장 30여: 삼전·하닉·엔솔·곱버스·한국슈드·티큐·마소·페북…)는 build 때 다른 이름 칸 끝에 붙임. 1글자·흔한 낱말 별명(부·사과·월배당)은 이름 그대로 1점이 돼서 뺌.
- 속도(노트북 node): 키 한 번 5~45ms, 처음 초성 검색만 초성 캐시 만드느라 ~45ms.
Previews: /mnt/project-files/search-forgiving-preview/. 관련 [[pr18-stock-search-bot]], [[theme-search-pr30]], [[compare-search-pr39]].
