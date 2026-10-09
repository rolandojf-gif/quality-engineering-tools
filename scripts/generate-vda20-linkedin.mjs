#!/usr/bin/env node
/**
 * Generate assets/video/vda20-linkedin-45s.mp4
 *
 * Standalone ~45s, 1920×1080, 30fps LinkedIn cut of the published
 * AI in Quality Reference (VDA 20) application. The app is a read-only
 * capture target — this script never modifies it, and it does not
 * replace assets/video/vda20-preview.mp4.
 *
 * Footage is real screens, animated with eased zoom and pan (smoothstep)
 * and joined by short crossfades. A caption bar names each section.
 * The closing card is typography only.
 *
 * Landscape 16:9 is used because the graphics that define the product
 * (three home cards, the risk matrix, the chapter 7 map, the use-case
 * flow, the supplier review steps) are wide. A 4:5 frame would crop them.
 *
 * Requirements:
 *   - ffmpeg and ffprobe on PATH
 *   - Google Chrome
 *   - playwright resolvable via NODE_PATH or PLAYWRIGHT_NODE_MODULES
 *
 *   npm install --prefix /tmp/vda20-tools playwright
 *   NODE_PATH=/tmp/vda20-tools/node_modules node scripts/generate-vda20-linkedin.mjs
 *
 *   --stills   write one sharp PNG per scene (start and end) and stop
 *
 * Temporary plates and intermediates stay in the OS temp directory.
 */

import { spawn } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'assets/video/vda20-linkedin-45s.mp4');
const APP = 'https://ai-quality-reference-preview.netlify.app';

const FPS = 30;
const FADE_FRAMES = 15;
const OUT_W = 1920;
const OUT_H = 1080;
const BAR_H = 76;
const PIC_H = OUT_H - BAR_H;
const PIC_ASPECT = OUT_W / PIC_H;
const DSF = 2;
const UPSCALE = 2;
const VIEWPORT = { width: 1720, height: 2800 };

const FONT_SEMI = '/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf';
const FONT_BOLD = '/usr/share/fonts/truetype/macos/Inter-Bold.ttf';
const FONT_REG = '/usr/share/fonts/truetype/macos/Inter-Regular.ttf';

const END_TITLE = 'AI in Quality Reference';
const END_SUB = 'Independent project. Not affiliated with VDA or VDA QMC.';

const SCENES = [
  { id: 'home', frames: 162, caption: 'Understand, assess, review', route: '/' },
  { id: 'assess', frames: 162, caption: 'Risk class assessment', route: '/assess' },
  { id: 'risk', frames: 186, caption: 'Risk class worksheet', route: '/cases/worksheet' },
  { id: 'criteria', frames: 168, caption: '37 assessment criteria', route: '/reference/criteria' },
  { id: 'framework', frames: 174, caption: 'Tool assurance (Chapter 7)', route: '/reference/tool-assurance' },
  { id: 'flow', frames: 168, caption: 'Use case flow', route: '/use-cases/6.1' },
  { id: 'sqa', frames: 156, caption: 'SQA work cards', route: '/reference/sqa-cards' },
  { id: 'review', frames: 162, caption: 'Supplier review', route: '/review' },
  { id: 'end', frames: 150, caption: null, route: null },
];

const stillsOnly = process.argv.includes('--stills');

function assertPlainCaption(text) {
  if (/[-‐‑‒–—―−]/.test(text)) {
    throw new Error(`Caption contains a dash or hyphen: ${text}`);
  }
}

for (const scene of SCENES) {
  if (scene.caption) assertPlainCaption(scene.caption);
}
assertPlainCaption(END_TITLE);
assertPlainCaption(END_SUB);

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

function translate(rect, dx, dy) {
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
}

