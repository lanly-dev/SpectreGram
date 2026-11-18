// Spectral message encoder (spec: .kiro/specs/spectral-message/, R2/R3/R5).
// Pure: no DOM, no Web Audio — runs in the embed worker and in Node tests.
//
// A spectrogram plots time left→right and frequency bottom→top, so drawing a
// pixel at (time t, frequency f) means putting sound at f during t. Here that
// sound is short twinkling grains whose loudness blends with the track
// (R3b, R3c).

import FFT from 'fft.js';
import { computeStft, stftParamsFor } from '../audio/stft';
import { analyze, LOSSLESS_HIGH_RATIO, SUSPICIOUS_RATIO } from '../audio/cutoff';
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



// --- Synthesis: blended sparkle (R3b, R3c) -----------------------------------
// The letters are drawn with short twinkling grains at random moments, and
// every grain's loudness is calibrated to the track: a fixed margin above how
// loud the original already is at that moment and pitch, between a floor and
// a ceiling. Quiet passages get quiet sparkles; busy ones never get loud ones.
// (Steady tones, hiss and warble were tried and removed: R3a, R3b.)

/** Grain loudness above the (dimmed) track's own level at that moment and pitch.
 *  TUNABLE. +14 dB with the band dimmed 12 dB puts the grains near the band's
 *  original level, so the band gets no louder overall. (+8 dB read only
 *  +3 dB visible: grains are brief and only partly caught by each frame.) */
export const BLEND_MARGIN_DB = 14;
/** Floor (≈ −66 dBFS): grains still show over silence. TUNABLE. */
export const SPARKLE_MIN_AMP = 0.0005;
/** Ceiling relative to the ORIGINAL (undimmed) level in that cell (R3f): at
 *  0 dB, grains replace what the dimming took out instead of adding
 *  loudness. TUNABLE. (A fixed −46 dBFS ceiling sat below real music's band
 *  level, so letters never showed.) */
export const GRAIN_CAP_OVER_ORIGINAL_DB = 0;
/** Absolute ceiling, whatever the music (≈ −34 dBFS). TUNABLE. */
export const SPARKLE_ABS_MAX_AMP = 0.02;
/** Grain length: longer = gentler, less clicky twinkles (was 60 ms). */
const SPARKLE_GRAIN_SEC = 0.08;
/** Grains per second of column time, per "on" cell (at least 1). Was 12;
 *  doubled so letters read as solid shapes (R3f). */
const SPARKLE_RATE = 24;
/** Fade over the whole message (capped at 10% of its length). */
const MESSAGE_FADE_SEC = 1;
/** Background analysis: same window size as the analyzer. */
const BLEND_FFT = 2048;
/** Smooth the background over ± this many columns, so levels don't jump. */
const BLEND_SMOOTH_COLS = 2;

function rowStepHz(layout: MessageLayout): number {
  const f = layout.rowFreqs;
  return f.length > 1 ? (f[0] - f[f.length - 1]) / (f.length - 1) : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * How loud the track already is in every mask cell: the median magnitude of
 * that row's frequency bins over three frames in that column (start, middle,
 * end), normalized like the analyzer (a full-scale sine reads 1.0), then
 * smoothed over neighbouring columns in dB. Returns `rows × cols` linear
 * amplitudes.
 */
export function measureBackground(mono: Float32Array, sr: number, mask: TextMask, layout: MessageLayout): Float32Array {
  const L = BLEND_FFT;
  const fft = new FFT(L);
  const out = fft.createComplexArray();
  const frame = new Float64Array(L);
  const win = new Float64Array(L);
  let winSum = 0;
  for (let n = 0; n < L; n++) {
    win[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (L - 1))); // the analyzer's window
    winSum += win[n];
  }
  const norm = 2 / winSum;
  const binHz = sr / L;
  const step = rowStepHz(layout);
  const rowBins: Array<[number, number]> = [];
  for (let r = 0; r < mask.rows; r++) {
    const f = layout.rowFreqs[r];
    const k0 = Math.max(1, Math.ceil((f - step / 2) / binHz));
    const k1 = Math.min(L / 2 - 1, Math.max(k0, Math.floor((f + step / 2) / binHz)));
    rowBins.push([k0, k1]);
  }

  const db = new Float32Array(mask.rows * mask.cols);
  const perRow: number[][] = Array.from({ length: mask.rows }, () => []);
  for (let c = 0; c < mask.cols; c++) {
    for (const v of perRow) v.length = 0;
    for (const frac of [0.15, 0.5, 0.85]) {
      const center = Math.round(layout.startSample + (c + frac) * layout.colSamples);
      const s0 = center - L / 2;
      for (let n = 0; n < L; n++) {
        const i = s0 + n;
        frame[n] = i >= 0 && i < mono.length ? mono[i] * win[n] : 0;
      }
      fft.realTransform(out, frame);
      for (let r = 0; r < mask.rows; r++) {
        const [k0, k1] = rowBins[r];
        for (let k = k0; k <= k1; k++) perRow[r].push(Math.hypot(out[2 * k], out[2 * k + 1]) * norm);
      }
    }
    for (let r = 0; r < mask.rows; r++) db[r * mask.cols + c] = 20 * Math.log10(Math.max(median(perRow[r]), 1e-7));
  }

  const amp = new Float32Array(mask.rows * mask.cols);
  for (let r = 0; r < mask.rows; r++) {
    for (let c = 0; c < mask.cols; c++) {
      let sum = 0;
      let n = 0;
      for (let d = -BLEND_SMOOTH_COLS; d <= BLEND_SMOOTH_COLS; d++) {
        const cc = c + d;
        if (cc < 0 || cc >= mask.cols) continue;
        sum += db[r * mask.cols + cc];
        n++;
      }
      amp[r * mask.cols + c] = 10 ** (sum / n / 20);
    }
  }
  return amp;
}

