// Takes the entry's screenshots: serves game/ with serve.ts, opens each scene from shots.json
// (?shot= query params stage a deterministic moment of the game) in headless Chromium with
// SwiftShader WebGL, and writes size-capped JPEGs into screenshots/.
//
//   node shots.mjs            all scenes
//   node shots.mjs chase      only scenes whose name contains "chase"
//
// Needs playwright-core (npm i playwright-core in /tmp/pw) and a chromium-headless-shell under
// ~/.cache/ms-playwright. Proxy variables are cleared so localhost is reached directly.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const filter = process.argv[2] ?? '';
const WIDTH = 1280;
const HEIGHT = 720;
const MAX_BYTES = 250 * 1024;
const PORT = 8080;

for (const k of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']) delete process.env[k];
process.env.NO_PROXY = 'localhost,127.0.0.1';

const pwCandidates = ['/tmp/pw/node_modules/playwright-core/index.mjs', '/tmp/node_modules/playwright-core/index.mjs', '/tmp/playwright-core/index.mjs'];
const pwPath = pwCandidates.find(existsSync);
if (!pwPath) throw new Error('playwright-core not found under /tmp');
const { chromium } = await import(pathToFileURL(pwPath).href);

const cache = join(homedir(), '.cache', 'ms-playwright');
const shells = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
const exe = shells.map((d) => join(cache, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell')).find(existsSync);
if (!exe) throw new Error('no chromium headless shell found');

const server = spawn(process.execPath, ['serve.ts', '--port', String(PORT)], { cwd: here, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));

const scenes = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8')).filter((s) => s.name.includes(filter));
mkdirSync(join(here, 'screenshots'), { recursive: true });

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--ignore-gpu-blocklist', '--enable-webgl'],
});
let failed = false;
try {
  for (const scene of scenes) {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type())) console.log(`  [${scene.name}] console.${m.type()}: ${m.text()}`);
    });
    let pageFailure = null;
    const errored = new Promise((_, reject) => {
      page.on('pageerror', (e) => {
        console.log(`  [${scene.name}] pageerror: ${e.message}`);
        pageFailure = e.message;
        reject(new Error(e.message));
      });
    });
    errored.catch(() => {});
    const t0 = Date.now();
    await page.goto(`http://localhost:${PORT}/${scene.query}`);
    try {
      // a script error means the scene will never be ready: stop waiting as soon as one is seen
      await Promise.race([page.waitForFunction('window.__shotReady === true', null, { timeout: 150000, polling: 250 }), errored]);
    } catch {
      console.log(`  [${scene.name}] never became ready${pageFailure ? ` (${pageFailure})` : ''}`);
      failed = true;
    }
    let quality = 82;
    let buf = await page.screenshot({ type: 'jpeg', quality });
    while (buf.length > MAX_BYTES && quality > 40) {
      quality -= 6;
      buf = await page.screenshot({ type: 'jpeg', quality });
    }
    writeFileSync(join(here, 'screenshots', scene.name), buf);
    console.log(`${scene.name}: ${buf.length} bytes (q${quality}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
if (failed) process.exitCode = 1;
void statSync;
