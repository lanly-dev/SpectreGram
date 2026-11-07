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

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.oga', '.opus', '.m4a', '.aac']);

// The renderer may only read files the shell itself handed it (open-with /
// second-instance argv). There is no path input in the UI, so nothing else
// can legitimately request a read.
const allowedReadPaths = new Set();

let mainWindow = null;
let rendererReady = false;
let pendingOpenPath = null;

// Test-only hooks (used by the headless smoke run; inert otherwise).
const SMOKE_FILE = process.env.SPECTREGRAM_SMOKE_FILE || '';
const SMOKE_SAVE_DIR = process.env.SPECTREGRAM_SMOKE_SAVE_DIR || '';

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

  ipcMain.handle('sg:read-file', async (_event, filePath) => {
    const resolved = path.resolve(String(filePath));
    if (!allowedReadPaths.has(resolved)) {
      throw new Error('File was not handed to the app by the shell.');
    }
    const data = await fs.promises.readFile(resolved);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  });
}

// --- Native menu (File / Help) --------------------------------------------

function menuOpen() {
  if (!mainWindow) return;
  void dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Audio files', extensions: [...AUDIO_EXTS].sort() }],
  }).then((result) => {
    if (result.canceled || !result.filePaths.length) return;
    queueOpenFile(result.filePaths[0]);
  });
}

function menuSave() {
  if (mainWindow) mainWindow.webContents.send('sg:save-png');
}

function menuQuit() {
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
          label: 'Open...',
          accelerator: process.platform === 'darwin' ? 'Cmd+O' : 'Ctrl+O',
          click: menuOpen,
        },
        {
          label: 'Save',
          accelerator: process.platform === 'darwin' ? 'Cmd+S' : 'Ctrl+S',
          click: menuSave,
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: menuQuit,
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
          accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
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
        status: (document.getElementById('status') || {}).textContent || '',
        canvasW: (document.getElementById('canvas') || {}).width || 0
      })`);
      const state = JSON.parse(raw);
      if (state.verdict.trim().length > 0) {
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
