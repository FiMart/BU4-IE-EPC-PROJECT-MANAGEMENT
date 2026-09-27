/* common.js — shared view pieces: tiles, flow strip, bid & project forms */
(function () {
  const U = PM.ui, esc = U.esc;
  const V = (PM.common = {});

  V.tile = ({ label, tag, value, sub, tip }) =>
    `<div class="tile"${tip ? ` data-tip="${esc(tip)}"` : ''}>
      <div class="tile-label">${esc(label)}${tag ? `<span class="tag">${esc(tag)}</span>` : ''}</div>
      <div class="tile-value">${value}</div>
      <div class="tile-sub">${sub || ''}</div>
    </div>`;

  const ARROW = '<div class="flow-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>';
  V.flow = (steps) =>
    `<div class="flow">${steps.map((s, i) =>
      `${i ? ARROW : ''}<div class="flow-step${s.href || s.action ? ' link' : ''}${s.active ? ' active' : ''}"${s.href ? ` data-href="${esc(s.href)}"` : ''}${s.action ? ` data-action="${esc(s.action)}"` : ''}${s.key ? ` data-key="${esc(s.key)}"` : ''}${s.tip ? ` data-tip="${esc(s.tip)}"` : ''}>
        <div class="n">${esc(s.n || String(i + 1).padStart(2, '0'))}</div>
        <b>${esc(s.label)}</b><div class="th">${esc(s.th || '')}</div>
        <div class="big">${s.big}</div><div class="meta">${s.meta || ''}</div>
      </div>`).join('')}</div>`;

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
  V.bidForm = function (bid, onSaved) {
    const T = PM.today();
    const isNew = !bid;
    const b = bid || {
      id: PM.uid('B'), code: 'BD-' + T.slice(2, 4) + '-' + String(PM.db.bids.length + 1).padStart(3, '0'),
      name: '', client: '', sector: 'Industrial', scope: 'EPC', value: 0, margin: 10, estimator: '', boqItems: 0,
      dueDate: PM.addDays(T, 30), dates: { inquiry: T, estimate: '', proposal: '', submit: '' }, stage: 'inquiry',
      result: 'pending', resultDate: '', projectId: null, notes: '',
    };
    const body = `
      <div class="sub-h">ข้อมูลงานประมูล</div>
      ${U.field('Bid No.', 'code', b.code, { required: true })}
      ${U.field('ลูกค้า (Client)', 'client', b.client, { required: true })}
      ${U.field('ชื่องาน / Scope of work', 'name', b.name, { required: true, full: true })}
      ${U.field('Sector', 'sector', b.sector, { options: PM.SECTORS })}
      ${U.field('Contract scope', 'scope', b.scope, { options: PM.SCOPES })}
      ${U.field('มูลค่าประมาณการ (THB)', 'value', b.value, { type: 'number', min: 0, step: 'any' })}
      ${U.field('Margin (%)', 'margin', b.margin, { type: 'number', step: 0.1 })}
      ${U.field('Estimator', 'estimator', b.estimator, { options: people(), placeholder: '— เลือก —' })}
      ${U.field('จำนวนรายการ BOQ (Quantity)', 'boqItems', b.boqItems, { type: 'number', min: 0 })}
      <div class="sub-h">Timeline — Inquiry → Estimate → Proposal → Submit</div>
      ${U.field('Inquiry received', 'd_inquiry', b.dates.inquiry, { type: 'date', required: true })}
      ${U.field('Estimate started', 'd_estimate', b.dates.estimate, { type: 'date' })}
      ${U.field('Proposal started', 'd_proposal', b.dates.proposal, { type: 'date' })}
      ${U.field('Submitted', 'd_submit', b.dates.submit, { type: 'date' })}
      ${U.field('กำหนดยื่นซอง (Due date)', 'dueDate', b.dueDate, { type: 'date' })}
      <span></span>
      <div class="sub-h">ผลการประมูล (Award)</div>
      ${U.field('Result', 'result', b.result, { options: Object.keys(PM.BID_RESULTS).map((k) => ({ value: k, label: PM.BID_RESULTS[k] })) })}
      ${U.field('Result date', 'resultDate', b.resultDate, { type: 'date' })}
      ${U.field('หมายเหตุ', 'notes', b.notes, { type: 'textarea', full: true, rows: 2 })}`;
    U.modal({
      title: isNew ? 'New inquiry' : `${b.code} · ${b.name}`, body, wide: true,
      onDelete: isNew ? null : () => { PM.remove('bids', b.id); U.toast('ลบแล้ว'); onSaved && onSaved(); },
      onSubmit: (f) => {
        const dates = { inquiry: f.d_inquiry, estimate: f.d_estimate, proposal: f.d_proposal, submit: f.d_submit };
        const order = PM.BID_STAGES.map((s) => dates[s.key]).filter(Boolean);
        if (order.some((d, i) => i && d < order[i - 1])) { alert('วันที่แต่ละขั้นต้องเรียงตามลำดับ Inquiry → Estimate → Proposal → Submit'); return false; }
        Object.assign(b, {
          code: f.code, name: f.name, client: f.client, sector: f.sector, scope: f.scope, value: f.value, margin: f.margin,
          estimator: f.estimator, boqItems: f.boqItems, dueDate: f.dueDate, dates, result: f.result,
          resultDate: f.result === 'pending' ? '' : f.resultDate || T, notes: f.notes,
        });
        b.stage = V.stageOf(b);
        PM.upsert('bids', b);
        U.toast('บันทึกแล้ว');
        onSaved && onSaved(b);
      },
    });
  };

  /* Next project number: JB{yy}-PROJ-{running 4 digits}, e.g. JB26-PROJ-0001 (restarts each year) */
  V.nextProjectCode = function () {
    const prefix = `JB${PM.today().slice(2, 4)}-PROJ-`;
    const re = new RegExp('^' + prefix + '(\\d+)$');
    const max = PM.db.projects.reduce((m, x) => { const hit = String(x.code || '').match(re); return hit ? Math.max(m, +hit[1]) : m; }, 0);
    return prefix + String(max + 1).padStart(4, '0');
  };

  /* ---------- project form ---------- */
  V.projectForm = function (project, fromBid, onSaved) {
    const T = PM.today();
    const isNew = !project;
    const p = project || {
      id: PM.uid('P'), code: V.nextProjectCode(),
      name: fromBid ? fromBid.name : '', client: fromBid ? fromBid.client : '',
      contractValue: fromBid ? fromBid.value : 0,
      budget: fromBid ? Math.round(fromBid.value * (1 - (fromBid.margin || 10) / 100)) : 0,
      startDate: T, endDate: PM.addDays(T, 365), pm: '', status: 'active', bidId: fromBid ? fromBid.id : null, phases: null, progressLog: [],
    };
    const body = `
      ${U.field('Project No.', 'code', p.code, { required: true })}
      ${U.field('Status', 'status', p.status, { options: [{ value: 'active', label: 'Active' }, { value: 'onhold', label: 'On hold' }, { value: 'closed', label: 'Closed' }] })}
      ${U.field('ชื่อโครงการ', 'name', p.name, { required: true, full: true })}
      ${U.field('ลูกค้า (Client)', 'client', p.client, { required: true })}
      ${U.field('Project Manager', 'pm', p.pm, { options: people(), placeholder: '— เลือก —' })}
      ${U.field('มูลค่าสัญญา (THB)', 'contractValue', p.contractValue, { type: 'number', min: 0, step: 'any' })}
      ${U.field('งบประมาณต้นทุน / BAC (THB)', 'budget', p.budget, { type: 'number', min: 0, step: 'any', hint: isNew ? 'ระบบจะแบ่งงบให้ E / P / C / Closing อัตโนมัติ (แก้ไขได้ภายหลัง)' : '' })}
      ${U.field('Start date', 'startDate', p.startDate, { type: 'date', required: true })}
      ${U.field('Finish date', 'endDate', p.endDate, { type: 'date', required: true })}
      ${isNew ? '' : '<p class="full muted" style="margin:0">หมายเหตุ: การแก้วันที่โครงการไม่เปลี่ยนแผนของแต่ละ phase — แก้ได้ที่ตาราง EPC Phases</p>'}`;
    U.modal({
      title: isNew ? (fromBid ? `Create project from ${fromBid.code}` : 'New project') : `Edit ${p.code}`, body,
      onDelete: isNew ? null : () => {
        PM.remove('projects', p.id);
        PM.db.ncrs = PM.db.ncrs.filter((n) => n.projectId !== p.id);
        PM.db.safety = PM.db.safety.filter((s) => s.projectId !== p.id);
        PM.save();
        location.hash = '#/projects';
      },
      onSubmit: (f) => {
        if (f.endDate <= f.startDate) { alert('Finish date ต้องอยู่หลัง Start date'); return false; }
        if (PM.db.projects.some((x) => x.id !== p.id && String(x.code).toUpperCase() === f.code.toUpperCase())) {
          alert(`Project No. ${f.code} ถูกใช้แล้ว`); return false;
        }
        Object.assign(p, f);
        if (!p.phases) p.phases = PM.buildPhases(p.startDate, p.endDate, p.budget);
        PM.upsert('projects', p);
        if (fromBid) { fromBid.projectId = p.id; fromBid.result = 'won'; if (!fromBid.resultDate) fromBid.resultDate = T; PM.upsert('bids', fromBid); }
        U.toast('บันทึกแล้ว');
        onSaved && onSaved(p);
      },
    });
  };
})();
