// Thin Web Worker wrapper around the pure STFT core (stft.ts). Owns only the
// message plumbing — no DSP logic, no state. Created in main.ts with the
// locked Vite syntax:
//   new Worker(new URL('./audio/stft-worker.ts', import.meta.url), { type: 'module' });

import { computeStft } from './stft';
import type { StftParams } from './stft';
import { analyze } from './cutoff';

// Request posted from the main thread (main -> worker).
export type AnalyzeRequest = {
  type: 'analyze';
  samples: Float32Array;
  params?: Partial<StftParams>;
  /** Decoded sample rate, for the cutoff-in-Hz mapping. */
  sampleRate: number;
  /** Claimed format label (from the file), for the verdict wording. */
  claimedFormat: string;
};

// Responses posted from the worker (worker -> main). The grid and the verdict are
// separate messages: the grid is already computed when the cutoff pass starts,
// so the graph never waits on it.
export type WorkerMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'result'; data: Float32Array; frames: number; bins: number }
  | { type: 'verdict'; cutoffHz: number; verdict: string }
  | { type: 'error'; message: string };

// Minimal worker-global shape so we can target the worker's postMessage
// signature without pulling in the WebWorker lib (which conflicts with the
// DOM lib under a single tsconfig).
interface WorkerGlobalScope {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

const scope: WorkerGlobalScope = self as unknown as WorkerGlobalScope;

scope.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as AnalyzeRequest;
  if (!msg || msg.type !== 'analyze') return;

  try {
    const grid = computeStft(msg.samples, msg.params, (fraction) => {
      scope.postMessage({ type: 'progress', fraction } satisfies WorkerMessage, []);
    });
    // The cutoff pass reads the same grid, but the transfer below detaches it,
    // so keep a copy first. Copying here is what lets the grid reach the main
    // thread at once instead of waiting on the percentile sort. (An empty grid —
    // audio too short for one frame — still gets a verdict; analyze decides it.)
    const forCutoff = grid.frames > 0 ? grid.data.slice() : new Float32Array(0);
    // Zero-copy transfer of the magnitude grid back to the main thread
    // (matters for long tracks). The buffer is detached here after transfer.
    scope.postMessage(
      { type: 'result', data: grid.data, frames: grid.frames, bins: grid.bins } satisfies WorkerMessage,
      [grid.data.buffer],
    );
    const { cutoff, verdict } = analyze(
      { data: forCutoff, frames: grid.frames, bins: grid.bins },
      msg.sampleRate,
      msg.claimedFormat,
    );
    scope.postMessage(
      { type: 'verdict', cutoffHz: cutoff.cutoffHz, verdict } satisfies WorkerMessage,
      [],
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    scope.postMessage({ type: 'error', message } satisfies WorkerMessage, []);
  }
};
