// SpectreGram — Electron main process (plain JS, ESM).
// Shell only: window, custom app:// protocol serving dist/, native save
// dialog for PNG export, and open-with file routing. All analysis stays in
// the renderer (Web Audio + module Web Worker), exactly as in the web build.
// Spec: /.kiro/specs/electron-shell/

import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MENU_LABELS } from './menu-labels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');
const DEV_URL = process.env.SPECTREGRAM_DEV_URL || '';

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.wma']);

// The renderer may only read files the shell itself handed it (open-with /
// second-instance argv). There is no path input in the UI, so nothing else
// can legitimately request a read.
const allowedReadPaths = new Set();

let mainWindow = null;
let rendererReady = false;
let pendingOpenPath = null;
// Remember the directory of the last file the user picked via File > Open so
// the dialog reopens there next time.
let lastOpenDir = '';
// Whether the renderer currently has a spectrogram to export. Gates the Export item.
let hasSpectrogram = false;
// Interface language picked in the renderer; the native menu is rebuilt in it.
let uiLanguage = 'en';
// Menu checkbox state, preserved when the menu is rebuilt for a language.
let advancedExportEnabled = true;
let screensaverDisabled = false;

// Test-only hooks (used by the headless smoke run; inert otherwise).
const SMOKE_FILE = process.env.SPECTREGRAM_SMOKE_FILE || '';
const SMOKE_SAVE_DIR = process.env.SPECTREGRAM_SMOKE_SAVE_DIR || '';
// Folder-report smoke: open this folder, Scan, wait for the reveal, save.
const SMOKE_FOLDER = process.env.SPECTREGRAM_SMOKE_FOLDER || '';
// Folder refresh smoke: copy this file into SMOKE_FOLDER, then click Refresh.
const SMOKE_REFRESH_ADD = process.env.SPECTREGRAM_SMOKE_REFRESH_ADD || '';
// Slow the folder walk by this many ms per folder, so the loading state can
// be observed (test-only; 0 in normal use).
const SMOKE_WALK_DELAY_MS = Number(process.env.SPECTREGRAM_SMOKE_WALK_DELAY_MS) || 0;
// Spectral-message smoke: haunt SMOKE_FILE with this text, then reopen it.
const SMOKE_MESSAGE = process.env.SPECTREGRAM_SMOKE_MESSAGE || '';
// Ruler-seek smoke: after SMOKE_FILE's verdict, hover/click the time ruler and play from the cue.
const SMOKE_SEEK = process.env.SPECTREGRAM_SMOKE_SEEK === '1';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

function pathFromArgv(argv) {
  for (const arg of argv) {
    if (!arg || arg.startsWith('-')) continue;
    if (AUDIO_EXTS.has(path.extname(arg).toLowerCase())) return path.resolve(arg);
  }
  return null;
}

// `fromFolder` marks an open started by clicking a row in the folder panel: the
// listing still describes what is on screen, so the folder stays selected.
// Every other single-file open ends the folder session.
function queueOpenFile(filePath, { fromFolder = false } = {}) {
  if (!filePath) return;
  if (!fromFolder) clearFolder();
  allowedReadPaths.add(filePath);
  if (mainWindow && rendererReady) {
    mainWindow.webContents.send('sg:open-file', filePath);
  } else {
    pendingOpenPath = filePath;
  }
}

