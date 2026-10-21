/* =============================================================================
   Celestial Themes — Documentation interactions
   - Smooth scroll (Lenis), matching the site
   - Mobile sidebar dropdown toggle
   - Back-to-top button
   ============================================================================= */
(function () {
  "use strict";

  /* ---- Smooth scroll ------------------------------------------------------
     The same Lenis build and settings the website runs, so that following a
     link from the site into the documentation does not change how the page
     moves under the wheel. Lenis smooths the real window scroll rather than
     transforming a wrapper, so position: sticky, the scrollspy below, deep
     links and window.scrollY all keep working untouched.

     Off entirely under prefers-reduced-motion, where the stylesheet has already
     put scroll-behavior back to auto. */
  var lenis = null;

  if (window.Lenis && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    lenis = new window.Lenis({
      lerp: 0.1,             /* interpolation factor — lower is smoother, slower to catch up */
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: false       /* native touch scrolling on phones */
    });

    var raf = function (time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }

  /* One law for every programmatic glide, shared with the site: a short hop
     takes a second, a trip across the whole document takes three. Lenis's own
     default is a flat 1.2s whatever the distance, which makes a long jump feel
     hurried next to a short one. */
  function glideDuration(distance) {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var share = max > 0 ? Math.min(1, Math.abs(distance) / max) : 0;
    return 1 + share * 2;                       /* 1s → 3s */
  }

  /* GSAP's power2.out, which is what the site uses, written out: power2 is the
     cubic, so the ease-out is 1 - (1-t)³. */
  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  /* Scroll to a target the same way the site does, or natively when Lenis is
     not running. */
  function glideTo(target, offset) {
    if (!lenis) {
      if (typeof target === "number") window.scrollTo({ top: target, behavior: "smooth" });
      else target.scrollIntoView({ behavior: "smooth" });
      return;
    }
    var from = typeof target === "number" ? target : target.getBoundingClientRect().top + (offset || 0);
    lenis.scrollTo(target, {
      offset: offset || 0,
      duration: glideDuration(typeof target === "number" ? target - window.scrollY : from),
      easing: easeOut
    });
  }

  /* ---- Mobile sidebar dropdown -------------------------------------------- */
  var toggle = document.querySelector(".doc-sidebar__toggle");
  var nav = document.getElementById("doc-nav-list");

  if (nav) nav.setAttribute("data-lenis-prevent", "");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* ---- Header hamburger menu (mobile) ------------------------------------ */
  var navBtn = document.querySelector(".doc-navbtn");
  var navMenu = document.getElementById("doc-globalnav");

  if (navBtn && navMenu) {
    navBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = navMenu.classList.toggle("is-open");
      navBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function (e) {
      if (navMenu.classList.contains("is-open") &&
          !navMenu.contains(e.target) && !navBtn.contains(e.target)) {
        navMenu.classList.remove("is-open");
        navBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---- Collapsible "Notes" panels: inject the toggle arrow ---------------
     Only the DOWN icon is injected. The open state is square-chevron-up, and CSS
     gets there by rotating this one 180deg — which is not an approximation: the
     rounded square is symmetric about its centre, and Lucide's down chevron
     "m16 10-4 4-4-4" maps exactly onto its up chevron "m8 14 4-4 4 4" under that
     rotation. Same two glyphs, one element, and the change animates. */
  var summaries = document.querySelectorAll(".cel-doc-details summary");
  summaries.forEach(function (summary) {
    var icon = document.createElement("i");
    icon.setAttribute("data-lucide", "square-chevron-down");
    icon.setAttribute("aria-hidden", "true");
    icon.className = "cel-doc-details__icon";
    summary.insertBefore(icon, summary.firstChild);
  });

  /* ---- On-page contents, nested under the active sidebar link -------------
     Built from the DOM, so the ten HTML files carry no extra markup and a
     section added later appears on its own. Every <h2> in a .function-section
     already has an id — that is what the whole thing is generated from.

     It goes inside the existing sidebar rather than in a third column: the
     sidebar is already sticky and already has about 100px of width its longest
     label does not use, so this costs no layout at all. */
  var activeLink = document.querySelector(".doc-sidebar__nav a.is-active");

  if (activeLink) {
    var headings = document.querySelectorAll(".function-section > h2[id]");

    if (headings.length > 1) {
      var toc = document.createElement("ul");
      toc.className = "doc-toc";

      headings.forEach(function (h) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = "#" + h.id;
        // textContent, not innerHTML: a heading may hold a <code> chip, and the
        // contents list wants the words, not the chip.
        a.textContent = h.textContent.trim();
        a.dataset.tocTarget = h.id;
        li.appendChild(a);
        toc.appendChild(li);
      });

      activeLink.parentNode.appendChild(toc);

      /* Scrollspy.

         This measures positions directly instead of using IntersectionObserver,
         and the reason is a bug the observer version could not be talked out of.
         An observer reports two different things against two different edges:
         isIntersecting is measured against the root margin box (inset 80px from
         the top), while boundingClientRect is measured against the real
         viewport. Combining them left a dead band between 0 and 80px where a
         heading was neither intersecting nor "above" — and clicking a contents
         link parks the heading at exactly top: 0, right inside it. The clicked
         section stayed dark and the one before it kept the highlight, which is
         precisely the off-by-one that showed up on the last item.

         One line, one comparison, no second frame of reference. The current
         section is the LAST heading to have passed the line — correct when
         several are on screen at once. */
      var TRIGGER = 96;   /* px below the viewport top; see --toc-scroll-margin */
      var links = toc.querySelectorAll("a");
      var list = Array.prototype.slice.call(headings);

      var mark = function () {
        var current = null;

        // At the very bottom nothing can scroll any further, so the last
        // section would never reach the line. Without this, the final entry is
        // unreachable on every page whose last section is short.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
          current = list[list.length - 1].id;
        } else {
          list.forEach(function (h) {
            if (h.getBoundingClientRect().top <= TRIGGER) current = h.id;
          });
        }

        links.forEach(function (a) {
          a.classList.toggle("is-current", a.dataset.tocTarget === current);
        });
      };

      // Coalesce to one measurement per frame. Reading rects on every scroll
      // event would force layout dozens of times per second.
      var queued = false;
      var onScroll = function () {
        if (queued) return;
        queued = true;
        window.requestAnimationFrame(function () { queued = false; mark(); });
      };

      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      mark();
    }
  }

  /* ---- Copy-to-clipboard button on every code block ---------------------- */
  var codeBlocks = document.querySelectorAll(".function-section pre[class*='language-']");
  codeBlocks.forEach(function (pre) {
    var wrap = document.createElement("div");
    wrap.className = "doc-codeblock";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "doc-copybtn";
    btn.setAttribute("aria-label", "Copy code");
    btn.innerHTML =
      '<i data-lucide="copy" class="doc-copybtn__copy" aria-hidden="true"></i>' +
      '<i data-lucide="check" class="doc-copybtn__check" aria-hidden="true"></i>';
    wrap.appendChild(btn);

    btn.addEventListener("click", function () {
      var code = pre.querySelector("code");
      var text = (code ? code.textContent : pre.textContent).replace(/\n+$/, "");
      copyText(text).then(function () {
        btn.classList.add("is-copied");
        btn.setAttribute("aria-label", "Copied");
        clearTimeout(btn._t);
        btn._t = setTimeout(function () {
          btn.classList.remove("is-copied");
          btn.setAttribute("aria-label", "Copy code");
        }, 1600);
      }).catch(function () { /* clipboard unavailable — fail silently */ });
    });
  });

  /* Render every injected data-lucide placeholder into an inline SVG */
  if (window.lucide && typeof lucide.createIcons === "function") {
    lucide.createIcons();
  }

  /* ---- Back to top -------------------------------------------------------- */
  var toTop = document.querySelector(".doc-totop");

  if (toTop) {
    var onScroll = function () {
      toTop.classList.toggle("is-visible", window.scrollY > 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    toTop.addEventListener("click", function () {
      glideTo(0);
    });
  }

  /* ---- Clipboard helper: async API, with a file://-safe fallback --------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy") ? resolve() : reject(); }
      catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  /* ---- Same-page links glide through Lenis -------------------------------
     Anything that leaves the page, opens a new tab, or is a bare "#" is left to
     the browser, as are modified clicks (a ctrl-click is a request for a new
     tab, not a scroll). */
  if (lenis) {
    document.addEventListener("click", function (event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      var link = event.target.closest && event.target.closest('a[href*="#"]');
      if (!link || (link.target && link.target !== "_self")) return;

      var url = new URL(link.href, window.location.href);
      var here = window.location;
      if (url.origin !== here.origin || url.pathname !== here.pathname) return;
      if (url.search !== here.search || url.hash.length < 2) return;

      var target = null;
      try {
        target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      } catch (e) {
        return;                     /* malformed escape — leave it to the browser */
      }
      if (!target) return;

      event.preventDefault();

      /* Honour the target's own scroll-margin-top, which is what keeps a
         heading clear of the sticky header when it lands. */
      var margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      glideTo(target, -margin);

      if (here.hash !== url.hash) history.pushState(null, "", url.hash);
    });
  }
})();
