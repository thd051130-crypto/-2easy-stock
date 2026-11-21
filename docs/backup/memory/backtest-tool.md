---
name: backtest-tool
description: 백테스트 도구 backtest.py + backtest.yml (2026-11-21) — Claude 토큰 거의 안 쓰는 구조, 요약 몇 줄만 읽기
metadata:
  type: project
---

2026-11-21 사용자: "백테스트 할 때 자료 받으면 토큰 많이 들 텐데 줄이는 방법 없어?" → 코디네이터가 4가지 제안, 사용자 "ㄱ".

- backtest.py: 계산은 스크립트, 출력은 요약 6~10줄(연평균·최대 낙폭·물린 기간·변동성·최악/최고의 해·비교 자산). 여러 전략이면 낙폭 작은 순 한 줄씩 표.
- 일봉 캐시 backtest/prices/<기호>.csv, 다음부터 새 날짜만(10일 겹쳐 받고 분배금으로 수정 종가가 바뀌면 옛 값을 비율로 맞춤). 하루만 튀는 야후 오류는 despike(앞뒤 둘 다 8% 넘게 같은 쪽)로 뺌, 원본은 그대로.
- 전략은 backtest/strategies.json (lab.py 자산 키 재사용 + 야후 기호). 원화 기준 기본(--local로 현지 통화). 리밸런스 M·Q·Y·N, 이동평균 거르기(달말에만, 미래 안 봄). 비용 0.1%, 세금 뺌.
- 폰: Actions → backtest → Run workflow (strategy / mix "sp500:60,usmid:40" / rebalance / start). 결과는 실행 Summary + backtest/LATEST.md + backtest/results/<이름>.json.
- Claude는 출력·LATEST.md만 읽고 CSV·결과 JSON 통째로 열지 않기 (CLAUDE.md "Backtests"). 오류는 마지막 3줄, 전체는 backtest/last_error.log.
- 공부·검증용. 매매 신호 아님 → 앱 화면에 안 넣음(사용자가 신호 없앰).
- 2026-11 자료상 코스피가 6월 고점에서 크게 빠진 상태(^KS11 9115→4870)라 국장 전략 최대 낙폭 날짜가 2026-11로 나옴. 자료 오류 아님(지수로 확인).

관련: [[weekly-lab]] [[check-tool]]
