# SpectreGram — Design (spec-first)

> Spec status: **Design**. Requirements live in `requirements.md`; this file
> is the concrete, implementable design. Stack and file structure are LOCKED
> in `AGENTS.md` / `.kiro/steering/build-conventions.md` (2026-11-06). This
> design adds no framework, no backend, no FFmpeg.wasm, no WebGL. Clean-room:
> Spek is GPL-3.0; we reimplement the idea only — no Spek code is copied.

## Overview

SpectreGram is one screen with one job: drop an audio file → decode it with
Web Audio → compute a magnitude spectrogram via STFT in a Web Worker → render
the full-track spectrogram on a Canvas 2D with a haunted palette → estimate
the frequency cutoff → show a verdict line (always labelled an estimate) →
export the spectrogram as PNG. The pipeline is four separate, testable units
— **decode → STFT → cutoff → render** — wired together by a thin `main.ts`.

The single architectural requirement the task adds on top of the locked file
list is that the STFT core be a **pure, importable function** (`computeStft`)
that both the Web Worker and a Node script can import, so the analysis path is
composable and testable without a browser. The locked file list names
`stft-worker.ts` as the STFT owner; to satisfy the composability requirement I
split the STFT concern into two files that together fulfill the one STFT
task — this is a minimal, justified extension of the locked structure, not a
new product surface:

- `src/audio/stft.ts` — **pure** STFT core (window function, fft.js wiring,
  `computeStft`, `StftParams`, `DbGrid` types). No DOM, no worker globals, no
  side effects at import. Importable by the worker AND by Node/Vitest.
- `src/audio/stft-worker.ts` — thin worker wrapper: imports `stft.ts`, owns
  the `onmessage`/`postMessage` plumbing, drives progress, transfers the
  result buffer. This is the file the Vite `new Worker(new URL(...))` points at.

Everything else maps 1:1 to the locked file list.

## Locked stack

Vite + TypeScript (strict, no `any` in analysis/cutoff/render paths) · Canvas
2D (`ImageData` + palette color lookup tables) · Web Audio `decodeAudioData`
(no FFmpeg.wasm) · `fft.js` (MIT, no hand-rolled FFT) · STFT in a module Web
Worker (Vite worker syntax) · Vitest (covers `cutoff.ts` only) · static hosting.
Dependency versions are pinned exactly (no open ranges).

## Locked file structure (1:1 with tasks)

```
src/main.ts              — drop zone, file pick, wiring, UI state
src/audio/decode.ts      — decodeAudioData + file facts + mono mixdown
src/audio/stft.ts        — pure STFT core (computeStft, window, DbGrid) [see note]
src/audio/stft-worker.ts — worker wrapper around stft.ts; posts progress + grid
src/audio/cutoff.ts      — cutoff estimate + verdict text (always "estimate"); Vitest-tested
src/render.ts            — canvas spectrogram, palette switch, playhead, PNG export
index.html / src/style.css
src/audio/cutoff.test.ts — Vitest synthetic-grid tests for cutoff.ts
package.json / tsconfig.json / vite.config.ts / vitest.config.ts / .gitignore
```

## Key decisions

### Decode (`src/audio/decode.ts`)

`decodeAudioData` is native and bounded, so it runs on the main thread; only the
STFT (the heavy compute) must be in the worker to pass the 60-second
no-freeze check. `decode.ts` owns decoding, facts extraction, and a mono
mixdown so the worker receives a single flat `Float32Array`.

Public API:

```ts
export interface FileFacts {
  format: string;        // best-effort label from extension/MIME (see below)
  durationSec: number;   // AudioBuffer.duration
  sampleRate: number;    // AudioBuffer.sampleRate
  channels: number;      // AudioBuffer.numberOfChannels
}
export interface DecodeResult {
  ok: true; facts: FileFacts; mono: Float32Array; buffer: AudioBuffer;
} | { ok: false; message: string };
export async function decodeFile(file: File): Promise<DecodeResult>;
```

