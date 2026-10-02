/* projects.js — Execution portfolio: Engineering → Procurement → Construction → Closing */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  // sales / pm: '' = everyone, '-' = not set · health: good | warning | critical | onhold · q = search (not remembered)
  const state = U.keep('projects', { status: 'active', phase: '', sales: '', pm: '', health: '', q: '' }, ['status', 'phase', 'sales', 'pm', 'health']);

  /* the same health the table shows: closed / on hold, else the worse of SPI and CPI */
  const healthOf = (r) => (r.p.status === 'closed' ? 'closed' : r.p.status === 'onhold' ? 'onhold' : U.worst(U.health(r.m.spi), U.health(r.m.cpi)));
  const HEALTH = [{ value: 'good', label: 'On track' }, { value: 'warning', label: 'At risk' }, { value: 'critical', label: 'Off track' }, { value: 'onhold', label: 'On hold' }];

  PM.views.projects = function (el) {
    const db = PM.db;
    const all = db.projects.map((p) => ({ p, m: PM.projectMetrics(p) }));
    const keyOf = (p) => PM.salesKey(p) || '-';
    const pmOf = (p) => V.pmResourceId(p.pm) || '-';
    const distinct = (fn) => { const out = []; db.projects.forEach((p) => { const k = fn(p); if (!out.includes(k)) out.push(k); }); return out; };
    const salesIds = distinct(keyOf), pmIds = distinct(pmOf);
    if (state.sales && !salesIds.includes(state.sales)) state.sales = '';
    if (state.pm && !pmIds.includes(state.pm)) state.pm = '';

    // search: project no., name, client, PM, Sales, bid no.
    const q = state.q.trim().toLowerCase();
    const text = (p) => { const b = p.bidId && PM.find('bids', p.bidId); return [p.code, p.name, p.client, V.pmName(p), V.salesName(p), b && b.code].join(' ').toLowerCase(); };
    const byStatus = all.filter((r) => state.status === 'all' || (state.status === 'active' ? r.p.status !== 'closed' : r.p.status === 'closed'));
    const rows = byStatus.filter((r) => (!state.phase || (r.m.current && r.m.current.key === state.phase))
      && (!state.sales || keyOf(r.p) === state.sales)
      && (!state.pm || pmOf(r.p) === state.pm)
      && (!state.health || healthOf(r) === state.health)
      && (!q || q.split(/\s+/).every((w) => text(r.p).includes(w))));
    const filtered = !!(state.phase || state.sales || state.pm || state.health || q);
    const activeRows = all.filter((r) => r.p.status !== 'closed');
    const salesLabel = (k) => (k === '-' ? 'ไม่ระบุ Sales' : 'Sales: ' + V.salesName(db.projects.find((p) => keyOf(p) === k)));
    const pmLabel = (k) => (k === '-' ? 'ไม่ระบุ PM' : 'PM: ' + V.pmName(db.projects.find((p) => pmOf(p) === k)));
    const opt = (v, label, cur) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(label)}</option>`;

    el.innerHTML = `
      <div class="row">
        ${V.seg('status', [{ key: 'active', label: 'Active' }, { key: 'closed', label: 'Closed' }, { key: 'all', label: 'All' }], state.status)}
        <input type="search" id="prj-q" placeholder="ค้นหา Project No. / ชื่อโครงการ / ลูกค้า / PM / Sales…" value="${esc(state.q)}" aria-label="ค้นหาโครงการ" style="width:300px">
        <span class="spacer"></span>
        <button class="btn primary fab" data-action="new" aria-label="New project"><span class="fab-i">+</span><span class="fab-t">New project</span></button>
      </div>
      <div class="row filter-row">
        <select id="prj-phase" aria-label="Phase" style="width:auto">${opt('', 'Phase: ทั้งหมด', state.phase)}${PM.PHASES.map((ph) => opt(ph.key, 'Phase: ' + ph.label, state.phase)).join('')}</select>
        <select id="prj-health" aria-label="สถานะโครงการ" style="width:auto">${opt('', 'สถานะ: ทั้งหมด', state.health)}${HEALTH.map((h) => opt(h.value, 'สถานะ: ' + h.label, state.health)).join('')}</select>
        <select id="prj-pm" aria-label="Project Manager" style="width:auto">${opt('', 'PM: ทุกคน', state.pm)}${pmIds.map((k) => opt(k, pmLabel(k), state.pm)).join('')}</select>
        <select id="prj-sales" aria-label="Sales" style="width:auto">${opt('', 'Sales: ทุกคน', state.sales)}${salesIds.map((k) => opt(k, salesLabel(k), state.sales)).join('')}</select>
        ${filtered ? '<button class="btn sm" data-action="clear-filters">ล้างตัวกรอง ✕</button>' : ''}
      </div>
      ${V.flow(PM.PHASES.map((ph) => {
        const inPh = activeRows.filter((r) => r.m.current && r.m.current.key === ph.key);
        const avgAct = activeRows.length ? PM.sum(activeRows, (r) => r.m.phases.find((x) => x.key === ph.key).actualPct) / activeRows.length : null;
        return { label: ph.label, th: ph.th, big: `${inPh.length} <small class="muted" style="font-size:12px">โครงการ</small>`,
          meta: `avg progress ${U.pct(avgAct)}`, action: 'phase:' + ph.key, active: state.phase === ph.key,
          tip: `${ph.label}\nProjects currently in this phase: ${inPh.length}\nClick to filter` };
      }))}
      <div class="card">
        <div class="card-h"><h2>Projects</h2><span class="chip" id="prj-count">${filtered ? `พบ ${rows.length} จาก ${byStatus.length} โครงการ` : `${rows.length} โครงการ`}</span><p>คลิกเพื่อดูรายละเอียด KPI · Quantity · Time · Cost · Quality · Safety</p></div>
        <div class="card-b flush table-wrap">${table(rows, filtered)}</div>
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>SPI by project</h2><p>Time — ≥ 0.95 On track · 0.90–0.95 At risk · &lt; 0.90 Off track</p></div><div class="card-b"><div class="chart" id="c-spi"></div></div></div>
        <div class="card"><div class="card-h"><h2>CPI by project</h2><p>Cost — Earned Value ÷ Actual Cost</p></div><div class="card-b"><div class="chart" id="c-cpi"></div></div></div>
      </div>`;

    const bar = (key, label) => ({
      max: 1.2,
      items: rows.filter((r) => r.m[key] != null).map((r) => {
        const v = r.m[key], h = U.health(v);
        return { label: r.p.code, sub: U.healthLabel[h], value: v, target: 1, display: U.ratio(v), color: 'var(--s1)', tip: `${r.p.code} ${r.p.name}\n${label} ${U.ratio(v)} — ${U.healthLabel[h]}` };
      }),
    });
    PM.charts.hbars(document.getElementById('c-spi'), bar('spi', 'SPI'));
    PM.charts.hbars(document.getElementById('c-cpi'), bar('cpi', 'CPI'));

    const rerender = () => PM.views.projects(el);
    [['#prj-sales', 'sales'], ['#prj-pm', 'pm'], ['#prj-phase', 'phase'], ['#prj-health', 'health']].forEach(([sel, k]) => {
      el.querySelector(sel).onchange = (e) => { state[k] = e.target.value; rerender(); };
    });
    el.querySelector('#prj-q').addEventListener('input', (e) => {
      state.q = e.target.value;
      clearTimeout(state.t);
      state.t = setTimeout(() => { rerender(); const i = el.querySelector('#prj-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
    });
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg]');
      if (seg) { state[seg.dataset.seg] = seg.dataset.val; rerender(); return; }
      const a = e.target.closest('[data-action]');
      if (a) {
        const act = a.dataset.action;
        if (act === 'new') V.projectForm(null, null, (p) => (location.hash = '#/projects/' + p.id));
        if (act === 'clear-filters') { Object.assign(state, { phase: '', sales: '', pm: '', health: '', q: '' }); rerender(); }
        if (act.startsWith('phase:')) { const k = act.slice(6); state.phase = state.phase === k ? '' : k; rerender(); }
        return;
      }
      const tr = e.target.closest('tr[data-id]');
      if (tr) location.hash = '#/projects/' + tr.dataset.id;
    };
  };

  function table(rows, filtered) {
    if (!rows.length) return filtered
      ? '<p class="empty">ไม่พบโครงการที่ตรงกับคำค้นหา / ตัวกรอง — <button type="button" class="link-btn" data-action="clear-filters">ล้างตัวกรอง</button></p>'
      : '<p class="empty">ไม่มีโครงการในมุมมองนี้</p>';
    // Health sits right after Project (always in view without scrolling); SPI / CPI are shown under it as the reason
    const ratio = (label, v) => `<span class="hm-${U.health(v)}">${label} ${U.ratio(v)}</span>`;
    return `<table class="tbl prj-table"><thead><tr>
      <th>Project</th><th>Health</th><th>Phase</th><th>Progress (actual vs plan)</th>
      <th class="num">Contract / Cost</th><th class="num">NCR open</th><th class="num">LTIFR</th><th>Finish</th><th>Client / PM / Sales</th></tr></thead><tbody>
      ${rows.map(({ p, m }) => {
        const h = p.status === 'closed' ? 'neutral' : U.worst(U.health(m.spi), U.health(m.cpi));
        return `<tr class="click" data-id="${esc(p.id)}">
          <td class="prj-name"><span class="title">${esc(p.code)}</span><small>${esc(p.name)}</small></td>
          <td class="prj-health" data-tip="${esc(`SPI ${U.ratio(m.spi)} (Time) · CPI ${U.ratio(m.cpi)} (Cost)\n≥ 0.95 On track · 0.90–0.95 At risk · < 0.90 Off track`)}">${p.status === 'closed' ? U.badge('neutral', 'Closed') : p.status === 'onhold' ? U.badge('warning', 'On hold') : U.badge(h, U.healthLabel[h])}
            <small>${ratio('SPI', m.spi)} · ${ratio('CPI', m.cpi)}</small></td>
          <td>${m.current ? `<span class="chip">${esc(U.phaseLabel(m.current.key))}</span>` : '<span class="chip">Closed</span>'}</td>
          <td class="prj-progress"><div class="pbar-wrap">${U.progress(m.act, p.status === 'closed' ? null : m.plan)}<span class="num">${U.pct(m.act)}</span></div></td>
          <td class="num" data-tip="${esc(`Contract ${U.money(p.contractValue)}\nPlan cost ${U.money(m.bac)}\nActual cost ${U.money(m.ac)}\n${m.ac > m.bac ? 'เกินงบ' : 'คงเหลือ'} ${U.money(Math.abs(m.bac - m.ac))}`)}">${U.money(p.contractValue)}
            <small>Plan ${U.money(m.bac)}</small><small class="${m.ac > m.bac ? 'neg' : ''}">Actual ${U.money(m.ac)} · ${U.pct(m.bac ? m.ac / m.bac : null)}</small></td>
          <td class="num">${m.ncrOpen} <small style="display:inline">/ ${m.ncrTotal}</small></td>
          <td class="num">${U.num(m.ltifr, 2)}</td>
          <td class="nowrap">${U.date(p.endDate)}</td>
          <td class="prj-client">${esc(p.client)}<small>PM: ${esc(V.pmName(p))}</small><small>Sales: ${esc(V.salesName(p))}</small></td></tr>`;
      }).join('')}</tbody></table>`;
  }
})();
