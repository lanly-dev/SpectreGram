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
and verdict at once, with no decode, STFT or cutoff pass.

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
| Analysis | facts, STFT params, full-track grid (+ phase bytes), verdict | ≤ ~5 MB (≤ ~1024 frames × 1025 bins × (4 B magnitude + 1 B phase)) | `GRID_CACHE_MAX_BYTES` = 200 MB, about 45 full-length tracks |
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

**Refresh.** The circular-arrow button right of Scan re-lists the open
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
TUNABLE constants in `report.ts`. Like the verdicts, the rating blurbs end at
the finding — no "(estimate)" suffix (dropped 2026-11-19); the saved report's
caveat bullets still call every verdict and the rating estimates.

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
frequencies and other times come back unchanged. The band follows the file:
its top is clamped to 97% of the track's own measured cutoff when that is
lower than 66% of Nyquist, so the whole word sits on music that exists (a
band-limited MP3 otherwise loses the tops of its letters, which makes one
line of text read as a ragged block). The text is centered in
the track and sized to read with its natural shape in the full-track view
(squeezed if it would pass 90% of the track width). If a column would be
narrower than one full-view STFT frame, strokes would vanish, so the app
refuses and asks for fewer characters or a longer track. Letters use the
heaviest system font weight, thickened by one column.

**Verdict safety.** The letters never rise above 66% of Nyquist (≈ 16 kHz at
48 kHz), below the analyzer's 73% "costume" line — and on a band-limited file
the band drops under its cutoff instead of reaching that high (R3h). The
dimming eases in and out over ~1 s. On top of that the app checks by construction:
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
costume line) — plus `BAND_TOP_OF_CUTOFF` (0.97: where the band's top goes
when the track's cutoff is lower) and `BAND_LO_FLOOR` (0.15: the band won't
dim below this share of Nyquist; it squeezes instead).
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

## Ruler seek

Spec: `.kiro/specs/ruler-seek/`.

### Hover and seek
- **Hover** the bottom (time) ruler: a crimson line with a 🧛 rider follows
  the cursor down the spectrogram (`#seek-hover`, separate from the white 👻
  playhead), and a tooltip beside the cursor shows the time at that point
  (same precision rule as the crosshair readout). Leaving the ruler hides
  both.
- **Tick labels** — the time ruler aims for ~10 evenly spaced labels (was 6;
  made denser at the maintainer's request 2026-11-19): 20 s steps on a 3:02
  track, 45 s on a 7:10 one. Each label needs ~52 px, so a narrower ruler
  (folder panel open, small window) takes fewer, and the track's length is
  always labelled at the right edge — it replaces the last step label when
  their texts would touch. `TIME_STEPS` / `TIME_RULER_MAX_LABELS` in
  `src/main.ts` (TUNABLE).
- **Click** the ruler: sets the cue (`cueSec`). Stopped → the playhead moves
  to the cue. Playing → playback restarts from the cue.

### Transport controls
All buttons live in the controls row at the bottom of the UI. The row reads
left to right as: tools (palette, view mode, PNG export, spectral message),
the open file's **name** (`#track-name`, set by `setTrackName(file.name)` in
the load path, 11 px muted, one line, ellipsis when the row runs out of room
and the full name in its `title`), then the transport group (`.transport`, a nowrap flex box holding
Back, Skip, Back-to-start, play/pause and Stop). The name sits directly after
the tools (8 px gap) — not centred in the row — and `.transport`'s
`margin-left: auto` absorbs the slack, so the group stays flush with the right
edge. The row itself is `flex-wrap: nowrap` and `.transport` is
`flex: 0 0 auto`, so the five transport buttons cannot split across lines:
`.track-name` is the only shrinkable item (`flex: 0 1 auto; min-width: 0`), so
a long name — or a narrow window, or the folder panel's 200 px — ellipses the
name instead. Empty name = zero width, so the row looks unchanged before a
track is opened.

