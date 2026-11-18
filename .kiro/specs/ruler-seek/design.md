# Ruler Seek — Design

Part of the `ruler-seek` Kiro spec. Requirements: `./requirements.md` ·
Tasks: `./tasks.md`.

## Mapping

`#ruler-bottom` and `#canvas-wrap` share their left/right edges (also with
the folder panel open), so a pointer's fraction across the ruler is the same
fraction across the spectrogram: `frac = (clientX − ruler.left) / ruler.width`
(clamped 0…1), `t = view.start + frac × (view.end − view.start)` using the
existing `viewRange()` (zoom-aware). The hover line sits at
`frac × wrap.clientWidth`.

## Pieces (`src/main.ts`, `index.html`, `src/style.css`)

- The ruler becomes interactive only with a spectrogram on screen (class
  `seekable` → `pointer-events: auto`, `cursor: pointer`); otherwise it
  stays inert like today.
- `#seek-hover` (inside `#canvas-wrap`): 2 px crimson line with a glow and
  a 🧛 rider at the top, `pointer-events: none`, hidden by default.
- `#seek-tooltip` (inside `#spectrogram-box`, above the ruler, beside the
  cursor, clamped inside the box): the time via `fmtTime`, with the same
  precision rule as the crosshair readout.
- State: `cueSec` (0 by default).
  - Click → `cueSec = t`; if playing, restart playback at `t`; else show
    the playhead at `t`.
  - `startPlayback` → `source.start(0, offset)` with `offset = cueSec`
    (0 if within 50 ms of the end), and `playStartCtxTime = now − offset`,
    so the existing `elapsed` is the position in the track.
  - `stopPlayback(reason)` → `'end'` (track finished) resets `cueSec` to 0
    and hides the playhead; a user Stop puts the playhead back at the cue
    (hidden at 0:00). `handleFile` resets `cueSec` before loading.
  - `applyView` (zoom) re-places the stopped, cued playhead.

## Verification

Build + Vitest 10/10. Desktop smoke (test-only, env-gated, separate
`--user-data-dir`): open a real track, dispatch pointer events on the ruler
at 50% → hover line at ~50% and tooltip ≈ half the duration; click →
playhead at the same x and visible while stopped; Play → after ~1 s the
position is ≈ cue + 1 s; Stop → playhead back at the cue.
