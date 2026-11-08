# DEV.md — SpectreGram development guide

How to run, build, test, and package SpectreGram. For what the app *is*,
see [README.md](./README.md); for project status, decisions, and the locked
stack, see `AGENTS.md` (the source of truth).

## Setup

```sh
npm install
```

Dependencies are pinned to exact versions in `package.json`. There is no
committed lockfile (`package-lock.json` is gitignored in this repo).

## Scripts

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

## Dev loops and hot reload

Two loops have hot reload; the production path does not:

- **`preview`** (desktop dev loop) — `scripts/electron-dev.mjs` starts the
  Vite dev server, waits for it on http://localhost:5173, then launches
  Electron with `SPECTREGRAM_DEV_URL` set, so the main process loads the
  dev server instead of `app://`. Edits under `src/` hot-reload in the
  window. Edits to `electron/main.js` or `electron/preload.cjs` do **not**
  reload — restart the command.
- **`web:dev`** (web dev loop) — plain Vite in the browser, full HMR, no
  Electron. The desktop bridge is absent here, so PNG export falls back to
  a browser download and open-with does nothing, by design.
- **`start` / `dev`** — no hot reload at all: a fresh production build,
  loaded over the custom `app://` protocol from `dist/`. This is the path
  the packaged app runs, so it's the one to verify in — a dev loop can
  pass while the packaged path breaks (e.g. worker loading), and only
  this path shows it.

## Build

`npm run build` = `tsc --noEmit` (typecheck; any type error fails the
build) followed by `vite build` into `dist/`. The STFT worker is emitted
as its own chunk. Vite is configured with `base: './'` so the same
`dist/` output loads from the desktop shell's `app://` protocol and from
a GitHub Pages subpath alike. `dist/` is gitignored.

## Tests

Vitest covers `src/audio/cutoff.ts` only (locked scope — see
`.kiro/steering/build-conventions.md`): `npm run test` for a one-shot
run, `npm run test:watch` while tuning thresholds.

## Packaging

electron-builder configuration lives in the `build` key of
`package.json`; output goes to `release/` (gitignored).

- `npm run pack` — unpacked app directory only (e.g.
  `release/linux-unpacked/`). Use it to smoke-test the packaged form.
- `npm run dist` — the installer for the host OS: Windows NSIS,
  macOS dmg, Linux AppImage.
- The installer registers file associations for the common audio
  extensions (mp3 / flac / wav / ogg / m4a / opus / aac); opening a file
  with the app routes it through the same analysis path as drag & drop.
- App icon: `build/icon.png` (placeholder ghost mark; the final icon is
  a Halloween flair-pass item).
- Installers are **unsigned** in v1: Windows SmartScreen and macOS
  Gatekeeper warn on first launch. That's expected until signing is set
  up.
