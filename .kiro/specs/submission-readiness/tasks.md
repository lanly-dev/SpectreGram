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
3. **Desktop-only distribution.** Remove `.github/workflows/pages.yml` so
   GitHub Actions no longer deploys the renderer. Update `README.md`,
   `DEV.md`, `AGENTS.md`, the steering docs, and affected specs so Electron
   is the only shipped product and no hosted demo/live URL is claimed. Keep
   the Vite build and relative `app://` asset paths intact. Verify with the
   required build, test, diff, and targeted no-deployment searches; do not
   fabricate or check a URL.
4. **Windows installer + GitHub Release.** `npm run dist` on Windows;
   install the NSIS artifact; packaged smoke offline (open file →
   verdict; PNG save works). Create Release `1.0.0` with the installer
   attached and notes (what it is, the desktop-only distribution path,
   unsigned first-run notes, and no hosted demo URL).
   **Amended 2026-11-19 (maintainer's go, release hold lifted):** ship a
   standalone Windows portable `.exe` next to the NSIS installer, plus a
   Linux AppImage and a macOS DMG, all built by
   `.github/workflows/release.yml` (matrix: windows / ubuntu / macos
   runners) when a version tag such as `1.0.0` is pushed. The workflow creates a **draft**
   Release, so the maintainer reviews it and clicks Publish. All builds
   are unsigned. The macOS DMG cannot be built on the Windows dev machine;
   CI is its only build path.
5. **Real-file calibration.** Record the available real lossy measurements and,
   if a labeled genuine/lossy pair is available, run it through the app and
   record the cutoffs. Do not fabricate a genuine measurement when no labeled
   genuine file is available. Thresholds change ONLY on a demonstrated
   misclassification, with Vitest cases encoding the evidence. The thresholds
   are heuristic estimates, tested with synthetic fixtures and several real
   lossy files; broader calibration against a labeled genuine/lossy corpus
   remains future work, and ambiguous results stay inconclusive.
6. **Submission drafts.** Create `docs/submission/` with:
   `devpost-description.md` (features, Resurrection framing, clean-room
   note, honest mixed-tooling disclosure), `kiro-writeup.md` (from
   `git log` + `/.kiro` evidence: spec-driven flow, steering, hooks,
   what differed from vibe coding), `demo-script.md` (shot list, <3:00,
   no unlicensed music/trademarks), `blog-post.md` (third-party-platform
   ready, mentions the Kiroween 2026 hackathon), `social-post.md`
   (**starts with** `#KiroweenHackathon26`). Drafts only — no posting.
7. **Final compliance sweep.** Walk every hard item in the `AGENTS.md`
   compliance section against the repository, desktop package, and release
   artifacts. Do not expect or fabricate a live demo URL; record any remaining
   maintainer action in the status section. Close with a build-log entry:
   "ready to submit" + the maintainer's remaining clicks, enumerated.

Out of scope for every task above: new features, format expansion,
auto-update, signing, submitting/posting anything on the maintainer's
behalf, any change to `cutoff.ts` beyond tasks 1 and 5.

---

## Implementation status (2026-11-16)

- ✅ **0** — 2026-11-16. Read `AGENTS.md` (incl. compliance section) and this spec. `git fetch`: `origin/main` head `8e6b87e` ("Merge pull request #1 from lanly-dev/feat/halloween-flair"); local `main` equal; working tree clean; `git stash list` empty.
- ✅ **1** — 2026-11-16. B1 closed with evidence, no code change: fix + 2 regression tests already committed in `1fb2f9a` (found via `git log -S`). Mutation check: with `bestLen = curLen;` removed, Vitest → 1 failed / 9 passed (the Nyquist regression test); restored → 10/10. `AGENTS.md` Status + decision #5 updated.
- ✅ **2** — 2026-11-16. PR #1 was already merged by the maintainer before this session: GitHub API reports `merged=true`, `merged_at=2026-11-16T22:59:33Z`, merge commit `8e6b87e` (= `main` head at task 0), so no conflict resolution was needed. Merged tree: build ✓, Vitest 10/10 ✓. Real analysis via the desktop app's headless smoke on a real 128 kbps MP3 copied to a `.flac` name (no FLAC encoder on this machine; the app's format claim comes from the file name, the audio is the real lossy stream): verdict `Claims FLAC. Cutoff ≈16.8 kHz — smells like a 128k MP3 in a costume. (estimate)`, `#verdict` class `stamp-fake` (COSTUME stamp), PNG save ✓. **Harness fix in this commit:** the smoke hook in `electron/main.js` treated any `#verdict` text as done, so it passed falsely on the "Decoding…" loading note; it now waits for a non-`pending` verdict containing "(estimate)" and reports the verdict class.
- ✅ **3** — 2026-11-19. The Pages investigation found a repository enablement
  failure before any deployment, and no live URL was claimed. The desktop-only
  product decision supersedes that path: deleted `.github/workflows/pages.yml`,
  removed hosted-demo/deployment claims from product docs, steering, and specs,
  and kept `vite.config.ts`'s relative assets for the Electron `app://` build.
  `npm run build`, `npm run test`, `git diff --check`, and targeted searches all
  pass; no URL was checked or fabricated. **Trail exception recorded during
  review:** task-3 work was split across `30f01f2`, `17985bb`, `f388d05`, and
  `a9846b8` before the one-task/one-commit review. After fetching, those commits
  are published in `origin/main`; this explicit maintainer-authorized
  exception follows the instruction to preserve the existing Pages-investigation
  documentation and not rewrite or force-push history, so the split is
  disclosed here rather than rewritten.
- ⏳ **4** — 2026-11-16, partial. `package.json` version 0.1.0 → 1.0.0 (installer name matches the planned `v1.0.0`). `npm run dist` on Windows → `release/SpectreGram Setup 1.0.0.exe` (124.9 MB, NSIS, x64, unsigned; one transient EBUSY on the unpacked exe, likely an antivirus scan — a clean retry passed). Packaged smoke on `release/win-unpacked/SpectreGram.exe` (the same app the installer lays down, served from `app://`): the fake-FLAC from task 2 → `Claims FLAC. Cutoff ≈16.8 kHz — smells like a 128k MP3 in a costume. (estimate)`, class `stamp-fake`, PNG save ✓. Network was not disabled for this run. Release notes drafted in `docs/submission/release-notes-1.0.0.md`. **Remaining, needs the maintainer:** (a) run the installer itself (it registers SpectreGram as a handler for MP3/FLAC/WAV/… on the machine, so the agent did not) and open a file offline; (b) create the GitHub Release `v1.0.0` with the `.exe` attached and the notes pasted (desktop-only distribution path; no hosted demo URL). macOS DMG: no Mac available — gap recorded, not built. **ON HOLD (2026-11-16, maintainer's instruction):** no GitHub Release is to be created and no further release builds run until he lifts the hold. The local installer stays in the gitignored `release/` folder.
  - **2026-11-19 — release setup (task 4, maintainer lifted the hold):** added `win.target: [nsis, portable]` + `portable.artifactName` in `package.json` and `.github/workflows/release.yml` (windows/ubuntu/macos matrix, runs on `v*` tags, uploads to a **draft** Release). Local `npm run dist -- --win --publish=never` produced `SpectreGram Setup 1.0.0.exe` (124.8 MB) and `SpectreGram-Portable-1.0.0.exe` (112.6 MB), unsigned; the first attempt failed on a file lock and a clean retry passed. `npm run build` and `npm run test` (10/10) green. **Not verified:** the workflow has never run on GitHub, so the Linux AppImage and macOS DMG are unbuilt; the portable exe was built but not launched. **Remaining, needs the maintainer:** push, push a `1.0.0` tag, check the Actions run, review the draft Release and click Publish.
- ⏳ **5** — 2026-11-16, partial: lossy side measured, genuine side blocked. No genuine FLAC and no FLAC encoder on this machine (the local `lab/` folder holds only MP3s + one M4A), so each real lossy file was copied to a `.flac` name (the app's format claim comes from the name) and run through the desktop smoke. The smoke now also reports the facts text (`electron/main.js`, test-only). Results (Nyquist 24 kHz, since all decoded at 48 kHz; bitrate ≈ size ÷ duration):

  | File (in `lab/`) | ≈ bitrate | Cutoff | Ratio | Verdict |
  |---|---|---|---|---|
  | `CHOCOLATE.128.mp3` | 123 kbps MP3 | 16.8 kHz | 0.70 | costume ✓ |
  | `Decade.mp3` | 309 kbps MP3 | 20.3 kHz | 0.85 | inconclusive |
  | `a silent voice.mp3` | 309 kbps MP3 | 20.2 kHz | 0.84 | inconclusive |
  | `fripSide_-_absolute_wish_(mp3.pm).mp3` | 307 kbps MP3 | 21.2 kHz | 0.88 | inconclusive |
  | `Camelia.m4a` | 259 kbps AAC | 21.0 kHz | 0.88 | inconclusive |

  No lossy file was called "genuine lossless", so there is no misclassification and thresholds are unchanged (no `cutoff.ts` edit). The thresholds are heuristic estimates, tested with synthetic fixtures and several real lossy files; broader calibration against a labeled genuine/lossy corpus remains future work, and ambiguous results stay inconclusive. **Finding (stop-and-report):** `decode.ts` creates a default `AudioContext`, and `decodeAudioData` resamples to the device rate (48 kHz here). So the facts panel shows the device's rate, not the file's, and a genuine 44.1 kHz FLAC is measured against a 24 kHz Nyquist, capping its best ratio at 22.05/24 ≈ 0.919, just above `LOSSLESS_HIGH_RATIO` 0.90. Genuine CD rips may therefore read "inconclusive" on 48 kHz devices. Untested without a genuine file. **Remaining, needs the maintainer:** a real genuine FLAC (ideally a CD rip, plus an MP3→FLAC transcode of the same track), and a decision on whether to address the resampling (out of this task's `cutoff.ts`-only scope).
- ✅ **6** — 2026-11-20. Drafts written in `docs/submission/`: `devpost-description.md`, `kiro-writeup.md`, `demo-script.md`, `blog-post.md`, `social-post.md` (the social post starts with `#KiroweenHackathon26`). `release-notes-1.0.0.md` updated for the portable, Linux and macOS builds. Drafts only: nothing posted. `[MAINTAINER: ...]` and `[YOU: ...]` markers are facts or opinions only the maintainer can supply. A README line claiming macOS verification was untrue and was corrected.
- ⏳ **7** — 2026-11-20, partial. Repo-side checks run: repo public, license MIT (GitHub API); Release `1.0.0` published with `SpectreGram-1.0.0-arm64.dmg`, `SpectreGram-1.0.0.AppImage`, `SpectreGram-Portable-1.0.0.exe`, `SpectreGram.Setup.1.0.0.exe`; `.kiro` tracked (28 files) and not ignored; no absolute paths or personal name in tracked files (`git grep`, excluding the two files that quote the rule as an example); social draft starts with `#KiroweenHackathon26`; Pages workflow removed; Vitest 10/10. **Found and fixed:** three `.agents/tasks/spectregram-core/` files were still tracked despite the gitignore rule, now untracked with `git rm --cached` (history still contains them; they held no absolute paths). **Still open, needs the maintainer:** demo video on YouTube, blog and social posts published, the Release asset names checked (the macOS DMG is arm64 only), the Devpost form, and the `[MAINTAINER]` / `[YOU]` markers in the drafts.
