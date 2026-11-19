# Phase View — Design

Part of the `phase-view` Kiro spec. Requirements: `./requirements.md` · Tasks:
`./tasks.md`.

## Where the phase comes from

`computeStft` already has the complex bin (`re`, `im`) in hand when it writes
the magnitude. With `withPhase` on it also stores

```
phase[base + k] = round(((atan2(im, re) + PI) / (2 * PI)) * 255)
```

one byte per bin in the same row-major order as `DbGrid.data` (R3). Cost is one
`atan2` per bin — measured in the same pass, so the progress callback and the
frame loop are untouched — plus `frames × bins` bytes of memory (≈ 1 MB at
1024 × 1025, R5).

`computeStftSegment` takes the same flag so zoom segments and stacked-export
strips carry phase too. The worker asks for it on `analyze`, `zoom` and
`export-bands`, and does not on `classify` (the folder scan only needs the
verdict). Both byte arrays are transferred zero-copy with the grid.

## Painting (`src/render.ts`)

- `viewMode: 'magnitude' | 'phase'` is module state beside the palette, so
  `setViewMode` can repaint `lastGrid` with `lastCtx` exactly like a palette
  switch does.
- Magnitude painting is unchanged: dBFS → 4096-step LUT → palette.
- Phase painting reuses the same dB key for **brightness** and takes **hue**
  from the phase byte through a precomputed `256 hues × PHASE_LEVELS (128)`
  RGBA table, so the pixel loop stays table lookups only (no per-pixel HSV).
  Hue is a full-saturation wheel at 360° = 2π, multiplied by brightness — a
  quiet bin stays dark, a loud one is a saturated colour.
- `legendLut()` returns the palette in magnitude view and a grey 256-step ramp
  in phase view; `paintLegend` and the exported legend column both use it, so
  the legend never claims hue means level (R2).
- `hasPhaseData()` reports whether the grid on screen has phase bytes, for the
  toggle's fallback message (R4).

## Wiring (`src/main.ts`)

- A `.view-btn` icon button (`#phase-btn`) sits after the palette button in
  the controls row. Clicking it flips the mode, repaints, updates the legend
  and the button's `aria-pressed`/tooltip, and toasts what the colours now
  mean. `hasPhaseData()` is checked first, so a grid without phase explains
  itself instead of painting something misleading.
- `legend`'s `title`/`aria-label` are rewritten per mode ("hue = phase angle,
  brightness = dBFS").
- The grid cache budget now counts the phase bytes as well, so the 200 MB tier
  keeps meaning what it says.

## Exports

`drawGridStrip` paints through the same `gridToCanvas`, so stacked strips and
the composed legend follow the active mode; "current view" already copies the
live canvas. A phase-mode PNG is therefore a phase-mode picture, and the
legend beside it is the grey brightness ramp.

## Checks

- `npm run build` (tsc + vite) and the existing Vitest scope (`cutoff.ts`,
  untouched) stay green.
- Real desktop run: load a track, toggle phase, read the canvas pixels back
  (`getImageData`) and confirm hue variety and non-black coverage; toggle back
  and confirm palette colours return; zoom in while in phase view and confirm
  the zoomed grid paints phase too.

## Amendment — phase is a tint, not a replacement (2026-11-19)

`gridToCanvas` no longer swaps the palette out. In phase mode it builds one
tint table per palette, `getTintTable(palette)`: 256 palette steps × 256 phase
steps, where each palette colour is converted to HSV once and stored with its
hue rotated by `(phase / 255 − 0.5) × PHASE_HUE_SPAN` (0.35 of the hue circle,
≈ ±63°, TUNABLE), at the *same* saturation and value. The dB key → palette
index mapping (`paletteIndex[4096]`) is precomputed per draw, so the pixel loop
is `tint[(paletteIndex[key] * 256) + phaseByte]` — still one lookup.

Consequences: brightness and saturation are bit-preserved from the palette, so
the spectrogram is the same picture it always was; hue now carries phase, so
two pixels of equal level may differ in colour (that is the overlay);
`legendLut()` and the grey ramp are removed and `paintLegend` / the exported
legend column go back to the palette, which is still the level axis.

Checks for this shape: the lit-pixel count and mean brightness must stay close
to the magnitude render (structure preserved), while the hue spread inside a
single narrow brightness band must jump (phase actually displayed).

## Amendment — native-height strips for phase exports (2026-11-19)

