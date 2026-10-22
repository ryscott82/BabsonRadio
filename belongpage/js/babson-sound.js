/* ==========================================================================
   BABSON SOUND - sitewide script (load on every page, `defer`)
   - Scroll-reveal, count-up stats, cursor spotlight on cards
   - Launch countdown: any element with data-br-countdown="2026-10-30T10:00:00-04:00"
   It never edits the markup Campus Groups fills in. Stats are only read and
   re-displayed, and the final value is always restored.
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  document.documentElement.classList.add('br-js');

  /* ---------- Scroll reveal --------------------------------------------- */
  function initReveal() {
    var sel = 'section h2, .mailer-section-icons .text-block, .wrapper-events--featured .feature, .cg_dynamic_msg,' +
              ' .feature-3, [class*="section-cont__content-officers--"] > div, .br-actions';
    var els = $$(sel);
    if (!els.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) return;      // stay visible
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (el, i) {
      el.classList.add('br-reveal');
      el.style.setProperty('--br-delay', ((i % 6) * 0.06) + 's');
      io.observe(el);
    });
    setTimeout(function () { els.forEach(function (el) { el.classList.add('in'); }); }, 4000);   // safety net
  }

  /* ---------- Count-up stats (reads the plug's value, then restores it) -- */
  function initCounters() {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    var nums = $$('[class*="section-cont__content-quick_facts_"]');
    if (!nums.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var el = e.target, raw = el.getAttribute('data-br-final'), end = parseInt(raw.replace(/[^\d]/g, ''), 10);
        if (isNaN(end) || 0 >= end || end > 100000) return;
        var t0 = null, dur = 1100;
        (function step(ts) {
          if (t0 === null) t0 = ts;
          var p = Math.min(1, (ts - t0) / dur), eased = 1 - Math.pow(1 - p, 3);
          el.textContent = 1 > p ? String(Math.round(end * eased)) : raw;   // last frame restores the original text
          if (1 > p) requestAnimationFrame(step);
        })(performance.now());
      });
    }, { threshold: 0.4 });
    nums.forEach(function (n) { n.setAttribute('data-br-final', n.textContent.trim()); io.observe(n); });
  }

  /* ---------- Cursor spotlight ------------------------------------------ */
  function initSpotlight() {
    if (reduceMotion || !window.matchMedia('(hover: hover)').matches) return;
    var cards = $$('.mailer-section-icons .text-block, .feature-3.boxed, [class*="section-cont__content-officers--"] .feature-8, .wrapper-events--featured .feature');
    cards.forEach(function (c) {
      c.classList.add('br-spot');
      c.addEventListener('pointermove', function (e) {
        var r = c.getBoundingClientRect();
        c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        c.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* ---------- Launch countdown ------------------------------------------- */
  function initCountdown() {
    var boxes = $$('[data-br-countdown]');
    if (!boxes.length) return;
    function pad(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
    function tick() {
      var allDone = true;
      boxes.forEach(function (box) {
        var t = new Date(box.getAttribute('data-br-countdown')).getTime();
        if (isNaN(t)) return;
        var left = t - Date.now();
        if (left <= 0) { box.classList.add('done'); document.documentElement.classList.add('br-launched'); return; }
        allDone = false;
        var s = Math.floor(left / 1000);
        var v = { d: pad(Math.floor(s / 86400)), h: pad(Math.floor(s % 86400 / 3600)), m: pad(Math.floor(s % 3600 / 60)), s: pad(s % 60) };
        for (var k in v) { var el = $('[data-u="' + k + '"]', box); if (el) el.textContent = v[k]; }
      });
      if (!allDone) setTimeout(tick, 1000);
    }
    tick();
  }

  function initNav() {
    var nav = $('.br-nav'), sp = $('.br-nav-spacer');
    if (!nav) return;
    // Only step aside if a Campus Groups header is actually showing; an empty or hidden one must not hide ours.
    var cg = $('.nav-container .menu-horizontal a');
    if (cg && cg.offsetParent !== null && cg.getBoundingClientRect().height > 0) {
      nav.hidden = true; if (sp) sp.style.display = 'none'; return;
    }
    function fit() { if (sp) sp.style.height = nav.offsetHeight + 'px'; }    // keep content below the fixed nav
    fit(); window.addEventListener('resize', fit); window.addEventListener('load', fit);
  }

  /* ---------- Safety net: remove a stray raw copy of this script ----------
     If the script was also pasted into a platform field that prints it as text,
     drop that text so it never shows on the page. */
  function initCleanup() {
    var kids = document.body ? document.body.childNodes : [];
    for (var i = kids.length - 1; i >= 0; i--) {
      var n = kids[i];
      var t = n.nodeType === 3 ? n.nodeValue : (n.nodeType === 1 && n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE' ? n.textContent : '');
      if (t && t.length > 1000 && t.indexOf('BABSON SOUND - sitewide script') !== -1) n.parentNode.removeChild(n);
    }
  }

  function init() { initCleanup(); initNav(); initCountdown(); initReveal(); initCounters(); initSpotlight(); }
  window.addEventListener('load', initCleanup);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
