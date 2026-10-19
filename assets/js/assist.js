/* assist.js — help people find their way:
   PM.attention()  "ต้องดำเนินการวันนี้": everything that needs someone's attention, worst first (Dashboard)
   Quick search    Ctrl / ⌘ + K (or the search box in the top bar): pages, projects, bids, POs — jump straight there
   Quick create    "+ สร้างใหม่" in the top bar: opens the right page with its form already open (by permission) */
(function () {
  const U = PM.ui, esc = U.esc;
  const RANK = { critical: 0, warning: 1, info: 2 };
  const codes = (list, fn, n = 4) => list.slice(0, n).map(fn).join(', ') + (list.length > n ? ` และอีก ${list.length - n}` : '');

  /* ---------- what needs attention ---------- */
  PM.attention = function () {
    const T = PM.today(), db = PM.db, out = [];
    const add = (o) => { if (o.count) out.push(o); };
    const active = db.projects.filter((p) => p.status !== 'closed');
    const rows = active.map((p) => ({ p, m: PM.projectMetrics(p) }));
    const one = (list, tab) => (list.length === 1 ? `#/projects/${list[0].p.id}${tab ? '/' + tab : ''}` : null);

    // cost
    const ov = PM.costOverrunRows ? PM.costOverrunRows(rows) : [];
    const over = ov.filter((r) => r.o.status === 'over'), fc = ov.filter((r) => r.o.status === 'forecast');
    add({ level: 'critical', icon: 'coins', count: over.length, title: 'โครงการเกินงบแล้ว', sub: codes(over, (r) => `${r.p.code} +${U.money(r.o.amount)}`), href: one(over, 'cost') || '#/dashboard', jump: '#d-overrun' });
    add({ level: 'warning', icon: 'coins', count: fc.length, title: 'โครงการคาดว่าจะเกินงบ', sub: codes(fc, (r) => `${r.p.code} +${U.money(r.o.forecast)}`), href: one(fc, 'cost') || '#/dashboard', jump: '#d-overrun' });
    // schedule
    const slow = rows.filter((r) => r.p.status !== 'onhold' && r.m.spi != null && r.m.spi < 0.9);
    add({ level: 'critical', icon: 'clock', count: slow.length, title: 'โครงการช้ากว่าแผน (SPI < 0.90)', sub: codes(slow, (r) => `${r.p.code} SPI ${U.ratio(r.m.spi)}`), href: one(slow, 'timeline') || '#/projects' });
    // milestones & activities
    const msLate = [], msSoon = [], taskLate = [];
    active.forEach((p) => {
      (p.milestones || []).forEach((x) => {
        if (PM.milestoneLate(x, T)) msLate.push({ p, x });
        else if (!x.actual && x.date >= T && PM.diffDays(T, x.date) <= 14) msSoon.push({ p, x });
      });
      (p.tasks || []).forEach((t) => { if (PM.taskLate(t, T)) taskLate.push({ p, t }); });
    });
    const byProject = (list) => Array.from(new Set(list.map((y) => y.p)));
    add({ level: 'critical', icon: 'alert', count: msLate.length, title: 'Milestone เลยกำหนด', sub: codes(msLate, (y) => `${y.p.code} ${y.x.name}`, 3), href: byProject(msLate).length === 1 ? `#/projects/${msLate[0].p.id}/timeline` : '#/projects' });
    add({ level: 'warning', icon: 'tasks', count: taskLate.length, title: 'กิจกรรมล่าช้า (Gantt)', sub: codes(byProject(taskLate), (p) => `${p.code} ${taskLate.filter((y) => y.p === p).length} งาน`), href: byProject(taskLate).length === 1 ? `#/projects/${taskLate[0].p.id}/timeline` : '#/projects' });
    add({ level: 'info', icon: 'calendar', count: msSoon.length, title: 'Milestone ภายใน 14 วัน', sub: codes(msSoon, (y) => `${y.p.code} ${y.x.name} ${U.date(y.x.date)}`, 3), href: byProject(msSoon).length === 1 ? `#/projects/${msSoon[0].p.id}/timeline` : '#/projects' });
    // purchase orders
    const po = PM.poStats(db.pos || [], T);
    const due7 = po.soon.filter((x) => PM.diffDays(T, x.deliveryDue) <= 7);
    add({ level: 'critical', icon: 'truck', count: po.late.length, title: 'PO เลยกำหนดส่ง', sub: codes(po.late, (x) => `${x.poNo} ${PM.poDaysLate(x, T)} วัน`, 3), href: '#/pos' });
    add({ level: 'warning', icon: 'truck', count: due7.length, title: 'PO ต้องส่งภายใน 7 วัน', sub: codes(due7, (x) => `${x.poNo} ${U.date(x.deliveryDue)}`, 3), href: '#/pos' });
    // quality
    const ncr = (db.ncrs || []).filter((n) => n.status === 'open' && n.severity === 'Critical' && active.some((p) => p.id === n.projectId));
    add({ level: 'critical', icon: 'quality', count: ncr.length, title: 'NCR ระดับ Critical ที่ยังเปิดอยู่', sub: codes(ncr, (n) => n.no, 3), href: ncr.length === 1 ? `#/projects/${ncr[0].projectId}/quality` : '#/projects' });
    // bidding: proposals due soon / overdue, not submitted yet
    const bids = (db.bids || []).filter((b) => b.result === 'pending' && !(b.dates && b.dates.submit) && b.dueDate);
    const bidLate = bids.filter((b) => b.dueDate < T), bidSoon = bids.filter((b) => b.dueDate >= T && PM.diffDays(T, b.dueDate) <= 3);
    add({ level: 'critical', icon: 'submit', count: bidLate.length, title: 'Bid เลย Due date แต่ยังไม่ยื่น', sub: codes(bidLate, (b) => b.code, 3), href: '#/bidding' });
    add({ level: 'warning', icon: 'submit', count: bidSoon.length, title: 'Bid ต้องยื่นภายใน 3 วัน', sub: codes(bidSoon, (b) => `${b.code} ${U.date(b.dueDate)}`, 3), href: '#/bidding' });
    // weekly plan: this week's work past its due date
    const wk = PM.monday(T);
    const wpLate = (db.plans || []).filter((x) => x.week === wk && x.status !== 'done' && x.status !== 'not_done' && x.dueDate && x.dueDate < T);
    add({ level: 'warning', icon: 'tasks', count: wpLate.length, title: 'งานใน Weekly Plan เลยกำหนด', sub: 'สัปดาห์นี้ — อัปเดตสถานะหรือเลือกสาเหตุที่ไม่เสร็จ', href: '#/weekly' });
    // timesheets (managers)
    if (PM.can('resource.view')) {
      const ut = PM.utilization(PM.addDays(wk, -7), PM.addDays(wk, -1));
      const missing = ut.people.filter((x) => x.capacity && x.logged < x.capacity * 0.9);
      add({ level: 'info', icon: 'clock', count: missing.length, title: 'ยังกรอก Timesheet สัปดาห์ก่อนไม่ครบ', sub: codes(missing, (x) => (x.r || x.resource || {}).name || '–', 4), href: '#/timesheet' });
    }
    return out.sort((a, b) => RANK[a.level] - RANK[b.level]);
  };

  PM.attentionHtml = function (list) {
    if (!list.length) return `<div class="att-ok">${PM.illus.icon('check')}<div><b>ไม่มีเรื่องที่ต้องรีบดำเนินการ</b><small>ทุกโครงการ PO และ Milestone อยู่ในเกณฑ์ปกติ ณ วันนี้</small></div></div>`;
    const label = { critical: 'ด่วน', warning: 'ติดตาม', info: 'แจ้งให้ทราบ' };
    return `<div class="att-list">${list.map((a) => `
      <a class="att att-${a.level}" href="${esc(a.href)}"${a.jump ? ` data-jump="${esc(a.jump)}"` : ''}>
        ${PM.illus.icon(a.icon, 'att-ic')}
        <span class="att-n">${U.num(a.count)}</span>
        <span class="att-t"><b>${esc(a.title)}</b><small>${esc(a.sub || '')}</small></span>
        <span class="att-lv">${label[a.level]}</span>
      </a>`).join('')}</div>`;
  };

  /* ---------- quick search (Ctrl / ⌘ + K) ---------- */
  let pal = null, sel = 0, hits = [];
  function pages() {
    return Array.from(document.querySelectorAll('#nav a[data-route]')).filter((a) => !a.hidden)
      .map((a) => ({ group: 'หน้า', title: a.textContent.trim(), sub: '', href: a.getAttribute('href'), icon: 'chart' }));
  }
  function index() {
    const db = PM.db;
    return pages().concat(
      db.projects.map((p) => ({ group: 'โครงการ', title: `${p.code} · ${p.name}`, sub: [p.client, p.status === 'closed' ? 'Closed' : ''].filter(Boolean).join(' · '), href: `#/projects/${p.id}`, icon: 'building', text: [p.code, p.name, p.client].join(' ') })),
      (db.bids || []).map((b) => ({ group: 'Bid', title: `${b.code} · ${b.name}`, sub: `${b.client || ''} · ${b.result === 'pending' ? PM.bidStageLabel(b.stage) : PM.BID_RESULTS[b.result] || b.result}`, href: `#/bidding/${b.result === 'pending' ? b.stage : 'award'}`, icon: 'proposal', text: [b.code, b.name, b.client].join(' ') })),
      (db.pos || []).map((x) => { const p = PM.find('projects', x.projectId); return { group: 'PO', title: `${x.poNo} · ${x.supplier || ''}`, sub: `${p ? p.code : ''} · ${x.description || ''}`, href: '#/pos', po: x.id, icon: 'truck', text: [x.poNo, x.supplier, x.description, p && p.code].join(' ') }; }),
    );
  }
  function openPalette() {
    if (!document.body.classList.contains('authed') || document.body.classList.contains('presenting')) return;
    if (!pal) {
      pal = document.createElement('div');
      pal.className = 'qs-backdrop';
      pal.innerHTML = `<div class="qs" role="dialog" aria-label="ค้นหา">
        <div class="qs-in">${PM.illus.svg('funnel')}<input type="search" placeholder="ค้นหาโครงการ · Bid · PO · หน้า…" aria-label="ค้นหา" autocomplete="off"><kbd>Esc</kbd></div>
        <div class="qs-list" role="listbox"></div>
        <div class="qs-foot"><span><kbd>↑</kbd><kbd>↓</kbd> เลือก</span><span><kbd>Enter</kbd> เปิด</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> เปิดค้นหาจากทุกหน้า</span></div></div>`;
      document.body.appendChild(pal);
      const input = pal.querySelector('input');
      input.addEventListener('input', () => { sel = 0; draw(input.value); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(hits.length - 1, sel + 1); mark(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
        else if (e.key === 'Enter') { e.preventDefault(); go(hits[sel]); }
        else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      });
      pal.addEventListener('mousedown', (e) => { if (e.target === pal) closePalette(); });
      pal.addEventListener('click', (e) => { const r = e.target.closest('[data-i]'); if (r) go(hits[+r.dataset.i]); });
    }
    pal.hidden = false;
    document.body.classList.add('qs-open');
    const input = pal.querySelector('input');
    input.value = '';
    sel = 0;
    draw('');
    setTimeout(() => input.focus(), 0);
  }
  function closePalette() { if (pal) pal.hidden = true; document.body.classList.remove('qs-open'); }
  function draw(q) {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const all = index();
    const match = (x) => words.every((w) => (x.text || x.title + ' ' + x.sub).toLowerCase().includes(w));
    const groups = ['หน้า', 'โครงการ', 'Bid', 'PO'];
    hits = [];
    groups.forEach((g) => { const list = all.filter((x) => x.group === g && (!words.length ? g !== 'PO' && g !== 'Bid' : match(x))); hits.push(...list.slice(0, words.length ? 6 : g === 'หน้า' ? 8 : 5)); });
    const box = pal.querySelector('.qs-list');
    if (!hits.length) { box.innerHTML = `<p class="qs-none">ไม่พบ "${esc(q)}"</p>`; return; }
    let last = '';
    box.innerHTML = hits.map((h, i) => {
      const head = h.group !== last ? `<div class="qs-g">${esc(h.group)}</div>` : '';
      last = h.group;
      return `${head}<div class="qs-row" role="option" data-i="${i}">${PM.illus.svg(h.icon)}<span><b>${esc(h.title)}</b>${h.sub ? `<small>${esc(h.sub)}</small>` : ''}</span></div>`;
    }).join('');
    mark();
  }
  function mark() {
    pal.querySelectorAll('.qs-row').forEach((r) => r.classList.toggle('on', +r.dataset.i === sel));
    const on = pal.querySelector('.qs-row.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function go(h) {
    if (!h) return;
    closePalette();
    if (location.hash !== h.href) location.hash = h.href; else PM.render();
    if (h.po) setTimeout(() => { const x = PM.find('pos', h.po); if (x) PM.poForm(x, null, () => PM.render()); }, 200);
  }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (pal && !pal.hidden) closePalette(); else openPalette(); }
  });
  PM.quickSearch = openPalette;

  /* ---------- quick create ---------- */
  const afterRender = (sel2) => new Promise((resolve) => {
    let n = 0;
    const t = setInterval(() => { const b = document.querySelector(sel2); if (b || ++n > 25) { clearInterval(t); if (b) b.click(); resolve(); } }, 80);
  });
  const CREATE = [
    { label: 'Inquiry ใหม่ (Bidding)', icon: 'inquiry', perm: 'bid.edit', route: '#/bidding', click: '[data-action="new"]' },
    { label: 'โครงการใหม่', icon: 'building', route: '#/projects', click: '[data-action="new"]' },
    { label: 'บันทึกค่าใช้จ่ายโครงการ', icon: 'coins', perm: 'cost.edit', pick: (p) => PM.costEntryForm(p, null, () => PM.render()) },
    { label: 'PO ใหม่', icon: 'truck', perm: 'po.edit', route: '#/pos', click: '[data-action="new-po"]' },
    { label: 'งานใน Weekly Plan', icon: 'calendar', perm: 'plan.edit', route: '#/weekly', click: '[data-action="new"]' },
    { label: 'ราคาใน Price List', icon: 'tag', perm: 'price.edit', route: '#/prices', click: '[data-action="new"]' },
    { label: 'กรอก Timesheet', icon: 'clock', perm: 'timesheet.edit', route: '#/timesheet' },
  ];
  function pickProject(fn) {
    const list = PM.db.projects.filter((p) => p.status !== 'closed');
    const f = U.modal({
      title: 'เลือกโครงการ', submitLabel: 'ถัดไป',
      body: U.field('โครงการ', 'project', (list[0] || {}).id, { options: list.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })), full: true }),
      onSubmit: (v) => { const p = PM.find('projects', v.project); if (p) setTimeout(() => fn(p), 220); },
    });
    return f;
  }
  function createMenu() {
    return CREATE.filter((c) => !c.perm || PM.can(c.perm)).map((c, i) => `<button type="button" class="qc-item" role="menuitem" data-qc="${CREATE.indexOf(c)}">${PM.illus.svg(c.icon)}<span>${esc(c.label)}</span></button>`).join('');
  }
  async function create(c) {
    if (c.pick) { pickProject(c.pick); return; }
    if (location.hash !== c.route) location.hash = c.route;
    if (c.click) await afterRender(c.click);
  }

  /* top bar: search box + "+ สร้างใหม่" */
  function mountTopbar() {
    const bar = document.querySelector('.topbar');
    if (!bar || bar.querySelector('.qs-btn')) return;
    const spacer = bar.querySelector('.spacer');
    const wrap = document.createElement('div');
    wrap.className = 'topbar-assist';
    wrap.innerHTML = `
      <button type="button" class="qs-btn" aria-label="ค้นหา (Ctrl+K)">${PM.illus.svg('funnel')}<span>ค้นหาโครงการ · Bid · PO…</span><kbd>Ctrl K</kbd></button>
      <div class="qc"><button type="button" class="btn primary qc-btn" aria-haspopup="menu" aria-expanded="false"><span aria-hidden="true">＋</span><span class="qc-t">สร้างใหม่</span></button>
        <div class="qc-menu" role="menu" hidden></div></div>`;
    spacer.after(wrap);
    wrap.querySelector('.qs-btn').addEventListener('click', openPalette);
    const btn = wrap.querySelector('.qc-btn'), menu = wrap.querySelector('.qc-menu');
    const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!menu.hidden) { close(); return; }
      menu.innerHTML = createMenu();
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      const first = menu.querySelector('button'); if (first) first.focus();
    });
    menu.addEventListener('click', (e) => { const b = e.target.closest('[data-qc]'); if (!b) return; close(); create(CREATE[+b.dataset.qc]); });
    menu.addEventListener('keydown', (e) => {
      const items = Array.from(menu.querySelectorAll('button')), i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
      if (e.key === 'Escape') { close(); btn.focus(); }
    });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
  }
  // the top bar's real height → var(--topbar-h): sticky bars below it (project tabs) line up on every screen size
  const measure = () => { const bar = document.querySelector('.topbar'); if (bar && bar.offsetHeight) document.documentElement.style.setProperty('--topbar-h', bar.offsetHeight + 'px'); };
  PM.measureTopbar = measure; // app.js calls it after each page render (the bar is hidden until signed in)
  const start = () => { mountTopbar(); measure(); window.addEventListener('resize', measure); window.addEventListener('hashchange', () => setTimeout(measure, 50)); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  /* Dashboard "jump to section" links and attention items that point inside the Dashboard */
  document.addEventListener('click', (e) => {
    const j = e.target.closest('[data-jump]');
    if (!j) return;
    const target = document.querySelector(j.dataset.jump);
    if (!target) return; // not on this page — let the link navigate
    e.preventDefault();
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
})();
