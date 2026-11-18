// SpectreGram — Electron main process (plain JS, ESM).
// Shell only: window, custom app:// protocol serving dist/, native save
// dialog for PNG export, and open-with file routing. All analysis stays in
// the renderer (Web Audio + module Web Worker), exactly as in the web build.
// Spec: /.kiro/specs/electron-shell/

import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
// Whether the renderer currently has a spectrogram to export. Gates Save as PNG.
let hasSpectrogram = false;

// Test-only hooks (used by the headless smoke run; inert otherwise).
const SMOKE_FILE = process.env.SPECTREGRAM_SMOKE_FILE || '';
const SMOKE_SAVE_DIR = process.env.SPECTREGRAM_SMOKE_SAVE_DIR || '';
// Folder-report smoke: open this folder, Scan, wait for the reveal, save.
const SMOKE_FOLDER = process.env.SPECTREGRAM_SMOKE_FOLDER || '';

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

function queueOpenFile(filePath) {
  if (!filePath) return;
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

  ipcMain.handle('sg:open-folder-file', async (_event, filePath) => {
    queueOpenFile(filePath);
    return true;
  });

  // Renderer reports whether a spectrogram is present, gating Save as PNG.
  ipcMain.handle('sg:spectrogram-state', (_event, present) => {
    hasSpectrogram = Boolean(present);
    const item = Menu.getApplicationMenu()?.getMenuItemById('save-png');
    if (item) item.enabled = hasSpectrogram;
    return true;
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
      filters: [{ name: 'Audio files', extensions: audioFilters }],
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
async function walkAudioFiles(root, cap) {
  const files = [];
  let truncated = false;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
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

/**
 * List the audio files in `folderPath` and its subfolders (optionally only
 * the first `limit`, by relative path), grant the renderer read access to
 * them, and show them in the folder panel under `displayName`.
 */
async function loadFolder(folderPath, { limit = Infinity, displayName } = {}) {
  if (!mainWindow) return;
  try {
    const cap = Math.min(limit, MAX_FOLDER_FILES);
    const { files, truncated } = await walkAudioFiles(folderPath, cap);
    if (!files.length) {
      sendToast('No audio files in that folder or its subfolders.', 'error');
      return;
    }
    // Grant the renderer read access to every listed audio file.
    files.forEach((f) => allowedReadPaths.add(f.path));
    currentFolderPath = folderPath;
    mainWindow.webContents.send('sg:folder-loaded', {
      folderPath,
      folderName: displayName || path.basename(folderPath),
      files,
      // Only report the global cap, not a deliberate `limit` (sample folder).
      truncated: truncated && cap === MAX_FOLDER_FILES,
    });
  } catch (e) {
    console.error('read folder failed:', e);
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

function menuToggleScreensaver(item) {
  // Checkbox reads "Disable Screensaver": checked = screensaver off.
  sendMenuAction('screensaver-enabled', !item.checked);
}

function menuShowScreensaver() {
  sendMenuAction('show-screensaver');
}

function menuTestErrorToast() {
  sendToast('Test error: this is what an error toast looks like.', 'error');
}

function menuLoadSampleFolder() {
  if (!fs.existsSync(SAMPLE_DIR)) {
    sendToast('No sample folder: lab/ is missing (it is local-only, not in the repo).', 'error');
    return;
  }
  void loadFolder(SAMPLE_DIR, { limit: SAMPLE_LIMIT, displayName: 'Sample tracks' });
}


function menuSave() {
  if (!hasSpectrogram) return;
  if (mainWindow) mainWindow.webContents.send('sg:save-png');
}

function menuExit() {
  app.quit();
}

function menuLanguage() {
  if (!mainWindow) return;
  void dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Language',
    message: 'Interface language',
    detail: 'Language selection will arrive in a later release.',
  });
}

function menuAbout() {
  if (!mainWindow) return;
  void dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About SpectreGram',
    message: 'SpectreGram',
    detail: 'Acoustic spectrum analyser and lossy-disguise verdict.\nYour files never leave your machine.\nMIT license — Kiroween 2026.',
  });
}

function menuDevTools() {
  if (mainWindow) mainWindow.webContents.toggleDevTools();
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open',
          accelerator: process.platform === 'darwin' ? 'Cmd+O' : 'Ctrl+O',
          click: menuOpen,
        },
        {
          label: 'Open Folder',
          accelerator: process.platform === 'darwin' ? 'Cmd+Shift+O' : 'Ctrl+Shift+O',
          click: menuOpenFolder,
        },
        {
          id: 'save-png',
          label: 'Save as PNG',
          accelerator: process.platform === 'darwin' ? 'Cmd+S' : 'Ctrl+S',
          enabled: false,
          click: menuSave,
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: menuExit,
        },
      ],
    },
    {
      label: 'Options',
      submenu: [
        {
          id: 'disable-screensaver',
          label: 'Disable Screensaver',
          type: 'checkbox',
          checked: false,
          click: menuToggleScreensaver,
        },
        {
          label: 'Development',
          submenu: [
            { label: 'Show Screensaver', click: menuShowScreensaver },
            { label: 'Show Error Toast', click: menuTestErrorToast },
            { label: 'Load Sample Folder', click: menuLoadSampleFolder },
          ],
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Language', click: menuLanguage },
        { label: 'About', click: menuAbout },
        { type: 'separator' },
        {
          label: 'Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'F12',
          click: menuDevTools,
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
      // verdict carries "(estimate)" — guaranteed by cutoff.ts and its tests.
      const done = !/\bpending\b/.test(state.verdictClass) && state.verdict.includes('(estimate)');
      if (done) {
        console.log('SMOKE_ANALYSIS_OK', JSON.stringify(state));
        if (SMOKE_SAVE_DIR) {
          await mainWindow.webContents.executeJavaScript(`document.getElementById('png-btn').click()`);
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

// Folder-report smoke (env-gated, test-only): loads SMOKE_FOLDER through the
// real recursive listing, clicks Scan, waits for the drumroll reveal, prints
// the listing + rating, then saves the report via the smoke save path.
async function runFolderSmoke() {
  const js = (code) => mainWindow.webContents.executeJavaScript(code);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const started = Date.now();
  await loadFolder(path.resolve(SMOKE_FOLDER));
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
