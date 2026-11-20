# Submission Readiness — Design

Part of the `submission-readiness` Kiro spec. Requirements: `./requirements.md` · Tasks: `./tasks.md`.

## Approach per requirement

**R1 (PR #1 merge).** Diff `feat/halloween-flair` against current `main`
first. Both sides touched `AGENTS.md` (the PR marks open decision #6 done;
main added the compliance section) — the expected resolution keeps **both**
edits; anything beyond that is a stop-and-report per the work-trail rules.
Verify the merged tree (build + tests + a real analysis run), then merge
on GitHub so the PR records the merge.

**R2 (desktop-only distribution).** The Electron app is the only shipped
product. Delete `.github/workflows/pages.yml` and remove hosted-demo wording
from the product docs and specs. Keep `vite.config.ts`'s `base: './'` because
relative assets are required by the Electron `app://` protocol and packaged
renderer build. Do not claim or verify a live URL.

**R3 (Release).** electron-builder config already exists (`npm run dist`).
Build on the maintainer's Windows machine for the NSIS installer; verify
by installing the artifact and running the packaged smoke (open-file →
verdict, network off). Create the GitHub Release (`v1.0.0`) with the
installer(s) attached and notes covering: what it is, the desktop-only distribution path, and the
unsigned-app first-run notes (SmartScreen / Gatekeeper). Do not add a hosted
demo URL.

**R4 (B1 + calibration).** B1: inspect the local working tree and stash
for the uncommitted `estimateCutoff` final-run fix + its 2 regression
tests. The committed `cutoff.ts` already contains a post-loop flush
assigning `bestLen`/`bestEnd` — diff carefully; land only what adds value
(at minimum the tests, if they cover behavior the committed tests miss),
as its own commit. Calibration: record any available genuine/lossy pair and
the five real lossy measurements already made. Thresholds are heuristic
estimates, tested with synthetic fixtures and several real lossy files;
broader calibration against a labeled genuine/lossy corpus remains future
work, and ambiguous results stay inconclusive. Change thresholds only on a
misclassification.

**R5 (Drafts).** All drafts live in `docs/submission/` (tracked, so the
trail shows them). The Kiro write-up is assembled from evidence — `git
log`, `/.kiro/specs/`, steering, hooks — and states plainly which parts
were built spec-first in Kiro and which later work used other tools
(disclosure required by the compliance section). The demo script is a
shot list timed to <3:00 total: hook (a "FLAC" that isn't), drop → fake
verdict with the COSTUME stamp, drop → genuine verdict, palette cycle,
screensaver beat, close on the tagline ("files never leave your machine").

**R7 (Sweep).** Walk the `AGENTS.md` compliance section top to bottom and
check each hard item against reality (repo contents, desktop package, release,
drafts). Record the result as a checklist in the status section; any
unchecked item becomes either a fix in this spec or an explicit maintainer
action, named as such.

## Risks

- **Renderer loading:** `base: './'` and the module worker must continue to
  load through the Electron `app://` protocol in the packaged build. The
  desktop smoke check catches regressions; no Pages subpath is part of the
  product.
- **No lockfile:** local and release installs may drift; pin by building and
  testing the Electron renderer before packaging. There is no deployment
  workflow to validate.
- **Time:** every task here is hours, not days. If anything balloons,
  cut scope in this order: macOS DMG → blog draft polish → calibration
  depth. Never cut R2, R6, or R7.
