// Canvas 2D spectrogram rendering. Pixels come straight from the worker's
// magnitude grid (1 pixel per frame/bin); CSS scales the canvas to the display
// area, so the exported PNG is the exact spectrogram content at native
// resolution. Haunted palettes are functional color lookup tables for now
// (polish is a later pass).

import type { DbGrid } from './audio/stft';
import { DEFAULT_STFT } from './audio/stft';

export type PaletteName = 'hellfire' | 'ectoplasm';

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

/** Build a 256x4 RGBA lookup table for the named palette. Unknown -> hellfire. */
export function buildPalette(name: PaletteName): Uint8ClampedArray {
  const stops = name === 'ectoplasm' ? ECTO_STOPS : HELLFIRE_STOPS;
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
let activePalette: Uint8ClampedArray = buildPalette('hellfire');
let activePaletteName: PaletteName = 'hellfire';
let lastCtx: CanvasRenderingContext2D | null = null;
let lastGrid: DbGrid | null = null;

function drawGrid(ctx: CanvasRenderingContext2D, grid: DbGrid, palette: Uint8ClampedArray): void {
  const { frames, bins, data } = grid;
  if (frames === 0 || bins === 0) {
    ctx.canvas.width = ctx.canvas.width || 1;
    ctx.canvas.height = ctx.canvas.height || 1;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  // Size the canvas to exactly one pixel per frame/bin; CSS scales it to view.
  ctx.canvas.width = frames;
  ctx.canvas.height = bins;

  const img = ctx.createImageData(frames, bins);
  const px = img.data;
  for (let t = 0; t < frames; t++) {
    for (let k = 0; k < bins; k++) {
      const idx = dbToIndex(data[t * bins + k]);
      // Low frequency at the bottom (conventional): invert the bin row.
      const row = bins - 1 - k;
      const p = (row * frames + t) * 4;
      const ci = idx * 4;
      px[p] = palette[ci];
      px[p + 1] = palette[ci + 1];
      px[p + 2] = palette[ci + 2];
      px[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Render the spectrogram and remember the grid + context for palette re-renders. */
export function renderSpectrogram(ctx: CanvasRenderingContext2D, grid: DbGrid): void {
  lastCtx = ctx;
  lastGrid = grid;
  drawGrid(ctx, grid, activePalette);
}

/** Switch palette and re-render from the last grid (no recompute). */
export function setActivePalette(name: PaletteName): void {
  let resolved = name;
  if (resolved !== 'hellfire' && resolved !== 'ectoplasm') {
    console.warn(`Unknown palette "${name}", falling back to hellfire`);
    resolved = 'hellfire';
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
