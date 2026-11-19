// Pure planning for the PNG export: how wide each strip is (speed) and how
// many strips the track is cut into (divide into parts). The two are
// independent — speed only compresses the time axis inside a strip.
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

/** The parts menu offers 1..10 strips; this is its upper end. */
export const MAX_PARTS = 10;

/** One column per analysis hop: the lossless export's time resolution.
 *  Matches `DEFAULT_STFT.hopSize`, so no hop is dropped or blended. TUNABLE. */
export const NATIVE_HOP = 1024;

/** Hard width ceiling for one lossless strip — a wider PNG is neither
 *  loadable nor buildable in a canvas. */
export const MAX_LOSSLESS_COLUMNS = 32768;

export interface ExportPlan {
  /** Number of stacked strips (1 for a speed export). */
  strips: number;
  /** Columns per strip — also the exported image's width. */
  columns: number;
  /** Seconds of track per strip. */
  stripSeconds: number;
}

function clampParts(partsValue: string): number {
  return Math.max(1, Math.min(MAX_PARTS, Math.round(Number(partsValue) || 1)));
}

/**
 * Width that keeps every STFT hop its own pixel: one column per `NATIVE_HOP`
 * samples, so the time axis is not compressed at all. Rounded up, so the
 * actual hop is 1024 or slightly less. Unknown sample rate → graph width.
 */
export function nativeColumns(durationSec: number, sampleRate: number): number {
  if (!(durationSec > 0) || !(sampleRate > 0)) return BASE_COLUMNS;
  const columns = Math.ceil((durationSec * sampleRate) / NATIVE_HOP);
  return Math.max(MIN_COLUMNS, Math.min(MAX_LOSSLESS_COLUMNS, columns));
}

/**
 * Lossless plan: native bin rows (the caller's band height) and native-hop
 * columns, so neither axis is compressed. The part count only splits the
 * stack — the total pixel width is the same for 1 part or 10.
 */
export function planLosslessExport(
  durationSec: number,
  partsValue: string,
  sampleRate: number,
): ExportPlan | null {
  if (!(durationSec > 0)) return null;
  const strips = clampParts(partsValue);
  const stripSeconds = durationSec / strips;
  return { strips, columns: nativeColumns(stripSeconds, sampleRate), stripSeconds };
}

/**
 * Custom plan from the two independent controls: `speed` is a SPEED_CHOICES
 * value (the columns each strip gets) and `parts` the number of stacked
 * strips (1..10). Both apply at once, so 4 parts at 2× is four 512 px
 * strips. Null with no track.
 */
export function planExport(
  durationSec: number,
  speed: string,
  partsValue: string,
): ExportPlan | null {
  if (!(durationSec > 0)) return null;
  const parts = clampParts(partsValue);
  const choice = SPEED_CHOICES.find((c) => c.value === speed) ?? SPEED_CHOICES[1];
  const columns = Math.max(
    MIN_COLUMNS,
    Math.min(BASE_COLUMNS * 2, Math.round(BASE_COLUMNS / choice.multiplier)),
  );
  return { strips: parts, columns, stripSeconds: durationSec / parts };
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
