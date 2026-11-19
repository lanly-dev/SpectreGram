# Phase View — Tasks

Part of the `phase-view` Kiro spec. Requirements: `./requirements.md` ·
Design: `./design.md`.

- ✅ **1** — 2026-11-19. STFT: `DbGrid.phase` (one byte per bin,
  `atan2` → 0..255), `computeStft(..., withPhase)` and
  `computeStftSegment(..., withPhase)`; the empty-grid path carries no phase.
  Worker: `analyze`, `zoom` and `export-bands` request phase and transfer both
  byte arrays zero-copy; `classify` does not. Verdict path untouched.
- ✅ **2** — 2026-11-19. Renderer: `ViewMode` state, `setViewMode` /
  `getViewMode` / `hasPhaseData`, a 256 × 128 hue×brightness table for the
  phase pixels (magnitude path unchanged), `legendLut()` grey ramp for the
  legend in phase view, `paintLegend` using it.
- ✅ **3** — 2026-11-19. UI: `#phase-btn` (`.view-btn`) after the palette
  button, click flips the mode with a toast, `aria-pressed` + lit styling +
  tooltip, legend `title`/`aria-label` rewritten per mode, grid cache budget
  counts phase bytes, exported legend column follows the mode.
- ✅ **4** — 2026-11-19. Verified: `npm run build` ✓, Vitest 10/10 ✓; real
  desktop run toggling the button (canvas pixels read back), zoom while in
  phase view, and a stacked export in phase mode. Docs (`DEV.md`) and build
  log (`AGENTS.md`) updated in the same change.

- ✅ **5** — 2026-11-19, maintainer's follow-up ("phase right in the
  spectrogram, not a separate graph"). Spec R1/R2 amended first. Rendering
  changed from a phase-only hue/brightness picture to a **tint**: the palette
  colour for the level with its hue rotated by the bin's phase
  (`getTintTable`, 256 × 256 per palette, `PHASE_HUE_SPAN` 0.35 ≈ ±63°);
  brightness/saturation preserved, grey legend ramp and `legendLut()` removed
  so the legend shows the palette again. Button/tooltip/toasts rewritten as
  "Phase overlay". Verified: build ✓, Vitest 10/10 ✓; 1126 × 530 current-view
  exports of `lab/CHOCOLATE.128.mp3` with the overlay off and on — lit pixels
  378,531 → 378,353, mean brightness 195 → 189, hue buckets 18 → 35,
  same-level brightness band 14 → 36 hue buckets, and 1:1 crops of the two
  exports show identical structure with magenta/pink phase ripple in the
  orange.
