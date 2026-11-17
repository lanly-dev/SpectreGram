// Drumroll sound for the folder-report reveal (spec: .kiro/specs/folder-report/,
// R4 amended). Synthesized with Web Audio — no audio file, so there is no
// recording to license and nothing extra to ship.
//
// A snare roll is a fast run of short noise hits: each hit here is a burst of
// white noise through a band-pass (the snare wires) plus a quick triangle
// "body" tone, ~18 hits/s with a crescendo. The roll ends on a crash: a long
// high-passed noise decay over a low thump. `done` resolves at the crash so
// the reveal lands on it.

export interface Drumroll {
  /** Resolves at the crash (when the reveal should appear). */
  done: Promise<void>;
  /** Silence immediately and release the audio context. */
  stop(): void;
}

/** Length of the roll before the crash (seconds). TUNABLE. */
const ROLL_SEC = 2.2;
/** Roll length when the user prefers reduced motion. */
const ROLL_SEC_REDUCED = 0.6;
/** Snare hits per second. TUNABLE. */
const HITS_PER_SEC = 18;
/** How long the crash rings out before the context is closed. */
const CRASH_TAIL_SEC = 1.8;

function audioContextCtor(): typeof AudioContext | null {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext || w.webkitAudioContext || null;
}

function makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** One snare hit at time `t` with peak gain `level`. */
function snareHit(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, t: number, level: number): void {
  // Wires: band-passed noise, ~45 ms decay. A random start keeps hits from
  // sounding identical.
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1900 + Math.random() * 500;
  bp.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.045);
  src.connect(bp).connect(g).connect(out);
  src.start(t, Math.random() * (noise.duration - 0.06), 0.06);

  // Body: a short falling triangle tone under the wires.
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(240, t);
  osc.frequency.exponentialRampToValueAtTime(150, t + 0.04);
  const og = ctx.createGain();
  og.gain.setValueAtTime(level * 0.35, t);
  og.gain.exponentialRampToValueAtTime(0.0008, t + 0.05);
  osc.connect(og).connect(out);
  osc.start(t);
  osc.stop(t + 0.06);
}

/** The finishing crash at time `t`: cymbal wash + low thump. */
function crash(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, t: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.55, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0008, t + CRASH_TAIL_SEC);
  src.connect(hp).connect(g).connect(out);
  src.start(t, 0, CRASH_TAIL_SEC + 0.05);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.35);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.7, t);
  og.gain.exponentialRampToValueAtTime(0.0008, t + 0.5);
  osc.connect(og).connect(out);
  osc.start(t);
  osc.stop(t + 0.55);
}

/**
 * Play the drumroll. Call from a user gesture (the Reveal click) so the
 * browser allows audio. Without Web Audio it stays silent but `done` still
 * resolves after the same delay, so the reveal always happens.
 */
export function playDrumroll(opts: { reducedMotion?: boolean } = {}): Drumroll {
  const rollSec = opts.reducedMotion ? ROLL_SEC_REDUCED : ROLL_SEC;
  let revealTimer = 0;
  let closeTimer = 0;
  let ctx: AudioContext | null = null;

  const Ctor = audioContextCtor();
  if (Ctor) {
    try {
      ctx = new Ctor();
      void ctx.resume();
      const master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      const noise = makeNoise(ctx, 2);
      const t0 = ctx.currentTime + 0.05;
      const n = Math.max(1, Math.round(rollSec * HITS_PER_SEC));
      for (let i = 0; i < n; i++) {
        const p = i / n;
        // Crescendo with a slight swell into the crash; a little timing
        // jitter keeps it from sounding like a machine gun.
        const level = 0.12 + 0.5 * p * p;
        const jitter = (Math.random() - 0.5) * 0.008;
        snareHit(ctx, master, noise, t0 + i / HITS_PER_SEC + jitter, level);
      }
      crash(ctx, master, noise, t0 + rollSec);
    } catch {
      ctx = null; // fall back to a silent delay
    }
  }

  const close = (): void => {
    if (ctx && ctx.state !== 'closed') void ctx.close();
    ctx = null;
  };

  const done = new Promise<void>((resolve) => {
    revealTimer = window.setTimeout(resolve, (rollSec + 0.05) * 1000);
  });
  closeTimer = window.setTimeout(close, (rollSec + 0.05 + CRASH_TAIL_SEC + 0.2) * 1000);

  return {
    done,
    stop() {
      clearTimeout(revealTimer);
      clearTimeout(closeTimer);
      close();
    },
  };
}