- **Back / Skip** (`#prev-btn` / `#next-btn`, left of Play) — step through the
  open folder's listing in panel order. They open the neighbouring file the
  same way a row click does, and the selected row follows. Both are disabled
  when no folder is open (and after a single file is opened, which ends the
  folder session); Back disables on the first file and Skip on the last.
  `folderPaths` / `folderSelectedPath` hold the order and the current row, and
  `updateTransportButtons()` is what sets the two `disabled` flags.
- **Play/Pause** (`#play-btn`, right end of the controls row, shows pause icon
  while playing) — starts from the cue (`source.start(0, offset)`) and
  otherwise resumes a paused track where it stopped (`pausedAt`).
- **Stop** (`#stop-btn`, beside Play) — returns the playhead to the cue (button
  is hidden when the cue is 0:00) and clears `pausedAt`. This is the
  difference: pause freezes in place, stop rewinds to the marked position.
- **Back to start** (`#start-btn`, just left of Play) — the full rewind.
  `backToStart()` clears the cue and the pause point and stops, so Play starts
  at 0:00. A new cue, a new file and reaching the end of the track all clear
  `pausedAt` too.
- **Space bar** — plays and pauses, same as the play button
  (`setupPlayShortcut()`). It is skipped while typing in a field, while any
  `.report-modal` dialog or the idle screensaver is up (`overlayOpen()`), and
  while a button has focus — a focused button already activates on space, so
  toggling here too would cancel it out. The key's default is prevented so the
  page never scrolls.

### Behavior details
- Zooming keeps a paused or cued playhead in place, or hides it when it is out
  of view.
- Times come from `viewRange()`, so hover and click work while zoomed. The
  ruler and spectrogram share left/right edges, so a fraction across one is
  the same fraction across the other.
- **Disabled states:** Stop is live only while a track is playing or paused
  (there is something to stop); Back to start is live unless the app is idle
  at 0:00 with no cue. Both come from `updatePlayButton()`, which `showCue()`
  also calls, so a new cue or a rewind updates them without extra plumbing.

### Not included
- Drag-scrubbing, keyboard seeking, seeking from the spectrogram itself
  (dragging there zooms).

**Smoke test.** `SPECTREGRAM_SMOKE=1 SPECTREGRAM_SMOKE_FILE=<track>
SPECTREGRAM_SMOKE_SEEK=1 npx electron . --user-data-dir=<temp>` analyzes the
track, hovers and clicks the ruler at 50%, plays for about 1 s, stops, and
prints the hover line, tooltip and playhead positions at each step
(`SEEK_HOVER` / `SEEK_CUED` / `SEEK_PLAYING` / `SEEK_STOPPED` / `SEEK_LEFT`).
Test-only. The separate `--user-data-dir` lets it run while another
SpectreGram window is open.

## Zoom controls

### Drag to zoom
Drag across the spectrogram to zoom into that time segment. The zoomed view is
**re-analyzed, not stretched**: the worker keeps the file's mono samples after
the full analysis and answers `zoom` requests with `computeStftSegment`
(`src/audio/stft.ts`) — about one column per canvas pixel, window centers
evenly spaced across the segment, zero-padded at the track edges.

**Minimum zoom:** 20 STFT windows (`MIN_ZOOM_WINDOWS` in `src/main.ts`,
TUNABLE) — ≈0.93 s at 44.1 kHz, ≈0.85 s at 48 kHz. Below that the 2048-sample
(~46 ms) window just smears wider.

### Ctrl+wheel zoom
Ctrl/⌘ + wheel over the spectrogram zooms in and out around the pointer, like
a map. `zoomByAt()` in `src/main.ts` handles it, with steepness controlled by
`ZOOM_WHEEL_RATE` (TUNABLE, ×1.42 per 100-unit notch, exponential so trackpad
pinch and wheel notches both feel even).

