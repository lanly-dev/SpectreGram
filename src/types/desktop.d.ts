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
  /** File > Export PNG…: open the export panel, like the toolbar button. */
  onExportOpen(callback: () => void): () => void;
  /** Folder panel: fires when the shell has loaded an audio folder. */
  onFolderLoaded(callback: (data: FolderLoaded) => void): () => void;
  /** Spectral message: native save dialog for the haunted WAV; true if saved. */
  saveWav(arrayBuffer: ArrayBuffer, defaultName: string): Promise<boolean>;
  /** Folder report: save dialog in the scanned folder; resolves true if saved. */
  saveReport(text: string, defaultName: string): Promise<boolean>;
  /** Folder panel: grant read access + open a file from the folder. */
  openFolderFile(filePath: string): Promise<boolean>;
  /** Folder panel: re-list the open folder; false if none is open. */
  refreshFolder(): Promise<boolean>;
  /** Folder panel: listing progress while a folder is being walked. */
  onFolderLoading(callback: (data: FolderLoading) => void): () => void;
  /** Report whether a spectrogram is present (gates Export in the menu). */
  reportSpectrogramState(present: boolean): Promise<boolean>;
  /** Help > About: show the styled in-app About card. Returns an unsubscribe. */
  onShowAbout(callback: () => void): () => void;
  /** Options menu actions; returns an unsubscribe function. */
  onMenuAction(callback: (action: MenuAction, value?: unknown) => void): () => void;
}

/** One audio file in an opened folder; `name` is relative to the folder. */
export interface FolderFile {
  path: string;
  name: string;
}

export interface FolderLoaded {
  folderPath: string;
  folderName: string;
  /** Includes files in subfolders, sorted by relative path. */
  files: FolderFile[];
  /** True when the folder had more audio files than the listing cap. */
  truncated?: boolean;
  /** True when this listing came from the Refresh button. */
  refreshed?: boolean;
}

/** Folder listing progress (R1c). `active: false` = ended without a list. */
export interface FolderLoading {
  active: boolean;
  folderName?: string;
  /** Audio files found so far. */
  found?: number;
  refreshed?: boolean;
}

/** Actions the Options menu sends to the renderer. */
export type MenuAction = 'screensaver-enabled' | 'show-screensaver' | 'toast';

declare global {
  interface Window {
    spectregramDesktop?: SpectreGramDesktop;
  }
}

export {};
