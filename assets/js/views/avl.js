/* avl.js — AVL (Approved Vendor List) of a project (project tab "AVL"), laid out like the client's Vendor List:
   discipline (Static · Rotating · Package · Electrical · Instrumentation · Heater · Fire Fighting · Piping · Process …)
   → item (REQ Description, with its number and heading) → vendors, each with: vendor location · manufacturing location ·
   client approved (Yes/No → status) · remarks · flags "Proposed Additional Vendor" and "COO Deviation" · removed (struck in the list).
   Status of a vendor: proposed (เสนอชื่อ) → submitted (รอลูกค้าอนุมัติ) → approved · conditional (มีเงื่อนไข) · rejected (ไม่อนุมัติ)
   Ties into PO: a committed PO for material / equipment / subcontract whose supplier is not an approved vendor of the project
   shows here, on the PO table, in the PO form and on the bell. A project with no AVL yet is not checked. Removed rows do not count.
   Import a whole Vendor List from PDF / Excel: avl-import.js (PM.avlImport) — re-importing a newer issue updates the rows.
   Data: collection 'avl' = [{ id, projectId, discipline, itemNo, itemGroup, item, itemNote, vendor, vendorLocation, maker, model, country,
          status, submittedDate, approvedDate, approvedBy, ref, note, remarks, addl, coo, removed, removedWhy, files: [], createdBy, createdByName, importedAt }]
          vendor '' = an item with no vendor yet (or an item not required, removed) — kept so the list matches the client's
   Files: Storage <projectId>/avl/<id> (every role may view). No SQL needed. */
