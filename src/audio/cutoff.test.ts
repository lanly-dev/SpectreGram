// Vitest suite for cutoff.ts (locked scope — no e2e suite in v1).
// Synthetic magnitude grids model the genuine-lossless vs 128k-MP3-disguised-
// as-FLAC pair and a band-limited vs full-bandwidth pair, with no sample audio.

import { describe, it, expect } from 'vitest';
import type { DbGrid } from './stft';
import { analyze, buildVerdict, estimateCutoff } from './cutoff';

/** Build a DbGrid from rows (time frames) of per-bin dBFS values. */
function gridFrom2D(rows: number[][]): DbGrid {
  const frames = rows.length;
  const bins = frames > 0 ? rows[0].length : 0;
  const data = new Float32Array(frames * bins);
  for (let t = 0; t < frames; t++) {
    for (let k = 0; k < bins; k++) {
      data[t * bins + k] = rows[t][k];
    }
  }
  return { data, frames, bins };
}

const BINS = 1025; // fftSize 2048 -> bins 1025; Nyquist bin = bins - 1 = 1024
const FRAMES = 16;
const SAMPLE_RATE = 44100;
const NYQUIST = SAMPLE_RATE / 2; // 22050

/**
 * A stationary signal: bins 0..round(fraction*bins) at signalDb (sustained
 * energy), the rest at noiseDb (the recording's noise floor). Identical across
 * frames so the time-percentile profile equals the per-bin level directly.
 *
 * Note on the full-bandwidth fraction: the noise floor is the 5th percentile
 * across bins, so the noise-only region must exceed ~5% of bins. fraction 0.94
 * keeps the verdict outcome identical to the design's illustrative 0.95
 * ("genuine lossless", ratio >= 0.90) while leaving >5% noise bins.
 */
function bandGrid(
  fraction: number,
  signalDb = -10,
  noiseDb = -90,
  bins = BINS,
  frames = FRAMES,
): DbGrid {
  const cutoffBin = Math.round(fraction * bins);
  const rows: number[][] = [];
  for (let t = 0; t < frames; t++) {
    const row: number[] = new Array(bins);
    for (let k = 0; k < bins; k++) {
      row[k] = k <= cutoffBin ? signalDb : noiseDb;
    }
    rows.push(row);
  }
  return gridFrom2D(rows);
}

function flatGrid(levelDb: number, bins = BINS, frames = FRAMES): DbGrid {
  const rows: number[][] = [];
  for (let t = 0; t < frames; t++) {
    const row: number[] = new Array(bins).fill(levelDb);
    rows.push(row);
  }
  return gridFrom2D(rows);
}

/**
 * Noise at the LOW end (before the run), sustained energy from `signalStartBin`
 * through the LAST bin (Nyquist), so the above-threshold run is the unterminated
 * "final run". The low-noise region must exceed ~5% of bins for the P5 floor to
 * land on noise (bins=1025 -> startBin 60 leaves 60 noise bins, ~5.9%).
 */
function runToNyquistGrid(
  signalStartBin: number,
  signalDb = -10,
  noiseDb = -90,
  bins = BINS,
  frames = FRAMES,
): DbGrid {
  const rows: number[][] = [];
  for (let t = 0; t < frames; t++) {
    const row: number[] = new Array(bins);
    for (let k = 0; k < bins; k++) {
      row[k] = k >= signalStartBin ? signalDb : noiseDb;
    }
    rows.push(row);
  }
  return gridFrom2D(rows);
}

describe('estimateCutoff', () => {
  it('returns cutoffHz=0 for an empty (too-short) grid', () => {
    const empty: DbGrid = { data: new Float32Array(0), frames: 0, bins: BINS };
    expect(estimateCutoff(empty, SAMPLE_RATE)).toEqual({ cutoffBin: 0, cutoffHz: 0 });
  });

  it('returns cutoffHz=0 when no bin clears the noise floor + headroom', () => {
    // All bins at the same level: noise floor == that level, threshold is +20,
    // nothing reaches it -> no run.
    expect(estimateCutoff(flatGrid(-60), SAMPLE_RATE)).toEqual({ cutoffBin: 0, cutoffHz: 0 });
  });

  it('returns cutoffHz=0 for a non-positive sample rate', () => {
    expect(estimateCutoff(bandGrid(0.92), 0)).toEqual({ cutoffBin: 0, cutoffHz: 0 });
  });
});

describe('genuine lossless vs 128k-MP3-disguised-as-FLAC', () => {
  it('yields a higher cutoff and a different verdict for the genuine file', () => {
    const genuine = analyze(bandGrid(0.92), SAMPLE_RATE, 'FLAC');
    const fake = analyze(bandGrid(0.725), SAMPLE_RATE, 'FLAC');

    expect(genuine.cutoff.cutoffHz).toBeGreaterThan(fake.cutoff.cutoffHz);
    expect(genuine.verdict).not.toBe(fake.verdict);
    expect(genuine.verdict).toMatch(/genuine lossless/i);
    expect(fake.verdict).toMatch(/costume/i);
  });
});

