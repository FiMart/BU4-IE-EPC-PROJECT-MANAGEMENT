/* project-detail.js — one project: EPC phases + KPI (Quantity, Time, Cost, Quality/NCR, Safety) */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  const TABS = [
    { key: 'overview', label: 'Overview & EPC' },
    { key: 'cost', label: 'ค่าใช้จ่าย · Cost' },
    { key: 'quality', label: 'Quality · NCR' },
    { key: 'safety', label: 'Safety' },
    { key: 'team', label: 'Team & Hours' },
    { key: 'po', label: 'PO' },
  ];

  PM.views.project = function (el, params) {
    const p = PM.find('projects', params[0]);
    if (!p) { el.innerHTML = '<div class="callout">ไม่พบโครงการ · <a href="#/projects">กลับไปหน้า Projects</a></div>'; return; }
    const tab = params[1] || 'overview';
    const m = PM.projectMetrics(p);
    const bid = p.bidId && PM.find('bids', p.bidId);
    document.getElementById('page-title').textContent = `${p.code} · ${p.name}`;
    const h = p.status === 'closed' ? 'neutral' : U.worst(U.health(m.spi), U.health(m.cpi));

    el.innerHTML = `
      <div class="row">
        <a href="#/projects">← Projects</a>
        <span class="spacer"></span>
        ${p.status === 'closed' ? U.badge('neutral', 'Closed') : p.status === 'onhold' ? U.badge('warning', 'On hold') : U.badge(h, U.healthLabel[h])}
        ${PM.can('cost.edit') ? '<button class="btn" data-action="new-cost">+ ค่าใช้จ่าย</button>' : ''}
        <button class="btn" data-action="edit-costs">Plan cost</button>
        <button class="btn" data-action="edit-project">แก้ไขโครงการ</button>
      </div>
      <div class="card"><div class="card-b">
        <dl class="kv kv-4">
          <dt>Client</dt><dd>${esc(p.client)}</dd>
          <dt>Project Manager</dt><dd>${esc(V.pmName(p))}</dd>
          <dt>Contract value</dt><dd>${U.money(p.contractValue)}</dd>
          <dt>From bid</dt><dd>${bid ? esc(bid.code) : '–'}</dd>
          <dt>Start</dt><dd>${U.date(p.startDate)}</dd>
          <dt>Finish</dt><dd>${U.date(p.endDate)}</dd>
          <dt>Time elapsed</dt><dd>${U.pct(Math.max(0, Math.min(1, PM.diffDays(p.startDate, PM.today()) / (PM.diffDays(p.startDate, p.endDate) || 1))))}</dd>
          <dt>Sales</dt><dd>${esc(V.salesName(p))}</dd>
        </dl>
        ${costStrip(m, PM.poStats(PM.db.pos.filter((po) => po.projectId === p.id)), PM.projectCosts(p.id).length)}
      </div></div>
      ${phaseFlow(p, m)}
      <nav class="tabs">${TABS.map((t) => `<a href="#/projects/${p.id}/${t.key}" class="${t.key === tab ? 'active' : ''}">${t.label}</a>`).join('')}</nav>
      <div id="tab"></div>`;

    const tabEl = el.querySelector('#tab');
    const rerender = () => PM.views.project(el, params);
    ({ overview, cost: costTab, quality, safety, team, po: poTab })[tab](tabEl, p, m, rerender);

    el.onclick = (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const act = a.dataset.action, id = a.dataset.id;
      if (act === 'edit-project') V.projectForm(p, null, rerender);
      if (act === 'edit-costs') costForm(p, rerender);
      if (act === 'new-cost') PM.costEntryForm(p, null, rerender);
      if (act === 'edit-phase') phaseForm(p, id, rerender);
      if (act === 'phase') phaseForm(p, a.dataset.key, rerender);
      if (act === 'new-ncr') ncrForm(p, null, rerender);
      if (act === 'edit-ncr') ncrForm(p, PM.find('ncrs', id), rerender);
      if (act === 'close-ncr') { const n = PM.find('ncrs', id); n.status = 'closed'; n.closedDate = PM.today(); PM.upsert('ncrs', n); U.toast(`${n.no} closed`); rerender(); }
      if (act === 'new-safety') safetyForm(p, null, rerender);
      if (act === 'edit-safety') safetyForm(p, PM.find('safety', id), rerender);
    };
  };

  /* expense ledger tab lives in costs.js */
  const costTab = (...args) => PM.costTab(...args);

  /* ---------------- Purchase orders of this project ---------------- */
  function poTab(el, p, m, rerender) {
    const list = PM.db.pos.filter((po) => po.projectId === p.id)
      .sort((a, b) => (PM.poDaysLate(b) - PM.poDaysLate(a)) || String(b.poDate).localeCompare(String(a.poDate)));
    const st = PM.poStats(list);
    const canEdit = PM.can('po.edit');
    el.innerHTML = `
      <div class="row"><p class="muted" style="margin:0">PO ที่สั่งแล้ว ${U.money(st.value)} = ${U.pct(m.bac ? st.value / m.bac : null)} ของ Plan cost ทั้งโครงการ</p>
        <span class="spacer"></span>${canEdit ? '<button class="btn primary" data-action="new-po">+ New PO</button>' : ''}</div>
      ${PM.poTiles(st)}
      <div class="card"><div class="card-h"><h2>Purchase Orders — ${esc(p.code)}</h2><p>คลิกที่ PO เพื่อดูรายละเอียดและไฟล์แนบ</p></div>
        <div class="card-b flush table-wrap">${PM.poTable(list, { empty: canEdit ? 'ยังไม่มี PO — กด "+ New PO" เพื่อเพิ่ม' : 'ยังไม่มี PO' })}</div></div>`;
    el.onchange = (e) => PM.poHandleChange(e, rerender);
    el.onclick = (e) => {
      if (e.target.closest('select, input')) return;
      if (e.target.closest('[data-action="new-po"]')) { e.stopPropagation(); PM.poForm(null, p.id, rerender); return; }
      const row = e.target.closest('tr[data-po]');
      if (row) PM.poForm(PM.find('pos', row.dataset.po), p.id, rerender);
    };
  }

  function costStrip(m, po, entries) {
    const left = m.bac - m.ac;
    const used = m.bac ? m.ac / m.bac : null;
    const over = left < 0;
    return `<div class="cost-strip">
      <div><span>Plan cost</span><b>${U.money(m.bac)}</b><small>งบประมาณต้นทุน (BAC)</small></div>
      <div><span>Actual cost</span><b>${U.money(m.ac)}</b><small>ใช้ไปแล้ว ${U.pct(used)} ของแผน · ${U.num(entries)} รายการ</small></div>
      <div><span>${over ? 'เกินงบ' : 'คงเหลือ'}</span><b class="${over ? 'neg' : ''}">${U.money(Math.abs(left))}</b><small>Plan − Actual</small></div>
      <div><span>คาดว่าจะใช้ทั้งหมด (EAC)</span><b>${U.money(m.eac)}</b><small>${m.cpi ? (m.eac > m.bac ? U.badge('critical', 'เกินงบ ' + U.money(m.eac - m.bac)) : U.badge('good', 'อยู่ในงบ')) : 'ยังไม่มีต้นทุนจริง'}</small></div>
      <div><span>PO ที่สั่งแล้ว (Committed)</span><b>${U.money(po.value)}</b><small>${po.committed} PO · ${U.pct(m.bac ? po.value / m.bac : null)} ของแผน${po.late.length ? ' · ' + U.badge('critical', po.late.length + ' เลยกำหนดส่ง') : ''}</small></div>
      <div class="cost-bar" data-tip="${esc(`Plan cost ${U.money(m.bac)}\nActual cost ${U.money(m.ac)} (${U.pct(used)})\nEarned value ${U.money(m.ev)}`)}">${U.progress(Math.min(1, used || 0), m.bac ? m.ev / m.bac : null, `Actual ${U.pct(used)} of plan cost\nEarned value ${U.pct(m.bac ? m.ev / m.bac : null)}`)}</div>
    </div>`;
  }

  /* edit the Plan cost of all phases in one form — Actual cost comes from the expense ledger (read-only here) */
  function costForm(p, done) {
    const rows = p.phases.map((ph) => `
      <div class="cost-row">
        <b>${esc(U.phaseLabel(ph.key))}</b>
        <label><span>Plan cost</span><input type="number" min="0" step="any" name="plan_${ph.key}" value="${Math.round(ph.budget || 0)}"></label>
        <div><span>Actual cost (จากรายการ)</span><b>${U.money(ph.actualCost || 0)}</b></div>
      </div>`).join('');
    const form = U.modal({
      title: `Plan cost — ${p.code}`, wide: true, submitLabel: 'บันทึก Plan cost',
      body: `<p class="full muted" style="margin:0">กรอกต้นทุนตามแผน (Plan cost) ของแต่ละ phase — หน่วยบาท · Actual cost คำนวณจากรายการค่าใช้จ่ายในแท็บ "ค่าใช้จ่าย"</p>
        <div class="full cost-grid">${rows}
          <div class="cost-row total"><b>รวม</b><div><span>Plan cost</span><b id="cf-plan"></b></div><div><span>Actual cost</span><b>${U.money(PM.sum(p.phases, (ph) => ph.actualCost || 0))}</b></div></div>
        </div>`,
      onSubmit: (f) => {
        p.phases.forEach((ph) => { ph.budget = Math.max(0, f['plan_' + ph.key] || 0); });
        p.budget = PM.sum(p.phases, (ph) => ph.budget);
        PM.snapshotProgress(p);
        PM.upsert('projects', p);
        U.toast('บันทึก Plan cost แล้ว');
        done();
      },
    });
    const update = () => { form.querySelector('#cf-plan').textContent = U.money(Array.from(form.querySelectorAll('input[name^="plan_"]')).reduce((s, i) => s + (Number(i.value) || 0), 0)); };
    form.addEventListener('input', update);
    update();
  }

  function phaseFlow(p, m) {
    return V.flow(m.phases.map((ph) => {
      const def = PM.PHASES.find((x) => x.key === ph.key);
      const behind = ph.plannedPct - ph.actualPct;
      const st = ph.actualPct >= 1 ? U.badge('good', 'Complete') : ph.actualPct === 0 && ph.plannedPct === 0 ? U.badge('neutral', 'Not started')
        : behind > 0.1 ? U.badge('critical', 'Behind') : behind > 0.03 ? U.badge('warning', 'Slightly behind') : U.badge('good', 'On plan');
      return {
        label: def.label, th: def.th, action: 'phase', key: ph.key, active: m.current && m.current.key === ph.key,
        big: U.pct(ph.actualPct),
        meta: `<div class="pbar-wrap" style="margin:6px 0">${U.progress(ph.actualPct, ph.plannedPct)}</div>Plan ${U.pct(ph.plannedPct)} · ${st}`,
        tip: `${def.label} (weight ${ph.weight}%)\nPlan ${U.date(ph.planStart)} – ${U.date(ph.planEnd)}\nActual ${U.date(ph.actStart)} – ${U.date(ph.actEnd)}\nClick to update`,
      };
    }));
  }

  /* ---------------- Overview ---------------- */
  function overview(el, p, m) {
    const cur = m.current || m.phases[m.phases.length - 1];
    const T = PM.today();
    el.innerHTML = `
      <div class="grid cols-5">
        ${V.tile({ label: 'Quantity', tag: U.phaseLabel(cur.key), value: U.pct(cur.qtyPct), sub: `${U.num(cur.qtyDone)} / ${U.num(cur.qtyPlan)} ${esc(cur.qtyUnit)}`, tip: m.phases.map((ph) => `${U.phaseLabel(ph.key)}: ${U.num(ph.qtyDone)} / ${U.num(ph.qtyPlan)} ${ph.qtyUnit}`).join('\n') })}
        ${V.tile({ label: 'Time', tag: 'SPI', value: U.ratio(m.spi), sub: `${U.badge(U.health(m.spi), U.healthLabel[U.health(m.spi)])} Plan ${U.pct(m.plan, 1)} · Act ${U.pct(m.act, 1)}` })}
        ${V.tile({ label: 'Cost', tag: 'CPI', value: U.ratio(m.cpi), sub: `${U.badge(U.health(m.cpi), U.healthLabel[U.health(m.cpi)])} EAC ${U.money(m.eac)}`, tip: `BAC ${U.money(m.bac)}\nPV ${U.money(m.pv)}\nEV ${U.money(m.ev)}\nAC ${U.money(m.ac)}\nEAC = BAC / CPI = ${U.money(m.eac)}\nVAC = ${U.money(m.bac - m.eac)}` })}
        ${V.tile({ label: 'Quality', tag: 'NCR', value: `${m.ncrOpen} <small>open / ${m.ncrTotal}</small>`, sub: m.ncrCriticalOpen ? U.badge('critical', `${m.ncrCriticalOpen} critical open`) : m.ncrOpen ? U.badge('warning', 'Follow up') : U.badge('good', 'All closed') })}
        ${V.tile({ label: 'Safety', tag: 'LTIFR', value: U.num(m.ltifr, 2), sub: `${m.lti ? U.badge('critical', m.lti + ' LTI') : U.badge('good', 'Zero LTI')} ${U.num(m.manhours)} MH` })}
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>S-Curve</h2><p>Cumulative progress — Planned vs Actual (weighted by phase)</p></div><div class="card-b"><div class="chart" id="c-scurve"></div></div></div>
        <div class="card"><div class="card-h"><h2>Cost by phase</h2><p>Plan cost vs Earned value vs Actual cost</p></div><div class="card-b"><div class="chart" id="c-cost"></div></div></div>
      </div>
      <div class="card">
        <div class="card-h"><h2>EPC Phases</h2><p>อัปเดตความคืบหน้า, ปริมาณงาน และต้นทุนจริงของแต่ละ phase (บันทึก snapshot สำหรับ S-curve อัตโนมัติ)</p></div>
        <div class="card-b flush table-wrap"><table class="tbl"><thead><tr>
          <th>Phase</th><th class="num">Weight</th><th>Plan</th><th>Actual</th><th style="min-width:150px">Progress</th>
          <th class="num">Quantity</th><th class="num">Plan cost</th><th class="num">Actual cost</th><th class="num">คงเหลือ</th><th class="num">SPI</th><th class="num">CPI</th><th></th></tr></thead><tbody>
          ${m.phases.map((ph) => `<tr>
            <td><span class="title">${esc(U.phaseLabel(ph.key))}</span></td>
            <td class="num">${ph.weight}%</td>
            <td>${U.date(ph.planStart)} – ${U.date(ph.planEnd)}</td>
            <td>${U.date(ph.actStart)} – ${ph.actEnd ? U.date(ph.actEnd) : ph.actStart ? 'ongoing' : '–'}</td>
            <td><div class="pbar-wrap">${U.progress(ph.actualPct, ph.plannedPct)}<span class="num">${U.pct(ph.actualPct)}</span></div></td>
            <td class="num">${U.num(ph.qtyDone)} / ${U.num(ph.qtyPlan)}<small>${esc(ph.qtyUnit)}</small></td>
            <td class="num">${U.money(ph.budget)}</td><td class="num">${U.money(ph.actualCost)}</td>
            <td class="num${(ph.budget || 0) - (ph.actualCost || 0) < 0 ? ' neg' : ''}">${U.money((ph.budget || 0) - (ph.actualCost || 0))}</td>
            <td class="num">${U.ratio(ph.spi)}</td><td class="num">${U.ratio(ph.cpi)}</td>
            <td><button class="btn sm" data-action="edit-phase" data-id="${ph.key}">Update</button></td></tr>`).join('')}
          </tbody><tfoot><tr><td>Total</td><td class="num">${PM.sum(m.phases, (x) => x.weight)}%</td><td></td><td></td>
            <td><div class="pbar-wrap">${U.progress(m.act, m.plan)}<span class="num">${U.pct(m.act)}</span></div></td><td></td>
            <td class="num">${U.money(m.bac)}</td><td class="num">${U.money(m.ac)}</td>
            <td class="num${m.bac - m.ac < 0 ? ' neg' : ''}">${U.money(m.bac - m.ac)}</td><td class="num">${U.ratio(m.spi)}</td><td class="num">${U.ratio(m.cpi)}</td><td></td></tr></tfoot>
        </table></div>
      </div>`;

    /* S-curve */
    const months = PM.months(p.startDate.slice(0, 7), p.endDate.slice(0, 7));
    const log = p.progressLog || [];
    const planned = months.map((ym) => {
      const d = PM.min(PM.monthEnd(ym), p.endDate);
      const vals = {}; p.phases.forEach((ph) => (vals[ph.key] = PM.plannedPct(ph, d) * 100));
      return +PM.weightedProgress(p, vals).toFixed(1);
    });
    const actual = months.map((ym) => {
      if (ym + '-01' > T) return null;
      const d = PM.min(PM.monthEnd(ym), T);
      const snap = log.filter((s) => s.date <= d).pop();
      return snap ? +PM.weightedProgress(p, snap.values).toFixed(1) : 0;
    });
    const tIdx = months.indexOf(T.slice(0, 7));
    PM.charts.lines(document.getElementById('c-scurve'), {
      labels: months.map(U.month), yMax: 100, fmt: (v) => v.toFixed(1) + '%', axisFmt: (v) => v + '%',
      marker: tIdx, label: 'S-curve',
      series: [
        { name: 'Planned', color: 'var(--s1)', values: planned, dash: true },
        { name: 'Actual', color: 'var(--s2)', values: actual },
      ],
    });
    PM.charts.columns(document.getElementById('c-cost'), {
      stacked: false, categories: m.phases.map((ph) => U.phaseLabel(ph.key)), fmt: U.money, axisFmt: U.money, label: 'Cost by phase',
      series: [
        { name: 'Plan cost', color: 'var(--s1)', values: m.phases.map((ph) => ph.budget) },
        { name: 'Earned value', color: 'var(--s3)', values: m.phases.map((ph) => ph.ev) },
        { name: 'Actual cost', color: 'var(--s2)', values: m.phases.map((ph) => ph.actualCost) },
      ],
    });
  }

  function phaseForm(p, key, done) {
    const ph = p.phases.find((x) => x.key === key);
    const def = PM.PHASES.find((x) => x.key === key);
    U.modal({
      title: `${p.code} · ${def.label}`, wide: true,
      body: `
        <div class="sub-h">Progress & Quantity (อัปเดตประจำงวด)</div>
        ${U.field('Actual progress (%)', 'progress', ph.progress, { type: 'number', min: 0, max: 100, step: 0.1 })}
        ${U.field('Quantity unit', 'qtyUnit', ph.qtyUnit)}
        ${U.field('Quantity — planned', 'qtyPlan', ph.qtyPlan, { type: 'number', min: 0, step: 'any' })}
        ${U.field('Quantity — done', 'qtyDone', ph.qtyDone, { type: 'number', min: 0, step: 'any' })}
        <label><span>Actual cost (THB)</span><input value="${esc(U.num(ph.actualCost || 0))}" disabled><small class="muted">รวมจากรายการค่าใช้จ่ายของ phase นี้ (แท็บ "ค่าใช้จ่าย")</small></label>
        <div class="sub-h">Plan / Baseline</div>
        ${U.field('Plan start', 'planStart', ph.planStart, { type: 'date', required: true })}
        ${U.field('Plan finish', 'planEnd', ph.planEnd, { type: 'date', required: true })}
        ${U.field('Actual start', 'actStart', ph.actStart, { type: 'date' })}
        ${U.field('Actual finish', 'actEnd', ph.actEnd, { type: 'date' })}
        ${U.field('Weight (%)', 'weight', ph.weight, { type: 'number', min: 0, max: 100, hint: 'น้ำหนักของ phase ในความคืบหน้ารวม' })}
        ${U.field('Plan cost (THB)', 'budget', ph.budget, { type: 'number', min: 0, step: 'any' })}`,
      onSubmit: (f) => {
        if (f.planEnd < f.planStart) { alert('Plan finish ต้องอยู่หลัง Plan start'); return false; }
        f.progress = Math.max(0, Math.min(100, f.progress));
        if (f.progress > 0 && !f.actStart) f.actStart = PM.today();
        if (f.progress >= 100 && !f.actEnd) f.actEnd = PM.today();
        Object.assign(ph, f);
        p.budget = PM.sum(p.phases, (x) => x.budget || 0); // project plan cost = sum of phases
        PM.snapshotProgress(p);
        PM.upsert('projects', p);
        U.toast('อัปเดต phase แล้ว');
        done();
      },
    });
  }

  /* ---------------- Quality / NCR ---------------- */
  function quality(el, p, m) {
    const list = PM.db.ncrs.filter((n) => n.projectId === p.id).sort((a, b) => (a.date < b.date ? 1 : -1));
    const closed = list.filter((n) => n.status === 'closed' && n.closedDate);
    const avgClose = closed.length ? PM.sum(closed, (n) => PM.diffDays(n.date, n.closedDate)) / closed.length : null;
    const T = PM.today();
    el.innerHTML = `
      <div class="row"><span class="spacer"></span><button class="btn primary" data-action="new-ncr">+ New NCR</button></div>
      <div class="grid cols-4">
        ${V.tile({ label: 'Total NCR', value: list.length, sub: `Minor ${list.filter((n) => n.severity === 'Minor').length} · Major ${list.filter((n) => n.severity === 'Major').length} · Critical ${list.filter((n) => n.severity === 'Critical').length}` })}
        ${V.tile({ label: 'Open NCR', value: m.ncrOpen, sub: m.ncrOpen ? U.badge('warning', 'Pending close-out') : U.badge('good', 'All closed') })}
        ${V.tile({ label: 'Critical open', value: m.ncrCriticalOpen, sub: m.ncrCriticalOpen ? U.badge('critical', 'Action required') : U.badge('good', 'None') })}
        ${V.tile({ label: 'Avg days to close', value: U.num(avgClose, 1), sub: `${closed.length} closed NCR` })}
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>NCR by category</h2></div><div class="card-b"><div class="chart" id="c-ncr-cat"></div></div></div>
        <div class="card"><div class="card-h"><h2>NCR by phase</h2></div><div class="card-b"><div class="chart" id="c-ncr-ph"></div></div></div>
      </div>
      <div class="card"><div class="card-h"><h2>NCR Log</h2><p>Non-Conformance Report</p></div>
        <div class="card-b flush table-wrap">${list.length ? `<table class="tbl"><thead><tr>
          <th>NCR No.</th><th>Date</th><th>Phase</th><th>Category</th><th>Severity</th><th>Description</th><th>Responsible</th><th class="num">Age (d)</th><th>Status</th><th></th></tr></thead><tbody>
          ${list.map((n) => `<tr class="click" data-action="edit-ncr" data-id="${n.id}">
            <td><span class="title">${esc(n.no)}</span></td><td>${U.date(n.date)}</td><td>${esc(U.phaseLabel(n.phase))}</td>
            <td>${esc(n.category)}</td>
            <td>${U.badge(n.severity === 'Critical' ? 'critical' : n.severity === 'Major' ? 'serious' : 'neutral', n.severity)}</td>
            <td>${esc(n.description)}${n.action ? `<small>CA: ${esc(n.action)}</small>` : ''}</td><td>${esc(n.responsible)}</td>
            <td class="num">${PM.diffDays(n.date, n.status === 'closed' && n.closedDate ? n.closedDate : T)}</td>
            <td>${n.status === 'closed' ? U.badge('good', 'Closed') : U.badge('warning', 'Open')}</td>
            <td>${n.status === 'open' ? `<button class="btn sm" data-action="close-ncr" data-id="${n.id}">Close</button>` : ''}</td></tr>`).join('')}
          </tbody></table>` : '<p class="empty">ยังไม่มี NCR</p>'}</div></div>`;

    const counts = (key, keys, label) => keys.map((k) => {
      const all = list.filter((n) => n[key] === k), open = all.filter((n) => n.status === 'open').length;
      return { label: label ? label(k) : k, value: all.length, sub: open ? `${open} open` : '', display: String(all.length), tip: `${label ? label(k) : k}\nTotal ${all.length}\nOpen ${open}` };
    }).filter((x) => x.value);
    PM.charts.hbars(document.getElementById('c-ncr-cat'), { items: counts('category', PM.NCR_CATEGORIES).sort((a, b) => b.value - a.value) });
    PM.charts.hbars(document.getElementById('c-ncr-ph'), { items: counts('phase', PM.PHASES.map((x) => x.key), U.phaseLabel) });
  }

  function ncrForm(p, ncr, done) {
    const T = PM.today();
    const isNew = !ncr;
    const n = ncr || {
      id: PM.uid('N'), projectId: p.id,
      no: `NCR-${p.code.replace(/^PJ-/, '').replace('-PROJ-', '-')}-${String(PM.db.ncrs.filter((x) => x.projectId === p.id).length + 1).padStart(3, '0')}`,
      date: T, phase: 'construction', category: 'Workmanship', severity: 'Minor', description: '', responsible: '', action: '', status: 'open', closedDate: '',
    };
    U.modal({
      title: isNew ? 'New NCR' : n.no, wide: true,
      onDelete: isNew ? null : () => { PM.remove('ncrs', n.id); done(); },
      body: `
        ${U.field('NCR No.', 'no', n.no, { required: true })}
        ${U.field('Date raised', 'date', n.date, { type: 'date', required: true })}
        ${U.field('Phase', 'phase', n.phase, { options: PM.PHASES.map((x) => ({ value: x.key, label: x.label })) })}
        ${U.field('Category', 'category', n.category, { options: PM.NCR_CATEGORIES })}
        ${U.field('Severity', 'severity', n.severity, { options: PM.SEVERITY })}
        ${U.field('Responsible', 'responsible', n.responsible, { placeholder: 'Sub-con / Supplier / Dept.' })}
        ${U.field('Description (ปัญหาที่พบ)', 'description', n.description, { type: 'textarea', full: true })}
        ${U.field('Corrective action', 'action', n.action, { type: 'textarea', full: true, rows: 2 })}
        ${U.field('Status', 'status', n.status, { options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] })}
        ${U.field('Closed date', 'closedDate', n.closedDate, { type: 'date' })}`,
      onSubmit: (f) => {
        if (f.status === 'closed' && !f.closedDate) f.closedDate = T;
        if (f.status === 'open') f.closedDate = '';
        Object.assign(n, f);
        PM.upsert('ncrs', n);
        U.toast('บันทึก NCR แล้ว');
        done();
      },
    });
  }

  /* ---------------- Safety ---------------- */
  function safety(el, p, m) {
    const list = PM.db.safety.filter((s) => s.projectId === p.id).sort((a, b) => (a.month < b.month ? -1 : 1));
    const sinceLti = m.lastLti ? PM.months(m.lastLti, PM.today().slice(0, 7)).length - 1 : null;
    el.innerHTML = `
      <div class="row"><p class="muted" style="margin:0">บันทึกสถิติความปลอดภัยรายเดือน · LTIFR = LTI × 1,000,000 / MH · TRIR = (Recordable + LTI) × 200,000 / MH</p><span class="spacer"></span><button class="btn primary" data-action="new-safety">+ Monthly record</button></div>
      <div class="grid cols-6">
        ${V.tile({ label: 'Man-hours', value: U.num(m.manhours), sub: `${list.length} months` })}
        ${V.tile({ label: 'LTI', value: m.lti, sub: m.lti ? U.badge('critical', `last ${U.month(m.lastLti)}`) : U.badge('good', 'Zero LTI') })}
        ${V.tile({ label: 'LTIFR', value: U.num(m.ltifr, 2), sub: 'per 1,000,000 MH' })}
        ${V.tile({ label: 'TRIR', value: U.num(m.trir, 2), sub: 'per 200,000 MH' })}
        ${V.tile({ label: 'First aid / Near miss', value: `${m.firstAid} <small>/ ${m.nearMiss}</small>`, sub: 'leading indicators' })}
        ${V.tile({ label: 'Months since LTI', value: sinceLti == null ? '–' : sinceLti, sub: sinceLti == null ? 'no LTI recorded' : '' })}
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>Man-hours per month</h2></div><div class="card-b"><div class="chart" id="c-mh"></div></div></div>
        <div class="card"><div class="card-h"><h2>Incidents per month</h2></div><div class="card-b"><div class="chart" id="c-inc"></div></div></div>
      </div>
      <div class="card"><div class="card-h"><h2>Monthly safety records</h2></div>
        <div class="card-b flush table-wrap">${list.length ? `<table class="tbl"><thead><tr><th>Month</th><th class="num">Man-hours</th><th class="num">Near miss</th><th class="num">First aid</th><th class="num">Recordable</th><th class="num">LTI</th><th class="num">Toolbox talks</th><th>Remark</th></tr></thead><tbody>
          ${list.slice().reverse().map((s) => `<tr class="click" data-action="edit-safety" data-id="${s.id}"><td><span class="title">${U.month(s.month)}</span></td>
            <td class="num">${U.num(s.manhours)}</td><td class="num">${s.nearMiss}</td><td class="num">${s.firstAid}</td><td class="num">${s.recordable}</td>
            <td class="num">${s.lti ? U.badge('critical', String(s.lti)) : 0}</td><td class="num">${s.toolboxTalks || 0}</td><td>${esc(s.remark || '')}</td></tr>`).join('')}
          </tbody></table>` : '<p class="empty">ยังไม่มีข้อมูล</p>'}</div></div>`;

    const last = list.slice(-18);
    PM.charts.columns(document.getElementById('c-mh'), {
      categories: last.map((s) => U.month(s.month)), label: 'Man-hours',
      series: [{ name: 'Man-hours', color: 'var(--s1)', values: last.map((s) => s.manhours) }],
    });
    PM.charts.columns(document.getElementById('c-inc'), {
      categories: last.map((s) => U.month(s.month)), label: 'Incidents',
      series: [
        { name: 'Near miss', color: 'var(--s1)', values: last.map((s) => s.nearMiss) },
        { name: 'First aid', color: 'var(--s2)', values: last.map((s) => s.firstAid) },
        { name: 'Recordable', color: 'var(--s3)', values: last.map((s) => s.recordable) },
        { name: 'LTI', color: 'var(--s4)', values: last.map((s) => s.lti) },
      ],
    });
  }

  function safetyForm(p, rec, done) {
    const isNew = !rec;
    const s = rec || { id: PM.uid('S'), projectId: p.id, month: PM.today().slice(0, 7), manhours: 0, nearMiss: 0, firstAid: 0, recordable: 0, lti: 0, toolboxTalks: 0, remark: '' };
    U.modal({
      title: isNew ? 'New monthly safety record' : `Safety · ${U.month(s.month)}`,
      onDelete: isNew ? null : () => { PM.remove('safety', s.id); done(); },
      body: `
        ${U.field('Month', 'month', s.month, { type: 'month', required: true })}
        ${U.field('Man-hours', 'manhours', s.manhours, { type: 'number', min: 0 })}
        ${U.field('Near miss', 'nearMiss', s.nearMiss, { type: 'number', min: 0 })}
        ${U.field('First aid case', 'firstAid', s.firstAid, { type: 'number', min: 0 })}
        ${U.field('Recordable (MTC/RWC)', 'recordable', s.recordable, { type: 'number', min: 0 })}
        ${U.field('LTI (Lost Time Injury)', 'lti', s.lti, { type: 'number', min: 0 })}
        ${U.field('Toolbox talks', 'toolboxTalks', s.toolboxTalks, { type: 'number', min: 0 })}
        ${U.field('Remark', 'remark', s.remark, { full: true })}`,
      onSubmit: (f) => {
        const dup = PM.db.safety.find((x) => x.projectId === p.id && x.month === f.month && x.id !== s.id);
        if (dup) { alert('มีข้อมูลของเดือนนี้อยู่แล้ว — กรุณาแก้ไขรายการเดิม'); return false; }
        Object.assign(s, f);
        PM.upsert('safety', s);
        U.toast('บันทึกแล้ว');
        done();
      },
    });
  }

  /* ---------------- Team & hours (from timesheets) ---------------- */
  function team(el, p) {
    const db = PM.db;
    const ts = db.timesheets.filter((t) => t.kind === 'project' && t.refId === p.id);
    const rate = (r) => { const l = r && db.levels.find((x) => x.id === r.level); return l ? l.rate : 0; };
    const people = db.resources.map((r) => {
      const mine = ts.filter((t) => t.resourceId === r.id);
      const hours = PM.sum(mine, (t) => t.hours);
      return { r, hours, cost: hours * rate(r), last: mine.map((t) => t.date).sort().pop() };
    }).filter((x) => x.hours > 0).sort((a, b) => b.hours - a.hours);
    const totalH = PM.sum(people, (x) => x.hours), totalC = PM.sum(people, (x) => x.cost);
    const T = PM.today();
    const weeks = []; for (let i = 11; i >= 0; i--) weeks.push(PM.addDays(PM.monday(T), -7 * i));

    el.innerHTML = `
      <div class="grid cols-3">
        ${V.tile({ label: 'Team members', value: people.length, sub: 'มีชั่วโมงลงในโครงการ' })}
        ${V.tile({ label: 'Hours logged', value: U.num(totalH), sub: 'จาก Timesheet' })}
        ${V.tile({ label: 'Labour cost (in-house)', value: U.money(totalC), sub: 'hours × rate ตาม level' })}
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>Weekly hours by phase</h2><p>12 สัปดาห์ล่าสุด</p></div><div class="card-b"><div class="chart" id="c-wk"></div></div></div>
        <div class="card"><div class="card-h"><h2>Hours by person</h2></div><div class="card-b"><div class="chart" id="c-person"></div></div></div>
      </div>
      <div class="card"><div class="card-h"><h2>Team</h2></div><div class="card-b flush table-wrap">
        ${people.length ? `<table class="tbl"><thead><tr><th>Name</th><th>Level</th><th>Discipline</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">Cost</th><th>Last entry</th></tr></thead><tbody>
        ${people.map((x) => `<tr><td><span class="title">${esc(x.r.name)}</span></td><td>${esc((db.levels.find((l) => l.id === x.r.level) || {}).name || x.r.level)}</td><td>${esc(x.r.discipline)}</td>
          <td class="num">${U.num(x.hours)}</td><td class="num">${U.num(rate(x.r))}</td><td class="num">${U.money(x.cost)}</td><td>${U.date(x.last)}</td></tr>`).join('')}
        </tbody></table>` : '<p class="empty">ยังไม่มีชั่วโมงใน Timesheet ของโครงการนี้</p>'}
      </div></div>`;

    PM.charts.columns(document.getElementById('c-wk'), {
      categories: weeks.map((w) => U.date(w).slice(0, 6)), tipTitle: weeks.map((w) => 'Week of ' + U.date(w)), label: 'Weekly hours',
      series: PM.PHASES.map((ph, i) => ({
        name: ph.label, color: `var(--s${i + 1})`,
        values: weeks.map((w) => PM.sum(ts.filter((t) => t.phase === ph.key && t.date >= w && t.date <= PM.addDays(w, 6)), (t) => t.hours)),
      })),
    });
    PM.charts.hbars(document.getElementById('c-person'), {
      items: people.slice(0, 12).map((x) => ({ label: x.r.name, sub: PM.levelName(x.r.level), value: x.hours, display: U.num(x.hours) + ' h' })),
    });
  }
})();
