// Type for the optional Electron preload bridge (electron/preload.cjs).
// Present only in the desktop build; the web build feature-detects it and
// falls back to browser behavior. Keeping it optional is what lets one
// renderer serve both targets.

export interface SpectreGramDesktop {
  /** Native save dialog + write. Resolves true when the file was saved. */
  savePng(arrayBuffer: ArrayBuffer, defaultName: string): Promise<boolean>;
  /** Read a file the shell handed to the app via open-with. */
  readFile(filePath: string): Promise<ArrayBuffer>;
  /** Subscribe to open-with events; returns an unsubscribe function. */
  onOpenFile(callback: (filePath: string) => void): () => void;
  /** File > Save menu: renderer paints the spectrogram PNG and saves it. */
  onSavePng(callback: () => void): () => void;
}

declare global {
  interface Window {
    spectregramDesktop?: SpectreGramDesktop;
  }
}

export {};
