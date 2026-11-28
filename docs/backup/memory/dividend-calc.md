---
name: dividend-calc
description: 도구 → '배당 계산기' 탭 (2026-11-28) — 자산 기록 종목 주 수 바꿔 최근 배당 기준 1년 배당(세전/세후)·직전 대비 ↑↓·목표 배당금 포트폴리오(선택), 검수 대기
metadata:
  type: project
  modified: 2026-11-28T01:20:26.688Z
---

2026-11-28 사용자 "내가 가진 주식 배당 계산기": 입력해 둔 종목만, 몇 주 모으면 최신 배당으로 얼마(세전/세후), 목표 배당금 → 보유 종목으로 포트폴리오(선택형), 그래프 없이 등락만, 현재 보유로 시작.
- 코드: site/js/divcalc.js (★ 도구 화면 LAZY, sw.js APP_JS·CACHE v9), PERF_TABS 키 "div" (자산 기록 다음). asset.js의 dvHold·dvHist·DV_TAX·dvFx 재사용. CSS `.dc-*`. 저장 localStorage divcalc {q,net,goal,amt,per,way} (BK_KEYS에도).
- 1년 배당 = 최근 1회 배당 × 1년 횟수(dvHist 길이) × 주 수. 최근 1회가 평소의 3배 넘으면 특별 배당일 수 있다고 보고 1년 계산은 평소 크기(삼성전자 9월 4,601원이 야후 자료에 있음).
- 직전 대비: returns.py가 r[7](13~24달 전 배당)을 새로 저장 → 1년 1회 종목도 비교. 데이터는 토요일 returns.py 돌아야 생김(그 전엔 '직전 기록 없음').
- 목표: '지금 비중 그대로'(보유 비율로 늘림) / '모자란 만큼 같은 돈씩'(가격 아는 종목만). 팔기는 안 함. '이 주 수를 위 계산기에 넣기'.
- 브랜치 claude/project-thread-xmvgve, 미리보기 /mnt/project-files/dividend-calc-preview/, PR 전 검수 대기. 관련 [[dividend-calendar]], [[asset-record]].
