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
  /** File > Save menu: renderer paints the spectrogram PNG and saves it. */
  onSavePng: (callback) => {
    const listener = (_event) => callback();
    ipcRenderer.on('sg:save-png', listener);
    return () => ipcRenderer.removeListener('sg:save-png', listener);
  },
});
