# SpectreGram — Tunable Constants Reference

All `// TUNABLE` constants across the codebase, extracted from design docs
and implementation. These were planned in specs, implemented as named constants,
and remain adjustable without touching algorithm logic.

## Analysis pipeline

### STFT parameters (`src/audio/stft.ts`)

```typescript
fftSize: 2048        // FFT window size (power of 2)
hopSize: 1024        // Hop between windows (samples)
dynRangeDb: 120      // Dynamic range for dBFS scale
```

**Design rationale:** 2048 gives ~46ms time resolution at 44.1kHz (acceptable
for full-track view), 1024 hop = 50% overlap (standard), 120dB covers full
16-bit range.

### Cutoff estimation (`src/audio/cutoff.ts`)

```typescript
PERCENTILE: 85                    // Per-bin energy profile (P85)
HEADROOM_DB: 20                   // Threshold above noise floor
LOSSLESS_HIGH_RATIO: 0.90        // cutoff/Nyquist for "genuine lossless"
SUSPICIOUS_RATIO: 0.73            // cutoff/Nyquist for "costume" verdict
```

**Design rationale:** P85 captures sustained energy (not just peaks), 20dB
headroom separates signal from noise, 0.90 = full-bandwidth expectation for
lossless (22.05kHz / 24kHz Nyquist at 48kHz decode), 0.73 ≈ 16kHz for 128k MP3.

**Calibration status:** Thresholds unchanged after 2026-11-16 real-file test
(5 lossy files, no misclassification; see submission-readiness task 5). Genuine
FLAC measurement blocked by lack of test file.

## Zoom & navigation

### Time zoom (`src/main.ts`)

```typescript
MIN_ZOOM_WINDOWS: 20              // Minimum zoom span (STFT windows)
ZOOM_WHEEL_RATE: 1.42             // Zoom factor per 100-unit wheel notch
```

**Design rationale:** 20 windows ≈ 0.93s at 44.1kHz (below that, 46ms window
smears wider than useful). 1.42^N exponential feels even for trackpad pinch
and mouse wheel.

## Caching

### Recent-file cache (`src/main.ts`)

```typescript
GRID_CACHE_MAX_BYTES: 200_000_000    // Analysis cache budget (200 MB)
AUDIO_CACHE_MAX_BYTES: 400_000_000   // Decoded audio budget (400 MB)
```

**Design rationale:** Analysis tier (~4MB per file) holds ~50 full tracks for
instant reopens. Audio tier (~250MB for 7min at 48kHz stereo) holds the most
recent files for playback/zoom without re-decode. Measured from real files,
not guessed.

## Folder report

### Scan limits (`electron/main.js`)

```typescript
MAX_FOLDER_FILES: 1000            // File listing cap
```

**Design rationale:** Safety cap to prevent runaway scans. UI shows "list
capped" toast if hit.

### Rating thresholds (`src/report.ts`)

```typescript
// Costume share = costume / (genuine + costume)
0%         → 👑 Crypt Keeper
≤ 20%      → 🧛 Avid Collector
≤ 50%      → 🧟 Haunted Hoarder
> 50%      → 🎃 Costume Party Noob
```

**Design rationale:** Costume share (not costume count) normalizes across
collection sizes. Thresholds are subjective collector tiers. Inconclusive is
neutral (resampling caveat; see AGENTS.md #3).

## Spectral message

### Message band (`src/message/encode.ts`)

```typescript
BAND_LO: 0.46         // Message band start (× Nyquist)
BAND_HI: 0.66         // Message band end (× Nyquist)
LETTER_DIM_DB: 24     // Attenuation inside letter shapes
```

**Design rationale:** Band 0.46–0.66 × Nyquist (≈ 11–16 kHz at 48kHz) sits
below the 0.73 costume line (verdict-safe by construction). 24dB dimming makes
letters readable over loud music without discomfort. Tried at 12dB (too faint),
then calibrated to 24dB on real tracks.

**History:** Tone synthesis (pure tones, then hiss, warble, sparkle) all
rejected (comfort or visibility fail). Cutting letters into the music (dims
the band, adds nothing) succeeded on both test tracks.

### Message limits (`src/message/phrases.ts`)

```typescript
MAX_MESSAGE_GRAPHEMES: 32         // Character limit (grapheme count)
```

**Design rationale:** 32 graphemes (via `Intl.Segmenter`) fits on a full-track
view without crowding. Emoji count as one grapheme each.

## Export

### Export dimensions (`src/export-bands.ts`, `src/export-image.ts`)

```typescript
BASE_COLUMNS: 1024                // Full-track strip width (1×)
// Speeds: ½× = 2048, 1× = 1024, 2× = 512, 3× = 341, 5× = 205 (floor 128)
```

**Design rationale:** 1024 columns = on-screen spectrogram width. Compression
speeds produce strips of real detail (re-analyzed via `computeStftSegment`),
not stretched pixels.

## UI timing

### Screensaver (`src/main.ts`)

```typescript
IDLE_MS: 60_000                   // Idle time before screensaver (ms)
```

**Design rationale:** 60s balances "actually idle" vs "annoying trigger during
normal pauses."

### Drumroll (`src/drumroll.ts`)

```typescript
ROLL_SEC: 2.2         // Drumroll duration (full animation; 0.6 with reduced motion)
```

**Design rationale:** 2.2s crescendo feels ceremonial without dragging. 0.6s
respects `prefers-reduced-motion`.

## How to change a tunable

1. **Find the constant** in the file listed above (grep `// TUNABLE` works).
2. **Change only the value**, not the algorithm.
3. **Re-run verification** if it affects correctness (e.g., cutoff thresholds
   → re-run Vitest; zoom min → check a real zoom at the new limit).
4. **Update this doc** if the rationale changes.

## Constants that are NOT tunable

These are locked by design or external constraints:

- **FFT size must be power-of-two** (`fft.js` requirement)
- **File structure** (steering/build-conventions.md)
- **Cutoff algorithm structure** (per-bin percentile + contiguous run; changing
  the approach = new feature, not tuning)
- **Verdict text must say "estimate"** (Vitest invariant enforces it)

---

**Source of truth for calibration status:** `AGENTS.md` open decision #3 and
submission-readiness task 5.
