---
name: savings-per-stock-pr79
description: 적립식 계산기 종목마다 정하기 (금액/주 수, 처음에, N년 뒤부터 N년 동안), 정하면 '내 계획'으로 합계·절세 한도 공유
metadata:
  type: project
---

2026-10-18 사용자: "적립식 계산기 종목별로 얼마나 넣을건지 금액, 갯수 기간 등등을 세분화해줘" → PR #79 (branch claude/project-thread-byyf7u, #77 달력과 같이 병합).
- site/app.js: SAV.each[종목] = {mode:"sh", amt·start(만 원), sh·ssh(주), from(N년 뒤부터), len(N년 동안)}, localStorage "savings"에 같이 저장. 비운 칸은 위 기본값(매달·처음에, 지금부터 끝까지).
- 주 수로: 지금 종가(_quotes.json, 미장은 환율) × 주 수 = 매달 금액. 미래 주가 가정 안 함. 예금·직접 입력은 금액만.
- 한 종목이라도 따로 정하면 '내 계획': 위 칸이 넣은 돈 합계·세후 합계, 그래프에 합계 점선, 절세 계좌 한도(savSplit)를 위 종목부터 나눠 씀. 아무것도 안 정하면 예전처럼 같은 돈 나란히 비교.
- 보는 기간 = max(기간 버튼, 가장 늦게 끝나는 종목). 넣는 기간이 끝나도 넣은 돈은 끝까지 굴림.
- 입력 칸(#sav-each)은 입력 중 다시 그리지 않음(키보드 유지), 금액/주 수 버튼·기본값으로는 그 종목 칸만 outerHTML. playwright로 누른 위치 0px 확인.
Related: [[shares-label-pr47]], [[ui-no-jump-rule]], [[perf-cleanup]]
