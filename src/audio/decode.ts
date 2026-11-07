// Decode + file facts + mono mixdown. decodeAudioData is native and bounded,
// so this runs on the main thread (only the STFT is heavy enough to need the
// worker). decode.ts owns the invariant "the file is decodable or produces a
// clear failure message" — it never throws to the caller.

export interface FileFacts {
  /** Best-effort format label from extension/MIME (decodeAudioData hides the codec). */
  format: string;
  /** AudioBuffer.duration, in seconds. */
  durationSec: number;
  /** AudioBuffer.sampleRate, in Hz. */
  sampleRate: number;
  /** AudioBuffer.numberOfChannels. */
  channels: number;
}

export type DecodeResult =
  | { ok: true; facts: FileFacts; mono: Float32Array; buffer: AudioBuffer }
  | { ok: false; message: string };

const EXT_FORMAT: Record<string, string> = {
  flac: 'FLAC',
  mp3: 'MP3',
  wav: 'WAV',
  wave: 'WAV',
  ogg: 'Ogg',
  oga: 'Ogg',
  opus: 'Ogg',
  m4a: 'M4A',
  mp4: 'M4A',
  aac: 'M4A',
  aif: 'AIFF',
  aiff: 'AIFF',
  webm: 'WebM',
};

function formatFromName(name: string, type: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (ext && EXT_FORMAT[ext]) return EXT_FORMAT[ext];

  // Fall back to the MIME subtype (e.g. "audio/flac" -> "flac").
  if (type && type.includes('/')) {
    const sub = type.split('/')[1].toLowerCase();
    // Strip codec suffixes like "mpeg; codecs=mp3".
    const base = sub.split(';')[0].trim();
    if (EXT_FORMAT[base]) return EXT_FORMAT[base];
    if (base === 'x-wav' || base === 'wav') return 'WAV';
    if (base) return base.toUpperCase();
  }
  return 'Unknown';
}

function getAudioContextCtor(): typeof AudioContext | null {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext || w.webkitAudioContext || null;
}

/** Average all channels into one Float32Array (copy if already mono). */
function mixToMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const out = new Float32Array(length);
  if (channels === 1) {
    out.set(buffer.getChannelData(0));
    return out;
  }
  const gain = 1 / channels;
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      out[i] += data[i] * gain;
    }
  }
  return out;
}

export async function decodeFile(file: File): Promise<DecodeResult> {
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch {
    return { ok: false, message: 'Could not read file.' };
  }

  const Ctor = getAudioContextCtor();
  if (!Ctor) {
    return { ok: false, message: 'Web Audio is not available in this browser.' };
  }

  let ctx: AudioContext | null = null;
  try {
    ctx = new Ctor();
  } catch {
    return { ok: false, message: 'Could not start an AudioContext.' };
  }

  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    const facts: FileFacts = {
      format: formatFromName(file.name, file.type),
      durationSec: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
    };
    const mono = mixToMono(buffer);
    return { ok: true, facts, mono, buffer };
  } catch {
    return {
      ok: false,
      message: 'Could not decode audio — the browser may not support this format.',
    };
  } finally {
    if (ctx && ctx.state !== 'closed') {
      // The decoded AudioBuffer's channel data (Float32Arrays) survives the
      // decode context closing; playback uses its own context in main.ts.
      ctx.close().catch(() => {
        /* ignore close errors */
      });
    }
  }
}
