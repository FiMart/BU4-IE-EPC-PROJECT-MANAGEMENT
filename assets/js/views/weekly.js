/* weekly.js — Weekly Plan: plan tasks for the week, track status, PPC (Percent Plan Complete), team loading */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  // the week always opens on the current one; filters and view are remembered
  const state = U.keep('weekly', { week: null, month: '', project: '', person: '', mode: 'calendar', group: 'month', q: '', stFilter: '', lineScope: 'week', lineGroup: 'day', lineDetail: 'full', shotLayout: '', monthSeen: false },
    ['project', 'person', 'mode', 'group', 'stFilter', 'lineScope', 'lineGroup', 'lineDetail', 'shotLayout', 'monthSeen']);
  /* the month calendar became the default in v1.72: people who had saved another view get it once */
  if (!state.monthSeen) { state.group = 'month'; state.mode = 'calendar'; state.shotLayout = ''; state.monthSeen = true; }
  const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); return PM.iso(new Date(y, m - 1 + n, 1)).slice(0, 7); };
  const thMonth = (ym) => PM.parse(`${ym}-01`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  /* the week other views and tools work on while a month is open: this week in the current month, else the month's first Monday */
  /* a month has tasks still ahead: PPC counts only those whose date has come, or the first days of a month would always look bad */
  const duePpc = (tasks, T) => { const due = tasks.filter((p) => p.dueDate <= T); return due.length ? due.filter((p) => p.status === 'done').length / due.length : null; };
  const weekOfMonth = (ym, T) => {
    if (T.slice(0, 7) === ym) return PM.monday(T);
    const first = `${ym}-01`, mon = PM.monday(first);
    return mon < first ? PM.addDays(mon, 7) : mon;
  };
  const ST_FILTERS = [{ value: 'open', label: 'ยังไม่เสร็จ' }, { value: 'late', label: 'เลยกำหนด' }, { value: 'done', label: 'เสร็จแล้ว' }, { value: 'not_done', label: 'ไม่เสร็จ' }, { value: 'notready', label: 'ยังเตรียมไม่พร้อม' }];
  const isLate = (p, T) => p.status !== 'done' && p.status !== 'not_done' && p.dueDate < T;
  const LOOK_WEEKS = 4; // look-ahead: the chosen week and the next three. Recurring tasks are created this far ahead too
  /* what a task needs before it can start: p.prep = [{ type, text, owner, due, done }] */
  const PREP_TYPES = ['วัสดุ / อุปกรณ์', 'แบบ / เอกสาร', 'คน', 'เครื่องมือ', 'ใบอนุญาต / PTW', 'อนุมัติจากลูกค้า', 'งานก่อนหน้า', 'อื่น ๆ'];
  const prepOf = (p) => (Array.isArray(p.prep) ? p.prep : []);
  const prepOpen = (p) => prepOf(p).filter((x) => !x.done);
  const prepLate = (p, T) => prepOpen(p).filter((x) => x.due && x.due < T);
  const isClosed = (p) => p.status === 'done' || p.status === 'not_done';
  /* tick several tasks and set them all at once (calendar and task list) */
  const pick = { on: false, ids: new Set() };
  const applyStatus = (p, status, reason) => {
    p.status = status;
    p.reason = status === 'not_done' ? reason || p.reason || '' : '';
    if (status === 'done' && p.qtyPlan && (p.qtyDone || 0) < p.qtyPlan) p.qtyDone = p.qtyPlan;
  };
  /* a recurring task deleted by hand stays deleted: its date goes on the rule's skip list */
  const removePlan = (p) => {
    const rule = p.ruleId && PM.find('planrules', p.ruleId);
    if (rule && p.ruleDate) rule.skips = (rule.skips || []).concat(p.ruleDate);
    PM.db.plans = PM.db.plans.filter((x) => x.id !== p.id);
  };
  // the tool menus close when something else is clicked, or when one of their items is
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.wp-menu[open]').forEach((d) => { if (!d.contains(e.target) || e.target.closest('[data-action]')) d.open = false; });
  });
  const PPC_TARGET = 0.8;
  const statusInfo = (k) => PM.PLAN_STATUS.find((s) => s.key === k) || PM.PLAN_STATUS[0];
  const dayName = (d) => PM.parse(d).toLocaleDateString('en-GB', { weekday: 'short' });

  /* Creator of a task — only that person may delete it (older tasks without a creator: Admin only).
     The database enforces the same rule (supabase/data.sql). */
  const creatorStamp = () => {
    const u = PM.auth && PM.auth.user;
    return u ? { createdBy: u.id, createdByName: PM.auth.displayName(u), createdAt: new Date().toISOString() } : {};
  };
  PM.canDeletePlan = (p) => {
    const u = PM.auth && PM.auth.user;
    if (!u || !p) return false;
    return p.createdBy ? p.createdBy === u.id : PM.auth.role === 'admin';
  };
  const creatorText = (p) => (p.createdBy
    ? `${p.createdByName || 'ผู้ใช้อื่น'}${p.createdAt ? ' · ' + U.date(String(p.createdAt).slice(0, 10)) : ''}`
    : 'ไม่มีข้อมูล (งานเดิม)');

  function itemLabel(p) {
    if (p.kind === 'project') { const x = PM.find('projects', p.refId); return x ? `${x.code} · ${U.phaseLabel(p.phase)}` : 'Project (ลบแล้ว)'; }
    if (p.kind === 'bid') { const b = PM.find('bids', p.refId); return b ? `${PM.dash(b.code)} · Bidding` : 'Bid (ลบแล้ว)'; }
    const o = PM.OVERHEAD.find((x) => x.id === p.refId);
    return o ? o.label : 'Overhead';
  }

  /* A task can have several people: p.resourceIds (p.resourceId = the first one, kept for older data / other pages).
     plannedHours are per person — each one carries them in their loading and timesheet. */
  PM.planPeople = (p) => (Array.isArray(p.resourceIds) && p.resourceIds.length ? p.resourceIds : p.resourceId ? [p.resourceId] : []);
  PM.planHas = (p, id) => PM.planPeople(p).includes(id);
  /* people from other departments: typed names (no record in Resources) — shown with the task, not in loading / Timesheet */
  PM.planGuests = (p) => (Array.isArray(p.guests) ? p.guests.filter(Boolean) : []);
  const headcount = (p) => PM.planPeople(p).length + PM.planGuests(p).length;
  const peopleText = (p) => PM.planPeople(p).map((id) => U.resourceName(id)).concat(PM.planGuests(p).map((g) => `${g} (นอกแผนก)`)).join(', ') || '–';
  const peopleShort = (p) => { const all = PM.planPeople(p).map(firstName).concat(PM.planGuests(p).map((g) => g.split(/\s+/)[0])); return all.slice(0, 2).join(', ') + (all.length > 2 ? ` +${all.length - 2}` : ''); };
  const peopleChips = (p) => PM.planPeople(p).map((id) => `<span class="who-chip">${esc(U.resourceName(id))}</span>`)
    .concat(PM.planGuests(p).map((g) => `<span class="who-chip guest" title="ผู้รับผิดชอบนอกแผนก">${esc(g)}<em>นอกแผนก</em></span>`)).join('') || '–';
  const manHours = (p) => (p.plannedHours || 0) * Math.max(1, headcount(p)); // everyone on the task, other departments included

  PM.planStats = function (list) {
    const count = (s) => list.filter((p) => p.status === s).length;
    const done = count('done');
    return {
      total: list.length, done, notDone: count('not_done'), inProgress: count('in_progress'), planned: count('planned'),
      hours: PM.sum(list, manHours), // man-hours: hours × people on each task
      ppc: list.length ? done / list.length : null,
    };
  };
  const ppcLevel = (v) => (v == null ? 'neutral' : v >= PPC_TARGET ? 'good' : v >= 0.6 ? 'warning' : 'critical');

  PM.views.weekly = function (el) {
    const db = PM.db, T = PM.today();
    if (!state.week) state.week = PM.monday(T);
    if (state.project && !state.project.startsWith('__') && !PM.find('projects', state.project)) state.project = '';
    if (state.person && !PM.find('resources', state.person)) state.person = '';
    const week = state.week, end = PM.addDays(week, 6);
    const canEdit = PM.can('plan.edit'), canStatus = PM.can('plan.status');

    const match = (p) =>
      (!state.person || PM.planHas(p, state.person)) &&
      (!state.project ||
        (state.project === '__bids' ? p.kind === 'bid'
          : state.project === '__overhead' ? p.kind === 'overhead'
            : p.kind === 'project' && p.refId === state.project));
    const isMonth = state.mode === 'calendar' && state.group === 'month';
    if (!state.month) state.month = T.slice(0, 7);
    const weekAll = db.plans.filter((p) => p.week === week);
    const monthAll = isMonth ? db.plans.filter((p) => String(p.dueDate).slice(0, 7) === state.month) : [];
    const list = (isMonth ? monthAll : weekAll).filter(match).sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.title.localeCompare(b.title)));
    const st = PM.planStats(list);
    if (isMonth) st.ppc = duePpc(list, T);
    // search and status narrow what is shown; the tiles and PPC keep counting the whole plan
    const q = state.q.trim().toLowerCase();
    const viewMatch = (p) => (!q || [p.title, itemLabel(p), peopleText(p), p.note].join(' ').toLowerCase().includes(q))
      && (!state.stFilter || (state.stFilter === 'open' ? p.status === 'planned' || p.status === 'in_progress' : state.stFilter === 'late' ? isLate(p, T) : state.stFilter === 'notready' ? !isClosed(p) && prepOpen(p).length > 0 : p.status === state.stFilter));
    const shown = list.filter(viewMatch);
    const narrowed = !!(q || state.stFilter);
    const me = myResource();
    const lookWeeks = Array.from({ length: LOOK_WEEKS }, (_, i) => PM.addDays(week, 7 * i));
    const lookRows = db.plans.filter((p) => lookWeeks.includes(p.week) && match(p) && viewMatch(p)).sort(byDue);
    const out = { week, T, full: (p) => match(p) && viewMatch(p), narrowed, stats: st, note: filterNote(), lookWeeks, lookRows, isMonth, month: isMonth ? state.month : PM.addDays(week, 3).slice(0, 7) };
    if (state.mode === 'team' || state.mode === 'lookahead') pick.on = false; // ticking works on the calendar and the task list
    if (pick.on) { const here = new Set(shown.map((p) => p.id)); pick.ids.forEach((id) => { if (!here.has(id)) pick.ids.delete(id); }); } else pick.ids.clear();
    const edit = canEdit && !pick.on, status = canStatus && !pick.on;

    const reasons = {};
    list.filter((p) => p.status === 'not_done').forEach((p) => { const k = p.reason || 'ไม่ระบุ'; reasons[k] = (reasons[k] || 0) + 1; });
    const topReason = Object.keys(reasons).sort((a, b) => reasons[b] - reasons[a])[0];

    // team loading: every task of the person this week (regardless of the work-item filter)
    const people = db.resources.filter((r) => PM.employedIn(r, week));
    const ts = db.timesheets.filter((t) => t.date >= week && t.date <= end);
    const loading = people.filter((r) => !state.person || r.id === state.person).map((r) => {
      const mine = weekAll.filter((p) => PM.planHas(p, r.id));
      const leave = PM.sum(ts.filter((t) => t.resourceId === r.id && t.refId === 'leave'), (t) => t.hours);
      return {
        r, mine,
        planned: PM.sum(mine, (p) => p.plannedHours || 0),
        cap: Math.max(0, PM.cap(r) - leave),
        actual: PM.sum(ts.filter((t) => t.resourceId === r.id && t.refId !== 'leave'), (t) => t.hours),
        done: mine.filter((p) => p.status === 'done').length,
      };
    });
    const teamPlanned = PM.sum(loading, (x) => x.planned), teamCap = PM.sum(loading, (x) => x.cap);

    const projects = db.projects.filter((p) => p.status !== 'closed');
    el.innerHTML = `
      <div class="row">
        ${isMonth ? monthNav(state.month, T) : V.weekNav(week)}
        <span class="spacer"></span>
        <details class="wp-menu"><summary class="btn">ส่งแผนงาน ▾</summary><div class="wp-menu-p">
          <button type="button" data-action="line">คัดลอกส่ง LINE</button>
          <button type="button" data-action="shot">📷 Screenshot</button>
          <button type="button" data-action="print">🖨 พิมพ์ / PDF</button>
        </div></details>
        <details class="wp-menu"><summary class="btn">จัดการแผน ▾</summary><div class="wp-menu-p">
          ${canEdit ? '<button type="button" data-action="carry">ยกงานค้างจากสัปดาห์ก่อน</button><button type="button" data-action="copy-week">คัดลอกทั้งสัปดาห์…</button>' : ''}
          <button type="button" data-action="rules">🔁 งานประจำ${db.planrules.length ? ` (${db.planrules.filter((r) => r.active !== false).length})` : ''}</button>
          ${canStatus ? `<button type="button" data-action="pick">${pick.on ? 'เลิกเลือกหลายงาน' : '☑ เลือกหลายงาน'}</button>` : ''}
        </div></details>
        ${edit ? '<button class="btn primary fab" data-action="new" aria-label="เพิ่มงาน"><span class="fab-i">+</span><span class="fab-t">เพิ่มงาน</span></button>' : ''}
      </div>
      <div class="row">
        <select id="wp-project" aria-label="Filter work item">
          <option value="">ทุกโครงการ / งาน</option>
          <optgroup label="Projects">${projects.map((p) => `<option value="${esc(p.id)}"${state.project === p.id ? ' selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</optgroup>
          <option value="__bids"${state.project === '__bids' ? ' selected' : ''}>Bidding (ทุก bid)</option>
          <option value="__overhead"${state.project === '__overhead' ? ' selected' : ''}>Overhead</option>
        </select>
        <select id="wp-person" aria-label="Filter person">${U.options(people.map((r) => ({ value: r.id, label: r.name })), state.person, 'ทุกคน')}</select>
        ${me ? `<button class="btn wp-mine" data-action="mine" aria-pressed="${state.person === me.id}">งานของฉัน</button>` : ''}
        <select id="wp-status" aria-label="กรองสถานะ" style="width:auto">${U.options(ST_FILTERS, state.stFilter, 'ทุกสถานะ')}</select>
        <input type="search" id="wp-q" placeholder="ค้นหางาน / คน / โครงการ…" value="${esc(state.q)}" style="width:200px">
        ${V.seg('mode', [{ key: 'calendar', label: 'ปฏิทิน' }, { key: 'tasks', label: 'รายการงาน' }, { key: 'team', label: 'ภาระงานรายคน' }, { key: 'lookahead', label: `ล่วงหน้า ${LOOK_WEEKS} สัปดาห์` }], state.mode)}
        ${state.mode === 'calendar' ? V.seg('group', [{ key: 'month', label: 'รายเดือน' }, { key: 'day', label: 'รายสัปดาห์' }, { key: 'person', label: 'แยกตามคน' }], state.group) : ''}
      </div>
      <div class="grid cols-5">
        ${V.tile({ label: 'งานในแผน', tag: 'Tasks', value: st.total, sub: `${st.planned} planned · ${st.inProgress} กำลังทำ` })}
        ${V.tile({ label: 'เสร็จแล้ว', tag: 'Done', value: st.done, sub: st.notDone ? U.badge('critical', `${st.notDone} ไม่เสร็จ`) : U.badge('good', 'ไม่มีงานค้าง') })}
        ${V.tile({ label: 'PPC', tag: 'Plan complete', value: U.pct(st.ppc), sub: U.badge(ppcLevel(st.ppc), `เป้าหมาย ${U.pct(PPC_TARGET)}`), tip: isMonth ? 'PPC ของเดือนนี้ = งานที่เสร็จ ÷ งานที่ถึงกำหนดแล้ว · งานที่ยังไม่ถึงกำหนดไม่นับ' : 'PPC (Percent Plan Complete) = งานที่เสร็จ ÷ งานทั้งหมดในแผนสัปดาห์' })}
        ${V.tile({ label: 'ชั่วโมงตามแผน', tag: 'Hours', value: `${U.num(st.hours)} <small>h</small>`, sub: isMonth ? `ทั้งเดือน${thMonth(state.month)}` : `ทีมใช้ ${U.pct(teamCap ? teamPlanned / teamCap : null)} ของ capacity` })}
        ${V.tile({ label: 'สาเหตุหลักที่ไม่เสร็จ', value: st.notDone ? `${reasons[topReason]} <small>งาน</small>` : '–', sub: topReason ? esc(topReason) : 'ยังไม่มี' })}
      </div>
      ${pick.on ? `<div class="wp-pickbar" data-pickbar role="group" aria-label="อัปเดตหลายงาน">
        <b data-pick-n>เลือกแล้ว ${pick.ids.size} งาน</b>
        <button class="btn sm" data-action="pick-all">เลือกทั้งหมดที่แสดง (${shown.length})</button>
        <span class="spacer"></span>
        ${PM.PLAN_STATUS.map((s) => `<button class="btn sm" data-bulk="${s.key}">${esc(s.th)}</button>`).join('')}
        <button class="btn sm danger" data-bulk="delete">ลบ</button>
        <button class="btn sm ghost" data-action="pick">ยกเลิก</button>
      </div>` : ''}
      <div class="card">
        <div class="card-h"><h2>${{ calendar: isMonth ? `ปฏิทินงานเดือน${thMonth(state.month)}` : 'ปฏิทินงานประจำสัปดาห์', tasks: 'งานประจำสัปดาห์', team: 'ภาระงานรายคน', lookahead: `แผนล่วงหน้า ${LOOK_WEEKS} สัปดาห์ (Look-ahead)` }[state.mode]}</h2>
          <p>${state.mode === 'lookahead' ? lookSummary(lookRows, T) : pick.on ? 'คลิกงานเพื่อเลือก แล้วกดสถานะที่แถบด้านบน' : state.mode === 'calendar'
            ? (canEdit ? 'ลากการ์ดไปวันอื่นเพื่อเลื่อนกำหนด' + (state.group === 'person' ? ' หรือไปแถวคนอื่นเพื่อเปลี่ยนผู้รับผิดชอบ' : '') + ' · กด ＋ เพื่อเพิ่มงานในวันนั้น · คลิกการ์ดเพื่อแก้ไข' : 'อัปเดตสถานะได้จากการ์ด')
            : state.mode === 'tasks'
              ? (canStatus ? 'อัปเดตสถานะได้ทันทีจากตาราง' : '') + (canEdit ? ' · คลิกที่งานเพื่อแก้ไขรายละเอียด' : '')
              : 'ชั่วโมงตามแผนเทียบกับ capacity (หักวันลา) และชั่วโมงจริงจาก Timesheet · คลิกชื่อเพื่อดูงานของคนนั้น'}${narrowed && state.mode !== 'team' && state.mode !== 'lookahead' ? ` · <b>แสดง ${shown.length} จาก ${list.length} งานตามตัวกรอง</b>` : ''}</p></div>
        ${state.mode === 'lookahead' ? lookahead(lookWeeks, lookRows, T, canEdit, canStatus) : state.mode === 'calendar'
          ? `<div class="card-b cal-wrap">${isMonth ? calendarByMonth(state.month, out.full, T, edit) : state.group === 'person' ? calendarByPerson(shown, week, T, edit) : calendarByDay(shown, week, T, edit, status)}</div>`
          : `<div class="card-b flush table-wrap">${state.mode === 'tasks' ? tasksTable(shown, T, edit, status) : teamTable(loading)}</div>`}
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>PPC — 8 สัปดาห์ล่าสุด</h2><p>เป้าหมาย ≥ ${U.pct(PPC_TARGET)} · ตาม filter ที่เลือก</p></div><div class="card-b"><div class="chart" id="c-ppc"></div></div></div>
        <div class="card"><div class="card-h"><h2>สาเหตุที่งานไม่เสร็จ</h2><p>8 สัปดาห์ล่าสุด · ใช้หาจุดแก้ไขในแผนสัปดาห์ถัดไป</p></div><div class="card-b"><div class="chart" id="c-reasons"></div></div></div>
      </div>`;

    /* charts */
    const weeks = [];
    for (let i = 7; i >= 0; i--) weeks.push(PM.addDays(week, -7 * i));
    const hist = db.plans.filter((p) => p.week >= weeks[0] && p.week <= week && match(p));
    // a trend against a target → one line + the target rule (weeks with no plan are gaps, not 0%)
    PM.charts.lines(document.getElementById('c-ppc'), {
      labels: weeks.map((w) => U.date(w).slice(0, 6)), label: 'PPC by week', yMax: 100,
      tipTitle: weeks.map((w) => { const s = PM.planStats(hist.filter((p) => p.week === w)); return `Week of ${U.date(w)} · ${s.done}/${s.total} tasks`; }),
      fmt: (v) => v + '%', axisFmt: (v) => v + '%',
      ref: { value: Math.round(PPC_TARGET * 100), label: `เป้า ${U.pct(PPC_TARGET)}` },
      series: [{ name: 'PPC', color: 'var(--s1)', values: weeks.map((w) => { const s = PM.planStats(hist.filter((p) => p.week === w)); return s.total ? Math.round(s.ppc * 100) : null; }) }],
    });
    const rc = {};
    hist.filter((p) => p.status === 'not_done').forEach((p) => { const k = p.reason || 'ไม่ระบุ'; rc[k] = (rc[k] || 0) + 1; });
    PM.charts.hbars(document.getElementById('c-reasons'), {
      items: Object.keys(rc).sort((a, b) => rc[b] - rc[a]).map((k) => ({ label: k, value: rc[k], display: String(rc[k]), color: 'var(--s2)' })),
    });

    /* events */
    const rerender = () => PM.views.weekly(el);
    const findPlan = (id) => PM.find('plans', id);
    el.querySelector('#wp-q').addEventListener('input', (e) => {
      state.q = e.target.value;
      clearTimeout(state.t);
      state.t = setTimeout(() => { rerender(); const i = el.querySelector('#wp-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250);
    });
    const setPick = (id, on) => {
      if (on) pick.ids.add(id); else pick.ids.delete(id);
      el.querySelectorAll(`[data-plan="${CSS.escape(id)}"]`).forEach((x) => {
        x.classList.toggle('picked', on);
        const box = x.querySelector('.pick-box');
        if (box) box.checked = on;
      });
      const n = el.querySelector('[data-pick-n]');
      if (n) n.textContent = `เลือกแล้ว ${pick.ids.size} งาน`;
    };
    el.onchange = (e) => {
      const t = e.target;
      if (t.matches('.pick-box')) { setPick(t.dataset.pick, t.checked); return; }
      if (t.dataset.prepDone) {
        const [id, i] = t.dataset.prepDone.split('|'), p = findPlan(id), item = p && prepOf(p)[+i];
        if (!item || !PM.can('plan.status')) { rerender(); return; }
        item.done = t.checked;
        PM.upsert('plans', p);
        rerender();
        return;
      }
      if (t.id === 'wp-project') { state.project = t.value; rerender(); return; }
      if (t.id === 'wp-person') { state.person = t.value; rerender(); return; }
      if (t.id === 'wp-status') { state.stFilter = t.value; rerender(); return; }
      if (t.dataset.planStatus) {
        const p = findPlan(t.dataset.planStatus);
        if (!p || !PM.can('plan.status')) return;
        // "ไม่เสร็จ" goes straight to the NCR form (reason + NCR in one step) — the status changes only when it is saved
        if (t.value === 'not_done' && p.status !== 'not_done') { rerender(); notDone(p, rerender); return; }
        const ncr = p.status === 'not_done' && p.ncrId && PM.find('ncrs', p.ncrId);
        applyStatus(p, t.value);
        PM.upsert('plans', p);
        U.toast(ncr && ncr.status === 'open' ? `อัปเดตเป็น ${statusInfo(p.status).label} — ${ncr.no} ยังเปิดอยู่ ปิดได้ที่หน้าโครงการ → Quality · NCR` : `อัปเดตเป็น ${statusInfo(p.status).label}`, ncr ? 4500 : 2200);
        rerender();
        return;
      }
      if (t.dataset.planReason) {
        const p = findPlan(t.dataset.planReason);
        if (!p || !PM.can('plan.status')) return;
        p.reason = t.value;
        PM.upsert('plans', p);
        U.toast('บันทึกสาเหตุแล้ว');
      }
    };
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg]');
      if (seg) {
        state[seg.dataset.seg] = seg.dataset.val;
        // opening the month view on the week being looked at
        if (state.mode === 'calendar' && state.group === 'month') {
          const wk = state.week, ym = state.month;
          if (wk.slice(0, 7) !== ym && PM.addDays(wk, 6).slice(0, 7) !== ym) state.month = PM.addDays(wk, 3).slice(0, 7);
        }
        rerender();
        return;
      }
      const bulk = e.target.closest('[data-bulk]');
      if (bulk) { bulkUpdate(bulk.dataset.bulk, Array.from(pick.ids).map(findPlan).filter(Boolean), rerender); return; }
      if (pick.on && !e.target.closest('[data-action], .wp-menu')) {
        const item = e.target.closest('[data-plan]');
        if (item && !e.target.closest('.pick-box')) { e.preventDefault(); setPick(item.dataset.plan, !pick.ids.has(item.dataset.plan)); }
        return;
      }
      if (e.target.closest('select, input, a[href], .prep-item')) return; // the NCR link opens the project's Quality tab
      const ncrBtn = e.target.closest('[data-action="ncr"]');
      if (ncrBtn) { const p = findPlan(ncrBtn.dataset.id); if (p && PM.can('plan.status')) notDone(p, rerender); return; }
      const a = e.target.closest('[data-action]');
      if (a) {
        const act = a.dataset.action;
        if (isMonth && (act === 'prev' || act === 'next' || act === 'this')) {
          state.month = act === 'this' ? T.slice(0, 7) : shiftMonth(state.month, act === 'prev' ? -1 : 1);
          state.week = weekOfMonth(state.month, T);
          rerender();
          return;
        }
        if (act === 'prev') { state.week = PM.addDays(state.week, -7); rerender(); }
        if (act === 'next') { state.week = PM.addDays(state.week, 7); rerender(); }
        if (act === 'this' && state.week !== PM.monday(T)) { state.week = PM.monday(T); rerender(); }
        if (act === 'day-more') dayDialog(a.dataset.day, out, rerender);
        if (act === 'new' && canEdit) planForm(null, rerender);
        if (act === 'edit' && canEdit) planForm(findPlan(a.dataset.id), rerender);
        if (act === 'carry' && canEdit) carryOver(rerender);
        if (act === 'line') lineDialog(out);
        if (act === 'shot') shotDialog(out);
        if (act === 'print') { if (state.mode === 'lookahead') printLook(out); else printPlan(shown, out); }
        if (act === 'copy-week' && canEdit) copyWeek(out, rerender);
        if (act === 'rules') ruleList(rerender);
        if (act === 'pick') { pick.on = !pick.on; if (pick.on && state.mode !== 'calendar' && state.mode !== 'tasks') state.mode = 'tasks'; rerender(); }
        if (act === 'pick-all') shown.forEach((p) => setPick(p.id, true));
        if (act === 'mine' && me) { state.person = state.person === me.id ? '' : me.id; rerender(); }
        if (act === 'new-on' && canEdit) { const who = a.dataset.person || state.person || ''; planForm(null, rerender, { dueDate: a.dataset.day, resourceIds: who ? [who] : null }); }
        return;
      }
      const person = e.target.closest('tr[data-person]');
      if (person) { state.person = person.dataset.person; state.mode = 'tasks'; rerender(); return; }
      const row = e.target.closest('[data-plan]');
      if (row && canEdit) { planForm(findPlan(row.dataset.plan), rerender); return; }
      // on a phone the month shows a count per day: tapping the day lists its tasks
      const cell = isMonth && window.innerWidth <= 640 && e.target.closest('.mcal-day[data-drop-day]');
      if (cell) dayDialog(cell.dataset.dropDay, out, rerender);
    };
    el.onkeydown = (e) => {
      const card = e.target.closest && e.target.closest('.cal-card[data-plan]');
      if (card && (e.key === 'Enter' || e.key === ' ') && canEdit) { e.preventDefault(); planForm(findPlan(card.dataset.plan), rerender); }
    };

    /* drag & drop in the calendar: another day → new due date; another person's row → new owner */
    el.ondragstart = (e) => {
      const card = e.target.closest && e.target.closest('.cal-card[draggable="true"]');
      if (!card) return;
      // which person's row it was dragged from (calendar by person) — a task with several people moves only that one
      const from = card.closest('[data-drop-person]');
      e.dataTransfer.setData('text/plain', card.dataset.plan + '|' + (from ? from.dataset.dropPerson : ''));
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    };
    el.ondragend = () => el.querySelectorAll('.dragging, .drop-hot').forEach((x) => x.classList.remove('dragging', 'drop-hot'));
    el.ondragover = (e) => {
      const zone = e.target.closest && e.target.closest('[data-drop-day]');
      if (!zone || !canEdit) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.querySelectorAll('.drop-hot').forEach((x) => { if (x !== zone) x.classList.remove('drop-hot'); });
      zone.classList.add('drop-hot');
    };
    el.ondragleave = (e) => {
      const zone = e.target.closest && e.target.closest('[data-drop-day]');
      if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drop-hot');
    };
    el.ondrop = (e) => {
      const zone = e.target.closest && e.target.closest('[data-drop-day]');
      if (!zone || !canEdit) return;
      e.preventDefault();
      const [planId, from] = e.dataTransfer.getData('text/plain').split('|');
      const p = findPlan(planId);
      if (!p) return;
      const day = zone.dataset.dropDay, who = zone.dataset.dropPerson;
      const swap = who && from && who !== from; // dropped on another person's row
      if (p.dueDate === day && !swap) { el.ondragend(); return; }
      p.dueDate = day;
      p.week = PM.monday(day);
      if (p.ruleId) p.ruleEdited = true; // moved by hand: a change to the recurring rule leaves it alone
      if (swap) {
        const ids = PM.planPeople(p).map((id) => (id === from ? who : id)).filter((id, i, a) => a.indexOf(id) === i);
        p.resourceIds = ids;
        p.resourceId = ids[0];
      }
      PM.upsert('plans', p);
      U.toast(`ย้าย "${p.title}" ไป ${dayName(day)} ${U.date(day)}${swap ? ` · ${U.resourceName(from)} → ${U.resourceName(who)}` : ''}`);
      rerender();
    };
  };

  /* the signed-in person's employee record (same name) — for "งานของฉัน" */
  function myResource() {
    const u = PM.auth && PM.auth.user, name = u ? PM.normName(PM.auth.displayName(u)) : '';
    return name ? PM.db.resources.find((r) => r.active !== false && PM.normName(r.name) === name) || null : null;
  }

  /* ---------- sending the plan out: words shared by the LINE text and the printed page ---------- */
  const thDay = (d) => PM.parse(d).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' });
  const thShortDay = (d) => PM.parse(d).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
  const thRange = (w) => {
    const o = { day: 'numeric', month: 'short' };
    return `${PM.parse(w).toLocaleDateString('th-TH', o)} – ${PM.parse(PM.addDays(w, 6)).toLocaleDateString('th-TH', { ...o, year: 'numeric' })}`;
  };
  const hoursText = (p) => `${U.num(p.plannedHours || 0, (p.plannedHours || 0) % 1 ? 1 : 0)} ชม.${headcount(p) > 1 ? '/คน' : ''}`;
  const byDue = (a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : String(a.title).localeCompare(String(b.title)));
  function filterNote() {
    const pj = state.project === '__bids' ? 'Bidding' : state.project === '__overhead' ? 'Overhead' : state.project ? (PM.find('projects', state.project) || {}).code : '';
    return [pj, state.person && U.resourceName(state.person), state.stFilter && ST_FILTERS.find((f) => f.value === state.stFilter).label, state.q.trim() && `ค้นหา "${state.q.trim()}"`].filter(Boolean).join(' · ');
  }
  /* tasks by day, or by person (a shared task is listed under each of its people) */
  function groupsOf(tasks, by) {
    if (by !== 'person') return Array.from(new Set(tasks.map((p) => p.dueDate))).sort().map((d) => ({ label: thDay(d), tasks: tasks.filter((p) => p.dueDate === d), icon: '📅' }));
    const out = PM.db.resources.filter((r) => tasks.some((p) => PM.planHas(p, r.id))).map((r) => {
      const mine = tasks.filter((p) => PM.planHas(p, r.id));
      return { label: r.name, tasks: mine, icon: '👤', sub: `${mine.length} งาน · ${U.num(PM.sum(mine, (p) => p.plannedHours || 0), 1)} ชม.` };
    });
    const outside = tasks.filter((p) => !PM.planPeople(p).length);
    if (outside.length) out.push({ label: 'ผู้ร่วมงานนอกแผนก', tasks: outside, icon: '👤', sub: `${outside.length} งาน` });
    return out;
  }

  /* ---------- copy for LINE: plain text, no table, short lines so it reads well on a phone ---------- */
  const LINE_ICON = { planned: '⬜', in_progress: '🔄', done: '✅', not_done: '❌' };
  const LINE_SCOPES = [{ key: 'month', label: 'ทั้งเดือน' }, { key: 'week', label: 'ทั้งสัปดาห์' }, { key: 'today', label: 'วันนี้' }, { key: 'tomorrow', label: 'พรุ่งนี้' }, { key: 'late', label: 'เลยกำหนด' }];
  function lineTasks(scope, ctx) {
    const all = PM.db.plans.filter(ctx.full), { T, week } = ctx;
    const hit = { month: (p) => String(p.dueDate).slice(0, 7) === ctx.month, week: (p) => p.week === week, today: (p) => p.dueDate === T, tomorrow: (p) => p.dueDate === PM.addDays(T, 1), late: (p) => p.week === week && isLate(p, T) }[scope];
    return all.filter(hit).sort(byDue);
  }
  function lineTaskText(p, by, oneDay, detail, T) {
    const head = `${LINE_ICON[p.status] || '⬜'} ${p.title}${isLate(p, T) ? ' ⚠️ เลยกำหนด' : ''}`;
    const when = by === 'person' && !oneDay ? thShortDay(p.dueDate) : '';
    const who = by === 'person' ? '' : peopleText(p);
    if (detail !== 'full') { const extra = [when, who].filter(Boolean).join(' · '); return extra ? `${head} — ${extra}` : head; }
    const meta = [when, itemLabel(p), who, hoursText(p), p.qtyPlan ? `ปริมาณ ${U.num(p.qtyDone || 0)}/${U.num(p.qtyPlan)}` : ''].filter(Boolean).join(' · ');
    return [head, `   ${meta}`, p.status === 'not_done' && p.reason ? `   สาเหตุ: ${p.reason}` : ''].filter(Boolean).join('\n');
  }
  function lineText(ctx) {
    const scope = state.lineScope, by = state.lineGroup, detail = state.lineDetail, { T, week } = ctx;
    const tasks = lineTasks(scope, ctx), oneDay = scope === 'today' || scope === 'tomorrow';
    const title = { month: `📋 แผนงานเดือน${thMonth(ctx.month)}`, week: `📋 แผนงานสัปดาห์ ${thRange(week)}`, today: `📋 งานวันนี้ · ${thDay(T)}`, tomorrow: `📋 งานพรุ่งนี้ · ${thDay(PM.addDays(T, 1))}`, late: `⚠️ งานเลยกำหนด · สัปดาห์ ${thRange(week)}` }[scope];
    const s = PM.planStats(tasks);
    const counts = `งาน ${s.total} · เสร็จ ${s.done} · กำลังทำ ${s.inProgress} · ยังไม่เริ่ม ${s.planned}${s.notDone ? ` · ไม่เสร็จ ${s.notDone}` : ''}`;
    const head = [title, ctx.note, tasks.length ? (scope === 'late' ? `${s.total} งาน` : counts + ((scope === 'week' || scope === 'month') && !ctx.narrowed ? ` · PPC ${U.pct(scope === 'month' ? duePpc(tasks, T) : s.ppc)}` : '')) : ''].filter(Boolean).join('\n');
    if (!tasks.length) return `${head}\nไม่มีงาน`;
    const body = oneDay && by !== 'person'
      ? tasks.map((p) => lineTaskText(p, by, oneDay, detail, T)).join('\n')
      : groupsOf(tasks, by).map((g) => `${g.icon} ${g.label}${g.sub ? ` (${g.sub})` : ''}\n${g.tasks.map((p) => lineTaskText(p, by, oneDay, detail, T)).join('\n')}`).join('\n\n');
    return `${head}\n\n${body}`;
  }
  const seg = (name, items, value) => `<div class="seg" role="group" data-seg-of="${name}">${items.map((it) => `<button type="button" data-line="${name}" data-val="${it.key}" class="${it.key === value ? 'on' : ''}">${esc(it.label)}</button>`).join('')}</div>`;
  /* what still has to be prepared in the next weeks, for the people who prepare it */
  function linePrepText(ctx) {
    const rows = ctx.lookRows.filter((p) => !isClosed(p) && prepOpen(p).length);
    const head = `🧰 สิ่งที่ต้องเตรียม · ${thRange(ctx.lookWeeks[0]).split(' – ')[0]} – ${thRange(ctx.lookWeeks[LOOK_WEEKS - 1]).split(' – ')[1]}${ctx.note ? `\n${ctx.note}` : ''}`;
    if (!rows.length) return `${head}\nไม่มีรายการที่ต้องเตรียม`;
    return `${head}\n\n${rows.map((p) => `📌 ${p.title} · ${thShortDay(p.dueDate)}\n   ${itemLabel(p)}\n${prepOpen(p).map((x) => `⬜ ${x.type || 'อื่น ๆ'}: ${x.text}${x.owner ? ` — ${x.owner}` : ''}${x.due ? ` · ภายใน ${thShortDay(x.due)}${x.due < ctx.T ? ' ⚠️' : ''}` : ''}`).join('\n')}`).join('\n\n')}`;
  }
  function lineDialog(ctx) {
    const form = U.modal({
      title: 'คัดลอกแผนงานส่ง LINE', wide: true, submitLabel: 'คัดลอกข้อความ',
      body: `
        <div class="full line-opts">
          ${seg('lineScope', LINE_SCOPES.concat({ key: 'prep', label: 'สิ่งที่ต้องเตรียม' }), state.lineScope)}
          ${seg('lineGroup', [{ key: 'day', label: 'เรียงตามวัน' }, { key: 'person', label: 'แยกตามคน' }], state.lineGroup)}
          ${seg('lineDetail', [{ key: 'full', label: 'แบบละเอียด' }, { key: 'short', label: 'แบบย่อ' }], state.lineDetail)}
        </div>
        ${U.field('ข้อความ (แก้ไขก่อนคัดลอกได้)', 'text', '', { type: 'textarea', full: true, rows: 15 })}
        <div class="full line-foot"><small class="muted" data-line-count></small>${navigator.share ? '<button type="button" class="btn sm" data-line-share>แชร์ไปแอปอื่น</button>' : ''}</div>
        ${ctx.note ? `<p class="full muted" style="margin:0">ตามตัวกรองในหน้าแผนงาน: ${esc(ctx.note)}</p>` : ''}`,
      onSubmit: (f, frm) => {
        U.copyText(frm.text.value).then((ok) => {
          if (ok) { U.closeModal(); U.toast('คัดลอกแล้ว — ไปวางในแชต LINE ได้เลย', 3000); return; }
          frm.text.focus(); frm.text.select();
          U.alert('เบราว์เซอร์ไม่อนุญาตให้คัดลอกอัตโนมัติ — ข้อความถูกเลือกไว้แล้ว กด Ctrl + C (มือถือ: กดค้างแล้วเลือกคัดลอก)');
        });
        return false;
      },
    });
    const count = form.querySelector('[data-line-count]');
    const drawCount = () => { count.textContent = `${U.num(form.text.value.length)} ตัวอักษร`; };
    const draw = () => {
      const prep = state.lineScope === 'prep';
      ['lineGroup', 'lineDetail'].forEach((k) => { form.querySelector(`[data-seg-of="${k}"]`).hidden = prep; });
      form.text.value = prep ? linePrepText(ctx) : lineText(ctx);
      drawCount();
    };
    form.text.addEventListener('input', drawCount);
    form.querySelector('.line-opts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-line]');
      if (!b) return;
      state[b.dataset.line] = b.dataset.val;
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      draw();
    });
    const share = form.querySelector('[data-line-share]');
    if (share) share.addEventListener('click', () => navigator.share({ text: form.text.value }).catch(() => { /* closed the share sheet */ }));
    draw();
  }

  /* ---------- Screenshot: the plan as a PNG (drawn by weekly-shot.js) to paste or share in a chat ---------- */
  const SHOT_LAYOUTS = [{ key: 'month', label: 'ปฏิทินเดือน' }, { key: 'cal', label: 'ปฏิทิน 7 วัน' }, { key: 'day', label: 'รายการตามวัน' }, { key: 'person', label: 'รายการแยกตามคน' }];
  function shotData(ctx) {
    const { T, week } = ctx, cal = state.shotLayout === 'cal', calMonth = state.shotLayout === 'month', scope = calMonth ? 'month' : cal ? 'week' : state.lineScope;
    const tasks = lineTasks(scope, ctx), s = PM.planStats(tasks), by = state.shotLayout === 'person' ? 'person' : 'day';
    const oneDay = scope === 'today' || scope === 'tomorrow';
    const task = (p, group) => ({
      title: p.title, status: p.status, statusLabel: statusInfo(p.status).th, late: isLate(p, T), reason: p.status === 'not_done' ? p.reason : '',
      lines: [itemLabel(p), group === 'person' ? (oneDay ? '' : thShortDay(p.dueDate)) : peopleText(p), [hoursText(p), p.qtyPlan ? `ปริมาณ ${U.num(p.qtyDone || 0)}/${U.num(p.qtyPlan)}` : ''].filter(Boolean).join(' · ')],
    });
    const whole = (scope === 'week' || scope === 'month') && !ctx.narrowed;
    const d = {
      company: PM.COMPANY, note: ctx.note, stamp: `ข้อมูล ณ ${new Date().toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      title: { month: 'แผนงานรายเดือน', week: 'แผนงานรายสัปดาห์', today: 'งานวันนี้', tomorrow: 'งานพรุ่งนี้', late: 'งานเลยกำหนด' }[scope],
      sub: scope === 'month' ? thMonth(ctx.month) : scope === 'today' ? thDay(T) : scope === 'tomorrow' ? thDay(PM.addDays(T, 1)) : `สัปดาห์ ${thRange(week)}`,
      kpis: [{ label: 'งาน', value: String(s.total), sub: `ยังไม่เริ่ม ${s.planned}` }, { label: 'เสร็จ', value: String(s.done), sub: `กำลังทำ ${s.inProgress}`, level: 'good' }, { label: 'ไม่เสร็จ', value: String(s.notDone), level: s.notDone ? 'critical' : '' }]
        .concat(whole ? [{ label: 'PPC', value: U.pct(scope === 'month' ? duePpc(tasks, T) : s.ppc), sub: scope === 'month' ? 'เทียบงานที่ถึงกำหนดแล้ว' : `เป้าหมาย ${U.pct(PPC_TARGET)}`, level: ppcLevel(scope === 'month' ? duePpc(tasks, T) : s.ppc) }] : [{ label: 'ชั่วโมงคน', value: U.num(s.hours, 1) }]),
    };
    if (calMonth) {
      d.layout = 'month';
      const first = `${ctx.month}-01`, start = PM.monday(first), stop = PM.addDays(PM.monday(PM.monthEnd(ctx.month)), 6);
      d.heads = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
      d.cells = [];
      for (let x = start; x <= stop; x = PM.addDays(x, 1)) {
        const hol = PM.holidayOf(x);
        d.cells.push({ num: PM.parse(x).getDate(), out: x.slice(0, 7) !== ctx.month, today: x === T, weekend: weekdayOf(x) > 4, holiday: hol ? hol.name : '', tasks: tasks.filter((p) => p.dueDate === x).map((p) => ({ title: p.title, status: p.status, late: isLate(p, T) })) });
      }
    } else if (cal) {
      d.layout = 'cal';
      // Saturday and Sunday only when something is planned on them, so the working days stay readable
      d.days = weekDays(week).filter((x, i) => i < 5 || tasks.some((p) => p.dueDate === x)).map((x) => {
        const mine = tasks.filter((p) => p.dueDate === x);
        return { head: thShortDay(x), sub: mine.length ? `${mine.length} งาน · ${U.num(PM.sum(mine, manHours), 1)} ชม.` : '', today: x === T, tasks: mine.map((p) => task(p, 'cal')) };
      });
    } else {
      d.layout = 'list';
      d.groups = groupsOf(tasks, by).map((g) => ({ label: g.label, sub: g.sub || `${g.tasks.length} งาน`, tasks: g.tasks.map((p) => task(p, by)) }));
    }
    return d;
  }
  function shotDialog(ctx) {
    if (!state.shotLayout) state.shotLayout = window.innerWidth > 900 ? 'month' : 'day';
    if (state.lineScope === 'prep') state.lineScope = 'week'; // a choice of the LINE text only
    const form = U.modal({
      title: 'Screenshot แผนงาน', wide: true, submitLabel: 'คัดลอกรูป',
      body: `
        <div class="full line-opts">
          ${seg('shotLayout', SHOT_LAYOUTS, state.shotLayout)}
          ${seg('lineScope', LINE_SCOPES, state.lineScope)}
        </div>
        <div class="full shot-prev" data-shot-box><p class="muted" data-shot-wait>กำลังสร้างรูป…</p><img alt="ตัวอย่างรูปแผนงาน" hidden></div>
        <div class="full line-foot"><small class="muted" data-shot-size></small><span class="line-btns"><button type="button" class="btn sm" data-shot-save>ดาวน์โหลด PNG</button>${navigator.share ? '<button type="button" class="btn sm" data-shot-share hidden>แชร์ไปแอปอื่น</button>' : ''}</span></div>
        ${ctx.note ? `<p class="full muted" style="margin:0">ตามตัวกรองในหน้าแผนงาน: ${esc(ctx.note)}</p>` : ''}`,
      onSubmit: () => { copyShot(); return false; },
    });
    const img = form.querySelector('[data-shot-box] img'), wait = form.querySelector('[data-shot-wait]'), size = form.querySelector('[data-shot-size]');
    const submit = form.querySelector('[type=submit]'), save = form.querySelector('[data-shot-save]'), share = form.querySelector('[data-shot-share]');
    const scopeSeg = form.querySelector('[data-seg-of="lineScope"]');
    const fileName = () => (state.shotLayout === 'month' ? `monthly-plan-${ctx.month}.png` : `weekly-plan-${ctx.week}.png`);
    let blob = null, url = '', turn = 0;
    const draw = async () => {
      const mine = ++turn;
      scopeSeg.hidden = state.shotLayout === 'cal' || state.shotLayout === 'month'; // a calendar always shows the whole week or month
      submit.disabled = true; save.disabled = true;
      wait.hidden = false;
      let r = null;
      try { r = await PM.planShot.render(shotData(ctx)); } catch (e) { console.warn('screenshot:', e); }
      if (mine !== turn || !form.isConnected) return; // another choice came in meanwhile, or the form was closed
      wait.hidden = !!(r && r.blob);
      if (!r || !r.blob) { wait.textContent = 'สร้างรูปไม่สำเร็จ — ลองเลือกแบบรายการ หรือใช้ปุ่มพิมพ์ / PDF'; img.hidden = true; return; }
      if (url) URL.revokeObjectURL(url);
      blob = r.blob;
      url = URL.createObjectURL(blob);
      img.src = url;
      img.hidden = false;
      submit.disabled = false; save.disabled = false;
      size.textContent = `${U.num(r.width)} × ${U.num(r.height)} px${r.height > r.width * 3 ? ' · รูปยาวมาก อ่านยากในแชต ลองเลือกวันนี้หรือแยกตามคน' : ''}`;
      if (share) share.hidden = !(navigator.canShare && navigator.canShare({ files: [new File([blob], fileName(), { type: 'image/png' })] }));
    };
    async function copyShot() {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        U.closeModal();
        U.toast('คัดลอกรูปแล้ว — ไปวางในแชต LINE ได้เลย', 3000);
      } catch (e) {
        U.alert('เบราว์เซอร์นี้คัดลอกรูปไม่ได้ — กด "ดาวน์โหลด PNG" แล้วส่งไฟล์รูปแทน');
      }
    }
    save.addEventListener('click', () => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    if (share) share.addEventListener('click', () => navigator.share({ files: [new File([blob], fileName(), { type: 'image/png' })] }).catch(() => { /* closed the share sheet */ }));
    form.querySelector('.line-opts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-line]');
      if (!b) return;
      state[b.dataset.line] = b.dataset.val;
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      draw();
    });
    draw();
  }

  /* ---------- printed plan (A4 landscape) ---------- */
  function printPlan(tasks, ctx) {
    const P = PM.printDoc, win = P.open();
    if (!win) return;
    const { T, week } = ctx, by = state.mode === 'team' || (state.mode === 'calendar' && state.group === 'person') ? 'person' : 'day';
    const s = ctx.narrowed ? PM.planStats(tasks) : ctx.stats;
    const row = (p) => {
      const st = statusInfo(p.status), late = isLate(p, T);
      return `<tr><td><b>${esc(p.title)}</b>${p.carriedFrom ? '<small>ยกมาจากสัปดาห์ก่อน</small>' : ''}</td><td>${esc(itemLabel(p))}</td><td>${esc(peopleText(p))}</td>
        <td>${esc(thShortDay(p.dueDate))}${late ? '<small class="neg">เลยกำหนด</small>' : ''}</td><td class="r">${esc(hoursText(p))}</td><td class="r">${p.qtyPlan ? `${U.num(p.qtyDone || 0)} / ${U.num(p.qtyPlan)}` : '–'}</td>
        <td>${U.badge(st.level, st.th)}</td><td>${esc([p.status === 'not_done' ? p.reason : '', p.note].filter(Boolean).join(' · '))}</td></tr>`;
    };
    P.write(win, {
      title: ctx.isMonth ? `Monthly Plan ${ctx.month}` : `Weekly Plan ${week}`, bar: ctx.isMonth ? `แผนงานเดือน${thMonth(ctx.month)}` : `แผนงานรายสัปดาห์ — ${thRange(week)}`, doc: 'weekly',
      head: { title: ctx.isMonth ? `<h1>แผนงานรายเดือน</h1><p><b>Monthly Plan</b> · ${esc(thMonth(ctx.month))}</p>${ctx.note ? `<p>${esc(ctx.note)}</p>` : ''}` : `<h1>แผนงานรายสัปดาห์</h1><p><b>Weekly Plan</b> · ${esc(thRange(week))}</p>${ctx.note ? `<p>${esc(ctx.note)}</p>` : ''}`, meta: `${esc(PM.COMPANY)}<br>ข้อมูล ณ ${U.date(T)}<br>${by === 'person' ? 'แยกตามคน' : 'เรียงตามวัน'}` },
      body: `<style>@page { size: A4 landscape; } main { max-width: 275mm; } .kpis { margin-bottom: 10px; }
          tr.grp td { background: #dfe8f5; color: #0b2f6b; font-weight: 700; font-size: 11px; border-bottom: 1px solid #c0ccdc; } tr.grp small { display: inline; margin-left: 8px; font-weight: 400; color: #3f5068; font-size: 10px; }</style>
        <section class="kpis">${P.kpi('งานในแผน', s.total)}${P.kpi('เสร็จ', s.done, `กำลังทำ ${s.inProgress} · ไม่เสร็จ ${s.notDone}`)}${ctx.narrowed ? P.kpi('ยังไม่เริ่ม', s.planned) : P.kpi('PPC', U.pct(s.ppc), `เป้าหมาย ${U.pct(PPC_TARGET)}`, ppcLevel(s.ppc))}${P.kpi('ชั่วโมงคน', U.num(s.hours, 1))}</section>
        ${tasks.length ? `<section class="flow"><table><thead><tr><th>งาน</th><th>โครงการ / ขั้นงาน</th><th>ผู้รับผิดชอบ</th><th>กำหนดเสร็จ</th><th class="r">ชั่วโมง</th><th class="r">ปริมาณ</th><th>สถานะ</th><th>สาเหตุ / หมายเหตุ</th></tr></thead><tbody>
          ${groupsOf(tasks, by).map((g) => `<tr class="grp"><td colspan="8">${esc(g.label)}${g.sub ? `<small>${esc(g.sub)}</small>` : `<small>${g.tasks.length} งาน</small>`}</td></tr>${g.tasks.map(row).join('')}`).join('')}
        </tbody></table></section>` : '<p class="none">ไม่มีงานตามตัวกรองนี้</p>'}
        <div class="sign"><div>ผู้จัดทำแผน</div><div>ผู้จัดการโครงการ</div><div>หัวหน้าแผนก</div></div>`,
    });
  }

  /* ---------- look-ahead: the coming weeks and what each task still needs ---------- */
  const readyBadge = (p, T) => {
    if (isClosed(p)) return U.badge(statusInfo(p.status).level, statusInfo(p.status).th);
    const all = prepOf(p), open = prepOpen(p), late = prepLate(p, T);
    if (!all.length) return U.badge('neutral', 'ไม่ได้ระบุ');
    if (late.length) return U.badge('critical', `เลยกำหนดเตรียม ${late.length}`);
    return open.length ? U.badge('warning', `ยังขาด ${open.length}`) : U.badge('good', 'พร้อม');
  };
  function lookSummary(rows, T) {
    const live = rows.filter((p) => !isClosed(p));
    const ready = live.filter((p) => prepOf(p).length && !prepOpen(p).length).length, short = live.filter((p) => prepOpen(p).length).length;
    const none = live.filter((p) => !prepOf(p).length).length, late = live.filter((p) => prepLate(p, T).length).length;
    return `งานที่ยังไม่จบ ${live.length} · พร้อม ${ready} · ยังขาด ${short}${late ? ` (เลยกำหนดเตรียม ${late})` : ''} · ยังไม่ได้ระบุสิ่งที่ต้องเตรียม ${none} · ติ๊กเมื่อเตรียมเสร็จ · เปิดงานเพื่อเพิ่มรายการ`;
  }
  const prepItems = (p, T, canStatus) => prepOf(p).map((x, i) => `<label class="prep-item${x.done ? ' done' : ''}${!x.done && x.due && x.due < T ? ' late' : ''}">
      <input type="checkbox" data-prep-done="${esc(p.id)}|${i}"${x.done ? ' checked' : ''}${canStatus ? '' : ' disabled'}>
      <span><b>${esc(x.type || 'อื่น ๆ')}</b> ${esc(x.text)}${x.owner || x.due ? `<small>${esc([x.owner, x.due && `ภายใน ${U.date(x.due)}`].filter(Boolean).join(' · '))}</small>` : ''}</span></label>`).join('');
  function lookahead(weeks, rows, T, canEdit, canStatus) {
    return `<div class="card-b look">${weeks.map((w) => {
      const mine = rows.filter((p) => p.week === w);
      const live = mine.filter((p) => !isClosed(p)), short = live.filter((p) => prepOpen(p).length).length;
      return `<section class="look-week">
        <header><b>สัปดาห์ที่ ${V.isoWeek(w)}</b><span>${esc(thRange(w))}</span><small>${mine.length} งาน · ${U.num(PM.sum(mine, manHours), 1)} ชม.${short ? ` · ยังขาดของ ${short} งาน` : ''}</small>
          ${canEdit ? `<button class="btn sm" data-action="new-on" data-day="${PM.addDays(w, 4)}">+ เพิ่มงาน</button>` : ''}</header>
        ${mine.length ? `<div class="table-wrap"><table class="tbl look-tbl"><thead><tr><th>งาน</th><th>ผู้รับผิดชอบ</th><th>กำหนดเสร็จ</th><th>สิ่งที่ต้องเตรียม</th><th>ความพร้อม</th></tr></thead><tbody>
          ${mine.map((p) => `<tr class="${canEdit ? 'click' : ''}" data-plan="${esc(p.id)}">
            <td><span class="title">${p.ruleId ? '🔁 ' : ''}${esc(p.title)}</span><small>${esc(itemLabel(p))}</small></td><td>${peopleChips(p)}</td>
            <td class="nowrap">${esc(thShortDay(p.dueDate))}</td><td>${prepItems(p, T, canStatus) || '<span class="muted">–</span>'}</td><td>${readyBadge(p, T)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="empty">ยังไม่มีงานในสัปดาห์นี้</p>'}
      </section>`;
    }).join('')}</div>`;
  }
  function printLook(ctx) {
    const P = PM.printDoc, win = P.open();
    if (!win) return;
    const { T, lookWeeks, lookRows } = ctx, live = lookRows.filter((p) => !isClosed(p));
    const prepText = (p) => prepOf(p).map((x) => `<div>${x.done ? '☑' : '☐'} ${esc(x.type || '')}: ${esc(x.text)}${x.owner ? ` — ${esc(x.owner)}` : ''}${x.due ? ` · ${esc(U.date(x.due))}` : ''}</div>`).join('') || '–';
    const ready = (p) => (isClosed(p) ? statusInfo(p.status).th : !prepOf(p).length ? 'ไม่ได้ระบุ' : prepLate(p, T).length ? `เลยกำหนด ${prepLate(p, T).length}` : prepOpen(p).length ? `ยังขาด ${prepOpen(p).length}` : 'พร้อม');
    P.write(win, {
      title: `Look-ahead ${ctx.week}`, bar: `แผนล่วงหน้า ${LOOK_WEEKS} สัปดาห์`, doc: 'weekly',
      head: { title: `<h1>แผนล่วงหน้า ${LOOK_WEEKS} สัปดาห์</h1><p><b>Look-ahead Plan</b></p>${ctx.note ? `<p>${esc(ctx.note)}</p>` : ''}`, meta: `${esc(PM.COMPANY)}<br>ข้อมูล ณ ${U.date(T)}<br>${lookRows.length} งาน` },
      body: `<style>@page { size: A4 landscape; } main { max-width: 275mm; } .kpis { margin-bottom: 10px; } tr.grp td { background: #dfe8f5; color: #0b2f6b; font-weight: 700; font-size: 11px; }</style>
        <section class="kpis">${P.kpi('งานที่ยังไม่จบ', live.length)}${P.kpi('พร้อม', live.filter((p) => prepOf(p).length && !prepOpen(p).length).length, '', 'good')}${P.kpi('ยังขาด', live.filter((p) => prepOpen(p).length).length, '', 'warning')}${P.kpi('เลยกำหนดเตรียม', live.filter((p) => prepLate(p, T).length).length, '', 'critical')}</section>
        <section class="flow"><table><thead><tr><th>งาน</th><th>โครงการ / ขั้นงาน</th><th>ผู้รับผิดชอบ</th><th>กำหนดเสร็จ</th><th>สิ่งที่ต้องเตรียม</th><th>ความพร้อม</th></tr></thead><tbody>
          ${lookWeeks.map((w) => { const mine = lookRows.filter((p) => p.week === w); return `<tr class="grp"><td colspan="6">สัปดาห์ที่ ${V.isoWeek(w)} · ${esc(thRange(w))} · ${mine.length} งาน</td></tr>${mine.map((p) => `<tr><td><b>${esc(p.title)}</b></td><td>${esc(itemLabel(p))}</td><td>${esc(peopleText(p))}</td><td>${esc(thShortDay(p.dueDate))}</td><td>${prepText(p)}</td><td>${esc(ready(p))}</td></tr>`).join('')}`; }).join('')}
        </tbody></table></section>
        <div class="sign"><div>ผู้จัดทำแผน</div><div>ผู้จัดการโครงการ</div><div>หัวหน้าแผนก</div></div>`,
    });
  }

  /* ---------- many tasks at once ---------- */
  function bulkUpdate(action, tasks, done) {
    if (!tasks.length) { U.toast('ยังไม่ได้เลือกงาน'); return; }
    if (!PM.can('plan.status')) return;
    const finish = (msg) => { PM.save(); pick.on = false; pick.ids.clear(); U.toast(msg); done(); };
    if (action === 'delete') {
      const mine = tasks.filter(PM.canDeletePlan), others = tasks.length - mine.length;
      if (!mine.length) { U.alert('ลบได้เฉพาะงานที่คุณเป็นผู้สร้าง — งานที่เลือกไม่มีงานของคุณ'); return; }
      U.confirm(`ลบ ${mine.length} งาน ออกจากแผน ลบแล้วกู้คืนไม่ได้${others ? `\n\nอีก ${others} งานคนอื่นเป็นผู้สร้าง จะไม่ถูกลบ` : ''}`, { title: 'ลบหลายงาน', ok: 'ลบถาวร', tone: 'danger' })
        .then((ok) => { if (!ok) return; mine.forEach(removePlan); finish(`ลบแล้ว ${mine.length} งาน`); });
      return;
    }
    const label = statusInfo(action).th;
    if (action !== 'not_done') { tasks.forEach((p) => applyStatus(p, action)); finish(`อัปเดต ${tasks.length} งานเป็น ${label}`); return; }
    U.modal({
      title: `บันทึกไม่เสร็จ ${tasks.length} งาน`, submitLabel: 'บันทึก',
      body: `${U.field('สาเหตุที่ไม่เสร็จ', 'reason', '', { options: PM.PLAN_REASONS, placeholder: '— เลือกสาเหตุ —', required: true, full: true })}
        <p class="full muted" style="margin:0">ใช้สาเหตุเดียวกันทุกงาน · ไม่เปิด NCR ให้อัตโนมัติ บันทึก NCR รายงานได้จากปุ่มในรายการงาน</p>`,
      onSubmit: (f) => { if (!f.reason) { U.alert('กรุณาเลือกสาเหตุ'); return false; } tasks.forEach((p) => applyStatus(p, 'not_done', f.reason)); finish(`บันทึกไม่เสร็จ ${tasks.length} งาน`); },
    });
  }

  /* ---------- copy the whole week to a later one ---------- */
  function copyWeek(ctx, done) {
    const from = ctx.week, targets = [1, 2, 3, 4].map((i) => PM.addDays(from, 7 * i));
    const src = PM.db.plans.filter((p) => p.week === from && ctx.full(p));
    const recurring = src.filter((p) => p.ruleId).length, base = src.filter((p) => !p.ruleId);
    if (!base.length) { U.toast(recurring ? 'สัปดาห์นี้มีแต่งานประจำ ซึ่งระบบสร้างให้เองอยู่แล้ว' : 'ไม่มีงานให้คัดลอก'); return; }
    const already = (to) => new Set(PM.db.plans.filter((p) => p.week === to && p.copiedFrom).map((p) => p.copiedFrom));
    const form = U.modal({
      title: 'คัดลอกทั้งสัปดาห์', submitLabel: 'คัดลอก',
      body: `<p class="full" style="margin:0">จากสัปดาห์ <b>${esc(thRange(from))}</b>${ctx.note ? ` ตามตัวกรอง: ${esc(ctx.note)}` : ''}</p>
        ${U.field('ไปสัปดาห์', 'to', targets[0], { options: targets.map((w) => ({ value: w, label: thRange(w) })), full: true })}
        <p class="full muted" data-copy-note style="margin:0"></p>`,
      onSubmit: (f) => {
        const to = f.to, shift = PM.diffDays(from, to), seen = already(to);
        const fresh = base.filter((p) => !seen.has(p.id));
        const stamp = creatorStamp();
        let skipped = 0;
        fresh.forEach((p) => {
          const ids = PM.planPeople(p).filter((id) => { const r = PM.find('resources', id); return r && r.active !== false; });
          if (!ids.length && !PM.planGuests(p).length) { skipped++; return; }
          PM.db.plans.push(Object.assign({}, p, stamp, {
            id: PM.uid('W'), week: to, dueDate: PM.addDays(p.dueDate, shift), resourceIds: ids, resourceId: ids[0] || '', guests: PM.planGuests(p).slice(),
            qtyDone: 0, status: 'planned', reason: '', ncrId: null, carriedFrom: null, copiedFrom: p.id,
            prep: prepOf(p).map((x) => Object.assign({}, x, { done: false, due: x.due ? PM.addDays(x.due, shift) : '' })),
          }));
        });
        PM.save();
        state.week = to;
        U.toast(`คัดลอก ${fresh.length - skipped} งานแล้ว · สถานะเริ่มใหม่เป็นวางแผน${skipped ? ` · ข้าม ${skipped} งานที่ไม่เหลือผู้รับผิดชอบ` : ''}`, 3500);
        done();
      },
    });
    const note = form.querySelector('[data-copy-note]');
    const draw = () => {
      const dup = base.filter((p) => already(form.to.value).has(p.id)).length;
      note.textContent = `จะคัดลอก ${base.length - dup} งาน · สถานะเริ่มใหม่ ผลงานเดิมไม่ติดไป${dup ? ` · ข้าม ${dup} งานที่เคยคัดลอกไปแล้ว` : ''}${recurring ? ` · ไม่รวมงานประจำ ${recurring} งาน (ระบบสร้างให้เอง)` : ''}`;
    };
    form.to.addEventListener('change', draw);
    draw();
  }

  /* ---------- recurring tasks ----------
     No server runs on a clock, so tasks are created when anyone opens the site (app.js calls this on every page), for this week and
     the next three. A task's id comes from its rule and date, so two people opening the site at once make one task, not two.
     rule.generatedUntil: nothing before it is created again, so a task someone moved stays moved.
     rule.skips: dates deleted by hand, which a change to the rule must not bring back. */
  const WEEKDAYS = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
  const weekdayOf = (d) => (PM.parse(d).getDay() + 6) % 7;
  const ruleAlive = (r) => {
    if (r.kind === 'project') { const x = PM.find('projects', r.refId); return !!x && x.status !== 'closed'; }
    if (r.kind === 'bid') { const b = PM.find('bids', r.refId); return !!b && b.result === 'pending'; }
    return true;
  };
  const rulePeople = (r) => (r.resourceIds || []).filter((id) => { const p = PM.find('resources', id); return p && p.active !== false; });
  const ruleProblem = (r) => (r.active === false ? '' : !ruleAlive(r) ? 'โครงการ / Bid จบแล้ว' : !rulePeople(r).length && !(r.guests || []).length ? 'ไม่มีผู้รับผิดชอบ' : r.endDate && r.endDate < PM.today() ? 'ครบวันสิ้นสุดแล้ว' : '');
  PM.ensureRecurring = function () {
    const rules = PM.db.planrules || [];
    if (!rules.length || (PM.auth && PM.auth.user && !PM.myRole())) return 0;
    const T = PM.today(), monday = PM.monday(T), until = PM.addDays(monday, 7 * LOOK_WEEKS - 1);
    let made = 0, touched = false;
    rules.forEach((r) => {
      if (r.active === false || (r.generatedUntil || '') >= until || !ruleAlive(r)) return;
      const next = r.generatedUntil ? PM.max(PM.addDays(r.generatedUntil, 1), monday) : T;
      const stop = r.endDate ? PM.min(until, r.endDate) : until;
      const ids = rulePeople(r), guests = (r.guests || []).slice();
      for (let d = PM.max(next, r.startDate || T); d <= stop; d = PM.addDays(d, 1)) {
        if (!(r.weekdays || []).includes(weekdayOf(d)) || (r.skips || []).includes(d) || (r.skipHolidays !== false && PM.holidayOf(d))) continue;
        const id = `W-${r.id}-${d}`;
        if ((!ids.length && !guests.length) || PM.find('plans', id)) continue;
        PM.db.plans.push({
          id, week: PM.monday(d), kind: r.kind, refId: r.refId, phase: r.kind === 'project' ? r.phase : '', title: r.title,
          resourceId: ids[0] || '', resourceIds: ids.slice(), guests: guests.slice(), plannedHours: r.plannedHours || 0, dueDate: d, qtyPlan: 0, qtyDone: 0,
          status: 'planned', reason: '', note: r.note || '', carriedFrom: null, ruleId: r.id, ruleDate: d,
          createdBy: r.createdBy || '', createdByName: r.createdByName || '', createdAt: new Date().toISOString(),
        });
        made++;
      }
      r.generatedUntil = until;
      touched = true;
    });
    if (touched) PM.save();
    return made;
  };
  PM.canManageRule = (r) => {
    const u = PM.auth && PM.auth.user;
    if (!u || !PM.can('plan.edit')) return false;
    return PM.auth.role === 'admin' || (!!r.createdBy && r.createdBy === u.id);
  };
  /* the rule changed: tasks not started yet follow it, except ones edited by hand. Deleting stays with whoever may delete the task */
  function syncRule(r) {
    const T = PM.today(), keep = [];
    PM.db.plans.filter((p) => p.ruleId === r.id && p.dueDate >= T && p.status === 'planned' && !p.ruleEdited).forEach((p) => {
      const fits = r.active !== false && (r.weekdays || []).includes(weekdayOf(p.ruleDate || p.dueDate)) && (!r.endDate || p.dueDate <= r.endDate) && (!r.startDate || p.dueDate >= r.startDate);
      if (!fits) {
        if (PM.canDeletePlan(p)) PM.db.plans = PM.db.plans.filter((x) => x.id !== p.id); else keep.push(p);
        return;
      }
      const ids = rulePeople(r);
      Object.assign(p, { kind: r.kind, refId: r.refId, phase: r.kind === 'project' ? r.phase : '', title: r.title, resourceIds: ids.slice(), resourceId: ids[0] || '', guests: (r.guests || []).slice(), plannedHours: r.plannedHours || 0, note: r.note || '' });
    });
    r.generatedUntil = '';
    return keep.length;
  }
  function ruleList(done) {
    const T = PM.today(), canAdd = PM.can('plan.edit');
    const rules = PM.db.planrules.slice().sort((a, b) => (a.active === false) - (b.active === false) || String(a.title).localeCompare(String(b.title)));
    const nextOf = (r) => PM.db.plans.filter((p) => p.ruleId === r.id && p.dueDate >= T && !isClosed(p)).map((p) => p.dueDate).sort()[0];
    const form = U.modal({
      title: 'งานประจำ', wide: true,
      body: `<div class="full row" style="margin:0"><span class="muted" style="flex:1 1 240px">ระบบสร้างงานให้ล่วงหน้า ${LOOK_WEEKS} สัปดาห์ เมื่อมีคนเปิดเว็บ · แก้งานแต่ละครั้งได้โดยไม่กระทบรอบถัดไป</span>${canAdd ? '<button type="button" class="btn primary sm" data-rule-new>+ เพิ่มงานประจำ</button>' : ''}</div>
        <div class="full table-wrap">${rules.length ? `<table class="tbl"><thead><tr><th>งาน</th><th>ทุกวัน</th><th>ผู้รับผิดชอบ</th><th class="num">ชม.</th><th>ครั้งถัดไป</th><th>สถานะ</th></tr></thead><tbody>
          ${rules.map((r) => { const bad = ruleProblem(r), n = nextOf(r); return `<tr class="click" data-rule="${esc(r.id)}"><td><span class="title">${esc(r.title)}</span><small>${esc(itemLabel(r))}</small></td>
            <td class="nowrap">${esc((r.weekdays || []).slice().sort().map((i) => WEEKDAYS[i]).join(' '))}</td><td>${esc(peopleText({ resourceIds: rulePeople(r), guests: r.guests }))}</td><td class="num">${U.num(r.plannedHours || 0, 1)}</td>
            <td class="nowrap">${n ? esc(thShortDay(n)) : '–'}</td><td>${r.active === false ? U.badge('neutral', 'หยุดอยู่') : bad ? U.badge('warning', bad) : U.badge('good', 'ทำงานอยู่')}</td></tr>`; }).join('')}
        </tbody></table>` : '<p class="empty">ยังไม่มีงานประจำ — เช่น ประชุมทีมทุกวันจันทร์</p>'}</div>`,
    });
    const reopen = () => { done(); setTimeout(() => ruleList(done), 220); };
    const add = form.querySelector('[data-rule-new]');
    if (add) add.addEventListener('click', () => { U.closeModal(); ruleForm(null, reopen); });
    form.addEventListener('click', (e) => { const row = e.target.closest('[data-rule]'); if (row) { U.closeModal(); ruleForm(PM.find('planrules', row.dataset.rule), reopen); } });
  }
  function ruleForm(rule, done, prefill) {
    const T = PM.today(), isNew = !rule, firstProject = PM.db.projects.find((p) => p.status !== 'closed');
    const r = rule || Object.assign({
      id: PM.uid('PR'), title: '', kind: firstProject ? 'project' : 'overhead', refId: firstProject ? firstProject.id : (PM.OVERHEAD[0] || {}).id, phase: 'construction',
      weekdays: [0], resourceIds: state.person ? [state.person] : [], guests: [], plannedHours: 1, startDate: T, endDate: '', skipHolidays: true, active: true, note: '', skips: [],
    }, creatorStamp(), prefill || {});
    const canManage = isNew ? PM.can('plan.edit') : PM.canManageRule(r);
    const chosen = new Set(r.resourceIds || []), guests = (r.guests || []).slice();
    const people = PM.db.resources.filter((x) => x.active !== false || chosen.has(x.id));
    const future = () => PM.db.plans.filter((p) => p.ruleId === r.id && p.dueDate >= T && p.status === 'planned' && !p.ruleEdited);
    const form = U.modal({
      title: isNew ? 'เพิ่มงานประจำ' : r.title, wide: true,
      deleteText: () => `ลบงานประจำ "${r.title}"\n\nงานที่ยังไม่ถึงกำหนดและยังไม่เริ่ม ${future().filter(PM.canDeletePlan).length} งานจะถูกลบด้วย · งานที่ทำไปแล้วยังอยู่`,
      onDelete: !isNew && canManage ? () => {
        future().filter(PM.canDeletePlan).forEach((p) => { PM.db.plans = PM.db.plans.filter((x) => x.id !== p.id); });
        PM.remove('planrules', r.id); U.toast('ลบงานประจำแล้ว'); done();
      } : null,
      body: `
        ${canManage ? '' : `<p class="full perm-note">ดูได้อย่างเดียว — แก้ได้เฉพาะผู้สร้าง${r.createdByName ? ` (${esc(r.createdByName)})` : ''} และ Admin</p>`}
        ${U.field('งาน / กิจกรรม', 'title', r.title, { required: true, full: true, placeholder: 'เช่น ประชุมทีมประจำสัปดาห์' })}
        <label><span>Work item (โครงการ / bid)</span>${workItemSelect(r.kind + '|' + r.refId)}</label>
        ${U.field('Phase', 'phase', r.phase || 'construction', { options: PM.PHASES.map((p) => ({ value: p.key, label: p.label })) })}
        <div class="full rule-days"><span>ทำซ้ำทุก</span><div>${WEEKDAYS.map((d, i) => `<label class="rule-day"><input type="checkbox" value="${i}"${(r.weekdays || []).includes(i) ? ' checked' : ''}><b>${d}</b></label>`).join('')}</div></div>
        ${peopleField(people, chosen)}
        ${U.field('ชั่วโมงตามแผน (ต่อคน)', 'plannedHours', r.plannedHours, { type: 'number', min: 0, step: 0.5 })}
        ${U.field('เริ่มวันที่', 'startDate', r.startDate, { type: 'date', required: true })}
        ${U.field('สิ้นสุดวันที่', 'endDate', r.endDate || '', { type: 'date', hint: 'เว้นว่าง = ไม่มีกำหนด' })}
        ${U.field('วันหยุดนักขัตฤกษ์', 'skipHolidays', r.skipHolidays === false ? 'no' : 'yes', { options: [{ value: 'yes', label: 'ข้าม ไม่สร้างงาน' }, { value: 'no', label: 'สร้างงานตามปกติ' }] })}
        ${U.field('สถานะ', 'active', r.active === false ? 'no' : 'yes', { options: [{ value: 'yes', label: 'ทำงานอยู่' }, { value: 'no', label: 'หยุดชั่วคราว' }] })}
        <span></span>
        ${U.field('หมายเหตุ', 'note', r.note, { type: 'textarea', full: true, rows: 2 })}`,
      onSubmit: !canManage ? null : (f, frm) => {
        const [kind, refId] = (f.item || '').split('|');
        const days = Array.from(frm.querySelectorAll('.rule-day input:checked')).map((i) => Number(i.value));
        const ids = Array.from(frm.querySelectorAll('.pp-list input:checked')).map((i) => i.value);
        if (!refId) { U.alert('กรุณาเลือก Work item'); return false; }
        if (!days.length) { U.alert('กรุณาเลือกวันอย่างน้อย 1 วัน'); return false; }
        if (!ids.length && !guests.length) { U.alert('กรุณาเลือกผู้รับผิดชอบอย่างน้อย 1 คน'); return false; }
        if (f.endDate && f.endDate < f.startDate) { U.alert('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม'); return false; }
        Object.assign(r, {
          title: f.title, kind, refId, phase: kind === 'project' ? f.phase : '', weekdays: days, resourceIds: ids, guests: guests.slice(), plannedHours: f.plannedHours,
          startDate: f.startDate, endDate: f.endDate, skipHolidays: f.skipHolidays === 'yes', active: f.active === 'yes', note: f.note,
        });
        PM.db.planrules = PM.db.planrules.filter((x) => x.id !== r.id).concat(r);
        const kept = syncRule(r), made = PM.ensureRecurring();
        PM.save();
        U.toast(r.active === false ? 'หยุดงานประจำแล้ว' : `บันทึกแล้ว${made ? ` · สร้างงานใหม่ ${made} งาน` : ''}${kept ? ` · ${kept} งานคนอื่นสร้างไว้ยังอยู่` : ''}`, 3000);
        done();
      },
    });
    const item = form.querySelector('[name=item]'), phase = form.querySelector('[name=phase]');
    const sync = () => { phase.disabled = !canManage || !item.value.startsWith('project|'); };
    item.addEventListener('change', sync);
    sync();
    bindPeople(form, guests).draw();
    if (!canManage) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
  }
  /* demo: two recurring tasks, tasks further ahead, and things to prepare */
  PM.buildSamplePlanTools = function (db, T) {
    const r = db.resources, wk = PM.monday(T), oh = (PM.OVERHEAD.find((o) => o.id !== 'leave') || {}).id;
    const pj = db.projects.find((p) => p.status !== 'closed') || db.projects[0];
    if (!r.length || !pj) return;
    db.planrules = [
      { id: 'PR1', title: 'ประชุมทีมประจำสัปดาห์', kind: 'overhead', refId: oh, phase: '', weekdays: [0], resourceIds: r.slice(0, 3).map((x) => x.id), guests: [], plannedHours: 1, startDate: wk, endDate: '', skipHolidays: true, active: true, note: '', skips: [], createdBy: '', createdByName: '' },
      { id: 'PR2', title: 'อัปเดตความคืบหน้าโครงการ', kind: 'project', refId: pj.id, phase: 'construction', weekdays: [4], resourceIds: [r[0].id], guests: [], plannedHours: 2, startDate: wk, endDate: '', skipHolidays: true, active: true, note: '', skips: [], createdBy: '', createdByName: '' },
    ];
    const prep = (type, text, owner, days, done) => ({ type, text, owner, due: PM.addDays(T, days), done: !!done });
    const task = (w, day, title, phase, people, hours, items) => db.plans.push({ id: `WF${w}${day}`, week: PM.addDays(wk, 7 * w), kind: 'project', refId: pj.id, phase, title, resourceId: people[0].id, resourceIds: people.map((x) => x.id), guests: [], plannedHours: hours, dueDate: PM.addDays(wk, 7 * w + day), qtyPlan: 0, qtyDone: 0, status: 'planned', reason: '', note: '', carriedFrom: null, prep: items });
    task(1, 1, 'ติดตั้ง Metering Skid ชุดที่ 1', 'construction', [r[3 % r.length], r[4 % r.length]], 16, [prep('วัสดุ / อุปกรณ์', 'Skid และ Flow Meter ถึงหน้างาน', r[1].name, 3), prep('ใบอนุญาต / PTW', 'ขอ PTW งานยกติดตั้ง', r[3 % r.length].name, 5), prep('เครื่องมือ', 'จองรถเครน 25 ตัน', r[4 % r.length].name, -1)]);
    task(2, 2, 'เดินท่อ Tie-in เข้า Skid', 'construction', [r[5 % r.length]], 24, [prep('แบบ / เอกสาร', 'แบบ Piping Isometric Rev. ล่าสุด', r[2].name, 7, true), prep('วัสดุ / อุปกรณ์', 'ท่อและ Flange ครบตาม BOM', r[1].name, 10)]);
    task(3, 3, 'ทดสอบระบบร่วมกับลูกค้า (SAT)', 'closing', [r[0], r[2]], 16, [prep('อนุมัติจากลูกค้า', 'ลูกค้าอนุมัติ SAT Procedure', r[2].name, 14, true), prep('คน', 'นัดผู้แทนลูกค้าเข้าร่วม', r[0].name, 16, true)]);
  };
  /* the bell: things to prepare that are overdue, or that a task within a week still waits for */
  PM.prepAlerts = function (T, I) {
    const out = [];
    (PM.db.plans || []).forEach((p) => {
      if (isClosed(p) || !prepOpen(p).length) return;
      const late = prepLate(p, T), soon = p.dueDate >= T && PM.diffDays(T, p.dueDate) <= 7;
      if (!late.length && !soon) return;
      const mine = Array.from(I.ids).some((id) => PM.planHas(p, id)) || prepOpen(p).some((x) => I.name && PM.normName(x.owner || '') === I.name);
      const first = late[0] || prepOpen(p)[0];
      out.push({ id: `prep-${p.id}-${late.length}-${prepOpen(p).length}`, level: 'warning', icon: 'tasks', topic: 'schedule', href: '#/weekly', mine, date: first.due || p.dueDate,
        title: late.length ? `เตรียมงานเลยกำหนด: ${p.title}` : `งานใน 7 วันยังเตรียมไม่ครบ: ${p.title}`,
        sub: `${first.text}${first.owner ? ` · ${first.owner}` : ''} · ยังขาด ${prepOpen(p).length} รายการ · งานกำหนด ${U.date(p.dueDate)}` });
    });
    return out;
  };

  /* ---------- month calendar: Monday-first weeks, up to four tasks a day, the rest behind "+ อีก n งาน" ---------- */
  const MONTH_CHIPS = 4;
  function monthNav(ym, T) {
    const chev = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`, cur = ym === T.slice(0, 7);
    return `<div class="week-nav" role="group" aria-label="เลือกเดือน">
        <button class="wk-btn" type="button" data-action="prev" aria-label="เดือนก่อนหน้า" title="เดือนก่อนหน้า">${chev('M15 6l-6 6 6 6')}</button>
        <div class="wk-label"><b>${esc(thMonth(ym))}</b><small>${cur ? '<span class="now">เดือนนี้</span>' : `${Math.abs((+ym.slice(0, 4) - +T.slice(0, 4)) * 12 + (+ym.slice(5) - +T.slice(5, 7)))} เดือน${ym < T ? 'ก่อน' : 'ข้างหน้า'}`}</small></div>
        <button class="wk-btn" type="button" data-action="next" aria-label="เดือนถัดไป" title="เดือนถัดไป">${chev('M9 6l6 6-6 6')}</button>
      </div>
      <button class="btn wk-today${cur ? ' is-current' : ''}" type="button" data-action="this" ${cur ? 'aria-pressed="true" title="กำลังดูเดือนนี้"' : 'title="กลับไปเดือนปัจจุบัน"'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/></svg>
        เดือนนี้</button>`;
  }
  function monthChip(p, T, canEdit) {
    const late = isLate(p, T), s = statusInfo(p.status);
    return `<article class="cal-card mchip st-${esc(p.status)}${late ? ' late' : ''}${pick.ids.has(p.id) ? ' picked' : ''}" data-plan="${esc(p.id)}" draggable="${canEdit ? 'true' : 'false'}" ${canEdit ? 'tabindex="0" role="button"' : ''}
        data-tip="${esc(`${p.title}\n${itemLabel(p)}\nผู้รับผิดชอบ: ${peopleText(p)}\n${hoursText(p)}\nสถานะ: ${s.th}${late ? ' · เลยกำหนด' : ''}${p.reason ? ' — ' + p.reason : ''}${prepOpen(p).length ? `\nยังเตรียมไม่ครบ ${prepOpen(p).length} รายการ` : ''}`)}">${p.ruleId ? '<span class="cal-rule">🔁</span>' : ''}<span class="mchip-t">${esc(p.title)}</span>${late ? '<b class="mchip-late" title="เลยกำหนด">!</b>' : ''}</article>`;
  }
  function calendarByMonth(ym, keep, T, canEdit) {
    const first = `${ym}-01`, start = PM.monday(first), stop = PM.addDays(PM.monday(PM.monthEnd(ym)), 6);
    const rows = PM.db.plans.filter((p) => p.dueDate >= start && p.dueDate <= stop && keep(p)).sort(byDue);
    const cells = [];
    for (let d = start; d <= stop; d = PM.addDays(d, 1)) {
      const mine = rows.filter((p) => p.dueDate === d), hol = PM.holidayOf(d), wd = weekdayOf(d), more = mine.length - MONTH_CHIPS;
      cells.push(`<section class="mcal-day${d.slice(0, 7) !== ym ? ' out' : ''}${d === T ? ' today' : ''}${wd > 4 ? ' weekend' : ''}${hol ? ' hol' : ''}" data-drop-day="${d}">
        <header><span class="mcal-num">${PM.parse(d).getDate()}</span>${hol ? `<small class="mcal-hol" title="${esc(hol.name)}">${esc(hol.name)}</small>` : ''}
          ${canEdit ? `<button class="mcal-add" type="button" data-action="new-on" data-day="${d}" aria-label="เพิ่มงานวันที่ ${U.date(d)}">＋</button>` : ''}</header>
        <div class="mcal-list">${mine.slice(0, more > 0 ? MONTH_CHIPS - 1 : MONTH_CHIPS).map((p) => monthChip(p, T, canEdit)).join('')}
          ${more > 0 ? `<button type="button" class="mcal-more" data-action="day-more" data-day="${d}">+ อีก ${more + 1} งาน</button>` : ''}</div>
        ${mine.length ? `<span class="mcal-n" aria-hidden="true">${mine.length}${mine.some((p) => isLate(p, T)) ? ' !' : ''}</span>` : ''}
      </section>`);
    }
    return `<div class="mcal"><div class="mcal-heads">${WEEKDAYS.map((w) => `<b>${w}</b>`).join('')}</div><div class="mcal-grid">${cells.join('')}</div></div>
      <div class="mcal-legend">${PM.PLAN_STATUS.map((s) => `<span><i class="st-${s.key}"></i>${esc(s.th)}</span>`).join('')}<span><b class="mchip-late">!</b>เลยกำหนด</span></div>`;
  }
  /* every task of one day: the way in when a day has more than fits, and on phones */
  function dayDialog(d, ctx, done) {
    const T = ctx.T, canEdit = PM.can('plan.edit'), tasks = PM.db.plans.filter((p) => p.dueDate === d && ctx.full(p)).sort(byDue);
    const hol = PM.holidayOf(d);
    const form = U.modal({
      title: thDay(d),
      body: `${hol ? `<p class="full muted" style="margin:0">วันหยุด: ${esc(hol.name)}</p>` : ''}
        <div class="full day-list">${tasks.map((p) => { const s = statusInfo(p.status); return `<${canEdit ? 'button type="button"' : 'div'} class="day-item st-${esc(p.status)}" data-open-plan="${esc(p.id)}"><span><b>${p.ruleId ? '🔁 ' : ''}${esc(p.title)}</b><small>${esc(itemLabel(p))} · ${esc(peopleText(p))} · ${esc(hoursText(p))}</small></span><span class="day-st">${isLate(p, T) ? U.badge('critical', 'เลยกำหนด') : ''}${U.badge(s.level, s.th)}</span></${canEdit ? 'button' : 'div'}>`; }).join('') || '<p class="empty">ไม่มีงานในวันนี้</p>'}</div>
        ${canEdit ? `<div class="full"><button type="button" class="btn sm" data-day-add>+ เพิ่มงานวันนี้</button></div>` : ''}`,
    });
    form.addEventListener('click', (e) => {
      const it = e.target.closest('button[data-open-plan]');
      if (it) { U.closeModal(); planForm(PM.find('plans', it.dataset.openPlan), done); return; }
      if (e.target.closest('[data-day-add]')) { U.closeModal(); planForm(null, done, { dueDate: d, resourceIds: state.person ? [state.person] : null }); }
    });
  }

  /* ---------- calendar views ---------- */
  const weekDays = (week) => [0, 1, 2, 3, 4, 5, 6].map((i) => PM.addDays(week, i));
  const firstName = (id) => U.resourceName(id).split(/\s+/)[0];

  function calCard(p, T, canEdit, canStatus, mini) {
    const s = statusInfo(p.status);
    const late = p.status !== 'done' && p.status !== 'not_done' && p.dueDate < T;
    const n = headcount(p);
    const tip = `${p.title}\n${itemLabel(p)}\nผู้รับผิดชอบ: ${peopleText(p)}\n${U.num(p.plannedHours, 1)} h${n > 1 ? ` / คน × ${n} คน = ${U.num(manHours(p), 1)} h` : ''}${p.qtyPlan ? `\nปริมาณ ${U.num(p.qtyDone || 0)} / ${U.num(p.qtyPlan)}` : ''}\nสถานะ: ${s.th}${p.reason ? ' — ' + p.reason : ''}\nสร้างโดย: ${creatorText(p)}`;
    const open = prepOpen(p).length;
    return `<article class="cal-card st-${esc(p.status)}${mini ? ' mini' : ''}${late ? ' late' : ''}${pick.ids.has(p.id) ? ' picked' : ''}" data-plan="${esc(p.id)}"
        draggable="${canEdit ? 'true' : 'false'}" ${canEdit ? 'tabindex="0" role="button"' : ''} data-tip="${esc(tip)}${open ? `\nยังเตรียมไม่ครบ ${open} รายการ` : ''}${p.ruleId ? '\nงานประจำ' : ''}">
      ${pick.on ? `<input type="checkbox" class="pick-box" data-pick="${esc(p.id)}" aria-label="เลือก ${esc(p.title)}"${pick.ids.has(p.id) ? ' checked' : ''}>` : ''}
      <div class="cal-title">${p.ruleId ? '<span class="cal-rule" title="งานประจำ">🔁</span> ' : ''}${esc(p.title)}${open && !isClosed(p) ? ` <span class="cal-prep" title="ยังเตรียมไม่ครบ">🧰 ${open}</span>` : ''}</div>
      ${mini ? `<div class="cal-meta">${U.num(p.plannedHours, 1)} h · ${esc(s.th)}</div>` : `
      <div class="cal-meta">${esc(itemLabel(p))}</div>
      <div class="cal-foot">
        <span class="cal-who">${n > 1 ? '<i class="cal-team" aria-hidden="true">👥</i>' : ''}${esc(peopleShort(p))}</span>
        <span>${U.num(p.plannedHours, 1)} h${n > 1 ? ` × ${n}` : ''}</span>
        ${p.qtyPlan ? `<span>${U.num(p.qtyDone || 0)}/${U.num(p.qtyPlan)}</span>` : ''}
        ${late ? '<span class="cal-late">เลยกำหนด</span>' : ''}
      </div>
      ${canStatus ? `<select class="plan-st st-${esc(p.status)}" data-plan-status="${esc(p.id)}" aria-label="สถานะ">${PM.PLAN_STATUS.map((x) => `<option value="${x.key}"${x.key === p.status ? ' selected' : ''}>${esc(x.th)}</option>`).join('')}</select>` : U.badge(s.level, s.th)}
      ${p.status === 'not_done' ? `<div class="cal-ncr"><span>${esc(p.reason || 'ไม่ระบุสาเหตุ')}</span>${ncrLink(p, canStatus)}</div>` : ''}`}
    </article>`;
  }

  function dayHead(d, T) {
    const dt = PM.parse(d);
    return `<b>${esc(dayName(d))}</b><span class="cal-date">${dt.getDate()}</span><small>${esc(dt.toLocaleDateString('en-GB', { month: 'short' }))}</small>${d === T ? '<span class="chip today-chip">วันนี้</span>' : ''}`;
  }

  function calendarByDay(list, week, T, canEdit, canStatus) {
    return `<div class="cal">${weekDays(week).map((d, i) => {
      const items = list.filter((p) => p.dueDate === d);
      return `<section class="cal-day${d === T ? ' today' : ''}${i > 4 ? ' weekend' : ''}${!items.length ? ' is-empty' : ''}" data-drop-day="${d}">
        <header>
          <div class="cal-dh">${dayHead(d, T)}</div>
          <small class="cal-sum">${items.length ? `${items.length} งาน · ${U.num(PM.sum(items, manHours), 1)} h` : ''}</small>
          ${canEdit ? `<button class="icon-btn cal-add" type="button" data-action="new-on" data-day="${d}" aria-label="เพิ่มงานวันที่ ${U.date(d)}">＋</button>` : ''}
        </header>
        <div class="cal-list">${items.map((p) => calCard(p, T, canEdit, canStatus)).join('') || '<p class="cal-empty">ไม่มีงาน</p>'}</div>
      </section>`;
    }).join('')}</div>`;
  }

  function calendarByPerson(list, week, T, canEdit) {
    const days = weekDays(week);
    const withTasks = new Set(list.flatMap(PM.planPeople));
    const people = PM.db.resources.filter((r) => (r.active !== false && (!state.person || r.id === state.person)) || withTasks.has(r.id))
      .filter((r) => canEdit || withTasks.has(r.id));
    // tasks with only other departments' people (no one from the department) get a row of their own
    const outside = state.person ? [] : list.filter((p) => !PM.planPeople(p).length && PM.planGuests(p).length);
    if (!people.length && !outside.length) return '<p class="empty">ยังไม่มีงานในสัปดาห์นี้</p>';
    const outsideRow = outside.length ? `<div class="cp-who guest-row"><b>ผู้ร่วมงานนอกแผนก</b><small>${Array.from(new Set(outside.flatMap(PM.planGuests))).slice(0, 3).map(esc).join(', ')}</small></div>
      ${days.map((d, i) => `<div class="cp-cell${d === T ? ' today' : ''}${i > 4 ? ' weekend' : ''}" data-drop-day="${d}">${outside.filter((p) => p.dueDate === d).map((p) => calCard(p, T, canEdit, false, true)).join('')}</div>`).join('')}` : '';
    return `<div class="cal-people" style="--days:7">
      <div class="cp-corner">ผู้รับผิดชอบ</div>
      ${days.map((d, i) => `<div class="cp-head${d === T ? ' today' : ''}${i > 4 ? ' weekend' : ''}">${dayHead(d, T)}</div>`).join('')}
      ${people.map((r) => {
        const mine = list.filter((p) => PM.planHas(p, r.id)); // a shared task shows in every assignee's row
        const hours = PM.sum(mine, (p) => p.plannedHours || 0);
        const cap = PM.cap(r);
        return `<div class="cp-who"><b>${esc(r.name)}</b><small>${U.num(hours, 1)} / ${U.num(cap)} h${hours > cap * 1.05 ? ' · <span class="cal-late">เกิน</span>' : ''}</small></div>
          ${days.map((d, i) => `<div class="cp-cell${d === T ? ' today' : ''}${i > 4 ? ' weekend' : ''}" data-drop-day="${d}" data-drop-person="${esc(r.id)}">
            ${mine.filter((p) => p.dueDate === d).map((p) => calCard(p, T, canEdit, false, true)).join('')}
            ${canEdit ? `<button class="cp-add" type="button" data-action="new-on" data-day="${d}" data-person="${esc(r.id)}" aria-label="เพิ่มงานให้ ${esc(r.name)} วันที่ ${U.date(d)}">＋</button>` : ''}
          </div>`).join('')}`;
      }).join('')}
      ${outsideRow}
    </div>
    ${personList(list, week, T, canEdit)}`;
  }

  /* phone version of "by person": one block per person, tasks listed by day (shown via CSS ≤ 640px) */
  function personList(list, week, T, canEdit) {
    const people = PM.db.resources.filter((r) => list.some((p) => PM.planHas(p, r.id)));
    const addDay = T >= week && T <= PM.addDays(week, 6) ? T : PM.addDays(week, 4);
    return `<div class="cal-people-list">${people.map((r) => {
      const mine = list.filter((p) => PM.planHas(p, r.id)).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
      const hours = PM.sum(mine, (p) => p.plannedHours || 0), cap = PM.cap(r);
      return `<section class="cpl-person">
        <header><b>${esc(r.name)}</b><small>${U.num(hours, 1)} / ${U.num(cap)} h${hours > cap * 1.05 ? ' · <span class="cal-late">เกิน</span>' : ''}</small>
          ${canEdit ? `<button class="icon-btn cal-add" type="button" data-action="new-on" data-day="${addDay}" data-person="${esc(r.id)}" aria-label="เพิ่มงานให้ ${esc(r.name)}">＋</button>` : ''}</header>
        ${mine.map((p) => `<div class="cpl-row"><span class="cpl-day${p.dueDate === T ? ' today' : ''}">${esc(dayName(p.dueDate))}<b>${PM.parse(p.dueDate).getDate()}</b></span>${calCard(p, T, canEdit, false, true)}</div>`).join('')}
      </section>`;
    }).join('')}${(() => {
      const outside = state.person ? [] : list.filter((p) => !PM.planPeople(p).length && PM.planGuests(p).length).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
      return outside.length ? `<section class="cpl-person"><header><b>ผู้ร่วมงานนอกแผนก</b></header>
        ${outside.map((p) => `<div class="cpl-row"><span class="cpl-day${p.dueDate === T ? ' today' : ''}">${esc(dayName(p.dueDate))}<b>${PM.parse(p.dueDate).getDate()}</b></span>${calCard(p, T, canEdit, false, true)}</div>`).join('')}</section>` : '';
    })() || (people.length ? '' : '<p class="empty">ยังไม่มีงานในสัปดาห์นี้</p>')}</div>`;
  }

  function tasksTable(list, T, canEdit, canStatus) {
    if (!list.length) {
      return `<p class="empty">ยังไม่มีงานในสัปดาห์นี้${canEdit ? ' — กด "+ เพิ่มงาน" หรือ "ยกงานค้างจากสัปดาห์ก่อน"' : ''}</p>`;
    }
    return `<table class="tbl"><thead><tr>${pick.on ? '<th class="pick-col"></th>' : ''}<th>งาน</th><th>ผู้รับผิดชอบ</th><th>กำหนดเสร็จ</th><th class="num">ชั่วโมง</th><th class="num">ปริมาณ</th><th>สถานะ</th><th>ไม่เสร็จ: สาเหตุ · NCR</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>
      ${list.map((p) => {
        const s = statusInfo(p.status);
        const late = p.status !== 'done' && p.status !== 'not_done' && p.dueDate < T;
        return `<tr class="${canEdit || pick.on ? 'click' : ''}${pick.ids.has(p.id) ? ' picked' : ''}" data-plan="${esc(p.id)}">
          ${pick.on ? `<td class="pick-col"><input type="checkbox" class="pick-box" data-pick="${esc(p.id)}" aria-label="เลือก ${esc(p.title)}"${pick.ids.has(p.id) ? ' checked' : ''}></td>` : ''}
          <td><span class="title">${p.ruleId ? '🔁 ' : ''}${esc(p.title)}</span><small>${esc(itemLabel(p))}${p.carriedFrom ? ' · ยกมาจากสัปดาห์ก่อน' : ''}${prepOpen(p).length && !isClosed(p) ? ` · 🧰 ยังเตรียมไม่ครบ ${prepOpen(p).length}` : ''}</small></td>
          <td>${peopleChips(p)}</td>
          <td>${esc(dayName(p.dueDate))} ${U.date(p.dueDate)} ${late ? U.badge('critical', 'เลยกำหนด') : ''}</td>
          <td class="num">${U.num(p.plannedHours, p.plannedHours % 1 ? 1 : 0)}${headcount(p) > 1 ? `<small>× ${headcount(p)} คน = ${U.num(manHours(p), 1)}</small>` : ''}</td>
          <td class="num">${p.qtyPlan ? `${U.num(p.qtyDone || 0)} / ${U.num(p.qtyPlan)}` : '–'}</td>
          <td>${canStatus
            ? `<select class="plan-st st-${esc(p.status)}" data-plan-status="${esc(p.id)}" aria-label="สถานะ">${PM.PLAN_STATUS.map((x) => `<option value="${x.key}"${x.key === p.status ? ' selected' : ''}>${esc(x.th)}</option>`).join('')}</select>`
            : U.badge(s.level, s.th)}</td>
          <td>${p.status === 'not_done' ? `<span class="nd-reason">${esc(p.reason || 'ไม่ระบุ')}</span> ${ncrLink(p, canStatus)}` : '–'}</td>
          ${canEdit ? `<td><button class="btn sm" data-action="edit" data-id="${esc(p.id)}">แก้ไข</button></td>` : ''}
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  function teamTable(loading) {
    if (!loading.length) return '<p class="empty">ยังไม่มีรายชื่อพนักงาน</p>';
    const rows = loading.slice().sort((a, b) => (b.cap ? b.planned / b.cap : 0) - (a.cap ? a.planned / a.cap : 0));
    return `<table class="tbl"><thead><tr><th>พนักงาน</th><th class="num">งาน (เสร็จ/ทั้งหมด)</th><th style="min-width:170px">ชั่วโมงตามแผน / capacity</th><th class="num">Timesheet จริง</th><th>สถานะ</th></tr></thead><tbody>
      ${rows.map((x) => {
        const u = x.cap ? x.planned / x.cap : null;
        const st = !x.mine.length ? ['neutral', 'ยังไม่มีแผน'] : u > 1.05 ? ['critical', 'เกิน capacity'] : u >= 0.7 ? ['good', 'เหมาะสม'] : ['warning', 'งานน้อย'];
        return `<tr class="click" data-person="${esc(x.r.id)}">
          <td><span class="title">${esc(x.r.name)}</span><small>${esc(PM.levelName(x.r.level))} · ${esc(x.r.discipline)}</small></td>
          <td class="num">${x.done} / ${x.mine.length}</td>
          <td><div class="pbar-wrap">${U.progress(Math.min(1, u || 0), null, `${x.r.name}\nPlanned ${U.num(x.planned)} h / capacity ${U.num(x.cap)} h`)}<span class="num">${U.num(x.planned)}/${U.num(x.cap)}</span></div></td>
          <td class="num">${U.num(x.actual, 1)} h</td>
          <td>${U.badge(st[0], st[1])}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  function workItemSelect(value) {
    const db = PM.db;
    const projects = db.projects.filter((p) => p.status !== 'closed' || value === 'project|' + p.id);
    const bids = db.bids.filter((b) => b.result === 'pending' || value === 'bid|' + b.id);
    const opt = (v, label) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(label)}</option>`;
    return `<select name="item" required>
      <optgroup label="Projects (EPC)">${projects.map((p) => opt('project|' + p.id, `${p.code} · ${p.name}`)).join('')}</optgroup>
      <optgroup label="Bidding">${bids.map((b) => opt('bid|' + b.id, `${PM.dash(b.code)} · ${PM.dash(b.name)}`)).join('')}</optgroup>
      <optgroup label="Overhead">${PM.OVERHEAD.filter((o) => o.id !== 'leave').map((o) => opt('overhead|' + o.id, o.label)).join('')}</optgroup>
    </select>`;
  }

  /* who is on a task (Weekly Plan task and recurring task): ticked names + typed names from other departments as chips (✕ to remove) ·
     the box searches the department list; a name that is not in it can be added as "นอกแผนก" (Enter or the button) */
  const peopleField = (people, chosen) => `<div class="full pp" data-pp>
          <div class="pp-h"><span>ผู้รับผิดชอบ</span><small class="muted">เลือกได้หลายคน · คนแผนกอื่นพิมพ์ชื่อแล้วกด Enter</small></div>
          <div class="pp-chips" data-pp-chips aria-live="polite"></div>
          <div class="pp-qrow">
            <input type="search" class="pp-q" list="dl-plan-guests" placeholder="ค้นหาชื่อในแผนก หรือพิมพ์ชื่อคนแผนกอื่น เช่น สมศรี (จัดซื้อ)" aria-label="ค้นหาหรือเพิ่มผู้รับผิดชอบ">
            <button type="button" class="btn sm" data-pp-guest hidden></button>
          </div>
          <datalist id="dl-plan-guests">${Array.from(new Set(PM.db.plans.flatMap(PM.planGuests))).sort().map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
          <div class="pp-list" role="group" aria-label="รายชื่อพนักงาน">${people.map((r) => `<label class="pp-opt" data-text="${esc([r.name, PM.levelName(r.level), r.discipline].join(' ').toLowerCase())}">
            <input type="checkbox" value="${esc(r.id)}"${chosen.has(r.id) ? ' checked' : ''}><span><b>${esc(r.name)}</b><small>${esc(PM.levelName(r.level))}${r.discipline ? ' · ' + esc(r.discipline) : ''}</small></span><em class="pp-load" data-load="${esc(r.id)}"></em></label>`).join('')}</div>
        </div>`;
  function bindPeople(form, guests, onDraw) {
    const pp = form.querySelector('[data-pp]'), chips = pp.querySelector('[data-pp-chips]'), q = pp.querySelector('.pp-q'), addBtn = pp.querySelector('[data-pp-guest]');
    const drawPeople = () => {
      const on = Array.from(pp.querySelectorAll('.pp-list input:checked'));
      chips.innerHTML = on.length || guests.length
        ? on.map((i) => `<span class="who-chip">${esc(U.resourceName(i.value))}<button type="button" data-pp-drop="${esc(i.value)}" aria-label="เอา ${esc(U.resourceName(i.value))} ออก">✕</button></span>`).join('')
          + guests.map((g, k) => `<span class="who-chip guest">${esc(g)}<em>นอกแผนก</em><button type="button" data-pp-unguest="${k}" aria-label="เอา ${esc(g)} ออก">✕</button></span>`).join('')
        : '<span class="muted">ยังไม่ได้เลือก — ติ๊กชื่อด้านล่าง หรือพิมพ์ชื่อคนแผนกอื่น</span>';
      pp.querySelectorAll('.pp-opt').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked));
      if (onDraw) onDraw(pp, on.length + guests.length);
    };
    const filterList = () => {
      const raw = q.value.trim(), w = raw.toLowerCase();
      let shown = 0;
      pp.querySelectorAll('.pp-opt').forEach((l) => { l.hidden = !!w && !l.dataset.text.includes(w); if (!l.hidden) shown++; });
      // a typed name that is not one of the department → offer it as a person from another department
      const exact = Array.from(pp.querySelectorAll('.pp-opt')).some((l) => l.querySelector('b').textContent.trim().toLowerCase() === w);
      addBtn.hidden = !raw || exact || guests.includes(raw);
      addBtn.textContent = `+ เพิ่ม "${raw}" (นอกแผนก)`;
      return shown;
    };
    const addGuest = () => {
      const name = q.value.trim().replace(/\s+/g, ' ');
      if (!name || guests.includes(name)) return;
      guests.push(name);
      q.value = '';
      filterList();
      drawPeople();
      q.focus();
    };
    pp.addEventListener('change', drawPeople);
    chips.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pp-drop]'), g = e.target.closest('[data-pp-unguest]');
      if (g) { guests.splice(+g.dataset.ppUnguest, 1); filterList(); drawPeople(); return; }
      if (!b) return;
      const box = pp.querySelector(`.pp-list input[value="${CSS.escape(b.dataset.ppDrop)}"]`);
      if (box) { box.checked = false; drawPeople(); }
    });
    q.addEventListener('input', filterList);
    addBtn.addEventListener('click', addGuest);
    q.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault(); // Enter in this box never submits the form
      if (!q.value.trim()) return;
      const visible = Array.from(pp.querySelectorAll('.pp-opt')).filter((l) => !l.hidden);
      // matches someone in the department → tick them (only when it is clear who); no match → another department's person
      if (visible.length === 1) { const box = visible[0].querySelector('input'); box.checked = true; q.value = ''; filterList(); drawPeople(); }
      else if (!visible.length) addGuest();
    });
    filterList();
    return { draw: drawPeople };
  }

  /* what a task needs before it can start: rows in the task form */
  const prepRow = (x = {}) => `<div class="prep-row">
      <select data-k="type" aria-label="ประเภท">${U.options(PREP_TYPES, x.type || PREP_TYPES[0])}</select>
      <input data-k="text" value="${esc(x.text || '')}" placeholder="ต้องเตรียมอะไร เช่น ท่อ 2 นิ้ว 20 เส้น" aria-label="รายการ">
      <input data-k="owner" list="dl-prep-people" value="${esc(x.owner || '')}" placeholder="ผู้รับผิดชอบ" aria-label="ผู้รับผิดชอบ" autocomplete="off">
      <input data-k="due" type="date" value="${esc(x.due || '')}" aria-label="ต้องพร้อมภายใน">
      <label class="prep-ok"><input data-k="done" type="checkbox"${x.done ? ' checked' : ''}> พร้อม</label>
      <button type="button" class="icon-btn" data-prep-drop aria-label="เอาออก">✕</button>
    </div>`;
  const readPrep = (form) => Array.from(form.querySelectorAll('.prep-row')).map((row) => {
    const v = (k) => row.querySelector(`[data-k="${k}"]`);
    return { type: v('type').value, text: v('text').value.trim(), owner: v('owner').value.trim(), due: v('due').value, done: v('done').checked };
  }).filter((x) => x.text);

  function planForm(plan, done, defaults) {
    const isNew = !plan;
    const firstProject = PM.db.projects.find((p) => p.status !== 'closed');
    const x = plan || Object.assign({
      id: PM.uid('W'), week: state.week, kind: 'project',
      refId: state.project && !state.project.startsWith('__') ? state.project : firstProject ? firstProject.id : '',
      phase: 'construction', title: '', resourceId: state.person || '', plannedHours: 8,
      dueDate: PM.addDays(state.week, 4), qtyPlan: 0, qtyDone: 0, status: 'planned', reason: '', note: '', carriedFrom: null,
    }, creatorStamp(), Object.fromEntries(Object.entries(defaults || {}).filter(([, v]) => v)));
    const chosen = new Set(isNew && defaults && defaults.resourceIds ? defaults.resourceIds : PM.planPeople(x).length ? PM.planPeople(x) : state.person ? [state.person] : []);
    const people = PM.db.resources.filter((r) => r.active !== false || chosen.has(r.id));
    const canDelete = !isNew && PM.canDeletePlan(x);
    const rule = !isNew && x.ruleId ? PM.find('planrules', x.ruleId) : null;
    const form = U.modal({
      title: isNew ? 'เพิ่มงานใน Weekly Plan' : x.title, wide: true,
      onDelete: canDelete ? () => {
        if (!PM.canDeletePlan(x)) { U.toast('ลบได้เฉพาะผู้สร้างงาน'); return; }
        removePlan(x); PM.save(); U.toast('ลบงานแล้ว'); done();
      } : null,
      body: `
        ${isNew ? '' : `<p class="full plan-owner">สร้างโดย <b>${esc(creatorText(x))}</b>${canDelete ? '' : ` · <span class="muted">${x.createdBy ? 'ลบได้เฉพาะผู้สร้างงานนี้' : 'งานเดิมไม่มีข้อมูลผู้สร้าง — ลบได้เฉพาะ Admin'}</span>`} <button type="button" class="btn sm" data-plan-dup title="เปิดฟอร์มงานใหม่ด้วยข้อมูลเดิม กำหนดเสร็จอีก 7 วัน">ทำซ้ำสัปดาห์หน้า</button>${x.ruleId ? '' : ' <button type="button" class="btn sm" data-plan-rule>🔁 ตั้งเป็นงานประจำ</button>'}</p>`}
        ${rule ? `<p class="full callout rule-note">🔁 งานนี้สร้างจากงานประจำ — แก้ที่นี่มีผลเฉพาะครั้งนี้ <button type="button" class="link-btn" data-open-rule>แก้งานประจำทุกครั้ง</button></p>` : ''}
        ${U.field('งาน / กิจกรรม', 'title', x.title, { required: true, full: true, placeholder: 'เช่น Install cable tray – Area A' })}
        <label><span>Work item (โครงการ / bid)</span>${workItemSelect(x.kind + '|' + x.refId)}</label>
        ${U.field('Phase', 'phase', x.phase || 'construction', { options: PM.PHASES.map((p) => ({ value: p.key, label: p.label })) })}
        ${peopleField(people, chosen)}
        ${U.field('ชั่วโมงตามแผน (ต่อคน)', 'plannedHours', x.plannedHours, { type: 'number', min: 0, step: 0.5, hint: ' ' })}
        ${U.field('กำหนดเสร็จ', 'dueDate', x.dueDate, { type: 'date', required: true, hint: 'สัปดาห์ของงานคำนวณจากวันนี้' })}
        ${U.field('ปริมาณตามแผน', 'qtyPlan', x.qtyPlan, { type: 'number', min: 0, step: 'any' })}
        ${U.field('ทำได้จริง', 'qtyDone', x.qtyDone, { type: 'number', min: 0, step: 'any' })}
        ${U.field('สถานะ', 'status', x.status, { options: PM.PLAN_STATUS.map((s) => ({ value: s.key, label: `${s.th} (${s.label})` })) })}
        ${U.field('สาเหตุ (ถ้าไม่เสร็จ)', 'reason', x.reason, { options: PM.PLAN_REASONS, placeholder: '—' })}
        ${U.field('หมายเหตุ', 'note', x.note, { type: 'textarea', full: true, rows: 2 })}
        <div class="full prep"><div class="pp-h"><span>สิ่งที่ต้องเตรียมก่อนเริ่มงาน</span><small class="muted">วัสดุ · แบบ · คน · เครื่องมือ · ใบอนุญาต — ดูรวมได้ที่มุมมองล่วงหน้า ${LOOK_WEEKS} สัปดาห์</small></div>
          <div data-prep-rows>${prepOf(x).map(prepRow).join('')}</div>
          <datalist id="dl-prep-people">${PM.db.resources.filter((r) => r.active !== false).map((r) => `<option value="${esc(r.name)}">`).join('')}</datalist>
          <button type="button" class="btn sm" data-prep-add>+ เพิ่มรายการ</button></div>`,
      onSubmit: (f, frm) => {
        const [kind, refId] = (f.item || '').split('|');
        const ids = Array.from(frm.querySelectorAll('.pp-list input:checked')).map((i) => i.value);
        if (!refId) { U.alert('กรุณาเลือก Work item'); return false; }
        if (!ids.length && !guests.length) { U.alert('กรุณาเลือกผู้รับผิดชอบอย่างน้อย 1 คน (คนในแผนก หรือพิมพ์ชื่อคนแผนกอื่น)').then(() => frm.querySelector('.pp-q').focus()); return false; }
        // newly "ไม่เสร็จ" → save the rest first, then the NCR form takes the reason and sets the status
        const toNcr = f.status === 'not_done' && x.status !== 'not_done';
        if (f.status === 'not_done' && !toNcr && !f.reason) { U.alert('งานที่ไม่เสร็จ กรุณาเลือกสาเหตุ'); return false; }
        Object.assign(x, {
          title: f.title, kind, refId, phase: kind === 'project' ? f.phase : '',
          resourceIds: ids, resourceId: ids[0] || '', // resourceId = first person, for older data / pages that read one
          guests: guests.slice(), // other departments (typed names)
          plannedHours: f.plannedHours, dueDate: f.dueDate, week: PM.monday(f.dueDate),
          qtyPlan: f.qtyPlan, qtyDone: f.qtyDone, status: toNcr ? x.status : f.status,
          reason: f.status === 'not_done' && !toNcr ? f.reason : '', note: f.note, prep: readPrep(frm),
        });
        if (x.ruleId) x.ruleEdited = true; // edited by hand: a change to the recurring rule leaves it alone
        delete x.unit; // the unit field was removed from Weekly Plan
        PM.upsert('plans', x);
        done();
        if (toNcr) { setTimeout(() => notDone(x, done, { reason: f.reason }), 220); return; } // after this form has closed
        U.toast(x.week === state.week ? 'บันทึกแล้ว' : `บันทึกแล้ว — ย้ายไปสัปดาห์ ${U.date(x.week)}`);
      },
    });
    const item = form.querySelector('[name=item]'), phase = form.querySelector('[name=phase]');
    const sync = () => { phase.disabled = !item.value.startsWith('project|'); };
    item.addEventListener('change', sync);
    sync();

    const guests = PM.planGuests(x).slice();
    const hoursHint = form.plannedHours.parentElement.querySelector('small');
    const picker = bindPeople(form, guests, (pp, n) => {
      const h = Number(form.plannedHours.value) || 0;
      if (hoursHint) hoursHint.textContent = n > 1 ? `รวม ${U.num(h * n, 1)} ชั่วโมงคน (${n} คน × ${U.num(h, 1)} h)` : 'ชั่วโมงที่แต่ละคนใช้กับงานนี้';
      // each person's planned hours in the task's week (this task included once they are ticked) against their capacity
      const wk = form.dueDate.value ? PM.monday(form.dueDate.value) : x.week;
      const weekPlans = PM.db.plans.filter((y) => y.week === wk && y.id !== x.id);
      pp.querySelectorAll('.pp-load').forEach((m) => {
        const id = m.dataset.load, r = PM.find('resources', id), box = pp.querySelector(`.pp-list input[value="${CSS.escape(id)}"]`);
        const planned = PM.sum(weekPlans.filter((y) => PM.planHas(y, id)), (y) => y.plannedHours || 0) + (box && box.checked ? h : 0);
        const cap = r ? PM.cap(r) : 0;
        m.textContent = cap ? `${U.num(planned, planned % 1 ? 1 : 0)}/${U.num(cap)} ชม.` : `${U.num(planned, planned % 1 ? 1 : 0)} ชม.`;
        m.classList.toggle('over', !!cap && planned > cap);
        m.title = cap && planned > cap ? 'เกิน capacity ของสัปดาห์นี้' : 'ชั่วโมงตามแผนของสัปดาห์นี้ / capacity';
      });
    });
    form.plannedHours.addEventListener('input', picker.draw);
    form.dueDate.addEventListener('change', picker.draw);
    const rowsBox = form.querySelector('[data-prep-rows]');
    form.querySelector('[data-prep-add]').addEventListener('click', () => {
      rowsBox.insertAdjacentHTML('beforeend', prepRow());
      rowsBox.lastElementChild.querySelector('[data-k="text"]').focus();
    });
    rowsBox.addEventListener('click', (e) => { const d = e.target.closest('[data-prep-drop]'); if (d) d.closest('.prep-row').remove(); });
    const toRule = form.querySelector('[data-plan-rule]');
    if (toRule) toRule.addEventListener('click', () => {
      U.closeModal();
      ruleForm(null, done, { title: x.title, kind: x.kind, refId: x.refId, phase: x.phase, plannedHours: x.plannedHours, note: x.note, weekdays: [weekdayOf(x.dueDate)], resourceIds: PM.planPeople(x).slice(), guests: PM.planGuests(x).slice(), startDate: PM.addDays(x.dueDate, 7) });
    });
    const openRule = form.querySelector('[data-open-rule]');
    if (openRule) openRule.addEventListener('click', () => { U.closeModal(); ruleForm(rule, done); });
    const dup = form.querySelector('[data-plan-dup]');
    if (dup) dup.addEventListener('click', () => {
      U.closeModal();
      planForm(null, done, {
        title: x.title, kind: x.kind, refId: x.refId, phase: x.phase, plannedHours: x.plannedHours, qtyPlan: x.qtyPlan, note: x.note,
        dueDate: PM.addDays(x.dueDate, 7), resourceIds: PM.planPeople(x).slice(), guests: PM.planGuests(x).slice(),
        prep: prepOf(x).map((y) => Object.assign({}, y, { done: false, due: y.due ? PM.addDays(y.due, 7) : '' })),
      });
    });
    picker.draw();
  }

  /* ---------- "ไม่เสร็จ" → reason + NCR in one step ----------
     project tasks: an NCR is opened on that project (or the task's NCR is updated and reopened) and linked both ways;
     bid / overhead tasks have no project — pick one to log an NCR, or record only the reason */
  function notDone(p, done, preset) {
    const T = PM.today();
    const proj = p.kind === 'project' ? PM.find('projects', p.refId) : null;
    const old = p.ncrId ? PM.find('ncrs', p.ncrId) : null;
    const reason = (preset && preset.reason) || p.reason || '';
    const desc = old ? old.description
      : `งานในแผนสัปดาห์ไม่เสร็จตามกำหนด: ${p.title} (กำหนดเสร็จ ${U.date(p.dueDate)})${p.qtyPlan ? ` — ทำได้ ${U.num(p.qtyDone || 0)} / ${U.num(p.qtyPlan)}` : ''}`;
    const projects = PM.db.projects.filter((x) => x.status !== 'closed');
    const form = U.modal({
      title: 'งานไม่เสร็จ → บันทึก NCR', wide: true, submitLabel: old ? `บันทึก และอัปเดต ${old.no}` : proj ? 'บันทึก และเปิด NCR' : 'บันทึก',
      body: `
        <div class="full nd-head"><b>${esc(p.title)}</b><small>${esc(itemLabel(p))} · กำหนดเสร็จ ${U.date(p.dueDate)} · ผู้รับผิดชอบ ${esc(peopleText(p))}</small></div>
        ${U.field('สาเหตุที่ไม่เสร็จ', 'reason', reason, { options: PM.PLAN_REASONS, placeholder: '— เลือกสาเหตุ —', required: true })}
        ${proj ? `<div class="nd-proj"><span>NCR ของโครงการ</span><b>${esc(proj.code)} · ${esc(proj.name)}</b><small>${old ? `อัปเดต ${esc(old.no)}${old.status === 'closed' ? ' (เปิดใหม่)' : ''}` : `จะสร้าง ${esc(PM.nextNcrNo(proj))} · สถานะ Open`}</small></div>`
          : U.field('บันทึก NCR ของโครงการ', 'project', old ? old.projectId : '', { options: projects.map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` })), placeholder: '— ไม่บันทึก NCR (งาน Bid / Overhead) —' })}
        ${U.field('ความรุนแรง', 'severity', old ? old.severity : 'Minor', { options: PM.SEVERITY })}
        ${U.field('หมวด NCR', 'category', old ? old.category : PM.REASON_NCR_CATEGORY[reason] || 'Method', { options: PM.NCR_CATEGORIES })}
        ${U.field('ผู้รับผิดชอบแก้ไข', 'responsible', old ? old.responsible : peopleText(p), { full: true })}
        ${U.field('รายละเอียดปัญหา', 'description', desc, { type: 'textarea', full: true, rows: 3 })}
        ${U.field('การแก้ไข / แผนรองรับ (Corrective action)', 'action', old ? old.action : '', { type: 'textarea', full: true, rows: 2, placeholder: 'เช่น ยกงานไปสัปดาห์หน้า · เร่งจัดหาวัสดุ · เพิ่มคน' })}
        <p class="full muted" style="margin:0">ดู / ปิด NCR ได้ที่หน้าโครงการ → Quality · NCR · ถ้ากดยกเลิก สถานะงานจะไม่เปลี่ยน</p>`,
      onSubmit: (f) => {
        if (!f.reason) { U.alert('กรุณาเลือกสาเหตุที่งานไม่เสร็จ'); return false; }
        const pj = proj || (f.project ? PM.find('projects', f.project) : null);
        p.status = 'not_done';
        p.reason = f.reason;
        let ncr = null;
        if (pj) {
          ncr = old && old.projectId === pj.id ? old : {
            id: PM.uid('N'), projectId: pj.id, no: PM.nextNcrNo(pj), date: T,
            phase: p.kind === 'project' && p.phase ? p.phase : (PM.projectMetrics(pj).current || {}).key || 'construction',
          };
          Object.assign(ncr, {
            category: f.category, severity: f.severity, responsible: f.responsible, description: f.description, action: f.action,
            status: 'open', closedDate: '', planId: p.id, source: 'weekly-plan',
          });
          PM.upsert('ncrs', ncr);
          p.ncrId = ncr.id;
        }
        PM.upsert('plans', p);
        U.toast(ncr ? `บันทึกงานไม่เสร็จ · ${ncr === old ? 'อัปเดต' : 'เปิด'} ${ncr.no} แล้ว` : 'บันทึกงานไม่เสร็จแล้ว (ไม่ได้บันทึก NCR)', 3500);
        done();
      },
    });
    // the reason suggests the NCR category (until the category is picked by hand)
    let picked = !!old;
    form.category.addEventListener('change', () => { picked = true; });
    form.reason.addEventListener('change', () => { if (!picked && PM.REASON_NCR_CATEGORY[form.reason.value]) form.category.value = PM.REASON_NCR_CATEGORY[form.reason.value]; });
  }
  const ncrLink = (p, canStatus) => {
    const n = p.ncrId && PM.find('ncrs', p.ncrId);
    if (n) return `<a class="ncr-link ${n.status === 'open' ? 'open' : ''}" href="#/projects/${esc(n.projectId)}/quality" title="เปิด ${esc(n.no)} (${n.status === 'open' ? 'Open' : 'Closed'})">${esc(n.no)}</a>`;
    return canStatus ? `<button type="button" class="link-btn ncr-add" data-action="ncr" data-id="${esc(p.id)}">+ บันทึก NCR</button>` : '';
  };

  async function carryOver(done) {
    const prev = PM.addDays(state.week, -7);
    const already = new Set(PM.db.plans.filter((p) => p.week === state.week && p.carriedFrom).map((p) => p.carriedFrom));
    const open = PM.db.plans.filter((p) => p.week === prev && p.status !== 'done' && !already.has(p.id) && !p.ruleId); // a recurring task comes round by itself
    if (!open.length) { U.toast('ไม่มีงานค้างจากสัปดาห์ก่อน'); return; }
    if (!(await U.confirm(`ยกงานที่ยังไม่เสร็จ ${open.length} งาน จากสัปดาห์ ${U.date(prev)} มาไว้สัปดาห์นี้?`, { title: 'ยกงานค้างมาสัปดาห์นี้', ok: 'ยกมา' }))) return;
    open.forEach((p) => {
      PM.db.plans.push(Object.assign({}, p, {
        id: PM.uid('W'), week: state.week, dueDate: PM.addDays(p.dueDate, 7),
        qtyPlan: Math.max(0, (p.qtyPlan || 0) - (p.qtyDone || 0)), qtyDone: 0,
        status: 'planned', reason: '', carriedFrom: p.id, resourceIds: PM.planPeople(p).slice(), guests: PM.planGuests(p).slice(), ncrId: null,
      }, creatorStamp())); // the person who carries a task over creates (and may delete) the copy
    });
    PM.save();
    U.toast(`ยกมา ${open.length} งาน`);
    done();
  }
})();
