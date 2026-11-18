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
- **R1a — Emoji.** *(Added 2026-11-17, maintainer's ask.)* Many dice
  phrases include Halloween emoji (👻 🎃 🦇 💀 🕷️ 🕸️ 🧛 🌕 …), and typed
  emoji work too. Emoji are cut into the music as silhouettes (their shape,
  not their colors). The 32-character limit counts what the user sees: one
  emoji = one character, including emoji made of several code points.
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
  *(Amended again 2026-11-17: the quieter, higher steady tones were still
  unpleasant — 32 tones held for the whole message read as a constant
  whine. Steady tones are dropped; see R3b.)*
- **R3b — Sound styles.** The letters don't have to be drawn with straight
  lines, so the user picks one of three sounds in the dialog, to compare by
  ear:
  - **Hiss** (default) — letters filled with band-limited noise: a quiet
    cymbal-like hiss, no whine, no beating; letters look solid and grainy.
  - **Warble** — half as many tones, each slowly wobbling in pitch like a
    faint theremin; letters look like wavy lines.
  - **Sparkle** — letters drawn with short random twinkling blips; letters
    look dotted (sparse in the full-track view, clear when zoomed).

  All three stay inside the R3 band, fade the whole message in and out
  over about a second, and are tuned to similar visibility. The style is
  part of the default file name (`<original>-haunted-<style>.wav`).

  *(Amended 2026-11-17 after the maintainer compared them: hiss and warble
  are removed; sparkle is the only sound. The style picker and the style in
  the file name go away; the default name is `<original>-haunted.wav`
  again.)*
- **R3c — Softer sparkle that blends in.** Each grain is longer and
  gentler, and its loudness is **calibrated to the track**: before adding
  anything, the app measures how loud the original already is at each
  moment and pitch of the message, and sets each grain a fixed margin
  above that level, between a floor (so the text still shows over silence)
  and a ceiling (quieter than the previous sparkle, so busy passages never
  get loud grains). Quiet passages get quiet sparkles.
- **R3d — Make room for the message.** *(Added 2026-11-17: with R3c alone
  the text was not visible over two real tracks.)* While the message
  plays, the original is dimmed by up to 12 dB **inside the message band
  only** (≈ 11–16 kHz at 48 kHz), easing in and out over about a second,
  so the soft sparkles show without adding loudness. The rest of the
  spectrum is untouched (this amends R2's "untouched"). Cost: slightly
  duller highs while the message plays.
- **R3f — Readable letters.** *(Added 2026-11-17: with R3d the dimmed band
  showed as a dark box but the letters inside it did not — the fixed grain
  ceiling sat below real music's band level.)* The grain ceiling is now
  **the original's own level in that cell** (grains replace what was
  dimmed rather than adding loudness), with an absolute top limit. Letters
  are drawn with a heavier font and strokes thickened by one column, and
  grains are packed about twice as densely, so the letters read as solid
  shapes.
- **R3g — Letters cut into the music, nothing added.** *(Added 2026-11-17
  at the maintainer's suggestion; supersedes the sparkle sound of R3b–R3d
  and R3f.)* Instead of adding any sound, the original is dimmed **inside
  the letter shapes only**, in the message band, by up to 24 dB, easing in
  and out with the message. The word shows as dark letters against the
  music. Nothing is added, so there is no new sound to hear; the only
  change is that the highs dip while each letter passes. Where the original
  has nothing in the band (silence), there is nothing to dim and the
  letters can't show — the docs say so. The R3e verdict check applies,
  backing off 24 → 12 → 6 dB.
- **R3e — Verdict checked by construction.** Dimming a band could split
  the analyzer's contiguous run and lower a genuine file's cutoff (a false
  "costume"). So after building the haunted audio, the app runs the
  analyzer (`cutoff.ts`, unchanged) on it and on the original: the cutoff
  class (genuine / inconclusive / suspicious / none) must match and the
  cutoff must not rise by more than 0.1 kHz. If not, it retries with half
  the dimming, then none; if even that fails, nothing is saved and the
  user is told.
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
