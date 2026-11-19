# Phase View — Requirements

Part of the `phase-view` Kiro spec (spec-first: written before the
implementation). Parent context: `AGENTS.md` (source of truth) and
`/.kiro/steering/` (stack, product, work-trail rules).

### Goal

Let the graph show **phase** as well as level. The spectrogram's colours
currently answer "how loud is this bin?"; phase — where each bin sits in its
cycle — is information the analyzer already computes and then throws away.
Visualising it turns the graph into a second reading of the same audio: steady
tones show as smooth hue sweeps, noise as confetti, and encoded/altered audio
shows phase changes the magnitude plot hides.

The maintainer's ask: *"implement phase visulize into graph"*.

### Requirements

- **R1 — Phase view mode.** A toggle in the controls row switches the graph
  between **spectrum colours** (today's palette; colour = dBFS level, the
  default) and **phase view** (hue = the bin's phase angle, brightness = its
  dBFS level). The button shows which mode is on (`aria-pressed`, lit styling,
  a tooltip that names the other mode), and the switch repaints from the grid
  already in memory — the STFT is never re-run just to change view.
- **R2 — Level still reads.** Brightness keeps following the display range, so
  the u/U and l/L range keys, the zoom view and the dB legend keep working in
  phase view. Because hue no longer means level there, the legend bar becomes
  a grey brightness ramp and its tooltip/aria-label say "hue = phase angle".
- **R3 — Data, not a recompute.** The STFT gains one byte per bin
  (`-pi..pi` → `0..255`), carried with the grid through the worker for the
  full-track analysis, zoom segments and stacked-export strips. The folder
  scan (verdict only) does not compute it. No change to `cutoff.ts`, its
  thresholds or verdict wording: the phase bytes are display-only.
- **R4 — Everywhere the graph is painted.** Zoomed views, the reset-zoom
  redraw, the palette switch and both export shapes honour the active mode, so
  a phase screenshot/PNG is what the user saw. Grids with no phase bytes fall
  back to the palette colours and the toggle says why instead of pretending.
- **R5 — Cost stays small.** One byte per bin (≈ 1 MB for a full-track grid),
  computed in the same pass as the magnitudes, transferred with the grid, and
  counted in the grid cache budget. Switching modes is a repaint, not an
  analysis.

### Non-goals

- No change to the verdict, the cutoff estimate, or any analysis threshold.
- No unwrapped/instantaneous-frequency ("phase vocoder") view, no stereo
  phase-correlation meter, no per-bin phase editing.
- No new palette entries or theme work; phase hues are a fixed wheel.
- No settings persistence: the mode is session state, like the palette.

### Amendment — phase goes *into* the spectrogram (2026-11-19)

The maintainer's follow-up: *"I want to add phase right in the the spectorgram
not seperate graph."* The first implementation painted a phase-only picture
(hue = phase, brightness = level), which reads as a different graph. R1 and
R2 are therefore restated:

- **R1 (restated) — Phase overlay in the same graph.** Phase is painted *into*
  the spectrogram that is already on screen: every bin keeps the palette
  colour for its level, and only that colour's **hue** is rotated by the bin's
  phase (a bounded span, `PHASE_HUE_SPAN`). Brightness and saturation are
  untouched, so the familiar palette ramp and the graph's structure survive
  and phase shows as hue ripples across it. The dial button still toggles the
  overlay on and off, and switching is a repaint of the grid in memory.
- **R2 (restated) — Level still reads, legend unchanged.** Brightness still
  follows the display range, so `u`/`U`, `l`/`L`, the zoom view and both
  export shapes keep working; the legend keeps showing the plain palette bar,
  because only the hue has been shifted. The tooltip/aria-label say that hue
  drifts with phase.
- Everything else in R3–R5 is unchanged: same phase bytes, same worker paths,
  same cost, verdict untouched.

*(The earlier "grey brightness ramp" legend and the phase-only hue wheel are
dropped: with the tint they would describe a graph that no longer exists.)*