// macOS open-with can fire before the app is ready; register early.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  queueOpenFile(filePath);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = pathFromArgv(argv);
    if (filePath) queueOpenFile(filePath);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function registerProtocol() {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const filePath = path.normalize(path.join(DIST_DIR, pathname));
    // Traversal guard: never serve outside dist/.
    if (!filePath.startsWith(DIST_DIR)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function registerIpc() {
  ipcMain.handle('sg:save-png', async (_event, arrayBuffer, defaultName) => {
    const safeName = path.basename(String(defaultName || 'spectregram.png'));
    // Smoke mode: write without a dialog so the save path is testable headless.
    if (SMOKE_SAVE_DIR) {
      await fs.promises.writeFile(path.join(SMOKE_SAVE_DIR, safeName), Buffer.from(arrayBuffer));
      return true;
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: safeName,
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fs.promises.writeFile(result.filePath, Buffer.from(arrayBuffer));
    return true;
  });

  // Folder report (spec: .kiro/specs/folder-report/, R5): the save dialog
  // opens inside the folder being scanned; nothing is written without it.
  ipcMain.handle('sg:save-report', async (_event, text, defaultName) => {
    if (typeof text !== 'string' || text.length > 10 * 1024 * 1024) {
      throw new Error('Invalid report.');
    }
    const safeName = path.basename(String(defaultName || 'spectregram-report.md'));
    if (SMOKE_SAVE_DIR) {
      await fs.promises.writeFile(path.join(SMOKE_SAVE_DIR, safeName), text, 'utf8');
      return true;
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: currentFolderPath ? path.join(currentFolderPath, safeName) : safeName,
      filters: [{ name: 'Markdown report', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fs.promises.writeFile(result.filePath, text, 'utf8');
    return true;
  });

  // Spectral message (spec: .kiro/specs/spectral-message/, R4): save the
  // haunted WAV through a native dialog; nothing is written without it.
  ipcMain.handle('sg:save-wav', async (_event, arrayBuffer, defaultName) => {
    // Same shape check as the PNG bytes: whatever the IPC clone produced must
    // be binary with a byte length (not a string or object from the renderer).
    if (!arrayBuffer || typeof arrayBuffer.byteLength !== 'number') throw new Error('Invalid audio.');
    const safeName = path.basename(String(defaultName || 'spectregram-haunted.wav'));
    if (SMOKE_SAVE_DIR) {
      await fs.promises.writeFile(path.join(SMOKE_SAVE_DIR, safeName), Buffer.from(arrayBuffer));
      return true;
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: lastOpenDir ? path.join(lastOpenDir, safeName) : safeName,
      filters: [{ name: 'WAV audio', extensions: ['wav'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fs.promises.writeFile(result.filePath, Buffer.from(arrayBuffer));
    return true;
  });

  ipcMain.handle('sg:read-file', async (_event, filePath) => {
    const resolved = path.resolve(String(filePath));
    if (!allowedReadPaths.has(resolved)) {
      throw new Error('File was not handed to the app by the shell.');
    }
    const data = await fs.promises.readFile(resolved);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  });

  // Refresh (R1b): re-list the open folder with the options it was opened
  // with. Resolves false when no folder is open.
  ipcMain.handle('sg:refresh-folder', async () => {
    if (!currentFolderPath) return false;
    await loadFolder(currentFolderPath, { ...currentFolderOptions, refreshed: true });
    return true;
  });

  ipcMain.handle('sg:open-folder-file', async (_event, filePath) => {
    queueOpenFile(filePath, { fromFolder: true });
    return true;
  });

  // A file picked/dropped in the renderer leaves the folder listing stale too.
  ipcMain.handle('sg:reset-folder', async () => {
    clearFolder();
    return true;
  });

  // Renderer reports whether a spectrogram is present, gating the Export item.
  ipcMain.handle('sg:spectrogram-state', (_event, present) => {
    hasSpectrogram = Boolean(present);
    const item = Menu.getApplicationMenu()?.getMenuItemById('export-png');
    if (item) item.enabled = hasSpectrogram;
    return true;
  });

  // The renderer picked an interface language: rebuild the native menu in it.
  ipcMain.on('sg:set-language', (_event, code) => {
    if (typeof code !== 'string' || !MENU_LABELS[code] || code === uiLanguage) return;
    uiLanguage = code;
    buildMenu();
  });
}

// --- Native menu (File / Help) --------------------------------------------

function menuOpen() {
  if (!mainWindow) return;
  // Electron expects extensions WITHOUT leading dots; AUDIO_EXTS stores them
  // with dots for path.extname comparison elsewhere.
  const audioFilters = [...AUDIO_EXTS].map((ext) => ext.slice(1)).sort();
  void dialog
    .showOpenDialog(mainWindow, {
      properties: ['openFile'],
      defaultPath: lastOpenDir,
      filters: [{ name: menuT('audioFiles'), extensions: audioFilters }],
    })
    .then((result) => {
      if (result.canceled || !result.filePaths.length) return;
      // Remember the directory for next time.
      lastOpenDir = path.dirname(result.filePaths[0]);
      queueOpenFile(result.filePaths[0]);
    });
}

/** Send a menu-driven action to the renderer (see onMenuAction in preload). */
function sendMenuAction(action, value) {
  if (mainWindow && rendererReady) mainWindow.webContents.send('sg:menu-action', action, value);
}

/** Show a toast in the renderer. kind: 'info' | 'error'. */
function sendToast(message, kind = 'info') {
  sendMenuAction('toast', { message, kind });
}

/** Most audio files a folder listing (and therefore a scan) will include. */
const MAX_FOLDER_FILES = 1000;

/**
 * Collect audio files under `root`, subfolders included (spec:
 * .kiro/specs/folder-report/, R1). Hidden entries (".name") are skipped.
 * Symbolic links are never followed — `Dirent.isDirectory()` is false for a
 * link — so a link loop can't trap the walk. Stops at `cap` files.
 * Unreadable subfolders are skipped rather than failing the whole listing.
 * Returns `{ files, truncated }`; each file is `{ path, name }`, where `name`
 * is the path relative to `root` with "/" separators, sorted by name.
 */
async function walkAudioFiles(root, cap, onProgress) {
  const files = [];
  let truncated = false;
  const stack = [root];
  let lastReport = 0;
  while (stack.length) {
    const dir = stack.pop();
    // Live count for the loading message (R1c), at most every ~150 ms.
    if (onProgress && Date.now() - lastReport > 150) {
      lastReport = Date.now();
      onProgress(files.length);
    }
    if (SMOKE_WALK_DELAY_MS) await new Promise((r) => setTimeout(r, SMOKE_WALK_DELAY_MS));
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (dir === root) throw e; // the folder itself must be readable
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) {
        if (files.length >= cap) {
          truncated = true;
          break;
        }
        files.push({ path: full, name: path.relative(root, full).split(path.sep).join('/') });
      }
    }
    if (truncated) break;
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { files, truncated };
}

// The folder currently shown in the panel; Save report opens its dialog here.
let currentFolderPath = '';
// The options it was opened with (limit, display name), so Refresh lists it
// exactly the same way (spec: .kiro/specs/folder-report/, R1b).
let currentFolderOptions = {};
// Bumped per folder load; see loadFolder (R1c).
let folderLoadSeq = 0;

/**
 * Forget the open folder: a single file was opened, so the panel no longer
 * shows what the app is playing. Bumping the load sequence also drops a walk
 * that is still running, and the renderer clears its panel.
 */
function clearFolder() {
  currentFolderPath = '';
  currentFolderOptions = {};
  folderLoadSeq++;
  if (mainWindow && rendererReady) mainWindow.webContents.send('sg:folder-cleared');
}

/**
 * List the audio files in `folderPath` and its subfolders (optionally only
 * the first `limit`, by relative path), grant the renderer read access to
 * them, and show them in the folder panel under `displayName`.
 */
async function loadFolder(folderPath, { limit = Infinity, displayName, refreshed = false } = {}) {
  if (!mainWindow) return;
  // Only the latest load may report (R1c): a slow walk replaced by a newer
  // one must not flash its progress or overwrite the newer list.
  const seq = ++folderLoadSeq;
  const folderName = displayName || path.basename(folderPath);
  const loading = (data) => {
    if (seq === folderLoadSeq && mainWindow) mainWindow.webContents.send('sg:folder-loading', data);
  };
  loading({ active: true, folderName, found: 0, refreshed });
  try {
    const cap = Math.min(limit, MAX_FOLDER_FILES);
    const { files, truncated } = await walkAudioFiles(folderPath, cap, (found) =>
      loading({ active: true, folderName, found, refreshed }),
    );
    if (seq !== folderLoadSeq || !mainWindow) return;
    if (!files.length) {
      loading({ active: false });
      sendToast('No audio files in that folder or its subfolders.', 'error');
      return;
    }
    // Grant the renderer read access to every listed audio file.
    files.forEach((f) => allowedReadPaths.add(f.path));
    currentFolderPath = folderPath;
    currentFolderOptions = { limit, displayName };
    mainWindow.webContents.send('sg:folder-loaded', {
      folderPath,
      folderName: displayName || path.basename(folderPath),
      files,
      // Only report the global cap, not a deliberate `limit` (sample folder).
      truncated: truncated && cap === MAX_FOLDER_FILES,
      refreshed,
    });
  } catch (e) {
    console.error('read folder failed:', e);
    if (seq !== folderLoadSeq) return;
    loading({ active: false });
    sendToast('Could not read that folder.', 'error');
  }
}

function menuOpenFolder() {
  if (!mainWindow) return;
  void dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] }).then((result) => {
    if (result.canceled || !result.filePaths.length) return;
    void loadFolder(path.resolve(result.filePaths[0]));
  });
}

// --- Options menu -----------------------------------------------------------

// Local sample tracks for development: the repo's lab/ folder (gitignored —
// it holds personal test audio, so it is absent from clones and packaged
// builds). Resolved relative to this file, never hard-coded.
const SAMPLE_DIR = path.join(__dirname, '..', 'lab');
const SAMPLE_LIMIT = 10;

// Checkbox reads "Advanced Export": checked = Export opens the panel (default).
// Unchecked, the renderer saves the current view straight away instead.
function menuToggleAdvancedExport(item) {
  advancedExportEnabled = item.checked;
  sendMenuAction('advanced-export', item.checked);
}

function menuToggleScreensaver(item) {
  // Checkbox reads "Disable Screensaver": checked = screensaver off.
  screensaverDisabled = item.checked;
  sendMenuAction('screensaver-enabled', !item.checked);
}

function menuShowScreensaver() {
  sendMenuAction('show-screensaver');
}

function menuTestErrorToast() {
  sendToast('Test error: this is what an error toast looks like.', 'error');
}

// One track from lab/ for a quick single-file check (open-file path, the same
// as File ▸ Open): the first audio file in name order. lab/ is local-only.
function menuLoadSampleAudio() {
  if (!fs.existsSync(SAMPLE_DIR)) {
    sendToast('No sample audio: lab/ is missing (it is local-only, not in the repo).', 'error');
    return;
  }
  const names = fs
    .readdirSync(SAMPLE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && AUDIO_EXTS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  if (!names.length) {
    sendToast('No sample audio: lab/ has no audio files.', 'error');
    return;
  }
  queueOpenFile(path.join(SAMPLE_DIR, names[0]));
}

function menuLoadSampleFolder() {
  if (!fs.existsSync(SAMPLE_DIR)) {
    sendToast('No sample folder: lab/ is missing (it is local-only, not in the repo).', 'error');
    return;
  }
  void loadFolder(SAMPLE_DIR, { limit: SAMPLE_LIMIT, displayName: 'Sample tracks' });
}


// File > Export PNG…: opens the same export panel as the toolbar button.
function menuExport() {
  if (!hasSpectrogram) return;
  if (mainWindow) mainWindow.webContents.send('sg:export-open');
}

function menuExit() {
  app.quit();
}

// Help > Language: the renderer draws the picker card, like About, so the
// language list wears the app's own styling instead of a native dialog.
function menuLanguage() {
  if (mainWindow) mainWindow.webContents.send('sg:language');
}

// Help > About: the renderer draws the card, so it can wear the app's own
// haunted styling — a native message box can't be themed and insists on a
// generic system glyph.
function menuAbout() {
  if (!mainWindow) return;
  mainWindow.webContents.send('sg:about');
}

function menuDevTools() {
  if (mainWindow) mainWindow.webContents.toggleDevTools();
}

/** One native-menu label in the current language, English when missing. */
function menuT(key) {
  return MENU_LABELS[uiLanguage]?.[key] ?? MENU_LABELS.en[key];
}

function buildMenu() {
  // Test-only: print the menu in a chosen language (SPECTREGRAM_SMOKE_MENU).
  const smokeLang = process.env.SPECTREGRAM_SMOKE_MENU_LANG;
  if (smokeLang && MENU_LABELS[smokeLang]) uiLanguage = smokeLang;
  const template = [
    {
      label: menuT('file'),
      submenu: [
        {
          label: menuT('open'),
          accelerator: process.platform === 'darwin' ? 'Cmd+O' : 'Ctrl+O',
          click: menuOpen,
        },
        {
          label: menuT('openFolder'),
          accelerator: process.platform === 'darwin' ? 'Cmd+Shift+O' : 'Ctrl+Shift+O',
          click: menuOpenFolder,
        },
        {
          id: 'export-png',
          label: menuT('exportPng'),
          accelerator: process.platform === 'darwin' ? 'Cmd+S' : 'Ctrl+S',
          enabled: hasSpectrogram,
          click: menuExport,
        },
        { type: 'separator' },
        {
          label: menuT('exit'),
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: menuExit,
        },
      ],
    },
    {
      label: menuT('options'),
      submenu: [
        {
          id: 'advanced-export',
          label: menuT('advancedExport'),
          type: 'checkbox',
          checked: advancedExportEnabled,
          click: menuToggleAdvancedExport,
        },
        {
          id: 'disable-screensaver',
          label: menuT('disableScreensaver'),
          type: 'checkbox',
          checked: screensaverDisabled,
          click: menuToggleScreensaver,
        },
        {
          label: menuT('development'),
          submenu: [
            { label: menuT('showScreensaver'), click: menuShowScreensaver },
            { label: menuT('showErrorToast'), click: menuTestErrorToast },
            { label: menuT('loadSampleAudio'), click: menuLoadSampleAudio },
            { label: menuT('loadSampleFolder'), click: menuLoadSampleFolder },
            { type: 'separator' },
            {
              label: menuT('devTools'),
              accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'F12',
              click: menuDevTools,
            },
          ],
        },
      ],
    },
    {
      label: menuT('help'),
      submenu: [
        { label: menuT('language'), click: menuLanguage },
        { label: menuT('about'), click: menuAbout },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  // Test-only: print the built menu (labels + accelerators) and quit.
  if (process.env.SPECTREGRAM_SMOKE_MENU === '1') {
    const walk = (items) =>
      items.map((i) =>
        i.type === 'separator'
          ? '---'
          : i.submenu
            ? { [i.label]: walk(i.submenu.items) }
            : i.accelerator
              ? `${i.label} [${i.accelerator}]`
              : i.label,
      );
    console.log('SMOKE_MENU', JSON.stringify(walk(Menu.getApplicationMenu().items)));
    app.exit(0);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 666,
    height: 366,
    minWidth: 320,
    minHeight: 240,
    title: 'SpectreGram',
    // Window/taskbar icon for unpackaged runs (start/dev). The packaged
    // installer/exe icon comes from electron-builder's build/icon.png —
    // without this option, a running window falls back to Electron's.
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.SPECTREGRAM_SMOKE === '1') {
    mainWindow.webContents.on('console-message', (_e, _level, message) => {
      console.log('[renderer]', message);
    });
  }

  mainWindow.webContents.on('did-finish-load', () => {
    rendererReady = true;
    if (pendingOpenPath) {
      const p = pendingOpenPath;
      pendingOpenPath = null;
      mainWindow.webContents.send('sg:open-file', p);
    }
    if (SMOKE_FILE) void runSmoke();
    else if (SMOKE_FOLDER) void runFolderSmoke();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
  });

  if (DEV_URL) {
    void mainWindow.loadURL(DEV_URL);
  } else {
    void mainWindow.loadURL('app://bundle/index.html');
  }
}

// --- Headless smoke (env-gated; not reachable in normal use) ----------------
// Opens SMOKE_FILE through the real open-file path, waits for the verdict to
// land in the DOM (which proves decode + module worker + cutoff + render in
// the packaged environment), then exercises the PNG save bridge.
async function runSmoke() {
  const started = Date.now();
  const poll = async () => {
    try {
      const raw = await mainWindow.webContents.executeJavaScript(`JSON.stringify({
        bridge: !!window.spectregramDesktop,
        verdict: (document.getElementById('verdict') || {}).textContent || '',
        verdictClass: (document.getElementById('verdict') || {}).className || '',
        facts: (document.getElementById('facts') || {}).textContent || '',
        canvasW: (document.getElementById('canvas') || {}).width || 0
      })`);
      const state = JSON.parse(raw);
      // A real verdict, not the loading note ("Decoding…" / "Analyzing… N%"),
      // which also lives in #verdict (with the 'pending' class). Every real
      // verdict names the claim, a missing cutoff, or a too-short file (the
      // trailing "(estimate)" marker was dropped from the verdict strings).
      const done =
        !/\bpending\b/.test(state.verdictClass) && /Claims |No clear cutoff|too short/.test(state.verdict);
      if (done) {
        console.log('SMOKE_ANALYSIS_OK', JSON.stringify(state));
        if (SMOKE_MESSAGE) {
          await runMessageSmoke();
          return;
        }
        if (SMOKE_SEEK) {
          await runSeekSmoke();
          return;
        }
        if (SMOKE_SAVE_DIR) {
          await mainWindow.webContents.executeJavaScript(`document.getElementById('png-btn').click()`);
          // Advanced Export is on by default, so the button opens the panel —
          // confirm it there (the panel's Export button does the write).
          await new Promise((r) => setTimeout(r, 400));
          await mainWindow.webContents.executeJavaScript(`(() => {
            const m = document.getElementById('export-modal');
            if (m && !m.hidden) document.getElementById('export-go').click();
          })()`);
          await new Promise((r) => setTimeout(r, 1500));
          const base = path.basename(SMOKE_FILE).replace(/\.[^.]+$/, '');
          const savedPath = path.join(SMOKE_SAVE_DIR, `${base}-spectrogram.png`);
          if (fs.existsSync(savedPath) && fs.statSync(savedPath).size > 0) {
            console.log('SMOKE_SAVE_OK', savedPath);
            app.exit(0);
            return;
          }
          console.log('SMOKE_SAVE_FAIL', savedPath);
          app.exit(3);
          return;
        }
        app.exit(0);
        return;
      }
    } catch {
      /* renderer not ready yet */
    }
    if (Date.now() - started > 45000) {
      console.log('SMOKE_TIMEOUT');
      app.exit(2);
      return;
    }
    setTimeout(poll, 500);
  };
  void poll();
}

// Ruler-seek smoke (env-gated, test-only): hover the bottom ruler at 50%,
// click to cue, play ~1 s, stop. Prints the DOM measurements at each step.
async function runSeekSmoke() {
  const js = (code) => mainWindow.webContents.executeJavaScript(code);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const measure = `JSON.stringify((() => {
    const wrap = document.getElementById('canvas-wrap');
    const line = document.getElementById('seek-hover');
    const tip = document.getElementById('seek-tooltip');
    const ph = document.getElementById('playhead');
    return {
      wrapW: wrap.clientWidth,
      hoverHidden: line.hidden, hoverLeft: line.style.left,
      tipHidden: tip.hidden, tip: tip.textContent,
      phDisplay: ph.style.display, phLeft: ph.style.left,
      playing: document.getElementById('play-btn').classList.contains('playing'),
      seekable: document.getElementById('ruler-bottom').classList.contains('seekable')
    };
  })())`;
  try {
    await js(`(() => {
      const r = document.getElementById('ruler-bottom').getBoundingClientRect();
      const x = r.left + r.width * 0.5, y = r.top + r.height / 2;
      document.getElementById('ruler-bottom').dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
    })()`);
    console.log('SEEK_HOVER', await js(measure));
    await js(`(() => {
      const r = document.getElementById('ruler-bottom').getBoundingClientRect();
      const x = r.left + r.width * 0.5, y = r.top + r.height / 2;
      document.getElementById('ruler-bottom').dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
    })()`);
    await sleep(100);
    console.log('SEEK_CUED', await js(measure));
    await js(`document.getElementById('play-btn').click()`);
    await sleep(1000);
    console.log('SEEK_PLAYING', await js(measure));
    await js(`document.getElementById('play-btn').click()`);
    await sleep(200);
    console.log('SEEK_STOPPED', await js(measure));
    await js(`document.getElementById('ruler-bottom').dispatchEvent(new PointerEvent('pointerleave'))`);
    console.log('SEEK_LEFT', await js(measure));
    app.exit(0);
  } catch (err) {
    console.log('SEEK_FAIL', String(err));
    app.exit(4);
  }
}

// Spectral-message smoke (env-gated, test-only): after SMOKE_FILE's verdict,
// haunt it with SMOKE_MESSAGE through the real dialog, wait for the saved WAV
// to reopen and get its own verdict, then save that spectrogram as a PNG.
async function runMessageSmoke() {
  const js = (code) => mainWindow.webContents.executeJavaScript(code);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await js(`document.getElementById('message-btn').click()`);
    await sleep(300);
    await js(`(() => {
      const i = document.getElementById('message-input');
      i.value = ${JSON.stringify(SMOKE_MESSAGE)};
      i.dispatchEvent(new Event('input'));
      document.getElementById('message-form').requestSubmit();
    })()`);
    const t0 = Date.now();
    for (;;) {
      const raw = await js(`JSON.stringify({
        title: document.title,
        verdict: (document.getElementById('verdict') || {}).textContent || '',
        verdictClass: (document.getElementById('verdict') || {}).className || '',
        facts: (document.getElementById('facts') || {}).textContent || '',
        toast: (document.getElementById('toast') || {}).textContent || ''
      })`);
      const s = JSON.parse(raw);
      const ready =
        s.title.includes('-haunted') &&
        !/\bpending\b/.test(s.verdictClass) &&
        /Claims |No clear cutoff|too short/.test(s.verdict);
      if (ready) {
        console.log('SMOKE_MESSAGE_OK', `ms=${Date.now() - t0}`, raw);
        break;
      }
      if (Date.now() - t0 > 120000) throw new Error(`haunted file never analyzed; last toast: ${s.toast}`);
      await sleep(400);
    }
    await js(`document.getElementById('png-btn').click()`);
    await sleep(1500);
    for (const f of fs.readdirSync(SMOKE_SAVE_DIR)) {
      console.log('SMOKE_MESSAGE_FILE', f, fs.statSync(path.join(SMOKE_SAVE_DIR, f)).size);
    }
    app.exit(0);
  } catch (e) {
    console.log('SMOKE_MESSAGE_FAIL', e.message);
    app.exit(4);
  }
}

// Folder-report smoke (env-gated, test-only): loads SMOKE_FOLDER through the
// real recursive listing, clicks Scan, waits for the drumroll reveal, prints
// the listing + rating, then saves the report via the smoke save path.
async function runFolderSmoke() {
  const js = (code) => mainWindow.webContents.executeJavaScript(code);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const started = Date.now();
  const loadDone = loadFolder(path.resolve(SMOKE_FOLDER));
  if (SMOKE_WALK_DELAY_MS) {
    // Loading-state check (R1c): sample the panel while the slowed walk runs.
    const seen = [];
    for (;;) {
      const s = JSON.parse(
        await mainWindow.webContents.executeJavaScript(`JSON.stringify({
          loading: !document.getElementById('folder-loading').hidden,
          listHidden: document.getElementById('folder-list').hidden,
          refreshDisabled: document.getElementById('refresh-btn').disabled,
          scanDisabled: document.getElementById('scan-btn').disabled,
          detail: document.getElementById('folder-loading-detail').textContent,
          rows: document.querySelectorAll('#folder-list li').length
        })`),
      );
      seen.push(s);
      if (!s.loading && s.rows > 0) break;
      if (Date.now() - started > 60000) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const during = seen.filter((s) => s.loading);
    console.log(
      'SMOKE_LOADING',
      JSON.stringify({
        samples: seen.length,
        loadingSamples: during.length,
        allDisabled: during.every((s) => s.refreshDisabled && s.scanDisabled && s.listHidden),
        details: [...new Set(during.map((s) => s.detail))].slice(0, 4).concat(['…']).concat([during.at(-1)?.detail]),
        end: seen.at(-1),
      }),
    );
  }
  await loadDone;
  try {
    // Wait for the panel to list the files, then start the scan.
    for (;;) {
      const n = await js(`document.querySelectorAll('#folder-list li').length`);
      if (n > 0) break;
      if (Date.now() - started > 15000) throw new Error('folder never listed');
      await sleep(200);
    }
    const listed = JSON.parse(
      await js(`JSON.stringify([...document.querySelectorAll('#folder-list li')].map((li) => li.textContent))`),
    );
    console.log('SMOKE_FOLDER_LISTED', JSON.stringify(listed));
    if (SMOKE_REFRESH_ADD) {
      // Refresh check (R1b): select a row, add a file on disk, click Refresh,
      // and confirm the new file is listed and the selection survived.
      await js(`document.querySelectorAll('#folder-list li')[1].classList.add('probe')`);
      await js(`document.querySelector('#folder-list li.probe').click()`);
      await sleep(500);
      const selBefore = await js(`(document.querySelector('#folder-list li.selected') || {}).textContent || ''`);
      const target = path.join(path.resolve(SMOKE_FOLDER), 'Added Later', path.basename(SMOKE_REFRESH_ADD));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(SMOKE_REFRESH_ADD, target);
      await js(`document.getElementById('refresh-btn').click()`);
      for (;;) {
        const n = await js(`document.querySelectorAll('#folder-list li').length`);
        if (n > listed.length) break;
        if (Date.now() - started > 30000) throw new Error('refresh never showed the new file');
        await sleep(200);
      }
      const after = JSON.parse(
        await js(`JSON.stringify({
          rows: [...document.querySelectorAll('#folder-list li')].map((li) => li.textContent),
          selected: (document.querySelector('#folder-list li.selected') || {}).textContent || '',
          toast: (document.getElementById('toast') || {}).textContent || ''
        })`),
      );
      console.log('SMOKE_REFRESH_OK', JSON.stringify({ selBefore, ...after }));
      console.log('SMOKE_REFRESH_LAYOUT', await js(`JSON.stringify(['folder-name', 'refresh-btn', 'scan-btn'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), h: Math.round(r.height) }; }))`));
      app.exit(after.selected === selBefore ? 0 : 5);
      return;
    }
    await js(`document.getElementById('scan-btn').click()`);
    // The drumroll screen waits for Reveal; click it once it shows.
    for (;;) {
      const ready = await js(`(() => {
        const m = document.getElementById('report-modal');
        const b = document.getElementById('report-reveal-btn');
        return !!m && !m.hidden && !!b && !b.hidden;
      })()`);
      if (ready) break;
      if (Date.now() - started > 180000) throw new Error('drumroll screen never shown');
      await sleep(300);
    }
    console.log('SMOKE_DRUMROLL_READY', await js(`document.getElementById('report-drumroll-text').textContent`));
    const rollStart = Date.now();
    await js(`document.getElementById('report-reveal-btn').click()`);
    for (;;) {
      const raw = await js(`JSON.stringify({
        revealed: !document.getElementById('report-reveal').hidden,
        title: document.getElementById('report-title').textContent,
        blurb: document.getElementById('report-blurb').textContent,
        counts: [...document.querySelectorAll('#report-counts li')].map((li) => li.textContent),
        note: document.getElementById('report-note').textContent
      })`);
      const state = JSON.parse(raw);
      if (state.revealed) {
        console.log('SMOKE_REPORT_OK', `rollMs=${Date.now() - rollStart}`, JSON.stringify(state));
        break;
      }
      if (Date.now() - started > 180000) throw new Error('scan never revealed');
      await sleep(300);
    }
    if (SMOKE_SAVE_DIR) {
      await js(`document.getElementById('report-save').click()`);
      await sleep(1000);
      const saved = path.join(SMOKE_SAVE_DIR, 'spectregram-report.md');
      if (!fs.existsSync(saved)) throw new Error('report not saved');
      console.log('SMOKE_REPORT_SAVED', saved, fs.statSync(saved).size);
    }
    app.exit(0);
  } catch (e) {
    console.log('SMOKE_FOLDER_FAIL', e.message);
    app.exit(2);
  }
}

app.whenReady().then(() => {
  registerProtocol();
  registerIpc();
  buildMenu();
  createWindow();
  const coldPath = pathFromArgv(process.argv) || (SMOKE_FILE ? path.resolve(SMOKE_FILE) : null);
  if (coldPath) queueOpenFile(coldPath);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
