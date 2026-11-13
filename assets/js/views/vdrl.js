/* vdrl.js — vendor documents of a project (project tab "เอกสารผู้ขาย"): VDRL · VMDL · Vendor Print Index (VPI)
   What each vendor must submit to the client (data sheets, drawings, procedures, FAT / SAT reports, manuals …), per PO.
   One row = one document · its revisions: { rev, purpose (IFA · IFC · IFF · FA · FI …), planIssue, issued, transmittal,
   planReturn, returned, code, comment }
   State (from the last revision):
     plan     ยังไม่ส่ง          — late once the plan date has passed (a date, or "15 day after PO" counted from the PO date)
     review   รอลูกค้าตอบ        — overdue after the planned return date, or REVIEW_DAYS after issue
     resubmit ต้องแก้ไขส่งใหม่    — returned with comments / not approved; due RESUBMIT_DAYS after the return
     done     เสร็จ              — approved, or returned for information only
   Return codes: A1 · AP · 1 = approved · A2 · AN · 2 = approved with comments (revise) · RW = review with comments ·
                 A3 · NA · 3 = not approved · A4 · NR · 4 = for information
   Import: the client's VMDL / VPI Excel as it is — a document over 3–5 rows (Plan Issue · Actual Issue · Transmittal ·
           Plan Return · Actual Return, or Issue · VPCS no. · Return), revisions side by side (Issued Date · Rev · Status),
           over several sheets — or a plain list, one document per row. Matched by document number on the next import.
   Data: collection 'vdrl' = [{ id, projectId, poId, vendor, no, docNo, altNo, title, discipline, size, purpose, planDate, planText,
          revs: [], note, files: [], createdBy, createdByName }]
   Files: Storage <projectId>/vdrl/<id>. No SQL needed. */
