/* weekly.js — Weekly Plan: plan tasks for the week, track status, PPC (Percent Plan Complete), team loading */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  const state = { week: null, project: '', person: '', mode: 'calendar', group: 'day' };
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

  PM.planStats = function (list) {
    const count = (s) => list.filter((p) => p.status === s).length;
    const done = count('done');
    return {
      total: list.length, done, notDone: count('not_done'), inProgress: count('in_progress'), planned: count('planned'),
      hours: PM.sum(list, (p) => p.plannedHours || 0),
      ppc: list.length ? done / list.length : null,
    };
  };
  const ppcLevel = (v) => (v == null ? 'neutral' : v >= PPC_TARGET ? 'good' : v >= 0.6 ? 'warning' : 'critical');

  PM.views.weekly = function (el) {
    const db = PM.db, T = PM.today();
    if (!state.week) state.week = PM.monday(T);
    const week = state.week, end = PM.addDays(week, 6);
    const canEdit = PM.can('plan.edit'), canStatus = PM.can('plan.status');

    const match = (p) =>
      (!state.person || p.resourceId === state.person) &&
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
      const mine = weekAll.filter((p) => p.resourceId === r.id);
      const leave = PM.sum(ts.filter((t) => t.resourceId === r.id && t.refId === 'leave'), (t) => t.hours);
      return {
        r, mine,
        planned: PM.sum(mine, (p) => p.plannedHours || 0),
        cap: Math.max(0, (r.capacity || 40) - leave),
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
          <button class="btn primary" data-action="new">+ เพิ่มงาน</button>` : ''}
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
    PM.charts.columns(document.getElementById('c-ppc'), {
      categories: weeks.map((w) => U.date(w).slice(0, 6)), label: 'PPC by week',
      tipTitle: weeks.map((w) => { const s = PM.planStats(hist.filter((p) => p.week === w)); return `Week of ${U.date(w)} · ${s.done}/${s.total} tasks`; }),
      fmt: (v) => v + '%', axisFmt: (v) => v + '%',
      series: [{ name: 'PPC', color: 'var(--s1)', values: weeks.map((w) => { const s = PM.planStats(hist.filter((p) => p.week === w)); return s.total ? Math.round(s.ppc * 100) : 0; }) }],
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
        p.status = t.value;
        if (p.status !== 'not_done') p.reason = '';
        if (p.status === 'done' && p.qtyPlan && (p.qtyDone || 0) < p.qtyPlan) p.qtyDone = p.qtyPlan;
        PM.upsert('plans', p);
        U.toast(p.status === 'not_done' ? 'เลือกสาเหตุที่งานไม่เสร็จด้วย' : `อัปเดตเป็น ${statusInfo(p.status).label}`);
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
      if (e.target.closest('select, input')) return;
      const a = e.target.closest('[data-action]');
      if (a) {
        const act = a.dataset.action;
        if (act === 'prev') { state.week = PM.addDays(state.week, -7); rerender(); }
        if (act === 'next') { state.week = PM.addDays(state.week, 7); rerender(); }
        if (act === 'this' && state.week !== PM.monday(T)) { state.week = PM.monday(T); rerender(); }
        if (act === 'new' && canEdit) planForm(null, rerender);
        if (act === 'edit' && canEdit) planForm(findPlan(a.dataset.id), rerender);
        if (act === 'carry' && canEdit) carryOver(rerender);
        if (act === 'new-on' && canEdit) planForm(null, rerender, { dueDate: a.dataset.day, resourceId: a.dataset.person || state.person || '' });
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
      e.dataTransfer.setData('text/plain', card.dataset.plan);
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
      const p = findPlan(e.dataTransfer.getData('text/plain'));
      if (!p) return;
      const day = zone.dataset.dropDay, who = zone.dataset.dropPerson;
      if (p.dueDate === day && (!who || p.resourceId === who)) { el.ondragend(); return; }
      p.dueDate = day;
      p.week = PM.monday(day);
      if (who) p.resourceId = who;
      PM.upsert('plans', p);
      U.toast(`ย้าย "${p.title}" ไป ${dayName(day)} ${U.date(day)}${who ? ' · ' + U.resourceName(who) : ''}`);
      rerender();
    };
  };

  /* ---------- calendar views ---------- */
  const weekDays = (week) => [0, 1, 2, 3, 4, 5, 6].map((i) => PM.addDays(week, i));
  const firstName = (id) => U.resourceName(id).split(/\s+/)[0];

  function calCard(p, T, canEdit, canStatus, mini) {
    const s = statusInfo(p.status);
    const late = p.status !== 'done' && p.status !== 'not_done' && p.dueDate < T;
    const tip = `${p.title}\n${itemLabel(p)}\n${U.resourceName(p.resourceId)} · ${U.num(p.plannedHours, 1)} h${p.qtyPlan ? `\n${U.num(p.qtyDone || 0)} / ${U.num(p.qtyPlan)} ${p.unit || ''}` : ''}\nสถานะ: ${s.th}${p.reason ? ' — ' + p.reason : ''}\nสร้างโดย: ${creatorText(p)}`;
    return `<article class="cal-card st-${esc(p.status)}${mini ? ' mini' : ''}${late ? ' late' : ''}" data-plan="${esc(p.id)}"
        draggable="${canEdit ? 'true' : 'false'}" ${canEdit ? 'tabindex="0" role="button"' : ''} data-tip="${esc(tip)}">
      <div class="cal-title">${esc(p.title)}</div>
      ${mini ? `<div class="cal-meta">${U.num(p.plannedHours, 1)} h · ${esc(s.th)}</div>` : `
      <div class="cal-meta">${esc(itemLabel(p))}</div>
      <div class="cal-foot">
        <span class="cal-who">${esc(firstName(p.resourceId))}</span>
        <span>${U.num(p.plannedHours, 1)} h</span>
        ${p.qtyPlan ? `<span>${U.num(p.qtyDone || 0)}/${U.num(p.qtyPlan)} ${esc(p.unit || '')}</span>` : ''}
        ${late ? '<span class="cal-late">เลยกำหนด</span>' : ''}
      </div>
      ${canStatus ? `<select class="plan-st st-${esc(p.status)}" data-plan-status="${esc(p.id)}" aria-label="สถานะ">${PM.PLAN_STATUS.map((x) => `<option value="${x.key}"${x.key === p.status ? ' selected' : ''}>${esc(x.th)}</option>`).join('')}</select>` : U.badge(s.level, s.th)}
      ${p.status === 'not_done' && canStatus ? `<select class="plan-reason" data-plan-reason="${esc(p.id)}" aria-label="สาเหตุ">${U.options(PM.PLAN_REASONS, p.reason, '— เลือกสาเหตุ —')}</select>` : ''}`}
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
          <small class="cal-sum">${items.length ? `${items.length} งาน · ${U.num(PM.sum(items, (p) => p.plannedHours || 0), 1)} h` : ''}</small>
          ${canEdit ? `<button class="icon-btn cal-add" type="button" data-action="new-on" data-day="${d}" aria-label="เพิ่มงานวันที่ ${U.date(d)}">＋</button>` : ''}
        </header>
        <div class="cal-list">${items.map((p) => calCard(p, T, canEdit, canStatus)).join('') || '<p class="cal-empty">ไม่มีงาน</p>'}</div>
      </section>`;
    }).join('')}</div>`;
  }

  function calendarByPerson(list, week, T, canEdit) {
    const days = weekDays(week);
    const withTasks = new Set(list.map((p) => p.resourceId));
    const people = PM.db.resources.filter((r) => (r.active !== false && (!state.person || r.id === state.person)) || withTasks.has(r.id))
      .filter((r) => canEdit || withTasks.has(r.id));
    if (!people.length) return '<p class="empty">ยังไม่มีงานในสัปดาห์นี้</p>';
    return `<div class="cal-people" style="--days:7">
      <div class="cp-corner">ผู้รับผิดชอบ</div>
      ${days.map((d, i) => `<div class="cp-head${d === T ? ' today' : ''}${i > 4 ? ' weekend' : ''}">${dayHead(d, T)}</div>`).join('')}
      ${people.map((r) => {
        const mine = list.filter((p) => p.resourceId === r.id);
        const hours = PM.sum(mine, (p) => p.plannedHours || 0);
        const cap = r.capacity || 40;
        return `<div class="cp-who"><b>${esc(r.name)}</b><small>${U.num(hours, 1)} / ${U.num(cap)} h${hours > cap * 1.05 ? ' · <span class="cal-late">เกิน</span>' : ''}</small></div>
          ${days.map((d, i) => `<div class="cp-cell${d === T ? ' today' : ''}${i > 4 ? ' weekend' : ''}" data-drop-day="${d}" data-drop-person="${esc(r.id)}">
            ${mine.filter((p) => p.dueDate === d).map((p) => calCard(p, T, canEdit, false, true)).join('')}
            ${canEdit ? `<button class="cp-add" type="button" data-action="new-on" data-day="${d}" data-person="${esc(r.id)}" aria-label="เพิ่มงานให้ ${esc(r.name)} วันที่ ${U.date(d)}">＋</button>` : ''}
          </div>`).join('')}`;
      }).join('')}
    </div>
    ${personList(list, week, T, canEdit)}`;
  }

  /* phone version of "by person": one block per person, tasks listed by day (shown via CSS ≤ 640px) */
  function personList(list, week, T, canEdit) {
    const people = PM.db.resources.filter((r) => list.some((p) => p.resourceId === r.id));
    const addDay = T >= week && T <= PM.addDays(week, 6) ? T : PM.addDays(week, 4);
    return `<div class="cal-people-list">${people.map((r) => {
      const mine = list.filter((p) => p.resourceId === r.id).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
      const hours = PM.sum(mine, (p) => p.plannedHours || 0), cap = r.capacity || 40;
      return `<section class="cpl-person">
        <header><b>${esc(r.name)}</b><small>${U.num(hours, 1)} / ${U.num(cap)} h${hours > cap * 1.05 ? ' · <span class="cal-late">เกิน</span>' : ''}</small>
          ${canEdit ? `<button class="icon-btn cal-add" type="button" data-action="new-on" data-day="${addDay}" data-person="${esc(r.id)}" aria-label="เพิ่มงานให้ ${esc(r.name)}">＋</button>` : ''}</header>
        ${mine.map((p) => `<div class="cpl-row"><span class="cpl-day${p.dueDate === T ? ' today' : ''}">${esc(dayName(p.dueDate))}<b>${PM.parse(p.dueDate).getDate()}</b></span>${calCard(p, T, canEdit, false, true)}</div>`).join('')}
      </section>`;
    }).join('') || '<p class="empty">ยังไม่มีงานในสัปดาห์นี้</p>'}</div>`;
  }

  function tasksTable(list, T, canEdit, canStatus) {
    if (!list.length) {
      return `<p class="empty">ยังไม่มีงานในสัปดาห์นี้${canEdit ? ' — กด "+ เพิ่มงาน" หรือ "ยกงานค้างจากสัปดาห์ก่อน"' : ''}</p>`;
    }
    return `<table class="tbl"><thead><tr><th>งาน</th><th>ผู้รับผิดชอบ</th><th>กำหนดเสร็จ</th><th class="num">ชั่วโมง</th><th class="num">ปริมาณ</th><th>สถานะ</th><th>สาเหตุ (ถ้าไม่เสร็จ)</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>
      ${list.map((p) => {
        const s = statusInfo(p.status);
        const late = p.status !== 'done' && p.status !== 'not_done' && p.dueDate < T;
        return `<tr class="${canEdit ? 'click' : ''}" data-plan="${esc(p.id)}">
          <td><span class="title">${esc(p.title)}</span><small>${esc(itemLabel(p))}${p.carriedFrom ? ' · ยกมาจากสัปดาห์ก่อน' : ''}</small></td>
          <td>${esc(U.resourceName(p.resourceId))}</td>
          <td>${esc(dayName(p.dueDate))} ${U.date(p.dueDate)} ${late ? U.badge('critical', 'เลยกำหนด') : ''}</td>
          <td class="num">${U.num(p.plannedHours, p.plannedHours % 1 ? 1 : 0)}</td>
          <td class="num">${p.qtyPlan ? `${U.num(p.qtyDone || 0)} / ${U.num(p.qtyPlan)} ${esc(p.unit || '')}` : '–'}</td>
          <td>${canStatus
            ? `<select class="plan-st st-${esc(p.status)}" data-plan-status="${esc(p.id)}" aria-label="สถานะ">${PM.PLAN_STATUS.map((x) => `<option value="${x.key}"${x.key === p.status ? ' selected' : ''}>${esc(x.th)}</option>`).join('')}</select>`
            : U.badge(s.level, s.th)}</td>
          <td>${p.status === 'not_done'
            ? (canStatus
              ? `<select class="plan-reason" data-plan-reason="${esc(p.id)}" aria-label="สาเหตุ">${U.options(PM.PLAN_REASONS, p.reason, '— เลือกสาเหตุ —')}</select>`
              : esc(p.reason || '–'))
            : '–'}</td>
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
      dueDate: PM.addDays(state.week, 4), qtyPlan: 0, qtyDone: 0, unit: '', status: 'planned', reason: '', note: '', carriedFrom: null,
    }, creatorStamp(), Object.fromEntries(Object.entries(defaults || {}).filter(([, v]) => v)));
    const people = PM.db.resources.filter((r) => r.active !== false || r.id === x.resourceId).map((r) => ({ value: r.id, label: `${r.name} · ${PM.levelName(r.level)}` }));
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
        ${U.field('ผู้รับผิดชอบ', 'resourceId', x.resourceId, { options: people, placeholder: '— เลือก —', required: true })}
        ${U.field('ชั่วโมงตามแผน', 'plannedHours', x.plannedHours, { type: 'number', min: 0, step: 0.5 })}
        ${U.field('กำหนดเสร็จ', 'dueDate', x.dueDate, { type: 'date', required: true, hint: 'สัปดาห์ของงานคำนวณจากวันนี้' })}
        ${U.field('หน่วย', 'unit', x.unit, { placeholder: 'm, pcs, m³, sets…' })}
        ${U.field('ปริมาณตามแผน', 'qtyPlan', x.qtyPlan, { type: 'number', min: 0, step: 'any' })}
        ${U.field('ทำได้จริง', 'qtyDone', x.qtyDone, { type: 'number', min: 0, step: 'any' })}
        ${U.field('สถานะ', 'status', x.status, { options: PM.PLAN_STATUS.map((s) => ({ value: s.key, label: `${s.th} (${s.label})` })) })}
        ${U.field('สาเหตุ (ถ้าไม่เสร็จ)', 'reason', x.reason, { options: PM.PLAN_REASONS, placeholder: '—' })}
        ${U.field('หมายเหตุ', 'note', x.note, { type: 'textarea', full: true, rows: 2 })}`,
      onSubmit: (f) => {
        const [kind, refId] = (f.item || '').split('|');
        if (!refId) { alert('กรุณาเลือก Work item'); return false; }
        if (f.status === 'not_done' && !f.reason) { alert('งานที่ไม่เสร็จ กรุณาเลือกสาเหตุ'); return false; }
        Object.assign(x, {
          title: f.title, kind, refId, phase: kind === 'project' ? f.phase : '', resourceId: f.resourceId,
          plannedHours: f.plannedHours, dueDate: f.dueDate, week: PM.monday(f.dueDate),
          unit: f.unit, qtyPlan: f.qtyPlan, qtyDone: f.qtyDone, status: f.status,
          reason: f.status === 'not_done' ? f.reason : '', note: f.note,
        });
        PM.upsert('plans', x);
        U.toast(x.week === state.week ? 'บันทึกแล้ว' : `บันทึกแล้ว — ย้ายไปสัปดาห์ ${U.date(x.week)}`);
        done();
      },
    });
    const item = form.querySelector('[name=item]'), phase = form.querySelector('[name=phase]');
    const sync = () => { phase.disabled = !item.value.startsWith('project|'); };
    item.addEventListener('change', sync);
    sync();
  }

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
        status: 'planned', reason: '', carriedFrom: p.id,
      }, creatorStamp())); // the person who carries a task over creates (and may delete) the copy
    });
    PM.save();
    U.toast(`ยกมา ${open.length} งาน`);
    done();
  }
})();
