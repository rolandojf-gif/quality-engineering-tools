/* Static, reviewed EN/ES translations. No network requests or HTML injection.
 * Capture original text nodes once so switching language preserves links,
 * event listeners, videos, form values and the exact English source copy.
 * Dynamic menu/gallery content is refreshed through qualitytools:languagechange.
 */
(function () {
  'use strict';

  var spanish = window.qualityToolsSpanish;
  if (!spanish) return;

  var storageKey = 'quality-tools-language';
  var language = 'en';
  var records = [];
  var normalize = function (text) { return text.trim().replace(/\s+/g, ' '); };
  var hasTranslation = function (text) {
    return Object.prototype.hasOwnProperty.call(spanish, text);
  };
  var translate = function (text) {
    return language === 'es' && hasTranslation(text) ? spanish[text] : text;
  };

  // A browser's own language must never override the English default.
  try {
    if (localStorage.getItem(storageKey) === 'es') language = 'es';
  } catch (error) { /* Storage can be disabled; the selector still works. */ }

  // Explicit URL language also supports links and navigation without storage.
  var requested = new URL(window.location.href).searchParams.get('lang');
  if (requested === 'en' || requested === 'es') language = requested;

  var walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  var node;
  while ((node = walker.nextNode())) {
    if (node.parentElement.closest('script, style, textarea, [contenteditable], .language-switch, .nav-toggle, #tool-lightbox, [data-i18n-hero]')) continue;
    var key = normalize(node.nodeValue);
    if (hasTranslation(key)) {
      records.push({ node: node, english: node.nodeValue, key: key });
    }
  }

  var attributes = [];
  document.querySelectorAll('[aria-label], [alt], [data-title], [data-source], meta[content]').forEach(function (element) {
    // The lightbox image gets its alt from the selected gallery image.
    if (element.id === 'lightbox-image') return;
    ['aria-label', 'alt', 'data-title', 'data-source', 'content'].forEach(function (name) {
      var value = element.getAttribute(name);
      if (value && hasTranslation(value)) attributes.push({ element: element, name: name, english: value });
    });
  });

  var hero = document.querySelector('[data-i18n-hero]');
  var heroNodes = hero ? Array.prototype.slice.call(hero.childNodes) : [];
  var heroEnglish = heroNodes.map(function (child) { return child.nodeValue; });
  var links = Array.prototype.slice.call(document.querySelectorAll('a[href]')).filter(function (link) {
    var href = link.getAttribute('href');
    var url = new URL(href, window.location.href);
    return href.charAt(0) !== '#' && url.origin === window.location.origin && !link.hasAttribute('download');
  });
  var selectors = document.querySelectorAll('[data-language]');

  function applyLanguage(next, updateUrl) {
    language = next === 'es' ? 'es' : 'en';
    document.documentElement.lang = language;
    records.forEach(function (record) {
      record.node.nodeValue = language === 'en' ? record.english : record.english.replace(/\S[\s\S]*\S|\S/, spanish[record.key]);
    });
    attributes.forEach(function (record) {
      record.element.setAttribute(record.name, translate(record.english));
    });
    if (hero) {
      heroNodes[0].nodeValue = language === 'es' ? 'Herramientas de' : heroEnglish[0];
      heroNodes[2].nodeValue = language === 'es' ? 'ingeniería de calidad' : heroEnglish[2];
    }
    document.querySelectorAll('meta[property="og:locale"]').forEach(function (meta) {
      meta.content = language === 'es' ? 'es_ES' : 'en_US';
    });
    selectors.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
    });
    // Preserve anchors and existing query parameters; external apps are separate.
    links.forEach(function (link) {
      var url = new URL(link.getAttribute('href'), window.location.href);
      url.searchParams.set('lang', language);
      link.setAttribute('href', url.pathname + url.search + url.hash);
    });
    var form = document.getElementById('feedback-form');
    if (form) form.setAttribute('action', '/feedback-received?lang=' + language);
    try { localStorage.setItem(storageKey, language); } catch (error) { /* Optional persistence. */ }
    if (updateUrl) {
      var url = new URL(window.location.href);
      url.searchParams.set('lang', language);
      try { history.replaceState(history.state, '', url); } catch (error) { /* file:// preview */ }
    }
    document.dispatchEvent(new CustomEvent('qualitytools:languagechange', { detail: { language: language } }));
  }

  window.qualityToolsI18n = { t: translate };
  applyLanguage(language, false);
  document.querySelectorAll('.language-switch').forEach(function (group) { group.hidden = false; });
  selectors.forEach(function (button) {
    button.addEventListener('click', function () { applyLanguage(button.dataset.language, true); });
  });
  window.addEventListener('popstate', function () {
    var value = new URL(window.location.href).searchParams.get('lang');
    if (value === 'en' || value === 'es') applyLanguage(value, false);
  });
})();
