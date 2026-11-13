/* warranty.js — after handover (project tab "ประกัน & บริการ"): what is under warranty until when, the client's service
   requests, and when the retention money can be asked back.
   Warranty: the whole system or one piece of equipment · start (handover) + months = end · expiring in 60 days shows on the bell
   Service ticket: open → progress (กำลังดำเนินการ) → waiting (รออะไหล่ / รอลูกค้า) → closed
     priority sets the time to close it: urgent 2 days · normal 7 · low 14 — later than that is overdue
     in warranty or not comes from the warranty on the day it was reported (can be changed)
   Retention: held money (billing.js) is due back when the last warranty / defect liability period ends — the bell says so
   (only the roles that see project money).
   Data: collection 'warranty' = [{ id, projectId, item, serial, vendor, start, months, end, terms, note, files }]
         collection 'service'  = [{ id, projectId, no, date, reportedBy, contact, item, description, priority, inWarranty,
                                    status, assignee, visitDate, action, closedDate, cost, chargeable, files }]
   Files: Storage <projectId>/warranty/<id> · <projectId>/service/<id>. No SQL needed. Closed projects keep both. */
(function () {
  const U = PM.ui, esc = U.esc;
  const SOON = 60;
  const PRIORITY = { urgent: { label: 'ด่วน (2 วัน)', short: 'ด่วน', level: 'critical', days: 2 }, normal: { label: 'ปกติ (7 วัน)', short: 'ปกติ', level: 'warning', days: 7 }, low: { label: 'ไม่เร่งด่วน (14 วัน)', short: 'ไม่เร่ง', level: 'neutral', days: 14 } };
  const SV_STATUS = { open: { label: 'รับเรื่องแล้ว', level: 'critical' }, progress: { label: 'กำลังดำเนินการ', level: 'warning' }, waiting: { label: 'รออะไหล่ / รอลูกค้า', level: 'info' }, closed: { label: 'ปิดแล้ว', level: 'good' } };
  const wOf = (p) => (PM.db.warranty || []).filter((x) => x.projectId === p.id);
  const sOf = (p) => (PM.db.service || []).filter((x) => x.projectId === p.id);
  const endOf = (w) => w.end || (w.start && Number(w.months) ? PM.addDays(addMonths(w.start, Number(w.months)), -1) : '');
  function addMonths(d, n) { const [y, m, day] = d.split('-').map(Number); const t = new Date(y, m - 1 + n, 1); const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(); t.setDate(Math.min(day, last)); return PM.iso(t); }
  PM.warrantyState = (w, T) => { const e = endOf(w); if (!e) return { key: 'none', end: '' }; if (w.start && w.start > T) return { key: 'future', end: e }; if (e < T) return { key: 'expired', end: e }; const left = PM.diffDays(T, e); return { key: left <= SOON ? 'soon' : 'active', end: e, left }; };
  const W_LABEL = { active: ['good', 'คุ้มครองอยู่'], soon: ['warning', 'ใกล้หมดประกัน'], expired: ['neutral', 'หมดประกันแล้ว'], future: ['info', 'ยังไม่เริ่ม'], none: ['neutral', 'ไม่ได้ระบุ'] };
  PM.serviceDue = (x) => PM.addDays(x.date, (PRIORITY[x.priority] || PRIORITY.normal).days);
  PM.serviceLate = (x, T) => x.status !== 'closed' && PM.serviceDue(x) < (T || PM.today());
  /* was it under warranty on that day? (any of the project's warranties) */
  const coveredOn = (p, d) => wOf(p).some((w) => w.start && w.start <= d && endOf(w) >= d);
  PM.warrantyStats = (p, T) => {
    const ws = wOf(p).map((w) => ({ w, s: PM.warrantyState(w, T) })), ss = sOf(p);
    const ends = ws.map((x) => x.s.end).filter(Boolean).sort();
    return { ws, ss, active: ws.filter((x) => x.s.key === 'active' || x.s.key === 'soon').length, soon: ws.filter((x) => x.s.key === 'soon'), expired: ws.filter((x) => x.s.key === 'expired').length,
      open: ss.filter((x) => x.status !== 'closed').length, late: ss.filter((x) => PM.serviceLate(x, T)), lastEnd: ends[ends.length - 1] || '' };
  };
  /* retention still held and the date it can be asked back (money: the finance roles only) */
  PM.retentionDue = (p, T) => {
    if (!PM.seesProjectFinance() || !PM.billingSummary) return null;
    const held = PM.billingSummary(p, PM.projectMetrics(p)).retentionHeld || 0;
    if (held <= 0) return null;
    const s = PM.warrantyStats(p, T);
    return { held, due: s.lastEnd, ready: !!s.lastEnd && s.lastEnd < T };
  };

  PM.warrantyTab = function (el, p, m, rerender) {
    const T = PM.today(), canW = PM.can('warranty.edit'), canS = PM.can('service.edit');
    const s = PM.warrantyStats(p, T), ret = PM.retentionDue(p, T);
    const tickets = s.ss.slice().sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || String(b.date).localeCompare(String(a.date)));
    el.innerHTML = `
      <div class="row">
        <p class="muted" style="margin:0">หลังส่งมอบ: ระยะประกันของระบบ / อุปกรณ์ · ใบแจ้งซ่อมจากลูกค้า · กำหนดขอคืนเงินประกันผลงาน (Retention)</p>
        <span class="spacer"></span>
        ${canW ? '<button class="btn" data-wt="new-w">+ ระยะประกัน</button>' : ''}${canS ? '<button class="btn primary" data-wt="new-s">+ ใบแจ้งซ่อม</button>' : ''}
      </div>
      <div class="grid cols-4">
        ${PM.common.tile({ label: 'ประกันที่คุ้มครองอยู่', value: `${s.active} <small>/ ${s.ws.length}</small>`, sub: s.lastEnd ? `หมดประกันรายการสุดท้าย ${U.date(s.lastEnd)}` : 'ยังไม่ได้ตั้งระยะประกัน', icon: 'safety' })}
        ${PM.common.tile({ label: `ใกล้หมดประกัน (${SOON} วัน)`, value: s.soon.length, sub: s.soon.length ? U.badge('warning', 'ตรวจสภาพก่อนหมดประกัน') : 'ไม่มี', icon: 'clock' })}
        ${PM.common.tile({ label: 'ใบแจ้งซ่อมเปิดอยู่', value: s.open, sub: s.late.length ? U.badge('critical', `เกินกำหนดแก้ ${s.late.length}`) : s.open ? 'อยู่ในกำหนด' : U.badge('good', 'ไม่มีเรื่องค้าง'), icon: 'wrench' })}
        ${ret ? PM.common.tile({ label: 'Retention ที่ลูกค้าถือไว้', value: U.money(ret.held), sub: ret.ready ? U.badge('critical', 'หมดประกันแล้ว — ขอคืนได้') : ret.due ? `ขอคืนได้หลัง ${U.date(ret.due)}` : 'ตั้งระยะประกันเพื่อรู้วันขอคืน', icon: 'coins' })
          : PM.common.tile({ label: 'ใบแจ้งซ่อมทั้งหมด', value: s.ss.length, sub: `ในประกัน ${s.ss.filter((x) => x.inWarranty).length} · นอกประกัน ${s.ss.filter((x) => !x.inWarranty).length}`, icon: 'tasks' })}
      </div>
      <div class="card"><div class="card-h"><h2>ระยะประกัน</h2><p>Warranty / Defect Liability Period — ทั้งระบบ หรือแยกตามอุปกรณ์ · คลิกแถวเพื่อแก้ไข / แนบใบรับประกัน</p></div>
        <div class="card-b flush table-wrap">${s.ws.length ? `<table class="tbl"><thead><tr><th>รายการ</th><th>ผู้ขาย / Serial</th><th>เริ่ม</th><th>สิ้นสุด</th><th>สถานะ</th><th class="num">ไฟล์</th></tr></thead><tbody>
          ${s.ws.sort((a, b) => String(a.s.end).localeCompare(String(b.s.end))).map(({ w, s: st }) => `<tr class="click" data-w-row="${esc(w.id)}">
            <td><span class="title">${esc(w.item)}</span>${w.terms ? `<small>${esc(w.terms)}</small>` : ''}</td><td>${esc(w.vendor || '–')}${w.serial ? `<small>S/N ${esc(w.serial)}</small>` : ''}</td>
            <td class="nowrap">${U.date(w.start)}<small>${esc(w.months ? `${w.months} เดือน` : '')}</small></td><td class="nowrap">${U.date(st.end)}</td>
            <td>${U.badge(W_LABEL[st.key][0], W_LABEL[st.key][1])}${st.left != null ? `<small>เหลือ ${U.num(st.left)} วัน</small>` : ''}</td><td class="num">${(w.files || []).length ? `📎 ${w.files.length}` : '–'}</td></tr>`).join('')}
          </tbody></table>` : `<p class="empty">ยังไม่ได้ตั้งระยะประกัน${canW ? ' — กด "+ ระยะประกัน" (เริ่มนับจากวันส่งมอบ)' : ''}</p>`}</div></div>
      <div class="card"><div class="card-h"><h2>ใบแจ้งซ่อม / บริการหลังส่งมอบ</h2><p>กำหนดแก้: ด่วน 2 วัน · ปกติ 7 วัน · ไม่เร่งด่วน 14 วัน นับจากวันรับแจ้ง · เปลี่ยนสถานะได้จากตาราง</p></div>
        <div class="card-b flush table-wrap">${tickets.length ? `<table class="tbl"><thead><tr><th>เลขที่</th><th>อาการ / รายการ</th><th>ความเร่งด่วน</th><th>ประกัน</th><th>ผู้รับผิดชอบ</th><th>กำหนดแก้</th><th>สถานะ</th></tr></thead><tbody>
          ${tickets.map((x) => `<tr class="click${PM.serviceLate(x, T) ? ' pl-late' : ''}" data-s-row="${esc(x.id)}">
            <td class="nowrap"><b>${esc(x.no)}</b><small>${U.date(x.date)}</small></td>
            <td><span class="title">${esc(x.description)}</span><small>${esc([x.item, x.reportedBy && `แจ้งโดย ${x.reportedBy}`].filter(Boolean).join(' · '))}</small></td>
            <td>${U.badge(PRIORITY[x.priority].level, PRIORITY[x.priority].short)}</td>
            <td>${x.inWarranty ? U.badge('good', 'ในประกัน') : U.badge('neutral', 'นอกประกัน')}${x.chargeable ? '<small>คิดค่าบริการ</small>' : ''}</td>
            <td>${esc(x.assignee || '–')}${x.visitDate ? `<small>เข้าหน้างาน ${U.date(x.visitDate)}</small>` : ''}</td>
            <td class="nowrap">${x.status === 'closed' ? `<span class="muted">ปิด ${U.date(x.closedDate)}</span>` : U.date(PM.serviceDue(x))}${PM.serviceLate(x, T) ? `<small class="neg">เลย ${PM.diffDays(PM.serviceDue(x), T)} วัน</small>` : ''}</td>
            <td>${canS ? `<select class="pi-st sv-st-${x.status}" data-s-st="${esc(x.id)}" aria-label="สถานะ">${Object.keys(SV_STATUS).map((k) => `<option value="${k}"${k === x.status ? ' selected' : ''}>${esc(SV_STATUS[k].label)}</option>`).join('')}</select>` : U.badge(SV_STATUS[x.status].level, SV_STATUS[x.status].label)}</td></tr>`).join('')}
          </tbody></table>` : `<p class="empty">ยังไม่มีใบแจ้งซ่อม${canS ? ' — ลูกค้าแจ้งปัญหาหลังส่งมอบ กด "+ ใบแจ้งซ่อม"' : ''}</p>`}</div></div>`;

    el.onchange = (e) => {
      const sel = e.target.closest('[data-s-st]');
      if (!sel || !canS) return;
      const x = PM.find('service', sel.dataset.sSt);
      if (!x) return;
      const save = () => { x.status = sel.value; x.closedDate = x.status === 'closed' ? x.closedDate || PM.today() : ''; PM.upsert('service', x); U.toast(`${x.no} → ${SV_STATUS[x.status].label}`); rerender(); };
      if (sel.value === 'closed' && !x.action) {
        U.prompt(`แก้ไขอะไรไป — ${x.no}`, '', { title: 'ปิดใบแจ้งซ่อม', ok: 'ปิดงาน', multiline: true }).then((v) => { if (v === null) { sel.value = x.status; return; } x.action = v.trim(); save(); });
      } else save();
    };
    el.onclick = (e) => {
      if (e.target.closest('select')) return;
      const a = e.target.closest('[data-wt]');
      if (a) { if (a.dataset.wt === 'new-w') wForm(p, null, rerender); if (a.dataset.wt === 'new-s') sForm(p, null, rerender); return; }
      const w = e.target.closest('[data-w-row]');
      if (w) { wForm(p, PM.find('warranty', w.dataset.wRow), rerender); return; }
      const sv = e.target.closest('[data-s-row]');
      if (sv) sForm(p, PM.find('service', sv.dataset.sRow), rerender);
    };
  };

  function wForm(p, item, done) {
    const canEdit = PM.can('warranty.edit');
    const w = item || { id: PM.uid('WR'), projectId: p.id, item: wOf(p).length ? '' : 'ทั้งระบบ (ตามสัญญา)', serial: '', vendor: '', start: p.endDate && p.endDate <= PM.addDays(PM.today(), 60) ? p.endDate : PM.today(), months: 12, end: '', terms: '', note: '', files: [] };
    const form = U.modal({
      title: item ? w.item : `ระยะประกัน — ${p.code}`, wide: true,
      onDelete: item && canEdit ? () => { PM.poFiles.trash(`${p.id}/warranty/${w.id}`, (w.files || []).map((f) => f.path)); PM.remove('warranty', w.id); U.toast('ลบแล้ว'); done(); } : null,
      body: `
        ${U.field('รายการ', 'item', w.item, { required: true, full: true, placeholder: 'ทั้งระบบ · Flow Computer · Ultrasonic Meter FT-101' })}
        ${U.field('ผู้ขาย / ผู้ผลิต', 'vendor', w.vendor)}
        ${U.field('Serial / Tag', 'serial', w.serial)}
        ${U.field('เริ่มประกัน (วันส่งมอบ)', 'start', w.start, { type: 'date', required: true })}
        ${U.field('ระยะประกัน (เดือน)', 'months', w.months, { type: 'number', min: 0, step: 1 })}
        ${U.field('วันสิ้นสุด (เว้นว่าง = คำนวณจากเดือน)', 'end', w.end, { type: 'date' })}
        ${U.field('เงื่อนไข', 'terms', w.terms, { placeholder: 'เช่น 12 เดือนหลังส่งมอบ หรือ 18 เดือนหลังส่งของ แล้วแต่อย่างใดถึงก่อน' })}
        ${U.field('หมายเหตุ', 'note', w.note, { full: true })}
        <p class="full muted" style="margin:0" id="w-end"></p>
        ${PM.poFiles.boxHtml(canEdit, 'ใบรับประกัน / Warranty certificate', '', 'warranty')}`,
      onSubmit: !canEdit ? null : (f, frm) => {
        if (f.end && f.end < f.start) { U.alert('วันสิ้นสุดก่อนวันเริ่ม'); return false; }
        (async () => {
          const btn = frm.querySelector('[type=submit]'); btn.disabled = true; btn.classList.add('loading');
          const r = await files.commit(`${p.id}/warranty/${w.id}`, btn);
          Object.assign(w, f, { months: Number(f.months) || 0, files: r.files });
          PM.upsert('warranty', w);
          U.closeModal(); U.toast('บันทึกแล้ว'); done();
        })();
        return false;
      },
    });
    const show = () => { const e = endOf({ start: form.start.value, months: form.months.value, end: form.end.value }); form.querySelector('#w-end').textContent = e ? `คุ้มครองถึง ${U.date(e)}` : ''; };
    form.addEventListener('input', show); show();
    const files = PM.poFiles.box(form, w.files, canEdit, 'warranty');
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
  }

  function sForm(p, item, done) {
    const canEdit = PM.can('service.edit');
    const T = PM.today();
    const nextNo = 'SV-' + String(sOf(p).reduce((mx, x) => Math.max(mx, parseInt(String(x.no || '').slice(3), 10) || 0), 0) + 1).padStart(3, '0');
    const x = item || { id: PM.uid('SV'), projectId: p.id, no: nextNo, date: T, reportedBy: '', contact: '', item: '', description: '', priority: 'normal', inWarranty: coveredOn(p, T), status: 'open',
      assignee: '', visitDate: '', action: '', closedDate: '', cost: '', chargeable: false, files: [] };
    const items = Array.from(new Set(wOf(p).map((w) => w.item).filter(Boolean)));
    const form = U.modal({
      title: item ? `${x.no} · ${x.description}` : `ใบแจ้งซ่อม — ${p.code}`, wide: true,
      onDelete: item && canEdit ? () => { PM.poFiles.trash(`${p.id}/service/${x.id}`, (x.files || []).map((f) => f.path)); PM.remove('service', x.id); U.toast('ลบแล้ว'); done(); } : null,
      body: `
        <datalist id="sv-items">${items.map((i) => `<option value="${esc(i)}">`).join('')}</datalist>
        ${U.field('เลขที่', 'no', x.no, { required: true })}
        ${U.field('วันที่รับแจ้ง', 'date', x.date, { type: 'date', required: true })}
        ${U.field('อาการ / ปัญหาที่แจ้ง', 'description', x.description, { required: true, full: true, placeholder: 'เช่น Flow Computer แสดง Alarm Communication fail' })}
        ${U.field('อุปกรณ์ / รายการ', 'item', x.item)}
        ${U.field('ความเร่งด่วน', 'priority', x.priority, { options: Object.keys(PRIORITY).map((k) => ({ value: k, label: PRIORITY[k].label })) })}
        ${U.field('ผู้แจ้ง', 'reportedBy', x.reportedBy)}
        ${U.field('ช่องทางติดต่อ', 'contact', x.contact, { placeholder: 'โทร / LINE / อีเมล' })}
        ${U.field('ผู้รับผิดชอบ', 'assignee', x.assignee)}
        ${U.field('วันที่เข้าหน้างาน', 'visitDate', x.visitDate, { type: 'date' })}
        ${U.field('สถานะ', 'status', x.status, { options: Object.keys(SV_STATUS).map((k) => ({ value: k, label: SV_STATUS[k].label })) })}
        <div class="full avl-chks"><label class="avl-chk"><input type="checkbox" name="inWarranty"${x.inWarranty ? ' checked' : ''}><span>อยู่ในประกัน<small>ระบบดูจากระยะประกัน ณ วันรับแจ้ง — แก้ได้</small></span></label>
          <label class="avl-chk"><input type="checkbox" name="chargeable"${x.chargeable ? ' checked' : ''}><span>คิดค่าบริการลูกค้า</span></label></div>
        ${U.field('ค่าใช้จ่าย / ค่าบริการ (บาท)', 'cost', x.cost, { type: 'number', min: 0, step: 'any' })}
        ${U.field('การแก้ไข', 'action', x.action, { type: 'textarea', rows: 2, full: true })}
        ${PM.poFiles.boxHtml(canEdit, 'รูป / Service report', '', 'service')}`,
      onSubmit: !canEdit ? null : (f, frm) => {
        if (sOf(p).some((i) => i.id !== x.id && i.no.toUpperCase() === f.no.toUpperCase())) { U.alert(`เลขที่ ${f.no} มีอยู่แล้ว`); return false; }
        (async () => {
          const btn = frm.querySelector('[type=submit]'); btn.disabled = true; btn.classList.add('loading');
          const r = await files.commit(`${p.id}/service/${x.id}`, btn);
          Object.assign(x, f, { files: r.files, closedDate: f.status === 'closed' ? x.closedDate || PM.today() : '' });
          PM.upsert('service', x);
          U.closeModal(); U.toast('บันทึกแล้ว'); done();
        })();
        return false;
      },
    });
    form.item.setAttribute('list', 'sv-items');
    if (!item) form.date.addEventListener('change', () => { form.inWarranty.checked = coveredOn(p, form.date.value); });
    const files = PM.poFiles.box(form, x.files, canEdit, 'service');
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
  }

  /* demo: the closed projects are under warranty, one with a service request */
  PM.buildSampleWarranty = function (db, T) {
    const warranty = [], service = [];
    db.projects.filter((p) => p.status === 'closed').forEach((p, i) => {
      const start = p.endDate < T ? p.endDate : PM.addDays(T, -200);
      warranty.push({ id: `WR-${p.id}`, projectId: p.id, item: 'ทั้งระบบ (ตามสัญญา)', serial: '', vendor: '', start, months: 12, end: '', terms: '12 เดือนหลังส่งมอบ', note: '', files: [] });
      warranty.push({ id: `WR-${p.id}-fc`, projectId: p.id, item: 'Flow Computer', serial: `FC-${2400 + i}`, vendor: 'Emerson', start, months: 24, end: '', terms: '', note: '', files: [] });
      if (i === 0) service.push({ id: `SV-${p.id}-1`, projectId: p.id, no: 'SV-001', date: PM.addDays(T, -9), reportedBy: 'ฝ่ายซ่อมบำรุงลูกค้า', contact: '', item: 'Flow Computer', description: 'Alarm Communication fail กับ DCS เป็นช่วง ๆ',
        priority: 'normal', inWarranty: true, status: 'progress', assignee: 'ทีม Service', visitDate: PM.addDays(T, -6), action: '', closedDate: '', cost: '', chargeable: false, files: [] });
    });
    return { warranty, service };
  };
})();