- **Format label:** `decodeAudioData` does not expose the codec, so `format` is
  a best-effort label derived from the file extension (`.flac`→`FLAC`,
  `.mp3`→`MP3`, `.wav`→`WAV`, `.ogg`→`Ogg`, `.m4a`→`M4A`), falling back to MIME
  subtypes, then `'Unknown'`. This is a displayed fact only; the verdict uses a
  canonicalized form (see Cutoff).
- **Mono mixdown:** average `AudioBuffer` channels into one `Float32Array`
  (copy if mono). The original `AudioBuffer` is also returned for optional
  playhead playback.
- **Invariant owner:** `decode.ts` owns "the file is decodable or produces a
  clear failure message." It never throws to the caller — failures become
  `DecodeResult.ok === false` with a user-readable message.

### STFT core (`src/audio/stft.ts`) — pure

`computeStft` is the pure, importable core. It takes mono samples + params +
an optional progress callback, and returns a `DbGrid` (dBFS per
time-frame/frequency-bin). It depends only on `fft.js` (isomorphic, works in
worker and Node) and on `Math`; it has no DOM or worker globals, so importing it
never triggers side effects.

Public API:

```ts
export interface StftParams {
  fftSize: number;      // power of two (fft.js radix-2 requirement)
  hopSize: number;      // frame step in samples
  window: 'hann';       // window function id
  dynRangeDb: number;   // display/capture dynamic range (dBFS), floor = -dynRangeDb
}
export const DEFAULT_STFT: StftParams;   // { fftSize: 2048, hopSize: 1024, window: 'hann', dynRangeDb: 120 }
export interface DbGrid { data: Float32Array; frames: number; bins: number; } // bins = fftSize/2 + 1
export function computeStft(
  samples: Float32Array,
  params?: Partial<StftParams>,
  onProgress?: (fraction: number) => void,
): DbGrid;
```

Computation (standard DSP, clean-room — written from the idea, not from Spek):

1. Precompute the Hann window `w[n] = 0.5 * (1 - cos(2π·n / (N-1)))`, `n = 0..N-1`,
   and `windowSum = Σ w[n]`.
2. For each frame start `t = 0, hop, 2·hop, …` while `t + N ≤ length`:
   - copy `samples[t..t+N)`, multiply by `w[n]` (Hann), zero-pad if the last
     frame is short is **not** done — short trailing samples are dropped (no
     zero-padding keeps magnitudes honest; the dropped tail is ≤ N samples).
   - `fft.realTransform(out, windowed)`; read bins `k = 0..N/2` as
     `re = out[2k]`, `im = out[2k+1]`. (`realTransform` only fills the first
     half; we never read the mirrored half, so `completeSpectrum` is not
     needed.)
   - `mag = sqrt(re² + im²)`; `magNorm = mag * 2 / windowSum` (normalizes a
     full-scale sine to ≈1.0, i.e. 0 dBFS — standard interior-bin scaling; DC
     and Nyquist edge bins are approximate by 2×, acceptable for v1).
   - `db = 20·log10(max(magNorm, 1e-12))`, clamp to `[-dynRangeDb, 0]`.
3. Pack row-major into one `Float32Array` of length `frames * bins`.
4. Call `onProgress(doneFrames / totalFrames)` every `PROGRESS_EVERY` frames
   (default 64, TUNABLE) so the worker can relay without flooding.

**fft.js usage:** `import FFT from 'fft.js'` (Vite handles the CJS→ESM interop
in a module worker). `const fft = new FFT(N)`, `const out = fft.createComplexArray()`,
`fft.realTransform(out, windowedAsReal)`. One `FFT` instance is reused across
frames. If `fft.js` ships no TypeScript types, add a one-line ambient declaration
`src/types/fft.js.d.ts` (`declare module 'fft.js'`) — this declares types only,
it does not hand-roll the FFT algorithm (which build-conventions forbids).

**Edge cases:** `samples.length < N` (too short for even one frame) → returns
`{ data: empty, frames: 0, bins: N/2+1 }`; the caller (cutoff/render) handles
the empty grid. `fftSize` not a power of two → throw `RangeError` (programmer
error, caught in tests/design-time, not user-facing).

### STFT worker (`src/audio/stft-worker.ts`)

Thin wrapper around `stft.ts`. Owns message plumbing only; no DSP logic lives
here. Vite syntax (locked):

