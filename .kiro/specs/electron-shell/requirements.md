# Electron Shell — Requirements

Part of the `electron-shell` Kiro spec (spec-first: this spec is committed before any shell code).
Parent context: `AGENTS.md` (repo root) and `/.kiro/specs/spectregram/`.

### Goal
Ship SpectreGram as an installable desktop app (Windows / macOS / Linux) like the original Spek, by wrapping the existing, verified web build in Electron — with zero changes to the analyzer's behavior.

### Non-negotiable constraints
1. **Renderer code is reused as-is.** `src/main.ts`, `src/render.ts`, `src/style.css`, `src/audio/*` keep their behavior. The only renderer change allowed is the additive dual-mode hooks in §2.3 (native save + open-file entry point), each with a web fallback so the browser build is unaffected.
2. **The web build stays a first-class output.** `npm run build` still produces `dist/` for GitHub Pages. The Pages URL remains the Kiroween "working app URL" (judges may not install binaries). Desktop is the product; web is the demo door.
3. **Pitch update, not pitch break:** "files never leave this tab" becomes "files never leave your machine" — true in both builds, stronger on desktop. No server, no uploads, no accounts, no telemetry, no auto-update in v1.
4. **Security defaults:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Renderer gets Node access to NOTHING except the two narrow preload bridges in §2.3.
5. **No new analyzer scope.** No FFmpeg, no format expansion, no playlist/library, no tray, no settings system. This is a shell, not a feature pass. Halloween flair pass stays deferred (repo Open decision #6).
6. **Credit discipline:** this is packaging, not core. Plain-JS main process (no TS build step for main, no electron-vite). If a task starts growing, cut it, don't gold-plate it.

### Functional requirements
- F1. App launches to the existing UI in a native window (default ~1280×840, min ~900×600), title "SpectreGram", app icon (placeholder ghost mark acceptable for v1; final icon is a flair-pass item).
- F2. Drag-and-drop and file-pick work exactly as in the browser (Chromium File API — no change needed).
- F3. PNG export uses the native Save dialog on desktop (default filename derived from the audio file name, e.g. `<name>-spectrogram.png`); on web it keeps the current download behavior.
- F4. "Open With / double-click an audio file" launches (or focuses) the app and analyzes that file (Windows/macOS file association for mp3/flac/wav/ogg/m4a/opus/aac; second-instance opens route to the running window).
- F5. Fully offline: packaged app analyzes with no network. The STFT Web Worker MUST work in the packaged build (see design risk R1 — this is the make-or-break check).
- F6. Installers produced via electron-builder: Windows NSIS, macOS DMG (unsigned is acceptable for v1 — document the Gatekeeper right-click-open note in README), Linux AppImage. Artifacts attach to a GitHub Release manually.
- F7. `npm run test` (Vitest) and the web smoke flow still pass, unchanged, after the conversion.

### Acceptance checks (conversion)
- [ ] Fresh clone → `npm install && npm run dist` produces an installer; installed app launches offline.
- [ ] In the PACKAGED app (not dev): drop a real FLAC → spectrogram renders with worker progress; verdict appears; drop the fake-FLAC pair file → different verdict (mirrors the existing real-file acceptance pair).
- [ ] PNG export via Save dialog writes a file that opens and matches the on-screen spectrogram.
- [ ] Double-clicking an audio file in Explorer/Finder opens it in SpectreGram (or routes it into the running instance).
- [ ] Web build unchanged for users: Pages deploy renders, drops, analyzes, and exports as before (dual-mode hooks fall back cleanly).
- [ ] README + AGENTS.md in repo updated in the same PR/commit series: desktop = product, web = demo; install instructions + unsigned-app notes included.

---
