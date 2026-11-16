# Submission Readiness — Requirements

Part of the `submission-readiness` Kiro spec (spec-first: this spec is
committed before any of the work it describes).
Parent context: `AGENTS.md` (repo root — read it first, including the
"Kiroween 2026 — official compliance requirements" section, which is the
authority for everything below) and `/.kiro/steering/work-trail.md`
(trail rules — binding for every task in this spec).

### Goal

Take SpectreGram from **built** to **submittable**: the app is feature-
complete on `main`, but as of 2026-11-16 there is no working app URL, no
GitHub Release, an unmerged flair PR, two unverified engineering loose
ends, and no submission package. Deadline: **Fri Dec 4, 2026, 2:00 PM PT**
(Kiroween submission close). After this spec, the only remaining actions
should be the maintainer's own clicks (Devpost submit, post publishing).

### Current state (verified 2026-11-16)

- `main` builds clean; Vitest 10/10. Analyzer, Electron shell, icon,
  screensaver, palettes, zoom — all shipped.
- PR #1 (`feat/halloween-flair`: verdict stamps, Pumpkin palette, haunted
  empty state, ghost playhead, cobwebs, toast icons) is OPEN and unmerged.
- GitHub Pages is not enabled (repo Pages endpoint 404) — no demo URL.
- Zero GitHub Releases; Windows/macOS installers configured, never built.
- AGENTS.md open items: B1 (uncommitted `estimateCutoff` fix + regression
  tests in the maintainer's local tree) and real-file cutoff calibration.

### Requirements

- **R1 — One codebase.** PR #1 is merged (or explicitly closed with a
  recorded reason) so the submitted app is exactly what `main` builds.
- **R2 — Working app URL.** The web build is deployed and publicly
  reachable; the URL loads the app and completes an analysis in a browser.
  This is the judges' door (compliance: URL to the working app).
- **R3 — Release.** A GitHub Release carries the Windows installer built
  from `main`, verified by installing and running it (open a file, get a
  verdict, offline). macOS DMG likewise if a Mac is available; if not,
  the gap is recorded, not hidden.
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
- **R7 — Final sweep.** A line-by-line pass of the compliance section
  against the repo and the package, recorded in the status section, so
  the maintainer can submit with confidence before Dec 4.

### Non-goals

- No new app features, formats, or theming beyond merging PR #1.
- No auto-update, signing, accounts, server, or telemetry.
- No submitting, posting, or publishing on the maintainer's behalf —
  drafts and artifacts only; the clicks are his.
