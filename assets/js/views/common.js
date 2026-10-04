/* common.js — shared view pieces: tiles, flow strip, bid & project forms */
(function () {
  const U = PM.ui, esc = U.esc;
  const V = (PM.common = {});

  /* icon: a PM.illus key, false = none; default = picked from the label / tag */
  V.tile = ({ label, tag, value, sub, tip, icon }) => {
    const ic = icon === false ? '' : PM.illus.icon(icon || PM.illus.pick(`${label} ${tag || ''}`), 'tile-ic');
    return `<div class="tile${ic ? ' has-ic' : ''}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${ic}
      <div class="tile-label">${esc(label)}${tag ? `<span class="tag">${esc(tag)}</span>` : ''}</div>
      <div class="tile-value">${value}</div>
      <div class="tile-sub">${sub || ''}</div>
    </div>`;
  };

  const ARROW = '<div class="flow-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>';
  // each step shows the picture of its stage / phase (Inquiry … Award, Engineering … Closing)
  V.flow = (steps) =>
    `<div class="flow">${steps.map((s, i) => {
      const ic = PM.illus.icon(s.icon || String(s.label).toLowerCase(), 'flow-ic');
      return `${i ? ARROW : ''}<div class="flow-step${ic ? ' has-ic' : ''}${s.href || s.action ? ' link' : ''}${s.active ? ' active' : ''}"${s.href ? ` data-href="${esc(s.href)}"` : ''}${s.action ? ` data-action="${esc(s.action)}"` : ''}${s.key ? ` data-key="${esc(s.key)}"` : ''}${s.tip ? ` data-tip="${esc(s.tip)}"` : ''}>${ic}
        <div class="n">${esc(s.n || String(i + 1).padStart(2, '0'))}</div>
        <b>${esc(s.label)}</b><div class="th">${esc(s.th || '')}</div>
        <div class="big">${s.big}</div><div class="meta">${s.meta || ''}</div>
      </div>`;
    }).join('')}</div>`;

  V.bindFlowLinks = (el) => el.querySelectorAll('.flow-step[data-href]').forEach((s) => s.addEventListener('click', () => (location.hash = s.dataset.href)));

  V.periods = [
    { key: '90d', label: '90 วัน' },
    { key: '12m', label: '12 เดือน' },
    { key: 'ytd', label: 'YTD' },
    { key: 'all', label: 'ทั้งหมด' },
  ];
  V.periodRange = (key) => {
    const T = PM.today();
    if (key === '90d') return { from: PM.addDays(T, -89), to: T };
    if (key === '12m') return { from: PM.addDays(T, -364), to: T };
    if (key === 'ytd') return { from: T.slice(0, 4) + '-01-01', to: T };
    return { from: null, to: null };
  };
  V.seg = (name, items, value) =>
    `<div class="seg" role="group">${items.map((it) => `<button type="button" data-seg="${name}" data-val="${it.key}" class="${it.key === value ? 'on' : ''}">${esc(it.label)}</button>`).join('')}</div>`;

  /* ---------- week navigator (Weekly Plan, Timesheet) — uses data-action prev / next / this ---------- */
  V.isoWeek = (s) => {
    const d = PM.parse(s);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); // Thursday of this week decides the ISO week
    const w1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  };
  V.weekNav = function (week) {
    const T = PM.today();
    const end = PM.addDays(week, 6);
    const a = PM.parse(week), b = PM.parse(end);
    const fmt = (d, o) => d.toLocaleDateString('en-GB', o);
    const range = a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${fmt(b, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : `${fmt(a, { day: 'numeric', month: 'short' })} – ${fmt(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const diff = Math.round(PM.diffDays(PM.monday(T), week) / 7);
    const rel = diff === 0 ? 'สัปดาห์นี้' : diff === 1 ? 'สัปดาห์หน้า' : diff === -1 ? 'สัปดาห์ที่แล้ว' : diff > 0 ? `อีก ${diff} สัปดาห์` : `${-diff} สัปดาห์ก่อน`;
    const chev = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    return `<div class="week-nav" role="group" aria-label="เลือกสัปดาห์">
        <button class="wk-btn" type="button" data-action="prev" aria-label="สัปดาห์ก่อนหน้า" title="สัปดาห์ก่อนหน้า">${chev('M15 6l-6 6 6 6')}</button>
        <div class="wk-label"><b>${esc(range)}</b><small>สัปดาห์ที่ ${V.isoWeek(week)} · <span class="${diff === 0 ? 'now' : ''}">${esc(rel)}</span></small></div>
        <button class="wk-btn" type="button" data-action="next" aria-label="สัปดาห์ถัดไป" title="สัปดาห์ถัดไป">${chev('M9 6l6 6-6 6')}</button>
      </div>
      <button class="btn wk-today${diff === 0 ? ' is-current' : ''}" type="button" data-action="this" ${diff === 0 ? 'aria-pressed="true" title="กำลังดูสัปดาห์นี้"' : 'title="กลับไปสัปดาห์ปัจจุบัน"'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/></svg>
        สัปดาห์นี้</button>`;
  };

  /* tabs on the Bidding pages: overview + one page per step (count = bids in that step now) */
  V.bidTabs = function (active) {
    const pending = PM.db.bids.filter((b) => b.result === 'pending');
    const tabs = [{ key: '', label: 'ภาพรวม', icon: 'chart', href: '#/bidding' }]
      .concat(PM.BID_STAGES.map((s) => ({ key: s.key, label: s.label, icon: s.key, href: '#/bidding/' + s.key, n: pending.filter((b) => b.stage === s.key).length })))
      .concat([{ key: 'award', label: 'Award', icon: 'award', href: '#/bidding/award' }]);
    return `<nav class="tabs bid-tabs" aria-label="ขั้นตอน Bidding">${tabs.map((t) =>
      `<a href="${t.href}" class="${t.key === active ? 'active' : ''}"${t.key === active ? ' aria-current="page"' : ''}>${PM.illus.svg(t.icon)}<span>${esc(t.label)}</span>${t.n != null ? `<em class="count">${t.n}</em>` : ''}</a>`).join('')}</nav>`;
  };

  /* buttons on a bid (card, row): data-action + data-id. Returns true when handled; done() redraws the page */
  /* money of a bid for whoever may see it (Admin · the Sales who owns it) — everyone else gets a lock */
  V.LOCK_PRICE = '<span class="price-lock" title="มูลค่าเห็นได้เฉพาะ Sales ผู้รับผิดชอบงานนี้และ Admin">🔒</span>';
  V.bidMoney = (b) => (PM.canSeeBidPrice(b) ? U.money(b.value) : V.LOCK_PRICE);
  /* sum of bid values for a summary: only the bids this user may see; '' for roles that see no prices */
  V.bidSum = (list) => (PM.seesBidPrices() ? U.money(PM.sum(list.filter(PM.canSeeBidPrice), (b) => b.value || 0)) : '');

  /* buttons on a bid (card, row): moving on and Won / Lost only for the Sales who owns it (and Admin) */
  V.bidButtons = function (b) {
    const i = PM.BID_STAGES.findIndex((s) => s.key === b.stage);
    const id = esc(b.id);
    const mine = PM.canEditBid(b);
    if (b.result === 'pending' && i < PM.BID_STAGES.length - 1) return mine ? `<button class="btn sm" data-action="next" data-id="${id}">→ ${PM.BID_STAGES[i + 1].label}</button>` : '';
    if (b.result === 'pending') return mine ? `<button class="btn sm good" data-action="won" data-id="${id}">✓ Won</button><button class="btn sm" data-action="lost" data-id="${id}">✕ Lost</button>` : '';
    if (b.result === 'won') return b.projectId && PM.find('projects', b.projectId)
      ? `<button class="btn sm" data-action="open-project" data-id="${id}">Open project →</button>`
      : `<button class="btn sm primary" data-action="convert" data-id="${id}">+ Create project</button>`;
    return '';
  };
  V.bidAction = function (a, b, done) {
    if (!b) return false;
    const T = PM.today();
    // same rules as the buttons (and the database for the price): Sales who owns the bid, or Admin
    if (['next', 'won', 'lost', 'nobid'].includes(a) && !PM.canEditBid(b)) { U.toast('เฉพาะ Sales ผู้รับผิดชอบงานนี้ หรือ Admin'); return true; }
    if (a === 'bid-files' && !PM.canSeeBidPrice(b)) return true;
    if (a === 'bid-files') { // 📎 on a card / row: open the attachments list (one file → open it directly)
      if ((b.files || []).length === 1) PM.poFiles.open(b.files[0].path);
      else PM.poFiles.showList(`ไฟล์แนบ — ${b.code}`, b.files);
      return true;
    }
    if (a === 'next') {
      const i = PM.BID_STAGES.findIndex((s) => s.key === b.stage);
      const nx = PM.BID_STAGES[i + 1];
      if (!nx) return true;
      b.dates[nx.key] = PM.max(T, b.dates[b.stage]);
      b.stage = nx.key;
      PM.upsert('bids', b);
      U.toast(`${b.code} → ${nx.label}`);
      done();
      return true;
    }
    if (a === 'won' || a === 'lost' || a === 'nobid') {
      b.result = a; b.resultDate = T; PM.upsert('bids', b);
      U.toast(`${b.code} → ${PM.BID_RESULTS[a]}`);
      if (a === 'won' && confirm(`${b.code} ได้งานแล้ว — สร้าง Project จาก bid นี้เลยหรือไม่?`)) V.projectForm(null, b, (p) => (location.hash = '#/projects/' + p.id));
      done();
      return true;
    }
    if (a === 'convert') { V.projectForm(null, b, (p) => (location.hash = '#/projects/' + p.id)); return true; }
    if (a === 'open-project') { location.hash = '#/projects/' + b.projectId; return true; }
    return false;
  };

  V.stageOf = (b) => { let s = 'inquiry'; PM.BID_STAGES.forEach((x) => { if (b.dates[x.key]) s = x.key; }); return s; };
  V.resultBadge = (b) => {
    if (b.result === 'won') return U.badge('good', 'Won');
    if (b.result === 'lost') return U.badge('critical', 'Lost');
    if (b.result === 'nobid') return U.badge('neutral', 'No-bid');
    return U.badge('info', PM.BID_STAGES.find((s) => s.key === b.stage).label);
  };
  V.dueBadge = (b) => {
    if (!b.dueDate) return '';
    if (b.dates.submit) return b.dates.submit <= b.dueDate ? U.badge('good', 'On time') : U.badge('critical', `Late ${PM.diffDays(b.dueDate, b.dates.submit)}d`);
    if (b.result !== 'pending') return '';
    const left = PM.diffDays(PM.today(), b.dueDate);
    if (left < 0) return U.badge('critical', `Overdue ${-left}d`);
    if (left <= 5) return U.badge('warning', `Due ${left}d`);
    return U.badge('neutral', `Due ${left}d`);
  };

  const people = () => PM.db.resources.filter((r) => r.active !== false).map((r) => ({ value: r.id, label: r.name }));

  /* ---------- bid form ---------- */
  /* Bid No. of a new inquiry starts as this fixed text (current year) — the user types the running number after it */
  V.bidNoPrefix = () => `PROP-${PM.today().slice(0, 4)}-IE EPC-00`;
  V.bidForm = async function (bid, onSaved) {
    await PM.roles.loadTeam(); // user accounts for the Sales list
    const T = PM.today();
    const isNew = !bid;
    const canEdit = PM.canEditBid(bid || null); // Admin · Sales (their own bids; any new inquiry)
    if (isNew && !canEdit) { alert('เพิ่ม Inquiry ได้เฉพาะ Sales และ Admin'); return; }
    const canPrice = isNew || PM.canSeeBidPrice(bid); // value · margin · quotation files
    const b = bid || {
      id: PM.uid('B'), code: V.bidNoPrefix(),
      name: '', client: '', sector: 'Industrial', value: 0, margin: 10, estimator: '', boqItems: 0,
      dueDate: PM.addDays(T, 30), dates: { inquiry: T, estimate: '', proposal: '', submit: '' }, stage: 'inquiry',
      result: 'pending', resultDate: '', projectId: null, notes: '', sales: '', salesName: '', leadSource: 'Sales visit', contact: '',
    };
    // a salesperson opening "New inquiry" is adding their own lead: they are the Sales (their employee record, else their account)
    if (isNew) {
      const me = PM.auth && PM.auth.user;
      const r = me && PM.db.resources.find((x) => x.discipline === 'Sales' && PM.normName(x.name) === PM.normName(PM.auth.displayName(me)));
      if (r) b.sales = r.id;
      else if (me && PM.myRole() === 'sales') { b.sales = me.id; b.salesName = PM.auth.displayName(me); }
    }
    const sources = PM.LEAD_SOURCES.includes(b.leadSource) || !b.leadSource ? PM.LEAD_SOURCES : PM.LEAD_SOURCES.concat(b.leadSource);
    const lockNote = '<p class="full perm-note">🔒 มูลค่า · Margin · ไฟล์ใบเสนอราคา เห็นได้เฉพาะ Sales ผู้รับผิดชอบงานนี้และ Admin</p>';
    const body = `
      ${canEdit ? '' : '<p class="full perm-note">ดูได้อย่างเดียว — เพิ่ม / แก้ไข Inquiry, เลื่อนขั้น และบันทึกผล Won / Lost ได้เฉพาะ Sales ผู้รับผิดชอบงานนี้และ Admin</p>'}
      <div class="sub-h">ข้อมูลงานประมูล</div>
      ${U.field('Bid No.', 'code', b.code, { required: true })}
      ${U.field('ลูกค้า (Client)', 'client', b.client, { required: true })}
      ${U.field('ชื่องาน / Scope of work', 'name', b.name, { required: true, full: true })}
      <div class="sub-h">Sales — ผู้หาลูกค้า / งานนี้มาจากไหน</div>
      <label><span>Sales ผู้รับผิดชอบลูกค้า</span>${V.salesInput(b)}<small class="muted">${PM.teamError ? esc(PM.teamError) : 'พิมพ์ชื่อได้เลย หรือเลือกจากรายชื่อที่ขึ้นมา'}</small></label>
      ${U.field('ที่มาของงาน (Lead source)', 'leadSource', b.leadSource || '', { options: sources, placeholder: '— เลือก —' })}
      ${U.field('ผู้ติดต่อฝั่งลูกค้า (Contact)', 'contact', b.contact || '', { placeholder: 'ชื่อ / ตำแหน่ง / เบอร์โทร', full: true })}
      ${canPrice ? PM.poFiles.boxHtml(canEdit, 'ไฟล์แนบ — ใบเสนอราคา / เอกสาร Inquiry', 'ใบเสนอราคาที่ส่งให้ลูกค้า, TOR, แบบ, BOQ') : ''}
      <div class="sub-h">ประมาณราคา</div>
      ${U.field('Sector', 'sector', b.sector, { options: PM.SECTORS, full: true })}
      ${canPrice ? `${U.field('มูลค่าประมาณการ (THB)', 'value', b.value, { type: 'number', min: 0, step: 'any' })}
      ${U.field('Margin (%)', 'margin', b.margin, { type: 'number', step: 0.1 })}` : lockNote}
      ${U.field('Estimator', 'estimator', b.estimator, { options: people(), placeholder: '— เลือก —' })}
      ${U.field('จำนวนรายการ BOQ (Quantity)', 'boqItems', b.boqItems, { type: 'number', min: 0 })}
      <div class="sub-h">Timeline — Inquiry → Estimate → Proposal → Submit</div>
      ${U.field('Inquiry received', 'd_inquiry', b.dates.inquiry, { type: 'date', required: true })}
      ${U.field('Estimate started', 'd_estimate', b.dates.estimate, { type: 'date' })}
      ${U.field('Proposal started', 'd_proposal', b.dates.proposal, { type: 'date' })}
      ${U.field('Submitted', 'd_submit', b.dates.submit, { type: 'date' })}
      ${U.field('กำหนดยื่นใบเสนอราคา (Due date)', 'dueDate', b.dueDate, { type: 'date' })}
      <span></span>
      <div class="sub-h">ผลการประมูล (Award)</div>
      ${U.field('Result', 'result', b.result, { options: Object.keys(PM.BID_RESULTS).map((k) => ({ value: k, label: PM.BID_RESULTS[k] })) })}
      ${U.field('Result date', 'resultDate', b.resultDate, { type: 'date' })}
      ${U.field('หมายเหตุ', 'notes', b.notes, { type: 'textarea', full: true, rows: 2 })}`;
    let files = null;
    const form = U.modal({
      title: isNew ? 'New inquiry' : `${b.code} · ${b.name}`, body, wide: true,
      onDelete: isNew || !canEdit ? null : () => {
        PM.poFiles.remove((b.files || []).map((f) => f.path)).catch(() => { /* files may already be gone */ });
        PM.remove('bids', b.id); U.toast('ลบแล้ว'); onSaved && onSaved();
      },
      onSubmit: !canEdit ? null : (f, frm) => {
        if (f.code === V.bidNoPrefix()) { alert(`พิมพ์เลขต่อท้าย Bid No. ก่อนบันทึก (เช่น ${V.bidNoPrefix()}1)`); frm.code.focus(); return false; }
        if (PM.db.bids.some((x) => x.id !== b.id && String(x.code).trim().toUpperCase() === f.code.toUpperCase())) {
          alert(`Bid No. ${f.code} ถูกใช้แล้ว`); frm.code.focus(); return false;
        }
        const dates = { inquiry: f.d_inquiry, estimate: f.d_estimate, proposal: f.d_proposal, submit: f.d_submit };
        const order = PM.BID_STAGES.map((s) => dates[s.key]).filter(Boolean);
        if (order.some((d, i) => i && d < order[i - 1])) { alert('วันที่แต่ละขั้นต้องเรียงตามลำดับ Inquiry → Estimate → Proposal → Submit'); return false; }
        save(f, dates, frm);
        return false; // closed by save() once the files are uploaded
      },
    });
    files = canPrice ? PM.poFiles.box(form, b.files, canEdit) : null;
    if (!canEdit) { // view only
      form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
      if (document.activeElement) document.activeElement.blur();
      return;
    }
    // new inquiry: cursor at the end of the Bid No. text, ready to type the number
    if (isNew) { const c = form.code; c.focus(); c.setSelectionRange(c.value.length, c.value.length); }

    async function save(f, dates, frm) {
      const btn = frm.querySelector('[type=submit]');
      btn.disabled = true; btn.classList.add('loading');
      const { files: kept, problems } = files ? await files.commit(`bids/${b.id}`, btn) : { files: b.files, problems: [] };
      Object.assign(b, {
        code: f.code, name: f.name, client: f.client, sector: f.sector,
        estimator: f.estimator, boqItems: f.boqItems, dueDate: f.dueDate, dates, result: f.result,
        resultDate: f.result === 'pending' ? '' : f.resultDate || T, notes: f.notes,
        leadSource: f.leadSource, contact: f.contact,
      }, V.resolveSales(f.salesName, b));
      if (canPrice) Object.assign(b, { value: f.value, margin: f.margin, files: kept });
      // owner = the Sales account whose price this is: a Sales adding / editing → themselves; Admin → the Sales chosen
      if (PM.myRole() === 'sales') b.owner = (isNew ? PM.myUid() : PM.bidOwner(b)) || PM.myUid();
      else b.owner = PM.bidOwnerFor(b.sales, b.salesName);
      b.stage = V.stageOf(b);
      PM.upsert('bids', b);
      U.closeModal();
      U.toast(problems.length ? 'บันทึกแล้ว แต่ไฟล์บางไฟล์มีปัญหา' : 'บันทึกแล้ว');
      if (problems.length) alert('ไฟล์ที่ไม่สำเร็จ:\n' + problems.join('\n'));
      onSaved && onSaved(b);
    }
  };

  /* Next project number: JB{yy}-PROJ-{running 4 digits}, e.g. JB26-PROJ-0001 (restarts each year) */
  V.nextProjectCode = function () {
    const prefix = `JB${PM.today().slice(2, 4)}-PROJ-`;
    const re = new RegExp('^' + prefix + '(\\d+)$');
    const max = PM.db.projects.reduce((m, x) => { const hit = String(x.code || '').match(re); return hit ? Math.max(m, +hit[1]) : m; }, 0);
    return prefix + String(max + 1).padStart(4, '0');
  };

  /* ---------- people pickers (Project Manager, Sales): user accounts (Supabase) + employees from Resource ---------- */
  const lookupName = (id) => {
    const acc = id && (PM.team || []).find((u) => u.id === id);
    if (acc) return acc.full_name;
    const res = id && PM.find('resources', id);
    return res ? res.name : null;
  };
  V.personName = (id, fallback) => (id && lookupName(id)) || fallback || '–';
  V.pmName = (p) => V.personName(p && p.pm, p && p.pmName);
  V.salesName = (x) => V.personName(x && x.sales, x && x.salesName);
  /* ---------- Project Manager picker — based on Resource Utilization ----------
     Employees come first (discipline "Project Management" on top), each with level, utilization (last 4 weeks)
     and how many active projects they already manage. User accounts are only a fallback for people
     who are not in Resource Utilization yet. */
  V.pmLoad = function (exceptProjectId) {
    const T = PM.today();
    const ut = PM.utilization(PM.addDays(T, -27), T);
    const out = {};
    ut.people.forEach((x) => { out[x.r.id] = { util: x.util, target: x.target, projects: [] }; });
    PM.db.projects.filter((p) => p.status !== 'closed' && p.id !== exceptProjectId && p.pm).forEach((p) => {
      if (out[p.pm]) out[p.pm].projects.push(p);
    });
    return out;
  };
  /* an account id whose name matches an employee → that employee (so old projects pick up the resource data) */
  V.pmResourceId = function (id) {
    if (!id || PM.find('resources', id)) return id;
    const acc = (PM.team || []).find((u) => u.id === id);
    const r = acc && PM.db.resources.find((x) => PM.normName(x.name) === PM.normName(acc.full_name));
    return r ? r.id : id;
  };
  V.pmSelect = function (name, value, storedName, exceptProjectId) {
    value = V.pmResourceId(value);
    const load = V.pmLoad(exceptProjectId);
    const team = PM.team || [];
    const opt = (v, label) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(label)}</option>`;
    const resources = PM.db.resources.filter((r) => (r.active !== false && r.discipline !== 'Sales') || r.id === value);
    const resLabel = (r) => {
      const l = load[r.id];
      const bits = [PM.levelName(r.level)];
      if (r.discipline && r.discipline !== 'Project Management') bits.push(r.discipline);
      if (l && l.util != null) bits.push('Util ' + U.pct(l.util));
      if (l && l.projects.length) bits.push(`PM อีก ${l.projects.length} โครงการ`);
      return `${r.name} — ${bits.join(' · ')}`;
    };
    const resNames = new Set(PM.db.resources.map((r) => PM.normName(r.name)));
    const groups = [
      ['Project Management (Resource Utilization)', resources.filter((r) => r.discipline === 'Project Management').map((r) => [r.id, resLabel(r)])],
      ['พนักงานอื่น (Resource Utilization)', resources.filter((r) => r.discipline !== 'Project Management').map((r) => [r.id, resLabel(r)])],
      ['บัญชีผู้ใช้ที่ยังไม่มีใน Resource Utilization', team.filter((u) => !resNames.has(PM.normName(u.full_name))).map((u) => [u.id, `${u.full_name} · ${PM.roleLabel(u.role)}`])],
    ];
    const known = new Set(groups.flatMap((g) => g[1].map((x) => x[0])));
    return `<select name="${esc(name)}">
      <option value="">— เลือก —</option>
      ${groups.filter((g) => g[1].length).map(([label, items]) => `<optgroup label="${esc(label)}">${items.map(([v, l]) => opt(v, l)).join('')}</optgroup>`).join('')}
      ${value && !known.has(value) ? opt(value, `${lookupName(value) || storedName || 'ไม่พบรายชื่อ'} (เดิม)`) : ''}
    </select>`;
  };
  /* one line about the chosen PM, from Resource Utilization */
  V.pmInfo = function (id, exceptProjectId) {
    const r = id && PM.find('resources', id);
    if (!id) return 'รายชื่อจาก Resource Utilization — Util = ชั่วโมง billable ÷ ชั่วโมงที่ว่าง (4 สัปดาห์ล่าสุด)';
    if (!r) return 'บัญชีผู้ใช้นี้ยังไม่มีใน Resource Utilization — เพิ่มได้ที่ Resource Utilization → Add person (ชื่อเดียวกัน) เพื่อดูภาระงาน';
    const l = V.pmLoad(exceptProjectId)[r.id] || { util: null, target: 0.8, projects: [] };
    const util = l.util == null ? 'ยังไม่มี Timesheet'
      : `Util 4 สัปดาห์ ${U.pct(l.util)} (เป้า ${U.pct(l.target)})${l.util > 1.05 ? ' — งานล้น' : l.util < l.target ? ' — ยังรับงานเพิ่มได้' : ''}`;
    const prj = l.projects.length ? `เป็น PM โครงการอื่นอยู่ ${l.projects.length} โครงการ: ${l.projects.map((p) => p.code).join(', ')}` : 'ยังไม่ได้เป็น PM โครงการอื่น';
    return `${PM.levelName(r.level)} · ${r.discipline || '–'} · ${util} · ${prj}`;
  };
  /* Sales: free text with suggestions (Sales staff, user accounts, other employees, names typed before).
     A name that matches someone on the list is stored with their id; anything else is kept as the typed name. */
  const salesCandidates = () => {
    const team = PM.team || [];
    const res = PM.db.resources.filter((r) => r.active !== false);
    const list = [
      ...res.filter((r) => r.discipline === 'Sales').map((r) => ({ id: r.id, name: r.name, note: 'Sales' })),
      ...team.map((u) => ({ id: u.id, name: u.full_name, note: 'บัญชีผู้ใช้ · ' + PM.roleLabel(u.role) })),
      ...res.filter((r) => r.discipline !== 'Sales').map((r) => ({ id: r.id, name: r.name, note: r.discipline || 'พนักงาน' })),
      ...PM.db.bids.concat(PM.db.projects).filter((x) => !x.sales && x.salesName).map((x) => ({ id: '', name: x.salesName, note: 'เคยกรอกไว้' })),
    ];
    const seen = new Set();
    return list.filter((c) => { const k = PM.normName(c.name); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  };
  V.salesInput = function (x) {
    const opts = salesCandidates();
    return `<input name="salesName" list="dl-sales" value="${esc(V.salesName(x) === '–' ? '' : V.salesName(x))}" placeholder="พิมพ์ชื่อ หรือเลือกจากรายชื่อ" autocomplete="off">
      <datalist id="dl-sales">${opts.map((c) => `<option value="${esc(c.name)}">${esc(c.note)}</option>`).join('')}</datalist>`;
  };
  /* typed name → { sales: id or '', salesName } ; keeps the previous id when the name did not change */
  V.resolveSales = function (typed, prev) {
    const name = String(typed || '').trim().replace(/\s+/g, ' ');
    if (!name) return { sales: '', salesName: '' };
    const k = PM.normName(name);
    if (prev && prev.sales && PM.normName(V.salesName(prev)) === k) return { sales: prev.sales, salesName: lookupName(prev.sales) || name };
    const hit = salesCandidates().find((c) => c.id && PM.normName(c.name) === k);
    return hit ? { sales: hit.id, salesName: hit.name } : { sales: '', salesName: name };
  };

  /* Sales performance table (Bidding page + Dashboard). rows = PM.salesStats(); selected = highlighted id */
  V.salesTable = function (rows, selected) {
    if (!rows.length) return '<p class="empty">ยังไม่มีข้อมูล Sales — เพิ่มพนักงาน Discipline = Sales ที่ Resource Utilization แล้วเลือก Sales ในแต่ละ Bid</p>';
    // money of a Sales row only when every bid in it is one this user may see (Admin: all · Sales: their own row)
    const rowPrices = (x) => x.bids.length > 0 && x.bids.every(PM.canSeeBidPrice);
    rows = rows.slice().sort((a, b) => (b.bs.won - a.bs.won) || (b.bs.total - a.bs.total));
    return `<table class="tbl"><thead><tr><th>Sales</th><th class="num">Inquiries</th><th class="num">ยื่นใบเสนอราคา</th><th class="num">Won / Lost</th><th class="num">Win rate</th>
      <th class="num">Won value</th><th class="num">Pipeline (รอผล)</th><th>โครงการที่รับผิดชอบ</th><th class="num">มูลค่าโครงการ Active</th></tr></thead><tbody>
      ${rows.map((x) => `<tr class="click sales-row${selected != null && selected === x.id ? ' on' : ''}" data-sales="${esc(x.id || '-')}">
        <td><span class="title">${x.id ? esc(V.personName(x.id, x.fallbackName)) : '<span class="muted">ไม่ระบุ Sales</span>'}</span></td>
        <td class="num">${x.bs.total}</td><td class="num">${x.bs.submitted}</td>
        <td class="num">${x.bs.won} / ${x.bs.lost}</td><td class="num">${U.pct(x.bs.winRate)}</td>
        <td class="num">${rowPrices(x) ? U.money(x.bs.wonValue) : V.LOCK_PRICE}</td>
        <td class="num">${rowPrices(x) ? U.money(x.pipelineValue) : V.LOCK_PRICE}<small>${x.pipeline} งาน</small></td>
        <td>${x.active.length ? x.active.map((p) => `<a class="chip" href="#/projects/${esc(p.id)}" title="${esc(p.name)}">${esc(p.code)}</a>`).join(' ') : '<span class="muted">–</span>'}${x.projects.length > x.active.length ? `<small>ปิดแล้ว ${x.projects.length - x.active.length} โครงการ</small>` : ''}</td>
        <td class="num">${U.money(x.activeValue)}</td></tr>`).join('')}
      </tbody></table>`;
  };

  /* name to store next to the id, so it still shows offline / after the account is gone */
  V.personLabel = (id, prevId, prevName) => (!id ? '' : lookupName(id) || (id === prevId ? prevName || '' : ''));

  /* change a project's plan cost and keep the phase split (proportional; default split if no phase budget yet) */
  PM.rescaleBudgets = function (p, total) {
    const current = PM.sum(p.phases, (ph) => ph.budget || 0);
    p.phases.forEach((ph) => {
      const share = current > 0 ? (ph.budget || 0) / current : PM.PHASE_DEFAULTS[ph.key].budget;
      ph.budget = Math.round(total * share);
    });
    p.budget = total;
  };

  /* ---------- project form ---------- */
  V.projectForm = async function (project, fromBid, onSaved) {
    await PM.roles.loadTeam(); // user accounts for the Project Manager list
    const T = PM.today();
    const isNew = !project;
    const p = project || {
      id: PM.uid('P'), code: V.nextProjectCode(),
      name: fromBid ? fromBid.name : '', client: fromBid ? fromBid.client : '',
      // the bid's value only when this user may see it — otherwise the PM types the contract value in
      contractValue: fromBid && PM.canSeeBidPrice(fromBid) ? fromBid.value || 0 : 0,
      budget: fromBid && PM.canSeeBidPrice(fromBid) ? Math.round((fromBid.value || 0) * (1 - (fromBid.margin || 10) / 100)) : 0,
      startDate: T, endDate: PM.addDays(T, 365), pm: '', status: 'active', bidId: fromBid ? fromBid.id : null, phases: null, progressLog: [],
      sales: fromBid ? fromBid.sales || '' : '', salesName: fromBid ? fromBid.salesName || '' : '', costMode: 'ledger',
    };
    const planNow = p.phases ? PM.sum(p.phases, (ph) => ph.budget || 0) : p.budget;
    const actualNow = p.phases ? PM.sum(p.phases, (ph) => ph.actualCost || 0) : 0;
    const body = `
      ${U.field('Project No.', 'code', p.code, { required: true })}
      ${U.field('Status', 'status', p.status, { options: [{ value: 'active', label: 'Active' }, { value: 'onhold', label: 'On hold' }, { value: 'closed', label: 'Closed' }] })}
      ${U.field('ชื่อโครงการ', 'name', p.name, { required: true, full: true })}
      ${U.field('ลูกค้า (Client)', 'client', p.client, { required: true, full: true })}
      <label class="full"><span>Project Manager <small class="muted">— จาก Resource Utilization</small></span>${V.pmSelect('pm', p.pm, p.pmName, p.id)}<small class="muted" id="pm-info">${esc(V.pmInfo(V.pmResourceId(p.pm), p.id))}</small></label>
      <label><span>Sales ผู้รับผิดชอบ</span>${V.salesInput(p)}<small class="muted">${fromBid && PM.salesKey(fromBid) ? `จาก ${esc(fromBid.code)} — Sales ที่หางานนี้มา` : 'พิมพ์ชื่อได้เลย หรือเลือกจากรายชื่อที่ขึ้นมา'}</small></label>
      ${U.field('มูลค่าสัญญา (THB)', 'contractValue', p.contractValue, { type: 'number', min: 0, step: 'any' })}
      ${U.field('Plan cost — งบประมาณต้นทุน (THB)', 'budget', planNow, { type: 'number', min: 0, step: 'any', hint: isNew ? 'ระบบแบ่งให้ E / P / C / Closing อัตโนมัติ (แก้รายละเอียดได้ที่ "ต้นทุน Plan / Actual")' : 'ถ้าเปลี่ยน ระบบปรับงบของแต่ละ phase ตามสัดส่วนเดิม' })}
      ${isNew ? '' : `<label><span>Actual cost — ต้นทุนจริง (THB)</span><input value="${esc(U.num(actualNow))}" disabled><small class="muted">รวมจากรายการในแท็บ "ค่าใช้จ่าย" ของโครงการ</small></label>`}
      ${U.field('Start date', 'startDate', p.startDate, { type: 'date', required: true })}
      ${U.field('Finish date', 'endDate', p.endDate, { type: 'date', required: true })}
      ${isNew ? '' : '<p class="full muted" style="margin:0">หมายเหตุ: การแก้วันที่โครงการไม่เปลี่ยนแผนของแต่ละ phase — แก้ได้ที่ตาราง EPC Phases</p>'}`;
    const form = U.modal({
      title: isNew ? (fromBid ? `Create project from ${fromBid.code}` : 'New project') : `Edit ${p.code}`, body,
      onDelete: isNew ? null : () => {
        PM.remove('projects', p.id);
        PM.db.ncrs = PM.db.ncrs.filter((n) => n.projectId !== p.id);
        PM.db.safety = PM.db.safety.filter((s) => s.projectId !== p.id);
        const pos = PM.db.pos.filter((po) => po.projectId === p.id);
        PM.poFiles.remove(pos.flatMap((po) => (po.files || []).map((f) => f.path))).catch(() => { /* best effort */ });
        PM.db.pos = PM.db.pos.filter((po) => po.projectId !== p.id);
        PM.db.costs = PM.db.costs.filter((c) => c.projectId !== p.id);
        PM.save();
        location.hash = '#/projects';
      },
      onSubmit: (f) => {
        if (f.endDate <= f.startDate) { alert('Finish date ต้องอยู่หลัง Start date'); return false; }
        if (PM.db.projects.some((x) => x.id !== p.id && String(x.code).toUpperCase() === f.code.toUpperCase())) {
          alert(`Project No. ${f.code} ถูกใช้แล้ว`); return false;
        }
        const planChanged = p.phases && Math.round(f.budget) !== Math.round(planNow);
        // names are kept next to the ids so they still show offline
        const names = Object.assign({ pmName: V.personLabel(f.pm, p.pm, p.pmName) }, V.resolveSales(f.salesName, p));
        Object.assign(p, f, names);
        if (!p.phases) p.phases = PM.buildPhases(p.startDate, p.endDate, p.budget);
        else if (planChanged) PM.rescaleBudgets(p, f.budget);
        PM.upsert('projects', p);
        if (fromBid) { fromBid.projectId = p.id; fromBid.result = 'won'; if (!fromBid.resultDate) fromBid.resultDate = T; PM.upsert('bids', fromBid); }
        U.toast('บันทึกแล้ว');
        onSaved && onSaved(p);
      },
    });
    form.pm.addEventListener('change', () => { form.querySelector('#pm-info').textContent = V.pmInfo(form.pm.value, p.id); });
  };
})();
