/* motion.js — page entrance stagger + KPI count-up (CSS does the rest; see motion.css) */
(function () {
  const M = (PM.motion = {});
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Re-trigger the staggered entrance on a freshly routed view */
  M.enter = function (el) {
    el.classList.remove('view-enter');
    void el.offsetWidth; // restart the CSS fade
    el.classList.add('view-enter');
    clearTimeout(M._t);
    // drop the class afterwards so in-page re-renders (filters, search) don't replay it
    M._t = setTimeout(() => el.classList.remove('view-enter'), 300);
  };

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
