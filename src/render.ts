// Canvas 2D spectrogram rendering. The canvas keeps a FIXED internal resolution
// (1024x512) so the rendering size box never changes with window size or STFT
// parameters; the magnitude grid is scaled into it. CSS scales the canvas to the
// display area, and the exported PNG matches the on-screen pixels. Haunted
// palettes are functional color lookup tables for now (polish is a later pass).

import type { DbGrid } from './audio/stft';
import { DEFAULT_STFT } from './audio/stft';

export type PaletteName = 'hellfire' | 'ectoplasm' | 'spectrum' | 'pumpkin';

// Fixed rendering buffer size — never changes with window or STFT params.
const FIXED_W = 1024;
const FIXED_H = 512;

/** The graph's pixel size, for callers that mint their own canvas (exports). */
export const CANVAS_WIDTH = FIXED_W;
export const CANVAS_HEIGHT = FIXED_H;

// Lowest dBFS value the STFT produces (it clamps there), so the display range
// can never usefully go below it.
const STFT_FLOOR = -DEFAULT_STFT.dynRangeDb;

// Adjustable display range (dBFS), like an analyser's upper/lower limits.
// Values at or above `upperDb` map to the top palette color, values at or
// below `lowerDb` to the bottom one. Display-only: the cutoff verdict reads
// the raw grid and is unaffected.
export const DB_STEP = 10;
const MIN_SPAN_DB = 20;
let lowerDb = STFT_FLOOR;
let upperDb = 0;

// Control stops [r, g, b], interpolated linearly across palette index 0..255.
// Our own colors (clean-room — not Spek's).
const HELLFIRE_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [10, 6, 12], // near-black
  [120, 14, 10], // dark red
  [222, 52, 0], // red-orange
  [250, 140, 20], // orange
  [255, 224, 92], // yellow
  [255, 255, 244], // near-white
];

const ECTO_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [6, 12, 14], // near-black
  [10, 58, 66], // dark teal
  [18, 158, 156], // teal
  [76, 220, 158], // green-teal
  [176, 250, 196], // pale slime green
  [232, 255, 238], // pale
];

// The classic acoustic-analyser look (Spek is the reference): a full
// spectral sweep, so different energy levels read as genuinely different
// colors — quiet passages sit in indigo/purple, mid energy runs magenta →
// red → orange, and the loudest peaks hit yellow-white. Because low
// frequencies usually carry the most energy, the bands separate by color
// across the frequency axis instead of shading a single hue. Our own stop
// values (clean-room — not Spek's table).
const SPECTRUM_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [4, 4, 10], // near-black blue
  [30, 14, 92], // indigo
  [102, 30, 166], // purple
  [196, 42, 128], // magenta
  [240, 84, 40], // red-orange
  [252, 178, 30], // amber
  [250, 238, 118], // pale yellow
  [255, 255, 255], // white
];

// Jack-o'-lantern ramp: candlelight in a pumpkin — near-black brown through
// burnt orange to a pale cream flame.
const PUMPKIN_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [10, 5, 2], // near-black brown
  [64, 22, 4], // deep brown
  [136, 54, 6], // burnt orange
  [204, 96, 10], // pumpkin orange
  [244, 152, 30], // candle amber
  [255, 216, 122], // pale flame
  [255, 246, 224], // cream white
];

