/* phase-items.js — line items under each EPC phase (project page, below the phase cards)
   Engineering = document register (drawings, calculations, specifications …)
   Procurement = purchase packages · Construction = work packages · Closing = handover documents
   Each item moves through steps whose wording depends on the phase (e.g. Engineering: IFR → Return → IFC).
   Engineering documents also have "Return" (sent back by the client with comments): sending it again bumps the revision (A → B, 0 → 1),
   and every status change is kept in the item's log (a simple transmittal history).
   Data: p.phaseItems = [{ id, phase, no, name, rev, status (todo · wip · review · return · done), owner, due, doneDate, ref, comment, note, files, log: [{ date, status, rev }] }]
   Stored inside the project — no SQL needed. Files: Storage <projectId>/items/<itemId> (open to every role). */
(function () {
  const U = PM.ui, esc = U.esc;
  const STEP_LEVEL = { todo: 'neutral', wip: 'info', review: 'warning', return: 'critical', done: 'good' };
  const STEP_WEIGHT = { todo: 0, wip: 0.5, review: 0.8, return: 0.5, done: 1 }; // "use as phase progress" — a returned document is back to work

  PM.PHASE_ITEMS = {
    engineering: {
      title: 'ทะเบียนเอกสารออกแบบ', noun: 'เอกสาร', prefix: 'ENG-', rev: true,
      hint: 'แบบ · รายการคำนวณ · Specification · Datasheet — ติดตาม Revision จนลูกค้าอนุมัติ (IFC)',
      steps: { todo: 'ยังไม่เริ่ม', wip: 'กำลังจัดทำ', review: 'ส่งลูกค้าพิจารณา (IFR)', return: 'ลูกค้าส่งกลับแก้ไข (Return)', done: 'อนุมัติแล้ว (IFC)' },
      template: ['Design Basis / Design Criteria', 'Process Flow Diagram (PFD)', 'P&ID', 'Single Line Diagram (SLD)',
        'Plot Plan / General Arrangement (GA)', 'รายการคำนวณ (Structure / Electrical / Load)', 'Equipment Specification & Datasheet',
        'Cable Schedule / Cable Routing', 'Material Take-off (MTO) / BOQ', 'IFC Drawings (Issued for Construction)'],
    },
    procurement: {
      title: 'แพ็กเกจจัดซื้อ', noun: 'แพ็กเกจ', prefix: 'PKG-', rev: false,
      hint: 'ของที่ต้องซื้อแบ่งเป็นแพ็กเกจ — ขอราคา → สั่งซื้อ (ใส่เลข PO ได้) → ส่งของครบ',
      steps: { todo: 'ยังไม่เริ่ม', wip: 'ขอราคา / เปรียบเทียบ (RFQ)', review: 'สั่งซื้อแล้ว / กำลังผลิต', done: 'ส่งของครบ' },
      template: ['อุปกรณ์หลัก (Main equipment)', 'ตู้ไฟฟ้า / Switchgear', 'สายไฟและอุปกรณ์ประกอบ', 'ท่อ วาล์ว และข้อต่อ',
        'โครงสร้างเหล็ก (Structural steel)', 'เครื่องมือวัดและระบบควบคุม (Instrument & Control)', 'ผู้รับเหมาช่วง — งานโยธา / ติดตั้ง'],
    },
    construction: {
      title: 'งานก่อสร้าง / ติดตั้ง', noun: 'งาน', prefix: 'CW-', rev: false,
      hint: 'แบ่งงานหน้างานเป็นส่วน ๆ — ทำเสร็จแล้วส่งตรวจรับ',
      steps: { todo: 'ยังไม่เริ่ม', wip: 'กำลังทำ', review: 'รอตรวจรับ', done: 'ตรวจรับแล้ว' },
      template: ['เตรียมพื้นที่ / สิ่งอำนวยความสะดวกชั่วคราว', 'งานโยธาและฐานราก', 'ติดตั้งโครงสร้างเหล็ก', 'ติดตั้งเครื่องจักร / อุปกรณ์',
        'งานท่อ (Piping)', 'งานไฟฟ้าและเดินสาย', 'งานเครื่องมือวัดและระบบควบคุม', 'ตรวจสอบก่อนทดสอบระบบ (Pre-commissioning)'],
    },
    closing: {
      title: 'เอกสารและงานส่งมอบ', noun: 'รายการ', prefix: 'HO-', rev: false,
      hint: 'สิ่งที่ต้องส่งมอบให้ลูกค้าก่อนปิดโครงการ',
      steps: { todo: 'ยังไม่เริ่ม', wip: 'กำลังจัดทำ', review: 'ส่งลูกค้าแล้ว', done: 'ลูกค้ารับแล้ว' },
      template: ['รายงานทดสอบและ Commissioning', 'เคลียร์ Punch list', 'แบบ As-built', 'คู่มือการใช้งานและบำรุงรักษา (O&M Manual)',
        'อบรมผู้ใช้งานของลูกค้า', 'ส่งมอบอะไหล่และเครื่องมือ', 'ใบรับประกันอุปกรณ์', 'หนังสือรับมอบงาน / Final acceptance'],
    },
  };

  const cfg = (key) => PM.PHASE_ITEMS[key];
  const stepsOf = (key) => Object.keys(cfg(key).steps); // in order — Engineering has 5 (with Return), the others 4
  /* next revision when a returned document is sent again: A → B, 0 → 1 (anything else stays as typed) */
  const nextRev = (r) => (/^\d+$/.test(r || '') ? String(Number(r) + 1) : /^[A-Ya-y]$/.test(r || '') ? String.fromCharCode(r.charCodeAt(0) + 1) : r);
  /* every status change is logged (date · status · revision) — a simple transmittal history */
  const logStep = (x) => { x.log = (x.log || []).concat(Object.assign({ date: PM.today(), status: x.status, rev: x.rev || '' }, x.status === 'return' ? { comment: x.comment || '' } : {})); };
  /* after a status change (table or form): revision bump when a returned document is sent again,
     the done date, and the log — returns true when the revision went up */
  function applyStep(x, prev, revTyped) {
    let bumped = false;
    if (cfg(x.phase).rev && prev === 'return' && x.status === 'review' && !revTyped) { x.rev = nextRev(x.rev); bumped = true; }
    x.doneDate = x.status === 'done' ? x.doneDate || PM.today() : '';
    if (x.status !== prev) logStep(x);
    return bumped;
  }
  const itemsOf = (p, key) => (p.phaseItems || []).filter((x) => x.phase === key);
  PM.itemLate = (x, T) => x.status !== 'done' && x.due && x.due < (T || PM.today());
  /* counts + weighted % of one phase's items (null when the phase has none) */
  PM.phaseItemStats = function (p, key, T) {
    const list = itemsOf(p, key);
    if (!list.length) return null;
    const by = {}; stepsOf(key).forEach((s) => (by[s] = list.filter((x) => (x.status || 'todo') === s).length));
    return { total: list.length, by, done: by.done, late: list.filter((x) => PM.itemLate(x, T)).length,
      pct: PM.sum(list, (x) => STEP_WEIGHT[x.status || 'todo']) / list.length };
  };
  const nextNo = (p, key) => {
    const pre = cfg(key).prefix;
    const max = itemsOf(p, key).reduce((m, x) => Math.max(m, parseInt(String(x.no || '').slice(pre.length), 10) || 0), 0);
    return pre + String(max + 1).padStart(3, '0');
  };
  /* standard list of a phase, due dates spread over the phase plan */
  function fromTemplate(p, key) {
    const ph = (p.phases || []).find((x) => x.key === key) || {};
    const tpl = cfg(key).template, dur = Math.max(1, PM.diffDays(ph.planStart, ph.planEnd));
    return tpl.map((name, i) => ({
      id: PM.uid('I'), phase: key, no: cfg(key).prefix + String(i + 1).padStart(3, '0'), name, rev: cfg(key).rev ? 'A' : '',
      status: 'todo', owner: '', due: ph.planStart ? PM.addDays(ph.planStart, Math.round(dur * (i + 1) / tpl.length)) : '', doneDate: '', ref: '', note: '', files: [],
    }));
  }

  /* demo data: items follow the phase's progress (earlier items further along) */
  PM.buildSamplePhaseItems = function (p) {
    const out = [];
    (p.phases || []).forEach((ph) => {
      fromTemplate(p, ph.key).forEach((x, i, all) => {
        const at = ((ph.progress || 0) / 100) * all.length - i; // > 1 done · 0–1 in progress
        x.status = at >= 1 ? 'done' : at > 0.6 ? 'review' : at > 0 ? 'wip' : 'todo';
        if (x.status === 'done') { x.doneDate = PM.min(x.due, PM.today()); if (cfg(ph.key).rev) x.rev = '0'; }
        else if (x.status === 'review' && cfg(ph.key).rev) { x.rev = 'B'; if (!(i % 2)) { x.status = 'return'; x.comment = 'แก้ไขตามความเห็นลูกค้า (Comment sheet)'; } }
        if (x.status !== 'todo') x.log = [Object.assign({ date: x.doneDate || PM.today(), status: x.status, rev: x.rev }, x.comment ? { comment: x.comment } : {})];
        out.push(x);
      });
    });
    return out;
  };

  /* ---------- the card under the phase cards ---------- */
  PM.phaseItemsCard = function (p, key) {
    const c = cfg(key), def = PM.PHASES.find((x) => x.key === key), T = PM.today();
    const list = itemsOf(p, key).sort((a, b) => String(a.no).localeCompare(String(b.no), undefined, { numeric: true }));
    const st = PM.phaseItemStats(p, key, T);
    const canEdit = PM.can('phaseitem.edit');
    const ph = (p.phases || []).find((x) => x.key === key) || {};
    const head = `<div class="card-h"><h2>${esc(def.label)} — ${esc(c.title)}</h2>
      ${st ? `<span class="badge good"><i>✓</i>${esc(c.steps.done)} ${st.done} / ${st.total}</span>${st.by.return ? U.badge('critical', `ส่งกลับแก้ไข (Return) ${st.by.return}`) : ''}${st.late ? U.badge('critical', `เลยกำหนด ${st.late}`) : ''}` : ''}
      <span class="spacer"></span>
      ${canEdit && st ? `<button class="btn sm" data-pi="use-pct" data-key="${key}" title="ตั้งความคืบหน้าของขั้นงานจากรายการ: เสร็จ = 100% · ${esc(c.steps.review)} = 80% · ${esc(c.steps.wip)} = 50%">ใช้ ${U.pct(st.pct)} เป็นความคืบหน้า</button>` : ''}
      <button class="btn sm" data-action="phase" data-key="${key}">อัปเดตความคืบหน้า (ตอนนี้ ${U.pct((ph.progress || 0) / 100)})</button>
      ${canEdit ? `<button class="btn sm primary" data-pi="new" data-key="${key}">+ เพิ่ม${esc(c.noun)}</button>` : ''}
      <p>${esc(c.hint)} · คลิกการ์ดขั้นงานด้านบนเพื่อดูขั้นอื่น · คลิกแถวเพื่อแก้ไขหรือแนบไฟล์</p></div>`;
    if (!list.length) {
      return `<div class="card pi-card">${head}<div class="card-b"><div class="pi-empty">
        <p>ยังไม่มีรายการของขั้นงานนี้</p>
        ${canEdit ? `<button class="btn primary" data-pi="template" data-key="${key}">ใส่รายการมาตรฐาน (${c.template.length} ${esc(c.noun)})</button>
        <small class="muted">${esc(c.template.slice(0, 4).join(' · '))} …</small>` : `<small class="muted">ผู้ที่มีสิทธิ์ (${esc(PM.whoCan('phaseitem.edit'))}) เป็นผู้เพิ่มรายการ</small>`}
      </div></div></div>`;
    }
    const steps = stepsOf(key);
    const share = steps.map((s) => (st.by[s] ? `<span class="pi-seg st-${s}" style="flex:${st.by[s]}" data-tip="${esc(c.steps[s])}: ${st.by[s]}"></span>` : '')).join('');
    const picked = picks(p);
    const trs = (p.transmittals || []).filter((t) => (t.items || []).some((i) => i.phase === key)).sort((a, b) => (a.no < b.no ? 1 : -1));
    return `<div class="card pi-card">${head}
      <div class="card-b"><div class="pi-share">${share}</div>
        <div class="legend pi-legend">${steps.map((s) => `<span><i class="sw pi-sw st-${s}"></i>${esc(c.steps[s])} ${st.by[s]}</span>`).join('')}</div>
        ${canEdit ? `<div class="pi-bulk"${picked.size ? '' : ' hidden'}><b data-pi-count>${picked.size}</b> ${esc(c.noun)}ที่เลือก
          <button type="button" class="btn sm primary" data-pi="tr-new" data-key="${key}">📤 สร้าง Transmittal</button>
          <button type="button" class="btn sm ghost" data-pi="tr-clear">ล้างที่เลือก</button>
          <small class="muted">ติ๊กเลือก${esc(c.noun)}ในตาราง แล้วสร้างใบนำส่ง — เลขที่ TR อัตโนมัติ · พิมพ์ PDF ให้ลูกค้าเซ็นรับ</small></div>` : ''}</div>
      <div class="card-b flush table-wrap"><table class="tbl pi-tbl"><thead><tr>
        ${canEdit ? `<th class="pi-sel"><input type="checkbox" data-pi-all="${key}" aria-label="เลือกทั้งหมด" title="เลือกทั้งหมดเพื่อส่ง Transmittal"${list.every((x) => picked.has(x.id)) ? ' checked' : ''}></th>` : ''}
        <th>เลขที่</th><th>รายการ</th>${c.rev ? '<th>Rev.</th>' : ''}<th>ผู้รับผิดชอบ</th><th>กำหนดเสร็จ</th><th>สถานะ</th><th>เสร็จเมื่อ</th><th>${c.rev ? 'อ้างอิง / TR' : 'อ้างอิง / PO'}</th><th>ไฟล์</th>
      </tr></thead><tbody>${list.map((x) => {
        const late = PM.itemLate(x, T);
        return `<tr class="click${x.status === 'return' ? ' pi-returned' : ''}" data-pi-row="${esc(x.id)}">
          ${canEdit ? `<td class="pi-sel"><input type="checkbox" data-pi-pick="${esc(x.id)}" aria-label="เลือก ${esc(x.no)}"${picked.has(x.id) ? ' checked' : ''}></td>` : ''}
          <td class="nowrap"><b>${esc(x.no)}</b></td>
          <td>${esc(x.name)}${x.status === 'return' && x.comment ? `<small class="pi-comment">↩ ความเห็นลูกค้า: ${esc(x.comment)}</small>` : ''}${x.note ? `<small>${esc(x.note)}</small>` : ''}</td>
          ${c.rev ? `<td>${esc(x.rev || '–')}</td>` : ''}
          <td>${esc(x.owner ? PM.common.personName(x.owner, x.owner) : '–')}</td>
          <td class="nowrap">${U.date(x.due)}${late ? `<small class="neg">เลย ${PM.diffDays(x.due, T)} วัน</small>` : ''}</td>
          <td>${canEdit ? `<select class="pi-st st-${x.status || 'todo'}" data-pi-st="${esc(x.id)}" aria-label="สถานะ">${steps.map((s) => `<option value="${s}"${(x.status || 'todo') === s ? ' selected' : ''}>${esc(c.steps[s])}</option>`).join('')}</select>`
            : U.badge(STEP_LEVEL[x.status || 'todo'], c.steps[x.status || 'todo'])}</td>
          <td class="nowrap">${x.doneDate ? U.date(x.doneDate) : '–'}</td>
          <td>${esc(x.ref || '')}</td>
          <td class="nowrap pi-files">${PM.poFiles.clip(x.files, `data-pi="files" data-id="${esc(x.id)}"`)}${canEdit ? `<button type="button" class="btn sm" data-pi="attach" data-id="${esc(x.id)}" title="แนบไฟล์ให้${esc(c.noun)}นี้ — เลือกไฟล์แล้วอัปโหลดและบันทึกทันที ไม่ต้องเปิดฟอร์ม">📎 แนบ</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>
      ${trs.length ? `<div class="card-b pi-trs"><h3 class="cf-sub">Transmittal ที่ส่งแล้ว (${trs.length})</h3>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>เลขที่ TR</th><th>วันที่</th><th>ถึง</th><th>วัตถุประสงค์</th><th class="num">เอกสาร</th><th>ผู้ส่ง</th><th></th></tr></thead><tbody>
        ${trs.map((t) => `<tr><td class="nowrap"><b>${esc(t.no)}</b></td><td class="nowrap">${U.date(t.date)}</td><td>${esc(t.to || '–')}${t.attn ? `<small>Attn: ${esc(t.attn)}</small>` : ''}</td>
          <td>${esc((TR_PURPOSE.find((x) => x.key === t.purpose) || {}).short || t.purpose)}</td><td class="num">${(t.items || []).length}</td><td><small>${esc(t.createdByName || '–')}</small></td>
          <td><button type="button" class="btn sm" data-pi="tr-print" data-id="${esc(t.id)}">🖨 พิมพ์</button></td></tr>`).join('')}
        </tbody></table></div></div>` : ''}</div>`;
  };

  /* ---------- Transmittal: send a set of documents to the client in one numbered cover sheet ---------- */
  const TR_PURPOSE = [
    { key: 'IFR', short: 'IFR — ส่งพิจารณา', label: 'IFR — ส่งให้พิจารณา / ให้ความเห็น (For Review)', toReview: true },
    { key: 'IFA', short: 'IFA — ขออนุมัติ', label: 'IFA — ขออนุมัติ (For Approval)', toReview: true },
    { key: 'IFC', short: 'IFC — เพื่อก่อสร้าง', label: 'IFC — ฉบับเพื่อก่อสร้าง (For Construction)', toReview: false },
    { key: 'IFI', short: 'IFI — เพื่อทราบ', label: 'IFI — เพื่อทราบ (For Information)', toReview: false },
    { key: 'ASB', short: 'As-built / ส่งมอบ', label: 'As-built / เอกสารส่งมอบ (Handover)', toReview: true },
  ];
  const selection = {}; // project id → Set of item ids ticked for a transmittal (kept while the page is open)
  const picks = (p) => selection[p.id] || (selection[p.id] = new Set());
  const nextTrNo = (p) => {
    const pre = `TR-${p.code}-`;
    const max = (p.transmittals || []).reduce((m, t) => Math.max(m, parseInt(String(t.no || '').slice(pre.length), 10) || 0), 0);
    return pre + String(max + 1).padStart(3, '0');
  };

  function trForm(p, ids, done) {
    const items = (p.phaseItems || []).filter((x) => ids.includes(x.id)).sort((a, b) => String(a.no).localeCompare(String(b.no), undefined, { numeric: true }));
    if (!items.length) { U.alert('ยังไม่ได้เลือกเอกสาร — ติ๊กเลือกในตารางก่อน'); return; }
    const u = PM.auth && PM.auth.user;
    U.modal({
      title: `Transmittal ใหม่ — ${p.code}`, wide: true, submitLabel: 'บันทึกและพิมพ์',
      body: `
        ${U.field('เลขที่ Transmittal', 'no', nextTrNo(p), { required: true })}
        ${U.field('วันที่ส่ง', 'date', PM.today(), { type: 'date', required: true })}
        ${U.field('ถึง (บริษัท)', 'to', p.client || '', { required: true })}
        ${U.field('เรียน (Attn.)', 'attn', '', { placeholder: 'ชื่อ / ตำแหน่ง ผู้รับ' })}
        ${U.field('วัตถุประสงค์', 'purpose', 'IFR', { options: TR_PURPOSE.map((x) => ({ value: x.key, label: x.label })) })}
        ${U.field('ส่งทาง', 'via', 'Email', { options: ['Email', 'ส่งด้วยมือ (Hand)', 'ไปรษณีย์ / Courier', 'ระบบของลูกค้า (Portal)'] })}
        ${U.field('หมายเหตุ', 'note', '', { type: 'textarea', rows: 2, full: true, placeholder: 'เช่น ขอความเห็นภายใน 7 วัน' })}
        <div class="full"><div class="sub-h" style="margin-bottom:6px">เอกสารที่ส่ง (${items.length})</div>
          <table class="tbl"><thead><tr><th>เลขที่</th><th>ชื่อเอกสาร</th><th>Rev.</th><th>สถานะตอนนี้</th></tr></thead><tbody>
          ${items.map((x) => `<tr><td class="nowrap">${esc(x.no)}</td><td>${esc(x.name)}</td><td>${esc(x.rev || '–')}${x.status === 'return' && cfg(x.phase).rev ? `<small>ส่งใหม่เป็น Rev. ${esc(nextRev(x.rev))}</small>` : ''}</td><td>${U.badge(STEP_LEVEL[x.status || 'todo'], cfg(x.phase).steps[x.status || 'todo'])}</td></tr>`).join('')}
          </tbody></table>
          <p class="muted" style="margin:6px 0 0;font-size:12.5px">IFR / IFA / As-built: สถานะของเอกสารจะเปลี่ยนเป็น "ส่งลูกค้าพิจารณา" ให้อัตโนมัติ (ที่ส่งกลับแก้ไขมาจะขึ้น Revision ใหม่) · เลข TR บันทึกในช่องอ้างอิงและประวัติของเอกสาร</p></div>`,
      onSubmit: (f) => {
        if ((p.transmittals || []).some((t) => t.no.toUpperCase() === f.no.toUpperCase())) { U.alert(`เลขที่ ${f.no} ถูกใช้แล้ว`); return false; }
        const purpose = TR_PURPOSE.find((x) => x.key === f.purpose) || TR_PURPOSE[0];
        items.forEach((x) => {
          const prev = x.status;
          if (purpose.toReview && x.status !== 'done' && stepsOf(x.phase).includes('review')) { x.status = 'review'; applyStep(x, prev); }
          if (x.status === prev) logStep(x); // the sending is in the history even when the status stays
          x.log[x.log.length - 1].tr = f.no;
          x.ref = f.no;
        });
        const t = { id: PM.uid('TR'), no: f.no, date: f.date, to: f.to, attn: f.attn, purpose: f.purpose, via: f.via, note: f.note,
          items: items.map((x) => ({ id: x.id, phase: x.phase, no: x.no, name: x.name, rev: x.rev || '' })),
          createdBy: u ? u.id : '', createdByName: u ? PM.auth.displayName(u) : '' };
        p.transmittals = (p.transmittals || []).concat(t);
        PM.upsert('projects', p);
        picks(p).clear();
        PM.trPrint(p, t); // opened from the click, so pop-up blockers allow it
        U.toast(`บันทึก ${t.no} แล้ว — ${items.length} เอกสาร`);
        done();
      },
    });
  }

  /* the transmittal cover sheet (A4) with sign-off boxes */
  PM.trPrint = function (p, t) {
    const P = PM.printDoc, win = P.open();
    if (!win) return;
    const purpose = TR_PURPOSE.find((x) => x.key === t.purpose) || {};
    P.write(win, {
      title: `${t.no}`, bar: `Transmittal ${t.no}`,
      head: {
        title: `<h1>ใบนำส่งเอกสาร (Document Transmittal)</h1><p><b>${esc(p.code)} · ${esc(p.name)}</b></p><p>เลขที่ <b>${esc(t.no)}</b> · วันที่ ${U.date(t.date)}</p>`,
        meta: `${esc(PM.COMPANY)}<br>ส่งทาง ${esc(t.via || '–')}`,
      },
      body: `
  <style>.tr-to { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; font-size: 11.5px; margin: 4px 0 10px; } .tr-to b { color: #3f5068; }
    .tr-purpose { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 11px; margin: 4px 0 10px; } .tr-purpose span::before { content: '☐ '; } .tr-purpose span.on::before { content: '☑ '; } .tr-purpose span.on { font-weight: 700; }
    .tr-box { border: 1px solid #c0ccdc; border-radius: 6px; padding: 8px 10px; min-height: 60px; font-size: 11px; white-space: pre-line; }</style>
  <section><div class="tr-to"><b>ถึง</b><span>${esc(t.to || '–')}</span><b>เรียน</b><span>${esc(t.attn || '–')}</span><b>จาก</b><span>${esc(PM.COMPANY)} — ${esc(t.createdByName || 'Document Control')}</span><b>โครงการ</b><span>${esc(p.code)} · ${esc(p.name)}</span></div>
    <h2>วัตถุประสงค์</h2><div class="tr-purpose">${TR_PURPOSE.map((x) => `<span class="${x.key === t.purpose ? 'on' : ''}">${esc(x.label)}</span>`).join('')}</div></section>
  <section class="flow"><h2>รายการเอกสาร (${(t.items || []).length})</h2>
    ${P.tbl([{ t: 'ลำดับ', r: 1 }, { t: 'เลขที่เอกสาร' }, { t: 'ชื่อเอกสาร' }, { t: 'Rev.' }, { t: 'จำนวน / รูปแบบ' }],
      (t.items || []).map((x, i) => [String(i + 1), esc(x.no), esc(x.name), esc(x.rev || '–'), esc(t.via === 'Email' ? 'ไฟล์ PDF' : '1 ชุด')]))}</section>
  <section><h2>หมายเหตุ</h2><div class="tr-box">${esc(t.note || '')}</div></section>
  <section><h2>ความเห็นผู้รับ (สำหรับลูกค้า)</h2><div class="tr-box">☐ อนุมัติ (Approved)   ☐ อนุมัติตามความเห็น (Approved as noted)   ☐ แก้ไขแล้วส่งใหม่ (Revise & resubmit)   ☐ รับทราบ (Received)</div></section>
  <div class="sign"><div>ผู้ส่ง — ${esc(t.createdByName || 'Document Control')}<br>วันที่ ${U.date(t.date)}</div><div>ผู้รับ (ชื่อ / ลายเซ็น)<br>วันที่ ........................</div><div>ผู้จัดการโครงการ</div></div>`,
    });
  };

  /* clicks / status changes inside the card (bound by project-detail.js on the page) */
  PM.phaseItemsHandle = function (e, p, rerender) {
    // ticking documents for a transmittal: update the selection and the bar, no redraw
    const pick = e.target.closest && e.target.closest('[data-pi-pick], [data-pi-all], td.pi-sel, th.pi-sel');
    if (pick) {
      if (e.type !== 'change') return true; // the tick is handled on 'change'; the click must not open the row
      const set = picks(p), card = e.target.closest('.pi-card');
      if (e.target.dataset.piAll) {
        card.querySelectorAll('[data-pi-pick]').forEach((c) => { c.checked = e.target.checked; if (c.checked) set.add(c.dataset.piPick); else set.delete(c.dataset.piPick); });
      } else if (e.target.dataset.piPick) {
        if (e.target.checked) set.add(e.target.dataset.piPick); else set.delete(e.target.dataset.piPick);
      }
      const bar = card.querySelector('.pi-bulk');
      if (bar) { bar.hidden = !set.size; bar.querySelector('[data-pi-count]').textContent = set.size; }
      return true;
    }
    const st = e.type === 'change' && e.target.closest('[data-pi-st]');
    if (st) {
      const x = (p.phaseItems || []).find((i) => i.id === st.dataset.piSt);
      if (!x || !PM.can('phaseitem.edit')) return true;
      const prev = x.status, want = st.value;
      const apply = () => {
        x.status = want;
        const bumped = applyStep(x, prev);
        PM.upsert('projects', p);
        U.toast(`${x.no} → ${cfg(x.phase).steps[x.status]}${bumped ? ` · Revision ใหม่ ${x.rev}` : ''}`);
        rerender();
      };
      if (want !== 'return') { apply(); return true; }
      // Return: ask what the client wants changed (shown under the document until it is sent again) —
      // the dropdown shows the old status until the box is answered; cancel = nothing changes
      st.value = prev;
      U.prompt(`ความเห็นจากลูกค้า / สาเหตุที่ส่งกลับ (เว้นว่างได้ · แนบไฟล์ Comment sheet ได้ด้วยปุ่ม 📎)`, x.comment || '',
        { title: `${x.no} — ลูกค้าส่งกลับแก้ไข (Return)`, ok: 'บันทึก Return', placeholder: 'เช่น แก้ระยะ Clearance ตาม Comment sheet', multiline: true, tone: 'warning' })
        .then((cm) => { if (cm === null) return; x.comment = cm.trim(); apply(); });
      return true;
    }
    if (e.type !== 'click' || e.target.closest('select')) return false;
    const a = e.target.closest('[data-pi]');
    if (a) {
      const key = a.dataset.key;
      const item = a.dataset.id && (p.phaseItems || []).find((i) => i.id === a.dataset.id);
      if (a.dataset.pi === 'files' && item) PM.poFiles.showList(`ไฟล์ของ ${item.no} · ${item.name}`, item.files);
      if (a.dataset.pi === 'tr-new') trForm(p, Array.from(picks(p)), rerender);
      if (a.dataset.pi === 'tr-clear') { picks(p).clear(); rerender(); }
      if (a.dataset.pi === 'tr-print') { const t = (p.transmittals || []).find((x) => x.id === a.dataset.id); if (t) PM.trPrint(p, t); }
      if (a.dataset.pi === 'attach' && item) { // straight to the file picker — no form; uploaded and saved at once
        PM.poFiles.pickUpload(`${p.id}/items/${item.id}`, ({ files, problems }) => {
          // the project as it is now (the cloud may have refreshed it while uploading)
          const cur = PM.find('projects', p.id) || p, it = (cur.phaseItems || []).find((i) => i.id === item.id);
          if (it && files.length) { it.files = (it.files || []).concat(files); PM.upsert('projects', cur); }
          else if (!it && files.length) PM.poFiles.remove(files.map((f) => f.path)).catch(() => { /* item deleted meanwhile */ });
          U.toast(files.length && it ? `แนบ ${files.length} ไฟล์ให้ ${item.no} แล้ว` : 'ไม่ได้แนบไฟล์');
          if (problems.length) U.alert('ไฟล์ที่ไม่สำเร็จ:\n' + problems.join('\n'));
          rerender();
        }, (chosen) => { a.disabled = true; a.classList.add('loading'); a.textContent = `อัปโหลด ${chosen.length} ไฟล์…`; });
      }
      if (a.dataset.pi === 'template') { p.phaseItems = (p.phaseItems || []).concat(fromTemplate(p, key)); PM.upsert('projects', p); U.toast(`เพิ่ม ${cfg(key).template.length} รายการแล้ว — แก้ไขชื่อ วันที่ และผู้รับผิดชอบได้`); rerender(); }
      if (a.dataset.pi === 'new') itemForm(p, key, null, rerender);
      if (a.dataset.pi === 'use-pct') {
        const s = PM.phaseItemStats(p, key), ph = p.phases.find((x) => x.key === key);
        U.confirm(`ตั้งความคืบหน้า ${PM.PHASES.find((x) => x.key === key).label} = ${U.pct(s.pct, 1)}\n(คำนวณจากรายการ ${s.total} ${cfg(key).noun} · ตอนนี้ ${U.pct((ph.progress || 0) / 100, 1)})`, { title: 'ใช้ % จากรายการเป็นความคืบหน้า', ok: 'ตั้งค่า' })
          .then((ok) => {
            if (!ok) return;
            ph.progress = Math.round(s.pct * 1000) / 10;
            if (ph.progress > 0 && !ph.actStart) ph.actStart = PM.today();
            if (ph.progress >= 100 && !ph.actEnd) ph.actEnd = PM.today();
            PM.snapshotProgress(p); PM.upsert('projects', p); U.toast('อัปเดตความคืบหน้าแล้ว'); rerender();
          });
      }
      return true;
    }
    const row = e.target.closest('[data-pi-row]');
    if (row) { const x = (p.phaseItems || []).find((i) => i.id === row.dataset.piRow); if (x) itemForm(p, x.phase, x, rerender); return true; }
    return false;
  };

  function itemForm(p, key, item, done) {
    const c = cfg(key), canEdit = PM.can('phaseitem.edit');
    const x = item || { id: PM.uid('I'), phase: key, no: nextNo(p, key), name: '', rev: c.rev ? 'A' : '', status: 'todo', owner: '', due: '', doneDate: '', ref: '', comment: '', note: '', files: [] };
    const log = (x.log || []).slice().reverse();
    const people = PM.db.resources.filter((r) => r.active !== false).map((r) => ({ value: r.id, label: r.name }));
    const form = U.modal({
      title: item ? `${x.no} · ${x.name}` : `เพิ่ม${c.noun} — ${PM.PHASES.find((y) => y.key === key).label}`, wide: true,
      onDelete: item && canEdit ? () => {
        PM.poFiles.remove((x.files || []).map((f) => f.path)).catch(() => { /* already gone */ });
        p.phaseItems = p.phaseItems.filter((i) => i.id !== x.id); PM.upsert('projects', p); U.toast('ลบแล้ว'); done();
      } : null,
      body: `
        ${U.field('เลขที่', 'no', x.no, { required: true })}
        ${U.field('ขั้นงาน', 'phase', x.phase, { options: PM.PHASES.map((y) => ({ value: y.key, label: `${y.label} — ${y.th}` })) })}
        ${U.field(c.rev ? 'ชื่อเอกสาร / แบบ' : 'รายการ', 'name', x.name, { required: true, full: true })}
        ${U.field('สถานะ', 'status', x.status, { options: stepsOf(key).map((s) => ({ value: s, label: c.steps[s] })), hint: c.rev ? 'ส่งกลับแก้ไข (Return) → ส่งพิจารณาอีกครั้ง: Revision ขึ้นให้อัตโนมัติ (A → B, 0 → 1) ถ้าไม่ได้แก้เอง' : '' })}
        ${c.rev ? U.field('Revision', 'rev', x.rev, { placeholder: 'A, B, 0, 1 …' }) : U.field('อ้างอิง / เลข PO', 'ref', x.ref, { placeholder: 'เช่น PO-2501-003' })}
        ${U.field('ผู้รับผิดชอบ', 'owner', x.owner, { options: people, placeholder: '— เลือก —' })}
        ${U.field('กำหนดเสร็จ', 'due', x.due, { type: 'date' })}
        ${U.field('เสร็จเมื่อ', 'doneDate', x.doneDate, { type: 'date', hint: 'ใส่ให้อัตโนมัติเมื่อเลือกสถานะสุดท้าย' })}
        ${c.rev ? U.field('อ้างอิง (เลขเอกสารลูกค้า / Transmittal)', 'ref', x.ref) : '<span></span>'}
        ${c.rev ? U.field('ความเห็นลูกค้า / สาเหตุที่ส่งกลับ (Return)', 'comment', x.comment, { type: 'textarea', full: true, rows: 2 }) : ''}
        ${U.field('หมายเหตุ', 'note', x.note, { type: 'textarea', full: true, rows: 2 })}
        ${PM.poFiles.boxHtml(canEdit, c.rev ? 'ไฟล์เอกสาร / แบบ / Comment sheet' : 'ไฟล์แนบ', 'ทุกคนในทีมเห็นได้', 'item')}
        ${log.length ? `<div class="full pi-log"><span>ประวัติสถานะ${c.rev ? ' (Transmittal)' : ''}</span><ol>${log.map((l) => `<li><b>${U.date(l.date)}</b> ${U.badge(STEP_LEVEL[l.status] || 'neutral', c.steps[l.status] || l.status)}${c.rev && l.rev ? ` Rev. ${esc(l.rev)}` : ''}${l.tr ? ` · <b>${esc(l.tr)}</b>` : ''}${l.comment ? `<small>${esc(l.comment)}</small>` : ''}</li>`).join('')}</ol></div>` : ''}`,
      onSubmit: !canEdit ? null : (f, frm) => {
        if ((p.phaseItems || []).some((i) => i.id !== x.id && i.phase === f.phase && String(i.no).trim().toUpperCase() === f.no.toUpperCase())) { U.alert(`เลขที่ ${f.no} มีอยู่แล้วในขั้นงานนี้`); return false; }
        (async () => {
          const btn = frm.querySelector('[type=submit]'); btn.disabled = true; btn.classList.add('loading');
          const { files: kept, problems } = await files.commit(`${p.id}/items/${x.id}`, btn);
          const prev = item ? x.status : null, revTyped = item && f.rev != null && f.rev !== x.rev;
          Object.assign(x, f, { files: kept });
          if (!stepsOf(x.phase).includes(x.status)) x.status = 'review'; // moved to a phase without "Return"
          applyStep(x, prev, revTyped); // done date · revision bump after Return · history
          p.phaseItems = p.phaseItems || [];
          if (!p.phaseItems.includes(x)) p.phaseItems.push(x);
          PM.upsert('projects', p); U.closeModal();
          U.toast(problems.length ? 'บันทึกแล้ว แต่ไฟล์บางไฟล์มีปัญหา' : item ? 'บันทึกแล้ว' : 'เพิ่มแล้ว');
          if (problems.length) U.alert('ไฟล์ที่ไม่สำเร็จ:\n' + problems.join('\n'));
          done();
        })();
        return false;
      },
    });
    const files = PM.poFiles.box(form, x.files, canEdit, 'item');
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
  }
})();
