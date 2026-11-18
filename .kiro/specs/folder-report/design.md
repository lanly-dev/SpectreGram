# Folder Report — Design

Part of the `folder-report` Kiro spec. Requirements: `./requirements.md` ·
Tasks: `./tasks.md`.

## Components

**Electron main (`electron/main.js`) — R1, R5.**
- `walkAudioFiles(root, cap)`: iterative walk using `readdir` with
  `withFileTypes`. Skips names starting with `.`; `Dirent.isDirectory()` is
  false for symlinks, so links are never followed. Collects up to `cap`
  (1,000) audio files, returns `{ files, truncated }`. Each file:
  `{ path, name }` where `name` is the path relative to the root, with `/`
  separators, sorted by name.
- `loadFolder` uses it, grants read access to every listed path (the
  existing allowlist), remembers the folder as `currentFolderPath`, and
  sends `truncated` with `sg:folder-loaded`.
- New IPC `sg:save-report(text, defaultName)`: validates `text` is a string
  under 10 MB, opens `showSaveDialog` with `defaultPath` inside
  `currentFolderPath` and a Markdown filter, writes UTF-8 only if the user
  confirms. Smoke mode (`SPECTREGRAM_SMOKE_SAVE_DIR`) writes without a
  dialog, like the PNG save.

**Preload / types.** `saveReport(text, defaultName): Promise<boolean>`
exposed on `window.spectregramDesktop`; `truncated?: boolean` added to the
folder-loaded payload type.

**Worker (`src/audio/stft-worker.ts`) — R3.** New request
`{ type: 'classify', id, samples, params, sampleRate, claimedFormat }` →
`{ type: 'classify-result', id, cutoffHz, verdict }` or `classify-error`.
Runs `computeStft` + `analyze` without progress messages or grid
transfer. The scan uses its **own** worker instance, so the main view's
worker (and its zoom samples) is never touched.

**STFT params (`src/audio/stft.ts`).** `stftParamsFor(sampleCount)` moves
the adaptive-hop rule out of `main.ts` (cap near 1,024 frames) so a scanned
file is analyzed with exactly the parameters a single open uses — the same
verdict either way.

**Scan orchestration (`src/scan.ts`) — R2, R3.** `runScan(files, opts)`
processes files one at a time: read bytes via the bridge → `decodeFile` →
classify in the scan worker → record a row. Sequential keeps memory to one
decoded file at a time. `opts.onProgress(done, total)`; `opts.isCancelled()`
checked between files; the worker is terminated on finish or cancel.

**Report logic (`src/report.ts`) — R3, R4, R5, R6.** Pure functions, no DOM:
- `classifyVerdict(verdict)` maps verdict text to a class, using the same
  phrases `setVerdict` already keys its stamps on ("genuine lossless",
  "costume", …). Verdict wording itself stays owned by `cutoff.ts`.
- `rateCollection(counts)` → `{ emoji, title, blurb }`. Judged on files that
  **claim lossless** (genuine + costume + inconclusive); "Inconclusive" never
  counts against the user, because of the resampling caveat.

  | Condition | Rating |
  | --- | --- |
  | no lossless claims | 🦇 Lossy Lurker |
  | only inconclusive | 🌫️ Lost in the Fog |
  | costume share 0, ≥1 genuine | 👑 Crypt Keeper — true collector |
  | costume share ≤ 20% | 🧛 Avid Collector |
  | costume share ≤ 50% | 🧟 Haunted Hoarder |
  | costume share > 50% | 🎃 Costume Party Noob |

  Thresholds are `// TUNABLE` constants.
- `buildReportMarkdown(scan)` → the report text (R5 fields, R6 caveats).
  Table cells escape `|` and line breaks.

**UI (`src/main.ts`, `index.html`, `src/style.css`) — R2, R4.**
- Folder panel header: folder name + **Scan** button (becomes
  `Cancel · n / total` while scanning).
- Report modal (`role="dialog"`): stage 1 drumroll screen (🥁 still, "n
  files judged", **Reveal** button, focused). Reveal → the drum shakes and
  `src/drumroll.ts` plays the sound; stage 2 reveal (rating emoji + title +
  blurb + class counts + "(estimate)") appears on the crash, with buttons
  **Save report** and **Close**; Esc closes and stops the sound. Sits below
  the screensaver, above everything else.

**Drumroll sound (`src/drumroll.ts`) — R4, amended.** Synthesized with Web
Audio, no asset: a snare roll of short band-passed white-noise hits with a
small tonal body, ~18 hits/s with a crescendo over ~2.2 s, then a crash
(long high-passed noise decay + a low thump). `playDrumroll()` returns
`{ done, stop }`: `done` resolves at the crash, so the reveal lands on it;
`stop()` silences and closes the context. Its own short-lived
`AudioContext`, created on the Reveal click (a user gesture, so autoplay
rules allow it) and closed after the crash rings out. Without Web Audio the
reveal still happens after the same delay. Reduced motion: the roll
shortens to ~0.6 s.

## Verification

- `npm run build` + `npm run test` green before each commit.
- Vitest's locked scope is `cutoff.ts` only (`build-conventions.md`), so
  `report.ts` is checked with a **temporary** test (classification of every
  `buildVerdict` branch, every rating tier, Markdown escaping), deleted after
  the run — the same practice as the zoom feature.
- Desktop: a real scan of the local `lab/` folder (with a subfolder) through
  the app; report saved via the smoke save path. Results recorded in
  `tasks.md`.

## Risks

- **Long scans:** ~0.5–1 s per file; 1,000 files ≈ 10–15 min. Mitigated by
  progress + Cancel; the cap bounds the worst case.
- **Unfair "noob":** genuine CD rips can read "Inconclusive" on 48 kHz
  devices. Mitigated: inconclusive is neutral in the rating, and the report
  says so.
