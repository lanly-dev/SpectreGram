# SpectreGram — product context

> Source of truth for status, open decisions, and the full brief: `AGENTS.md`
> at repo root. Read it first every session. This file carries the stable
> product context Kiro sessions always need.

## What it is
SpectreGram is an in-browser acoustic spectrum analyser — a clean-room
reimagining of Spek (https://github.com/alexkay/spek). Drop an audio file in
and it renders the full-track spectrogram, estimates the true frequency
cutoff, and gives a verdict: is this file what it claims to be, or a
low-bitrate file in a lossless costume?

## The pitch (Kiroween "Resurrection")
The dead tech is file-era audio inspection (Spek and its kin). Today's
innovations: fully in-browser (no install, files never leave the device), an
automated verdict instead of reading the graph by eye, and a spectrogram
rendered as a haunted visual centerpiece rather than a grey utility plot.

## Scope (v1)
- Drag-and-drop or pick an audio file (mp3 / flac / wav / ogg / m4a as the
  browser can decode).
- Decode with Web Audio (`decodeAudioData`); show file facts: format,
  duration, sample rate, channels.
- STFT in a Web Worker (fft.js); render the full-track spectrogram on Canvas
  2D with a haunted palette (hellfire / ectoplasm).
- Cutoff estimate + verdict text, always labelled an **estimate**.
- Export the spectrogram as PNG.
- Minimal playhead preview is allowed.

## Non-goals (hard caps)
- This is an analyzer, not a player: no playlist, no skins, no library
  management.
- No server, no uploads, no accounts. "Your files never leave this tab" is a
  feature — keep it true.
- No claim of proof: the cutoff heuristic can be fooled; always present the
  verdict as an estimate in UI and every write-up.

## Acceptance checks
- A genuine lossless file and a 128k-MP3-disguised-as-FLAC render visibly
  different spectrograms, and verdicts differ.
- A 60-second track renders its full spectrogram without freezing the tab
  unacceptably (progress shown if slow).
- PNG export opens and matches what was on screen.
- Verdict text says "estimate" (or equivalent) everywhere it appears.

## Deadline
Fri Dec 4, 2026, 2:00 PM PT. This is the smallest, safest entry — be finished
early and submission-ready; resist scope growth.
