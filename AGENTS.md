# AGENTS.md — SpectreGram

Kiroween 2026 entry — **Resurrection**. Read this file first in every session on this project.

## Status
- Name **SpectreGram** — confirmed 2026-11-06. Collision check run 2026-11-06: no established audio/spectrogram app or GitHub project with this exact name found; minor distant hits only (a Ludum Dare game and a DEF CON acoustic-research tool both spelled "Spectregram", plus spam Instagram-viewer pages) — low risk, different domains. Never name it "Spek" — Spek is a real open-source project; we revive its idea, not its name.
- Stack **DECIDED 2026-11-06: Vite + TypeScript, vanilla (no framework)** — full locked requirements in the Stack section below.
- **Desktop pivot DECIDED 2026-11-06 (late): desktop app like Spek — Electron shell, web code reused as-is; web build kept as the judge/demo URL.** Spec: `/.kiro/specs/electron-shell/`. **Shell IMPLEMENTED & verified 2026-11-06** (see Build log): `electron/main.js` (ESM) + `electron/preload.cjs`, `app://` protocol serving `dist/`, single-instance + open-with allowlist, native PNG save; renderer hooks additive (`src/main.ts` File-wrapped open-file intake, dual-mode PNG; `src/types/desktop.d.ts`); Vite `base: './'`. Headless-verified on Linux: unpackaged + packaged + AppImage builds pass an open-file → verdict smoke (synthetic 20.5 kHz full-band → "genuine lossless"; 15.5 kHz brick-walled .flac → "MP3 in a costume"); dev loop (renamed `npm run preview` on 2026-11-08) verified too; build + Vitest 10/10 green. Win/mac installers configured, not yet built; no GitHub Release yet.
- Repo `lanly-dev/SpectreGram` — **created; remote set** (origin → https://github.com/lanly-dev/SpectreGram.git). Functional core committed & pushed: `main` @ `6c4e4a1` (`dcad27c` = initial scaffold). No credits requested.
- Build **(2026-11-06) functional core implemented & verified green** at `6c4e4a1`: `npm run build` ✓, Vitest `cutoff.ts` 8/8 ✓ (incl. band-limited<full-bandwidth and genuine-vs-fake on synthetic grids), dev smoke ✓. Spec-first: `design.md` + `tasks.md` in `.kiro/specs/spectregram/`. **Review verdict: CHANGES_REQUESTED — one blocker B1** (see Open decisions). Build loop stopped at user request; user continuing manually.
- Working tree: uncommitted edits to `src/audio/cutoff.ts` (+1: `bestLen = curLen;`) and `src/audio/cutoff.test.ts` (+64: new "run reaching Nyquist (final-run regression)" describe block, 2 tests) — the interrupted pass's **B1 fix + regression tests, UNVERIFIED** (build/test not re-run after these edits). `review.md`/`review.json` untracked. Run `npm run build && npm run test` before committing.
- Deadline: **Fri Dec 4, 2026, 2:00 PM PT**. Shared credit pool rules apply (see Budget).

## What this is
A resurrection of Spek, the desktop acoustic spectrum analyser — a tool from the era of local music libraries that streaming killed. Drop in an audio file and it renders the full-track spectrogram, estimates the true frequency cutoff, and delivers a verdict: is this file what it claims to be, or a low-bitrate file wearing a lossless costume?

**Source reference:** https://github.com/alexkay/spek — the canonical Spek repo. C++ app using FFmpeg for decoding and wxWidgets for GUI, available on *BSD/Linux/Windows/macOS, 3,481 stars, last release v0.8.5 on 2023-01-09. **License is GPL-3.0 — do NOT copy its code into this MIT-licensed project; clean-room web reimplementation of the idea only.** AGENTS.md originally described Spek conceptually without citing this URL; the URL was verified and added 2026-11-06.

## Category fit
Resurrection: bring a favorite dead technology back to life, reimagined with today's innovations. The dead tech is file-era audio inspection (Spek and its kin). The "today's innovations" half of the pitch: a real desktop app like the original Spek — files never leave your machine — plus an automated verdict instead of reading the graph by eye, and a spectrogram rendered as the visual centerpiece rather than a grey utility plot; the web build remains live as a no-install demo of the same code.

## Hard rules (Kiroween)
- New project, built during the window, core implementation built by **Kiro, spec-first**: spec committed in `/.kiro` before implementation code.
- `/.kiro` at repo root (specs, steering, hooks), never gitignored. MIT license at repo top.
- Other agents may plan / prototype / document; Kiro implements the core. Carried-over code gets a one-line Devpost disclosure.
- Kiro credit budget for this entry: **~500** of the shared 4,000 (smallest entry — protect that; overspend here steals from Boneprint).

## Stack (DECIDED 2026-11-06: vanilla TS)
Chosen for easy vibecoding / Kiro spec-first build — fewest moving parts, smallest credit burn. Do not add a framework or backend without explicit go.

- **Build / language: Vite + TypeScript, vanilla — NO UI framework** (no React / Svelte / Vue). One screen, one job; framework lifecycle (hooks/refs/re-renders) only fights the canvas + AudioContext. Direct DOM/canvas code is what Kiro generates cleanly in one pass.
- **Styling: plain CSS only** — no Tailwind, no CSS framework. Haunted palettes are custom anyway.
- **Rendering: Canvas 2D** (`ImageData` pixels, palette = color lookup table: hellfire / ectoplasm). No WebGL / Three.js.
- **Decoding: native Web Audio `decodeAudioData` only** — no FFmpeg.wasm (heavy load, GPL drag from Spek). Supported formats = whatever the browser can decode.
- **Analysis: STFT in a Web Worker** — Vite worker syntax: `new Worker(new URL('./audio/stft-worker.ts', import.meta.url), { type: 'module' })`. This is required to pass the 60-second no-freeze acceptance check; show progress from the worker.
- **FFT: `fft.js`** (tiny, MIT) — do NOT hand-roll an FFT; a silent FFT bug corrupts every verdict downstream. Spend credits on cutoff/verdict logic instead.
- **Tests: Vitest, for `cutoff.ts` only** — lock thresholds against the genuine-FLAC vs fake-FLAC test pair. No e2e suite in v1.
- **Desktop shell: Electron** (DECIDED 2026-11-06, pivot) — plain-JS main in `electron/`, renderer reused as-is, electron-builder installers (win NSIS / mac dmg / linux AppImage). Web build (static, GitHub Pages) is KEPT as the judge/demo URL. No server, no Next.js. Spec: `/.kiro/specs/electron-shell/`.

File structure (Kiro spec tasks map 1:1 to these):
```
src/main.ts              — drop zone, file pick, wiring
src/audio/decode.ts      — decodeAudioData + file facts (format/duration/sample rate/channels)
src/audio/stft-worker.ts — STFT via fft.js, posts progress + magnitude grid
src/audio/cutoff.ts      — cutoff estimate + verdict text (always says "estimate"; Vitest-tested)
src/render.ts            — canvas spectrogram, palette switch, playhead, PNG export
index.html / src/style.css
```

## Scope v1
- Desktop app (Electron shell over the existing client-side web build); all analysis still runs locally on-device. Drag-and-drop or pick an audio file (mp3 / flac / wav / ogg / m4a as the browser can decode).
- Decode with Web Audio (`decodeAudioData`), compute the STFT, render the **full-track spectrogram** on canvas with a haunted palette (hellfire / ectoplasm options count as view settings, not separate products).
- Cutoff estimation: highest frequency with sustained energy → verdict line, e.g. "Claims FLAC. Cutoff ≈16 kHz — smells like a 128k MP3 in a costume." Verdict is always labelled an **estimate**.
- File facts panel: format (as reported by the file/decode), duration, sample rate, channels.
- Export the spectrogram as PNG.
- Minimal playhead preview is allowed (sync a playhead over the spectrogram) — see the guardrail below.

## Non-goals (scope caps)
- **This is an analyzer, not a player.** No playlist, no skins system, no library management. Skinwalker's territory — the two audio entries must stay clearly substantially different.
- No server, no uploads, no accounts. "Your files never leave your machine" is a feature — keep it true.
- No claim of proof: the cutoff heuristic can be fooled (legitimately filtered or quiet masters). Always present the verdict as an estimate, in the UI and in every write-up.

## Acceptance checks
Legend: `[x]` done · `[~]` automated/partial · `[ ]` pending manual (real browser + real audio files).

- [~] Known test pair: synthetic grids pass (genuine-lossless vs 128k-MP3-as-FLAC — cutoffs AND verdicts differ, Vitest 8/8). **Real-file confirmation pending** — drop actual FLAC vs fake-FLAC in a browser. (Bright-lossless-to-Nyquist case also blocked by B1 until the working-tree fix is verified & committed.)
- [ ] A 60-second track renders its full spectrogram without freezing the tab unacceptably (progress indication if slow). **Pending manual** (worker + progress posted; not yet timed on a real 60s file).
- [~] PNG export opens and matches what was on screen. **Code path verified** (`toBlob` on the rendered `#canvas`; playhead is a separate overlay, no taint); pixel-perfect match vs the CSS-scaled display is a manual eyeball.
- [x] Verdict text says "estimate" (or equivalent) everywhere it appears — asserted by a test over every verdict branch in `cutoff.ts`.

## Packaging checklist
- [ ] Working app URL (static hosting of the web build — the demo door; desktop installers are the product), public repo + MIT license + `/.kiro`.
- [ ] Desktop installers on a GitHub Release (win NSIS / mac dmg / linux AppImage).
- [ ] Demo video < 3 min, public YouTube: drop the fake FLAC → spectrogram → verdict lands; then the genuine file for contrast. Two files, one clear story.
- [ ] Devpost description + Kiro-usage write-up.
- [ ] Blog post (Bonus Blog prize) + one social post starting with `#KiroweenHackathon26`.

## Open decisions
1. ~~Name final?~~ **DECIDED 2026-11-06: SpectreGram** (collision check run, see Status).
2. ~~Stack?~~ **DECIDED 2026-11-06: Vite + TypeScript, vanilla (no framework)** — see Stack section above for the full locked requirements.
3. ~~Verdict strictness?~~ **Resolved with tunable defaults 2026-11-06 — pending real-file calibration.** Cutoff detector: per-bin 85th-percentile energy profile, noise floor = P5 across bins, threshold = floor + 20 dB, cutoff = max bin of the largest contiguous above-threshold run; verdict by `cutoffHz/Nyquist` vs `LOSSLESS_HIGH_RATIO=0.90` / `SUSPICIOUS_RATIO=0.73`. All values `// TUNABLE` in `src/audio/cutoff.ts`. STFT defaults (Hann, fftSize 2048, hop 1024, 120 dB) also tunable. Recalibrate against a real genuine-FLAC vs 128k-MP3-as-FLAC pair before locking.
4. ~~Go / no-go to create repo and start the Kiro spec?~~ **DONE 2026-11-06** — repo `lanly-dev/SpectreGram` created, spec authored (`/.kiro/specs/spectregram/`), core implemented.
5. **Blocker B1 (active)** — the post-loop final-run check in `estimateCutoff` (`src/audio/cutoff.ts`) dropped the final contiguous run: a run reaching the Nyquist bin reported cutoff 0 → "No clear cutoff detected" instead of "genuine lossless". Fix (`+ bestLen = curLen;` inside the final-run `if`) + 2 regression tests are in the working tree but **uncommitted & unverified**. Run `npm run build && npm run test`; if green, commit & push. The committed `6c4e4a1` tests don't cover this case.
6. ~~Halloween flair pass (deferred)~~ **DONE 2026-11-10 (maintainer's go; landed as a PR at his request instead of straight-to-main)** — verdict stamps (👻 GENUINE / 🎃 COSTUME chips + glow, classified from the verdict text in `setVerdict`), fourth palette **Pumpkin** (jack-o'-lantern ramp, in the palette cycle + legend + button swatch), haunted empty state (floating ghost + fog banks over the canvas area, "Drop a file… if you dare", hidden on first analysis), ghost playhead (glow line + 👻 rider), cobweb SVG corners on the spectrogram frame, and toast icons (👻 info / 🎃 error). Earlier flair items already in: ghost app icon, ghost idle screensaver, hellfire/ectoplasm/spectrum palettes.
7. ~~Webapp or desktop?~~ **DECIDED 2026-11-06 (late): desktop, like Spek — Electron shell, web code reused as-is; web build kept as demo URL.** See `/.kiro/specs/electron-shell/`.

## Build log & lessons (2026-11-06)
- Spec-first build via a Kiro workflow (design → code → review). Core landed green in one code pass; review caught one blocker (B1).
- **An aborted review loop left uncommitted edits in the working tree** (B1 fix + regression tests) — always verify before committing an interrupted pass's changes; the pass was cut off before build/test re-ran.
- The cutoff detector's P5-across-bins noise floor needs ≥5% of bins below threshold; synthetic fixtures that leave <5% yield cutoff 0. The Vitest grid uses 0.94 (not 0.95) and the verify sine tops at bin 930 (not 1000) for this reason — see `.agents/tasks/spectregram-core/verification.md`.
- Real-file calibration is still open (decision #3); synthetic grids are a stand-in, not a substitute for the genuine-vs-fake acceptance pair.
- GitHub repo + push happened outside the agent (user-created) — the earlier "repo not yet created" gate is cleared.
- **Electron shell lessons (2026-11-06):** (1) Sandboxed preloads must be CommonJS — `preload.cjs`, because the package is `"type": "module"`. (2) The module Web Worker runs fine from `app://` with the scheme registered standard + secure + supportFetchAPI — the spec's localhost-server fallback was NOT needed, packaged builds included. (3) Headless smoke as root needs `--no-sandbox` / `ELECTRON_DISABLE_SANDBOX=1` — a sandbox-VM artifact, not an app flag. (4) Synthetic-signal caution: discrete sine partials and flat white noise both defeat the cutoff detector's P5-floor assumption (needs ≥5% near-silent bins) — shaped, brick-walled noise is the honest synthetic stand-in for the genuine-vs-fake pair. (5) Observation: the committed `cutoff.ts` already contains a post-loop final-run flush assigning both `bestLen` and `bestEnd` — diff the working tree carefully before committing the B1 fix; it may already be equivalent.
- **Script renames + dependency refresh (2026-11-08):** scripts reorganized — `desktop` → `start` (with `dev` as its alias), `electron:dev` → `preview`, and the web scripts namespaced as `web:dev` / `web:preview`; the `DEV.md` "Scripts" table is the canonical per-command explanation (moved out of the README 2026-11-08, at the maintainer's instruction: README stays product-facing, technical layout lives in `DEV.md`). Dependencies bumped: typescript 7.0.2, vite 8.3.6, vitest 5.1.0, fft.js 4.0.4 (electron 45.2.3 / electron-builder 26.18.0 unchanged); `package-lock.json` removed from the repo and gitignored. Re-verified after the bump: build ✓, Vitest 10/10 ✓, desktop open-file → verdict smoke ✓ (genuine 20.5 kHz / fake-FLAC 15.6 kHz pair, exact verdicts). **Update (same day, later):** `dev` was repointed at the hot-reload dev loop (`node scripts/electron-dev.mjs`) and `preview` became its alias — so `npm run dev` now has HMR; `start` is unchanged as the no-HMR production path.
- **Dev-launcher port collision (2026-11-08):** the dev launcher's readiness probe accepted any HTTP 200 on the shared Vite default :5173 — with another project's dev server already running there, SpectreGram's own Vite died on `--strictPort` (unwatched) and Electron cheerfully loaded the *other* app (Metal Fatigue) into the window. Fix: dedicated port **5273** + the probe now verifies `<title>SpectreGram</title>` before launching and fails loudly if the port serves something else or Vite exits early. Lesson: a readiness check must verify identity, not just liveness.

- **Ruler practicality fix (2026-11-08):** the first ruler pass put log-spaced frequency values (20…20k) on the spectrogram's LINEAR axis — seven labels piled into the bottom tenth and clipped — and the time-ruler step logic was inverted (a 65 s file got 14 labels at 5 s steps; a 25 s file got one). Now both rulers pick an evenly-spaced step targeting ≤5–6 labels (frequency: 0…Nyquist in round Hz steps, Nyquist always labelled; time: step ticks plus the total duration when it doesn't crowd), labels are centered on their value with the edge labels clamped fully inside the ruler, and the tick borders that sat off-value were removed. Verified by DOM geometry (no overflow, no overlap) + screenshots in the Electron harness on 65 s / 25 s cases.

- **App icon (2026-11-08, maintainer's ask — pulled forward from the deferred flair pass):** AI-generated ghost mark — white sheet ghost dissolving into glowing hellfire-orange spectrogram bars on black — installed as `build/icon.png` (512×512, wired explicitly as the electron-builder `icon`) and `public/icon.png` (256×256, the web build's favicon). Replaces the placeholder icon from the shell commit.
- **Window icon wiring (2026-11-08):** the generated icon only reached packaged installers — the running window still showed the generic Electron icon, because `BrowserWindow` never got an `icon` option (electron-builder config doesn't affect unpackaged runs). Fixed: `electron/icon.png` (copy of the 512 mark; `electron/**` is already in the packaged files) + `icon:` in the window options. Note the layers: window/taskbar icon = BrowserWindow `icon`; installer/exe/dock icon = electron-builder, only in packaged builds (`npm run dist`).

- **Spectrum palette (2026-11-08, maintainer's ask — "different colors, take Spek as reference"):** third palette `spectrum` added to `src/render.ts` and made the DEFAULT — a full spectral sweep (near-black indigo → purple → magenta → red-orange → amber → yellow-white) in the classic acoustic-analyser family, own stop values (clean-room, not Spek's table). Since color encodes energy and low frequencies usually carry the most, bands now separate by color across the axis instead of shading one hue. The palette button cycles Spectrum → Hellfire → Ectoplasm.

- **Instant graph — measured perf pass (2026-11-10):** measured the pipeline in the browser before changing anything (3-minute 128k track): decode 477 ms · mono mixdown 42 ms · STFT 45 ms (worker) · cutoff/verdict 161 ms · canvas paint 8 ms · plus a **700 ms** left-to-right reveal animation. So the graph took ~1.4 s and almost none of it was the analysis. Changes: `renderSpectrogram` paints synchronously (the reveal animation was removed — it drew nothing on its first frame, so it *was* the delay); the cutoff pass moved into `stft-worker` and arrives as its own `verdict` message, so it can never delay pixels or block the UI thread (the worker keeps a grid copy, because the result transfer detaches the original). Result: graph lands in the same task as the worker's result — ~0.57 s to paint this track, verdict ~160 ms later, off the critical path. Remaining floor is `decodeAudioData` (native, all-or-nothing). **Lesson: never gate work behind `requestAnimationFrame`** — an occluded window (Electron minimised, background tab) never fires it; a first attempt deferred the verdict into `rAF` → `setTimeout` and silently produced a painted canvas with *no verdict at all* in a hidden tab, which the worker-message path fixes.
- **Idle screensaver (2026-11-10, maintainer's ask):** after 60 s without input (mouse/keyboard/wheel/touch/drop), a full-window overlay plays `public/screensaver.mp4` — his spectrogram-ghost artwork reframed to landscape and animated (gentle bob/sway, rippling sheet, drifting particles), encoded 1332×732 (2× the 666×366 window), muted, no audio track, faststart. The clip is a **ping-pong loop** (forward + reversed copy, 20 s) — the generated clip's first/last frames didn't match, and ping-pong makes both seams frame-identical by construction; the file is ~5.7 MB, so the video tag uses `preload="none"` and only loads when the screensaver actually triggers. Any input hides it and re-arms the timer (`setupScreensaver()` in `src/main.ts`, `IDLE_MS`). The video lives in `public/` so it ships in `dist/` for both the desktop `app://` build and the web demo.
- **Time zoom (2026-11-10, maintainer's ask):** drag across the spectrogram to zoom into that time segment; mouse wheel / trackpad scrolls the zoomed view horizontally; a "Reset zoom" button (top-right of the spectrogram) or Esc returns to the full track; a thin accent bar on the bottom edge shows where the view sits in the track. Frequency stays full-range. The zoomed view is **re-analyzed, not stretched**: the worker keeps the file's mono samples after the full analysis and answers `zoom` requests with `computeStftSegment` (`src/audio/stft.ts`) — about one column per canvas pixel, window centers evenly spaced across the segment, zero-padded at the track edges. One request in flight; scrolling coalesces to the latest view. Zoom failures post `zoom-error` (toast only) so they never clear the verdict, and the verdict is never recomputed — it always describes the whole file. **Minimum zoom = 20 STFT windows** (`MIN_ZOOM_WINDOWS` in `src/main.ts`, TUNABLE): ≈0.93 s at 44.1 kHz, ≈0.85 s at 48 kHz — below that the 2048-sample (~46 ms) window just smears wider. Verified with a temporary Vitest (deleted): a tone switch at 1.0 s lands at 50.0% of a 0.5–1.5 s view (1,003 columns); edge views have no NaN; a 30 s zoom of a 3-min track computes in ~38 ms. Drag/scroll UX itself is a manual check.

## How we work
Plan → Work → Assess → Compound. Lessons earned go into this file immediately. Decisions land in Open decisions the same session. This is the smallest, safest entry — its job in the portfolio is to be *finished early and submitted-ready*; resist every urge to grow it.
