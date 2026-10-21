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
      <div class="card"><div class="card-h"><h2>Action ที่ยังไม่เสร็จ</h2>${open.length ? U.badge('warning', `${open.length} รายการ`) : ''}<p>ติ๊ก ✓ เมื่อทำเสร็จ · คลิกเลข MOM เพื่อเปิดบันทึกการประชุม</p>
        ${open.length ? '<span class="spacer"></span><button type="button" class="btn sm" data-mt="print-actions">🖨 พิมพ์รายการ Action ค้าง</button>' : ''}</div>
        <div class="card-b flush table-wrap">${open.length ? `<table class="tbl"><thead><tr>${canEdit ? '<th class="pi-sel">เสร็จ</th>' : ''}<th>สิ่งที่ต้องทำ</th><th>ผู้รับผิดชอบ</th><th>กำหนด</th><th>จากการประชุม</th></tr></thead><tbody>
          ${open.map(({ a, mt }) => `<tr${PM.actionLate(a, T) ? ' class="pl-late"' : ''}>
            ${canEdit ? `<td class="pi-sel"><input type="checkbox" data-act-done="${esc(mt.id)}|${esc(a.id)}" aria-label="ทำเสร็จแล้ว"></td>` : ''}
            <td>${esc(a.text)}</td><td>${esc(a.owner || '–')}</td>
            <td class="nowrap">${U.date(a.due)}${PM.actionLate(a, T) ? `<small class="neg">เลย ${PM.diffDays(a.due, T)} วัน</small>` : ''}</td>
            <td class="nowrap"><button type="button" class="link-btn" data-mt="open" data-id="${esc(mt.id)}">${esc(mt.no)}</button><small>${U.date(mt.date)}</small></td></tr>`).join('')}
          </tbody></table>` : '<p class="empty">ไม่มี Action ค้าง</p>'}</div></div>
      <div class="card"><div class="card-h"><h2>บันทึกการประชุม — ${esc(p.code)}</h2><p>คลิกแถวเพื่อเปิด · 🖨 พิมพ์ PDF ส่งผู้เข้าร่วม</p></div>
        <div class="card-b flush table-wrap">${list.length ? `<table class="tbl"><thead><tr><th>เลขที่</th><th>วันที่</th><th>ประเภท / หัวข้อ</th><th class="num">Action</th><th>ผู้บันทึก</th><th>เอกสาร</th></tr></thead><tbody>
          ${list.map((x) => { const acts = x.actions || [], left = acts.filter((a) => !a.done).length; return `<tr class="click" data-mt="open" data-id="${esc(x.id)}">
            <td class="nowrap"><b>${esc(x.no)}</b></td><td class="nowrap">${U.date(x.date)}${x.time ? `<small>${esc(x.time)}</small>` : ''}</td>
            <td><b>${esc(x.title || x.type)}</b><small>${esc(x.type)}${x.place ? ' · ' + esc(x.place) : ''}</small></td>
            <td class="num">${acts.length ? `${acts.length - left} / ${acts.length}` : '–'}${left ? `<small>ค้าง ${left}</small>` : ''}</td>
            <td><small>${esc(x.createdByName || '–')}</small></td>
            <td><button type="button" class="btn sm" data-mt="print" data-id="${esc(x.id)}">🖨 พิมพ์ MOM</button></td></tr>`; }).join('')}
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
      if (b.dataset.mt === 'print-actions') { PM.meetingActionsPrint(p); return; }
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
        <div class="full mt-print-row"><span class="muted">พิมพ์เป็นเอกสาร MOM (A4) ได้ทันทีจากข้อมูลในฟอร์มนี้ — บันทึกหรือยังก็ได้</span><button type="button" class="btn sm" data-mt-print>🖨 พิมพ์เอกสาร MOM</button></div>
        ${U.field('เลขที่', 'no', x.no, { required: true })}
        ${U.field('ประเภท', 'type', x.type, { options: TYPES.includes(x.type) ? TYPES : TYPES.concat(x.type) })}
        ${U.field('หัวข้อการประชุม', 'title', x.title, { full: true, placeholder: 'เช่น ประชุมความคืบหน้าประจำสัปดาห์ครั้งที่ 12' })}
        ${U.field('วันที่', 'date', x.date, { type: 'date', required: true })}
        ${U.field('เวลา', 'time', x.time, { type: 'time' })}
        ${U.field('สถานที่ / ช่องทาง', 'place', x.place, { placeholder: 'เช่น ห้องประชุมไซต์งาน · Microsoft Teams' })}
        ${U.field('ประชุมครั้งถัดไป', 'nextDate', x.nextDate, { type: 'date' })}
        ${U.field('ผู้เข้าร่วม', 'attendees', x.attendees, { type: 'textarea', rows: 3, full: true, placeholder: 'หนึ่งบรรทัดต่อคน: ชื่อ (ตำแหน่ง / หน่วยงาน)\nเช่น สมชาย ใจดี (ผู้จัดการโครงการ · Flowlab)\nวิไล รักงาน (วิศวกร · ลูกค้า)', hint: 'ใส่ตำแหน่งในวงเล็บ — เอกสารที่พิมพ์แยกเป็นคอลัมน์ชื่อ / ตำแหน่ง พร้อมช่องลงชื่อ' })}
        ${U.field('สาระสำคัญ / ข้อสรุป', 'discussion', x.discussion, { type: 'textarea', rows: 6, full: true, placeholder: '1. ความคืบหน้างาน ...\n2. ปัญหา ...\n3. ข้อสรุป ...', hint: 'ขึ้นต้นด้วยเลขข้อ (1. 2. 3.) — เอกสารที่พิมพ์แยกเป็นข้อ ๆ ให้' })}
        <div class="full"><div class="sub-h" style="margin-bottom:8px">Action — สิ่งที่ต้องทำต่อ</div>
          <datalist id="mt-people">${people.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
          <div class="mt-acts">${(x.actions || []).map(actRow).join('')}</div>
          ${canEdit ? '<button type="button" class="btn sm" data-act-add>+ เพิ่ม Action</button>' : ''}</div>`,
      onSubmit: !canEdit ? null : (f, frm) => {
        if (listOf(p).some((i) => i.id !== x.id && i.no.toUpperCase() === f.no.toUpperCase())) { U.alert(`เลขที่ ${f.no} มีอยู่แล้ว`); return false; }
        const actions = readActions(frm);
        Object.assign(x, f, { actions });
        if (!item) Object.assign(x, { createdBy: u ? u.id : '', createdByName: u ? PM.auth.displayName(u) : '' });
        PM.upsert('meetings', x);
        U.toast(item ? 'บันทึกแล้ว' : `บันทึก ${x.no} แล้ว — ${actions.length} Action`);
        done();
      },
    });
    // the action rows as they are on screen (keeps the date an action was first ticked done)
    function readActions(frm) {
      const old = {}; (x.actions || []).forEach((a) => (old[a.id] = a));
      return Array.from(frm.querySelectorAll('.mt-act')).map((row) => {
        const id = row.dataset.act, was = old[id] || {}, isDone = row.querySelector('.mt-done').checked;
        return { id, text: row.querySelector('.mt-text').value.trim(), owner: row.querySelector('.mt-owner').value.trim(), due: row.querySelector('.mt-due').value,
          done: isDone, doneDate: isDone ? was.doneDate || PM.today() : '' };
      }).filter((a) => a.text);
    }
    const box = form.querySelector('.mt-acts');
    if (!x.actions.length && canEdit) box.insertAdjacentHTML('beforeend', actRow({ id: PM.uid('A'), due: PM.addDays(T, 7) }));
    form.addEventListener('click', (e) => {
      // print what is on screen now — saved or not (the record itself is not changed)
      if (e.target.closest('[data-mt-print]')) { PM.meetingPrint(p, Object.assign({}, x, U.formData(form), { actions: readActions(form) })); return; }
      if (e.target.closest('[data-act-add]')) { box.insertAdjacentHTML('beforeend', actRow({ id: PM.uid('A'), due: PM.addDays(T, 7) })); box.lastElementChild.querySelector('.mt-text').focus(); }
      const del = e.target.closest('[data-act-del]');
      if (del) del.closest('.mt-act').remove();
    });
    if (!canEdit) form.querySelectorAll('input, select, textarea, button[data-act-del]').forEach((i) => { i.disabled = true; });
  }

  /* ---------- printed minutes: a formal A4 MOM document ----------
     meeting details · attendees with a column to sign · agenda items numbered · action items ·
     actions still open from earlier meetings of the project · next meeting · distribution · sign-off */
  const MOM_CSS = `<style>
    .mom-info { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #c0ccdc; border-radius: 6px; overflow: hidden; margin-bottom: 4px; }
    .mom-info div { display: grid; grid-template-columns: 92px 1fr; border-bottom: 1px solid #e1e8f2; }
    .mom-info div:nth-child(odd) { border-right: 1px solid #e1e8f2; }
    .mom-info div:nth-last-child(-n+2) { border-bottom: 0; }
    .mom-info span { background: #edf2f9; color: #3f5068; font-weight: 700; padding: 5px 8px; }
    .mom-info b { font-weight: 600; padding: 5px 8px; }
    table.mom td.sig { width: 26%; border-bottom: 1px dotted #a3afc0; }
    table.mom td.no, table.mom th.no { width: 34px; text-align: center; }
    table.mom td.st { white-space: nowrap; }
    .mom-agenda td { padding-top: 6px; padding-bottom: 6px; }
    .mom-agenda td div { white-space: pre-line; }
    .mom-next { margin: 10px 0 0; padding: 7px 10px; border-left: 4px solid #2a78d6; background: #edf2f9; border-radius: 4px; }
    .mom-note { font-size: 10px; color: #3f5068; margin: 10px 0 0; }
    .mom-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 28px; text-align: center; font-size: 10.5px; break-inside: avoid; }
    .mom-sign div { padding-top: 34px; }
    .mom-sign i { display: block; border-top: 1px solid #3f5068; margin-bottom: 4px; }
    .mom-sign small { display: block; color: #6a7a91; }
  </style>`;
  // "คุณสมชาย (PM)" · "สมชาย - วิศวกร" · "สมชาย · ลูกค้า" · "สมชาย, ABC Co." → name + role / company
  const splitPerson = (line) => {
    const t = line.replace(/^\s*(\d+[.)]|[-•·*])\s*/, '').trim();
    let m = t.match(/^(.*?)\s*\((.+)\)\s*$/);
    if (m) return [m[1], m[2]];
    m = t.match(/^(.*?)\s+[-–·|]\s+(.+)$/) || t.match(/^(.*?),\s*(.+)$/);
    return m ? [m[1], m[2]] : [t, ''];
  };
  const people = (x) => String(x.attendees || '').split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean).map(splitPerson);
  // numbered lines ("1." "2)" "3 -") start an item; the lines under one belong to it · no numbers = one item per line
  const agenda = (text) => {
    const lines = String(text || '').split(/\r?\n/).map((s) => s.trimEnd()).filter((s) => s.trim());
    const numbered = lines.some((l) => /^\s*\d+\s*[.)-]/.test(l));
    if (!numbered) return lines.map((l) => l.trim());
    const out = [];
    lines.forEach((l) => { const m = l.match(/^\s*\d+\s*[.)-]\s*(.*)$/); if (m) out.push(m[1]); else if (out.length) out[out.length - 1] += '\n' + l.trim(); else out.push(l.trim()); });
    return out;
  };
  PM.meetingPrint = function (p, x) {
    const P = PM.printDoc, win = P.open();
    if (!win) return;
    const T = PM.today();
    const ppl = people(x), items = agenda(x.discussion), acts = x.actions || [];
    // actions of earlier meetings of this project that are still open today
    const carried = PM.openActions(p.id).filter(({ mt }) => mt.id !== x.id && (mt.date < x.date || (mt.date === x.date && mt.no < x.no)));
    const status = (a) => (a.done ? `เสร็จ ${U.date(a.doneDate)}` : PM.actionLate(a, T) ? `<span class="neg">เลยกำหนด ${PM.diffDays(a.due, T)} วัน</span>` : 'กำลังดำเนินการ');
    const tbl = (head, rows, empty, cls) => (rows.length ? `<table class="mom ${cls || ''}"><thead><tr>${head.map((h) => `<th${h === 'ลำดับ' || h === 'ข้อ' ? ' class="no"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : `<p class="none">${empty}</p>`);
    const pmName = PM.common && PM.common.pmName ? PM.common.pmName(p) : '';
    P.write(win, {
      title: `${x.no} ${p.code} ${x.date}`, bar: `บันทึกการประชุม ${x.no}`,
      head: {
        title: `<h1>บันทึกการประชุม</h1><p><b>Minutes of Meeting · ${esc(x.title || x.type)}</b></p><p>${esc(p.code)} · ${esc(p.name)}</p>`,
        meta: `${esc(PM.COMPANY)}<br>เลขที่ <b>${esc(x.no)}</b><br>${U.date(x.date)}${x.time ? ' · ' + esc(x.time) + ' น.' : ''}`,
      },
      body: `${MOM_CSS}
  <section><div class="mom-info">
      <div><span>โครงการ</span><b>${esc(p.code)} ${esc(p.name)}</b></div><div><span>ลูกค้า</span><b>${esc(p.client || '–')}</b></div>
      <div><span>ประเภท</span><b>${esc(x.type || '–')}</b></div><div><span>เลขที่</span><b>${esc(x.no)}</b></div>
      <div><span>วันที่ / เวลา</span><b>${U.date(x.date)}${x.time ? ' · ' + esc(x.time) + ' น.' : ''}</b></div><div><span>สถานที่</span><b>${esc(x.place || '–')}</b></div>
      <div><span>ผู้บันทึก</span><b>${esc(x.createdByName || '–')}</b></div><div><span>ครั้งถัดไป</span><b>${x.nextDate ? U.date(x.nextDate) : '–'}</b></div>
    </div></section>
  <section class="flow"><h2>1. ผู้เข้าร่วมประชุม (${ppl.length} ท่าน)</h2>
    ${tbl(['ลำดับ', 'ชื่อ - สกุล', 'ตำแหน่ง / หน่วยงาน', 'ลงชื่อ'], ppl.map(([n, r], i) => `<tr><td class="no">${i + 1}</td><td>${esc(n)}</td><td>${esc(r || '–')}</td><td class="sig"></td></tr>`), 'ไม่ได้ระบุผู้เข้าร่วม')}</section>
  ${carried.length ? `<section class="flow"><h2>2. ติดตาม Action จากการประชุมครั้งก่อน (${carried.length})</h2>
    ${tbl(['ลำดับ', 'สิ่งที่ต้องทำ', 'ผู้รับผิดชอบ', 'กำหนด', 'จาก', 'สถานะ'], carried.map(({ a, mt }, i) => `<tr><td class="no">${i + 1}</td><td>${esc(a.text)}</td><td>${esc(a.owner || '–')}</td><td class="st">${U.date(a.due)}</td><td class="st">${esc(mt.no)}</td><td class="st">${status(a)}</td></tr>`), '')}</section>` : ''}
  <section class="flow"><h2>${carried.length ? 3 : 2}. สาระสำคัญ / ข้อสรุปการประชุม</h2>
    ${tbl(['ข้อ', 'รายละเอียด'], items.map((t, i) => `<tr><td class="no">${i + 1}</td><td><div>${esc(t)}</div></td></tr>`), 'ไม่มีบันทึก', 'mom-agenda')}</section>
  <section class="flow"><h2>${carried.length ? 4 : 3}. Action — สิ่งที่ต้องดำเนินการ (${acts.length})</h2>
    ${tbl(['ลำดับ', 'สิ่งที่ต้องทำ', 'ผู้รับผิดชอบ', 'กำหนดเสร็จ', 'สถานะ'], acts.map((a, i) => `<tr><td class="no">${i + 1}</td><td>${esc(a.text)}</td><td>${esc(a.owner || '–')}</td><td class="st">${U.date(a.due)}</td><td class="st">${status(a)}</td></tr>`), 'ไม่มี Action จากการประชุมครั้งนี้')}</section>
  ${x.nextDate ? `<p class="mom-next"><b>การประชุมครั้งถัดไป:</b> ${U.date(x.nextDate)}${x.time ? ` เวลา ${esc(x.time)} น.` : ''}${x.place ? ` · ${esc(x.place)}` : ''}</p>` : ''}
  <p class="mom-note">สำเนาส่ง: ผู้เข้าร่วมประชุมทุกท่าน · หากมีข้อแก้ไขเกี่ยวกับบันทึกการประชุมนี้ กรุณาแจ้งผู้บันทึกภายใน 3 วันทำการนับจากวันที่ได้รับ มิฉะนั้นถือว่ารับรองบันทึกฉบับนี้</p>
  <div class="mom-sign">
    <div><i></i>ผู้บันทึกการประชุม<small>(${esc(x.createdByName || '................................')})</small><small>วันที่ ......../......../........</small></div>
    <div><i></i>ผู้จัดการโครงการ<small>(${esc(pmName || '................................')})</small><small>วันที่ ......../......../........</small></div>
    <div><i></i>ผู้แทนลูกค้า<small>(${esc(p.client || '................................')})</small><small>วันที่ ......../......../........</small></div>
  </div>`,
    });
  };

  /* every open action of the project on one page — to hand out / follow up in the next meeting */
  PM.meetingActionsPrint = function (p) {
    const P = PM.printDoc, win = P.open();
    if (!win) return;
    const T = PM.today(), open = PM.openActions(p.id);
    const late = open.filter(({ a }) => PM.actionLate(a, T));
    P.write(win, {
      title: `Action ค้าง ${p.code} ${T}`, bar: `Action ค้าง — ${p.code}`,
      head: {
        title: `<h1>รายการ Action ที่ยังไม่เสร็จ</h1><p><b>${esc(p.code)} · ${esc(p.name)}</b></p><p>จากบันทึกการประชุมทุกครั้งของโครงการ</p>`,
        meta: `${esc(PM.COMPANY)}<br>ข้อมูล ณ ${U.date(T)}<br>ค้าง ${open.length} · เลยกำหนด ${late.length}`,
      },
      body: `<section class="flow">${P.tbl([{ t: 'ลำดับ', r: 1 }, { t: 'สิ่งที่ต้องทำ' }, { t: 'ผู้รับผิดชอบ' }, { t: 'กำหนด' }, { t: 'จากการประชุม' }, { t: 'สถานะ' }],
        open.map(({ a, mt }, i) => [String(i + 1), esc(a.text), esc(a.owner || '–'), U.date(a.due), `${esc(mt.no)}<small>${U.date(mt.date)}</small>`, PM.actionLate(a, T) ? `<span class="neg">เลย ${PM.diffDays(a.due, T)} วัน</span>` : 'กำลังดำเนินการ']),
        'ไม่มี Action ค้าง')}</section>`,
    });
  };

  /* demo data: weekly progress meetings of the running projects, a few actions still open (one late) */
  PM.buildSampleMeetings = function (projects, T, resources) {
    const out = [];
    const nameOf = (id, fallback) => { const r = (resources || []).find((x) => x.id === id); return r ? r.name : fallback; };
    const engs = (resources || []).filter((r) => r.level === 'ENG');
    projects.filter((p) => p.status !== 'closed').forEach((p, pi) => {
      const eng = engs.length ? engs[(pi * 3 + 1) % engs.length].name : 'วิศวกรโครงการ';
      const who = `${nameOf(p.pm, 'ผู้จัดการโครงการ')} (ผู้จัดการโครงการ · Flowlab)\n${eng} (วิศวกรโครงการ · Flowlab)\nตัวแทนฝ่ายวิศวกรรม (${p.client || 'ลูกค้า'})`;
      [21, 14, 7].forEach((back, i) => {
        const date = PM.addDays(PM.monday(T), -back + 1);
        if (date < p.startDate) return;
        const n = i + 1;
        out.push({ id: `MT-${p.id}-${n}`, projectId: p.id, no: 'MOM-' + String(n).padStart(3, '0'), date, time: '10:00', type: TYPES[1], title: `ประชุมความคืบหน้าประจำสัปดาห์ ครั้งที่ ${n}`,
          place: 'ห้องประชุมไซต์งาน', attendees: who, nextDate: PM.addDays(date, 7),
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
