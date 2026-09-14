/* ==========================================================================
   QUALITY ENGINEERING TOOLS — main.js

   Four small jobs, no dependencies:
   1. the compact navigation menu on small screens
   2. a scrolled state on the floating masthead
   3. playback of the product preview videos
   4. swapping each request form for its confirmation after Netlify
      redirects back

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
    product.classList.add('preview-active');

    var video = product.querySelector('video');
    if (!video || reduceMotion.matches) { return; }

    var attempt = video.play();
    // Browsers may refuse autoplay; the poster frame is a fine fallback.
    if (attempt && typeof attempt.catch === 'function') { attempt.catch(function () {}); }
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


  /* 4  Form confirmations ------------------------------------------------- */

  /* Each form posts natively to Netlify, which redirects back to the URL in
     its own action. The only job here is to swap that form for its
     confirmation; nothing about the submission depends on JavaScript. The
     two flags are independent, so one never triggers the other. */

  var showConfirmation = function (flag, formId, doneId) {
    if (window.location.search.indexOf(flag) === -1) { return; }

    var form = document.getElementById(formId);
    var done = document.getElementById(doneId);
    if (!form || !done) { return; }

    form.hidden = true;
    done.hidden = false;
    done.setAttribute('tabindex', '-1');
    done.focus();
  };

  showConfirmation('demo-request=received', 'demo-form', 'demo-done');
  showConfirmation('feedback=received', 'feedback-form', 'feedback-done');

})();
