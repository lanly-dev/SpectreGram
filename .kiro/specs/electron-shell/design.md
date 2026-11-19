# Electron Shell — Design

Part of the `electron-shell` Kiro spec. Requirements: `./requirements.md`.

### 2.1 Layout (additions only)
```
electron/main.js        — main process (plain JS, no build step)
electron/preload.js     — contextBridge: savePng + onOpenFile only
package.json            — "main": "electron/main.js"; scripts + electron-builder config
build/icon.png          — 512×512 app icon (placeholder OK for v1)
```
Everything else is untouched. DevDeps added: `electron`, `electron-builder` (pin current stable majors at implementation time; record exact versions in the commit).

### 2.2 Main process
- Single `BrowserWindow`, security flags per constraint 4.
- **Loading strategy (Risk R1):** ES-module workers + module scripts are unreliable over `file://`. Do NOT `loadFile` blindly. Serve `dist/` to the window via a custom `app://` protocol (`protocol.handle`, modern Electron) mapped to the dist folder, and load `app://bundle/index.html`. In dev, load the Vite dev-server URL (`http://localhost:5173`) when `ELECTRON_DEV=1`, so HMR still works.
  - Fallback if `app://` misbehaves with the worker: tiny localhost static server in main (127.0.0.1, ephemeral port). Either way, acceptance check F5 is run against the PACKAGED build before calling this done.
- Single-instance lock; `second-instance` + macOS `open-file` events forward the file path to the renderer via the preload bridge (§2.3) once the window is ready; cold-start file path is held and delivered after `did-finish-load`.
- Custom native menu (File: Open… / Save / Quit; Help: Language / About / Developer Tools), in addition to OS menu defaults.
  - *Amended 2026-11-17 (maintainer's ask):* **Developer Tools** moves out of Help into **Options › Development**, next to the other development helpers (Show Screensaver, Show Error Toast, Load Sample Folder), keeping its shortcut (F12; ⌥⌘I on macOS). Help keeps Language / About.

### 2.3 Preload bridges (the only renderer changes)
```js
// preload.js — contextBridge.exposeInMainWorld('spectregramDesktop', {
//   savePng(arrayBuffer, defaultName) -> Promise<boolean /*saved*/>,
//   readFile(path) -> Promise<ArrayBuffer>,          // for open-with files
//   onOpenFile(cb),                                    // path notifications
// })
```
- Main handles `savePng` with `dialog.showSaveDialog` (PNG filter) + `fs.writeFile`. Cancel = resolve false, renderer stays silent (no error toast).
- Renderer (`src/main.ts`) additive changes:
  1. Extract/confirm an `analyzeArrayBuffer(name, buffer)` entry point that the existing drop/pick handlers already effectively use; open-with calls the same entry point with `readFile(path)`. One analysis path, three doors (drop, pick, open-with).
  2. PNG export: if `window.spectregramDesktop` exists → `savePng(...)`; else → current browser download. No other branching on desktop vs web anywhere.
- Type the bridge in `src/types/` with an optional global declaration so `tsc --noEmit` stays green on the web build without Electron types leaking in.

### 2.4 Vite config
- Set `base: './'` so built asset URLs are relative — required for the `app://` protocol mapping and it also keeps the GitHub Pages subpath deploy working. Re-run the web smoke check after this change (it touches every build).
- Worker bundling stays as-is (locked `new URL(..., import.meta.url)` syntax); verify the worker chunk is emitted under `dist/assets/` and reachable via the protocol handler's path mapping (strip/allow subpaths, block path traversal outside dist).

### 2.5 Packaging (electron-builder, in package.json `build` key)
- `appId`: `dev.lanly.spectregram` (adjust if a domain is preferred; do not block on this).
- `files`: `dist/**`, `electron/**`, `package.json`.
- Targets: `win: nsis`, `mac: dmg`, `linux: AppImage`.
- `fileAssociations`: mp3, flac, wav, ogg, m4a, opus, aac → role Viewer.
- Scripts: `"electron:dev": "ELECTRON_DEV=1 electron ."` (with Vite dev server running separately), `"dist": "npm run build && electron-builder"`, keep existing `dev/build/preview/test` untouched.

### Risks
- **R1 (make-or-break): module Web Worker under a custom protocol / packaged context.** Mitigated by design choice in §2.2 + a packaged-build acceptance gate, not a dev-mode check.
- **R2: unsigned binaries** trigger SmartScreen/Gatekeeper warnings. Accepted for v1; README documents it. Signing is a post-Kiroween item.
- **R3: decode coverage** is Chromium's (same as web) — desktop v1 does NOT gain formats. That's deliberate (constraint 5); any FFmpeg conversation is a separate, later spec with its own licensing review (Spek is GPL-3.0; do not port its code).

---

## Amendment — themed Language card (2026-11-19)

Help > Language originally opened a native `dialog.showMessageBox` placeholder
("Language selection will arrive in a later release"), which could not carry
the app styling. It now follows the About pattern: `menuLanguage()` sends
`sg:language`, the preload exposes `onShowLanguage`, and the renderer shows
`#language-modal` (`.report-modal` + `.report-card.language-card`) with the
twelve available languages as hidden-radio tiles, English selected by
default. The source list is English, Spanish, French, Chinese, Hindi,
Vietnamese, Korean, Russian, Japanese, Arabic, German, Halloween; each tile
shows the native name plus the English name, and Halloween maps to
`lang="en"`.

Selecting a language sets `document.documentElement.lang` and
`data-language`, toasts the pick, and is session-only (no persistence, like
the palette and the screensaver flag). The pick immediately translates the
interface (next amendment), and the card's note says so. Esc/backdrop/Close
dismiss it and swallow the key so the graph does not also reset its zoom.

---

## Amendment — translations (2026-11-19)

The picker now performs what it promises. `src/i18n/en.ts` is the source
table; each other language file (including a spooky-English Halloween)
supplies the same keys, falling back to English when one is missing.
`t(key, vars)` serves strings built in code, and `translateDom()` swaps static
text and `title`/`aria-label`/`placeholder`/`alt`, storing the English source
in a `WeakMap` so switching back restores it. The verdict is rebuilt from the
stored cutoff and claimed format when the language changes, and the renderer
re-renders facts, tooltips, the Scan button and the export summary. Arabic
keeps the LTR layout. The saved Markdown report, folder loading counter and
message-fit error stay English.

The native menu bar is not DOM: the renderer also reports the pick through
`spectregramDesktop.setLanguage` (`sg:set-language`), and main rebuilds the
application menu from `electron/menu-labels.js` — 18 labels in the same twelve
languages — keeping the Options checkbox states. The existing
`SPECTREGRAM_SMOKE_MENU` harness accepts `SPECTREGRAM_SMOKE_MENU_LANG` to print
the menu in a chosen language.
