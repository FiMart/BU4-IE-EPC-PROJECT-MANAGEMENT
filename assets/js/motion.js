/* motion.js — page entrance stagger + KPI count-up (CSS does the rest; see motion.css) */
(function () {
  const M = (PM.motion = {});
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const mobile = () => window.matchMedia && matchMedia('(max-width: 900px)').matches;

  /* Re-trigger the entrance on a freshly routed view (desktop: one fade · mobile: sections rise in turn) */
  M.enter = function (el) {
    el.classList.remove('view-enter');
    Array.from(el.children).forEach((c, i) => c.style.setProperty('--i', Math.min(i, 8)));
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('view-enter');
    clearTimeout(M._t);
    // drop the class afterwards so in-page re-renders (filters, search) don't replay it
    M._t = setTimeout(() => el.classList.remove('view-enter'), mobile() ? 800 : 300);
  };

  /* Mobile: content that starts below the fold fades up as it scrolls into view, and its charts draw then */
  const replay = (root) => root.querySelectorAll('.bar-g, .draw, .late, .pbar span, .hbar-track span').forEach((n) => {
    n.style.animation = 'none'; void n.getBoundingClientRect(); n.style.animation = '';
  });
  M.reveal = function (el) {
    if (M._io) { M._io.disconnect(); M._io = null; }
    if (reduced() || !mobile() || !('IntersectionObserver' in window)) return;
    const fold = window.innerHeight * 0.92;
    const items = [];
    Array.from(el.children).forEach((c) => {
      if (c.classList.contains('row')) return; // toolbar (may hold the floating button)
      if (c.classList.contains('grid')) Array.from(c.children).forEach((g, i) => items.push([g, (i % 2) * 70]));
      else items.push([c, 0]);
    });
    const later = items.filter(([n]) => n.getBoundingClientRect().top > fold);
    if (!later.length) return;
    M._io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      M._io && M._io.unobserve(e.target);
      replay(e.target);
      e.target.classList.add('rv-in');
    }), { rootMargin: '0px 0px -6% 0px' });
    later.forEach(([n, d]) => { n.classList.add('rv'); if (d) n.style.setProperty('--rv-d', d + 'ms'); M._io.observe(n); });
  };

  /* Tab strips wider than the screen: slide the active tab into view */
  M.centerTabs = function (el) {
    el.querySelectorAll('.tabs').forEach((t) => {
      const a = t.querySelector('a.active');
      if (!a || t.scrollWidth <= t.clientWidth) return;
      const tr = t.getBoundingClientRect(), ar = a.getBoundingClientRect();
      const left = t.scrollLeft + (ar.left + ar.width / 2) - (tr.left + tr.width / 2);
      t.scrollTo({ left, behavior: reduced() ? 'auto' : 'smooth' });
    });
  };

  /* Scroll state: .scrolled lifts the topbar, .scroll-down folds the floating "+ New" button */
  // capture: also hears the content area scrolling on phones / tablets (app shell — PM.ui.scroller)
  let lastY = 0, ticking = false;
  document.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = PM.ui.scrollY(), b = document.body;
      b.classList.toggle('scrolled', y > 4);
      if (Math.abs(y - lastY) > 8 || y < 40) { b.classList.toggle('scroll-down', y > lastY && y > 120); lastY = y; }
      ticking = false;
    });
  }, { passive: true, capture: true });

  /* drawer items slide in one after another (order index for the CSS delay) */
  document.querySelectorAll('#nav > *').forEach((n, i) => n.style.setProperty('--i', i));

  /* Count numbers up from 0, keeping prefix/suffix and formatting (฿, %, commas, decimals) */
  M.countUp = function (root, selector) {
    if (reduced()) return;
    root.querySelectorAll(selector || '.tile-value, .flow-step .big').forEach((el) => {
      const node = Array.from(el.childNodes).find((n) => n.nodeType === 3 && /\d/.test(n.nodeValue));
      if (!node) return;
      const m = node.nodeValue.match(/^([^\d-]*)(-?[\d,]*\.?\d+)([\s\S]*)$/);
      if (!m) return;
      const [, pre, numStr, post] = m;
      const target = parseFloat(numStr.replace(/,/g, ''));
      if (!isFinite(target) || target === 0) return;
      const dec = (numStr.split('.')[1] || '').length;
      const commas = numStr.includes(',');
      const fmt = (v) => pre + (commas
        ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
        : v.toFixed(dec)) + post;
      const final = node.nodeValue;
      const dur = 450; // short and all at once — readable almost immediately
      let t0 = null;
      node.nodeValue = fmt(0);
      const tick = (now) => {
        if (!node.isConnected) return;
        if (t0 == null) t0 = now;
        const p = Math.max(0, Math.min(1, (now - t0) / dur));
        const e = 1 - Math.pow(1 - p, 3);
        node.nodeValue = p >= 1 ? final : fmt(target * e);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };
})();
