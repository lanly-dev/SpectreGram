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
| `npm run dev` | Desktop dev loop **with hot reload**: starts Vite and opens the Electron shell against it, so edits under `src/` hot-reload while you work. Changes to `electron/` still need a restart. Note: this is **not** the browser dev server (that's `web:dev`). |
| `npm run build` | Typecheck (`tsc --noEmit`) + production build into `dist/`. Runs automatically as the first step of `start`, `dist`, and `pack`, so you rarely call it alone except to check a build. |
| `npm run preview` | Alias for `dev` — the same hot-reload desktop dev loop. Despite the name, this is **not** `vite preview` (that's `web:preview`). |
| `npm run dist` | Build, then package the installer for your OS into `release/` (Windows NSIS · macOS dmg · Linux AppImage). |
| `npm run pack` | Build, then package into `release/` *without* an installer — just the unpacked app directory. For checking the packaged form runs before you make installers. |
| `npm run web:dev` | Vite dev server in the browser (http://localhost:5173) — developing the web demo with hot reload, no Electron. |
| `npm run web:preview` | Serve the production `dist/` build locally, to check the web demo exactly as it will ship. |
| `npm run test` | Run the Vitest suite once (`src/audio/cutoff.test.ts` — the cutoff/verdict tests). |
| `npm run test:watch` | Vitest in watch mode — re-runs the suite as files change. |

Rule of thumb: develop with `dev` (or `web:dev` for the demo), verify
with `start`, package with `dist`.

## Dev loops and hot reload

Two loops have hot reload; the production path does not:

- **`dev`** (desktop dev loop; `preview` is its alias) — `scripts/electron-dev.mjs` starts the
  Vite dev server, waits for it on the dedicated port http://localhost:5273 — and verifies the page it gets back really is SpectreGram (a `<title>` identity check) — then launches
  Electron with `SPECTREGRAM_DEV_URL` set, so the main process loads the
  dev server instead of `app://`. Edits under `src/` hot-reload in the
  window. Edits to `electron/main.js` or `electron/preload.cjs` do **not**
  reload — restart the command.
- **`web:dev`** (web dev loop) — plain Vite in the browser, full HMR, no
  Electron. The desktop bridge is absent here, so PNG export falls back to
  a browser download and open-with does nothing, by design.
- **`start`** — no hot reload at all: a fresh production build,
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

## Recent-file cache

Reopening a file you already opened this session paints its spectrogram
and verdict at once, with no decode, STFT or cutoff pass. The code is the
"Recent-file cache" section of `src/main.ts`.

**Memory only.** Nothing is written to disk or browser storage. The cache
lives in ordinary variables and is gone when the app closes, so the next
launch analyzes every file fresh the first time.

**How a file is matched.** By name + size + a SHA-256 of its bytes
(`fileKey`). The desktop shell builds a new `File` on every open, so
modification dates can't be used, and a file whose contents changed is
analyzed fresh. Where `crypto.subtle` is unavailable (a non-secure
browser context), the cache is skipped and every open analyzes normally.

**Two tiers**, because decoded audio is far larger than what makes a
reopen instant:

| Tier | What it holds | Size per file | Budget (TUNABLE) |
| --- | --- | --- | --- |
| Analysis | facts, STFT params, full-track grid, verdict | ≤ ~4 MB (≤ ~1024 frames × 1025 bins × 4 B) | `GRID_CACHE_MAX_BYTES` = 200 MB, about 50 full-length tracks |
| Audio | decoded `AudioBuffer` + mono mixdown, for playback and zoom | ~250 MB for a 7-min track at 48 kHz stereo | `AUDIO_CACHE_MAX_BYTES` = 400 MB |

Eviction is least-recently-used. Over the audio budget, the oldest files
lose only their audio and keep their analysis, so they still reopen
instantly. Over the grid budget, the oldest entries are dropped entirely.
The file on screen is never evicted.

**Reopen paths** (`openFromCache`):

- **Audio still cached:** graph, verdict, playback and zoom are all ready
  at once.
- **Audio evicted:** graph and verdict appear at once; the file re-decodes
  in the background (usually under a second) and playback and zoom come
  back when it lands. Pressing Play or dragging to zoom in that window
  shows "Audio is still loading — try again in a moment."

**Worker.** Zoom re-analyzes segments in the worker, which is replaced on
every open. A cache hit therefore sends the worker a `hold` message
(`src/audio/stft-worker.ts`) carrying a copy of the mono samples: it stores
them for zoom requests without analyzing anything.

**Stale results.** Each open bumps `openGen`. A slower, earlier open (still
hashing or decoding) drops its result instead of replacing the file you
opened after it.

## Folder report

Desktop only. Spec: `.kiro/specs/folder-report/`. Open a folder (File ›
Open Folder), click **Scan** in the folder panel, and every audio file in
the folder **and its subfolders** is judged. The drumroll screen then waits
for **Reveal**: clicking it plays a drumroll sound that ends on a crash, and
the collector rating appears on the crash. **Save report** writes a Markdown
report into that folder.

| Piece | Where |
| --- | --- |
| Recursive listing (`walkAudioFiles`), save-report IPC | `electron/main.js` |
| Sequential scan on its own worker | `src/scan.ts` |
| Classes, rating tiers, Markdown builder (pure) | `src/report.ts` |
| `classify` worker request | `src/audio/stft-worker.ts` |
| Shared full-track STFT params (`stftParamsFor`) | `src/audio/stft.ts` |
| Scan button, drumroll modal, save | `src/main.ts`, `index.html`, `src/style.css` |
| Drumroll sound (synthesized) | `src/drumroll.ts` |

**Drumroll sound.** Synthesized with Web Audio, so there is no audio file to
license or ship: ~18 snare hits/s (band-passed white-noise bursts plus a
short triangle "body"), a crescendo over 2.2 s (`ROLL_SEC`, 0.6 s with
reduced motion), then a crash (high-passed noise decay + low thump).
`playDrumroll()` returns `{ done, stop }`; the reveal waits on `done`, which
resolves at the crash. It uses its own short-lived `AudioContext`, created on
the Reveal click (a user gesture, so autoplay rules allow it) and closed once
the crash has rung out. Close or Esc mid-roll stops the sound.

**Listing.** Hidden entries (`.name`) are skipped, symbolic links are not
followed, unreadable subfolders are skipped, and the list stops at 1,000
files (`MAX_FOLDER_FILES`; the user gets a "list capped" toast). Panel rows
show the path relative to the opened folder.

**Refresh.** The circular-arrow button left of Scan re-lists the open
folder (`sg:refresh-folder`) with the same rules, cap and display name it
was opened with, so files added, removed or renamed since show up without
reopening it. The selected file stays selected if it's still there, and a
running scan is cancelled (as when loading a folder). The toast says
"Refreshed …".

**Loading.** Big folders and deep trees take a moment to walk. Meanwhile
the list area shows a floating 👻, "Summoning the spirits…" and a live
"Searching “name” — n audio files found" (from `sg:folder-loading`
events). Refresh and Scan are disabled for the whole walk, however it was
started, and a running scan is stopped. If nothing is found or the read
fails, the previous list comes back. Only the latest load reports, so
opening another folder mid-walk can't mix the two.
`SPECTREGRAM_SMOKE_WALK_DELAY_MS` (test-only) slows the walk so the folder
smoke can watch this state.

**Scan.** Nothing runs until Scan is clicked. Files are processed one at a
time (read → `decodeFile` → `classify` in the worker), so only one decoded
file is in memory at once, and a scanned file gets exactly the verdict a
single open would give (same `stftParamsFor`, same `cutoff.ts`). The scan
has its own worker, so the spectrogram on screen and its zoom are not
disturbed. Cancel stops after the current file; loading another folder
cancels too.

**Classes and rating.** `classifyRow` sorts each verdict into Genuine ·
Costume · Inconclusive · Normal lossy · No call · Could not decode.
`rateCollection` judges only files that claim lossless, by costume share =
costume ÷ (genuine + costume): 0 → 👑 Crypt Keeper, ≤ 20% → 🧛 Avid
Collector, ≤ 50% → 🧟 Haunted Hoarder, more → 🎃 Costume Party Noob; no
lossless claims → 🦇 Lossy Lurker; only inconclusive → 🌫️ Lost in the Fog.
Inconclusive is deliberately neutral (genuine 44.1 kHz files can read
inconclusive on 48 kHz devices — AGENTS.md #3). The share thresholds are
TUNABLE constants in `report.ts`. Every rating ends with "(estimate)".

**Report.** `spectregram-report.md`: folder name (not its full path), scan
time, rating, class counts, one row per file (relative path, claimed
format, duration, cutoff, class, verdict) and the caveats, including the
decode sample rate. Saving always goes through the save dialog, opened in
the scanned folder; nothing is written or overwritten without it.

**Smoke test.** `SPECTREGRAM_SMOKE=1 SPECTREGRAM_SMOKE_FOLDER=<folder>
SPECTREGRAM_SMOKE_SAVE_DIR=<dir> npx electron .` loads the folder, clicks
Scan, waits for the drumroll screen, clicks Reveal, prints the listing, the
roll time and the revealed rating, and saves the report into `<dir>`
without a dialog. Test-only; inert in normal use. Like the file smoke, it
can't run while another SpectreGram window is open (single-instance lock).

## Spectral message

Spec: `.kiro/specs/spectral-message/`. With a track loaded, the controls-row
**Haunt** button opens a dialog: type up to 32 characters or roll 🎲 for a
Halloween phrase, then **Generate & save**. SpectreGram writes a **new**
16-bit WAV with the text drawn into its sound, so the words show up in the
spectrogram of that file — in SpectreGram or any other spectrum app. The
saved file then opens in the app. The original file is never changed.

| Piece | Where |
| --- | --- |
| Dice phrases (original wording), 32-char limit | `src/message/phrases.ts` |
| Text → 32-row 0/1 mask (canvas) | `src/message/raster.ts` |
| Layout, fit check, tone synthesis (pure) | `src/message/encode.ts` |
| 16-bit PCM WAV writer (pure) | `src/message/wav.ts` |
| Worker running embed + WAV | `src/message/embed-worker.ts` |
| `sg:save-wav` save dialog | `electron/main.js`, `electron/preload.cjs` |
| Button, dialog, generate → save → open | `src/main.ts`, `index.html`, `src/style.css` |

**How the text gets in.** A spectrogram plots time left→right and
frequency bottom→top. Nothing is added to the track: inside the letter
shapes, in the message band, the original is dimmed by `LETTER_DIM_DB`
(24 dB), so the word shows as dark letters against the music. It's done
with an STFT filter (2048-point sqrt-Hann frames every 512 samples) that
reconstructs the audio exactly wherever nothing is dimmed, so other
frequencies and other times come back unchanged. The text is centered in
the track and sized to read with its natural shape in the full-track view
(squeezed if it would pass 90% of the track width). If a column would be
narrower than one full-view STFT frame, strokes would vanish, so the app
refuses and asks for fewer characters or a longer track. Letters use the
heaviest system font weight, thickened by one column.

**Verdict safety.** The letters live between 46% and 66% of Nyquist (≈ 11–16
kHz at 48 kHz), below the analyzer's 73% "costume" line, and the dimming
eases in and out over ~1 s. On top of that the app checks by construction:
after cutting the letters it runs the analyzer on the result and on the
original, and keeps the result only if the cutoff class matches and the
cutoff hasn't risen by more than 0.1 kHz — otherwise it retries at 12, then
6 dB, and refuses if none is safe. A WAV made from an MP3 is still lossy,
and the analyzer correctly calls it a costume.

**What you hear.** Nothing new — the highs just dip while each letter
passes. Where the track has nothing in the band (silence, a quiet break),
there is nothing to dim, so the letters can't show there.

**Emoji.** Most dice phrases include Halloween emoji, and typed emoji work
too. They're drawn with the system emoji font and cut in as silhouettes (the
mask comes from the glyph's alpha, so shape only, no colors) — e.g.
"🎃 BOO 👻 🦇" reads as pumpkin, BOO, ghost and bat. The 32-character limit
counts graphemes (`countChars` in `phrases.ts`, via `Intl.Segmenter`), so
an emoji is one character even when it's several code points; the input's
`maxlength` is only a 128-code-unit safety cap.

**History (why it works this way).** Every version that *added* sound
failed: 32 steady tones made the maintainer's ears feel bad and dizzy;
hiss and warble were rejected by ear; soft "blended" sparkle grains were
comfortable but invisible over real music, even with the band dimmed to
make room. Cutting the letters in (his suggestion) was readable on both
real test tracks (loud pop, full-band orchestral). Spec R3a–R3g.

**Settings (TUNABLE, `encode.ts`).** `LETTER_DIM_DB` (24; 12 was too faint),
`BAND_LO`/`BAND_HI` = 0.46/0.66 × Nyquist — keep `BAND_HI` below 0.73 (the
costume line).
**Output.** 16-bit PCM at the decoded sample rate (the device rate — see
AGENTS.md #3), same length and channels as the decoded track, default name
`<original>-haunted.wav`. Desktop: native save dialog. Web: browser
download.

**Smoke test.** `SPECTREGRAM_SMOKE=1 SPECTREGRAM_SMOKE_FILE=<track>
SPECTREGRAM_SMOKE_SAVE_DIR=<dir> SPECTREGRAM_SMOKE_MESSAGE="TRICK OR TREAT"
npx electron .` analyzes the track, haunts it through the real dialog,
reopens the WAV, prints both verdicts, and saves the WAV and its spectrogram
PNG into `<dir>`. Test-only; can't run while another SpectreGram window is
open.

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
