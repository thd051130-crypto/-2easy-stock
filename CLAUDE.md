# Notes for Claude

## Code map first (save credits)

- Before changing code, read `docs/CODEMAP.md`, then `grep -n` and read only that part (100–200 lines). App code is split by screen in `site/js/*.js` (80–830 lines each): open only the file the map names, and in big ones still grep first. Never read `site/style.css` or big JSON files whole.
- For data files, workflows and schedules, secret names, outside services and docs, read `docs/INFOMAP.md` instead of opening workflow or data files.
- If you add, move or rename a feature, section, script, data file or workflow, update `docs/CODEMAP.md` / `docs/INFOMAP.md` in the same PR. `python tools/check.py map` checks them (CI runs it too).
- Checks: `python tools/check.py` runs the fast set (map, js, changed tests, data freshness, button audit if screens changed). Pick kinds like `map,js` or `test:all`; `diff` compares screens against main.
- To read one function, JSON shape or CSS rule, use `python tools/peek.py <name | file.json [path] | style.css selector>` instead of opening the file.

## Checks and previews (save tokens)

- A kind that passed is skipped next time if no file changed (`.check-cache.json`). Trust that line; don't re-run. `--fresh` only when you really need a new run.
- Screen changes: run `python tools/check.py diff` and open only the `_screen-diff/<screen>-crop.png` files it names (changed strips only, before left / after right). Don't open the full before/after/diff images or full-page screenshots yourself.
- Preview pictures for the user: `python tools/check.py shots --out /mnt/project-files/<name>-preview/ --screens home:kr,tools:asset:kr` saves light and dark at 2x. Attach them to the reply without opening them.

## Keep docs/backup in sync

`docs/backup/` is a copy of the Claude project memory and project documents, kept so they survive outside Claude.

- When you add or change a project memory file, copy the same change into `docs/backup/memory/` in the same PR. Update `docs/backup/memory/MEMORY.md` when the memory index changes, and the "마지막 백업" date in `docs/backup/README.md`.
- When you add a document (.md) to the project's shared files, copy it into `docs/backup/files/<folder>/`. Skip images.
- This repository is public. Before copying, remove secret values (tokens, passwords, account numbers, chat ids, bot handles) and sentences about the user's personal situation (job, status, life plans, which cards or accounts they have). Keep the app facts and the user's decisions about the app.
- New memory files in `docs/backup/memory/` can be read first by a new Claude session that has lost the project memory.
