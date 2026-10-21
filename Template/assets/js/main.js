/* =============== Gatefold — Portfolio Carousel =============== */
(function () {
  'use strict';

  const screenBreakpoint = 992;


  /* =============== Reduced Motion =============== */
  // The CSS reduced-motion rule does not reach GSAP tweens, so they check it
  // here. Read on every call, so an OS-level toggle applies without a reload.
  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionDur = (duration) => (prefersReducedMotion() ? 0 : duration);


  /* =============== Config =============== */
  const CAROUSEL_SWIPER = {
    selector:       '.cel-carousel-slider, .cel-carousel-slider-no-gutter',
    direction:      'horizontal',
    loop:           true,
    speed:          800,
    autoplay:       false,
    slidesPerView:  'auto',
    centeredSlides: true,
    pagination:     'auto',   // 'auto' = on when the element is in the markup
    navigation:     'auto',
    gutter:         null,     // null = the gaps below; a number = one gap at every width
    breakpoints: {
      320:  { slidesPerView: 'auto', spaceBetween: 20 },
      768:  { slidesPerView: 'auto', spaceBetween: 24 },
      1024: { slidesPerView: 'auto', spaceBetween: 32 },
      1280: { slidesPerView: 'auto', spaceBetween: 36 },
      1536: { slidesPerView: 'auto', spaceBetween: 42 },
    },
    // Named variants, chosen per carousel with data-cel-carousel="<name>".
    presets: {
      // Fixed-count grid: 1 → 6 columns, tight gaps
      portfolio: {
        centeredSlides: false,
        speed:          1200,
        pagination:     true,
        breakpoints: {
          320:  { slidesPerView: 1, spaceBetween: 0 },
          576:  { slidesPerView: 2, spaceBetween: 4 },
          992:  { slidesPerView: 3, spaceBetween: 6 },
          1200: { slidesPerView: 4, spaceBetween: 8 },
          2400: { slidesPerView: 5, spaceBetween: 8 },
          3200: { slidesPerView: 6, spaceBetween: 8 }
        },
      },
    },
  };

  const INFO_OVER_HOVER = {
    selector:         '.swiper-slide .cel-info-over-wrapper',
    imgScale:         1.08,
    imgDuration:      0.6,
    imgEase:          'power2.out',
    overlayDuration:  1,
    overlayEase:      'power4.out',
    overlayScale:     true,       // scale the panel as well as sliding it
    overlayScaleFrom: 0.8,
    overlayY:         40,         // px the panel rises from
    contentY:         100,        // px each line of content rises from
    contentDuration:  0.55,
    contentEase:      'power3.out',
    contentStagger:   0.08,
    leaveSpeed:       0.7,        // multiplier on the exit — lower is faster
  };


  /* =============== Shared helpers =============== */

  // data-cel-* readers: "false" turns a boolean off; numbers parse or fall back
  const boolAttr = (value, fallback) => (value === undefined ? fallback : value !== 'false');
  const numAttr  = (value, fallback) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  };

  // Pagination / navigation: the attribute wins; otherwise 'auto' means the
  // element's presence in the markup decides.
  const resolveUI = (attrValue, baseValue, elementPresent) => {
    if (attrValue !== undefined) return attrValue !== 'false';
    if (baseValue === 'auto') return elementPresent;
    return !!baseValue;
  };

  // Hide the controls this carousel has turned off, with a class rather than
  // inline styles.
  function hideDisabledUI(root, opts) {
    const hide = (sel) => root.querySelectorAll(sel).forEach(el => el.classList.add('cel-hide-all'));

    if (!opts.pagination) hide('.swiper-pagination');
    if (!opts.navigation) hide('.swiper-button-prev, .swiper-button-next');
  }


  /* =============== Carousel Swiper Slider =============== */
  // Every carousel on the page, configured from its own markup:
  //   data-cel-carousel="portfolio"  data-cel-loop="false"  data-cel-speed="1200"
  //   data-cel-gutter="0"  data-cel-slides-per-view="4|auto"  data-cel-centered="false"
  //   data-cel-pagination="true"  data-cel-navigation="true"
  //   data-cel-autoplay="4000" (presence enables autoplay; value = delay in ms)
  function initCarouselSwiper(config = {}) {
    const cfg = { ...CAROUSEL_SWIPER, ...config };

    const roots = document.querySelectorAll(cfg.selector);
    if (!roots.length) return [];

    const instances = [];

    roots.forEach((root) => {
      const el = root.querySelector('.swiper');
      if (!el || el.swiper) return; // no markup here / already initialised

      const preset = (cfg.presets && cfg.presets[root.dataset.celCarousel]) || {};
      const base = { ...cfg, ...preset };
      const d = root.dataset;

      const paginationEl = root.querySelector('.swiper-pagination');
      const nextEl       = root.querySelector('.swiper-button-next');
      const prevEl       = root.querySelector('.swiper-button-prev');

      const opts = {
        loop:           boolAttr(d.celLoop, base.loop),
        speed:          numAttr(d.celSpeed, base.speed),
        slidesPerView:  d.celSlidesPerView !== undefined
          ? (d.celSlidesPerView === 'auto' ? 'auto' : numAttr(d.celSlidesPerView, 'auto'))
          : base.slidesPerView,
        centeredSlides: boolAttr(d.celCentered, base.centeredSlides),
        pagination:     resolveUI(d.celPagination, base.pagination, !!paginationEl),
        navigation:     resolveUI(d.celNavigation, base.navigation, !!(nextEl && prevEl)),
        gutter:         d.celGutter !== undefined ? numAttr(d.celGutter, 0) : base.gutter,
        autoplay:       d.celAutoplay !== undefined
          ? { delay: numAttr(d.celAutoplay, 3000) }
          : base.autoplay,
      };

      // Breakpoints override the base settings, so an attribute that should
      // hold at every width is written into each of them.
      let breakpoints = Object.fromEntries(Object.entries(base.breakpoints).map(([bp, set]) => {
        const next = { ...set };
        if (typeof opts.gutter === 'number') next.spaceBetween = opts.gutter;
        if (d.celSlidesPerView !== undefined) next.slidesPerView = opts.slidesPerView;
        return [bp, next];
      }));

      // Never more columns than slides, so a short carousel widens its slides
      // to fill the row. Loop needs more slides than columns, so it is decided
      // per width: off where every slide is on screen, on where the row scrolls.
      const slideCount = el.querySelectorAll(':scope > .swiper-wrapper > .swiper-slide').length;
      const capColumns = (n) => (typeof n === 'number' && n > slideCount ? slideCount : n);
      const canLoop    = (n) => opts.loop && (typeof n !== 'number' || slideCount > n);
      opts.slidesPerView = capColumns(opts.slidesPerView);
      breakpoints = Object.fromEntries(Object.entries(breakpoints).map(([bp, set]) => {
        const columns = capColumns(set.slidesPerView);
        return [bp, { ...set, slidesPerView: columns, loop: canLoop(columns) }];
      }));

      hideDisabledUI(root, opts);

      const swiper = new Swiper(el, {
        direction:      base.direction,
        loop:           opts.loop,
        speed:          prefersReducedMotion() ? 0 : opts.speed,
        watchOverflow:  true,                                    // no arrows or loop when the slides fit
        keyboard:       { enabled: true, onlyInViewport: true },
        slidesPerView:  opts.slidesPerView,
        centeredSlides: opts.centeredSlides,
        spaceBetween:   typeof opts.gutter === 'number' ? opts.gutter : 0,
        breakpoints,
        pagination: (opts.pagination && paginationEl) ? { el: paginationEl, clickable: true } : false,
        navigation: (opts.navigation && nextEl && prevEl) ? { nextEl, prevEl } : false,
        // No autoplay under reduced motion: at speed 0 it would jump a slide
        // every few seconds.
        autoplay: (opts.autoplay && !prefersReducedMotion())
          ? { delay: opts.autoplay.delay || 3000, disableOnInteraction: opts.autoplay.disableOnInteraction ?? false, pauseOnMouseEnter: opts.autoplay.pauseOnMouseEnter ?? true }
          : false,
        on: {
          // When a resize turns loop back on, Swiper leaves the arrows marked
          // aria-disabled with tabindex -1. Restore them once its own handlers
          // have run, so the keyboard and screen readers can use them again.
          breakpoint(s) {
            setTimeout(() => {
              if (!s.params.loop || s.isLocked || s.destroyed) return;
              [nextEl, prevEl].forEach((btn) => {
                if (!btn) return;
                btn.removeAttribute('aria-disabled');
                btn.setAttribute('tabindex', '0');
              });
            });
          },
        },
      });

      instances.push(swiper);
    });

    return instances;
  }


  /* =============== Info Over Hover (Carousel) =============== */
  // Bound from 992px up and torn down below it: on a touch screen a hover
  // effect fires on tap and then sticks.
  function initInfoOverHover(config = {}) {
    const cfg = { ...INFO_OVER_HOVER, ...config };

    const wrappers = document.querySelectorAll(cfg.selector);
    if (!wrappers.length) return;

    const cleanups = [];
    const mql = window.matchMedia(`(min-width: ${screenBreakpoint}px)`);

    function setup() {
      wrappers.forEach(wrapper => {
        const overlay = wrapper.querySelector('.cel-info-over');
        const inner   = wrapper.querySelector('.cel-info-over-inner');
        const img     = wrapper.querySelector('img');
        if (!overlay || !inner || !img) return;

        const children = inner.children;

        // Initial states
        const scaleInit = cfg.overlayScale ? { scale: cfg.overlayScaleFrom, transformOrigin: 'bottom center' } : {};
        gsap.set(overlay, { opacity: 0, y: cfg.overlayY, ...scaleInit });
        gsap.set(img, { scale: 1 });
        gsap.set(children, { y: cfg.contentY, opacity: 0 });

        let tl;

        const onEnter = () => {
          if (tl) tl.kill();
          tl = gsap.timeline();

          tl.to(img, {
            scale: cfg.imgScale,
            duration: motionDur(cfg.imgDuration),
            ease: cfg.imgEase,
          }, 0);

          tl.to(overlay, {
            opacity: 1,
            y: 0,
            ...(cfg.overlayScale ? { scale: 1 } : {}),
            duration: motionDur(cfg.overlayDuration),
            ease: cfg.overlayEase,
          }, 0);

          tl.to(children, {
            y: 0,
            opacity: 1,
            duration: motionDur(cfg.contentDuration),
            stagger: motionDur(cfg.contentStagger),
            ease: cfg.contentEase,
          }, 0.1);
        };

        const onLeave = () => {
          if (tl) tl.kill();
          const speed = cfg.leaveSpeed;
          tl = gsap.timeline();

          tl.to(children, {
            y: 30,
            opacity: 0,
            duration: motionDur(cfg.contentDuration * speed),
            stagger: motionDur(0.04),
            ease: 'power2.in',
          }, 0);

          tl.to(overlay, {
            opacity: 0,
            y: cfg.overlayY,
            ...(cfg.overlayScale ? { scale: cfg.overlayScaleFrom } : {}),
            duration: motionDur(cfg.overlayDuration * speed),
            ease: 'power3.inOut',
          }, 0.05);

          tl.to(img, {
            scale: 1,
            duration: motionDur(cfg.imgDuration * speed),
            ease: 'power2.out',
          }, 0);
        };

        wrapper.addEventListener('mouseenter', onEnter);
        wrapper.addEventListener('mouseleave', onLeave);

        cleanups.push(() => {
          if (tl) tl.kill();
          wrapper.removeEventListener('mouseenter', onEnter);
          wrapper.removeEventListener('mouseleave', onLeave);
          gsap.set(overlay, { clearProps: 'all' });
          gsap.set(img, { clearProps: 'all' });
          gsap.set(children, { clearProps: 'all' });
        });
      });
    }

    function teardown() {
      cleanups.forEach(fn => fn());
      cleanups.length = 0;
    }

    function onChange(e) {
      if (e.matches) {
        setup();
      } else {
        teardown();
      }
    }

    mql.addEventListener('change', onChange);
    if (mql.matches) setup();
  }


  /* =============== Carousel ↔ Overlay Sync =============== */
  // A carousel marked data-cel-overlay-sync="<overlay id>" follows that
  // overlay's items. It lives here, next to Swiper, so overlay-nav.js never
  // has to know which carousel library the page uses: it only fires an event.
  function initOverlayCarouselSync() {
    const roots = document.querySelectorAll('[data-cel-overlay-sync]');
    if (!roots.length) return;

    document.addEventListener('cel:overlay-nav', (e) => {
      // Only while the overlay is open. Opening an item from the strip needs
      // no move, and without this check the click that ends a drag would snap
      // the strip to the grabbed slide.
      if (!e.target.classList || !e.target.classList.contains('is-visible')) return;

      roots.forEach((root) => {
        if (root.dataset.celOverlaySync !== e.detail.id) return;
        const el = root.querySelector('.swiper');
        if (!el || !el.swiper) return;

        // Speed 0: the strip is behind the panel. slideToLoop, because with
        // loop on a raw index can land on a duplicate slide.
        el.swiper.slideToLoop(e.detail.index, 0);
      });
    });
  }


  /* =============== Overlay height = everything below the header =============== */
  // The overlay stops at the bottom of the site header, so the band above it
  // is the header itself. Measured, so it follows the font size and a wrapped nav.
  function initHeaderHeight() {
    const header = document.querySelector('.cel-site-header');
    if (!header) return;
    const set = () => document.documentElement.style.setProperty('--cel-header-h', `${header.offsetHeight}px`);
    set();
    if ('ResizeObserver' in window) new ResizeObserver(set).observe(header);
  }


  /* =============== Bootstrap =============== */
  // Settings go here: initCarouselSwiper({ … }), initInfoOverHover({ … }),
  // celOverlay.init({ … }) and celOverlayNav.init({ … }) each take an object
  // that overrides their defaults.
  document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) lucide.createIcons();
    initCarouselSwiper();
    initInfoOverHover();
    initHeaderHeight();
    // 10% is the fallback for a page without the header.
    if (window.celOverlay) celOverlay.init({ fill: 'calc(100% - var(--cel-header-h, 10%))' });
    if (window.celOverlayNav) celOverlayNav.init();
    initOverlayCarouselSync();
  });
})();
