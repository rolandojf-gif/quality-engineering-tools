// Run: npm install --no-save --package-lock=false jsdom@26.1.0
//      node --test scripts/test-i18n.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { JSDOM } = require('jsdom');

const root = resolve(__dirname, '..');
const pages = ['index.html', 'privacy.html', 'feedback-received.html', 'tools/aiag-vda-spc-guide.html', 'tools/vda-6-3-process-audit-copilot.html'];
const read = path => readFileSync(resolve(root, path), 'utf8');
const scripts = ['js/translations.js', 'js/i18n.js', 'js/main.js'].map(read);

function open(path = 'index.html', { stored, query = '', blocked = false } = {}) {
  const dom = new JSDOM(read(path), { url: `https://quality-tools.test/${path}${query}`, runScripts: 'outside-only' });
  const w = dom.window;
  w.matchMedia = query => ({ matches: query.includes('reduced-motion'), addEventListener() {} });
  Object.defineProperty(w.navigator, 'language', { value: 'es-ES' });
  if (stored) w.localStorage.setItem('quality-tools-language', stored);
  if (blocked) Object.defineProperty(w, 'localStorage', { get() { throw new Error('Storage disabled'); } });
  scripts.forEach(script => w.eval(script));
  return w;
}
function choose(w, language) { w.document.querySelector(`[data-language="${language}"]`).click(); }
function text(w) { return w.document.body.textContent; }

for (const path of pages) {
  test(`${path}: English default, complete Spanish catalog, lossless round trip`, () => {
    const w = open(path);
    const d = w.document;
    assert.equal(d.documentElement.lang, 'en'); // Even with a Spanish browser.
    assert.equal(d.querySelector('.language-switch').hidden, false);
    const before = text(w);
    const title = d.title;
    const englishAttributes = [...d.querySelectorAll('[aria-label], [alt], [data-title], [data-source]')].flatMap(el =>
      ['aria-label', 'alt', 'data-title', 'data-source'].filter(a => el.hasAttribute(a)).map(a => [el, a, el.getAttribute(a)]));
    const unchanged = new Set(['Quality Engineering Tools', 'GitHub', 'VDA 6.3:2023', 'AIAG-VDA SPC', 'AIAG-VDA', 'SPC', 'Babel Life', 'Cosmic Timeline', 'Rolando Fernández', 'Core Tools', 'LinkedIn', 'Cloudflare Web Analytics:', '/A', '/B', '/C', '/D', 'AIAG-VDA SPC / 01', 'AIAG-VDA SPC / 02', 'AIAG-VDA SPC / 03', 'VDA 6.3', 'EN', 'ES', 'Castellano']);
    const walker = d.createTreeWalker(d.body, w.NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest('script, style')) continue;
      const key = node.nodeValue.trim().replace(/\s+/g, ' ');
      if (/[a-zA-Z]/.test(key)) assert.ok(Object.hasOwn(w.qualityToolsSpanish, key) || unchanged.has(key), `Missing Spanish copy: ${key}`);
    }
    choose(w, 'es');
    assert.equal(d.documentElement.lang, 'es');
    assert.equal(d.querySelector('[data-language="es"]').getAttribute('aria-pressed'), 'true');
    assert.equal(d.querySelector('.nav-toggle').textContent, 'Menú');
    assert.equal(d.querySelector('.site-nav a').textContent, 'Herramientas');
    assert.notEqual(d.title, title);
    assert.equal(w.localStorage.getItem('quality-tools-language'), 'es');
    for (const [el, attribute, original] of englishAttributes) {
      assert.equal(el.getAttribute(attribute), w.qualityToolsSpanish[original] || original);
    }
    choose(w, 'en');
    assert.equal(text(w), before);
    assert.equal(d.title, title);
    for (const [el, attribute, original] of englishAttributes) assert.equal(el.getAttribute(attribute), original);
    w.close();
  });
}

