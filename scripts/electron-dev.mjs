// Dev launcher: start Vite, wait for it, then open the Electron shell
// against it (hot reload). Cross-platform replacement for shell env syntax.
// Usage: npm run electron:dev
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const DEV_URL = 'http://localhost:5173';

const vite = spawn('npx', ['vite', '--port', '5173', '--strictPort'], {
  stdio: 'inherit',
  shell: true,
});

async function waitForVite() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(DEV_URL);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Vite dev server did not start on :5173');
}

let electronProc = null;
function shutdown(code) {
  if (electronProc) electronProc.kill();
  vite.kill();
  process.exit(code ?? 0);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  await waitForVite();
  electronProc = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, SPECTREGRAM_DEV_URL: DEV_URL },
  });
  electronProc.on('exit', (code) => shutdown(code ?? 0));
} catch (e) {
  console.error(e.message);
  shutdown(1);
}
