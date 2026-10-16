---
name: theme-search-pr30
description: PR #30 (merged 2026-10-09 10:59 KST) — sentence/theme search in the phone app search screen ('전력 관련 종목 찾아줘'), themes.py → themes.json
metadata:
  type: project
  modified: 2026-10-09T01:58:36.510Z
---

PR #30 (merged 2026-10-09) on branch claude/project-thread-pbpghr adds theme search to the existing search screen (#kr/search). No paid API.
- themes.py: 36 hand-picked themes (keys = synonyms, kr/us {code: Korean name}, etf name regex, ind = Yahoo industry regex used for US only, sector = sectors.py name). dashboard.py writes <out>/themes.json, dropping codes missing from paper/symbols. `python themes.py` lists delisted codes (HD현대미포, 비올, EA already removed).
- app.js parseAsk(): strips filler words (FILLER in themes.py), longest-key-first matching, single-char keys ('금') only as a whole word, '미국/국장' limit market, exact stock names ('한국전력') show stocks first.
- Previews: /mnt/project-files/theme-search-preview/.
Related: [[phone-dashboard]], [[pr18-stock-search-bot]], [[macro-regime-pr22]]
