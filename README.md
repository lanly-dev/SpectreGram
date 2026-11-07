# SpectreGram 👻

An in-browser acoustic spectrum analyser — a clean-room reimagining of
[Spek](https://github.com/alexkay/spek) for the file-era audio inspector who
refused to move on. Drop in an audio file; get the full-track spectrogram, an
estimate of the true frequency cutoff, and a verdict: is this file what it
claims to be, or a 128k MP3 in a lossless costume?

Built for **Kiroween 2026** — the *Resurrection* category.

## The resurrection
Spek was the audiophile's x-ray: a desktop tool that showed you whether your
"lossless" download was actually a transcoded MP3. Streaming killed the
local-library world that needed it, and desktop installers got hard to
justify. SpectreGram brings the idea back, reimagined:

- **No install.** Runs entirely in the browser — your files never leave the tab.
- **An automated verdict**, not a graph you squint at.
- **A haunted spectrogram** as the visual centerpiece, not a grey utility plot.

> **Clean-room reimplementation.** Spek is GPL-3.0; SpectreGram is MIT. No Spek
> code is used — only the idea. See `.kiro/steering/build-conventions.md`.

## Kiro signature — built spec-first with Kiro
This project is built Kiro spec-first: requirements and design land in `/.kiro`
before implementation code.

- `/.kiro/specs/spectregram/` — spec (requirements → design → tasks)
- `/.kiro/steering/` — always-on project context and locked conventions
- `/.kiro/hooks/` — agent automation
- `AGENTS.md` — project source of truth (read first every session)
- `LICENSE` — MIT

## Stack
Vite + TypeScript (vanilla, no framework) · Canvas 2D · Web Audio
`decodeAudioData` · STFT in a Web Worker · `fft.js` · Vitest. Static hosting
only. Full locked requirements in `AGENTS.md`.

## Status
Functional core implemented and pushed (`main` @ `6c4e4a1`): decode → STFT
(Web Worker, fft.js) → cutoff/verdict → Canvas render → PNG export. Build +
Vitest (8/8) green. Spec-first artifacts in `/.kiro/specs/spectregram/`.

**Active:** one review blocker (B1 — a cutoff edge case); fix + regression
tests are in the working tree, **uncommitted & unverified**. **Pending:**
real-file calibration of cutoff thresholds (AGENTS.md #3) and a deferred
Halloween-styling pass. See `AGENTS.md` → Status & Open decisions for the
full picture.

## License
MIT — see [LICENSE](./LICENSE). Spek is GPL-3.0 and is **not** a dependency of
this codebase; only its concept is referenced.