```ts
// created in main.ts:
new Worker(new URL('./audio/stft-worker.ts', import.meta.url), { type: 'module' });
```

Message protocol (types exported for type-only import by `main.ts`; type-only
imports are erased and do not pull the worker runtime):

```ts
// request (main → worker)
type AnalyzeRequest = { type: 'analyze'; samples: Float32Array; params: Partial<StftParams> };
// responses (worker → main)
type WorkerMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'result';  data: Float32Array; frames: number; bins: number }
  | { type: 'error';   message: string };
```

- `onmessage` for `'analyze'` calls `computeStft(samples, params, frac =>
  postMessage({ type:'progress', fraction: frac }))`, then posts
  `{ type:'result', data, frames, bins }` **with `data.buffer` in the transfer
  list** (zero-copy — important for 60s tracks).
- Any thrown error → `postMessage({ type:'error', message })`.
- The worker owns no state; it is reused across files. `main.ts` terminates it
  on `beforeunload` and on analysis failure (see Error handling).

### Cutoff + verdict (`src/audio/cutoff.ts`) — pure, Vitest-tested

`cutoff.ts` is pure: it takes a `DbGrid` + sample rate + claimed format and
returns a cutoff and a verdict. It needs no Web Audio, so Vitest covers it with
synthetic `DbGrid`s (the locked test scope). This is where the "estimate" label
is generated, in one place, so it can never be missed.

**Cutoff algorithm (clean-room, standard idea):** find the highest frequency
with sustained energy, robust to silence and spurious high-freq spikes.

1. Per-bin energy profile: `profile[k] = percentile_over_time(db[:,k], P)` for
   each bin `k`. A high percentile (P = 85, TUNABLE) captures "sustained
   energy" while ignoring isolated silence and brief transients.
2. Global noise floor: `noiseFloor = P5(profile[:])` (a low percentile across
   bins — the lowest-energy bins, e.g. above a codec cliff, define the floor).
3. Threshold: `threshold = noiseFloor + HEADROOM_DB` (HEADROOM_DB = 20,
   TUNABLE). A bin counts as "energy present" iff `profile[k] >= threshold`.
4. Mask `above[k] = profile[k] >= threshold`; find the **largest contiguous
   run** of `above` bins (tie-break: lowest start index). The cutoff bin =
   that run's **max** bin index. Rationale: the low/mid band is always the
   largest run; a codec cliff cuts it off; any spurious high-freq spike above
   the cliff is a separate small run and is correctly ignored. (Using the
   largest run, not "the run containing bin 0", stays robust when DC is
   below threshold, which is common.)
5. `cutoffHz = cutoffBin * sampleRate / N`, where `N = (bins - 1) * 2`
   (derived from `DbGrid.bins`, no extra param).

Public API:

```ts
export interface CutoffParams { percentile: number; headroomDb: number; }
export const DEFAULT_CUTOFF: CutoffParams;        // { percentile: 85, headroomDb: 20 }
export interface CutoffResult { cutoffBin: number; cutoffHz: number; }
export function canonicalFormat(input: string | undefined): 'flac' | 'wav' | 'mp3' | 'ogg' | 'm4a' | 'unknown';
export function estimateCutoff(grid: DbGrid, sampleRate: number, params?: Partial<CutoffParams>): CutoffResult;
export function buildVerdict(cutoffHz: number, sampleRate: number, claimedFormat: string): string;
export function analyze(grid: DbGrid, sampleRate: number, claimedFormat: string, params?: Partial<CutoffParams>): { cutoff: CutoffResult; verdict: string };
```

**Verdict logic** (`buildVerdict`, the single string generator). Let
`nyquist = sampleRate / 2`, `ratio = cutoffHz / nyquist`. Lossless claim set =
`{ 'flac', 'wav' }`. Verdict ratio thresholds are TUNABLE constants pending
real-file calibration:

