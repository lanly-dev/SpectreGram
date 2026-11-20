# SpectreGram 👻

A desktop acoustic spectrum analyser built with Electron — a clean-room
reimagining of [Spek](https://github.com/alexkay/spek) for the file-era audio
inspector who refused to move on. Drop an audio file; get the full-track
spectrogram, an estimate of the true frequency cutoff, and a verdict: is this
file what it claims to be, or a 128k MP3 in a lossless costume? Zoom into time
segments, scan folders, play tracks, or hide spectral messages in your audio.

The Electron desktop app is the only shipped product. The Vite renderer build
is packaged locally and is not deployed as a hosted web app.

Built for **Kiroween 2026** — the *Resurrection* category.

## The resurrection
Spek was the audiophile's x-ray: a desktop tool that showed you whether your
"lossless" download was actually a transcoded MP3. Streaming killed the
local-library world that needed it, and desktop installers got hard to
justify. SpectreGram brings the idea back, reimagined:

- **A real desktop app again** — Electron shell, open-with file routing,
  native save dialog. Your files never leave your machine.
- **An automated verdict**, not a graph you squint at.
- **A haunted spectrogram** as the visual centerpiece, not a grey utility plot.
- **Interactive exploration** — zoom into time segments with drag or Ctrl+wheel,
  seek and play tracks, scan entire folders.
- **Spectral messages** — hide text in your audio's spectrogram (output only;
  read-only toward your files).

> **Clean-room reimplementation.** Spek is GPL-3.0; SpectreGram is MIT. No Spek
> code is used — only the idea. See `.kiro/steering/build-conventions.md`.

## Features

**Analysis**
- Drop or open audio files (mp3, flac, wav, ogg, m4a, opus, aac, wma)
- Full-track spectrogram rendered on Canvas 2D with haunted palettes (Spectrum, Hellfire, Ectoplasm, Pumpkin)
- Automated frequency cutoff estimate and verdict: genuine, costume (fake lossless), inconclusive, or lossy
- File facts: format, duration, sample rate, channels

**Exploration**
- Drag across the spectrogram to zoom into time segments (re-analyzed, not stretched)
- Ctrl/⌘ + wheel to zoom in/out around the pointer, like a map
- Plain wheel or trackpad to pan horizontally while zoomed
- Hover the time ruler to preview a position; click to cue
- Crosshair shows time + frequency under the cursor

**Playback**
- Play/Pause, Stop, Back to start controls
- Space bar to play/pause
- Seek by clicking the time ruler
- Previous/Next file navigation when a folder is open

**Folder report** (desktop only)
- Open a folder, click Scan to judge every audio file recursively
- Collector rating (Crypt Keeper → Costume Party Noob) based on fake-lossless share
- Save a Markdown report with per-file verdicts

**Spectral message** (desktop only)
- Haunt button: type up to 32 characters or 🎲 dice a Halloween phrase
- Generates a new WAV with the text drawn into its spectrogram (dims the band inside letter shapes; nothing added)
- Original file is never changed
- Verdict-safe: automatically backs off or refuses if the cutoff class would change

**Export**
- Advanced panel: export current view, whole track (compressed or stacked strips), with optional rulers and dB legend
- Quick export: Ctrl/⌘+S or File › Export PNG saves the current view instantly when Advanced Export is off

**Polish**
- Recent-file cache: reopening a file this session is instant (memory only, nothing written to disk)
- Idle screensaver (60s): animated ghost + spectrogram particles
- Halloween verdict stamps (👻 GENUINE / 🎃 COSTUME chips with glow)
- Haunted empty state (floating ghost + fog over the canvas)
- Ghost playhead, cobweb corners, themed About card

## Kiro signature — built spec-first with Kiro
This project is built Kiro spec-first: requirements and design land in `/.kiro`
before implementation code.

- `/.kiro/specs/` — feature specs (spectregram core, electron-shell, folder-report, spectral-message, ruler-seek, export-panel, submission-readiness)
- `/.kiro/steering/` — always-on project context and locked conventions
- `/.kiro/hooks/` — agent automation
- `AGENTS.md` — project source of truth (read first every session)
- `DEV.md` — development guide (scripts, dev loops, build, test, packaging)
- `LICENSE` — MIT

## Stack
Vite + TypeScript (vanilla, no framework) · Canvas 2D · Web Audio
`decodeAudioData` · STFT in a Web Worker · `fft.js` · Vitest · Electron +
electron-builder for the desktop shell. Full locked requirements in
`AGENTS.md`.

## Run it

```sh
npm install
npm run dev     # launch the desktop app (dev loop with hot reload)
```

Release installers are unsigned in v1 — Windows SmartScreen / macOS
Gatekeeper will warn on first launch; that's expected.

**Developing on this repo?** Run scripts, dev loops, build, test, and
packaging details live in [DEV.md](./DEV.md).

## Status

Functional and feature-complete for v1. Core features implemented and verified:
- Analysis pipeline: decode → STFT (Web Worker, fft.js) → cutoff/verdict → Canvas render
- Desktop shell (Electron): window + `app://` protocol, preload bridge, native save dialogs, open-with routing
- Interactive exploration: time zoom (drag + Ctrl+wheel), ruler seek, playback controls
- Folder scanning with collector rating and Markdown reports
- Spectral message embedding (text → WAV with dimmed-band letters)
- Advanced export panel (current view, whole track compressed or stacked, with decorations)
- Recent-file cache, idle screensaver, Halloween UI polish

Windows is built and tested locally. Linux and macOS builds come from GitHub Actions and have not been launched by the maintainer. Build + Vitest green.
Installers are unsigned (SmartScreen/Gatekeeper warnings expected on first launch).

See `AGENTS.md` for the full build log, open decisions, and acceptance status.

## Future work

- **Smaller download.** The desktop build is large because Electron bundles a full
  browser (the portable exe is about 112 MB, about 366 MB unpacked). Trimming unused
  language packs would save roughly 45 MB unpacked. A port of the same web code to a
  system-web-view shell such as Neutralino or Tauri could bring it to a few MB, but it
  needs the native menus, dialogs and folder scan rewritten and the web view's audio
  decoding and worker support checked first.
- **Broader calibration.** The cutoff thresholds are heuristic estimates, tested with
  synthetic fixtures and several real lossy files. Calibration against a labelled
  genuine/lossy corpus remains future work, and ambiguous results stay inconclusive.
- **Signed builds.** The installers are unsigned, so SmartScreen and Gatekeeper warn.
## License
MIT — see [LICENSE](./LICENSE). Spek is GPL-3.0 and is **not** a dependency of
this codebase; only its concept is referenced.
