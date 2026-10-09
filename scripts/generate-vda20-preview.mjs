#!/usr/bin/env node
/**
 * Generate assets/video/vda20-preview.mp4
 *
 * Cinematic 12s, 1280×800, 30fps product preview of the published
 * AI in Quality Reference (VDA 20) application. The app is a read-only
 * capture target — this script never modifies it.
 *
 * Footage is four real screens, animated with eased zoom and pan
 * (smoothstep) and joined by short crossfades. The closing frames
 * dissolve back into the opening frame so the homepage loop restarts
 * on the same picture.
 *
 * Requirements:
 *   - ffmpeg and ffprobe on PATH
 *   - Google Chrome
 *   - playwright resolvable via NODE_PATH or PLAYWRIGHT_NODE_MODULES
 *
 *   npm install --prefix /tmp/vda20-tools playwright
 *   NODE_PATH=/tmp/vda20-tools/node_modules node scripts/generate-vda20-preview.mjs
 *
 * Temporary plates and intermediates stay in the OS temp directory.
 */

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'assets/video/vda20-preview.mp4');
const APP = 'https://ai-quality-reference-preview.netlify.app';

const FPS = 30;
const FADE_FRAMES = 12;
const OUT_W = 1280;
const OUT_H = 800;
const DSF = 2;
const UPSCALE = 2;
const VIEWPORT = { width: 1440, height: 2200 };

const SCENE_FRAMES = {
  intro: 84,
  risk: 102,
  framework: 102,
  industrial: 108,
};

const contactOnly = process.argv.includes('--contact');

