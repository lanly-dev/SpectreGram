// Dev launcher: start Vite, wait for it, then open the Electron shell
// against it (hot reload). Cross-platform replacement for shell env syntax.
// Usage: npm run dev (npm run preview is an alias)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

// Dedicated port — NOT Vite's default 5173, which every other local project
// also grabs. On the shared default, this launcher once loaded a different
// project's dev server into the Electron window (see waitForVite).
const DEV_PORT = 5273;
const DEV_URL = `http://localhost:${DEV_PORT}`;

const vite = spawn('npx', ['vite', '--port', String(DEV_PORT), '--strictPort'], {
  stdio: 'inherit',
  shell: true,
});

let viteExited = false;
vite.on('exit', () => {
  viteExited = true;
});

async function waitForVite() {
  for (let i = 0; i < 60; i++) {
    if (viteExited) {
      throw new Error(
        `Vite exited before serving — port ${DEV_PORT} is probably already in use. ` +
          'Stop whatever is using it and retry.',
      );
    }
    let html = null;
    try {
      const res = await fetch(DEV_URL);
      if (res.ok) html = await res.text();
    } catch {
      /* not up yet */
    }
    if (html !== null) {
      // Identity check: the readiness probe must prove the server on this
      // port is SpectreGram, not just *a* server. Accepting any HTTP 200 is
      // what let a foreign dev server (another project on the same port)
      // get loaded into the app window.
      if (html.includes('<title>SpectreGram</title>')) return;
      throw new Error(
        `Port ${DEV_PORT} is serving a different app, not SpectreGram. ` +
          'Stop that dev server and retry.',
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Vite dev server did not start on :${DEV_PORT}`);
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