function interpolateStops(
  stops: ReadonlyArray<readonly [number, number, number]>,
  t: number,
): [number, number, number] {
  if (t <= 0) return [stops[0][0], stops[0][1], stops[0][2]];
  const last = stops[stops.length - 1];
  if (t >= 1) return [last[0], last[1], last[2]];
  const seg = t * (stops.length - 1);
  const i = Math.floor(seg);
  const frac = seg - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

function stopsFor(name: PaletteName): ReadonlyArray<readonly [number, number, number]> {
  return name === 'ectoplasm'
    ? ECTO_STOPS
    : name === 'hellfire'
      ? HELLFIRE_STOPS
      : name === 'pumpkin'
        ? PUMPKIN_STOPS
        : SPECTRUM_STOPS;
}

/**
 * CSS gradient of the named palette, quiet (left) to loud (right) — used for
 * the palette button's thumbnail, so it always matches the real colors.
 */
export function paletteGradientCss(name: PaletteName): string {
  const stops = stopsFor(name);
  const parts = stops.map(
    ([r, g, b], i) => `rgb(${r}, ${g}, ${b}) ${((i / (stops.length - 1)) * 100).toFixed(1)}%`,
  );
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

/** Build a 256x4 RGBA lookup table for the named palette. Unknown -> spectrum. */
export function buildPalette(name: PaletteName): Uint8ClampedArray {
  const stops = stopsFor(name);
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = interpolateStops(stops, i / 255);
    lut[i * 4] = r;
    lut[i * 4 + 1] = g;
    lut[i * 4 + 2] = b;
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

// Module-level state so a palette switch can re-render from the last grid
// without recomputing the STFT or re-analyzing.
let activePalette: Uint8ClampedArray = buildPalette('spectrum');
let activePaletteName: PaletteName = 'spectrum';
let lastCtx: CanvasRenderingContext2D | null = null;
let lastGrid: DbGrid | null = null;

/**
 * What the graph paints (spec: .kiro/specs/phase-view/).
 * - `magnitude` (default): the palette, colour = dBFS level.
 * - `phase`: hue = the bin's phase angle, brightness = its dBFS level, so the
 *   level axis (legend, u/l keys) keeps working while the hue shows phase.
 */
export type ViewMode = 'magnitude' | 'phase';
let viewMode: ViewMode = 'magnitude';

/**
 * How far a bin's phase rotates its palette colour's hue, as a fraction of
 * the hue circle for a full turn of phase. 0.35 ≈ ±63°, strong enough to read
 * the phase structure while the palette's own hue ramp still shows the level.
 * TUNABLE.
 */
const PHASE_HUE_SPAN = 0.35;
/** Cached tint table (256 palette steps × 256 phase steps) + the palette it
 *  was built from, so a palette switch rebuilds it and nothing else does. */
let tintTable: Uint8ClampedArray | null = null;
let tintPalette: Uint8ClampedArray | null = null;

/** RGB (0…255) → hue (0…1), saturation, value (0…1). */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return [0, 0, max / 255];
  const h =
    max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, d / max, max / 255];
}

/** Hue (0…1), saturation, value → RGB (0…255). */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = ((h % 1) + 1) % 1;
  const i = Math.floor(f * 6);
  const q = v * (1 - s * (f * 6 - i));
  const t = v * (1 - s * (1 - (f * 6 - i)));
  const p = v * (1 - s);
  const rgb =
    i === 0 ? [v, t, p]
      : i === 1 ? [q, v, p]
        : i === 2 ? [p, v, t]
          : i === 3 ? [p, q, v]
            : i === 4 ? [t, p, v] : [v, p, q];
  return [rgb[0] * 255, rgb[1] * 255, rgb[2] * 255];
}

/**
 * Phase tint table: for every palette colour (the level), the same colour with
 * its hue rotated by the bin's phase. Built once per palette (256 × 256
 * entries), so the pixel loop stays a single table lookup. Brightness and
 * saturation are untouched — the palette's shading *is* the spectrogram — so
 * the picture reads exactly like the normal graph, with phase showing as hue
 * ripples across it.
 */
function getTintTable(palette: Uint8ClampedArray): Uint8ClampedArray {
  if (tintTable && tintPalette === palette) return tintTable;
  const table = new Uint8ClampedArray(256 * 256 * 4);
  for (let pi = 0; pi < 256; pi++) {
    const [hue, sat, val] = rgbToHsv(palette[pi * 4], palette[pi * 4 + 1], palette[pi * 4 + 2]);
    for (let ph = 0; ph < 256; ph++) {
      const shift = (ph / 255 - 0.5) * PHASE_HUE_SPAN;
      const [r, g, b] = hsvToRgb(hue + shift, sat, val);
      const i = (pi * 256 + ph) * 4;
      table[i] = r;
      table[i + 1] = g;
      table[i + 2] = b;
      table[i + 3] = 255;
    }
  }
  tintTable = table;
  tintPalette = palette;
  return table;
}

