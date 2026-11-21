# Notes for Claude

## Code map first (save credits)

- Before changing code, read `docs/CODEMAP.md`, then `grep -n` and read only that part (100–200 lines). App code is split by screen in `site/js/*.js` (80–830 lines each): open only the file the map names, and in big ones still grep first. Never read `site/style.css` or big JSON files whole.
- For data files, workflows and schedules, secret names, outside services and docs, read `docs/INFOMAP.md` instead of opening workflow or data files.
- If you add, move or rename a feature, section, script, data file or workflow, update `docs/CODEMAP.md` / `docs/INFOMAP.md` in the same PR. `python tools/check.py map` checks them (CI runs it too).
- Checks: `python tools/check.py` runs the fast set (map, js, changed tests, data freshness, button audit if screens changed). Pick kinds like `map,js` or `test:all`; `diff` compares screens against main.

## Keep docs/backup in sync

`docs/backup/` is a copy of the Claude project memory and project documents, kept so they survive outside Claude.

- When you add or change a project memory file, copy the same change into `docs/backup/memory/` in the same PR. Update `docs/backup/memory/MEMORY.md` when the memory index changes, and the "마지막 백업" date in `docs/backup/README.md`.
- When you add a document (.md) to the project's shared files, copy it into `docs/backup/files/<folder>/`. Skip images.
- This repository is public. Before copying, remove secret values (tokens, passwords, account numbers, chat ids, bot handles) and sentences about the user's personal situation (job, status, life plans, which cards or accounts they have). Keep the app facts and the user's decisions about the app.
- New memory files in `docs/backup/memory/` can be read first by a new Claude session that has lost the project memory.

## Backtests (save tokens)

- Run `python backtest.py [name|--mix "sp500:60,usmid:40"]` and read only its printed summary (about 10 lines), or `backtest/LATEST.md`. Never open `backtest/prices/*.csv` or whole `backtest/results/*.json`; if you need one number, pick it with a one-line `python -c` / `jq`.
- Daily prices are cached in `backtest/prices/` and only new days are downloaded. Heavy runs go to the `backtest` workflow (workflow_dispatch). Errors print the last 3 lines; the full trace is in `backtest/last_error.log`.
- It is a study tool, not a trading signal: don't show it in the app as buy/sell advice.
