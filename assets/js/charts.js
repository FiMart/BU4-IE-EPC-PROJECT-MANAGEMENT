/* charts.js — small dependency-free SVG/HTML charts
   Colors are passed as CSS var names (e.g. 'var(--s1)') so light/dark themes swap in one place. */
(function () {
  const C = (PM.charts = {});
  const esc = (s) => PM.ui.esc(s);

  const niceStep = (max, n) => {
    const raw = max / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  };
  const scaleMax = (max, n = 4) => { const s = niceStep(max || 1, n); return { max: Math.ceil((max || 1) / s) * s, step: s }; };
  const width = (el) => Math.max(260, Math.floor(el.clientWidth || el.getBoundingClientRect().width || 600));
  const topRounded = (x, y, w, h, r) => {
    r = Math.min(r, h, w / 2);
    if (h <= 0) return '';
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  };

  C.legend = (series) =>
    series.length < 2 ? '' :
      `<div class="legend">${series.map((s) => `<span><i class="sw${s.dash ? ' dash' : ''}" style="background:${s.color};${s.dash ? `color:${s.color}` : ''}"></i>${esc(s.name)}</span>`).join('')}</div>`;

  /* Vertical columns — stacked (default) or grouped.
     opts: { categories:[label], series:[{name,color,values:[]}], stacked, height, fmt, tipTitle:[] } */
  C.columns = function (el, o) {
    const W = width(el), H = o.height || 230;
    const m = { t: 10, r: 6, b: 26, l: 46 };
    const n = o.categories.length;
    const stacked = o.stacked !== false;
    const fmt = o.fmt || ((v) => PM.ui.num(v));
    const totals = o.categories.map((_, i) => PM.sum(o.series, (s) => s.values[i] || 0));
    const raw = stacked ? Math.max(0, ...totals) : Math.max(0, ...o.series.flatMap((s) => s.values));
    const { max, step } = scaleMax(raw);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / n;
    const y = (v) => m.t + ih - (v / max) * ih;
    let g = '';
    for (let v = 0; v <= max + 1e-9; v += step) {
      g += `<line class="${v === 0 ? 'axis' : 'grid'}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
      g += `<text class="tick" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(o.axisFmt ? o.axisFmt(v) : PM.ui.num(v))}</text>`;
    }
    const every = Math.ceil(n / Math.max(1, Math.floor(iw / 44)));
    let bars = '', hits = '', labels = '';
    o.categories.forEach((cat, i) => {
      const x0 = m.l + band * i;
      bars += `<g class="bar-g" style="--d:${i}">`;
      if (stacked) {
        const bw = Math.min(34, band * 0.62);
        const bx = x0 + (band - bw) / 2;
        let acc = 0;
        const segs = o.series.map((s) => ({ s, v: s.values[i] || 0 })).filter((z) => z.v > 0);
        segs.forEach((z, k) => {
          const yTop = y(acc + z.v), yBot = y(acc);
          const gap = k > 0 ? 2 : 0; // 2px surface gap between stacked fills
          const h = yBot - yTop - gap;
          if (h > 0) {
            bars += k === segs.length - 1
              ? `<path d="${topRounded(bx, yTop, bw, h, 4)}" style="fill:${z.s.color}"/>`
              : `<rect x="${bx}" y="${yTop}" width="${bw}" height="${h}" style="fill:${z.s.color}"/>`;
          }
          acc += z.v;
        });
      } else {
        const k = o.series.length;
        const bw = Math.min(18, (band * 0.72 - (k - 1) * 2) / k);
        const gx = x0 + (band - (bw * k + (k - 1) * 2)) / 2;
        o.series.forEach((s, j) => {
          const v = s.values[i] || 0;
          bars += `<path d="${topRounded(gx + j * (bw + 2), y(v), bw, y(0) - y(v), 4)}" style="fill:${s.color}"/>`;
        });
      }
      bars += '</g>';
      const title = (o.tipTitle && o.tipTitle[i]) || cat;
      const lines = o.series.map((s) => `${s.name}: ${fmt(s.values[i] || 0)}`);
      if (stacked && o.series.length > 1) lines.push(`Total: ${fmt(totals[i])}`);
      hits += `<rect class="hit" x="${x0}" y="${m.t}" width="${band}" height="${ih}" data-tip="${esc(title + '\n' + lines.join('\n'))}"/>`;
      if (i % every === 0) labels += `<text class="tick" x="${x0 + band / 2}" y="${H - 8}" text-anchor="middle">${esc(cat)}</text>`;
    });
    el.innerHTML = C.legend(o.series) +
      `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.label || 'Column chart')}">${g}${bars}${labels}${hits}</svg>`;
  };

  /* Lines — e.g. S-curve. opts: { labels:[x], series:[{name,color,values,dash}], yMax, fmt, height, marker:index, markerLabel } */
  C.lines = function (el, o) {
    const W = width(el), H = o.height || 260;
    const m = { t: 14, r: 64, b: 26, l: 44 };
    const n = o.labels.length;
    const fmt = o.fmt || ((v) => PM.ui.num(v));
    const raw = o.yMax || Math.max(1, ...o.series.flatMap((s) => s.values.filter((v) => v != null)));
    const { max, step } = scaleMax(raw);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = (i) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => m.t + ih - (v / max) * ih;
    let g = '';
    for (let v = 0; v <= max + 1e-9; v += step) {
      g += `<line class="${v === 0 ? 'axis' : 'grid'}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
      g += `<text class="tick" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(o.axisFmt ? o.axisFmt(v) : PM.ui.num(v))}</text>`;
    }
    const every = Math.ceil(n / Math.max(1, Math.floor(iw / 56)));
    o.labels.forEach((l, i) => { if (i % every === 0) g += `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
    if (o.marker != null && o.marker >= 0) {
      g += `<line class="today" x1="${x(o.marker)}" x2="${x(o.marker)}" y1="${m.t}" y2="${m.t + ih}"/>`;
      g += `<text class="tick strong" x="${x(o.marker) + 4}" y="${m.t + 10}">${esc(o.markerLabel || 'Today')}</text>`;
    }
    let paths = '', ends = '';
    const endYs = [];
    o.series.forEach((s) => {
      let d = '', pen = false, last = -1;
      s.values.forEach((v, i) => {
        if (v == null) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; last = i;
      });
      paths += `<path class="line${s.dash ? ' dash' : ''}" d="${d}" style="stroke:${s.color}"/>`;
      if (last >= 0) {
        ends += `<circle class="end-dot" cx="${x(last)}" cy="${y(s.values[last])}" r="4" style="fill:${s.color}"/>`;
        let ly = y(s.values[last]) + 4;
        endYs.forEach((py) => { if (Math.abs(py - ly) < 13) ly = py + (ly >= py ? 13 : -13); });
        endYs.push(ly);
        ends += `<text class="end-label" x="${x(last) + 8}" y="${ly}">${esc(fmt(s.values[last]))}</text>`;
      }
    });
    let hits = '';
    const colW = n <= 1 ? iw : iw / (n - 1);
    o.labels.forEach((l, i) => {
      const lines = o.series.map((s) => `${s.name}: ${s.values[i] == null ? '–' : fmt(s.values[i])}`);
      const dots = o.series.filter((s) => s.values[i] != null).map((s) => [x(i), y(s.values[i]), s.color]);
      hits += `<rect class="hit" x="${x(i) - colW / 2}" y="${m.t}" width="${colW}" height="${ih}" data-cx="${x(i)}" data-dots='${JSON.stringify(dots)}' data-tip="${esc(((o.tipTitle && o.tipTitle[i]) || l) + '\n' + lines.join('\n'))}"/>`;
    });
    el.innerHTML = C.legend(o.series) +
      `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.label || 'Line chart')}">${g}<line class="crosshair" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" style="opacity:0"/><g class="draw">${paths}</g><g class="late">${ends}</g>${hits}</svg>`;
  };

  /* Horizontal bars (HTML). items: [{label, value, color, display, tip, target, sub}] */
  C.hbars = function (el, o) {
    const fmt = o.fmt || ((v) => PM.ui.num(v));
    const max = o.max || Math.max(1e-9, ...o.items.map((it) => Math.max(it.value || 0, it.target || 0)));
    if (!o.items.length) { el.innerHTML = '<p class="empty">ยังไม่มีข้อมูล</p>'; return; }
    el.innerHTML = `<div class="hbars">${o.items.map((it, i) => {
      const w = Math.max(0, Math.min(100, ((it.value || 0) / max) * 100));
      const t = it.target != null ? Math.min(100, (it.target / max) * 100) : null;
      const tip = it.tip || `${it.label}\n${fmt(it.value)}`;
      return `<div class="hbar" style="--d:${i}" data-tip="${esc(tip)}">
        <div class="hbar-label">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>
        <div class="hbar-track"><span style="width:${w}%;background:${it.color || 'var(--s1)'}"></span>${t != null ? `<i class="target" style="left:${t}%"></i>` : ''}</div>
        <div class="hbar-value">${esc(it.display != null ? it.display : fmt(it.value))}</div>
      </div>`;
    }).join('')}</div>`;
  };
})();
