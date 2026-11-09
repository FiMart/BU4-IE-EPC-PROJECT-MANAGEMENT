/* role-preview.js — Admin only: see the website as another role would (menus, pages, buttons, columns, figures).
   It is a preview, not a sign-in as someone else:
   - the role used by every PM.can() / PM.myRole() check is switched for this browser tab only;
   - nothing done meanwhile is kept: no save to the cloud, no save to this browser, no file upload or delete, no role change —
     when the preview ends the data goes back to exactly what it was before;
   - the user is still the Admin's account, so "my own" rules (a Sales sees prices of their own bids only) show as they would
     for someone of that role who owns nothing yet;
   - data the database itself withholds from a role (bid prices, Margin / WIP) was loaded for the Admin; the screens hide it by
     the same rules, which is what that role would see. A reload always ends the preview. */
(function () {
  const U = PM.ui, esc = U.esc;
  const P = (PM.preview = { role: null, realRole: null });
  let snapshot = null;
  P.active = () => !!P.role;
  P.realRole = null;
  /* the Admin behind the preview (or the signed-in role when there is none) */
  P.isAdmin = () => (P.role ? P.realRole : PM.auth && PM.auth.role) === 'admin';
  P.blocked = (what) => { if (P.role) throw new Error(`โหมดดูในมุมมอง Role — ${what}ไม่ถูกทำจริง กด "กลับเป็น Admin" ก่อน`); };

  /* what each role does not see / cannot do — the summary in Settings and on the banner */
  P.NOTES = {
    dept_manager: 'เห็นมูลค่า Bid เฉพาะงานที่ได้แล้ว (ไม่เห็น Margin / ไฟล์ใบเสนอราคา) · ลบผู้ใช้ไม่ได้ · Reset ข้อมูลไม่ได้',
    project_manager: 'เห็นมูลค่า Bid เฉพาะงานที่ได้แล้ว (ไม่เห็น Margin / ไฟล์ใบเสนอราคา) · อนุมัติวงเงินไม่ได้ · ลบบันทึก ISO ไม่ได้',
    engineer: 'เห็นมูลค่า Bid เฉพาะงานที่ได้แล้ว · ไม่เห็นหน้าภาระงานบุคลากร / Timesheet · แก้ค่าใช้จ่าย / งวดเงินไม่ได้',
    sales: 'เห็นราคาเฉพาะ Bid ของตัวเอง · ไม่เห็นตัวเงินโครงการ (มูลค่าสัญญา · ต้นทุน · Margin) · ไม่เห็นภาระงานบุคลากร',
    doc_control: 'ไม่เห็นราคา Bid และตัวเงินโครงการ · เน้นเอกสาร · AVL · ISO',
    technician: 'ไม่เห็นราคาและตัวเงิน · อัปเดตสถานะงาน · Punch List · รายงานประจำวัน',
  };

  P.start = async function (role) {
    if (!P.isAdmin()) { U.alert('ดูเว็บในมุมมอง Role อื่นได้เฉพาะ Admin'); return; }
    if (!role || role === 'admin') { P.stop(); return; }
    if (!PM.roleInfo(role)) return;
    if (!P.role) {
      // send what the Admin changed before, then freeze a copy to come back to
      try { if (PM.cloud && PM.cloud.enabled) await PM.cloud.flush(); } catch (e) { /* stays queued; the copy below keeps it */ }
      P.realRole = PM.auth.role;
      snapshot = JSON.stringify(PM.db);
    }
    P.role = role;
    PM.auth.role = role;
    document.body.classList.add('role-preview');
    draw();
    PM.render();
    U.toast(`กำลังดูในมุมมอง ${PM.roleLabel(role)} — การแก้ไขในโหมดนี้จะไม่ถูกบันทึก`);
  };

  P.stop = function (quiet) {
    if (!P.role) return;
    P.role = null;
    if (PM.auth) PM.auth.role = P.realRole;
    if (snapshot) { PM.db = JSON.parse(snapshot); snapshot = null; PM.ensureShape(); PM.saveLocal(); }
    document.body.classList.remove('role-preview');
    draw();
    if (PM.auth && PM.auth.user) {
      PM.render();
      if (!quiet) U.toast('กลับเป็น Admin แล้ว');
      if (PM.cloud && PM.cloud.enabled) PM.cloud.sync(true); // anything teammates saved meanwhile
    }
  };

  /* the banner: a full-width row at the top of the top bar, so the sticky bars below it still line up */
  function draw() {
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    let box = bar.querySelector('.rp-bar');
    if (!P.role) { if (box) box.remove(); if (PM.measureTopbar) PM.measureTopbar(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'rp-bar'; box.setAttribute('role', 'status'); bar.prepend(box); }
    box.innerHTML = `<span class="rp-eye" aria-hidden="true">👁</span>
      <span class="rp-t">กำลังดูเว็บในมุมมอง</span>
      <select aria-label="Role ที่ดูอยู่" data-rp-role>${PM.ROLES.map((r) => `<option value="${esc(r.key)}"${r.key === P.role ? ' selected' : ''}>${esc(r.label)}${r.key === 'admin' ? ' (ของคุณ)' : ''}</option>`).join('')}</select>
      <span class="rp-note">${esc(P.NOTES[P.role] || '')} · การแก้ไขในโหมดนี้ไม่ถูกบันทึก</span>
      <button type="button" class="btn sm" data-rp-stop>กลับเป็น Admin</button>`;
    if (PM.measureTopbar) PM.measureTopbar();
  }
  document.addEventListener('change', (e) => { const s = e.target.closest('[data-rp-role]'); if (s) P.start(s.value); });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-rp-stop]')) { P.stop(); return; }
    const b = e.target.closest('[data-rp-start]');
    if (b) P.start(b.dataset.rpStart);
  });

  /* Settings → ผู้ใช้ & สิทธิ์: one button per role */
  P.card = function () {
    if (!P.isAdmin()) return '';
    return `<div class="card rp-card"><div class="card-h"><h2>ดูเว็บในมุมมอง Role</h2>${P.role ? U.badge('info', 'กำลังดู ' + PM.roleLabel(P.role)) : ''}
        <p>เลือก Role เพื่อเห็นเมนู หน้า ปุ่ม คอลัมน์ และตัวเลขแบบเดียวกับคนที่มี Role นั้น · เปิดในแท็บนี้เท่านั้น · การแก้ไขระหว่างดูจะไม่ถูกบันทึก (ไม่ขึ้น Cloud · ไม่อัปโหลดไฟล์ · ไม่เปลี่ยน Role จริง) · กลับเป็น Admin จากแถบด้านบน หรือรีเฟรชหน้า</p></div>
      <div class="card-b rp-grid">${PM.ROLES.filter((r) => r.key !== 'admin').map((r) => `
        <button type="button" class="rp-role${P.role === r.key ? ' on' : ''}" data-rp-start="${esc(r.key)}">
          <b>${esc(r.label)}</b><small>${esc(r.th)}</small><span>${esc(P.NOTES[r.key] || '')}</span></button>`).join('')}
      </div></div>`;
  };
})();
