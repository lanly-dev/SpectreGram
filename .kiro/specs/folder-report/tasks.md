# Folder Report — Tasks

Part of the `folder-report` Kiro spec. Requirements: `./requirements.md` ·
Design: `./design.md`. Branch: `feat/folder-report`. Trail rules:
`/.kiro/steering/work-trail.md`. `npm run build` + `npm run test` green
before every commit.

1. **Recursive listing + save IPC** (R1, R5) — `walkAudioFiles`, recursive
   `loadFolder` with cap and `truncated`, `currentFolderPath`,
   `sg:save-report`, preload + types; folder panel shows relative paths and
   a capped-list notice.
2. **Classify path** (R3) — `stftParamsFor` in `stft.ts` (used by
   `handleFile` too), worker `classify` request, `src/scan.ts`.
3. **Report logic** (R3, R4, R5, R6) — `src/report.ts`: classes, rating
   tiers, Markdown builder; temporary Vitest check, deleted after.
4. **Scan UI + drumroll** (R2, R4, R5) — Scan/Cancel button, report modal
   with drumroll and reveal, Save report, Esc to close.
5. **Verify + document** — real scan of `lab/` in the desktop app, saved
   report checked; `DEV.md` section; `AGENTS.md` build-log entry.

Out of scope: see `requirements.md` → Non-goals.

---

## Implementation status

- ✅ **1** — 2026-11-16. `walkAudioFiles` (iterative; skips `.`-names; symlinks not followed; unreadable subfolders skipped; cap 1,000) + recursive `loadFolder` sending `truncated`; `currentFolderPath`; `sg:save-report` IPC (string ≤ 10 MB, dialog in the folder, Markdown filter, smoke-mode direct write); preload `saveReport`; `FolderFile`/`FolderLoaded` types; panel rows show the relative path + tooltip, capped-list toast. Checked: `node --check` on main/preload, build ✓, Vitest 10/10 ✓. Behavior on a real nested folder is checked in task 5.
- ✅ **2** — 2026-11-16. `stftParamsFor(sampleCount)` in `stft.ts` (the adaptive-hop rule, moved out of `handleFile`, which now calls it — single opens are unchanged); worker `classify` request → `classify-result` / `classify-error` (no progress, no grid transfer, held zoom samples untouched); `src/scan.ts` `runScan` (sequential read → decode → classify on its own worker; per-file failures become rows with `ok: false`; cancel checked between files; worker disposed on finish). Checked: build ✓, Vitest 10/10 ✓. A real scan is checked in task 5.
- ✅ **3** — 2026-11-16. `src/report.ts`: `classifyRow` / `countClasses` (classes from the verdict text; read failures → "Could not decode"), `rateCollection` (six tiers; costume share = costume ÷ (genuine + costume), so Inconclusive is neutral; thresholds `AVID_MAX_COSTUME_SHARE` 0.2 / `HOARDER_MAX_COSTUME_SHARE` 0.5, TUNABLE; every blurb ends "(estimate)"), `buildReportMarkdown` (header, rating, class counts, per-file table, caveats incl. decode rate) with `mdCell` escaping. Checked with a temporary Vitest file (deleted after; Vitest's locked scope is `cutoff.ts`): 3/3 passed — all 9 `buildVerdict` branches map to the intended class, all 6 tiers reached (incl. 1 genuine + 99 inconclusive → top tier), `|`/newline/backslash escaped. Build ✓, Vitest 10/10 ✓.
- ⏳ **4** — not started.
- ⏳ **5** — not started.