test('Switching preserves entered form data, control identity, URLs and video nodes', () => {
  const w = open();
  const d = w.document;
  const input = d.querySelector('textarea');
  input.value = 'Tools: texto del usuario que no debe traducirse';
  d.querySelector('input[name="tool"]').checked = true;
  d.querySelector('input[name="type"]').checked = true;
  d.querySelector('input[type="email"]').value = 'qa@example.com';
  const form = d.querySelector('#feedback-form');
  const before = [...new w.FormData(form)];
  const videos = [...d.querySelectorAll('video')];
  const external = [...d.querySelectorAll('a[href^="https:"]')].map(a => [a, a.href]);
  choose(w, 'es');
  choose(w, 'en');
  choose(w, 'es');
  assert.deepEqual([...new w.FormData(form)], before);
  assert.equal(d.querySelector('textarea'), input);
  assert.deepEqual([...d.querySelectorAll('video')], videos);
  external.forEach(([a, href]) => assert.equal(a.href, href));
  assert.equal(form.getAttribute('action'), '/feedback-received?lang=es');
  assert.equal(d.querySelector('.form__privacy a').getAttribute('href'), '/privacy.html?lang=es');
  w.close();
});

test('Stored language, explicit URLs, invalid storage and blocked storage', () => {
  for (const [options, expected] of [
    [{ stored: 'es' }, 'es'], [{ stored: 'xx' }, 'en'],
    [{ stored: 'es', query: '?lang=en' }, 'en'],
    [{ stored: 'en', query: '?lang=es' }, 'es'],
    [{ blocked: true }, 'en'], [{ blocked: true, query: '?lang=es' }, 'es']
  ]) {
    const w = open('privacy.html', options);
    assert.equal(w.document.documentElement.lang, expected);
    choose(w, 'es');
    assert.equal(w.document.documentElement.lang, 'es');
    assert.equal(w.document.querySelector('.site-nav a').getAttribute('href'), '/?lang=es#tools');
    choose(w, 'en');
    assert.equal(w.document.documentElement.lang, 'en');
    w.close();
  }
});

test('Language switch preserves URL parameters and hash', () => {
  const w = open('index.html', { query: '?source=qa#feedback' });
  choose(w, 'es');
  assert.equal(w.location.search, '?source=qa&lang=es');
  assert.equal(w.location.hash, '#feedback');
  w.close();
});

test('Menu can change language while open, then close with Escape', () => {
  const w = open();
  const button = w.document.querySelector('.nav-toggle');
  button.click();
  choose(w, 'es');
  assert.equal(button.textContent, 'Cerrar');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(button.textContent, 'Menú');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  w.close();
});

for (const path of pages.filter(p => p.startsWith('tools/'))) {
  test(`${path}: gallery titles, controls, alt text and navigation remain translated`, () => {
    const w = open(path, { stored: 'es' });
    const d = w.document;
    d.querySelector('[data-gallery-index="1"]').click();
    assert.ok(d.querySelector('#lightbox-title').textContent.includes('Vista previa'));
    assert.ok(d.querySelector('#lightbox-image').alt.startsWith('Fotograma real'));
    d.querySelector('[data-lightbox-next]').click();
    assert.equal(d.querySelector('#lightbox-counter').textContent, '03 / 03');
    choose(w, 'en');
    assert.ok(d.querySelector('#lightbox-title').textContent.includes('preview'));
    d.querySelector('[data-lightbox-close]').click();
    assert.equal(d.querySelector('#tool-lightbox').hasAttribute('open'), false);
    w.close();
  });
}

test('HTML remains readable in English if JavaScript is disabled', () => {
  for (const path of pages) {
    const w = new JSDOM(read(path)).window;
    assert.equal(w.document.documentElement.lang, 'en');
    assert.equal(w.document.querySelector('.language-switch').hidden, true);
    assert.ok(w.document.querySelector('main').textContent.length > 100);
    w.close();
  }
});
