# Claude Code 설정 파일 점검 (prompt-audit) — 2026-10-09

## 전제 (Step 0)

- **범위**: 이 프로젝트 세션에 로드되는 Claude Code 설정만. 설정 파일(settings*.json, .mcp.json, ~/.claude.json)은 읽지 않음.
- **대상 모델**: 이 세션을 돌리는 Claude Opus 5.5.
- **도구 쪽 메모**: 앱 코드는 유료 API를 쓰지 않으므로(프로젝트 결정) Group 4(요청 코드)는 해당 없음.

### 찾은 파일 (Step 1)

| 위치 | 결과 |
|---|---|
| 프로젝트 `-2easy-stock`, `easy-stock`: CLAUDE.md / CLAUDE.local.md / AGENTS.md / `.claude/` | **없음** (README·docs만 있음, 둘 다 설정 파일 아님) |
| 상위 폴더(`/home/user`, `/home`, `/`)의 CLAUDE.md | 없음 |
| `~/.claude/CLAUDE.md`, `~/.claude/rules|commands|agents|output-styles` | 없음 |
| 관리 정책 CLAUDE.md (`/etc/claude-code/`) | 없음 |
| `~/.claude/skills/session-start-hook/SKILL.md` | **점검·수정안 대상** (153줄). ~/.claude 아래라 **모든 프로젝트에 영향** |
| `~/.claude/skills/synced/…` 계정 스킬 15개 (docx, pdf, pptx, xlsx, docs, deep-research 등) | 보고만. Anthropic 제공 스킬의 동기화 사본이라 디스크 수정은 효과 없음 |
| 플러그인 superpowers 6.4.2 (스킬 14개 + SessionStart 훅), design (스킬 7개) | 보고만, 수정안 없음 (요청대로) |
| 플러그인 폴더 안의 AGENTS.md | 프로젝트 폴더 경로 밖이라 로드 안 됨, 점검 제외 |

## 요약

프로젝트 자체에는 Claude용 지시 파일이 하나도 없어서 프로젝트 쪽은 깨끗합니다. 영향이 큰 항목은 두 개입니다.

1. **superpowers 플러그인의 SessionStart 훅**이 매 세션 시작 때 `using-superpowers` 스킬 전문을 `<EXTREMELY_IMPORTANT>` 태그로 주입합니다. "1% 가능성만 있어도 ABSOLUTELY MUST", "not negotiable" 같은 압박 문구라 현재 모델에서는 스킬 과다 호출(간단한 질문에도 brainstorming 등 절차 강제)로 이어집니다. 사용자 선호("핵심 먼저, 바로 실행, 불필요한 확인 반복 금지")와도 정면으로 부딪힙니다. 플러그인이라 수정안은 내지 않고, 이 프로젝트에서 실제로 쓰지 않는다면 플러그인을 끄는 것이 가장 간단한 해결입니다.
2. **session-start-hook 스킬이 스스로 모순**됩니다. "첫 시도에서는 async 모드를 쓰지 말라"고 해 놓고, 바로 아래 템플릿은 `{"async": true}`를 출력하고, 마지막 보고는 "Syncronous"라고 적게 합니다.

그룹별 개수: Group 1 (오래된 문구) 2건 + 보고만 3건 · Group 2 (설정 파일 문제) 1건 + 보고만 1건 · Group 3 (도구 설명) 해당 없음 · Group 4 (요청 코드) 해당 없음.

## 발견 항목 (확신도 순)

### F1. session-start-hook: async 지침과 템플릿 모순 — 확신도 높음

- **위치**: `~/.claude/skills/session-start-hook/SKILL.md:75` vs `:89` (그리고 `:149`)
- **근거**: `:75` "Don't use async mode in the first iteration." / `:89` 템플릿 `echo '{"async": true, "asyncTimeout": 300000}'` / `:149` "Hook execution mode: Syncronous"
- **패턴**: Group 2, 같은 내용에 서로 다른 규칙
- **이유**: 모델은 템플릿을 그대로 복사하는 경향이 강해서(예시가 가장 강한 신호) async 훅을 만들고 보고에는 동기식이라고 적게 됩니다. 셋 중 두 곳(`:75`, `:149`)이 동기식으로 일치하므로 템플릿 쪽이 틀린 것으로 판단.
- **조치**: `rewrite` — 템플릿에서 async 줄 제거. (모든 프로젝트에 영향)

### F2. session-start-hook: IMPORTANT 반복 — 확신도 중간