**Behavior:**
- The time under the cursor stays fixed as you zoom
- The span clamps at the 20-window minimum and at the whole track (zooming out
  past the end is Reset zoom)
- Plain wheel still pans horizontally
- Works from the full view too, so no drag is needed to start zooming
- Holding Ctrl/⌘ swaps the crosshair for a `zoom-in` magnifier (`.zoom-mod` on
  `#canvas-wrap`)

**preventDefault fix:** Both Ctrl+wheel and plain wheel call `preventDefault()`
so the browser's own page zoom never triggers (it used to in Electron and the
web demo before this was added).

### Reset zoom
Button (top-right of spectrogram) or Esc returns to the full track. The zoomed
verdict is never recomputed — it always describes the whole file. Zoom failures
post `zoom-error` (toast only) so they never clear the verdict.

### Wheel panning
Plain mouse wheel or trackpad scroll moves the zoomed view horizontally. One
request in flight; scrolling coalesces to the latest view. Frequency stays
full-range in all zoom states.

## Phase view

Spec: `.kiro/specs/phase-view/`. The dial button (`#phase-btn`, right after
the palette button) overlays **phase** on the spectrogram that is already
there: every bin keeps the palette colour for its level, and that colour's
hue is rotated by the bin's phase (up to ±63° — `PHASE_HUE_SPAN`, TUNABLE).
Brightness and saturation are untouched, so the graph still reads exactly
like the normal spectrogram — same palette ramp, same structure — with phase
showing as hue ripples across it, not as a second graph that replaces it.
It is session state like the palette, and switching repaints the grid
already in memory: no STFT, no re-analysis.

**Where the phase comes from.** `computeStft` already has `re`/`im` per bin
when it writes the magnitude, so with `withPhase` on it also writes
`phase[i] = round(((atan2(im, re) + π) / 2π) · 255)` — one byte per bin,
same row-major order as `DbGrid.data`. `computeStftSegment` takes the same
flag, so zoomed views and stacked-export strips carry phase too. The worker
asks for it on `analyze`, `zoom` and `export-bands`, never on `classify`
(the folder scan only needs the verdict), and transfers both arrays
zero-copy. The verdict path (`cutoff.ts`) never reads phase — it is
display-only, and the +1 MB per full-track grid is counted in the grid
cache budget.

**Painting.** `src/render.ts` keeps `viewMode: 'magnitude' | 'phase'` beside
the palette. The phase path builds one lookup table per palette (256 palette
steps × 256 phase steps): each palette colour is converted to HSV once, its
hue is rotated by `(phase / 255 − 0.5) × PHASE_HUE_SPAN`, and the result is
stored — so the pixel loop is still a single table lookup, and the dB key →
palette index mapping is precomputed per draw. A dark bin stays as dark as
the palette makes it, so the phase ripple never brightens quiet passages.

**Trade-off.** Because hue now carries phase, two pixels at the same level
can differ in colour — that *is* the phase information. The legend beside
the graph keeps showing the plain palette, because the level axis has not
changed (only the hue drifts), and `u`/`U`, `l`/`L`, the zoom view and both
export shapes all keep working on top of the overlay.

**Measured** on `lab/CHOCOLATE.128.mp3` (3:02, 48 kHz), 1126 × 530 current-view
export: lit pixels 378,531 → 378,353 (level structure intact to within
0.05 %), mean brightness 195 → 189, hue buckets 18 → 35 — and the number
that matters, pixels inside one narrow brightness band (0x5A–0x82) go from
**14** hue buckets to **36**: the same level now spans the whole phase
wheel. Confirmed on 1:1 crops of the two exports: the vertical structure is
identical between them, and the phase version carries magenta/pink ripple
through the orange instead of one flat hue.