(function () {
  const U = PM.ui, esc = U.esc;
  const REVIEW_DAYS = 14, RESUBMIT_DAYS = 14;
  const STATES = {
    plan: { label: 'ยังไม่ส่ง', level: 'neutral' },
    review: { label: 'รอลูกค้าตอบ', level: 'info' },
    resubmit: { label: 'ต้องแก้ไขส่งใหม่', level: 'warning' },
    done: { label: 'อนุมัติ / ปิดแล้ว', level: 'good' },
  };
  const CODES = [
    { key: 'approved', label: 'อนุมัติ', level: 'good', re: /^(A1|AP|1|C1|CODE\s*1|APPROVED)$/ },
    { key: 'comment', label: 'อนุมัติมีคอมเมนต์ — แก้ไขส่งใหม่', level: 'warning', re: /^(A2|AN|AC|2|C2|CODE\s*2)$/ },
    { key: 'review', label: 'ตรวจแล้วมีคอมเมนต์ — แก้ไขส่งใหม่', level: 'warning', re: /^(RW|RC|R)$/ },
    { key: 'rejected', label: 'ไม่อนุมัติ — แก้ไขส่งใหม่', level: 'critical', re: /^(A3|NA|3|C3|CODE\s*3|REJECTED|NOT APPROVED)$/ },
    { key: 'info', label: 'รับทราบ (ไม่ต้องตอบ)', level: 'neutral', re: /^(A4|NR|4|C4|CODE\s*4|FI)$/ },
  ];
  PM.VDRL_CODES = CODES;
  const PURPOSES = ['IFA', 'IFR', 'IFI', 'IFC', 'IFF', 'FA', 'FI', 'FR', 'FF', 'AB'];
  /* the usual vendor documents of a metering skid (from the Vendor Print Index the team uses) — "ใส่รายการมาตรฐาน" */
  const STANDARD = [
    ['Vendor Print Index and Schedule', 'IFI', '7 day after PO'], ['Project Schedule Plan and Progress Report', 'IFI', '15 day after PO'], ['Equipment List', 'IFA', '15 day after PO'],
    ['Specification / Datasheet of Flow Meter', 'IFA', '15 day after PO'], ['Specification / Datasheet of Flow Computer', 'IFA', '15 day after PO'],
    ['Specification / Datasheet of Pressure & Temperature Transmitter', 'IFA', '15 day after PO'], ['Sizing Calculation for Flow Meter', 'IFA', '15 day after PO'],
    ['Piping & Instrument Diagram (P&ID)', 'IFA', '15 day after PO'], ['General Arrangement Drawing', 'IFA', '15 day after PO'], ['Instrument Loop Wiring Diagram', 'IFA', '15 day after PO'],
    ['Modbus List', 'IFA', '15 day after PO'], ['Instrument Cable Schedule', 'IFA', '15 day after PO'], ['Power Consumption', 'IFA', '15 day after PO'],
    ['Inspection and Test Plan (ITP)', 'IFA', '15 day after PO'], ['Hydrostatic Test Procedure', 'IFA', '15 day after PO'], ['Factory Acceptance Test Procedure', 'IFA', '15 day before FAT'],
    ['Factory Acceptance Test Report', 'IFI', '15 day after FAT'], ['Site Acceptance Test Procedure', 'IFA', '15 day before SAT'], ['Site Acceptance Test Report', 'IFI', '15 day after SAT'],
    ['Commissioning Test Procedure', 'IFA', '15 day before commissioning'], ['Meter Calibration Report', 'IFI', 'with shipment'], ['Recommended 2 Years Spare Parts', 'IFR', 'with final document'],
    ['Operation and Maintenance Manual', 'IFF', 'with final document'], ['As-built Documents (Final Book)', 'IFF', 'with final document'],
  ];
  PM.VDRL_STANDARD = STANDARD;
  const state = U.keep('vdrl', { show: 'todo', po: '', q: '' }, ['show']);
  const listOf = (p) => (PM.db.vdrl || []).filter((x) => x.projectId === p.id);
  const codeOf = (c) => { const s = String(c || '').trim().toUpperCase(); return s ? CODES.find((k) => k.re.test(s)) || { key: 'other', label: `รหัส ${s}`, level: 'warning' } : null; };
  const hasData = (r) => !!(r && (r.issued || r.returned || r.code || r.planIssue || r.transmittal));
  const lastRev = (d) => { const rs = (d.revs || []).filter(hasData); return rs[rs.length - 1] || null; };
  /* "15 day after PO" with a PO picked → a date */
  function planOf(d) {
    if (d.planDate) return d.planDate;
    const m = String(d.planText || '').match(/(\d+)\s*(?:days?|วัน)\s*(?:after|หลัง)\s*(?:po|สั่งซื้อ)/i);
    const po = m && d.poId && PM.find('pos', d.poId);
    return po && po.poDate ? PM.addDays(po.poDate, Number(m[1])) : '';
  }
  /* where a document stands, the date that matters next, and whether that date has passed */
  PM.vdrlState = function (d, T) {
    T = T || PM.today();
    const r = lastRev(d);
    if (!r || !r.issued) { const due = (r && r.planIssue) || planOf(d); return { key: 'plan', due, late: !!due && due < T, rev: r }; }
    if (!r.returned && !r.code) { const due = r.planReturn || PM.addDays(r.issued, REVIEW_DAYS); return { key: 'review', due, late: due < T, rev: r }; }
    const c = codeOf(r.code);
    if (c && (c.key === 'approved' || c.key === 'info')) return { key: 'done', due: '', late: false, rev: r, code: c };
    if (!c) return { key: 'done', due: '', late: false, rev: r }; // returned without a code: nothing asked of us
    const due = PM.addDays(r.returned || r.issued, RESUBMIT_DAYS);
    return { key: 'resubmit', due, late: due < T, rev: r, code: c };
  };
  PM.vdrlStats = function (p, T) {
    const all = listOf(p).map((d) => ({ d, s: PM.vdrlState(d, T) }));
    const n = (fn) => all.filter(fn).length;
    return { all, total: all.length, done: n((x) => x.s.key === 'done'), plan: n((x) => x.s.key === 'plan'), review: n((x) => x.s.key === 'review'), resubmit: n((x) => x.s.key === 'resubmit'),
      latePlan: n((x) => x.s.key === 'plan' && x.s.late), lateReview: n((x) => x.s.key === 'review' && x.s.late), lateResubmit: n((x) => x.s.key === 'resubmit' && x.s.late) };
  };
  /* ---------------- link to the EPC phase registers (phase-items.js) ----------------
     Each document sits under one phase: Engineering (datasheets, drawings, calculations) · Procurement (ITP, FAT, certificates,
     manufacturing) · Construction (installation, SAT, commissioning) · Closing (manuals, as-built, spare parts).
     Saving / importing a document keeps a line in that phase's register (p.phaseItems, vdrlId) in step: number, name,
     Rev, status (ยังไม่ส่ง → ส่งพิจารณา → Return → อนุมัติ), due date, Transmittal, the client's comment. A document can also be
     tied to a line already in the register (doc.itemId) — then the line keeps its own number and name. */
  const PHASE_RULES = [
    ['closing', /manual|o\s*&\s*m\b|as-?built|final (book|doc)|dossier|spare part|training|warranty|handover|e-?file|\bmdr\b|certificate of conformity/i],
    ['construction', /site accept|\bsat\b|commissioning|installation|pre-?commission|loop check|hook-?up|erection|site (test|survey)|start-?up/i],
    ['procurement', /factory accept|\bfat\b|\bitp\b|inspection and test|inspection & test|test certificate|\bmtc\b|material (test|cert)|calibration (report|cert)|hydro(static)? test|leak test|\bndt\b|\bwps\b|\bpqr\b|welder|welding|painting|manufactur|packing|shipping|inspection|progress report/i],
  ];
  PM.vdrlPhaseOf = (title) => (PHASE_RULES.find(([, re]) => re.test(String(title || ''))) || ['engineering'])[0];
  const PHASE_LABEL = (k) => { const ph = PM.PHASES.find((x) => x.key === k); return ph ? `${ph.label} — ${ph.th}` : k; };
  PM.vdrlSync = function (p) {
    if (!p || !PM.PHASE_ITEMS) return;
    const T = PM.today(), docs = listOf(p);
    p.phaseItems = p.phaseItems || [];
    const alive = new Set(docs.map((d) => d.id));
    // a deleted document: the line it made goes with it; a line it was tied to stays, untied
    p.phaseItems = p.phaseItems.filter((x) => !(x.vdrlId && !alive.has(x.vdrlId) && x.vdrlAuto));
    p.phaseItems.forEach((x) => { if (x.vdrlId && !alive.has(x.vdrlId)) { delete x.vdrlId; delete x.vdrlAuto; } });
    docs.forEach((d) => {
      if (!d.phase || !PM.PHASE_ITEMS[d.phase]) d.phase = PM.vdrlPhaseOf(d.title);
      let it = d.itemId && p.phaseItems.find((x) => x.id === d.itemId && (!x.vdrlId || x.vdrlId === d.id));
      if (!it) it = p.phaseItems.find((x) => x.vdrlId === d.id);
      if (!it) { it = { id: PM.uid('I'), vdrlAuto: true, owner: '', note: '', files: [], log: [] }; p.phaseItems.push(it); }
      it.vdrlId = d.id; d.itemId = it.id;
      const steps = Object.keys(PM.PHASE_ITEMS[d.phase].steps), s = PM.vdrlState(d, T), r = s.rev || {};
      const status = s.key === 'plan' ? 'todo' : s.key === 'review' ? 'review' : s.key === 'resubmit' ? (steps.includes('return') ? 'return' : 'wip') : 'done';
      if (it.vdrlAuto) { it.no = d.docNo || d.no || it.no; it.name = d.title; }
      it.phase = d.phase;
      if (it.status !== status) it.log = (it.log || []).concat(Object.assign({ date: T, status, rev: r.rev || '' }, r.transmittal ? { tr: r.transmittal } : {}, status === 'return' && r.comment ? { comment: r.comment } : {}));
      it.status = status;
      it.rev = r.rev || it.rev || '';
      it.due = s.due || planOf(d) || it.due || '';
      it.doneDate = status === 'done' ? r.returned || r.issued || T : '';
      it.ref = r.transmittal || it.ref || '';
      it.comment = status === 'return' ? [r.code && `Code ${r.code}`, r.comment].filter(Boolean).join(' — ') : '';
      it.vdrlInfo = [vendorOf(d), (poOf(d) || {}).poNo].filter(Boolean).join(' · ');
    });
  };
  /* sync and save (a document changed) */
  const syncSave = (p) => { const cur = PM.find('projects', p.id) || p; PM.vdrlSync(cur); PM.save(); };
  /* a transmittal sent from the phase register for documents that came from here: the issue goes into the document */
  PM.vdrlIssued = function (p, docId, trNo, date) {
    const d = PM.find('vdrl', docId);
    if (!d) return;
    d.revs = d.revs || [];
    let r = lastRev(d);
    const back = r && (r.returned || r.code);
    if (!r || back) { // nothing yet, or the last one came back: a new revision
      const prev = r ? r.rev : '';
      const next = /^[A-Y]$/i.test(prev) ? String.fromCharCode(prev.toUpperCase().charCodeAt(0) + 1) : /^\d+$/.test(prev) ? String(Number(prev) + 1) : prev ? '' : 'A';
      const blank = d.revs.find((x) => !hasData(x));
      r = blank || { rev: next, purpose: d.purpose ? String(d.purpose).split(' / ')[0] : '' };
      if (!blank) d.revs.push(r);
      if (!r.rev) r.rev = next;
    }
    r.issued = r.issued || date;
    r.transmittal = trNo;
  };
  PM.vdrlEdit = (p, docId, done) => { const d = PM.find('vdrl', docId); if (d) vdForm(p, d, done); };

  const poOf = (d) => (d.poId ? PM.find('pos', d.poId) : null);
  const vendorOf = (d) => d.vendor || (poOf(d) || {}).supplier || '';
  const natural = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true });

  /* ---------------- the tab ---------------- */
  PM.vdrlTab = function (el, p, m, rerender) {
    const T = PM.today(), canEdit = PM.can('vdrl.edit');
    // documents from before the phase link (or added elsewhere): put them in their phase register once
    if (canEdit && listOf(p).some((d) => !d.itemId || !d.phase || !(p.phaseItems || []).some((x) => x.vdrlId === d.id))) syncSave(p);
    const s = PM.vdrlStats(p, T);
    const pos = (PM.db.pos || []).filter((x) => x.projectId === p.id);
    if (state.po && state.po !== '-' && !pos.some((x) => x.id === state.po)) state.po = '';
    const SHOW = { todo: (x) => x.s.key !== 'done', late: (x) => x.s.late, review: (x) => x.s.key === 'review', resubmit: (x) => x.s.key === 'resubmit', done: (x) => x.s.key === 'done', all: () => true };
    const list = s.all.filter((x) => (SHOW[state.show] || SHOW.todo)(x) && (!state.po || (state.po === '-' ? !x.d.poId : x.d.poId === state.po)))
      .sort((a, b) => natural(a.d.no, b.d.no) || natural(a.d.docNo, b.d.docNo));
    const late = s.latePlan + s.lateReview + s.lateResubmit;
    const pct = s.total ? s.done / s.total : null;
    el.innerHTML = `
      <div class="row">
        <p class="muted" style="margin:0">ทะเบียนเอกสารที่ผู้ขายต้องส่งลูกค้า (VDRL · Vendor Print Index) — ติดตาม Rev · Transmittal · ผลตอบกลับ (Code) · เอกสารที่ค้างหรือต้องแก้ส่งใหม่</p>
        <span class="spacer"></span>
        <button class="btn" data-vd="export"${s.total ? '' : ' disabled'}>Export Excel</button>
        ${canEdit ? '<button class="btn" data-vd="import">นำเข้าจาก Excel</button><button class="btn primary" data-vd="new">+ เพิ่มเอกสาร</button>' : ''}
      </div>
      <div class="grid cols-4">
        ${PM.common.tile({ label: 'อนุมัติ / ปิดแล้ว', value: `${s.done} <small>/ ${s.total}</small>`, sub: `<div class="pbar-wrap">${U.progress(pct || 0, null)}<span class="num">${U.pct(pct)}</span></div>`, icon: 'check' })}
        ${PM.common.tile({ label: 'ยังไม่ส่ง', value: s.plan, sub: s.latePlan ? U.badge('critical', `เลยกำหนดส่ง ${s.latePlan}`) : 'ไม่มีเอกสารเลยกำหนดส่ง', icon: 'proposal' })}
        ${PM.common.tile({ label: 'รอลูกค้าตอบ', value: s.review, sub: s.lateReview ? U.badge('warning', `เกินกำหนดตอบ ${s.lateReview}`) : `ตอบภายใน ${REVIEW_DAYS} วัน ถ้าไม่ได้ระบุ`, icon: 'clock' })}
        ${PM.common.tile({ label: 'ต้องแก้ไขส่งใหม่', value: s.resubmit, sub: s.lateResubmit ? U.badge('critical', `เลยกำหนดส่งใหม่ ${s.lateResubmit}`) : `ส่งใหม่ภายใน ${RESUBMIT_DAYS} วันหลังได้รับคืน`, icon: 'alert' })}
      </div>
      <div class="card"><div class="card-h"><h2>เอกสารผู้ขาย — ${esc(p.code)}</h2><span class="spacer"></span>
          <input type="search" id="vd-q" class="avl-q" placeholder="ค้นหาเลขที่ / ชื่อเอกสาร / Transmittal" aria-label="ค้นหาเอกสาร" value="${esc(state.q)}">
          ${pos.length ? `<select id="vd-po" aria-label="กรองตาม PO">${U.options([{ value: '', label: 'ทุก PO' }].concat(pos.map((x) => ({ value: x.id, label: `${x.poNo} · ${x.supplier || ''}` })), [{ value: '-', label: 'ไม่ระบุ PO' }]), state.po)}</select>` : ''}
          ${PM.common.seg('vdshow', [{ key: 'todo', label: `ยังไม่เสร็จ (${s.total - s.done})` }, { key: 'late', label: `เลยกำหนด (${late})` }, { key: 'review', label: `รอลูกค้า (${s.review})` }, { key: 'resubmit', label: `แก้ส่งใหม่ (${s.resubmit})` }, { key: 'done', label: `เสร็จ (${s.done})` }, { key: 'all', label: `ทั้งหมด (${s.total})` }], state.show)}
          <p>Code ที่ได้รับคืน: A1 / AP = อนุมัติ · A2 / AN / RW = มีคอมเมนต์ แก้ไขส่งใหม่ · A3 / NA = ไม่อนุมัติ · A4 / NR = รับทราบ · คลิกแถวเพื่อบันทึก Rev ใหม่ / ผลตอบกลับ / แนบไฟล์</p></div>
        <div class="card-b flush table-wrap">${list.length ? `<table class="tbl vd-table"><thead><tr><th>No.</th><th>เอกสาร</th><th>ผู้ขาย / PO</th><th>Rev ล่าสุด</th><th>ส่งลูกค้า</th><th>ผลตอบกลับ</th><th>สถานะ</th><th class="num">ไฟล์</th></tr></thead><tbody>
          ${list.map(({ d, s: st }) => { const r = st.rev || {}, po = poOf(d); return `<tr class="click${st.late ? ' pl-late' : ''}" data-vd-row="${esc(d.id)}" data-q="${esc(`${d.no} ${d.docNo} ${d.altNo || ''} ${d.title} ${(d.revs || []).map((x) => x.transmittal).join(' ')}`.toLowerCase())}">
            <td class="num">${esc(d.no || '–')}</td>
            <td><span class="title">${esc(d.title || '–')}</span><small>${esc([d.docNo, d.altNo].filter(Boolean).join(' · ') || '–')}</small>${d.phase ? `<small class="muted">ทะเบียน ${esc((PM.PHASES.find((x) => x.key === d.phase) || {}).label || d.phase)}</small>` : ''}</td>
            <td>${esc(vendorOf(d) || '–')}${po ? `<small>${esc(po.poNo)}</small>` : ''}</td>
            <td class="nowrap">${r.rev ? `<b>${esc(r.rev)}</b>` : '–'}${r.purpose || d.purpose ? `<small>${esc(r.purpose || d.purpose)}</small>` : ''}</td>
            <td class="nowrap">${r.issued ? U.date(r.issued) : '–'}${r.transmittal ? `<small>${esc(r.transmittal)}</small>` : ''}</td>
            <td class="nowrap">${st.code ? `${U.badge(st.code.level, r.code)}<small>${U.date(r.returned)}</small>` : r.returned ? U.date(r.returned) : '–'}</td>
            <td class="nowrap">${U.badge(STATES[st.key].level, STATES[st.key].label)}${st.due ? `<small class="${st.late ? 'neg' : ''}">${st.late ? `เลย ${PM.diffDays(st.due, T)} วัน · ` : 'กำหนด '}${U.date(st.due)}</small>` : ''}</td>
            <td class="num">${(d.files || []).length ? `📎 ${d.files.length}` : '–'}</td></tr>`; }).join('')}
          </tbody></table><p class="empty" id="vd-none" hidden>ไม่พบเอกสารที่ตรงกับคำค้นหา</p>` : s.total ? '<p class="empty">ไม่มีเอกสารในมุมมองนี้</p>' : `<div class="pi-empty vd-empty"><b>ยังไม่มีทะเบียนเอกสารผู้ขาย</b>
            ${canEdit ? `<button type="button" class="btn primary" data-vd="standard">ใส่รายการมาตรฐาน (${STANDARD.length} เอกสาร)</button>
            <small class="muted">${esc(STANDARD.slice(0, 5).map((x) => x[0]).join(' · '))} …</small>
            <small class="muted">หรือ "นำเข้าจาก Excel" เลือกไฟล์ VMDL / Vendor Print Index ของลูกค้า (ลากไฟล์มาวางที่หน้านี้ได้)</small>` : ''}</div>`}</div></div>`;

    const applyQ = () => {
      const t = String(state.q || '').trim().toLowerCase();
      let shown = 0;
      el.querySelectorAll('.vd-table tr[data-q]').forEach((tr) => { const on = !t || tr.dataset.q.includes(t); tr.hidden = !on; if (on) shown++; });
      const none = el.querySelector('#vd-none'), tb = el.querySelector('.vd-table');
      if (tb) { tb.hidden = !shown; none.hidden = !!shown; }
    };
    applyQ();
    if (canEdit && PM.sheetImport) PM.sheetImport.dropOn(el, (file) => importVdrl(p, rerender, file));
    el.oninput = (e) => { if (e.target.id === 'vd-q') { state.q = e.target.value; applyQ(); } };
    el.onchange = (e) => { if (e.target.id === 'vd-po') { state.po = e.target.value; rerender(); } };
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg="vdshow"]');
      if (seg) { state.show = seg.dataset.val; rerender(); return; }
      const a = e.target.closest('[data-vd]');
      if (a) {
        if (a.dataset.vd === 'new') vdForm(p, null, rerender);
        if (a.dataset.vd === 'import') importVdrl(p, rerender);
        if (a.dataset.vd === 'export') exportVdrl(p);
        if (a.dataset.vd === 'standard') addStandard(p, rerender);
        return;
      }
      const row = e.target.closest('[data-vd-row]');
      if (row) { const d = PM.find('vdrl', row.dataset.vdRow); if (d) vdForm(p, d, rerender); }
    };
  };

  /* the standard list, numbered <project>-VD-001 … (change the numbers to the client's later); PO picked once for all */
  function addStandard(p, done) {
    const pos = (PM.db.pos || []).filter((x) => x.projectId === p.id && x.status !== 'cancelled');
    U.modal({
      title: `ใส่รายการเอกสารผู้ขายมาตรฐาน — ${p.code}`, submitLabel: `เพิ่ม ${STANDARD.length} เอกสาร`,
      body: `<p class="full muted" style="margin:0">เอกสารที่ผู้ขายส่งลูกค้าตามปกติของงาน Metering Skid — เพิ่มแล้วแก้เลขที่ / ชื่อ / กำหนดส่งให้ตรงกับ VDRL ของลูกค้า หรือลบที่ไม่ใช้</p>
        ${U.field('PO', 'poId', pos.length === 1 ? pos[0].id : '', { options: [{ value: '', label: '— ไม่ระบุ —' }].concat(pos.map((x) => ({ value: x.id, label: `${x.poNo} · ${x.supplier || ''}` }))), hint: 'กำหนดส่ง "15 day after PO" นับจากวันที่ PO นี้' })}
        ${U.field('ขึ้นต้นเลขที่เอกสาร', 'prefix', `${p.code}-VD-`)}`,
      onSubmit: (f) => {
        const u = PM.auth && PM.auth.user, have = listOf(p);
        let n = 0;
        STANDARD.forEach(([title, purpose, planText], i) => {
          if (have.some((d) => PM.normName(d.title) === PM.normName(title))) return;
          n++;
          PM.db.vdrl.push({ id: PM.uid('VD'), projectId: p.id, poId: f.poId || '', vendor: '', no: String(i + 1), docNo: `${f.prefix || ''}${String(i + 1).padStart(3, '0')}`, altNo: '', title, discipline: 'IE', size: 'A4', purpose,
            planDate: '', planText, revs: [], note: '', files: [], createdBy: u ? u.id : '', createdByName: u ? PM.auth.displayName(u) : '' });
        });
        syncSave(p); // each one also goes into its phase register
        U.toast(n ? `เพิ่ม ${n} เอกสารแล้ว` : 'มีครบแล้ว');
        done();
      },
    });
  }

  /* ---------------- one document: its fields and every revision ---------------- */
  const REV_FIELDS = [['rev', 'Rev', 'text', 52], ['purpose', 'วัตถุประสงค์', 'text', 70], ['planIssue', 'แผนส่ง', 'date'], ['issued', 'ส่งจริง', 'date'], ['transmittal', 'Transmittal', 'text', 150],
    ['planReturn', 'แผนรับคืน', 'date'], ['returned', 'รับคืน', 'date'], ['code', 'Code', 'text', 58], ['comment', 'คอมเมนต์', 'text', 160]];
  const revRow = (r, i, ro) => `<tr data-rev-row>${REV_FIELDS.map(([k, , type, w]) => `<td><input type="${type}" data-k="${k}" value="${esc(r[k] || '')}"${w ? ` style="min-width:${w}px"` : ''}${k === 'purpose' ? ' list="vd-purposes"' : ''}${ro ? ' disabled' : ''} aria-label="${esc(k)} rev ${i + 1}"></td>`).join('')}
    ${ro ? '' : '<td><button type="button" class="link-btn neg" data-rev-del aria-label="ลบ Rev นี้">ลบ</button></td>'}</tr>`;
  function vdForm(p, item, done) {
    const canEdit = PM.can('vdrl.edit');
    const u = PM.auth && PM.auth.user;
    const nextNo = () => String(listOf(p).reduce((mx, x) => Math.max(mx, parseInt(x.no, 10) || 0), 0) + 1);
    const d = item || { id: PM.uid('VD'), projectId: p.id, poId: '', vendor: '', no: nextNo(), docNo: '', altNo: '', title: '', discipline: '', size: 'A4', purpose: 'IFA', planDate: '', planText: '', revs: [{ rev: 'A', purpose: 'IFA' }], note: '', files: [] };
    const pos = (PM.db.pos || []).filter((x) => x.projectId === p.id);
    const st = PM.vdrlState(d);
    const form = U.modal({
      title: item ? `${d.docNo || d.title}` : `เพิ่มเอกสารผู้ขาย — ${p.code}`, wide: true,
      onDelete: item && canEdit ? () => { PM.poFiles.trash(`${p.id}/vdrl/${d.id}`, (d.files || []).map((f) => f.path)); PM.db.vdrl = PM.db.vdrl.filter((x) => x.id !== d.id); syncSave(p); U.toast('ลบแล้ว'); done(); } : null,
      body: `
        <datalist id="vd-purposes">${PURPOSES.map((x) => `<option value="${x}">`).join('')}</datalist>
        ${U.field('No.', 'no', d.no)}
        ${U.field('เลขที่เอกสาร (Doc. / Dwg. No.)', 'docNo', d.docNo, { required: true, placeholder: 'เช่น EMERSON-FQI-FLS-IE-0005' })}
        ${U.field('ชื่อเอกสาร', 'title', d.title, { required: true, full: true, placeholder: 'เช่น Factory Acceptance Test Procedure' })}
        ${U.field('ขั้นงาน (ทะเบียนที่เอกสารนี้ไปอยู่)', 'phase', d.phase || PM.vdrlPhaseOf(d.title), { options: PM.PHASES.map((x) => ({ value: x.key, label: PHASE_LABEL(x.key) })), hint: 'ระบบเดาจากชื่อเอกสาร — แก้ได้' })}
        ${U.field('เชื่อมกับรายการในทะเบียน', 'itemId', '', { options: [{ value: '', label: 'สร้างรายการใหม่ให้อัตโนมัติ' }] })}
        ${U.field('เลขที่อีกชุด (ของลูกค้า / ผู้ขาย)', 'altNo', d.altNo || '')}
        ${U.field('Discipline', 'discipline', d.discipline || '', { placeholder: 'เช่น IE · Mechanical · Electrical' })}
        ${U.field('PO', 'poId', d.poId || '', { options: [{ value: '', label: '— ไม่ระบุ —' }].concat(pos.map((x) => ({ value: x.id, label: `${x.poNo} · ${x.supplier || ''}` }))) })}
        ${U.field('ผู้ขาย', 'vendor', d.vendor || '', { placeholder: 'เว้นว่าง = ผู้ขายของ PO' })}
        ${U.field('ขนาด / หน้า', 'size', d.size || '', { placeholder: 'A4 · 49 หน้า' })}
        ${U.field('วัตถุประสงค์ (Purpose)', 'purpose', d.purpose || '', { placeholder: 'IFA / IFC / IFF' })}
        ${U.field('กำหนดส่งครั้งแรก', 'planDate', d.planDate || '', { type: 'date' })}
        ${U.field('กำหนดส่ง (ข้อความ)', 'planText', d.planText || '', { placeholder: 'เช่น 15 day after PO — ใช้วันที่ PO คำนวณให้' })}
        <div class="full"><div class="vd-revs-h"><b>Revision</b> <span class="muted">${item ? `สถานะตอนนี้: ${U.badge(STATES[st.key].level, STATES[st.key].label)}${st.due ? ` · กำหนด ${U.date(st.due)}` : ''}` : ''}</span><span class="spacer"></span>
          ${canEdit ? '<button type="button" class="btn sm" data-rev-add>+ Rev ใหม่</button>' : ''}</div>
          <div class="table-wrap"><table class="tbl vd-revs"><thead><tr>${REV_FIELDS.map(([, l]) => `<th>${esc(l)}</th>`).join('')}${canEdit ? '<th></th>' : ''}</tr></thead>
            <tbody>${(d.revs || []).map((r, i) => revRow(r, i, !canEdit)).join('')}</tbody></table></div>
          <small class="muted">ส่งแล้วใส่วันที่ "ส่งจริง" + Transmittal · ลูกค้าตอบกลับใส่วันที่ "รับคืน" + Code · Code ที่ต้องแก้ (A2 · A3 · RW · NA) ระบบนับกำหนดส่งใหม่ ${RESUBMIT_DAYS} วัน</small></div>
        ${U.field('หมายเหตุ', 'note', d.note || '', { full: true })}
        ${PM.poFiles.boxHtml(canEdit, 'ไฟล์เอกสาร', 'ไฟล์ที่ส่ง · ฉบับที่ลูกค้าตอบกลับ (มีคอมเมนต์)', 'vdrl')}`,
      onSubmit: !canEdit ? null : (f, frm) => {
        const revs = Array.from(frm.querySelectorAll('[data-rev-row]')).map((tr) => {
          const r = {};
          tr.querySelectorAll('[data-k]').forEach((i) => { const v = i.value.trim(); if (v) r[i.dataset.k] = i.dataset.k === 'code' || i.dataset.k === 'rev' || i.dataset.k === 'purpose' ? v.toUpperCase() : v; });
          return r;
        }).filter((r) => Object.keys(r).length);
        const bad = revs.find((r) => r.returned && r.issued && r.returned < r.issued);
        if (bad) { U.alert(`Rev ${bad.rev || ''}: วันที่รับคืนก่อนวันที่ส่ง`); return false; }
        if (listOf(p).some((x) => x.id !== d.id && PM.normName(x.docNo) === PM.normName(f.docNo))) { U.alert(`เลขที่เอกสาร ${f.docNo} มีอยู่แล้ว`); return false; }
        (async () => {
          const btn = frm.querySelector('[type=submit]'); btn.disabled = true; btn.classList.add('loading');
          const r = await files.commit(`${p.id}/vdrl/${d.id}`, btn);
          ['no', 'docNo', 'title', 'altNo', 'discipline', 'poId', 'vendor', 'size', 'purpose', 'planDate', 'planText', 'note', 'phase'].forEach((k) => { d[k] = f[k] || ''; });
          Object.assign(d, { revs, files: r.files });
          // tied to a line of the register: that line, else a new one (vdrlSync)
          const cur = PM.find('projects', p.id) || p, mine = (cur.phaseItems || []).find((x) => x.vdrlId === d.id);
          if (f.itemId && (!mine || mine.id !== f.itemId)) { if (mine && mine.vdrlAuto) cur.phaseItems = cur.phaseItems.filter((x) => x !== mine); else if (mine) delete mine.vdrlId; d.itemId = f.itemId; }
          else if (!f.itemId && mine && !mine.vdrlAuto) { delete mine.vdrlId; d.itemId = ''; }
          if (!item) Object.assign(d, { createdBy: u ? u.id : '', createdByName: u ? PM.auth.displayName(u) : '' });
          if (!PM.db.vdrl.includes(d)) PM.db.vdrl.push(d);
          syncSave(p);
          U.closeModal();
          U.toast(r.problems.length ? 'บันทึกแล้ว แต่ไฟล์บางไฟล์มีปัญหา' : 'บันทึกแล้ว');
          if (r.problems.length) U.alert('ไฟล์ที่ไม่สำเร็จ:\n' + r.problems.join('\n'));
          done();
        })();
        return false;
      },
    });
    // lines of the chosen phase's register that no other document holds — "Equipment Specification & Datasheet" from the standard list …
    const fillLinks = () => {
      const cur = PM.find('projects', p.id) || p, key = form.phase.value;
      const mine = (cur.phaseItems || []).find((x) => x.vdrlId === d.id && !x.vdrlAuto);
      const free = (cur.phaseItems || []).filter((x) => x.phase === key && (!x.vdrlId || x.vdrlId === d.id) && !x.vdrlAuto)
        .sort((a, b) => String(a.no).localeCompare(String(b.no), undefined, { numeric: true }));
      form.itemId.innerHTML = [`<option value="">สร้างรายการใหม่ในทะเบียน${esc(PM.PHASE_ITEMS[key] ? PM.PHASE_ITEMS[key].title : '')} ให้อัตโนมัติ</option>`]
        .concat(free.map((x) => `<option value="${esc(x.id)}"${mine && mine.id === x.id ? ' selected' : ''}>${esc(x.no)} · ${esc(x.name)}</option>`)).join('');
    };
    fillLinks();
    form.phase.addEventListener('change', fillLinks);
    if (!item) form.title.addEventListener('change', () => { form.phase.value = PM.vdrlPhaseOf(form.title.value); fillLinks(); });
    const tbody = form.querySelector('.vd-revs tbody');
    form.addEventListener('click', (e) => {
      if (e.target.closest('[data-rev-add]')) {
        const rows = tbody.querySelectorAll('[data-rev-row]'), last = rows[rows.length - 1];
        const prev = last ? last.querySelector('[data-k="rev"]').value.trim() : '';
        const next = /^[A-Y]$/i.test(prev) ? String.fromCharCode(prev.toUpperCase().charCodeAt(0) + 1) : /^\d+$/.test(prev) ? String(Number(prev) + 1) : prev ? '' : 'A';
        tbody.insertAdjacentHTML('beforeend', revRow({ rev: next, purpose: last ? last.querySelector('[data-k="purpose"]').value : 'IFA', planIssue: PM.today() }, rows.length, false));
        return;
      }
      const del = e.target.closest('[data-rev-del]');
      if (del) del.closest('tr').remove();
    });
    const files = PM.poFiles.box(form, d.files, canEdit, 'vdrl');
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
  }

  /* ---------------- reading the client's VMDL / VPI ---------------- */
  const N = (v) => String(v == null ? '' : v).replace(/[]/g, '').replace(/\s+/g, ' ').trim();
  const low = (v) => N(v).toLowerCase();
  const LABEL = /^(plan issue|actual issue|issue|issued|transmittal(?: no\.?)?|vpcs(?: no\.?)?|plan return|actual return|return|returned)$/i;
  const DOCNO = /[A-Z]{2,}[\w.]*-[\w.-]*\d/;
  const toDate = (v) => (v == null || v === '' ? '' : PM.sheetImport.parseDate(v) || '');
  /* rows of one sheet → documents [{ no, docNo, altNo, title, discipline, size, purpose, planDate, planText, revs }] */
  PM.vdrlParse = function (rows) {
    let h = -1;
    for (let i = 0; i < Math.min(rows.length, 60) && h < 0; i++) {
      const r = rows[i] || [];
      const title = r.some((c) => /document|drawing|title|description|ชื่อเอกสาร/.test(low(c)) && !/no\.?$/.test(low(c)));
      const no = r.some((c) => /(doc|dwg|document|drawing)\.?\s*(?:\/\s*dwg\.?\s*)?no|เลขที่เอกสาร/.test(low(c)));
      if (title && no) h = i;
    }
    if (h < 0) return { docs: [], error: 'ไม่พบหัวตาราง — ต้องมีคอลัมน์เลขที่เอกสาร (Doc. / Dwg. No.) และชื่อเอกสาร (Document / Title)' };
    // header lines: the header row and the lines under it that hold no data yet
    let end = h + 1;
    while (end < Math.min(rows.length, h + 4) && !(rows[end] || []).some((c) => DOCNO.test(N(c)) || toDate(c) && typeof c !== 'number' && /\d{4}-\d\d-\d\d/.test(String(c)))) end++;
    const width = Math.max(...rows.slice(h, Math.min(rows.length, h + 80)).map((r) => (r || []).length), 0);
    const head = Array.from({ length: width }, (_, c) => rows.slice(h, end).map((r) => low((r || [])[c])).filter(Boolean).join(' '));
    const col = (re, not) => head.findIndex((t) => re.test(t) && !(not && not.test(t)));
    const C = {
      no: col(/^(serial|no\.?)\b|^no\.? |ลำดับ/, /doc|dwg|transmittal|vpcs/), doc: col(/(doc|dwg)\.?\s*(?:\/\s*dwg\.?\s*)?no|เลขที่เอกสาร/),
      title: col(/document|drawing|title|description|ชื่อเอกสาร/, /(doc|dwg)\.?\s*(\/\s*dwg\.?\s*)?no/), discipline: col(/discipline/), size: col(/size|form/), page: col(/^page|\bpage\b/),
      purpose: col(/purpose/), plan: col(/plan date|first issue/),
    };
    // the column of row labels (Issue / Return …), found from the data itself
    const counts = {};
    rows.slice(end, end + 120).forEach((r) => (r || []).forEach((c, i) => { if (LABEL.test(N(c))) counts[i] = (counts[i] || 0) + 1; }));
    const labelCol = Object.keys(counts).map(Number).sort((a, b) => counts[b] - counts[a])[0];
    const hasLabels = labelCol !== undefined && counts[labelCol] >= 2;
    // revision groups: Issued Date · Rev · Status, side by side
    const groups = [];
    head.forEach((t, c) => { if (c !== C.plan && /issued? date|\bdate\b/.test(t) && !/plan date/.test(t) && /rev|code/.test(head[c + 1] || '') && (!hasLabels || c > labelCol)) groups.push({ d: c, r: c + 1, s: c + 2 }); });
    const docs = [];
    const blank = () => ({ no: '', docNo: '', altNo: '', title: '', discipline: '', size: '', purpose: '', planDate: '', planText: '', revs: groups.map(() => ({})), lines: [] });
    const take = (doc, r, line) => {
      const val = (c) => (c >= 0 ? N(r[c]) : '');
      if (C.no >= 0 && /^\d+$/.test(val(C.no)) && !doc.no) doc.no = val(C.no);
      const dn = val(C.doc);
      // a second number under the first (the client's / vendor's own) — only something that looks like a document number,
      // not the "Checked by :" / "Approved by :" lines under the table
      if (dn && !/:\s*$/.test(dn)) { if (!doc.docNo) doc.docNo = dn; else if (dn !== doc.docNo && !doc.altNo && DOCNO.test(dn)) doc.altNo = dn; }
      if (!doc.title && val(C.title) && !LABEL.test(val(C.title))) doc.title = val(C.title);
      if (!doc.discipline && val(C.discipline)) doc.discipline = val(C.discipline);
      if (!doc.purpose && C.purpose >= 0 && N(r[C.purpose])) doc.purpose = String(r[C.purpose]).split(/\s*[\n/]\s*/).map((x) => x.trim()).filter(Boolean).join(' / ');
      if (val(C.size) && !doc.size.includes(val(C.size))) doc.size = [doc.size, val(C.size)].filter(Boolean).join(' · ');
      if (C.page >= 0 && C.page !== C.size && val(C.page)) doc.size = [doc.size, `${val(C.page)} หน้า`].filter(Boolean).join(' · ');
      if (C.plan >= 0 && r[C.plan] !== '' && r[C.plan] != null) {
        const dt = typeof r[C.plan] === 'number' || /\d/.test(val(C.plan)) ? toDate(r[C.plan]) : '';
        if (dt && !doc.planDate) doc.planDate = dt; else if (!dt) doc.planText = [doc.planText, val(C.plan)].filter(Boolean).join(' ');
      }
      const kind = hasLabels ? low(r[labelCol]) : 'row';
      groups.forEach((g, i) => {
        const rv = doc.revs[i], dv = r[g.d], code = N(r[g.r]), stv = N(r[g.s]);
        if (/plan issue/.test(kind)) { rv.planIssue = rv.planIssue || toDate(dv); if (code) rv.rev = rv.rev || code; if (stv) rv.purpose = rv.purpose || stv; }
        else if (/^(actual issue|issue|issued)$/.test(kind)) { rv.issued = toDate(dv) || rv.issued; if (code) rv.rev = rv.rev || code; if (stv) rv.purpose = rv.purpose || stv; }
        else if (/transmittal|vpcs/.test(kind)) { if (N(dv) && !/^vpcs no\.?$/i.test(N(dv))) rv.transmittal = N(dv); }
        else if (/plan return/.test(kind)) rv.planReturn = toDate(dv);
        else if (/^(actual return|return|returned)$/.test(kind)) { rv.returned = toDate(dv); if (code) rv.code = code.toUpperCase(); }
      });
      doc.lines.push(line);
    };
    let cur = null;
    for (let i = end; i < rows.length; i++) {
      const r = rows[i] || [];
      if (!r.some((c) => N(c))) continue;
      const kind = hasLabels ? low(r[labelCol]) : '';
      const starts = hasLabels ? /^(plan issue|issue)$/.test(kind) || (!cur && kind) : true;
      if (starts) { if (cur) docs.push(cur); cur = blank(); }
      if (!cur) continue;
      take(cur, r, i + 1);
      if (!hasLabels) { // a plain list: Rev / issued / returned / code in their own columns
        const pick = (re) => { const c = head.findIndex((t) => re.test(t)); return c >= 0 ? N(r[c]) : ''; };
        const rev = { rev: pick(/^rev/), issued: toDate(pick(/issue.*date|submit|ส่ง/)), transmittal: pick(/transmittal/), returned: toDate(pick(/return.*date|รับคืน/)), code: pick(/code|result|ผล/).toUpperCase() };
        cur.revs = hasData(rev) || rev.rev ? [rev] : [];
      }
    }
    if (cur) docs.push(cur);
    // a document has a number (or, in a list without numbers, a serial and something issued) — what is under the table
    // ("APPROVED BY :", a form number) does not
    const real = (d) => d.docNo || (d.no && d.title && d.revs.some(hasData));
    const out = docs.filter(real).map((d) => Object.assign(d, { revs: d.revs.filter((r) => hasData(r) || r.rev).map((r) => Object.assign({ rev: '', purpose: '' }, r)) }));
    return { docs: out, header: h + 1, groups: groups.length, labels: hasLabels };
  };

  function importVdrl(p, done, firstFile) {
    const canEdit = PM.can('vdrl.edit');
    if (!canEdit) return;
    const pos = (PM.db.pos || []).filter((x) => x.projectId === p.id);
    const st = { name: '', docs: [], sheets: [] }; // sheets: [{ name, title, docs, on }] — a file may hold an old project's sheets too
    const form = U.modal({
      title: `นำเข้าเอกสารผู้ขาย — ${p.code}`, wide: true, submitLabel: 'นำเข้า',
      body: `<p class="full muted" style="margin:0">เลือกไฟล์ VMDL / Vendor Print Index (VPI) ของลูกค้าได้ทั้งไฟล์ — ระบบอ่านทุกชีต หาหัวตาราง แถว Plan Issue / Actual Issue / Transmittal / Return และ Rev ที่วางเรียงไปทางขวาให้เอง · เอกสารที่มีเลขที่ตรงกับของเดิมจะอัปเดต</p>
        <div class="full imp-drop" data-imp-drop tabindex="0" role="button" aria-label="เลือกไฟล์ Excel"><b>ลากไฟล์ Excel มาวางที่นี่</b><span>หรือ <u>เลือกไฟล์</u> (.xlsx, .ods, .csv)</span><input type="file" accept=".xlsx,.xlsm,.ods,.csv" data-imp-file hidden></div>
        ${U.field('PO ของเอกสารชุดนี้', 'poId', '', { options: [{ value: '', label: '— ไม่ระบุ —' }].concat(pos.map((x) => ({ value: x.id, label: `${x.poNo} · ${x.supplier || ''}` }))), hint: 'ใช้คำนวณกำหนดส่งแบบ "15 day after PO" และบอกผู้ขาย' })}
        ${U.field('ผู้ขาย', 'vendor', '', { placeholder: 'เว้นว่าง = ผู้ขายของ PO' })}
        <div class="full" data-vd-work></div>`,
      onSubmit: (f) => {
        if (!st.docs.length) { U.alert('ยังไม่ได้เลือกไฟล์ หรือไม่พบเอกสารในไฟล์'); return false; }
        const before = JSON.parse(JSON.stringify(listOf(p)));
        const u = PM.auth && PM.auth.user;
        let added = 0, updated = 0;
        st.docs.forEach((x) => {
          const old = listOf(p).find((d) => x.docNo && PM.normName(d.docNo) === PM.normName(x.docNo)) || listOf(p).find((d) => !x.docNo && PM.normName(d.title) === PM.normName(x.title));
          const fields = { no: x.no, docNo: x.docNo, altNo: x.altNo, title: x.title, discipline: x.discipline, size: x.size, purpose: x.purpose, planDate: x.planDate, planText: x.planText };
          if (old) {
            Object.keys(fields).forEach((k) => { if (fields[k]) old[k] = fields[k]; });
            if (f.poId) old.poId = f.poId;
            if (f.vendor) old.vendor = f.vendor;
            // the file's revisions win; a revision only kept in the app stays
            const byRev = new Map((old.revs || []).map((r) => [String(r.rev || '').toUpperCase(), r]));
            x.revs.forEach((r) => { const k = String(r.rev || '').toUpperCase(), o = byRev.get(k); if (o) Object.keys(r).forEach((kk) => { if (r[kk]) o[kk] = r[kk]; }); else byRev.set(k || PM.uid('r'), Object.assign({}, r)); });
            old.revs = Array.from(byRev.values());
            updated++;
          } else {
            PM.db.vdrl.push(Object.assign({ id: PM.uid('VD'), projectId: p.id, poId: f.poId || '', vendor: f.vendor || '', note: '', files: [], createdBy: u ? u.id : '', createdByName: u ? PM.auth.displayName(u) : '' }, fields, { revs: x.revs, phase: PM.vdrlPhaseOf(x.title) }));
            added++;
          }
        });
        syncSave(p); // every document also lands in its phase register (Engineering · Procurement · Construction · Closing)
        U.closeModal();
        const byPhase = PM.PHASES.map((ph) => [ph.label, st.docs.filter((x) => (listOf(p).find((d) => PM.normName(d.docNo || d.title) === PM.normName(x.docNo || x.title)) || {}).phase === ph.key).length]).filter(([, n]) => n);
        const m = U.modal({ title: 'นำเข้าแล้ว', body: `<p class="full" style="margin:0">เพิ่ม ${added} · อัปเดต ${updated} เอกสาร จาก ${esc(st.name)}</p>
          <p class="full muted" style="margin:0">อยู่ในทะเบียนของขั้นงาน: ${esc(byPhase.map(([l, n]) => `${l} ${n}`).join(' · '))} — ดูได้ที่แท็บภาพรวม & EPC</p>
          <div class="full"><button type="button" class="btn danger" data-imp-undo>ยกเลิกการนำเข้ารอบนี้</button></div>` });
        m.querySelector('[data-imp-undo]').addEventListener('click', () => { PM.db.vdrl = PM.db.vdrl.filter((x) => x.projectId !== p.id).concat(before); syncSave(p); U.closeModal(); U.toast('ยกเลิกการนำเข้าแล้ว'); done(); });
        done();
        return false;
      },
    });
    const work = form.querySelector('[data-vd-work]'), drop = form.querySelector('[data-imp-drop]'), input = form.querySelector('[data-imp-file]');
    const merge = () => {
      const seen = new Map();
      st.sheets.filter((s) => s.on).forEach((s) => s.docs.forEach((x) => { const k = PM.normName(x.docNo || x.title); if (!seen.has(k)) seen.set(k, x); }));
      st.docs = Array.from(seen.values());
    };
    const show = () => {
      merge();
      const have = listOf(p);
      const isOld = (x) => have.some((d) => (x.docNo && PM.normName(d.docNo) === PM.normName(x.docNo)) || (!x.docNo && PM.normName(d.title) === PM.normName(x.title)));
      const nNew = st.docs.filter((x) => !isOld(x)).length;
      work.innerHTML = `${st.sheets.length > 1 ? `<div class="vd-sheets"><b>ชีตที่นำเข้า</b> <span class="muted">ไฟล์ของลูกค้าบางไฟล์มีชีตของโครงการเก่าติดมา — ติ๊กเฉพาะชีตของโครงการนี้</span>
          ${st.sheets.map((s, i) => `<label class="avl-chk"><input type="checkbox" data-vd-sheet="${i}"${s.on ? ' checked' : ''}><span>${esc(s.name)} · ${s.docs.length} เอกสาร${s.title ? `<small>${esc(s.title)}</small>` : ''}</span></label>`).join('')}</div>` : ''}
        ${st.docs.length ? `<div class="imp-sum">${U.badge('neutral', `${st.docs.length} เอกสาร`)} ${U.badge('good', `เพิ่มใหม่ ${nNew}`)} ${st.docs.length - nNew ? U.badge('info', `อัปเดต ${st.docs.length - nNew}`) : ''}
          ${U.badge('neutral', `Rev ที่อ่านได้ ${st.docs.reduce((a, x) => a + x.revs.length, 0)}`)}</div>
        <div class="table-wrap imp-table"><table class="tbl"><thead><tr><th class="num">No.</th><th>เลขที่ / ชื่อเอกสาร</th><th>ไปอยู่ทะเบียน</th><th>Purpose</th><th>กำหนดส่ง</th><th>Rev ที่อ่านได้</th><th>ผล</th></tr></thead><tbody>
          ${st.docs.map((x) => { const s = PM.vdrlState(Object.assign({}, x, { poId: form.poId.value })), old = have.find((d) => (x.docNo && PM.normName(d.docNo) === PM.normName(x.docNo))), ph = (old && old.phase) || PM.vdrlPhaseOf(x.title);
            return `<tr><td class="num">${esc(x.no || '–')}</td><td><span class="title">${esc(x.title || '–')}</span><small>${esc([x.docNo, x.altNo].filter(Boolean).join(' · '))}</small></td>
            <td><span class="chip">${esc((PM.PHASES.find((y) => y.key === ph) || {}).label || ph)}</span></td>
            <td>${esc(x.purpose || '–')}</td><td class="nowrap">${x.planDate ? U.date(x.planDate) : esc(x.planText || '–')}</td>
            <td>${x.revs.map((r) => `<span class="chip">${esc(r.rev || '?')}${r.issued ? ` · ส่ง ${U.date(r.issued)}` : ''}${r.code ? ` · ${esc(r.code)}` : ''}</span>`).join(' ') || '–'}</td>
            <td>${U.badge(STATES[s.key].level, STATES[s.key].label)} ${isOld(x) ? U.badge('info', 'อัปเดต') : U.badge('good', 'ใหม่')}</td></tr>`; }).join('')}
        </tbody></table></div>` : '<p class="empty">ยังไม่ได้เลือกชีต</p>'}`;
    };
    const take = async (file) => {
      if (!file) return;
      try {
        const sheets = await PM.sheetImport.readFile(file);
        let err = '';
        const found = [];
        sheets.forEach((s) => {
          const r = PM.vdrlParse(s.rows);
          if (r.error) { err = err || r.error; return; }
          // the project named at the top of the sheet helps tell this project's sheet from an old one
          const title = (s.rows.slice(0, Math.max(0, r.header - 1)).flat().map(N).find((t) => /project/i.test(t) && t.length > 12 && !/doc|dwg/i.test(t)) || '');
          if (r.docs.length) found.push({ name: s.name, title, docs: r.docs, on: true });
        });
        // sheets that name this project (or its client) are ticked, the others not — when at least one does
        const words = `${p.name || ''} ${p.client || ''} ${p.code || ''}`.toLowerCase().split(/[^a-z0-9ก-๙]+/).filter((w) => w.length >= 4);
        const score = (s) => words.filter((w) => s.title.toLowerCase().includes(w)).length;
        if (found.length > 1 && found.some((s) => score(s) > 0)) found.forEach((s) => { s.on = score(s) > 0; });
        Object.assign(st, { name: file.name || 'ไฟล์', sheets: found });
        if (!found.length) { U.alert(err || 'ไม่พบเอกสารในไฟล์นี้'); return; }
        drop.classList.add('slim');
        show();
      } catch (e) { U.alert(e.message || 'เปิดไฟล์ไม่สำเร็จ'); }
    };
    drop.addEventListener('click', () => input.click());
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', () => { take(input.files[0]); input.value = ''; });
    form.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('hot'); });
    form.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('hot'); take(e.dataTransfer.files[0]); });
    form.poId.addEventListener('change', show);
    work.addEventListener('change', (e) => { const c = e.target.closest('[data-vd-sheet]'); if (c) { st.sheets[Number(c.dataset.vdSheet)].on = c.checked; show(); } });
    if (firstFile) take(firstFile);
  }

  function exportVdrl(p) {
    const T = PM.today();
    const rows = listOf(p).slice().sort((a, b) => natural(a.no, b.no)).flatMap((d) => {
      const s = PM.vdrlState(d, T), po = poOf(d), revs = (d.revs || []).length ? d.revs : [{}];
      return revs.map((r, i) => [i ? '' : d.no, i ? '' : d.docNo, i ? '' : d.title, i ? '' : vendorOf(d), i ? '' : po ? po.poNo : '', r.rev || '', r.purpose || '', r.planIssue || '', r.issued || '', r.transmittal || '', r.planReturn || '', r.returned || '', r.code || '', r.comment || '', i ? '' : STATES[s.key].label, i ? '' : s.due || '']);
    });
    PM.xport.excel({
      filename: `VDRL ${p.code} ${T}`, title: `Vendor Document Register — ${p.code}`, subtitle: p.name,
      sheets: [{ name: 'VDRL', columns: [{ header: 'No.', width: 6 }, { header: 'Doc. No.', width: 30 }, { header: 'Title', width: 44 }, { header: 'Vendor', width: 22 }, { header: 'PO', width: 14 },
        { header: 'Rev', width: 6 }, { header: 'Purpose', width: 9 }, { header: 'Plan Issue', type: 'date' }, { header: 'Issued', type: 'date' }, { header: 'Transmittal', width: 24 }, { header: 'Plan Return', type: 'date' },
        { header: 'Returned', type: 'date' }, { header: 'Code', width: 7 }, { header: 'Comment', width: 30 }, { header: 'สถานะ', width: 18 }, { header: 'กำหนดถัดไป', type: 'date' }], rows }],
    });
  }

  /* demo: the metering project's vendor documents at different stages */
  PM.buildSampleVdrl = function (db, T) {
    const out = [];
    db.projects.filter((p) => p.status !== 'closed').slice(0, 2).forEach((p, pi) => {
      const po = (db.pos || []).find((x) => x.projectId === p.id && x.status !== 'draft' && x.status !== 'cancelled');
      const base = po ? po.poDate : PM.addDays(T, -90);
      const DOCS = [['Vendor Print Index and Schedule', 'IFI', [['A', 5, 12, 'A4']]], ['Specification of Flow Computer', 'IFA', [['A', 20, 35, 'A2'], ['B', 45, 0, '']]],
        ['Factory Acceptance Test Procedure', 'IFA', [['A', 30, 50, 'A3']]], ['General Arrangement Drawing', 'IFA', [['A', 25, 38, 'A1']]],
        ['Instrument Loop Wiring Diagram', 'IFA', []], ['Operation and Maintenance Manual', 'IFF', []]];
      DOCS.forEach(([title, purpose, revs], i) => {
        const code = `FLS-${p.code.replace(/^PJ-/, '')}-IE-${String(i + 1).padStart(4, '0')}`;
        out.push({ id: `VD-${p.id}-${i + 1}`, projectId: p.id, poId: po ? po.id : '', vendor: '', no: String(i + 1), docNo: code, altNo: '', title, discipline: 'IE', size: 'A4', purpose,
          planDate: PM.addDays(base, 15 + i * 7 + pi * 3), planText: '15 day after PO', note: '', files: [], createdBy: '', createdByName: 'Document Control',
          revs: revs.map(([rev, iss, ret, c], k) => ({ rev, purpose, planIssue: PM.addDays(base, iss - 3), issued: PM.min(T, PM.addDays(base, iss)), transmittal: `${code.split('-IE-')[0]}-T-${String(i * 3 + k + 1).padStart(4, '0')}`,
            planReturn: PM.addDays(base, iss + 14), returned: ret ? PM.min(T, PM.addDays(base, ret)) : '', code: ret ? c : '', comment: c === 'A3' ? 'แก้ไขตามคอมเมนต์ในไฟล์' : '' })) });
      });
    });
    return out;
  };
})();
