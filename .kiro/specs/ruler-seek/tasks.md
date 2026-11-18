# Ruler Seek — Tasks

Part of the `ruler-seek` Kiro spec. Requirements: `./requirements.md` ·
Design: `./design.md`. Branch: `feat/ruler-seek`. Trail rules:
`/.kiro/steering/work-trail.md`. `npm run build` + `npm run test` green
before every commit.

1. **Hover + cue + play from cue** (R1–R5) — seekable ruler, `#seek-hover`
   (crimson + 🧛), `#seek-tooltip`, `cueSec`, play/stop/end/zoom/new-file
   rules; desktop smoke; docs.

Out of scope: see `requirements.md` → Non-goals.

---

## Implementation status

- ✅ **1** — 2026-11-17. Build ✓, Vitest 10/10 ✓. Desktop smoke
  (`SPECTREGRAM_SMOKE_SEEK=1`, 3:02 MP3, 537 px canvas): hover at 50% →
  `#seek-hover` at 268.5 px, tooltip "1:31.2"; click → stopped playhead at
  268.5 px; Play ~1 s → 271.5 px (≈ 1.0 s past the cue); Stop → 268.5 px;
  pointerleave → line and tooltip hidden. Not verified: real mouse feel and
  on-screen look, seek while zoomed, re-cue while playing (code paths only).