- `LOSSLESS_HIGH_RATIO = 0.90` — `ratio >= 0.90` → looks genuine lossless.
- `SUSPICIOUS_RATIO = 0.73` — `ratio < 0.73` for a lossless claim → "costume".
- Between 0.73 and 0.90 for a lossless claim → inconclusive (filtered/upsampled).
- Lossy/ambiguous claims (`mp3`, `ogg`, `m4a`, `unknown`): no "costume"
  accusation; state the cutoff and note it is consistent/ambiguous for the
  format. (m4a may be ALAC or AAC; `decodeAudioData` cannot tell, so we make no
  disguise call.)

Every returned string contains the word "estimate". Examples (all generated
here, nowhere else):

- `"Claims FLAC. Cutoff ≈19 kHz — consistent with genuine lossless. (estimate)"`
- `"Claims FLAC. Cutoff ≈16 kHz — smells like a 128k MP3 in a costume. (estimate)"`
- `"Claims FLAC. Cutoff ≈18 kHz — inconclusive; could be filtered or upsampled. (estimate)"`
- `"Claims MP3. Cutoff ≈16 kHz — normal for lossy compression. (estimate)"`
- `"Claims M4A. Cutoff ≈16 kHz — format is lossy-or-lossless ambiguous; no disguise call made. (estimate)"`
- `"Audio too short to estimate a cutoff. (estimate)"` (empty grid)
- `"No clear cutoff detected. (estimate)"` (no run above threshold)

**Invariant:** "every verdict string contains 'estimate' (case-insensitive)."
Owned by `cutoff.ts`, enforced by the single `buildVerdict` exit point and
locked by a Vitest assertion over every branch.

**Edge cases (pure, no DOM):**
- `grid.frames === 0` (too short to FFT) → `cutoffHz = 0`, verdict "too short".
- No run above threshold (flat noise / silent file) → `cutoffHz = 0`, verdict
  "no clear cutoff".
- `sampleRate <= 0` → `cutoffHz = 0`, "no clear cutoff" (defensive; shouldn't
  happen from a valid decode).

### Render (`src/render.ts`)

Canvas 2D, `ImageData` pixels, palette = color lookup table. The spectrogram
canvas is sized `frames × bins` (1 pixel per frame/bin) and scaled by CSS to
the display area — this gives an exact full-track spectrogram without
resampling logic. Low frequency at the bottom (conventional): pixel row
`r = bins - 1 - bin`.

Public API:

```ts
export type PaletteName = 'hellfire' | 'ectoplasm';
export function buildPalette(name: PaletteName): Uint8ClampedArray; // length 256*4 (RGBA)
export function renderSpectrogram(ctx: CanvasRenderingContext2D, grid: DbGrid): void; // uses the active palette
export function setActivePalette(name: PaletteName): void;          // re-renders from the last grid
export function exportPng(canvas: HTMLCanvasElement): Promise<Blob>;
```

- **Palette → index:** `idx = round((db - floor) / (0 - floor) * 255)`, clamped
  to `[0,255]`, where `floor = -DEFAULT_STFT.dynRangeDb`. Linear mapping for
  now; gamma/dithering polish is deferred.
