---
name: heatmap-treemap-pr45
description: PR #45 (2026-10-11) home market heatmap squeezed into one square treemap box (site/app.js squarify)
metadata:
  type: project
---

User said the home 시장 히트맵 was too long (~1,540px). PR #45 replaces per-sector flex rows with one square `.heat-box` (aspect-ratio 1, container-type inline-size) holding a two-level squarified treemap (sectors, then stocks). Tile size = cap^0.6, font in cqw, tiny tiles color only. Card ~480px tall. Previews in /mnt/project-files/heatmap-preview/.

Local preview note: dashboard.py output crashes the home screen locally because paper/watch.json extras lack `spark`; patch data.json (extras spark=[]) for screenshots. Related: [[phone-dashboard]]
