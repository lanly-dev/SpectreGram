// Composes the exported PNG. The graph pixels come from a grid (stacked strips)
// or from the live canvas (current view); optional rulers and a dB legend are
// drawn around them so the image still explains itself away from the app.
// Layout maths is pure (exportLayout) so it can be checked without a browser.

import type { DbGrid } from './audio/stft';
import { CANVAS_HEIGHT, drawGridStrip } from './render';

/** Height of the time ruler under each strip. */
export const RULER_HEIGHT = 18;
/** Width of the frequency-label gutter. */
export const FREQ_GUTTER = 48;
/** Width of the dB legend column. */
export const LEGEND_WIDTH = 44;

const BG = '#0a0a10';
const LABEL = '#9a9aa8';
const TICK = 'rgba(255, 255, 255, 0.16)';

export interface ExportRow {
  /** Grid to paint — a stacked strip. */
  grid?: DbGrid;
  /** Ready-made pixels to copy — the live spectrogram canvas. */
  source?: CanvasImageSource;
  startSec: number;
  endSec: number;
}

export interface ExportLayout {
  width: number;
  height: number;
  /** Pixels per strip (the graph itself). */
  bandHeight: number;
  /** 0 when rulers are off. */
  rulerHeight: number;
  /** Left gutter reserved for frequency labels. */
  left: number;
  /** Right column reserved for the legend. */
  right: number;
}

/** Pixel size of the composed image for `rows` strips. */
export function exportLayout(
  rows: number,
  columns: number,
  rulers: boolean,
  legend: boolean,
): ExportLayout {
  const left = rulers ? FREQ_GUTTER : 0;
  const right = legend ? LEGEND_WIDTH : 0;
  const rulerHeight = rulers ? RULER_HEIGHT : 0;
  return {
    width: left + columns + right,
    height: rows * (CANVAS_HEIGHT + rulerHeight),
    bandHeight: CANVAS_HEIGHT,
    rulerHeight,
    left,
    right,
  };
}

export interface ComposeOptions {
  rows: ExportRow[];
  /** Strip width in px (the export's time resolution). */
  columns: number;
  /** Highest frequency on the graph. */
  nyquistHz: number;
  /** Active display range, for the legend labels. */
  dbRange: { lower: number; upper: number };
  /** Active palette's 256×4 lookup table, for the legend bar. */
  palette: Uint8ClampedArray;
  /** Tick spacing in seconds for a strip of the given span. */
  timeStepFor: (spanSec: number) => number;
  formatTime: (sec: number) => string;
  formatHz: (hz: number) => string;
}

/** Build the export image (caller encodes it to PNG). */
export function composeExportImage(opts: ComposeOptions, rulers: boolean, legend: boolean): HTMLCanvasElement {
  const layout = exportLayout(opts.rows.length, opts.columns, rulers, legend);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D context for the export image');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  opts.rows.forEach((row, i) => {
    const y = i * (layout.bandHeight + layout.rulerHeight);
    if (row.grid) {
      drawGridStrip(ctx, row.grid, layout.left, y, opts.columns, layout.bandHeight);
    } else if (row.source) {
      ctx.drawImage(row.source, layout.left, y, opts.columns, layout.bandHeight);
    }
    if (layout.rulerHeight) drawTimeRuler(ctx, row, layout, y, opts);
    if (layout.left) drawFreqRuler(ctx, layout, y, opts);
  });

  if (layout.right) drawLegend(ctx, layout, opts);
  return canvas;
}

/** Ticks and time labels under one strip. */
function drawTimeRuler(
  ctx: CanvasRenderingContext2D,
  row: ExportRow,
  layout: ExportLayout,
  y: number,
  opts: ComposeOptions,
): void {
  const top = y + layout.bandHeight;
  const span = Math.max(1e-6, row.endSec - row.startSec);
  const step = opts.timeStepFor(span);

  ctx.fillStyle = TICK;
  ctx.fillRect(layout.left, top, opts.columns, 1);

  const labelY = top + layout.rulerHeight / 2 + 1;
  for (
    let t = Math.ceil(row.startSec / step - 1e-9) * step;
    t <= row.endSec + 1e-9;
    t += step
  ) {
    const x = layout.left + ((t - row.startSec) / span) * opts.columns;
    ctx.fillStyle = TICK;
    ctx.fillRect(Math.round(x), top, 1, 4);

    const text = opts.formatTime(t);
    const half = ctx.measureText(text).width / 2;
    const cx = Math.min(layout.left + opts.columns - half, Math.max(layout.left + half, x));
    ctx.fillStyle = LABEL;
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, labelY);
  }
}

/** Frequency labels down the left gutter — one band's worth of the linear axis. */
function drawFreqRuler(
  ctx: CanvasRenderingContext2D,
  layout: ExportLayout,
  y: number,
  opts: ComposeOptions,
): void {
  const top = y;
  const bottom = y + layout.bandHeight;
  ctx.textAlign = 'right';
  // Low frequency is at the bottom of the graph (conventional).
  for (const hz of [0, opts.nyquistHz / 2, opts.nyquistHz]) {
    const at = bottom - (hz / opts.nyquistHz) * layout.bandHeight;
    ctx.fillStyle = TICK;
    ctx.fillRect(layout.left - 4, Math.round(at), 4, 1);
    const ly = Math.min(bottom - 6, Math.max(top + 6, at));
    ctx.fillStyle = LABEL;
    ctx.fillText(opts.formatHz(hz), layout.left - 7, ly);
  }
}

/** Palette bar with the display range's dB labels, down the right column. */
function drawLegend(ctx: CanvasRenderingContext2D, layout: ExportLayout, opts: ComposeOptions): void {
  const x = layout.left + opts.columns + 5;
  const h = layout.bandHeight;
  const barW = 12;
  for (let i = 0; i < h; i++) {
    const idx = Math.round((1 - i / Math.max(1, h - 1)) * 255) * 4;
    ctx.fillStyle = `rgb(${opts.palette[idx]}, ${opts.palette[idx + 1]}, ${opts.palette[idx + 2]})`;
    ctx.fillRect(x, i, barW, 1);
  }
  ctx.strokeStyle = TICK;
  ctx.strokeRect(x + 0.5, 0.5, barW, h - 1);

  ctx.fillStyle = LABEL;
  ctx.textAlign = 'left';
  const marks = [opts.dbRange.upper, (opts.dbRange.upper + opts.dbRange.lower) / 2, opts.dbRange.lower];
  marks.forEach((db, i) => {
    const ly = Math.min(h - 6, Math.max(6, (i / (marks.length - 1)) * (h - 1)));
    ctx.fillText(`${Math.round(db)}`, x + barW + 3, ly);
  });
}
