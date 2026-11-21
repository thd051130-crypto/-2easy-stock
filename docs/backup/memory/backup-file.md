---
name: backup-file
description: 자산 기록 아래 '백업 파일 · 폰 바꿀 때' (2026-11-21) — 이 폰 저장 값 전체를 파일로 저장·불러오기, 덮어쓰기 확인
metadata:
  type: project
---

2026-11-21 사용자 "ㄱ"(코디네이터 제안 승인): 폰 바꾸거나 기록 지우면 자산 기록이 날아가는 걸 막는 백업. 로그인·서버·유료 없이 파일로. (11-18에 비슷한 스레드를 사용자가 "끝내"로 중단한 적 있어서 버튼 두 개로 가볍게.)
- 위치: 도구 → 자산 기록 달력 아래 접힌 칸 '백업 파일 · 폰 바꿀 때'. 코드 site/js/asset.js bkBox/bindBk/BK_KEYS. 브랜치 claude/project-thread-3l5kev.
- 담는 것: BK_KEYS 목록 + watch_kr/us·seen_extras_kr/us (자산 기록·관심 종목·설정 전부). github.io 주소는 다른 저장소 페이지와 저장소를 같이 써서 목록에 있는 이름만. 새 remember("키")를 만들면 BK_KEYS에도 넣기.
- 파일: easystock-backup-YYYY-MM-DD.json = { app:"easystock-backup", v:1, at, keys:{이름: 글자} }. 예전 '자산만 글자 복사'(easystock-assets)도 불러와짐.
- 불러오기: 파일 고르면 "이 파일로 덮어쓸까요? 저장 날짜 · 자산 기록 N달 · 관심 종목 N개" + 덮어쓰기/취소 → 덮어쓰면 앱 새로 열림. 이 앱 백업이 아니면 거절 문구.
- '마지막 저장 날짜'를 bk_at에 기억해 칸에 보여 줌. 파일 저장이 막힌 브라우저(카톡 안)용으로 '파일이 안 되면 글자로 옮기기'(복사·붙여 넣기) 남겨 둠.
- 미리보기 /mnt/project-files/backup-file-preview/. 관련 [[asset-record]].
