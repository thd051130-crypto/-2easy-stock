# Notes for Claude

## Read the code map first (save credits)

`docs/CODEMAP.md` says which file, function and rough line each feature lives in.

- Before changing code, read `docs/CODEMAP.md` first. Then find the exact spot with `grep -n` and read only that part (Read with offset/limit, about 100–200 lines).
- Never read `site/app.js` (about 7,900 lines) or `site/style.css` whole. Do not open big `paper/` or `data/` JSON files whole either; use `head`, `python -c` or `jq` for the part you need.
- When you add, move or rename a feature, screen, section or script, update `docs/CODEMAP.md` in the same PR. Small line-number drift is fine.

## Keep docs/backup in sync

`docs/backup/` is a copy of the Claude project memory and project documents, kept so they survive outside Claude.

- When you add or change a project memory file, copy the same change into `docs/backup/memory/` in the same PR. Update `docs/backup/memory/MEMORY.md` when the memory index changes, and the "마지막 백업" date in `docs/backup/README.md`.
- When you add a document (.md) to the project's shared files, copy it into `docs/backup/files/<folder>/`. Skip images.
- This repository is public. Before copying, remove secret values (tokens, passwords, account numbers, chat ids, bot handles) and sentences about the user's personal situation (job, status, life plans, which cards or accounts they have). Keep the app facts and the user's decisions about the app.
- New memory files in `docs/backup/memory/` can be read first by a new Claude session that has lost the project memory.
