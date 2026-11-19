# SpectreGram — Specification Index

This directory contains spec-first design artifacts for SpectreGram features.
Each spec follows the three-document pattern: requirements → design → tasks.

## Core features (implemented & shipped)

### 1. [spectregram/](spectregram/)
**Core analysis pipeline** — file intake, decode, STFT in worker, spectrogram
render, cutoff estimate, verdict, PNG export. The foundation spec.

**Status:** ✓ Implemented 2026-11-06, committed @ `6c4e4a1`.

### 2. [electron-shell/](electron-shell/)
**Desktop app shell** — Electron window, `app://` protocol, preload bridge,
native save dialogs, open-with file routing, single-instance lock.

**Status:** ✓ Implemented 2026-11-06, verified headless on Linux.

### 3. [folder-report/](folder-report/)
**Folder scanning & collector rating** — recursive audio file listing, worker
scan, drumroll reveal, collector rating (Crypt Keeper → Costume Party Noob),
Markdown report export. Desktop only.

**Status:** ✓ Implemented 2026-11-16, branch merged to main.
**Additions:** Refresh button (R1b), loading state (R1c), drumroll sound (R4).

### 4. [spectral-message/](spectral-message/)
**Spectral message embedding** — type or dice a phrase (up to 32 chars,
including emoji), generate a new WAV with text drawn into its spectrogram
(dims the band inside letter shapes; nothing added), verdict-safe by
construction. Desktop only.

**Status:** ✓ Implemented 2026-11-17, branch merged to main.
**Evolution:** Tone synthesis rejected (comfort fail) → blended sparkle
invisible → cutting letters into the music (R3a–R3g). Emoji support added (R1a).

### 5. [ruler-seek/](ruler-seek/)
**Ruler seek & playback controls** — hover time ruler to preview, click to cue,
transport controls (Play/Pause, Stop, Back to start), Back/Skip folder
navigation, Space bar shortcut.

**Status:** ✓ Implemented 2026-11-17, branch merged to main.

### 6. [submission-readiness/](submission-readiness/)
**Submission package preparation** — B1 blocker resolution verification,
GitHub Pages deploy, GitHub Release with installers, docs/submission drafts,
final compliance sweep. Agent-delegated work under work-trail rules.

**Status:** Partial (task 1 = B1 resolved; tasks 2+ not started per
`tasks.md` status section).

## Features implemented without dedicated specs

The following features were built without standalone spec directories (either
built by maintainer, or spec-first work with the spec in AGENTS.md only):

- **Time zoom** (drag + Ctrl+wheel) — 2026-11-10, 2026-11-18. Zoom into
  time segments; segments re-analyzed with `computeStftSegment`, not stretched.
  Ctrl+wheel zoom around pointer added later.
- **Export panel** — 2026-11-18, PR #6. Advanced export settings: current view,
  whole track (by speed or equal parts), optional decorations (rulers, dB
  legend), Advanced Export menu toggle.
- **About card** — 2026-11-18. Styled in-app modal replacing native dialog.
- **Halloween UI polish** — 2026-11-10, 2026-11-08. Verdict stamps (👻 GENUINE
  / 🎃 COSTUME), four palettes (Spectrum, Hellfire, Ectoplasm, Pumpkin), haunted
  empty state, ghost playhead, cobwebs, app icon, idle screensaver.
- **Recent-file cache** — 2026-11-16. Memory-only cache (analysis + decoded
  audio tiers), SHA-256 keyed, LRU eviction.
- **Load Sample Audio** menu — 2026-11-18 (latest commit). Development helper.

## Spec-first discipline

SpectreGram was built **Kiro spec-first**: requirements and design documents
land in `/.kiro` before implementation code. This discipline serves two goals:

1. **Kiroween judging evidence** — the `/.kiro` directory shows how Kiro was
   used; spec-first artifacts are part of the submission.
2. **Clean-room assurance** — design from requirements, not from Spek's GPL
   source (see `.kiro/steering/build-conventions.md`).

Features without dedicated specs (zoom, export panel, polish) were either
maintainer-built or small enough to spec inline in AGENTS.md. The core
pipeline, shell, and major features each have full three-doc specs.

## Related files

- **`AGENTS.md`** (repo root) — project source of truth: status, open
  decisions, build log, full feature list. Read first every session.
- **`.kiro/steering/`** — always-on project context: `product.md` (what/pitch/
  scope/acceptance), `build-conventions.md` (locked stack, file structure,
  privacy rules), `work-trail.md` (commit discipline for submission work).
- **`.kiro/hooks/`** — SessionStart hook reminding agents of spec-first,
  clean-room, and privacy rules.

## Status snapshot (2026-11-18)

V1 feature-complete. Core + 5 major feature specs implemented and shipped.
Build + Vitest green. Desktop installers configured (unsigned). Web demo
build verified. Submission package preparation in progress (`.kiro/specs/
submission-readiness/`).
