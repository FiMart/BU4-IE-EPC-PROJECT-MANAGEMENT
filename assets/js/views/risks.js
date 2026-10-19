/* risks.js — project tab "ความเสี่ยง & ปัญหา" (Risk & Issue register)
   Risk = something that may happen (likelihood × impact, 1–5 each → score 1–25); Issue = it is happening now.
   Score ≥ 15 สูงมาก · 10–14 สูง · 5–9 ปานกลาง · < 5 ต่ำ. Each item has an owner, a response plan and an action date.
   Data: p.risks = [{ id, no, type, title, category, likelihood, impact, owner, response, dueDate, status, note, createdAt }] */
(function () {
  const U = PM.ui, esc = U.esc;
  PM.RISK_CATEGORIES = ['Schedule / เวลา', 'Cost / ต้นทุน', 'Technical / เทคนิค', 'Procurement / จัดหา', 'Safety / ความปลอดภัย', 'Quality / คุณภาพ', 'Commercial / สัญญา', 'External / ภายนอก'];
  PM.RISK_STATUS = [
    { key: 'open', label: 'เปิด', level: 'warning' },
    { key: 'monitoring', label: 'เฝ้าระวัง', level: 'info' },
    { key: 'closed', label: 'ปิดแล้ว', level: 'good' },
  ];
  const LIKELIHOOD = ['', 'น้อยมาก', 'น้อย', 'ปานกลาง', 'สูง', 'สูงมาก'];
  const IMPACT = ['', 'น้อยมาก', 'น้อย', 'ปานกลาง', 'สูง', 'รุนแรง'];
  PM.riskScore = (r) => (Number(r.likelihood) || 1) * (Number(r.impact) || 1);
  PM.riskLevel = (score) => (score >= 15 ? { key: 'critical', label: 'สูงมาก' } : score >= 10 ? { key: 'serious', label: 'สูง' } : score >= 5 ? { key: 'warning', label: 'ปานกลาง' } : { key: 'good', label: 'ต่ำ' });
  PM.riskOpen = (r) => r.status !== 'closed';
  PM.riskOverdue = (r, T) => PM.riskOpen(r) && r.dueDate && r.dueDate < (T || PM.today());
  const nextNo = (p, type) => {
    const pre = type === 'issue' ? 'IS-' : 'R-';
    const max = (p.risks || []).filter((r) => String(r.no || '').startsWith(pre)).reduce((m, r) => Math.max(m, parseInt(String(r.no).slice(pre.length), 10) || 0), 0);
    return pre + String(max + 1).padStart(2, '0');
  };

  PM.risksTab = function (el, p, m, rerender) {
    const canEdit = PM.can('risk.edit');
    const T = PM.today();
    const all = p.risks || [];
    const open = all.filter(PM.riskOpen);
    const risks = open.filter((r) => r.type !== 'issue'), issues = open.filter((r) => r.type === 'issue');
    const high = open.filter((r) => PM.riskScore(r) >= 15), overdue = open.filter((r) => PM.riskOverdue(r, T));
    const sorted = all.slice().sort((a, b) => (PM.riskOpen(b) - PM.riskOpen(a)) || PM.riskScore(b) - PM.riskScore(a) || String(a.dueDate).localeCompare(String(b.dueDate)));
    const V = PM.common;
    // 5×5 matrix of open risks and issues: rows = impact (5 at the top), columns = likelihood
    const cell = (l, i) => {
      const xs = open.filter((r) => Number(r.likelihood) === l && Number(r.impact) === i);
      const lv = PM.riskLevel(l * i).key;
      return `<div class="rm-cell lv-${lv}" title="${esc(`โอกาส ${LIKELIHOOD[l]} × ผลกระทบ ${IMPACT[i]} = ${l * i}${xs.length ? '\n' + xs.map((r) => `${r.no} ${r.title}`).join('\n') : ''}`)}">${xs.map((r) => `<button type="button" class="rm-dot${r.type === 'issue' ? ' issue' : ''}" data-risk="edit" data-id="${esc(r.id)}">${esc(r.no)}</button>`).join('')}</div>`;
    };
    el.innerHTML = `
      <div class="row"><p class="muted" style="margin:0">ความเสี่ยง (Risk) = อาจเกิดขึ้น · ปัญหา (Issue) = เกิดขึ้นแล้ว · คะแนน = โอกาส × ผลกระทบ (1–25)</p>
        <span class="spacer"></span>${canEdit ? '<button class="btn" data-risk="new-issue">+ ปัญหา (Issue)</button><button class="btn primary" data-risk="new">+ ความเสี่ยง</button>' : ''}</div>
      <div class="grid cols-4">
        ${V.tile({ label: 'ความเสี่ยงที่เปิดอยู่', value: risks.length, sub: `ปิดแล้ว ${all.filter((r) => !PM.riskOpen(r)).length} รายการ`, icon: 'alert' })}
        ${V.tile({ label: 'ระดับสูงมาก (≥ 15)', value: high.length, sub: high.length ? U.badge('critical', 'ต้องมีแผนรับมือ') : U.badge('good', 'ไม่มี') })}
        ${V.tile({ label: 'ปัญหาที่ยังไม่ปิด', tag: 'Issue', value: issues.length, sub: issues.length ? 'ติดตามจนแก้เสร็จ' : U.badge('good', 'ไม่มี') })}
        ${V.tile({ label: 'เลยกำหนดดำเนินการ', value: overdue.length, sub: overdue.length ? U.badge('critical', 'อัปเดตแผน / ผู้รับผิดชอบ') : U.badge('good', 'ตามกำหนด') })}
      </div>
      <div class="grid cols-2 risk-top">
        <div class="card"><div class="card-h"><h2>Risk Matrix</h2><p>แนวตั้ง = ผลกระทบ · แนวนอน = โอกาส · กล่องมุมขวาบน = เสี่ยงที่สุด${canEdit ? ' · คลิกเลขเพื่อแก้ไข' : ''}</p></div>
          <div class="card-b"><div class="rm">
            <div class="rm-y">ผลกระทบ →</div>
            <div class="rm-grid">${[5, 4, 3, 2, 1].map((i) => `<div class="rm-ylab">${i}<small>${IMPACT[i]}</small></div>${[1, 2, 3, 4, 5].map((l) => cell(l, i)).join('')}`).join('')}
              <div></div>${[1, 2, 3, 4, 5].map((l) => `<div class="rm-xlab">${l}<small>${LIKELIHOOD[l]}</small></div>`).join('')}</div>
            <div class="rm-x">โอกาสเกิด →</div>
          </div></div></div>
        <div class="card"><div class="card-h"><h2>ต้องติดตาม</h2><p>ระดับสูงมาก · เลยกำหนด · ปัญหาที่ยังไม่ปิด</p></div>
          <div class="card-b flush">${(() => {
            const watch = open.filter((r) => PM.riskScore(r) >= 15 || PM.riskOverdue(r, T) || r.type === 'issue').sort((a, b) => PM.riskScore(b) - PM.riskScore(a)).slice(0, 8);
            return watch.length ? `<ul class="risk-watch">${watch.map((r) => { const lv = PM.riskLevel(PM.riskScore(r)); return `<li data-risk="edit" data-id="${esc(r.id)}">
              <span class="risk-score lv-${lv.key}">${PM.riskScore(r)}</span>
              <span><b>${esc(r.no)} · ${esc(r.title)}</b><small>${esc(r.owner || 'ยังไม่มีผู้รับผิดชอบ')}${r.dueDate ? ` · กำหนด ${U.date(r.dueDate)}` : ''}${PM.riskOverdue(r, T) ? ' · <span class="neg">เลยกำหนด</span>' : ''}</small></span>
              ${r.type === 'issue' ? '<span class="chip">Issue</span>' : ''}</li>`; }).join('')}</ul>` : '<p class="empty">ไม่มีเรื่องที่ต้องติดตามเป็นพิเศษ</p>';
          })()}</div></div>
      </div>
      <div class="card"><div class="card-h"><h2>Risk & Issue Register — ${esc(p.code)}</h2><p>เรียงจากคะแนนสูงไปต่ำ · รายการที่ปิดแล้วอยู่ท้าย${canEdit ? ' · คลิกแถวเพื่อแก้ไข' : ''}</p></div>
        <div class="card-b flush table-wrap">${sorted.length ? `<table class="tbl"><thead><tr><th>เลขที่</th><th>เรื่อง</th><th>หมวด</th><th class="num">โอกาส × ผลกระทบ</th><th>ระดับ</th><th>ผู้รับผิดชอบ</th><th>แผนรับมือ / การแก้ไข</th><th>กำหนด</th><th>สถานะ</th></tr></thead><tbody>
          ${sorted.map((r) => { const sc = PM.riskScore(r), lv = PM.riskLevel(sc), st = PM.RISK_STATUS.find((x) => x.key === r.status) || PM.RISK_STATUS[0]; return `<tr class="click${PM.riskOpen(r) ? '' : ' risk-closed'}" data-risk="edit" data-id="${esc(r.id)}">
            <td class="nowrap"><span class="title">${esc(r.no)}</span><small>${r.type === 'issue' ? 'Issue' : 'Risk'}</small></td>
            <td><span class="title">${esc(r.title)}</span>${r.note ? `<small>${esc(r.note)}</small>` : ''}</td>
            <td>${esc(r.category || '–')}</td>
            <td class="num">${U.num(r.likelihood)} × ${U.num(r.impact)} = <b>${sc}</b></td>
            <td>${U.badge(lv.key, lv.label)}</td>
            <td>${esc(r.owner || '–')}</td>
            <td class="risk-resp">${esc(r.response || '–')}</td>
            <td class="nowrap">${U.date(r.dueDate)}${PM.riskOverdue(r, T) ? `<small class="neg">เลย ${PM.diffDays(r.dueDate, T)} วัน</small>` : ''}</td>
            <td>${U.badge(st.level, st.label)}</td></tr>`; }).join('')}</tbody></table>`
          : `<p class="empty">ยังไม่มีความเสี่ยง${canEdit ? ' — เริ่มจากเรื่องที่อาจทำให้งานช้า เกินงบ หรือไม่ปลอดภัย แล้วกด "+ ความเสี่ยง"' : ''}</p>`}</div></div>`;

    el.onclick = (e) => {
      const a = e.target.closest('[data-risk]');
      if (!a) return;
      const act = a.dataset.risk;
      if (act === 'new') riskForm(p, null, 'risk', rerender);
      if (act === 'new-issue') riskForm(p, null, 'issue', rerender);
      if (act === 'edit') riskForm(p, all.find((r) => r.id === a.dataset.id), null, rerender);
    };
  };

  function riskForm(p, risk, type, done) {
    const canEdit = PM.can('risk.edit');
    if (!risk && !canEdit) return;
    const T = PM.today();
    const r = risk || { id: PM.uid('RK'), no: nextNo(p, type), type, title: '', category: PM.RISK_CATEGORIES[0], likelihood: type === 'issue' ? 5 : 3, impact: 3, owner: '', response: '', dueDate: PM.addDays(T, 14), status: 'open', note: '', createdAt: T };
    const opt = (labels) => [1, 2, 3, 4, 5].map((v) => ({ value: String(v), label: `${v} — ${labels[v]}` }));
    const form = U.modal({
      title: risk ? `${r.no} · ${r.title}` : r.type === 'issue' ? `ปัญหาใหม่ (Issue) — ${p.code}` : `ความเสี่ยงใหม่ — ${p.code}`, wide: true,
      onDelete: risk && canEdit ? () => { p.risks = (p.risks || []).filter((x) => x.id !== r.id); PM.upsert('projects', p); U.toast('ลบแล้ว'); done(); } : null,
      body: `
        ${U.field('ประเภท', 'type', r.type, { options: [{ value: 'risk', label: 'ความเสี่ยง (Risk) — อาจเกิดขึ้น' }, { value: 'issue', label: 'ปัญหา (Issue) — เกิดขึ้นแล้ว' }] })}
        ${U.field('เลขที่', 'no', r.no, { required: true })}
        ${U.field('เรื่อง', 'title', r.title, { required: true, full: true, placeholder: 'เช่น หม้อแปลงจากผู้ขายส่งช้ากว่ากำหนด 6 สัปดาห์' })}
        ${U.field('หมวด', 'category', r.category, { options: PM.RISK_CATEGORIES })}
        ${U.field('ผู้รับผิดชอบ', 'owner', r.owner, { placeholder: 'ชื่อ / ทีม' })}
        ${U.field('โอกาสเกิด (1–5)', 'likelihood', String(r.likelihood), { options: opt(LIKELIHOOD), hint: 'Issue = เกิดแล้ว ใช้ 5' })}
        ${U.field('ผลกระทบ (1–5)', 'impact', String(r.impact), { options: opt(IMPACT), hint: 'ต่อเวลา ต้นทุน ความปลอดภัย หรือคุณภาพ' })}
        <div class="full risk-meter"><span>คะแนน</span><b id="rk-score"></b><span id="rk-level"></span></div>
        ${U.field('แผนรับมือ / การแก้ไข', 'response', r.response, { type: 'textarea', full: true, rows: 2, placeholder: 'ป้องกัน · ลดผลกระทบ · โอนความเสี่ยง (ประกัน / สัญญา) · ยอมรับ' })}
        ${U.field('กำหนดดำเนินการ / ทบทวน', 'dueDate', r.dueDate, { type: 'date' })}
        ${U.field('สถานะ', 'status', r.status, { options: PM.RISK_STATUS.map((s) => ({ value: s.key, label: s.label })) })}
        ${U.field('หมายเหตุ', 'note', r.note, { type: 'textarea', full: true, rows: 2 })}`,
      onSubmit: canEdit ? (f) => {
        if (!f.title) { alert('กรุณากรอกเรื่อง'); return false; }
        Object.assign(r, f, { likelihood: Number(f.likelihood), impact: Number(f.impact) });
        p.risks = p.risks || [];
        if (!p.risks.includes(r)) p.risks.push(r);
        PM.upsert('projects', p);
        U.toast(risk ? 'บันทึกแล้ว' : 'เพิ่มแล้ว');
        done();
      } : null,
    });
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((x) => { x.disabled = true; });
    const upd = () => {
      const sc = Number(form.likelihood.value) * Number(form.impact.value), lv = PM.riskLevel(sc);
      form.querySelector('#rk-score').textContent = sc;
      form.querySelector('#rk-level').innerHTML = U.badge(lv.key, lv.label);
    };
    form.addEventListener('change', upd);
    upd();
  }

  /* demo data: a few typical EPC risks per active project */
  PM.buildSampleRisks = function (p) {
    if (p.status === 'closed') return [];
    const T = PM.today();
    const mk = (no, type, title, category, l, i, owner, response, due, status) => ({ id: PM.uid('RK'), no, type, title, category, likelihood: l, impact: i, owner, response, dueDate: PM.addDays(T, due), status, note: '', createdAt: PM.addDays(T, -40) });
    return [
      mk('R-01', 'risk', 'อุปกรณ์หลัก (Long-lead) ส่งช้ากว่ากำหนด', PM.RISK_CATEGORIES[3], 4, 4, 'ทีมจัดซื้อ', 'ติดตามผู้ผลิตทุกสัปดาห์ · ขอ FAT schedule · เตรียมผู้ขายสำรอง', -3, 'open'),
      mk('R-02', 'risk', 'ฝนตกหนักช่วงงานโยธา', PM.RISK_CATEGORIES[7], 3, 3, 'Site manager', 'เลื่อนงานเทคอนกรีตไปช่วงแห้ง · เตรียมปั๊มน้ำและผ้าใบ', 21, 'monitoring'),
      mk('R-03', 'risk', 'ราคาเหล็กและสายไฟปรับขึ้น', PM.RISK_CATEGORIES[1], 3, 4, 'PM', 'สั่งซื้อล่วงหน้า / ล็อคราคากับผู้ขาย · สำรอง Contingency', 30, 'open'),
      mk('R-04', 'risk', 'ทำงานบนที่สูงระหว่างติดตั้ง', PM.RISK_CATEGORIES[4], 2, 5, 'Safety officer', 'Work permit · Full body harness · ตรวจนั่งร้านทุกเช้า', 7, 'open'),
      mk('IS-01', 'issue', 'แบบ IFC บางส่วนยังไม่ได้รับอนุมัติจากลูกค้า', PM.RISK_CATEGORIES[2], 5, 3, 'Engineering lead', 'ประชุมกับลูกค้าสัปดาห์นี้ · ส่งแบบแก้ไขภายใน 5 วัน', 4, 'open'),
    ];
  };
})();
