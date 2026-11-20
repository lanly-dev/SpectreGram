# Submission Readiness — Requirements

Part of the `submission-readiness` Kiro spec (spec-first: this spec is
committed before any of the work it describes).
Parent context: `AGENTS.md` (repo root — read it first, including the
"Kiroween 2026 — official compliance requirements" section, which is the
authority for everything below) and `/.kiro/steering/work-trail.md`
(trail rules — binding for every task in this spec).

### Goal

Take SpectreGram from **built** to **submittable** as a desktop-only app:
the Electron app is feature-complete on `main`, but as of 2026-11-16 there
is no GitHub Release, an unmerged flair PR, two unverified engineering loose
ends, and no submission package. The Vite output is an internal renderer
build consumed by Electron; there is no hosted web app. Deadline: **Fri Dec
4, 2026, 2:00 PM PT** (Kiroween submission close). After this spec, the only
remaining actions should be the maintainer's own clicks (release/account
work, Devpost submit, and post publishing).

### Current state (verified 2026-11-16)

- `main` builds clean; Vitest 10/10. Analyzer, Electron shell, icon,
  screensaver, palettes, zoom — all shipped.
- PR #1 (`feat/halloween-flair`: verdict stamps, Pumpkin palette, haunted
  empty state, ghost playhead, cobwebs, toast icons) is OPEN and unmerged.
- The previous Pages investigation found no enabled site and no live URL;
  the hosted deployment path is now intentionally removed for the desktop-only
  product decision.
- Zero GitHub Releases; Windows/macOS installers configured, never built.
- AGENTS.md open items: B1 (uncommitted `estimateCutoff` fix + regression
  tests in the maintainer's local tree) and real-file cutoff calibration.

### Requirements

- **R1 — One codebase.** PR #1 is merged (or explicitly closed with a
  recorded reason) so the submitted app is exactly what `main` builds.
- **R2 — Desktop-only product path.** The Electron app is the only shipped
  product. `dist/` remains the internal Vite renderer build consumed by the
  Electron shell; no GitHub Pages workflow, hosted web app, or live demo URL
  is maintained.
- **R3 — Release.** A GitHub Release carries the Windows installer built
  from `main`, verified by installing and running it (open a file, get a
  verdict, offline). macOS DMG likewise if a Mac is available; if not, the
  gap is recorded, not hidden. Release notes describe the desktop-only
  product and do not advertise a hosted demo.
- **R4 — Detector honesty.** B1 is resolved (landed with its tests, or
  closed with evidence it duplicates committed behavior) and the cutoff
  thresholds are checked against at least one real genuine/lossy pair,
  with the measured values recorded.
- **R5 — Submission package (drafts).** Under `docs/submission/`:
  Devpost description, Kiro-usage write-up, demo-video script/shot list
  (<3 min), blog post draft, social post draft — each satisfying the
  exact compliance wording in `AGENTS.md` (blog on a third-party platform
  mentioning the hackathon; social post starting with
  `#KiroweenHackathon26`; video public YouTube, on-device, no unlicensed
  music/trademarks; mixed-tooling disclosure in the description).
- **R6 — Trail.** Every task follows `/.kiro/steering/work-trail.md`:
  one commit per task, status section updated in the same commit, build
  log appended, nothing fabricated.
- **R7 — Final sweep.** A line-by-line pass of the compliance section of
  `AGENTS.md` against the repo and the desktop package, including an explicit
  check that no hosted deployment or fabricated live URL remains, recorded in
  the status section, so the maintainer can submit with confidence before Dec
  4.

### Non-goals

- No new app features, formats, or theming beyond merging PR #1.
- No auto-update, signing, accounts, server, or telemetry.
- No submitting, posting, or publishing on the maintainer's behalf —
  drafts and artifacts only; the clicks are his.