/**
 * Grain loudness for a cell (R3c, R3f): a margin above what's left after
 * dimming, but never above the original's own level there (nor the absolute
 * ceiling), and never below the floor.
 */
export function grainAmp(dimmed: number, original: number): number {
  const cap = Math.min(SPARKLE_ABS_MAX_AMP, original * 10 ** (GRAIN_CAP_OVER_ORIGINAL_DB / 20));
  const want = dimmed * 10 ** (BLEND_MARGIN_DB / 20);
  return Math.max(SPARKLE_MIN_AMP, Math.min(want, cap));
}

/** Short twinkling grains at random times inside each "on" cell. */
function synthSparkle(
  msg: Float32Array,
  sr: number,
  mask: TextMask,
  layout: MessageLayout,
  background: Float32Array,
  original: Float32Array,
  rand: () => number,
): void {
  const g = Math.max(8, Math.round(SPARKLE_GRAIN_SEC * sr));
  const win = new Float64Array(g);
  for (let n = 0; n < g; n++) win[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (g - 1));
  const step = rowStepHz(layout);
  const perCell = Math.max(1, Math.round((layout.colSamples / sr) * SPARKLE_RATE));
  for (let r = 0; r < mask.rows; r++) {
    for (let c = 0; c < mask.cols; c++) {
      if (!mask.data[r * mask.cols + c]) continue;
      const amp = grainAmp(background[r * mask.cols + c], original[r * mask.cols + c]);
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
          if (i >= 0 && i < msg.length) msg[i] += amp * win[n] * im;
          const nre = re * cw - im * sw;
          im = im * cw + re * sw;
          re = nre;
        }
      }
    }
  }
}

// --- Make room + verdict check (R3d, R3e) ------------------------------------

/** How much the original is dimmed inside the message band (dB). TUNABLE. */
export const CARVE_DB = 12;
const CARVE_FFT = 2048;
const CARVE_HOP = CARVE_FFT / 4;
/** A haunted file's cutoff may not rise by more than this (Hz). */
const VERDICT_RISE_TOLERANCE_HZ = 100;

/** Raised-cosine "depth" of the message at sample i (0 outside, 1 inside, ~1 s eases). */
function messageDepth(i: number, layout: MessageLayout, fade: number): number {
  const { startSample: a, endSample: b } = layout;
  if (i < a || i >= b) return 0;
  const x = Math.min(1, (i - a) / fade, (b - 1 - i) / fade);
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, x));
}

function messageFadeSamples(layout: MessageLayout, sr: number): number {
  const len = layout.endSample - layout.startSample;
  return Math.max(1, Math.min(Math.round(MESSAGE_FADE_SEC * sr), Math.floor(len * 0.1)));
}

/**
 * Dim one channel by `carveDb` inside the message band while the message
 * plays (R3d), in place. STFT filter: sqrt-Hann analysis and synthesis
 * windows at 75% overlap reconstruct the signal exactly where the gain is 1,
 * and the gain eases in and out with the message, so the edited region joins
 * the untouched audio seamlessly. Only band bins (plus a one-row taper) are
 * touched.
 */
