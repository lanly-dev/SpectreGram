// Folder report logic (spec: .kiro/specs/folder-report/, R3–R6). Pure: no
// DOM, no Web Audio. Turns scan rows into quality classes, a Halloween-themed
// collector rating, and the Markdown report the user can save.
//
// Verdict wording stays owned by cutoff.ts; this file only reads the same
// phrases main.ts's verdict stamps key on. Every rating string carries
// "(estimate)", like every verdict.

import type { ScanRow } from './scan';

export type QualityClass = 'genuine' | 'costume' | 'inconclusive' | 'lossy' | 'nocall' | 'failed';

/** Display order and labels for the classes (report table + modal chips). */
export const CLASS_INFO: ReadonlyArray<{ cls: QualityClass; label: string; short: string }> = [
  { cls: 'genuine', label: '👻 Genuine lossless', short: '👻 Genuine' },
  { cls: 'costume', label: '🎃 Costume (lossy disguised as lossless)', short: '🎃 Costume' },
  { cls: 'inconclusive', label: '🌫️ Inconclusive', short: '🌫️ Inconclusive' },
  { cls: 'lossy', label: '📼 Normal lossy', short: '📼 Lossy' },
  { cls: 'nocall', label: '🕯️ No call', short: '🕯️ No call' },
  { cls: 'failed', label: '💀 Could not decode', short: '💀 Failed' },
];

export type ClassCounts = Record<QualityClass, number>;

/** Map one scan row to its class, from the verdict text cutoff.ts produced. */
export function classifyRow(row: Pick<ScanRow, 'ok' | 'verdict'>): QualityClass {
  if (!row.ok) return 'failed';
  const v = row.verdict;
  if (v.includes('genuine lossless')) return 'genuine';
  if (v.includes('costume')) return 'costume';
  if (v.includes('inconclusive')) return 'inconclusive';
  if (v.includes('normal for lossy')) return 'lossy';
  // Ambiguous/unknown format, no clear cutoff, or too short to judge.
  return 'nocall';
}

export function countClasses(rows: ReadonlyArray<Pick<ScanRow, 'ok' | 'verdict'>>): ClassCounts {
  const counts: ClassCounts = { genuine: 0, costume: 0, inconclusive: 0, lossy: 0, nocall: 0, failed: 0 };
  for (const r of rows) counts[classifyRow(r)]++;
  return counts;
}

// TUNABLE rating thresholds: costume share = costume / (genuine + costume).
// "Inconclusive" is left out of the share on purpose — genuine 44.1 kHz rips
// can read inconclusive on 48 kHz devices (AGENTS.md #3), so it must never
// count against the collector.
export const AVID_MAX_COSTUME_SHARE = 0.2;
export const HOARDER_MAX_COSTUME_SHARE = 0.5;

export interface CollectorRating {
  emoji: string;
  title: string;
  /** One line; always ends with "(estimate)". */
  blurb: string;
}

/** The drumroll verdict on a whole collection, from its class counts. */
export function rateCollection(c: ClassCounts): CollectorRating {
  const claims = c.genuine + c.costume + c.inconclusive;
  if (claims === 0) {
    return {
      emoji: '🦇',
      title: 'Lossy Lurker',
      blurb: 'Nothing here claims to be lossless, so there was nothing to unmask. Honest lossy files, no costumes. (estimate)',
    };
  }
  const judged = c.genuine + c.costume;
  if (judged === 0) {
    return {
      emoji: '🌫️',
      title: 'Lost in the Fog',
      blurb: 'Every lossless claim came back inconclusive, so the spirits can’t tell either way. (estimate)',
    };
  }
  const share = c.costume / judged;
  if (share === 0) {
    return {
      emoji: '👑',
      title: 'Crypt Keeper — a true collector',
      blurb: 'Every lossless file that could be judged is the real thing. The crypt is in order. (estimate)',
    };
  }
  if (share <= AVID_MAX_COSTUME_SHARE) {
    return {
      emoji: '🧛',
      title: 'Avid Collector',
      blurb: 'Mostly the real thing, with a few costumes slipped into the crypt. (estimate)',
    };
  }
  if (share <= HOARDER_MAX_COSTUME_SHARE) {
    return {
      emoji: '🧟',
      title: 'Haunted Hoarder',
      blurb: 'Plenty of “lossless”, but a good chunk of it is an MP3 in a costume. (estimate)',
    };
  }
  return {
    emoji: '🎃',
    title: 'Costume Party Noob',
    blurb: 'Most of your “lossless” files are lossy files wearing a costume. (estimate)',
  };
}

