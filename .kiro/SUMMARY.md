# SpectreGram — .kiro Directory Summary

This directory contains the Kiro-specific artifacts that demonstrate how
SpectreGram was built **spec-first** using Kiro. These artifacts serve as
evidence for Kiroween 2026 judging.

## Quick navigation

- **[specs/README.md](specs/README.md)** — index of all feature specifications
- **[steering/product.md](steering/product.md)** — stable product context (what/pitch/scope/acceptance)
- **[steering/build-conventions.md](steering/build-conventions.md)** — locked stack, file structure, privacy rules
- **[steering/work-trail.md](steering/work-trail.md)** — commit discipline for submission work
- **[hooks/kiro-signature-reminder.json](hooks/kiro-signature-reminder.json)** — SessionStart hook

## What's in this directory

### 1. Specifications ([specs/](specs/))

Six complete feature specs, each following the requirements → design → tasks
pattern:

| Spec | Feature | Status |
|------|---------|--------|
| [spectregram/](specs/spectregram/) | Core analysis pipeline | ✓ Shipped 2026-11-06 |
| [electron-shell/](specs/electron-shell/) | Desktop app wrapper | ✓ Shipped 2026-11-06 |
| [folder-report/](specs/folder-report/) | Folder scanning & rating | ✓ Shipped 2026-11-16 |
| [spectral-message/](specs/spectral-message/) | Text in spectrogram | ✓ Shipped 2026-11-17 |
| [ruler-seek/](specs/ruler-seek/) | Seek & playback controls | ✓ Shipped 2026-11-17 |
| [submission-readiness/](specs/submission-readiness/) | Packaging & submission | ⏳ In progress |

Additional features (time zoom, export panel, About card, Halloween polish,
recent-file cache) were built without standalone specs — either by the
maintainer or spec'd inline in AGENTS.md.

**Key evidence for judges:**
- Each spec has three markdown files showing the design process
- Tasks map to actual commits (traceable via git log)
- Implementation dates and commit hashes documented in specs/README.md

### 2. Steering files ([steering/](steering/))

Always-on project context that every Kiro session reads:

- **product.md** — what SpectreGram is, the Resurrection pitch, v1 scope,
  non-goals, acceptance checks, deadline. Updated 2026-11-18 to reflect
  feature-complete state.
- **build-conventions.md** — locked stack (vanilla TS, no framework), clean-room
  constraint (GPL avoidance), file structure, code conventions, privacy hard
  rule (no absolute paths in tracked files). Updated 2026-11-18 with actual
  file structure.
- **work-trail.md** — commit discipline for submission-readiness work: spec
  first, one commit per task, status updates in same commit, honesty rules,
  stop conditions.

**Key evidence for judges:**
- Steering enforces clean-room (Spek is GPL-3.0, SpectreGram is MIT)
- Privacy rule prevents local paths in tracked files
- Stack locked early (2026-11-06) to prevent framework creep

### 3. Hooks ([hooks/](hooks/))

- **kiro-signature-reminder.json** — SessionStart hook that reminds every Kiro
  session to: read AGENTS.md, build spec-first, respect clean-room/privacy/stack
  rules, label every verdict an estimate.

**Key evidence for judges:**
- Hook ensures consistency across multiple Kiro sessions
- Automates enforcement of project constraints

## How SpectreGram used Kiro

### Spec-first workflow

1. **Requirements** written first (what the feature must do, acceptance criteria)
2. **Design** follows (how it works, architecture, data flow, TUNABLE constants)
3. **Tasks** break down implementation (one task = one commit when possible)
4. **Implementation** in source code, mapped to tasks
5. **Verification** recorded in spec status sections

Example: The folder-report spec (requirements → design → tasks) landed before
any folder-scanning code was written. The spec's R1-R5 map to commits, and
the Implementation Status section at the end of tasks.md tracks exactly what
was verified.

### Evidence trail

- **git log** shows spec commits before implementation commits
- **/.kiro/specs/** directories have earlier timestamps than their src/ code
- **AGENTS.md** build log records every session's work and lessons learned
- **Steering files** show constraints were set up early (build-conventions.md
  dated 2026-11-06, before most features)

### What differs from vibe coding

**With Kiro spec-first:**
- Design decisions documented before code (why not FFmpeg.wasm, why vanilla TS)
- Acceptance criteria defined up front (60s no-freeze, verdict always says
  "estimate")
- TUNABLE constants planned in design, named in tasks, implemented consistently
- Constraints locked early (clean-room, no framework, privacy rules) via
  steering, enforced by hooks

**Vibe coding would have:**
- Started with code, documentation after (if at all)
- Made stack choices implicitly or changed them mid-project
- No clean-room discipline (might have copied Spek code patterns)
- Acceptance criteria emergent, not planned

### Workflow diversity

SpectreGram used different Kiro modes:
- **Kiro IDE sessions** for most spec-first feature work (spectregram core,
  electron-shell, folder-report, spectral-message, ruler-seek,
  submission-readiness)
- **Manual coding by maintainer** for some features (time zoom, export panel,
  Halloween polish) — these are disclosed in the submission write-up
- **Steering + hooks** to keep manual work aligned with project constraints

## Kiroween 2026 compliance

### Required /.kiro artifacts present

✓ Specs directory at repo root (6 feature specs)  
✓ Steering files (product context, conventions, work trail)  
✓ Hooks (SessionStart automation)  
✓ Everything committed and visible (not gitignored)  

### How judges can verify

1. **Spec-first discipline:** Compare spec commit dates to implementation
   commits — specs are older. Example: `.kiro/specs/folder-report/` committed
   2026-11-16 before `src/scan.ts` / `src/report.ts`.

2. **Design artifacts are real:** Each spec's design.md explains architecture
   (e.g., folder-report/design.md describes the two-tier rating system before
   it was coded).

3. **Steering enforced constraints:** build-conventions.md locked the stack on
   2026-11-06; no framework was added after that date (verifiable via git log).

4. **Clean-room execution:** No Spek code in this repo; the GPL license is
   never imported. Only the concept (spectrum analysis + cutoff heuristic) was
   reimagined.

5. **Usage breadth:** Six different feature specs spanning the project lifecycle
   (core → shell → features → submission prep) shows sustained Kiro use, not
   just one-off experimentation.

## Files outside .kiro that demonstrate Kiro usage

- **AGENTS.md** (repo root) — session-by-session build log, lessons learned,
  open decisions tracked. Updated every work session.
- **DEV.md** (repo root) — development guide referencing specs and TUNABLE
  constants from design docs.
- **README.md** (repo root) — mentions spec-first approach and links to /.kiro.

## Summary statistics (for write-up)

- **6 complete feature specs** (requirements + design + tasks)
- **3 steering files** (product, conventions, work trail)
- **1 hook** (SessionStart reminder)
- **~140 commits** on main branch (as of 2026-11-18)
- **Spec coverage:** Core pipeline, desktop shell, and 4 major features
  documented spec-first
- **Implementation span:** 2026-11-06 (first spec) → 2026-11-18 (feature-complete)

---

**For the full project status and build log**, see `AGENTS.md` at the repo root.
**For a map of all specs**, start with [specs/README.md](specs/README.md).
