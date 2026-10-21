/* changes.js — project tab "VO · งานเพิ่ม-ลด" (Change Orders / Variation Orders)
   Each VO: amount (± contract value), cost impact (± cost), days (± time) and an approval status.
   Approved VOs give the revised contract value (PM.revisedContract — used by Billing and the report),
   the revised plan cost and the revised finish date. The original contract value on the project stays as it was.
   Data: p.changes = [{ id, no, title, reason, date, amount, cost, days, status, approvedDate, ref, note }] */
(function () {
  const U = PM.ui, esc = U.esc;
  PM.VO_STATUS = [
    { key: 'draft', label: 'ร่าง', level: 'neutral' },
    { key: 'submitted', label: 'ยื่นลูกค้าแล้ว · รออนุมัติ', level: 'warning' },
    { key: 'approved', label: 'อนุมัติแล้ว', level: 'good' },
    { key: 'rejected', label: 'ไม่อนุมัติ', level: 'critical' },
  ];
  PM.VO_REASONS = ['ลูกค้าขอเพิ่ม / เปลี่ยนขอบเขต', 'แก้ไขแบบ (Design change)', 'สภาพหน้างานไม่ตรงแบบ', 'งานลด / ตัดขอบเขต', 'ราคาวัสดุ / ค่าแรงเปลี่ยน', 'อื่น ๆ'];
  const voStatus = (k) => PM.VO_STATUS.find((s) => s.key === k) || PM.VO_STATUS[0];
  const num = (v) => Number(v) || 0;
  const sm = (v) => (v < 0 ? '−' + U.money(-v) : '+' + U.money(v));

  /* totals of a project's VOs */
  PM.voSummary = function (p) {
    const list = p.changes || [];
    const by = (s) => list.filter((c) => c.status === s);
    const ok = by('approved'), wait = by('submitted');
    return {
      list, approved: ok, pending: wait,
      amount: PM.sum(ok, (c) => num(c.amount)), cost: PM.sum(ok, (c) => num(c.cost)), days: PM.sum(ok, (c) => num(c.days)),
      pendingAmount: PM.sum(wait, (c) => num(c.amount)), pendingCost: PM.sum(wait, (c) => num(c.cost)),
    };
  };
  PM.revisedContract = (p) => (Number(p.contractValue) || 0) + PM.voSummary(p).amount;
  const nextNo = (p) => {
    const max = (p.changes || []).reduce((m, c) => { const n = parseInt(String(c.no || '').replace(/\D+/g, ''), 10); return isNaN(n) ? m : Math.max(m, n); }, 0);
    return 'VO-' + String(max + 1).padStart(2, '0');
  };

  PM.changesTab = function (el, p, m, rerender) {
    const canEdit = PM.can('vo.edit');
    const s = PM.voSummary(p);
    const contract = Number(p.contractValue) || 0, revised = contract + s.amount;
    const revCost = m.bac + s.cost;
    const margin0 = contract - m.bac, margin1 = revised - revCost;
    const list = s.list.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.no).localeCompare(String(a.no)));
    const V = PM.common;
    el.innerHTML = `
      <div class="row"><p class="muted" style="margin:0">VO ที่ <b>อนุมัติแล้ว</b> เท่านั้นที่นับเข้ามูลค่าสัญญาปรับปรุง (ใช้ใน งวดเงิน · รายงาน) — มูลค่าสัญญาเดิมของโครงการไม่ถูกแก้</p>
        <span class="spacer"></span>${canEdit ? '<button class="btn primary" data-vo="new">+ VO ใหม่</button>' : ''}</div>
      <div class="grid cols-5">
        ${V.tile({ label: 'มูลค่าสัญญาปรับปรุง', tag: 'Revised', value: U.money(revised), sub: `เดิม ${U.money(contract)} · VO อนุมัติ ${s.approved.length ? sm(s.amount) : '–'}`, icon: 'coins' })}
        ${V.tile({ label: 'VO รออนุมัติ', value: `${s.pending.length} <small>รายการ</small>`, sub: s.pending.length ? U.badge('warning', `มูลค่า ${sm(s.pendingAmount)}`) : 'ไม่มีรายการค้าง' })}
        ${V.tile({ label: 'ต้นทุนที่เปลี่ยนจาก VO', value: s.approved.length ? `<span class="${s.cost > 0 ? 'neg' : ''}">${sm(s.cost)}</span>` : '–', sub: `Plan cost หลัง VO ${U.money(revCost)}` })}
        ${V.tile({ label: 'Margin หลัง VO', tag: 'Margin', value: revised ? U.pct(margin1 / revised, 1) : '–', sub: `เดิม ${contract ? U.pct(margin0 / contract, 1) : '–'} · ${margin1 - margin0 >= 0 ? 'ดีขึ้น' : 'ลดลง'} ${U.money(Math.abs(margin1 - margin0))}` })}
        ${V.tile({ label: 'ระยะเวลาที่ขยาย', value: `${s.days > 0 ? '+' : ''}${U.num(s.days)} <small>วัน</small>`, sub: `เสร็จตามสัญญาปรับปรุง ${U.date(PM.addDays(p.endDate, s.days))}` })}
      </div>
      <div class="card"><div class="card-h"><h2>รายการ VO — ${esc(p.code)}</h2><p>${canEdit ? 'คลิกแถวเพื่อแก้ไข / เปลี่ยนสถานะ · ' : ''}มูลค่า = เพิ่ม / ลดมูลค่าสัญญา (ราคาขาย) · ต้นทุน = ต้นทุนที่เพิ่ม / ลด · ไม่รวม VAT</p></div>
        <div class="card-b flush table-wrap">${list.length ? `<table class="tbl"><thead><tr><th>เลขที่</th><th>รายการ</th><th>วันที่</th><th class="num">มูลค่า (ขาย)</th><th class="num">ต้นทุน</th><th class="num">กำไร VO</th><th class="num">วัน</th><th>สถานะ</th></tr></thead><tbody>
          ${list.map((c) => { const st = voStatus(c.status), gp = num(c.amount) - num(c.cost); return `<tr class="click" data-vo="edit" data-id="${esc(c.id)}">
            <td><span class="title">${esc(c.no)}</span>${c.ref ? `<small>${esc(c.ref)}</small>` : ''}</td>
            <td><span class="title">${esc(c.title)}</span><small>${esc(c.reason || '')}</small></td>
            <td class="nowrap">${U.date(c.date)}</td>
            <td class="num ${num(c.amount) < 0 ? 'neg' : ''}">${sm(num(c.amount))}</td>
            <td class="num">${sm(num(c.cost))}</td>
            <td class="num ${gp < 0 ? 'neg' : ''}">${sm(gp)}<small>${num(c.amount) ? U.pct(gp / num(c.amount), 0) : ''}</small></td>
            <td class="num">${num(c.days) ? (num(c.days) > 0 ? '+' : '') + U.num(c.days) : '–'}</td>
            <td>${U.badge(st.level, st.label)}${c.status === 'approved' && c.approvedDate ? `<small>${U.date(c.approvedDate)}</small>` : ''}</td></tr>`; }).join('')}
          </tbody><tfoot><tr><td></td><td>อนุมัติแล้ว ${s.approved.length} รายการ</td><td></td><td class="num">${sm(s.amount)}</td><td class="num">${sm(s.cost)}</td><td class="num">${sm(s.amount - s.cost)}</td><td class="num">${U.num(s.days)}</td><td></td></tr></tfoot></table>`
          : `<p class="empty">ยังไม่มี VO${canEdit ? ' — กด "+ VO ใหม่" เมื่อมีงานเพิ่ม / ลดจากสัญญา' : ''}</p>`}</div></div>`;

    el.onclick = (e) => {
      const a = e.target.closest('[data-vo]');
      if (!a) return;
      if (a.dataset.vo === 'new') voForm(p, null, rerender);
      if (a.dataset.vo === 'edit') voForm(p, (p.changes || []).find((c) => c.id === a.dataset.id), rerender);
    };
  };

  function voForm(p, vo, done) {
    const canEdit = PM.can('vo.edit');
    if (!vo && !canEdit) return;
    const T = PM.today();
    const c = vo || { id: PM.uid('VO'), no: nextNo(p), title: '', reason: PM.VO_REASONS[0], date: T, amount: '', cost: '', days: 0, status: 'draft', approvedDate: '', ref: '', note: '' };
    const form = U.modal({
      title: vo ? `${c.no} · ${c.title}` : `VO ใหม่ — ${p.code}`, wide: true,
      onDelete: vo && canEdit ? () => { p.changes = (p.changes || []).filter((x) => x.id !== c.id); PM.upsert('projects', p); U.toast('ลบ VO แล้ว'); done(); } : null,
      body: `
        ${U.field('เลขที่ VO', 'no', c.no, { required: true })}
        ${U.field('วันที่', 'date', c.date, { type: 'date', required: true })}
        ${U.field('รายการ / ขอบเขตงาน', 'title', c.title, { required: true, full: true, placeholder: 'เช่น เพิ่มระบบไฟส่องสว่างลานจอด 20 จุด' })}
        ${U.field('สาเหตุ', 'reason', c.reason, { options: PM.VO_REASONS })}
        ${U.field('เลขที่อ้างอิง (หนังสือ / ใบเสนอราคา)', 'ref', c.ref)}
        ${U.field('มูลค่า VO — ราคาขาย (THB)', 'amount', c.amount, { type: 'number', step: 'any', required: true, hint: 'งานลดใส่ค่าติดลบ เช่น -250000' })}
        ${U.field('ต้นทุนที่เปลี่ยน (THB)', 'cost', c.cost, { type: 'number', step: 'any', hint: 'ต้นทุนเพิ่ม (+) / ลด (−) จากงานนี้' })}
        ${U.field('ระยะเวลาที่ขยาย (วัน)', 'days', c.days, { type: 'number', step: 1, hint: 'ขยายเวลาสัญญา (+) / ลด (−)' })}
        <div><span class="muted" style="font-size:12px">กำไรของ VO นี้</span><b id="vo-gp" style="display:block;font-size:18px"></b></div>
        ${U.field('สถานะ', 'status', c.status, { options: PM.VO_STATUS.map((s) => ({ value: s.key, label: s.label })) })}
        ${U.field('วันที่อนุมัติ', 'approvedDate', c.approvedDate, { type: 'date', hint: 'ใส่เมื่อสถานะ = อนุมัติแล้ว' })}
        ${U.field('หมายเหตุ', 'note', c.note, { type: 'textarea', full: true, rows: 2 })}`,
      onSubmit: canEdit ? (f) => {
        if (!f.title) { U.alert('กรุณากรอกรายการ'); return false; }
        if (f.status === 'approved' && !f.approvedDate) f.approvedDate = T;
        if (f.status !== 'approved') f.approvedDate = '';
        Object.assign(c, f);
        p.changes = p.changes || [];
        if (!p.changes.includes(c)) p.changes.push(c);
        PM.upsert('projects', p);
        U.toast(vo ? 'บันทึก VO แล้ว' : 'เพิ่ม VO แล้ว');
        done();
      } : null,
    });
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
    const gp = form.querySelector('#vo-gp');
    const upd = () => { const a = num(form.amount.value), k = num(form.cost.value); gp.textContent = `${sm(a - k)}${a ? ` (${U.pct((a - k) / a, 1)})` : ''}`; gp.className = a - k < 0 ? 'neg' : ''; };
    form.addEventListener('input', upd);
    upd();
  }

  /* demo data: one approved and one pending VO on the larger active projects */
  PM.buildSampleChanges = function (p) {
    if (p.status === 'closed' || !(p.contractValue > 150e6)) return [];
    const T = PM.today(), v = p.contractValue;
    return [
      { id: PM.uid('VO'), no: 'VO-01', title: 'เพิ่มระบบไฟส่องสว่างและกล้อง CCTV ลานจอด', reason: PM.VO_REASONS[0], date: PM.addDays(T, -75), amount: Math.round(v * 0.025), cost: Math.round(v * 0.019), days: 14, status: 'approved', approvedDate: PM.addDays(T, -52), ref: 'CL-LTR-018', note: '' },
      { id: PM.uid('VO'), no: 'VO-02', title: 'ปรับแบบฐานรากอุปกรณ์ตามผลเจาะสำรวจดิน', reason: PM.VO_REASONS[2], date: PM.addDays(T, -12), amount: Math.round(v * 0.012), cost: Math.round(v * 0.01), days: 7, status: 'submitted', approvedDate: '', ref: 'QT-VO-02', note: '' },
    ];
  };
})();