export interface ReportInput {
  folderName: string;
  scannedAt: Date;
  rows: ReadonlyArray<ScanRow>;
  /** Files listed in the folder (rows can be fewer if the scan was stopped). */
  total: number;
  cancelled: boolean;
}

/** Escape a value for one Markdown table cell. */
export function mdCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim();
}

function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function labelOf(cls: QualityClass): string {
  return CLASS_INFO.find((i) => i.cls === cls)?.label ?? cls;
}

/** The saved report (R5): rating, class counts, one row per file, caveats. */
export function buildReportMarkdown(input: ReportInput): string {
  const counts = countClasses(input.rows);
  const rating = rateCollection(counts);
  const rates = [...new Set(input.rows.filter((r) => r.facts).map((r) => r.facts!.sampleRate))];
  const lines: string[] = [];

  lines.push('# SpectreGram collection report');
  lines.push('');
  lines.push(`- **Folder:** ${input.folderName} (subfolders included)`);
  lines.push(`- **Scanned:** ${fmtDateTime(input.scannedAt)}`);
  if (input.cancelled) {
    lines.push(`- **Files:** ${input.rows.length} of ${input.total} — the scan was stopped early`);
  } else {
    lines.push(`- **Files:** ${input.rows.length}`);
  }
  lines.push('');
  lines.push(`## ${rating.emoji} ${rating.title}`);
  lines.push('');
  lines.push(rating.blurb);
  lines.push('');
  lines.push('| Class | Files |');
  lines.push('| --- | ---: |');
  for (const { cls, label } of CLASS_INFO) lines.push(`| ${label} | ${counts[cls]} |`);
  lines.push('');
  lines.push('## Files');
  lines.push('');
  lines.push('| # | File | Claims | Duration | Cutoff | Class | Verdict |');
  lines.push('| ---: | --- | --- | ---: | ---: | --- | --- |');
  input.rows.forEach((r, i) => {
    const cls = classifyRow(r);
    const cutoff = r.ok && r.cutoffHz > 0 ? `${(r.cutoffHz / 1000).toFixed(1)} kHz` : '—';
    lines.push(
      `| ${i + 1} | ${mdCell(r.name)} | ${mdCell(r.facts?.format ?? '—')} | ` +
        `${r.facts ? fmtDuration(r.facts.durationSec) : '—'} | ${cutoff} | ${labelOf(cls)} | ${mdCell(r.verdict)} |`,
    );
  });
  lines.push('');
  lines.push('## About these results');
  lines.push('');
  lines.push(
    '- Every verdict and the rating above are **estimates** from a frequency-cutoff heuristic, not proof. ' +
      'Legitimately filtered, quiet or resampled masters can fool it.',
  );
  lines.push('- "Claims" is the format the file name says it is; the verdict checks that claim against the audio.');
  lines.push(
    `- Audio was decoded at ${rates.length ? rates.map((r) => `${r} Hz`).join(', ') : 'the device sample rate'}. ` +
      'On a 48 kHz device, genuine 44.1 kHz lossless files can read "Inconclusive", ' +
      'which is why Inconclusive never counts against the rating.',
  );
  lines.push('- Generated locally by SpectreGram. No file was uploaded or changed.');
  lines.push('');
  return lines.join('\n');
}
