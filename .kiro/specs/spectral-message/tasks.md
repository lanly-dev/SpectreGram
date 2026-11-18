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

5. **Comfort fix** (R3, R3a) — band to 0.46–0.66 × Nyquist, `ROW_AMP` ≈
   −44 dBFS, ~20 ms soft fades; dialog note; re-run the synthetic checks
   and the real-track smoke (verdicts + PNG); docs.

Out of scope: see `requirements.md` → Non-goals.

---

## Implementation status

- ✅ **1** — 2026-11-17. `src/message/phrases.ts`: `MAX_MESSAGE_CHARS` = 32, 18 original Halloween phrases (all ≤ 32 chars, no quotes from other works), `randomPhrase(exclude)` never repeats the phrase in the box. `src/message/raster.ts`: `rasterizeText` draws bold sans-serif at 128 px on an `OffscreenCanvas`, crops to the ink, block-averages to `MASK_ROWS` = 32 rows (aspect kept, cell = ink if ≥ 40% of its source pixels are ink); only-spaces → `cols` 0. Checked: build ✓ (typecheck), Vitest 10/10 ✓. The raster needs a real canvas, so its output is checked in the task 4 desktop run.
- ✅ **2** — 2026-11-17. `src/message/encode.ts`: band 0.22–0.50 × Nyquist, `ROW_AMP` 0.012 (≈ −38 dBFS, TUNABLE), 6 ms fades; `layoutMessage` (centered, natural aspect for the 1024×512 full view, capped at 90% of the track, ≥ 1 full-view frame per column, else null), `embedMessage` (one rotating-phasor sine per mask row, only where the row is on, random start phases, added to every channel, scaled by 0.999/peak only if it would clip). `src/message/wav.ts`: 16-bit PCM interleaved. `src/message/embed-worker.ts`. Temporary Vitest file (deleted after), 5/5 passed on brick-walled noise at 44.1 kHz: 0.70 × Nyquist "costume, ≈15.5 kHz" before and after (identical verdict); 0.92 × Nyquist "genuine lossless, ≈20.4 kHz" before and after (identical); scale 1.000 (no clipping); ink bins −39.0 dB vs no-ink −48.2 dB (+9.2 dB); fit check refuses 240 cols on a 255-frame track and accepts 200; WAV header + clamped samples exact. Timing (Node): 3-min stereo embed 285 ms + WAV 66 ms. A first run used a 0.95 × Nyquist "genuine" fixture, which read "No clear cutoff" even before embedding (too few silent bins for the P5 floor — the known fixture lesson), so it was changed to 0.92. Build ✓, Vitest 10/10 ✓.
- ✅ **3** — 2026-11-17. `sg:save-wav` IPC (binary check, native dialog in the last-opened folder, WAV filter, writes only on confirm; smoke-mode direct write), preload `saveWav`, type. Controls-row button (letter-A + sparkle icon), disabled until a spectrogram is on screen. Dialog (reuses the report-modal card): `maxlength=32` input, 🎲 (random phrase, never the current one, spin animation), live `n / 32` counter, the audibility/new-file note, **Generate & save** / **Cancel**, Esc closes; keyboard owned by the dialog while open (capture phase), typing and Enter still work. Generate: trim → raster → fit check (toast if it doesn't fit) → embed worker on channel copies → save (desktop dialog / web download) → close → open the saved WAV through `handleFile`. Build ✓ (new `embed-worker` chunk), Vitest 10/10 ✓. Real run in task 4.
- ✅ **4** — 2026-11-17. Test-only smoke `SPECTREGRAM_SMOKE_MESSAGE` (env-gated, `electron/main.js`): after the file's verdict it opens the dialog, sets the text, submits, waits for the saved WAV to reopen with its own verdict, then saves that spectrogram as a PNG. Real run on `lab/CHOCOLATE.128.mp3` (3:02, 48 kHz decode) with "TRICK OR TREAT": source verdict "Claims MP3. Cutoff ≈16.8 kHz — normal for lossy compression"; haunted `chocolate-haunted.wav` (35,037,004 bytes, 3:02, stereo) reopened as "Claims WAV. Cutoff ≈16.8 kHz — smells like a 128k MP3 in a costume", stamp COSTUME — same cutoff, and correctly flagged as lossy in a WAV. Generate → save → reopened verdict in ~2–3 s. PNG looked at: at `ROW_AMP` 0.012 (≈ −38 dBFS) the letters were faint over the loud master (only the "T" in a quiet gap stood out), so `ROW_AMP` was raised to 0.03 (≈ −30 dBFS); rerun: "TRICK OR TREAT" clearly readable across the track, cutoff still 16.8 kHz. The task 2 synthetic checks (verdict safety on the genuine fixture, +9.2 dB visibility) were run at 0.012, not re-run at 0.03; the costume case is re-confirmed at 0.03 by the real track. Docs: `DEV.md` "Spectral message", `AGENTS.md` build log. **Not verified:** how audible the tones are (needs a listener), the real save dialog (smoke writes without it), and the web download path. **Follow-up:** the maintainer listened — the result made his ears feel bad and dizzy → task 5.
- ⏳ **5** — not started.
