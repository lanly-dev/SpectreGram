# Electron Shell — Requirements

Part of the `electron-shell` Kiro spec (spec-first: this spec is committed before any shell code).
Parent context: `AGENTS.md` (repo root) and `/.kiro/specs/spectregram/`.

### Goal
Ship SpectreGram as an installable desktop app (Windows / macOS / Linux)
like the original Spek, by wrapping the existing verified Vite renderer in
Electron with no changes to the analyzer's behavior.

### Non-negotiable constraints
1. **Renderer code is reused as-is.** `src/main.ts`, `src/render.ts`,
   `src/style.css`, `src/audio/*` keep their behavior. The only renderer
   change allowed is the additive desktop hooks in §2.3 (native save +
   open-file entry point). A browser-compatible fallback may remain for
   renderer-only development, but it is not a shipped product path.
2. **Electron is the only shipped product.** `npm run build` produces the
   `dist/` renderer consumed by the Electron shell. There is no GitHub Pages
   workflow, hosted web app, or live demo URL to maintain.
3. **Local-only operation:** "files never leave your machine" is the product
   guarantee. There is no server, no uploads, no accounts, no telemetry, and
   no auto-update in v1.
4. **Security defaults:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Renderer gets Node access to NOTHING except the two narrow preload bridges in §2.3.
5. **No new analyzer scope.** No FFmpeg, no format expansion, no playlist/library, no tray, no settings system. This is a shell, not a feature pass. Halloween flair pass stays deferred (repo Open decision #6).
6. **Credit discipline:** this is packaging, not core. Plain-JS main process (no TS build step for main, no electron-vite). If a task starts growing, cut it, don't gold-plate it.

### Functional requirements
- F1. App launches to the existing UI in a native window (default ~666×366, min ~320×240), title "SpectreGram", app icon (placeholder ghost mark acceptable for v1; final icon is a flair-pass item).
- F2. Drag-and-drop and file-pick work exactly as in the browser (Chromium File API — no change needed).
- F3. PNG export uses the native Save dialog on desktop (default filename
  derived from the audio file name, e.g. `<name>-spectrogram.png`). The
  renderer-only fallback is retained only for local development without the
  preload bridge.
- F4. "Open With / double-click an audio file" launches (or focuses) the app and analyzes that file (Windows/macOS file association for mp3/flac/wav/ogg/m4a/opus/aac; second-instance opens route to the running window).
- F5. Fully offline: packaged app analyzes with no network. The STFT Web Worker MUST work in the packaged build (see design risk R1 — this is the make-or-break check).
- F6. Installers produced via electron-builder: Windows NSIS, macOS DMG (unsigned is acceptable for v1 — document the Gatekeeper right-click-open note in README), Linux AppImage. Artifacts attach to a GitHub Release manually.
- F7. `npm run test` (Vitest), `npm run build`, and the packaged Electron
  smoke flow pass after the conversion.

### Acceptance checks (conversion)
- [ ] Fresh clone → `npm install && npm run dist` produces an installer; installed app launches offline.
- [ ] In the PACKAGED app (not dev): drop a real FLAC → spectrogram renders with worker progress; verdict appears; drop the fake-FLAC pair file → different verdict (mirrors the existing real-file acceptance pair).
- [ ] PNG export via Save dialog writes a file that opens and matches the on-screen spectrogram.
- [ ] Double-clicking an audio file in Explorer/Finder opens it in SpectreGram (or routes it into the running instance).
- [ ] Packaged app remains offline: the Electron window loads the renderer,
  the worker analyzes a file, and the verdict appears.
- [ ] README + AGENTS.md in repo updated in the same PR/commit series:
  desktop = product; install instructions + unsigned-app notes included;
  no hosted demo URL is advertised.

---
