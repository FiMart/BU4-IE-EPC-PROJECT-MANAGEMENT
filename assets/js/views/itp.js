/* itp.js — inspection & test plan of a project (project tab "ITP · FAT/SAT"): what is inspected or tested, when, who must
   be there, and the result.
   Stages: inspection (ตรวจระหว่างผลิต / ตรวจรับ) · fat (Factory Acceptance Test) · sat (Site Acceptance Test) · comm (Commissioning)
   Point:  H = Hold (stop until the client has seen it) · W = Witness (invite the client) · R = Review (documents) · S = Surveillance
   Result: pending → pass · fail · na — a fail opens an NCR or a Punch List item straight from here, linked both ways.
   Hold / Witness points coming in 7 days show on the bell, so the client is invited in time.
   Data: collection 'itp' = [{ id, projectId, stage, seq, activity, ref, criteria, point, party, planDate, doneDate, result,
          inspector, witness, note, files: [], ncrId, punchId, createdBy, createdByName }]
   Files: Storage <projectId>/itp/<id> (reports, photos, signed sheets). No SQL needed. */
(function () {
  const U = PM.ui, esc = U.esc;
  const STAGES = [
    { key: 'inspection', label: 'ตรวจระหว่างผลิต / ตรวจรับ', short: 'Inspection' },
    { key: 'fat', label: 'FAT — ทดสอบที่โรงงาน', short: 'FAT' },
    { key: 'sat', label: 'SAT — ทดสอบที่หน้างาน', short: 'SAT' },
    { key: 'comm', label: 'Commissioning — ทดสอบเดินระบบ', short: 'Commissioning' },
  ];
  const POINTS = {
    H: { label: 'H — Hold (หยุดรอลูกค้า)', short: 'Hold', level: 'critical' },
    W: { label: 'W — Witness (เชิญลูกค้ามาดู)', short: 'Witness', level: 'warning' },
    R: { label: 'R — Review (ตรวจเอกสาร)', short: 'Review', level: 'info' },
    S: { label: 'S — Surveillance (สุ่มตรวจ)', short: 'Surv.', level: 'neutral' },
  };
  const RESULTS = { pending: { label: 'รอทดสอบ', level: 'neutral' }, pass: { label: 'ผ่าน', level: 'good' }, fail: { label: 'ไม่ผ่าน', level: 'critical' }, na: { label: 'ไม่ต้องทำ', level: 'neutral' } };
  const PARTIES = ['ผู้ขาย / โรงงาน', 'Flowlab (เรา)', 'ลูกค้า', 'Third party'];
  /* a metering skid's usual plan — added from "เพิ่มจากแม่แบบ" and edited from there */
  const TEMPLATE = {
    inspection: [['ตรวจรับวัสดุ / Material Test Certificate (MTC)', 'R', 'ตรงตาม Spec · Heat no. ตรงกับใบ MTC'], ['ตรวจงานเชื่อมด้วยสายตา และ NDT', 'W', 'ตาม WPS / ASME B31.3'],
      ['Hydrostatic test ท่อและ Skid', 'H', '1.5 เท่าของ Design pressure ค้าง 30 นาที ไม่รั่ว'], ['ตรวจความหนาสี (DFT)', 'W', 'ตาม Painting spec']],
    fat: [['ตรวจรูปร่าง ขนาด และ Name plate', 'W', 'ตรงตาม GA drawing'], ['ตรวจใบ Calibration ของเครื่องมือวัด', 'R', 'ใบรับรองยังไม่หมดอายุ · ตรง Tag'],
      ['Leak test ทั้ง Skid', 'H', 'ไม่มีการรั่วซึม'], ['ทดสอบ Flow Computer: Configuration และการคำนวณ', 'W', 'ผลคำนวณตรงกับ Spreadsheet ภายใน ±0.01%'],
      ['Loop check สัญญาณ I/O', 'W', 'ทุก Loop ถูกต้องตาม Loop diagram'], ['ทดสอบการสื่อสาร Modbus กับ DCS (Simulation)', 'W', 'Register ตรงตาม Modbus list'],
      ['ทดสอบ Alarm และ Shutdown', 'W', 'ทำงานตาม Cause & Effect'], ['Insulation / Continuity test', 'W', 'ค่าความเป็นฉนวน ≥ 100 MΩ'], ['สรุปผลและเซ็น FAT Report', 'R', 'ไม่มีรายการค้างระดับ A']],
    sat: [['ตรวจการติดตั้งและ Alignment', 'W', 'ตรงตาม Installation drawing'], ['Cable check และ Loop check หน้างาน', 'H', 'ทุก Loop ถูกต้อง'],
      ['ตรวจ Configuration Flow Computer หน้างาน', 'W', 'ตรงกับค่าที่อนุมัติ'], ['ทดสอบการสื่อสารกับ DCS จริง', 'H', 'ค่าแสดงที่ DCS ถูกต้อง'], ['Leak test หน้างาน', 'W', 'ไม่มีการรั่วซึม']],
    comm: [['ล้างท่อ (Flushing) และตรวจก่อนเดินระบบ', 'W', 'ตาม Pre-commissioning checklist'], ['เริ่มเดินระบบ / ปล่อยของไหลเข้า', 'H', 'ไม่มีการรั่ว · ค่าอ่านปกติ'],
      ['Meter proving / ตรวจสอบค่า Calibration', 'H', 'Meter factor อยู่ในเกณฑ์ · Repeatability ≤ 0.05%'], ['Performance test 72 ชั่วโมง', 'H', 'ระบบทำงานต่อเนื่องไม่มี Alarm ผิดปกติ'],
      ['ส่งมอบเอกสาร As-built · Manual · Spare part list', 'R', 'ครบตาม VDRL']],
  };
  const state = U.keep('itp', { show: 'all', stage: '' }, ['show', 'stage']);
  const listOf = (p) => (PM.db.itp || []).filter((x) => x.projectId === p.id);
  PM.itpLate = (x, T) => x.result === 'pending' && x.planDate && x.planDate < (T || PM.today());
  /* Hold / Witness points coming up: the client must be invited */
  PM.itpSoon = (x, T) => x.result === 'pending' && (x.point === 'H' || x.point === 'W') && x.planDate && x.planDate >= T && PM.diffDays(T, x.planDate) <= 7;
  const failOpen = (x) => x.result === 'fail' && !(x.ncrId && (PM.find('ncrs', x.ncrId) || {}).status === 'closed') && !(x.punchId && (PM.find('punch', x.punchId) || {}).status === 'closed');
  PM.itpStats = (p, T) => {
    const all = listOf(p), n = (fn) => all.filter(fn).length, done = n((x) => x.result !== 'pending');
    return { all, total: all.length, done, pass: n((x) => x.result === 'pass'), fail: n((x) => x.result === 'fail'), failOpen: n(failOpen), late: n((x) => PM.itpLate(x, T)),
      soon: all.filter((x) => PM.itpSoon(x, T)), stages: STAGES.map((s) => { const r = all.filter((x) => x.stage === s.key); return { s, n: r.length, done: r.filter((x) => x.result !== 'pending').length, fail: r.filter((x) => x.result === 'fail').length }; }) };
  };
  PM.itpFailOpen = failOpen;
  const seqOf = (x) => Number(x.seq) || 0;

  PM.itpTab = function (el, p, m, rerender) {
    const T = PM.today(), canEdit = PM.can('itp.edit');
    const s = PM.itpStats(p, T);
    const SHOW = { all: () => true, todo: (x) => x.result === 'pending', late: (x) => PM.itpLate(x, T), hw: (x) => x.point === 'H' || x.point === 'W', fail: (x) => x.result === 'fail' };
    const list = s.all.filter((x) => (SHOW[state.show] || SHOW.all)(x) && (!state.stage || x.stage === state.stage));
    const pct = s.total ? s.done / s.total : null;
    el.innerHTML = `
      <div class="row">
        <p class="muted" style="margin:0">แผนตรวจทดสอบ (ITP) — FAT · SAT · Commissioning: จุด Hold / Witness ที่ต้องเชิญลูกค้า · ผล Pass / Fail · ไม่ผ่านเปิด NCR หรือ Punch List ได้ทันที</p>
        <span class="spacer"></span>
        <button class="btn" data-itp="print"${s.total ? '' : ' disabled'}>🖨 พิมพ์ ITP</button>
        ${canEdit ? '<button class="btn" data-itp="template">เพิ่มจากแม่แบบ Metering Skid</button><button class="btn primary" data-itp="new">+ เพิ่มรายการตรวจ</button>' : ''}
      </div>
      <div class="grid cols-4">
        ${PM.common.tile({ label: 'ทดสอบแล้ว', value: `${s.done} <small>/ ${s.total}</small>`, sub: `<div class="pbar-wrap">${U.progress(pct || 0, null)}<span class="num">${U.pct(pct)}</span></div>`, icon: 'check' })}
        ${PM.common.tile({ label: 'Hold / Witness ใน 7 วัน', value: s.soon.length, sub: s.soon.length ? U.badge('warning', 'แจ้งลูกค้าล่วงหน้า') : 'ไม่มีนัดตรวจใน 7 วัน', icon: 'calendar' })}
        ${PM.common.tile({ label: 'ไม่ผ่าน ยังไม่ปิด', value: s.failOpen, sub: s.failOpen ? U.badge('critical', 'ต้องแก้แล้วทดสอบซ้ำ') : U.badge('good', 'ไม่มีรายการค้าง'), icon: 'alert' })}
        ${PM.common.tile({ label: 'เลยกำหนดทดสอบ', value: s.late, sub: s.late ? U.badge('warning', 'ยังไม่ได้บันทึกผล') : 'ตรงตามแผน', icon: 'clock' })}
      </div>
      <div class="card"><div class="card-h"><h2>ITP — ${esc(p.code)}</h2><span class="spacer"></span>
          <select id="itp-stage" aria-label="กรองตามขั้น">${U.options([{ value: '', label: 'ทุกขั้น' }].concat(s.stages.filter((x) => x.n).map((x) => ({ value: x.s.key, label: `${x.s.short} (${x.done}/${x.n})` }))), state.stage)}</select>
          ${PM.common.seg('itpshow', [{ key: 'all', label: `ทั้งหมด (${s.total})` }, { key: 'todo', label: `รอทดสอบ (${s.total - s.done})` }, { key: 'hw', label: 'Hold / Witness' }, { key: 'late', label: `เลยกำหนด (${s.late})` }, { key: 'fail', label: `ไม่ผ่าน (${s.fail})` }], state.show)}
          <p>H = หยุดรอลูกค้ามาตรวจ · W = เชิญลูกค้ามาดู · R = ตรวจเอกสาร · S = สุ่มตรวจ · เปลี่ยนผลได้จากตาราง · คลิกแถวเพื่อแก้ไข / แนบรายงาน</p></div>
        <div class="card-b flush table-wrap">${list.length ? `<table class="tbl itp-table"><thead><tr><th class="num">#</th><th>รายการตรวจ / ทดสอบ</th><th>จุดตรวจ</th><th>ผู้ทำ / ผู้ตรวจ</th><th>วันที่</th><th>ผล</th><th class="num">ไฟล์</th></tr></thead><tbody>
          ${STAGES.filter((st) => list.some((x) => x.stage === st.key)).map((st) => { const g = s.stages.find((x) => x.s.key === st.key); return `<tr class="avl-d"><td colspan="7">${esc(st.label)} <small class="muted">${g.done}/${g.n} ทดสอบแล้ว${g.fail ? ` · ไม่ผ่าน ${g.fail}` : ''}</small></td></tr>
            ${list.filter((x) => x.stage === st.key).sort((a, b) => seqOf(a) - seqOf(b) || String(a.planDate).localeCompare(String(b.planDate))).map((x) => { const ncr = x.ncrId && PM.find('ncrs', x.ncrId), pl = x.punchId && PM.find('punch', x.punchId); return `<tr class="click${PM.itpLate(x, T) ? ' pl-late' : ''}" data-itp-row="${esc(x.id)}">
              <td class="num">${esc(x.seq || '')}</td>
              <td><span class="title">${esc(x.activity)}</span>${x.criteria ? `<small>เกณฑ์: ${esc(x.criteria)}</small>` : ''}${x.ref ? `<small>อ้างอิง: ${esc(x.ref)}</small>` : ''}
                ${ncr ? `<small>${U.badge(ncr.status === 'closed' ? 'good' : 'critical', `${ncr.no} ${ncr.status === 'closed' ? 'ปิดแล้ว' : 'เปิดอยู่'}`)}</small>` : ''}${pl ? `<small>${U.badge(pl.status === 'closed' ? 'good' : 'warning', `${pl.no} ${pl.status === 'closed' ? 'ปิดแล้ว' : 'ยังไม่ปิด'}`)}</small>` : ''}</td>
              <td>${U.badge(POINTS[x.point] ? POINTS[x.point].level : 'neutral', POINTS[x.point] ? `${x.point} · ${POINTS[x.point].short}` : '–')}</td>
              <td>${esc(x.party || '–')}${x.inspector || x.witness ? `<small>${esc([x.inspector, x.witness && `ลูกค้า: ${x.witness}`].filter(Boolean).join(' · '))}</small>` : ''}</td>
              <td class="nowrap">${x.doneDate ? U.date(x.doneDate) : U.date(x.planDate)}${!x.doneDate && x.planDate ? `<small class="${PM.itpLate(x, T) ? 'neg' : 'muted'}">${PM.itpLate(x, T) ? `เลย ${PM.diffDays(x.planDate, T)} วัน` : 'แผน'}</small>` : ''}</td>
              <td>${canEdit ? `<select class="pi-st itp-st-${x.result}" data-itp-st="${esc(x.id)}" aria-label="ผลการทดสอบ">${Object.keys(RESULTS).map((k) => `<option value="${k}"${k === x.result ? ' selected' : ''}>${esc(RESULTS[k].label)}</option>`).join('')}</select>` : U.badge(RESULTS[x.result].level, RESULTS[x.result].label)}</td>
              <td class="num">${(x.files || []).length ? `📎 ${x.files.length}` : '–'}</td></tr>`; }).join('')}`; }).join('')}
          </tbody></table>` : `<p class="empty">${s.total ? 'ไม่มีรายการในมุมมองนี้' : `ยังไม่มีแผนตรวจทดสอบ${canEdit ? ' — กด "เพิ่มจากแม่แบบ Metering Skid" แล้วแก้ให้ตรงกับงาน หรือ "+ เพิ่มรายการตรวจ"' : ''}`}</p>`}</div></div>`;

    el.onchange = (e) => {
      if (e.target.id === 'itp-stage') { state.stage = e.target.value; rerender(); return; }
      const sel = e.target.closest('[data-itp-st]');
      if (!sel || !canEdit) return;
      const x = PM.find('itp', sel.dataset.itpSt);
      if (!x) return;
      setResult(x, sel.value);
      PM.upsert('itp', x);
      U.toast(`${x.activity} → ${RESULTS[x.result].label}`);
      if (x.result === 'fail' && !x.ncrId && !x.punchId) afterFail(p, x, rerender); else rerender();
    };
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg="itpshow"]');
      if (seg) { state.show = seg.dataset.val; rerender(); return; }
      if (e.target.closest('select')) return;
      const a = e.target.closest('[data-itp]');
      if (a) {
        if (a.dataset.itp === 'new') itpForm(p, null, rerender);
        if (a.dataset.itp === 'template') addTemplate(p, rerender);
        if (a.dataset.itp === 'print') PM.itpPrint(p);
        return;
      }
      const row = e.target.closest('[data-itp-row]');
      if (row) { const x = PM.find('itp', row.dataset.itpRow); if (x) itpForm(p, x, rerender); }
    };
  };
  function setResult(x, r) { x.result = r; x.doneDate = r === 'pending' ? '' : x.doneDate || PM.today(); }

  /* a fail: open an NCR (product / work does not meet the criteria) or a Punch List item (small things to fix) */
  function afterFail(p, x, done) {
    const m = U.modal({
      title: `ไม่ผ่าน: ${x.activity}`,
      body: `<p class="full" style="margin:0">บันทึกสิ่งที่ต้องแก้ไขเพื่อติดตามจนปิด — ทดสอบซ้ำผ่านแล้วเปลี่ยนผลเป็น "ผ่าน"</p>
        <div class="full itp-fail-act"><button type="button" class="btn primary" data-fail="ncr">เปิด NCR</button><button type="button" class="btn" data-fail="punch">เปิด Punch List</button><button type="button" class="btn" data-fail="later">ภายหลัง</button></div>`,
    });
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fail]');
      if (!b) return;
      if (b.dataset.fail === 'ncr') openNcr(p, x);
      if (b.dataset.fail === 'punch') openPunch(p, x);
      U.closeModal();
      done();
    });
  }
  function openNcr(p, x) {
    const T = PM.today();
    const ncr = { id: PM.uid('N'), projectId: p.id, no: PM.nextNcrNo(p), date: T, phase: x.stage === 'inspection' || x.stage === 'fat' ? 'procurement' : 'construction',
      category: x.stage === 'inspection' || x.stage === 'fat' ? 'Supplier' : 'Workmanship', severity: x.point === 'H' ? 'Major' : 'Minor',
      description: `ITP ไม่ผ่าน: ${x.activity}${x.criteria ? ` (เกณฑ์: ${x.criteria})` : ''}${x.note ? ` — ${x.note}` : ''}`, responsible: x.party || '', action: '', status: 'open', closedDate: '',
      rootCause: '', correction: '', dueDate: PM.addDays(T, 14), effective: '', itpId: x.id, source: 'itp' };
    PM.upsert('ncrs', ncr);
    x.ncrId = ncr.id; PM.upsert('itp', x);
    U.toast(`เปิด ${ncr.no} แล้ว — แก้รายละเอียดที่แท็บ Quality · NCR`);
  }
  function openPunch(p, x) {
    const T = PM.today(), list = (PM.db.punch || []).filter((i) => i.projectId === p.id);
    const no = 'PL-' + String(list.reduce((mx, i) => Math.max(mx, parseInt(String(i.no || '').slice(3), 10) || 0), 0) + 1).padStart(3, '0');
    const pl = { id: PM.uid('PL'), projectId: p.id, no, date: T, location: STAGES.find((s) => s.key === x.stage).short, description: `ITP ไม่ผ่าน: ${x.activity}${x.note ? ` — ${x.note}` : ''}`,
      category: x.point === 'H' ? 'A' : 'B', discipline: 'Instrument / ระบบควบคุม', raisedBy: 'ตรวจภายใน (QA/QC)', owner: x.party || '', due: PM.addDays(T, 7), status: 'open',
      fixedDate: '', closedDate: '', before: [], after: [], note: '', itpId: x.id };
    PM.upsert('punch', pl);
    x.punchId = pl.id; PM.upsert('itp', x);
    U.toast(`เปิด ${no} แล้ว — ดูที่แท็บ Punch List`);
  }

  function addTemplate(p, done) {
    const have = listOf(p);
    const options = STAGES.map((s) => `<label class="avl-chk"><input type="checkbox" name="st_${s.key}" checked><span>${esc(s.label)}<small>${TEMPLATE[s.key].length} รายการ${have.some((x) => x.stage === s.key) ? ' · มีรายการในขั้นนี้แล้ว (รายการที่ชื่อซ้ำจะข้าม)' : ''}</small></span></label>`).join('');
    U.modal({
      title: `เพิ่มจากแม่แบบ Metering Skid — ${p.code}`, submitLabel: 'เพิ่มรายการ',
      body: `<p class="full muted" style="margin:0">รายการตรวจทดสอบที่ใช้บ่อยของงาน Metering Skid — เพิ่มแล้วแก้ไขเกณฑ์ / วันที่ / ผู้ตรวจให้ตรงกับ ITP ที่ลูกค้าอนุมัติ</p>
        <div class="full avl-chks" style="flex-direction:column">${options}</div>
        ${U.field('วันที่เริ่ม (ใส่แผนให้ทุกรายการห่างกัน 2 วัน)', 'start', PM.today(), { type: 'date' })}`,
      onSubmit: (f) => {
        const u = PM.auth && PM.auth.user;
        let n = 0, day = 0;
        STAGES.forEach((s) => {
          if (!f['st_' + s.key]) return;
          let seq = have.filter((x) => x.stage === s.key).reduce((mx, x) => Math.max(mx, seqOf(x)), 0);
          TEMPLATE[s.key].forEach(([activity, point, criteria]) => {
            if (have.some((x) => x.stage === s.key && PM.normName(x.activity) === PM.normName(activity))) return;
            seq++; n++;
            PM.db.itp.push({ id: PM.uid('IT'), projectId: p.id, stage: s.key, seq: String(seq), activity, ref: '', criteria, point, party: s.key === 'fat' || s.key === 'inspection' ? PARTIES[0] : PARTIES[1],
              planDate: f.start ? PM.addDays(f.start, (day += 2)) : '', doneDate: '', result: 'pending', inspector: '', witness: '', note: '', files: [], ncrId: '', punchId: '',
              createdBy: u ? u.id : '', createdByName: u ? PM.auth.displayName(u) : '' });
          });
        });
        PM.save();
        U.toast(n ? `เพิ่ม ${n} รายการแล้ว` : 'ไม่มีรายการใหม่ — มีครบแล้ว');
        done();
      },
    });
  }

  function itpForm(p, item, done) {
    const canEdit = PM.can('itp.edit');
    const u = PM.auth && PM.auth.user;
    const x = item || { id: PM.uid('IT'), projectId: p.id, stage: state.stage || 'fat', seq: '', activity: '', ref: '', criteria: '', point: 'W', party: PARTIES[0], planDate: PM.today(), doneDate: '', result: 'pending',
      inspector: '', witness: '', note: '', files: [], ncrId: '', punchId: '' };
    if (!item) x.seq = String(listOf(p).filter((i) => i.stage === x.stage).reduce((mx, i) => Math.max(mx, seqOf(i)), 0) + 1);
    const ncr = x.ncrId && PM.find('ncrs', x.ncrId), pl = x.punchId && PM.find('punch', x.punchId);
    const form = U.modal({
      title: item ? x.activity : `เพิ่มรายการตรวจทดสอบ — ${p.code}`, wide: true,
      onDelete: item && canEdit ? () => { PM.poFiles.trash(`${p.id}/itp/${x.id}`, (x.files || []).map((f) => f.path)); PM.remove('itp', x.id); U.toast('ลบแล้ว'); done(); } : null,
      body: `
        ${U.field('ขั้น', 'stage', x.stage, { options: STAGES.map((s) => ({ value: s.key, label: s.label })) })}
        ${U.field('ลำดับ', 'seq', x.seq)}
        ${U.field('รายการตรวจ / ทดสอบ', 'activity', x.activity, { required: true, full: true, placeholder: 'เช่น Leak test ทั้ง Skid' })}
        ${U.field('เกณฑ์ยอมรับ (Acceptance criteria)', 'criteria', x.criteria, { full: true })}
        ${U.field('เอกสารอ้างอิง / Procedure', 'ref', x.ref, { placeholder: 'เช่น EMERSON-FQI-FLS-IE-0005 Rev.A' })}
        ${U.field('จุดตรวจ', 'point', x.point, { options: Object.keys(POINTS).map((k) => ({ value: k, label: POINTS[k].label })) })}
        ${U.field('ผู้ทำการทดสอบ', 'party', x.party, { options: PARTIES.includes(x.party) || !x.party ? PARTIES : PARTIES.concat(x.party) })}
        ${U.field('ผู้ตรวจของเรา (QC)', 'inspector', x.inspector)}
        ${U.field('ตัวแทนลูกค้า', 'witness', x.witness, { placeholder: 'ชื่อผู้มา Witness' })}
        ${U.field('วันที่แผน', 'planDate', x.planDate, { type: 'date' })}
        ${U.field('วันที่ทดสอบจริง', 'doneDate', x.doneDate, { type: 'date' })}
        ${U.field('ผล', 'result', x.result, { options: Object.keys(RESULTS).map((k) => ({ value: k, label: RESULTS[k].label })) })}
        ${U.field('บันทึกผล / หมายเหตุ', 'note', x.note, { type: 'textarea', rows: 2, full: true, placeholder: 'ค่าที่วัดได้ · ข้อสังเกต' })}
        ${ncr || pl ? `<p class="full" style="margin:0">ติดตามการแก้ไข: ${ncr ? U.badge(ncr.status === 'closed' ? 'good' : 'critical', `${ncr.no} · ${ncr.status === 'closed' ? 'ปิดแล้ว' : 'เปิดอยู่'}`) : ''} ${pl ? U.badge(pl.status === 'closed' ? 'good' : 'warning', `${pl.no} · ${pl.status}`) : ''}</p>` : ''}
        ${PM.poFiles.boxHtml(canEdit, 'รายงาน / รูปถ่าย', 'Test report · ใบที่ลูกค้าเซ็น · รูปหน้างาน', 'itp')}`,
      onSubmit: !canEdit ? null : (f, frm) => {
        (async () => {
          const btn = frm.querySelector('[type=submit]'); btn.disabled = true; btn.classList.add('loading');
          const r = await files.commit(`${p.id}/itp/${x.id}`, btn);
          const res = f.result; delete f.result;
          Object.assign(x, f, { files: r.files });
          setResult(x, res);
          if (f.doneDate) x.doneDate = f.doneDate;
          if (!item) Object.assign(x, { createdBy: u ? u.id : '', createdByName: u ? PM.auth.displayName(u) : '' });
          PM.upsert('itp', x);
          U.closeModal();
          U.toast('บันทึกแล้ว');
          if (x.result === 'fail' && !x.ncrId && !x.punchId) afterFail(p, x, done); else done();
        })();
        return false;
      },
    });
    const files = PM.poFiles.box(form, x.files, canEdit, 'itp');
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
  }

  /* the plan on paper, with a box for the result and signatures — for the FAT / SAT with the client */
  PM.itpPrint = function (p) {
    const P = PM.printDoc, win = P.open();
    if (!win) return;
    const T = PM.today(), s = PM.itpStats(p, T);
    P.write(win, {
      title: `ITP ${p.code} ${T}`, bar: `ITP — ${p.code}`, doc: 'itp',
      head: { title: `<h1>Inspection & Test Plan (ITP)</h1><p><b>${esc(p.code)} · ${esc(p.name)}</b></p><p>ลูกค้า ${esc(p.client || '–')} · ข้อมูล ณ ${U.date(T)}</p>`, meta: `${esc(PM.COMPANY)}<br>ทดสอบแล้ว ${s.done} / ${s.total}` },
      body: `<style>@page { size: A4 landscape; } main { max-width: 275mm; }</style>
  ${STAGES.filter((st) => s.all.some((x) => x.stage === st.key)).map((st) => `<section class="flow"><h2>${esc(st.label)}</h2>
    ${P.tbl([{ t: '#' }, { t: 'รายการตรวจ / ทดสอบ' }, { t: 'เกณฑ์ยอมรับ' }, { t: 'อ้างอิง' }, { t: 'จุดตรวจ' }, { t: 'ผู้ทำ' }, { t: 'วันที่' }, { t: 'ผล' }, { t: 'ลงชื่อ QC / ลูกค้า' }],
      s.all.filter((x) => x.stage === st.key).sort((a, b) => seqOf(a) - seqOf(b)).map((x) => [esc(x.seq || ''), esc(x.activity), esc(x.criteria || ''), esc(x.ref || ''), esc(x.point || ''), esc(x.party || ''),
        U.date(x.doneDate || x.planDate), x.result === 'pending' ? '☐ ผ่าน ☐ ไม่ผ่าน' : esc(RESULTS[x.result].label), '']), '')}</section>`).join('')}
  <div class="sign"><div>ผู้จัดการโครงการ</div><div>QA / QC</div><div>ตัวแทนลูกค้า</div></div>`,
    });
  };

  /* demo: the first active project mid-FAT */
  PM.buildSampleItp = function (db, T) {
    const p = db.projects.find((x) => x.status !== 'closed');
    if (!p) return [];
    const out = [];
    let day = -20;
    ['inspection', 'fat', 'sat'].forEach((st) => TEMPLATE[st].forEach(([activity, point, criteria], i) => {
      day += 3;
      const date = PM.addDays(T, day), past = date < T;
      const result = !past ? 'pending' : st === 'fat' && i === 3 ? 'fail' : i === 5 && st === 'fat' ? 'pending' : 'pass';
      out.push({ id: `IT-${p.id}-${st}-${i + 1}`, projectId: p.id, stage: st, seq: String(i + 1), activity, ref: '', criteria, point, party: st === 'sat' ? PARTIES[1] : PARTIES[0], planDate: date,
        doneDate: result === 'pending' ? '' : date, result, inspector: 'QC Flowlab', witness: point === 'H' || point === 'W' ? 'ตัวแทนลูกค้า' : '', note: result === 'fail' ? 'ค่าคำนวณต่างจาก Spreadsheet 0.03%' : '',
        files: [], ncrId: '', punchId: '', createdBy: '', createdByName: 'QA/QC' });
    }));
    return out;
  };
})();
