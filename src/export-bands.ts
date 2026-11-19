// Pure planning for the PNG export: how wide a whole-track strip is, and how
// the track is cut into strips when it is split into equal parts.
// No DOM, no worker — kept separate so the arithmetic is easy to read and test.

/** Columns a whole-track strip gets at 1× — the same width as the on-screen graph. TUNABLE. */
export const BASE_COLUMNS = 1024;

/** Never go below this width, however hard the graph is compressed. */
export const MIN_COLUMNS = 128;

/**
 * Speed menu value → compression multiplier. Speed compresses the time axis of
 * ONE whole-track strip: 1× spends 1024 columns on the file, 2× packs it into
 * half that, and "slowest" (0.5×) doubles it, so the strip is twice as wide
 * and carries twice the time detail.
 */
export const SPEED_CHOICES: ReadonlyArray<{ value: string; multiplier: number }> = [
  { value: 'slowest', multiplier: 0.5 },
  { value: '1', multiplier: 1 },
  { value: '2', multiplier: 2 },
  { value: '3', multiplier: 3 },
  { value: '5', multiplier: 5 },
];

/** Equal-parts mode offers 1..10 strips; this is the menu's upper end. */
export const MAX_PARTS = 10;

export type SplitMode = 'speed' | 'parts';

export interface ExportPlan {
  /** Number of stacked strips (1 for a speed export). */
  strips: number;
  /** Columns per strip — also the exported image's width. */
  columns: number;
  /** Seconds of track per strip. */
  stripSeconds: number;
}

/**
 * Work out the export shape. `value` is the active menu value: a SPEED_CHOICES
 * value for 'speed', or the part count (1..10) for 'parts'. Null with no track.
 */
export function planExport(durationSec: number, split: SplitMode, value: string): ExportPlan | null {
  if (!(durationSec > 0)) return null;
  if (split === 'parts') {
    const parts = Math.max(1, Math.min(MAX_PARTS, Math.round(Number(value) || 1)));
    return { strips: parts, columns: BASE_COLUMNS, stripSeconds: durationSec / parts };
  }
  const choice = SPEED_CHOICES.find((c) => c.value === value) ?? SPEED_CHOICES[1];
  const columns = Math.max(
    MIN_COLUMNS,
    Math.min(BASE_COLUMNS * 2, Math.round(BASE_COLUMNS / choice.multiplier)),
  );
  return { strips: 1, columns, stripSeconds: durationSec };
}

/**
 * Sample ranges for the worker, top strip first. The last strip always ends
 * exactly at the end of the track, so rounding can never leave a gap.
 */
export function bandRanges(
  plan: ExportPlan,
  durationSec: number,
  sampleRate: number,
): { startSample: number; endSample: number }[] {
  if (!(durationSec > 0) || !(sampleRate > 0)) return [];
  const ranges: { startSample: number; endSample: number }[] = [];
  for (let i = 0; i < plan.strips; i++) {
    const t0 = Math.min(durationSec, i * plan.stripSeconds);
    const t1 =
      i === plan.strips - 1 ? durationSec : Math.min(durationSec, (i + 1) * plan.stripSeconds);
    if (t1 <= t0) break;
    ranges.push({ startSample: Math.round(t0 * sampleRate), endSample: Math.round(t1 * sampleRate) });
  }
  return ranges;
}