- **Palettes (functional LUTs, 256 entries each; clean-room — our own colors,
  not Spek's):**
  - `hellfire`: dark → red → orange → yellow → white (fire). Built by linear
    interpolation between control stops.
  - `ectoplasm`: dark → teal → green → pale slime. Same interpolation approach.
  - Unknown palette name → fall back to `hellfire`, `console.warn`.
- **Playhead** (optional, guardrailed): the spectrogram is drawn once to the
  base canvas; the playhead is a thin absolutely-positioned `<div>` overlay
  moved via `transform: translateX(...)` from a `requestAnimationFrame` loop
  reading `audioCtx.currentTime - startTime`. One Play/Stop control, no seek,
  no scrub, no playlist — analyzer, not player. Playback uses the decoded
  `AudioBuffer` (not the mono mixdown).
- **PNG export:** `exportPng` calls `canvas.toBlob(cb, 'image/png')` on the
  **base spectrogram canvas** (no playhead) so the exported PNG is clean and
  reproducible and matches the spectrogram as shown. The returned `Blob` is
  offered as a download in `main.ts`.

**Edge cases:** empty grid → clear canvas to a neutral fill, draw nothing
else; `exportPng` on an empty canvas still produces a valid (blank) PNG and
does not throw.

### Main wiring (`src/main.ts`)

`main.ts` owns DOM, file intake, AudioContext lifecycle, the single worker
instance, and module-level UI state. Direct DOM — no framework lifecycle to
fight canvas/AudioContext.

State: `lastGrid: DbGrid | null`, `sampleRate: number`, `claimedFormat:
string`, `audioBuffer: AudioBuffer | null` (for playhead). Keeping these lets
a palette switch re-render without recompute.

Flow:

1. **Intake:** drag-and-drop (`dragover`/`drop`) and a hidden `<input
   type="file">` behind a "Pick" button. Accept `audio/*`. Only one file at a
   time.
2. **Decode:** `await decodeFile(file)` → on failure, show `message` in the
   verdict/facts area; on success, render facts, keep `audioBuffer`, post
   `mono` + params to the worker.
3. **Analyze:** show a progress bar bound to `progress` messages; on
   `result`, store `lastGrid`/`sampleRate`/`claimedFormat`, call
   `analyze(grid, sampleRate, claimedFormat)`, show the verdict, call
   `renderSpectrogram`.
4. **Re-render:** palette toggle calls `setActivePalette` → re-render from
   `lastGrid` (no recompute, no re-analyze).
5. **PNG:** export button → `exportPng(baseCanvas)` → download link.
6. **Playhead:** Play button → `AudioBufferSourceNode` from `audioBuffer`,
   rAF loop moves the overlay; Stop cancels the source and stops the loop.

### Privacy & no-network invariant

No `fetch`/XHR/WebSocket anywhere; the file is read with
`file.arrayBuffer()` and stays in-tab. `decode.ts`, `stft.ts`, `cutoff.ts`,
`render.ts` make zero network calls. `main.ts` makes zero network calls. This
is an explicit invariant owned by "there is no networking code in the repo"
(searchable: no fetch/XHR imports). A PR adding any fetch is a violation.

## Error handling (concrete, per operation)

| Operation | Failure condition | Recoverable? | Caller receives | Logged where |
|---|---|---|---|---|
| `file.arrayBuffer()` | read error (rare) | recoverable (user retries) | `decodeFile` → `DecodeResult.ok=false` ("Could not read file.") | `main.ts` `console.warn` |
| `decodeAudioData` | unsupported codec / corrupt / empty | recoverable | `DecodeResult.ok=false` ("Could not decode… browser may not support this format.") | `main.ts` `console.warn` |
| `computeStft` | `fftSize` not power of two | fatal (programmer error) | throws `RangeError` | `stft.ts` throws; worker catches → `error` msg |
| `computeStft` | `samples.length < N` | recoverable | empty grid (`frames=0`) | not logged (expected edge) |
| worker `onmessage` | any thrown error | recoverable (retry new file) | `{ type:'error', message }` | `main.ts` `console.error`, terminate worker |
| `estimateCutoff` | empty grid / no energy / `sampleRate<=0` | recoverable | `cutoffHz=0` + safe verdict string | not logged (expected edge) |
| `buildPalette` | unknown name | recoverable | falls back to `hellfire` | `render.ts` `console.warn` |
| `exportPng` | canvas tainted (not expected — no cross-origin) | fatal | rejected `Promise` | `main.ts` `console.error`, show "Export failed" |
| new file during analysis | concurrent analysis | recoverable | `main.ts` **terminates** current worker, starts fresh | `main.ts` `console.warn` |

No remote/telemetry logging ever (privacy). All logging is local `console.*`
for dev visibility only.

## External input validation

- **File intake:** required (`File`). Accept `audio/*` plus the named
  extensions. No size cap in v1 (documented OOM risk for very large files — a
  soft guard may be added later, not now). On empty/non-file drop → ignore.
- **`decodeAudioData` input:** the `ArrayBuffer`; native validation; failure
  path above.
- **STFT params:** `fftSize` must be a power of two (validated in `computeStft`
  via `Number.isInteger(log2(N))`, throws `RangeError`); `hopSize > 0`
  (validated, throws `RangeError`); `dynRangeDb > 0` (validated, throws
  `RangeError`). These are programmer-supplied defaults, not user input, so
  throwing is correct.
- **Cutoff params:** `percentile ∈ [0,100]`, `headroomDb > 0` (validated, clamp
  to defaults if out of range rather than throw — these could plausibly be
  exposed as settings later).
- **`buildVerdict` claimed format:** any string; `canonicalFormat` maps to the
  union above, unknown → `'unknown'` → safe generic verdict.

## Testability

- **Unit (Vitest, `cutoff.ts` only — locked scope):** `estimateCutoff` and
  `buildVerdict` on synthetic `DbGrid`s built from a small helper
  (`gridFrom2D`). Synthetic cases:
  - *genuine lossless* — high dBFS bins `0..round(0.92·bins)`, noise above →
    `cutoffHz/nyquist ≈ 0.92` → "consistent with genuine lossless".
  - *128k-MP3-as-FLAC* — high bins `0..round(0.725·bins)`, noise above →
    `ratio ≈ 0.725 < 0.73` → "costume" verdict. Asserts cutoffs **and** verdicts
    differ from the genuine case.
  - *band-limited vs full-bandwidth* — cutoffs at `0.82·bins` vs `0.95·bins`,
    both for a FLAC claim → "inconclusive" vs "lossless" (distinct verdicts).
  - *too short* (empty grid) and *flat noise* (no run) → safe verdicts.
  - *estimate invariant* — assert every branch's string contains "estimate".
  Environment is Node (no DOM needed). No jsdom. No e2e suite in v1.
- **`computeStft` (pure):** designed importable by Node so the analysis path is
  composable/testable without a browser. Per build-conventions we do **not**
  ship a Vitest suite for it (Vitest covers `cutoff.ts` only); its
  importability is a design property, and an optional manual Node check can
  exercise it without becoming a shipped test (keeps the budget lean).
- **Worker / decode / render / main:** browser-API-bound, covered by the
  manual acceptance checks (no e2e suite in v1).

## Dependencies (pinned exact)

```json
{
  "dependencies":    { "fft.js": "4.0.1" },
  "devDependencies": {
    "vite": "5.4.10",
    "typescript": "5.6.3",
    "vitest": "2.1.4"
  }
}
```

`fft.js` v4 ships ESM-compatible CJS that Vite interops in a module worker; if
it lacks bundled `.d.ts`, add `src/types/fft.js.d.ts` (ambient module
declaration — types only, not the algorithm). Scripts: `dev` (vite), `build`
(tsc --noEmit && vite build), `preview` (vite preview), `test` (vitest run),
`test:watch` (vitest). `tsconfig`: `strict: true`, `noImplicitAny` (via
strict), target ES2020, `lib` includes DOM + ES2020, `moduleResolution:
bundler`. `noUncheckedIndexedAccess` left off (default) for ergonomic DSP
indexing; `any` is still forbidden in analysis/cutoff/render paths.

## Open decisions (resolved with TUNABLE defaults — not final-calibrated)

1. **Cutoff threshold strictness (AGENTS.md open decision #3) + validation
   without sample audio files.** No sample audio exists in the workspace, so
   `cutoff.ts` is validated with **synthetic `DbGrid`s** that model the
   genuine-lossless vs 128k-MP3-disguised-as-FLAC pair and a
   band-limited-vs-full-bandwidth case. The detector is
   **relative-to-noise-floor** (`threshold = P5(profile) + HEADROOM_DB`), which
   is robust across masters of varying loudness. Chosen tunable defaults
   (pending real-file calibration): `percentile = 85`, `headroomDb = 20`,
   `LOSSLESS_HIGH_RATIO = 0.90`, `SUSPICIOUS_RATIO = 0.73`. None of these is a
   locked final value; they are constants at the top of `cutoff.ts` with a
   `// TUNABLE` marker.
2. **Exact STFT parameters.** Chosen sensible DSP defaults, all `// TUNABLE`:
   window = **Hann**, `fftSize = 2048`, `hopSize = 1024` (**50% overlap**),
   `dynRangeDb = 120`. These are `DEFAULT_STFT` at the top of `stft.ts` and can
   be overridden per-analysis without code changes to the algorithm.

Both are surfaced to the user in the final message.
