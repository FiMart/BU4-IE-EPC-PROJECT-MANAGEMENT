/* settings.js — the Settings page: a section menu on the left (a row of chips on phones), one section at a time on the right.
   #/settings/<section>: account (บัญชีของฉัน) · display (การแสดงผล) · org (องค์กร & การอนุมัติ) · users (ผู้ใช้ & สิทธิ์) ·
   data (ข้อมูล & Cloud) · kpi (สูตร KPI). Sections a role may not use show what they can see, with who may change it. */
(function () {
  const U = PM.ui, esc = U.esc;
  const LOCK = '<svg class="lock-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const ico = (k) => PM.illus.svg(k);

  const roleBadge = (key) => { const r = PM.roleInfo(key); return r ? U.badge(r.level, r.label) : U.badge('warning', 'ยังไม่มี Role'); };
  const denied = (perm) => `<p class="perm-note">${LOCK}เฉพาะ ${esc(PM.whoCan(perm))} เท่านั้น</p>`;

  const SECTIONS = [
    { key: 'account', label: 'บัญชีของฉัน', sub: 'ชื่อ · รหัสผ่าน · สิทธิ์ของฉัน', icon: 'user' },
    { key: 'display', label: 'การแสดงผล', sub: 'ธีม · เมนูด้านซ้าย', icon: 'sparkle' },
    { key: 'org', label: 'องค์กร & การอนุมัติ', sub: 'บริษัท · วงเงินอนุมัติ · OT', icon: 'building' },
    { key: 'users', label: 'ผู้ใช้ & สิทธิ์', sub: 'Role ผู้ใช้ · ตารางสิทธิ์', icon: 'people' },
    { key: 'data', label: 'ข้อมูล & Cloud', sub: 'ซิงค์ · สำรอง · Reset', icon: 'database' },
    { key: 'kpi', label: 'สูตร KPI', sub: 'วิธีคำนวณตัวชี้วัด', icon: 'book' },
  ];
  let lastSection = 'account';
  const initials = (n) => { const parts = String(n || '?').replace(/@.*/, '').trim().split(/\s+/).map((p) => p.replace(/^[เแโใไ]/, '')).filter(Boolean); return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase(); };

  PM.views.settings = function (el, params) {
    const key = SECTIONS.some((s) => s.key === params[0]) ? params[0] : lastSection;
    lastSection = key;
    const sec = SECTIONS.find((s) => s.key === key);
    const A = PM.auth, user = A && A.user;
    const name = user ? A.displayName(user) : 'ผู้ใช้';

    el.innerHTML = `<div class="st">
      <aside class="st-side">
        <div class="st-me">
          <span class="st-avatar">${esc(initials(name))}</span>
          <div><b>${esc(name)}</b><small>${esc(user ? user.email || '' : 'ยังไม่ได้เข้าสู่ระบบ')}</small>${roleBadge(A && A.role)}</div>
        </div>
        <nav class="st-nav" aria-label="หมวดการตั้งค่า">${SECTIONS.map((s) => `<a href="#/settings/${s.key}" class="${s.key === key ? 'on' : ''}"${s.key === key ? ' aria-current="page"' : ''}>
          <i>${ico(s.icon)}</i><span><b>${esc(s.label)}</b><small>${esc(s.sub)}</small></span></a>`).join('')}</nav>
        <p class="st-ver">v${esc(PM.VERSION || '')} · <a href="#/about">ประวัติเวอร์ชัน</a> · <a href="#/help/settings">คู่มือ</a></p>
      </aside>
      <section class="st-main" aria-labelledby="st-title">
        <header class="st-head"><span class="st-head-ic">${ico(sec.icon)}</span><div><h2 id="st-title">${esc(sec.label)}</h2><p>${esc(sec.sub)}</p></div></header>
        ${BODY[key]()}
      </section>
    </div>`;
    // keep the chosen section in view on phones (the chip row scrolls sideways)
    const on = el.querySelector('.st-nav a.on');
    if (on && on.scrollIntoView && window.innerWidth <= 900) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    BIND[key] && BIND[key](el);
    el.onclick = (e) => onClick(el, e);
    el.onchange = (e) => { const sel = e.target.closest('select[data-role-for]'); if (sel) changeRole(el, sel); };
    el.oninput = (e) => { if (e.target.id === 'st-user-q') filterUsers(el, e.target.value); };
  };

  /* ================= sections ================= */
  const BODY = {
    account() {
      const A = PM.auth, user = A && A.user;
      if (!user) return '<div class="card"><div class="card-b"><p class="empty">ยังไม่ได้เข้าสู่ระบบ</p></div></div>';
      const role = A.role && PM.roleInfo(A.role);
      const mine = Object.keys(PM.PERMISSIONS).filter((k) => A.role && PM.PERMISSIONS[k].roles.includes(A.role));
      return `
      ${A.roleError ? `<div class="auth-msg error">${esc(A.roleError)}</div>` : ''}
      <div class="card st-profile"><div class="card-b">
        <span class="st-avatar lg">${esc(initials(A.displayName(user)))}</span>
        <div class="st-profile-t"><b>${esc(A.displayName(user))}</b><span>${esc(user.email || '')}</span>
          <div class="st-facts">${roleBadge(A.role)}${role ? `<span class="chip">${esc(role.th)}</span>` : ''}
            <span class="chip">สมัครเมื่อ ${user.created_at ? U.date(user.created_at.slice(0, 10)) : '–'}</span>
            <span class="chip">เข้าระบบล่าสุด ${user.last_sign_in_at ? U.date(user.last_sign_in_at.slice(0, 10)) : '–'}</span></div></div>
        <button class="btn" data-action="logout">ออกจากระบบ</button>
      </div></div>
      <div class="grid cols-2">
        <form id="profile-form" class="card st-form"><div class="card-h"><h2>ชื่อที่แสดง</h2><p>ชื่อนี้ขึ้นในเมนู รายชื่อผู้ใช้ และบันทึกต่าง ๆ ที่คุณสร้าง</p></div>
          <div class="card-b"><label><span>ชื่อ - สกุล</span><input name="fullName" value="${esc(A.displayName(user) === user.email ? '' : A.displayName(user))}" required placeholder="เช่น สมชาย ใจดี"></label>
            <div class="st-actions"><button class="btn primary">บันทึกชื่อ</button></div></div></form>
        <form id="password-form" class="card st-form"><div class="card-h"><h2>เปลี่ยนรหัสผ่าน</h2><p>อย่างน้อย 6 ตัวอักษร · ผสมตัวพิมพ์ใหญ่ ตัวเลข สัญลักษณ์ จะปลอดภัยขึ้น</p></div>
          <div class="card-b"><label><span>รหัสผ่านใหม่</span><input type="password" name="password" autocomplete="new-password" minlength="6" required></label>
            <label><span>ยืนยันรหัสผ่านใหม่</span><input type="password" name="confirm" autocomplete="new-password" minlength="6" required></label>
            <div class="st-actions"><button class="btn primary">เปลี่ยนรหัสผ่าน</button></div></div></form>
      </div>
      <div class="card"><div class="card-h"><h2>สิ่งที่บัญชีนี้ทำได้</h2>${U.badge('info', `${mine.length} สิทธิ์`)}<p>ตาม Role ${esc(A.role ? PM.roleLabel(A.role) : '–')} — Role กำหนดโดย ${esc(PM.whoCan('roles.manage'))} · ดูทุก Role ได้ที่ <a href="#/settings/users">ผู้ใช้ & สิทธิ์</a></p></div>
        <div class="card-b">${mine.length ? `<ul class="st-perms">${mine.map((k) => `<li>${ico('check')}<span>${esc(PM.PERMISSIONS[k].label)}</span></li>`).join('')}</ul>` : '<p class="empty">บัญชีนี้ยังไม่มี Role — แจ้ง Admin ให้กำหนด</p>'}</div></div>`;
    },

    display() {
      return `<div class="card" id="prefs-card"><div class="card-h"><h2>ธีมและเมนู</h2><span class="spacer"></span><span class="muted" id="prefs-state"></span>
          <p>บันทึกในบัญชีของคุณ — เข้าสู่ระบบจากเครื่องไหน / เบราว์เซอร์ไหน ก็ได้การตั้งค่าเดียวกัน (ปุ่ม ◐ มุมขวาบน และปุ่มหุบเมนูก็บันทึกที่นี่)</p></div>
        <div class="card-b" id="prefs-body">${prefsBody()}</div></div>`;
    },

    org() {
      return `
      <div class="card"><div class="card-h"><h2>บริษัท</h2>${U.badge('neutral', 'ล็อคไว้')}<p>ชื่อบริษัทใช้บนหัวรายงาน PDF และเอกสารที่พิมพ์ทุกฉบับ — แก้ไขไม่ได้</p></div><div class="card-b">
        <div class="locked-field" aria-label="Company name (locked)">
          <span class="logo-plate st-logo">${PM.logoImg('')}</span>
          <div><b>${esc(PM.COMPANY)}</b><small>${esc(PM.APP_NAME)}</small></div>${LOCK}
        </div></div></div>
      ${PM.approvalSettingsHtml()}
      <div class="card"><div class="card-h"><h2>ตั้งค่าอื่นที่อยู่ในหน้าของมัน</h2><p>ตั้งค่าเหล่านี้แก้ได้ในหน้าที่ใช้งานจริง</p></div>
        <div class="card-b st-links">
          <a class="st-link" href="#/resources">${ico('calendar')}<span><b>วันหยุดนักขัตฤกษ์ · อัตราค่า OT</b><small>หน้าภาระงานบุคลากร → การ์ด OT → "ตั้งวันหยุด / อัตราค่า OT" · ${esc(PM.whoCan('ot.settings'))}</small></span><em>→</em></a>
          <a class="st-link" href="#/resources">${ico('people')}<span><b>คน · Level · อัตราค่าแรง</b><small>หน้าภาระงานบุคลากร → ตาราง Levels และรายชื่อ</small></span><em>→</em></a>
          <a class="st-link" href="#/projects">${ico('coins')}<span><b>เงื่อนไขการชำระเงินของโครงการ</b><small>เปิดโครงการ → แท็บงวดเงิน → "เงื่อนไขการชำระเงิน" (% เงินล่วงหน้า · Retention · เครดิต)</small></span><em>→</em></a>
          <a class="st-link" href="#/prices">${ico('tag')}<span><b>ราคาผู้ขาย (Price List)</b><small>ราคาอ้างอิงที่ BOQ ดึงไปใช้</small></span><em>→</em></a>
        </div></div>`;
    },

    users() {
      const A = PM.auth, canRoles = PM.can('roles.manage');
      return `
      ${canRoles ? `<div class="card">
        <div class="card-h"><h2>จัดการ Role ผู้ใช้</h2><span class="spacer"></span>
          <input type="search" id="st-user-q" class="st-search" placeholder="ค้นหาชื่อ / อีเมล" aria-label="ค้นหาผู้ใช้">
          <button class="btn sm" data-action="reload-users">รีเฟรช</button>
          <p>ผู้สมัครใหม่ได้ Role Technician อัตโนมัติ — เปลี่ยน Role จากตาราง (บันทึกทันที)${A && A.role !== 'admin' ? ' · ' + esc(PM.ROLE_RULES) : ''}${PM.can('users.delete') ? ' · ลบบัญชีผู้ใช้ได้เฉพาะ Admin' : ''}</p></div>
        <div class="card-b st-role-count" id="role-count"></div>
        <div class="card-b flush table-wrap" id="user-roles"><p class="empty">กำลังโหลดรายชื่อผู้ใช้…</p></div>
      </div>` : `<div class="card"><div class="card-b">${denied('roles.manage')}<p class="muted" style="margin:6px 0 0">Role ของคุณ: ${roleBadge(A && A.role)}</p></div></div>`}
      <div class="card">
        <div class="card-h"><h2>สิทธิ์การใช้งานตาม Role</h2><p>✓ = ทำได้ · คอลัมน์ที่ไฮไลต์คือ Role ของคุณ</p></div>
        <div class="card-b flush table-wrap">${matrix(A && A.role)}</div>
        <div class="card-b"><p class="perm-note">${LOCK}ลบงานใน Weekly Plan: ได้เฉพาะคนที่สร้างงานนั้น (งานเดิมที่ไม่มีข้อมูลผู้สร้าง — เฉพาะ Admin)</p>
          <p class="perm-note">${LOCK}กำหนด Role — ${esc(PM.ROLE_RULES)}</p></div>
      </div>`;
    },

    data() {
      const db = PM.db;
      const size = (() => { try { return new Blob([JSON.stringify(db)]).size; } catch (e) { return 0; } })();
      const canReset = PM.can('data.reset'), canImport = PM.can('data.import'), canExport = PM.can('data.export');
      const st = PM.cloud.state, ok = st === 'saved', warn = st === 'saving' || st === 'loading';
      const stats = [['งานประมูล', db.bids.length, 'proposal'], ['โครงการ', db.projects.length, 'building'], ['ใบสั่งซื้อ (PO)', (db.pos || []).length, 'truck'],
        ['รายการค่าใช้จ่าย', (db.costs || []).length, 'coins'], ['Timesheet', db.timesheets.length, 'clock'], ['งาน Weekly Plan', (db.plans || []).length, 'tasks'],
        ['บุคลากร', db.resources.length, 'people'], ['NCR', db.ncrs.length, 'quality'], ['บันทึกการประชุม', (db.meetings || []).length, 'calendar'], ['ราคาผู้ขาย', (db.prices || []).length, 'tag']];
      return `
      <div class="card st-cloud ${ok ? 'ok' : warn ? 'busy' : 'bad'}"><div class="card-b">
        <span class="st-cloud-ic">${ico('cloud')}</span>
        <div class="st-cloud-t"><b>${esc(cloudLabel())}</b>
          <span>บันทึกล่าสุด ${PM.cloud.savedAt ? esc(PM.cloud.savedAt.toLocaleString('en-GB')) : '–'} · ทุกการแก้ไขบันทึกขึ้น Supabase อัตโนมัติ</span>
          ${PM.cloud.detail && st !== 'saved' ? `<small>${esc(PM.cloud.detail)}</small>` : ''}</div>
        <button class="btn" data-action="sync-now" ${PM.cloud.enabled ? '' : 'disabled'}>ซิงค์ตอนนี้</button>
      </div>
      ${PM.cloud.localBackup() ? `<div class="card-b" style="padding-top:0"><p class="perm-note">มีสำเนาข้อมูลเดิมในเครื่องนี้ (ก่อนเชื่อม Cloud) · <button type="button" class="link-btn" data-action="download-local-backup">ดาวน์โหลด</button></p></div>` : ''}</div>

      <div class="card"><div class="card-h"><h2>ข้อมูลในระบบ</h2>${U.badge('neutral', `${U.num(size / 1024, 0)} KB`)}<p>จำนวนรายการของแต่ละส่วน</p></div>
        <div class="card-b st-stats">${stats.map(([l, n, i]) => `<div><i>${ico(i)}</i><b>${U.num(n)}</b><span>${esc(l)}</span></div>`).join('')}</div></div>

      <div class="card"><div class="card-h"><h2>สำรองและกู้คืน</h2><p>ข้อมูลหลักอยู่บน Cloud — Export เป็นไฟล์ JSON เก็บไว้เองเป็นระยะ</p></div>
        <div class="card-b st-backup">
          <div><b>Export JSON</b><small>ทุกข้อมูลในไฟล์เดียว · ใช้กู้คืนด้วย Import</small><button class="btn primary" data-action="export" ${canExport ? '' : 'disabled'}>${ico('download')} ดาวน์โหลด</button></div>
          <div><b>Import JSON</b><small>เขียนทับข้อมูลทั้งหมดด้วยไฟล์สำรอง</small>
            <label class="btn${canImport ? '' : ' disabled'}" ${canImport ? '' : 'aria-disabled="true"'}>${canImport ? '' : LOCK}เลือกไฟล์…<input type="file" accept="application/json,.json" id="import-file" hidden ${canImport ? '' : 'disabled'}></label></div>
          <div><b>Timesheet CSV</b><small>ชั่วโมงทำงานทุกคน เปิดใน Excel ได้</small><button class="btn" data-action="csv" ${canExport ? '' : 'disabled'}>${ico('download')} ดาวน์โหลด</button></div>
        </div>
        ${canImport && canExport ? '' : `<div class="card-b" style="padding-top:0">${canExport ? '' : denied('data.export')}${canImport ? '' : denied('data.import')}</div>`}</div>

      ${canReset ? `<div class="card st-danger"><div class="card-h"><h2>โซนอันตราย</h2>${U.badge('critical', 'Admin เท่านั้น')}<p>ย้อนกลับไม่ได้ — Export JSON เก็บไว้ก่อนทุกครั้ง</p></div>
        <div class="card-b st-danger-rows">
          <div><span><b>โหลดข้อมูลตัวอย่างใหม่ (Demo)</b><small>แทนที่ข้อมูลทั้งหมดด้วยข้อมูลสาธิต</small></span><button class="btn" data-action="demo">โหลด Demo</button></div>
          <div><span><b>ล้างข้อมูลทั้งหมด</b><small>เริ่มใช้งานจริงจากศูนย์ — ลบทุกงานประมูล โครงการ PO Timesheet ฯลฯ</small></span><button class="btn danger" data-action="empty">ล้างข้อมูล</button></div>
        </div></div>` : ''}`;
    },

    kpi() {
      const group = (title, icon, rows) => `<div class="card"><div class="card-h"><h2>${esc(title)}</h2></div>
        <div class="card-b"><dl class="st-formula">${rows.map(([k, f, n]) => `<dt>${esc(k)}</dt><dd><code>${f}</code>${n ? `<small>${n}</small>` : ''}</dd>`).join('')}</dl></div></div>`;
      return `<div class="grid cols-2">
        ${group('งานประมูล (Bidding)', 'proposal', [
          ['Win rate', 'Won ÷ (Won + Lost)', 'ไม่นับ No-bid และงานที่ยังรอผล'],
          ['Cycle time', 'วันที่ Submit − วันที่ Inquiry', 'เฉลี่ยของงานที่ยื่นแล้ว'],
          ['ยื่นตรงเวลา', 'งานที่ Submit ≤ Due date ÷ งานที่ยื่น', 'เป้า ≥ 90%'],
          ['เวลาในแต่ละขั้น', 'วันที่เข้าขั้นถัดไป − วันที่เข้าขั้นนี้', '']])}
        ${group('โครงการ (Execution)', 'scurve', [
          ['Progress', 'Σ (น้ำหนัก Phase × % เสร็จ)', ''],
          ['PV · EV', 'Σ (งบ × % ตามแผน) · Σ (งบ × % จริง)', 'Planned value · Earned value'],
          ['AC', 'ผลรวมรายการค่าใช้จ่ายที่นับแล้ว', 'รายการที่รออนุมัติยังไม่นับ'],
          ['SPI · CPI', 'EV ÷ PV · EV ÷ AC', '≥ 0.95 ตามแผน · 0.90–0.95 เฝ้าระวัง · &lt; 0.90 ต้องแก้ไข'],
          ['EAC', 'BAC ÷ CPI', 'ต้นทุนที่คาดว่าจะใช้ทั้งหมดเมื่อจบโครงการ']])}
        ${group('คุณภาพ & ความปลอดภัย', 'safety', [
          ['NCR', 'เปิดอยู่ / ทั้งหมด · วันเฉลี่ยที่ปิด', ''],
          ['LTIFR', 'LTI × 1,000,000 ÷ ชั่วโมงทำงาน', 'ต่อหนึ่งล้านชั่วโมงทำงาน'],
          ['TRIR', '(Recordable + LTI) × 200,000 ÷ ชั่วโมงทำงาน', '']])}
        ${group('บุคลากร (Resource)', 'people', [
          ['Utilization', '(ชม.โครงการ + ชม.ประมูล) ÷ (Capacity − ลา)', 'เทียบเป้าของแต่ละ Level'],
          ['Timesheet ครบ', 'ชม.ที่ลง ÷ Capacity', ''],
          ['PPC', 'งานที่เสร็จ ÷ งานในแผนสัปดาห์', 'เป้า ≥ 80%'],
          ['ค่า OT', 'ชม. OT × อัตราค่าแรงของ Level × ตัวคูณ', 'วันทำงาน 1.5× · วันหยุด 2× (8 ชม.แรก) · เกิน 3×']])}
      </div>`;
    },
  };

  /* ================= per-section wiring ================= */
  const BIND = {
    account(el) {
      const A = PM.auth;
      const busy = async (form, fn) => {
        const btn = form.querySelector('button');
        btn.disabled = true;
        try { await fn(); } catch (err) { U.alert(err.message); } finally { btn.disabled = false; }
      };
      const pf = el.querySelector('#profile-form');
      if (pf) pf.addEventListener('submit', (e) => {
        e.preventDefault();
        busy(pf, async () => { await A.updateProfile(pf.fullName.value.trim()); U.toast('บันทึกชื่อแล้ว'); PM.render(); });
      });
      const pwf = el.querySelector('#password-form');
      if (pwf) pwf.addEventListener('submit', (e) => {
        e.preventDefault();
        if (pwf.password.value !== pwf.confirm.value) { U.alert('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
        busy(pwf, async () => { await A.updatePassword(pwf.password.value); pwf.reset(); U.toast('เปลี่ยนรหัสผ่านแล้ว'); });
      });
    },
    display() { showPrefsState(); },
    users(el) { if (PM.can('roles.manage')) loadUsers(el); },
    data(el) {
      const inp = el.querySelector('#import-file');
      if (inp) inp.addEventListener('change', (e) => {
        if (!PM.can('data.import')) { U.toast('ไม่มีสิทธิ์ Import'); return; }
        const f = e.target.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = async () => {
          try {
            const data = JSON.parse(rd.result);
            const need = ['bids', 'projects', 'ncrs', 'safety', 'resources', 'levels', 'timesheets'];
            if (!need.every((k) => Array.isArray(data[k]))) throw new Error('missing collections');
            if (!(await U.confirm(`Import จะเขียนทับข้อมูลปัจจุบันทั้งหมดด้วยไฟล์ "${f.name}" — แนะนำให้ Export เก็บไว้ก่อน`, { title: 'Import ข้อมูล', ok: 'เขียนทับ' }))) return;
            PM.db = data; PM.ensureShape(); PM.lockCompany();
            PM.saveLocal(); PM.cloud.replaceAll();
            PM.applyAsOf(); U.toast('Import สำเร็จ — กำลังบันทึกขึ้น Cloud'); PM.render();
          } catch (err) { U.alert('ไฟล์ไม่ถูกต้อง: ' + err.message); }
        };
        rd.readAsText(f);
      });
    },
  };

  const download = (name, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  function onClick(el, e) {
    const pref = e.target.closest('[data-pref]');
    if (pref) { PM.prefs.set(pref.dataset.pref, pref.dataset.val); refreshPrefs(); return; }
    const a = e.target.closest('[data-action]');
    if (!a || a.disabled) return;
    const act = a.dataset.action, A = PM.auth;
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
        // OT inputs (clock-out time / no lunch) are not hours, so they are left out
        PM.db.timesheets.filter((t) => t.kind !== 'ot').sort((x, y) => (x.date < y.date ? -1 : 1)).map((t) => {
          const r = PM.find('resources', t.resourceId) || {};
          return [t.date, q(r.name), q(PM.levelName(r.level)), t.kind, q(name(t)), t.phase, t.hours].join(',');
        }));
      download(`timesheet-${PM.today()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
    }
    if ((act === 'demo' || act === 'empty') && !PM.can('data.reset')) { U.toast('ไม่มีสิทธิ์ Reset ข้อมูล'); return; }
    if (act === 'demo') U.confirm('แทนที่ข้อมูลทั้งหมดด้วยข้อมูลตัวอย่าง? ข้อมูลปัจจุบันจะหายทั้งหมด — แนะนำให้ Export ก่อน', { title: 'โหลดข้อมูลตัวอย่าง', ok: 'แทนที่' })
      .then((ok) => { if (ok) { PM.reset(false); PM.applyAsOf(); U.toast('โหลดข้อมูลตัวอย่างแล้ว'); PM.render(); } });
    if (act === 'empty') U.confirm('ลบข้อมูลทั้งหมด (งานประมูล โครงการ PO ค่าใช้จ่าย Timesheet บุคลากร ฯลฯ)? ลบแล้วกู้คืนไม่ได้ — แนะนำให้ Export ก่อน', { title: 'ล้างข้อมูลทั้งหมด', ok: 'ลบทั้งหมด' })
      .then((ok) => { if (ok) { PM.reset(true); PM.applyAsOf(); U.toast('ล้างข้อมูลแล้ว'); PM.render(); } });
  }

  /* ---------- display settings (saved on the account — app.js PM.prefs) ---------- */
  // theme: three picture cards · sidebar: two rows with a segmented control
  const THEMES = [['light', 'สว่าง', 'พื้นขาว อ่านง่ายในที่สว่าง'], ['dark', 'มืด', 'สบายตาในที่แสงน้อย'], ['system', 'ตามระบบ', 'สลับตามการตั้งค่าของเครื่อง']];
  function prefsBody() {
    const p = PM.prefs.get();
    const seg = (key, cur, items) => `<div class="seg" role="group">${items.map(([v, label]) =>
      `<button type="button" data-pref="${key}" data-val="${v}" class="${v === cur ? 'on' : ''}" aria-pressed="${v === cur}">${esc(label)}</button>`).join('')}</div>`;
    return `
      <div class="st-sub">ธีม</div>
      <div class="st-themes" role="group" aria-label="ธีม">${THEMES.map(([v, label, sub]) => `<button type="button" class="st-theme${p.theme === v ? ' on' : ''}" data-pref="theme" data-val="${v}" aria-pressed="${p.theme === v}">
        <span class="st-shot ${v}" aria-hidden="true"><i></i><i></i><i></i></span><b>${esc(label)}</b><small>${esc(sub)}</small></button>`).join('')}</div>
      <div class="st-sub">เมนูด้านซ้าย</div>
      <div class="pref-row"><div><b>จอคอมพิวเตอร์</b><small class="muted">จอกว้างกว่า 1,100 px</small></div>
        ${seg('nav', p.nav === '1' ? '1' : '0', [['0', 'แสดงเต็ม'], ['1', 'หุบเหลือไอคอน']])}</div>
      <div class="pref-row"><div><b>แท็บเล็ตแนวนอน / โน้ตบุ๊กจอเล็ก</b><small class="muted">จอ 901–1,100 px</small></div>
        ${seg('navCompact', p.navCompact === '0' ? '0' : '1', [['0', 'แสดงเต็ม'], ['1', 'หุบเหลือไอคอน']])}</div>`;
  }
  function showPrefsState() {
    const s = document.getElementById('prefs-state');
    if (!s) return;
    s.textContent = { saved: '● บันทึกในบัญชีแล้ว', saving: 'กำลังบันทึกในบัญชี…', error: 'บันทึกในบัญชีไม่สำเร็จ — ใช้ได้เฉพาะเครื่องนี้ (จะลองใหม่เมื่อเปลี่ยนค่า)', local: 'เก็บเฉพาะเครื่องนี้ (ยังไม่ได้เชื่อมบัญชี)' }[PM.prefs.state] || '';
    s.className = PM.prefs.state === 'error' ? 'neg' : 'muted';
  }
  function refreshPrefs() {
    const b = document.getElementById('prefs-body');
    if (b) b.innerHTML = prefsBody();
    showPrefsState();
  }
  document.addEventListener('pm-prefs', refreshPrefs); // saved / loaded from the account while Settings is open

  function cloudLabel() {
    const s = PM.cloud.state;
    return {
      saved: 'เชื่อมต่อแล้ว — ข้อมูลตรงกับ Cloud', saving: 'กำลังบันทึก…', loading: 'กำลังโหลด…',
      offline: 'ยังส่งขึ้น Cloud ไม่ได้ (เก็บไว้ในเครื่อง จะลองใหม่อัตโนมัติ)', denied: 'ไม่มีสิทธิ์บันทึก (บัญชียังไม่มี Role)',
      setup: 'ยังไม่ได้ติดตั้ง — รัน supabase/data.sql ใน Supabase', local: 'ไม่ได้เชื่อม Cloud — เก็บเฉพาะเครื่องนี้',
      idle: 'ยังไม่ได้เชื่อมต่อ Cloud',
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

  /* ---------- users & roles ---------- */
  async function loadUsers(el) {
    const box = el.querySelector('#user-roles');
    if (!box) return;
    box.innerHTML = '<p class="empty">กำลังโหลดรายชื่อผู้ใช้…</p>';
    try {
      const users = await PM.roles.list();
      if (!el.contains(box)) return;
      const me = PM.auth.user && PM.auth.user.id;
      const canDelete = PM.can('users.delete'); // Admin only — the column isn't shown to anyone else
      const count = el.querySelector('#role-count');
      if (count) count.innerHTML = `<span class="chip">ทั้งหมด ${users.length} คน</span>${PM.ROLES.map((r) => { const n = users.filter((u) => u.role === r.key).length; return n ? `<span class="chip">${esc(r.label)} ${n}</span>` : ''; }).join('')}`;
      box.innerHTML = users.length ? `<table class="tbl st-users"><thead><tr><th>ผู้ใช้</th><th>สมัครเมื่อ</th><th style="min-width:200px">Role</th>${canDelete ? '<th></th>' : ''}</tr></thead><tbody>
        ${users.map((u) => `<tr data-q="${esc(`${u.full_name || ''} ${u.email || ''}`.toLowerCase())}">
          <td><div class="st-user"><span class="st-avatar sm">${esc(initials(u.full_name || u.email))}</span><span><b>${esc(u.full_name || '–')}</b>${u.id === me ? ' <span class="chip">คุณ</span>' : ''}<small>${esc(u.email || '')}</small></span></div></td>
          <td class="nowrap">${u.created_at ? U.date(u.created_at.slice(0, 10)) : '–'}</td>
          <td>${roleCell(u, me)}</td>
          ${canDelete ? `<td class="num">${u.id === me ? '' : `<button type="button" class="btn sm danger" data-action="delete-user" data-id="${esc(u.id)}" data-name="${esc(u.full_name || u.email || '')}" data-email="${esc(u.email || '')}">ลบผู้ใช้</button>`}</td>` : ''}</tr>`).join('')}
        </tbody></table>` : '<p class="empty">ยังไม่มีผู้ใช้</p>';
      const q = el.querySelector('#st-user-q');
      if (q && q.value) filterUsers(el, q.value);
    } catch (err) {
      box.innerHTML = `<div class="card-b"><div class="auth-msg error">${esc(err.message)}</div></div>`;
    }
  }
  function filterUsers(el, text) {
    const t = String(text || '').trim().toLowerCase();
    el.querySelectorAll('.st-users tbody tr').forEach((tr) => { tr.hidden = !!t && !tr.dataset.q.includes(t); });
  }

  /* delete an account — Admin only (the database checks again) */
  async function deleteUser(el, btn) {
    if (!PM.can('users.delete')) return;
    const name = btn.dataset.name, email = btn.dataset.email;
    if (!(await U.confirm(`ลบบัญชี "${name}"${email && email !== name ? ` (${email})` : ''}?\n\nคนนี้จะเข้าสู่ระบบไม่ได้อีก และลบคืนไม่ได้\nข้อมูลโครงการ / Timesheet / งานที่เคยบันทึกไว้จะยังอยู่ครบ`, { title: 'ลบบัญชีผู้ใช้', ok: 'ลบบัญชี' }))) return;
    btn.disabled = true; btn.classList.add('loading');
    try {
      await PM.roles.remove(btn.dataset.id);
      U.toast(`ลบบัญชี ${name} แล้ว`);
      PM.roles.loadTeam();
      loadUsers(el);
    } catch (err) {
      btn.disabled = false; btn.classList.remove('loading');
      U.alert(err.message);
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
      U.alert('ไม่มีสิทธิ์ตั้ง Role นี้ — ' + PM.ROLE_RULES);
      return;
    }
    if (self && prev === 'admin' && role !== 'admin' && !(await U.confirm('คุณกำลังลด Role ของตัวเองจาก Admin — จะไม่สามารถจัดการ Role ได้อีก ดำเนินการต่อ?', { title: 'ลด Role ของตัวเอง', ok: 'ลด Role' }))) {
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
      U.alert(err.message);
    } finally {
      sel.disabled = false;
    }
  }
})();
