# SpectreGram — Code Review: spectregram-core

Verdict: **CHANGES_REQUESTED** (one blocker)

Reviewed against `design.md`, `tasks.md`, and `build-conventions.md` by
reading source directly. Build/test evidence taken from the verification
record (`verification.md`) plus spot-checks (confirmed `fft.js@4.0.1`
installed, all deps exact-pinned, no `any` in source).

## Done-check results

| Check | Result |
|---|---|
| `npm run build` | ✅ recorded exit 0; worker bundled |
| Vitest 8/8 | ✅ covers `cutoff.ts` only, incl. required band-limited-lower-cutoff and genuine-vs-fake-FLAC cases on synthetic grids |
| `npm run dev` smoke | ✅ served page with empty stderr |
| decode→STFT→cutoff→render on constructed signals | ✅ via `computeStft` (real implementation) |
| PNG export | ✅ reads rendered `#canvas`; playhead is a separate overlay, never drawn |

## Locked constraints — all honored

Vanilla TS · Canvas 2D · Web Audio · fft.js module worker · Vitest ·
static hosting · verdict strings only in `cutoff.ts` · every branch
contains "estimate" · TypeScript strict · no `any` · clean-room.
No remote repo created / no credits requested.

## Findings

### B1 — BLOCKER — `src/audio/cutoff.ts` lines 165–169

**Summary:** Final contiguous run is dropped — a valid run reaching the
Nyquist bin is reported as cutoff 0.

**Evidence:** The else-branch run-completion updates both `bestLen` and
`bestEnd`, but the post-loop final-run check (lines 165–166) sets only
`bestEnd = curEnd`, leaving `bestLen` at its initial value of 0. The guard
`if (bestLen === 0) return { cutoffBin: 0, cutoffHz: 0 }` (line 169) then
returns cutoff 0 even though a valid run was found.

**Trigger:** an above-threshold run that extends to the last bin (Nyquist)
with all below-threshold bins before it — a quiet low-frequency region ≥5%
of bins, then sustained energy to Nyquist. The P5-across-bins floor
guarantees ≥5% of bins are below threshold; when concentrated at the low
end, the lone run reaching Nyquist is the "final run" and is dropped. The
locked Vitest suite does not cover this path (all `bandGrid` fixtures place
noise above the run).

**Consequence:** A genuine lossless file with energy extending to Nyquist
is misreported as cutoff 0 → verdict "No clear cutoff detected. (estimate)"
instead of "consistent with genuine lossless", defeating the product's core
verdict for that input. The common acceptance-case pair (roll-off before
Nyquist vs 128k-MP3 cliff) is unaffected.

**Correction:** Add `bestLen = curLen;` to the final-run check so the guard
fires only when no run exists:

```ts
if (curLen > bestLen) {
  bestLen = curLen;   // ← add this line
  bestEnd = curEnd;
}
```

Equivalently: use `bestEnd === -1` as the no-run sentinel.

## Items left for human confirmation

Not blockers — require a real browser and real audio files:

- Drag-and-drop / file-picker UX
- Browser console errors on a real file
- 60-second no-freeze + visible progress
- Genuine FLAC vs 128k-MP3-as-FLAC: visually different spectrograms + different verdicts
- PNG pixel-perfect match vs CSS-scaled canvas display
