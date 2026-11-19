// SpectreGram — preload bridge (must stay CommonJS: sandboxed preloads
// cannot use ESM). Exposes exactly three capabilities to the renderer; the
// web build feature-detects `window.spectregramDesktop` and falls back to
// browser behavior when it is absent (always, on the web).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spectregramDesktop', {
  /** Show the native save dialog and write PNG bytes. Resolves true if saved. */
  savePng: (arrayBuffer, defaultName) => ipcRenderer.invoke('sg:save-png', arrayBuffer, defaultName),
  /** Read a file the shell handed to the app (open-with). Resolves ArrayBuffer. */
  readFile: (filePath) => ipcRenderer.invoke('sg:read-file', filePath),
  /** Subscribe to open-with file events. Returns an unsubscribe function. */
  onOpenFile: (callback) => {
    const listener = (_event, filePath) => callback(filePath);
    ipcRenderer.on('sg:open-file', listener);
    return () => ipcRenderer.removeListener('sg:open-file', listener);
  },
  /** File > Export PNG…: open the export panel (same as the toolbar button). */
  onExportOpen: (callback) => {
    const listener = (_event) => callback();
    ipcRenderer.on('sg:export-open', listener);
    return () => ipcRenderer.removeListener('sg:export-open', listener);
  },
  /** Folder panel: fires when the shell has loaded an audio folder. */
  onFolderLoaded: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('sg:folder-loaded', listener);
    return () => ipcRenderer.removeListener('sg:folder-loaded', listener);
  },
  /** Folder panel: listing progress (active, folderName, found). */
  onFolderLoading: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('sg:folder-loading', listener);
    return () => ipcRenderer.removeListener('sg:folder-loading', listener);
  },
  /** Folder panel: fires when a single file replaces the open folder. */
  onFolderCleared: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('sg:folder-cleared', listener);
    return () => ipcRenderer.removeListener('sg:folder-cleared', listener);
  },
  /** Folder panel: drop the folder after a file picked/dropped in the page. */
  resetFolder: () => ipcRenderer.invoke('sg:reset-folder'),
  /** Folder panel: re-list the open folder (fires onFolderLoaded again). */
  refreshFolder: () => ipcRenderer.invoke('sg:refresh-folder'),
  /** Folder panel: ask main to grant read access + open a file from the folder. */
  openFolderFile: (filePath) => ipcRenderer.invoke('sg:open-folder-file', filePath),
  /** Report whether a spectrogram is present (gates Export in the menu). */
  reportSpectrogramState: (present) =>
    ipcRenderer.invoke('sg:spectrogram-state', present),
  /** Spectral message: save the haunted WAV via a native dialog. Resolves true if saved. */
  saveWav: (arrayBuffer, defaultName) => ipcRenderer.invoke('sg:save-wav', arrayBuffer, defaultName),
  /** Folder report: save dialog opened in the scanned folder. Resolves true if saved. */
  saveReport: (text, defaultName) => ipcRenderer.invoke('sg:save-report', text, defaultName),
  /** Help > About: show the styled in-app About card. Returns an unsubscribe. */
  onShowAbout: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('sg:about', listener);
    return () => ipcRenderer.removeListener('sg:about', listener);
  },
  /** Options menu actions (screensaver toggle, development helpers, toasts). */
  onMenuAction: (callback) => {
    const listener = (_event, action, value) => callback(action, value);
    ipcRenderer.on('sg:menu-action', listener);
    return () => ipcRenderer.removeListener('sg:menu-action', listener);
  },
});
