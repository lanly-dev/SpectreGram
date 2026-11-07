# SpectreGram — Tasks

> Implementation breakdown. Tasks map 1:1 to the locked file structure (see
> `design.md`). Lean by intent: this is the smallest Kiroween entry — one
> review pass at the end, no gold-plating. Halloween visual polish is deferred;
> the two palettes only need to render correctly now. Every verdict string must
> contain "estimate". TypeScript strict; no `any` in analysis/cutoff/render.

Convention: each `// TUNABLE` default lives as a named constant at the top of
its module so it can be changed without touching algorithm code.

## T0 — Project scaffold
- `package.json`: pinned exact deps per design (`fft.js@4.0.1`, devDeps
  `vite@5.4.10`, `typescript@5.6.3`, `vitest@2.1.4`); scripts `dev`, `build`
  (`tsc --noEmit && vite build`), `preview`, `test` (`vitest run`),
  `test:watch`.
- `tsconfig.json`: `strict: true`, target ES2020, lib DOM+ES2020,
  `moduleResolution: bundler`; `noUncheckedIndexedAccess` off.
- `vite.config.ts` (minimal), `vitest.config.ts` (`environment: 'node'`,
  `include: ['src/**/*.test.ts']`).
- `.gitignore` (`node_modules`, `dist`). MIT `LICENSE` already exists at repo
  root — do not recreate. Do **not** create any remote repo or request credits.
- `index.html` skeleton with mount point, drop zone, facts panel, progress
  bar, verdict line, `<canvas>`, palette toggle, PNG button, Play/Stop (the
  markup tasks lands in T8; keep this minimal so `dev` boots).
- **Done:** `npm install` + `npm run dev` boots a blank page; `npm run build`
  typechecks clean (no src yet is fine).

## T1 — `src/audio/decode.ts`
- `decodeFile(file: File): Promise<DecodeResult>` per design: `file.arrayBuffer()`
  → `OfflineAudioContext`/`AudioContext` `decodeAudioData` (promise form).
- Extract `FileFacts` (format from extension/MIME best-effort, duration,
  sampleRate, channels); produce mono mixdown `Float32Array`; keep the
  `AudioBuffer` for playhead playback.
- Never throw to caller: decode/read failures → `{ ok: false, message }`.
- **Done:** a supported file yields facts + non-empty mono; an unsupported
  file yields a readable `ok:false` message without freezing the tab.

## T2 — `src/audio/stft.ts` (pure core)
- `StftParams`, `DEFAULT_STFT` (Hann, `fftSize=2048`, `hopSize=1024`,
  `dynRangeDb=120` — all `// TUNABLE`), `DbGrid`.
- `computeStft(samples, params?, onProgress?)`: precompute Hann + `windowSum`,
  iterate frames, `fft.js` `realTransform`, read bins `0..N/2`, normalize
  `mag*2/windowSum`, `20*log10` clamp to `[-dynRangeDb, 0]`, pack row-major.
- Validate `fftSize` power-of-two, `hopSize>0`, `dynRangeDb>0` → `RangeError`.
- Short input (`length < N`) → empty grid (`frames=0`). No DOM/worker globals.
- If `fft.js` lacks types, add `src/types/fft.js.d.ts` ambient declaration.
- **Done:** imports cleanly in both a module worker and Node (no side effects
  on import); a full-scale synthetic sine produces a peak near 0 dBFS at its
  bin.

## T3 — `src/audio/stft-worker.ts` (wrapper)
- Module worker importing `stft.ts`'s `computeStft`. Export message types
  (`AnalyzeRequest`, `WorkerMessage`) for type-only import by `main.ts`.
- `onmessage('analyze')` → `computeStft` with a progress callback that
  `postMessage({ type:'progress', fraction })`; on success `postMessage(
  { type:'result', data, frames, bins }, [data.buffer])` (transfer list);
  thrown error → `postMessage({ type:'error', message })`.
- No DSP logic, no state.
- **Done:** `new Worker(new URL('./audio/stft-worker.ts', import.meta.url),
  { type:'module' })` loads; a posted `Float32Array` returns a `DbGrid`-shaped
  result and progress messages arrive before it.

## T4 — `src/audio/cutoff.ts` (pure, Vitest-tested)
- `CutoffParams`, `DEFAULT_CUTOFF` (`percentile=85`, `headroomDb=20`,
  `// TUNABLE`), `CutoffResult`.
- `canonicalFormat` → `'flac'|'wav'|'mp3'|'ogg'|'m4a'|'unknown'`.
- `estimateCutoff(grid, sampleRate, params?)`: per-bin `percentile` profile,
  `noiseFloor = P5(profile)`, `threshold = noiseFloor + headroomDb`, mask,
  cutoff = max bin of the **largest contiguous above-threshold run**,
  `cutoffHz = cutoffBin * sampleRate / ((bins-1)*2)`. Handle empty grid / no
  run → `cutoffHz=0`.
