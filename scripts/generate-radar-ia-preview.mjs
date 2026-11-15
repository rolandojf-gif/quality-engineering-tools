#!/usr/bin/env node
/**
 * Generate assets/video/radar-ia-preview.mp4
 *
 * 14s, 1280×800, 30fps preview of RADAR.IA (https://aievolve.netlify.app/).
 * The site is a read-only capture target — this script never modifies it.
 *
 * Footage: the live front page with the rotating market band and the race
 * pulse, a slow scroll through the three-column front page and the signal
 * grid, the EN → ES switch, and a return to the top so the homepage loop
 * restarts on the same picture.
 *
 * Requirements:
 *   - ffmpeg on PATH
 *   - playwright resolvable via NODE_PATH or PLAYWRIGHT_NODE_MODULES
 *
 *   npm install --prefix /tmp/preview-tools playwright
 *   NODE_PATH=/tmp/preview-tools/node_modules node scripts/generate-radar-ia-preview.mjs
 *
 * RADAR_URL overrides the capture target (for example a local file:// copy of
 * the site's docs/index.html when the live site is not reachable).
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'assets/video/radar-ia-preview.mp4');
const APP = process.env.RADAR_URL || 'https://aievolve.netlify.app/';
const VIEWPORT = { width: 1280, height: 800 };
const SECONDS = 14;

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_NODE_MODULES && path.join(process.env.PLAYWRIGHT_NODE_MODULES, 'playwright'),
    'playwright',
    '/tmp/preview-tools/node_modules/playwright',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* next */ }
  }
  throw new Error('playwright is not installed (npm install --prefix /tmp/preview-tools playwright).');
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(stderr) : reject(new Error(`${cmd} failed (${code})\n${stderr.slice(-3000)}`))));
  });
}

async function smoothScroll(page, to, ms) {
  await page.evaluate(async ({ to, ms }) => {
    const from = window.scrollY;
    const t0 = performance.now();
    await new Promise((done) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = t * t * (3 - 2 * t);
        window.scrollTo(0, from + (to - from) * e);
        if (t < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
  }, { to, ms });
}

const { chromium } = loadPlaywright();
const work = await mkdtemp(path.join(tmpdir(), 'radar-preview-'));
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  colorScheme: 'light',
  recordVideo: { dir: work, size: VIEWPORT },
});
const page = await context.newPage();
const started = Date.now();
await page.goto(APP, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const lead = await page.evaluate(() => {
  const y = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect().top + window.scrollY : 0; };
  return { opening: y('.opening') - 90, below: y('.below') - 60 };
});
const loadMs = Date.now() - started;

await page.waitForTimeout(2600);                 // ticker rotating + race pulse
await smoothScroll(page, lead.opening, 1800);    // three-column front page
await page.waitForTimeout(1600);
await smoothScroll(page, lead.below, 1800);      // signal grid
await page.waitForTimeout(1000);
await smoothScroll(page, lead.opening, 1400);
await page.click('[data-lang-set="es"]');        // EN → ES
await page.waitForTimeout(1500);
await smoothScroll(page, 0, 1400);               // back to the opening frame
await page.click('[data-lang-set="en"]');
await page.waitForTimeout(900);

await context.close();
await browser.close();

const [webm] = (await readdir(work)).filter((f) => f.endsWith('.webm'));
const skip = (loadMs + 1200) / 1000;
await run('ffmpeg', [
  '-y', '-ss', skip.toFixed(2), '-i', path.join(work, webm), '-t', String(SECONDS),
  '-vf', `fps=30,scale=${VIEWPORT.width}:${VIEWPORT.height}:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-profile:v', 'high', '-movflags', '+faststart', '-an', OUT_FILE,
]);
await rm(work, { recursive: true, force: true });
console.log(`wrote ${path.relative(ROOT, OUT_FILE)}`);
