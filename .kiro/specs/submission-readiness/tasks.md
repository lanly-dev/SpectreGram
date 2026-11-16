# Submission Readiness — Tasks

Part of the `submission-readiness` Kiro spec. Requirements: `./requirements.md` · Design: `./design.md`.
Trail rules: `/.kiro/steering/work-trail.md` — **read them before task 0.**
One task = one commit, message suffix `(submission-readiness task N)`.
`npm run build` + `npm run test` green before every commit.

0. **Precondition.** Read `AGENTS.md` end to end (including the compliance
   section) and this spec. Fetch live `main` and note its head in your
   first build-log entry. Confirm the working tree state (clean or not —
   task 1 depends on it). No commit for this task; it gates the rest.
1. **B1 resolution.** Find the uncommitted `estimateCutoff` final-run fix
   + 2 regression tests (working tree / stash). Diff against committed
   `cutoff.ts` (already has a post-loop flush). Land what adds value as
   its own commit; if it fully duplicates committed behavior, close B1
   with the evidence recorded in the status section instead. Update the
   B1 note in `AGENTS.md` Status to match reality.
2. **Merge PR #1.** Diff `feat/halloween-flair` vs current `main`;
   expected overlap is `AGENTS.md` only (keep both the compliance section
   and the decision-#6 update). Build + test the merged result, run one
   real analysis (fake-FLAC verdict must show the COSTUME stamp), then
   merge on GitHub. Non-trivial conflict → stop and report.
3. **Web demo live.** Add `.github/workflows/pages.yml` (build `dist/`,
   deploy to Pages; `npm install`, no lockfile in this repo). Enable
   Pages (Actions source). Verify the live URL in a browser: loads,
   analyzes a test file, verdict renders, worker works from the subpath.
   Put the URL in `README.md` + the `AGENTS.md` packaging checklist.
4. **Windows installer + GitHub Release.** `npm run dist` on Windows;
   install the NSIS artifact; packaged smoke offline (open file →
   verdict; PNG save works). Create Release `v1.0.0` with the installer
   attached and notes (what it is, unsigned first-run notes, demo URL).
   macOS DMG too if a Mac is at hand; otherwise record the gap.
5. **Real-file calibration.** Run one real genuine FLAC and one real
   MP3→FLAC transcode through the app; record both measured cutoffs in
   the status section. Change thresholds ONLY on a misclassification,
   with Vitest cases encoding the evidence. Update `AGENTS.md` open
   decision #3 with the outcome.
6. **Submission drafts.** Create `docs/submission/` with:
   `devpost-description.md` (features, Resurrection framing, clean-room
   note, honest mixed-tooling disclosure), `kiro-writeup.md` (from
   `git log` + `/.kiro` evidence: spec-driven flow, steering, hooks,
   what differed from vibe coding), `demo-script.md` (shot list, <3:00,
   no unlicensed music/trademarks), `blog-post.md` (third-party-platform
   ready, mentions the Kiroween 2026 hackathon), `social-post.md`
   (**starts with** `#KiroweenHackathon26`). Drafts only — no posting.
7. **Final compliance sweep.** Walk every hard item in the `AGENTS.md`
   compliance section against the repo, the live demo, the release, and
   the drafts. Record the checklist in the status section; anything left
   unchecked is either fixed here or listed as a named maintainer action
   in `AGENTS.md`'s packaging checklist. Close with a build-log entry:
   "ready to submit" + the maintainer's remaining clicks, enumerated.

Out of scope for every task above: new features, format expansion,
auto-update, signing, submitting/posting anything on the maintainer's
behalf, any change to `cutoff.ts` beyond tasks 1 and 5.

---

## Implementation status (2026-11-16)

- ✅ **0** — 2026-11-16. Read `AGENTS.md` (incl. compliance section) and this spec. `git fetch`: `origin/main` head `8e6b87e` ("Merge pull request #1 from lanly-dev/feat/halloween-flair"); local `main` equal; working tree clean; `git stash list` empty.
- ✅ **1** — 2026-11-16. B1 closed with evidence, no code change: fix + 2 regression tests already committed in `1fb2f9a` (found via `git log -S`). Mutation check: with `bestLen = curLen;` removed, Vitest → 1 failed / 9 passed (the Nyquist regression test); restored → 10/10. `AGENTS.md` Status + decision #5 updated.
- ⏳ **2** — not started. (PR #1 open, verified unmerged 2026-11-16.)
- ⏳ **3** — not started. (Pages 404 verified 2026-11-16.)
- ⏳ **4** — not started. (Zero GitHub Releases verified 2026-11-16.)
- ⏳ **5** — not started. (Thresholds still synthetic-tuned only.)
- ⏳ **6** — not started. (`docs/submission/` does not exist yet.)
- ⏳ **7** — not started.
