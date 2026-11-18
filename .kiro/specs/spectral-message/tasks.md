# Spectral Message — Tasks

Part of the `spectral-message` Kiro spec. Requirements: `./requirements.md`
· Design: `./design.md`. Branch: `feat/spectral-message`. Trail rules:
`/.kiro/steering/work-trail.md`. `npm run build` + `npm run test` green
before every commit.

1. **Text → mask + phrases** (R1, R2) — `phrases.ts`, `raster.ts`.
2. **Encoder + WAV + worker** (R2, R3, R5) — `encode.ts`, `wav.ts`,
   `embed-worker.ts`; temporary Vitest check of verdict safety, mask
   visibility, clipping and the WAV header (deleted after).
3. **Save + dialog** (R1, R4, R5, R6) — `sg:save-wav` IPC, preload, types;
   controls-row button, dialog with dice and counter, generate → save →
   open the result.
4. **Verify + document** — desktop smoke on a real track (verdicts before
   and after, PNG of the result looked at); `DEV.md` section; `AGENTS.md`
   build-log entry.

Out of scope: see `requirements.md` → Non-goals.

---

## Implementation status

- ✅ **1** — 2026-11-17. `src/message/phrases.ts`: `MAX_MESSAGE_CHARS` = 32, 18 original Halloween phrases (all ≤ 32 chars, no quotes from other works), `randomPhrase(exclude)` never repeats the phrase in the box. `src/message/raster.ts`: `rasterizeText` draws bold sans-serif at 128 px on an `OffscreenCanvas`, crops to the ink, block-averages to `MASK_ROWS` = 32 rows (aspect kept, cell = ink if ≥ 40% of its source pixels are ink); only-spaces → `cols` 0. Checked: build ✓ (typecheck), Vitest 10/10 ✓. The raster needs a real canvas, so its output is checked in the task 4 desktop run.
- ⏳ **2** — not started.
- ⏳ **3** — not started.
- ⏳ **4** — not started.
