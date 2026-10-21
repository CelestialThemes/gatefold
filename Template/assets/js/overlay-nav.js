/* =============== Overlay Navigation =============== */
// Steps between the items inside an open overlay without the overlay closing.
// overlay.js opens one element; this script decides which item shows inside
// it, so neither needs to know about the other. The items are nested in one
// panel, rather than being separate panels, because overlay.js keeps its focus
// trap, inert state and Escape binding on that one element.
//
// Markup:
//   <div class="cel-overlay" data-cel-overlay-id="portfolio">
//     <div class="cel-overlay-item" data-cel-overlay-item="portfolio-1"> … </div>
//     …
//   </div>
//   <button class="cel-overlay-trigger"
//           data-cel-overlay-id="portfolio"
//           data-cel-overlay-item="portfolio-3">…</button>
//
// Anything that follows the active item listens for:
//
//   cel:overlay-nav   dispatched on the overlay, detail { id, index, item }
(function () {
  'use strict';

  const DEFAULTS = {
    loop: true,           // past the last item, back to the first
    duration: 0.5,
    ease: 'power1.inOut', // near linear: a dissolve reads best at an even rate
    imageScale: 1.06,     // the arriving image settles from this; 1 = no movement
    keyboard: true,       // ← and → while the overlay is open
  };

  // Under reduced motion the durations collapse to 0; the end state is the same.
  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionDur = (d) => (prefersReducedMotion() ? 0 : d);

  let groups = [];
  let bound = false;


  /* =============== Lookup =============== */
  const groupById = (id) => groups.find((g) => g.id === id) || null;

  const indexOfItem = (group, itemId) =>
    group.items.findIndex((el) => el.getAttribute('data-cel-overlay-item') === itemId);

  // The overlay on screen: overlay.js keeps .is-visible on it while it is out.
  const openGroup = () => groups.find((g) => g.root.classList.contains('is-visible')) || null;


  /* =============== Activation =============== */
  // direction: 1 forward, -1 back, 0 a jump (a trigger click, or init) — a
  // jump is instant, since nothing is on screen yet.
  function activate(group, next, direction) {
    const items = group.items;
    const count = items.length;
    if (!count) return;

    if (group.config.loop) next = ((next % count) + count) % count;
    else next = Math.min(count - 1, Math.max(0, next));
    if (next === group.index) return;

    const from = group.index >= 0 ? items[group.index] : null;
    const to = items[next];
    group.index = next;

    // Where focus goes next is read before anything turns inert: making an
    // ancestor of the focused element inert blurs it.
    let focusSelector = null;
    if (from && from.contains(document.activeElement)) {
      const active = document.activeElement;
      focusSelector =
        active.classList.contains('cel-overlay-next') ? '.cel-overlay-next' :
        active.classList.contains('cel-overlay-prev') ? '.cel-overlay-prev' :
        '.cel-overlay-close';
    }

    // Hidden items are still laid out, so inert is what takes them out of the
    // tab order and the accessibility tree — immediately, before the fade.
    items.forEach((el) => {
      if (el === to) el.removeAttribute('inert');
      else el.setAttribute('inert', '');
    });

    if (focusSelector) {
      const target = to.querySelector(focusSelector) || to.querySelector('.cel-overlay-close');
      if (target) target.focus();
    }

    // Each item opens at the top. Both scrollers are reset, because which one
    // scrolls depends on the breakpoint.
    to.scrollTop = 0;
    const scroller = to.querySelector('.cel-overlay-scroll');
    if (scroller) scroller.scrollTop = 0;

    // The dialog's accessible name follows the item on show.
    const labelledby = to.getAttribute('aria-labelledby');
    if (labelledby) group.root.setAttribute('aria-labelledby', labelledby);
    else group.root.removeAttribute('aria-labelledby');

    /* --- motion --- */
    // A one-sided dissolve: only the arriving item fades in, over a departing
    // item that stays opaque and still. Nothing ever shows through, and
    // nothing moves sideways.
    const config = group.config;
    const d = direction === 0 ? 0 : motionDur(config.duration);
    const image = to.querySelector('.cel-overlay-media img');

    gsap.killTweensOf(items);
    items.forEach((el) => {
      const img = el.querySelector('.cel-overlay-media img');
      if (img) gsap.killTweensOf(img);
    });

    // Park every item not taking part, which also clears one left mid-fade
    // by rapid clicking.
    items.forEach((el) => {
      if (el === from || el === to) return;
      gsap.set(el, { autoAlpha: 0, zIndex: 0 });
      const img = el.querySelector('.cel-overlay-media img');
      if (img) gsap.set(img, { scale: 1 });
    });

    // Explicit stacking: source order would put the arriving item underneath
    // when stepping back.
    if (from) gsap.set(from, { autoAlpha: 1, zIndex: 1 });
    gsap.set(to, { zIndex: 2 });

    if (!from || direction === 0) {
      gsap.set(to, { autoAlpha: 1 });
      if (image) gsap.set(image, { scale: 1 });
      if (from) gsap.set(from, { autoAlpha: 0 });
      dispatch(group, next, to);
      return;
    }

    // autoAlpha sets visibility too, so a hidden item does not catch clicks.
    gsap.fromTo(to,
      { autoAlpha: 0 },
      {
        autoAlpha: 1,
        duration: d,
        ease: config.ease,
        // Hidden only once fully covered, so the layer below stays solid.
        onComplete: () => gsap.set(from, { autoAlpha: 0 }),
      }
    );

    // The image settles for longer than the dissolve, so the step lands once.
    if (image && config.imageScale !== 1) {
      gsap.fromTo(image,
        { scale: config.imageScale },
        { scale: 1, duration: d * 1.8, ease: 'power2.out' }
      );
    }

    dispatch(group, next, to);
  }

  function dispatch(group, index, item) {
    group.root.dispatchEvent(new CustomEvent('cel:overlay-nav', {
      bubbles: true,
      detail: {
        id: group.id,
        index,
        item: item.getAttribute('data-cel-overlay-item'),
      },
    }));
  }

  function step(group, direction) {
    if (!group) return;
    activate(group, group.index + direction, direction);
  }


  /* =============== Keyboard =============== */
  // Bound on cel:overlay-open, unbound on cel:overlay-close.
  function handleKey(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    const group = openGroup();
    if (!group || !group.config.keyboard) return;

    e.preventDefault();
    step(group, e.key === 'ArrowRight' ? 1 : -1);
  }


  /* =============== Init =============== */
  function init(config) {
    const settings = config || {};
    groups = [];

    document.querySelectorAll('.cel-overlay').forEach((root) => {
      const items = [...root.children].filter((el) => el.classList.contains('cel-overlay-item'));
      if (items.length < 2) return;   // nothing to step between

      const group = {
        root,
        id: root.getAttribute('data-cel-overlay-id'),
        items,
        index: -1,
        config: { ...DEFAULTS, ...settings },
      };
      groups.push(group);

      // One delegated listener per overlay, for every item's prev/next.
      if (root.dataset.celOverlayNavInitialized !== 'true') {
        root.addEventListener('click', (e) => {
          const btn = e.target.closest && e.target.closest('.cel-overlay-prev, .cel-overlay-next');
          if (!btn || !root.contains(btn)) return;
          step(groupById(root.getAttribute('data-cel-overlay-id')),
               btn.classList.contains('cel-overlay-next') ? 1 : -1);
        });
        root.dataset.celOverlayNavInitialized = 'true';
      }

      // One item shown, the rest inert, before the overlay is ever seen.
      activate(group, 0, 0);
    });

    if (!groups.length || bound) return;
    bound = true;   // init can run again; these listeners are global

    document.addEventListener('cel:overlay-open', () => {
      document.addEventListener('keydown', handleKey);
    });

    document.addEventListener('cel:overlay-close', () => {
      document.removeEventListener('keydown', handleKey);
    });

    // Capture phase, ahead of overlay.js's trigger handler, so the right item
    // is in place before the panel starts to open.
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest && e.target.closest('.cel-overlay-trigger[data-cel-overlay-item]');
      if (!trigger) return;

      const group = groupById(trigger.getAttribute('data-cel-overlay-id'));
      if (!group) return;

      const index = indexOfItem(group, trigger.getAttribute('data-cel-overlay-item'));
      if (index >= 0) activate(group, index, 0);
    }, true);
  }


  /* =============== Public API =============== */
  const resolve = (id) => (id ? groupById(id) : (openGroup() || groups[0] || null));

  window.celOverlayNav = {
    init,
    next: (id) => step(resolve(id), 1),
    prev: (id) => step(resolve(id), -1),
    to: (itemId, id) => {
      const g = resolve(id);
      if (!g) return;
      const i = indexOfItem(g, itemId);
      if (i >= 0) activate(g, i, 0);
    },
  };
})();