- `buildVerdict(cutoffHz, sampleRate, claimedFormat)`: ratio vs
  `LOSSLESS_HIGH_RATIO=0.90` / `SUSPICIOUS_RATIO=0.73` (both `// TUNABLE`),
  lossless claim set = `{flac,wav}`; every string contains "estimate".
- `analyze(grid, sampleRate, claimedFormat, params?)` → `{ cutoff, verdict }`.
- **Done:** pure, no DOM; `npm run build` typechecks; no `any`.

## T5 — `src/audio/cutoff.test.ts` (Vitest, locked scope)
- Helper `gridFrom2D(rows: number[][]): DbGrid` for readable synthetic grids.
- Cases: genuine-lossless (high bins to `0.92·bins`), 128k-MP3-as-FLAC (to
  `0.725·bins`), band-limited (`0.82·bins`) vs full-bandwidth (`0.95·bins`),
  too-short (empty grid), flat-noise (no run). Use `sampleRate=44100`, a
  `fftSize` consistent with `bins`.
- Assertions: genuine vs fake cutoffs differ **and** verdicts differ (lossless
  vs costume); band-limited vs full-bandwidth verdicts differ; empty/no-run →
  safe verdicts; **every** verdict string contains "estimate".
- **Done:** `npm test` is green.

## T6 — `src/render.ts`
- `PaletteName = 'hellfire'|'ectoplasm'`; `buildPalette(name)` → 256×4 RGBA
  `Uint8ClampedArray` via linear interpolation between control stops (our own
  colors — clean-room). Unknown name → `hellfire` + `console.warn`.
- `renderSpectrogram(ctx, grid)`: size canvas `frames×bins`, build `ImageData`
  from the active palette (`idx = round((db-floor)/(0-floor)*255)` clamped,
  `floor = -dynRangeDb`), low freq at bottom (`row = bins-1-bin`), `putImageData`.
- `setActivePalette(name)`: re-render from the last stored grid (no recompute).
- `exportPng(canvas)`: `canvas.toBlob(…, 'image/png')` on the base canvas
  (no playhead) → `Promise<Blob>`.
- Empty grid → neutral fill, no throw; `exportPng` still yields a valid PNG.
- **Done:** a `DbGrid` renders to a visible spectrogram; palette toggle
  re-renders without recompute; PNG export matches the on-screen spectrogram.

## T7 — `src/main.ts` (wiring)
- DOM: drop zone (`dragover`/`drop`), hidden file input + Pick button, facts
  panel, progress bar, verdict line, `<canvas>`, palette toggle, PNG button,
  Play/Stop. One file at a time.
- Flow: file → `decodeFile` (show facts or error) → post `mono`+params to the
  single worker (created with locked Vite syntax) → progress bar from
  `progress` msgs → on `result` store grid/sampleRate/claimedFormat, call
  `analyze`, show verdict, `renderSpectrogram`; on `error` show message,
  `console.error`, terminate worker.
- Re-render: palette toggle → `setActivePalette` (uses stored grid).
- PNG button → `exportPng(baseCanvas)` → download link.
- Playhead (optional, guardrailed): `AudioBufferSourceNode` from the decoded
  `AudioBuffer`, rAF loop moves a `<div>` overlay via `translateX`; Stop
  cancels source + loop. No seek/scrub/playlist.
- New file during analysis → terminate current worker, start fresh.
- **Privacy:** no fetch/XHR anywhere in the repo (searchable invariant).
- **Done:** drop a supported file → facts + spectrogram + verdict + PNG export
  all work; dropping a new file re-runs cleanly; no network calls.

## T8 — `index.html` + `src/style.css` (markup & styling)
- Minimal accessible markup wired to T7's IDs; plain CSS only (no Tailwind).
- Layout: drop zone on top, facts + verdict, canvas as the centerpiece,
  controls (palette toggle, PNG, Play/Stop). No haunted polish yet — just
  legible and functional.
- **Done:** the page is legible and all controls are reachable by keyboard.

## T9 — Review pass (single pass, lean)
- `npm run build` (typecheck + build) green; `npm test` green.
- Manual acceptance smoke (no e2e suite in v1):
  - [ ] A lossless file vs a 128k-MP3-disguised-as-FLAC render visibly different
    spectrograms and different verdicts (substitute real files at smoke time).
  - [ ] A ~60s track renders without freezing the tab; progress bar visible.
  - [ ] PNG export opens and matches the on-screen spectrogram.
  - [ ] Every verdict string shown contains "estimate".
- Clean-room check: no Spek code copied; only the idea reimplemented.
- **Done:** all four boxes ticked; `AGENTS.md` acceptance checks updated.
