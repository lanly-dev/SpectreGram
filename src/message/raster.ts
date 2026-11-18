// Text → pixel mask for the spectral message (spec:
// .kiro/specs/spectral-message/, R2). Needs a canvas, so it runs on the main
// thread; the mask is then handed to the embed worker.

/** One bit per pixel: data[row * cols + col], 1 = ink. Row 0 is the top. */
export interface TextMask {
  rows: number;
  cols: number;
  data: Uint8Array;
}

/** Height of the mask in rows (= frequency rows in the message band). TUNABLE. */
export const MASK_ROWS = 32;

/** Size the text is drawn at before scaling down to MASK_ROWS. */
const DRAW_PX = 128;
// Heaviest weight, so strokes stay thick after scaling to 32 rows (R3f).
// System fonts only — nothing to license or ship.
const FONT = `900 ${DRAW_PX}px "Segoe UI Black", "Arial Black", "Segoe UI", system-ui, -apple-system, sans-serif`;
/** A mask cell is ink when at least this share of its source pixels is ink. */
const INK_SHARE = 0.4;

/**
 * Draw `text` and reduce it to a MASK_ROWS-high 0/1 mask, cropped to the ink
 * (width keeps the drawn aspect). Returns cols = 0 if nothing visible was
 * drawn (e.g. only spaces).
 */
export function rasterizeText(text: string): TextMask {
  const probe = new OffscreenCanvas(1, 1).getContext('2d');
  if (!probe) throw new Error('Canvas 2D is not available.');
  probe.font = FONT;
  const w = Math.max(1, Math.ceil(probe.measureText(text).width) + DRAW_PX);
  const h = Math.ceil(DRAW_PX * 1.6);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available.');
  ctx.font = FONT;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, DRAW_PX / 2, h / 2);
  const px = ctx.getImageData(0, 0, w, h).data;

  // Crop to the ink.
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] >= 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { rows: MASK_ROWS, cols: 0, data: new Uint8Array(0) };
  const inkW = x1 - x0 + 1;
  const inkH = y1 - y0 + 1;

  // Scale to MASK_ROWS by block averaging.
  const rows = MASK_ROWS;
  const scale = inkH / rows; // source px per mask cell, both axes
  const cols = Math.max(1, Math.round(inkW / scale));
  const data = new Uint8Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    const sy0 = y0 + Math.floor(r * scale);
    const sy1 = Math.max(sy0 + 1, y0 + Math.floor((r + 1) * scale));
    for (let c = 0; c < cols; c++) {
      const sx0 = x0 + Math.floor(c * scale);
      const sx1 = Math.max(sx0 + 1, x0 + Math.floor((c + 1) * scale));
      let ink = 0;
      let n = 0;
      for (let y = sy0; y < sy1 && y <= y1; y++) {
        for (let x = sx0; x < sx1 && x <= x1; x++) {
          n++;
          if (px[(y * w + x) * 4 + 3] >= 128) ink++;
        }
      }
      data[r * cols + c] = n > 0 && ink / n >= INK_SHARE ? 1 : 0;
    }
  }
  // Thicken every stroke by one column (R3f): thin verticals are the first
  // thing to vanish against busy music.
  const out = new Uint8Array(rows * (cols + 1));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const here = c < cols ? data[r * cols + c] : 0;
      const left = c > 0 ? data[r * cols + c - 1] : 0;
      out[r * (cols + 1) + c] = here | left;
    }
  }
  return { rows, cols: cols + 1, data: out };
}
