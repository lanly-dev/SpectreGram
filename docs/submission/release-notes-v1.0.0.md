# SpectreGram v1.0.0 — release notes (DRAFT)

> Draft for the maintainer to paste into the GitHub Release form. Attach:
> `release/SpectreGram Setup 1.0.0.exe` (built with `npm run dist` on Windows).

**SpectreGram** is a desktop acoustic spectrum analyser for local audio files —
a clean-room revival of the idea behind Spek, built for the Kiroween 2026
hackathon (Resurrection category). Drop in an audio file and it renders the
full-track spectrogram, estimates the true frequency cutoff, and gives a
verdict: is this "lossless" file what it claims to be, or a low-bitrate MP3 in
a lossless costume? The verdict is always an **estimate** — a heuristic, not
proof.

Everything runs on your machine. No uploads, no accounts, no network.

## Download

- **Windows (x64):** `SpectreGram Setup 1.0.0.exe` — per-user install, no
  admin rights needed.
- **No install:** the web demo runs the same code in a browser —
  WEB_DEMO_URL (fill in once the GitHub Pages deploy is live).
- macOS and Linux installers are configured (`npm run dist` on those
  platforms) but not built for this release.

## First run: the app is unsigned

The installer is not code-signed, so Windows SmartScreen may show
"Windows protected your PC". Click **More info → Run anyway** to install.
Only do this for a file you downloaded from this repository's Releases page.

## What it does

- Opens MP3, FLAC, WAV, OGG, M4A and other formats the built-in Chromium
  decoder supports (drag-and-drop, File › Open, or File › Open Folder).
- Full-track spectrogram with a dBFS color scale; the range is adjustable
  with `u`/`U` and `l`/`L`.
- Cutoff estimate and verdict line, with a GENUINE / COSTUME stamp.
- Drag across the graph to zoom into a time segment (re-analysed at full
  detail); scroll to pan; Esc to reset.
- Palettes (Spectrum, Hellfire, Ectoplasm, Pumpkin), PNG export, playback
  with a playhead.

## Known limits

- The verdict can be fooled: genuinely band-limited recordings, quiet
  masters, or resampled files can read as suspicious. Treat it as an
  estimate.
- Supported formats are whatever Chromium's decoder handles; there is no
  FFmpeg.

MIT licensed. Spek (GPL-3.0) inspired the idea; none of its code is used.