export function carveBand(ch: Float32Array, sr: number, mask: TextMask, layout: MessageLayout, carveDb: number): void {
  if (!(carveDb > 0)) return;
  const L = CARVE_FFT;
  const H = CARVE_HOP;
  const fft = new FFT(L);
  const spec = fft.createComplexArray();
  const time = fft.createComplexArray();
  const frame = new Float64Array(L);
  const win = new Float64Array(L);
  for (let n = 0; n < L; n++) win[n] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * n) / L)); // sqrt periodic Hann
  // Σ win² over the 4 overlapping frames = 2, so each output is halved.
  const olaScale = 0.5;

  // Full-depth gain per bin: g inside the band, cosine taper one row wide outside.
  const g = 10 ** (-carveDb / 20);
  const binHz = sr / L;
  const step = rowStepHz(layout);
  const fHi = layout.rowFreqs[0] + step / 2;
  const fLo = layout.rowFreqs[mask.rows - 1] - step / 2;
  const cut = new Float64Array(L / 2 + 1); // how much of the cut each bin gets (0…1)
  for (let k = 0; k <= L / 2; k++) {
    const f = k * binHz;
    const d = f < fLo ? (fLo - f) / step : f > fHi ? (f - fHi) / step : 0;
    cut[k] = d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * d);
  }

  const fade = messageFadeSamples(layout, sr);
  const a = Math.max(0, layout.startSample - L);
  const b = Math.min(ch.length, layout.endSample + L);
  const out = new Float32Array(b - a);
  for (let s = a - L + H; s < b; s += H) {
    const depth = messageDepth(s + L / 2, layout, fade);
    for (let n = 0; n < L; n++) {
      const i = s + n;
      frame[n] = i >= 0 && i < ch.length ? ch[i] * win[n] : 0;
    }
    fft.realTransform(spec, frame);
    fft.completeSpectrum(spec);
    if (depth > 0) {
      for (let k = 1; k < L / 2; k++) {
        if (!cut[k]) continue;
        const gk = 1 - depth * cut[k] * (1 - g);
        spec[2 * k] *= gk;
        spec[2 * k + 1] *= gk;
        spec[2 * (L - k)] *= gk;
        spec[2 * (L - k) + 1] *= gk;
      }
    }
    fft.inverseTransform(time, spec);
    for (let n = 0; n < L; n++) {
      const i = s + n;
      if (i >= a && i < b) out[i - a] += time[2 * n] * win[n] * olaScale;
    }
  }
  ch.set(out, a);
}

type CutoffClass = 'genuine' | 'inconclusive' | 'suspicious' | 'none';

/** The analyzer's view of a signal: cutoff (Hz) and its class (R3e). */
export function verdictClassOf(mono: Float32Array, sr: number): { cutoffHz: number; cls: CutoffClass } {
  const { cutoff } = analyze(computeStft(mono, stftParamsFor(mono.length)), sr, 'FLAC');
  const ratio = sr > 0 ? cutoff.cutoffHz / (sr / 2) : 0;
  const cls: CutoffClass =
    cutoff.cutoffHz <= 0
      ? 'none'
      : ratio >= LOSSLESS_HIGH_RATIO
        ? 'genuine'
        : ratio < SUSPICIOUS_RATIO
          ? 'suspicious'
          : 'inconclusive';
  return { cutoffHz: cutoff.cutoffHz, cls };
}

function mixToMono(channels: Float32Array[]): Float32Array {
  const n = channels[0]?.length ?? 0;
  const mono = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) mono[i] += ch[i] / channels.length;
  return mono;
}

export interface EmbedResult {
  /** Clip-protection scale applied to the whole file (1 = unchanged). */
  scale: number;
  /** How much the band was dimmed in the version that was kept (dB). */
  carveDb: number;
}

/**
 * Add the message to every channel in place: dim the band to make room
 * (R3d), add blended sparkles (R3c), then check the analyzer still reads the
 * file the same (R3e) — retrying with half the dimming, then none. Throws if
 * no attempt keeps the verdict. If the result would clip, every channel is
 * scaled by 0.999 / peak.
 */
export function embedMessage(
  channels: Float32Array[],
  sampleRate: number,
  mask: TextMask,
  layout: MessageLayout,
  rand: () => number = Math.random,
): EmbedResult {
  const { startSample, endSample } = layout;
  const len = endSample - startSample;
  const fade = messageFadeSamples(layout, sampleRate);
  const originalMono = mixToMono(channels);
  const before = verdictClassOf(originalMono, sampleRate);
  // The original's level per cell: the grain ceiling (R3f).
  const original = measureBackground(originalMono, sampleRate, mask, layout);

  for (const carveDb of [CARVE_DB, CARVE_DB / 2, 0]) {
    const work = channels.map((ch) => ch.slice());
    for (const ch of work) carveBand(ch, sampleRate, mask, layout, carveDb);

    // Measure the (dimmed) original before adding anything, so each grain
    // sits just above what's left around it.
    const background = measureBackground(mixToMono(work), sampleRate, mask, layout);
    const msg = new Float32Array(len); // msg[0] = startSample
    synthSparkle(msg, sampleRate, mask, layout, background, original, rand);
    for (let i = 0; i < fade; i++) {
      const gn = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
      msg[i] *= gn;
      msg[len - 1 - i] *= gn;
    }
    for (const ch of work) for (let i = 0; i < len; i++) ch[startSample + i] += msg[i];

    const after = verdictClassOf(mixToMono(work), sampleRate);
    const safe = after.cls === before.cls && after.cutoffHz <= before.cutoffHz + VERDICT_RISE_TOLERANCE_HZ;
    if (!safe) continue;

    let peak = 0;
    for (const ch of work) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
    const scale = peak > 0.999 ? 0.999 / peak : 1;
    work.forEach((ch, c) => {
      if (scale !== 1) for (let i = 0; i < ch.length; i++) ch[i] *= scale;
      channels[c].set(ch);
    });
    return { scale, carveDb };
  }
  throw new Error('Could not add the message without changing how the file is judged.');
}