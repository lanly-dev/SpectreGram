// Spectral message encoder (spec: .kiro/specs/spectral-message/, R2/R3/R5).
// Pure: no DOM, no Web Audio — runs in the embed worker and in Node tests.
//
// A spectrogram plots time left→right and frequency bottom→top, so drawing a
// pixel at (time t, frequency f) means putting sound at f during t. How that
// sound is made is the style (R3b): hiss (band-limited noise), warble
// (wobbling tones) or sparkle (short grains).

import FFT from 'fft.js';
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
/** Fade at every on/off edge of a warble tone (raised cosine). Hard edges
 *  would click, and a click splashes energy across every frequency up to
 *  Nyquist (R3); long, soft fades make tones swell instead of stutter (R3a).
 *  (Steady tones at −30/−44 dBFS were removed in R3b: they hurt to hear.) */
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


// --- Synthesis: three sound styles (R3b) ------------------------------------
// The letters don't have to be drawn with straight lines. Steady tones (one
// held sine per row) were dropped: 32 of them read as a constant whine.

export type MessageStyle = 'hiss' | 'warble' | 'sparkle';
export const MESSAGE_STYLES: readonly MessageStyle[] = ['hiss', 'warble', 'sparkle'];

/** Per-style levels (TUNABLE), set so all three are equally visible over a
 *  music-like background (+4 dB in the temporary check), so the styles can
 *  be compared on sound alone. Message loudness then lands near −34 dBFS
 *  RMS for each. */
/** hiss: sinusoid-equivalent amplitude per FFT bin (≈ −52 dBFS). */
export const HISS_BIN_AMP = 0.0025;
/** warble: peak amplitude of each wobbling oscillator (≈ −39 dBFS). */
export const WARBLE_AMP = 0.011;
/** sparkle: peak amplitude of each grain (≈ −40 dBFS; grains are brief). */
export const SPARKLE_AMP = 0.0095;

const HISS_FFT = 2048;
const HISS_HOP = HISS_FFT / 4;
/** warble: vibrato depth, in row spacings, and rate range (Hz). */
const WARBLE_DEPTH_ROWS = 1;
const WARBLE_RATE_MIN = 3;
const WARBLE_RATE_MAX = 6;
/** warble: samples per pitch update (the wobble is slow, so this is inaudible). */
const WARBLE_BLOCK = 32;
/** sparkle: grain length and grains per second of column time per cell. */
const SPARKLE_GRAIN_SEC = 0.06;
const SPARKLE_RATE = 12;
/** Fade over the whole message (capped at 10% of its length). */
const MESSAGE_FADE_SEC = 1;

function rowStepHz(layout: MessageLayout): number {
  const f = layout.rowFreqs;
  return f.length > 1 ? (f[0] - f[f.length - 1]) / (f.length - 1) : 0;
}

/** hiss: overlap-add noise, filled where the current column's rows are on. */
function synthHiss(msg: Float32Array, sr: number, mask: TextMask, layout: MessageLayout, rand: () => number): void {
  const L = HISS_FFT;
  const fft = new FFT(L);
  const spec = fft.createComplexArray();
  const out = fft.createComplexArray();
  const win = new Float64Array(L);
  for (let n = 0; n < L; n++) win[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / L); // periodic Hann
  const binHz = sr / L;
  const step = rowStepHz(layout);
  const fHi = layout.rowFreqs[0];
  const fLo = layout.rowFreqs[mask.rows - 1];
  const kLo = Math.max(1, Math.ceil((fLo - step / 2) / binHz));
  const kHi = Math.min(L / 2 - 1, Math.floor((fHi + step / 2) / binHz));
  const binRow = new Int32Array(kHi - kLo + 1);
  for (let k = kLo; k <= kHi; k++) {
    binRow[k - kLo] = Math.min(mask.rows - 1, Math.max(0, Math.round((fHi - k * binHz) / step)));
  }
  // fft.js's inverse divides by L, so a bin pair of magnitude M gives a
  // sinusoid of amplitude 2M/L.
  const M = (HISS_BIN_AMP * L) / 2;
  const len = msg.length;
  for (let s = -L / 2; s < len; s += HISS_HOP) {
    const c = Math.floor((s + L / 2) / layout.colSamples);
    if (c < 0 || c >= mask.cols) continue;
    spec.fill(0);
    let any = false;
    for (let k = kLo; k <= kHi; k++) {
      if (!mask.data[binRow[k - kLo] * mask.cols + c]) continue;
      const ph = rand() * 2 * Math.PI;
      const re = M * Math.cos(ph);
      const im = M * Math.sin(ph);
      spec[2 * k] = re;
      spec[2 * k + 1] = im;
      spec[2 * (L - k)] = re; // Hermitian mirror → real output
      spec[2 * (L - k) + 1] = -im;
      any = true;
    }
    if (!any) continue;
    fft.inverseTransform(out, spec);
    const n0 = Math.max(0, -s);
    const n1 = Math.min(L, len - s);
    for (let n = n0; n < n1; n++) msg[s + n] += out[2 * n] * win[n];
  }
}

