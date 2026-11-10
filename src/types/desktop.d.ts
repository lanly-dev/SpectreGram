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
  /** Folder panel: fires when the shell has loaded an audio folder. */
  onFolderLoaded(callback: (data: { folderPath: string; folderName: string; files: Array<{ path: string; name: string }> }) => void): () => void;
  /** Folder panel: grant read access + open a file from the folder. */
  openFolderFile(filePath: string): Promise<boolean>;
  /** Report whether a spectrogram is present (gates Save as PNG in the menu). */
  reportSpectrogramState(present: boolean): Promise<boolean>;
  /** Options menu actions; returns an unsubscribe function. */
  onMenuAction(callback: (action: MenuAction, value?: unknown) => void): () => void;
}

/** Actions the Options menu sends to the renderer. */
export type MenuAction = 'screensaver-enabled' | 'show-screensaver' | 'toast';

declare global {
  interface Window {
    spectregramDesktop?: SpectreGramDesktop;
  }
}

export {};
