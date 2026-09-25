/* ==========================================================================
   QUALITY ENGINEERING TOOLS — main.js

   Five small jobs, no dependencies:
   1. the compact navigation menu on small screens
   2. a scrolled state on the floating masthead
   3. playback of the product preview videos
   4. gallery thumbnails and the enlarged image lightbox
   5. recording selected high-value link clicks through Netlify Forms

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
  var desktopNav = window.matchMedia('(min-width: 52rem)');

  if (toggle && nav) {
    var setNav = function (open) {
      nav.classList.toggle('is-open', open);
      nav.setAttribute('aria-hidden', String(!desktopNav.matches && !open));
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Close' : 'Menu';
    };

    setNav(false);

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

    desktopNav.addEventListener('change', function () {
      if (desktopNav.matches) {
        setNav(true);
      } else {
        setNav(false);
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

      // Product titles are now links, so keyboard focus reveals the preview.
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


  /* 4  Gallery lightbox ---------------------------------------------------- */

  var gallery = document.querySelector('[data-gallery]');
  var lightbox = document.getElementById('tool-lightbox');

  if (gallery && lightbox) {
    var galleryItems = Array.prototype.slice.call(gallery.querySelectorAll('[data-gallery-index]'));
    var lightboxImage = document.getElementById('lightbox-image');
    var lightboxTitle = document.getElementById('lightbox-title');
    var lightboxSource = document.getElementById('lightbox-source');
    var lightboxCounter = document.getElementById('lightbox-counter');
    var lightboxTrigger = null;
    var lightboxIndex = 0;

    var renderLightbox = function (index) {
      var item = galleryItems[index];
      if (!item) return;

      lightboxIndex = index;
      lightboxImage.src = item.getAttribute('data-full');
      lightboxImage.alt = item.querySelector('img').getAttribute('alt') || '';
      lightboxTitle.textContent = item.getAttribute('data-title') || 'Product preview';
      lightboxSource.textContent = item.getAttribute('data-source') || 'Real product preview frame';
      lightboxCounter.textContent = String(index + 1).padStart(2, '0') + ' / ' + String(galleryItems.length).padStart(2, '0');
    };

    var openLightbox = function (index, trigger) {
      lightboxTrigger = trigger || document.activeElement;
      renderLightbox(index);
      document.body.classList.add('lightbox-open');
      // The authored `hidden` attribute keeps the dialog out of the tab order
      // before first use; remove it before asking the browser to show the modal.
      lightbox.removeAttribute('hidden');
      if (typeof lightbox.showModal === 'function') {
        lightbox.showModal();
      } else {
        lightbox.setAttribute('open', '');
      }
    };

    var closeLightbox = function () {
      if (typeof lightbox.close === 'function') {
        lightbox.close();
      } else {
        lightbox.removeAttribute('open');
        lightbox.setAttribute('hidden', '');
      }
      document.body.classList.remove('lightbox-open');
      if (lightboxTrigger && typeof lightboxTrigger.focus === 'function') lightboxTrigger.focus();
    };

    var stepLightbox = function (direction) {
      renderLightbox((lightboxIndex + direction + galleryItems.length) % galleryItems.length);
    };

    galleryItems.forEach(function (item, index) {
      item.addEventListener('click', function () { openLightbox(index, item); });
    });

    lightbox.querySelector('[data-lightbox-close]').addEventListener('click', closeLightbox);
    lightbox.querySelector('[data-lightbox-prev]').addEventListener('click', function () { stepLightbox(-1); });
    lightbox.querySelector('[data-lightbox-next]').addEventListener('click', function () { stepLightbox(1); });

    lightbox.addEventListener('click', function (event) {
      // Clicking the backdrop closes; clicks inside the window do not.
      if (event.target === lightbox) closeLightbox();
    });

    lightbox.addEventListener('close', function () {
      document.body.classList.remove('lightbox-open');
      lightbox.setAttribute('hidden', '');
      if (lightboxTrigger && typeof lightboxTrigger.focus === 'function') lightboxTrigger.focus();
    });

    lightbox.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeLightbox();
        return;
      }
      if (event.key === 'ArrowLeft') stepLightbox(-1);
      if (event.key === 'ArrowRight') stepLightbox(1);
    });
  }


  /* 5  Click tracking ----------------------------------------------------- */

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
