# Spectral Message — Design

Part of the `spectral-message` Kiro spec. Requirements: `./requirements.md`
· Tasks: `./tasks.md`.

## How text becomes sound

A spectrogram plots time left→right and frequency bottom→top. To make a
pixel bright at (time t, frequency f), play a sine at f during t. So:

1. **Raster** (`src/message/raster.ts`, main thread, needs a canvas): draw
   the text in bold sans-serif on an `OffscreenCanvas`, crop to the ink,
   scale to `ROWS` = 32 rows high (width keeps the aspect), threshold to a
   0/1 mask `rows × cols`. Row 0 is the top of the text.
2. **Layout** (`src/message/encode.ts`, pure): the band is
   `[0.46, 0.66] × Nyquist` (R3, R3a; was `[0.22, 0.50]` before the
   listening complaint). In the full-track view (≈ `FIXED_W` 1024
   × `FIXED_H` 512 px, linear 0…Nyquist), the band is `0.20 × 512` px
   tall, so natural text width in px = `cols × bandPx / ROWS`. The message
   is centered in time, width = min(natural, 90% of the view), so short
   messages keep their shape and long ones are squeezed. Row r gets
   frequency `fHi − r × (fHi − fLo) / (ROWS − 1)`.
3. **Fit check** (R5): each text column must cover at least one frame of
   the full-track STFT (`stftParamsFor`), otherwise thin strokes fall
   between frames and vanish. If `cols > 0.9 × fullViewFrames`, refuse.
4. **Synthesis** (`encode.ts`, run in a worker): for each row, a sine of
   amplitude `ROW_AMP` (TUNABLE; history: −38 dBFS planned, raised to −30
   dBFS in task 4 for readability in the old 5–12 kHz band, which made it
   unpleasant to listen to; now ≈ −44 dBFS in the higher band, R3a) whose
   gain follows that row of the mask over time, with `RAMP_SEC` (≈ 20 ms,
   up from 6 ms) raised-cosine fades at every on/off edge (no clicks → no
   broadband splatter, R3; soft swells instead of stutter, R3a). Each sine has a
   random start phase so the rows don't add up in phase. Rows are generated
   with a rotating phasor (2 multiplies per sample) and only where the row
   is on. The message signal is added to every channel; if the mix would
   clip, everything is scaled by `0.999 / peak`.
   **Superseded by R3b (2026-11-17):** steady tones are removed; step 4 is
   now one of three styles (`MessageStyle`), all writing into the same
   message buffer:
   - **hiss** — overlap-add noise synthesis: 2048-point frames every 512
     samples; each frame's spectrum has random-phase bins of equal
     magnitude wherever the current column's mask row is on (band bins
     only), inverse FFT (`fft.js`), periodic-Hann window, overlap-add.
     The 75% overlap crossfades columns over ~40 ms, so no clicks.
   - **warble** — ⌈ROWS/2⌉ oscillators, each covering two mask rows (on if
     either is), pitch wobbling ± one row spacing at a random 3–6 Hz rate;
     raised-cosine fades at run edges.
   - **sparkle** — per "on" cell, ~12 grains per second of column time (≥ 1)
     at random times, pitch jittered ± half a row, 60 ms Hann envelopes.
   Then a ~1 s raised-cosine fade over the whole message (≤ 10% of it),
   per R3b. Per-style levels are TUNABLE and set to similar visibility in
   the temporary check.

   **Superseded by R3c (2026-11-17):** only **sparkle** remains (hiss and
   warble removed). Blend calibration: the channels are mixed to mono and
   three 2048-point Hann frames are analyzed per mask column (start,
   middle, end of its span) — only the band bins, with the analyzer's
   normalization (`2 / windowSum`). The background for cell (row, column)
   is the median magnitude over that row's bins in those frames, smoothed
   over ±2 columns in dB. Grain amplitude = background × `BLEND_MARGIN_DB`,
   clamped to [`SPARKLE_MIN_AMP`, `SPARKLE_MAX_AMP`]. Grains are 80 ms
   (was 60 ms) Hann envelopes. All TUNABLE.
5. **WAV** (`src/message/wav.ts`, pure): 16-bit PCM, little-endian,
   interleaved, standard 44-byte header.

## Components

- `src/message/phrases.ts` — the dice list (≤ 32 chars each, original
  wording) and `randomPhrase(exclude)`.
- `src/message/raster.ts` — `rasterizeText(text): TextMask`.
- `src/message/encode.ts` — `layoutMessage`, `messageFits`,
  `embedMessage(channels, sampleRate, mask) → peakScale`.
- `src/message/wav.ts` — `encodeWav16(channels, sampleRate): ArrayBuffer`.
- `src/message/embed-worker.ts` — receives channel copies + mask, runs
  `embedMessage` + `encodeWav16`, transfers the WAV bytes back. Locked
  Vite module-worker syntax.
- `electron/main.js` + preload + types — `sg:save-wav(bytes, name)`: native
  save dialog, WAV filter, writes only on confirm; smoke-mode direct write
  like the PNG save.
- `src/main.ts`, `index.html`, `src/style.css` — controls-row button
  (enabled once a track is loaded), the dialog (input `maxlength=32`, 🎲,
  counter, note, **Generate & save**, **Cancel**, Esc), keyboard owned by
  the dialog while open (capture phase, like the report modal), save, then
  open the saved file through the normal `handleFile` path.

## Verification

- Build + Vitest 10/10 before each commit. Vitest's locked scope is
  `cutoff.ts`, so the encoder is checked with a **temporary** test, deleted
  after: (a) verdict safety — synthetic lossy-shaped noise (band-limited to
  0.70 × Nyquist) stays "costume" and full-band noise stays "genuine" after
  embedding; (b) the mask is visible — STFT bins under "on" pixels are
  louder than under "off" pixels; (c) no NaN, no clipping; (d) WAV header
  fields correct.
- Desktop smoke (env-gated, test-only): open a real track, haunt it with a
  phrase, save via the smoke path, reopen the result, print verdicts before
  and after, and export its spectrogram PNG to look at the text.

## Risks

- **Audibility:** the tones are in the audible range by design (R3). The
  level is TUNABLE; the dialog says so.
- **Visibility vs. loud music:** busy mid-highs can mask the text. Tuned on
  a real track in the smoke check.
- **Memory:** a decoded channel copy plus the WAV (a 7-min 48 kHz stereo
  track ≈ 160 MB of floats + 80 MB WAV) for the duration of one generate.
