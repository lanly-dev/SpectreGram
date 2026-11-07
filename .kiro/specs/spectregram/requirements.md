# SpectreGram — Requirements (spec-first)

> Spec status: **Requirements (draft)** — `design.md` and `tasks.md` follow in
> the Kiro spec session. Decisions below are locked in `AGENTS.md`
> (2026-11-06); threshold calibration is an open decision (#3 in AGENTS.md).

Feature: SpectreGram — in-browser acoustic spectrum analyser and
lossy-disguise detector.

## 1. File intake
- **Requirement:** The user can provide an audio file by drag-and-drop onto
  the page or via a file picker.
- **Acceptance:** mp3, flac, wav, ogg, m4a open and decode when the browser
  supports them; unsupported files show a clear, non-crashing message.
- **Privacy:** the file is read locally and never uploaded; no network request
  carries file data.

## 2. Decode & file facts
- **Requirement:** Decode the file with Web Audio `decodeAudioData` and display
  a file facts panel: format, duration, sample rate, channels (as reported by
  the decode).
- **Acceptance:** facts render for any file that decodes; a decode failure is
  shown without freezing the tab.

## 3. STFT analysis (Web Worker)
- **Requirement:** Compute the STFT in a Web Worker using `fft.js`; post
  progress to the main thread as it works.
- **Acceptance:** a 60-second track renders its full spectrogram without
  freezing the tab unacceptably; progress is visible when the work is slow.

## 4. Spectrogram render
- **Requirement:** Render the full-track spectrogram on a Canvas 2D from the
  worker's magnitude grid, using a haunted color palette. Provide hellfire and
  ectoplasm palettes as view settings.
- **Acceptance:** a genuine lossless file and a 128k-MP3-disguised-as-FLAC
  render visibly different spectrograms.

## 5. Cutoff estimate & verdict
- **Requirement:** Estimate the highest frequency with sustained energy and
  produce a verdict line (e.g., "Claims FLAC. Cutoff ≈16 kHz — smells like a
  128k MP3 in a costume.").
- **Acceptance:** the verdict is always labelled an **estimate** everywhere it
  appears (UI and write-ups); the genuine vs fake test pair yields different
  verdicts.
- **Open:** cutoff threshold strictness — calibrate on real files before
  locking (AGENTS.md open decision #3).

## 6. PNG export
- **Requirement:** Export the on-screen spectrogram as a PNG that the user can
  open/save.
- **Acceptance:** the exported PNG matches what was on screen.

## 7. Minimal playhead (optional)
- **Requirement:** A minimal playhead may sync over the spectrogram during
  playback.
- **Guardrail:** this stays an analyzer, not a player — no playlist, no skins,
  no library.

## Non-goals
- No server, uploads, accounts, playlist, skins, or library management.
- No claim of proof: the cutoff heuristic can be fooled; verdict is always an
  estimate.
- No FFmpeg.wasm, no framework, no WebGL/Three.js (see build conventions).

## Out of scope for v1
- e2e test suite (Vitest covers `cutoff.ts` only).
- Server-side anything.
