/* pos.js — Purchase Orders: per-project POs with file attachments (Supabase Storage), tracking and summaries */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  const BUCKET = 'po-files';
  const MAX_MB = 20;
  const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.docx,.doc,.csv,.zip';

  /* ---------- file storage ---------- */
  const F = (PM.poFiles = {});
  const storage = () => { const c = PM.auth && PM.auth.client; return c && c.storage ? c.storage.from(BUCKET) : null; };
  F.available = () => !!storage();
  const storageError = (e) => {
    const m = (e && e.message) || String(e || '');
    if (/bucket not found|not found/i.test(m)) return 'ยังไม่ได้ตั้งค่าที่เก็บไฟล์ — ให้ Admin รัน supabase/data.sql อีกครั้ง';
    if (/row-level security|unauthorized|not authorized|permission/i.test(m)) return 'ไม่มีสิทธิ์จัดการไฟล์นี้';
    if (/mime|type/i.test(m)) return 'ไม่รองรับไฟล์ชนิดนี้ (รองรับ PDF, รูปภาพ, Excel, Word, CSV, ZIP)';
    if (/size|too large|exceed/i.test(m)) return `ไฟล์ใหญ่เกิน ${MAX_MB} MB`;
    return m;
  };
  /* prefix = folder inside the bucket, e.g. "<projectId>/<poId>" or "bids/<bidId>" */
  F.upload = async function (prefix, file) {
    const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'file';
    const path = `${prefix}/${Date.now()}-${safe}`;
    const { error } = await storage().upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) throw new Error(storageError(error));
    const u = PM.auth.user;
    return { path, name: file.name, size: file.size, type: file.type, uploadedAt: new Date().toISOString(), uploadedBy: u ? u.id : '', uploadedByName: u ? PM.auth.displayName(u) : '' };
  };
  F.open = async function (path) {
    const win = window.open('', '_blank'); // opened now so pop-up blockers allow it
    try {
      const { data, error } = await storage().createSignedUrl(path, 120);
      if (error) throw error;
      if (win) win.location = data.signedUrl; else location.href = data.signedUrl;
    } catch (e) {
      if (win) win.close();
      alert('เปิดไฟล์ไม่ได้: ' + storageError(e));
    }
  };
  F.remove = async function (paths) {
    if (!paths.length || !storage()) return;
    const { error } = await storage().remove(paths);
    if (error) throw new Error(storageError(error));
  };
  const fileSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const fileIcon = (name) => { const x = (name.split('.').pop() || '').toLowerCase(); return { pdf: 'PDF', xlsx: 'XLS', xls: 'XLS', csv: 'CSV', docx: 'DOC', doc: 'DOC', zip: 'ZIP' }[x] || 'IMG'; };

  /* ---------- attachment box (PO form, bid / inquiry form) ----------
     F.boxHtml() goes into the form body; F.box() wires it up. Files picked are uploaded when the
     form is saved (commit), files removed are deleted from Storage then. */
  F.boxHtml = (canEdit, title, hint) => `
    <div class="full po-files" data-files>
      <div class="po-files-h"><b>${esc(title || 'ไฟล์แนบ')}</b><small class="muted">${esc(hint ? hint + ' · ' : '')}PDF, รูปภาพ, Excel, Word, CSV, ZIP · ไม่เกิน ${MAX_MB} MB ต่อไฟล์</small></div>
      <ul class="po-file-list" id="po-file-list"></ul>
      ${canEdit ? (F.available()
        ? `<label class="btn sm po-attach"><input type="file" id="po-file-input" multiple accept="${ACCEPT}" hidden>📎 แนบไฟล์</label>`
        : '<p class="perm-note">แนบไฟล์ได้เมื่อเชื่อมต่อ Cloud (Supabase)</p>') : ''}
    </div>`;
  F.box = function (form, files, canEdit) {
    const keep = (files || []).slice(); // files that stay
    const removed = [];                 // files marked for deletion
    const pending = [];                 // new File objects to upload on save
    const root = form.querySelector('[data-files]');
    const listEl = root.querySelector('.po-file-list');
    const draw = () => {
      listEl.innerHTML = keep.map((f, i) => `<li>
          <span class="fi">${fileIcon(f.name)}</span>
          <button type="button" class="link-btn" data-open="${i}" title="เปิด / ดาวน์โหลด">${esc(f.name)}</button>
          <small class="muted">${fileSize(f.size || 0)}${f.uploadedByName ? ' · ' + esc(f.uploadedByName) : ''}${f.uploadedAt ? ' · ' + U.date(f.uploadedAt.slice(0, 10)) : ''}</small>
          ${canEdit ? `<button type="button" class="icon-btn" data-drop="${i}" aria-label="ลบไฟล์">✕</button>` : ''}</li>`).join('') +
        pending.map((f, i) => `<li class="pending">
          <span class="fi">${fileIcon(f.name)}</span><span>${esc(f.name)}</span>
          <small class="muted">${fileSize(f.size)} · รออัปโหลดเมื่อกดบันทึก</small>
          <button type="button" class="icon-btn" data-unqueue="${i}" aria-label="เอาออก">✕</button></li>`).join('') ||
        '<li class="muted empty-files">ยังไม่มีไฟล์แนบ</li>';
    };
    draw();
    listEl.addEventListener('click', (e) => {
      const o = e.target.closest('[data-open]'), d = e.target.closest('[data-drop]'), q = e.target.closest('[data-unqueue]');
      if (o) F.open(keep[+o.dataset.open].path);
      if (d && confirm('ลบไฟล์นี้? (ลบจริงเมื่อกดบันทึก)')) { removed.push(keep.splice(+d.dataset.drop, 1)[0]); draw(); }
      if (q) { pending.splice(+q.dataset.unqueue, 1); draw(); }
    });
    const input = root.querySelector('input[type=file]');
    if (input) input.addEventListener('change', () => {
      Array.from(input.files).forEach((f) => {
        if (f.size > MAX_MB * 1048576) { alert(`${f.name} ใหญ่เกิน ${MAX_MB} MB`); return; }
        pending.push(f);
      });
      input.value = '';
      draw();
    });
    return {
      /* upload new files into `prefix`, delete removed ones → { files, problems } */
      async commit(prefix, btn) {
        const problems = [];
        for (const file of pending.splice(0)) {
          try { if (btn) btn.textContent = `กำลังอัปโหลด ${file.name}…`; keep.push(await F.upload(prefix, file)); }
          catch (err) { problems.push(`${file.name}: ${err.message}`); }
        }
        const gone = removed.splice(0);
        try { await F.remove(gone.map((r) => r.path)); } catch (err) { problems.push('ลบไฟล์: ' + err.message); keep.push(...gone); }
        return { files: keep.slice(), problems };
      },
    };
  };
  /* read-only list of attachments (e.g. the 📎 on a bid card) */
  F.showList = function (title, files) {
    U.modal({
      title,
      body: `<ul class="po-file-list full">${(files || []).map((f, i) => `<li><span class="fi">${fileIcon(f.name)}</span>
        <button type="button" class="link-btn" data-open="${i}" title="เปิด / ดาวน์โหลด">${esc(f.name)}</button>
        <small class="muted">${fileSize(f.size || 0)}${f.uploadedByName ? ' · ' + esc(f.uploadedByName) : ''}${f.uploadedAt ? ' · ' + U.date(f.uploadedAt.slice(0, 10)) : ''}</small></li>`).join('') || '<li class="muted empty-files">ยังไม่มีไฟล์แนบ</li>'}</ul>`,
    }).addEventListener('click', (e) => { const o = e.target.closest('[data-open]'); if (o) F.open(files[+o.dataset.open].path); });
  };
  F.clip = (files, attrs) => ((files || []).length
    ? `<button type="button" class="po-clip link-btn" ${attrs || ''} title="${esc(files.map((f) => f.name).join('\n'))}">📎 ${files.length}</button>` : '');

  /* ---------- helpers ---------- */
  const projLabel = (id) => { const p = PM.find('projects', id); return p ? p.code : '–'; };
  PM.nextPoNo = function (projectId) {
    const p = PM.find('projects', projectId);
    const short = p ? p.code.replace(/^PJ-/, '').replace('-PROJ-', '-') : 'X';
    const re = new RegExp('^PO-' + short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-(\\d+)$');
    const max = PM.db.pos.reduce((m, x) => { const hit = String(x.poNo || '').match(re); return hit ? Math.max(m, +hit[1]) : m; }, 0);
    return `PO-${short}-${String(max + 1).padStart(3, '0')}`;
  };
  const dueBadge = (po, T) => {
    const late = PM.poDaysLate(po, T);
    if (late) return U.badge('critical', `เลยกำหนด ${late} วัน`);
    if (PM.poIsOpen(po) && po.deliveryDue && PM.diffDays(T, po.deliveryDue) <= 7) return U.badge('warning', `อีก ${PM.diffDays(T, po.deliveryDue)} วัน`);
    return '';
  };

  /* ---------- table (used by the PO page, the project tab and the dashboard) ---------- */
  PM.poTable = function (list, opt = {}) {
    const T = PM.today();
    const canEdit = PM.can('po.edit');
    if (!list.length) return `<p class="empty">${opt.empty || 'ยังไม่มี PO'}</p>`;
    if (opt.compact) { // narrow cards (Dashboard): PO + supplier, project, amount, due, status
      return `<table class="tbl po-table"><thead><tr><th>PO / Supplier</th><th>Project</th><th class="num">มูลค่า</th><th>กำหนดส่ง</th><th>สถานะ</th></tr></thead><tbody>
        ${list.map((po) => `<tr class="click" data-po="${esc(po.id)}">
          <td><span class="title nowrap">${esc(po.poNo)}</span><small>${esc(po.supplier)}</small></td>
          <td class="nowrap">${esc(projLabel(po.projectId))}</td>
          <td class="num">${U.money(po.amount)}</td>
          <td class="nowrap">${U.date(po.deliveryDue)}<small>${dueBadge(po, T) || '–'}</small></td>
          <td>${U.badge(PM.poStatus(po.status).level, PM.poStatus(po.status).th)}</td></tr>`).join('')}
        </tbody></table>`;
    }
    return `<table class="tbl po-table"><thead><tr>
      <th>PO</th>${opt.showProject ? '<th>Project</th>' : ''}<th>Supplier</th><th class="num">มูลค่า</th><th class="num">จ่ายแล้ว</th>
      <th>วันที่ PO</th><th>กำหนดส่ง</th><th>สถานะ</th><th class="num">ไฟล์</th></tr></thead><tbody>
      ${list.map((po) => {
        const s = PM.poStatus(po.status);
        const paidPct = po.amount ? (po.paidAmount || 0) / po.amount : null;
        return `<tr class="click" data-po="${esc(po.id)}">
          <td><span class="title">${esc(po.poNo)}</span><small>${esc(po.description)} · ${esc(po.category)}</small></td>
          ${opt.showProject ? `<td>${esc(projLabel(po.projectId))}</td>` : ''}
          <td>${esc(po.supplier)}</td>
          <td class="num">${U.money(po.amount)}</td>
          <td class="num">${U.money(po.paidAmount || 0)}<small>${U.pct(paidPct)}</small></td>
          <td>${U.date(po.poDate)}</td>
          <td>${U.date(po.deliveryDue)} ${dueBadge(po, T)}${po.deliveredDate ? `<small>ส่งครบ ${U.date(po.deliveredDate)}</small>` : ''}</td>
          <td>${canEdit && !opt.readOnly
            ? `<select class="plan-st po-st st-${esc(po.status)}" data-po-status="${esc(po.id)}" aria-label="สถานะ PO">${PM.PO_STATUS.map((x) => `<option value="${x.key}"${x.key === po.status ? ' selected' : ''}>${esc(x.th)}</option>`).join('')}</select>`
            : U.badge(s.level, s.th)}</td>
          <td class="num">${(po.files || []).length ? `<span class="po-clip" title="${esc(po.files.map((f) => f.name).join('\n'))}">📎 ${po.files.length}</span>` : '–'}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
  };

  /* quick status change from a table; returns true when handled */
  PM.poHandleChange = function (e, done) {
    const sel = e.target.closest && e.target.closest('select[data-po-status]');
    if (!sel || !PM.can('po.edit')) return false;
    const po = PM.find('pos', sel.dataset.poStatus);
    if (!po) return true;
    po.status = sel.value;
    if ((po.status === 'delivered' || po.status === 'closed') && !po.deliveredDate) po.deliveredDate = PM.today();
    if (po.status === 'closed') po.paidAmount = po.amount;
    PM.upsert('pos', po);
    U.toast(`${po.poNo} → ${PM.poStatus(po.status).th}`);
    done();
    return true;
  };

  /* ---------- summary tiles ---------- */
  PM.poTiles = function (st) {
    return `<div class="grid cols-5">
      ${V.tile({ label: 'PO ทั้งหมด', value: st.total, sub: `${st.open} ยังไม่ส่งครบ · ${st.delivered} ส่งครบ` })}
      ${V.tile({ label: 'มูลค่า PO', tag: 'Committed', value: U.money(st.value), sub: 'ไม่รวมร่าง / ยกเลิก' })}
      ${V.tile({ label: 'จ่ายแล้ว', value: U.pct(st.paidPct), sub: `${U.money(st.paid)} จาก ${U.money(st.value)}` })}
      ${V.tile({ label: 'เลยกำหนดส่ง', value: st.late.length, sub: st.late.length ? U.badge('critical', U.money(st.lateValue)) : U.badge('good', 'ไม่มี') })}
      ${V.tile({ label: 'ส่งภายใน 14 วัน', value: st.soon.length, sub: `${st.files} ไฟล์แนบ` })}
    </div>`;
  };

  /* ---------- form ---------- */
  PM.poForm = function (po, projectId, done) {
    const isNew = !po;
    const canEdit = PM.can('po.edit');
    const T = PM.today();
    const projects = PM.db.projects.filter((p) => p.status !== 'closed' || p.id === (po ? po.projectId : projectId));
    const pid = po ? po.projectId : projectId || (projects[0] && projects[0].id);
    if (!pid) { alert('ยังไม่มีโครงการ — สร้างโครงการก่อน'); return; }
    const x = po || {
      id: PM.uid('PO'), projectId: pid, poNo: PM.nextPoNo(pid), supplier: '', description: '', category: 'Material', phase: 'procurement',
      amount: 0, poDate: T, deliveryDue: PM.addDays(T, 30), deliveredDate: '', status: 'issued', paidAmount: 0, note: '', files: [],
    };
    const form = U.modal({
      title: isNew ? 'New PO' : `${x.poNo} · ${x.supplier}`, wide: true, submitLabel: canEdit ? 'บันทึก PO' : undefined,
      onSubmit: canEdit ? () => false : null, // saving is async (uploads) — handled below
      onDelete: !isNew && canEdit ? async () => {
        try { await F.remove((x.files || []).map((f) => f.path)); } catch (e) { /* files may already be gone */ }
        PM.remove('pos', x.id); U.toast('ลบ PO แล้ว'); done();
      } : null,
      body: `
        ${U.field('PO No.', 'poNo', x.poNo, { required: true })}
        ${projectId || !isNew ? `<label><span>Project</span><input value="${esc(projLabel(x.projectId))}" disabled></label>` : U.field('Project', 'projectId', x.projectId, { options: projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })) })}
        ${U.field('Supplier / ผู้ขาย', 'supplier', x.supplier, { required: true })}
        ${U.field('หมวด', 'category', x.category, { options: PM.PO_CATEGORIES })}
        ${U.field('รายการ / Description', 'description', x.description, { required: true, full: true })}
        ${U.field('มูลค่า PO (THB)', 'amount', x.amount, { type: 'number', min: 0, step: 'any', required: true })}
        ${U.field('จ่ายแล้ว (THB)', 'paidAmount', x.paidAmount, { type: 'number', min: 0, step: 'any' })}
        ${U.field('วันที่ออก PO', 'poDate', x.poDate, { type: 'date', required: true })}
        ${U.field('กำหนดส่งของ', 'deliveryDue', x.deliveryDue, { type: 'date' })}
        ${U.field('สถานะ', 'status', x.status, { options: PM.PO_STATUS.map((s) => ({ value: s.key, label: `${s.th} (${s.label})` })) })}
        ${U.field('วันที่ส่งของครบ', 'deliveredDate', x.deliveredDate, { type: 'date' })}
        ${U.field('หมายเหตุ', 'note', x.note, { type: 'textarea', full: true, rows: 2 })}
        ${F.boxHtml(canEdit, 'ไฟล์แนบ')}`,
    });
    const files = F.box(form, x.files, canEdit);

    if (!canEdit) { // view only — files can still be opened
      form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
      return;
    }
    const projSel = form.querySelector('select[name="projectId"]');
    if (projSel && isNew) projSel.addEventListener('change', () => { form.poNo.value = PM.nextPoNo(projSel.value); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) return;
      const f = U.formData(form);
      if (PM.db.pos.some((y) => y.id !== x.id && String(y.poNo).toUpperCase() === f.poNo.toUpperCase())) { alert(`PO No. ${f.poNo} ถูกใช้แล้ว`); return; }
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true; btn.classList.add('loading');
      Object.assign(x, {
        poNo: f.poNo, supplier: f.supplier, category: f.category, description: f.description,
        amount: f.amount, paidAmount: f.paidAmount, poDate: f.poDate, deliveryDue: f.deliveryDue,
        status: f.status, deliveredDate: f.deliveredDate, note: f.note,
      });
      if (f.projectId) x.projectId = f.projectId;
      if ((x.status === 'delivered' || x.status === 'closed') && !x.deliveredDate) x.deliveredDate = T;
      if (isNew) { const u = PM.auth.user; x.createdBy = u ? u.id : ''; x.createdByName = u ? PM.auth.displayName(u) : ''; }
      const { files: kept, problems } = await files.commit(`${x.projectId}/${x.id}`, btn);
      x.files = kept;
      PM.upsert('pos', x);
      U.closeModal();
      U.toast(problems.length ? 'บันทึก PO แล้ว แต่ไฟล์บางไฟล์มีปัญหา' : 'บันทึก PO แล้ว');
      if (problems.length) alert('ไฟล์ที่ไม่สำเร็จ:\n' + problems.join('\n'));
      done();
    });
  };

  /* ---------- Purchase Orders page ---------- */
  const state = U.keep('pos', { project: '', status: 'open', q: '' }, ['project', 'status']);
  const FILTERS = [
    { key: 'open', label: 'ยังไม่ส่งครบ' }, { key: 'late', label: 'เลยกำหนด' }, { key: 'done', label: 'ส่งครบ / ปิด' }, { key: 'all', label: 'ทั้งหมด' },
  ];
  PM.views.pos = function (el) {
    const db = PM.db, T = PM.today();
    const canEdit = PM.can('po.edit');
    if (state.project && !PM.find('projects', state.project)) state.project = '';
    const q = state.q.toLowerCase();
    const inProject = db.pos.filter((po) => !state.project || po.projectId === state.project);
    const list = inProject.filter((po) => {
      if (state.status === 'open' && !PM.poIsOpen(po) && po.status !== 'draft') return false;
      if (state.status === 'late' && !PM.poDaysLate(po, T)) return false;
      if (state.status === 'done' && !['delivered', 'closed'].includes(po.status)) return false;
      return !q || [po.poNo, po.supplier, po.description].join(' ').toLowerCase().includes(q);
    }).sort((a, b) => (PM.poDaysLate(b, T) - PM.poDaysLate(a, T)) || String(a.deliveryDue).localeCompare(String(b.deliveryDue)));
    const st = PM.poStats(inProject, T);

    el.innerHTML = `
      <div class="row">
        <select id="po-project" aria-label="Project">${U.options(db.projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })), state.project, 'ทุกโครงการ')}</select>
        ${V.seg('status', FILTERS, state.status)}
        <input type="search" id="po-q" placeholder="ค้นหา PO / ผู้ขาย / รายการ…" value="${esc(state.q)}" style="width:230px">
        <span class="spacer"></span>
        ${canEdit ? '<button class="btn primary fab" data-action="new-po" aria-label="New PO"><span class="fab-i">+</span><span class="fab-t">New PO</span></button>' : ''}
      </div>
      ${PM.poTiles(st)}
      <div class="card">
        <div class="card-h"><h2>Purchase Orders</h2><p>คลิกที่ PO เพื่อดูรายละเอียดและไฟล์แนบ${canEdit ? ' · เปลี่ยนสถานะได้จากตาราง' : ''}</p></div>
        <div class="card-b flush table-wrap">${PM.poTable(list, { showProject: !state.project, empty: 'ไม่มี PO ในมุมมองนี้' })}</div>
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>มูลค่า PO ตามสถานะ</h2></div><div class="card-b"><div class="chart" id="c-po-status"></div></div></div>
        <div class="card"><div class="card-h"><h2>มูลค่า PO ตามผู้ขาย</h2><p>8 อันดับแรก</p></div><div class="card-b"><div class="chart" id="c-po-supplier"></div></div></div>
      </div>`;

    const byStatus = PM.PO_STATUS.map((s) => ({ s, list: inProject.filter((po) => po.status === s.key) })).filter((x) => x.list.length);
    PM.charts.hbars(document.getElementById('c-po-status'), {
      items: byStatus.map((x) => ({ label: x.s.th, sub: `${x.list.length} PO`, value: PM.sum(x.list, (po) => po.amount || 0), display: U.money(PM.sum(x.list, (po) => po.amount || 0)) })),
    });
    const sup = {};
    inProject.filter(PM.poIsCommitted).forEach((po) => { sup[po.supplier] = (sup[po.supplier] || 0) + (po.amount || 0); });
    PM.charts.hbars(document.getElementById('c-po-supplier'), {
      items: Object.keys(sup).sort((a, b) => sup[b] - sup[a]).slice(0, 8).map((k) => ({ label: k, value: sup[k], display: U.money(sup[k]), color: 'var(--s2)' })),
    });

    const rerender = () => PM.views.pos(el);
    el.querySelector('#po-q').addEventListener('input', (e) => {
      state.q = e.target.value;
      clearTimeout(state.t);
      state.t = setTimeout(() => { rerender(); const i = el.querySelector('#po-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
    });
    el.onchange = (e) => {
      if (e.target.id === 'po-project') { state.project = e.target.value; rerender(); return; }
      PM.poHandleChange(e, rerender);
    };
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg]');
      if (seg) { state[seg.dataset.seg] = seg.dataset.val; rerender(); return; }
      if (e.target.closest('select, input')) return;
      if (e.target.closest('[data-action="new-po"]')) { PM.poForm(null, state.project || null, rerender); return; }
      const row = e.target.closest('tr[data-po]');
      if (row) PM.poForm(PM.find('pos', row.dataset.po), null, rerender);
    };
  };
})();
