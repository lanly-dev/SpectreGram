// Spectral message encoder (spec: .kiro/specs/spectral-message/, R2/R3/R5).
// Pure: no DOM, no Web Audio — runs in the embed worker and in Node tests.
//
// A spectrogram plots time left→right and frequency bottom→top, so drawing a
// pixel at (time t, frequency f) means playing a sine at f during t. Each row
// of the text mask becomes one sine; its gain follows that row of the mask
// over time.

import { stftParamsFor } from '../audio/stft';
import type { TextMask } from './raster';

/** Message band, as fractions of Nyquist (≈ 11–16 kHz at 48 kHz). High
 *  enough that hearing is far less sensitive and music has little energy
 *  (so quiet tones still read clearly), and the top (0.66) stays below the
 *  analyzer's "costume" line (SUSPICIOUS_RATIO 0.73 in cutoff.ts), so a
 *  haunted file can never read as more lossless than its source (R3, R3a).
 *  History: 0.22–0.50 (≈ 5–12 kHz) was near peak hearing sensitivity and
 *  made the result unpleasant to listen to. */
export const BAND_LO = 0.46;
export const BAND_HI = 0.66;
/** Peak amplitude of each row's sine (≈ −44 dBFS). TUNABLE: louder reads
 *  better but is easier to hear. History: −30 dBFS in the old band was
 *  readable but made listeners' ears feel bad (R3a). */
export const ROW_AMP = 0.006;
/** Fade at every on/off edge (raised cosine). Hard edges would click, and a
 *  click splashes energy across every frequency up to Nyquist (R3); long,
 *  soft fades make tones swell in and out instead of stuttering (R3a). */
export const RAMP_SEC = 0.02;

// Full-track view geometry (render.ts FIXED_W × FIXED_H, linear 0…Nyquist):
// used to size the text so it reads with its natural shape there.
const VIEW_W = 1024;
const VIEW_H = 512;
/** Widest the message may get, as a share of the track. */
const MAX_WIDTH_FRAC = 0.9;

export interface MessageLayout {
  /** First and one-past-last sample of the message window. */
  startSample: number;
  endSample: number;
  /** Samples per mask column (fractional). */
  colSamples: number;
  /** Frequency of each mask row, row 0 (top of the text) highest. */
  rowFreqs: Float64Array;
}

/** Frames in the full-track view for a track of `sampleCount` samples. */
export function fullViewFrames(sampleCount: number): number {
  const p = stftParamsFor(sampleCount);
  if (sampleCount < p.fftSize) return 0;
  return Math.floor((sampleCount - p.fftSize) / p.hopSize) + 1;
}

/**
 * Where and how big the message goes, or null if it can't be drawn legibly
 * (R5): every mask column must span at least one full-view frame, otherwise
 * thin strokes fall between frames and vanish.
 */
export function layoutMessage(mask: TextMask, sampleCount: number, sampleRate: number): MessageLayout | null {
  const frames = fullViewFrames(sampleCount);
  if (mask.cols < 1 || mask.rows < 2 || frames < 1 || !(sampleRate > 0)) return null;
  const minFrac = mask.cols / frames; // one frame per column
  if (minFrac > MAX_WIDTH_FRAC) return null;
  const bandPx = (BAND_HI - BAND_LO) * VIEW_H;
  const naturalFrac = (mask.cols * bandPx) / mask.rows / VIEW_W;
  const widthFrac = Math.min(MAX_WIDTH_FRAC, Math.max(naturalFrac, minFrac));
  const widthSamples = widthFrac * sampleCount;
  const startSample = Math.round((sampleCount - widthSamples) / 2);
  const nyq = sampleRate / 2;
  const fLo = BAND_LO * nyq;
  const fHi = BAND_HI * nyq;
  const rowFreqs = new Float64Array(mask.rows);
  for (let r = 0; r < mask.rows; r++) rowFreqs[r] = fHi - (r * (fHi - fLo)) / (mask.rows - 1);
  return {
    startSample,
    endSample: Math.min(sampleCount, startSample + Math.round(widthSamples)),
    colSamples: widthSamples / mask.cols,
    rowFreqs,
  };
}

/**
 * Add the message tones to every channel in place. If the result would clip,
 * every channel is scaled by 0.999 / peak. Returns that scale (1 = unchanged).
 */
export function embedMessage(
  channels: Float32Array[],
  sampleRate: number,
  mask: TextMask,
  layout: MessageLayout,
  rand: () => number = Math.random,
): number {
  const { startSample, endSample, colSamples, rowFreqs } = layout;
  const len = endSample - startSample;
  const msg = new Float32Array(len);
  const ramp = Math.max(1, Math.round(RAMP_SEC * sampleRate));
  const colStart = (c: number): number => Math.min(len, Math.round(c * colSamples));

  for (let r = 0; r < mask.rows; r++) {
    const w = (2 * Math.PI * rowFreqs[r]) / sampleRate;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    // Random start phase, so the rows don't line up and add in phase.
    const ph = rand() * 2 * Math.PI;
    let re = Math.cos(ph);
    let im = Math.sin(ph);
    const row = r * mask.cols;
    let c = 0;
    while (c < mask.cols) {
      if (!mask.data[row + c]) {
        c++;
        continue;
      }
      // One run of consecutive "on" columns: fade in, hold, fade out.
      let e = c;
      while (e + 1 < mask.cols && mask.data[row + e + 1]) e++;
      const a = colStart(c);
      const b = colStart(e + 1);
      const n = b - a;
      const rr = Math.min(ramp, Math.floor(n / 2));
      for (let i = 0; i < n; i++) {
        const x = rr > 0 ? Math.min(1, i / rr, (n - 1 - i) / rr) : 1;
        const g = 0.5 - 0.5 * Math.cos(Math.PI * x); // raised-cosine fade
        msg[a + i] += ROW_AMP * g * im;
        // Rotate the phasor by w: one sample of a sine, no Math.sin call.
        const nre = re * cw - im * sw;
        im = im * cw + re * sw;
        re = nre;
        if ((i & 4095) === 4095) {
          const m = Math.hypot(re, im); // keep |phasor| = 1 (rounding drift)
          re /= m;
          im /= m;
        }
      }
      c = e + 1;
    }
  }

  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < len; i++) ch[startSample + i] += msg[i];
    for (let i = 0; i < ch.length; i++) {
      const v = Math.abs(ch[i]);
      if (v > peak) peak = v;
    }
  }
  if (peak <= 0.999) return 1;
  const scale = 0.999 / peak;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= scale;
  return scale;
}