/**
 * Paint a grid's pixels onto an offscreen canvas at its native frames×bins,
 * using the active palette and display range. Null for an empty grid.
 */
function gridToCanvas(grid: DbGrid, palette: Uint8ClampedArray): OffscreenCanvas | null {
  const { frames, bins, data, phase } = grid;
  if (frames === 0 || bins === 0) return null;

  // Paint at native frames×bins; the caller scales it. Low frequency at the
  // bottom (conventional).
  const off = new OffscreenCanvas(frames, bins);
  const octx = off.getContext('2d')!;
  const img = octx.createImageData(frames, bins);
  const px = img.data;

  // Precompute a dBFS → RGBA lookup so the hot inner loop is a single table
  // copy (no per-pixel Math.round/clamp). 4096 steps across the active
  // [lowerDb, upperDb] range — far finer than the 256-entry palette.
  const lo = lowerDb;
  const span = upperDb - lowerDb;
  const LUT_SIZE = 4096;
  const lut = new Uint8ClampedArray(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    const ci = Math.round((i / (LUT_SIZE - 1)) * 255) * 4;
    lut[i * 4] = palette[ci];
    lut[i * 4 + 1] = palette[ci + 1];
    lut[i * 4 + 2] = palette[ci + 2];
    lut[i * 4 + 3] = 255;
  }
  const scale = (LUT_SIZE - 1) / span;

  // Phase tint: the palette colour for this level, hue-rotated by the bin's
  // phase. Level, brightness and the palette stay exactly as they are, so the
  // spectrogram keeps its familiar shape and phase rides on top of it.
  const phaseBytes = viewMode === 'phase' ? phase : undefined;
  const tintLut = phaseBytes ? getTintTable(palette) : null;
  // dB key → palette index, so the tint table can be indexed directly.
  const paletteIndex = new Uint8Array(LUT_SIZE);
  if (tintLut) {
    for (let i = 0; i < LUT_SIZE; i++) paletteIndex[i] = Math.round((i / (LUT_SIZE - 1)) * 255);
  }

  for (let t = 0; t < frames; t++) {
    const colBase = t * bins;
    for (let k = 0; k < bins; k++) {
      // Map dBFS → LUT key, clamped inline (avoids function call overhead).
      let key = ((data[colBase + k] - lo) * scale) | 0;
      if (key < 0) key = 0;
      else if (key >= LUT_SIZE) key = LUT_SIZE - 1;
      const row = bins - 1 - k;
      const p = (row * frames + t) * 4;
      if (tintLut && phaseBytes) {
        const ci = (paletteIndex[key] * 256 + phaseBytes[colBase + k]) * 4;
        px[p] = tintLut[ci];
        px[p + 1] = tintLut[ci + 1];
        px[p + 2] = tintLut[ci + 2];
        px[p + 3] = 255;
        continue;
      }
      const ci = key * 4;
      px[p] = lut[ci];
      px[p + 1] = lut[ci + 1];
      px[p + 2] = lut[ci + 2];
      px[p + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return off;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: DbGrid,
  palette: Uint8ClampedArray,
): void {
  // Keep the canvas buffer at the fixed size; never resample to frames/bins.
  ctx.canvas.width = FIXED_W;
  ctx.canvas.height = FIXED_H;
  ctx.clearRect(0, 0, FIXED_W, FIXED_H);
  const off = gridToCanvas(grid, palette);
  if (!off) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, FIXED_W, FIXED_H);
    return;
  }
  ctx.drawImage(off, 0, 0, FIXED_W, FIXED_H);
}

/**
 * Paint one grid as a strip of a taller composite canvas — the stacked PNG
 * export. Uses the same palette and display range as the on-screen graph, and
 * leaves the composite's size alone (the caller owns it).
 */
export function drawGridStrip(
  ctx: CanvasRenderingContext2D,
  grid: DbGrid,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const off = gridToCanvas(grid, activePalette);
  if (!off) {
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, width, height);
    return;
  }
  ctx.drawImage(off, x, y, width, height);
}

