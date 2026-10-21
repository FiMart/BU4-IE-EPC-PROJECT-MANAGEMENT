/* meetings.js — Minutes of Meeting (project tab "ประชุม (MOM)")
   Each meeting: type · title · date / time · place · attendees · what was discussed · next meeting ·
   action items (what · who · by when · done) — open actions of every meeting are listed together at the top,
   past their date they show on the bell (mine = my name on it). Printable as a PDF to send to everyone.
   Data: collection 'meetings' = [{ id, projectId, no, date, time, type, title, place, attendees, discussion, nextDate,
          actions: [{ id, text, owner, due, done, doneDate }], createdBy, createdByName }]. No SQL needed. */
(function () {
  const U = PM.ui, esc = U.esc;
  const TYPES = ['Kick-off', 'ประชุมความคืบหน้า (Progress)', 'ประชุมเทคนิค (Technical)', 'ประชุมหน้างาน (Site)', 'ประชุมภายใน (Internal)', 'ส่งมอบงาน (Handover)'];
  const listOf = (p) => (PM.db.meetings || []).filter((x) => x.projectId === p.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const nextNo = (p) => 'MOM-' + String(listOf(p).reduce((m, x) => Math.max(m, parseInt(String(x.no || '').slice(4), 10) || 0), 0) + 1).padStart(3, '0');
  PM.actionLate = (a, T) => !a.done && a.due && a.due < (T || PM.today());
  /* every open action of one project (or all projects), with its meeting */
  PM.openActions = (projectId) => (PM.db.meetings || []).filter((mt) => !projectId || mt.projectId === projectId)
    .flatMap((mt) => (mt.actions || []).filter((a) => !a.done).map((a) => ({ a, mt }))).sort((x, y) => String(x.a.due || '9').localeCompare(String(y.a.due || '9')));

  PM.meetingsTab = function (el, p, m, rerender) {
    const T = PM.today(), canEdit = PM.can('meeting.edit');
    const list = listOf(p), open = PM.openActions(p.id);
    const late = open.filter(({ a }) => PM.actionLate(a, T));
    el.innerHTML = `
      <div class="row">
        <p class="muted" style="margin:0">บันทึกการประชุมกับลูกค้า / ผู้รับเหมา / ทีม — Action ที่ยังไม่เสร็จรวมไว้ด้านบน และเตือนที่กระดิ่งเมื่อเลยกำหนด</p>
        <span class="spacer"></span>
        ${canEdit ? '<button class="btn primary" data-mt="new">+ บันทึกการประชุม</button>' : ''}
      </div>
      <div class="grid cols-3">
        ${PM.common.tile({ label: 'การประชุม', value: list.length, sub: list.length ? `ล่าสุด ${U.date(list[0].date)} · ${esc(list[0].title || list[0].type)}` : 'ยังไม่มี', icon: 'people' })}
        ${PM.common.tile({ label: 'Action ค้าง', value: open.length, sub: late.length ? U.badge('critical', `เลยกำหนด ${late.length}`) : U.badge('good', 'ไม่มีเลยกำหนด'), icon: 'tasks' })}
        ${PM.common.tile({ label: 'ประชุมครั้งถัดไป', value: (() => { const n = list.map((x) => x.nextDate).filter((d) => d && d >= T).sort()[0]; return n ? U.date(n) : '–'; })(), sub: 'จากบันทึกการประชุมล่าสุด', icon: 'calendar' })}
      </div>
      <div class="card"><div class="card-h"><h2>Action ที่ยังไม่เสร็จ</h2>${open.length ? U.badge('warning', `${open.length} รายการ`) : ''}<p>ติ๊ก ✓ เมื่อทำเสร็จ · คลิกเลข MOM เพื่อเปิดบันทึกการประชุม</p></div>
        <div class="card-b flush table-wrap">${open.length ? `<table class="tbl"><thead><tr>${canEdit ? '<th class="pi-sel">เสร็จ</th>' : ''}<th>สิ่งที่ต้องทำ</th><th>ผู้รับผิดชอบ</th><th>กำหนด</th><th>จากการประชุม</th></tr></thead><tbody>
          ${open.map(({ a, mt }) => `<tr${PM.actionLate(a, T) ? ' class="pl-late"' : ''}>
            ${canEdit ? `<td class="pi-sel"><input type="checkbox" data-act-done="${esc(mt.id)}|${esc(a.id)}" aria-label="ทำเสร็จแล้ว"></td>` : ''}
            <td>${esc(a.text)}</td><td>${esc(a.owner || '–')}</td>
            <td class="nowrap">${U.date(a.due)}${PM.actionLate(a, T) ? `<small class="neg">เลย ${PM.diffDays(a.due, T)} วัน</small>` : ''}</td>
            <td class="nowrap"><button type="button" class="link-btn" data-mt="open" data-id="${esc(mt.id)}">${esc(mt.no)}</button><small>${U.date(mt.date)}</small></td></tr>`).join('')}
          </tbody></table>` : '<p class="empty">ไม่มี Action ค้าง</p>'}</div></div>
      <div class="card"><div class="card-h"><h2>บันทึกการประชุม — ${esc(p.code)}</h2><p>คลิกแถวเพื่อเปิด · 🖨 พิมพ์ PDF ส่งผู้เข้าร่วม</p></div>
        <div class="card-b flush table-wrap">${list.length ? `<table class="tbl"><thead><tr><th>เลขที่</th><th>วันที่</th><th>ประเภท / หัวข้อ</th><th class="num">Action</th><th>ผู้บันทึก</th><th></th></tr></thead><tbody>
          ${list.map((x) => { const acts = x.actions || [], left = acts.filter((a) => !a.done).length; return `<tr class="click" data-mt="open" data-id="${esc(x.id)}">
            <td class="nowrap"><b>${esc(x.no)}</b></td><td class="nowrap">${U.date(x.date)}${x.time ? `<small>${esc(x.time)}</small>` : ''}</td>
            <td><b>${esc(x.title || x.type)}</b><small>${esc(x.type)}${x.place ? ' · ' + esc(x.place) : ''}</small></td>
            <td class="num">${acts.length ? `${acts.length - left} / ${acts.length}` : '–'}${left ? `<small>ค้าง ${left}</small>` : ''}</td>
            <td><small>${esc(x.createdByName || '–')}</small></td>
            <td><button type="button" class="btn sm" data-mt="print" data-id="${esc(x.id)}">🖨 พิมพ์</button></td></tr>`; }).join('')}
          </tbody></table>` : `<p class="empty">ยังไม่มีบันทึกการประชุม${canEdit ? ' — กด "+ บันทึกการประชุม"' : ''}</p>`}</div></div>`;

    el.onchange = (e) => {
      const cb = e.target.closest('[data-act-done]');
      if (!cb || !canEdit) return;
      const [mid, aid] = cb.dataset.actDone.split('|');
      const mt = (PM.db.meetings || []).find((x) => x.id === mid), a = mt && (mt.actions || []).find((x) => x.id === aid);
      if (!a) return;
      a.done = cb.checked; a.doneDate = cb.checked ? PM.today() : '';
      PM.upsert('meetings', mt); U.toast(`✓ ${a.text}`); rerender();
    };
    el.onclick = (e) => {
      if (e.target.closest('input')) return;
      const b = e.target.closest('[data-mt]');
      if (!b) return;
      const mt = b.dataset.id && (PM.db.meetings || []).find((x) => x.id === b.dataset.id);
      if (b.dataset.mt === 'print') { e.stopPropagation(); if (mt) PM.meetingPrint(p, mt); return; }
      if (b.dataset.mt === 'new') meetingForm(p, null, rerender);
      if (b.dataset.mt === 'open' && mt) meetingForm(p, mt, rerender);
    };
  };

  /* one action row in the form (inputs have no name: the rows are read by hand on save) */
  const actRow = (a) => `<div class="mt-act" data-act="${esc(a.id)}">
      <input type="checkbox" class="mt-done" ${a.done ? 'checked' : ''} aria-label="เสร็จแล้ว" title="เสร็จแล้ว">
      <input type="text" class="mt-text" value="${esc(a.text || '')}" placeholder="สิ่งที่ต้องทำ">
      <input type="text" class="mt-owner" value="${esc(a.owner || '')}" placeholder="ผู้รับผิดชอบ" list="mt-people">
      <input type="date" class="mt-due" value="${esc(a.due || '')}" aria-label="กำหนด">
      <button type="button" class="icon-btn" data-act-del aria-label="ลบ Action">✕</button></div>`;

  function meetingForm(p, item, done) {
    const canEdit = PM.can('meeting.edit');
    const u = PM.auth && PM.auth.user;
    const T = PM.today();
    const x = item || { id: PM.uid('MT'), projectId: p.id, no: nextNo(p), date: T, time: '10:00', type: TYPES[1], title: '', place: '', attendees: '', discussion: '', nextDate: PM.addDays(T, 7), actions: [] };
    const people = Array.from(new Set(PM.db.resources.filter((r) => r.active !== false).map((r) => r.name).concat(p.client ? [p.client] : [])));
    const form = U.modal({
      title: item ? `${x.no} · ${x.title || x.type}` : `บันทึกการประชุม — ${p.code}`, wide: true,
      onDelete: item && canEdit ? () => { PM.remove('meetings', x.id); U.toast('ลบแล้ว'); done(); } : null,
      body: `
        ${U.field('เลขที่', 'no', x.no, { required: true })}
        ${U.field('ประเภท', 'type', x.type, { options: TYPES.includes(x.type) ? TYPES : TYPES.concat(x.type) })}
        ${U.field('หัวข้อการประชุม', 'title', x.title, { full: true, placeholder: 'เช่น ประชุมความคืบหน้าประจำสัปดาห์ครั้งที่ 12' })}
        ${U.field('วันที่', 'date', x.date, { type: 'date', required: true })}
        ${U.field('เวลา', 'time', x.time, { type: 'time' })}
        ${U.field('สถานที่ / ช่องทาง', 'place', x.place, { placeholder: 'เช่น ห้องประชุมไซต์งาน · Microsoft Teams' })}
        ${U.field('ประชุมครั้งถัดไป', 'nextDate', x.nextDate, { type: 'date' })}
        ${U.field('ผู้เข้าร่วม', 'attendees', x.attendees, { type: 'textarea', rows: 2, full: true, placeholder: 'หนึ่งบรรทัดต่อคน เช่น คุณสมชาย (PM) · คุณวิไล (ลูกค้า)' })}
        ${U.field('สาระสำคัญ / ข้อสรุป', 'discussion', x.discussion, { type: 'textarea', rows: 6, full: true, placeholder: '1. ความคืบหน้างาน ...\n2. ปัญหา ...\n3. ข้อสรุป ...' })}
        <div class="full"><div class="sub-h" style="margin-bottom:8px">Action — สิ่งที่ต้องทำต่อ</div>
          <datalist id="mt-people">${people.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
          <div class="mt-acts">${(x.actions || []).map(actRow).join('')}</div>
          ${canEdit ? '<button type="button" class="btn sm" data-act-add>+ เพิ่ม Action</button>' : ''}</div>`,
      onSubmit: !canEdit ? null : (f, frm) => {
        if (listOf(p).some((i) => i.id !== x.id && i.no.toUpperCase() === f.no.toUpperCase())) { U.alert(`เลขที่ ${f.no} มีอยู่แล้ว`); return false; }
        const old = {}; (x.actions || []).forEach((a) => (old[a.id] = a));
        const actions = Array.from(frm.querySelectorAll('.mt-act')).map((row) => {
          const id = row.dataset.act, was = old[id] || {}, isDone = row.querySelector('.mt-done').checked;
          return { id, text: row.querySelector('.mt-text').value.trim(), owner: row.querySelector('.mt-owner').value.trim(), due: row.querySelector('.mt-due').value,
            done: isDone, doneDate: isDone ? was.doneDate || PM.today() : '' };
        }).filter((a) => a.text);
        Object.assign(x, f, { actions });
        if (!item) Object.assign(x, { createdBy: u ? u.id : '', createdByName: u ? PM.auth.displayName(u) : '' });
        PM.upsert('meetings', x);
        U.toast(item ? 'บันทึกแล้ว' : `บันทึก ${x.no} แล้ว — ${actions.length} Action`);
        done();
      },
    });
    const box = form.querySelector('.mt-acts');
    if (!x.actions.length && canEdit) box.insertAdjacentHTML('beforeend', actRow({ id: PM.uid('A'), due: PM.addDays(T, 7) }));
    form.addEventListener('click', (e) => {
      if (e.target.closest('[data-act-add]')) { box.insertAdjacentHTML('beforeend', actRow({ id: PM.uid('A'), due: PM.addDays(T, 7) })); box.lastElementChild.querySelector('.mt-text').focus(); }
      const del = e.target.closest('[data-act-del]');
      if (del) del.closest('.mt-act').remove();
    });
    if (!canEdit) form.querySelectorAll('input, select, textarea, button[data-act-del]').forEach((i) => { i.disabled = true; });
  }

  /* printable minutes (A4) */
  PM.meetingPrint = function (p, x) {
    const P = PM.printDoc, win = P.open();
    if (!win) return;
    const para = (t) => (String(t || '').trim() ? `<p style="margin:2px 0 0;white-space:pre-line">${esc(t)}</p>` : '<p class="none">–</p>');
    P.write(win, {
      title: `${x.no} ${p.code}`, bar: `บันทึกการประชุม ${x.no}`,
      head: {
        title: `<h1>บันทึกการประชุม (Minutes of Meeting)</h1><p><b>${esc(x.title || x.type)}</b></p><p>${esc(p.code)} · ${esc(p.name)}</p>`,
        meta: `${esc(PM.COMPANY)}<br>เลขที่ <b>${esc(x.no)}</b><br>${U.date(x.date)}${x.time ? ' · ' + esc(x.time) : ''}`,
      },
      body: `
  <section><div class="two"><div><h2>ข้อมูลการประชุม</h2>
      ${P.tbl([{ t: 'หัวข้อ' }, { t: '' }], [['ประเภท', esc(x.type)], ['สถานที่', esc(x.place || '–')], ['ประชุมครั้งถัดไป', U.date(x.nextDate)], ['ผู้บันทึก', esc(x.createdByName || '–')]])}</div>
    <div><h2>ผู้เข้าร่วม</h2>${para(x.attendees)}</div></div></section>
  <section class="flow"><h2>สาระสำคัญ / ข้อสรุป</h2>${para(x.discussion)}</section>
  <section class="flow"><h2>Action — สิ่งที่ต้องทำต่อ (${(x.actions || []).length})</h2>
    ${P.tbl([{ t: 'ลำดับ', r: 1 }, { t: 'สิ่งที่ต้องทำ' }, { t: 'ผู้รับผิดชอบ' }, { t: 'กำหนด' }, { t: 'สถานะ' }],
      (x.actions || []).map((a, i) => [String(i + 1), esc(a.text), esc(a.owner || '–'), U.date(a.due), a.done ? `เสร็จ ${U.date(a.doneDate)}` : 'ค้าง']), 'ไม่มี Action')}</section>
  <p style="font-size:10.5px;color:#3f5068;margin-top:14px">หากมีข้อแก้ไขเกี่ยวกับบันทึกการประชุมนี้ กรุณาแจ้งภายใน 3 วันทำการ มิฉะนั้นถือว่ารับรองบันทึกฉบับนี้</p>
  <div class="sign"><div>ผู้บันทึก</div><div>ผู้จัดการโครงการ</div><div>ตัวแทนลูกค้า</div></div>`,
    });
  };

  /* demo data: weekly progress meetings of the running projects, a few actions still open (one late) */
  PM.buildSampleMeetings = function (projects, T) {
    const out = [];
    projects.filter((p) => p.status !== 'closed').forEach((p, pi) => {
      [21, 14, 7].forEach((back, i) => {
        const date = PM.addDays(PM.monday(T), -back + 1);
        if (date < p.startDate) return;
        const n = i + 1;
        out.push({ id: `MT-${p.id}-${n}`, projectId: p.id, no: 'MOM-' + String(n).padStart(3, '0'), date, time: '10:00', type: TYPES[1], title: `ประชุมความคืบหน้าประจำสัปดาห์ ครั้งที่ ${n}`,
          place: 'ห้องประชุมไซต์งาน', attendees: `ผู้จัดการโครงการ\nวิศวกรโครงการ\nตัวแทน ${p.client || 'ลูกค้า'}`, nextDate: PM.addDays(date, 7),
          discussion: '1. ทบทวนความคืบหน้าตามแผน S-Curve\n2. ติดตามการส่งของจากผู้ขาย\n3. ประเด็นความปลอดภัยหน้างาน',
          actions: [
            { id: `A-${p.id}-${n}-1`, text: 'ส่งแผนงาน 2 สัปดาห์ข้างหน้าให้ลูกค้า', owner: 'ผู้จัดการโครงการ', due: PM.addDays(date, 3), done: i < 2, doneDate: i < 2 ? PM.addDays(date, 3) : '' },
            { id: `A-${p.id}-${n}-2`, text: 'ติดตามกำหนดส่งอุปกรณ์หลักกับผู้ขาย', owner: 'ฝ่ายจัดซื้อ', due: PM.addDays(date, 5), done: i === 0, doneDate: i === 0 ? PM.addDays(date, 5) : '' },
          ],
          createdBy: '', createdByName: 'Document Control' });
      });
    });
    return out;
  };
})();
