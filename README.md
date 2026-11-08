# SpectreGram 👻

A desktop acoustic spectrum analyser — with the same build also running
in the browser as a no-install demo — a clean-room reimagining of
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

- **A real desktop app again** — Electron shell, open-with file routing,
  native save dialog. Your files never leave your machine.
- **No-install demo.** The identical build also runs in the browser.
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
`decodeAudioData` · STFT in a Web Worker · `fft.js` · Vitest · Electron +
electron-builder for the desktop shell. Full locked requirements in
`AGENTS.md`.

## Run it

```sh
npm install
npm run dev     # build + launch the desktop app
```

### Scripts

Every run script in `package.json`, and what each one is for:

| Command | What it does |
| --- | --- |
| `npm run start` | Build first (`build`), then launch the Electron app on the production `app://` path — the real app, exactly as it ships packaged. No hot reload; restart to pick up changes. |
| `npm run dev` | Alias for `start` — the everyday "run the desktop app" command. Note: this is **not** the Vite dev server (that's `web:dev`). |
| `npm run build` | Typecheck (`tsc --noEmit`) + production build into `dist/`. Runs automatically as the first step of `start`, `dist`, and `pack`, so you rarely call it alone except to check a build. |
| `npm run preview` | Desktop dev loop: starts Vite and opens the Electron shell against it, so edits under `src/` hot-reload while you work. Changes to `electron/` still need a restart. Despite the name, this is **not** `vite preview` (that's `web:preview`). |
| `npm run dist` | Build, then package the installer for your OS into `release/` (Windows NSIS · macOS dmg · Linux AppImage). |
| `npm run pack` | Build, then package into `release/` *without* an installer — just the unpacked app directory. For checking the packaged form runs before you make installers. |
| `npm run web:dev` | Vite dev server in the browser (http://localhost:5173) — developing the web demo with hot reload, no Electron. |
| `npm run web:preview` | Serve the production `dist/` build locally, to check the web demo exactly as it will ship. |
| `npm run test` | Run the Vitest suite once (`src/audio/cutoff.test.ts` — the cutoff/verdict tests). |
| `npm run test:watch` | Vitest in watch mode — re-runs the suite as files change. |

Rule of thumb: develop with `preview` (or `web:dev` for the demo), verify
with `dev`, package with `dist`.

Release installers are unsigned in v1 — Windows SmartScreen / macOS
Gatekeeper will warn on first launch; that's expected.

## Status
Functional core implemented (`main` @ `6c4e4a1`): decode → STFT
(Web Worker, fft.js) → cutoff/verdict → Canvas render → PNG export.
Spec-first artifacts in `/.kiro/specs/spectregram/`.

**Desktop shell implemented** (Electron, per `/.kiro/specs/electron-shell/`):
window + `app://` protocol, preload bridge (native PNG save dialog,
open-with routing), web build behavior unchanged. Verified headless on
Linux: unpackaged, packaged, and AppImage builds all pass an
open-file → verdict smoke on a synthetic genuine (20.5 kHz) vs fake-FLAC
(15.6 kHz, "costume") pair; build + Vitest (10/10) green. Windows/macOS
installers not yet built; no GitHub Release yet.

**Active:** one review blocker (B1 — a cutoff edge case); fix + regression
tests are in a local working tree, **uncommitted & unverified**. **Pending:**
real-file calibration of cutoff thresholds (AGENTS.md #3) and a deferred
Halloween-styling pass. See `AGENTS.md` → Status & Open decisions for the
full picture.

## License
MIT — see [LICENSE](./LICENSE). Spek is GPL-3.0 and is **not** a dependency of
this codebase; only its concept is referenced.
