/* boq.js — project tab "BOQ" (Bill of Quantities, ปร.4 style): sections (หมวดงาน) → items with quantity × (material + labour) rates,
   quantity done for progress. Paste from Excel · rates from the Price List · Export Excel / PDF.
   Ties into the rest: compare with Plan cost and contract value · set Plan cost from the BOQ · update Phase % from quantity done ·
   Cash Flow builds its work packages from the BOQ sections (cashflow.js → PM.cashflowDefaultBoq).
   Data: p.boq = { sections: [{ id, name, phase, start, end, curve }], items: [{ id, section, name, unit, qty, mat, lab, done, priceId, note }] } */
(function () {
  const U = PM.ui, esc = U.esc;
  const state = U.keep('boq', { phase: '', q: '' }, ['phase']);
  const num = (v) => Number(v) || 0;
  const rate = (it) => num(it.mat) + num(it.lab);
  const amount = (it) => num(it.qty) * rate(it);
  const doneAmt = (it) => Math.min(num(it.done), num(it.qty)) * rate(it);
  const pctDone = (it) => (num(it.qty) ? Math.min(1, num(it.done) / num(it.qty)) : 0);
  const fmt2 = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const fmtQ = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
  const CURVES = [{ value: 's', label: 'S-curve (ช้า–เร็ว–ช้า)' }, { value: 'linear', label: 'เท่ากันทุกเดือน' }, { value: 'front', label: 'หนักช่วงต้น' }, { value: 'back', label: 'หนักช่วงท้าย' }];
  const phaseOf = (p, key) => (p.phases || []).find((x) => x.key === key) || {};

  const boqOf = (p) => (p.boq && Array.isArray(p.boq.sections) ? p.boq : { sections: [], items: [] });
  /* per section: totals, done, numbering (1, 1.1, 1.2 …) */
  PM.boqSummary = function (p) {
    const b = boqOf(p);
    const sections = b.sections.map((s, i) => {
      const items = b.items.filter((it) => it.section === s.id);
      return { s, no: i + 1, items, total: PM.sum(items, amount), mat: PM.sum(items, (it) => num(it.qty) * num(it.mat)), lab: PM.sum(items, (it) => num(it.qty) * num(it.lab)), done: PM.sum(items, doneAmt) };
    });
    const total = PM.sum(sections, (x) => x.total), done = PM.sum(sections, (x) => x.done);
    const byPhase = {};
    PM.PHASES.forEach((ph) => {
      const xs = sections.filter((x) => x.s.phase === ph.key);
      byPhase[ph.key] = { total: PM.sum(xs, (x) => x.total), done: PM.sum(xs, (x) => x.done) };
    });
    return { sections, total, done, mat: PM.sum(sections, (x) => x.mat), lab: PM.sum(sections, (x) => x.lab), items: b.items.length, progress: total ? done / total : null, byPhase };
  };
  const save = (p, b) => {
    const u = PM.auth && PM.auth.user;
    p.boq = Object.assign(b, { updatedAt: PM.today(), updatedByName: u ? PM.auth.displayName(u) : '' });
    PM.upsert('projects', p);
  };
  const newSection = (p, name, phase) => {
    const ph = phaseOf(p, phase);
    return { id: PM.uid('S'), name, phase, start: ph.planStart || p.startDate, end: ph.planEnd || p.endDate, curve: phase === 'closing' ? 'linear' : 's' };
  };

  /* ---------------- the tab ---------------- */
  PM.boqTab = function (el, p, m, rerender) {
    const canEdit = PM.can('boq.edit');
    const b = boqOf(p);
    const sum = PM.boqSummary(p);
    const q = state.q.trim().toLowerCase();
    const hit = (it) => !q || [it.name, it.unit, it.note].join(' ').toLowerCase().includes(q);
    const shown = sum.sections.filter((x) => !state.phase || x.s.phase === state.phase);
    const diffPlan = sum.total - m.bac, margin = (p.contractValue || 0) - sum.total;
    const planOk = Math.abs(diffPlan) < Math.max(1, m.bac * 0.001); // rounding of unit rates (≤ 0.1%) still counts as equal

    el.innerHTML = `
      <div class="row">
        <select id="boq-phase" aria-label="Phase">${U.options([{ value: '', label: 'ทุก Phase' }].concat(PM.PHASES.map((x) => ({ value: x.key, label: x.label }))), state.phase)}</select>
        <input type="search" id="boq-q" placeholder="ค้นหารายการ / หน่วย…" value="${esc(state.q)}" style="width:220px">
        <span class="spacer"></span>
        ${sum.items ? '<button type="button" class="btn" data-boq="xlsx">⬇ Excel</button><button type="button" class="btn" data-boq="pdf">⬇ PDF</button>' : ''}
        ${canEdit ? `<button type="button" class="btn" data-boq="paste">วางจาก Excel</button>
          <button type="button" class="btn" data-boq="new-section">+ หมวดงาน</button>
          <button type="button" class="btn primary" data-boq="new-item"${b.sections.length ? '' : ' disabled title="เพิ่มหมวดงานก่อน"'}>+ รายการ</button>` : ''}
      </div>
      <div class="grid cols-5">
        ${PM.common.tile({ label: 'มูลค่า BOQ', tag: 'ต้นทุน', value: U.money(sum.total), sub: `${U.num(sum.items)} รายการ · ${b.sections.length} หมวดงาน`, icon: 'coins' })}
        ${PM.common.tile({ label: 'ค่าวัสดุ / ค่าแรง', value: `${U.pct(sum.total ? sum.mat / sum.total : null)} <small>/ ${U.pct(sum.total ? sum.lab / sum.total : null)}</small>`, sub: `${U.money(sum.mat)} · ${U.money(sum.lab)}` })}
        ${PM.common.tile({ label: 'เทียบ Plan cost', value: sum.total ? (planOk ? U.badge('good', 'ตรงกัน') : `<span class="neg">${(diffPlan > 0 ? '+' : '−') + U.money(Math.abs(diffPlan))}</span>`) : '–',
          sub: `Plan cost ${U.money(m.bac)}${planOk && Math.abs(diffPlan) >= 1 ? ` · ต่างจากการปัดเศษ ${U.money(Math.abs(diffPlan))}` : ''}${canEdit && sum.total && !planOk ? ' · <button type="button" class="link-btn" data-boq="to-plan">ใช้ยอด BOQ เป็น Plan cost</button>' : ''}` })}
        ${PM.common.tile({ label: 'เทียบมูลค่าสัญญา', tag: 'Margin', value: sum.total && p.contractValue ? `<span class="${margin < 0 ? 'neg' : ''}">${U.pct(margin / p.contractValue, 1)}</span>` : '–', sub: p.contractValue ? `สัญญา ${U.money(p.contractValue)} · ${margin < 0 ? 'ขาดทุน' : 'กำไร'} ${U.money(Math.abs(margin))}` : 'ยังไม่มีมูลค่าสัญญา' })}
        ${PM.common.tile({ label: 'ผลงานตาม BOQ', tag: 'ปริมาณที่ทำแล้ว', value: U.pct(sum.progress, 1), sub: `${U.money(sum.done)} จาก ${U.money(sum.total)}${canEdit && sum.total ? ' · <button type="button" class="link-btn" data-boq="to-phase">อัปเดต % Phase</button>' : ''}`, tip: 'ผลรวม (ปริมาณที่ทำแล้ว × ราคาต่อหน่วย) ÷ มูลค่า BOQ' })}
      </div>
      ${docsCard(b, canEdit)}
      ${sum.total ? `<div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>มูลค่าตามหมวดงาน</h2><p>แท่ง = มูลค่า · ข้อความ = % ที่ทำแล้ว</p></div><div class="card-b"><div class="chart" id="c-boq-sec"></div></div></div>
        <div class="card"><div class="card-h"><h2>BOQ เทียบ Plan cost ตาม Phase</h2><p>เส้นดำ = Plan cost ของ Phase</p></div><div class="card-b"><div class="chart" id="c-boq-ph"></div></div></div>
      </div>` : ''}
      <div class="card">
        <div class="card-h"><h2>Bill of Quantities — ${esc(p.code)}</h2><p>${canEdit ? 'คลิกหัวหมวดหรือรายการเพื่อแก้ไข · ' : ''}ราคาต่อหน่วยไม่รวม VAT${b.updatedAt ? ` · แก้ไขล่าสุด ${U.date(b.updatedAt)}${b.updatedByName ? ' · ' + esc(b.updatedByName) : ''}` : ''}</p></div>
        <div class="card-b flush table-wrap">${b.sections.length ? table(shown, sum, hit, canEdit) : empty(canEdit)}</div>
      </div>`;

    if (sum.total) {
      PM.charts.hbars(el.querySelector('#c-boq-sec'), {
        items: sum.sections.filter((x) => x.total).map((x) => ({ label: `${x.no}. ${x.s.name}`, sub: `เสร็จ ${U.pct(x.total ? x.done / x.total : null)}`, value: x.total, display: U.money(x.total), color: `var(--s${PM.PHASES.findIndex((ph) => ph.key === x.s.phase) + 1})`,
          tip: `${x.no}. ${x.s.name}\n${U.money(x.total)} · ${U.pct(sum.total ? x.total / sum.total : null, 1)} ของทั้งหมด\nทำแล้ว ${U.money(x.done)}` })),
      });
      PM.charts.hbars(el.querySelector('#c-boq-ph'), {
        items: PM.PHASES.map((ph, i) => ({ label: ph.label, sub: `Plan ${U.money(phaseOf(p, ph.key).budget || 0)}`, value: sum.byPhase[ph.key].total, target: phaseOf(p, ph.key).budget || 0, display: U.money(sum.byPhase[ph.key].total), color: `var(--s${i + 1})`,
          tip: `${ph.label}\nBOQ ${U.money(sum.byPhase[ph.key].total)}\nPlan cost ${U.money(phaseOf(p, ph.key).budget || 0)}` })),
      });
    }

    bindDocs(el, p, b, canEdit, rerender);
    el.querySelector('#boq-phase').onchange = (e) => { state.phase = e.target.value; rerender(); };
    el.querySelector('#boq-q').addEventListener('input', (e) => {
      state.q = e.target.value;
      clearTimeout(state.t);
      state.t = setTimeout(() => { rerender(); const i = document.getElementById('boq-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250);
    });
    el.onclick = (e) => {
      const a = e.target.closest('[data-boq]');
      const act = a && a.dataset.boq, id = a && a.dataset.id;
      if (!act) return;
      if (act === 'new-section') sectionForm(p, null, rerender);
      if (act === 'section') sectionForm(p, b.sections.find((s) => s.id === id), rerender);
      if (act === 'new-item') itemForm(p, null, a.dataset.section, rerender);
      if (act === 'item') itemForm(p, b.items.find((it) => it.id === id), null, rerender);
      if (act === 'paste') pasteForm(p, rerender);
      if (act === 'from-phases' && canEdit) { save(p, { sections: PM.PHASES.map((ph) => newSection(p, `${ph.label} — ${ph.th}`, ph.key)), items: [], files: b.files || [] }); U.toast('สร้างหมวดงานจาก 4 Phase แล้ว'); rerender(); }
      if (act === 'xlsx') PM.xport.excel(report(p, sum));
      if (act === 'pdf') PM.xport.pdf(report(p, sum));
      if (act === 'to-plan' && canEdit) toPlan(p, sum, rerender);
      if (act === 'to-phase' && canEdit) toPhase(p, sum, rerender);
    };
  };

  /* ---------- BOQ documents: PDF (the signed BOQ, ปร.4 / ปร.5, drawings) kept with the project to view any time ----------
     stored in Supabase Storage at <projectId>/boq/… (same private bucket as PO files) — uploaded at once, no Save needed */
  const DOC_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls';
  function docsCard(b, canEdit) {
    const F = PM.poFiles, files = b.files || [];
    const can = canEdit && F.available();
    return `<div class="card boq-docs" data-boq-docs>
      <div class="card-h"><h2>เอกสาร BOQ</h2><span class="chip">${files.length} ไฟล์</span><p>ไฟล์ PDF ของ BOQ (ฉบับลงนาม · ปร.4 / ปร.5 · แบบประกอบ) — คลิกเพื่อเปิดดูในหน้านี้</p>
        <span class="spacer"></span>${can ? `<label class="btn sm primary"><input type="file" data-boq-upload multiple accept="${DOC_ACCEPT}" hidden>⬆ อัปโหลด PDF</label>` : ''}</div>
      <div class="card-b">
        ${files.length ? `<div class="doc-grid">${files.map((f, i) => `
          <div class="doc">
            <button type="button" class="doc-open" data-boq="doc-view" data-i="${i}" title="เปิดดู ${esc(f.name)}">
              <span class="doc-ic ${/\.pdf$/i.test(f.name) ? 'pdf' : ''}">${esc(F.fileIcon(f.name))}</span>
              <span class="doc-meta"><b>${esc(f.name)}</b><small>${F.fileSize(f.size || 0)}${f.uploadedByName ? ' · ' + esc(f.uploadedByName) : ''}${f.uploadedAt ? ' · ' + U.date(f.uploadedAt.slice(0, 10)) : ''}</small></span>
              <span class="doc-go" aria-hidden="true">👁 ดู</span>
            </button>
            ${can ? `<button type="button" class="icon-btn doc-del" data-boq="doc-del" data-i="${i}" aria-label="ลบ ${esc(f.name)}">✕</button>` : ''}
          </div>`).join('')}</div>` : ''}
        ${can ? `<div class="doc-drop" data-boq-drop>ลากไฟล์ PDF มาวางที่นี่ หรือกด "อัปโหลด PDF" · PDF / รูปภาพ / Excel ไม่เกิน 20 MB ต่อไฟล์</div>`
          : !files.length ? `<p class="empty">${canEdit ? 'อัปโหลดไฟล์ได้เมื่อเชื่อมต่อ Cloud (Supabase)' : 'ยังไม่มีเอกสาร BOQ'}</p>` : ''}
        <p class="doc-status muted" aria-live="polite"></p>
      </div></div>`;
  }
  function bindDocs(el, p, b, canEdit, rerender) {
    const card = el.querySelector('[data-boq-docs]');
    if (!card) return;
    const F = PM.poFiles, status = card.querySelector('.doc-status');
    const upload = async (list) => {
      const files = Array.from(list || []).filter((f) => {
        if (f.size > 20 * 1048576) { alert(`${f.name} ใหญ่เกิน 20 MB`); return false; }
        if (!/\.(pdf|png|jpe?g|webp|xlsx?)$/i.test(f.name)) { alert(`${f.name}: รองรับเฉพาะ PDF รูปภาพ และ Excel`); return false; }
        return true;
      });
      if (!files.length) return;
      const problems = [];
      b.files = b.files || [];
      for (const f of files) {
        status.textContent = `กำลังอัปโหลด ${f.name}…`;
        try { b.files.push(await F.upload(`${p.id}/boq`, f)); } catch (e) { problems.push(`${f.name}: ${e.message}`); }
      }
      save(p, b);
      if (problems.length) alert('อัปโหลดไม่สำเร็จ:\n' + problems.join('\n'));
      else U.toast(`อัปโหลด ${files.length} ไฟล์แล้ว`);
      rerender();
    };
    const input = card.querySelector('[data-boq-upload]');
    if (input) input.addEventListener('change', () => upload(input.files));
    const drop = card.querySelector('[data-boq-drop]');
    if (drop) {
      ['dragenter', 'dragover'].forEach((t) => card.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('hot'); }));
      ['dragleave', 'drop'].forEach((t) => card.addEventListener(t, (e) => { e.preventDefault(); if (t === 'drop' || !card.contains(e.relatedTarget)) drop.classList.remove('hot'); }));
      card.addEventListener('drop', (e) => upload(e.dataTransfer && e.dataTransfer.files));
    }
    card.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-boq]');
      if (!a) return;
      e.stopPropagation(); // not the tab's own click handler
      const f = (b.files || [])[+a.dataset.i];
      if (!f) return;
      if (a.dataset.boq === 'doc-view') {
        if (!F.available()) { alert('เปิดไฟล์ได้เมื่อเชื่อมต่อ Cloud (Supabase)'); return; }
        F.view(f);
      }
      if (a.dataset.boq === 'doc-del' && canEdit && confirm(`ลบไฟล์ ${f.name}?`)) {
        try { await F.remove([f.path]); } catch (err) { alert('ลบไฟล์ไม่สำเร็จ: ' + err.message); return; }
        b.files = b.files.filter((x) => x !== f);
        save(p, b);
        U.toast('ลบไฟล์แล้ว');
        rerender();
      }
    });
  }

  function empty(canEdit) {
    return `<div class="empty-boq"><p class="empty">ยังไม่มี BOQ ของโครงการนี้</p>${canEdit ? `<div class="row" style="justify-content:center">
      <button type="button" class="btn primary" data-boq="paste">วางจาก Excel</button>
      <button type="button" class="btn" data-boq="from-phases">สร้างหมวดงานจาก 4 Phase</button>
      <button type="button" class="btn" data-boq="new-section">+ หมวดงาน</button></div>` : ''}</div>`;
  }

  function table(shown, sum, hit, canEdit) {
    const click = canEdit ? ' click' : '';
    const rows = shown.map((x) => {
      const items = x.items.filter(hit);
      if (!items.length && x.items.length) return ''; // search hides the whole section
      return `<tr class="boq-sec${click}" data-boq="section" data-id="${esc(x.s.id)}">
          <td class="boq-no">${x.no}</td><td colspan="2"><b>${esc(x.s.name)}</b> <span class="chip">${esc(U.phaseLabel(x.s.phase))}</span></td>
          <td colspan="4" class="muted">${U.date(x.s.start)} – ${U.date(x.s.end)}</td>
          <td class="num">${fmt2(x.mat)}</td><td class="num">${fmt2(x.lab)}</td><td class="num"><b>${fmt2(x.total)}</b></td>
          <td class="num">${U.pct(x.total ? x.done / x.total : null)}</td></tr>
        ${items.map((it, k) => `<tr class="boq-item${click}" data-boq="item" data-id="${esc(it.id)}">
          <td class="boq-no">${x.no}.${x.items.indexOf(it) + 1}</td>
          <td>${esc(it.name)}${it.note ? `<small>${esc(it.note)}</small>` : ''}${it.priceId ? ' <span class="chip" title="ราคาจาก Price List">PL</span>' : ''}</td>
          <td>${esc(it.unit || '')}</td><td class="num">${fmtQ(it.qty)}</td>
          <td class="num">${fmt2(it.mat)}</td><td class="num">${fmt2(it.lab)}</td><td class="num">${fmt2(rate(it))}</td>
          <td class="num">${fmt2(num(it.qty) * num(it.mat))}</td><td class="num">${fmt2(num(it.qty) * num(it.lab))}</td><td class="num">${fmt2(amount(it))}</td>
          <td class="num boq-done">${num(it.done) ? `${fmtQ(it.done)}<small>${U.pct(pctDone(it))}</small>` : '–'}</td></tr>`).join('')}
        ${canEdit ? `<tr class="boq-add"><td></td><td colspan="10"><button type="button" class="link-btn" data-boq="new-item" data-section="${esc(x.s.id)}">+ เพิ่มรายการในหมวด ${x.no}</button></td></tr>` : ''}`;
    }).join('');
    return `<table class="tbl boq"><thead><tr>
        <th class="boq-no">ลำดับ</th><th>รายการ</th><th>หน่วย</th><th class="num">ปริมาณ</th>
        <th class="num">ค่าวัสดุ / หน่วย</th><th class="num">ค่าแรง / หน่วย</th><th class="num">รวม / หน่วย</th>
        <th class="num">ค่าวัสดุ</th><th class="num">ค่าแรง</th><th class="num">รวมเงิน</th><th class="num">ทำแล้ว</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="11" class="empty">ไม่พบรายการตามตัวกรอง</td></tr>'}</tbody>
      <tfoot><tr><td></td><td colspan="6">รวมทั้งสิ้น ${U.num(sum.items)} รายการ</td><td class="num">${fmt2(sum.mat)}</td><td class="num">${fmt2(sum.lab)}</td><td class="num">${fmt2(sum.total)}</td><td class="num">${U.pct(sum.progress)}</td></tr></tfoot></table>`;
  }

  /* ---------- section ---------- */
  function sectionForm(p, sec, done) {
    const canEdit = PM.can('boq.edit');
    if (!sec && !canEdit) return;
    const b = boqOf(p);
    const s = sec || newSection(p, '', 'construction');
    const n = b.items.filter((it) => it.section === s.id).length;
    const form = U.modal({
      title: sec ? (canEdit ? 'แก้ไขหมวดงาน (BOQ)' : 'หมวดงาน (BOQ)') : `เพิ่มหมวดงาน — ${p.code}`, wide: true,
      onDelete: sec && canEdit ? () => { b.sections = b.sections.filter((x) => x.id !== s.id); b.items = b.items.filter((it) => it.section !== s.id); save(p, b); U.toast(`ลบหมวดงาน${n ? ` และ ${n} รายการ` : ''}แล้ว`); done(); } : null,
      body: `
        ${U.field('ชื่อหมวดงาน', 'name', s.name, { required: true, full: true, placeholder: 'เช่น งานโครงสร้างเหล็ก, งานระบบไฟฟ้า, Equipment' })}
        ${U.field('Phase', 'phase', s.phase, { options: PM.PHASES.map((x) => ({ value: x.key, label: x.label })) })}
        ${U.field('การกระจายต้นทุน (ใช้ใน Cash Flow)', 'curve', s.curve, { options: CURVES })}
        ${U.field('เริ่ม (แผน)', 'start', s.start, { type: 'date', required: true })}
        ${U.field('เสร็จ (แผน)', 'end', s.end, { type: 'date', required: true })}
        <p class="full muted" style="margin:0">วันที่และการกระจายต้นทุนใช้สร้าง Cash Flow จาก BOQ${sec && n ? ` · การลบหมวดนี้จะลบ ${n} รายการในหมวดด้วย` : ''}</p>`,
      onSubmit: canEdit ? (f) => {
        if (!f.name) { alert('กรุณากรอกชื่อหมวดงาน'); return false; }
        if (f.end < f.start) { alert('วันเสร็จต้องไม่ก่อนวันเริ่ม'); return false; }
        Object.assign(s, f);
        if (!sec) b.sections.push(s);
        save(p, b);
        U.toast(sec ? 'บันทึกหมวดงานแล้ว' : 'เพิ่มหมวดงานแล้ว');
        done();
      } : null,
    });
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
    // a new section: its dates follow the chosen phase until changed by hand
    if (!sec) form.phase.addEventListener('change', () => { const ph = phaseOf(p, form.phase.value); if (ph.planStart) { form.start.value = ph.planStart; form.end.value = ph.planEnd; } });
  }

  /* ---------- item (rates can come from the Price List) ---------- */
  function itemForm(p, item, sectionId, done) {
    const canEdit = PM.can('boq.edit');
    if (!item && !canEdit) return;
    const b = boqOf(p);
    const it = item || { id: PM.uid('I'), section: sectionId || (b.sections[b.sections.length - 1] || {}).id, name: '', unit: '', qty: '', mat: '', lab: '', done: 0, priceId: '', note: '' };
    const prices = (PM.db.prices || []).filter((x) => x.name);
    const form = U.modal({
      title: item ? (canEdit ? 'แก้ไขรายการ BOQ' : 'รายการ BOQ') : `เพิ่มรายการ BOQ — ${p.code}`, wide: true,
      onDelete: item && canEdit ? () => { b.items = b.items.filter((x) => x.id !== it.id); save(p, b); U.toast('ลบรายการแล้ว'); done(); } : null,
      body: `
        ${U.field('หมวดงาน', 'section', it.section, { options: b.sections.map((s, i) => ({ value: s.id, label: `${i + 1}. ${s.name}` })), full: true })}
        <label class="full"><span>รายการ</span><input name="name" list="dl-boq-price" required value="${esc(it.name)}" placeholder="พิมพ์ชื่อ หรือเลือกจาก Price List เพื่อดึงหน่วยและราคา"><small id="boq-pl-hint" class="muted"></small></label>
        <datalist id="dl-boq-price">${prices.map((x) => `<option value="${esc(x.name)}">${esc(x.vendor || '')} · ${U.money(x.price)}/${esc(x.unit || '')}</option>`).join('')}</datalist>
        ${U.field('หน่วย', 'unit', it.unit, { placeholder: 'เช่น ตร.ม., เมตร, ตัน, ชุด, LS' })}
        ${U.field('ปริมาณ', 'qty', it.qty, { type: 'number', min: 0, step: 'any', required: true })}
        ${U.field('ค่าวัสดุ / หน่วย (THB)', 'mat', it.mat, { type: 'number', min: 0, step: 'any' })}
        ${U.field('ค่าแรง / หน่วย (THB)', 'lab', it.lab, { type: 'number', min: 0, step: 'any' })}
        ${U.field('ปริมาณที่ทำแล้ว', 'done', it.done, { type: 'number', min: 0, step: 'any', hint: 'ใช้คำนวณผลงานตาม BOQ และ % ของ Phase' })}
        <div><span class="muted" style="font-size:12px">รวมเงิน</span><b id="boq-amt" style="display:block;font-size:18px"></b></div>
        ${U.field('หมายเหตุ / Spec', 'note', it.note, { type: 'textarea', full: true, rows: 2 })}
        <input type="hidden" name="priceId" value="${esc(it.priceId || '')}">`,
      onSubmit: canEdit ? (f) => {
        if (!f.name) { alert('กรุณากรอกรายการ'); return false; }
        if (!f.section) { alert('เพิ่มหมวดงานก่อน'); return false; }
        Object.assign(it, f, { qty: Math.max(0, num(f.qty)), mat: Math.max(0, num(f.mat)), lab: Math.max(0, num(f.lab)), done: Math.max(0, num(f.done)) });
        if (!item) b.items.push(it);
        save(p, b);
        U.toast(item ? 'บันทึกรายการแล้ว' : 'เพิ่มรายการแล้ว');
        done();
      } : null,
    });
    if (!canEdit) { form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; }); }
    const amt = form.querySelector('#boq-amt'), hint = form.querySelector('#boq-pl-hint');
    const update = () => { amt.textContent = U.money(num(form.qty.value) * (num(form.mat.value) + num(form.lab.value))); };
    form.addEventListener('input', update);
    update();
    // picked a Price List item → its unit and price become this line's unit and material rate
    form.name.addEventListener('change', () => {
      const pl = prices.filter((x) => x.name === form.name.value).sort((a, c) => String(c.quoteDate || '').localeCompare(String(a.quoteDate || '')))[0];
      if (!pl) { form.priceId.value = ''; hint.textContent = ''; return; }
      form.priceId.value = pl.id;
      if (!form.unit.value) form.unit.value = pl.unit || '';
      form.mat.value = pl.price || 0;
      hint.textContent = `ราคาจาก Price List: ${pl.vendor || '–'} · ${U.money(pl.price)} / ${pl.unit || ''}${pl.quoteDate ? ' · ใบเสนอราคา ' + U.date(pl.quoteDate) : ''}${pl.validUntil && pl.validUntil < PM.today() ? ' · ⚠ ราคาหมดอายุแล้ว' : ''}`;
      update();
    });
  }

  /* ---------- paste a BOQ copied from Excel ----------
     columns: ลำดับ · รายการ · หน่วย · ปริมาณ · ค่าวัสดุ/หน่วย · ค่าแรง/หน่วย (more columns are ignored)
     a row with a description but no quantity / unit / rates = a section header (หมวดงาน) */
  const n0 = (s) => { const t = String(s == null ? '' : s).replace(/[,฿\s]|THB|บาท/gi, ''); return t === '' || t === '-' ? 0 : Number(t); };
  const guessPhase = (name) => {
    const t = String(name || '').toLowerCase();
    if (/ออกแบบ|design|วิศวกรรม|engineer|drawing|แบบ/.test(t)) return 'engineering';
    if (/ทดสอบ|commission|ส่งมอบ|handover|as-?built|อบรม|training/.test(t)) return 'closing';
    if (/จัดซื้อ|จัดหา|procure|supply|equipment|อุปกรณ์หลัก|วัสดุ(?!.*ติดตั้ง)/.test(t)) return 'procurement';
    return 'construction';
  };
  function parseBoq(text) {
    const sections = [], items = [];
    let cur = null, skipped = 0;
    String(text || '').split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return;
      const c = line.includes('\t') ? line.split('\t') : line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.replace(/^"|"$/g, ''));
      const name = String(c[1] || '').trim(), unit = String(c[2] || '').trim();
      const qty = n0(c[3]), mat = n0(c[4]), lab = n0(c[5]);
      if (!name || [qty, mat, lab].some((v) => isNaN(v))) { skipped++; return; } // header row / text in number columns
      if (!unit && !qty && !mat && !lab) { cur = { name, phase: guessPhase(name) }; sections.push(cur); return; }
      if (!cur) { cur = { name: 'งานทั่วไป', phase: 'construction' }; sections.push(cur); }
      items.push({ sec: cur, name, unit, qty, mat, lab });
    });
    return { sections: sections.filter((s) => items.some((it) => it.sec === s)), items, skipped };
  }
  function pasteForm(p, done) {
    const b = boqOf(p);
    const form = U.modal({
      title: 'วาง BOQ จาก Excel', wide: true, submitLabel: 'นำเข้า',
      body: `
        <p class="full muted" style="margin:0">คัดลอกตาราง BOQ จาก Excel (แบบ ปร.4) มาวาง — คอลัมน์: <b>ลำดับ · รายการ · หน่วย · ปริมาณ · ค่าวัสดุ/หน่วย · ค่าแรง/หน่วย</b> (คอลัมน์ถัดไปเช่น "รวมเงิน" ไม่ต้องลบ)
          · แถวที่มีแต่ชื่อ (ไม่มีหน่วย / ปริมาณ / ราคา) = <b>หัวหมวดงาน</b> · ถ้ามีราคาต่อหน่วยช่องเดียว ใส่ไว้ช่องค่าวัสดุ · แถวหัวตารางข้ามให้อัตโนมัติ</p>
        <label class="full"><span>ข้อมูล</span><textarea name="data" rows="10" placeholder="1&#9;งานโครงสร้างเหล็ก&#10;1.1&#9;เหล็กรูปพรรณ H-beam&#9;ตัน&#9;85&#9;32000&#9;6500"></textarea></label>
        ${U.field('วิธีนำเข้า', 'mode', b.items.length ? 'append' : 'replace', { options: [{ value: 'replace', label: 'แทนที่ BOQ เดิมทั้งหมด' }, { value: 'append', label: 'เพิ่มต่อท้าย BOQ เดิม' }] })}
        <p class="full" id="boq-preview" aria-live="polite"></p>`,
      onSubmit: (f) => {
        const r = parseBoq(f.data);
        if (!r.items.length) { alert('ไม่พบรายการที่อ่านได้ — ต้องมีอย่างน้อย ลำดับ · รายการ · หน่วย · ปริมาณ · ราคาต่อหน่วย'); return false; }
        if (f.mode === 'replace' && b.items.length && !confirm(`แทนที่ BOQ เดิม ${b.items.length} รายการ?`)) return false;
        const out = f.mode === 'replace' ? { sections: [], items: [], files: b.files || [] } : b; // uploaded documents stay
        r.sections.forEach((s) => {
          const sec = newSection(p, s.name, s.phase);
          out.sections.push(sec);
          r.items.filter((it) => it.sec === s).forEach((it) => out.items.push({ id: PM.uid('I'), section: sec.id, name: it.name, unit: it.unit, qty: it.qty, mat: it.mat, lab: it.lab, done: 0, priceId: '', note: '' }));
        });
        save(p, out);
        U.toast(`นำเข้า ${r.items.length} รายการ ใน ${r.sections.length} หมวดงาน — ตรวจ Phase ของแต่ละหมวดได้โดยคลิกหัวหมวด`, 4000);
        done();
      },
    });
    const prev = form.querySelector('#boq-preview');
    form.data.addEventListener('input', () => {
      const r = parseBoq(form.data.value);
      prev.innerHTML = form.data.value.trim()
        ? `อ่านได้ <b>${r.items.length}</b> รายการ ใน <b>${r.sections.length}</b> หมวดงาน · รวม <b>${U.money(PM.sum(r.items, (it) => it.qty * (it.mat + it.lab)))}</b>${r.skipped ? ` · <span class="muted">ข้าม ${r.skipped} แถว (หัวตาราง)</span>` : ''}
          ${r.sections.length ? `<br><small class="muted">${r.sections.map((s) => `${esc(s.name)} → ${U.phaseLabel(s.phase)}`).join(' · ')}</small>` : ''}` : '';
    });
    if (!PM.can('boq.edit')) form.querySelectorAll('textarea, select, [type=submit]').forEach((i) => { i.disabled = true; });
  }

  /* ---------- BOQ → Plan cost / Phase progress ---------- */
  function toPlan(p, sum, done) {
    const lines = PM.PHASES.map((ph) => `${ph.label}: ${U.money(phaseOf(p, ph.key).budget || 0)} → ${U.money(sum.byPhase[ph.key].total)}`).join('\n');
    if (!confirm(`ตั้ง Plan cost ของแต่ละ Phase ตามยอด BOQ?\n\n${lines}\n\nรวม ${U.money(sum.total)}`)) return;
    p.phases.forEach((ph) => { ph.budget = Math.round(sum.byPhase[ph.key] ? sum.byPhase[ph.key].total : 0); });
    p.budget = PM.sum(p.phases, (ph) => ph.budget);
    PM.snapshotProgress(p);
    PM.upsert('projects', p);
    U.toast('ตั้ง Plan cost ตาม BOQ แล้ว');
    done();
  }
  function toPhase(p, sum, done) {
    const T = PM.today();
    const ch = p.phases.filter((ph) => sum.byPhase[ph.key] && sum.byPhase[ph.key].total).map((ph) => ({ ph, v: Math.round((sum.byPhase[ph.key].done / sum.byPhase[ph.key].total) * 1000) / 10 }));
    if (!ch.length) { U.toast('ยังไม่มี Phase ที่มีรายการ BOQ'); return; }
    if (!confirm(`อัปเดต % ความคืบหน้าของ Phase จากปริมาณที่ทำแล้วใน BOQ?\n\n${ch.map((x) => `${U.phaseLabel(x.ph.key)}: ${U.num(x.ph.progress || 0, 1)}% → ${U.num(x.v, 1)}%`).join('\n')}`)) return;
    ch.forEach(({ ph, v }) => {
      ph.progress = v;
      if (v > 0 && !ph.actStart) ph.actStart = T;
      if (v >= 100 && !ph.actEnd) ph.actEnd = T;
    });
    PM.snapshotProgress(p);
    PM.upsert('projects', p);
    U.toast('อัปเดต % Phase จาก BOQ แล้ว');
    done();
  }

  /* ---------- export (Excel / PDF), ปร.4 layout ---------- */
  function report(p, sum) {
    const rows = [];
    sum.sections.forEach((x) => {
      rows.push([String(x.no), x.s.name, '', '', '', '', '', x.mat, x.lab, x.total, '']);
      x.items.forEach((it, k) => rows.push([`${x.no}.${k + 1}`, it.name, it.unit, num(it.qty), num(it.mat), num(it.lab), rate(it), num(it.qty) * num(it.mat), num(it.qty) * num(it.lab), amount(it), num(it.done)]));
    });
    return {
      filename: `BOQ-${p.code}-${PM.today()}`,
      title: `BOQ — ${p.code} ${p.name}`,
      subtitle: `${p.client || ''} · ${U.num(sum.items)} รายการ · ${sum.sections.length} หมวดงาน · มูลค่า ${U.money(sum.total)} · ข้อมูล ณ ${U.date(PM.today())} · ราคาไม่รวม VAT`,
      sheets: [
        {
          name: 'BOQ', title: `Bill of Quantities — ${p.code} ${p.name}`,
          columns: [
            { header: 'ลำดับ', width: 7 }, { header: 'รายการ', width: 44 }, { header: 'หน่วย', width: 8 }, { header: 'ปริมาณ', width: 10, type: 'number' },
            { header: 'ค่าวัสดุ/หน่วย', width: 13, type: 'number' }, { header: 'ค่าแรง/หน่วย', width: 13, type: 'number' }, { header: 'รวม/หน่วย', width: 13, type: 'number' },
            { header: 'ค่าวัสดุ', width: 15, type: 'number' }, { header: 'ค่าแรง', width: 15, type: 'number' }, { header: 'รวมเงิน', width: 16, type: 'number' }, { header: 'ทำแล้ว', width: 10, type: 'number' },
          ],
          rows, totals: ['', 'รวมทั้งสิ้น', '', '', '', '', '', sum.mat, sum.lab, sum.total, ''],
        },
        {
          name: 'สรุปหมวดงาน', title: 'สรุปตามหมวดงาน',
          columns: [{ header: 'ลำดับ', width: 7 }, { header: 'หมวดงาน', width: 40 }, { header: 'Phase', width: 14 }, { header: 'เริ่ม', width: 12, type: 'date' }, { header: 'เสร็จ', width: 12, type: 'date' },
            { header: 'ค่าวัสดุ', width: 15, type: 'number' }, { header: 'ค่าแรง', width: 15, type: 'number' }, { header: 'รวมเงิน', width: 16, type: 'number' }, { header: 'ทำแล้ว (บาท)', width: 16, type: 'number' }],
          rows: sum.sections.map((x) => [String(x.no), x.s.name, U.phaseLabel(x.s.phase), x.s.start, x.s.end, x.mat, x.lab, x.total, x.done]),
          totals: ['', 'รวม', '', '', '', sum.mat, sum.lab, sum.total, sum.done],
        },
      ],
    };
  }

  /* ---------- sample BOQ for the demo data: one section per phase, rates sized to the phase's Plan cost ---------- */
  const SAMPLE = {
    engineering: ['งานวิศวกรรมและออกแบบ', [['ออกแบบวิศวกรรม Basic & Detail design', 'LS', 1, 0.55, 0], ['จัดทำแบบก่อสร้าง / Shop drawing', 'แผ่น', 120, 0.3, 0], ['ขออนุญาตและประสานงานหน่วยงานราชการ', 'LS', 1, 0.15, 0]]],
    procurement: ['งานจัดหาอุปกรณ์และวัสดุ', [['อุปกรณ์หลัก (Main equipment)', 'ชุด', 4, 0.45, 1], ['เหล็กโครงสร้างรูปพรรณ', 'ตัน', 85, 0.25, 1], ['สายไฟฟ้าและอุปกรณ์ไฟฟ้า', 'เมตร', 6000, 0.18, 1], ['ท่อและวาล์ว', 'เมตร', 1200, 0.12, 1]]],
    construction: ['งานก่อสร้างและติดตั้ง', [['งานเตรียมพื้นที่และงานโยธา', 'ตร.ม.', 2500, 0.3, 0.55], ['งานติดตั้งโครงสร้างเหล็ก', 'ตัน', 85, 0.25, 0.2], ['งานติดตั้งระบบไฟฟ้า', 'เมตร', 6000, 0.25, 0.3], ['งานติดตั้งระบบท่อ', 'เมตร', 1200, 0.2, 0.35]]],
    closing: ['งานทดสอบและส่งมอบ', [['ทดสอบและเดินเครื่อง (Commissioning)', 'LS', 1, 0.6, 0.2], ['เอกสารส่งมอบและแบบ As-built', 'ชุด', 1, 0.25, 0], ['ฝึกอบรมผู้ใช้งาน', 'ครั้ง', 2, 0.15, 0]]],
  };
  PM.buildSampleBoq = function (p) {
    const sections = [], items = [];
    (p.phases || []).forEach((ph) => {
      const tpl = SAMPLE[ph.key];
      if (!tpl || !ph.budget) return;
      const s = newSection(p, tpl[0], ph.key);
      sections.push(s);
      tpl[1].forEach(([name, unit, qty, share, matShare]) => {
        const r = (ph.budget * share) / qty;
        items.push({ id: PM.uid('I'), section: s.id, name, unit, qty, mat: Math.round(r * matShare * 100) / 100, lab: Math.round(r * (1 - matShare) * 100) / 100, done: Math.round(qty * (ph.progress || 0) / 100 * 100) / 100, priceId: '', note: '' });
      });
    });
    return { sections, items };
  };
})();
