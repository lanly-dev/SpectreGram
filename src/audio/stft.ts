// Pure STFT core. No DOM, no Web Worker globals, no side effects on import.
// Importable by the Web Worker (stft-worker.ts) AND by Node/Vitest/scripts.
// Clean-room: standard DSP written from the idea, not from Spek's source.
//
// Pipeline: Hann-windowed frames -> fft.js realTransform -> single-sided
// magnitude normalized to dBFS, clamped to [-dynRangeDb, 0]. One Float32Array
// (row-major: frame-major, bins per frame) is returned as a `DbGrid`.

import FFT from 'fft.js';

export interface StftParams {
  /** FFT length; must be a power of two (fft.js radix requirement). */
  fftSize: number;
  /** Frame step in samples. */
  hopSize: number;
  /** Window function id. Only 'hann' is supported in v1. */
  window: 'hann';
  /** Display/capture dynamic range in dBFS; the magnitude floor is -dynRangeDb. */
  dynRangeDb: number;
}

// TUNABLE defaults — sensible DSP choices, not final-calibrated values.
export const DEFAULT_STFT: StftParams = {
  fftSize: 2048,
  hopSize: 1024, // 50% overlap
  window: 'hann',
  dynRangeDb: 120,
};

export interface DbGrid {
  /** Row-major magnitude grid in dBFS: data[frame * bins + bin]. */
  data: Float32Array;
  /** Number of time frames. */
  frames: number;
  /** Number of frequency bins = fftSize / 2 + 1. */
  bins: number;
}

// Post progress at most every N frames so the worker can relay without flooding.
// TUNABLE.
const PROGRESS_EVERY = 64;

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Compute a magnitude spectrogram in dBFS.
 *
 * @param samples  mono time-domain samples (e.g. decode's mixdown)
 * @param params   optional overrides for DEFAULT_STFT
 * @param onProgress optional callback receiving a fraction in [0,1]
 * @returns a DbGrid (empty `{ frames: 0 }` if too short for one frame)
 * @throws RangeError if fftSize is not a power of two or hopSize/dynRangeDb <= 0
 */
export function computeStft(
  samples: Float32Array,
  params?: Partial<StftParams>,
  onProgress?: (fraction: number) => void,
): DbGrid {
  const p: StftParams = { ...DEFAULT_STFT, ...params };
  const N = p.fftSize;

  if (!isPowerOfTwo(N)) {
    throw new RangeError(`fftSize must be a power of two, got ${N}`);
  }
  if (p.hopSize <= 0) {
    throw new RangeError(`hopSize must be > 0, got ${p.hopSize}`);
  }
  if (p.dynRangeDb <= 0) {
    throw new RangeError(`dynRangeDb must be > 0, got ${p.dynRangeDb}`);
  }
  if (p.window !== 'hann') {
    throw new RangeError(`window "${p.window}" is not supported (v1: 'hann' only)`);
  }

  const bins = N / 2 + 1;

  if (samples.length < N) {
    // Too short for even one frame — caller (cutoff/render) handles the empty grid.
    return { data: new Float32Array(0), frames: 0, bins };
  }

  const frames = Math.floor((samples.length - N) / p.hopSize) + 1;

  // Precompute the Hann window and its coherent sum.
  // w[n] = 0.5 * (1 - cos(2*pi*n / (N-1)))  — symmetric, w[0]=0, w[N-1]=0.
  const win = new Float64Array(N);
  let windowSum = 0;
  for (let n = 0; n < N; n++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
    win[n] = w;
    windowSum += w;
  }

  // One FFT instance + reused buffers across all frames.
  const fft = new FFT(N);
  const out = fft.createComplexArray(); // complex, length 2N, zero-filled
  const frame = new Float64Array(N); // real, length N, overwritten per frame

  const data = new Float32Array(frames * bins);
  const floor = -p.dynRangeDb;
  // Normalizes a full-scale sine landing exactly on a bin to ~1.0 (0 dBFS).
  // The factor of 2 accounts for the single-sided spectrum (energy is split
  // between the positive and negative frequencies).
  const normFactor = 2 / windowSum;

  for (let f = 0; f < frames; f++) {
    const start = f * p.hopSize;

    // Window the frame in place. No zero-padding of a short trailing frame:
    // the loop only emits frames where a full N samples exist, keeping
    // magnitudes honest (the dropped tail is at most N samples).
    for (let n = 0; n < N; n++) {
      frame[n] = samples[start + n] * win[n];
    }

    fft.realTransform(out, frame);

    const base = f * bins;
    for (let k = 0; k < bins; k++) {
      const re = out[2 * k];
      const im = out[2 * k + 1];
      const mag = Math.sqrt(re * re + im * im);
      const magNorm = mag * normFactor;
      let db = 20 * Math.log10(Math.max(magNorm, 1e-12));
      if (db < floor) db = floor;
      if (db > 0) db = 0;
      data[base + k] = db;
    }

    if (onProgress && (f + 1) % PROGRESS_EVERY === 0) {
      onProgress((f + 1) / frames);
    }
  }
  if (onProgress) onProgress(1);

  return { data, frames, bins };
}

/**
 * STFT of one time segment, sized for display (the zoomed view): about
 * `columns` frames whose window centers are evenly spaced from `startSample`
 * to `endSample`. The hop shrinks with the segment, so a zoomed view gets
 * fresh detail instead of a stretched overview. Windows reaching past either
 * end of the signal are zero-padded, so the first and last columns sit
 * exactly on the segment edges.
 */
export function computeStftSegment(
  samples: Float32Array,
  startSample: number,
  endSample: number,
  columns: number,
  params?: Partial<StftParams>,
): DbGrid {
  const p: StftParams = { ...DEFAULT_STFT, ...params };
  const N = p.fftSize;
  const half = Math.floor(N / 2);
  const start = Math.max(0, Math.min(samples.length, Math.round(startSample)));
  const end = Math.max(0, Math.min(samples.length, Math.round(endSample)));
  const span = end - start;
  if (span <= 0 || columns < 1) {
    return { data: new Float32Array(0), frames: 0, bins: half + 1 };
  }

  // Window f covers [lo + f·hop, lo + f·hop + N), so its center is start + f·hop.
  const lo = start - half;
  const hi = end + half;
  let seg: Float32Array;
  if (lo >= 0 && hi <= samples.length) {
    seg = samples.subarray(lo, hi); // no copy in the common (interior) case
  } else {
    seg = new Float32Array(hi - lo);
    const a = Math.max(0, lo);
    const b = Math.min(samples.length, hi);
    if (b > a) seg.set(samples.subarray(a, b), a - lo);
  }
  const hopSize = Math.max(1, Math.ceil(span / columns));
  return computeStft(seg, { ...p, hopSize });
}