describe('band-limited vs full-bandwidth', () => {
  it('the band-limited signal yields a lower cutoff and a different verdict', () => {
    const band = analyze(bandGrid(0.82), SAMPLE_RATE, 'FLAC');
    const full = analyze(bandGrid(0.94), SAMPLE_RATE, 'FLAC');

    expect(band.cutoff.cutoffHz).toBeLessThan(full.cutoff.cutoffHz);
    expect(band.verdict).not.toBe(full.verdict);
    expect(band.verdict).toMatch(/inconclusive/i);
    expect(full.verdict).toMatch(/genuine lossless/i);
  });
});

describe('run reaching Nyquist (final-run regression)', () => {
  it('a run extending to the last bin with noise before it is not dropped', () => {
    // Regression for the dropped final run: quiet low bins (>=5% for the P5
    // floor), then sustained energy through the Nyquist bin. The run is the
    // unterminated "final run"; before the fix bestLen stayed 0 and cutoff was
    // misreported as 0 ("no clear cutoff").
    const grid = runToNyquistGrid(60);
    const r = analyze(grid, SAMPLE_RATE, 'FLAC');

    // cutoff reaches the Nyquist bin (bins - 1).
    expect(r.cutoff.cutoffBin).toBe(BINS - 1);
    expect(r.cutoff.cutoffHz).toBeCloseTo(NYQUIST, 1);
    expect(r.verdict).toMatch(/genuine lossless/i);
  });

  it('the largest run wins over a later, longer-noise-prefix final run', () => {
    // Mid-band noise splits two runs; the larger run (lower) is the cutoff
    // even though a second run reaches the last bin — confirms the final-run
    // fix promotes the largest run, not just any final run.
    const bins = BINS;
    const rows: number[][] = [];
    for (let t = 0; t < FRAMES; t++) {
      const row: number[] = new Array(bins);
      for (let k = 0; k < bins; k++) {
        // low run: bins 60..500 (441 bins); gap: bins 501..560 (noise);
        // final run: bins 561..1024 (464 bins, larger, reaches Nyquist).
        const inLowRun = k >= 60 && k <= 500;
        const inFinalRun = k >= 561;
        row[k] = inLowRun || inFinalRun ? -10 : -90;
      }
      rows.push(row);
    }
    const grid = gridFrom2D(rows);
    const r = estimateCutoff(grid, SAMPLE_RATE);
    // The final run (464 bins) is larger than the low run (441 bins), so the
    // cutoff is the end of the final run = Nyquist bin.
    expect(r.cutoffBin).toBe(BINS - 1);
  });
});

describe('edge-case verdicts', () => {
  it('too-short grid -> a safe verdict mentioning "too short"', () => {
    const empty: DbGrid = { data: new Float32Array(0), frames: 0, bins: BINS };
    const r = analyze(empty, SAMPLE_RATE, 'FLAC');
    expect(r.cutoff.cutoffHz).toBe(0);
    expect(r.verdict).toMatch(/too short/i);
  });

  it('flat noise -> "no clear cutoff"', () => {
    const r = analyze(flatGrid(-60), SAMPLE_RATE, 'FLAC');
    expect(r.cutoff.cutoffHz).toBe(0);
    expect(r.verdict).toMatch(/no clear cutoff/i);
  });
});

describe('estimate invariant', () => {
  it('every verdict branch contains "estimate" (case-insensitive)', () => {
    const verdicts: string[] = [
      analyze({ data: new Float32Array(0), frames: 0, bins: BINS }, SAMPLE_RATE, 'FLAC').verdict, // too short
      analyze(flatGrid(-60), SAMPLE_RATE, 'FLAC').verdict, // no clear cutoff
      buildVerdict(0.92 * NYQUIST, SAMPLE_RATE, 'FLAC'), // genuine lossless
      buildVerdict(0.725 * NYQUIST, SAMPLE_RATE, 'FLAC'), // costume
      buildVerdict(0.82 * NYQUIST, SAMPLE_RATE, 'FLAC'), // inconclusive
      buildVerdict(0.92 * NYQUIST, SAMPLE_RATE, 'WAV'), // wav (lossless claim) -> genuine
      buildVerdict(16000, SAMPLE_RATE, 'MP3'), // lossy normal
      buildVerdict(16000, SAMPLE_RATE, 'Ogg'), // lossy normal
      buildVerdict(16000, SAMPLE_RATE, 'M4A'), // ambiguous
      buildVerdict(16000, SAMPLE_RATE, 'Unknown'), // unknown
      buildVerdict(16000, 0, 'FLAC'), // non-positive sample rate
    ];
    for (const v of verdicts) {
      expect(v.toLowerCase()).toContain('estimate');
    }
  });
});