/** Raised-cosine run envelope: 0 → 1 over `rr` samples at both ends. */
function runGain(i: number, n: number, rr: number): number {
  const x = rr > 0 ? Math.min(1, i / rr, (n - 1 - i) / rr) : 1;
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

/** warble: half as many oscillators, each wobbling ± one row in pitch. */
function synthWarble(msg: Float32Array, sr: number, mask: TextMask, layout: MessageLayout, rand: () => number): void {
  const step = rowStepHz(layout);
  const ramp = Math.max(1, Math.round(RAMP_SEC * sr));
  const colStart = (c: number): number => Math.min(msg.length, Math.round(c * layout.colSamples));
  const on = (r0: number, r1: number, c: number): boolean =>
    !!mask.data[r0 * mask.cols + c] || !!mask.data[r1 * mask.cols + c];
  for (let r0 = 0; r0 < mask.rows; r0 += 2) {
    const r1 = Math.min(r0 + 1, mask.rows - 1);
    const f0 = (layout.rowFreqs[r0] + layout.rowFreqs[r1]) / 2;
    const depth = WARBLE_DEPTH_ROWS * step;
    const rate = WARBLE_RATE_MIN + rand() * (WARBLE_RATE_MAX - WARBLE_RATE_MIN);
    const lfoW = (2 * Math.PI * rate) / sr;
    const lfoPh0 = rand() * 2 * Math.PI;
    const ph0 = rand() * 2 * Math.PI;
    let re = Math.cos(ph0);
    let im = Math.sin(ph0);
    let c = 0;
    while (c < mask.cols) {
      if (!on(r0, r1, c)) {
        c++;
        continue;
      }
      let e = c;
      while (e + 1 < mask.cols && on(r0, r1, e + 1)) e++;
      const a = colStart(c);
      const n = colStart(e + 1) - a;
      const rr = Math.min(ramp, Math.floor(n / 2));
      // The wobble (3–6 Hz) changes slowly, so the pitch is updated once per
      // WARBLE_BLOCK samples and the sine is a rotating phasor in between —
      // no per-sample Math.sin (this was ~10× slower).
      for (let i = 0; i < n; i += WARBLE_BLOCK) {
        const m = Math.min(WARBLE_BLOCK, n - i);
        // LFO phase from the absolute sample, so the wobble is continuous.
        const f = f0 + depth * Math.sin(lfoPh0 + lfoW * (a + i + m / 2));
        const w = (2 * Math.PI * f) / sr;
        const cw = Math.cos(w);
        const sw = Math.sin(w);
        for (let j = 0; j < m; j++) {
          const k = i + j;
          const gain = k >= rr && k < n - rr ? 1 : runGain(k, n, rr);
          msg[a + k] += WARBLE_AMP * gain * im;
          const nre = re * cw - im * sw;
          im = im * cw + re * sw;
          re = nre;
        }
        const mag = Math.hypot(re, im); // keep |phasor| = 1 (rounding drift)
        re /= mag;
        im /= mag;
      }
      c = e + 1;
    }
  }
}

/** sparkle: short twinkling grains at random times inside each "on" cell. */
function synthSparkle(msg: Float32Array, sr: number, mask: TextMask, layout: MessageLayout, rand: () => number): void {
  const g = Math.max(8, Math.round(SPARKLE_GRAIN_SEC * sr));
  const win = new Float64Array(g);
  for (let n = 0; n < g; n++) win[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (g - 1));
  const step = rowStepHz(layout);
  const perCell = Math.max(1, Math.round((layout.colSamples / sr) * SPARKLE_RATE));
  for (let r = 0; r < mask.rows; r++) {
    for (let c = 0; c < mask.cols; c++) {
      if (!mask.data[r * mask.cols + c]) continue;
      for (let k = 0; k < perCell; k++) {
        const start = Math.round((c + rand()) * layout.colSamples - g / 2);
        const f = layout.rowFreqs[r] + (rand() - 0.5) * step;
        const w = (2 * Math.PI * f) / sr;
        const cw = Math.cos(w);
        const sw = Math.sin(w);
        const p0 = rand() * 2 * Math.PI;
        let re = Math.cos(p0);
        let im = Math.sin(p0);
        for (let n = 0; n < g; n++) {
          const i = start + n;
          if (i >= 0 && i < msg.length) msg[i] += SPARKLE_AMP * win[n] * im;
          const nre = re * cw - im * sw;
          im = im * cw + re * sw;
          re = nre;
        }
      }
    }
  }
}

/**
 * Add the message to every channel in place, in the chosen sound style. If
 * the result would clip, every channel is scaled by 0.999 / peak. Returns
 * that scale (1 = unchanged).
 */
export function embedMessage(
  channels: Float32Array[],
  sampleRate: number,
  mask: TextMask,
  layout: MessageLayout,
  style: MessageStyle = 'hiss',
  rand: () => number = Math.random,
): number {
  const { startSample, endSample } = layout;
  const len = endSample - startSample;
  const msg = new Float32Array(len);
  if (style === 'warble') synthWarble(msg, sampleRate, mask, layout, rand);
  else if (style === 'sparkle') synthSparkle(msg, sampleRate, mask, layout, rand);
  else synthHiss(msg, sampleRate, mask, layout, rand);

  // Ease the whole message in and out, so it never starts abruptly.
  const fade = Math.min(Math.round(MESSAGE_FADE_SEC * sampleRate), Math.floor(len * 0.1));
  for (let i = 0; i < fade; i++) {
    const gn = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    msg[i] *= gn;
    msg[len - 1 - i] *= gn;
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