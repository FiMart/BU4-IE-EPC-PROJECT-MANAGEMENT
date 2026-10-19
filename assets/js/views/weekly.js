/* weekly.js — Weekly Plan: plan tasks for the week, track status, PPC (Percent Plan Complete), team loading */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  // the week always opens on the current one; filters and view are remembered
  const state = U.keep('weekly', { week: null, project: '', person: '', mode: 'calendar', group: 'day' }, ['project', 'person', 'mode', 'group']);
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
    if (p.kind === 'bid') { const b = PM.find('bids', p.refId); return b ? `${b.code} · Bidding` : 'Bid (ลบแล้ว)'; }
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
    const weekAll = db.plans.filter((p) => p.week === week);
    const list = weekAll.filter(match).sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.title.localeCompare(b.title)));
    const st = PM.planStats(list);

    const reasons = {};
    list.filter((p) => p.status === 'not_done').forEach((p) => { const k = p.reason || 'ไม่ระบุ'; reasons[k] = (reasons[k] || 0) + 1; });
    const topReason = Object.keys(reasons).sort((a, b) => reasons[b] - reasons[a])[0];

    // team loading: every task of the person this week (regardless of the work-item filter)
    const people = db.resources.filter((r) => r.active !== false);
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
        ${V.weekNav(week)}
        <span class="spacer"></span>
        ${canEdit ? `<button class="btn" data-action="carry">ยกงานค้างจากสัปดาห์ก่อน</button>
          <button class="btn primary fab" data-action="new" aria-label="เพิ่มงาน"><span class="fab-i">+</span><span class="fab-t">เพิ่มงาน</span></button>` : ''}
      </div>
      <div class="row">
        <select id="wp-project" aria-label="Filter work item">
          <option value="">ทุกโครงการ / งาน</option>
          <optgroup label="Projects">${projects.map((p) => `<option value="${esc(p.id)}"${state.project === p.id ? ' selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</optgroup>
          <option value="__bids"${state.project === '__bids' ? ' selected' : ''}>Bidding (ทุก bid)</option>
          <option value="__overhead"${state.project === '__overhead' ? ' selected' : ''}>Overhead</option>
        </select>
        <select id="wp-person" aria-label="Filter person">${U.options(people.map((r) => ({ value: r.id, label: r.name })), state.person, 'ทุกคน')}</select>
        ${V.seg('mode', [{ key: 'calendar', label: 'ปฏิทิน' }, { key: 'tasks', label: 'รายการงาน' }, { key: 'team', label: 'ภาระงานรายคน' }], state.mode)}
        ${state.mode === 'calendar' ? V.seg('group', [{ key: 'day', label: 'รายวัน' }, { key: 'person', label: 'แยกตามคน' }], state.group) : ''}
      </div>
      <div class="grid cols-5">
        ${V.tile({ label: 'งานในแผน', tag: 'Tasks', value: st.total, sub: `${st.planned} planned · ${st.inProgress} กำลังทำ` })}
        ${V.tile({ label: 'เสร็จแล้ว', tag: 'Done', value: st.done, sub: st.notDone ? U.badge('critical', `${st.notDone} ไม่เสร็จ`) : U.badge('good', 'ไม่มีงานค้าง') })}
        ${V.tile({ label: 'PPC', tag: 'Plan complete', value: U.pct(st.ppc), sub: U.badge(ppcLevel(st.ppc), `เป้าหมาย ${U.pct(PPC_TARGET)}`), tip: 'PPC (Percent Plan Complete) = งานที่เสร็จ ÷ งานทั้งหมดในแผนสัปดาห์' })}
        ${V.tile({ label: 'ชั่วโมงตามแผน', tag: 'Hours', value: `${U.num(st.hours)} <small>h</small>`, sub: `ทีมใช้ ${U.pct(teamCap ? teamPlanned / teamCap : null)} ของ capacity` })}
        ${V.tile({ label: 'สาเหตุหลักที่ไม่เสร็จ', value: st.notDone ? `${reasons[topReason]} <small>งาน</small>` : '–', sub: topReason ? esc(topReason) : 'ยังไม่มี' })}
      </div>
      <div class="card">
        <div class="card-h"><h2>${{ calendar: 'ปฏิทินงานประจำสัปดาห์', tasks: 'งานประจำสัปดาห์', team: 'ภาระงานรายคน' }[state.mode]}</h2>
          <p>${state.mode === 'calendar'
            ? (canEdit ? 'ลากการ์ดไปวันอื่นเพื่อเลื่อนกำหนด' + (state.group === 'person' ? ' หรือไปแถวคนอื่นเพื่อเปลี่ยนผู้รับผิดชอบ' : '') + ' · กด ＋ เพื่อเพิ่มงานในวันนั้น · คลิกการ์ดเพื่อแก้ไข' : 'อัปเดตสถานะได้จากการ์ด')
            : state.mode === 'tasks'
              ? (canStatus ? 'อัปเดตสถานะได้ทันทีจากตาราง' : '') + (canEdit ? ' · คลิกที่งานเพื่อแก้ไขรายละเอียด' : '')
              : 'ชั่วโมงตามแผนเทียบกับ capacity (หักวันลา) และชั่วโมงจริงจาก Timesheet · คลิกชื่อเพื่อดูงานของคนนั้น'}</p></div>
        ${state.mode === 'calendar'
          ? `<div class="card-b cal-wrap">${state.group === 'person' ? calendarByPerson(list, week, T, canEdit) : calendarByDay(list, week, T, canEdit, canStatus)}</div>`
          : `<div class="card-b flush table-wrap">${state.mode === 'tasks' ? tasksTable(list, T, canEdit, canStatus) : teamTable(loading)}</div>`}
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
    el.onchange = (e) => {
      const t = e.target;
      if (t.id === 'wp-project') { state.project = t.value; rerender(); return; }
      if (t.id === 'wp-person') { state.person = t.value; rerender(); return; }
      if (t.dataset.planStatus) {
        const p = findPlan(t.dataset.planStatus);
        if (!p || !PM.can('plan.status')) return;
        // "ไม่เสร็จ" goes straight to the NCR form (reason + NCR in one step) — the status changes only when it is saved
        if (t.value === 'not_done' && p.status !== 'not_done') { rerender(); notDone(p, rerender); return; }
        const ncr = p.status === 'not_done' && p.ncrId && PM.find('ncrs', p.ncrId);
        p.status = t.value;
        if (p.status !== 'not_done') p.reason = '';
        if (p.status === 'done' && p.qtyPlan && (p.qtyDone || 0) < p.qtyPlan) p.qtyDone = p.qtyPlan;
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
      if (seg) { state[seg.dataset.seg] = seg.dataset.val; rerender(); return; }
      if (e.target.closest('select, input, a[href]')) return; // the NCR link opens the project's Quality tab
      const ncrBtn = e.target.closest('[data-action="ncr"]');
      if (ncrBtn) { const p = findPlan(ncrBtn.dataset.id); if (p && PM.can('plan.status')) notDone(p, rerender); return; }
      const a = e.target.closest('[data-action]');
      if (a) {
        const act = a.dataset.action;
        if (act === 'prev') { state.week = PM.addDays(state.week, -7); rerender(); }
        if (act === 'next') { state.week = PM.addDays(state.week, 7); rerender(); }
        if (act === 'this' && state.week !== PM.monday(T)) { state.week = PM.monday(T); rerender(); }
        if (act === 'new' && canEdit) planForm(null, rerender);
        if (act === 'edit' && canEdit) planForm(findPlan(a.dataset.id), rerender);
        if (act === 'carry' && canEdit) carryOver(rerender);
        if (act === 'new-on' && canEdit) { const who = a.dataset.person || state.person || ''; planForm(null, rerender, { dueDate: a.dataset.day, resourceIds: who ? [who] : null }); }
        return;
      }
      const person = e.target.closest('tr[data-person]');
      if (person) { state.person = person.dataset.person; state.mode = 'tasks'; rerender(); return; }
      const row = e.target.closest('[data-plan]');
      if (row && canEdit) planForm(findPlan(row.dataset.plan), rerender);
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

  /* ---------- calendar views ---------- */
  const weekDays = (week) => [0, 1, 2, 3, 4, 5, 6].map((i) => PM.addDays(week, i));
  const firstName = (id) => U.resourceName(id).split(/\s+/)[0];

  function calCard(p, T, canEdit, canStatus, mini) {
    const s = statusInfo(p.status);
    const late = p.status !== 'done' && p.status !== 'not_done' && p.dueDate < T;
    const n = headcount(p);
    const tip = `${p.title}\n${itemLabel(p)}\nผู้รับผิดชอบ: ${peopleText(p)}\n${U.num(p.plannedHours, 1)} h${n > 1 ? ` / คน × ${n} คน = ${U.num(manHours(p), 1)} h` : ''}${p.qtyPlan ? `\nปริมาณ ${U.num(p.qtyDone || 0)} / ${U.num(p.qtyPlan)}` : ''}\nสถานะ: ${s.th}${p.reason ? ' — ' + p.reason : ''}\nสร้างโดย: ${creatorText(p)}`;
    return `<article class="cal-card st-${esc(p.status)}${mini ? ' mini' : ''}${late ? ' late' : ''}" data-plan="${esc(p.id)}"
        draggable="${canEdit ? 'true' : 'false'}" ${canEdit ? 'tabindex="0" role="button"' : ''} data-tip="${esc(tip)}">
      <div class="cal-title">${esc(p.title)}</div>
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
    return `<table class="tbl"><thead><tr><th>งาน</th><th>ผู้รับผิดชอบ</th><th>กำหนดเสร็จ</th><th class="num">ชั่วโมง</th><th class="num">ปริมาณ</th><th>สถานะ</th><th>ไม่เสร็จ: สาเหตุ · NCR</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>
      ${list.map((p) => {
        const s = statusInfo(p.status);
        const late = p.status !== 'done' && p.status !== 'not_done' && p.dueDate < T;
        return `<tr class="${canEdit ? 'click' : ''}" data-plan="${esc(p.id)}">
          <td><span class="title">${esc(p.title)}</span><small>${esc(itemLabel(p))}${p.carriedFrom ? ' · ยกมาจากสัปดาห์ก่อน' : ''}</small></td>
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
      <optgroup label="Bidding">${bids.map((b) => opt('bid|' + b.id, `${b.code} · ${b.name}`)).join('')}</optgroup>
      <optgroup label="Overhead">${PM.OVERHEAD.filter((o) => o.id !== 'leave').map((o) => opt('overhead|' + o.id, o.label)).join('')}</optgroup>
    </select>`;
  }

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
    const form = U.modal({
      title: isNew ? 'เพิ่มงานใน Weekly Plan' : x.title, wide: true,
      onDelete: canDelete ? () => {
        if (!PM.canDeletePlan(x)) { U.toast('ลบได้เฉพาะผู้สร้างงาน'); return; }
        PM.remove('plans', x.id); U.toast('ลบงานแล้ว'); done();
      } : null,
      body: `
        ${isNew ? '' : `<p class="full plan-owner">สร้างโดย <b>${esc(creatorText(x))}</b>${canDelete ? '' : ` · <span class="muted">${x.createdBy ? 'ลบได้เฉพาะผู้สร้างงานนี้' : 'งานเดิมไม่มีข้อมูลผู้สร้าง — ลบได้เฉพาะ Admin'}</span>`}</p>`}
        ${U.field('งาน / กิจกรรม', 'title', x.title, { required: true, full: true, placeholder: 'เช่น Install cable tray – Area A' })}
        <label><span>Work item (โครงการ / bid)</span>${workItemSelect(x.kind + '|' + x.refId)}</label>
        ${U.field('Phase', 'phase', x.phase || 'construction', { options: PM.PHASES.map((p) => ({ value: p.key, label: p.label })) })}
        <div class="full pp" data-pp>
          <div class="pp-h"><span>ผู้รับผิดชอบ</span><small class="muted">เลือกได้หลายคน · คนแผนกอื่นพิมพ์ชื่อแล้วกด Enter</small></div>
          <div class="pp-chips" data-pp-chips aria-live="polite"></div>
          <div class="pp-qrow">
            <input type="search" class="pp-q" list="dl-plan-guests" placeholder="ค้นหาชื่อในแผนก หรือพิมพ์ชื่อคนแผนกอื่น เช่น สมศรี (จัดซื้อ)" aria-label="ค้นหาหรือเพิ่มผู้รับผิดชอบ">
            <button type="button" class="btn sm" data-pp-guest hidden></button>
          </div>
          <datalist id="dl-plan-guests">${Array.from(new Set(PM.db.plans.flatMap(PM.planGuests))).sort().map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
          <div class="pp-list" role="group" aria-label="รายชื่อพนักงาน">${people.map((r) => `<label class="pp-opt" data-text="${esc([r.name, PM.levelName(r.level), r.discipline].join(' ').toLowerCase())}">
            <input type="checkbox" value="${esc(r.id)}"${chosen.has(r.id) ? ' checked' : ''}><span><b>${esc(r.name)}</b><small>${esc(PM.levelName(r.level))}${r.discipline ? ' · ' + esc(r.discipline) : ''}</small></span></label>`).join('')}</div>
        </div>
        ${U.field('ชั่วโมงตามแผน (ต่อคน)', 'plannedHours', x.plannedHours, { type: 'number', min: 0, step: 0.5, hint: ' ' })}
        ${U.field('กำหนดเสร็จ', 'dueDate', x.dueDate, { type: 'date', required: true, hint: 'สัปดาห์ของงานคำนวณจากวันนี้' })}
        ${U.field('ปริมาณตามแผน', 'qtyPlan', x.qtyPlan, { type: 'number', min: 0, step: 'any' })}
        ${U.field('ทำได้จริง', 'qtyDone', x.qtyDone, { type: 'number', min: 0, step: 'any' })}
        ${U.field('สถานะ', 'status', x.status, { options: PM.PLAN_STATUS.map((s) => ({ value: s.key, label: `${s.th} (${s.label})` })) })}
        ${U.field('สาเหตุ (ถ้าไม่เสร็จ)', 'reason', x.reason, { options: PM.PLAN_REASONS, placeholder: '—' })}
        ${U.field('หมายเหตุ', 'note', x.note, { type: 'textarea', full: true, rows: 2 })}`,
      onSubmit: (f, frm) => {
        const [kind, refId] = (f.item || '').split('|');
        const ids = Array.from(frm.querySelectorAll('.pp-list input:checked')).map((i) => i.value);
        if (!refId) { alert('กรุณาเลือก Work item'); return false; }
        if (!ids.length && !guests.length) { alert('กรุณาเลือกผู้รับผิดชอบอย่างน้อย 1 คน (คนในแผนก หรือพิมพ์ชื่อคนแผนกอื่น)'); frm.querySelector('.pp-q').focus(); return false; }
        // newly "ไม่เสร็จ" → save the rest first, then the NCR form takes the reason and sets the status
        const toNcr = f.status === 'not_done' && x.status !== 'not_done';
        if (f.status === 'not_done' && !toNcr && !f.reason) { alert('งานที่ไม่เสร็จ กรุณาเลือกสาเหตุ'); return false; }
        Object.assign(x, {
          title: f.title, kind, refId, phase: kind === 'project' ? f.phase : '',
          resourceIds: ids, resourceId: ids[0] || '', // resourceId = first person, for older data / pages that read one
          guests: guests.slice(), // other departments (typed names)
          plannedHours: f.plannedHours, dueDate: f.dueDate, week: PM.monday(f.dueDate),
          qtyPlan: f.qtyPlan, qtyDone: f.qtyDone, status: toNcr ? x.status : f.status,
          reason: f.status === 'not_done' && !toNcr ? f.reason : '', note: f.note,
        });
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

    /* people picker: ticked names + typed names from other departments show as chips (✕ to remove) ·
       the box searches the department list; a name that is not in it can be added as "นอกแผนก" (Enter or the button) */
    const guests = PM.planGuests(x).slice();
    const pp = form.querySelector('[data-pp]'), chips = pp.querySelector('[data-pp-chips]'), q = pp.querySelector('.pp-q'), addBtn = pp.querySelector('[data-pp-guest]');
    const hoursHint = form.plannedHours.parentElement.querySelector('small');
    const drawPeople = () => {
      const on = Array.from(pp.querySelectorAll('.pp-list input:checked'));
      chips.innerHTML = on.length || guests.length
        ? on.map((i) => `<span class="who-chip">${esc(U.resourceName(i.value))}<button type="button" data-pp-drop="${esc(i.value)}" aria-label="เอา ${esc(U.resourceName(i.value))} ออก">✕</button></span>`).join('')
          + guests.map((g, k) => `<span class="who-chip guest">${esc(g)}<em>นอกแผนก</em><button type="button" data-pp-unguest="${k}" aria-label="เอา ${esc(g)} ออก">✕</button></span>`).join('')
        : '<span class="muted">ยังไม่ได้เลือก — ติ๊กชื่อด้านล่าง หรือพิมพ์ชื่อคนแผนกอื่น</span>';
      pp.querySelectorAll('.pp-opt').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked));
      const n = on.length + guests.length, h = Number(form.plannedHours.value) || 0;
      if (hoursHint) hoursHint.textContent = n > 1 ? `รวม ${U.num(h * n, 1)} ชั่วโมงคน (${n} คน × ${U.num(h, 1)} h)` : 'ชั่วโมงที่แต่ละคนใช้กับงานนี้';
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
    form.plannedHours.addEventListener('input', drawPeople);
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
    drawPeople();
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
        if (!f.reason) { alert('กรุณาเลือกสาเหตุที่งานไม่เสร็จ'); return false; }
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

  function carryOver(done) {
    const prev = PM.addDays(state.week, -7);
    const already = new Set(PM.db.plans.filter((p) => p.week === state.week && p.carriedFrom).map((p) => p.carriedFrom));
    const open = PM.db.plans.filter((p) => p.week === prev && p.status !== 'done' && !already.has(p.id));
    if (!open.length) { U.toast('ไม่มีงานค้างจากสัปดาห์ก่อน'); return; }
    if (!confirm(`ยกงานที่ยังไม่เสร็จ ${open.length} งาน จากสัปดาห์ ${U.date(prev)} มาไว้สัปดาห์นี้?`)) return;
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
