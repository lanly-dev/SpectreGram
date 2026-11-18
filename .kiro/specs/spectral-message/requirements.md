# Spectral Message — Requirements

Part of the `spectral-message` Kiro spec (spec-first: committed on branch
`feat/spectral-message` before any implementation). Parent context:
`AGENTS.md` (source of truth) and `/.kiro/steering/` (stack, product,
work-trail rules).

### Goal

Let the user hide a short text message **in the sound** of the open track,
so the words appear when the result is viewed in any spectrogram app —
SpectreGram, Spek, or anything else (the trick some musicians hid in
records). The text box has a 🎲 dice that fills in a random Halloween
phrase, or the user types their own. SpectreGram generates a **new** audio
file; the original is never modified.

This adds an output to an analyzer, chosen by the maintainer. It must not
weaken the analyzer: a haunted file must never read as more lossless than
its source.

### Requirements

- **R1 — Message input.** A "Haunt this track" dialog, available when a
  track is loaded, with a text field (1–32 characters after trimming), a
  character counter, and a 🎲 button that picks a random Halloween phrase
  from a built-in list (never the phrase already shown). Phrases are
  original wording, not quotes from songs, films or other works.
- **R2 — Encode into audio.** The message is rendered as text and drawn
  into the track's spectrum as tones: higher rows of the text are higher
  frequencies, and the text runs left to right in time, centered in the
  track and sized to read naturally in the full-track view. The tones are
  added to every channel; the rest of the audio is untouched, except that
  the whole mix is scaled down slightly if adding the tones would clip.
- **R3 — Verdict safety.** The message band is fixed between **46% and 66%
  of the Nyquist frequency**, below the analyzer's "costume" line (73%), so
  a haunted file can never read as more lossless than its source. The
  tones fade in and out softly, so there are no clicks (which would splash
  energy up to Nyquist). Verified: a lossy-shaped source still reads
  "costume" and a full-band source still reads "genuine lossless" after
  haunting.
- **R3a — Comfortable to listen to.** *(Added 2026-11-17, after the
  maintainer found the first version made his ears feel bad and dizzy.)*
  The first band (22–50% of Nyquist, ≈ 5–12 kHz) sat near where hearing is
  most sensitive, and 32 loud pure tones there beat against each other.
  The band moves up to where hearing is far less sensitive and music has
  little energy (so the text stays visible at a low level), the level drops
  to ≈ −44 dBFS per tone, and the fades lengthen so tones swell instead of
  stutter. The maintainer confirms by listening.
- **R4 — Output.** A new 16-bit PCM **WAV** at the decoded sample rate,
  same length and channel count as the decoded track, named
  `<original>-haunted.wav` by default. Desktop: native save dialog. Web:
  browser download. After a successful save, the new file opens in the app
  so the user sees the message in its spectrogram.
- **R5 — Fit check.** If the message can't be drawn legibly in the track
  (too many characters for a short track), nothing is generated and the
  user is told to shorten the message or use a longer track.
- **R6 — Honesty.** The dialog says the message may be faintly audible and
  that a new file is written. The docs state that a WAV made from a lossy
  source is still lossy — the analyzer will (correctly) call it a costume —
  and that the output sample rate is the decoded rate (AGENTS.md #3).

### Non-goals

- No change to `cutoff.ts`, its thresholds, or verdict wording.
- No editing of the original file; no MP3/FLAC/other encoders (WAV only).
- No hiding text above the cutoff band, no "inaudible" mode (R3).
- No multi-line text, fonts, images or positioning controls.