/**
 * Render the spectrogram and remember the grid + context for palette re-renders.
 * Paints synchronously: the grid is already computed by the time this is called,
 * so there is nothing left to wait for and nothing to animate — the pixels land
 * in the same task the worker's result is handled in.
 */
export function renderSpectrogram(ctx: CanvasRenderingContext2D, grid: DbGrid): void {
  lastCtx = ctx;
  lastGrid = grid;
  drawGrid(ctx, grid, activePalette);
}

/** Switch palette and re-render from the last grid (no recompute). */
export function setActivePalette(name: PaletteName): void {
  let resolved = name;
  if (
    resolved !== 'hellfire' &&
    resolved !== 'ectoplasm' &&
    resolved !== 'spectrum' &&
    resolved !== 'pumpkin'
  ) {
    console.warn(`Unknown palette "${name}", falling back to spectrum`);
    resolved = 'spectrum';
  }
  activePalette = buildPalette(resolved);
  activePaletteName = resolved;
  if (lastCtx && lastGrid) {
    drawGrid(lastCtx, lastGrid, activePalette);
  }
}

export function getActivePaletteName(): PaletteName {
  return activePaletteName;
}

/** The active view mode (magnitude colours by default, or phase). */
export function getViewMode(): ViewMode {
  return viewMode;
}

/**
 * Switch the view mode and repaint from the last grid (no recompute). Returns
 * the phase data's availability so the caller can explain a fallback.
 */
export function setViewMode(mode: ViewMode): { hasPhase: boolean } {
  viewMode = mode;
  if (lastCtx && lastGrid) drawGrid(lastCtx, lastGrid, activePalette);
  return { hasPhase: Boolean(lastGrid?.phase) };
}

/** Whether the grid on screen carries phase bytes (the phase view needs them). */
export function hasPhaseData(): boolean {
  return Boolean(lastGrid?.phase);
}



export interface DbRange {
  lower: number;
  upper: number;
}

export function getDbRange(): DbRange {
  return { lower: lowerDb, upper: upperDb };
}

/**
 * Nudge the upper or lower display limit by `deltaDb` and redraw from the last
 * grid (no recompute). Limits stay within [STFT floor, 0 dBFS] and keep at
 * least MIN_SPAN_DB apart; an out-of-bounds nudge leaves the range unchanged.
 */
export function adjustDbRange(which: 'lower' | 'upper', deltaDb: number): DbRange {
  let lower = lowerDb;
  let upper = upperDb;
  if (which === 'upper') upper += deltaDb;
  else lower += deltaDb;
  const valid = lower >= STFT_FLOOR && upper <= 0 && upper - lower >= MIN_SPAN_DB;
  if (valid) {
    lowerDb = lower;
    upperDb = upper;
    if (lastCtx && lastGrid) drawGrid(lastCtx, lastGrid, activePalette);
  }
  return getDbRange();
}

/**
 * Paint the active palette as a vertical color bar: top = upper limit (loudest
 * color), bottom = lower limit. Drawn at the canvas's own pixel size. The
 * phase tint only rotates hues, so this bar still describes the level axis.
 */
export function paintLegend(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const lut = activePalette;
  for (let y = 0; y < h; y++) {
    const ci = Math.round((1 - y / Math.max(1, h - 1)) * 255) * 4;
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      px[p] = lut[ci];
      px[p + 1] = lut[ci + 1];
      px[p + 2] = lut[ci + 2];
      px[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Export the spectrogram canvas as a PNG Blob. Reads the base canvas's current
 * pixels (the same pixels putImageData wrote), so the PNG matches what is
 * shown. No playhead is drawn to this canvas, so the export is clean.
 */
export function exportPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG export failed (the canvas may be tainted).'));
    }, 'image/png');
  });
}
