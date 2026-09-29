/* timesheet.js — weekly timesheet entry (feeds Resource Utilization, project hours and bidding effort) */
(function () {
  const U = PM.ui, esc = U.esc;
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const state = { resourceId: null, week: null, rows: null, dirty: false };

  const keyOf = (r) => `${r.kind}|${r.refId}|${r.phase || ''}`;

  function loadRows() {
    const end = PM.addDays(state.week, 6);
    const map = {};
    PM.db.timesheets.filter((t) => t.resourceId === state.resourceId && t.date >= state.week && t.date <= end).forEach((t) => {
      const k = keyOf(t);
      if (!map[k]) map[k] = { kind: t.kind, refId: t.refId, phase: t.phase || '', hours: [0, 0, 0, 0, 0, 0, 0] };
      map[k].hours[PM.diffDays(state.week, t.date)] += t.hours;
    });
    const order = { project: 0, bid: 1, overhead: 2 };
    state.rows = Object.values(map).sort((a, b) => order[a.kind] - order[b.kind] || rowLabel(a).localeCompare(rowLabel(b)));
    state.dirty = false;
  }

  function rowLabel(r) {
    if (r.kind === 'project') { const p = PM.find('projects', r.refId); return p ? `${p.code} · ${U.phaseLabel(r.phase)}` : r.refId; }
    if (r.kind === 'bid') { const b = PM.find('bids', r.refId); return b ? `${b.code} (Bidding)` : r.refId; }
    const o = PM.OVERHEAD.find((x) => x.id === r.refId); return o ? o.label : r.refId;
  }
  function rowSub(r) {
    if (r.kind === 'project') { const p = PM.find('projects', r.refId); return p ? p.name : ''; }
    if (r.kind === 'bid') { const b = PM.find('bids', r.refId); return b ? b.name : ''; }
    return 'Overhead';
  }

  PM.views.timesheet = function (el, fromRouter) {
    const db = PM.db, T = PM.today();
    if (fromRouter && !state.dirty) state.rows = null; // reload from storage when navigating here
    const people = db.resources.filter((r) => r.active !== false);
    if (!people.length) { el.innerHTML = '<div class="callout">ยังไม่มีรายชื่อพนักงาน — เพิ่มได้ที่ <a href="#/resources">Resource Utilization</a></div>'; return; }
    if (!state.resourceId || !people.some((r) => r.id === state.resourceId)) state.resourceId = people[0].id;
    if (!state.week) state.week = PM.monday(T);
    if (!state.rows) loadRows();
    const res = PM.find('resources', state.resourceId);
    const dates = DAYS.map((_, i) => PM.addDays(state.week, i));

    const projects = db.projects.filter((p) => p.status !== 'closed');
    const bids = db.bids.filter((b) => b.result === 'pending' || (b.dates.submit && PM.diffDays(b.dates.submit, T) < 30));

    el.innerHTML = `
      <div class="row">
        <select id="ts-person" aria-label="Person">${U.options(people.map((r) => ({ value: r.id, label: `${r.name} · ${PM.levelName(r.level)}` })), state.resourceId)}</select>
        ${PM.common.weekNav(state.week)}
        <span class="spacer"></span>
        <button class="btn" data-action="from-plan">+ แถวจาก Weekly Plan</button>
        <button class="btn" data-action="copy">Copy rows จากสัปดาห์ก่อน</button>
        <button class="btn primary" data-action="save">บันทึก Timesheet</button>
      </div>
      <div class="card">
        <div class="card-h"><h2>${esc(res.name)}</h2><span class="chip">${esc(PM.levelName(res.level))}</span><span class="chip">${esc(res.discipline)}</span><span class="spacer"></span><span class="muted" id="ts-summary"></span></div>
        <div class="card-b table-wrap" id="ts-grid"></div>
        <div class="card-b" style="border-top:1px solid var(--border)">
          <div class="row">
            <select id="ts-item" aria-label="Work item">
              <optgroup label="Projects (EPC)">${projects.map((p) => `<option value="project|${esc(p.id)}">${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</optgroup>
              <optgroup label="Bidding (Before award)">${bids.map((b) => `<option value="bid|${esc(b.id)}">${esc(b.code)} · ${esc(b.name)}</option>`).join('')}</optgroup>
              <optgroup label="Overhead">${PM.OVERHEAD.map((o) => `<option value="overhead|${o.id}">${esc(o.label)}</option>`).join('')}</optgroup>
            </select>
            <select id="ts-phase" aria-label="Phase">${U.options(PM.PHASES.map((p) => ({ value: p.key, label: p.label })), 'construction')}</select>
            <button class="btn" data-action="add">+ Add row</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h2>Timesheet status — ทั้งทีม</h2><p>ชั่วโมงที่บันทึกในสัปดาห์นี้เทียบกับ capacity (นับถึงวันนี้)</p></div>
        <div class="card-b flush table-wrap" id="ts-team"></div>
      </div>`;

    const phaseSel = el.querySelector('#ts-phase');
    const itemSel = el.querySelector('#ts-item');
    const syncPhase = () => { phaseSel.disabled = !itemSel.value.startsWith('project|'); };
    itemSel.addEventListener('change', syncPhase); syncPhase();

    drawGrid(el, dates, res);
    drawTeam(el, dates);

    const go = (week) => {
      if (state.dirty && !confirm('ยังไม่ได้บันทึก — ต้องการออกจากสัปดาห์นี้หรือไม่?')) return;
      state.week = week; state.rows = null; PM.views.timesheet(el);
    };
    el.querySelector('#ts-person').addEventListener('change', (e) => {
      if (state.dirty && !confirm('ยังไม่ได้บันทึก — ต้องการเปลี่ยนคนหรือไม่?')) { e.target.value = state.resourceId; return; }
      state.resourceId = e.target.value; state.rows = null; PM.views.timesheet(el);
    });
    el.oninput = (e) => {
      const inp = e.target.closest('input[data-r]');
      if (!inp) return;
      const v = Math.max(0, Math.min(24, Number(inp.value) || 0));
      state.rows[+inp.dataset.r].hours[+inp.dataset.d] = v;
      state.dirty = true;
      updateTotals(el, dates, res);
    };
    el.onclick = (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const act = a.dataset.action;
      if (act === 'prev') go(PM.addDays(state.week, -7));
      if (act === 'next') go(PM.addDays(state.week, 7));
      if (act === 'this' && state.week !== PM.monday(T)) go(PM.monday(T));
      if (act === 'add') {
        const [kind, refId] = itemSel.value.split('|');
        const row = { kind, refId, phase: kind === 'project' ? phaseSel.value : '', hours: [0, 0, 0, 0, 0, 0, 0] };
        if (state.rows.some((r) => keyOf(r) === keyOf(row))) { U.toast('มีแถวนี้อยู่แล้ว'); return; }
        state.rows.push(row); drawGrid(el, dates, res);
      }
      if (act === 'remove') { state.rows.splice(+a.dataset.r, 1); state.dirty = true; drawGrid(el, dates, res); }
      if (act === 'from-plan') {
        let n = 0;
        (PM.db.plans || []).filter((p) => p.week === state.week && p.resourceId === state.resourceId).forEach((p) => {
          const row = { kind: p.kind, refId: p.refId, phase: p.phase || '', hours: [0, 0, 0, 0, 0, 0, 0] };
          if (state.rows.some((r) => keyOf(r) === keyOf(row))) return;
          state.rows.push(row); n++;
        });
        U.toast(n ? `เพิ่ม ${n} แถวจาก Weekly Plan` : 'ไม่มีงานใน Weekly Plan สัปดาห์นี้ที่ยังไม่มีแถว');
        drawGrid(el, dates, res);
      }
      if (act === 'copy') {
        const prev = PM.addDays(state.week, -7), prevEnd = PM.addDays(state.week, -1);
        let n = 0;
        PM.db.timesheets.filter((t) => t.resourceId === state.resourceId && t.date >= prev && t.date <= prevEnd).forEach((t) => {
          const row = { kind: t.kind, refId: t.refId, phase: t.phase || '', hours: [0, 0, 0, 0, 0, 0, 0] };
          if (t.refId === 'leave' || state.rows.some((r) => keyOf(r) === keyOf(row))) return;
          state.rows.push(row); n++;
        });
        U.toast(n ? `เพิ่ม ${n} แถวจากสัปดาห์ก่อน` : 'ไม่มีแถวใหม่ให้คัดลอก');
        drawGrid(el, dates, res);
      }
      if (act === 'save') {
        const end = dates[6];
        PM.db.timesheets = PM.db.timesheets.filter((t) => !(t.resourceId === state.resourceId && t.date >= state.week && t.date <= end));
        state.rows.forEach((r) => r.hours.forEach((h, i) => {
          if (h > 0) PM.db.timesheets.push({ id: PM.uid('t'), resourceId: state.resourceId, date: dates[i], kind: r.kind, refId: r.refId, phase: r.phase, hours: h });
        }));
        PM.save();
        state.dirty = false;
        U.toast('บันทึก Timesheet แล้ว');
        loadRows();
        drawGrid(el, dates, res);
        drawTeam(el, dates);
      }
    };
  };

  function drawGrid(el, dates, res) {
    const T = PM.today();
    const box = el.querySelector('#ts-grid');
    if (!state.rows.length) {
      box.innerHTML = '<p class="empty">ยังไม่มีรายการในสัปดาห์นี้ — เพิ่มแถวด้านล่าง หรือ Copy rows จากสัปดาห์ก่อน</p>';
      updateTotals(el, dates, res);
      return;
    }
    const dayCls = (i) => `${i > 4 ? 'weekend' : ''}${dates[i] === T ? ' today' : ''}`;
    box.innerHTML = `<table class="tbl ts-grid"><thead><tr><th>Work item</th>
      ${DAYS.map((d, i) => `<th class="num ${dayCls(i)}">${d}<small>${U.date(dates[i]).slice(0, 6)}</small></th>`).join('')}
      <th class="num">Total</th><th></th></tr></thead><tbody>
      ${state.rows.map((r, ri) => `<tr>
        <td><span class="title">${esc(rowLabel(r))}</span><small>${esc(rowSub(r))}</small></td>
        ${r.hours.map((h, di) => `<td class="num ${dayCls(di)}"><input type="number" min="0" max="24" step="0.5" value="${h || ''}" data-r="${ri}" data-d="${di}" aria-label="${esc(rowLabel(r))} ${DAYS[di]}"></td>`).join('')}
        <td class="num" data-rowtotal="${ri}"></td>
        <td><button class="icon-btn" data-action="remove" data-r="${ri}" aria-label="Remove row">✕</button></td></tr>`).join('')}
      </tbody><tfoot><tr><td>Total / day</td>${DAYS.map((_, i) => `<td class="num ${dayCls(i)}" data-daytotal="${i}"></td>`).join('')}<td class="num" data-grand></td><td></td></tr></tfoot></table>`;
    updateTotals(el, dates, res);
  }

  function updateTotals(el, dates, res) {
    const perDay = PM.cap(res) / 5;
    let grand = 0, billable = 0, leave = 0;
    state.rows.forEach((r, ri) => {
      const t = PM.sum(r.hours);
      grand += t;
      if (r.kind !== 'overhead') billable += t;
      if (r.refId === 'leave') leave += t;
      const c = el.querySelector(`[data-rowtotal="${ri}"]`); if (c) c.textContent = U.num(t, 1);
    });
    dates.forEach((d, i) => {
      const t = PM.sum(state.rows, (r) => r.hours[i]);
      const c = el.querySelector(`[data-daytotal="${i}"]`);
      if (c) { c.innerHTML = U.num(t, 1) + (t > perDay + 2 ? ' <span class="badge critical" title="Overtime"><i>!</i>OT</span>' : ''); }
    });
    const g = el.querySelector('[data-grand]'); if (g) g.textContent = U.num(grand, 1);
    const cap = PM.cap(res) - leave;
    el.querySelector('#ts-summary').textContent = `Total ${U.num(grand, 1)} h · Billable ${U.num(billable, 1)} h · Utilization ${U.pct(cap > 0 ? billable / cap : null)}${state.dirty ? ' · ยังไม่ได้บันทึก' : ''}`;
  }

  function drawTeam(el, dates) {
    const T = PM.today();
    const to = PM.min(dates[6], T);
    const ut = PM.utilization(dates[0], to);
    const box = el.querySelector('#ts-team');
    if (dates[0] > T) { box.innerHTML = '<p class="empty">สัปดาห์ในอนาคต</p>'; return; }
    box.innerHTML = `<table class="tbl"><thead><tr><th>Name</th><th>Level</th><th class="num">Expected h</th><th class="num">Logged h</th><th class="num">Billable h</th><th>Completeness</th><th></th></tr></thead><tbody>
      ${ut.people.map((x) => {
        const comp = x.capacity ? x.logged / x.capacity : null;
        const st = comp == null ? 'neutral' : comp >= 0.95 ? 'good' : comp >= 0.6 ? 'warning' : 'critical';
        return `<tr><td><span class="title">${esc(x.r.name)}</span></td><td>${esc(PM.levelName(x.r.level))}</td><td class="num">${U.num(x.capacity)}</td><td class="num">${U.num(x.logged, 1)}</td><td class="num">${U.num(x.billable, 1)}</td>
          <td>${U.badge(st, comp == null ? 'n/a' : comp >= 0.95 ? 'Complete' : `${U.pct(comp)} logged`)}</td>
          <td>${x.r.id === state.resourceId ? '<span class="muted">กำลังแก้ไข</span>' : `<a href="#/timesheet" data-person="${esc(x.r.id)}">เปิด</a>`}</td></tr>`;
      }).join('')}</tbody></table>`;
    box.querySelectorAll('[data-person]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      if (state.dirty && !confirm('ยังไม่ได้บันทึก — ต้องการเปลี่ยนคนหรือไม่?')) return;
      state.resourceId = a.dataset.person; state.rows = null; PM.views.timesheet(el); window.scrollTo(0, 0);
    }));
  }
})();
