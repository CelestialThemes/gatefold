/* =============== Overlay =============== */
// A panel that slides in from the top or bottom edge and behaves as a modal
// dialog while it is open: the rest of the page goes inert, focus is trapped,
// Escape and an outside click close it, and the page underneath cannot scroll.
//
// It knows nothing about what it contains. Anything that needs to react
// listens for its events:
//
//   cel:overlay-open   / cel:overlay-close     dispatched on the overlay element
//
// Markup:
//   <button class="cel-overlay-trigger" data-cel-overlay-id="detail">…</button>
//   <div class="cel-overlay" data-cel-overlay-id="detail"> … </div>
(function () {
  'use strict';

  const DEFAULTS = {
    direction: 'bottom',      // 'bottom' | 'top'
    fill: '90%',              // height on desktop; CSS forces 100% below lg
    duration: 0.6,
    ease: 'power3.out',
    closeDuration: 0.45,
    closeEase: 'power2.in',
    closeOnEscape: true,
    closeOnOutsideClick: true,
    lockScroll: true,
    trapFocus: true,
  };

  // Under reduced motion the durations collapse to 0 rather than the tweens
  // being skipped, so their onComplete callbacks still run.
  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionDur = (d) => (prefersReducedMotion() ? 0 : d);

  let current = null;   // { element, config, inerted, isClosing, handlers }
  let settings = {};


  /* =============== Scroll lock =============== */
  // Counted, so an overlapping close cannot unlock a page that is still locked.
  let lockCount = 0;

  function lockScroll() {
    lockCount++;
    if (lockCount > 1) return;

    // Hiding the scrollbar shifts the page sideways by its width; give that
    // width back as padding. Overlay scrollbars (macOS, iOS) measure 0.
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`;
  }

  function unlockScroll() {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount > 0) return;
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }


  /* =============== Inert background =============== */
  // Marks every sibling on the way from the overlay up to <body> inert, and
  // returns exactly what it marked, so closing reverts only those.
  function applyInert(overlay) {
    if (!('inert' in HTMLElement.prototype)) return [];

    const inerted = [];
    let node = overlay;
    while (node && node !== document.body) {
      const parent = node.parentElement;
      if (!parent) break;
      for (const sibling of parent.children) {
        if (sibling === node) continue;
        if (sibling.hasAttribute('inert')) continue;
        sibling.setAttribute('inert', '');
        inerted.push(sibling);
      }
      node = parent;
    }
    return inerted;
  }

  function clearInert(list) {
    (list || []).forEach((el) => el.removeAttribute('inert'));
  }


  /* =============== Focus trap =============== */
  function trapFocus(element) {
    // Rebuilt on every Tab, so content shown or hidden after opening is
    // followed. Inert elements are still laid out but cannot take focus, so
    // they are excluded explicitly.
    const getFocusables = () =>
      [...element.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.offsetParent !== null && !el.closest('[inert]'));

    if (!getFocusables().length) return null;

    // The panel itself takes focus, so a screen reader announces the dialog
    // and no focus ring appears on its first control after a mouse click.
    element.setAttribute('tabindex', '-1');
    element.focus();

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      const f = getFocusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === element)) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && active === last) {
        first.focus();
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleTab);
    return handleTab;
  }


  /* =============== Motion =============== */
  // Only the transform is animated; the height lives in CSS.
  function states(direction) {
    const offset = direction === 'top' ? '-100%' : '100%';
    return { from: { y: offset }, to: { y: '0%' }, exit: { y: offset } };
  }

  const panelFor = (id) => document.querySelector(`.cel-overlay[data-cel-overlay-id="${id}"]`);
  const triggersFor = (id) => document.querySelectorAll(`.cel-overlay-trigger[data-cel-overlay-id="${id}"]`);


  /* =============== Open / close =============== */
  function open(id, customConfig) {
    const el = panelFor(id);
    if (!el) return;

    // Re-opened while closing: reverse the exit. The lock and handlers are
    // still live, so nothing is bound twice.
    if (current && current.element === el && current.isClosing) {
      current.isClosing = false;
      gsap.killTweensOf(el);
      gsap.to(el, {
        y: '0%',
        duration: motionDur(current.config.duration),
        ease: current.config.ease,
      });
      return;
    }

    if (current) {
      if (current.element === el) return;   // already open
      close(current.element.getAttribute('data-cel-overlay-id'));
    }

    const config = { ...DEFAULTS, ...settings, ...customConfig };
    const fx = states(config.direction);

    el._previousActiveElement = document.activeElement;

    // Handed to CSS rather than set inline: an inline height would beat the
    // media query that makes the panel full height on small screens.
    el.setAttribute('data-cel-overlay-direction', config.direction);
    el.style.setProperty('--cel-overlay-fill', config.fill);

    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-hidden', 'false');

    const instance = { element: el, config, inerted: [], isClosing: false, handlers: {} };
    current = instance;

    if (config.lockScroll) lockScroll();
    if (config.trapFocus) instance.inerted = applyInert(el);

    triggersFor(id).forEach((t) => t.setAttribute('aria-expanded', 'true'));

    gsap.killTweensOf(el);
    el.classList.add('is-visible');
    gsap.set(el, fx.from);

    el.dispatchEvent(new CustomEvent('cel:overlay-open', { bubbles: true, detail: { id } }));

    gsap.to(el, {
      y: fx.to.y,
      duration: motionDur(config.duration),
      ease: config.ease,
      onComplete: () => {
        if (config.trapFocus) instance.handlers.tab = trapFocus(el);
      },
    });

    if (config.closeOnEscape) {
      instance.handlers.esc = (e) => {
        if (e.key === 'Escape') close(id);
      };
      document.addEventListener('keydown', instance.handlers.esc);
    }

    if (config.closeOnOutsideClick) {
      instance.handlers.outside = (e) => {
        if (!el.contains(e.target) && !e.target.closest('.cel-overlay-trigger')) close(id);
      };
      // Next frame, so the click that opened the panel does not close it.
      requestAnimationFrame(() => {
        document.addEventListener('click', instance.handlers.outside);
      });
    }
  }

  function close(id) {
    const el = panelFor(id);
    if (!el || !current || current.element !== el || current.isClosing) return;

    const instance = current;
    const config = instance.config;
    instance.isClosing = true;

    // The page behind is reachable again as soon as the exit starts.
    clearInert(instance.inerted);
    instance.inerted = [];

    if (instance.handlers.esc) document.removeEventListener('keydown', instance.handlers.esc);
    if (instance.handlers.tab) document.removeEventListener('keydown', instance.handlers.tab);
    if (instance.handlers.outside) document.removeEventListener('click', instance.handlers.outside);

    triggersFor(id).forEach((t) => t.setAttribute('aria-expanded', 'false'));

    gsap.killTweensOf(el);
    gsap.to(el, {
      y: states(config.direction).exit.y,
      duration: motionDur(config.closeDuration),
      ease: config.closeEase,
      onComplete: () => {
        el.classList.remove('is-visible');
        el.setAttribute('aria-hidden', 'true');
        el.removeAttribute('aria-modal');

        if (config.lockScroll) unlockScroll();

        if (el._previousActiveElement && el._previousActiveElement.focus) {
          el._previousActiveElement.focus();
        }

        if (current === instance) current = null;
        el.dispatchEvent(new CustomEvent('cel:overlay-close', { bubbles: true, detail: { id } }));
      },
    });
  }


  /* =============== Init =============== */
  function init(config) {
    settings = config || {};

    const overlays = document.querySelectorAll('.cel-overlay');
    if (!overlays.length) return;

    overlays.forEach((el) => {
      if (!el.classList.contains('is-visible')) el.setAttribute('aria-hidden', 'true');
    });

    document.querySelectorAll('.cel-overlay-trigger').forEach((trigger) => {
      if (!trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'false');
      if (trigger.dataset.celOverlayInitialized === 'true') return;

      trigger.addEventListener('click', (e) => {
        // Swiper cancels the click that ends a drag; that click must not open
        // the overlay.
        if (e.defaultPrevented) return;
        e.preventDefault();
        open(trigger.getAttribute('data-cel-overlay-id'));
      });

      trigger.dataset.celOverlayInitialized = 'true';
    });

    document.querySelectorAll('.cel-overlay-close').forEach((btn) => {
      if (btn.dataset.celOverlayInitialized === 'true') return;
      btn.addEventListener('click', () => {
        const panel = btn.closest('.cel-overlay');
        if (panel) close(panel.getAttribute('data-cel-overlay-id'));
      });
      btn.dataset.celOverlayInitialized = 'true';
    });
  }

  window.celOverlay = { init, open, close };
})();
