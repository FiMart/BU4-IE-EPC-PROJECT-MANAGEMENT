/* projects.js — Execution portfolio: Engineering → Procurement → Construction → Closing */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  const state = { status: 'active', phase: '' };

  PM.views.projects = function (el) {
    const db = PM.db;
    const all = db.projects.map((p) => ({ p, m: PM.projectMetrics(p) }));
    const byStatus = all.filter((r) => state.status === 'all' || (state.status === 'active' ? r.p.status !== 'closed' : r.p.status === 'closed'));
    const rows = byStatus.filter((r) => !state.phase || (r.m.current && r.m.current.key === state.phase));
    const activeRows = all.filter((r) => r.p.status !== 'closed');

    el.innerHTML = `
      <div class="row">
        ${V.seg('status', [{ key: 'active', label: 'Active' }, { key: 'closed', label: 'Closed' }, { key: 'all', label: 'All' }], state.status)}
        ${state.phase ? `<button class="btn sm" data-action="clear-phase">Phase: ${esc(U.phaseLabel(state.phase))} ✕</button>` : ''}
        <span class="spacer"></span>
        <button class="btn primary" data-action="new">+ New project</button>
      </div>
      ${V.flow(PM.PHASES.map((ph) => {
        const inPh = activeRows.filter((r) => r.m.current && r.m.current.key === ph.key);
        const avgAct = activeRows.length ? PM.sum(activeRows, (r) => r.m.phases.find((x) => x.key === ph.key).actualPct) / activeRows.length : null;
        return { label: ph.label, th: ph.th, big: `${inPh.length} <small class="muted" style="font-size:12px">โครงการ</small>`,
          meta: `avg progress ${U.pct(avgAct)}`, action: 'phase:' + ph.key, active: state.phase === ph.key,
          tip: `${ph.label}\nProjects currently in this phase: ${inPh.length}\nClick to filter` };
      }))}
      <div class="card">
        <div class="card-h"><h2>Projects</h2><p>คลิกเพื่อดูรายละเอียด KPI · Quantity · Time · Cost · Quality · Safety</p></div>
        <div class="card-b flush table-wrap">${table(rows)}</div>
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
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg]');
      if (seg) { state[seg.dataset.seg] = seg.dataset.val; rerender(); return; }
      const a = e.target.closest('[data-action]');
      if (a) {
        const act = a.dataset.action;
        if (act === 'new') V.projectForm(null, null, (p) => (location.hash = '#/projects/' + p.id));
        if (act === 'clear-phase') { state.phase = ''; rerender(); }
        if (act.startsWith('phase:')) { const k = act.slice(6); state.phase = state.phase === k ? '' : k; rerender(); }
        return;
      }
      const tr = e.target.closest('tr[data-id]');
      if (tr) location.hash = '#/projects/' + tr.dataset.id;
    };
  };

  function table(rows) {
    if (!rows.length) return '<p class="empty">ไม่มีโครงการในมุมมองนี้</p>';
    return `<table class="tbl"><thead><tr>
      <th>Project</th><th>Client</th><th class="num">Contract</th><th>Phase</th><th style="min-width:170px">Progress (actual vs plan)</th>
      <th class="num">SPI</th><th class="num">CPI</th><th class="num">NCR open</th><th class="num">LTIFR</th><th>Finish</th><th>Health</th></tr></thead><tbody>
      ${rows.map(({ p, m }) => {
        const h = p.status === 'closed' ? 'neutral' : U.worst(U.health(m.spi), U.health(m.cpi));
        return `<tr class="click" data-id="${esc(p.id)}">
          <td><span class="title">${esc(p.code)}</span><small>${esc(p.name)}</small></td>
          <td>${esc(p.client)}</td>
          <td class="num">${U.money(p.contractValue)}</td>
          <td>${m.current ? `<span class="chip">${esc(U.phaseLabel(m.current.key))}</span>` : '<span class="chip">Closed</span>'}</td>
          <td><div class="pbar-wrap">${U.progress(m.act, p.status === 'closed' ? null : m.plan)}<span class="num">${U.pct(m.act)}</span></div></td>
          <td class="num">${U.ratio(m.spi)}</td><td class="num">${U.ratio(m.cpi)}</td>
          <td class="num">${m.ncrOpen} <small style="display:inline">/ ${m.ncrTotal}</small></td>
          <td class="num">${U.num(m.ltifr, 2)}</td>
          <td>${U.date(p.endDate)}</td>
          <td>${p.status === 'closed' ? U.badge('neutral', 'Closed') : p.status === 'onhold' ? U.badge('warning', 'On hold') : U.badge(h, U.healthLabel[h])}</td></tr>`;
      }).join('')}</tbody></table>`;
  }
})();
