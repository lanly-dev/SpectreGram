# Devpost description — DRAFT

> Draft for the maintainer. Paste into the Devpost "text description" field after
> editing. Category: **Resurrection**. Nothing here has been submitted.

## SpectreGram — an x-ray for "lossless" audio files

**Resurrection:** the dead technology is file-era audio inspection. Spek was the
audiophile's x-ray: a desktop tool that showed whether a "lossless" download was
really a transcoded MP3. Streaming killed the local-library world that needed it.
SpectreGram brings the idea back as a desktop app, and adds what the original
never had: an automated verdict.

Drop in an audio file. SpectreGram renders the full-track spectrogram, estimates
where the real frequency cutoff sits, and says whether the file looks like what it
claims to be or like a low-bitrate MP3 wearing a lossless costume. Every verdict is
labelled an **estimate**. It is a heuristic, not proof.

Everything runs on your machine. There are no uploads, no accounts and no server.

### Features

- **Spectrogram and verdict.** Decode, STFT in a Web Worker, cutoff estimate and a
  GENUINE / COSTUME stamp, in four palettes (Spectrum, Hellfire, Ectoplasm, Pumpkin).
- **Zoom that re-analyses.** Drag to zoom into a time segment, or Ctrl/Cmd + wheel.
  The zoomed view is recomputed from the samples, not stretched.
- **Playback and seek.** Hover the time ruler to preview, click to cue, Space to
  play and pause.
- **Phase overlay.** An optional hue tint shows each bin's phase inside the same graph.
- **Folder report.** Scan a folder and its subfolders, get a drumroll reveal and a
  collector rating (Crypt Keeper to Costume Party Noob), and save a Markdown report.
- **Spectral message.** Write up to 32 characters (emoji work) into a new WAV so they
  show up in its spectrogram. The original file is never changed, and a built-in
  check refuses any result that would change the verdict class.
- **Export.** Save the current view, the whole track, or stacked strips as PNG, with
  optional rulers and a dB legend.
- **Haunted polish.** Ghost playhead, verdict stamps, an idle screensaver and a
  synthesized drumroll.

### Downloads

Windows installer, Windows portable exe, Linux AppImage and macOS DMG are on the
GitHub Release for tag `1.0.0`. They are **unsigned**, so SmartScreen or Gatekeeper
will warn on first launch. [MAINTAINER: paste the Release URL here.]

### Clean-room note

Spek is GPL-3.0 and SpectreGram is MIT. No Spek code is used. Only the idea is
reimplemented: an STFT spectrogram and a frequency-cutoff reading are standard DSP.
FFT is the MIT-licensed `fft.js`; decoding is the browser's own `decodeAudioData`.

### Honest limits

- The cutoff thresholds are heuristic estimates, tested with synthetic fixtures and
  several real lossy files. Broader calibration against a labelled genuine/lossy
  corpus is future work. Ambiguous results are reported as inconclusive.
- Audio is decoded at the device sample rate, so a genuine 44.1 kHz file can read as
  inconclusive on a 48 kHz device.
- The macOS and Linux builds come from GitHub Actions and were not launched by the
  maintainer. [MAINTAINER: edit if you test them.]

### Future work

- A much smaller download. The Electron build bundles a full browser (about 112 MB portable). A system-web-view port is possible but untested.
- Broader calibration of the cutoff thresholds against a labelled corpus.
- Code-signed builds.

### Pre-existing code and assets disclosure

- New project, first commit 2026-11-06, inside the submission period.
- Libraries: `fft.js` (MIT), Electron, Vite, TypeScript, Vitest.
- The app icon and the idle-screensaver video are AI-generated artwork made for this
  project. [MAINTAINER: confirm the tools used and that you have the rights.]
- The drumroll sound is synthesized in code. No third-party audio ships.
- Some features were built by the maintainer outside Kiro specs. The Kiro write-up
  lists which.
