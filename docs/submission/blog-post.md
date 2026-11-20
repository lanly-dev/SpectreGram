# Blog post — DRAFT

> Draft for the maintainer to publish on a third-party platform (for example dev.to or
> Medium) **before Dec 4, 2026, 2:00 PM PT**. It must be public and must mention the
> Kiroween 2026 hackathon. Then add the post URL to the Devpost form. Edit it into your
> own voice. The sentences marked [YOU] need your own experience.

---

# I brought Spek back as a haunted desktop app (Kiroween 2026)

*This post is part of the Kiroween 2026 hackathon, Resurrection category.*

You download an album as FLAC. Is it really lossless, or an MP3 that someone re-saved?
Spek used to answer that: it drew a spectrogram, and you looked for where the sound
stopped. A low-bitrate MP3 leaves a hard shelf near 16 kHz. A real lossless file
reaches much higher.

Spek is GPL-3.0 and its world of local music libraries is fading. I rebuilt the idea
from scratch as **SpectreGram**, a desktop app (Electron). It is MIT licensed and shares
no code with Spek.

## What it adds

The original showed the graph and left the reading to you. SpectreGram estimates the
cutoff and gives a verdict, always labelled an estimate. A heuristic can be fooled by a
legitimately filtered master, and I did not want the app to pretend otherwise.

It also zooms by re-analysing the audio, scans a whole folder for a collector rating,
overlays phase on the same graph, and can write a short message into a new WAV so the
words appear in its spectrogram. Everything runs locally.

## Building it with Kiro

I wrote the requirements and design for each feature in `.kiro/specs/` before the code,
and kept project rules in steering files. A SessionStart hook reminded every agent
session of the clean-room and privacy rules. [YOU: one concrete moment where a spec or a
review changed the result, for example the review that caught the cutoff edge case.]

Two things went wrong in ways worth sharing. My first spectral-message designs added
sound to the track, and they sounded bad and barely showed over real music. Cutting the
letters out of the existing sound worked better. [YOU: your own lesson.]

## Try it

Downloads for Windows, Linux and macOS are on the GitHub Releases page (unsigned, so
expect a first-launch warning). Source: https://github.com/lanly-dev/SpectreGram

The verdict is an estimate. Treat it as a hint, not proof.
