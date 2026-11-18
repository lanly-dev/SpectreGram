# Ruler Seek — Requirements

Part of the `ruler-seek` Kiro spec (spec-first: committed on branch
`feat/ruler-seek` before any implementation). Parent context: `AGENTS.md`
(source of truth) and `/.kiro/steering/`.

### Goal

Let the user pick where playback starts by pointing at the time ruler under
the spectrogram: hovering previews the spot, clicking moves the playhead
there, and Play starts from it. Today playback always starts at 0:00.

### Requirements

- **R1 — Hover preview.** With a track loaded, moving the pointer over the
  bottom time ruler draws a vertical line across the spectrogram at that
  time, distinct from the playhead: crimson, with a 🧛 (Dracula) on top
  (the playhead keeps its white line and 👻). A small tooltip beside the
  cursor shows the time at that spot. Leaving the ruler hides both. The
  ruler maps to the visible range, so it works while zoomed.
- **R2 — Click to cue.** Clicking the ruler sets the start position there
  and moves the playhead (white line, 👻) to it, shown even while stopped.
- **R3 — Play from the cue.** Play starts at the cued position. Clicking
  the ruler while playing jumps playback there. Stop returns the playhead
  to the cue. When the track plays to the end, the cue resets to 0:00.
- **R4 — Reset.** Opening another file resets the cue to 0:00 and hides the
  playhead. Zooming keeps the cued playhead at its time (hidden when it's
  outside the view).
- **R5 — Analyzer untouched.** No change to analysis, verdicts or the PNG
  export (the lines are overlays, not drawn into the canvas).

### Non-goals

- No scrubbing while dragging, no keyboard seeking, no loop regions.
- No seeking from the spectrogram itself (dragging there zooms).
