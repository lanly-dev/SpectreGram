// Embed worker (spec: .kiro/specs/spectral-message/): adds the message tones
// to copies of the track's channels and encodes the result as a WAV, off the
// UI thread. Created in main.ts with the locked Vite module-worker syntax.

import { embedMessage, layoutMessage } from './encode';
import { encodeWav16 } from './wav';
import type { TextMask } from './raster';

export type EmbedRequest = {
  type: 'embed';
  /** Copies of the decoded channels (transferred; modified in place). */
  channels: Float32Array[];
  sampleRate: number;
  mask: TextMask;
};

export type EmbedMessage =
  | { type: 'embed-result'; wav: ArrayBuffer; scale: number; dimDb: number }
  | { type: 'embed-error'; message: string };

interface WorkerScope {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as EmbedRequest;
  if (msg?.type !== 'embed') return;
  try {
    const n = msg.channels[0]?.length ?? 0;
    const layout = layoutMessage(msg.mask, n, msg.sampleRate);
    if (!layout) throw new Error('The message does not fit this track.');
    const { scale, dimDb } = embedMessage(msg.channels, msg.sampleRate, msg.mask, layout);
    const wav = encodeWav16(msg.channels, msg.sampleRate);
    scope.postMessage({ type: 'embed-result', wav, scale, dimDb } satisfies EmbedMessage, [wav]);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    scope.postMessage({ type: 'embed-error', message } satisfies EmbedMessage, []);
  }
};
