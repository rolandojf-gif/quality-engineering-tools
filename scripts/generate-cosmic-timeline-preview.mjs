#!/usr/bin/env node
/**
 * Generate assets/video/cosmic-timeline-preview.mp4
 *
 * Cinematic 12s, 1280×800, 30fps preview of the published Cosmic Timeline
 * application (https://cosmic-timeline.netlify.app/). The app is a read-only
 * capture target — this script never modifies it.
 *
 * Footage is four real epochs of the live visualization — Planck,
 * Recombination, First stars and Earth — with the scientific panel closed
 * the way the app's own close control leaves it, so the scene fills the
 * frame. Camera moves are eased zoom (smoothstep), joined by short
 * crossfades. The closing frames dissolve back into the opening frame so
 * the homepage loop restarts on the same picture.
 *
 * Requirements:
 *   - ffmpeg and ffprobe on PATH
 *   - Google Chrome
 *   - playwright resolvable via NODE_PATH or PLAYWRIGHT_NODE_MODULES
 *
 *   npm install --prefix /tmp/preview-tools playwright
 *   NODE_PATH=/tmp/preview-tools/node_modules node scripts/generate-cosmic-timeline-preview.mjs
 *
 * Temporary plates and intermediates stay in the OS temp directory.
 */

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'assets/video/cosmic-timeline-preview.mp4');
const APP = 'https://cosmic-timeline.netlify.app';

const FPS = 30;
const FADE_FRAMES = 12;
const OUT_W = 1280;
const OUT_H = 800;
const DSF = 2;
const UPSCALE = 2;
const VIEWPORT = { width: 1440, height: 900 };
const BOUNDS = { x: 0, y: 0, w: VIEWPORT.width, h: VIEWPORT.height };

const SCENE_FRAMES = {
  planck: 84,
  recombination: 102,
  stars: 102,
  earth: 108,
};

const EPOCHS = [
  { id: 'planck', name: 'Planck', zoom: 1.1, fx: 0.48, fy: 0.42 },
  { id: 'recombination', name: 'Recombination', zoom: 1.12, fx: 0.56, fy: 0.46 },
  { id: 'stars', name: 'First stars', zoom: 1.14, fx: 0.44, fy: 0.4 },
  { id: 'earth', name: 'Earth', zoom: 1.12, fx: 0.58, fy: 0.5 },
];

const contactOnly = process.argv.includes('--contact');

function loadPlaywright() {
  const fromEnv = process.env.PLAYWRIGHT_NODE_MODULES;
  const candidates = [
    fromEnv && path.join(fromEnv, 'playwright'),
    'playwright',
    '/tmp/preview-tools/node_modules/playwright',
    '/tmp/vda20-tools/node_modules/playwright',
  ].filter(Boolean);
  let last;
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      last = error;
    }
  }
  throw new Error(
    'playwright is not installed. Install it outside the site ' +
      `(npm install --prefix /tmp/preview-tools playwright) and re-run. ${last}`
  );
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`${cmd} ${args.join(' ')} failed (${code})\n${stderr.slice(-4000)}`));
    });
  });
}

function smoothstepExpr(frames) {
  const denom = Math.max(1, frames - 1);
  const t = `(n/${denom})`;
  return `(${t}*${t}*(3-2*${t}))`;
}

function lerpExpr(a, b, st) {
  return `(${num(a)}+(${num(b)}-(${num(a)}))*${st})`;
}

function num(value) {
  return Number.isFinite(value) ? value.toFixed(4) : String(value);
}

function esc(expression) {
  return expression.replace(/,/g, '\\,').replace(/:/g, '\\:');
}

function rectCenter(rect) {
  return { cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2, w: rect.w, h: rect.h };
}

