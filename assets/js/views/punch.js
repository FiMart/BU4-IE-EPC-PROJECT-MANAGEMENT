/* punch.js — Punch List (project tab): what must be fixed before / after handover
   Category  A = must be fixed before handover · B = may be fixed after handover · C = remark / improvement
   Status    open (เปิดอยู่) → fixed (แก้แล้ว รอตรวจ) → closed (ตรวจผ่าน ปิดแล้ว)
   Data: collection 'punch' = [{ id, projectId, no, date, location, description, category, discipline, raisedBy, owner, due,
          status, fixedDate, closedDate, before: [files], after: [files], note, createdBy, createdByName }]
   Photos: Storage <projectId>/punch/<id> (every role may view). No SQL needed. */
(function () {
  const U = PM.ui, esc = U.esc;
  const CAT = {
    A: { label: 'A — ต้องแก้ก่อนส่งมอบ', short: 'A', level: 'critical' },
    B: { label: 'B — แก้หลังส่งมอบได้', short: 'B', level: 'warning' },
    C: { label: 'C — ข้อสังเกต / ปรับปรุง', short: 'C', level: 'neutral' },
  };
  const STATUS = {
    open: { label: 'เปิดอยู่', level: 'critical' },
    fixed: { label: 'แก้แล้ว รอตรวจ', level: 'warning' },
    closed: { label: 'ตรวจผ่าน ปิดแล้ว', level: 'good' },
  };
  const DISCIPLINES = ['Civil / โยธา', 'Mechanical / เครื่องกล', 'Electrical / ไฟฟ้า', 'Instrument / ระบบควบคุม', 'Piping / ท่อ', 'Architecture / สถาปัตย์', 'อื่น ๆ'];
  const RAISED = ['ลูกค้า', 'ที่ปรึกษา / ผู้ควบคุมงาน', 'ตรวจภายใน (QA/QC)'];
  const state = U.keep('punch', { show: 'todo' }, ['show']);
  const listOf = (p) => (PM.db.punch || []).filter((x) => x.projectId === p.id);
  PM.punchLate = (x, T) => x.status === 'open' && x.due && x.due < (T || PM.today());
  /* summary used by the tab, the bell and the Closing phase */
  PM.punchStats = (p, T) => {
    const all = listOf(p);
    const n = (fn) => all.filter(fn).length;
    return { total: all.length, open: n((x) => x.status === 'open'), fixed: n((x) => x.status === 'fixed'), closed: n((x) => x.status === 'closed'),
      openA: n((x) => x.status !== 'closed' && x.category === 'A'), late: n((x) => PM.punchLate(x, T)), lateA: all.filter((x) => x.category === 'A' && PM.punchLate(x, T)) };
  };
  const nextNo = (p) => 'PL-' + String(listOf(p).reduce((m, x) => Math.max(m, parseInt(String(x.no || '').slice(3), 10) || 0), 0) + 1).padStart(3, '0');
  const order = { A: 0, B: 1, C: 2 }, sOrder = { open: 0, fixed: 1, closed: 2 };

  PM.punchTab = function (el, p, m, rerender) {
    const T = PM.today(), canEdit = PM.can('punch.edit');
    const s = PM.punchStats(p, T);
    const list = listOf(p).filter((x) => state.show === 'all' || (state.show === 'todo' ? x.status !== 'closed' : x.status === state.show))
      .sort((a, b) => sOrder[a.status] - sOrder[b.status] || order[a.category] - order[b.category] || String(a.due || '9').localeCompare(String(b.due || '9')));
    const pct = s.total ? s.closed / s.total : null;
    el.innerHTML = `
      <div class="row">
        <p class="muted" style="margin:0">รายการที่ต้องแก้ไขก่อน / หลังส่งมอบงาน — ถ่ายรูปก่อนแก้และหลังแก้ · ลูกค้าตรวจแล้วกดปิด · พิมพ์ให้ลูกค้าเซ็นได้</p>
        <span class="spacer"></span>
        <button class="btn" data-pl="print"${s.total ? '' : ' disabled'}>🖨 พิมพ์รายการค้าง</button>
        ${canEdit ? '<button class="btn primary" data-pl="new">+ เพิ่มรายการ</button>' : ''}
      </div>
      <div class="grid cols-4">
        ${PM.common.tile({ label: 'ต้องแก้ก่อนส่งมอบ (A)', value: s.openA, sub: s.openA ? U.badge('critical', 'ยังส่งมอบไม่ได้') : U.badge('good', 'ไม่มีรายการ A ค้าง'), icon: 'alert' })}
        ${PM.common.tile({ label: 'เปิดอยู่', value: s.open, sub: s.late ? U.badge('critical', `เลยกำหนด ${s.late}`) : 'ไม่มีรายการเลยกำหนด', icon: 'tasks' })}
        ${PM.common.tile({ label: 'แก้แล้ว รอตรวจ', value: s.fixed, sub: 'รอลูกค้า / QA ตรวจปิด', icon: 'quality' })}
        ${PM.common.tile({ label: 'ปิดแล้ว', value: `${s.closed} <small>/ ${s.total}</small>`, sub: `<div class="pbar-wrap">${U.progress(pct || 0, null)}<span class="num">${U.pct(pct)}</span></div>`, icon: 'check' })}
      </div>
      <div class="card"><div class="card-h"><h2>Punch List — ${esc(p.code)}</h2>
          <span class="spacer"></span>${PM.common.seg('show', [{ key: 'todo', label: `ยังไม่ปิด (${s.open + s.fixed})` }, { key: 'fixed', label: `รอตรวจ (${s.fixed})` }, { key: 'closed', label: `ปิดแล้ว (${s.closed})` }, { key: 'all', label: `ทั้งหมด (${s.total})` }], state.show)}
          <p>A = ต้องแก้ก่อนส่งมอบ · B = แก้หลังส่งมอบได้ · C = ข้อสังเกต · เปลี่ยนสถานะได้จากตาราง · คลิกแถวเพื่อแก้ไข / ดูรูป</p></div>
        <div class="card-b flush table-wrap">${list.length ? `<table class="tbl"><thead><tr><th>เลขที่</th><th>หมวด</th><th>ตำแหน่ง / รายการ</th><th>ผู้รับผิดชอบ</th><th>กำหนดแก้</th><th>สถานะ</th><th class="num">รูป</th></tr></thead><tbody>
          ${list.map((x) => `<tr class="click${PM.punchLate(x, T) ? ' pl-late' : ''}" data-pl-row="${esc(x.id)}">
            <td class="nowrap"><b>${esc(x.no)}</b><small>${U.date(x.date)}</small></td>
            <td>${U.badge(CAT[x.category].level, CAT[x.category].short)}</td>
            <td><b>${esc(x.location || '–')}</b><small>${esc(x.description)}</small><small>${esc(x.discipline || '')}${x.raisedBy ? ` · พบโดย ${esc(x.raisedBy)}` : ''}</small></td>
            <td>${esc(x.owner || '–')}</td>
            <td class="nowrap">${U.date(x.due)}${PM.punchLate(x, T) ? `<small class="neg">เลย ${PM.diffDays(x.due, T)} วัน</small>` : ''}</td>
            <td>${canEdit ? `<select class="pi-st pl-st-${x.status}" data-pl-st="${esc(x.id)}" aria-label="สถานะ">${Object.keys(STATUS).map((k) => `<option value="${k}"${k === x.status ? ' selected' : ''}>${esc(STATUS[k].label)}</option>`).join('')}</select>` : U.badge(STATUS[x.status].level, STATUS[x.status].label)}</td>
            <td class="num">${(x.before || []).length + (x.after || []).length || '–'}</td></tr>`).join('')}
          </tbody></table>` : `<p class="empty">${s.total ? 'ไม่มีรายการในมุมมองนี้' : `ยังไม่มี Punch List${canEdit ? ' — กด "+ เพิ่มรายการ" ระหว่างเดินตรวจงานกับลูกค้า' : ''}`}</p>`}</div></div>`;

    el.onchange = (e) => {
      const sel = e.target.closest('[data-pl-st]');
      if (!sel || !canEdit) return;
      const x = (PM.db.punch || []).find((i) => i.id === sel.dataset.plSt);
      if (!x) return;
      setStatus(x, sel.value);
      PM.upsert('punch', x); U.toast(`${x.no} → ${STATUS[x.status].label}`); rerender();
    };
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg="show"]');
      if (seg) { state.show = seg.dataset.val; rerender(); return; }
      if (e.target.closest('select')) return;
      const a = e.target.closest('[data-pl]');
      if (a && a.dataset.pl === 'new') { punchForm(p, null, rerender); return; }
      if (a && a.dataset.pl === 'print') { PM.punchPrint(p); return; }
      const row = e.target.closest('[data-pl-row]');
      if (row) { const x = (PM.db.punch || []).find((i) => i.id === row.dataset.plRow); if (x) punchForm(p, x, rerender); }
    };
  };
  function setStatus(x, st) {
    const T = PM.today();
    x.status = st;
    x.fixedDate = st === 'open' ? '' : x.fixedDate || T;
    x.closedDate = st === 'closed' ? x.closedDate || T : '';
  }

  function punchForm(p, item, done) {
    const canEdit = PM.can('punch.edit');
    const u = PM.auth && PM.auth.user;
    const x = item || { id: PM.uid('PL'), projectId: p.id, no: nextNo(p), date: PM.today(), location: '', description: '', category: 'A', discipline: DISCIPLINES[0],
      raisedBy: RAISED[0], owner: '', due: PM.addDays(PM.today(), 7), status: 'open', fixedDate: '', closedDate: '', before: [], after: [], note: '' };
    const form = U.modal({
      title: item ? `${x.no} · ${x.location || 'Punch item'}` : `เพิ่ม Punch List — ${p.code}`, wide: true,
      onDelete: item && canEdit ? () => {
        PM.poFiles.remove((x.before || []).concat(x.after || []).map((f) => f.path)).catch(() => { /* already gone */ });
        PM.remove('punch', x.id); U.toast('ลบแล้ว'); done();
      } : null,
      body: `
        ${U.field('เลขที่', 'no', x.no, { required: true })}
        ${U.field('วันที่พบ', 'date', x.date, { type: 'date', required: true })}
        ${U.field('ตำแหน่ง / พื้นที่', 'location', x.location, { required: true, placeholder: 'เช่น MCC Room ชั้น 2 · ตู้ MDB-01' })}
        ${U.field('หมวด', 'category', x.category, { options: Object.keys(CAT).map((k) => ({ value: k, label: CAT[k].label })) })}
        ${U.field('รายการที่ต้องแก้ไข', 'description', x.description, { type: 'textarea', rows: 2, full: true, placeholder: 'เช่น ฝาตู้ปิดไม่สนิท · ป้ายชื่อสายไม่ครบ' })}
        ${U.field('งาน', 'discipline', x.discipline, { options: DISCIPLINES })}
        ${U.field('พบโดย', 'raisedBy', x.raisedBy, { options: RAISED })}
        ${U.field('ผู้รับผิดชอบแก้ไข', 'owner', x.owner, { placeholder: 'ชื่อ / ผู้รับเหมา' })}
        ${U.field('กำหนดแก้เสร็จ', 'due', x.due, { type: 'date' })}
        ${U.field('สถานะ', 'status', x.status, { options: Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k].label })) })}
        ${U.field('หมายเหตุ', 'note', x.note)}
        ${PM.poFiles.boxHtml(canEdit, 'รูปก่อนแก้', 'ถ่ายตอนเดินตรวจ', 'before')}
        ${PM.poFiles.boxHtml(canEdit, 'รูปหลังแก้', 'ถ่ายเมื่อแก้เสร็จ — ใช้ยืนยันกับลูกค้า', 'after')}
        ${item && (x.fixedDate || x.closedDate) ? `<p class="full muted" style="margin:0">${x.fixedDate ? `แก้เสร็จ ${U.date(x.fixedDate)}` : ''}${x.closedDate ? ` · ตรวจปิด ${U.date(x.closedDate)}` : ''}</p>` : ''}`,
      onSubmit: !canEdit ? null : (f, frm) => {
        if (listOf(p).some((i) => i.id !== x.id && i.no.toUpperCase() === f.no.toUpperCase())) { U.alert(`เลขที่ ${f.no} มีอยู่แล้ว`); return false; }
        (async () => {
          const btn = frm.querySelector('[type=submit]'); btn.disabled = true; btn.classList.add('loading');
          const b = await before.commit(`${p.id}/punch/${x.id}`, btn), a = await after.commit(`${p.id}/punch/${x.id}`, btn);
          const st = f.status; delete f.status;
          Object.assign(x, f, { before: b.files, after: a.files });
          setStatus(x, st);
          if (!item) Object.assign(x, { createdBy: u ? u.id : '', createdByName: u ? PM.auth.displayName(u) : '' });
          PM.upsert('punch', x);
          U.closeModal();
          const problems = b.problems.concat(a.problems);
          U.toast(problems.length ? 'บันทึกแล้ว แต่รูปบางรูปมีปัญหา' : item ? 'บันทึกแล้ว' : `เพิ่ม ${x.no} แล้ว`);
          if (problems.length) U.alert('ไฟล์ที่ไม่สำเร็จ:\n' + problems.join('\n'));
          done();
        })();
        return false;
      },
    });
    const before = PM.poFiles.box(form, x.before, canEdit, 'before');
    const after = PM.poFiles.box(form, x.after, canEdit, 'after');
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
  }

  /* printable list of what is not closed yet, for the walk-down with the client */
  PM.punchPrint = function (p) {
    const P = PM.printDoc, win = P.open();
    if (!win) return;
    const T = PM.today(), s = PM.punchStats(p, T);
    const open = listOf(p).filter((x) => x.status !== 'closed').sort((a, b) => order[a.category] - order[b.category] || String(a.no).localeCompare(String(b.no)));
    P.write(win, {
      title: `Punch List ${p.code} ${T}`, bar: `Punch List — ${p.code}`,
      head: {
        title: `<h1>Punch List — รายการแก้ไขก่อนส่งมอบ</h1><p><b>${esc(p.code)} · ${esc(p.name)}</b></p><p>ลูกค้า ${esc(p.client || '–')} · ข้อมูล ณ ${U.date(T)}</p>`,
        meta: `${esc(PM.COMPANY)}<br>ค้าง ${open.length} จาก ${s.total} รายการ`,
      },
      body: `
  <section><div class="kpis">
    ${P.kpi('ต้องแก้ก่อนส่งมอบ (A)', String(s.openA), s.openA ? 'ยังส่งมอบไม่ได้' : 'ไม่มีค้าง', s.openA ? 'critical' : 'good')}
    ${P.kpi('เปิดอยู่', String(s.open), s.late ? `เลยกำหนด ${s.late}` : '', s.late ? 'warning' : null)}
    ${P.kpi('แก้แล้ว รอตรวจ', String(s.fixed))}
    ${P.kpi('ปิดแล้ว', `${s.closed} / ${s.total}`, U.pct(s.total ? s.closed / s.total : null))}
  </div></section>
  <section class="flow"><h2>รายการที่ยังไม่ปิด (${open.length})</h2>
    ${P.tbl([{ t: 'เลขที่' }, { t: 'หมวด' }, { t: 'ตำแหน่ง' }, { t: 'รายการ' }, { t: 'ผู้รับผิดชอบ' }, { t: 'กำหนด' }, { t: 'สถานะ' }, { t: 'ตรวจ ✓' }],
      open.map((x) => [esc(x.no), CAT[x.category].short, esc(x.location), esc(x.description), esc(x.owner || '–'), U.date(x.due), esc(STATUS[x.status].label), '☐']), 'ไม่มีรายการค้าง — พร้อมส่งมอบ')}</section>
  <div class="sign"><div>ผู้จัดการโครงการ</div><div>ผู้ควบคุมงาน / QA</div><div>ตัวแทนลูกค้า</div></div>`,
    });
  };

  /* demo data: a few items on the projects that are finishing (construction well along) */
  PM.buildSamplePunch = function (projects, T) {
    const ITEMS = [['MCC Room', 'ฝาตู้ MDB-01 ปิดไม่สนิท ต้องปรับบานพับ', 'A', 'Electrical / ไฟฟ้า'], ['Pipe rack แกน C', 'สีกันสนิมหลุดบริเวณรอยเชื่อม 3 จุด', 'B', 'Piping / ท่อ'],
      ['Pump P-101', 'ป้ายชื่ออุปกรณ์ยังไม่ติด', 'C', 'Mechanical / เครื่องกล'], ['ทางเดินรอบถัง T-201', 'ราวกันตกขาด 1 ช่วง', 'A', 'Civil / โยธา'],
      ['Control room', 'สาย Fiber ยังไม่มีป้ายระบุ', 'B', 'Instrument / ระบบควบคุม'], ['หลังคาอาคาร B', 'รอยรั่วซึมบริเวณรอยต่อแผ่นหลังคา', 'A', 'Architecture / สถาปัตย์']];
    const out = [];
    projects.filter((p) => p.status !== 'closed' && (p.phases || []).some((ph) => ph.key === 'construction' && (ph.progress || 0) >= 55)).forEach((p) => {
      ITEMS.forEach(([location, description, category, discipline], i) => {
        const date = PM.addDays(T, -20 + i * 2), status = i < 2 ? 'closed' : i === 2 ? 'fixed' : 'open';
        out.push({ id: `PL-${p.id}-${i + 1}`, projectId: p.id, no: 'PL-' + String(i + 1).padStart(3, '0'), date, location, description, category, discipline, raisedBy: RAISED[i % 2],
          owner: i % 2 ? 'บ.ยูนิตี้ เอ็มแอนด์อี' : 'ทีมติดตั้ง', due: PM.addDays(date, i === 3 ? 7 : 14), status, fixedDate: status === 'open' ? '' : PM.addDays(date, 5),
          closedDate: status === 'closed' ? PM.addDays(date, 7) : '', before: [], after: [], note: '', createdBy: '', createdByName: 'QA/QC' });
      });
    });
    return out;
  };
})();
