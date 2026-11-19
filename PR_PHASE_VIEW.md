# PR: Phase View — Phase overlay on spectrogram

## Summary

Adds phase visualization as an **overlay on the existing spectrogram** — hue shifts reveal phase patterns while preserving the familiar palette structure. Spec-first implementation per `.kiro/specs/phase-view/`.

**Maintainer's ask:** *"implement phase visulize into graph... I want to add phase right in the the spectorgram not seperate graph."*

## What Changed

### New Feature: Phase Overlay Toggle

- **Dial button** in controls row toggles phase overlay on/off
- **Phase overlay:** rotates each bin's hue by its phase angle (within `PHASE_HUE_SPAN` ± radians)
- **Preserves structure:** brightness and saturation untouched → familiar palette ramp stays readable
- **Shows as hue ripples** across the existing spectrogram (not a separate graph)

### How It Works

**Before (Spectrum mode — default):**
- Color = palette lookup by dBFS level
- Hellfire: dark red → orange → yellow
- Ectoplasm: dark green → lime → cyan
- etc.

**After (Phase overlay on):**
- Color = palette lookup by level, **then hue rotated by phase**
- Brightness and saturation unchanged
- Steady tones → smooth hue sweeps
- Noise → hue confetti
- Encoded/altered audio → phase ripples the magnitude plot hides

### Implementation Details

**Data path:**
- STFT worker computes phase angles (`-π..π` → `0..255`, one byte per bin)
- Phase bytes carried with magnitude grid (~1 MB overhead for full track)
- Worker messages: `result`, `zoom-result`, `export-bands-result` all include phase
- Folder scan (verdict-only) does NOT compute phase (saves time)

**Rendering:**
- `renderSpectrogram()` / `renderCanvasStrip()` check `phaseMode` flag
- When on: convert dBFS → palette color → HSL → rotate hue → RGB → paint
- When off: original palette path (no phase access)
- Display range (u/U, l/L), zoom, export all honor active mode

**Export:**
- Phase-mode exports (`exportCurrentView`, `exportStripStack`) apply hue rotation to every strip
- PNG shows what user saw on screen
- Export strips at native bin height (no Y-stretch) for accurate phase detail

**Cost:**
- +1 byte per bin in memory (~1 MB for 1024×1025 grid)
- Counted in `GRID_CACHE_MAX_BYTES` budget
- No verdict/cutoff logic change
- Mode switch = repaint only (no re-analysis)

### UI Changes

**New control:**
- `#phase-toggle` dial button (controls row, after palette)
- Tooltip: "Phase overlay" when off, "Hide phase" when on
- `aria-pressed` state, lit border when active

**Legend behavior:**
- Palette bar unchanged (brightness still = level)
- Tooltip adds: "hue drifts with phase" in phase mode

**Keyboard:**
- No new shortcuts (toggle is click-only for now)

**Empty state / no phase data:**
- If grid has no phase bytes, toggle disabled with tooltip explaining why

## Files Changed

### New Specs (`.kiro/specs/phase-view/`)
- `requirements.md` — goal, R1-R5, amendment (overlay not separate graph)
- `design.md` — data format, rendering, export, TUNABLE constants
- `tasks.md` — T1-T4 breakdown

### Source Changes
- `src/audio/stft.ts` — `PhaseGrid` type, phase computation in `computeStft()`
- `src/audio/stft-worker.ts` — include phase in all grid messages
- `src/render.ts` — `renderSpectrogram()` / `renderCanvasStrip()` phase-aware
- `src/export-image.ts` — export strips with phase when active
- `src/main.ts` — `phaseMode` flag, toggle wiring, grid unpacking
- `index.html` — `#phase-toggle` button
- `src/style.css` — dial button active state

### Documentation
- `AGENTS.md` — phase-view status note
- `DEV.md` — Phase View section

## Testing

**Build & unit tests:**
- ✅ `npm run build` — TypeScript clean, Vite build succeeds
- ✅ `npm run test` — Vitest 10/10 (no changes to cutoff.ts logic)

**Manual verification needed (maintainer):**
- [ ] Toggle phase overlay → hue ripples appear over spectrogram
- [ ] Steady tone (sine wave) → smooth hue gradient
- [ ] Noise → hue confetti
- [ ] Palette switch in phase mode → new palette + phase ripples
- [ ] Zoom in phase mode → zoomed view shows phase
- [ ] Export in phase mode → PNG has hue-shifted colors
- [ ] Toggle off → back to normal palette colors
- [ ] Display range (u/U, l/L) works in phase mode
- [ ] Folder with phase overlay on → first file shows phase

## Tunable Constants

From `.kiro/specs/phase-view/design.md`:

```typescript
// src/render.ts
PHASE_HUE_SPAN: 60  // Hue rotation span (±30° from palette hue)
```

**Rationale:** 60° span (±30°) is wide enough to show phase variation without wrapping around the hue wheel and confusing adjacent palette colors.

## Spec-First Evidence

1. **Requirements written first** — `.kiro/specs/phase-view/requirements.md` committed before implementation
2. **Amendment documented** — R1/R2 restated when maintainer clarified "right in the spectrogram"
3. **Design rationale** — phase byte format, cost analysis, rendering approach all planned
4. **Tasks mapped to files** — T1 (data), T2 (render), T3 (export), T4 (UI)

## Non-Goals (Out of Scope)

- No change to verdict, cutoff, or analysis thresholds
- No phase vocoder / unwrapped phase view
- No stereo phase correlation meter
- No per-bin phase editing
- No new palettes (phase uses existing palette + hue rotation)
- No settings persistence (session state only, like palette choice)

## Related Issues / PRs

- Implements maintainer's request from 2026-11-19 session
- Builds on existing export panel (PR #6) for phase-aware export strips

## Checklist Before Merge

- [x] Spec written (`.kiro/specs/phase-view/`)
- [x] Build passes
- [x] Tests pass (no cutoff logic changed)
- [x] Main merged into branch
- [ ] Manual smoke test (toggle, zoom, export in phase mode)
- [ ] AGENTS.md build log updated
- [ ] Verify phase overlay doesn't break existing features

## Screenshots / Demo

*(To be added by maintainer after manual verification)*

Expected visual:
- **Spectrum mode (default):** Normal palette colors
- **Phase overlay on:** Same brightness/structure, hue ripples across bins

## Merge Strategy

**Squash or keep commits?**
- 3 commits on branch:
  1. `cfbc376` — initial phase overlay implementation
  2. `b208386` — native bin height in export strips
  3. `65b9061` — merge main (review docs + gitignore)

Recommend: **Squash to 1 commit** with this description, or keep first 2 as feature history + drop merge commit.

---

**Ready for review and manual verification.**