function unionRect(rects, margin = 12) {
  const x0 = Math.min(...rects.map((r) => r.x)) - margin;
  const y0 = Math.min(...rects.map((r) => r.y)) - margin;
  const x1 = Math.max(...rects.map((r) => r.x + r.w)) + margin;
  const y1 = Math.max(...rects.map((r) => r.y + r.h)) + margin;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function contains(frame, subject, slop = 1.5) {
  return (
    subject.x >= frame.x - slop &&
    subject.y >= frame.y - slop &&
    subject.x + subject.w <= frame.x + frame.w + slop &&
    subject.y + subject.h <= frame.y + frame.h + slop
  );
}

function containsAll(frame, rects, slop = 1.5) {
  return rects.every((rect) => contains(frame, rect, slop));
}

function frameContaining(subject, pad = 16) {
  const w0 = subject.w + pad * 2;
  const h0 = subject.h + pad * 2;
  let w = w0;
  let h = h0;
  if (w / h > PIC_ASPECT) h = w / PIC_ASPECT;
  else w = h * PIC_ASPECT;
  return {
    x: subject.x + subject.w / 2 - w / 2,
    y: subject.y + subject.h / 2 - h / 2,
    w,
    h,
  };
}

function place(frame) {
  const bounds = { x: 8, y: 68, w: VIEWPORT.width - 16, h: VIEWPORT.height - 76 };
  let { x, y, w, h } = frame;
  if (w > bounds.w + 0.5 || h > bounds.h + 0.5) {
    throw new Error(`Camera ${w.toFixed(0)}×${h.toFixed(0)} exceeds the viewport`);
  }
  x = Math.min(Math.max(x, bounds.x), bounds.x + bounds.w - w);
  y = Math.min(Math.max(y, bounds.y), bounds.y + bounds.h - h);
  return { x, y, w, h };
}

function pinTop(frame, hero, top) {
  const next = { ...frame, y: top };
  return contains(next, hero) ? next : frame;
}

function groupRows(rects) {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const rect of sorted) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - rect.y) < 24);
    if (row) row.push(rect);
    else rows.push([rect]);
  }
  return rows.map((row) => unionRect(row, 0));
}

