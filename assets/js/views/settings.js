/* settings.js — account & role, company (locked), permissions, user roles (admin), backup / restore, reset */
(function () {
  const U = PM.ui, esc = U.esc;
  const LOCK = '<svg class="lock-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  const roleBadge = (key) => { const r = PM.roleInfo(key); return r ? U.badge(r.level, r.label) : U.badge('warning', 'ยังไม่มี Role'); };
  const denied = (perm) => `<p class="perm-note">${LOCK}เฉพาะ ${esc(PM.whoCan(perm))} เท่านั้น</p>`;

  PM.views.settings = function (el) {
    const db = PM.db;
    const size = (() => { try { return new Blob([JSON.stringify(db)]).size; } catch (e) { return 0; } })();
    const A = PM.auth;
    const user = A && A.user;
    const canReset = PM.can('data.reset'), canImport = PM.can('data.import'), canExport = PM.can('data.export');
    const canRoles = PM.can('roles.manage');

    el.innerHTML = `
      ${user ? `<div class="card"><div class="card-h"><h2>บัญชีผู้ใช้</h2><span class="spacer"></span>${roleBadge(A.role)}<p>เชื่อมต่อกับ Supabase Auth · Role กำหนดโดย Admin, Department Manager หรือ Project Manager</p></div>
        ${A.roleError ? `<div class="card-b" style="padding-bottom:0"><div class="auth-msg error">${esc(A.roleError)}</div></div>` : ''}
        <div class="card-b grid cols-3">
          <div class="auth-form" style="margin:0">
            <dl class="kv">
              <dt>อีเมล</dt><dd>${esc(user.email)}</dd>
              <dt>Role</dt><dd>${esc(A.role ? `${PM.roleLabel(A.role)} (${PM.roleInfo(A.role).th})` : '–')}</dd>
              <dt>สมัครเมื่อ</dt><dd>${user.created_at ? U.date(user.created_at.slice(0, 10)) : '–'}</dd>
              <dt>เข้าระบบล่าสุด</dt><dd>${user.last_sign_in_at ? U.date(user.last_sign_in_at.slice(0, 10)) : '–'}</dd>
            </dl>
            <button class="btn" data-action="logout" style="align-self:flex-start">ออกจากระบบ</button>
          </div>
          <form id="profile-form" class="auth-form" style="margin:0">
            <label><span>ชื่อที่แสดง</span><input name="fullName" value="${esc(A.displayName(user) === user.email ? '' : A.displayName(user))}" required></label>
            <button class="btn" style="align-self:flex-start">บันทึกชื่อ</button>
          </form>
          <form id="password-form" class="auth-form" style="margin:0">
            <label><span>รหัสผ่านใหม่</span><input type="password" name="password" autocomplete="new-password" minlength="6" required></label>
            <label><span>ยืนยันรหัสผ่านใหม่</span><input type="password" name="confirm" autocomplete="new-password" minlength="6" required></label>
            <button class="btn" style="align-self:flex-start">เปลี่ยนรหัสผ่าน</button>
          </form>
        </div></div>` : ''}

      ${canRoles ? `<div class="card">
        <div class="card-h"><h2>จัดการ Role ผู้ใช้</h2><span class="chip">Admin · Department Manager · Project Manager</span><span class="spacer"></span><button class="btn sm" data-action="reload-users">รีเฟรช</button>
          <p>ผู้สมัครใหม่จะได้ Role เป็น Technician อัตโนมัติ — เปลี่ยน Role ได้จากตารางนี้ (บันทึกทันที)${A.role !== 'admin' ? ' · ' + esc(PM.ROLE_RULES) : ''}${PM.can('users.delete') ? ' · ลบบัญชีผู้ใช้ได้เฉพาะ Admin' : ''}</p></div>
        <div class="card-b flush table-wrap" id="user-roles"><p class="empty">กำลังโหลดรายชื่อผู้ใช้…</p></div>
      </div>` : ''}

      <div class="card">
        <div class="card-h"><h2>สิทธิ์การใช้งานตาม Role</h2><p>✓ = ทำได้ · คอลัมน์ที่ไฮไลต์คือ Role ของคุณ</p></div>
        <div class="card-b flush table-wrap">${matrix(A && A.role)}</div>
        <div class="card-b" style="padding-top:0"><p class="perm-note">${LOCK}ลบงานใน Weekly Plan: ได้เฉพาะคนที่สร้างงานนั้น (งานเดิมที่ไม่มีข้อมูลผู้สร้าง — เฉพาะ Admin)</p>
          <p class="perm-note">${LOCK}กำหนด Role — ${esc(PM.ROLE_RULES)}</p></div>
      </div>

      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>Company</h2><p>ชื่อบริษัทถูกล็อคไว้ ไม่สามารถแก้ไขได้</p></div><div class="card-b">
          <div class="locked-field" aria-label="Company name (locked)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
            <div><b>${esc(PM.COMPANY)}</b><small>${esc(PM.APP_NAME)}</small></div>
          </div>
        </div></div>
        <div class="card"><div class="card-h"><h2>Data summary</h2></div><div class="card-b">
          <dl class="kv">
            <dt>Bids</dt><dd>${db.bids.length}</dd><dt>Projects</dt><dd>${db.projects.length}</dd>
            <dt>NCR</dt><dd>${db.ncrs.length}</dd><dt>Safety records</dt><dd>${db.safety.length}</dd>
            <dt>People</dt><dd>${db.resources.length}</dd><dt>Timesheet entries</dt><dd>${U.num(db.timesheets.length)}</dd>
            <dt>Weekly plan tasks</dt><dd>${U.num((db.plans || []).length)}</dd>
            <dt>Purchase orders</dt><dd>${U.num((db.pos || []).length)}</dd><dt>Expense entries</dt><dd>${U.num((db.costs || []).length)}</dd>
            <dt>Price list</dt><dd>${U.num((db.prices || []).length)}</dd>
            <dt>Storage used</dt><dd>${U.num(size / 1024, 0)} KB</dd>
          </dl>
        </div></div>
      </div>

      <div class="card"><div class="card-h"><h2>Cloud</h2><span class="spacer"></span><button class="btn sm" data-action="sync-now" ${PM.cloud.enabled ? '' : 'disabled'}>ซิงค์ตอนนี้</button>
          <p>ทุกการแก้ไขถูกบันทึกขึ้น Supabase อัตโนมัติ — เปิดเว็บใหม่หรือเปิดจากเครื่องอื่นก็เห็นข้อมูลเดิม</p></div>
        <div class="card-b">
          <dl class="kv">
            <dt>สถานะ</dt><dd>${esc(cloudLabel())}</dd>
            <dt>บันทึกล่าสุด</dt><dd>${PM.cloud.savedAt ? esc(PM.cloud.savedAt.toLocaleString('en-GB')) : '–'}</dd>
            ${PM.cloud.detail && PM.cloud.state !== 'saved' ? `<dt>รายละเอียด</dt><dd>${esc(PM.cloud.detail)}</dd>` : ''}
          </dl>
          ${PM.cloud.localBackup() ? `<p class="perm-note">มีสำเนาข้อมูลเดิมในเครื่องนี้ (ก่อนเชื่อม Cloud) · <button type="button" class="link-btn" data-action="download-local-backup">ดาวน์โหลด</button></p>` : ''}
        </div>
      </div>
      <div class="card"><div class="card-h"><h2>Backup & Restore</h2><p>ข้อมูลหลักอยู่บน Cloud — Export เป็นไฟล์ JSON เพื่อเก็บสำรองไว้เอง</p></div>
        <div class="card-b">
          <div class="row">
            <button class="btn primary" data-action="export" ${canExport ? '' : 'disabled'}>Export JSON</button>
            <label class="btn${canImport ? '' : ' disabled'}" ${canImport ? '' : 'aria-disabled="true"'}>${canImport ? '' : LOCK}Import JSON<input type="file" accept="application/json,.json" id="import-file" hidden ${canImport ? '' : 'disabled'}></label>
            <button class="btn" data-action="csv" ${canExport ? '' : 'disabled'}>Export Timesheet CSV</button>
          </div>
          ${canImport ? '' : denied('data.import')}
        </div>
      </div>
      ${canReset ? `<div class="card"><div class="card-h"><h2>Reset ข้อมูล</h2><span class="chip">Admin only</span><p>ล้างข้อมูลทั้งหมด หรือแทนที่ด้วยข้อมูลตัวอย่าง — ย้อนกลับไม่ได้ ควร Export ก่อน</p></div>
        <div class="card-b">
          <div class="row">
            <button class="btn" data-action="demo">โหลดข้อมูลตัวอย่างใหม่ (Demo)</button>
            <button class="btn danger" data-action="empty">ล้างข้อมูลทั้งหมด (เริ่มใช้งานจริง)</button>
          </div>
        </div>
      </div>` : ''}
      <div class="callout">
        <b>สูตร KPI ที่ใช้</b><br>
        <b>Bidding</b> — Quantity: จำนวน Inquiry / Proposal ที่ยื่น / BOQ items · Time: วันเฉลี่ยในแต่ละ stage, Cycle time (Inquiry → Submit), On-time submission (Submit ≤ Due date) · Win rate = Won ÷ (Won + Lost)<br>
        <b>Execution</b> — Progress รวม = Σ(weight × progress ของแต่ละ phase) · PV = Σ(budget × planned%) · EV = Σ(budget × actual%) · AC (Actual cost) = ผลรวมรายการค่าใช้จ่ายของโครงการ · SPI = EV ÷ PV · CPI = EV ÷ AC · EAC = BAC ÷ CPI · สถานะ: ≥ 0.95 On track, 0.90–0.95 At risk, &lt; 0.90 Off track<br>
        <b>Quality</b> — NCR open / total, Avg days to close · <b>Safety</b> — LTIFR = LTI × 1,000,000 ÷ Man-hours, TRIR = (Recordable + LTI) × 200,000 ÷ Man-hours<br>
        <b>Resource</b> — Utilization = (Project + Bidding hours) ÷ (Capacity − Leave) · Timesheet completeness = Logged ÷ Capacity
      </div>`;

    const download = (name, text, type) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type }));
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    const busy = async (form, fn) => {
      const btn = form.querySelector('button');
      btn.disabled = true;
      try { await fn(); } catch (err) { alert(err.message); } finally { btn.disabled = false; }
    };
    const pf = el.querySelector('#profile-form');
    if (pf) pf.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(pf, async () => { await A.updateProfile(pf.fullName.value.trim()); U.toast('บันทึกชื่อแล้ว'); });
    });
    const pwf = el.querySelector('#password-form');
    if (pwf) pwf.addEventListener('submit', (e) => {
      e.preventDefault();
      if (pwf.password.value !== pwf.confirm.value) { alert('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
      busy(pwf, async () => { await A.updatePassword(pwf.password.value); pwf.reset(); U.toast('เปลี่ยนรหัสผ่านแล้ว'); });
    });

    if (canRoles) loadUsers(el);

    el.querySelector('#import-file').addEventListener('change', (e) => {
      if (!PM.can('data.import')) { U.toast('ไม่มีสิทธิ์ Import'); return; }
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const data = JSON.parse(rd.result);
          const need = ['bids', 'projects', 'ncrs', 'safety', 'resources', 'levels', 'timesheets'];
          if (!need.every((k) => Array.isArray(data[k]))) throw new Error('missing collections');
          if (!confirm('Import จะเขียนทับข้อมูลปัจจุบันทั้งหมด ดำเนินการต่อ?')) return;
          PM.db = data; PM.ensureShape(); PM.lockCompany();
          PM.saveLocal(); PM.cloud.replaceAll();
          PM.applyAsOf(); U.toast('Import สำเร็จ — กำลังบันทึกขึ้น Cloud'); PM.render();
        } catch (err) { alert('ไฟล์ไม่ถูกต้อง: ' + err.message); }
      };
      rd.readAsText(f);
    });

    el.onchange = (e) => {
      const sel = e.target.closest('select[data-role-for]');
      if (sel) changeRole(el, sel);
    };
    el.onclick = (e) => {
      const a = e.target.closest('[data-action]');
      if (!a || a.disabled) return;
      const act = a.dataset.action;
      if (act === 'logout') A.signOut();
      if (act === 'reload-users') loadUsers(el);
      if (act === 'delete-user') deleteUser(el, a);
      if (act === 'sync-now') {
        a.disabled = true;
        PM.cloud.sync(false).then(() => { U.toast(PM.cloud.state === 'saved' ? 'ซิงค์กับ Cloud แล้ว' : 'ซิงค์ไม่สำเร็จ'); PM.applyAsOf(); PM.render(); });
      }
      if (act === 'download-local-backup') {
        const b = PM.cloud.localBackup();
        if (b) download(`local-backup-before-cloud-${(b.savedAt || '').slice(0, 10)}.json`, JSON.stringify(b.db, null, 2), 'application/json');
      }
      if (act === 'export' && PM.can('data.export')) download(`epc-pm-backup-${PM.today()}.json`, JSON.stringify(PM.db, null, 2), 'application/json');
      if (act === 'csv' && PM.can('data.export')) {
        const name = (t) => {
          if (t.kind === 'project') { const p = PM.find('projects', t.refId); return p ? p.code : t.refId; }
          if (t.kind === 'bid') { const b = PM.find('bids', t.refId); return b ? b.code : t.refId; }
          return t.refId;
        };
        const q = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
        const lines = [['Date', 'Person', 'Level', 'Kind', 'Item', 'Phase', 'Hours'].join(',')].concat(
          PM.db.timesheets.slice().sort((x, y) => (x.date < y.date ? -1 : 1)).map((t) => {
            const r = PM.find('resources', t.resourceId) || {};
            return [t.date, q(r.name), q(PM.levelName(r.level)), t.kind, q(name(t)), t.phase, t.hours].join(',');
          }));
        download(`timesheet-${PM.today()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
      }
      if ((act === 'demo' || act === 'empty') && !PM.can('data.reset')) { U.toast('ไม่มีสิทธิ์ Reset ข้อมูล'); return; }
      if (act === 'demo' && confirm('แทนที่ข้อมูลทั้งหมดด้วยข้อมูลตัวอย่าง?')) { PM.reset(false); PM.applyAsOf(); U.toast('โหลดข้อมูลตัวอย่างแล้ว'); PM.render(); }
      if (act === 'empty' && confirm('ลบข้อมูลทั้งหมด (Bids, Projects, NCR, Safety, People, Timesheet)? แนะนำให้ Export ก่อน')) { PM.reset(true); PM.applyAsOf(); U.toast('ล้างข้อมูลแล้ว'); PM.render(); }
    };
  };

  function cloudLabel() {
    const s = PM.cloud.state;
    return {
      saved: 'เชื่อมต่อแล้ว — ข้อมูลตรงกับ Cloud', saving: 'กำลังบันทึก…', loading: 'กำลังโหลด…',
      offline: 'ยังส่งขึ้น Cloud ไม่ได้ (เก็บไว้ในเครื่อง จะลองใหม่อัตโนมัติ)', denied: 'ไม่มีสิทธิ์บันทึก (บัญชียังไม่มี Role)',
      setup: 'ยังไม่ได้ติดตั้ง — รัน supabase/data.sql ใน Supabase', local: 'ไม่ได้เชื่อม Cloud — เก็บเฉพาะเครื่องนี้',
    }[s] || s;
  }

  function matrix(myRole) {
    return `<table class="tbl perm-matrix"><thead><tr><th>สิทธิ์</th>
      ${PM.ROLES.map((r) => `<th class="c${r.key === myRole ? ' me' : ''}">${esc(r.label)}<small>${esc(r.th)}</small></th>`).join('')}</tr></thead><tbody>
      ${Object.keys(PM.PERMISSIONS).map((k) => {
        const p = PM.PERMISSIONS[k];
        return `<tr><td>${esc(p.label)}</td>${PM.ROLES.map((r) => `<td class="c${r.key === myRole ? ' me' : ''}">${p.roles.includes(r.key)
          ? '<span class="yes" aria-label="ได้">✓</span>' : '<span class="no" aria-label="ไม่ได้">—</span>'}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table>`;
  }

  async function loadUsers(el) {
    const box = el.querySelector('#user-roles');
    if (!box) return;
    box.innerHTML = '<p class="empty">กำลังโหลดรายชื่อผู้ใช้…</p>';
    try {
      const users = await PM.roles.list();
      if (!el.contains(box)) return;
      const me = PM.auth.user && PM.auth.user.id;
      const canDelete = PM.can('users.delete'); // Admin only — the column isn't shown to anyone else
      box.innerHTML = users.length ? `<table class="tbl"><thead><tr><th>ผู้ใช้</th><th>อีเมล</th><th>สมัครเมื่อ</th><th style="min-width:190px">Role</th>${canDelete ? '<th></th>' : ''}</tr></thead><tbody>
        ${users.map((u) => `<tr>
          <td><span class="title">${esc(u.full_name || '–')}</span>${u.id === me ? '<small>(คุณ)</small>' : ''}</td>
          <td>${esc(u.email || '')}</td>
          <td>${u.created_at ? U.date(u.created_at.slice(0, 10)) : '–'}</td>
          <td>${roleCell(u, me)}</td>
          ${canDelete ? `<td>${u.id === me ? '' : `<button type="button" class="btn sm danger" data-action="delete-user" data-id="${esc(u.id)}" data-name="${esc(u.full_name || u.email || '')}" data-email="${esc(u.email || '')}">ลบผู้ใช้</button>`}</td>` : ''}</tr>`).join('')}
        </tbody></table>` : '<p class="empty">ยังไม่มีผู้ใช้</p>';
    } catch (err) {
      box.innerHTML = `<div class="card-b"><div class="auth-msg error">${esc(err.message)}</div></div>`;
    }
  }

  /* delete an account — Admin only (the database checks again) */
  async function deleteUser(el, btn) {
    if (!PM.can('users.delete')) return;
    const name = btn.dataset.name, email = btn.dataset.email;
    if (!confirm(`ลบบัญชีผู้ใช้ "${name}"${email && email !== name ? ` (${email})` : ''}?\n\nคนนี้จะเข้าสู่ระบบไม่ได้อีก และลบคืนไม่ได้\nข้อมูลโครงการ / Timesheet / งานที่เคยบันทึกไว้จะยังอยู่ครบ`)) return;
    btn.disabled = true; btn.classList.add('loading');
    try {
      await PM.roles.remove(btn.dataset.id);
      U.toast(`ลบบัญชี ${name} แล้ว`);
      PM.roles.loadTeam();
      loadUsers(el);
    } catch (err) {
      btn.disabled = false; btn.classList.remove('loading');
      alert(err.message);
    }
  }

  /* dropdown with the roles this user may give; read-only badge when they may not change it */
  function roleCell(u, me) {
    const allowed = PM.assignableRoles(u);
    if (!allowed.length) {
      const why = u.id === me ? 'เปลี่ยน Role ของตัวเองไม่ได้' : u.role === 'admin' ? 'เปลี่ยนได้เฉพาะ Admin'
        : u.role === 'dept_manager' ? 'เปลี่ยนได้เฉพาะ Admin / Department Manager' : '';
      return `${roleBadge(u.role)}${why ? `<small>${LOCK}${esc(why)}</small>` : ''}`;
    }
    return `<select data-role-for="${esc(u.id)}" data-prev="${esc(u.role)}" data-self="${u.id === me ? 1 : ''}" aria-label="Role ของ ${esc(u.email || '')}">
      ${U.options(PM.ROLES.filter((r) => allowed.includes(r.key) || r.key === u.role).map((r) => ({ value: r.key, label: `${r.label} · ${r.th}` })), u.role)}</select>`;
  }

  async function changeRole(el, sel) {
    const role = sel.value, prev = sel.dataset.prev, self = !!sel.dataset.self;
    // same rules as the database (checked again by roles.sql)
    if (!PM.assignableRoles({ id: sel.dataset.roleFor, role: prev }).includes(role)) {
      sel.value = prev;
      alert('ไม่มีสิทธิ์ตั้ง Role นี้ — ' + PM.ROLE_RULES);
      return;
    }
    if (self && prev === 'admin' && role !== 'admin' && !confirm('คุณกำลังลด Role ของตัวเองจาก Admin — จะไม่สามารถจัดการ Role ได้อีก ดำเนินการต่อ?')) {
      sel.value = prev; return;
    }
    sel.disabled = true;
    try {
      await PM.roles.set(sel.dataset.roleFor, role);
      sel.dataset.prev = role;
      U.toast(`เปลี่ยน Role เป็น ${PM.roleLabel(role)} แล้ว`);
      if (self) { await PM.auth.refreshRole(); PM.render(); }
    } catch (err) {
      sel.value = prev;
      alert(err.message);
    } finally {
      sel.disabled = false;
    }
  }
})();
