// Spectral message encoder (spec: .kiro/specs/spectral-message/, R2/R3/R5).
// Pure: no DOM, no Web Audio — runs in the embed worker and in Node tests.
//
// A spectrogram plots time left→right and frequency bottom→top, so drawing a
// pixel at (time t, frequency f) means changing the sound at f during t. Here
// nothing is added: the original is dimmed inside the letter shapes, so the
// word shows as dark letters against the music (R3g).

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

/** The band's top drops to this share of the track's own cutoff when that is
 *  lower (R3h). Dimming can only carve where the track has energy, so rows
 *  above its real cutoff go blank and the word loses its top. */
const BAND_TOP_OF_CUTOFF = 0.97;
/** The band's bottom may not sink below this share of Nyquist (≈ 3.6 kHz at
 *  48 kHz): a band-limited track gets a shorter band rather than a dimmed
 *  bass. TUNABLE. */
const BAND_LO_FLOOR = 0.15;

/**
 * The message's frequency band, in Hz, for a track whose own measured cutoff
 * is `cutoffHz` (0 = unknown): R3's 46–66% of Nyquist, with the top pulled
 * down under the track's cutoff when the file doesn't reach that high (R3h),
 * so every row of the letters lands on music there is to dim.
 */
export function messageBand(cutoffHz: number, sampleRate: number): { loHz: number; hiHz: number } {
  const nyq = sampleRate / 2;
  const span = (BAND_HI - BAND_LO) * nyq;
  const hiHz = cutoffHz > 0 ? Math.min(BAND_HI * nyq, cutoffHz * BAND_TOP_OF_CUTOFF) : BAND_HI * nyq;
  let loHz = Math.max(hiHz - span, BAND_LO_FLOOR * nyq);
  if (loHz >= hiHz) loHz = hiHz * 0.9; // track ends below the floor: squeeze instead
  return { loHz, hiHz };
}

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
export function layoutMessage(
  mask: TextMask,
  sampleCount: number,
  sampleRate: number,
  cutoffHz = 0,
): MessageLayout | null {
  const frames = fullViewFrames(sampleCount);
  if (mask.cols < 1 || mask.rows < 2 || frames < 1 || !(sampleRate > 0)) return null;
  const minFrac = mask.cols / frames; // one frame per column
  if (minFrac > MAX_WIDTH_FRAC) return null;
  const { loHz: fLo, hiHz: fHi } = messageBand(cutoffHz, sampleRate);
  const bandPx = ((fHi - fLo) / (sampleRate / 2)) * VIEW_H;
  const naturalFrac = (mask.cols * bandPx) / mask.rows / VIEW_W;
  const widthFrac = Math.min(MAX_WIDTH_FRAC, Math.max(naturalFrac, minFrac));
  const widthSamples = widthFrac * sampleCount;
  const startSample = Math.round((sampleCount - widthSamples) / 2);
  const rowFreqs = new Float64Array(mask.rows);
  for (let r = 0; r < mask.rows; r++) rowFreqs[r] = fHi - (r * (fHi - fLo)) / (mask.rows - 1);
  return {
    startSample,
    endSample: Math.min(sampleCount, startSample + Math.round(widthSamples)),
    colSamples: widthSamples / mask.cols,
    rowFreqs,
  };
}

// --- Letters cut into the music (R3g) ----------------------------------------
// History: steady tones, hiss, warble and sparkle grains were all tried
// (R3a–R3f); adding sound either hurt to hear or couldn't show over busy
// music. Now nothing is added — the original is dimmed inside the letters.

/** How much the original is dimmed inside the letter shapes (dB). TUNABLE.
 *  24 dB was readable over a loud pop master and a full-band orchestral
 *  track; 12 dB was too faint. */
export const LETTER_DIM_DB = 24;
/** Fade over the whole message (capped at 10% of its length). */
const MESSAGE_FADE_SEC = 1;
const CARVE_FFT = 2048;
const CARVE_HOP = CARVE_FFT / 4;
/** A haunted file's cutoff may not rise by more than this (Hz). */
const VERDICT_RISE_TOLERANCE_HZ = 100;

function rowStepHz(layout: MessageLayout): number {
  const f = layout.rowFreqs;
  return f.length > 1 ? (f[0] - f[f.length - 1]) / (f.length - 1) : 0;
}

function messageFadeSamples(layout: MessageLayout, sr: number): number {
  const len = layout.endSample - layout.startSample;
  return Math.max(1, Math.min(Math.round(MESSAGE_FADE_SEC * sr), Math.floor(len * 0.1)));
}

/** Raised-cosine depth of the message at sample i (0 outside, 1 inside, ~1 s eases). */
function messageDepth(i: number, layout: MessageLayout, fade: number): number {
  const { startSample: a, endSample: b } = layout;
  if (i < a || i >= b) return 0;
  const x = Math.min(1, (i - a) / fade, (b - 1 - i) / fade);
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, x));
}

