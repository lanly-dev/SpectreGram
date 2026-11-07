// Cutoff estimation + verdict text. Pure: no Web Audio, no DOM. Verdict
// strings are generated ONLY here, so the "estimate" label can never be
// missed. Vitest covers this file (locked test scope).
//
// Clean-room algorithm (standard idea, not Spek's code): find the highest
// frequency with sustained energy, robust to silence and spurious spikes,
// then map cutoff/nyquist ratio to a verdict for the claimed format.

import type { DbGrid } from './stft';

export interface CutoffParams {
  /** Percentile over time per bin (captures "sustained" energy). */
  percentile: number;
  /** dB above the noise floor a bin must reach to count as "energy present". */
  headroomDb: number;
}

// TUNABLE defaults — pending real-file calibration (AGENTS.md open decision #3).
export const DEFAULT_CUTOFF: CutoffParams = {
  percentile: 85,
  headroomDb: 20,
};

// TUNABLE verdict thresholds (ratio = cutoffHz / nyquist).
export const LOSSLESS_HIGH_RATIO = 0.9; // >= this looks genuinely lossless
export const SUSPICIOUS_RATIO = 0.73; // < this for a lossless claim = "costume"

export interface CutoffResult {
  /** Highest bin index of the largest sustained-energy run. */
  cutoffBin: number;
  /** cutoffBin mapped to Hz: cutoffBin * sampleRate / ((bins-1)*2). */
  cutoffHz: number;
}

export type CanonicalFormat = 'flac' | 'wav' | 'mp3' | 'ogg' | 'm4a' | 'unknown';

/** Map a claimed format string (label, extension, or MIME subtype) to a canonical id. */
export function canonicalFormat(input: string | undefined): CanonicalFormat {
  if (!input) return 'unknown';
  const s = input.trim().toLowerCase();
  const key = s.startsWith('.') ? s.slice(1) : s;
  switch (key) {
    case 'flac':
      return 'flac';
    case 'wav':
    case 'wave':
      return 'wav';
    case 'mp3':
    case 'mpeg':
      return 'mp3';
    case 'ogg':
    case 'oga':
    case 'opus':
      return 'ogg';
    case 'm4a':
    case 'mp4':
    case 'aac':
    case 'alac':
      return 'm4a';
    default:
      return 'unknown';
  }
}

function claimLabel(fmt: CanonicalFormat): string {
  switch (fmt) {
    case 'flac':
      return 'FLAC';
    case 'wav':
      return 'WAV';
    case 'mp3':
      return 'MP3';
    case 'ogg':
      return 'Ogg';
    case 'm4a':
      return 'M4A';
    default:
      return 'Unknown';
  }
}

/**
 * Linear-interpolated percentile of a (copy of) the input values.
 * p in [0, 100]; returns 0 for empty input.
 */
function percentile(values: Float64Array, p: number): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = Float64Array.from(values).sort();
  if (n === 1) return sorted[0];
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

/**
 * Estimate the frequency cutoff from a magnitude grid.
 *
 * 1. Per-bin energy profile = percentile over time.
 * 2. Noise floor = P5 across bins (lowest-energy bins define the floor).
 * 3. Threshold = noise floor + headroomDb.
 * 4. cutoff = the max bin of the largest contiguous run above threshold.
 *    (Largest run, not "run containing bin 0", stays robust when DC is below
 *    the threshold; spurious high-freq spikes become separate small runs and
 *    are correctly ignored.)
 */
