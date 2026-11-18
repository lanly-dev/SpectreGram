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

6. **Reveal button + drumroll sound** (R4, amended) — drumroll screen waits
   for **Reveal**; `src/drumroll.ts` synthesizes the roll + crash; reveal on
   the crash; Esc/Close stops the sound; docs updated.

7. **Refresh button** (R1b) — `sg:refresh-folder` IPC re-runs
   `loadFolder` with the options the folder was opened with; preload +
   types; icon button left of Scan; selection kept by path; folder smoke
   adds a file, clicks refresh, and checks the list; docs.

8. **Loading state** (R1c) — `sg:folder-loading` events with a live count,
   load sequence guard, Halloween loading block, buttons disabled, scan
   cancelled; smoke observes the state on a slowed deep tree; docs.

9. **Refresh on the right** (R1b, amended) — move the Refresh button to the right of Scan; check the layout; docs.

Out of scope: see `requirements.md` → Non-goals.

---

## Implementation status

- ✅ **1** — 2026-11-16. `walkAudioFiles` (iterative; skips `.`-names; symlinks not followed; unreadable subfolders skipped; cap 1,000) + recursive `loadFolder` sending `truncated`; `currentFolderPath`; `sg:save-report` IPC (string ≤ 10 MB, dialog in the folder, Markdown filter, smoke-mode direct write); preload `saveReport`; `FolderFile`/`FolderLoaded` types; panel rows show the relative path + tooltip, capped-list toast. Checked: `node --check` on main/preload, build ✓, Vitest 10/10 ✓. Behavior on a real nested folder is checked in task 5.
- ✅ **2** — 2026-11-16. `stftParamsFor(sampleCount)` in `stft.ts` (the adaptive-hop rule, moved out of `handleFile`, which now calls it — single opens are unchanged); worker `classify` request → `classify-result` / `classify-error` (no progress, no grid transfer, held zoom samples untouched); `src/scan.ts` `runScan` (sequential read → decode → classify on its own worker; per-file failures become rows with `ok: false`; cancel checked between files; worker disposed on finish). Checked: build ✓, Vitest 10/10 ✓. A real scan is checked in task 5.
- ✅ **3** — 2026-11-16. `src/report.ts`: `classifyRow` / `countClasses` (classes from the verdict text; read failures → "Could not decode"), `rateCollection` (six tiers; costume share = costume ÷ (genuine + costume), so Inconclusive is neutral; thresholds `AVID_MAX_COSTUME_SHARE` 0.2 / `HOARDER_MAX_COSTUME_SHARE` 0.5, TUNABLE; every blurb ends "(estimate)"), `buildReportMarkdown` (header, rating, class counts, per-file table, caveats incl. decode rate) with `mdCell` escaping. Checked with a temporary Vitest file (deleted after; Vitest's locked scope is `cutoff.ts`): 3/3 passed — all 9 `buildVerdict` branches map to the intended class, all 6 tiers reached (incl. 1 genuine + 99 inconclusive → top tier), `|`/newline/backslash escaped. Build ✓, Vitest 10/10 ✓.
- ✅ **4** — 2026-11-16. Folder panel header = folder name + **Scan** button (`Cancel · n/total` while scanning, "Stopping…" after a cancel click; returns to idle when any scan ends). Report modal (`role="dialog"`, z 25 — above panels/progress, below toasts so save results show, below the screensaver): drumroll stage (🥁 shake, "Drumroll… judging n files", `DRUMROLL_MS` 2.2 s, 0.3 s with reduced motion) → reveal (rating emoji/title/blurb, non-zero class chips, files-judged or stopped-early note), **Save report** (bridge `saveReport`, default `spectregram-report.md`, toast on saved/cancelled/failed) and **Close**. While open, a capture-phase key handler owns the keyboard (Esc closes; u/l dB keys and Esc-zoom don't leak through). Loading another folder mid-scan cancels the scan and drops its result. `CLASS_INFO` gained short chip labels. Build ✓ (still one worker chunk), Vitest 10/10 ✓. Real run in task 5.
- ✅ **5** — 2026-11-16. Added a test-only folder smoke (`SPECTREGRAM_SMOKE_FOLDER`, env-gated in `electron/main.js`). Real desktop run on a temp folder built from `lab/` copies: `Chocolate (lossless).flac` (123 kbps MP3), `Album A/01 Chocolate.mp3`, `Album A/broken.flac` (4 KB of junk), `Album A/Disc 2/02 Camelia.m4a`, `Album A/Disc 2/03 Decade.flac` (309 kbps MP3), plus `.hidden/skip-me.mp3` and `notes.txt`. Listed exactly the 5 audio files, as relative paths (hidden folder and `.txt` skipped). Classes: Costume · Lossy · Could not decode · No call · Inconclusive respectively → rating "Costume Party Noob" (1 costume, 0 genuine). Report saved via the smoke path: 1,966 bytes, all five rows + caveats, decode rate 48000 Hz, no absolute paths. Exit 0, ~7 s wall incl. app start-up. Docs: `DEV.md` "Folder report", `AGENTS.md` build log. **Not verified:** the real Save dialog (smoke writes without it) and a 1,000-file scan.
- ⏳ **6** — 2026-11-16, partial. Drumroll screen waits for **Reveal** (focused; "n files judged. Ready for the verdict?"); the click hides it, shakes the drum (`.drum.rolling`), and `src/drumroll.ts` plays the synthesized roll; the rating appears when `done` resolves at the crash, then Save report is focused. Close/Esc mid-roll calls `stop()`. Folder smoke updated to wait for the drumroll screen, click Reveal and print the roll time. Docs: `DEV.md`, `AGENTS.md` build log. Checked: `node --check`, build ✓, Vitest 10/10 ✓. **Remaining:** (a) run the folder smoke with no other SpectreGram window open (the maintainer's window was running, so the single-instance lock handed the run over and nothing was tested); (b) the maintainer listens to the drumroll and confirms it sounds right.
- ✅ **7** — 2026-11-17. `currentFolderOptions` remembered by `loadFolder`; `sg:refresh-folder` IPC re-lists with them and marks the payload `refreshed`; preload `refreshFolder`; types. Circular-arrow `icon-btn` (`aria-label`/`title` "Refresh folder") left of Scan, spins and disables while refreshing; the selected row is kept by path and scrolled into view; toast "Refreshed …". Test-only smoke `SPECTREGRAM_SMOKE_REFRESH_ADD`: real desktop run (separate `--user-data-dir`) — listed 3 files, selected `Album A/02 Camelia.m4a`, copied a new file into a new subfolder on disk, clicked Refresh → 4 rows incl. `Added Later/sg-new-track.mp3`, selection unchanged, toast "Refreshed … 4 audio files"; DOM layout: name → Refresh (22 px) → Scan, 6 px gaps, one row. A window screenshot wasn't possible (`capturePage` → `UnknownVizError` on this machine), so the look itself is for the maintainer's eyes. Docs: `DEV.md`, `AGENTS.md`. Build ✓, Vitest 10/10 ✓.
- ✅ **8** — 2026-11-17. `walkAudioFiles` reports a live count (≤ every ~150 ms); `loadFolder` sends `sg:folder-loading` (start, progress, and `active: false` when nothing is found or the read fails) with a `folderLoadSeq` guard so only the latest load reports; preload `onFolderLoading`; `FolderLoading` type. Renderer: the list gives way to a `#folder-loading` block (floating 👻, "Summoning the spirits…", "Searching “name” — n audio files found"), the panel opens if it was hidden, Refresh and Scan are disabled and the refresh icon spins for the whole walk (open, sample folder or refresh), a running scan is asked to stop; `folder-loaded` / `active: false` restores the list. Test-only `SPECTREGRAM_SMOKE_WALK_DELAY_MS`. Real desktop run (separate `--user-data-dir`) on a 56-folder tree of 480 small files with a 50 ms/folder delay: 33 of 34 panel samples were in the loading state, all with the list hidden and both buttons disabled; the count climbed 0 → 10 → 40 → 60 → … → 450; at the end 480 rows, buttons enabled; Refresh on the same tree kept the selection. Docs: `DEV.md`, `AGENTS.md`. Build ✓, Vitest 10/10 ✓. **Not verified:** the look of the loading block (window screenshots fail on this machine).
- ⏳ **9** — not started.
