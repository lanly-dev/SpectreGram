# SpectreGram — product context

> Source of truth for status, open decisions, and the full brief: `AGENTS.md`
> at repo root. Read it first every session. This file carries the stable
> product context Kiro sessions always need.

## What it is
SpectreGram is a desktop acoustic spectrum analyser (Electron) — a clean-room reimagining of
Spek (https://github.com/alexkay/spek). Drop an audio file in and it renders
the full-track spectrogram, estimates the true frequency cutoff, and gives a
verdict: is this file what it claims to be, or a low-bitrate file in a
lossless costume? Zoom into time segments, seek and play tracks, scan entire
folders for a collector rating, or hide spectral messages in your audio.

## The pitch (Kiroween "Resurrection")
The dead tech is file-era audio inspection (Spek and its kin). Today's
innovations: a real desktop app like the original (files never leave the
machine), with an automated verdict instead of reading the graph by eye, a
spectrogram rendered as a haunted visual centerpiece rather than a grey utility
plot, interactive exploration (time zoom, ruler seek, playback), folder
scanning with collector ratings, and spectral message embedding.

## Scope (v1)
- Drag-and-drop or pick an audio file (mp3 / flac / wav / ogg / m4a / opus /
  aac / wma supported by Electron's Chromium decoder).
- Decode with Web Audio (`decodeAudioData`); show file facts: format,
  duration, sample rate, channels.
- STFT in a Web Worker (fft.js); render the full-track spectrogram on Canvas
  2D with haunted palettes (Spectrum, Hellfire, Ectoplasm, Pumpkin).
- Cutoff estimate + verdict text, always labelled an **estimate**.
- Interactive exploration: drag to zoom into time segments (re-analyzed, not
  stretched), Ctrl/⌘+wheel zoom around pointer, plain wheel panning.
- Ruler seek: hover time ruler to preview, click to cue.
- Playback controls: Play/Pause, Stop, Back to start, Space bar shortcut.
- Folder navigation: Previous/Next file when a folder is open.
- Folder report (desktop): scan every file recursively, collector rating
  (Crypt Keeper → Costume Party Noob), save Markdown report.
- Spectral message (desktop): type or dice a phrase, generate a new WAV with
  text drawn into the spectrogram (dims the band inside letter shapes; nothing
  added), verdict-safe by construction.
- Export: advanced panel (current view, whole track compressed or stacked,
  optional rulers/dB legend) or quick export (Ctrl/⌘+S).
- Recent-file cache (memory only), idle screensaver, Halloween UI polish
  (verdict stamps, haunted empty state, ghost playhead, cobwebs).

## Non-goals (hard caps)
- This is an analyzer, not a player: no playlist, no skins system, no library
  management. Folder scan and playback stay within "drop in, judge, move on."
- No server, no uploads, no accounts. "Your files never leave your machine"
  is a feature — keep it true. (Spectral message writes a new file; the
  original is never changed.)
- No claim of proof: the cutoff heuristic can be fooled; always present the
  verdict as an estimate in UI and every write-up.

## Acceptance checks
- A genuine lossless file and a 128k-MP3-disguised-as-FLAC render visibly
  different spectrograms, and verdicts differ. ✓ (Vitest, real files)
- A 60-second track renders its full spectrogram without freezing the desktop
  app unacceptably (progress shown if slow). ✓ (worker + progress)
- PNG export opens and matches what was on screen. ✓ (canvas toBlob)
- Verdict text says "estimate" (or equivalent) everywhere it appears. ✓
  (Vitest invariant test)
- Zoom re-analyzes segments, not stretches them. ✓ (computeStftSegment)
- Folder scan judges files correctly and saves a readable report. ✓ (smoke)
- Spectral message keeps verdicts safe (won't change cutoff class). ✓ (verdict
  check + backoff)

## Deadline
Fri Dec 4, 2026, 2:00 PM PT. V1 feature-complete as of 2026-11-18.
