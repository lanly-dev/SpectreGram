# Electron Shell — Tasks

Part of the `electron-shell` Kiro spec. Requirements: `./requirements.md` · Design: `./design.md`.

0. **Precondition:** verify + commit the working-tree B1 fix (`npm run build && npm run test` green) as its own commit. Stop if red.
1. Commit this spec under `/.kiro/specs/electron-shell/` + apply the §4 AGENTS.md patch. (Spec-first: this commit precedes all shell code.)
2. Add `electron/main.js` + `electron/preload.js` (window, `app://` protocol, single-instance, open-file forwarding, save-dialog IPC) with the §2.2 security flags.
3. Renderer hooks: `analyzeArrayBuffer` entry point, dual-mode PNG export, optional bridge typing. Web behavior unchanged.
4. `vite.config.ts`: `base: './'`; verify web build + worker + Pages-style subpath serving locally.
5. Dev loop: `ELECTRON_DEV=1` flow works against the Vite dev server (drop/pick/analyze/export).
6. electron-builder config + icon + scripts; build installers for the host OS first.
7. **Packaged-build acceptance pass** (§1 checklist) on the real FLAC vs fake-FLAC pair — packaged app only, offline. If the worker fails packaged, implement the §2.2 fallback before proceeding.
8. Cross-platform installers (CI or manual), GitHub Release with artifacts, README install section (+ unsigned-app notes), Devpost text updated: desktop product, web demo link.

Out of scope for every task above: auto-update, signing, tray/menus beyond default, new formats, theming/flair, any change to `cutoff.ts` logic.

---

## Implementation status (2026-11-06)

- ✅ **1** — spec committed (`786aaa70`).
- ✅ **2** — shell + preload + IPC: `app://` protocol, single-instance, open-file forwarding with a read allowlist, native save dialog. Preload ships as `preload.cjs` (sandboxed preloads cannot be ESM under `"type": "module"`).
- ✅ **3** — renderer hooks: open-file intake wraps bytes in a `File` and reuses the one `handleFile` analysis path (equivalent to the planned `analyzeArrayBuffer` split, with decode untouched); dual-mode PNG export; bridge typing in `src/types/desktop.d.ts`. Web behavior unchanged apart from the export filename (`<name>-spectrogram.png`).
- ✅ **4** — `base: './'`; web preview serves relative assets; packaged asset loading verified.
- ✅ **5** — dev loop via `scripts/electron-dev.mjs` (sets `SPECTREGRAM_DEV_URL`); smoke-verified headless (open-file → verdict in the dev-served renderer).
- ✅ **6** — electron-builder config + icon + scripts; Linux AppImage built and smoke-run. Win (NSIS) / mac (dmg) targets configured, not yet built.
- ✅ **7** — packaged acceptance on Linux (unpackaged, `--dir` package, AppImage): open-file → verdict on a synthetic genuine (20.5 kHz → "genuine lossless") vs fake-FLAC (15.6 kHz → "MP3 in a costume") pair; PNG save bridge wrote a real file. The §2.2 localhost fallback was NOT needed — the worker runs from `app://`. A real-file pair remains the AGENTS.md calibration item.
- ⏳ **0** — B1 verification still belongs to the local working tree (uncommitted there). Note: committed `cutoff.ts` already contains a post-loop final-run flush assigning both `bestLen` and `bestEnd` — diff before committing.
- ⏳ **8** — GitHub Release + win/mac installers pending; README gained a Run-it section (unsigned-app note included).

---
