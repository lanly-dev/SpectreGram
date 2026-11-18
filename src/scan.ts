// Folder scan (spec: .kiro/specs/folder-report/, R2 + R3). Runs every file in
// an opened folder through the same decode → STFT → cutoff pipeline as a
// single open and records each verdict. Files are processed one at a time,
// so only one decoded file is in memory at once. The scan has its own worker
// instance, so the main view's worker (and its zoom samples) is untouched.
// No DOM here: the UI (Scan button, drumroll) lives in main.ts.

import { decodeFile, type FileFacts } from './audio/decode';
import { stftParamsFor } from './audio/stft';
import type { ClassifyRequest, WorkerMessage } from './audio/stft-worker';
import type { FolderFile } from './types/desktop';

export interface ScanRow {
  /** Path relative to the scanned folder ("/" separators). */
  name: string;
  /** Null when the file could not be read or decoded. */
  facts: FileFacts | null;
  cutoffHz: number;
  /** Verdict text from cutoff.ts, or the error message when `ok` is false. */
  verdict: string;
  /** False when the file could not be read, decoded or analyzed. */
  ok: boolean;
}

export interface ScanOptions {
  /** Read a file the shell listed (the desktop bridge's readFile). */
  readFile(path: string): Promise<ArrayBuffer>;
  /** Called after each file: `done` of `total` processed. */
  onProgress?(done: number, total: number): void;
  /** Checked between files; returning true stops the scan. */
  isCancelled(): boolean;
}

export interface ScanResult {
  rows: ScanRow[];
  /** True when the user stopped the scan before every file was processed. */
  cancelled: boolean;
}

type ClassifyReply = { cutoffHz: number; verdict: string };

/** Spawns the scan worker and matches classify replies to requests. */
function createClassifier(): {
  classify(req: Omit<ClassifyRequest, 'type' | 'id'>): Promise<ClassifyReply>;
  dispose(): void;
} {
  // Locked Vite module-worker syntax (build-conventions.md).
  const worker = new Worker(new URL('./audio/stft-worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, { resolve(r: ClassifyReply): void; reject(e: Error): void }>();
  let nextId = 0;

  worker.onmessage = (ev: MessageEvent) => {
    const msg = ev.data as WorkerMessage;
    if (msg.type !== 'classify-result' && msg.type !== 'classify-error') return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.type === 'classify-result') p.resolve({ cutoffHz: msg.cutoffHz, verdict: msg.verdict });
    else p.reject(new Error(msg.message));
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || 'Scan worker failed.');
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };

  return {
    classify(req) {
      const id = ++nextId;
      return new Promise<ClassifyReply>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const msg: ClassifyRequest = { type: 'classify', id, ...req };
        // Transfer: the scan keeps no copy of the samples.
        worker.postMessage(msg, [req.samples.buffer]);
      });
    },
    dispose() {
      worker.terminate();
      const err = new Error('Scan stopped.');
      for (const p of pending.values()) p.reject(err);
      pending.clear();
    },
  };
}

function baseName(relPath: string): string {
  const i = relPath.lastIndexOf('/');
  return i >= 0 ? relPath.slice(i + 1) : relPath;
}

/** Scan `files` in order; resolves with one row per processed file. */
export async function runScan(files: FolderFile[], opts: ScanOptions): Promise<ScanResult> {
  const rows: ScanRow[] = [];
  const classifier = createClassifier();
  let cancelled = false;
  try {
    for (const f of files) {
      if (opts.isCancelled()) {
        cancelled = true;
        break;
      }
      rows.push(await scanOne(f, opts, classifier.classify));
      opts.onProgress?.(rows.length, files.length);
    }
  } finally {
    classifier.dispose();
  }
  return { rows, cancelled: cancelled || rows.length < files.length };
}

async function scanOne(
  f: FolderFile,
  opts: ScanOptions,
  classify: ReturnType<typeof createClassifier>['classify'],
): Promise<ScanRow> {
  let bytes: ArrayBuffer;
  try {
    bytes = await opts.readFile(f.path);
  } catch {
    return { name: f.name, facts: null, cutoffHz: 0, verdict: 'Could not read the file.', ok: false };
  }
  // The file name drives the claimed format (decode.ts), so keep the real one.
  const res = await decodeFile(new File([bytes], baseName(f.name)));
  if (!res.ok) return { name: f.name, facts: null, cutoffHz: 0, verdict: res.message, ok: false };
  try {
    const { cutoffHz, verdict } = await classify({
      samples: res.mono,
      params: stftParamsFor(res.mono.length),
      sampleRate: res.facts.sampleRate,
      claimedFormat: res.facts.format,
    });
    return { name: f.name, facts: res.facts, cutoffHz, verdict, ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { name: f.name, facts: res.facts, cutoffHz: 0, verdict: `Analysis failed: ${message}`, ok: false };
  }
}