The tint survives only while no two bin rows are blended into one pixel
row. The main canvas is fixed at 512 rows for 1025 bins, so the on-screen
graph (and any screenshot of it) blends bin pairs and the phase is lost
there — measured externally: a ground-truth simulation of the whole
pipeline (STFT → tint render → decode) recovers phase at R = 1.000 from
the native grid, but only R ≈ 0.10 after the 1025 → 512 canvas scale.
The stacked export used the same 512 strip height, so it threw the phase
away too.

`composeExportImage` now sizes grid strips through
`exportBandHeight(bins, phase)` (`src/export-image.ts`): in phase mode a
strip is painted at the grid's native bin height (1025), so
`drawGridStrip` scales 1:1 vertically and every bin row is one pixel row;
magnitude mode keeps the fixed 512. `exportLayout` takes the band height
as a parameter (the layout maths stays pure), and the export panel's size
summary in `src/main.ts` passes the same helper's result, so the quoted
pixel size matches the file. Current-view exports (a live-canvas source
row, no grid) are unchanged. At the 10-part maximum the composed image is
10 × (1025 + 18) ≈ 10.4k px tall, inside canvas limits.

A native-height phase export is therefore a pixel-exact copy of the
segment grids — an external decoder can recover magnitude + phase per bin
from it (inverse STFT per strip), which no 512-tall render allows.

## Amendment — three export types (2026-11-19)

The maintainer split the export panel into three named types:

1. **Current view** — the canvas as shown, 1024 × 512. A picture.
2. **Lossless** — the whole track as data: strips painted at the grid's
   native bin height (the native-height amendment above, now keyed to the
   export *type* instead of the view mode),    with one option: divide into parts (1–10 stacked strips; initially 1,024
   columns each — see the lossless-native amendment below). Files are named
   `<name>-lossless.png` / `<name>-lossless-stacked.png`.
3. **Custom** — the previous stacked export unchanged: 512 px strip
   height, split by speed or equal parts. A picture.

`exportBandHeight(bins, lossless)` now takes the type flag; the composer
receives the chosen band height from the caller instead of reading the
view mode. The panel's info line also states what the export will carry —
the active palette ("style") and whether the phase overlay is selected —
in every mode, so the meaning of the pixels is visible before saving.

## Amendment — custom export's two controls (2026-11-19)

The maintainer asked for the Custom type to drop the "Split by" switch and
show **speed** and **divide into parts** as two dropdowns instead, so both
are always visible and combinable. `planExport(duration, speed, parts)` now
takes both menu values: `parts` (1–10) sets the strip count, `columns` comes
from the speed multiplier alone, and `stripSeconds = duration / parts`.
Speed therefore never changes the strip count — the correction the
maintainer made when the export panel first landed stays true — and
4 parts at 2× means four 512 px strips.

`exportModeChoice()` in `src/main.ts` returns `{ mode, speed, parts }`
(lossless pins speed to 1× and reads its own parts menu); the panel summary
quotes `plan.strips`, the composed size, and the speed label. Markup: the
two `.export-row`s live in an `.export-row-pair`, each a label above a
full-width select, so "Divide into parts" fits without wrapping. Custom's
parts menu now includes 1 (one strip) because speed no longer implies it.

## Amendment — lossless keeps the time axis too (2026-11-19)

The maintainer: "for the lossless, it should not compress the horizontal
for the output." Lossless already kept the native bin height, but it still
squeezed each strip into `BASE_COLUMNS` (1,024) columns — every part was
re-analysed at 1,024 frames however long it was. It now also paints at the
analysis hop: `planLosslessExport(duration, parts, sampleRate)`
(`src/export-bands.ts`) sizes each strip with `nativeColumns(stripSeconds,
sampleRate)` = `ceil(samples / NATIVE_HOP)`, one column per 1,024-sample
hop (`NATIVE_HOP` = `DEFAULT_STFT.hopSize`). `computeStftSegment` then
picks hop = `ceil(span / columns)` ≈ 1,024, so no hop is dropped or
blended on either axis.

Consequences: lossless output is much wider — 3:02 at 48 kHz becomes
8,532 × 1,025 px per strip instead of 1,024 × 1,025 — and the part count
no longer changes the total width, only how the stack is cut. A per-strip
ceiling of 32,768 columns (`MAX_LOSSLESS_COLUMNS`) keeps very long files
buildable. Custom keeps its speed/parts semantics via `planExport`; the
lossless panel has no speed control because speed is fixed at native.