/**
 * Dim one channel inside the letter shapes, in place (R3g). STFT filter:
 * sqrt-Hann analysis and synthesis windows at 75% overlap reconstruct the
 * signal exactly where nothing is dimmed, so audio outside the letters —
 * other frequencies, other times — comes back unchanged. For a frame centred
 * in mask column c, a band bin mapped to row r is dimmed when the mask is on
 * there, scaled by the message's eased depth.
 */
export function carveLetters(ch: Float32Array, sr: number, mask: TextMask, layout: MessageLayout, dimDb: number): void {
  if (!(dimDb > 0)) return;
  const L = CARVE_FFT;
  const H = CARVE_HOP;
  const fft = new FFT(L);
  const spec = fft.createComplexArray();
  const time = fft.createComplexArray();
  const frame = new Float64Array(L);
  const win = new Float64Array(L);
  for (let n = 0; n < L; n++) win[n] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * n) / L)); // sqrt periodic Hann
  const olaScale = 0.5; // Σ win² over the 4 overlapping frames = 2

  // Which mask row each band bin belongs to (-1 = outside the band).
  const binHz = sr / L;
  const step = rowStepHz(layout);
  const fTop = layout.rowFreqs[0];
  const binRow = new Int32Array(L / 2 + 1).fill(-1);
  for (let k = 1; k < L / 2; k++) {
    const r = Math.round((fTop - k * binHz) / step);
    if (r >= 0 && r < mask.rows) binRow[k] = r;
  }
  const g = 10 ** (-dimDb / 20);
  const cut = new Float64Array(L / 2 + 1); // per-frame cut amount per bin (0…1)
  const smooth = new Float64Array(L / 2 + 1);

  const fade = messageFadeSamples(layout, sr);
  const a = Math.max(0, layout.startSample - L);
  const b = Math.min(ch.length, layout.endSample + L);
  const out = new Float32Array(b - a);
  for (let s = a - L + H; s < b; s += H) {
    const center = s + L / 2;
    const depth = messageDepth(center, layout, fade);
    const c = Math.floor((center - layout.startSample) / layout.colSamples);
    for (let n = 0; n < L; n++) {
      const i = s + n;
      frame[n] = i >= 0 && i < ch.length ? ch[i] * win[n] : 0;
    }
    fft.realTransform(spec, frame);
    fft.completeSpectrum(spec);
    if (depth > 0 && c >= 0 && c < mask.cols) {
      for (let k = 0; k <= L / 2; k++) {
        const r = binRow[k];
        cut[k] = r >= 0 && mask.data[r * mask.cols + c] ? 1 : 0;
      }
      // Soften letter edges across frequency by one bin each side.
      for (let k = 1; k < L / 2; k++) smooth[k] = 0.25 * cut[k - 1] + 0.5 * cut[k] + 0.25 * cut[k + 1];
      for (let k = 1; k < L / 2; k++) {
        if (!smooth[k]) continue;
        const gk = 1 - depth * smooth[k] * (1 - g);
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
  /** How much the letters were dimmed in the version that was kept (dB). */
  dimDb: number;
}

/**
 * Cut the message into every channel in place (R3g), then check the analyzer
 * still reads the file the same (R3e) — retrying with less dimming
 * (24 → 12 → 6 dB). Throws if no attempt keeps the verdict, or if the mask
 * doesn't fit the track (R5).
 *
 * The layout is chosen here, not by the caller, because it needs the track's
 * own cutoff (R3h) and that comes from the analyzer run below. That run also
 * gives `before`, so the band costs no extra analysis.
 */
export function embedMessage(channels: Float32Array[], sampleRate: number, mask: TextMask): EmbedResult {
  const before = verdictClassOf(mixToMono(channels), sampleRate);
  const layout = layoutMessage(mask, channels[0]?.length ?? 0, sampleRate, before.cutoffHz);
  if (!layout) throw new Error('The message does not fit this track.');
  for (const dimDb of [LETTER_DIM_DB, LETTER_DIM_DB / 2, LETTER_DIM_DB / 4]) {
    const work = channels.map((ch) => ch.slice());
    for (const ch of work) carveLetters(ch, sampleRate, mask, layout, dimDb);
    const after = verdictClassOf(mixToMono(work), sampleRate);
    if (after.cls !== before.cls || after.cutoffHz > before.cutoffHz + VERDICT_RISE_TOLERANCE_HZ) continue;
    let peak = 0;
    for (const ch of work) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
    const scale = peak > 0.999 ? 0.999 / peak : 1;
    work.forEach((ch, c) => {
      if (scale !== 1) for (let i = 0; i < ch.length; i++) ch[i] *= scale;
      channels[c].set(ch);
    });
    return { scale, dimDb };
  }
  throw new Error('Could not add the message without changing how the file is judged.');
}