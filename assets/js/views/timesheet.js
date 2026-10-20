/* timesheet.js — weekly timesheet entry (feeds Resource Utilization, project hours and bidding effort) */
(function () {
  const U = PM.ui, esc = U.esc;
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const state = U.keep('timesheet', { resourceId: null, week: null, rows: null, dirty: false }, ['resourceId']);

  const keyOf = (r) => `${r.kind}|${r.refId}|${r.phase || ''}`;

  /* Autosave: hours are written to the data (local + cloud) shortly after typing — no "save" needed.
     Ids are fixed per person / day / work item, so re-saving updates the same records. */
  let saveTimer = null;
  function commit() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!state.dirty || !state.rows) return;
    if (!PM.can('timesheet.edit')) { state.dirty = false; return; } // view only (Admin / Project Manager fill in)
    const dates = DAYS.map((_, i) => PM.addDays(state.week, i));
    const who = state.resourceId;
    PM.db.timesheets = PM.db.timesheets.filter((t) => !(t.resourceId === who && t.date >= dates[0] && t.date <= dates[6]));
    state.rows.forEach((r) => r.hours.forEach((h, i) => {
      if (h > 0) PM.db.timesheets.push({ id: `ts-${who}-${dates[i]}-${r.kind}-${r.refId}-${r.phase || '-'}`, resourceId: who, date: dates[i], kind: r.kind, refId: r.refId, phase: r.phase, hours: h });
    }));
    // OT inputs of the week (clock-out time / no lunch break) — a record only for days that have one (PM.overtime)
    dates.forEach((d) => {
      const o = (state.ot || {})[d];
      if (o && (o.endTime || o.noLunch)) PM.db.timesheets.push({ id: `ot-${who}-${d}`, resourceId: who, date: d, kind: 'ot', refId: 'ot', phase: '', hours: 0, endTime: o.endTime || '', noLunch: !!o.noLunch });
    });
    PM.save();
    state.dirty = false;
    const s = document.getElementById('ts-summary');
    if (s) s.textContent = s.textContent.replace('กำลังบันทึก…', 'บันทึกอัตโนมัติแล้ว');
  }
  const commitSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(commit, 600); };
  // leaving the page or closing the tab: write what was typed right away
  window.addEventListener('hashchange', commit);
  window.addEventListener('pagehide', commit);
  document.addEventListener('visibilitychange', () => { if (document.hidden) commit(); });

  /* Rows come from the Weekly Plan only: every task this person is on this week (shared tasks too), one row per
     work item (project + phase / bid + stage) with the plan's task names and planned hours. Besides the plan:
     leave / meeting / training (Overhead). Hours already logged on something outside the plan stay visible ("ไม่อยู่ในแผน"). */
  const rowFromPlan = (p) => {
    const b = p.kind === 'bid' && PM.find('bids', p.refId);
    return { kind: p.kind, refId: p.refId, phase: p.kind === 'overhead' ? '' : p.phase || (b ? PM.bidStageAt(b, PM.addDays(state.week, 6)) : '') };
  };
  function loadRows() {
    const end = PM.addDays(state.week, 6);
    const map = {};
    const row = (r) => map[keyOf(r)] || (map[keyOf(r)] = Object.assign({ hours: [0, 0, 0, 0, 0, 0, 0], tasks: [], planned: 0 }, r));
    (PM.db.plans || []).filter((p) => p.week === state.week && PM.planHas && PM.planHas(p, state.resourceId)).forEach((p) => {
      const r = row(rowFromPlan(p));
      r.tasks.push(p);
      r.planned += p.plannedHours || 0;
      r.fromPlan = true;
    });
    state.ot = {};
    PM.db.timesheets.filter((t) => t.resourceId === state.resourceId && t.date >= state.week && t.date <= end).forEach((t) => {
      if (t.kind === 'ot') { state.ot[t.date] = { endTime: t.endTime || '', noLunch: !!t.noLunch }; return; } // OT inputs, not a work row
      const r = row({ kind: t.kind, refId: t.refId, phase: t.phase || '' });
      r.hours[PM.diffDays(state.week, t.date)] += t.hours;
    });
    const order = { project: 0, bid: 1, overhead: 2 };
    state.rows = Object.values(map).map((r) => Object.assign(r, { off: !r.fromPlan && r.kind !== 'overhead' }))
      .sort((a, b) => (a.off - b.off) || order[a.kind] - order[b.kind] || rowLabel(a).localeCompare(rowLabel(b)));
    state.dirty = false;
  }

  function rowLabel(r) {
    if (r.kind === 'project') { const p = PM.find('projects', r.refId); return p ? `${p.code} · ${U.phaseLabel(r.phase)}` : r.refId; }
    if (r.kind === 'bid') { const b = PM.find('bids', r.refId); return b ? `${b.code} · ${PM.bidStageLabel(r.phase) || 'ไม่ระบุขั้นตอน'} (Bidding)` : r.refId; }
    const o = PM.OVERHEAD.find((x) => x.id === r.refId); return o ? o.label : r.refId;
  }
  function rowSub(r) {
    if (r.kind === 'project') { const p = PM.find('projects', r.refId); return p ? p.name : ''; }
    if (r.kind === 'bid') { const b = PM.find('bids', r.refId); return b ? bidInfo(b) : ''; }
    return 'Overhead';
  }
  /* bid details shown under the row: scope · client · where the bid is now · due date · value */
  function bidInfo(b) {
    const now = b.result === 'pending' ? `ตอนนี้: ${PM.bidStageLabel(b.stage)}` : `ผล: ${PM.BID_RESULTS[b.result] || b.result}`;
    return [b.name, b.client, now, b.dueDate ? `Due ${U.date(b.dueDate)}` : '', b.value && PM.canSeeBidPrice(b) ? U.money(b.value) : ''].filter(Boolean).join(' · ');
  }

  PM.views.timesheet = function (el, fromRouter) {
    const db = PM.db, T = PM.today();
    if (fromRouter && !state.dirty) state.rows = null; // reload from storage when navigating here
    // only people who log a Timesheet (Level Other / capacity 0 do not — PM.needsTimesheet)
    const people = db.resources.filter((r) => r.active !== false && PM.needsTimesheet(r));
    if (!people.length) { el.innerHTML = '<div class="callout">ยังไม่มีพนักงานที่ต้องลง Timesheet — เพิ่มได้ที่ <a href="#/resources">ภาระงานบุคลากร</a> (Level Other ไม่ต้องลง Timesheet)</div>'; return; }
    if (!state.resourceId || !people.some((r) => r.id === state.resourceId)) { state.resourceId = people[0].id; state.rows = null; }
    if (!state.week) state.week = PM.monday(T);
    if (!state.rows) loadRows();
    const res = PM.find('resources', state.resourceId);
    const dates = DAYS.map((_, i) => PM.addDays(state.week, i));

    const canEdit = PM.can('timesheet.edit');
    const nPlan = state.rows.filter((r) => r.fromPlan).length;

    el.innerHTML = `
      <div class="row">
        <select id="ts-person" aria-label="Person">${U.options(people.map((r) => ({ value: r.id, label: `${r.name} · ${PM.levelName(r.level)}` })), state.resourceId)}</select>
        ${PM.common.weekNav(state.week)}
        <span class="spacer"></span>
        <a class="btn" href="#/weekly">เปิด Weekly Plan →</a>
        ${canEdit ? '<button class="btn primary" data-action="save">บันทึก Timesheet</button>' : ''}
      </div>
      ${canEdit ? '' : `<div class="callout">ดูได้อย่างเดียว — Timesheet กรอกและแก้ไขได้เฉพาะ <b>${esc(PM.whoCan('timesheet.edit'))}</b> (Role ของคุณ: ${esc(PM.roleLabel(PM.auth && PM.auth.role))})</div>`}
      <div class="card">
        <div class="card-h"><h2>${esc(res.name)}</h2><span class="chip">${esc(PM.levelName(res.level))}</span><span class="chip">${esc(res.discipline)}</span><span class="spacer"></span><span class="muted" id="ts-summary"></span>
          <p>งานมาจาก <b>Weekly Plan</b> ของสัปดาห์นี้อย่างเดียว (${nPlan} รายการ) — กรอกชั่วโมงที่ทำจริงรายวัน · คอลัมน์ "แผน" = ชั่วโมงตามแผนของคนนี้ · งานที่ไม่อยู่ในแผนให้เพิ่มที่ Weekly Plan ก่อน</p></div>
        <div class="card-b table-wrap" id="ts-grid"></div>
        ${canEdit ? `<div class="card-b ts-oh" style="border-top:1px solid var(--border)">
          <div class="row">
            <span class="muted">นอกแผน (ไม่ใช่งานโครงการ / Bid):</span>
            <select id="ts-oh" aria-label="ลา / ประชุม / อบรม">${PM.OVERHEAD.map((o) => `<option value="${o.id}">${esc(o.label)}</option>`).join('')}</select>
            <button class="btn" data-action="add-oh">+ เพิ่ม</button>
          </div>
        </div>` : ''}
      </div>
      <div class="card">
        <div class="card-h"><h2>ชั่วโมง Bidding แยกตามขั้นตอน — ทั้งทีม</h2><p>ทุก Bid ที่มีการลงชั่วโมงในสัปดาห์นี้ · Inquiry → Estimate → Proposal → Submit</p></div>
        <div class="card-b flush table-wrap" id="ts-bids"></div>
      </div>
      <div class="card">
        <div class="card-h"><h2>Timesheet status — ทั้งทีม</h2><p>ชั่วโมงที่บันทึกในสัปดาห์นี้เทียบกับ capacity (นับถึงวันนี้)</p></div>
        <div class="card-b flush table-wrap" id="ts-team"></div>
      </div>`;

    drawGrid(el, dates, res);
    drawBids(el, dates);
    drawTeam(el, dates);

    const go = (week) => { commit(); state.week = week; state.rows = null; PM.views.timesheet(el); };
    el.querySelector('#ts-person').addEventListener('change', (e) => {
      commit(); state.resourceId = e.target.value; state.rows = null; PM.views.timesheet(el);
    });
    el.oninput = (e) => {
      // OT inputs: weekday clock-out time / no lunch break
      const ot = e.target.closest('[data-ot-end], [data-ot-lunch]');
      if (ot && canEdit) {
        const d = ot.dataset.otEnd || ot.dataset.otLunch;
        const o = state.ot[d] || (state.ot[d] = { endTime: '', noLunch: false });
        if (ot.dataset.otEnd) o.endTime = ot.value; else o.noLunch = ot.checked;
        state.dirty = true;
        updateTotals(el, dates, res);
        commitSoon();
        return;
      }
      const inp = e.target.closest('input[data-r]');
      if (!inp || !canEdit) return;
      const v = Math.max(0, Math.min(24, Number(inp.value) || 0));
      state.rows[+inp.dataset.r].hours[+inp.dataset.d] = v;
      state.dirty = true;
      updateTotals(el, dates, res);
      commitSoon();
    };
    el.onchange = (e) => { if (e.target.closest('input[data-r]')) { commit(); updateTotals(el, dates, res); drawBids(el, dates); drawTeam(el, dates); } };
    el.onclick = (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const act = a.dataset.action;
      if (act === 'prev') go(PM.addDays(state.week, -7));
      if (act === 'next') go(PM.addDays(state.week, 7));
      if (act === 'this' && state.week !== PM.monday(T)) go(PM.monday(T));
      if (!canEdit) return; // everything below changes the timesheet
      // only leave / meeting / training can be added here — project and bid work comes from the Weekly Plan
      if (act === 'add-oh') {
        const id = el.querySelector('#ts-oh').value;
        const row = { kind: 'overhead', refId: id, phase: '', hours: [0, 0, 0, 0, 0, 0, 0], tasks: [], planned: 0 };
        if (state.rows.some((r) => keyOf(r) === keyOf(row))) { U.toast('มีแถวนี้อยู่แล้ว'); return; }
        state.rows.push(row); drawGrid(el, dates, res);
      }
      // a plan row can't be removed (it comes from the plan); overhead and "not in the plan" rows can
      if (act === 'remove') {
        const r = state.rows[+a.dataset.r];
        if (!r || r.fromPlan) return;
        const remove = () => { state.rows.splice(state.rows.indexOf(r), 1); state.dirty = true; commit(); drawGrid(el, dates, res); drawBids(el, dates); drawTeam(el, dates); };
        if (!PM.sum(r.hours)) remove();
        else U.confirm(`ลบแถว "${rowLabel(r)}" และชั่วโมงที่บันทึกไว้ ${U.num(PM.sum(r.hours), 1)} h?`, { title: 'ลบแถว Timesheet', ok: 'ลบ' }).then((ok) => { if (ok) remove(); });
      }
      if (act === 'save') {
        state.dirty = true; // write now even if autosave already did
        commit();
        U.toast('บันทึก Timesheet แล้ว');
        loadRows();
        drawGrid(el, dates, res);
        drawBids(el, dates);
        drawTeam(el, dates);
      }
    };
  };

  function drawGrid(el, dates, res) {
    const T = PM.today();
    const box = el.querySelector('#ts-grid');
    const canEdit = PM.can('timesheet.edit');
    if (!state.rows.length) {
      box.innerHTML = `<div class="empty ts-empty"><p>ยังไม่มีงานใน <b>Weekly Plan</b> ของ ${esc(res.name)} สัปดาห์นี้ — Timesheet ดึงงานจากแผนอย่างเดียว</p>
        <a class="btn primary" href="#/weekly">วางแผนงานที่ Weekly Plan →</a>${canEdit ? '<small class="muted">ลา / ประชุม / อบรม เพิ่มได้ด้านล่าง</small>' : ''}</div>`;
      updateTotals(el, dates, res);
      return;
    }
    const hol = dates.map((d) => PM.holidayOf(d)); // public holidays (OT settings) look like a weekend
    const dayCls = (i) => `${i > 4 || hol[i] ? 'weekend' : ''}${hol[i] ? ' holiday' : ''}${dates[i] === T ? ' today' : ''}`;
    // under each row: the plan's tasks (name · due day · status) — or why the row is there
    const taskLine = (r) => (r.tasks.length
      ? r.tasks.map((p) => { const s = PM.PLAN_STATUS.find((x) => x.key === p.status) || {}; return `<span class="ts-task st-${esc(p.status)}" title="${esc(`${p.title}\nกำหนดเสร็จ ${U.date(p.dueDate)} · ${s.th || ''}\nแผน ${U.num(p.plannedHours || 0, 1)} h`)}">${esc(p.title)}</span>`; }).join('')
      : r.off ? '<span class="ts-off">ไม่อยู่ในแผน — ชั่วโมงที่บันทึกไว้ก่อน</span>' : `<small>${esc(rowSub(r))}</small>`);
    box.innerHTML = `<table class="tbl ts-grid"><thead><tr><th>งานจาก Weekly Plan</th>
      ${DAYS.map((d, i) => `<th class="num ${dayCls(i)}"${hol[i] ? ` title="${esc(hol[i].name)} — ชั่วโมงที่ลงวันนี้นับเป็น OT"` : ''}>${d}<small>${U.date(dates[i]).slice(0, 6)}</small>${hol[i] ? '<em class="ts-hol">วันหยุด</em>' : ''}</th>`).join('')}
      <th class="num">รวม</th><th class="num" title="ชั่วโมงตามแผนของคนนี้ (Weekly Plan)">แผน</th><th></th></tr></thead><tbody>
      ${state.rows.map((r, ri) => `<tr class="${r.off ? 'ts-row-off' : r.kind === 'overhead' && !r.fromPlan ? 'ts-row-oh' : ''}">
        <td><span class="title">${esc(rowLabel(r))}</span>${r.kind !== 'overhead' && rowSub(r) && r.tasks.length ? `<small>${esc(rowSub(r))}</small>` : ''}<div class="ts-tasks">${taskLine(r)}</div></td>
        ${r.hours.map((h, di) => `<td class="num ${dayCls(di)}">${canEdit
          ? `<input type="number" min="0" max="24" step="0.5" value="${h || ''}" data-r="${ri}" data-d="${di}" aria-label="${esc(rowLabel(r))} ${DAYS[di]}">`
          : h ? U.num(h, 1) : '<span class="muted">–</span>'}</td>`).join('')}
        <td class="num" data-rowtotal="${ri}"></td>
        <td class="num ts-plan">${r.fromPlan ? U.num(r.planned, 1) : '–'}</td>
        <td>${canEdit && !r.fromPlan ? `<button class="icon-btn" data-action="remove" data-r="${ri}" aria-label="ลบแถว ${esc(rowLabel(r))}">✕</button>` : ''}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>รวมต่อวัน</td>${DAYS.map((_, i) => `<td class="num ${dayCls(i)}" data-daytotal="${i}"></td>`).join('')}<td class="num" data-grand></td><td class="num ts-plan">${U.num(PM.sum(state.rows, (r) => r.planned || 0), 1)}</td><td></td></tr>
      ${otRows(dates, res, dayCls, canEdit)}</tfoot></table>`;
    updateTotals(el, dates, res);
  }

  /* OT (overtime) rows under the totals — what can be entered depends on the person's level (PM.OT_RULES):
     weekday clock-out time (after 16:30) and "no lunch break" for Technicians; weekends count the hours logged */
  function otRows(dates, res, dayCls, canEdit) {
    const rule = PM.otRule(res);
    const o = (d) => (state.ot || {})[d] || {};
    const cell = (i, html) => `<td class="num ${dayCls(i)}">${html}</td>`;
    const wk = (i) => !PM.isOffDay(dates[i]); // Mon – Fri that are not public holidays
    const end = dates.map((d, i) => cell(i, !wk(i) ? '<span class="muted" title="เสาร์ – อาทิตย์ / วันหยุด: OT = ชั่วโมงที่ลงทั้งวัน">ทั้งวัน</span>'
      : !rule.weekday ? '<span class="muted">–</span>'
      : canEdit ? `<input type="time" class="ts-ot-end" value="${esc(o(d).endTime || '')}" data-ot-end="${d}" aria-label="เวลาเลิกงาน ${DAYS[i]}">` : esc(o(d).endTime || '–'))).join('');
    const lunch = dates.map((d, i) => cell(i, !wk(i) || !rule.lunch ? '<span class="muted">–</span>'
      : canEdit ? `<input type="checkbox" ${o(d).noLunch ? 'checked' : ''} data-ot-lunch="${d}" aria-label="ไม่ได้พักเที่ยง ${DAYS[i]}">` : o(d).noLunch ? '✓' : '–')).join('');
    return `<tr class="ts-ot-h"><td colspan="11"><b>OT (ล่วงเวลา)</b> <span class="chip">${esc(PM.levelName(res.level))}: ${esc(rule.text)}</span></td></tr>
      ${rule.weekday ? `<tr class="ts-ot"><td>เวลาเลิกงาน <small>OT นับหลัง ${PM.OT_START}</small></td>${end}<td colspan="3"></td></tr>` : ''}
      ${rule.lunch ? `<tr class="ts-ot"><td>ไม่ได้พักเที่ยง (12:00) <small>ได้ OT ${PM.OT_LUNCH_HOURS} ชม.</small></td>${lunch}<td colspan="3"></td></tr>` : ''}
      <tr class="ts-ot ts-ot-sum"><td>OT (ชม.)</td>${dates.map((_, i) => `<td class="num ${dayCls(i)}" data-otday="${i}"></td>`).join('')}<td class="num" data-ottotal></td><td colspan="2"></td></tr>`;
  }

  function updateTotals(el, dates, res) {
    state.ot = state.ot || {};
    let grand = 0, billable = 0, leave = 0;
    state.rows.forEach((r, ri) => {
      const t = PM.sum(r.hours);
      grand += t;
      if (r.kind !== 'overhead') billable += t;
      if (r.refId === 'leave') leave += t;
      const c = el.querySelector(`[data-rowtotal="${ri}"]`); if (c) c.textContent = U.num(t, 1);
    });
    let ot = 0, otCost = 0;
    dates.forEach((d, i) => {
      const t = PM.sum(state.rows, (r) => r.hours[i]);
      const c = el.querySelector(`[data-daytotal="${i}"]`);
      if (c) c.textContent = U.num(t, 1);
      // OT of the day by the person's level rule (leave hours never count)
      const worked = PM.sum(state.rows.filter((r) => r.refId !== 'leave'), (r) => r.hours[i]);
      const o = PM.otDay(res, d, worked, state.ot[d]);
      ot += o.total; otCost += o.cost;
      const oc = el.querySelector(`[data-otday="${i}"]`);
      if (oc) {
        oc.innerHTML = o.total ? `<b>${U.num(o.total, 1)}</b>` : '<span class="muted">–</span>';
        oc.title = o.total ? [o.after && `หลัง ${PM.OT_START}: ${U.num(o.after, 1)} ชม.`, o.lunch && `พักเที่ยง: ${U.num(o.lunch, 1)} ชม.`, o.weekend && `เสาร์ – อาทิตย์: ${U.num(o.weekend, 1)} ชม.`].filter(Boolean).join('\n') : '';
      }
    });
    const g = el.querySelector('[data-grand]'); if (g) g.textContent = U.num(grand, 1);
    const og = el.querySelector('[data-ottotal]'); if (og) og.innerHTML = `<b>${U.num(ot, 1)}</b>`;
    const cap = PM.cap(res) - leave;
    const planned = PM.sum(state.rows, (r) => r.planned || 0);
    el.querySelector('#ts-summary').textContent = `จริง ${U.num(grand, 1)} h / แผน ${U.num(planned, 1)} h · Billable ${U.num(billable, 1)} h · OT ${U.num(ot, 1)} h${otCost ? ` (≈ ${U.money(otCost)})` : ''} · Utilization ${U.pct(cap > 0 ? billable / cap : null)} · ${state.dirty ? 'กำลังบันทึก…' : 'บันทึกอัตโนมัติแล้ว'}`;
  }

  /* every bid with hours this week (whole team), split by bidding stage */
  function drawBids(el, dates) {
    const box = el.querySelector('#ts-bids');
    const ts = PM.db.timesheets.filter((t) => t.kind === 'bid' && t.date >= dates[0] && t.date <= dates[6]);
    if (!ts.length) { box.innerHTML = '<p class="empty">ไม่มีชั่วโมง Bidding ในสัปดาห์นี้</p>'; return; }
    const known = new Set(PM.BID_STAGES.map((s) => s.key));
    const cols = PM.BID_STAGES.map((s) => ({ key: s.key, label: s.label }));
    if (ts.some((t) => !known.has(t.phase))) cols.push({ key: '', label: 'ไม่ระบุ' });
    const stageOf = (t) => (known.has(t.phase) ? t.phase : '');
    const byBid = {};
    ts.forEach((t) => {
      const x = byBid[t.refId] || (byBid[t.refId] = { hours: {}, total: 0, people: new Set() });
      x.hours[stageOf(t)] = (x.hours[stageOf(t)] || 0) + t.hours;
      x.total += t.hours;
      x.people.add(t.resourceId);
    });
    const rows = Object.keys(byBid).map((id) => ({ id, b: PM.find('bids', id), ...byBid[id] })).sort((a, b) => b.total - a.total);
    const colTotal = (k) => PM.sum(ts.filter((t) => stageOf(t) === k), (t) => t.hours);
    const cell = (h) => (h ? U.num(h, 1) : '<span class="muted">–</span>');
    box.innerHTML = `<table class="tbl"><thead><tr><th>Bid</th>${cols.map((c) => `<th class="num">${esc(c.label)}</th>`).join('')}<th class="num">Total h</th><th>ผู้ลงชั่วโมง</th></tr></thead><tbody>
      ${rows.map((x) => `<tr>
        <td><span class="title">${x.b ? esc(x.b.code) : esc(x.id)}</span><small>${x.b ? esc(bidInfo(x.b)) : 'Bid (ลบแล้ว)'}</small></td>
        ${cols.map((c) => `<td class="num">${cell(x.hours[c.key])}</td>`).join('')}
        <td class="num"><b>${U.num(x.total, 1)}</b></td>
        <td>${Array.from(x.people).map((id) => `<span class="chip">${esc(U.resourceName(id))}</span>`).join(' ')}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>รวม</td>${cols.map((c) => `<td class="num">${cell(colTotal(c.key))}</td>`).join('')}<td class="num"><b>${U.num(PM.sum(ts, (t) => t.hours), 1)}</b></td><td></td></tr></tfoot></table>`;
  }

  function drawTeam(el, dates) {
    const T = PM.today();
    const to = PM.min(dates[6], T);
    const ut = PM.utilization(dates[0], to);
    const box = el.querySelector('#ts-team');
    if (dates[0] > T) { box.innerHTML = '<p class="empty">สัปดาห์ในอนาคต</p>'; return; }
    box.innerHTML = `<table class="tbl"><thead><tr><th>Name</th><th>Level</th><th class="num">Expected h</th><th class="num">Logged h</th><th class="num">Billable h</th><th>Completeness</th><th></th></tr></thead><tbody>
      ${ut.people.filter((x) => PM.needsTimesheet(x.r)).map((x) => {
        const comp = x.capacity ? x.logged / x.capacity : null;
        const st = comp == null ? 'neutral' : comp >= 0.95 ? 'good' : comp >= 0.6 ? 'warning' : 'critical';
        return `<tr><td><span class="title">${esc(x.r.name)}</span></td><td>${esc(PM.levelName(x.r.level))}</td><td class="num">${U.num(x.capacity)}</td><td class="num">${U.num(x.logged, 1)}</td><td class="num">${U.num(x.billable, 1)}</td>
          <td>${U.badge(st, comp == null ? 'n/a' : comp >= 0.95 ? 'Complete' : `${U.pct(comp)} logged`)}</td>
          <td>${x.r.id === state.resourceId ? '<span class="muted">กำลังแก้ไข</span>' : `<a href="#/timesheet" data-person="${esc(x.r.id)}">เปิด</a>`}</td></tr>`;
      }).join('')}</tbody></table>`;
    box.querySelectorAll('[data-person]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      commit();
      state.resourceId = a.dataset.person; state.rows = null; PM.views.timesheet(el); U.scrollToY(0);
    }));
  }
})();
