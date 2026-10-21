/* =============== Site Navigation =============== */
// The header menu. Below 992px .cel-nav-toggle opens the links as a panel
// under the header; a click outside or Escape closes it.
//
// An item with entries under it is a <button> followed by a list. It opens on
// click, tap and Enter; where there is a mouse, also on hover, with a short
// grace period so the pointer can travel from the button to the panel. A list
// opened by hover closes when the pointer leaves; one opened by a click stays
// until a click outside, Escape, or Tab out of it. One list is open at a time.
// Below 992px the same button expands its list in place.
//
// Markup:
//   <button class="cel-nav-toggle" aria-expanded="false" aria-controls="cel-site-menu">…</button>
//   <nav class="cel-site-nav">
//     <ul class="cel-site-menu" id="cel-site-menu">
//       <li><a class="cel-site-link" href="…">…</a></li>
//       <li class="cel-has-sub">
//         <button class="cel-site-link cel-site-parent" type="button">…</button>
//         <ul class="cel-sub-menu"> <li><a href="…">…</a></li> … </ul>
//       </li>
//     </ul>
//   </nav>
(function () {
  'use strict';

  const DEFAULTS = {
    breakpoint: 992,   // px; the menu is a row from here up (matches $grid-breakpoints lg)
    closeDelay: 150,   // ms a hover-opened list waits before closing
  };

  function init(config) {
    const cfg = { ...DEFAULTS, ...config };

    const header = document.querySelector('.cel-site-header');
    const nav = header && header.querySelector('.cel-site-nav');
    if (!nav || nav.dataset.celNavInitialized === 'true') return;
    nav.dataset.celNavInitialized = 'true';

    const desktop = window.matchMedia(`(min-width: ${cfg.breakpoint}px)`);
    const mouse = window.matchMedia('(hover: hover) and (pointer: fine)');
    const toggle = header.querySelector('.cel-nav-toggle');


    /* --- The phone panel --- */
    const panelOpen = () => nav.classList.contains('is-open');
    const setPanel = (open) => {
      if (!toggle) return;
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    if (toggle) toggle.addEventListener('click', () => setPanel(!panelOpen()));


    /* --- Dropdowns --- */
    const dropdowns = [];

    nav.querySelectorAll('.cel-has-sub').forEach((item, index) => {
      const button = item.querySelector(':scope > .cel-site-parent');
      const list = item.querySelector(':scope > .cel-sub-menu');
      if (!button || !list) return;

      list.id = list.id || `cel-sub-menu-${index + 1}`;
      button.setAttribute('aria-controls', list.id);
      button.setAttribute('aria-expanded', 'false');

      let timer = 0;
      let byHover = false;   // opened by the pointer arriving, not by a click

      const isOpen = () => item.classList.contains('is-open');
      const set = (open) => {
        clearTimeout(timer);
        if (!open) byHover = false;
        if (open) dropdowns.forEach((other) => other !== dropdown && other.set(false));
        item.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      const dropdown = { item, button, set, isOpen };
      dropdowns.push(dropdown);

      // A click on a list the hover just opened keeps it open: toggling it
      // shut under the pointer would read as broken.
      button.addEventListener('click', () => {
        if (byHover && isOpen()) {
          byHover = false;
          return;
        }
        set(!isOpen());
      });

      item.addEventListener('mouseenter', () => {
        if (!desktop.matches || !mouse.matches) return;
        if (!isOpen()) {
          set(true);
          byHover = true;
        }
        clearTimeout(timer);
      });

      item.addEventListener('mouseleave', () => {
        if (!desktop.matches || !mouse.matches || !isOpen() || !byHover) return;
        clearTimeout(timer);
        timer = setTimeout(() => set(false), cfg.closeDelay);
      });

      // Tabbing out of the list closes it.
      item.addEventListener('focusout', (e) => {
        if (isOpen() && !item.contains(e.relatedTarget)) set(false);
      });
    });

    const closeAll = () => {
      dropdowns.forEach((d) => d.set(false));
      setPanel(false);
    };


    /* --- Closing --- */
    // With the panel open, a tap outside it only closes it: a photo under the
    // panel's edge must not open its overlay as well. Capture phase, so the
    // tap is stopped before anything below sees it.
    document.addEventListener('click', (e) => {
      if (!panelOpen() || nav.contains(e.target) || (toggle && toggle.contains(e.target))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setPanel(false);
    }, true);

    document.addEventListener('click', (e) => {
      dropdowns.forEach((d) => {
        if (!d.item.contains(e.target)) d.set(false);
      });
    });

    // Escape closes the innermost thing open and hands focus back to what
    // opened it: a dropdown first, then the panel.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const open = dropdowns.find((d) => d.isOpen());
      if (open) {
        open.set(false);
        open.button.focus();
        return;
      }
      if (panelOpen()) {
        setPanel(false);
        toggle.focus();
      }
    });

    // Crossing the breakpoint starts clean, and an overlay opening takes the
    // page: nothing of the menu is left open under it.
    desktop.addEventListener('change', closeAll);
    document.addEventListener('cel:overlay-open', closeAll);
  }

  window.celNav = { init };
})();
