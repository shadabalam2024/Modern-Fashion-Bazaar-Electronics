import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Launches the app under Playwright for driver scripts, and returns the
 * renderer window (skipping the devtools window that dev mode also opens).
 * Requires `npm run dev:react` already running on localhost:5173.
 */
export async function launchTestApp() {
  const env = { ...process.env, NODE_ENV: 'development' };
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    executablePath: path.join(APP_DIR, 'node_modules/electron/dist/electron.exe'),
    args: [APP_DIR],
    env,
    timeout: 30000,
  });

  let windows = app.windows();
  for (let i = 0; i < 20 && windows.length === 0; i++) {
    await new Promise(r => setTimeout(r, 500));
    windows = app.windows();
  }
  const page = windows.find(w => !w.url().startsWith('devtools://')) ?? windows[0] ?? await app.firstWindow();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('[console.error] ' + msg.text());
  });
  page.on('pageerror', err => errors.push('[pageerror] ' + err.message));

  return { app, page, errors };
}
