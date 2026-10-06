/* ==========================================================================
   BABSON SOUND - sitewide script (load on every page, `defer`)
   - Live radio player (play/stop, volume, On Air state, reconnect at live edge)
   - Ambient visualizer on a canvas while the stream plays
   - Optional radio schedule with a live "On Air" highlight
   - Scroll-reveal, count-up stats, cursor spotlight on cards
   It never edits the markup Campus Groups fills in. Stats are only read and
   re-displayed, and the final value is always restored.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Config: edit here ---------------------------------------- */
  var BR_CONFIG = window.BR_CONFIG || {};
  var CONFIG = {
    timezone: BR_CONFIG.timezone || 'America/New_York',
    // Leave empty to hide the schedule. Each slot:
    //   { days: [0..6] (0 = Sunday, omit for every day), start: '20:00', end: '22:00', show: 'Late Night Vibes', host: 'with DJ Name' }
    schedule: BR_CONFIG.schedule || []
  };

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  document.documentElement.classList.add('br-js');

  /* ---------- Player ---------------------------------------------------- */
  function initPlayer() {
    var box = $('#br-player');
    if (!box || box.__brInit || !window.__brStream) return;
    box.__brInit = true;
    var a = $('#br-aud', box), btn = $('#br-play', box), st = $('#br-status', box),
        vol = $('#br-vol', box), air = $('#br-air', box), canvas = $('.br-viz', box);
    var url = window.__brStream;
    var state = 'idle';

    box.classList.add('js');
    a.removeAttribute('controls'); a.removeAttribute('src'); a.preload = 'none';

    function set(s, msg) {
      state = s;
      box.classList.toggle('playing', s === 'playing');
      box.classList.toggle('buffering', s === 'buffering');
      if (air) air.hidden = s !== 'playing';
      var na = $('#br-nav-air'); if (na) na.hidden = s !== 'playing';
      btn.setAttribute('aria-label', s === 'playing' ? 'Stop live stream' : 'Play live stream');
      st.textContent = msg || (s === 'buffering' ? 'Connecting to the stream...' : '');
      if (s === 'playing') viz.start(); else viz.stop();
    }

    btn.addEventListener('click', function () {
      if (state !== 'idle') {                       // stop: drop the connection so replay joins live
        a.pause(); a.removeAttribute('src'); a.load(); set('idle'); return;
      }
      set('buffering');
      a.src = url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
      var p = a.play();
      if (p && p.catch) p.catch(function () { set('idle', 'Could not start the stream. Try again in a moment.'); });
    });
    a.addEventListener('playing', function () { set('playing'); });
    a.addEventListener('waiting', function () { set('buffering'); });
    a.addEventListener('error', function () {
      if (a.getAttribute('src')) set('idle', 'Stream unavailable right now. Please try again shortly.');
    });
    if (vol) vol.addEventListener('input', function () { a.volume = +vol.value; });

    if ('mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Live Stream', artist: 'Babson Radio . Babson Sound' });
      navigator.mediaSession.setActionHandler('play', function () { if (state === 'idle') btn.click(); });
      navigator.mediaSession.setActionHandler('pause', function () { if (state !== 'idle') btn.click(); });
    }

    /* Ambient visualizer. Decorative: the stream is cross-origin, so we don't
       tap its audio (that would mute it without CORS headers). */
    var viz = (function () {
      if (!canvas || !canvas.getContext) return { start: function () {}, stop: function () {} };
      var ctx = canvas.getContext('2d'), raf = 0, t = 0, bars = 48;
      function size() {
        var r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(r.width * d)); canvas.height = Math.max(1, Math.round(r.height * d));
      }
      function frame() {
        t += 0.035;
        var w = canvas.width, h = canvas.height, bw = w / bars;
        ctx.clearRect(0, 0, w, h);
        var g = ctx.createLinearGradient(0, h, 0, 0);
        g.addColorStop(0, 'rgba(0,102,68,.95)'); g.addColorStop(1, 'rgba(46,196,141,.95)');
        ctx.fillStyle = g;
        for (var i = 0; bars > i; i++) {
          var n = Math.sin(t * 1.7 + i * 0.55) * 0.5 + Math.sin(t * 0.9 + i * 1.3) * 0.3 + Math.sin(t * 2.6 + i * 0.21) * 0.2;
          var v = 0.18 + 0.82 * Math.pow((n + 1) / 2, 1.6);
          var bh = Math.max(3, v * h);
          var x = i * bw + bw * 0.2, y = h - bh, rw = bw * 0.6, r = Math.min(rw / 2, 3);
          ctx.beginPath();
          ctx.moveTo(x, h); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.lineTo(x + rw - r, y); ctx.quadraticCurveTo(x + rw, y, x + rw, y + r); ctx.lineTo(x + rw, h);
          ctx.closePath(); ctx.fill();
        }
        raf = requestAnimationFrame(frame);
      }
      return {
        start: function () { if (reduceMotion || raf) return; size(); raf = requestAnimationFrame(frame); },
        stop: function () { cancelAnimationFrame(raf); raf = 0; ctx.clearRect(0, 0, canvas.width, canvas.height); }
      };
    })();
  }


  /* ---------- Password gate (stream address is stored encrypted) ---------
     Soft gate: keeps the stream out of view-source and away from casual visitors until launch.
     It is not server-side security. To change the password or stream, run tools/encrypt-stream.mjs. */
  var VAULT = { i: 250000, s: 'GSLzbhdo0sZcIgeUf5NyFw==', v: 'i+RU5K8TpjGbOtMI', c: 'bZoz5lZ8OA3orV4bSknloVmcBVlqfM2kqta2w6fblN+76g8YEP3A8UZp8DJMZRlyfQh0cYnHh/gfyVU=' };
  function b64(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; b.length > i; i++) a[i] = b.charCodeAt(i); return a; }
  function decryptStream(pw) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']).then(function (km) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(VAULT.s), iterations: VAULT.i, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    }).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(VAULT.v) }, key, b64(VAULT.c));
    }).then(function (pt) { return new TextDecoder().decode(pt); });
  }
  function initGate() {
    var form = $('#br-gate'), lock = $('#br-lock'), area = $('#br-unlocked');
    if (!area) return;
    var msg = $('#br-gate-msg'), pw = $('#br-pw');
    function open(url) {
      window.__brStream = url;
      area.hidden = false;
      var wrap = $('.br-gate-wrap'); if (wrap) wrap.hidden = true;
      initPlayer(); initSchedule();
    }
    try { sessionStorage.removeItem('br-stream'); } catch (e) {} /* unlock is memory-only: never stored, gone on refresh */
    if (lock) lock.addEventListener('click', function () {
      form.hidden = !form.hidden; lock.setAttribute('aria-expanded', String(!form.hidden));
      if (!form.hidden) (form.querySelector('input') || pw).focus();
    });
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!window.crypto || !crypto.subtle) { msg.textContent = 'Unlocking needs a secure (https) page.'; return; }
      var emv = $('#br-em');
      if (emv && emv.value.trim() !== '') { msg.textContent = 'Incorrect password.'; pw.select(); return; } // decoy: any email means no access
      msg.textContent = 'Checking...';
      decryptStream(pw.value.trim()).then(function (url) {
        pw.value = ''; var em = $('#br-em'); if (em) em.value = ''; msg.textContent = ''; open(url);
      }).catch(function () {
        msg.textContent = 'Incorrect password.'; pw.select();
      });
    });
  }

  /* ---------- Schedule -------------------------------------------------- */
  function initSchedule() {
    var host = $('#br-schedule');
    if (!host) return;
    var slots = CONFIG.schedule;
    if (!slots.length) { host.hidden = true; return; }
    var list = $('.br-sched', host);

    function nowParts() {
      var f = new Intl.DateTimeFormat('en-US', { timeZone: CONFIG.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
      var o = {}; f.formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
      var day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday);
      return { day: day, min: (+o.hour % 24) * 60 + (+o.minute) };
    }
    function mins(s) { var p = s.split(':'); return (+p[0]) * 60 + (+p[1]); }
    function label(s) { var m = mins(s), h = Math.floor(m / 60), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + ('0' + (m % 60)).slice(-2) + ' ' + ap; }
    function isLive(s, n) {
      if (s.days && s.days.indexOf(n.day) === -1) return false;
      var a = mins(s.start), b = mins(s.end);
      return b >= a ? (n.min >= a && b > n.min) : (n.min >= a || b > n.min);   // supports overnight slots
    }
    function render() {
      var n = nowParts();
      var today = slots.filter(function (s) { return !s.days || s.days.indexOf(n.day) >= 0; })
                       .sort(function (x, y) { return mins(x.start) - mins(y.start); });
      list.textContent = '';
      today.forEach(function (s) {
        var live = isLive(s, n), row = document.createElement('div');
        row.className = 'br-row' + (live ? ' live' : '');
        var t = document.createElement('span'); t.className = 't'; t.textContent = label(s.start);
        var dot = document.createElement('span'); dot.className = 'dot';
        var info = document.createElement('div');
        var b = document.createElement('b'); b.textContent = s.show;
        var sm = document.createElement('small'); sm.textContent = s.host || '';
        info.appendChild(b); info.appendChild(sm);
        row.appendChild(t); row.appendChild(dot); row.appendChild(info);
        if (live) { var oa = document.createElement('span'); oa.className = 'onair'; oa.textContent = 'ON AIR'; row.appendChild(oa); }
        list.appendChild(row);
      });
      host.hidden = !today.length;
      var liveNow = today.filter(function (s) { return isLive(s, n); })[0];
      var title = $('#br-player .br-title');
      if (title) title.textContent = liveNow ? liveNow.show : 'Live Stream';
      var sub = $('#br-player .br-sub');
      if (sub && liveNow && liveNow.host) sub.textContent = liveNow.host;
    }
    render(); setInterval(render, 60000);
  }

  /* ---------- Scroll reveal --------------------------------------------- */
  function initReveal() {
    var sel = 'section h2, .mailer-section-icons .text-block, .wrapper-events--featured .feature, .cg_dynamic_msg,' +
              ' .feature-3, [class*="section-cont__content-officers--"] > div, #br-player .br-hero, .br-sched, .br-actions';
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
      if (t && t.length > 1000 && t.indexOf('BR_CONFIG') !== -1 && t.indexOf('initPlayer') !== -1) n.parentNode.removeChild(n);
    }
  }

  function init() { initCleanup(); initNav(); initGate(); initPlayer(); initSchedule(); initReveal(); initCounters(); initSpotlight(); }
  window.addEventListener('load', initCleanup);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
