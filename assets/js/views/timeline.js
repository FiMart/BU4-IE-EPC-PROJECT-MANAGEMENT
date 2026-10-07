/* timeline.js — project Timeline · Gantt: activities and milestones under the 4 EPC phases.
   PM.gantt          — the chart (HTML rows on a date scale, scrolls sideways on narrow screens)
   PM.timelineTab    — project page → tab "Timeline · Gantt" (summary tiles, Gantt, milestones, activities to follow up)
   PM.portfolioGantt — Projects page: every project on one timeline (4 phase lanes per project + milestones)
   Data lives on the project record: p.tasks / p.milestones (see PM.buildTimeline in data.js). */
(function () {
  const U = PM.ui, esc = U.esc;
  const folded = {}; // projectId → { phaseKey: true } — collapsed phase groups (this visit only)
  const phaseColor = (key) => `var(--s${Math.max(0, PM.PHASES.findIndex((x) => x.key === key)) + 1})`;
  const phaseOf = (key) => PM.PHASES.find((x) => x.key === key);
  const days = (n) => `${U.num(Math.abs(n))} วัน`;

  /* ---------- the Gantt renderer ----------
     o = { from, to, today, labelHead, labelW,
           rows: [{ cls, label (html), sub (html), attrs, bars: [{ start, end, cls, color, progress, tip, attrs, style }], marks: [{ date, cls, tip, attrs }] }] } */
  PM.gantt = function (o) {
    const total = Math.max(1, PM.diffDays(o.from, o.to));
    const x = (d) => Math.max(0, Math.min(100, (PM.diffDays(o.from, d) / total) * 100));
    const months = PM.months(o.from.slice(0, 7), o.to.slice(0, 7));
    const step = Math.max(1, Math.ceil(months.length / 12)); // label every n-th month so the labels never collide
    const ticks = months.map((ym, i) => ({ left: x(PM.max(ym + '-01', o.from)), label: i % step === 0 ? U.month(ym) : '', year: ym.endsWith('-01') && i > 0 }));
    const today = o.today >= o.from && o.today <= o.to ? x(o.today) : null;
    const bar = (b) => {
      const l = x(b.start), w = Math.max(0.5, x(b.end) - l);
      return `<div class="gb ${b.cls || ''}" style="left:${l}%;width:${w}%;${b.color ? `--c:${b.color};` : ''}${b.style || ''}"${b.tip ? ` data-tip="${esc(b.tip)}"` : ''}${b.attrs || ''}>${b.progress != null ? `<span style="width:${Math.max(0, Math.min(100, b.progress))}%"></span>` : ''}</div>`;
    };
    const mark = (k) => `<div class="gm ${k.cls || ''}" style="left:${x(k.date)}%"${k.tip ? ` data-tip="${esc(k.tip)}"` : ''}${k.attrs || ''}></div>`;
    return `<div class="gantt-scroll"><div class="gantt" style="--lab:${o.labelW || 260}px">
      <div class="gantt-head"><div class="gantt-lab">${o.labelHead || ''}</div>
        <div class="gantt-scale">${ticks.map((t) => `<span class="${t.year ? 'yr' : ''}" style="left:${t.left}%">${t.label}</span>`).join('')}${today != null ? `<b class="gantt-today-tag" style="left:${today}%">วันนี้</b>` : ''}</div></div>
      <div class="gantt-body">
        <div class="gantt-grid" aria-hidden="true">${ticks.map((t) => `<i class="${t.year ? 'yr' : ''}" style="left:${t.left}%"></i>`).join('')}${today != null ? `<b class="gantt-today" style="left:${today}%"></b>` : ''}</div>
        ${o.rows.map((r) => `<div class="gantt-row ${r.cls || ''}"><div class="gantt-lab"${r.attrs || ''}><div class="gl-t">${r.label}</div>${r.sub ? `<small>${r.sub}</small>` : ''}</div>
          <div class="gantt-track">${(r.bars || []).map(bar).join('')}${(r.marks || []).map(mark).join('')}</div></div>`).join('')}
      </div></div></div>`;
  };

  /* overall date range of a project's plan, actuals, activities, milestones and forecast — whole months */
  function rangeOf(list) {
    const dates = list.filter(Boolean).sort();
    return { from: dates[0].slice(0, 7) + '-01', to: PM.monthEnd(dates[dates.length - 1].slice(0, 7)) };
  }
  const msStatus = (ms, T) => {
    if (ms.actual) {
      const late = PM.diffDays(ms.date, ms.actual);
      return { level: 'good', cls: 'done', text: late > 0 ? `สำเร็จ (ช้า ${days(late)})` : 'สำเร็จ' };
    }
    const d = PM.diffDays(T, ms.date);
    if (d < 0) return { level: 'critical', cls: 'late', text: `เลยกำหนด ${days(d)}` };
    return { level: d <= 14 ? 'warning' : 'neutral', cls: '', text: d === 0 ? 'วันนี้' : `อีก ${days(d)}` };
  };
  const msTip = (ms, T) => `◆ ${ms.name}\nแผน ${U.date(ms.date)}${ms.actual ? `\nจริง ${U.date(ms.actual)}` : ''}\n${msStatus(ms, T).text}${ms.note ? '\n' + ms.note : ''}`;
  const taskTip = (t, T) => `${t.name}\n${U.date(t.start)} – ${U.date(t.end)} (${days(PM.diffDays(t.start, t.end) + 1)})\nความคืบหน้า ${U.num(t.progress || 0)}%${t.owner ? '\nผู้รับผิดชอบ ' + t.owner : ''}${PM.taskLate(t, T) ? `\nล่าช้า — เลยกำหนด ${days(PM.diffDays(t.end, T))}` : ''}`;

  /* ---------------- project page → Timeline · Gantt ---------------- */
  PM.timelineTab = function (el, p, m, rerender) {
    const T = PM.today();
    const canEdit = PM.can('timeline.edit');
    const st = PM.timelineStats(p, m, T);
    const tasks = st.tasks, ms = st.milestones;
    const fold = folded[p.id] || (folded[p.id] = {});
    const known = PM.PHASES.map((x) => x.key);

    /* summary tiles */
    const V = PM.common;
    const slipTxt = st.slip > 0 ? U.badge(st.slip > 30 ? 'critical' : 'warning', `ช้ากว่าแผน ${days(st.slip)}`)
      : st.slip < 0 ? U.badge('good', `เร็วกว่าแผน ${days(st.slip)}`) : U.badge('good', 'ตามแผน');
    const tiles = `<div class="grid cols-5">
      ${V.tile({ label: 'ระยะเวลาตามแผน', tag: 'Time', value: `${U.num(st.dur)} <small>วัน</small>`, sub: `${U.date(p.startDate)} – ${U.date(p.endDate)}`, icon: 'calendar' })}
      ${V.tile({ label: 'เวลาที่ผ่านไป', value: U.pct(st.elapsed / st.dur), sub: st.closed ? 'ปิดโครงการแล้ว' : st.remaining >= 0 ? `เหลือ ${days(st.remaining)} · งานเสร็จ ${U.pct(m.act)}` : U.badge('critical', `เลยกำหนดเสร็จ ${days(st.remaining)}`), tip: `ผ่านไป ${days(st.elapsed)} จาก ${days(st.dur)}\nงานเสร็จจริง ${U.pct(m.act, 1)} · ตามแผน ${U.pct(m.plan, 1)}` })}
      ${V.tile({ label: st.closed ? 'เสร็จจริง' : 'คาดว่าจะเสร็จ', tag: st.closed ? '' : 'Forecast', value: U.date(st.forecast), sub: slipTxt, tip: st.closed ? 'วันที่ phase สุดท้ายเสร็จจริง' : `Forecast = Start + ระยะเวลาตามแผน ÷ SPI\nSPI ${U.ratio(m.spi)} · Plan finish ${U.date(p.endDate)}` })}
      ${V.tile({ label: 'Milestones', value: `${st.msDone} <small>/ ${ms.length}</small>`, sub: st.msLate.length ? U.badge('critical', `เลยกำหนด ${st.msLate.length}`) + (st.msNext ? ` ถัดไป ${esc(st.msNext.name)}` : '') : st.msNext ? `ถัดไป: ${esc(st.msNext.name)} · ${U.date(st.msNext.date)}` : ms.length ? U.badge('good', 'ครบทุก milestone') : 'ยังไม่มี milestone' })}
      ${V.tile({ label: 'กิจกรรม', value: `${st.tasksDone} <small>/ ${tasks.length} เสร็จ</small>`, sub: st.tasksLate.length ? U.badge('critical', `ล่าช้า ${st.tasksLate.length} กิจกรรม`) : tasks.length ? U.badge('good', 'ไม่มีงานล่าช้า') : 'ยังไม่มีกิจกรรม' })}
    </div>`;

    /* Gantt rows: project summary → each phase (plan bar + actual line) → its activities → its milestones */
    const rows = [];
    rows.push({
      cls: 'sum', label: `<b>${esc(p.code)}</b> ทั้งโครงการ`, sub: `${U.date(p.startDate)} – ${U.date(p.endDate)} · เสร็จ ${U.pct(m.act)}`,
      bars: [{ start: p.startDate, end: p.endDate, cls: 'sum', progress: m.act * 100, tip: `${p.code} ${p.name}\nแผน ${U.date(p.startDate)} – ${U.date(p.endDate)}\nงานเสร็จ ${U.pct(m.act, 1)} · ตามแผน ${U.pct(m.plan, 1)}` }]
        .concat(st.forecast > p.endDate ? [{ start: p.endDate, end: st.forecast, cls: 'slip', tip: `${st.closed ? 'เสร็จจริง' : 'คาดว่าจะเสร็จ'} ${U.date(st.forecast)}\nช้ากว่าแผน ${days(st.slip)}` }] : []),
    });
    const msRow = (x) => {
      const s = msStatus(x, T);
      return {
        cls: 'ms', label: `<span class="gl-dia ${s.cls}" aria-hidden="true"></span>${esc(x.name)}`, sub: `${U.date(x.actual || x.date)} · ${s.text}`,
        attrs: ` data-tl="ms" data-id="${esc(x.id)}"`,
        marks: [{ date: x.actual || x.date, cls: s.cls, tip: msTip(x, T), attrs: ` data-tl="ms" data-id="${esc(x.id)}"` }],
      };
    };
    m.phases.forEach((ph) => {
      const mine = tasks.filter((t) => t.phase === ph.key).sort((a, b) => String(a.start).localeCompare(String(b.start)));
      const myMs = ms.filter((x) => x.phase === ph.key);
      const closed = !!fold[ph.key];
      const behind = ph.plannedPct - ph.actualPct;
      const late = ph.actualPct < 1 && behind > 0.1;
      const lateN = mine.filter((t) => PM.taskLate(t, T)).length;
      const actEnd = ph.actEnd || (ph.actStart && ph.actualPct < 1 ? T : '');
      rows.push({
        cls: 'grp' + (closed ? ' folded' : ''),
        label: `<button type="button" class="gantt-fold" data-tl="fold" data-key="${ph.key}" aria-expanded="${!closed}" aria-label="${closed ? 'ขยาย' : 'ยุบ'} ${esc(phaseOf(ph.key).label)}"${mine.length || myMs.length ? '' : ' disabled'}></button><i class="gl-sw" style="background:${phaseColor(ph.key)}"></i>${esc(phaseOf(ph.key).label)}${lateN ? ` ${U.badge('critical', `${lateN} ล่าช้า`)}` : ''}`,
        sub: `${U.date(ph.planStart)} – ${U.date(ph.planEnd)} · เสร็จ ${U.pct(ph.actualPct)}`,
        bars: [{ start: ph.planStart, end: ph.planEnd, cls: 'click' + (late ? ' late' : ''), color: phaseColor(ph.key), progress: ph.actualPct * 100,
          attrs: ` data-action="phase" data-key="${ph.key}"`,
          tip: `${phaseOf(ph.key).label} — ${phaseOf(ph.key).th}\nแผน ${U.date(ph.planStart)} – ${U.date(ph.planEnd)}\nจริง ${U.date(ph.actStart)} – ${ph.actEnd ? U.date(ph.actEnd) : ph.actStart ? 'กำลังทำ' : '–'}\nเสร็จ ${U.pct(ph.actualPct, 1)} · ตามแผน ${U.pct(ph.plannedPct, 1)}\nคลิกเพื่ออัปเดต phase` }]
          .concat(ph.actStart && actEnd ? [{ start: ph.actStart, end: actEnd, cls: 'act', color: phaseColor(ph.key), tip: `ช่วงเวลาทำจริง\n${U.date(ph.actStart)} – ${ph.actEnd ? U.date(ph.actEnd) : 'วันนี้ (กำลังทำ)'}` }] : []),
        marks: closed ? myMs.map((x) => ({ date: x.actual || x.date, cls: msStatus(x, T).cls, tip: msTip(x, T), attrs: ` data-tl="ms" data-id="${esc(x.id)}"` })) : [],
      });
      if (closed) return;
      mine.forEach((t) => {
        const lt = PM.taskLate(t, T), done = (t.progress || 0) >= 100;
        rows.push({
          cls: 'task', attrs: ` data-tl="task" data-id="${esc(t.id)}"`,
          label: `${esc(t.name)}${lt ? ` <span class="gl-late">ล่าช้า</span>` : done ? ' <span class="gl-done">✓</span>' : ''}`,
          sub: `${U.date(t.start)} – ${U.date(t.end)} · ${U.num(t.progress || 0)}%${t.owner ? ' · ' + esc(t.owner) : ''}`,
          bars: [{ start: t.start, end: t.end, cls: 'click' + (lt ? ' late' : ''), color: phaseColor(ph.key), progress: t.progress || 0, tip: taskTip(t, T), attrs: ` data-tl="task" data-id="${esc(t.id)}"` }],
        });
      });
      myMs.forEach((x) => rows.push(msRow(x)));
    });
    const loose = ms.filter((x) => !known.includes(x.phase));
    if (loose.length) { rows.push({ cls: 'grp', label: 'Milestones อื่น ๆ' }); loose.forEach((x) => rows.push(msRow(x))); }

    const rg = rangeOf([p.startDate, p.endDate, st.forecast, T > p.endDate && !st.closed ? T : null]
      .concat(p.phases.map((ph) => ph.actStart), p.phases.map((ph) => ph.actEnd), tasks.map((t) => t.start), tasks.map((t) => t.end), ms.map((x) => x.date), ms.map((x) => x.actual)));

    /* milestones table + activities to follow up (late, or due in the next 14 days) */
    const soon = PM.addDays(T, 14);
    const follow = tasks.filter((t) => (t.progress || 0) < 100 && (t.end < T || t.end <= soon))
      .sort((a, b) => String(a.end).localeCompare(String(b.end)));
    const msTable = ms.length ? `<table class="tbl"><thead><tr><th>Milestone</th><th>Phase</th><th>แผน</th><th>จริง</th><th>สถานะ</th></tr></thead><tbody>
      ${ms.map((x) => { const s = msStatus(x, T); return `<tr class="click" data-tl="ms" data-id="${esc(x.id)}">
        <td><span class="title"><span class="gl-dia ${s.cls}" aria-hidden="true"></span> ${esc(x.name)}</span>${x.note ? `<small>${esc(x.note)}</small>` : ''}</td>
        <td>${esc(U.phaseLabel(x.phase))}</td><td class="nowrap">${U.date(x.date)}</td><td class="nowrap">${U.date(x.actual)}</td>
        <td>${U.badge(s.level, s.text)}</td></tr>`; }).join('')}</tbody></table>`
      : `<p class="empty">ยังไม่มี Milestone${canEdit ? ' — กด "+ Milestone"' : ''}</p>`;
    const followTable = follow.length ? `<table class="tbl"><thead><tr><th>กิจกรรม</th><th>กำหนดเสร็จ</th><th style="min-width:120px">ความคืบหน้า</th><th>สถานะ</th></tr></thead><tbody>
      ${follow.map((t) => { const lt = t.end < T; return `<tr class="click" data-tl="task" data-id="${esc(t.id)}">
        <td><span class="title">${esc(t.name)}</span><small>${esc(U.phaseLabel(t.phase))}${t.owner ? ' · ' + esc(t.owner) : ''}</small></td>
        <td class="nowrap">${U.date(t.end)}</td>
        <td><div class="pbar-wrap">${U.progress((t.progress || 0) / 100, null)}<span class="num">${U.num(t.progress || 0)}%</span></div></td>
        <td>${lt ? U.badge('critical', `เลยกำหนด ${days(PM.diffDays(t.end, T))}`) : U.badge('warning', t.end === T ? 'ครบกำหนดวันนี้' : `อีก ${days(PM.diffDays(T, t.end))}`)}</td></tr>`; }).join('')}</tbody></table>`
      : `<p class="empty">${tasks.length ? 'ไม่มีกิจกรรมที่ล่าช้าหรือครบกำหนดใน 14 วัน' : 'ยังไม่มีกิจกรรม'}</p>`;

    const empty = !tasks.length && !ms.length;
    el.innerHTML = `
      ${tiles}
      ${empty ? `<div class="callout">โครงการนี้ยังไม่มีกิจกรรมและ Milestone — Gantt แสดงเฉพาะ 4 phase${canEdit ? ' · กด <b>สร้างจากแม่แบบ</b> เพื่อเพิ่มกิจกรรมมาตรฐาน 3 รายการต่อ phase และ 5 Milestone ตามวันที่ของแต่ละ phase (แก้ไขภายหลังได้)' : ''}</div>` : ''}
      <div class="card">
        <div class="card-h"><h2>Gantt Chart</h2><p>แท่ง = ช่วงเวลาตามแผน (สีเข้ม = % เสร็จ) · เส้นใต้แท่ง phase = ช่วงเวลาทำจริง · ◆ = Milestone · เส้นแดง = วันนี้ · ขอบแดง = ล่าช้า${canEdit ? ' · คลิกแท่งเพื่อแก้ไข' : ''}</p>
          <span class="spacer"></span>
          <div class="row gantt-tools">
            ${tasks.length || ms.length ? '<button type="button" class="btn sm" data-tl="fold-all">ยุบทั้งหมด</button><button type="button" class="btn sm" data-tl="open-all">ขยายทั้งหมด</button>' : ''}
            ${canEdit && empty ? '<button type="button" class="btn sm" data-tl="template">สร้างจากแม่แบบ</button>' : ''}
            ${canEdit ? '<button type="button" class="btn sm" data-tl="new-ms">+ Milestone</button><button type="button" class="btn sm primary" data-tl="new-task">+ กิจกรรม</button>' : ''}
          </div></div>
        <div class="card-b flush">${PM.gantt({ from: rg.from, to: rg.to, today: T, rows, labelHead: 'Phase / กิจกรรม' })}</div>
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>Milestones</h2><p>${st.msDone} / ${ms.length} สำเร็จ${st.msLate.length ? ` · เลยกำหนด ${st.msLate.length}` : ''}</p></div><div class="card-b flush table-wrap">${msTable}</div></div>
        <div class="card"><div class="card-h"><h2>กิจกรรมที่ต้องติดตาม</h2><p>ล่าช้า และครบกำหนดภายใน 14 วัน</p></div><div class="card-b flush table-wrap">${followTable}</div></div>
      </div>`;

    el.onclick = (e) => {
      const a = e.target.closest('[data-tl]');
      if (!a) return;
      const act = a.dataset.tl, id = a.dataset.id;
      if (act === 'fold') { fold[a.dataset.key] = !fold[a.dataset.key]; rerender(); }
      if (act === 'fold-all') { PM.PHASES.forEach((x) => (fold[x.key] = true)); rerender(); }
      if (act === 'open-all') { PM.PHASES.forEach((x) => (fold[x.key] = false)); rerender(); }
      if (act === 'template' && canEdit) { Object.assign(p, PM.buildTimeline(p)); PM.upsert('projects', p); U.toast('สร้างกิจกรรมและ Milestone จากแม่แบบแล้ว'); rerender(); }
      if (act === 'new-task') taskForm(p, null, rerender);
      if (act === 'new-ms') msForm(p, null, rerender);
      if (act === 'task') taskForm(p, (p.tasks || []).find((t) => t.id === id), rerender);
      if (act === 'ms') msForm(p, (p.milestones || []).find((x) => x.id === id), rerender);
    };
  };

  /* ---------------- add / edit an activity ---------------- */
  function taskForm(p, task, done) {
    const T = PM.today();
    const canEdit = PM.can('timeline.edit');
    if (!task && !canEdit) return;
    const cur = PM.projectMetrics(p).current;
    const t = task || { id: PM.uid('T'), phase: cur ? cur.key : 'engineering', name: '', start: T, end: PM.addDays(T, 14), progress: 0, owner: '', note: '' };
    const form = U.modal({
      title: task ? (canEdit ? 'แก้ไขกิจกรรม' : 'กิจกรรม') : `เพิ่มกิจกรรม — ${p.code}`, wide: true,
      onDelete: task && canEdit ? () => { p.tasks = (p.tasks || []).filter((x) => x.id !== t.id); PM.upsert('projects', p); U.toast('ลบกิจกรรมแล้ว'); done(); } : null,
      body: `
        ${U.field('ชื่อกิจกรรม', 'name', t.name, { required: true, full: true, placeholder: 'เช่น ติดตั้งโครงสร้างหลังคา Zone A' })}
        ${U.field('Phase', 'phase', t.phase, { options: PM.PHASES.map((x) => ({ value: x.key, label: x.label })) })}
        ${U.field('ผู้รับผิดชอบ', 'owner', t.owner, { placeholder: 'ชื่อ / ทีม / Sub-con' })}
        ${U.field('เริ่ม (แผน)', 'start', t.start, { type: 'date', required: true })}
        ${U.field('เสร็จ (แผน)', 'end', t.end, { type: 'date', required: true })}
        ${U.field('ความคืบหน้า (%)', 'progress', t.progress || 0, { type: 'number', min: 0, max: 100, step: 1, hint: '100 = เสร็จแล้ว' })}
        <span></span>
        ${U.field('หมายเหตุ', 'note', t.note, { type: 'textarea', full: true, rows: 2 })}`,
      onSubmit: canEdit ? (f) => {
        if (!f.name) { alert('กรุณากรอกชื่อกิจกรรม'); return false; }
        if (f.end < f.start) { alert('วันเสร็จต้องไม่ก่อนวันเริ่ม'); return false; }
        f.progress = Math.max(0, Math.min(100, f.progress));
        Object.assign(t, f);
        p.tasks = p.tasks || [];
        if (!p.tasks.includes(t)) p.tasks.push(t);
        PM.upsert('projects', p);
        U.toast(task ? 'บันทึกกิจกรรมแล้ว' : 'เพิ่มกิจกรรมแล้ว');
        done();
      } : null,
    });
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
  }

  /* ---------------- add / edit a milestone ---------------- */
  function msForm(p, ms, done) {
    const canEdit = PM.can('timeline.edit');
    if (!ms && !canEdit) return;
    const cur = PM.projectMetrics(p).current;
    const x = ms || { id: PM.uid('M'), name: '', phase: cur ? cur.key : 'engineering', date: PM.today(), actual: '', note: '' };
    const form = U.modal({
      title: ms ? (canEdit ? 'แก้ไข Milestone' : 'Milestone') : `เพิ่ม Milestone — ${p.code}`, wide: true,
      onDelete: ms && canEdit ? () => { p.milestones = (p.milestones || []).filter((y) => y.id !== x.id); PM.upsert('projects', p); U.toast('ลบ Milestone แล้ว'); done(); } : null,
      body: `
        ${U.field('ชื่อ Milestone', 'name', x.name, { required: true, full: true, placeholder: 'เช่น Mechanical completion, FAT, COD' })}
        ${U.field('Phase', 'phase', x.phase, { options: PM.PHASES.map((y) => ({ value: y.key, label: y.label })) })}
        <span></span>
        ${U.field('วันที่ตามแผน', 'date', x.date, { type: 'date', required: true })}
        ${U.field('วันที่สำเร็จจริง', 'actual', x.actual, { type: 'date', hint: 'เว้นว่างไว้จนกว่าจะถึง milestone นี้' })}
        ${U.field('หมายเหตุ', 'note', x.note, { type: 'textarea', full: true, rows: 2 })}`,
      onSubmit: canEdit ? (f) => {
        if (!f.name) { alert('กรุณากรอกชื่อ Milestone'); return false; }
        if (!f.date) { alert('กรุณาเลือกวันที่ตามแผน'); return false; }
        Object.assign(x, f);
        p.milestones = p.milestones || [];
        if (!p.milestones.includes(x)) p.milestones.push(x);
        PM.upsert('projects', p);
        U.toast(ms ? 'บันทึก Milestone แล้ว' : 'เพิ่ม Milestone แล้ว');
        done();
      } : null,
    });
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
  }

  /* ---------------- Projects page: all projects on one timeline ----------------
     each project = 4 thin phase lanes (plan dates, filled to % done) + milestones + forecast slip; click → its Timeline tab */
  PM.portfolioGantt = function (rows) {
    if (!rows.length) return '<p class="empty">ไม่มีโครงการในมุมมองนี้</p>';
    const T = PM.today();
    const list = rows.map((r) => Object.assign({ st: PM.timelineStats(r.p, r.m, T) }, r))
      .sort((a, b) => String(a.p.startDate).localeCompare(String(b.p.startDate)));
    const rg = rangeOf([T].concat(list.map((r) => r.p.startDate), list.map((r) => r.p.endDate), list.map((r) => r.st.forecast)));
    const gRows = list.map(({ p, m, st }) => {
      const open = ` data-open-timeline="${esc(p.id)}"`;
      return {
        cls: 'prj' + (p.status === 'closed' ? ' closed' : ''), attrs: open,
        label: `<b>${esc(p.code)}</b>${p.status === 'closed' ? ' <span class="chip">Closed</span>' : ''}${st.slip > 0 && !st.closed ? ` <span class="gl-late">+${U.num(st.slip)} วัน</span>` : ''}`,
        sub: `${esc(p.name)}`,
        bars: m.phases.map((ph, i) => ({
          start: ph.planStart, end: ph.planEnd, cls: 'lane click', color: phaseColor(ph.key), progress: ph.actualPct * 100, attrs: open, style: `top:${7 + i * 7}px;`,
          tip: `${p.code} · ${phaseOf(ph.key).label}\n${U.date(ph.planStart)} – ${U.date(ph.planEnd)}\nเสร็จ ${U.pct(ph.actualPct, 1)} · ตามแผน ${U.pct(ph.plannedPct, 1)}`,
        })).concat(st.forecast > p.endDate ? [{ start: p.endDate, end: st.forecast, cls: 'slip lane', style: 'top:14px;', tip: `${st.closed ? 'เสร็จจริง' : 'คาดว่าจะเสร็จ'} ${U.date(st.forecast)}\nช้ากว่าแผน ${days(st.slip)}` }] : []),
        marks: st.milestones.map((x) => ({ date: x.actual || x.date, cls: msStatus(x, T).cls + ' sm', tip: `${p.code}\n${msTip(x, T)}`, attrs: open })),
      };
    });
    return PM.gantt({ from: rg.from, to: rg.to, today: T, rows: gRows, labelHead: 'โครงการ', labelW: 230 });
  };
  PM.portfolioGanttLegend = () => `<div class="legend">${PM.PHASES.map((ph) => `<span><i class="sw" style="background:${phaseColor(ph.key)}"></i>${esc(ph.label)}</span>`).join('')}
    <span><i class="gl-dia"></i>Milestone</span><span><i class="sw slip-sw"></i>คาดว่าจะช้ากว่าแผน</span><span><i class="sw today-sw"></i>วันนี้</span></div>`;
})();
