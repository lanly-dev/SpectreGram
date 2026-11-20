# How Kiro was used — DRAFT

> Draft for the maintainer. Facts below come from `git log` and the `.kiro/`
> directory. Items in [brackets] are things only the maintainer knows.

## Where the evidence is

- `.kiro/specs/`: seven specs, each with `requirements.md`, `design.md` and `tasks.md`:
  `spectregram` (core), `electron-shell`, `folder-report`, `spectral-message`,
  `ruler-seek`, `phase-view` and `submission-readiness`. `.kiro/specs/README.md`
  indexes them.
- `.kiro/steering/`: `product.md`, `build-conventions.md`, `work-trail.md`.
- `.kiro/hooks/kiro-signature-reminder.json`: a SessionStart hook.
- `AGENTS.md`: the session-by-session build log, with measurements and lessons.

## Spec-driven development

Each feature started as requirements and design in `.kiro/specs/`, then tasks, then
code. Timestamps from `git log`:

| Spec | Spec committed | First code |
|---|---|---|
| `spectregram` (core) | 2026-11-06 16:03 | `cutoff.ts` 21:50 the same day |
| `electron-shell` | 2026-11-06 23:25 | `electron/main.js` 23:59 |
| `folder-report` | 2026-11-17 15:24 | `scan.ts` 15:26 |
| `ruler-seek` | 2026-11-17 23:28 | ruler-seek code 23:32 |
| `spectral-message` | 2026-11-17 22:19 | same commit as the first code |
| `phase-view` | 2026-11-18 23:16 | same commit as the first code |

For the last two, the spec and the first code landed in one commit, so they are not
strictly spec-before-code. Specs were also amended as the maintainer's requests
changed. `spectral-message` records four rejected designs (steady tones, hiss and
warble, blended sparkle, then cutting the letters into the music). `phase-view`
records a change from a separate phase graph to an overlay in the same graph.

**Compared with vibe coding:** the specs made the decisions reviewable. The
acceptance checks (the verdict must say "estimate", a spectral message must not change
the verdict class) became tests or built-in guards instead of intentions.

## Steering

- `build-conventions.md` locks the stack (vanilla TypeScript and Vite, Canvas 2D,
  fft.js, a Web Worker, Vitest) and states the clean-room rule for Spek (GPL-3.0).
  It also holds the privacy rule: no absolute local paths in tracked files.
- `product.md` holds scope, non-goals ("an analyzer, not a player") and acceptance checks.
- `work-trail.md` governs the submission work: one task per commit, status updated in
  the same commit, no fabricated results.

## Hooks

One SessionStart hook re-states the project's hard rules at the start of every agent
session: read `AGENTS.md`, spec first, clean-room, verdicts are estimates, no new
framework, no absolute paths. [MAINTAINER: say whether it visibly changed agent behavior.]

## Agents and workflows

The core was built through a Kiro workflow (design, code, review). Review passes
caught a real bug (a cutoff edge case, "B1") that a Vitest regression test now guards.
Later workflows handled submission-readiness tasks. [MAINTAINER: Kiro IDE vs CLI vs Web
vs Crew. Which did you use, and how did they differ?]

## Not used

MCP servers, property-based testing and Kiro powers were not used in this project.

## What was not built from a Kiro spec

Be explicit about this in the submission. These were built without a spec directory:
time zoom and Ctrl+wheel zoom, the export panel, the About card, the recent-file
cache, the Halloween styling pass and the screensaver. [MAINTAINER: say which of these
you wrote by hand and which you made with another tool.]

## Testing

Vitest covers `cutoff.ts` only (10 tests), by design. The rest was checked by
temporary tests and desktop smoke runs recorded in `AGENTS.md`. There is no end-to-end
suite.