async function preparePage(page, route) {
  await page.goto(APP + route, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
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
  await page.waitForTimeout(300);
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
  const journeys = await box(page, '.journeys');
  const sketches = await boxes(page, '.sketch');
  if (sketches.length < 3) throw new Error('Home sketches were not found');
  let homeStart = frameContaining(journeys, 22);
  homeStart = pinTop(homeStart, journeys, journeys.y - 26);
  homeStart = place(homeStart);
  if (!containsAll(homeStart, sketches)) {
    throw new Error('Home camera clips a sketch');
  }
  let homeEnd = place(zoomAbout(homeStart, 1.045, rectCenter(journeys)));
  if (!containsAll(homeEnd, sketches)) homeEnd = homeStart;

  await preparePage(page, '/assess');
  const how = await box(page, '.how');
  const viz = await boxes(page, '.how__viz');
  if (viz.length < 3) throw new Error('Assessment step graphics were not found');
  const assessHead = await box(page, 'h1');
  const assessHero = unionRect([assessHead, how], 6);
  let assessStart = frameContaining(assessHero, 18);
  assessStart = pinTop(assessStart, assessHero, assessHead.y - 18);
  assessStart = place(assessStart);
  if (!containsAll(assessStart, viz)) throw new Error('Assessment camera clips a step graphic');
  let assessEnd = place(zoomAbout(assessStart, 1.05, rectCenter(how)));
  if (!containsAll(assessEnd, viz)) assessEnd = assessStart;

  await preparePage(page, '/cases/worksheet');
  const table = await box(page, '.worksheet__table');
  const bands = await boxes(page, '.ws-band');
  if (bands.length < 6) throw new Error('Worksheet bands were not found');
  const rows = groupRows(await boxes(page, '.ws-row'));
  const riskW = table.w + 20;
  const riskH = riskW / PIC_ASPECT;
  const riskStart = place({
    x: table.x - 10,
    y: table.y - 8,
    w: riskW,
    h: riskH,
  });
  if (riskStart.x > table.x + 1 || riskStart.x + riskStart.w < table.x + table.w - 1) {
    throw new Error('Worksheet camera crops the matrix width');
  }
  const rowPitch = rows.length >= 3 ? rows[2].y - rows[0].y : 200;
  const maxPan = table.y + table.h - (riskStart.y + riskStart.h) - 12;
  const pan = Math.max(0, Math.min(rowPitch, maxPan, riskH * 0.42));
  const riskEnd = place(translate(riskStart, 0, pan));
  if (riskEnd.x > table.x + 1 || riskEnd.x + riskEnd.w < table.x + table.w - 1) {
    throw new Error('Worksheet end camera crops the matrix width');
  }

  await preparePage(page, '/reference/criteria');
  const lens = await box(page, '.critlens');
  const list = await box(page, '.critlist');
  const groups = await boxes(page, '.critgroup');
  if (!groups.length) throw new Error('Criteria groups were not found');
  const critW = lens.w + 20;
  const critH = critW / PIC_ASPECT;
  const criteriaStart = place({
    x: lens.x - 10,
    y: lens.y - 18,
    w: critW,
    h: critH,
  });
  if (!contains(criteriaStart, lens)) throw new Error('Criteria camera clips the class graphic');
  if (criteriaStart.y + criteriaStart.h < list.y + 120) {
    throw new Error('Criteria camera does not reach the criteria list');
  }
  const critPanRoom = lens.y - 10 - criteriaStart.y;
  const criteriaEnd = place(translate(criteriaStart, 0, Math.max(24, Math.min(72, critPanRoom + 36))));
  if (!contains(criteriaEnd, lens)) {
    // Keep the 12 / 26 / 37 graphic on screen for the whole scene.
    criteriaEnd.y = criteriaStart.y + Math.max(0, critPanRoom);
  }

  await preparePage(page, '/reference/tool-assurance');
  const map = await box(page, '.c7map');
  let frameworkStart = frameContaining(map, 26);
  frameworkStart = pinTop(frameworkStart, map, map.y - Math.min(120, (frameworkStart.h - map.h) * 0.72));
  frameworkStart = place(frameworkStart);
  if (!contains(frameworkStart, map)) throw new Error('Tool map is clipped at the start');
  const mapSlack = frameworkStart.h - map.h;
  let frameworkEnd = place(translate(frameworkStart, 0, Math.min(36, Math.max(0, mapSlack * 0.18))));
  if (!contains(frameworkEnd, map)) frameworkEnd = frameworkStart;

  await preparePage(page, '/use-cases/6.1');
  const flow = await box(page, '.flow');
  const headings = await boxes(page, '.ucsec__h');
  const flowHeading = [...headings].reverse().find((item) => item.y <= flow.y + 8);
  if (!flowHeading) throw new Error('Use case flow heading was not found');
  const flowHero = unionRect([flowHeading, flow], 4);
  let flowStart = frameContaining(flowHero, 16);
  flowStart = pinTop(flowStart, flowHero, flowHeading.y - 28);
  flowStart = place(flowStart);
  if (!contains(flowStart, flow)) throw new Error('Use case camera clips the flow');
  let flowEnd = place(zoomAbout(flowStart, 1.045, rectCenter(flow)));
  if (!contains(flowEnd, flow)) flowEnd = flowStart;

  await preparePage(page, '/reference/sqa-cards');
  const sqaCards = await boxes(page, '.sqxcard');
  if (sqaCards.length < 6) throw new Error('SQA work cards were not found');
  const deck = unionRect(sqaCards.slice(0, 6), 4);
  let sqaStart = frameContaining(deck, 14);
  sqaStart = pinTop(sqaStart, deck, deck.y - 16);
  sqaStart = place(sqaStart);
  const pitch = sqaCards[1].y - sqaCards[0].y;
  let sqaEnd = place(translate(sqaStart, 0, Math.min(pitch * 1.15, 110)));
  const stillVisible = sqaCards.filter((card) => {
    const overlap = Math.min(sqaEnd.y + sqaEnd.h, card.y + card.h) - Math.max(sqaEnd.y, card.y);
    return overlap > card.h * 0.65;
  });
  if (stillVisible.length < 4) sqaEnd = sqaStart;

  await preparePage(page, '/review');
  const rv = await box(page, '.rvflow');
  const reviewHead = await box(page, 'h1');
  const reviewHero = unionRect([reviewHead, rv], 8);
  let reviewStart = frameContaining(reviewHero, 18);
  reviewStart = pinTop(reviewStart, reviewHero, reviewHead.y - 22);
  reviewStart = place(reviewStart);
  if (!contains(reviewStart, rv)) throw new Error('Supplier review camera clips the step flow');
  let reviewEnd = place(zoomAbout(reviewStart, 1.05, rectCenter(rv)));
  if (!contains(reviewEnd, rv)) reviewEnd = reviewStart;

  return {
    home: { route: '/', start: homeStart, end: homeEnd },
    assess: { route: '/assess', start: assessStart, end: assessEnd },
    risk: { route: '/cases/worksheet', start: riskStart, end: riskEnd },
    criteria: { route: '/reference/criteria', start: criteriaStart, end: criteriaEnd },
    framework: { route: '/reference/tool-assurance', start: frameworkStart, end: frameworkEnd },
    flow: { route: '/use-cases/6.1', start: flowStart, end: flowEnd },
    sqa: { route: '/reference/sqa-cards', start: sqaStart, end: sqaEnd },
    review: { route: '/review', start: reviewStart, end: reviewEnd },
  };
}

async function shootPlate(page, route, plate, file) {
  await preparePage(page, route);
  if (plate.x < -1 || plate.y < -1) {
    throw new Error(`Plate origin is outside the viewport (${plate.x}, ${plate.y})`);
  }
  if (plate.y + plate.h > VIEWPORT.height + 1 || plate.x + plate.w > VIEWPORT.width + 1) {
    throw new Error(
      `Plate ${plate.w.toFixed(0)}×${plate.h.toFixed(0)} at ${plate.y.toFixed(0)} exceeds the viewport`
    );
  }
  const clip = {
    x: Math.max(0, Math.floor(plate.x)),
    y: Math.max(0, Math.floor(plate.y)),
    width: Math.ceil(plate.w + (plate.x - Math.floor(plate.x))),
    height: Math.ceil(plate.h + (plate.y - Math.floor(plate.y))),
  };
  clip.width = Math.min(clip.width, VIEWPORT.width - clip.x);
  clip.height = Math.min(clip.height, VIEWPORT.height - clip.y);
  await page.screenshot({ path: file, clip, type: 'png' });
  return clip;
}

function filterForScene(frames, start, end, plateClip, captionFile) {
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
  const captionY = `${PIC_H}+(${BAR_H}-text_h)/2`;
  return [
    `scale=iw*${UPSCALE}:ih*${UPSCALE}:flags=lanczos`,
    `crop=w='${esc(even(w))}':h='${esc(even(h))}':x='${esc(xSafe)}':y='${esc(ySafe)}'`,
    `scale=${OUT_W}:${PIC_H}:flags=lanczos`,
    `pad=${OUT_W}:${OUT_H}:0:0:color=0x0E1626`,
    `drawbox=x=0:y=${PIC_H}:w=${OUT_W}:h=3:color=0x2A55E5:t=fill`,
    `drawtext=fontfile=${FONT_SEMI}:textfile=${captionFile}:fontsize=36:fontcolor=white:x=(w-text_w)/2:y=${captionY}`,
    'setsar=1',
    'format=yuv420p',
  ].join(',');
}

async function renderScene(plateFile, clip, scene, frames, captionFile, outFile) {
  const filter = filterForScene(frames, scene.start, scene.end, clip, captionFile);
  await run('ffmpeg', [
    '-y',
    '-loop', '1',
    '-framerate', String(FPS),
    '-i', plateFile,
    '-vf', filter,
    '-frames:v', String(frames),
    '-r', String(FPS),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '14',
    '-pix_fmt', 'yuv420p',
    '-an',
    outFile,
  ]);
}

async function renderStill(plateFile, clip, scene, frames, captionFile, atFrame, outFile) {
  const filter = filterForScene(frames, scene.start, scene.end, clip, captionFile)
    .replaceAll('(n/', `(${atFrame}/`);
  await run('ffmpeg', [
    '-y',
    '-loop', '1',
    '-framerate', String(FPS),
    '-i', plateFile,
    '-vf', filter,
    '-frames:v', '1',
    outFile,
  ]);
}

async function renderEndCard(frames, outFile, stillFile) {
  const titleY = '(h-168)/2';
  const subY = '(h-168)/2+96';
  const accentY = '(h-168)/2-36';
  const filter = [
    `drawbox=x=(w-72)/2:y=${accentY}:w=72:h=4:color=0x2A55E5:t=fill`,
    `drawtext=fontfile=${FONT_BOLD}:text='${END_TITLE}':fontsize=64:fontcolor=0x0E1626:x=(w-text_w)/2:y=${titleY}`,
    `drawtext=fontfile=${FONT_REG}:text='${END_SUB}':fontsize=30:fontcolor=0x3C4658:x=(w-text_w)/2:y=${subY}`,
    'setsar=1',
    'format=yuv420p',
  ].join(',');
  const base = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0xF4F5F8:s=${OUT_W}x${OUT_H}:r=${FPS}`,
    '-vf', filter,
  ];
  if (stillFile) {
    await run('ffmpeg', [...base, '-frames:v', '1', stillFile]);
  }
  if (!outFile) return;
  await run('ffmpeg', [
    ...base,
    '-frames:v', String(frames),
    '-r', String(FPS),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '14',
    '-pix_fmt', 'yuv420p',
    '-an',
    outFile,
  ]);
}

function sceneSchedule(scenes) {
  const fadeSec = FADE_FRAMES / FPS;
  const offsets = [];
  let cursor = 0;
  for (let i = 0; i < scenes.length - 1; i += 1) {
    cursor += scenes[i].frames / FPS;
    offsets.push(cursor - (i + 1) * fadeSec);
  }
  const total = scenes.reduce((sum, scene) => sum + scene.frames, 0) / FPS - (scenes.length - 1) * fadeSec;
  return scenes.map((scene, index) => {
    const start = index === 0 ? 0 : offsets[index - 1];
    const end = index === scenes.length - 1 ? total : offsets[index] + fadeSec;
    return {
      id: scene.id,
      caption: scene.caption || END_TITLE,
      route: scene.route,
      start,
      end,
    };
  });
}

async function assemble(sceneFiles, outFile) {
  const fadeSec = FADE_FRAMES / FPS;
  const durations = sceneFiles.map((file) => file.frames);
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

  await run('ffmpeg', [
    '-y',
    ...inputs,
    '-filter_complex', parts.join(';'),
    '-map', `[${last}]`,
    '-r', String(FPS),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '17',
    '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709',
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    '-movflags', '+faststart',
    '-an',
    outFile,
  ]);
}

async function assertOutput(file) {
  const probe = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size:stream=codec_name,width,height,avg_frame_rate,pix_fmt,codec_type',
    '-of', 'json',
    file,
  ]);
  const jsonStart = probe.indexOf('{');
  const parsed = JSON.parse(probe.slice(jsonStart));
  const video = parsed.streams.find((stream) => stream.codec_type === 'video');
  const audio = parsed.streams.find((stream) => stream.codec_type === 'audio');
  const duration = Number(parsed.format.duration);
  const size = Number(parsed.format.size);
  const [fpsNum, fpsDen] = String(video.avg_frame_rate).split('/').map(Number);
  const fps = fpsNum / fpsDen;
  const problems = [];
  if (video.codec_name !== 'h264') problems.push(`codec ${video.codec_name}`);
  if (video.width !== OUT_W || video.height !== OUT_H) problems.push(`size ${video.width}x${video.height}`);
  if (Math.abs(fps - FPS) > 0.05) problems.push(`fps ${fps}`);
  if (video.pix_fmt !== 'yuv420p') problems.push(`pix_fmt ${video.pix_fmt}`);
  if (audio) problems.push('unexpected audio track');
  if (duration < 40 || duration > 48) problems.push(`duration ${duration.toFixed(2)}s`);
  if (size > 50 * 1024 * 1024) problems.push(`file ${(size / 1024 / 1024).toFixed(1)} MB`);
  if (problems.length) throw new Error(`Output check failed: ${problems.join('; ')}`);
  const info = await stat(file);
  return { duration, size: info.size, fps, width: video.width, height: video.height };
}

async function main() {
  const expected = sceneSchedule(SCENES);
  const total = expected[expected.length - 1].end;
  console.log(`Planned duration ${total.toFixed(2)}s`);
  for (const scene of expected) {
    console.log(
      `  ${scene.start.toFixed(2).padStart(5)}–${scene.end.toFixed(2).padStart(5)}  ${scene.caption}`
    );
  }
  if (total < 40 || total > 48) {
    throw new Error(`Planned duration ${total.toFixed(2)}s is outside 40–48s`);
  }

  const { chromium } = loadPlaywright();
  const work = path.join(tmpdir(), stillsOnly ? 'vda20-linkedin-stills' : 'vda20-linkedin-build');
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
  for (const spec of SCENES) {
    if (spec.id === 'end') {
      const still = path.join(work, 'end.png');
      const outFile = path.join(work, 'end.mp4');
      console.log('Setting the end card');
      await renderEndCard(spec.frames, stillsOnly ? null : outFile, still);
      if (!stillsOnly) rendered.push({ id: spec.id, path: outFile, frames: spec.frames });
      continue;
    }
    const scene = plans[spec.id];
    const plate = unionRect([scene.start, scene.end], 28);
    plate.x = Math.max(0, plate.x);
    plate.y = Math.max(0, plate.y);
    const plateFile = path.join(work, `${spec.id}.png`);
    const captionFile = path.join(work, `${spec.id}.txt`);
    await writeFile(captionFile, spec.caption);
    console.log(`Capturing ${spec.id} ← ${scene.route}`);
    const clip = await shootPlate(page, scene.route, plate, plateFile);
    if (stillsOnly) {
      await renderStill(plateFile, clip, scene, spec.frames, captionFile, 0, path.join(work, `${spec.id}-start.png`));
      await renderStill(
        plateFile,
        clip,
        scene,
        spec.frames,
        captionFile,
        spec.frames - 1,
        path.join(work, `${spec.id}-end.png`)
      );
      console.log(`  stills for ${spec.id}`);
      continue;
    }
    const outFile = path.join(work, `${spec.id}.mp4`);
    console.log(`Animating ${spec.id} (${spec.frames} frames)`);
    await renderScene(plateFile, clip, scene, spec.frames, captionFile, outFile);
    rendered.push({ id: spec.id, path: outFile, frames: spec.frames });
  }
  await browser.close();

  await writeFile(path.join(work, 'schedule.json'), JSON.stringify(expected, null, 2));

  if (stillsOnly) {
    console.log(`Stills written to ${work}`);
    return;
  }

  console.log('Joining scenes…');
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await assemble(rendered, OUT_FILE);
  const info = await assertOutput(OUT_FILE);
  console.log(
    `Wrote ${OUT_FILE}  ${info.width}x${info.height}  ${info.duration.toFixed(2)}s  ` +
      `${(info.size / 1024 / 1024).toFixed(2)} MB  ${info.fps.toFixed(2)} fps`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
