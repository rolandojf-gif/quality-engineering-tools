/* ==========================================================================
   QUALITY ENGINEERING TOOLS — main.js

   Four small jobs, no dependencies:
   1. the compact navigation menu on small screens
   2. a scrolled state on the floating masthead
   3. playback of the product preview videos
   4. recording selected high-value link clicks through Netlify Forms

   Everything degrades: with JavaScript disabled the page is fully readable,
   all links work, and the previews stay visible.
   ========================================================================== */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');


  /* 1  Navigation ------------------------------------------------------- */

  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');

  if (toggle && nav) {
    var setNav = function (open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Close' : 'Menu';
    };

    toggle.addEventListener('click', function () {
      setNav(!nav.classList.contains('is-open'));
    });

    // Following an in-page link should leave the menu closed behind it.
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) { setNav(false); }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) {
        setNav(false);
        toggle.focus();
      }
    });
  }


  /* 2  Masthead scroll state -------------------------------------------- */

  var masthead = document.getElementById('masthead');

  if (masthead) {
    var syncMasthead = function () {
      masthead.classList.toggle('is-scrolled', window.scrollY > 8);
    };

    window.addEventListener('scroll', syncMasthead, { passive: true });
    syncMasthead();
  }


  /* 3  Product previews -------------------------------------------------- */

  /* One pair of functions owns the active state. Everything the preview does
     hangs off these two, so adding the recordings later means adding the
     play/pause lines here and nothing else. */

  var activate = function (product) {
    var video = product.querySelector('video');

    // No preview to reveal, or motion is not wanted: the row stays in its base
    // state rather than going active over something that will never run.
    if (!video || reduceMotion.matches) { return; }

    product.classList.add('preview-active');

    var attempt = video.play();

    // Browsers may still refuse autoplay; revert the row when they do.
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(function () {
        // A later activation may already be playing; only the failed one reverts.
        if (video.paused) { product.classList.remove('preview-active'); }
      });
    }
  };

  var deactivate = function (product) {
    product.classList.remove('preview-active');

    var video = product.querySelector('video');
    if (!video) { return; }

    video.pause();
    // Next activation starts the loop from the top rather than mid-scrub.
    try { video.currentTime = 0; } catch (error) { /* not seekable yet */ }
  };

  document.querySelectorAll('.product').forEach(function (product) {
    if (finePointer.matches) {
      product.addEventListener('mouseenter', function () { activate(product); });

      product.addEventListener('mouseleave', function () {
        // Keyboard focus inside the row outranks the pointer leaving it.
        if (product.contains(document.activeElement)) { return; }
        deactivate(product);
      });

      // No row is focusable yet; these start working on their own the day a
      // product title becomes a link, with no tabindex added for show.
      product.addEventListener('focusin', function () { activate(product); });

      product.addEventListener('focusout', function (event) {
        if (!product.contains(event.relatedTarget)) { deactivate(product); }
      });

      return;
    }

    // Touch devices have no hover. Once a recording exists, run it while its
    // row is on screen; until then there is nothing to activate, so the rows
    // stay in their base state.
    if (!product.querySelector('video') || !('IntersectionObserver' in window)) { return; }

    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { activate(product); } else { deactivate(product); }
      });
    }, { threshold: 0.4 }).observe(product);
  });


  /* 4  Click tracking ----------------------------------------------------- */

  document.querySelectorAll('[data-track]').forEach(function (link) {
    link.addEventListener('click', function () {
      var body = new URLSearchParams({
        'form-name': 'click-track',
        event: link.getAttribute('data-track'),
        path: window.location.pathname + window.location.hash,
        referrer: document.referrer || 'direct'
      });

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        keepalive: true,
        credentials: 'same-origin'
      }).catch(function () {
        // Tracking must never interfere with navigation.
      });
    });
  });

})();