(function () {
  const U = PM.ui, esc = U.esc;
  const STATUS = (PM.AVL_STATUS = {
    proposed: { label: 'เสนอชื่อ (ยังไม่ส่ง)', level: 'neutral' },
    submitted: { label: 'รอลูกค้าอนุมัติ', level: 'warning' },
    approved: { label: 'อนุมัติแล้ว', level: 'good' },
    conditional: { label: 'อนุมัติแบบมีเงื่อนไข', level: 'info' },
    rejected: { label: 'ไม่อนุมัติ', level: 'critical' },
  });
  const ORDER = { approved: 0, conditional: 1, submitted: 2, proposed: 3, rejected: 4 };
  const DISCIPLINES = (PM.AVL_DISCIPLINES = ['Static / อุปกรณ์อยู่กับที่', 'Rotating / เครื่องจักรหมุน', 'Package / แพ็กเกจ', 'Electrical / ไฟฟ้า', 'Instrument / ระบบควบคุม',
    'Heater / เตาให้ความร้อน', 'Fire Fighting / ดับเพลิง', 'Piping / ท่อ', 'Process / กระบวนการ', 'Mechanical / เครื่องกล', 'Civil / โยธา', 'Architecture / สถาปัตย์',
    'HVAC / ปรับอากาศ', 'Telecom / สื่อสาร', 'อื่น ๆ']);
  const DISC_MATCH = [[/^static/i, 0], [/^(?:rotating|machinery)/i, 1], [/^package/i, 2], [/^electric/i, 3], [/^(?:instrument|control)/i, 4], [/^(?:heater|furnace|fired)/i, 5],
    [/^fire/i, 6], [/^pip(?:e|ing)/i, 7], [/^process/i, 8], [/^mechanic/i, 9], [/^(?:civil|structur)/i, 10], [/^(?:architect|building)/i, 11], [/^hvac/i, 12], [/^telecom/i, 13], [/^(?:อื่น|other)/i, 14]];
  /* "1. STATIC EQUIPMENT" · "Instrumentation" · "FireFighting" → one of DISCIPLINES (anything else is kept as written) */
  PM.avlDiscipline = (t) => {
    const s = String(t || '').replace(/[]/g, '').replace(/^\s*(?:[ivx]+|\d+|[a-h])\s*[.)\-:]\s*/i, '').replace(/^discipline\s*[:-]?\s*/i, '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    const hit = DISC_MATCH.find(([re]) => re.test(s));
    return hit ? DISCIPLINES[hit[1]] : s;
  };
  const PO_CHECKED = ['Material', 'Equipment', 'Subcontract']; // rental / service POs are not vendor-listed
  const WAIT_DAYS = 14;
  const state = U.keep('avl', { show: 'all', disc: '', q: '' }, ['show', 'disc']);

  const listOf = (projectId) => (PM.db.avl || []).filter((x) => x.projectId === projectId);
  const hasVendor = (x) => String(x.vendor || '').trim() !== '';
  const isLive = (x) => !x.removed && hasVendor(x);
  const liveOf = (projectId) => listOf(projectId).filter(isLive); // what PO checks look at
  const isApproved = (x) => x.status === 'approved' || x.status === 'conditional';
  // company names compare without "Co., Ltd." / "บริษัท … จำกัด", a leading footnote mark and punctuation
  const nameKey = (s) => PM.normName(String(s || '').replace(/^\s*\*+/, '')).replace(/บริษัท|จำกัด|\(มหาชน\)|\b(co|company|ltd|limited|inc|corp|corporation|plc|pcl)\b/g, ' ').replace(/[.,()&/-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const sameVendor = (x, name) => { const k = nameKey(name); return !!k && (nameKey(x.vendor) === k || nameKey(x.maker) === k); };
  const keyOf = (item, vendor) => `${PM.normName(item)}|${nameKey(vendor)}`;
  PM.avlFlags = (x) => `${x.addl ? ' <span class="avl-flag addl" title="Proposed Additional Vendor — ผู้ขายที่เสนอเพิ่มจากรายชื่อเดิมของลูกค้า">เสนอเพิ่ม</span>' : ''}${x.coo ? ' <span class="avl-flag coo" title="COO Deviation — ประเทศผู้ผลิตต่างจากที่ลูกค้ากำหนด">COO Deviation</span>' : ''}`;

  /* is this supplier on the project's AVL? null = not checked (no AVL yet / no name) ·
     'approved' · 'pending' (listed, not decided) · 'rejected' · 'none' (not listed) */
  PM.avlCheck = function (projectId, supplier) {
    const all = liveOf(projectId);
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
     noavl (the project has no AVL yet) · approved · conditional · pending · rejected · none (removed = struck from the list → none) */
  PM.avlMatch = function (projectId, supplier, category) {
    const name = String(supplier || '').trim();
    if (!name) return { state: 'empty' };
    if (category && !PO_CHECKED.includes(category)) return { state: 'exempt' };
    const all = liveOf(projectId);
    if (!all.length) return { state: 'noavl' };
    const hit = all.filter((x) => sameVendor(x, name));
    const items = (rows) => Array.from(new Set(rows.map((x) => x.item)));
    if (!hit.length) {
      const near = all.filter((x) => looksLike(name, x.vendor)).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
      const struck = listOf(projectId).some((x) => x.removed && sameVendor(x, name));
      return { state: 'none', struck, suggest: Array.from(new Set(near.map((x) => x.vendor))).slice(0, 3) };
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
    if (m.state === 'none') return `${U.badge('warning', 'ไม่ตรงกับ AVL')} ${m.struck ? 'ผู้ขายรายนี้ถูกตัดออกจาก AVL ของโครงการแล้ว' : 'ไม่พบชื่อนี้ใน AVL ของโครงการ'}${m.suggest.length ? ` · หมายถึง ${m.suggest.map((n) => (readOnly ? `<b>${esc(n)}</b>` : `<button type="button" class="link-btn" data-avl-use="${esc(n)}">${esc(n)}</button>`)).join(' หรือ ')} ?` : ''}`;
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
    if (m.state === 'none') return `"${name}" ${m.struck ? 'ถูกตัดออกจาก AVL ของโครงการนี้แล้ว' : 'ไม่ตรงกับ AVL ของโครงการนี้'}${m.suggest.length ? `\nชื่อที่ใกล้เคียงใน AVL: ${m.suggest.join(', ')}` : ''}\n\nบันทึก PO ต่อหรือไม่? ควรขอให้ลูกค้าอนุมัติผู้ขายก่อน`;
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
  PM.avlVendors = (projectId) => Array.from(new Set(liveOf(projectId).filter(isApproved).map((x) => x.vendor)));
  PM.avlWaiting = (x, T) => isLive(x) && x.status === 'submitted' && x.submittedDate && PM.diffDays(x.submittedDate, T || PM.today()) > WAIT_DAYS;

  /* summary used by the tab, the bell and the monthly report (removed rows are history, not counted) */
  PM.avlStats = (p, T) => {
    const rows = listOf(p.id), all = rows.filter(isLive), n = (fn) => all.filter(fn).length;
    const items = Array.from(new Set(rows.filter((x) => !x.removed).map((x) => PM.normName(x.item))));
    const off = PM.avlPoOff(p);
    return { total: all.length, items: items.length, approved: n(isApproved), submitted: n((x) => x.status === 'submitted'), proposed: n((x) => x.status === 'proposed'), rejected: n((x) => x.status === 'rejected'),
      waiting: n((x) => PM.avlWaiting(x, T)), noVendor: items.filter((k) => !all.some((x) => PM.normName(x.item) === k && isApproved(x))).length,
      removed: rows.filter((x) => x.removed).length, flagged: n((x) => x.addl || x.coo), addl: n((x) => x.addl), coo: n((x) => x.coo),
      off, offValue: PM.sum(off, (x) => Number(x.po.amount) || 0) };
  };

  /* a status change: keeps the dates in step (submitted → sent today · approved → approved today) */
  function setStatus(x, st) {
    const T = PM.today();
    x.status = st;
    if (st === 'proposed') { x.submittedDate = ''; x.approvedDate = ''; } else x.submittedDate = x.submittedDate || T;
    if (st === 'submitted') x.approvedDate = '';
    if (isApproved(x) || st === 'rejected') x.approvedDate = x.approvedDate || T;
  }

  /* ---------------- importing a Vendor List (rows read by avl-import.js) ---------------- */
  const FIELD_LABEL = { discipline: 'หมวดงาน', itemNo: 'เลขรายการ', itemGroup: 'หัวข้อ', item: 'รายการ', itemNote: 'ความเห็นของรายการ', vendor: 'ชื่อผู้ขาย', vendorLocation: 'ที่ตั้งผู้ขาย',
    country: 'ประเทศที่ผลิต', maker: 'ผู้ผลิต', model: 'รุ่น', remarks: 'Remarks', addl: 'เสนอเพิ่ม', coo: 'COO', removed: 'ตัดออก', removedWhy: 'เหตุที่ตัด', status: 'สถานะ' };
  const same = (a, b) => (typeof a === 'boolean' || typeof b === 'boolean' ? !!a === !!b : PM.normName(a) === PM.normName(b));
  function fieldsOf(r, x, o) {
    const remarks = [r.remarks, r.comment && `ความเห็นในไฟล์: ${r.comment}`, r.countryCut && `ตัดประเทศ ${r.countryCut}`].filter(Boolean).join(' · ');
    const f = { discipline: r.discipline || (x && x.discipline) || 'อื่น ๆ', itemNo: r.itemNo || '', itemGroup: r.group || '', item: r.item, vendor: r.vendor,
      removed: !!r.removed, removedWhy: r.removed ? r.why || 'ตัดออกในไฟล์' : '', addl: !!r.addl, coo: !!r.coo, order: Number(r.seq) || 0 };
    if (r.vendorLocation || !x) f.vendorLocation = r.vendorLocation || '';
    if (r.country || !x) f.country = r.country || '';
    if (remarks || !x) f.remarks = remarks;
    if (r.itemNote || !x) f.itemNote = r.itemNote || '';
    if (r.maker || !x) f.maker = r.maker || '';
    if (r.model || !x) f.model = r.model || '';
    const cur = x ? x.status : '';
    let status = cur || o.blankAs || 'proposed';
    if (r.approved === 'yes') status = cur === 'approved' || cur === 'conditional' ? cur : 'approved';
    else if (r.approved === 'no') status = !cur || cur === 'proposed' ? o.noAs || 'submitted' : cur; // a later approval in the app is kept
    f.status = r.vendor ? status : cur || 'proposed';
    return f;
  }
  /* what an import would do to each row read from the file: new · update (with what changes) · same · dup (twice in the file) · skip */
  PM.avlPlan = function (p, recs, o) {
    o = o || {};
    const skip = o.skip || new Set();
    const have = new Map();
    listOf(p.id).forEach((x) => { const k = keyOf(x.item, x.vendor); if (!have.has(k)) have.set(k, x); });
    const seen = new Set(), rows = [];
    recs.forEach((r, i) => {
      const k = keyOf(r.item, r.vendor);
      if (seen.has(k)) { rows.push({ r, act: 'dup' }); return; }
      seen.add(k);
      const x = have.get(k);
      if (skip.has(i) || (r.removed && o.keepOff === false && !x)) { rows.push({ r, act: 'skip' }); return; }
      const next = fieldsOf(r, x, o);
      if (!x) { rows.push({ r, act: 'new', next }); return; }
      const changes = Object.keys(next).filter((f) => f !== 'order' && !same(x[f], next[f])).map((f) => FIELD_LABEL[f] || f);
      rows.push({ r, act: changes.length ? 'update' : 'same', x, next, changes });
    });
    const missing = listOf(p.id).filter((x) => !x.removed && !seen.has(keyOf(x.item, x.vendor)));
    return { rows, missing };
  };
  PM.avlApply = function (p, plan, o) {
    o = o || {};
    const before = JSON.parse(JSON.stringify(listOf(p.id)));
    const u = PM.auth && PM.auth.user, T = PM.today();
    let added = 0, updated = 0, dropped = 0;
    plan.rows.forEach((row) => {
      if (row.act === 'new') {
        const st = row.next.status;
        const x = Object.assign({ id: PM.uid('AV'), projectId: p.id, maker: '', model: '', submittedDate: '', approvedDate: '', approvedBy: '', ref: o.source || '', note: '', files: [],
          createdBy: u ? u.id : '', createdByName: u ? PM.auth.displayName(u) : '' }, row.next, { importedAt: T });
        setStatus(x, st);
        if (st === 'approved') { x.submittedDate = ''; x.approvedDate = ''; } // approved in the client's list: the date is the list's, not today
        PM.db.avl.push(x);
        added++;
      } else if (row.act === 'update') {
        const nx = Object.assign({}, row.next), st = nx.status;
        delete nx.status;
        Object.assign(row.x, nx, { importedAt: T });
        if (st !== row.x.status) setStatus(row.x, st);
        updated++;
      }
    });
    if (o.dropMissing) plan.missing.forEach((x) => { x.removed = true; x.removedWhy = 'ไม่มีในไฟล์ AVL ฉบับล่าสุด'; dropped++; });
    PM.save();
    const notes = [];
    const skipped = plan.rows.filter((r) => r.act === 'skip').length, dups = plan.rows.filter((r) => r.act === 'dup').length;
    if (skipped) notes.push(`ไม่นำเข้า ${skipped} แถวที่เลือกไว้`);
    if (dups) notes.push(`ข้าม ${dups} แถวที่ชื่อผู้ขายซ้ำในรายการเดียวกันของไฟล์`);
    if (plan.missing.length && !o.dropMissing) notes.push(`AVL เดิม ${plan.missing.length} รายการไม่มีในไฟล์นี้ — ยังคงไว้เหมือนเดิม`);
    return { added, updated, dropped, notes, undo: () => { PM.db.avl = (PM.db.avl || []).filter((x) => x.projectId !== p.id).concat(before); PM.save(); } };
  };

  /* ---------------- the tab ---------------- */
  const dIdx = (d) => { const i = DISCIPLINES.indexOf(PM.avlDiscipline(d)); return i < 0 ? 99 : i; };
  const noNum = (s) => { const m = String(s || '').match(/^\d+(?:\.\d+)?/); return m ? Number(m[0]) : Infinity; };
  const itemKey = (x) => `${PM.normName(x.discipline)}|${PM.normName(x.item)}`;
  /* items in the order of the client's list: discipline → the place in the imported file → number → name */
  const orderOf = (rows) => Math.min(...rows.map((r) => (Number(r.order) > 0 ? Number(r.order) : Infinity)));
  const byList = (a, b) => dIdx(a.x.discipline) - dIdx(b.x.discipline) || String(a.x.discipline).localeCompare(String(b.x.discipline))
    || (Number.isFinite(a.order) && Number.isFinite(b.order) ? a.order - b.order : 0)
    || String(a.x.itemGroup || '').localeCompare(String(b.x.itemGroup || '')) || noNum(a.x.itemNo) - noNum(b.x.itemNo) || String(a.x.item).localeCompare(String(b.x.item));
  PM.avlTab = function (el, p, m, rerender) {
    const T = PM.today(), canEdit = PM.can('avl.edit');
    const s = PM.avlStats(p, T), all = listOf(p.id);
    const discs = Array.from(new Set(all.map((x) => x.discipline || 'อื่น ๆ'))).sort((a, b) => dIdx(a) - dIdx(b) || a.localeCompare(b));
    if (state.disc && !discs.includes(state.disc)) state.disc = '';
    if ((state.show === 'flag' && !s.flagged) || (state.show === 'removed' && !s.removed)) state.show = 'all';
    const SHOW = {
      all: (x) => !x.removed, approved: (x) => !x.removed && isApproved(x), pending: (x) => isLive(x) && (x.status === 'submitted' || x.status === 'proposed'),
      rejected: (x) => isLive(x) && x.status === 'rejected', flag: (x) => !x.removed && (x.addl || x.coo), removed: (x) => !!x.removed,
    };
    const show = SHOW[state.show] || SHOW.all;
    const list = all.filter((x) => show(x) && (!state.disc || (x.discipline || 'อื่น ๆ') === state.disc));
    // grouped by item, in the order of the client's list: discipline → number → name; approved vendors first, removed last
    const groups = Array.from(new Set(list.map(itemKey))).map((k) => {
      // vendors as the client listed them (imported), else approved first; removed ones last
      const rows = list.filter((x) => itemKey(x) === k).sort((a, b) => !!a.removed - !!b.removed || !hasVendor(a) - !hasVendor(b)
        || (Number(a.order) > 0 && Number(b.order) > 0 ? a.order - b.order : 0) || ORDER[a.status] - ORDER[b.status] || String(a.vendor).localeCompare(String(b.vendor)));
      const every = all.filter((x) => itemKey(x) === k);
      return { k, rows, every, order: orderOf(every), x: rows.find((r) => r.itemNo || r.itemGroup || r.itemNote) || rows[0] };
    }).sort(byList);
    const poCount = (x) => (hasVendor(x) ? (PM.db.pos || []).filter((po) => po.projectId === p.id && PM.poIsCommitted(po) && sameVendor(x, po.supplier)).length : 0);
    let lastDisc = null;
    const rowsHtml = groups.map((g) => {
      const x0 = g.x, live = g.every.filter(isLive), ok = live.filter(isApproved).length, gone = g.every.every((r) => r.removed);
      let head = '';
      if (!state.disc && x0.discipline !== lastDisc) { lastDisc = x0.discipline; head = `<tr class="avl-d" data-g="d:${esc(PM.normName(x0.discipline))}"><td colspan="7">${esc(x0.discipline || 'อื่น ๆ')}</td></tr>`; }
      const why = gone ? (g.every.find((r) => r.removedWhy) || {}).removedWhy || 'ตัดออก' : '';
      return `${head}<tr class="avl-g${gone ? ' avl-off' : ''}" data-g="${esc(g.k)}" data-d="d:${esc(PM.normName(x0.discipline))}"><td colspan="7"><b class="avl-v">${esc(x0.itemNo ? `${x0.itemNo}) ` : '')}${esc(x0.item)}</b>${x0.itemGroup ? `<small>${esc(x0.itemGroup)}</small>` : ''}
          ${gone ? U.badge('neutral', why) : ok ? U.badge('good', `อนุมัติ ${ok} ราย`) : live.length ? U.badge('warning', 'ยังไม่มีผู้ขายที่อนุมัติ') : U.badge('warning', 'ยังไม่มีผู้ขาย')}
          ${x0.itemNote ? `<small class="avl-note">💬 ${esc(x0.itemNote)}</small>` : ''}</td></tr>
        ${g.rows.map((x) => {
          const vendor = hasVendor(x);
          return `<tr class="click${PM.avlWaiting(x, T) ? ' pl-late' : ''}${x.removed ? ' avl-off' : ''}" data-avl-row="${esc(x.id)}" data-g="${esc(g.k)}" data-d="d:${esc(PM.normName(x0.discipline))}" data-q="${esc(`${x.item} ${x.itemNo || ''} ${x.vendor} ${x.vendorLocation || ''} ${x.maker || ''} ${x.model || ''} ${x.country || ''} ${x.remarks || ''}`.toLowerCase())}">
            <td>${vendor ? `<b class="avl-v">${esc(x.vendor)}</b>` : '<span class="muted">ยังไม่มีผู้ขาย</span>'}<small>${esc([x.vendorLocation, x.maker, x.model].filter(Boolean).join(' · ') || '')}</small>${PM.avlFlags(x)}</td>
            <td>${esc(x.country || '–')}</td>
            <td>${!vendor ? '–' : x.removed ? U.badge('neutral', 'ตัดออก') : canEdit ? `<select class="pi-st avl-st-${x.status}" data-avl-st="${esc(x.id)}" aria-label="สถานะ">${Object.keys(STATUS).map((k) => `<option value="${k}"${k === x.status ? ' selected' : ''}>${esc(STATUS[k].label)}</option>`).join('')}</select>` : U.badge(STATUS[x.status].level, STATUS[x.status].label)}${!x.removed && (x.status === 'rejected' || x.status === 'conditional') && x.note ? `<small class="${x.status === 'rejected' ? 'neg' : ''}">${esc(x.note)}</small>` : ''}</td>
            <td class="avl-rm">${esc(x.remarks || '')}${x.removed && x.removedWhy ? `<small class="neg">${esc(x.removedWhy)}</small>` : ''}</td>
            <td class="nowrap">${isApproved(x) || x.status === 'rejected' ? U.date(x.approvedDate) : x.submittedDate ? `<span class="muted">ส่ง ${U.date(x.submittedDate)}</span>` : '–'}${PM.avlWaiting(x, T) ? `<small class="neg">รอ ${PM.diffDays(x.submittedDate, T)} วัน</small>` : ''}<small>${esc([x.approvedBy, x.ref].filter(Boolean).join(' · '))}</small></td>
            <td class="num">${poCount(x) || '–'}</td>
            <td class="num">${(x.files || []).length ? `<button type="button" class="link-btn" data-avl-files="${esc(x.id)}">📎 ${x.files.length}</button>` : '–'}</td></tr>`;
        }).join('')}`;
    }).join('');

    el.innerHTML = `
      <div class="row">
        <p class="muted" style="margin:0">รายชื่อผู้ขาย / ผู้ผลิตที่ลูกค้าอนุมัติให้ใช้ในโครงการนี้ (Vendor List) — ใช้ตรวจก่อนออก PO</p>
        <span class="spacer"></span>
        <button class="btn" data-avl="print"${s.total ? '' : ' disabled'}>🖨 พิมพ์ AVL</button>
        ${canEdit ? '<button class="btn" data-avl="import">นำเข้าจาก PDF / Excel</button><button class="btn primary" data-avl="new">+ เพิ่มผู้ขาย</button>' : ''}
      </div>
      <div class="grid cols-4">
        ${PM.common.tile({ label: 'รายการใน AVL', value: s.items, sub: s.noVendor ? U.badge('warning', `ยังไม่มีผู้ขายที่อนุมัติ ${s.noVendor}`) : s.items ? U.badge('good', 'มีผู้ขายที่อนุมัติครบทุกรายการ') : 'ยังไม่มีรายการ', icon: 'layers' })}
        ${PM.common.tile({ label: 'ผู้ขายที่อนุมัติแล้ว', value: `${s.approved} <small>/ ${s.total}</small>`, sub: `<div class="pbar-wrap">${U.progress(s.total ? s.approved / s.total : 0, null)}<span class="num">${U.pct(s.total ? s.approved / s.total : null)}</span></div>`, icon: 'check' })}
        ${PM.common.tile({ label: 'รอลูกค้าอนุมัติ', value: s.submitted, sub: s.waiting ? U.badge('warning', `รอเกิน ${WAIT_DAYS} วัน ${s.waiting}`) : s.proposed ? `ยังไม่ส่ง ${s.proposed}` : s.addl ? `เสนอเพิ่ม ${s.addl} ราย` : 'ไม่มีรายการรอนาน', icon: 'clock' })}
        ${PM.common.tile({ label: 'PO นอก AVL', value: s.total ? s.off.length : '–', sub: !s.total ? 'เริ่มตรวจเมื่อมี AVL' : s.off.length ? U.badge('warning', `มูลค่า ${U.money(s.offValue)}`) : U.badge('good', 'PO ทุกใบอยู่ใน AVL'), icon: 'truck' })}
      </div>
      ${s.off.length ? `<div class="card"><div class="card-h"><h2>PO ที่ผู้ขายยังไม่อยู่ใน AVL</h2>${U.badge('warning', `${s.off.length} ใบ`)}<p>ตรวจเฉพาะ PO หมวด Material · Equipment · Subcontract ที่ออกแล้ว${canEdit ? ' · เพิ่มผู้ขายเข้า AVL แล้วส่งลูกค้าอนุมัติ' : ''}</p></div>
        <div class="card-b flush table-wrap"><table class="tbl"><thead><tr><th>PO</th><th>ผู้ขาย</th><th class="num">มูลค่า</th><th>AVL</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>
          ${s.off.map(({ po, check }) => `<tr><td><b>${esc(po.poNo)}</b><small>${esc(po.description || '')}</small></td><td>${esc(po.supplier)}</td><td class="num">${U.money(po.amount)}</td><td>${U.badge(CHECK[check].level, CHECK[check].badge)}</td>
            ${canEdit ? `<td class="num">${check === 'none' ? `<button type="button" class="btn sm" data-avl="from-po" data-id="${esc(po.id)}">+ เพิ่มเข้า AVL</button>` : ''}</td>` : ''}</tr>`).join('')}
        </tbody></table></div></div>` : ''}
      <div class="card"><div class="card-h"><h2>AVL — ${esc(p.code)}</h2><span class="spacer"></span>
          <input type="search" id="avl-q" class="avl-q" placeholder="ค้นหารายการ / ผู้ขาย / ประเทศ" aria-label="ค้นหาใน AVL" value="${esc(state.q)}">
          ${discs.length > 1 ? `<select id="avl-disc" aria-label="กรองตามหมวดงาน">${U.options([{ value: '', label: 'ทุกหมวดงาน' }].concat(discs.map((d) => ({ value: d, label: d }))), state.disc)}</select>` : ''}
          ${PM.common.seg('avlshow', [{ key: 'all', label: `ทั้งหมด (${s.total})` }, { key: 'approved', label: `อนุมัติ (${s.approved})` }, { key: 'pending', label: `รออนุมัติ (${s.submitted + s.proposed})` }, { key: 'rejected', label: `ไม่อนุมัติ (${s.rejected})` }]
            .concat(s.flagged ? [{ key: 'flag', label: `เสนอเพิ่ม / COO (${s.flagged})` }] : [], s.removed ? [{ key: 'removed', label: `ตัดออก (${s.removed})` }] : []), state.show)}
          <p>จัดเรียงแบบ Vendor List ของลูกค้า: หมวดงาน → รายการ → ผู้ขาย · เปลี่ยนสถานะได้จากตาราง · คลิกแถวเพื่อแก้ไข / แนบหนังสืออนุมัติ</p></div>
        <div class="card-b flush table-wrap">${groups.length ? `<table class="tbl avl-table"><thead><tr><th>ผู้ขาย / ที่ตั้ง</th><th>ประเทศที่ผลิต</th><th>สถานะ (Client AVL)</th><th>Remarks</th><th>อนุมัติเมื่อ / อ้างอิง</th><th class="num">PO</th><th class="num">ไฟล์</th></tr></thead><tbody>
          ${rowsHtml}
          </tbody></table><p class="empty" id="avl-none" hidden>ไม่พบรายการที่ตรงกับคำค้นหา</p>` : `<p class="empty">${all.length ? 'ไม่มีรายการในมุมมองนี้' : `ยังไม่มี AVL ของโครงการนี้${canEdit ? ' — กด "นำเข้าจาก PDF / Excel" แล้วเลือกไฟล์ Vendor List ของลูกค้า (หรือลากไฟล์มาวางที่หน้านี้) หรือ "+ เพิ่มผู้ขาย"' : ''}`}</p>`}</div></div>`;

    /* search filters the rows on the page, so the box keeps its focus while typing */
    const applyQ = () => {
      const t = String(state.q || '').trim().toLowerCase();
      let shown = 0;
      const open = new Set(), openD = new Set();
      el.querySelectorAll('.avl-table tr[data-q]').forEach((tr) => { const on = !t || tr.dataset.q.includes(t); tr.hidden = !on; if (on) { shown++; open.add(tr.dataset.g); openD.add(tr.dataset.d); } });
      el.querySelectorAll('.avl-table tr.avl-g').forEach((tr) => { tr.hidden = !!t && !open.has(tr.dataset.g); if (!tr.hidden) openD.add(tr.dataset.d); });
      el.querySelectorAll('.avl-table tr.avl-d').forEach((tr) => { tr.hidden = !openD.has(tr.dataset.g); });
      const tb = el.querySelector('.avl-table'), none = el.querySelector('#avl-none');
      if (tb) { const any = shown || !t; tb.hidden = !any; none.hidden = !!any; }
    };
    applyQ();
    if (canEdit && PM.sheetImport && PM.avlImport) PM.sheetImport.dropOn(el, (file) => PM.avlImport.open(p, rerender, file));
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
        if (act === 'import') PM.avlImport.open(p, rerender);
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
  const check = (name, on, label, hint) => `<label class="avl-chk"><input type="checkbox" name="${name}"${on ? ' checked' : ''}><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span></label>`;

  function avlForm(p, item, done, preset) {
    const canEdit = PM.can('avl.edit');
    const u = PM.auth && PM.auth.user;
    const x = item || Object.assign({ id: PM.uid('AV'), projectId: p.id, discipline: DISCIPLINES[0], itemNo: '', itemGroup: '', item: '', itemNote: '', vendor: '', vendorLocation: '', maker: '', model: '', country: 'Thailand',
      status: 'proposed', submittedDate: '', approvedDate: '', approvedBy: '', ref: '', note: '', remarks: '', addl: false, coo: false, removed: false, removedWhy: '', files: [] }, preset);
    const discOpts = DISCIPLINES.includes(x.discipline) || !x.discipline ? DISCIPLINES : DISCIPLINES.concat(x.discipline);
    const form = U.modal({
      title: item ? `${x.vendor || 'ยังไม่มีผู้ขาย'} · ${x.item}` : `เพิ่มผู้ขายใน AVL — ${p.code}`, wide: true,
      onDelete: item && canEdit ? () => {
        PM.poFiles.trash(`${p.id}/avl/${x.id}`, (x.files || []).map((f) => f.path));
        PM.remove('avl', x.id); U.toast('ลบแล้ว'); done();
      } : null,
      body: `
        ${dataList('avl-items', itemNames(p))}${dataList('avl-vendors', vendorNames())}
        ${U.field('หมวดงาน (Discipline)', 'discipline', x.discipline, { options: discOpts })}
        ${U.field('เลขรายการ', 'itemNo', x.itemNo || '', { placeholder: 'เช่น 49' })}
        ${U.field('รายการ (REQ Description)', 'item', x.item, { required: true, full: true, placeholder: 'เช่น Custody Meter (Metering Skid) · Control Valve · Transformer' })}
        ${U.field('ผู้ขาย / ผู้รับเหมา (Vendor Name)', 'vendor', x.vendor, { required: !item || hasVendor(item), placeholder: item && !hasVendor(item) ? 'รายการนี้ยังไม่มีผู้ขาย — พิมพ์ชื่อเพื่อเพิ่ม' : 'พิมพ์หรือเลือกจากรายชื่อ' })}
        ${U.field('ที่ตั้งผู้ขาย (Vendor Location)', 'vendorLocation', x.vendorLocation || '', { placeholder: 'เช่น Thailand' })}
        ${U.field('ประเทศที่ผลิต (Manufacturing Location)', 'country', x.country)}
        ${U.field('ผู้ผลิต / ยี่ห้อ', 'maker', x.maker)}
        ${U.field('รุ่น / มาตรฐาน', 'model', x.model, { placeholder: 'เช่น IEC 60076' })}
        ${U.field('สถานะ (Client Approved Vendor)', 'status', x.status, { options: Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k].label })) })}
        <div class="full avl-chks">
          ${check('addl', x.addl, 'Proposed Additional Vendor (เสนอเพิ่ม)', 'ผู้ขายที่เราเสนอเพิ่มจากรายชื่อเดิมของลูกค้า')}
          ${check('coo', x.coo, 'COO Deviation', 'ประเทศผู้ผลิตต่างจากที่ลูกค้ากำหนด')}
          ${check('removed', x.removed, 'ตัดออกจาก AVL (ขีดฆ่า)', 'ไม่นับเป็นผู้ขายที่ใช้ได้ · เก็บไว้เป็นประวัติ')}
        </div>
        ${U.field('Remarks (ตามไฟล์ของลูกค้า)', 'remarks', x.remarks || '', { full: true, placeholder: 'เช่น This is from TAB AVL' })}
        ${U.field('วันที่ส่งขออนุมัติ', 'submittedDate', x.submittedDate, { type: 'date' })}
        ${U.field('วันที่ลูกค้าตอบ', 'approvedDate', x.approvedDate, { type: 'date' })}
        ${U.field('ผู้อนุมัติ', 'approvedBy', x.approvedBy, { placeholder: 'ชื่อ / หน่วยงานลูกค้า' })}
        ${U.field('เอกสารอ้างอิง', 'ref', x.ref, { placeholder: 'เช่น เลข Transmittal · Annex H Vendor List' })}
        ${U.field('เงื่อนไข / หมายเหตุภายใน', 'note', x.note, { type: 'textarea', rows: 2, full: true })}
        ${PM.poFiles.boxHtml(canEdit, 'เอกสารประกอบ', 'หนังสืออนุมัติ · Vendor profile · แคตตาล็อก', 'avl')}`,
      onSubmit: !canEdit ? null : (f, frm) => {
        if (listOf(p.id).some((i) => i.id !== x.id && keyOf(i.item, i.vendor) === keyOf(f.item, f.vendor))) { U.alert(`${f.vendor} มีอยู่ในรายการ "${f.item}" แล้ว`); return false; }
        (async () => {
          const btn = frm.querySelector('[type=submit]'); btn.disabled = true; btn.classList.add('loading');
          const r = await files.commit(`${p.id}/avl/${x.id}`, btn);
          const st = f.status; delete f.status;
          Object.assign(x, f, { files: r.files, removedWhy: f.removed ? x.removedWhy || 'ตัดออกเอง' : '' });
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

  /* ---------------- printed AVL (A4 landscape) — to send to the client for approval ---------------- */
  PM.avlPrint = function (p) {
    const P = PM.printDoc, win = P.open();
    if (!win) return;
    const T = PM.today(), s = PM.avlStats(p, T);
    const live = listOf(p.id).filter((x) => !x.removed);
    const groups = Array.from(new Set(live.map(itemKey))).map((k) => { const rs = live.filter((x) => itemKey(x) === k); return { k, x: rs[0], order: orderOf(rs), rows: rs.sort((a, b) => !hasVendor(a) - !hasVendor(b) || ORDER[a.status] - ORDER[b.status] || (Number(a.order) || 0) - (Number(b.order) || 0)) }; }).sort(byList);
    const rows = [].concat(...groups.map((g) => g.rows));
    let n = 0, last = '';
    const flags = (x) => [x.addl ? 'Proposed Additional' : '', x.coo ? 'COO Deviation' : ''].filter(Boolean).join(' · ');
    P.write(win, {
      title: `AVL ${p.code} ${T}`, bar: `AVL — ${p.code}`, doc: 'avl',
      head: {
        title: `<h1>รายชื่อผู้ขายที่ได้รับอนุมัติ</h1><p><b>Approved Vendor List (AVL)</b></p><p>${esc(p.code)} · ${esc(p.name)} · ลูกค้า ${esc(p.client || '–')}</p>`,
        meta: `${esc(PM.COMPANY)}<br>ข้อมูล ณ ${U.date(T)}<br>อนุมัติ ${s.approved} จาก ${s.total} ราย`,
      },
      body: `<style>@page { size: A4 landscape; } main { max-width: 275mm; }</style>
  <section class="flow">${P.tbl([{ t: 'ลำดับ', r: 1 }, { t: 'REQ Description' }, { t: 'Discipline' }, { t: 'Vendor Name / Location' }, { t: 'Manufacturing Location' }, { t: 'Client AVL' }, { t: 'สถานะ' }, { t: 'Remarks' }, { t: 'วันที่ตอบ / อ้างอิง' }],
    rows.map((x) => {
      const key = itemKey(x), first = key !== last;
      last = key;
      if (first) n++;
      return [first ? String(n) : '', first ? `<b>${esc(x.itemNo ? `${x.itemNo}) ` : '')}${esc(x.item)}</b>${x.itemGroup ? `<small>${esc(x.itemGroup)}</small>` : ''}` : '', first ? esc(x.discipline || '') : '',
        `${esc(x.vendor || '–')}${x.vendorLocation ? `<small>${esc(x.vendorLocation)}</small>` : ''}${x.maker || x.model ? `<small>${esc([x.maker, x.model].filter(Boolean).join(' · '))}</small>` : ''}`, esc(x.country || '–'),
        !hasVendor(x) ? '–' : isApproved(x) ? 'Yes' : 'No',
        hasVendor(x) ? `${esc(STATUS[x.status].label)}${x.note && x.status !== 'approved' ? `<small>${esc(x.note)}</small>` : ''}` : '–',
        `${esc(x.remarks || '')}${flags(x) ? `<small>${esc(flags(x))}</small>` : ''}`,
        `${isApproved(x) || x.status === 'rejected' ? U.date(x.approvedDate) : '–'}${x.ref ? `<small>${esc(x.ref)}</small>` : ''}`];
    }), 'ยังไม่มีรายการ')}</section>
  <div class="sign"><div>จัดทำโดย</div><div>ผู้จัดการโครงการ</div><div>ลูกค้าอนุมัติ</div></div>`,
    });
  };

  /* demo data: what each project buys, mostly approved — one vendor left off some projects so "PO นอก AVL" shows */
  PM.buildSampleAvl = function (projects, T) {
    const ITEMS = [
      ['Main equipment package', 'Package / แพ็กเกจ', [['EastPower Equipment Co., Ltd.', 'EastPower', 'IEC 60076', 'Thailand'], ['Delta Solar Parts Co., Ltd.', 'Delta', '', 'Taiwan']]],
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
          out.push({ id: `AV-${p.id}-${ii + 1}-${vi + 1}`, projectId: p.id, itemNo: String(ii + 1), item, discipline, vendor, vendorLocation: '', maker, model, country, status, submittedDate: sent,
            approvedDate: status === 'submitted' ? '' : PM.min(T, PM.addDays(sent, 12)), approvedBy: status === 'submitted' ? '' : 'ฝ่ายวิศวกรรมลูกค้า', ref: `TR-${p.code.replace(/^PJ-/, '')}-${String(ii + 1).padStart(3, '0')}`,
            note: status === 'conditional' ? 'ต้องส่ง Type test report ก่อนสั่งผลิต' : status === 'rejected' ? 'ไม่ผ่านการประเมินผลงานอ้างอิง' : '', remarks: '', addl: second && status === 'submitted', coo: false, removed: false,
            files: [], createdBy: '', createdByName: 'Document Control' });
        });
      });
    });
    return out;
  };
})();
