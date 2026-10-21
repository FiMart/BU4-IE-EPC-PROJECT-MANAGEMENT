/* approvals.js — PO and expense approval above a limit
   - Limits: collection 'settings', record id 'approval' { limits: { po, cost } } in THB (0 = no approval needed),
     set on the Settings page by whoever may approve (permission approve.spend: Admin · Department Manager).
   - Saving a PO / expense at or above the limit asks for approval (record.approval = { status: 'pending', … }):
       PO       → stays Draft (not committed) until approved; the status it was saved with is applied on approval
       expense  → not counted in Actual cost until approved (PM.costCounts)
     An approver who saves it approves it at once. Raising an approved amount asks again; going under the limit clears it.
   - Approve / return with a reason: the "รออนุมัติ" card (PO page · project's expense tab) or the record's form.
     The bell tells approvers what waits, and the requester when something was returned. */
(function () {
  const U = PM.ui, esc = U.esc;
  PM.APPROVAL_DEFAULT = { po: 500000, cost: 100000 };
  const KIND = { po: { label: 'PO', coll: 'pos' }, cost: { label: 'ค่าใช้จ่าย', coll: 'costs' } };

  PM.approvalLimits = () => Object.assign({}, PM.APPROVAL_DEFAULT, ((PM.db.settings || []).find((x) => x.id === 'approval') || {}).limits);
  PM.needsApproval = (kind, amount) => { const lim = Number(PM.approvalLimits()[kind]) || 0; return lim > 0 && Math.abs(Number(amount) || 0) >= lim; };
  PM.approvalPending = (x) => !!(x && x.approval && x.approval.status === 'pending');
  PM.approvalBlocked = (x) => !!(x && x.approval && x.approval.status !== 'approved'); // pending or returned
  PM.costCounts = (c) => !PM.approvalBlocked(c); // an expense waiting for (or refused) approval is not Actual cost yet
  const me = () => { const u = PM.auth && PM.auth.user; return { id: u ? u.id : '', name: u ? PM.auth.displayName(u) : '' }; };

  /* call on save, after the record has its new values. Returns 'pending' · 'approved' · null (nothing needed) */
  PM.approvalOnSave = function (kind, x, wantStatus) {
    const amount = Math.abs(Number(x.amount) || 0), a = x.approval;
    if (!PM.needsApproval(kind, amount)) { if (a && a.status !== 'approved') delete x.approval; return null; }
    if (a && a.status === 'approved' && amount <= (a.amount || 0)) return 'approved'; // approved already, not raised
    const u = me(), now = new Date().toISOString();
    if (PM.can('approve.spend')) { x.approval = { status: 'approved', amount, requestedBy: u.id, requestedByName: u.name, requestedAt: now, by: u.id, byName: u.name, at: now, note: 'อนุมัติโดยผู้บันทึก' }; return 'approved'; }
    x.approval = { status: 'pending', amount, requestedBy: u.id, requestedByName: u.name, requestedAt: now, wantStatus: wantStatus || '' };
    return 'pending';
  };

  /* approve (ok = true) or return (ok = false, with a reason) */
  PM.approvalDecide = function (kind, x, ok, note) {
    const u = me();
    Object.assign(x.approval, { status: ok ? 'approved' : 'rejected', by: u.id, byName: u.name, at: new Date().toISOString(), note: note || '' });
    if (kind === 'po') {
      if (ok && x.approval.wantStatus && x.status === 'draft') x.status = x.approval.wantStatus; // the status it was saved with
      PM.upsert('pos', x);
    } else {
      const p = PM.find('projects', x.projectId);
      const i = PM.db.costs.findIndex((c) => c.id === x.id);
      if (i >= 0) PM.db.costs[i] = x;
      if (p) { PM.applyLedger(p); PM.upsert('projects', p); } else PM.save();
    }
    U.toast(ok ? `อนุมัติ ${KIND[kind].label} ${label(kind, x)} แล้ว` : `ตีกลับ ${label(kind, x)} แล้ว`);
  };
  const label = (kind, x) => (kind === 'po' ? x.poNo : x.description);

  /* small status chip for tables and forms */
  PM.approvalBadge = (x) => {
    const a = x && x.approval;
    if (!a) return '';
    if (a.status === 'pending') return U.badge('warning', 'รออนุมัติ');
    if (a.status === 'rejected') return U.badge('critical', 'ไม่อนุมัติ');
    return a.note === 'อนุมัติโดยผู้บันทึก' ? '' : U.badge('good', `อนุมัติ · ${a.byName || ''}`);
  };
  /* the approval part of a PO / expense form (who asked, decision, buttons for an approver) */
  PM.approvalFormHtml = (kind, x) => {
    const a = x.approval;
    const lim = PM.approvalLimits()[kind];
    if (!a) return lim ? `<p class="full muted" style="margin:0">ต้องขออนุมัติเมื่อยอด ≥ ${U.money(lim)}</p>` : '';
    const who = `ขอโดย ${esc(a.requestedByName || '–')} · ${U.date((a.requestedAt || '').slice(0, 10))} · ${U.money(a.amount)}`;
    return `<div class="full appr-box appr-${a.status}">${PM.approvalBadge(x) || U.badge('good', 'อนุมัติแล้ว')}
      <span>${a.status === 'pending' ? who : `${a.status === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'}โดย ${esc(a.byName || '–')} · ${U.date((a.at || '').slice(0, 10))}${a.note && a.status === 'rejected' ? ` — ${esc(a.note)}` : ''} · ${who}`}</span>
      ${a.status === 'pending' && PM.can('approve.spend') ? `<span class="spacer"></span><button type="button" class="btn sm btn-danger" data-appr="no">ตีกลับ</button><button type="button" class="btn sm primary" data-appr="ok">อนุมัติ</button>` : ''}
      ${a.status === 'rejected' ? '<small>แก้ไขแล้วกดบันทึกเพื่อขออนุมัติใหม่</small>' : ''}</div>`;
  };
  /* wire the form's approve / return buttons */
  PM.approvalFormBind = (form, kind, x, done) => form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-appr]');
    if (!b) return;
    decideWithReason(kind, x, b.dataset.appr === 'ok').then((did) => { if (did) { U.closeModal(); done(); } });
  });
  function decideWithReason(kind, x, ok) {
    if (ok) { PM.approvalDecide(kind, x, true, ''); return Promise.resolve(true); }
    return U.prompt(`เหตุผลที่ไม่อนุมัติ ${label(kind, x)} (ผู้ขอจะเห็นข้อความนี้)`, '', { title: `ตีกลับ${KIND[kind].label}`, ok: 'ตีกลับ', tone: 'danger', multiline: true })
      .then((note) => { if (note === null) return false; PM.approvalDecide(kind, x, false, note.trim()); return true; });
  }

  /* everything waiting for a decision (optionally of one project) */
  PM.approvalsPending = (projectId) => ({
    pos: (PM.db.pos || []).filter((x) => PM.approvalPending(x) && (!projectId || x.projectId === projectId)),
    costs: (PM.db.costs || []).filter((x) => PM.approvalPending(x) && (!projectId || x.projectId === projectId)),
  });
  /* "รออนุมัติ" card — kinds: ['po'] on the PO page, ['cost'] on a project's expense tab */
  PM.approvalsCard = function (kinds, projectId) {
    const pend = PM.approvalsPending(projectId);
    const rows = [].concat(kinds.includes('po') ? pend.pos.map((x) => ({ kind: 'po', x })) : [], kinds.includes('cost') ? pend.costs.map((x) => ({ kind: 'cost', x })) : []);
    if (!rows.length) return '';
    const can = PM.can('approve.spend');
    const proj = (id) => { const p = PM.find('projects', id); return p ? p.code : '–'; };
    return `<div class="card appr-card"><div class="card-h"><h2>รออนุมัติ</h2>${U.badge('warning', `${rows.length} รายการ`)}
        <p>${can ? 'ตรวจแล้วกดอนุมัติ หรือตีกลับพร้อมเหตุผล' : `รอผู้อนุมัติ (${esc(PM.whoCan('approve.spend'))})`} · PO ที่รออนุมัติยังเป็น Draft · ค่าใช้จ่ายที่รออนุมัติยังไม่นับใน Actual cost</p></div>
      <div class="card-b flush table-wrap"><table class="tbl"><thead><tr><th>ประเภท</th><th>รายการ</th><th>โครงการ</th><th class="num">จำนวนเงิน</th><th>ขอโดย</th><th></th></tr></thead><tbody>
        ${rows.map(({ kind, x }) => `<tr>
          <td>${U.badge(kind === 'po' ? 'info' : 'neutral', KIND[kind].label)}</td>
          <td><b>${esc(label(kind, x))}</b><small>${esc(kind === 'po' ? `${x.supplier || ''} · ${x.description || ''}` : `${x.vendor || ''} · ${x.category || ''}`)}</small></td>
          <td>${esc(proj(x.projectId))}</td><td class="num"><b>${U.money(x.amount)}</b></td>
          <td><small>${esc(x.approval.requestedByName || '–')} · ${U.date((x.approval.requestedAt || '').slice(0, 10))}</small></td>
          <td class="nowrap">${can ? `<button type="button" class="btn sm btn-danger" data-appr-row="no" data-kind="${kind}" data-id="${esc(x.id)}">ตีกลับ</button> <button type="button" class="btn sm primary" data-appr-row="ok" data-kind="${kind}" data-id="${esc(x.id)}">อนุมัติ</button>` : U.badge('warning', 'รออนุมัติ')}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  };
  /* clicks on the card's buttons — returns true when handled */
  PM.approvalsHandle = function (e, done) {
    const b = e.target.closest && e.target.closest('[data-appr-row]');
    if (!b) return false;
    e.stopPropagation();
    const kind = b.dataset.kind, x = PM.find(KIND[kind].coll, b.dataset.id);
    if (x && PM.approvalPending(x) && PM.can('approve.spend')) decideWithReason(kind, x, b.dataset.apprRow === 'ok').then((did) => { if (did) done(); });
    return true;
  };

  /* Settings page card: the two limits */
  PM.approvalSettingsHtml = function () {
    const L = PM.approvalLimits(), can = PM.can('approve.spend');
    return `<div class="card"><div class="card-h"><h2>วงเงินที่ต้องอนุมัติ</h2><p>PO / ค่าใช้จ่ายที่ยอดเท่ากับหรือเกินวงเงินต้องได้รับอนุมัติจาก ${esc(PM.whoCan('approve.spend'))} · ใส่ 0 = ไม่ต้องอนุมัติ</p></div>
      <div class="card-b"><form class="row appr-limits" data-appr-limits>
        <label class="appr-l"><span>PO ตั้งแต่ (บาท)</span><input type="number" name="po" min="0" step="1000" value="${esc(L.po)}"${can ? '' : ' disabled'}></label>
        <label class="appr-l"><span>ค่าใช้จ่ายตั้งแต่ (บาท)</span><input type="number" name="cost" min="0" step="1000" value="${esc(L.cost)}"${can ? '' : ' disabled'}></label>
        ${can ? '<button type="submit" class="btn primary">บันทึกวงเงิน</button>' : '<small class="muted">แก้ได้เฉพาะผู้อนุมัติ</small>'}
      </form></div></div>`;
  };
  document.addEventListener('submit', (e) => {
    const f = e.target.closest && e.target.closest('[data-appr-limits]');
    if (!f) return;
    e.preventDefault();
    if (!PM.can('approve.spend')) return;
    const rec = (PM.db.settings || []).find((x) => x.id === 'approval') || { id: 'approval' };
    rec.limits = { po: Math.max(0, Number(f.po.value) || 0), cost: Math.max(0, Number(f.cost.value) || 0) };
    PM.upsert('settings', rec);
    U.toast(`บันทึกวงเงินแล้ว — PO ≥ ${U.money(rec.limits.po)} · ค่าใช้จ่าย ≥ ${U.money(rec.limits.cost)}`);
  });
})();