export function estimateCutoff(
  grid: DbGrid,
  sampleRate: number,
  params?: Partial<CutoffParams>,
): CutoffResult {
  // Clamp/validate cutoff params — these may plausibly be exposed as settings
  // later, so they clamp rather than throw.
  const merged: CutoffParams = { ...DEFAULT_CUTOFF, ...params };
  let percentileP = merged.percentile;
  if (!Number.isFinite(percentileP) || percentileP < 0 || percentileP > 100) {
    percentileP = DEFAULT_CUTOFF.percentile;
  }
  let headroomDb = merged.headroomDb;
  if (!Number.isFinite(headroomDb) || headroomDb <= 0) {
    headroomDb = DEFAULT_CUTOFF.headroomDb;
  }

  const bins = grid.bins;
  if (grid.frames === 0 || bins === 0 || sampleRate <= 0) {
    return { cutoffBin: 0, cutoffHz: 0 };
  }

  // Per-bin energy profile.
  const profile = new Float64Array(bins);
  const column = new Float64Array(grid.frames);
  for (let k = 0; k < bins; k++) {
    for (let t = 0; t < grid.frames; t++) {
      column[t] = grid.data[t * bins + k];
    }
    profile[k] = percentile(column, percentileP);
  }

  // Noise floor across bins, then the energy threshold.
  const noiseFloor = percentile(profile, 5);
  const threshold = noiseFloor + headroomDb;

  // Largest contiguous run above threshold; tie-break = lowest start (first
  // max-length run wins because we only replace on strictly greater length).
  let bestLen = 0;
  let bestEnd = -1;
  let curLen = 0;
  let curEnd = -1;
  for (let k = 0; k < bins; k++) {
    if (profile[k] >= threshold) {
      curLen++;
      curEnd = k;
    } else {
      if (curLen > bestLen) {
        bestLen = curLen;
        bestEnd = curEnd;
      }
      curLen = 0;
      curEnd = -1;
    }
  }
  if (curLen > bestLen) {
    bestEnd = curEnd;
  }

  if (bestLen === 0) {
    return { cutoffBin: 0, cutoffHz: 0 };
  }

  const cutoffBin = bestEnd;
  const N = (bins - 1) * 2;
  const cutoffHz = (cutoffBin * sampleRate) / N;
  return { cutoffBin, cutoffHz };
}

/**
 * Build a verdict string. Every returned string contains "estimate".
 * `cutoffHz <= 0` covers the "no clear cutoff" case; the "too short" case is
 * handled by `analyze`, which sees the empty grid.
 */
export function buildVerdict(
  cutoffHz: number,
  sampleRate: number,
  claimedFormat: string,
): string {
  const fmt = canonicalFormat(claimedFormat);

  if (sampleRate <= 0) {
    return 'No clear cutoff detected. (estimate)';
  }
  if (cutoffHz <= 0) {
    return 'No clear cutoff detected. (estimate)';
  }

  const nyquist = sampleRate / 2;
  const ratio = cutoffHz / nyquist;
  const khz = (cutoffHz / 1000).toFixed(1);
  const claim = claimLabel(fmt);

  const lossless = fmt === 'flac' || fmt === 'wav';
  if (lossless) {
    if (ratio >= LOSSLESS_HIGH_RATIO) {
      return `Claims ${claim}. Cutoff ≈${khz} kHz — consistent with genuine lossless. (estimate)`;
    }
    if (ratio < SUSPICIOUS_RATIO) {
      return `Claims ${claim}. Cutoff ≈${khz} kHz — smells like a 128k MP3 in a costume. (estimate)`;
    }
    return `Claims ${claim}. Cutoff ≈${khz} kHz — inconclusive; could be filtered or upsampled. (estimate)`;
  }

  if (fmt === 'm4a') {
    return `Claims ${claim}. Cutoff ≈${khz} kHz — format is lossy-or-lossless ambiguous; no disguise call made. (estimate)`;
  }
  if (fmt === 'unknown') {
    return `Claims ${claim}. Cutoff ≈${khz} kHz — format unknown; no disguise call made. (estimate)`;
  }

  // mp3, ogg — lossy; no "costume" accusation.
  return `Claims ${claim}. Cutoff ≈${khz} kHz — normal for lossy compression. (estimate)`;
}

/** Full analysis: cutoff + verdict. The empty-grid ("too short") case is decided here. */
export function analyze(
  grid: DbGrid,
  sampleRate: number,
  claimedFormat: string,
  params?: Partial<CutoffParams>,
): { cutoff: CutoffResult; verdict: string } {
  if (grid.frames === 0) {
    return {
      cutoff: { cutoffBin: 0, cutoffHz: 0 },
      verdict: 'Audio too short to estimate a cutoff. (estimate)',
    };
  }
  const cutoff = estimateCutoff(grid, sampleRate, params);
  const verdict = buildVerdict(cutoff.cutoffHz, sampleRate, claimedFormat);
  return { cutoff, verdict };
}
