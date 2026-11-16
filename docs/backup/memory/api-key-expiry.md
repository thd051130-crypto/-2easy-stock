---
name: api-key-expiry
description: API 키 만료 미리 알림·막힘 감지(keys.py, keys.yml 매일 09:00 KST, api_keys.json에 만료일) — 2026-11-15 사용자 "올려", 만료일은 아직 비어 있음
metadata:
  type: project
---
2026-11-15 사용자: "API 만료 시점 미리 알려주는 기능". 텔레그램으로 받기.
- keys.py + .github/workflows/keys.yml: 매일 한국 09:00, 알릴 게 없으면 조용히.
- 만료일: 저장소 api_keys.json의 expires(모르면 null). 30·14·7·3·1일 전·당일(그 뒤 매일) "[키 만료 예정]". DART·ECOS는 만료일 묻는 API가 없고 공식 유효기간 안내도 못 찾음(2026-11-15 검색) → 날짜를 사용자에게 받아 적기. 추측해서 넣지 말기.
- 막힘 감지: DART list.json 상태 010·011·012·901, ECOS KeyStatisticList INFO-100이면 "[키 막힘]" + 실행 실패. 바로 전 실행도 실패면 다시 안 보냄. 한도 초과·네트워크 오류는 알리지 않음. 텔레그램 토큰은 만료 없음이라 뺌. KIS는 안 써서 날짜만.
- 사용자에게 DART(opendart 인증키 관리)·ECOS(ecos.bok.or.kr/api 인증키 관리) 화면에서 만료일 확인 부탁함, 답 대기.
**How to apply:** 사용자가 날짜를 알려 주면 api_keys.json expires에 넣기. 새 유료 아닌 키가 생기면 api_keys.json·keys.PINGS에 추가.
