# SpectreGram — work-trail rules (every agent session, no exceptions)

> Why this file exists: Kiroween judging includes how Kiro was used, and may
> involve automated analysis of this repo. The trail IS evidence. These rules
> make the trail real, complete, and honest. They apply to any work done from
> `/.kiro/specs/submission-readiness/` and, going forward, to all spec work.

## The trail, concretely

1. **Spec first.** No implementation before its spec exists under `/.kiro`.
   For submission-readiness work, the spec already exists — do not start a
   task whose checkbox you have not read.
2. **One task, one commit.** Each numbered task in `tasks.md` lands as its own
   commit (a task that produces no file change still gets its verification
   recorded — see 3 — but no empty commits). Commit message format:
   `type(scope): summary (submission-readiness task N)` — e.g.
   `docs(desktop): document the Electron-only product (submission-readiness task N)`.
3. **Update the status section as you go.** When a task finishes, flip its
   line in the spec's `## Implementation status` from ⏳ to ✅ **in the same
   commit**, with the date and a one-line evidence note (what was run, what
   it printed, which URL was checked). Partial work stays ⏳ with a note
   saying exactly what remains and why.
4. **Build log.** Append one dated entry per work session to the
   `## Build log & lessons` section of `AGENTS.md`: what changed, what was
   verified, what is still open. Keep it factual; no marketing language.
5. **Verify before every commit.** `npm run build` and `npm run test` must be
   green. A task with its own acceptance check (live URL, packaged smoke,
   calibration pair) must pass that check too — record the observed result,
   not just "done".
6. **Push discipline.** Fetch first; diff what you are about to push against
   live `main`; never force-push; never overwrite a file that moved on main
   without merging its changes into yours. Straight to `main` is this repo's
   convention unless a task says otherwise.

## Honesty rules (hard)

- **Never fabricate a trail.** No backdated commits, no invented test
  results, no status lines for work that did not happen. If something was
  built with a different tool, the submission write-up says so — the
  compliance section in `AGENTS.md` requires disclosing pre-existing and
  assisted work, and mixed tooling disclosed honestly is acceptable;
  a fabricated Kiro trail is disqualifying if caught.
- **Estimates stay estimates.** Every user-facing verdict keeps its
  "(estimate)" label. Calibration claims cite the actual files measured.
- **Drafts are drafts.** Anything under `docs/submission/` is a draft for
  the maintainer until he says otherwise.

## Privacy / repo hygiene (hard)

- Never write an absolute local path or the maintainer's personal name into
  any tracked file. Repo-relative paths only.
- Never gitignore `/.kiro`. Never commit credentials, tokens, or `.env`
  files. `.agents/` stays untracked.

## Stop and report (do not improvise past these)

- Anything that needs the maintainer's own account action: the Devpost
  submit button, publishing the blog/social posts, creating accounts,
  code-signing certificates, spending money. Prepare everything up to the
  click, then stop and report what is ready and what the click is.
- A red build/test you cannot fix within the task's scope, a merge conflict
  that is not a trivial both-sides-keep, or a calibration result that
  contradicts the shipped thresholds without a clear fix: stop, record the
  evidence in the status section, and report.
