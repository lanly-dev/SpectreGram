// Dice phrases for the spectral message (spec: .kiro/specs/spectral-message/,
// R1). Original wording only — no lyrics, film lines or other quotes, so
// nothing here needs a license. Each phrase is at most MAX_MESSAGE_CHARS.

export const MAX_MESSAGE_CHARS = 32;

export const HALLOWEEN_PHRASES: readonly string[] = [
  'BOO',
  'TRICK OR TREAT',
  'HAPPY HALLOWEEN',
  'THE DEAD DONT STREAM',
  'LOSSLESS FROM THE GRAVE',
  'RIP 128 KBPS',
  'SPECTRES IN THE STATIC',
  'HAUNTED BY HIGH FREQUENCIES',
  'DROP A FILE IF YOU DARE',
  'GHOST NOTES',
  'FULL MOON FULL BAND',
  'CRYPT KEEPER APPROVED',
  'NO COSTUMES HERE',
  'SOMETHING WICKED',
  'WE ARE WATCHING',
  'NOTHING TO SEE HERE',
  'THE SPECTRUM REMEMBERS',
  'BURIED BELOW 16 KHZ',
];

/** A random phrase, never `exclude` (the one already in the text box). */
export function randomPhrase(exclude = '', rand: () => number = Math.random): string {
  const pool = HALLOWEEN_PHRASES.filter((p) => p !== exclude.trim());
  return pool[Math.floor(rand() * pool.length) % pool.length];
}
