/* motion.js — page entrance stagger + KPI count-up (CSS does the rest; see motion.css) */
(function () {
  const M = (PM.motion = {});
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Re-trigger the staggered entrance on a freshly routed view */
  M.enter = function (el) {
    Array.from(el.children).forEach((c, i) => c.style.setProperty('--i', Math.min(i, 10)));
    el.classList.remove('view-enter');
    void el.offsetWidth; // restart CSS animations
    el.classList.add('view-enter');
    clearTimeout(M._t);
    // drop the class afterwards so in-page re-renders (filters, search) don't replay the whole entrance
    M._t = setTimeout(() => el.classList.remove('view-enter'), 1600);
    const title = document.getElementById('page-title');
    if (title) { title.classList.remove('title-enter'); void title.offsetWidth; title.classList.add('title-enter'); }
  };

  /* Count numbers up from 0, keeping prefix/suffix and formatting (฿, %, commas, decimals) */
  M.countUp = function (root, selector) {
    if (reduced()) return;
    root.querySelectorAll(selector || '.tile-value, .flow-step .big').forEach((el, idx) => {
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
      const dur = 900, delay = Math.min(idx, 8) * 40;
      let t0 = null;
      node.nodeValue = fmt(0);
      const tick = (now) => {
        if (!node.isConnected) return;
        if (t0 == null) t0 = now + delay;
        const p = Math.max(0, Math.min(1, (now - t0) / dur));
        const e = 1 - Math.pow(1 - p, 3);
        node.nodeValue = p >= 1 ? final : fmt(target * e);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };
})();
