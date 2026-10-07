/* costs.js — expense ledger per project: every entry is date / description / amount.
   A project's Actual cost = the sum of its entries (PM.applyLedger writes the totals into each phase). */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  const state = { phase: '', cat: '', q: '' };

  const creatorStamp = () => {
    const u = PM.auth && PM.auth.user;
    return u ? { createdBy: u.id, createdByName: PM.auth.displayName(u), createdAt: new Date().toISOString() } : {};
  };
  const poNo = (id) => { const po = id && PM.find('pos', id); return po ? po.poNo : ''; };
  const monthOf = (d) => d.slice(0, 7);

  /* Cumulative PV / EV / AC per month-end (EV from the progress snapshots, AC from the ledger) */
  PM.costCurve = function (p, list) {
    const T = PM.today();
    const dates = list.map((c) => c.date).sort();
    const from = PM.min(p.startDate, dates[0] || p.startDate).slice(0, 7);
    const to = PM.max(p.endDate, dates[dates.length - 1] || p.endDate).slice(0, 7);
    const months = PM.months(from, to);
    const log = p.progressLog || [];
    const rows = months.map((ym) => {
      const end = PM.monthEnd(ym);
      const pv = PM.sum(p.phases, (ph) => (ph.budget || 0) * PM.plannedPct(ph, end));
      if (ym + '-01' > T) return { ym, pv, ev: null, ac: null };
      const d = PM.min(end, T);
      const snap = log.filter((s) => s.date <= d).pop();
      const ev = snap ? PM.sum(p.phases, (ph) => (ph.budget || 0) * (snap.values[ph.key] || 0) / 100) : 0;
      return { ym, pv, ev, ac: PM.costToDate(list, d) };
    });
    return { months, rows, today: months.indexOf(T.slice(0, 7)) };
  };

  /* ---------------- project tab ---------------- */
  PM.costTab = function (el, p, m, rerender) {
    const T = PM.today();
    const all = PM.projectCosts(p.id);
    const canEdit = PM.can('cost.edit');
    const total = PM.sum(all, (c) => Number(c.amount) || 0);
    const thisM = PM.sum(all.filter((c) => monthOf(c.date) === T.slice(0, 7)), (c) => c.amount);
    const lastYm = PM.addDays(T.slice(0, 7) + '-01', -1).slice(0, 7);
    const lastM = PM.sum(all.filter((c) => monthOf(c.date) === lastYm), (c) => c.amount);
    const viaPo = PM.sum(all.filter((c) => c.poId), (c) => c.amount);
    const poCommitted = PM.poStats(PM.db.pos.filter((po) => po.projectId === p.id)).value;
    const left = m.bac - m.ac;
    const mismatch = Math.abs(total - m.ac) >= 1;
    const ov = PM.costOverrun(m, p.status === 'closed');

    const q = state.q.toLowerCase();
    const list = all.filter((c) => (!state.phase || c.phase === state.phase) && (!state.cat || c.category === state.cat)
      && (!q || [c.description, c.vendor, c.ref, poNo(c.poId), c.note].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.id).localeCompare(String(a.id))));
    const cats = PM.COST_CATEGORIES.concat(all.some((c) => c.category === PM.COST_OPENING) ? [PM.COST_OPENING] : []);

    el.innerHTML = `
      ${mismatch ? `<div class="callout warn">ยอดรวมรายการ (${U.money(total)}) ไม่ตรงกับ Actual cost ของโครงการ (${U.money(m.ac)}) — มักเกิดเมื่อรายการค่าใช้จ่ายยังไม่ขึ้น Cloud (Admin ต้องรัน supabase/data.sql อีกครั้ง)
        ${canEdit ? ' · <button type="button" class="link-btn" data-action="recalc">คำนวณ Actual cost จากรายการใหม่</button>' : ''}</div>` : ''}
      ${ov.status === 'over' ? `<div class="callout warn"><b>Cost overrun — เกินงบแล้ว ${U.money(ov.amount)}</b> · Actual cost ${U.money(m.ac)} เกิน Plan cost ${U.money(m.bac)} (${U.pct(ov.used)})${ov.closed ? ' · โครงการปิดแล้ว (ต้นทุนสุดท้าย)' : ` · คาดการณ์เมื่อจบ (EAC) เกิน ${U.money(ov.forecast)}`}</div>`
        : ov.status === 'forecast' ? `<div class="callout warn"><b>คาดว่าจะเกินงบ ${U.money(ov.forecast)}</b> เมื่อจบโครงการ · CPI ${U.ratio(m.cpi)} → EAC ${U.money(m.eac)} เทียบ Plan cost ${U.money(m.bac)} (ตอนนี้ใช้ไป ${U.pct(ov.used)})</div>` : ''}
      <div class="grid cols-5">
        ${V.tile({ label: 'Actual cost', tag: 'AC', value: U.money(m.ac), sub: `${U.num(all.length)} รายการ · ${U.pct(m.bac ? m.ac / m.bac : null)} ของ Plan cost` })}
        ${V.tile({ label: 'ใช้จ่ายเดือนนี้', value: U.money(thisM), sub: `เดือนก่อน ${U.money(lastM)}` })}
        ${V.tile({ label: left < 0 ? 'เกินงบ' : 'งบคงเหลือ', value: `<span class="${left < 0 ? 'neg' : ''}">${U.money(Math.abs(left))}</span>`, sub: `Plan cost ${U.money(m.bac)}` })}
        ${V.tile({ label: 'Cost performance', tag: 'CPI', value: U.ratio(m.cpi), sub: `${U.badge(U.health(m.cpi), U.healthLabel[U.health(m.cpi)])} EAC ${U.money(m.eac)}`, tip: 'CPI = EV ÷ AC\nEAC = Plan cost ÷ CPI' })}
        ${V.tile({ label: 'จ่ายตาม PO', value: U.money(viaPo), sub: `PO ที่สั่งแล้ว ${U.money(poCommitted)}` })}
      </div>
      <div class="card"><div class="card-h"><h2>กราฟเปรียบเทียบต้นทุนสะสม (แผน / ผลงาน / จ่ายจริง)</h2><p>Planned value (แผน) · Earned value (มูลค่างานที่ทำได้) · Actual cost (จ่ายจริงจากรายการ) — สะสม ณ สิ้นเดือน</p></div>
        <div class="card-b"><div class="chart" id="c-cum"></div></div></div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>ค่าใช้จ่ายรายเดือน</h2><p>12 เดือนล่าสุด แยกตาม phase</p></div><div class="card-b"><div class="chart" id="c-month"></div></div></div>
        <div class="card"><div class="card-h"><h2>แยกตามหมวด</h2><p>ยอดรวมทั้งโครงการ</p></div><div class="card-b"><div class="chart" id="c-cat"></div></div></div>
      </div>
      <div class="card">
        <div class="card-h"><h2>รายการค่าใช้จ่าย</h2><p>${canEdit ? 'คลิกรายการเพื่อแก้ไข · ' : ''}Actual cost ของโครงการ = ผลรวมของรายการทั้งหมด</p></div>
        <div class="card-b">
          <div class="row ledger-tools">
            <select id="cl-phase" aria-label="Phase"><option value="">ทุก phase</option>${PM.PHASES.map((x) => `<option value="${x.key}"${state.phase === x.key ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
            <select id="cl-cat" aria-label="หมวด"><option value="">ทุกหมวด</option>${cats.map((c) => `<option${state.cat === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
            <input type="search" id="cl-q" placeholder="ค้นหารายการ / ผู้ขาย / เลขที่…" value="${esc(state.q)}">
            <span class="spacer"></span>
            ${PM.can('data.export') ? '<button class="btn" data-action="cost-csv">Export CSV</button>' : ''}
            ${canEdit ? '<button class="btn primary" data-action="new-cost">+ บันทึกค่าใช้จ่าย</button>' : ''}
          </div>
        </div>
        <div class="card-b flush table-wrap">${ledgerTable(list, canEdit)}</div>
      </div>`;

    /* charts */
    const cv = PM.costCurve(p, all);
    PM.charts.lines(el.querySelector('#c-cum'), {
      labels: cv.months.map(U.month), marker: cv.today, fmt: U.money, axisFmt: U.money, label: 'Cumulative cost',
      series: [
        { name: 'Planned value (PV)', color: 'var(--s1)', values: cv.rows.map((r) => r.pv), dash: true },
        { name: 'Earned value (EV)', color: 'var(--s3)', values: cv.rows.map((r) => r.ev) },
        { name: 'Actual cost (AC)', color: 'var(--s2)', values: cv.rows.map((r) => r.ac) },
      ],
    });
    const lastMonth = PM.min(T, PM.max(p.endDate, (all.map((c) => c.date).sort().pop()) || p.endDate)).slice(0, 7);
    const months = PM.months(PM.addDays(lastMonth + '-01', -334).slice(0, 7), lastMonth);
    PM.charts.columns(el.querySelector('#c-month'), {
      categories: months.map(U.month), fmt: U.money, axisFmt: U.money, label: 'Monthly spend',
      series: PM.PHASES.map((ph, i) => ({ name: ph.label, color: `var(--s${i + 1})`, values: months.map((ym) => PM.sum(all.filter((c) => c.phase === ph.key && monthOf(c.date) === ym), (c) => c.amount)) })),
    });
    PM.charts.hbars(el.querySelector('#c-cat'), {
      items: cats.map((c) => {
        const mine = all.filter((x) => x.category === c), v = PM.sum(mine, (x) => x.amount);
        return { label: c, sub: `${mine.length} รายการ`, value: v, display: U.money(v), color: 'var(--s2)', tip: `${c}\n${U.money(v)} · ${U.pct(total ? v / total : null)} ของทั้งหมด` };
      }).filter((x) => x.value).sort((a, b) => b.value - a.value),
    });

    /* events */
    el.querySelector('#cl-phase').onchange = (e) => { state.phase = e.target.value; rerender(); };
    el.querySelector('#cl-cat').onchange = (e) => { state.cat = e.target.value; rerender(); };
    el.querySelector('#cl-q').addEventListener('input', (e) => {
      state.q = e.target.value;
      clearTimeout(state.t);
      state.t = setTimeout(() => { rerender(); const i = document.getElementById('cl-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250);
    });
    el.onclick = (e) => {
      const a = e.target.closest('[data-action]');
      if (a && a.dataset.action === 'new-cost') { e.stopPropagation(); PM.costEntryForm(p, null, rerender); return; }
      if (a && a.dataset.action === 'recalc' && canEdit) { e.stopPropagation(); PM.applyLedger(p); PM.upsert('projects', p); U.toast('คำนวณ Actual cost ใหม่แล้ว'); rerender(); return; }
      if (a && a.dataset.action === 'cost-csv') { e.stopPropagation(); exportCsv(p, list); return; }
      const row = e.target.closest('tr[data-cost]');
      if (row) PM.costEntryForm(p, PM.find('costs', row.dataset.cost), rerender);
    };
  };

  function ledgerTable(list, canEdit) {
    if (!list.length) return `<p class="empty">${state.phase || state.cat || state.q ? 'ไม่พบรายการตามตัวกรอง' : canEdit ? 'ยังไม่มีรายการค่าใช้จ่าย — กด "+ บันทึกค่าใช้จ่าย" เพื่อเพิ่ม' : 'ยังไม่มีรายการค่าใช้จ่าย'}</p>`;
    return `<table class="tbl ledger"><thead><tr><th>วันที่</th><th>รายการ</th><th>Phase</th><th>หมวด</th><th>เลขที่เอกสาร / PO</th><th class="num">จำนวนเงิน</th><th>บันทึกโดย</th></tr></thead><tbody>
      ${list.map((c) => `<tr class="click" data-cost="${esc(c.id)}">
        <td class="nowrap">${U.date(c.date)}</td>
        <td><span class="title">${esc(c.description)}</span>${c.vendor ? `<small>${esc(c.vendor)}</small>` : ''}</td>
        <td>${esc(U.phaseLabel(c.phase))}</td>
        <td>${c.category === PM.COST_OPENING ? `<span class="chip">${esc(c.category)}</span>` : esc(c.category)}</td>
        <td>${esc(c.ref || '–')}${c.poId ? `<small>${esc(poNo(c.poId) || 'PO (ลบแล้ว)')}</small>` : ''}</td>
        <td class="num${c.amount < 0 ? ' neg' : ''}">${U.money(c.amount)}</td>
        <td>${esc(c.createdByName || '–')}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>รวม</td><td>${U.num(list.length)} รายการ</td><td></td><td></td><td></td><td class="num">${U.money(PM.sum(list, (c) => c.amount))}</td><td></td></tr></tfoot></table>`;
  }

  function exportCsv(p, list) {
    const q = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
    const lines = [['Date', 'Project', 'Phase', 'Category', 'Description', 'Vendor', 'Ref', 'PO', 'Amount', 'Recorded by', 'Note'].join(',')].concat(
      list.slice().reverse().map((c) => [c.date, q(p.code), c.phase, q(c.category), q(c.description), q(c.vendor), q(c.ref), q(poNo(c.poId)), c.amount, q(c.createdByName), q(c.note)].join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
    a.download = `costs-${p.code}-${PM.today()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------------- add / edit one expense ---------------- */
  PM.costEntryForm = function (p, entry, done) {
    const T = PM.today();
    const isNew = !entry;
    const canEdit = PM.can('cost.edit');
    if (isNew && !canEdit) return;
    const cur = PM.projectMetrics(p).current;
    const c = entry || {
      id: PM.uid('C'), projectId: p.id, date: T, phase: cur ? cur.key : 'construction', category: 'Material',
      description: '', vendor: '', ref: '', poId: '', amount: '', note: '',
    };
    const pos = PM.db.pos.filter((po) => po.projectId === p.id).sort((a, b) => String(b.poDate).localeCompare(String(a.poDate)));
    const cats = PM.COST_CATEGORIES.includes(c.category) ? PM.COST_CATEGORIES : PM.COST_CATEGORIES.concat(c.category);
    const form = U.modal({
      title: isNew ? `บันทึกค่าใช้จ่าย — ${p.code}` : canEdit ? 'แก้ไขค่าใช้จ่าย' : 'รายการค่าใช้จ่าย', wide: true,
      submitLabel: 'บันทึก',
      onDelete: !isNew && canEdit ? () => {
        PM.db.costs = PM.db.costs.filter((x) => x.id !== c.id);
        PM.applyLedger(p);
        PM.upsert('projects', p);
        U.toast('ลบรายการแล้ว');
        done();
      } : null,
      body: `
        ${U.field('วันที่', 'date', c.date, { type: 'date', required: true })}
        <label><span>จำนวนเงิน (THB)</span><input name="amount" type="number" step="any" required value="${esc(c.amount)}" placeholder="0.00"><small>ติดลบได้ เช่น Credit note / เงินคืน</small></label>
        ${U.field('รายการ', 'description', c.description, { required: true, full: true, placeholder: 'เช่น ค่าเช่าเครน 50 ตัน 3 วัน' })}
        ${U.field('Phase', 'phase', c.phase, { options: PM.PHASES.map((x) => ({ value: x.key, label: x.label })) })}
        ${U.field('หมวด', 'category', c.category, { options: cats })}
        ${U.field('ผู้ขาย / ผู้รับเงิน', 'vendor', c.vendor)}
        ${U.field('เลขที่เอกสาร (Invoice / ใบเสร็จ)', 'ref', c.ref)}
        ${U.field('อ้างอิง PO (ถ้ามี)', 'poId', c.poId, { options: pos.map((po) => ({ value: po.id, label: `${po.poNo} · ${po.supplier}` })), placeholder: '— ไม่ผูกกับ PO —' })}
        <span></span>
        ${U.field('หมายเหตุ', 'note', c.note, { type: 'textarea', full: true, rows: 2 })}
        ${c.createdByName ? `<p class="full muted" style="margin:0">บันทึกโดย ${esc(c.createdByName)}${c.createdAt ? ' · ' + esc(new Date(c.createdAt).toLocaleString('en-GB')) : ''}</p>` : ''}`,
      onSubmit: canEdit ? (f) => {
        if (!f.amount) { alert('กรุณากรอกจำนวนเงิน'); return false; }
        Object.assign(c, f, isNew ? creatorStamp() : {});
        const i = PM.db.costs.findIndex((x) => x.id === c.id);
        if (i >= 0) PM.db.costs[i] = c; else PM.db.costs.push(c);
        PM.applyLedger(p);
        PM.upsert('projects', p); // saves the entry and the project's new Actual cost together
        U.toast(isNew ? `บันทึกค่าใช้จ่าย ${U.money(c.amount)} แล้ว` : 'บันทึกแล้ว');
        done();
      } : null,
    });
    if (!canEdit) { form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; }); return; }
    // picking a PO fills in the vendor, category and phase
    form.poId.addEventListener('change', () => {
      const po = PM.find('pos', form.poId.value);
      if (!po) return;
      if (!form.vendor.value) form.vendor.value = po.supplier || '';
      if (PM.COST_CATEGORIES.includes(po.category)) form.category.value = po.category;
      if (po.phase) form.phase.value = po.phase;
      if (!form.description.value) form.description.value = `Payment — ${po.description || po.poNo}`;
    });
    if (isNew) form.amount.focus();
  };
})();
