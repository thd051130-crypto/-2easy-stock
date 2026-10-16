---
name: stock-data-access
description: Where the swing/monitor code lives and which cloud environments can reach price data / PyPI (as of 2026-10-04)
metadata:
  type: project
---

- 원래 swing_backtest.py, realtime_monitor.py는 별도 저장소 thd051130-crypto/easy-stock(브랜치 claude/adoring-goldberg-911anq)에 있음.
- 한국 대형주 백테스트는 -2easy-stock PR #2 (kr_swing_backtest.py, 브랜치 claude/project-thread-tdl99p).
- 프로젝트 기본 클라우드 환경: 야후·네이버·KRX·stooq 403, pypi·GitHub만 열림.
- 2026-10-04 사용자가 만든 "야후 허용" Custom 환경: 야후는 열림(429 레이트리밋 응답), 하지만 pypi.org·files.pythonhosted.org가 403 → pandas 설치 불가. Custom 환경엔 야후 도메인 + 기본 패키지 매니저 목록을 같이 넣어야 함.

**Why:** 실데이터가 필요한 작업이 클라우드에서 막힘.
- 네트워크 설정 변경은 이미 실행 중인 세션엔 반영 안 됨(2026-10-04 확인) → 새 스레드/세션을 띄워야 함. 야후는 이 프록시 경로에서 urllib로도 계속 429.

**How to apply:** 새 환경 쓸 때 pypi·야후 둘 다 열렸는지 먼저 curl로 확인. 안 되면 사용자 PC(Remote Control)에서 실행. [[project-goal]]
