// Thin Web Worker wrapper around the pure STFT core (stft.ts). Owns message
// plumbing plus one piece of state: the current file's mono samples, kept
// after the full analysis so zoom requests can re-analyze a segment without
// re-sending the audio. No DSP logic lives here. Created in main.ts with the
// locked Vite syntax:
//   new Worker(new URL('./audio/stft-worker.ts', import.meta.url), { type: 'module' });

import { computeStft, computeStftSegment } from './stft';
import type { StftParams } from './stft';
import { analyze } from './cutoff';

// Requests posted from the main thread (main -> worker).
export type AnalyzeRequest = {
  type: 'analyze';
  samples: Float32Array;
  params?: Partial<StftParams>;
  /** Decoded sample rate, for the cutoff-in-Hz mapping. */
  sampleRate: number;
  /** Claimed format label (from the file), for the verdict wording. */
  claimedFormat: string;
};

/** Re-analyze one segment of the held samples for the zoomed view. */
export type ZoomRequest = {
  type: 'zoom';
  /** Echoed back so the main thread can drop stale results. */
  id: number;
  startSample: number;
  endSample: number;
  /** Target column count (the canvas width). */
  columns: number;
};

export type WorkerRequest = AnalyzeRequest | ZoomRequest;

// Responses posted from the worker (worker -> main). The grid and the verdict are
// separate messages: the grid is already computed when the cutoff pass starts,
// so the graph never waits on it. Zoom results and failures are separate types
// so a failed zoom never looks like a failed analysis.
export type WorkerMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'result'; data: Float32Array; frames: number; bins: number }
  | { type: 'verdict'; cutoffHz: number; verdict: string }
  | { type: 'error'; message: string }
  | { type: 'zoom-result'; id: number; data: Float32Array; frames: number; bins: number }
  | { type: 'zoom-error'; id: number; message: string };

// Minimal worker-global shape so we can target the worker's postMessage
// signature without pulling in the WebWorker lib (which conflicts with the
// DOM lib under a single tsconfig).
interface WorkerGlobalScope {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

const scope: WorkerGlobalScope = self as unknown as WorkerGlobalScope;

// The current file's samples and STFT params (one file per worker: main.ts
// tears the worker down when a new file arrives).
let heldSamples: Float32Array | null = null;
let heldParams: Partial<StftParams> | undefined;

function handleAnalyze(msg: AnalyzeRequest): void {
  heldSamples = msg.samples;
  heldParams = msg.params;
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
}

function handleZoom(msg: ZoomRequest): void {
  try {
    if (!heldSamples) throw new Error('No audio loaded to zoom into.');
    const grid = computeStftSegment(
      heldSamples,
      msg.startSample,
      msg.endSample,
      msg.columns,
      heldParams,
    );
    scope.postMessage(
      {
        type: 'zoom-result',
        id: msg.id,
        data: grid.data,
        frames: grid.frames,
        bins: grid.bins,
      } satisfies WorkerMessage,
      [grid.data.buffer],
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    scope.postMessage({ type: 'zoom-error', id: msg.id, message } satisfies WorkerMessage, []);
  }
}

scope.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as WorkerRequest;
  if (msg?.type === 'analyze') handleAnalyze(msg);
  else if (msg?.type === 'zoom') handleZoom(msg);
};
