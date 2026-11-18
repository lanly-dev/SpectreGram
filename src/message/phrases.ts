// Dice phrases for the spectral message (spec: .kiro/specs/spectral-message/,
// R1, R1a). Original wording only — no lyrics, film lines or other quotes, so
// nothing here needs a license. Emoji are cut into the music as silhouettes.
// Each phrase is at most MAX_MESSAGE_CHARS characters as counted by
// countChars (one emoji = one character).

export const MAX_MESSAGE_CHARS = 32;

export const HALLOWEEN_PHRASES: readonly string[] = [
  '👻 BOO 👻',
  '🎃 TRICK OR TREAT 🎃',
  '🦇 HAPPY HALLOWEEN 🦇',
  'THE DEAD DONT STREAM 💀',
  'LOSSLESS FROM THE GRAVE 🪦',
  '💀 RIP 128 KBPS 💀',
  'SPECTRES IN THE STATIC 👻',
  'HAUNTED BY HIGH FREQUENCIES',
  '🕷️ DROP A FILE IF YOU DARE',
  '👻 GHOST NOTES 🎶',
  '🌕 FULL MOON FULL BAND 🐺',
  '🧛 CRYPT KEEPER APPROVED',
  'NO COSTUMES HERE 🎃',
  '🕸️ SOMETHING WICKED 🕸️',
  '👁️ WE ARE WATCHING 👁️',
  'NOTHING TO SEE HERE 👀',
  'THE SPECTRUM REMEMBERS 🔮',
  'BURIED BELOW 16 KHZ ⚰️',
  '🎃👻🦇💀🕷️',
  '🍬 SWEETS OR SPELLS 🧙',
];

// Intl.Segmenter exists in Chromium/Electron and Node, but the project's TS
// lib (ES2020) doesn't declare it; describe just the part used here instead
// of widening the compiler settings.
interface GraphemeSegmenter {
  segment(text: string): Iterable<{ segment: string }>;
}
type SegmenterCtor = new (locale?: string, options?: { granularity: 'grapheme' }) => GraphemeSegmenter;

function graphemes(text: string): string[] {
  const Ctor = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (!Ctor) return Array.from(text); // code points: close enough as a fallback
  return Array.from(new Ctor(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
}

/**
 * Characters as the user sees them (grapheme clusters): "👻" and "🕷️" count
 * as one each, though they are 2–3 UTF-16 code units.
 */
export function countChars(text: string): number {
  return graphemes(text).length;
}

/** The first `max` user-visible characters of `text` (never splits an emoji). */
export function truncateChars(text: string, max: number): string {
  return graphemes(text).slice(0, max).join('');
}

/** A random phrase, never `exclude` (the one already in the text box). */
export function randomPhrase(exclude = '', rand: () => number = Math.random): string {
  const pool = HALLOWEEN_PHRASES.filter((p) => p !== exclude.trim());
  return pool[Math.floor(rand() * pool.length) % pool.length];
}
