// Ambient type declaration for `fft.js` (v4), which ships no bundled .d.ts.
// This declares the *types* only — the FFT algorithm itself is fft.js's
// (MIT). We do NOT hand-roll an FFT (build-conventions forbids it); this file
// just lets TypeScript see the library we import.
declare module 'fft.js' {
  // fft.js v4 returns plain Arrays (zero-filled) from createComplexArray,
  // and accepts ArrayLike real/complex inputs for its transforms.
  export default class FFT {
    constructor(size: number);
    /** Complex output array of length size*2, zero-filled. */
    createComplexArray(): number[];
    /** Convert a real array (length size) into a complex array (length size*2). */
    toComplexArray(input: ArrayLike<number>, arr?: number[]): number[];
    /** Collapse a complex spectrum to its real (even-indexed) part. */
    fromComplexArray(complex: ArrayLike<number>, arr?: number[]): number[];
    /** Forward real-input FFT. Fills only the left half of `out`. */
    realTransform(out: number[], data: ArrayLike<number>): void;
    /** Forward complex FFT. */
    transform(out: number[], data: ArrayLike<number>): void;
    /** Fill the right (mirrored) half of a real spectrum. Not needed here. */
    completeSpectrum(spectrum: number[]): void;
    /** Inverse complex FFT (normalizes by size). */
    inverseTransform(out: number[], data: ArrayLike<number>): void;
  }
}
