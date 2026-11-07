# SpectreGram — stack & build conventions

> Locked 2026-11-06. Do not change without explicit go in the project side
> chat. Full status in `AGENTS.md`.

## Clean-room constraint (critical)
Spek is GPL-3.0 (https://github.com/alexkay/spek). This project is MIT. **Do
not copy Spek's code.** Reimplement the idea only. The concepts (STFT
spectrogram, dBFS magnitude mapping, reading a frequency cutoff) are standard
DSP, not copyrightable expression. Our automated verdict is novel — Spek only
shows the graph; you read the cutoff by eye. When in doubt, write from the
idea, not the source.

## Locked stack
- **Build / language:** Vite + TypeScript, vanilla — NO UI framework (no
  React / Svelte / Vue). One screen, one job; framework lifecycle only fights
  canvas + AudioContext.
- **Styling:** plain CSS only — no Tailwind, no CSS framework. Haunted
  palettes are custom.
- **Rendering:** Canvas 2D (`ImageData` pixels, palette = color lookup table).
  No WebGL / Three.js.
- **Decoding:** native Web Audio `decodeAudioData` only — no FFmpeg.wasm
  (heavy, GPL drag). Supported formats = whatever the browser can decode.
- **Analysis:** STFT in a Web Worker. Vite worker syntax:
  `new Worker(new URL('./audio/stft-worker.ts', import.meta.url), { type: 'module' })`.
  Required to pass the 60-second no-freeze check; post progress from the
  worker.
- **FFT:** `fft.js` (tiny, MIT) — do NOT hand-roll an FFT; a silent FFT bug
  corrupts every verdict downstream.
- **Tests:** Vitest, for `cutoff.ts` only — lock thresholds against the
  genuine-FLAC vs fake-FLAC test pair. No e2e suite in v1.
- **Packaging:** Electron desktop app (installers via electron-builder);
  the same web build is kept as a static demo (GitHub Pages). No server,
  no Next.js. (Electron pivot DECIDED 2026-11-06 — supersedes the earlier
  static-only lock; see `AGENTS.md`.)

## File structure (spec tasks map 1:1)
```
src/main.ts              — drop zone, file pick, wiring
src/audio/decode.ts      — decodeAudioData + file facts (format/duration/sample rate/channels)
src/audio/stft-worker.ts — STFT via fft.js, posts progress + magnitude grid
src/audio/cutoff.ts      — cutoff estimate + verdict text (always "estimate"); Vitest-tested
src/render.ts            — canvas spectrogram, palette switch, playhead, PNG export
index.html / src/style.css
```

## Code conventions
- TypeScript strict mode. No `any` in analysis/cutoff/render paths.
- Keep decode → STFT → cutoff → render as separate, testable units.
- The worker owns the heavy compute; the main thread only wires UI and draws
  pixels the worker sends.
- Verdict strings are generated in one place (`cutoff.ts`) so the "estimate"
  label can never be missed.
- Pin dependency versions exactly (`package.json`), no open ranges.

## Privacy — no absolute paths in tracked files (hard rule)
Never write an absolute local path (e.g. `C:\Users\...`, `/home/...`,
`/Users/...`) into any file that is tracked by git. This includes source
code, docs, specs, steering files, review artifacts, and verification notes.

- Use repo-relative paths (`src/audio/cutoff.ts`, `.kiro/specs/...`) or
  path-agnostic references everywhere.
- Agent task artifacts under `.agents/` are gitignored for this exact reason
  — do NOT `git add .agents/` or remove `.agents/` from `.gitignore`.
- If a tool or script needs an absolute path at runtime, derive it
  programmatically (e.g. `import.meta.url`, `__dirname`, `process.cwd()`)
  rather than hard-coding it.
- Before committing, verify no absolute path leaked:
  `git diff --cached | Select-String -Pattern '[A-Za-z]:\\\\Users\\\\|/home/|/Users/'`