function loadPlaywright() {
  const fromEnv = process.env.PLAYWRIGHT_NODE_MODULES;
  const candidates = [
    fromEnv && path.join(fromEnv, 'playwright'),
    'playwright',
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
      `(npm install --prefix /tmp/vda20-tools playwright) and re-run. ${last}`
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

function fit16x10(rect, pad = 20) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  let w = rect.w + pad * 2;
  let h = rect.h + pad * 2;
  if (w / h > 16 / 10) h = (w * 10) / 16;
  else w = (h * 16) / 10;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function translate(rect, dx, dy) {
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
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

async function preparePage(page, route) {
  await page.goto(APP + route, { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  });
  await page.addStyleTag({
    content: `
      html, body { scrollbar-width: none !important; }
      ::-webkit-scrollbar { display: none !important; }
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.waitForTimeout(250);
  const lang = await page.evaluate(() => document.documentElement.lang || '');
  if (lang && !lang.toLowerCase().startsWith('en')) {
    throw new Error(`Expected English UI, got lang=${lang} on ${route}`);
  }
}

async function box(page, selector) {
  const value = await page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (value.w < 8 || value.h < 8) throw new Error(`Empty box for ${selector}`);
  return value;
}

async function boxes(page, selector) {
  return page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })
  );
}

async function planScenes(page) {
  await preparePage(page, '/');
  const h1 = await box(page, 'h1');
  const sketches = await boxes(page, '.sketch');
  if (sketches.length < 3) throw new Error('Home sketches were not found');
  const sketchUnion = unionRect(sketches, 0);
  const kicker = { x: h1.x, y: h1.y - 34, w: Math.max(h1.w, sketchUnion.w), h: 34 };
  const introStart = fit16x10(unionRect([kicker, h1, sketchUnion], 4), 34);
  const centerSketch = sketches[1];
  let introEnd = zoomAbout(introStart, 1.16, {
    cx: centerSketch.x + centerSketch.w / 2,
    cy: centerSketch.y + centerSketch.h * 0.35,
  });
  // Keep the full headline and the kicker inside the closing frame.
  const minY = h1.y - 40;
  if (introEnd.y > minY) introEnd.y = minY;
  const sketchRight = centerSketch.x + centerSketch.w + 16;
  const sketchLeft = centerSketch.x - 16;
  if (introEnd.x > sketchLeft) introEnd.x = sketchLeft;
  if (introEnd.x + introEnd.w < sketchRight) introEnd.x = sketchRight - introEnd.w;

  await preparePage(page, '/cases/worksheet');
  const table = await box(page, '.worksheet__table');
  const bands = await boxes(page, '.ws-band');
  if (bands.length < 6) throw new Error('Worksheet bands were not found');
  const bandRows = groupRows(bands);
  // Anchor the top of the frame on the matrix itself. Expanding a wide,
  // short table to 16:10 around its center pulls in the empty intro above it.
  const riskStart = {
    x: table.x - 6,
    y: table.y - 4,
    w: table.w + 12,
    h: ((table.w + 12) * 10) / 16,
  };
  const pan = Math.min(
    (bandRows[2] ? bandRows[2].y : bandRows[1].y) - bandRows[0].y,
    riskStart.h * 0.22
  );
  const riskEnd = clampRect(
    zoomAbout(translate(riskStart, 0, pan), 1.08, {
      cx: table.x + table.w * 0.58,
      cy: riskStart.y + pan + riskStart.h * 0.48,
    }),
    { x: table.x, y: table.y, w: table.w, h: Math.min(table.h, riskStart.h + pan) }
  );

  await preparePage(page, '/reference/tool-assurance');
  const map = await box(page, '.c7map');
  const frameH = map.h - 10;
  const frameW = frameH * 1.6;
  const frameworkStart = { x: map.x + 4, y: map.y + 5, w: frameW, h: frameH };
  const endW = frameW / 1.08;
  const endH = frameH / 1.08;
  const frameworkEnd = {
    x: map.x + map.w - endW - 4,
    y: map.y + (map.h - endH) / 2,
    w: endW,
    h: endH,
  };

  await preparePage(page, '/use-cases/6.1');
  const flow = await box(page, '.flow');
  const flowHeading = await page.locator('.ucsec__h').first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const blockTop = flowHeading.y - 12;
  const blockH = flow.y + flow.h + 14 - blockTop;
  const nodeW = blockH * 1.6;
  const industrialStart = { x: flow.x - 2, y: blockTop, w: nodeW, h: blockH };
  const industrialEndW = nodeW / 1.06;
  const industrialEndH = blockH / 1.06;
  const industrialEnd = {
    x: flow.x + flow.w - industrialEndW - 8,
    y: blockTop + (blockH - industrialEndH) / 2,
    w: industrialEndW,
    h: industrialEndH,
  };

  return {
    intro: { route: '/', start: introStart, end: introEnd },
    risk: { route: '/cases/worksheet', start: riskStart, end: riskEnd },
    framework: { route: '/reference/tool-assurance', start: frameworkStart, end: frameworkEnd },
    industrial: { route: '/use-cases/6.1', start: industrialStart, end: industrialEnd },
  };
}

function groupRows(rects) {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const rect of sorted) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - rect.y) < 20);
    if (row) row.push(rect);
    else rows.push([rect]);
  }
  return rows.map((row) => unionRect(row, 0));
}

async function shootPlate(page, route, plate, file) {
  await preparePage(page, route);
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

  const montage = path.join(tmpdir(), 'vda20-montage.mp4');
  const frame0 = path.join(tmpdir(), 'vda20-frame0.png');
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

  // The last 0.3s dissolves into the opening frame, then three pure copies of
  // that frame close the file so the homepage loop restarts without a jump.
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
  const work = path.join(tmpdir(), 'vda20-preview-build');
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
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  console.log('Planning camera paths from the live application…');
  const plans = await planScenes(page);
  await writeFile(path.join(work, 'plan.json'), JSON.stringify(plans, null, 2));

  const rendered = [];
  for (const id of ['intro', 'risk', 'framework', 'industrial']) {
    const scene = plans[id];
    const plate = unionRect([scene.start, scene.end], 24);
    plate.x = Math.max(0, plate.x);
    plate.y = Math.max(0, plate.y);
    const plateFile = path.join(work, `${id}.png`);
    console.log(`Capturing ${id} ← ${scene.route}`);
    const clip = await shootPlate(page, scene.route, plate, plateFile);
    const outFile = path.join(work, `${id}.mp4`);
    console.log(`Animating ${id} (${SCENE_FRAMES[id]} frames)`);
    await renderScene(plateFile, clip, scene, SCENE_FRAMES[id], outFile);
    rendered.push({ id, path: outFile });
    if (contactOnly) {
      await run('ffmpeg', [
        '-y', '-i', outFile, '-frames:v', '1',
        path.join(work, `${id}-start.png`),
      ]);
    }
  }
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
