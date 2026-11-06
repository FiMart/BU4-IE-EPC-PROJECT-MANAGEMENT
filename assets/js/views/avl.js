/* avl.js — AVL (Approved Vendor List) of a project (project tab "AVL")
   One row = one vendor for one item (อุปกรณ์ / วัสดุ / งานรับเหมา), each with its own client approval:
     proposed (เสนอชื่อ) → submitted (รอลูกค้าอนุมัติ) → approved · conditional (มีเงื่อนไข) · rejected (ไม่อนุมัติ)
   Ties into PO: a committed PO for material / equipment / subcontract whose supplier is not an approved vendor of the
   project shows here, on the PO table, in the PO form and on the bell. A project with no AVL yet is not checked.
   Data: collection 'avl' = [{ id, projectId, item, discipline, vendor, maker, model, country, status, submittedDate,
          approvedDate, approvedBy, ref, note, files: [], createdBy, createdByName }]
   Files: Storage <projectId>/avl/<id> (every role may view). No SQL needed. */
(function () {
  const U = PM.ui, esc = U.esc;
  const STATUS = {
    proposed: { label: 'เสนอชื่อ (ยังไม่ส่ง)', level: 'neutral' },
    submitted: { label: 'รอลูกค้าอนุมัติ', level: 'warning' },
    approved: { label: 'อนุมัติแล้ว', level: 'good' },
    conditional: { label: 'อนุมัติแบบมีเงื่อนไข', level: 'info' },
    rejected: { label: 'ไม่อนุมัติ', level: 'critical' },
  };
  const ORDER = { approved: 0, conditional: 1, submitted: 2, proposed: 3, rejected: 4 };
  const DISCIPLINES = ['Mechanical / เครื่องกล', 'Electrical / ไฟฟ้า', 'Instrument / ระบบควบคุม', 'Piping / ท่อ', 'Civil / โยธา', 'Architecture / สถาปัตย์', 'อื่น ๆ'];
  const PO_CHECKED = ['Material', 'Equipment', 'Subcontract']; // rental / service POs are not vendor-listed
  const WAIT_DAYS = 14;
  const state = U.keep('avl', { show: 'all', disc: '', q: '' }, ['show', 'disc']);

  const listOf = (projectId) => (PM.db.avl || []).filter((x) => x.projectId === projectId);
  const isApproved = (x) => x.status === 'approved' || x.status === 'conditional';
  // company names compare without "Co., Ltd." / "บริษัท … จำกัด" and punctuation
  const nameKey = (s) => PM.normName(s).replace(/บริษัท|จำกัด|\(มหาชน\)|\b(co|company|ltd|limited|inc|corp|corporation|plc|pcl)\b/g, ' ').replace(/[.,()&/-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const sameVendor = (x, name) => { const k = nameKey(name); return !!k && (nameKey(x.vendor) === k || nameKey(x.maker) === k); };

  /* is this supplier on the project's AVL? null = not checked (no AVL yet / no name) ·
     'approved' · 'pending' (listed, not decided) · 'rejected' · 'none' (not listed) */
  PM.avlCheck = function (projectId, supplier) {
    const all = listOf(projectId);
    if (!all.length || !nameKey(supplier)) return null;
    const hit = all.filter((x) => sameVendor(x, supplier));
    if (!hit.length) return 'none';
    if (hit.some(isApproved)) return 'approved';
    return hit.every((x) => x.status === 'rejected') ? 'rejected' : 'pending';
  };
  const CHECK = {
    none: { level: 'warning', badge: 'นอก AVL', text: 'ผู้ขายรายนี้ไม่อยู่ใน AVL ของโครงการ' },
    pending: { level: 'neutral', badge: 'AVL รออนุมัติ', text: 'ผู้ขายรายนี้อยู่ใน AVL แต่ลูกค้ายังไม่อนุมัติ' },
    rejected: { level: 'critical', badge: 'AVL ไม่อนุมัติ', text: 'ลูกค้าไม่อนุมัติผู้ขายรายนี้ใน AVL ของโครงการ' },
  };
  const poChecked = (po) => PO_CHECKED.includes(po.category);
  /* committed POs of the project whose supplier is not approved */
  PM.avlPoOff = (p) => (PM.db.pos || []).filter((po) => po.projectId === p.id && PM.poIsCommitted(po) && poChecked(po))
    .map((po) => ({ po, check: PM.avlCheck(p.id, po.supplier) })).filter((x) => x.check && x.check !== 'approved');
  PM.avlPoBadge = (po) => { if (!poChecked(po)) return ''; const c = CHECK[PM.avlCheck(po.projectId, po.supplier)]; return c ? U.badge(c.level, c.badge) : ''; };
  /* names on the AVL that look like what was typed (a typo, a shortened name, spaces) — approved vendors first */
  const squeeze = (s) => nameKey(s).replace(/\s+/g, '');
  const editDistance = (a, b) => {
    let row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      row = next;
    }
    return row[b.length];
  };
  const looksLike = (typed, name) => {
    const a = squeeze(typed), b = squeeze(name);
    if (a.length < 3 || !b) return false;
    return b.includes(a) || a.includes(b) || editDistance(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.2));
  };
  /* check what was typed against the project's AVL. state: empty · exempt (this category is not vendor-listed) ·
     noavl (the project has no AVL yet) · approved · conditional · pending · rejected · none */
  PM.avlMatch = function (projectId, supplier, category) {
    const name = String(supplier || '').trim();
    if (!name) return { state: 'empty' };
    if (category && !PO_CHECKED.includes(category)) return { state: 'exempt' };
    const all = listOf(projectId);
    if (!all.length) return { state: 'noavl' };
    const hit = all.filter((x) => sameVendor(x, name));
    const items = (rows) => Array.from(new Set(rows.map((x) => x.item)));
    if (!hit.length) {
      const near = all.filter((x) => looksLike(name, x.vendor)).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
      return { state: 'none', suggest: Array.from(new Set(near.map((x) => x.vendor))).slice(0, 3) };
    }
    const ok = hit.filter((x) => x.status === 'approved'), cond = hit.filter((x) => x.status === 'conditional');
    if (ok.length) return { state: 'approved', items: items(ok) };
    if (cond.length) return { state: 'conditional', items: items(cond), note: cond.map((x) => x.note).filter(Boolean).join(' · ') };
    if (hit.every((x) => x.status === 'rejected')) return { state: 'rejected', items: items(hit), note: hit.map((x) => x.note).filter(Boolean).join(' · ') };
    return { state: 'pending', items: items(hit.filter((x) => x.status !== 'rejected')) };
  };
  /* the line under the supplier box: what the check found — warns, never blocks */
  PM.avlHint = function (projectId, supplier, category, readOnly) {
    const m = PM.avlMatch(projectId, supplier, category);
    const list = (a) => esc((a || []).join(', '));
    if (m.state === 'approved') return `${U.badge('good', 'ตรงกับ AVL')} ลูกค้าอนุมัติแล้ว สำหรับ ${list(m.items)}`;
    if (m.state === 'conditional') return `${U.badge('info', 'ตรงกับ AVL · มีเงื่อนไข')} สำหรับ ${list(m.items)}${m.note ? ` — ${esc(m.note)}` : ''}`;
    if (m.state === 'pending') return `${U.badge('warning', 'AVL รออนุมัติ')} อยู่ใน AVL สำหรับ ${list(m.items)} แต่ลูกค้ายังไม่อนุมัติ`;
    if (m.state === 'rejected') return `${U.badge('critical', 'AVL ไม่อนุมัติ')} ลูกค้าไม่อนุมัติผู้ขายรายนี้ สำหรับ ${list(m.items)}${m.note ? ` — ${esc(m.note)}` : ''}`;
    if (m.state === 'none') return `${U.badge('warning', 'ไม่ตรงกับ AVL')} ไม่พบชื่อนี้ใน AVL ของโครงการ${m.suggest.length ? ` · หมายถึง ${m.suggest.map((n) => (readOnly ? `<b>${esc(n)}</b>` : `<button type="button" class="link-btn" data-avl-use="${esc(n)}">${esc(n)}</button>`)).join(' หรือ ')} ?` : ''}`;
    if (m.state === 'noavl') return `${U.badge('neutral', 'ยังตรวจไม่ได้')} โครงการนี้ยังไม่มี AVL`;
    if (m.state === 'exempt') return `${U.badge('neutral', 'ไม่ต้องตรวจ AVL')} หมวดนี้ไม่อยู่ในขอบเขตของ AVL`;
    return '';
  };
  /* a supplier box in a form: checks as you type, offers the approved vendors, and "หมายถึง …" fills in the name.
     o = { field, box (selector of an empty element), project () → id, readOnly } · returns a function that re-checks */
  PM.avlBind = function (form, o) {
    const box = form.querySelector(o.box), input = form[o.field], listId = `${o.box.slice(1)}-list`;
    form.insertAdjacentHTML('beforeend', `<datalist id="${listId}"></datalist>`);
    input.setAttribute('list', listId);
    input.setAttribute('autocomplete', 'off');
    const show = () => {
      const pid = o.project();
      const html = PM.avlHint(pid, input.value, form.category.value, o.readOnly);
      box.innerHTML = html; box.hidden = !html;
      form.querySelector('#' + listId).innerHTML = PM.avlVendors(pid).map((n) => `<option value="${esc(n)}">`).join('');
    };
    ['input', 'change'].forEach((ev) => form.addEventListener(ev, (e) => { if ([o.field, 'category', 'projectId'].includes(e.target.name)) show(); }));
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-avl-use]'); if (b) { input.value = b.dataset.avlUse; show(); input.focus(); } });
    show();
    return show;
  };
  /* asked once when a PO is saved with a vendor the client has not approved: the text of the question, or '' */
  PM.avlWarning = function (projectId, supplier, category) {
    const m = PM.avlMatch(projectId, supplier, category);
    const name = String(supplier || '').trim();
    if (m.state === 'none') return `"${name}" ไม่ตรงกับ AVL ของโครงการนี้${m.suggest.length ? `\nชื่อที่ใกล้เคียงใน AVL: ${m.suggest.join(', ')}` : ''}\n\nบันทึก PO ต่อหรือไม่? ควรขอให้ลูกค้าอนุมัติผู้ขายก่อน`;
    if (m.state === 'pending') return `"${name}" อยู่ใน AVL แต่ลูกค้ายังไม่อนุมัติ\n\nบันทึก PO ต่อหรือไม่?`;
    if (m.state === 'rejected') return `ลูกค้าไม่อนุมัติ "${name}" ใน AVL ของโครงการนี้${m.note ? `\nเหตุผล: ${m.note}` : ''}\n\nบันทึก PO ต่อหรือไม่?`;
    return '';
  };
  /* one vendor across every project (the Price List is not tied to a project) */
  PM.avlWhere = function (name) {
    if (!nameKey(name) || !(PM.db.avl || []).length) return '';
    const by = { approved: [], pending: [], rejected: [] };
    (PM.db.projects || []).forEach((p) => { const c = PM.avlCheck(p.id, name); if (by[c]) by[c].push(p.code); });
    const part = (level, label, codes) => (codes.length ? `${U.badge(level, label)} ${esc(codes.join(', '))}` : '');
    return [part('good', 'อนุมัติใน AVL', by.approved), part('warning', 'AVL รออนุมัติ', by.pending), part('critical', 'AVL ไม่อนุมัติ', by.rejected)].filter(Boolean).join(' ')
      || `${U.badge('neutral', 'ไม่อยู่ใน AVL')} ยังไม่อยู่ใน AVL ของโครงการใด`;
  };
  PM.avlVendors = (projectId) => Array.from(new Set(listOf(projectId).filter(isApproved).map((x) => x.vendor)));
  PM.avlWaiting = (x, T) => x.status === 'submitted' && x.submittedDate && PM.diffDays(x.submittedDate, T || PM.today()) > WAIT_DAYS;

  /* summary used by the tab, the bell and the monthly report */
  PM.avlStats = (p, T) => {
    const all = listOf(p.id), n = (fn) => all.filter(fn).length;
    const items = Array.from(new Set(all.map((x) => PM.normName(x.item))));
    const off = PM.avlPoOff(p);
    return { total: all.length, items: items.length, approved: n(isApproved), submitted: n((x) => x.status === 'submitted'), proposed: n((x) => x.status === 'proposed'), rejected: n((x) => x.status === 'rejected'),
      waiting: n((x) => PM.avlWaiting(x, T)), noVendor: items.filter((k) => !all.some((x) => PM.normName(x.item) === k && isApproved(x))).length,
      off, offValue: PM.sum(off, (x) => Number(x.po.amount) || 0) };
  };

  /* a status change: keeps the dates in step (submitted → sent today · approved → approved today) */
  function setStatus(x, st) {
    const T = PM.today();
    x.status = st;
    if (st === 'proposed') { x.submittedDate = ''; x.approvedDate = ''; }
    else x.submittedDate = x.submittedDate || T;
    if (st === 'submitted') x.approvedDate = '';
    if (isApproved(x) || st === 'rejected') x.approvedDate = x.approvedDate || T;
  }

  /* ---------------- the tab ---------------- */
  PM.avlTab = function (el, p, m, rerender) {
    const T = PM.today(), canEdit = PM.can('avl.edit');
    const s = PM.avlStats(p, T), all = listOf(p.id);
    const discs = DISCIPLINES.filter((d) => all.some((x) => x.discipline === d));
    if (state.disc && !discs.includes(state.disc)) state.disc = '';
    const show = { all: () => true, approved: isApproved, pending: (x) => x.status === 'submitted' || x.status === 'proposed', rejected: (x) => x.status === 'rejected' }[state.show] || (() => true);
    const list = all.filter((x) => show(x) && (!state.disc || x.discipline === state.disc));
    // grouped by item, in discipline order; the approved vendors of an item come first
    const dIdx = (d) => { const i = DISCIPLINES.indexOf(d); return i < 0 ? 99 : i; };
    const groups = Array.from(new Set(list.map((x) => PM.normName(x.item)))).map((k) => ({ k, rows: list.filter((x) => PM.normName(x.item) === k).sort((a, b) => ORDER[a.status] - ORDER[b.status] || String(a.vendor).localeCompare(String(b.vendor))), every: all.filter((x) => PM.normName(x.item) === k) }))
      .sort((a, b) => dIdx(a.rows[0].discipline) - dIdx(b.rows[0].discipline) || String(a.rows[0].item).localeCompare(String(b.rows[0].item)));
    const poCount = (x) => (PM.db.pos || []).filter((po) => po.projectId === p.id && PM.poIsCommitted(po) && sameVendor(x, po.supplier)).length;

    el.innerHTML = `
      <div class="row">
        <p class="muted" style="margin:0">รายชื่อผู้ขาย / ผู้ผลิตที่ลูกค้าอนุมัติให้ใช้ในโครงการนี้ — ใช้ตรวจก่อนออก PO</p>
        <span class="spacer"></span>
        <button class="btn" data-avl="print"${s.total ? '' : ' disabled'}>🖨 พิมพ์ AVL</button>
        ${canEdit ? '<button class="btn" data-avl="paste">วางจาก Excel</button><button class="btn primary" data-avl="new">+ เพิ่มผู้ขาย</button>' : ''}
      </div>
      <div class="grid cols-4">
        ${PM.common.tile({ label: 'รายการใน AVL', value: s.items, sub: s.noVendor ? U.badge('warning', `ยังไม่มีผู้ขายที่อนุมัติ ${s.noVendor}`) : s.items ? U.badge('good', 'มีผู้ขายที่อนุมัติครบทุกรายการ') : 'ยังไม่มีรายการ', icon: 'layers' })}
        ${PM.common.tile({ label: 'ผู้ขายที่อนุมัติแล้ว', value: `${s.approved} <small>/ ${s.total}</small>`, sub: `<div class="pbar-wrap">${U.progress(s.total ? s.approved / s.total : 0, null)}<span class="num">${U.pct(s.total ? s.approved / s.total : null)}</span></div>`, icon: 'check' })}
        ${PM.common.tile({ label: 'รอลูกค้าอนุมัติ', value: s.submitted, sub: s.waiting ? U.badge('warning', `รอเกิน ${WAIT_DAYS} วัน ${s.waiting}`) : s.proposed ? `ยังไม่ส่ง ${s.proposed}` : 'ไม่มีรายการรอนาน', icon: 'clock' })}
        ${PM.common.tile({ label: 'PO นอก AVL', value: s.total ? s.off.length : '–', sub: !s.total ? 'เริ่มตรวจเมื่อมี AVL' : s.off.length ? U.badge('warning', `มูลค่า ${U.money(s.offValue)}`) : U.badge('good', 'PO ทุกใบอยู่ใน AVL'), icon: 'truck' })}
      </div>
      ${s.off.length ? `<div class="card"><div class="card-h"><h2>PO ที่ผู้ขายยังไม่อยู่ใน AVL</h2>${U.badge('warning', `${s.off.length} ใบ`)}<p>ตรวจเฉพาะ PO หมวด Material · Equipment · Subcontract ที่ออกแล้ว${canEdit ? ' · เพิ่มผู้ขายเข้า AVL แล้วส่งลูกค้าอนุมัติ' : ''}</p></div>
        <div class="card-b flush table-wrap"><table class="tbl"><thead><tr><th>PO</th><th>ผู้ขาย</th><th class="num">มูลค่า</th><th>AVL</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>
          ${s.off.map(({ po, check }) => `<tr><td><b>${esc(po.poNo)}</b><small>${esc(po.description || '')}</small></td><td>${esc(po.supplier)}</td><td class="num">${U.money(po.amount)}</td><td>${U.badge(CHECK[check].level, CHECK[check].badge)}</td>
            ${canEdit ? `<td class="num">${check === 'none' ? `<button type="button" class="btn sm" data-avl="from-po" data-id="${esc(po.id)}">+ เพิ่มเข้า AVL</button>` : ''}</td>` : ''}</tr>`).join('')}
        </tbody></table></div></div>` : ''}
      <div class="card"><div class="card-h"><h2>AVL — ${esc(p.code)}</h2><span class="spacer"></span>
          <input type="search" id="avl-q" class="avl-q" placeholder="ค้นหารายการ / ผู้ขาย / ผู้ผลิต" aria-label="ค้นหาใน AVL" value="${esc(state.q)}">
          ${discs.length > 1 ? `<select id="avl-disc" aria-label="กรองตามงาน">${U.options([{ value: '', label: 'ทุกงาน' }].concat(discs.map((d) => ({ value: d, label: d }))), state.disc)}</select>` : ''}
          ${PM.common.seg('avlshow', [{ key: 'all', label: `ทั้งหมด (${s.total})` }, { key: 'approved', label: `อนุมัติ (${s.approved})` }, { key: 'pending', label: `รออนุมัติ (${s.submitted + s.proposed})` }, { key: 'rejected', label: `ไม่อนุมัติ (${s.rejected})` }], state.show)}
          <p>1 แถว = ผู้ขาย 1 รายของรายการนั้น · เปลี่ยนสถานะได้จากตาราง · คลิกแถวเพื่อแก้ไข / แนบหนังสืออนุมัติ</p></div>
        <div class="card-b flush table-wrap">${groups.length ? `<table class="tbl avl-table"><thead><tr><th>ผู้ขาย / ผู้ผลิต</th><th>ประเทศ</th><th>สถานะ</th><th>อนุมัติเมื่อ / อ้างอิง</th><th class="num">PO</th><th class="num">ไฟล์</th></tr></thead><tbody>
          ${groups.map((g) => { const ok = g.every.filter(isApproved).length; return `<tr class="avl-g" data-g="${esc(g.k)}"><td colspan="6"><b>${esc(g.rows[0].item)}</b><small>${esc(g.rows[0].discipline || '')}</small> ${ok ? U.badge('good', `อนุมัติ ${ok} ราย`) : U.badge('warning', 'ยังไม่มีผู้ขายที่อนุมัติ')}</td></tr>
            ${g.rows.map((x) => `<tr class="click${PM.avlWaiting(x, T) ? ' pl-late' : ''}" data-avl-row="${esc(x.id)}" data-g="${esc(g.k)}" data-q="${esc(`${x.item} ${x.vendor} ${x.maker || ''} ${x.model || ''}`.toLowerCase())}">
              <td><b>${esc(x.vendor)}</b><small>${esc([x.maker, x.model].filter(Boolean).join(' · ') || '–')}</small></td>
              <td>${esc(x.country || '–')}</td>
              <td>${canEdit ? `<select class="pi-st avl-st-${x.status}" data-avl-st="${esc(x.id)}" aria-label="สถานะ">${Object.keys(STATUS).map((k) => `<option value="${k}"${k === x.status ? ' selected' : ''}>${esc(STATUS[k].label)}</option>`).join('')}</select>` : U.badge(STATUS[x.status].level, STATUS[x.status].label)}${x.status === 'rejected' && x.note ? `<small class="neg">${esc(x.note)}</small>` : ''}</td>
              <td class="nowrap">${isApproved(x) || x.status === 'rejected' ? U.date(x.approvedDate) : x.submittedDate ? `<span class="muted">ส่ง ${U.date(x.submittedDate)}</span>` : '–'}${PM.avlWaiting(x, T) ? `<small class="neg">รอ ${PM.diffDays(x.submittedDate, T)} วัน</small>` : ''}<small>${esc([x.approvedBy, x.ref].filter(Boolean).join(' · '))}</small></td>
              <td class="num">${poCount(x) || '–'}</td>
              <td class="num">${(x.files || []).length ? `<button type="button" class="link-btn" data-avl-files="${esc(x.id)}">📎 ${x.files.length}</button>` : '–'}</td></tr>`).join('')}`; }).join('')}
          </tbody></table><p class="empty" id="avl-none" hidden>ไม่พบรายการที่ตรงกับคำค้นหา</p>` : `<p class="empty">${s.total ? 'ไม่มีรายการในมุมมองนี้' : `ยังไม่มี AVL ของโครงการนี้${canEdit ? ' — กด "+ เพิ่มผู้ขาย" หรือ "วางจาก Excel" (ส่วนใหญ่ลูกค้าให้มาเป็นไฟล์ Excel)' : ''}`}</p>`}</div></div>`;

    /* search filters the rows on the page, so the box keeps its focus while typing */
    const applyQ = () => {
      const t = String(state.q || '').trim().toLowerCase();
      let shown = 0;
      const open = new Set();
      el.querySelectorAll('.avl-table tr[data-q]').forEach((tr) => { const on = !t || tr.dataset.q.includes(t); tr.hidden = !on; if (on) { shown++; open.add(tr.dataset.g); } });
      el.querySelectorAll('.avl-table tr.avl-g').forEach((tr) => { tr.hidden = !open.has(tr.dataset.g); });
      const tb = el.querySelector('.avl-table'), none = el.querySelector('#avl-none');
      if (tb) { tb.hidden = !shown; none.hidden = !!shown; }
    };
    applyQ();
    el.oninput = (e) => { if (e.target.id === 'avl-q') { state.q = e.target.value; applyQ(); } };
    el.onchange = (e) => {
      if (e.target.id === 'avl-disc') { state.disc = e.target.value; rerender(); return; }
      const sel = e.target.closest('[data-avl-st]');
      if (!sel || !canEdit) return;
      const x = (PM.db.avl || []).find((i) => i.id === sel.dataset.avlSt);
      if (!x) return;
      const save = () => { setStatus(x, sel.value); PM.upsert('avl', x); U.toast(`${x.vendor} → ${STATUS[x.status].label}`); rerender(); };
      if (sel.value !== 'rejected' && sel.value !== 'conditional') { save(); return; }
      // the reason / condition is what the team needs later
      U.prompt(sel.value === 'rejected' ? `เหตุผลที่ลูกค้าไม่อนุมัติ ${x.vendor}` : `เงื่อนไขการอนุมัติ ${x.vendor}`, x.note || '', { title: STATUS[sel.value].label, ok: 'บันทึก', multiline: true })
        .then((note) => { if (note === null) { sel.value = x.status; return; } x.note = note.trim(); save(); });
    };
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg="avlshow"]');
      if (seg) { state.show = seg.dataset.val; rerender(); return; }
      if (e.target.closest('select, input')) return;
      const f = e.target.closest('[data-avl-files]');
      if (f) { const x = (PM.db.avl || []).find((i) => i.id === f.dataset.avlFiles); if (x) PM.poFiles.showList(`ไฟล์ของ ${x.vendor} — ${x.item}`, x.files); return; }
      const a = e.target.closest('[data-avl]');
      if (a) {
        const act = a.dataset.avl;
        if (act === 'new') avlForm(p, null, rerender);
        if (act === 'print') PM.avlPrint(p);
        if (act === 'paste') pasteForm(p, rerender);
        if (act === 'from-po') { const po = PM.find('pos', a.dataset.id); if (po) avlForm(p, null, rerender, { vendor: po.supplier, item: po.description }); }
        return;
      }
      const row = e.target.closest('[data-avl-row]');
      if (row) { const x = (PM.db.avl || []).find((i) => i.id === row.dataset.avlRow); if (x) avlForm(p, x, rerender); }
    };
  };

  /* names to pick from: this project's AVL items · vendors from the Price List, POs and every project's AVL */
  const uniq = (a) => Array.from(new Set(a.map((s) => String(s || '').trim()).filter(Boolean))).sort((x, y) => x.localeCompare(y));
  const itemNames = (p) => uniq(listOf(p.id).map((x) => x.item));
  const vendorNames = () => uniq((PM.db.prices || []).map((x) => x.vendor).concat((PM.db.pos || []).map((x) => x.supplier), (PM.db.avl || []).map((x) => x.vendor)));
  const dataList = (id, names) => `<datalist id="${id}">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`;

  function avlForm(p, item, done, preset) {
    const canEdit = PM.can('avl.edit');
    const u = PM.auth && PM.auth.user;
    const x = item || Object.assign({ id: PM.uid('AV'), projectId: p.id, item: '', discipline: DISCIPLINES[0], vendor: '', maker: '', model: '', country: 'Thailand', status: 'proposed', submittedDate: '', approvedDate: '', approvedBy: '', ref: '', note: '', files: [] }, preset);
    const form = U.modal({
      title: item ? `${x.vendor} · ${x.item}` : `เพิ่มผู้ขายใน AVL — ${p.code}`, wide: true,
      onDelete: item && canEdit ? () => {
        PM.poFiles.trash(`${p.id}/avl/${x.id}`, (x.files || []).map((f) => f.path));
        PM.remove('avl', x.id); U.toast('ลบแล้ว'); done();
      } : null,
      body: `
        ${dataList('avl-items', itemNames(p))}${dataList('avl-vendors', vendorNames())}
        ${U.field('รายการ (อุปกรณ์ / วัสดุ / งานรับเหมา)', 'item', x.item, { required: true, full: true, placeholder: 'เช่น Transformer 22/0.4 kV · สายไฟแรงดันต่ำ · Control Valve' })}
        ${U.field('งาน', 'discipline', x.discipline, { options: DISCIPLINES })}
        ${U.field('ผู้ขาย / ผู้รับเหมา', 'vendor', x.vendor, { required: true, placeholder: 'พิมพ์หรือเลือกจากรายชื่อ' })}
        ${U.field('ผู้ผลิต / ยี่ห้อ', 'maker', x.maker)}
        ${U.field('รุ่น / มาตรฐาน', 'model', x.model, { placeholder: 'เช่น IEC 60076' })}
        ${U.field('ประเทศผู้ผลิต', 'country', x.country)}
        ${U.field('สถานะ', 'status', x.status, { options: Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k].label })) })}
        ${U.field('วันที่ส่งขออนุมัติ', 'submittedDate', x.submittedDate, { type: 'date' })}
        ${U.field('วันที่ลูกค้าตอบ', 'approvedDate', x.approvedDate, { type: 'date' })}
        ${U.field('ผู้อนุมัติ', 'approvedBy', x.approvedBy, { placeholder: 'ชื่อ / หน่วยงานลูกค้า' })}
        ${U.field('เอกสารอ้างอิง', 'ref', x.ref, { placeholder: 'เช่น เลข Transmittal · หนังสืออนุมัติ' })}
        ${U.field('เงื่อนไข / หมายเหตุ', 'note', x.note, { type: 'textarea', rows: 2, full: true })}
        ${PM.poFiles.boxHtml(canEdit, 'เอกสารประกอบ', 'หนังสืออนุมัติ · Vendor profile · แคตตาล็อก', 'avl')}`,
      onSubmit: !canEdit ? null : (f, frm) => {
        if (listOf(p.id).some((i) => i.id !== x.id && PM.normName(i.item) === PM.normName(f.item) && nameKey(i.vendor) === nameKey(f.vendor))) { U.alert(`${f.vendor} มีอยู่ในรายการ "${f.item}" แล้ว`); return false; }
        (async () => {
          const btn = frm.querySelector('[type=submit]'); btn.disabled = true; btn.classList.add('loading');
          const r = await files.commit(`${p.id}/avl/${x.id}`, btn);
          const st = f.status; delete f.status;
          Object.assign(x, f, { files: r.files });
          setStatus(x, st);
          if (!item) Object.assign(x, { createdBy: u ? u.id : '', createdByName: u ? PM.auth.displayName(u) : '' });
          PM.upsert('avl', x);
          U.closeModal();
          U.toast(r.problems.length ? 'บันทึกแล้ว แต่ไฟล์บางไฟล์มีปัญหา' : item ? 'บันทึกแล้ว' : `เพิ่ม ${x.vendor} ใน AVL แล้ว`);
          if (r.problems.length) U.alert('ไฟล์ที่ไม่สำเร็จ:\n' + r.problems.join('\n'));
          done();
        })();
        return false;
      },
    });
    form.item.setAttribute('list', 'avl-items');
    form.vendor.setAttribute('list', 'avl-vendors');
    const files = PM.poFiles.box(form, x.files, canEdit, 'avl');
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
  }

  /* paste a table copied from Excel: รายการ | ผู้ขาย | ผู้ผลิต | รุ่น | ประเทศ | งาน (the last four may be left out) */
  function pasteForm(p, done) {
    const u = PM.auth && PM.auth.user;
    const parse = (text) => {
      const rows = []; let skipped = 0, dup = 0;
      const seen = new Set(listOf(p.id).map((x) => `${PM.normName(x.item)}|${nameKey(x.vendor)}`));
      String(text || '').split(/\r?\n/).map((r) => r.trim()).filter(Boolean).forEach((r, i) => {
        const c = (r.includes('\t') ? r.split('\t') : r.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map((s) => s.replace(/^"|"$/g, '').trim());
        if (i === 0 && /รายการ|item|equipment|material/i.test(c[0]) && /ผู้ขาย|vendor|supplier/i.test(c[1] || '')) return; // header row
        if (!c[0] || !c[1]) { skipped++; return; }
        const k = `${PM.normName(c[0])}|${nameKey(c[1])}`;
        if (seen.has(k)) { dup++; return; }
        seen.add(k);
        const d = String(c[5] || '').toLowerCase();
        rows.push({ item: c[0], vendor: c[1], maker: c[2] || '', model: c[3] || '', country: c[4] || '', discipline: DISCIPLINES.find((x) => d && x.toLowerCase().includes(d)) || 'อื่น ๆ' });
      });
      return { rows, skipped, dup };
    };
    const form = U.modal({
      title: `วาง AVL จาก Excel — ${p.code}`, wide: true, submitLabel: 'นำเข้า',
      body: `
        <p class="full muted" style="margin:0">คัดลอกตารางจาก Excel แล้ววางด้านล่าง — 1 แถว = ผู้ขาย 1 รายของรายการนั้น · ลำดับคอลัมน์: <b>รายการ · ผู้ขาย</b> · ผู้ผลิต · รุ่น · ประเทศ · งาน (4 คอลัมน์หลังเว้นได้) — แถวหัวตารางข้ามให้</p>
        <label class="full"><span>ข้อมูล</span><textarea name="data" rows="9" placeholder="Transformer 22/0.4 kV&#9;EastPower Equipment Co., Ltd.&#9;EastPower&#9;IEC 60076&#9;Thailand&#9;Electrical"></textarea></label>
        ${U.field('สถานะของรายการที่นำเข้า', 'status', 'proposed', { options: Object.keys(STATUS).filter((k) => k !== 'rejected').map((k) => ({ value: k, label: STATUS[k].label })), hint: 'ถ้าเป็น AVL ที่ลูกค้าอนุมัติมาแล้ว ให้เลือก "อนุมัติแล้ว"' })}
        <p class="full" id="avl-preview" aria-live="polite"></p>`,
      onSubmit: (f) => {
        const { rows, skipped, dup } = parse(f.data);
        if (!rows.length) { U.alert('ไม่พบแถวที่นำเข้าได้ — ต้องมีอย่างน้อย รายการ และ ผู้ขาย (แถวที่ซ้ำกับ AVL เดิมจะถูกข้าม)'); return false; }
        rows.forEach((r) => {
          const x = Object.assign({ id: PM.uid('AV'), projectId: p.id, status: 'proposed', submittedDate: '', approvedDate: '', approvedBy: '', ref: '', note: '', files: [], createdBy: u ? u.id : '', createdByName: u ? PM.auth.displayName(u) : '' }, r);
          setStatus(x, f.status);
          PM.db.avl.push(x);
        });
        PM.save();
        U.toast(`นำเข้า ${rows.length} รายการ${dup ? ` · ซ้ำ ${dup}` : ''}${skipped ? ` · ข้าม ${skipped}` : ''}`);
        done();
      },
    });
    const prev = form.querySelector('#avl-preview');
    form.data.addEventListener('input', () => {
      const { rows, skipped, dup } = parse(form.data.value);
      prev.innerHTML = form.data.value.trim() ? `อ่านได้ <b>${rows.length}</b> รายการ${dup ? ` · ซ้ำกับ AVL เดิม ${dup}` : ''}${skipped ? ` · <span class="neg">ข้าม ${skipped} แถว</span> (ไม่มีรายการ / ผู้ขาย)` : ''}` : '';
    });
  }

  /* ---------------- printed AVL (A4 landscape) — to send to the client for approval ---------------- */
  PM.avlPrint = function (p) {
    const P = PM.printDoc, win = P.open();
    if (!win) return;
    const T = PM.today(), s = PM.avlStats(p, T);
    const rows = listOf(p.id).slice().sort((a, b) => String(a.discipline).localeCompare(String(b.discipline)) || String(a.item).localeCompare(String(b.item)) || ORDER[a.status] - ORDER[b.status]);
    let n = 0, last = '';
    P.write(win, {
      title: `AVL ${p.code} ${T}`, bar: `AVL — ${p.code}`, doc: 'avl',
      head: {
        title: `<h1>รายชื่อผู้ขายที่ได้รับอนุมัติ</h1><p><b>Approved Vendor List (AVL)</b></p><p>${esc(p.code)} · ${esc(p.name)} · ลูกค้า ${esc(p.client || '–')}</p>`,
        meta: `${esc(PM.COMPANY)}<br>ข้อมูล ณ ${U.date(T)}<br>อนุมัติ ${s.approved} จาก ${s.total} ราย`,
      },
      body: `<style>@page { size: A4 landscape; } main { max-width: 275mm; } .avl-sub td { color: #6a7a91; border-bottom-color: transparent; }</style>
  <section class="flow">${P.tbl([{ t: 'ลำดับ', r: 1 }, { t: 'รายการ' }, { t: 'งาน' }, { t: 'ผู้ขาย / ผู้รับเหมา' }, { t: 'ผู้ผลิต / ยี่ห้อ' }, { t: 'รุ่น / มาตรฐาน' }, { t: 'ประเทศ' }, { t: 'สถานะ' }, { t: 'วันที่ตอบ / อ้างอิง' }],
    rows.map((x) => {
      const key = PM.normName(x.item), first = key !== last;
      last = key;
      if (first) n++;
      return [first ? String(n) : '', first ? `<b>${esc(x.item)}</b>` : '', first ? esc(x.discipline || '') : '', esc(x.vendor), esc(x.maker || '–'), esc(x.model || '–'), esc(x.country || '–'),
        `${esc(STATUS[x.status].label)}${x.note && x.status !== 'approved' ? `<small>${esc(x.note)}</small>` : ''}`, `${isApproved(x) || x.status === 'rejected' ? U.date(x.approvedDate) : '–'}${x.ref ? `<small>${esc(x.ref)}</small>` : ''}`];
    }), 'ยังไม่มีรายการ')}</section>
  <div class="sign"><div>จัดทำโดย</div><div>ผู้จัดการโครงการ</div><div>ลูกค้าอนุมัติ</div></div>`,
    });
  };

  /* demo data: what each project buys, mostly approved — one vendor left off some projects so "PO นอก AVL" shows */
  PM.buildSampleAvl = function (projects, T) {
    const ITEMS = [
      ['Main equipment package', 'Mechanical / เครื่องกล', [['EastPower Equipment Co., Ltd.', 'EastPower', 'IEC 60076', 'Thailand'], ['Delta Solar Parts Co., Ltd.', 'Delta', '', 'Taiwan']]],
      ['Electrical panels (MDB / DB)', 'Electrical / ไฟฟ้า', [['EastPower Equipment Co., Ltd.', 'EastPower', 'IEC 61439', 'Thailand'], ['Unity M&E Contractor Co., Ltd.', 'Unity', 'IEC 61439', 'Thailand']]],
      ['Power cables & accessories', 'Electrical / ไฟฟ้า', [['Thai Cable Industry Co., Ltd.', 'Thai Cable', 'TIS 11', 'Thailand']]],
      ['Structural steel', 'Civil / โยธา', [['Bangkok Steel Trading Co., Ltd.', 'BST', 'TIS 1227', 'Thailand']]],
      ['Civil materials (rebar, concrete)', 'Civil / โยธา', [['Grand Concrete Co., Ltd.', 'Grand', 'TIS 213', 'Thailand']]],
      ['Piping, valves & fittings', 'Piping / ท่อ', [['Siam Pipe & Valve Co., Ltd.', 'SPV', 'ASME B31.3', 'Thailand']]],
      ['Instruments & control', 'Instrument / ระบบควบคุม', [['ProTech Instruments Co., Ltd.', 'ProTech', 'IEC 61511', 'Japan']]],
      ['Installation subcontract', 'อื่น ๆ', [['Unity M&E Contractor Co., Ltd.', '', '', 'Thailand']]],
    ];
    const out = [];
    projects.forEach((p, pi) => {
      const start = p.startDate < T ? p.startDate : T;
      ITEMS.forEach(([item, discipline, vendors], ii) => {
        if (pi % 2 === 1 && item.startsWith('Piping')) return; // not on this project's AVL yet
        vendors.forEach(([vendor, maker, model, country], vi) => {
          const second = vi === 1, status = p.status === 'closed' ? 'approved' : second ? (pi % 3 === 0 ? 'submitted' : pi % 3 === 1 ? 'conditional' : 'rejected') : 'approved';
          const sent = status === 'submitted' ? PM.addDays(T, -(10 + ii * 4)) : PM.min(T, PM.addDays(start, 10 + ii * 3));
          out.push({ id: `AV-${p.id}-${ii + 1}-${vi + 1}`, projectId: p.id, item, discipline, vendor, maker, model, country, status, submittedDate: sent,
            approvedDate: status === 'submitted' ? '' : PM.min(T, PM.addDays(sent, 12)), approvedBy: status === 'submitted' ? '' : 'ฝ่ายวิศวกรรมลูกค้า', ref: `TR-${p.code.replace(/^PJ-/, '')}-${String(ii + 1).padStart(3, '0')}`,
            note: status === 'conditional' ? 'ต้องส่ง Type test report ก่อนสั่งผลิต' : status === 'rejected' ? 'ไม่ผ่านการประเมินผลงานอ้างอิง' : '', files: [], createdBy: '', createdByName: 'Document Control' });
        });
      });
    });
    return out;
  };
})();
