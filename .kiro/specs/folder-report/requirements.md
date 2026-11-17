# Folder Report — Requirements

Part of the `folder-report` Kiro spec (spec-first: committed on branch
`feat/folder-report` before any implementation). Parent context: `AGENTS.md`
(source of truth) and `/.kiro/steering/` (stack, product, work-trail rules).

### Goal

Add something the original Spek never had: judge a whole folder at once.
With a folder open, the user clicks **Scan**, SpectreGram classifies every
audio file in it (subfolders included), and a Halloween-themed **drumroll**
reveals whether the collection belongs to a true collector or a noob. The
user can save the full report as a file in the folder they opened.

This is an opt-in extension of the analyzer: it reuses the same per-file
verdict and changes nothing about single-file analysis. It stays an
analyzer, not a library manager: no tagging, moving, renaming or deleting
of the user's files.

### Requirements

- **R1 — Recursive folder listing.** Opening a folder (File › Open Folder,
  Options › Development › Load Sample Folder) lists audio files from the
  folder **and all its subfolders**. Hidden entries (names starting with
  `.`) are skipped; symbolic links are not followed (no loops). At most
  1,000 files are listed; if more exist, the user is told the list was
  capped. Each file shows its path relative to the opened folder.
- **R2 — Scan on demand.** The folder panel has a **Scan** button. Nothing
  is analyzed until it is clicked. While scanning, the button shows
  progress (`n / total`) and becomes **Cancel**. Scanning never replaces or
  disturbs the spectrogram currently on screen.
- **R3 — Per-file classification.** Each file is decoded and analyzed with
  the same pipeline and verdict text as a single open (`cutoff.ts`), then
  sorted into one class: Genuine lossless · Costume (lossy disguised as
  lossless) · Inconclusive · Normal lossy · No call (ambiguous/unknown
  format, no clear cutoff, too short) · Could not decode.
- **R4 — Drumroll reveal.** When the scan finishes, a modal presents the
  drumroll screen with a **Reveal** button and waits. Clicking Reveal plays
  a drumroll **sound** with the drum animation, ending on a crash, and the
  themed collector rating (from true collector to noob) is revealed on the
  crash, with a one-line explanation and the count per class. The sound is
  synthesized in the app (no audio file, so nothing to license). The rating
  is labelled an **estimate**, like every verdict. *(Amended 2026-11-16 at
  the maintainer's request: originally the drumroll played automatically
  and silently.)*
- **R5 — Save report.** **Save report** opens the save dialog **in the
  opened folder**, defaulting to `spectregram-report.md`. Nothing is written
  without that dialog; nothing is overwritten silently. The report holds the
  rating, the class counts, one row per file (relative path, claimed
  format, duration, cutoff, class, verdict) and the caveats.
- **R6 — Honesty and privacy.** Every verdict and the rating carry
  "(estimate)". The report states the decode sample rate and the known
  limitation that genuine 44.1 kHz files can read "Inconclusive" on 48 kHz
  devices (AGENTS.md open decision #3). Files are read locally only; the
  report is the only file written, and only where the user chooses.

### Non-goals

- No changes to cutoff thresholds or verdict wording (`cutoff.ts` untouched).
- No fix for the decode resampling issue (tracked in AGENTS.md #3).
- No library management: no tagging, moving, renaming, deleting, playlists.
- No CSV/HTML export, no scan of the web build (folders are desktop-only).
- No persistence: scan results live in memory until the next folder/scan.
