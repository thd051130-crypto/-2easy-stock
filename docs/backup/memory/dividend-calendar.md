---
name: dividend-calendar
description: 도구 → 자산 기록 아래 '💰 배당 달력' (2026-11-20) — 자산 기록 종목·주 수로 앞으로 12달 예상 배당(세후), 끄기/켜기, 검수 대기
metadata:
  type: project
  modified: 2026-11-20T12:31:58.029Z
---

2026-11-20 사용자 "2번도 하자"(코디네이터 제안 2번: 자산 기록 종목이 언제 배당을 주고 얼마 들어오는지 달력). 브랜치 claude/project-thread-umu0yg, PR 없이 검수 대기(미리보기 /mnt/project-files/dividend-calendar-preview/).
- 위치: PERF_TABS asset → [assetCard(), divCalCard()]. 코드 site/app.js '배당 달력' 구역(포트폴리오 실험실 바로 앞): dvHold·dvHist·dvLag·dvPlan·divCalCard·bindDivCal·dvRefresh, CSS `.dv-*`. bindAsset redraw에서 dvRefresh() 불러 같이 갱신.
- 보유 = 이번 달까지 종목 적은 마지막 달(astPrevYm(다음 달)) 종목, 계좌 넘어 같은 종목 주 수 합침.
- 금액 = symbols/<시장>_returns.json r[6] 최근 12개월 [배당락 달, 1주당 배당] 그대로 반복 (매달 9번 이상이면 빈 달 채움, 분기 3번이면 4번째 채움, 보통의 8배 넘게 튀면 보통 크기로 — 단 funds div_last와 같으면 진짜로 둠). 미장 × DATA.fx, 세후 국장 15.4%·미장 15%.
- 받는 달 짐작: 국장 주식 12월 → 다음 해 4월, 3·6·9월 → +2달, 그 밖 +1 / 국장 ETF +1 / 미장 funds exdiv→paydiv(+2일) 차이, 모르면 같은 달. funds의 앞으로 올 지급일·배당락일이 맞으면 '확정' 꼬리표, 나머지 '예상'.
- 끄기/켜기 버튼(카드 오른쪽 위), localStorage divcal_off. 등락 색 안 씀(자산 기록 규칙).
- 옛 배당 달력(PR #49)은 PR #70에서 사용자가 지웠음 — 이번 건 사용자가 새로 요청한 것. 같은 때 '시세 평가 켜고 끄기'(claude/project-thread-22cy8j, astLastYm 추가)·'app.js 쪼개기' 스레드가 같은 코드를 고침 → 합칠 때 충돌 확인. 관련 [[asset-record]], [[dividend-receive-calendar-pr49]].