function zoomAbout(rect, zoom, focus) {
  const w = rect.w / zoom;
  const h = rect.h / zoom;
  const cx = focus?.cx ?? rect.x + rect.w / 2;
  const cy = focus?.cy ?? rect.y + rect.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function clampRect(rect, bounds) {
  let { x, y, w, h } = rect;
  if (w > bounds.w) {
    const scale = bounds.w / w;
    w = bounds.w;
    h *= scale;
  }
  if (h > bounds.h) {
    const scale = bounds.h / h;
    h = bounds.h;
    w *= scale;
  }
  x = Math.min(Math.max(x, bounds.x), bounds.x + bounds.w - w);
  y = Math.min(Math.max(y, bounds.y), bounds.y + bounds.h - h);
  return { x, y, w, h };
}

function unionRect(rects, margin = 12) {
  const x0 = Math.min(...rects.map((r) => r.x)) - margin;
  const y0 = Math.min(...rects.map((r) => r.y)) - margin;
  const x1 = Math.max(...rects.map((r) => r.x + r.w)) + margin;
  const y1 = Math.max(...rects.map((r) => r.y + r.h)) + margin;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

async function freeze(page) {
  await page.addStyleTag({
    content: `
      html, body { scrollbar-width: none !important; }
      ::-webkit-scrollbar { display: none !important; }
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      iframe[src*="netlify"], [id*="netlify-drawer"], [class*="netlify-drawer"] {
        display: none !important;
      }
    `,
  });
}

async function openApp(page) {
  await page.goto(APP + '/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForSelector('button.stop-button', { timeout: 15000 });
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  });
  await freeze(page);
  await page.evaluate(() => {
    document.querySelector('button.playback-btn.pause')?.click();
    document.querySelector('button.drawer-close')?.click();
  });
  await page.waitForTimeout(400);
  const lang = await page.evaluate(() => document.documentElement.lang || '');
  if (lang && !lang.toLowerCase().startsWith('en')) {
    throw new Error(`Expected English UI, got lang=${lang}`);
  }
}

async function showEpoch(page, name) {
  const clicked = await page.evaluate((epoch) => {
    document.querySelector('button.playback-btn.pause')?.click();
    const btn = [...document.querySelectorAll('button.stop-button')].find(
      (node) => (node.textContent || '').trim() === epoch
    );
    if (!btn) return false;
    btn.click();
    document.querySelector('button.playback-btn.pause')?.click();
    return true;
  }, name);
  if (!clicked) throw new Error(`Epoch control "${name}" was not on the page`);
  await page.waitForFunction((epoch) => {
    const node = document.querySelector('.epoch-name');
    return Boolean(node && node.textContent.toLowerCase().includes(epoch.toLowerCase()));
  }, name, { timeout: 8000 });
  await page.waitForTimeout(800);
}

async function calloutBox(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.scene-callout');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return null;
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
}

function planEpoch(spec, callout) {
  const full = { x: 0, y: 0, w: VIEWPORT.width, h: VIEWPORT.height };
  const focus = callout
    ? {
        cx: callout.x + callout.w / 2,
        cy: Math.min(callout.y + callout.h / 2, VIEWPORT.height * 0.62),
      }
    : { cx: VIEWPORT.width * spec.fx, cy: VIEWPORT.height * spec.fy };
  return {
    epoch: spec.name,
    start: full,
    end: clampRect(zoomAbout(full, spec.zoom, focus), BOUNDS),
  };
}

async function shootPlate(page, plate, file) {
  const clip = {
    x: Math.max(0, Math.floor(plate.x)),
    y: Math.max(0, Math.floor(plate.y)),
    width: Math.min(VIEWPORT.width, Math.ceil(plate.w + (plate.x - Math.floor(plate.x)))),
    height: Math.min(VIEWPORT.height, Math.ceil(plate.h + (plate.y - Math.floor(plate.y)))),
  };
  clip.width = Math.min(clip.width, VIEWPORT.width - clip.x);
  clip.height = Math.min(clip.height, VIEWPORT.height - clip.y);
  await page.screenshot({ path: file, clip, type: 'png' });
  return clip;
}

function filterForScene(frames, start, end, plateClip) {
  const scale = DSF * UPSCALE;
  const st = smoothstepExpr(frames);
  const toSrc = (rect) => rectCenter({
    x: (rect.x - plateClip.x) * scale,
    y: (rect.y - plateClip.y) * scale,
    w: rect.w * scale,
    h: rect.h * scale,
  });
  const a = toSrc(start);
  const b = toSrc(end);
  const w = lerpExpr(a.w, b.w, st);
  const h = lerpExpr(a.h, b.h, st);
  const cx = lerpExpr(a.cx, b.cx, st);
  const cy = lerpExpr(a.cy, b.cy, st);
  const x = `(${cx}-(${w})/2)`;
  const y = `(${cy}-(${h})/2)`;
  const even = (expression) => `trunc((${expression})/2)*2`;
  const xSafe = `max(0,min(${even(x)},in_w-${even(w)}))`;
  const ySafe = `max(0,min(${even(y)},in_h-${even(h)}))`;
  return [
    `scale=iw*${UPSCALE}:ih*${UPSCALE}:flags=lanczos`,
    `crop=w='${esc(even(w))}':h='${esc(even(h))}':x='${esc(xSafe)}':y='${esc(ySafe)}'`,
    `scale=${OUT_W}:${OUT_H}:flags=lanczos`,
    'setsar=1',
    'format=yuv420p',
  ].join(',');
}

async function renderScene(plateFile, clip, scene, frames, outFile) {
  const filter = filterForScene(frames, scene.start, scene.end, clip);
  const framesToWrite = contactOnly ? 1 : frames;
  await run('ffmpeg', [
    '-y',
    '-loop', '1',
    '-framerate', String(FPS),
    '-i', plateFile,
    '-vf', filter,
    '-frames:v', String(framesToWrite),
    '-r', String(FPS),
    '-c:v', 'libx264',
    '-preset', contactOnly ? 'veryfast' : 'medium',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    '-an',
    outFile,
  ]);
  if (contactOnly) {
    const still = outFile.replace(/\.mp4$/, '-end.png');
    const endFilter = filterForScene(frames, scene.start, scene.end, clip).replace(/\(n\//g, `(${frames - 1}/`);
    await run('ffmpeg', [
      '-y',
      '-loop', '1',
      '-framerate', String(FPS),
      '-i', plateFile,
      '-vf', endFilter,
      '-frames:v', '1',
      still,
    ]);
  }
}

async function assemble(sceneFiles, outFile) {
  const fadeSec = FADE_FRAMES / FPS;
  const durations = sceneFiles.map((file) => SCENE_FRAMES[file.id]);
  const offsets = [];
  let cursor = 0;
  for (let i = 0; i < durations.length - 1; i += 1) {
    cursor += durations[i] / FPS;
    offsets.push(cursor - (i + 1) * fadeSec);
  }

  const inputs = sceneFiles.flatMap((file) => ['-i', file.path]);
  const parts = [];
  let last = '0:v';
  for (let i = 1; i < sceneFiles.length; i += 1) {
    const label = `v${i}`;
    parts.push(
      `[${last}][${i}:v]xfade=transition=fade:duration=${fadeSec.toFixed(4)}:offset=${offsets[i - 1].toFixed(4)}[${label}]`
    );
    last = label;
  }

  const montage = path.join(tmpdir(), 'cosmic-timeline-montage.mp4');
  const frame0 = path.join(tmpdir(), 'cosmic-timeline-frame0.png');
  await run('ffmpeg', [
    '-y',
    ...inputs,
    '-filter_complex', parts.join(';'),
    '-map', `[${last}]`,
    '-r', String(FPS),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    '-an',
    montage,
  ]);

  await run('ffmpeg', ['-y', '-i', montage, '-frames:v', '1', frame0]);

  // The last 0.3s dissolves into the opening frame, then a short hold of
  // that frame closes the file so the homepage loop restarts without a jump.
  const fade = 0.3;
  const hold = 0.4;
  const bodyEnd = 12 - hold;
  await run('ffmpeg', [
    '-y',
    '-i', montage,
    '-framerate', String(FPS),
    '-loop', '1',
    '-i', frame0,
    '-filter_complex', [
      `[0:v]trim=end=${bodyEnd.toFixed(3)},setpts=PTS-STARTPTS,fps=${FPS}[body]`,
      `[0:v]trim=start=${bodyEnd.toFixed(3)}:end=${(bodyEnd + fade).toFixed(3)},setpts=PTS-STARTPTS,fps=${FPS}[tail]`,
      `[1:v]scale=${OUT_W}:${OUT_H},fps=${FPS},trim=end=${hold.toFixed(3)},setpts=PTS-STARTPTS[hold]`,
      `[tail][hold]xfade=transition=fade:duration=${fade.toFixed(3)}:offset=0[looped]`,
      '[body][looped]concat=n=2:v=1:a=0[out]',
    ].join(';'),
    '-map', '[out]',
    '-r', String(FPS),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709',
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    '-movflags', '+faststart',
    '-an',
    outFile,
  ]);

  await rm(montage, { force: true });
  await rm(frame0, { force: true });
}

async function main() {
  const { chromium } = loadPlaywright();
  const work = path.join(tmpdir(), 'cosmic-timeline-preview-build');
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--hide-scrollbars', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DSF,
    locale: 'en-US',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  console.log('Opening the live application…');
  await openApp(page);

  const plans = {};
  const rendered = [];
  for (const spec of EPOCHS) {
    console.log(`Capturing ${spec.id} ← ${spec.name}`);
    await showEpoch(page, spec.name);
    const scene = planEpoch(spec, await calloutBox(page));
    plans[spec.id] = scene;
    const plate = unionRect([scene.start, scene.end], 0);
    plate.x = Math.max(0, plate.x);
    plate.y = Math.max(0, plate.y);
    const plateFile = path.join(work, `${spec.id}.png`);
    const clip = await shootPlate(page, plate, plateFile);
    const outFile = path.join(work, `${spec.id}.mp4`);
    console.log(`Animating ${spec.id} (${SCENE_FRAMES[spec.id]} frames)`);
    await renderScene(plateFile, clip, scene, SCENE_FRAMES[spec.id], outFile);
    rendered.push({ id: spec.id, path: outFile });
    if (contactOnly) {
      await run('ffmpeg', [
        '-y', '-i', outFile, '-frames:v', '1',
        path.join(work, `${spec.id}-start.png`),
      ]);
    }
  }
  await writeFile(path.join(work, 'plan.json'), JSON.stringify(plans, null, 2));
  await browser.close();

  if (contactOnly) {
    console.log(`Contact frames written to ${work}`);
    return;
  }

  console.log('Joining scenes…');
  await assemble(rendered, OUT_FILE);
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
