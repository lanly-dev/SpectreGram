// Canvas 2D spectrogram rendering. The canvas keeps a FIXED internal resolution
// (1024x512) so the rendering size box never changes with window size or STFT
// parameters; the magnitude grid is scaled into it. CSS scales the canvas to the
// display area, and the exported PNG matches the on-screen pixels. Haunted
// palettes are functional color lookup tables for now (polish is a later pass).

import type { DbGrid } from './audio/stft';
import { DEFAULT_STFT } from './audio/stft';

export type PaletteName = 'hellfire' | 'ectoplasm' | 'spectrum';

// Fixed rendering buffer size — never changes with window or STFT params.
const FIXED_W = 1024;
const FIXED_H = 512;

// dBFS floor for palette mapping. Grids are produced by the default STFT, so
// the floor matches DEFAULT_STFT.dynRangeDb.
const FLOOR = -DEFAULT_STFT.dynRangeDb;

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

/** Build a 256x4 RGBA lookup table for the named palette. Unknown -> spectrum. */
export function buildPalette(name: PaletteName): Uint8ClampedArray {
  const stops =
    name === 'ectoplasm' ? ECTO_STOPS : name === 'hellfire' ? HELLFIRE_STOPS : SPECTRUM_STOPS;
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

function dbToIndex(db: number): number {
  const span = 0 - FLOOR; // 120
  let idx = Math.round(((db - FLOOR) / span) * 255);
  if (idx < 0) idx = 0;
  if (idx > 255) idx = 255;
  return idx;
}

// Module-level state so a palette switch can re-render from the last grid
// without recomputing the STFT or re-analyzing.
let activePalette: Uint8ClampedArray = buildPalette('spectrum');
let activePaletteName: PaletteName = 'spectrum';
let lastCtx: CanvasRenderingContext2D | null = null;
let lastGrid: DbGrid | null = null;

// --- Progressive left-to-right draw animation ------------------------------

let animSource: OffscreenCanvas | null = null;
let animCtx: CanvasRenderingContext2D | null = null;
let animStart = 0;
let animId: number | null = null;
const ANIM_DURATION_MS = 700;

function stopAnim(): void {
  if (animId !== null) {
    cancelAnimationFrame(animId);
    animId = null;
  }
  animSource = null;
  animCtx = null;
}

function onAnimFrame(now: number): void {
  if (!animSource || !animCtx) return;
  const elapsed = now - animStart;
  let progress = Math.min(elapsed / ANIM_DURATION_MS, 1);
  // Ease-out cubic: starts fast, decelerates smoothly to the end.
  progress = 1 - Math.pow(1 - progress, 3);

  animCtx.clearRect(0, 0, FIXED_W, FIXED_H);
  if (progress > 0) {
    const srcW = animSource.width * progress;
    const dstW = FIXED_W * progress;
    animCtx.drawImage(
      animSource,
      0, 0, srcW, animSource.height,
      0, 0, dstW, FIXED_H,
    );
  }

  if (progress < 1) {
    animId = requestAnimationFrame(onAnimFrame);
  } else {
    animId = null;
    animSource = null;
    animCtx = null;
  }
}

function startAnim(ctx: CanvasRenderingContext2D, source: OffscreenCanvas): void {
  stopAnim();
  animCtx = ctx;
  animSource = source;
  animStart = performance.now();
  animId = requestAnimationFrame(onAnimFrame);
}

// ---------------------------------------------------------------------------

function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: DbGrid,
  palette: Uint8ClampedArray,
  animate: boolean,
): void {
  const { frames, bins, data } = grid;
  if (frames === 0 || bins === 0) {
    stopAnim();
    ctx.clearRect(0, 0, FIXED_W, FIXED_H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, FIXED_W, FIXED_H);
    return;
  }

  // Keep the canvas buffer at the fixed size; never resample to frames/bins.
  ctx.canvas.width = FIXED_W;
  ctx.canvas.height = FIXED_H;

  // Paint the grid into an offscreen canvas at native frames×bins, then scale
  // it into the fixed buffer. Low frequency at the bottom (conventional).
  const off = new OffscreenCanvas(frames, bins);
  const octx = off.getContext('2d')!;
  const img = octx.createImageData(frames, bins);
  const px = img.data;
  for (let t = 0; t < frames; t++) {
    for (let k = 0; k < bins; k++) {
      const idx = dbToIndex(data[t * bins + k]);
      const row = bins - 1 - k;
      const p = (row * frames + t) * 4;
      const ci = idx * 4;
      px[p] = palette[ci];
      px[p + 1] = palette[ci + 1];
      px[p + 2] = palette[ci + 2];
      px[p + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);

  if (animate) {
    startAnim(ctx, off);
  } else {
    stopAnim();
    ctx.clearRect(0, 0, FIXED_W, FIXED_H);
    ctx.drawImage(off, 0, 0, FIXED_W, FIXED_H);
  }
}

/** Render the spectrogram and remember the grid + context for palette re-renders. */
export function renderSpectrogram(ctx: CanvasRenderingContext2D, grid: DbGrid): void {
  lastCtx = ctx;
  lastGrid = grid;
  drawGrid(ctx, grid, activePalette, true);
}

/** Switch palette and re-render from the last grid (no recompute). */
export function setActivePalette(name: PaletteName): void {
  let resolved = name;
  if (resolved !== 'hellfire' && resolved !== 'ectoplasm' && resolved !== 'spectrum') {
    console.warn(`Unknown palette "${name}", falling back to spectrum`);
    resolved = 'spectrum';
  }
  activePalette = buildPalette(resolved);
  activePaletteName = resolved;
  if (lastCtx && lastGrid) {
    drawGrid(lastCtx, lastGrid, activePalette, false);
  }
}

export function getActivePaletteName(): PaletteName {
  return activePaletteName;
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
