/* resources.js — Resource Utilization: by level, by person, weekly loading heatmap */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  const state = U.keep('resources', { period: '4w' }, ['period']);
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
    const ot = PM.overtime(from, to);

    el.innerHTML = `
      <div class="row">
        ${V.seg('period', PERIODS, state.period)}
        <span class="muted">${U.date(from)} – ${U.date(ut.to)} · ${ut.days} working days</span>
        <span class="spacer"></span>
        <a class="btn" href="#/timesheet">บันทึก Timesheet</a>
        <button class="btn primary fab" data-action="new-person" aria-label="Add person"><span class="fab-i">+</span><span class="fab-t">Add person</span></button>
      </div>
      <div class="grid cols-6">
        ${V.tile({ label: 'Utilization', value: U.pct(ut.total.util), sub: 'Billable ÷ Available', tip: 'Available = capacity − leave\nBillable = Project + Bidding hours' })}
        ${V.tile({ label: 'Available hours', value: U.num(ut.total.available), sub: `capacity ${U.num(ut.total.capacity)} − leave ${U.num(ut.total.leave)}` })}
        ${V.tile({ label: 'Project hours', value: U.num(ut.total.project), sub: 'EPC execution' })}
        ${V.tile({ label: 'Bidding hours', value: U.num(ut.total.bid), sub: 'Before award' })}
        ${V.tile({ label: 'Overhead hours', value: U.num(ut.total.overhead), sub: 'Admin / Training' })}
        ${V.tile({ label: 'Timesheet missing', value: U.num(ut.total.missing), sub: ut.total.missing > ut.total.capacity * 0.05 ? U.badge('warning', 'ตามให้กรอก') : U.badge('good', 'ครบ') })}
      </div>
      <div class="card" id="r-ot">${otCard(ot)}</div>
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
        <div class="card-b flush table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Level</th><th class="num">Headcount</th><th class="num">Rate (THB/h)</th><th class="num">Target</th><th class="num">Actual</th><th>Status</th><th>สิทธิ์ OT</th></tr></thead><tbody>
          ${db.levels.map((l) => {
            const x = ut.byLevel.find((b) => b.level.id === l.id);
            const u = x ? x.util : null, st = U.utilLevel(u, l.target / 100);
            return `<tr class="click" data-action="edit-level" data-id="${esc(l.id)}"><td><span class="title">${esc(l.id)}</span></td><td>${esc(l.name)}</td>
              <td class="num">${x ? x.n : 0}</td><td class="num">${U.num(l.rate)}</td><td class="num">${l.target}%</td><td class="num">${U.pct(u)}</td><td>${U.badge(st, U.utilLabel(u, l.target / 100))}</td>
              <td><small>${esc(PM.otRule({ level: l.id }).text)}</small></td></tr>`;
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

    // OT per week (12 weeks), split by where it came from
    const weekOt = weeks.map((w) => PM.overtime(w, PM.addDays(w, 6)).total);
    PM.charts.columns(document.getElementById('c-ot-week'), {
      categories: weeks.map((w) => U.date(w).slice(0, 6)), tipTitle: weeks.map((w, i) => `สัปดาห์ ${U.date(w)} · OT ${U.num(weekOt[i].total, 1)} ชม.`), fmt: (v) => U.num(v, 1) + ' ชม.', label: 'Weekly overtime',
      series: [
        { name: `จันทร์ – ศุกร์ หลัง ${PM.OT_START}`, color: 'var(--s1)', values: weekOt.map((t) => t.after) },
        { name: 'ไม่ได้พักเที่ยง', color: 'var(--s4)', values: weekOt.map((t) => t.lunch) },
        { name: 'เสาร์ – อาทิตย์', color: 'var(--s2)', values: weekOt.map((t) => t.weekend) },
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
      if (act === 'ot-settings') otSettingsForm(rerender);
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
    const people = db.resources.filter((r) => r.active !== false && PM.needsTimesheet(r)); // Level Other has no Timesheet to show
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

  /* Overtime: by level rule (PM.OT_RULES) — totals of the chosen period, 12-week chart, one row per person */
  function otCard(ot) {
    const h = (v) => (v ? U.num(v, 1) : '<span class="muted">–</span>');
    const rows = ot.people.filter((x) => x.total > 0 || x.rule.weekday || x.rule.weekend).sort((a, b) => b.total - a.total);
    const rules = ['ENG', 'TECH'].map((id) => `<b>${esc(PM.levelName(id))}</b>: ${esc(PM.OT_RULES[id].text)}`).join(' · ');
    const R = ot.rates;
    const rateText = `จ.–ศ. ${R.weekday}× · วันหยุด ${R.holiday}× (${R.holidayHours} ชม.แรก) · เกิน ${R.holidayHours} ชม. ${R.holidayOt}×`;
    const projects = Object.keys(ot.byProject).map((id) => ({ id, p: id && PM.find('projects', id), ...ot.byProject[id] })).filter((x) => x.hours > 0).sort((a, b) => b.cost - a.cost);
    const T = PM.today();
    const nextHol = PM.otSettings().holidays.filter((x) => x.date >= T).slice(0, 4);
    return `<div class="card-h"><h2>OT (ล่วงเวลา)</h2>${U.badge(ot.total.total ? 'info' : 'neutral', `${U.num(ot.total.total, 1)} ชม. · ${ot.total.people} คน`)}
        <span class="spacer"></span>
        <button class="btn sm" data-action="ot-settings">${PM.can('ot.settings') ? 'ตั้งวันหยุด / อัตราค่า OT' : 'ดูวันหยุด / อัตราค่า OT'}</button>
        <a class="btn sm" href="#/timesheet">กรอกเวลาเลิกงาน / พักเที่ยง →</a>
        <p>${rules} · Other ไม่มี OT · เสาร์ – อาทิตย์ และ<b>วันหยุดนักขัตฤกษ์</b> = ชั่วโมงที่ลงใน Timesheet ทั้งวัน · ค่า OT = อัตราค่าแรงของ Level × ${esc(rateText)} · ช่วงเวลาตามตัวเลือกด้านบน</p></div>
      <div class="card-b">
        <div class="grid cols-5">
          ${V.tile({ label: 'ค่า OT (ประมาณ)', value: U.money(ot.total.cost), sub: `${U.num(ot.total.total, 1)} ชม. · ${ot.total.people} คน`, icon: 'coins', tip: `ค่า OT = อัตราค่าแรง (บาท/ชม.) ของ Level × ตัวคูณ\n${rateText}\nแก้อัตราค่าแรงได้ที่ตาราง Levels ด้านล่าง` })}
          ${V.tile({ label: `จันทร์ – ศุกร์ หลัง ${PM.OT_START}`, value: `${U.num(ot.total.after, 1)} <small>ชม.</small>`, sub: 'Technician — จากเวลาเลิกงาน', icon: 'clock' })}
          ${V.tile({ label: 'ไม่ได้พักเที่ยง (12:00)', value: `${U.num(ot.total.lunch, 1)} <small>ชม.</small>`, sub: `Technician — ครั้งละ ${PM.OT_LUNCH_HOURS} ชม.`, icon: 'clock' })}
          ${V.tile({ label: 'เสาร์ – อาทิตย์ / วันหยุด', value: `${U.num(ot.total.weekend, 1)} <small>ชม.</small>`, sub: ot.holidays.length ? `รวมวันหยุดนักขัตฤกษ์ ${ot.holidays.length} วันในช่วงนี้` : 'Engineer และ Technician', icon: 'calendar' })}
          ${V.tile({ label: 'วันหยุดถัดไป', value: nextHol.length ? U.date(nextHol[0].date) : '–', sub: nextHol.length ? esc(nextHol.map((x) => x.name).slice(0, 1).join('')) + (nextHol.length > 1 ? ` · ถัดไป ${U.date(nextHol[1].date)}` : '') : 'ยังไม่ได้ตั้งวันหยุด', icon: 'calendar' })}
        </div>
        <div class="grid cols-2">
          <div><h3 class="cf-sub">OT รายสัปดาห์ — 12 สัปดาห์ล่าสุด (ทั้งทีม)</h3><div class="chart" id="c-ot-week"></div></div>
          <div><h3 class="cf-sub">ค่า OT ตามโครงการ (ช่วงที่เลือก)</h3>
            ${projects.length ? `<table class="tbl"><thead><tr><th>โครงการ</th><th class="num">OT (ชม.)</th><th class="num">ค่า OT</th></tr></thead><tbody>
              ${projects.map((x) => `<tr><td>${x.p ? `<a href="#/projects/${esc(x.p.id)}">${esc(x.p.code)}</a><small>${esc(x.p.name)}</small>` : '<span class="muted">ไม่ใช่งานโครงการ (ประมูล / ส่วนกลาง)</span>'}</td><td class="num">${U.num(x.hours, 1)}</td><td class="num">${U.money(x.cost)}</td></tr>`).join('')}
              </tbody></table><p class="muted" style="margin:6px 0 0;font-size:12.5px">แบ่งค่า OT ของแต่ละวันตามสัดส่วนชั่วโมงที่ลงในแต่ละโครงการวันนั้น</p>` : '<p class="empty">ไม่มี OT ในช่วงนี้</p>'}</div>
        </div>
      </div>
      <div class="card-b flush table-wrap"><table class="tbl"><thead><tr><th>ชื่อ</th><th>Level</th><th class="num">จ.–ศ. หลัง ${PM.OT_START}</th><th class="num">ไม่ได้พักเที่ยง</th><th class="num">เสาร์ – อาทิตย์ / วันหยุด</th><th class="num">รวม OT (ชม.)</th><th class="num">วันที่มี OT</th><th class="num">อัตรา (บาท/ชม.)</th><th class="num">ค่า OT</th></tr></thead><tbody>
        ${rows.length ? rows.map((x) => `<tr>
          <td class="nowrap"><span class="title">${esc(x.r.name)}</span></td><td class="nowrap" data-tip="${esc(x.rule.text)}">${esc(PM.levelName(x.r.level))}</td>
          <td class="num">${x.rule.weekday ? h(x.after) : '<span class="muted">ไม่มีสิทธิ์</span>'}</td>
          <td class="num">${x.rule.lunch ? h(x.lunch) : '<span class="muted">ไม่มีสิทธิ์</span>'}</td>
          <td class="num">${h(x.weekend)}</td><td class="num"><b>${U.num(x.total, 1)}</b></td><td class="num">${x.days || '–'}</td>
          <td class="num">${U.num(x.rate)}</td><td class="num"><b>${x.cost ? U.money(x.cost) : '<span class="muted">–</span>'}</b></td></tr>`).join('')
          : '<tr><td colspan="9" class="empty">ไม่มีพนักงานที่มีสิทธิ์ OT</td></tr>'}
      </tbody><tfoot><tr><td colspan="5">รวม</td><td class="num">${U.num(ot.total.total, 1)}</td><td></td><td></td><td class="num">${U.money(ot.total.cost)}</td></tr></tfoot></table></div>`;
  }

  /* public holidays + OT pay multipliers (PM.otSettings — collection 'settings', id 'ot') */
  function otSettingsForm(done) {
    const s = PM.otSettings(), canEdit = PM.can('ot.settings');
    const Y = +PM.today().slice(0, 4);
    const lines = (list) => list.map((h) => `${h.date} ${h.name}`).join('\n');
    const form = U.modal({
      title: 'วันหยุดนักขัตฤกษ์และอัตราค่า OT', wide: true,
      body: `
        <div class="sub-h">ตัวคูณค่า OT (× อัตราค่าแรงของ Level)</div>
        ${U.field('OT วันทำงาน (หลัง 16:30 · พักเที่ยง)', 'weekday', s.rates.weekday, { type: 'number', min: 0, step: 0.25 })}
        ${U.field('ทำงานวันหยุด (ชั่วโมงแรก ๆ)', 'holiday', s.rates.holiday, { type: 'number', min: 0, step: 0.25 })}
        ${U.field('ชั่วโมงทำงานปกติของวันหยุด', 'holidayHours', s.rates.holidayHours, { type: 'number', min: 0, max: 24, step: 0.5, hint: 'เกินกว่านี้คิดเป็น OT วันหยุด' })}
        ${U.field('OT วันหยุด (เกินชั่วโมงปกติ)', 'holidayOt', s.rates.holidayOt, { type: 'number', min: 0, step: 0.25 })}
        <p class="full muted" style="margin:0">ค่าเริ่มต้นตาม พ.ร.บ.คุ้มครองแรงงาน: OT วันทำงาน 1.5 เท่า · ทำงานวันหยุด 2 เท่า (8 ชม.แรก) · OT วันหยุด 3 เท่า — ปรับตามระเบียบบริษัทได้</p>
        <div class="sub-h">วันหยุดนักขัตฤกษ์ — นับเป็นวัน OT เหมือนเสาร์ – อาทิตย์</div>
        <label class="full"><span>หนึ่งบรรทัดต่อหนึ่งวัน: <b>ปปปป-ดด-วว ชื่อวันหยุด</b></span>
          <textarea name="holidays" rows="12" placeholder="${Y}-01-01 วันขึ้นปีใหม่">${U.esc(lines(s.holidays))}</textarea>
          <small class="muted">วันหยุดตามจันทรคติ (มาฆบูชา · วิสาขบูชา · อาสาฬหบูชา · เข้าพรรษา) และวันหยุดชดเชย เปลี่ยนทุกปี — เพิ่มเองตามประกาศ</small></label>
        ${canEdit ? `<div class="full row"><button type="button" class="btn sm" data-hol="${Y}">+ วันหยุดราชการ (วันที่คงที่) ปี ${Y + 543}</button><button type="button" class="btn sm" data-hol="${Y + 1}">+ ปี ${Y + 544}</button></div>` : ''}`,
      onSubmit: !canEdit ? null : (f) => {
        const bad = [], holidays = [];
        f.holidays.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
          const m = /^(\d{4}-\d{2}-\d{2})\s*(.*)$/.exec(l);
          if (!m || isNaN(new Date(m[1] + 'T00:00:00'))) bad.push(l); else if (!holidays.some((h) => h.date === m[1])) holidays.push({ date: m[1], name: m[2] || 'วันหยุด' });
        });
        if (bad.length) { U.alert(`อ่านบรรทัดนี้ไม่ได้ — ใช้รูปแบบ ปปปป-ดด-วว ชื่อวันหยุด (ปี ค.ศ.)\n\n${bad.slice(0, 5).join('\n')}`); return false; }
        const rec = (PM.db.settings || []).find((x) => x.id === 'ot') || { id: 'ot' };
        Object.assign(rec, { holidays: holidays.sort((a, b) => (a.date < b.date ? -1 : 1)), rates: { weekday: f.weekday, holiday: f.holiday, holidayOt: f.holidayOt, holidayHours: f.holidayHours } });
        PM.upsert('settings', rec);
        U.toast(`บันทึกแล้ว — วันหยุด ${holidays.length} วัน`);
        done();
      },
    });
    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-hol]');
      if (!b) return;
      const have = new Set(form.holidays.value.split('\n').map((l) => l.trim().slice(0, 10)));
      const add = PM.thaiHolidays(+b.dataset.hol).filter((h) => !have.has(h.date));
      form.holidays.value = (form.holidays.value.trim() ? form.holidays.value.trim() + '\n' : '') + lines(add);
      U.toast(add.length ? `เพิ่ม ${add.length} วัน — กดบันทึกเพื่อใช้งาน` : 'มีครบแล้ว');
    });
    if (!canEdit) form.querySelectorAll('input, textarea').forEach((i) => { i.disabled = true; });
  }

  function peopleTable(ut) {
    if (!ut.people.length) return '<p class="empty">ยังไม่มีรายชื่อพนักงาน</p>';
    const rows = ut.people.slice().sort((a, b) => (b.util || 0) - (a.util || 0));
    return `<table class="tbl"><thead><tr><th>Name</th><th>Level</th><th>Discipline</th><th class="num">Available h</th><th class="num">Project h</th><th class="num">Bidding h</th><th class="num">Overhead h</th><th class="num">Leave h</th><th style="min-width:150px">Utilization vs target</th><th>Status</th></tr></thead><tbody>
      ${rows.map((x) => {
        const st = U.utilLevel(x.util, x.target);
        return `<tr class="click" data-action="edit-person" data-id="${esc(x.r.id)}">
          <td><span class="title">${esc(x.r.name)}</span>${PM.needsTimesheet(x.r) ? '' : `<small>${x.r.level === 'OTHER' ? 'Level Other' : 'capacity 0'} — ไม่ลง Timesheet · ไม่คิด utilization</small>`}</td><td>${esc(x.level ? x.level.name : x.r.level)}</td><td>${esc(x.r.discipline)}</td>
          <td class="num">${U.num(x.available)}</td><td class="num">${U.num(x.project)}</td><td class="num">${U.num(x.bid)}</td>
          <td class="num">${U.num(x.overhead)}</td><td class="num">${U.num(x.leave)}</td>
          <td><div class="pbar-wrap">${U.progress(Math.min(1, x.util || 0), x.target, `${x.r.name}\nUtilization ${U.pct(x.util)} · target ${U.pct(x.target)}`)}<span class="num">${U.pct(x.util)}</span></div></td>
          <td>${U.badge(st, U.utilLabel(x.util, x.target))}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  function personForm(r, done) {
    const isNew = !r;
    const p = r || { id: PM.uid('R'), name: '', level: 'ENG', discipline: PM.DISCIPLINES[0], capacity: 40, active: true };
    // only Engineer / Technician / Other; a person still on an older level keeps it listed so it isn't changed by accident
    const levelOptions = PM.PERSON_LEVELS.map((l) => ({ value: l.id, label: PM.levelName(l.id) }));
    if (!isNew && !PM.PERSON_LEVELS.some((l) => l.id === p.level)) levelOptions.push({ value: p.level, label: `${PM.levelName(p.level)} (เดิม)` });
    U.modal({
      title: isNew ? 'Add person' : p.name,
      onDelete: isNew ? null : () => { p.active = false; PM.upsert('resources', p); U.toast('ปิดการใช้งานแล้ว (ข้อมูล timesheet เดิมยังอยู่)'); done(); },
      body: `
        ${U.field('ชื่อ-สกุล', 'name', p.name, { required: true, full: true })}
        ${U.field('Level', 'level', p.level, { options: levelOptions })}
        ${U.field('Discipline', 'discipline', p.discipline, { options: PM.DISCIPLINES })}
        ${U.field('Capacity (hours/week)', 'capacity', p.capacity, { type: 'number', min: 0, max: 80, hint: 'Level Other ไม่ต้องลง Timesheet อยู่แล้ว (ไม่นับใน utilization) · ใส่ 0 สำหรับคนอื่นที่ไม่ลง Timesheet' })}`,
      onSubmit: (f) => { Object.assign(p, f, { active: true }); PM.upsert('resources', p); U.toast('บันทึกแล้ว'); done(); },
    });
  }

  function levelForm(l, done) {
    const isNew = !l;
    const x = l || { id: 'L' + (PM.db.levels.length + 1), name: '', rate: 500, target: 80 };
    U.modal({
      title: isNew ? 'Add level' : x.name,
      onDelete: null, // Engineer / Technician / Other are fixed levels (name, rate and target can still be edited)
      body: `
        ${U.field('Code', 'id', x.id, { required: true })}
        ${U.field('Level name', 'name', x.name, { required: true })}
        ${U.field('Rate (THB / hour)', 'rate', x.rate, { type: 'number', min: 0 })}
        ${U.field('Utilization target (%)', 'target', x.target, { type: 'number', min: 0, max: 120 })}`,
      onSubmit: (f) => {
        if (isNew && PM.db.levels.some((y) => y.id === f.id)) { U.alert('Code ซ้ำ'); return false; }
        if (!isNew && f.id !== x.id && PM.PERSON_LEVELS.some((l) => l.id === x.id)) { U.alert(`Code ${x.id} ใช้กับตัวเลือก Level ใน Add person — เปลี่ยน Code ไม่ได้ (แก้ชื่อ / rate / target ได้)`); return false; }
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