- **위치**: `:126`, `:130`, `:134`
- **근거**: "IMPORTANT: Verify dependencies…", "IMPORTANT: Figure out what the right command is…" ×2
- **패턴**: Group 1a 압박 문구 (이유 없이 여러 개 강조)
- **이유**: 세 단계가 모두 IMPORTANT라 강조가 정보가 되지 못하고, 현재 모델은 평범한 지시도 그대로 따릅니다.
- **조치**: `rewrite` — "IMPORTANT: " 접두어 삭제. (모든 프로젝트에 영향)

### F3. session-start-hook: "할 일 목록부터 만들라" — 확신도 중간

- **위치**: `:57`
- **근거**: "Make a todo list for all the tasks in this workflow and work on them one after another"
- **패턴**: Group 1b "plan before acting" 지시
- **이유**: 현재 모델은 시키지 않아도 계획을 세우고, 이런 지시는 과도한 계획으로 이어집니다. 단계 순서 자체는 아래 번호가 이미 정해 줍니다.
- **조치**: `remove`. (모든 프로젝트에 영향)

### F4. superpowers `using-superpowers` (SessionStart 훅으로 매 세션 주입) — 보고만

- **위치**: 플러그인 `skills/using-superpowers/SKILL.md:10-16`, 훅 `hooks/hooks.json` (startup|clear|compact)
- **근거**: "If you think there is even a 1% chance a skill might apply… you ABSOLUTELY MUST invoke the skill." / "IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE." / "This is not negotiable." + "Red Flags" 표(이유를 대지 말라는 목록)
- **패턴**: Group 1a 압박 문구, 1c 금지 목록
- **이유**: 강하게 다그치는 문구는 현재 모델에서 과다 발동을 부릅니다. 여기선 "확인 질문 전에도 스킬부터", "만들기 전에 brainstorming 먼저(디자인 승인까지 대기)"가 되어, 이 프로젝트 사용자가 원하는 "바로 실행" 흐름과 충돌합니다.
- **조치**: `flag` (플러그인이라 수정 안 함). 이 프로젝트에서 superpowers를 쓰지 않는다면 플러그인 비활성화를 권장.

### F5. superpowers 다른 스킬의 대문자 강조 — 보고만

- **위치**: `writing-skills/SKILL.md:18,102,150,180,618,631`, `systematic-debugging/SKILL.md:10,46`, `brainstorming/SKILL.md:3,275`, `verification-before-completion/SKILL.md:108`, 각 스킬의 "Iron Law" 절
- **패턴**: Group 1a. 단, `brainstorming:3`의 description은 트리거 문구라 긴급 표현이 허용되는 쪽(keep-list 6).
- **조치**: `flag`.

### F6. 계정 스킬·design 플러그인 — 깨끗함

신호 grep(대문자 강조, "think step by step", 옛 모델명, 단어 수 제한, 진행 보고 금지 등) 결과 눈에 띄는 항목 없음. 대문자 강조 1~2개(`pptx`, `skill-creator`, `pdf`)는 이유가 붙어 있거나 위험 작업이라 그대로 둠.

## 제안 diff (Step 6)

`~/.claude/skills/session-start-hook/SKILL.md` — **모든 프로젝트에 영향**. 이 파일은 클라우드 환경이 설치한 것이라 새 컨테이너에서 원래대로 덮어써질 수 있습니다.

```diff
@@ F3 @@
 ## Workflow
 
-Make a todo list for all the tasks in this workflow and work on them one after another
-
 ### 1. Analyze Dependencies
```

```diff
@@ F1 @@
 cat > .claude/hooks/session-start.sh << 'EOF'
 #!/bin/bash
 set -euo pipefail
 
-echo '{"async": true, "asyncTimeout": 300000}'
 # Install dependencies here
 EOF
```

```diff
@@ F2 @@
-IMPORTANT: Verify dependencies are installed and script completes successfully.
+Verify dependencies are installed and script completes successfully.
@@
-IMPORTANT: Figure out what the right command is to run the linters and run it for an example file. No need to lint the whole project. If there are any issues, update the startup script accordingly and re-test.
+Figure out what the right command is to run the linters and run it for an example file. No need to lint the whole project. If there are any issues, update the startup script accordingly and re-test.
@@
-IMPORTANT: Figure out what the right command is to run the tests and run it for one test. No need to run the whole test suite. If there are any issues, update the startup script accordingly and re-test.
+Figure out what the right command is to run the tests and run it for one test. No need to run the whole test suite. If there are any issues, update the startup script accordingly and re-test.
```

적용은 하지 않았습니다 (요청이 점검·제안까지).