**Exports in phase mode.** A **Lossless** export (see Export panel)
paints each strip at the grid's native bin height (1025 rows) instead of
the fixed 512 (`exportBandHeight` in `src/export-image.ts`), because
scaling the bin rows blends neighbouring bins into single pixels and the
blend destroys the hue-carried phase. At native height every bin row is
one pixel row, so the export is a pixel-exact copy of the segment grids
and the phase tint survives intact; Custom and current-view exports keep
the 512 strip height. The export panel's size summary quotes the same
height it will write.

## Export panel

Spec: `.kiro/specs/export-panel/` (feature-branch spec, merged to main via PR
#6). The PNG button (toolbar) or File › Export PNG… (menu, Ctrl/⌘+S) opens a
settings card instead of saving immediately.

### Export modes

**Current view** — the canvas pixels as they appear, zoom included. No
re-analysis; this is the fastest option.

**Lossless** — the whole track as data, not a picture: strips at the
grid's native bin height (1025 rows at FFT 2048) *and* its native hop
(one column per 1,024 samples, so the time axis is not compressed
either), optionally divided into 1–10 equal parts. A 3:02 track at
48 kHz is therefore 8,532 columns wide per strip, not 1,024; the part
count only cuts the stack, it does not change the total width. Width is
capped at 32,768 columns per strip (`MAX_LOSSLESS_COLUMNS`). Saved as
`<name>-lossless.png` (or `-lossless-stacked.png` when divided). With
the phase overlay on, this is the export an external decoder can read
back to audio.

**Custom** — the whole track at the 512 px display height, with two
independent controls side by side (no "split by" switch — both always apply):
- **Speed** — how wide each strip is: 1× = 1,024 columns (`BASE_COLUMNS`,
  TUNABLE, the on-screen width), "slowest" (½×) = 2,048, 2× = 512,
  3× = 341, 5× = 205 (floor 128).
- **Divide into parts** — 1–10 strips of `duration / N` each, stacked top to
  bottom in one image.

So 1 part at 1× is the old single whole-track strip, 4 parts at 1× is
`1024 × 512·4`, and 4 parts at 2× is four 512 px strips. `planExport(duration,
 speed, parts)` takes the two menu values and applies them independently;
speed only compresses the time axis inside a strip, never the strip count.

The panel's summary line always ends with the active palette ("style")
and whether the phase overlay is selected, so what the pixels carry is
stated before anything is saved.

Every strip is `computeStftSegment` at its own column count, so it carries real
detail rather than a stretched overview, in the active palette, dB range and
view mode (a stacked export in phase view is painted by phase too, with the
grey brightness legend beside it).
The worker gained an `export-bands` request that answers with all grids in one
message; `drawGridStrip()` in `src/render.ts` takes the strip width and paints
each onto the composite canvas.

### Decorations (optional, both on by default)

- **Rulers** — time ticks/labels under every strip (same ~10-label target as
  the app, scaled down on narrow strips: ~52 px per label), and evenly spaced
  frequency labels up the 58 px left gutter — one per ~48 px of strip height
  (0, 2.5, 5 … 24 kHz at 48 kHz), Nyquist always labelled
- **dB legend** — palette bar in a 44 px right column with a labelled tick
  every 20 dB (10 dB on a range of 60 dB or less), so the scale reads at a
  glance instead of top/middle/bottom only; a stacked export repeats the bar
  and its labels beside **every** strip, so each row carries its own scale

Applied to every export shape including the current view. The export is a
composed image rather than a canvas copy: `src/export-image.ts` takes either
grids or the live canvas as rows, with the layout maths pure (`exportLayout`)
and the axes/legend drawn as canvas text.

### Advanced Export toggle

Options › **Advanced Export** (checkbox menu item, on by default) decides what
the Export button and Ctrl/⌘+S do:
- **On:** opens the panel
- **Off:** saves the current view instantly (plain 1024×512 canvas copy, no
  rulers/legend, no prompt), then shows a toast

The shell sends `sg:menu-action('advanced-export', checked)` and the renderer
holds the flag (session-only).

## About card

Help › About is no longer a native message box. The shell sends `sg:about` and
the renderer shows a `.report-modal` card with the app icon on the left, text
panel on the right, cobwebs, a drifting 🦇, ghost title and pumpkin glow. The
icon column is a stretched flex item (its height = text panel height), and the
image sits on the card with `object-fit: contain` — the PNG is transparent (no
plinth, no border) and fills the full height uncropped at its natural 924:916
ratio. Close button is pinned bottom-right. Esc or the backdrop closes it and
swallows the key so it doesn't also reset zoom.

Native dialogs can't carry the app's styling, so this was built in-renderer
instead.

## Language card

Help › Language used to open a native message box saying selection would
arrive later. The shell now sends `sg:language` and the renderer shows a
`.report-modal` card in the same haunted style as About (cobwebs, pumpkin
title, translucent orange border), with the twelve available languages as a
three-column grid of radio tiles:

English (default) · Español · Français · 中文 · हिन्दी · Tiếng Việt ·
한국어 · Русский · 日本語 · العربية · Deutsch · Halloween

Each tile shows the native name with the English name underneath; the picked
tile gets the same accent tint as the export modes, and the radio input stays
focusable (arrow keys switch picks, focus ring on the tile). Picking a
language translates the interface immediately, sets `<html lang>` and
`data-language` (Halloween maps to `en`), shows a toast, and is remembered for
the session — nothing is written to disk. Esc, the backdrop or Close dismisses
the card and swallows the key so it can't also reset the zoom.

## Interface translations (`src/i18n`)

English is the source language and the default. `src/i18n/en.ts` holds every
interface string as `key: English text` (149 keys). Each other language file
exports a partial `Record<I18nKey, string>` with the same keys; a missing key
falls back to English. `src/i18n/index.ts` exposes:

- `t(key, vars)` — strings built in code (toasts, verdicts, facts, export
  summary); `{name}` placeholders are filled from `vars`.
- `setLanguage(code)` — switches the table, updates `<html lang>` and walks the
  DOM.
- `translateDom()` — matches text nodes and `title` / `aria-label` /
  `placeholder` / `alt` values against the English table and swaps them in
  place. The English original is kept in a `WeakMap`, so switching back (or to
  another language) rebuilds from the source, never from the translation.

`applyInterfaceLanguage()` in `src/main.ts` calls `setLanguage()` and then
re-renders the strings that module owns: facts, palette/phase tooltips, play
label, Scan button, export summary and the verdict. The verdict is generated,
not markup: analysis stores `cutoffHz` (and the claimed format in the cache),
and `renderVerdict()` rebuilds it with `buildVerdict()` in the new language.
The report dialog maps `report.ts`'s English rating and class names to keys.

Halloween is spooky English: same keys, English grammar. Arabic translates the
copy but keeps the LTR composition — the panels are absolutely positioned, so
a mirrored layout would break them. The saved Markdown report, the folder
loading counter, the message-fit error and the export summary's
`Spectrum style · Phase overlay on` suffix stay English.

## Packaging

electron-builder configuration lives in the `build` key of
`package.json`; output goes to `release/` (gitignored).

- `npm run pack` — unpacked app directory only (e.g.
  `release/linux-unpacked/`). Use it to smoke-test the packaged form.
- `npm run dist` — the installer for the host OS: Windows NSIS,
  macOS dmg, Linux AppImage.
- The installer registers file associations for the common audio
  extensions (mp3 / flac / wav / ogg / m4a / opus / aac / wma); opening a file
  with the app routes it through the same analysis path as drag & drop.
- App icon: `build/icon.png` — AI-generated ghost mark (white sheet ghost
  dissolving into glowing hellfire-orange spectrogram bars on black).
- Installers are **unsigned** in v1: Windows SmartScreen and macOS
  Gatekeeper warn on first launch. That's expected until signing is set
  up.
