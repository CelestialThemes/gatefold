/* =============== Smooth Scroll =============== */
// Lenis 1.1.20 on the page's own scroll, with the settings celestialthemes.com
// runs. Lenis smooths the real window scroll (it moves no wrapper), so
// position: sticky, #hash links and window.scrollY all keep working.
//
// A page opts in by loading assets/js/lenis.js and this file; a page without
// them scrolls natively. In the demo that is the About page: the carousel page
// has nothing to scroll through.
//
// - Off under prefers-reduced-motion: plain native scrolling.
// - Off on touch: phones keep their own scrolling (syncTouch: false).
// - Same-page #id links glide through Lenis, honouring the target's
//   scroll-margin-top. Other pages, a bare "#", new tabs and modified clicks
//   stay with the browser.
// - Paused while an overlay is open; its panel scrolls on its own.
// - An element marked data-lenis-prevent scrolls on its own too.
(function () {
  'use strict';

  const DEFAULTS = {
    lerp:            0.1,   // interpolation factor: lower is smoother, slower to catch up
    wheelMultiplier: 1,     // mouse-wheel speed
    smoothWheel:     true,
    syncTouch:       false, // native scrolling on touch screens
    minDuration:     1,     // s for a short hop to a #link…
    maxDuration:     3,     // …and for a trip across the whole page
  };

  let lenis = null;

  // GSAP's power2.out, written out (this page may not load GSAP): 1 - (1-t)³.
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function init(config = {}) {
    const cfg = { ...DEFAULTS, ...config };

    if (lenis || !window.Lenis) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    lenis = new window.Lenis({
      lerp:            cfg.lerp,
      wheelMultiplier: cfg.wheelMultiplier,
      smoothWheel:     cfg.smoothWheel,
      syncTouch:       cfg.syncTouch,
    });

    const raf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);

    // One law for every glide: a short hop takes minDuration, a trip across
    // the whole page maxDuration. Lenis's own default is a flat 1.2s whatever
    // the distance, which makes a long jump feel hurried next to a short one.
    const glideDuration = (distance) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const share = max > 0 ? Math.min(1, Math.abs(distance) / max) : 0;
      return cfg.minDuration + share * (cfg.maxDuration - cfg.minDuration);
    };

    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = event.target.closest && event.target.closest('a[href*="#"]');
      if (!link || (link.target && link.target !== '_self')) return;

      const url = new URL(link.href, window.location.href);
      const here = window.location;
      if (url.origin !== here.origin || url.pathname !== here.pathname) return;
      if (url.search !== here.search || url.hash.length < 2) return;

      let target = null;
      try {
        target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      } catch (e) {
        return;   // malformed escape: leave it to the browser
      }
      if (!target) return;

      event.preventDefault();

      const offset = -(parseFloat(getComputedStyle(target).scrollMarginTop) || 0);
      lenis.scrollTo(target, {
        offset,
        duration: glideDuration(target.getBoundingClientRect().top + offset),
        easing:   easeOut,
      });
      if (here.hash !== url.hash) history.pushState(null, '', url.hash);
    });

    // The overlay locks the page and scrolls its own panel. Stopped, Lenis
    // still swallows the wheel, so the overlay is marked as its own scroller.
    document.addEventListener('cel:overlay-open', (event) => {
      event.target.setAttribute('data-lenis-prevent', '');
      lenis.stop();
    });
    document.addEventListener('cel:overlay-close', () => lenis.start());
  }

  window.celSmoothScroll = {
    init,
    // The running Lenis instance, or null (not loaded, or reduced motion).
    get lenis() { return lenis; },
  };
})();
