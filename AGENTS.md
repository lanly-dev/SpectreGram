# AGENTS.md — SpectreGram

Kiroween 2026 entry — **Resurrection**. Read this file first in every session on this project.

## Status
- Name **SpectreGram** — confirmed 2026-11-06. Collision check run 2026-11-06: no established audio/spectrogram app or GitHub project with this exact name found; minor distant hits only (a Ludum Dare game and a DEF CON acoustic-research tool both spelled "Spectregram", plus spam Instagram-viewer pages) — low risk, different domains. Never name it "Spek" — Spek is a real open-source project; we revive its idea, not its name.
- Stack **DECIDED 2026-11-06: Vite + TypeScript, vanilla (no framework)** — full locked requirements in the Stack section below.
- Repo `lanly-dev/spectregram` — **not yet created**. Do not create it, register anything, or request credits until explicit go is given in this project's side chat.
- Deadline: **Fri Dec 4, 2026, 2:00 PM PT**. Shared credit pool rules apply (see Budget).

## What this is
A resurrection of Spek, the desktop acoustic spectrum analyser — a tool from the era of local music libraries that streaming killed. Drop in an audio file and it renders the full-track spectrogram, estimates the true frequency cutoff, and delivers a verdict: is this file what it claims to be, or a low-bitrate file wearing a lossless costume?

**Source reference:** https://github.com/alexkay/spek — the canonical Spek repo. C++ app using FFmpeg for decoding and wxWidgets for GUI, available on *BSD/Linux/Windows/macOS, 3,481 stars, last release v0.8.5 on 2023-01-09. **License is GPL-3.0 — do NOT copy its code into this MIT-licensed project; clean-room web reimplementation of the idea only.** AGENTS.md originally described Spek conceptually without citing this URL; the URL was verified and added 2026-11-06.

## Category fit
Resurrection: bring a favorite dead technology back to life, reimagined with today's innovations. The dead tech is file-era audio inspection (Spek and its kin). The "today's innovations" half of the pitch: fully in-browser (no install, files never leave the device), automated verdict instead of reading the graph by eye, and a spectrogram rendered as the visual centerpiece rather than a grey utility plot.

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
- **Hosting: static only** (GitHub Pages) — no server, no Next.js, no Electron/Tauri (would kill the "no install, files never leave this tab" pitch).

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
- All client-side web app. Drag-and-drop or pick an audio file (mp3 / flac / wav / ogg / m4a as the browser can decode).
- Decode with Web Audio (`decodeAudioData`), compute the STFT, render the **full-track spectrogram** on canvas with a haunted palette (hellfire / ectoplasm options count as view settings, not separate products).
- Cutoff estimation: highest frequency with sustained energy → verdict line, e.g. "Claims FLAC. Cutoff ≈16 kHz — smells like a 128k MP3 in a costume." Verdict is always labelled an **estimate**.
- File facts panel: format (as reported by the file/decode), duration, sample rate, channels.
- Export the spectrogram as PNG.
- Minimal playhead preview is allowed (sync a playhead over the spectrogram) — see the guardrail below.

## Non-goals (scope caps)
- **This is an analyzer, not a player.** No playlist, no skins system, no library management. Skinwalker's territory — the two audio entries must stay clearly substantially different.
- No server, no uploads, no accounts. "Your files never leave this tab" is a feature — keep it true.
- No claim of proof: the cutoff heuristic can be fooled (legitimately filtered or quiet masters). Always present the verdict as an estimate, in the UI and in every write-up.

## Acceptance checks
- [ ] Known test pair: a genuine lossless file and a 128k-mp3-disguised-as-FLAC render visibly different spectrograms, and the verdicts differ accordingly.
- [ ] A 60-second track renders its full spectrogram without freezing the tab unacceptably (progress indication if slow).
- [ ] PNG export opens and matches what was on screen.
- [ ] Verdict text says "estimate" (or equivalent) everywhere it appears.

## Packaging checklist
- [ ] Working app URL (static hosting), public repo + MIT license + `/.kiro`.
- [ ] Demo video < 3 min, public YouTube: drop the fake FLAC → spectrogram → verdict lands; then the genuine file for contrast. Two files, one clear story.
- [ ] Devpost description + Kiro-usage write-up.
- [ ] Blog post (Bonus Blog prize) + one social post starting with `#KiroweenHackathon26`.

## Open decisions
1. ~~Name final?~~ **DECIDED 2026-11-06: SpectreGram** (collision check run, see Status).
2. ~~Stack?~~ **DECIDED 2026-11-06: Vite + TypeScript, vanilla (no framework)** — see Stack section above for the full locked requirements.
3. Verdict strictness: how aggressive should the cutoff thresholds be? Calibrate on real files before locking.
4. Go / no-go to create repo and start the Kiro spec — still awaiting explicit go in this chat.

## How we work
Plan → Work → Assess → Compound. Lessons earned go into this file immediately. Decisions land in Open decisions the same session. This is the smallest, safest entry — its job in the portfolio is to be *finished early and submitted-ready*; resist every urge to grow it.
