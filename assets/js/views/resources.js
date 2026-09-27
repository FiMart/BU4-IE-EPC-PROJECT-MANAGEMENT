/* resources.js — Resource Utilization: by level, by person, weekly loading heatmap */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  const state = { period: '4w' };
  const PERIODS = [
    { key: '4w', label: '4 สัปดาห์' },
    { key: 'month', label: 'เดือนนี้' },
    { key: '12w', label: '12 สัปดาห์' },
  ];
  const range = (k) => {
    const T = PM.today();
    if (k === 'month') return { from: T.slice(0, 8) + '01', to: T };
    if (k === '12w') return { from: PM.addDays(PM.monday(T), -77), to: T };
    return { from: PM.addDays(T, -27), to: T };
  };

  PM.views.resources = function (el) {
    const db = PM.db, T = PM.today();
    const { from, to } = range(state.period);
    const ut = PM.utilization(from, to);
    const weeks = []; for (let i = 11; i >= 0; i--) weeks.push(PM.addDays(PM.monday(T), -7 * i));
    const weekUt = weeks.map((w) => PM.utilization(w, PM.addDays(w, 6)));

    el.innerHTML = `
      <div class="row">
        ${V.seg('period', PERIODS, state.period)}
        <span class="muted">${U.date(from)} – ${U.date(ut.to)} · ${ut.days} working days</span>
        <span class="spacer"></span>
        <a class="btn" href="#/timesheet">บันทึก Timesheet</a>
        <button class="btn primary" data-action="new-person">+ Add person</button>
      </div>
      <div class="grid cols-6">
        ${V.tile({ label: 'Utilization', value: U.pct(ut.total.util), sub: 'Billable ÷ Available', tip: 'Available = capacity − leave\nBillable = Project + Bidding hours' })}
        ${V.tile({ label: 'Available hours', value: U.num(ut.total.available), sub: `capacity ${U.num(ut.total.capacity)} − leave ${U.num(ut.total.leave)}` })}
        ${V.tile({ label: 'Project hours', value: U.num(ut.total.project), sub: 'EPC execution' })}
        ${V.tile({ label: 'Bidding hours', value: U.num(ut.total.bid), sub: 'Before award' })}
        ${V.tile({ label: 'Overhead hours', value: U.num(ut.total.overhead), sub: 'Admin / Training' })}
        ${V.tile({ label: 'Timesheet missing', value: U.num(ut.total.missing), sub: ut.total.missing > ut.total.capacity * 0.05 ? U.badge('warning', 'ตามให้กรอก') : U.badge('good', 'ครบ') })}
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>Utilization by level</h2><p>เส้นดำ = Target ของ level</p></div><div class="card-b"><div class="chart" id="c-level"></div></div></div>
        <div class="card"><div class="card-h"><h2>Weekly hours by category</h2><p>12 สัปดาห์ล่าสุด (ทั้งทีม)</p></div><div class="card-b"><div class="chart" id="c-weekly"></div></div></div>
      </div>
      <div class="card">
        <div class="card-h"><h2>Resource loading (level) — weekly utilization</h2><p>% billable ต่อชั่วโมงที่ว่าง แต่ละสัปดาห์ · กรอบแดง = เกิน 105% (over-allocated)</p></div>
        <div class="card-b table-wrap">${heatmap(db, weeks, weekUt)}</div>
      </div>
      <div class="card">
        <div class="card-h"><h2>People</h2><p>คลิกเพื่อแก้ไข · สถานะเทียบกับ target ของ level</p></div>
        <div class="card-b flush table-wrap">${peopleTable(ut)}</div>
      </div>
      <div class="card">
        <div class="card-h"><h2>Levels</h2><p>อัตราค่าแรงต่อชั่วโมงและ utilization target ของแต่ละระดับ — คลิกเพื่อแก้ไข</p></div>
        <div class="card-b flush table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Level</th><th class="num">Headcount</th><th class="num">Rate (THB/h)</th><th class="num">Target</th><th class="num">Actual</th><th>Status</th></tr></thead><tbody>
          ${db.levels.map((l) => {
            const x = ut.byLevel.find((b) => b.level.id === l.id);
            const u = x ? x.util : null, st = U.utilLevel(u, l.target / 100);
            return `<tr class="click" data-action="edit-level" data-id="${esc(l.id)}"><td><span class="title">${esc(l.id)}</span></td><td>${esc(l.name)}</td>
              <td class="num">${x ? x.n : 0}</td><td class="num">${U.num(l.rate)}</td><td class="num">${l.target}%</td><td class="num">${U.pct(u)}</td><td>${U.badge(st, U.utilLabel(u, l.target / 100))}</td></tr>`;
          }).join('')}
        </tbody></table></div>
      </div>`;

    PM.charts.hbars(document.getElementById('c-level'), {
      max: 1.2,
      items: ut.byLevel.map((l) => ({ label: l.level.name, sub: `${l.n} คน`, value: l.util || 0, target: l.target, display: U.pct(l.util),
        tip: `${l.level.name}\nUtilization ${U.pct(l.util)} (target ${U.pct(l.target)})\nBillable ${U.num(l.billable)} h / Available ${U.num(l.available)} h` })),
    });
    const cat = (fn) => weekUt.map((w) => fn(w.total));
    PM.charts.columns(document.getElementById('c-weekly'), {
      categories: weeks.map((w) => U.date(w).slice(0, 6)), tipTitle: weeks.map((w, i) => `Week of ${U.date(w)} · util ${U.pct(weekUt[i].total.util)}`), label: 'Weekly hours',
      series: [
        { name: 'Project', color: 'var(--s1)', values: cat((t) => t.project) },
        { name: 'Bidding', color: 'var(--s2)', values: cat((t) => t.bid) },
        { name: 'Overhead', color: 'var(--s3)', values: cat((t) => t.overhead) },
        { name: 'Leave', color: 'var(--s4)', values: cat((t) => t.leave) },
      ],
    });

    const rerender = () => PM.views.resources(el);
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg]');
      if (seg) { state[seg.dataset.seg] = seg.dataset.val; rerender(); return; }
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const act = a.dataset.action, id = a.dataset.id;
      if (act === 'new-person') personForm(null, rerender);
      if (act === 'edit-person') personForm(PM.find('resources', id), rerender);
      if (act === 'new-level') levelForm(null, rerender);
      if (act === 'edit-level') levelForm(PM.db.levels.find((l) => l.id === id), rerender);
    };
  };

  function heatClass(u) {
    if (u == null) return 'h0';
    if (u < 0.5) return 'h1';
    if (u < 0.7) return 'h2';
    if (u < 0.85) return 'h3';
    if (u <= 1.05) return 'h4';
    return 'h5';
  }

  function heatmap(db, weeks, weekUt) {
    const people = db.resources.filter((r) => r.active !== false);
    if (!people.length) return '<p class="empty">ยังไม่มีรายชื่อพนักงาน</p>';
    return `<table class="heat"><thead><tr><th class="name">Name</th>${weeks.map((w) => `<th>${esc(U.date(w).slice(0, 6))}</th>`).join('')}</tr></thead><tbody>
      ${people.map((r, ri) => `<tr style="--r:${ri}"><th class="name">${esc(r.name)} <small>${esc(PM.levelName(r.level))}</small></th>${weekUt.map((w, i) => {
        const x = w.people.find((p) => p.r.id === r.id);
        const u = x && x.available ? x.util : null;
        const c = heatClass(u);
        return `<td class="${c}${u > 1.05 ? ' over' : ''}" style="--c:${i}" data-tip="${esc(`${r.name} · week of ${U.date(weeks[i])}\nUtilization ${U.pct(u)}\nBillable ${U.num(x ? x.billable : 0)} h / Available ${U.num(x ? x.available : 0)} h\nLeave ${U.num(x ? x.leave : 0)} h · Overhead ${U.num(x ? x.overhead : 0)} h`)}">${u == null ? '–' : Math.round(u * 100)}</td>`;
      }).join('')}</tr>`).join('')}
      </tbody></table>
      <div class="heat-legend"><span class="muted">Utilization %</span>
        <span><i class="h1"></i>&lt; 50</span><span><i class="h2"></i>50–70</span><span><i class="h3"></i>70–85</span><span><i class="h4"></i>85–105</span><span><i class="h5" style="box-shadow:inset 0 0 0 2px var(--critical)"></i>&gt; 105 (over)</span></div>`;
  }

  function peopleTable(ut) {
    if (!ut.people.length) return '<p class="empty">ยังไม่มีรายชื่อพนักงาน</p>';
    const rows = ut.people.slice().sort((a, b) => (b.util || 0) - (a.util || 0));
    return `<table class="tbl"><thead><tr><th>Name</th><th>Level</th><th>Discipline</th><th class="num">Available h</th><th class="num">Project h</th><th class="num">Bidding h</th><th class="num">Overhead h</th><th class="num">Leave h</th><th style="min-width:150px">Utilization vs target</th><th>Status</th></tr></thead><tbody>
      ${rows.map((x) => {
        const st = U.utilLevel(x.util, x.target);
        return `<tr class="click" data-action="edit-person" data-id="${esc(x.r.id)}">
          <td><span class="title">${esc(x.r.name)}</span></td><td>${esc(x.level ? x.level.name : x.r.level)}</td><td>${esc(x.r.discipline)}</td>
          <td class="num">${U.num(x.available)}</td><td class="num">${U.num(x.project)}</td><td class="num">${U.num(x.bid)}</td>
          <td class="num">${U.num(x.overhead)}</td><td class="num">${U.num(x.leave)}</td>
          <td><div class="pbar-wrap">${U.progress(Math.min(1, x.util || 0), x.target, `${x.r.name}\nUtilization ${U.pct(x.util)} · target ${U.pct(x.target)}`)}<span class="num">${U.pct(x.util)}</span></div></td>
          <td>${U.badge(st, U.utilLabel(x.util, x.target))}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  function personForm(r, done) {
    const isNew = !r;
    const p = r || { id: PM.uid('R'), name: '', level: 'ENG', discipline: PM.DISCIPLINES[0], capacity: 40, active: true };
    // only Engineer / Technician; a person still on an older level keeps it listed so it isn't changed by accident
    const levelOptions = PM.PERSON_LEVELS.map((l) => ({ value: l.id, label: PM.levelName(l.id) }));
    if (!isNew && !PM.PERSON_LEVELS.some((l) => l.id === p.level)) levelOptions.push({ value: p.level, label: `${PM.levelName(p.level)} (เดิม)` });
    U.modal({
      title: isNew ? 'Add person' : p.name,
      onDelete: isNew ? null : () => { p.active = false; PM.upsert('resources', p); U.toast('ปิดการใช้งานแล้ว (ข้อมูล timesheet เดิมยังอยู่)'); done(); },
      body: `
        ${U.field('ชื่อ-สกุล', 'name', p.name, { required: true, full: true })}
        ${U.field('Level', 'level', p.level, { options: levelOptions })}
        ${U.field('Discipline', 'discipline', p.discipline, { options: PM.DISCIPLINES })}
        ${U.field('Capacity (hours/week)', 'capacity', p.capacity, { type: 'number', min: 0, max: 80 })}`,
      onSubmit: (f) => { Object.assign(p, f, { active: true }); PM.upsert('resources', p); U.toast('บันทึกแล้ว'); done(); },
    });
  }

  function levelForm(l, done) {
    const isNew = !l;
    const x = l || { id: 'L' + (PM.db.levels.length + 1), name: '', rate: 500, target: 80 };
    U.modal({
      title: isNew ? 'Add level' : x.name,
      onDelete: isNew || PM.db.resources.some((r) => r.level === x.id) ? null : () => { PM.remove('levels', x.id); done(); },
      body: `
        ${U.field('Code', 'id', x.id, { required: true })}
        ${U.field('Level name', 'name', x.name, { required: true })}
        ${U.field('Rate (THB / hour)', 'rate', x.rate, { type: 'number', min: 0 })}
        ${U.field('Utilization target (%)', 'target', x.target, { type: 'number', min: 0, max: 120 })}`,
      onSubmit: (f) => {
        if (isNew && PM.db.levels.some((y) => y.id === f.id)) { alert('Code ซ้ำ'); return false; }
        if (!isNew && f.id !== x.id && PM.PERSON_LEVELS.some((l) => l.id === x.id)) { alert(`Code ${x.id} ใช้กับตัวเลือก Level ใน Add person — เปลี่ยน Code ไม่ได้ (แก้ชื่อ / rate / target ได้)`); return false; }
        if (!isNew && f.id !== x.id) PM.db.resources.forEach((r) => { if (r.level === x.id) r.level = f.id; });
        Object.assign(x, f);
        if (isNew) PM.db.levels.push(x);
        PM.save();
        U.toast('บันทึกแล้ว');
        done();
      },
    });
  }
})();
