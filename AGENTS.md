# AGENTS.md — SpectreGram

Kiroween 2026 entry — **Resurrection**. Read this file first in every session on this project.

## Status
- Name **SpectreGram** — confirmed 2026-11-06. Collision check run 2026-11-06: no established audio/spectrogram app or GitHub project with this exact name found; minor distant hits only (a Ludum Dare game and a DEF CON acoustic-research tool both spelled "Spectregram", plus spam Instagram-viewer pages) — low risk, different domains. Never name it "Spek" — Spek is a real open-source project; we revive its idea, not its name.
- Stack **DECIDED 2026-11-06: Vite + TypeScript, vanilla (no framework)** — full locked requirements in the Stack section below.
- **Desktop pivot DECIDED 2026-11-06 (late): desktop app like Spek — Electron shell, web code reused as-is; web build kept as the judge/demo URL.** Spec: `/.kiro/specs/electron-shell/`. **Shell IMPLEMENTED & verified 2026-11-06** (see Build log): `electron/main.js` (ESM) + `electron/preload.cjs`, `app://` protocol serving `dist/`, single-instance + open-with allowlist, native PNG save; renderer hooks additive (`src/main.ts` File-wrapped open-file intake, dual-mode PNG; `src/types/desktop.d.ts`); Vite `base: './'`. Headless-verified on Linux: unpackaged + packaged + AppImage builds pass an open-file → verdict smoke (synthetic 20.5 kHz full-band → "genuine lossless"; 15.5 kHz brick-walled .flac → "MP3 in a costume"); dev loop (`npm run electron:dev`) verified too; build + Vitest 10/10 green. Win/mac installers configured, not yet built; no GitHub Release yet.
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
6. **Halloween flair pass (deferred)** — "function app first, then decide halloween elements." Palettes (hellfire/ectoplasm) render correctly but are minimal/unstyled; haunted theming + optional playhead polish are a separate later pass — not started.
7. ~~Webapp or desktop?~~ **DECIDED 2026-11-06 (late): desktop, like Spek — Electron shell, web code reused as-is; web build kept as demo URL.** See `/.kiro/specs/electron-shell/`.

## Build log & lessons (2026-11-06)
- Spec-first build via a Kiro workflow (design → code → review). Core landed green in one code pass; review caught one blocker (B1).
- **An aborted review loop left uncommitted edits in the working tree** (B1 fix + regression tests) — always verify before committing an interrupted pass's changes; the pass was cut off before build/test re-ran.
- The cutoff detector's P5-across-bins noise floor needs ≥5% of bins below threshold; synthetic fixtures that leave <5% yield cutoff 0. The Vitest grid uses 0.94 (not 0.95) and the verify sine tops at bin 930 (not 1000) for this reason — see `.agents/tasks/spectregram-core/verification.md`.
- Real-file calibration is still open (decision #3); synthetic grids are a stand-in, not a substitute for the genuine-vs-fake acceptance pair.
- GitHub repo + push happened outside the agent (user-created) — the earlier "repo not yet created" gate is cleared.
- **Electron shell lessons (2026-11-06):** (1) Sandboxed preloads must be CommonJS — `preload.cjs`, because the package is `"type": "module"`. (2) The module Web Worker runs fine from `app://` with the scheme registered standard + secure + supportFetchAPI — the spec's localhost-server fallback was NOT needed, packaged builds included. (3) Headless smoke as root needs `--no-sandbox` / `ELECTRON_DISABLE_SANDBOX=1` — a sandbox-VM artifact, not an app flag. (4) Synthetic-signal caution: discrete sine partials and flat white noise both defeat the cutoff detector's P5-floor assumption (needs ≥5% near-silent bins) — shaped, brick-walled noise is the honest synthetic stand-in for the genuine-vs-fake pair. (5) Observation: the committed `cutoff.ts` already contains a post-loop final-run flush assigning both `bestLen` and `bestEnd` — diff the working tree carefully before committing the B1 fix; it may already be equivalent.

## How we work
Plan → Work → Assess → Compound. Lessons earned go into this file immediately. Decisions land in Open decisions the same session. This is the smallest, safest entry — its job in the portfolio is to be *finished early and submitted-ready*; resist every urge to grow it.
