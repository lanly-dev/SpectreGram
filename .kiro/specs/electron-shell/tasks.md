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
