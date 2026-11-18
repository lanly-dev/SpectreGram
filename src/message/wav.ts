// 16-bit PCM WAV writer (spec: .kiro/specs/spectral-message/, R4). Pure.

/** Interleave `channels` (equal length, −1…1) into a 16-bit PCM WAV file. */
export function encodeWav16(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const nch = channels.length;
  if (nch < 1) throw new Error('No audio channels.');
  const frames = channels[0].length;
  const dataBytes = frames * nch * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const ascii = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, nch, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nch * 2, true); // byte rate
  v.setUint16(32, nch * 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  v.setUint32(40, dataBytes, true);

  const out = new Int16Array(buf, 44, frames * nch);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      out[i * nch + c] = Math.round(s < 0 ? s * 32768 : s * 32767);
    }
  }
  return buf;
}
