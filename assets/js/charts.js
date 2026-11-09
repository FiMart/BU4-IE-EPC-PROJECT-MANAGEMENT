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
  // phones: a slightly shorter plot keeps the chart in proportion with the narrow width
  const fitH = (W, h) => (W < 440 ? Math.round(h * 0.8) : h);
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
    const W = width(el), H = fitH(W, o.height || 230);
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
    const W = width(el), H = fitH(W, o.height || 260);
    const m = { t: 14, r: 64, b: 26, l: 44 };
    const n = o.labels.length;
    const fmt = o.fmt || ((v) => PM.ui.num(v));
    const all = o.series.flatMap((s) => s.values.filter((v) => v != null));
    const raw = o.yMax || Math.max(1, ...all);
    let { max, step } = scaleMax(raw);
    // values below zero (e.g. a negative variance): a nice scale from the lowest value up, 0 drawn as the axis
    const lowRaw = Math.min(0, ...all);
    let min = 0;
    if (lowRaw < 0) {
      step = niceStep(Math.max(raw, 0) - lowRaw || 1, 5);
      min = Math.floor(lowRaw / step) * step;
      max = Math.max(step, Math.ceil(Math.max(0, ...all) / step) * step);
    }
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = (i) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => m.t + ih - ((v - min) / (max - min)) * ih;
    let g = '';
    for (let v = min; v <= max + 1e-9; v += step) {
      if (Math.abs(v) < step / 1e6) v = 0;
      g += `<line class="${v === 0 ? 'axis' : 'grid'}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
      g += `<text class="tick" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(o.axisFmt ? o.axisFmt(v) : PM.ui.num(v))}</text>`;
    }
    const every = Math.ceil(n / Math.max(1, Math.floor(iw / 56)));
    o.labels.forEach((l, i) => { if (i % every === 0) g += `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
    if (o.marker != null && o.marker >= 0) {
      g += `<line class="today" x1="${x(o.marker)}" x2="${x(o.marker)}" y1="${m.t}" y2="${m.t + ih}"/>`;
      g += `<text class="tick strong" x="${x(o.marker) + 4}" y="${m.t + 10}">${esc(o.markerLabel || 'Today')}</text>`;
    }
    // ref: { value, label } — a target the series is judged against (e.g. PPC ≥ 80%), drawn as a solid ink rule
    if (o.ref && o.ref.value != null) {
      // label at the left end, just above the rule — the right end belongs to the series' end value
      g += `<line class="ref" x1="${m.l}" x2="${W - m.r}" y1="${y(o.ref.value)}" y2="${y(o.ref.value)}"/>`;
      g += `<text class="tick strong" x="${m.l + 6}" y="${y(o.ref.value) - 6}">${esc(o.ref.label || '')}</text>`;
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

  /* Horizontal bars (HTML). items: [{label, value, color, display, tip, target, sub, href}] — href: the row is a link */
  C.hbars = function (el, o) {
    const fmt = o.fmt || ((v) => PM.ui.num(v));
    const max = o.max || Math.max(1e-9, ...o.items.map((it) => Math.max(it.value || 0, it.target || 0)));
    if (!o.items.length) { el.innerHTML = '<p class="empty">ยังไม่มีข้อมูล</p>'; return; }
    el.innerHTML = `<div class="hbars">${o.items.map((it, i) => {
      const w = Math.max(0, Math.min(100, ((it.value || 0) / max) * 100));
      const t = it.target != null ? Math.min(100, (it.target / max) * 100) : null;
      const tip = it.tip || `${it.label}\n${fmt(it.value)}`;
      return `<div class="hbar${it.href ? ' link' : ''}" style="--d:${i}" data-tip="${esc(tip)}"${it.href ? ` data-href="${esc(it.href)}"` : ''}>
        <div class="hbar-label">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>
        <div class="hbar-track"><span style="width:${w}%;background:${it.color || 'var(--s1)'}"></span>${t != null ? `<i class="target" style="left:${t}%"></i>` : ''}</div>
        <div class="hbar-value">${esc(it.display != null ? it.display : fmt(it.value))}</div>
      </div>`;
    }).join('')}</div>`;
  };

  /* Part-to-whole: one 100% bar split into segments (≤ 6) + a legend list with value and share.
     opts: { segments:[{name, color, value, display}], fmt, totalLabel } */
  C.share = function (el, o) {
    const fmt = o.fmt || ((v) => PM.ui.num(v));
    const segs = o.segments.filter((s) => (s.value || 0) > 0);
    const total = PM.sum(segs, (s) => s.value);
    if (!total) { el.innerHTML = '<p class="empty">ยังไม่มีข้อมูล</p>'; return; }
    const pct = (v) => PM.ui.pct(v / total, v / total < 0.1 ? 1 : 0);
    el.innerHTML = `<div class="share">
      <div class="share-bar" role="img" aria-label="${esc(o.label || 'Share')}">${segs.map((s) =>
        `<span style="flex-grow:${s.value};background:${s.color}" data-tip="${esc(`${s.name}\n${s.display != null ? s.display : fmt(s.value)} · ${pct(s.value)}`)}"></span>`).join('')}</div>
      <ul class="share-legend">${o.segments.map((s) => `<li><i class="sw" style="background:${s.color}"></i><span>${esc(s.name)}</span>
        <b>${esc(s.display != null ? s.display : fmt(s.value || 0))}</b><small>${(s.value || 0) > 0 ? pct(s.value) : '–'}</small></li>`).join('')}
        <li class="share-total"><span>${esc(o.totalLabel || 'รวม')}</span><b>${esc(fmt(total))}</b><small>100%</small></li></ul>
    </div>`;
  };

  /* Above / below a baseline per item (e.g. progress actual − plan): bars grow left (behind) or right (ahead)
     from a centre line. items:[{label, sub, value, display, tip}] · opts: { neg:{label,color}, pos:{label,color} } */
  C.diverging = function (el, o) {
    if (!o.items.length) { el.innerHTML = '<p class="empty">ยังไม่มีข้อมูล</p>'; return; }
    const max = o.max || Math.max(1e-9, ...o.items.map((it) => Math.abs(it.value || 0)));
    const neg = o.neg || { label: 'ต่ำกว่า', color: 'var(--s2)' }, pos = o.pos || { label: 'สูงกว่า', color: 'var(--s1)' };
    el.innerHTML = `<div class="legend"><span><i class="sw" style="background:${neg.color}"></i>${esc(neg.label)}</span><span><i class="sw" style="background:${pos.color}"></i>${esc(pos.label)}</span></div>
      <div class="hbars div-bars">${o.items.map((it, i) => {
        const v = it.value || 0, w = Math.min(50, (Math.abs(v) / max) * 50);
        return `<div class="hbar${it.href ? ' link' : ''}" style="--d:${i}" data-tip="${esc(it.tip || `${it.label}\n${it.display}`)}"${it.href ? ` data-href="${esc(it.href)}"` : ''}>
          <div class="hbar-label">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>
          <div class="hbar-track div-track"><i class="mid"></i><span class="${v < 0 ? 'neg' : 'pos'}" style="${v < 0 ? `right:50%` : `left:50%`};width:${w}%;background:${v < 0 ? neg.color : pos.color}"></span></div>
          <div class="hbar-value">${esc(it.display)}</div></div>`;
      }).join('')}</div>`;
  };

  /* Two ratios per item on one plot, each judged against 1.0 (e.g. SPI × CPI): four tinted quadrants, the 1.0 cross,
     a dot per item coloured by its status (status tokens; the name or the tooltip says it too).
     Made to stay readable with real data:
     - the axes cover ±0.5 at most: an item far outside (CPI 846 when almost no cost is booked yet) sits on the edge
       as a hollow dot with its real value written next to it, instead of squeezing everyone else into one spot
     - dots that land on top of each other become one larger dot with the count; its tooltip lists them
     - a name is written only where it has room; every dot keeps its tooltip
     - under the plot: how many items in each quadrant, and how many have no ratio yet (not drawn)
     points:[{label, x, y, level, tip, href}] · opts: { xName, yName, quads:{tl,tr,bl,br}, sums:{tl,tr,bl,br}, height, missingNote } */
  C.quadrant = function (el, o) {
    const ok = (p) => p.x != null && p.y != null && isFinite(p.x) && isFinite(p.y);
    const pts = o.points.filter(ok), missing = o.points.length - pts.length;
    const missingText = missing ? `ไม่แสดง ${missing} รายการที่ยังไม่มีค่า${o.missingNote ? ` (${o.missingNote})` : ''}` : '';
    if (!pts.length) { el.innerHTML = `<p class="empty">ยังไม่มีข้อมูล${missingText ? ` · ${esc(missingText)}` : ''}</p>`; return; }
    const W = width(el), H = fitH(W, o.height || 300);
    const m = { t: 10, r: 14, b: 42, l: 44 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    // the range: wide enough for the items near plan, never wider than ±0.5
    const dev = (v) => Math.abs(v - 1);
    const inRange = pts.map((p) => Math.max(dev(p.x), dev(p.y))).filter((d) => d <= 0.5);
    const span = Math.min(0.5, Math.max(0.1, ...(inRange.length ? inRange : [0.5])) * 1.15);
    const step = niceStep(span, 2), dec = step < 0.1 ? 2 : 1;
    const lo = 1 - Math.ceil(span / step - 1e-9) * step, hi = 1 + Math.ceil(span / step - 1e-9) * step;
    // the range sits inside the plot with a band all round: an item outside it is drawn in the band, clear of the axis numbers
    const pad = 16, clampTo = (v) => Math.max(lo - 0.0001, Math.min(hi + 0.0001, v));
    const outside = (v) => v < lo || v > hi;
    const x = (v) => (outside(v) ? (v < lo ? m.l + pad / 2 : m.l + iw - pad / 2) : m.l + pad + ((clampTo(v) - lo) / (hi - lo)) * (iw - 2 * pad));
    const y = (v) => (outside(v) ? (v < lo ? m.t + ih - pad / 2 : m.t + pad / 2) : m.t + ih - pad - ((clampTo(v) - lo) / (hi - lo)) * (ih - 2 * pad));
    const x1 = x(1), y1 = y(1);
    let g = `<rect class="qz qz-mid" x="${m.l}" y="${m.t}" width="${x1 - m.l}" height="${y1 - m.t}"/>
      <rect class="qz qz-good" x="${x1}" y="${m.t}" width="${m.l + iw - x1}" height="${y1 - m.t}"/>
      <rect class="qz qz-bad" x="${m.l}" y="${y1}" width="${x1 - m.l}" height="${m.t + ih - y1}"/>
      <rect class="qz qz-mid" x="${x1}" y="${y1}" width="${m.l + iw - x1}" height="${m.t + ih - y1}"/>`;
    for (let i = 0, v = lo; v <= hi + 1e-9 && i < 20; i++, v = lo + i * step) {
      const r = Math.round(v * 1000) / 1000;
      if (Math.abs(r - 1) > 1e-9) g += `<line class="grid" x1="${x(r)}" x2="${x(r)}" y1="${m.t}" y2="${m.t + ih}"/><line class="grid" x1="${m.l}" x2="${m.l + iw}" y1="${y(r)}" y2="${y(r)}"/>`;
      g += `<text class="tick${Math.abs(r - 1) < 1e-9 ? ' strong' : ''}" x="${x(r)}" y="${m.t + ih + 15}" text-anchor="middle">${r.toFixed(dec)}</text>`;
      g += `<text class="tick${Math.abs(r - 1) < 1e-9 ? ' strong' : ''}" x="${m.l - 6}" y="${y(r) + 4}" text-anchor="end">${r.toFixed(dec)}</text>`;
    }
    g += `<line class="ref" x1="${x1}" x2="${x1}" y1="${m.t}" y2="${m.t + ih}"/><line class="ref" x1="${m.l}" x2="${m.l + iw}" y1="${y1}" y2="${y1}"/>`;
    const q = o.quads || {};
    const narrow = iw < 360; // phones: the corner names move under the plot
    if (!narrow) { // corner names sit inside the band, clear of items drawn on the edge
      g += `<text class="quad" x="${m.l + pad + 6}" y="${m.t + pad + 14}">${esc(q.tl || '')}</text>
        <text class="quad" x="${m.l + iw - pad - 6}" y="${m.t + pad + 14}" text-anchor="end">${esc(q.tr || '')}</text>
        <text class="quad bad" x="${m.l + pad + 6}" y="${m.t + ih - pad - 6}">${esc(q.bl || '')}</text>
        <text class="quad" x="${m.l + iw - pad - 6}" y="${m.t + ih - pad - 6}" text-anchor="end">${esc(q.br || '')}</text>`;
    }
    g += `<text class="tick strong" x="${m.l + iw / 2}" y="${H - 6}" text-anchor="middle">${esc(o.xName || 'x')} →</text>`;
    g += `<text class="tick strong" transform="translate(11 ${m.t + ih / 2}) rotate(-90)" text-anchor="middle">${esc(o.yName || 'y')} →</text>`;

    // dots that would overlap become one group
    const RANK = { critical: 3, warning: 2, good: 1 };
    const groups = [];
    pts.forEach((p) => {
      const cx = x(p.x), cy = y(p.y);
      const gr = groups.find((k) => Math.hypot(k.cx - cx, k.cy - cy) < 11);
      if (gr) gr.items.push(p); else groups.push({ cx, cy, items: [p] });
    });
    const boxes = groups.map((k) => { const r = k.items.length > 1 ? 12 : 7; return { x0: k.cx - r, x1: k.cx + r, y0: k.cy - r, y1: k.cy + r }; });
    const hitsBox = (b) => boxes.some((o2) => b.x0 < o2.x1 && b.x1 > o2.x0 && b.y0 < o2.y1 && b.y1 > o2.y0);
    const fmt = (v) => (Math.abs(v) >= 10 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2));
    let dots = '', labels = '', hits = '';
    groups.forEach((k) => {
      const worst = k.items.reduce((a, p) => ((RANK[p.level] || 0) > (RANK[a] || 0) ? p.level : a), '');
      const tone = worst === 'critical' ? 'critical' : worst === 'warning' ? 'warning' : worst === 'good' ? 'good' : 'muted';
      const p0 = k.items[0], out = k.items.length === 1 && (p0.x < lo || p0.x > hi || p0.y < lo || p0.y > hi);
      if (k.items.length > 1) {
        dots += `<circle class="pt" cx="${k.cx}" cy="${k.cy}" r="11" style="fill:var(--${tone})"/><text class="pt-count" x="${k.cx}" y="${k.cy + 4}" text-anchor="middle">${k.items.length}</text>`;
      } else {
        dots += `<circle class="pt${out ? ' out' : ''}" cx="${k.cx}" cy="${k.cy}" r="6" style="${out ? `stroke:var(--${tone})` : `fill:var(--${tone})`}"/>`;
      }
      // a single item: its name (and its real value when it sits on the edge), where there is room
      if (k.items.length === 1) {
        const text = out ? `${p0.label} · ${p0.x < lo || p0.x > hi ? `${o.xShort || 'x'} ${fmt(p0.x)}` : ''}${(p0.x < lo || p0.x > hi) && (p0.y < lo || p0.y > hi) ? ' · ' : ''}${p0.y < lo || p0.y > hi ? `${o.yShort || 'y'} ${fmt(p0.y)}` : ''}` : String(p0.label);
        const tw = text.length * 6.6 + 4, cx = k.cx, cy = k.cy;
        const spot = [
          { lx: cx + 10, ly: cy + 4, anchor: 'start', b: { x0: cx + 9, x1: cx + 9 + tw, y0: cy - 7, y1: cy + 7 } },
          { lx: cx - 10, ly: cy + 4, anchor: 'end', b: { x0: cx - 9 - tw, x1: cx - 9, y0: cy - 7, y1: cy + 7 } },
          { lx: cx, ly: cy - 11, anchor: 'middle', b: { x0: cx - tw / 2, x1: cx + tw / 2, y0: cy - 22, y1: cy - 8 } },
          { lx: cx, ly: cy + 20, anchor: 'middle', b: { x0: cx - tw / 2, x1: cx + tw / 2, y0: cy + 8, y1: cy + 22 } },
        ].filter((s) => s.b.x0 >= m.l && s.b.x1 <= m.l + iw && s.b.y0 >= m.t && s.b.y1 <= m.t + ih).find((s) => !hitsBox(s.b));
        if (spot) { boxes.push(spot.b); labels += `<text class="pt-label" x="${spot.lx}" y="${spot.ly}" text-anchor="${spot.anchor}">${esc(text)}</text>`; }
      }
      const tip = k.items.length > 1 ? `${k.items.length} รายการที่ค่าใกล้กัน\n${k.items.slice(0, 12).map((p) => String(p.tip || p.label).replace(/\n/g, ' · ')).join('\n')}${k.items.length > 12 ? '\n…' : ''}` : (p0.tip || p0.label);
      const href = k.items.length === 1 && p0.href ? ` data-href="${esc(p0.href)}"` : '';
      hits += `<circle class="hit${href ? ' link' : ''}" cx="${k.cx}" cy="${k.cy}" r="${k.items.length > 1 ? 16 : 13}" data-tip="${esc(tip)}"${href}/>`;
    });

    // how many in each corner (an item on the 1.0 line counts as on plan / within budget)
    const side = (p) => (p.y >= 1 ? (p.x >= 1 ? 'tr' : 'tl') : (p.x >= 1 ? 'br' : 'bl'));
    const n = { tl: 0, tr: 0, bl: 0, br: 0 };
    pts.forEach((p) => { n[side(p)]++; });
    const sums = o.sums || q;
    const chip = (k, cls) => `<span class="qs-chip ${cls}"><i></i>${esc(sums[k] || k)} <b>${n[k]}</b></span>`;
    // items off the range are named under the plot with their real value: the edge has no room for every name
    const off = pts.filter((p) => outside(p.x) || outside(p.y));
    const offText = off.length ? `นอกกรอบ ${lo.toFixed(dec)}–${hi.toFixed(dec)} (วงกลมโปร่งที่ขอบ): ${off.slice(0, 6).map((p) => `${p.label} ${[outside(p.x) ? `${o.xShort || 'x'} ${fmt(p.x)}` : '', outside(p.y) ? `${o.yShort || 'y'} ${fmt(p.y)}` : ''].filter(Boolean).join(' ')}`).join(', ')}${off.length > 6 ? ` และอีก ${off.length - 6}` : ''}` : '';
    const grouped = groups.some((k) => k.items.length > 1) ? 'ตัวเลขในวงกลม = จำนวนรายการที่ค่าใกล้กัน ชี้เพื่อดูรายชื่อ' : '';
    el.innerHTML = `<svg class="chart-svg qchart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.label || 'Quadrant chart')}">${g}${dots}${labels}${hits}</svg>
      <div class="qs-sum">${chip('bl', 'bad')}${chip('tl', 'mid')}${chip('br', 'mid')}${chip('tr', 'good')}</div>
      ${offText || grouped || missingText ? `<p class="qs-note">${[offText, grouped, missingText].filter(Boolean).map(esc).join('<br>')}</p>` : ''}`;
    el.onclick = (e) => { const h = e.target.closest('.hit[data-href]'); if (h) location.hash = h.dataset.href; };
  };
})();
