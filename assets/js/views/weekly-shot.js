/* weekly-shot.js — draws the Weekly Plan as a PNG, for sending in a chat. No library, works offline.
   Drawn from the data instead of capturing the screen: the whole plan fits whatever the window size, it reads on a phone,
   and it looks the same on every device and in both themes (always the light colours).
   PM.planShot.render(data) → Promise<{ blob, width, height, scale }>
   data: { company, title, sub, note, stamp, kpis: [{ label, value, sub, level }],
           layout: 'cal', days: [{ head, sub, today, tasks }]  |  layout: 'list', groups: [{ label, sub, tasks }] }
   task: { title, lines: [text], status, statusLabel, late, reason } */
(function () {
  const C = { navy: '#0b2f6b', ink: '#0b1b33', ink2: '#3f5068', muted: '#6a7a91', line: '#d5deea', page: '#f4f7fb', white: '#ffffff', band: '#dfe8f5', today: '#e3effb', todayLine: '#2a78d6' };
  const ST = {
    planned: { bar: '#a3afc0', bg: '#edf2f9', fg: '#3f5068' }, in_progress: { bar: '#2a78d6', bg: '#e3effb', fg: '#174f94' },
    done: { bar: '#0ca30c', bg: '#e5f5e5', fg: '#006300' }, not_done: { bar: '#d03b3b', bg: '#f9e1e1', fg: '#b02a2a' },
  };
  const LEVEL = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' };
  const FAMILY = '"IBM Plex Sans Thai", "Inter", "Leelawadee UI", "Noto Sans Thai", Tahoma, sans-serif';
  const font = (size, weight) => `${weight || 400} ${size}px ${FAMILY}`;
  // browsers limit a canvas: stay under what phones accept
  const MAX_AREA = 16000000, MAX_SIDE = 16000;

  /* Thai has no spaces between words: break at word boundaries where the browser knows them */
  const THAI_MARK = '\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E';
  const graphemes = (s) => s.match(new RegExp(`[^${THAI_MARK}][${THAI_MARK}]*|[${THAI_MARK}]+`, 'gu')) || [];
  function pieces(s) {
    if (window.Intl && Intl.Segmenter) return Array.from(new Intl.Segmenter('th', { granularity: 'word' }).segment(s), (x) => x.segment);
    return graphemes(s);
  }
  function wrap(ctx, text, maxW, maxLines) {
    const out = [];
    let cur = '';
    const push = () => { out.push(cur.trim()); cur = ''; };
    pieces(String(text == null ? '' : text)).forEach((part) => {
      if (ctx.measureText(cur + part).width <= maxW) { cur += part; return; }
      if (cur.trim()) push();
      if (ctx.measureText(part).width <= maxW) { cur = part.trimStart(); return; }
      graphemes(part).forEach((g) => { // one word wider than the box
        if (ctx.measureText(cur + g).width > maxW && cur) push();
        cur += g;
      });
    });
    if (cur.trim()) push();
    if (maxLines && out.length > maxLines) {
      const kept = out.slice(0, maxLines);
      let last = kept[maxLines - 1];
      while (last && ctx.measureText(last + '…').width > maxW) last = graphemes(last).slice(0, -1).join('');
      kept[maxLines - 1] = last + '…';
      return kept;
    }
    return out.length ? out : [''];
  }

  function box(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function say(ctx, text, x, y, f, color, align) {
    ctx.font = f;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }
  function para(ctx, text, x, y, maxW, f, color, lineH, maxLines) {
    ctx.font = f;
    const rows = wrap(ctx, text, maxW, maxLines);
    rows.forEach((r, i) => say(ctx, r, x, y + i * lineH, f, color));
    return rows.length * lineH;
  }
  /* a status label; right = its right edge → returns its left edge */
  function pill(ctx, text, right, y, st, size) {
    const f = font(size, 600), h = size + 10;
    ctx.font = f;
    const w = ctx.measureText(text).width + 16;
    box(ctx, right - w, y, w, h, h / 2, st.bg);
    say(ctx, text, right - w + 8, y + h - 7, f, st.fg);
    return right - w;
  }

  function heading(ctx, d, W) {
    const pad = 24;
    ctx.font = font(14);
    const noteH = d.note ? wrap(ctx, d.note, W - pad * 2, 2).length * 20 : 0;
    const h = 104 + noteH;
    ctx.fillStyle = C.navy;
    ctx.fillRect(0, 0, W, h);
    say(ctx, d.company, pad, 30, font(14, 500), '#c9d8f2');
    say(ctx, d.title, pad, 64, font(26, 700), C.white);
    say(ctx, d.sub, pad, 90, font(15), '#dfe8f5');
    if (d.note) para(ctx, d.note, pad, 112, W - pad * 2, font(14), '#c9d8f2', 20, 2);
    return h;
  }
  function kpis(ctx, d, W, top) {
    if (!d.kpis || !d.kpis.length) return top;
    const pad = 24, gap = 10, n = d.kpis.length, w = (W - pad * 2 - gap * (n - 1)) / n, h = 78, y = top + 16;
    d.kpis.forEach((k, i) => {
      const x = pad + i * (w + gap);
      box(ctx, x, y, w, h, 10, C.white, C.line);
      box(ctx, x, y + 10, 4, h - 20, 2, LEVEL[k.level] || '#a3afc0');
      say(ctx, k.label, x + 14, y + 24, font(13), C.muted);
      say(ctx, k.value, x + 14, y + 52, font(24, 700), C.ink);
      if (k.sub) { ctx.font = font(11); say(ctx, wrap(ctx, k.sub, w - 22, 1)[0], x + 14, y + 69, font(11), C.ink2); }
    });
    return y + h;
  }
  function footer(ctx, d, W, y) {
    ctx.fillStyle = C.line;
    ctx.fillRect(24, y + 8, W - 48, 1);
    say(ctx, `${d.company} · BU4 IE/EPC Project Management`, 24, y + 30, font(12), C.muted);
    say(ctx, d.stamp, W - 24, y + 30, font(12), C.muted, 'right');
    return y + 44;
  }

  /* ---------- list: one column, large type — made for reading on a phone ---------- */
  function drawList(ctx, d) {
    const W = 760, pad = 24;
    let y = kpis(ctx, d, W, heading(ctx, d, W)) + 18;
    if (!d.groups.length) { say(ctx, 'ไม่มีงาน', W / 2, y + 30, font(16), C.muted, 'center'); y += 50; }
    d.groups.forEach((g) => {
      box(ctx, pad, y, W - pad * 2, 38, 8, C.band);
      say(ctx, g.label, pad + 14, y + 25, font(16, 700), C.navy);
      if (g.sub) say(ctx, g.sub, W - pad - 14, y + 25, font(13), C.ink2, 'right');
      y += 46;
      g.tasks.forEach((t) => {
        const st = ST[t.status] || ST.planned, x = pad, w = W - pad * 2, top = y;
        ctx.font = font(13, 600);
        const pillsW = ctx.measureText(t.statusLabel).width + 16 + (t.late ? ctx.measureText('เลยกำหนด').width + 24 : 0);
        ctx.font = font(17, 600);
        const titleRows = wrap(ctx, t.title, w - 30 - pillsW - 12, 3);
        ctx.font = font(14);
        const metaRows = t.lines.filter(Boolean).flatMap((l) => wrap(ctx, l, w - 30, 2));
        const reasonRows = t.reason ? wrap(ctx, `สาเหตุ: ${t.reason}`, w - 30, 2) : [];
        const h = 16 + titleRows.length * 24 + metaRows.length * 20 + reasonRows.length * 20 + 8;
        box(ctx, x, top, w, h, 8, C.white, C.line);
        box(ctx, x, top + 6, 5, h - 12, 2.5, st.bar);
        let right = pill(ctx, t.statusLabel, x + w - 12, top + 10, st, 13);
        if (t.late) right = pill(ctx, 'เลยกำหนด', right - 6, top + 10, ST.not_done, 13);
        let ty = top + 30;
        titleRows.forEach((r) => { say(ctx, r, x + 18, ty, font(17, 600), C.ink); ty += 24; });
        metaRows.forEach((r) => { say(ctx, r, x + 18, ty - 2, font(14), C.ink2); ty += 20; });
        reasonRows.forEach((r) => { say(ctx, r, x + 18, ty - 2, font(14, 500), ST.not_done.fg); ty += 20; });
        y = top + h + 8;
      });
      y += 8;
    });
    return { width: W, height: footer(ctx, d, W, y) };
  }

  /* ---------- calendar: a column per day, like the page ---------- */
  function drawCal(ctx, d, known) {
    const W = 1400, pad = 24, gap = 10, n = d.days.length, cw = (W - pad * 2 - gap * (n - 1)) / n, inner = cw - 16;
    const top = kpis(ctx, d, W, heading(ctx, d, W)) + 18;
    let bottom = top;
    d.days.forEach((day, i) => {
      const x = pad + i * (cw + gap);
      box(ctx, x, top, cw, (known ? known.bottom : top) - top, 10, day.today ? C.today : '#eef2f8', day.today ? C.todayLine : null);
      say(ctx, day.head, x + 10, top + 26, font(15, 700), day.today ? '#174f94' : C.navy);
      say(ctx, day.sub, x + 10, top + 45, font(12), C.ink2);
      let y = top + 56;
      if (!day.tasks.length) { say(ctx, 'ไม่มีงาน', x + cw / 2, y + 22, font(13), C.muted, 'center'); y += 36; }
      day.tasks.forEach((t) => {
        const st = ST[t.status] || ST.planned;
        ctx.font = font(14, 600);
        const titleRows = wrap(ctx, t.title, inner - 18, 3);
        ctx.font = font(12);
        const metaRows = t.lines.filter(Boolean).flatMap((l) => wrap(ctx, l, inner - 18, 2));
        const reasonRows = t.reason ? wrap(ctx, t.reason, inner - 18, 2) : [];
        const h = 12 + titleRows.length * 19 + metaRows.length * 16 + reasonRows.length * 16 + 34;
        box(ctx, x + 8, y, inner, h, 7, C.white, C.line);
        box(ctx, x + 8, y + 5, 4, h - 10, 2, st.bar);
        let ty = y + 21;
        titleRows.forEach((r) => { say(ctx, r, x + 19, ty, font(14, 600), C.ink); ty += 19; });
        metaRows.forEach((r) => { say(ctx, r, x + 19, ty - 2, font(12), C.ink2); ty += 16; });
        reasonRows.forEach((r) => { say(ctx, r, x + 19, ty - 2, font(12, 500), ST.not_done.fg); ty += 16; });
        ctx.font = font(11, 600);
        const left = x + 8 + inner - 8;
        const end = pill(ctx, t.statusLabel, left, y + h - 28, st, 11);
        if (t.late) pill(ctx, 'เลยกำหนด', end - 4, y + h - 28, ST.not_done, 11);
        y += h + 8;
      });
      bottom = Math.max(bottom, y + 4);
    });
    return { width: W, height: footer(ctx, d, W, bottom + 6), bottom };
  }

  /* ---------- month: a grid, the task names only ---------- */
  function drawMonth(ctx, d) {
    const W = 1400, pad = 24, gap = 6, cw = (W - pad * 2 - gap * 6) / 7, MAX = 5, lineH = 22;
    let y = kpis(ctx, d, W, heading(ctx, d, W)) + 18;
    d.heads.forEach((h, i) => say(ctx, h, pad + i * (cw + gap) + cw / 2, y + 12, font(13, 700), C.navy, 'center'));
    y += 24;
    for (let wk = 0; wk < d.cells.length / 7; wk++) {
      const row = d.cells.slice(wk * 7, wk * 7 + 7);
      const rows = Math.max(3, ...row.map((c) => Math.min(c.tasks.length, MAX)));
      const h = 34 + rows * lineH + 6;
      row.forEach((c, i) => {
        const x = pad + i * (cw + gap);
        box(ctx, x, y, cw, h, 7, c.today ? C.today : c.out ? '#f4f7fb' : c.weekend || c.holiday ? '#eef2f8' : C.white, c.today ? C.todayLine : C.line);
        say(ctx, String(c.num), x + 8, y + 21, font(14, 700), c.out ? '#a3afc0' : c.today ? '#174f94' : C.ink);
        if (c.holiday) { ctx.font = font(10); say(ctx, wrap(ctx, c.holiday, cw - 40, 1)[0], x + 30, y + 20, font(10), ST.not_done.fg); }
        const shown = c.tasks.length > MAX ? c.tasks.slice(0, MAX - 1) : c.tasks;
        shown.forEach((t, k) => {
          const st = ST[t.status] || ST.planned, ty = y + 30 + k * lineH;
          box(ctx, x + 5, ty, cw - 10, lineH - 3, 4, c.out ? '#edf2f9' : st.bg);
          box(ctx, x + 5, ty, 3, lineH - 3, 1.5, st.bar);
          ctx.font = font(11.5, 500);
          say(ctx, wrap(ctx, t.title, cw - 26 - (t.late ? 12 : 0), 1)[0], x + 12, ty + 14, font(11.5, 500), c.out ? C.muted : C.ink);
          if (t.late) say(ctx, '!', x + cw - 12, ty + 14, font(12, 700), ST.not_done.fg, 'right');
        });
        if (c.tasks.length > MAX) say(ctx, `+ อีก ${c.tasks.length - MAX + 1} งาน`, x + 12, y + 30 + (MAX - 1) * lineH + 14, font(11.5, 600), C.ink2);
      });
      y += h + gap;
    }
    // what the colours mean
    y += 6;
    let lx = pad;
    [['planned', 'วางแผน'], ['in_progress', 'กำลังทำ'], ['done', 'เสร็จ'], ['not_done', 'ไม่เสร็จ']].forEach(([k, t]) => {
      box(ctx, lx, y, 12, 12, 3, ST[k].bar);
      say(ctx, t, lx + 18, y + 11, font(12), C.ink2);
      ctx.font = font(12);
      lx += 18 + ctx.measureText(t).width + 18;
    });
    say(ctx, '!', lx + 4, y + 11, font(13, 700), ST.not_done.fg);
    say(ctx, 'เลยกำหนด', lx + 14, y + 11, font(12), C.ink2);
    return { width: W, height: footer(ctx, d, W, y + 18) };
  }

  const paint = (ctx, d, known) => (d.layout === 'month' ? drawMonth(ctx, d) : d.layout === 'cal' ? drawCal(ctx, d, known) : drawList(ctx, d));
  async function fontsReady() {
    try {
      await Promise.all([document.fonts.load(font(16, 400), 'กA'), document.fonts.load(font(16, 600), 'กA'), document.fonts.load(font(16, 700), 'กA')]);
    } catch (e) { /* the fallback fonts in FAMILY draw Thai too */ }
  }

  PM.planShot = {
    async render(d) {
      await fontsReady();
      // first pass on a scrap canvas: only to learn the size
      const known = paint(document.createElement('canvas').getContext('2d'), d);
      const scale = Math.min(2, Math.sqrt(MAX_AREA / (known.width * known.height)), MAX_SIDE / known.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(known.width * scale);
      canvas.height = Math.round(known.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = C.page;
      ctx.fillRect(0, 0, known.width, known.height);
      paint(ctx, d, known);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      return { blob, width: canvas.width, height: canvas.height, scale };
    },
  };
})();
