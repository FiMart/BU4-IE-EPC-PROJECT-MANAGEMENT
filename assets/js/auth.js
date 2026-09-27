/* auth.js — Supabase Auth: login, register, forgot / reset password, session gate */
(function () {
  const U = PM.ui, esc = U.esc;
  const cfg = window.PM_CONFIG || {};
  const A = (PM.auth = { client: null, user: null });
  let recovering = false;
  let signingOut = false;

  /* ---------- Supabase error → Thai message ---------- */
  const MSG = [
    [/invalid login credentials/i, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'],
    [/email not confirmed/i, 'ยังไม่ได้ยืนยันอีเมล — กรุณาคลิกลิงก์ยืนยันในอีเมลก่อนเข้าสู่ระบบ'],
    [/already registered|already been registered|already exists/i, 'อีเมลนี้ถูกใช้สมัครแล้ว — ลองเข้าสู่ระบบ หรือกด "ลืมรหัสผ่าน"'],
    [/password should be at least|password is too short/i, 'รหัสผ่านสั้นเกินไป (อย่างน้อย 6 ตัวอักษร)'],
    [/password.*(weak|pwned|leaked)/i, 'รหัสผ่านนี้คาดเดาง่ายหรือเคยรั่วไหล กรุณาตั้งรหัสผ่านใหม่ที่ปลอดภัยกว่า'],
    [/same.*password|different from the old/i, 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม'],
    [/rate limit|too many requests|security purposes/i, 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'],
    [/failed to fetch|networkerror|load failed/i, 'เชื่อมต่อ Supabase ไม่ได้ — ตรวจสอบอินเทอร์เน็ต หรือ supabaseUrl ใน config.js'],
    [/invalid api key|no api key/i, 'Supabase key ไม่ถูกต้อง — ตรวจสอบ supabaseAnonKey ใน config.js'],
    [/signups? not allowed|signup.*disabled/i, 'ระบบปิดรับสมัครสมาชิก — ติดต่อผู้ดูแลระบบ'],
    [/email address .* is invalid|unable to validate email|invalid format/i, 'รูปแบบอีเมลไม่ถูกต้อง'],
    [/expired|invalid.*(link|token)/i, 'ลิงก์หมดอายุหรือถูกใช้ไปแล้ว — กรุณาขอลิงก์ใหม่'],
  ];
  const thai = (err) => {
    const m = (err && (err.message || err.error_description || err.msg)) || String(err || '');
    const hit = MSG.find(([re]) => re.test(m));
    return hit ? hit[1] : m || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
  };

  /* Where Supabase email links (confirm / reset) should send the user back to.
     Only http(s) pages can receive them; a file:// page falls back to the project's Site URL. */
  const redirectUrl = () => (/^https?:$/.test(location.protocol) ? location.origin + location.pathname : undefined);

  A.displayName = (u) => (u && ((u.user_metadata && u.user_metadata.full_name) || u.email)) || '';
  const initials = (u) => {
    const n = A.displayName(u).replace(/@.*/, '').trim();
    // Thai leading vowels (เ แ โ ใ ไ) are written before the consonant — skip them for initials
    const parts = n.split(/\s+/).map((p) => p.replace(/^[เแโใไ]/, '')).filter(Boolean);
    return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  };

  /* ---------- screens ---------- */
  const pw = (name, auto, label) => `
    <label><span>${label}</span><div class="pw">
      <input type="password" name="${name}" autocomplete="${auto}" required minlength="6">
      <button type="button" class="link-btn pw-toggle" data-toggle-pw>แสดง</button></div></label>`;

  const VIEWS = {
    loading: () => '<p class="muted">กำลังตรวจสอบการเข้าสู่ระบบ…</p>',
    setup: () => `
      <h1>ตั้งค่าการเชื่อมต่อ Supabase</h1>
      <p class="muted">ยังไม่ได้ใส่ค่า Supabase จึงยังเข้าสู่ระบบไม่ได้</p>
      <ol class="auth-steps">
        <li>สร้างโปรเจกต์ที่ <b>supabase.com</b></li>
        <li>ไปที่ <b>Project Settings → API</b> คัดลอก <b>Project URL</b> และ <b>anon public key</b></li>
        <li>เปิดไฟล์ <code>assets/js/config.js</code> แล้ววางค่าลงใน <code>supabaseUrl</code> และ <code>supabaseAnonKey</code></li>
        <li>รีเฟรชหน้านี้</li>
      </ol>`,
    error: (o) => `<h1>เปิดระบบไม่สำเร็จ</h1><p class="muted">${esc(o.text || '')}</p><button class="btn primary block" type="button" onclick="location.reload()">ลองใหม่</button>`,
    login: () => `
      <h1>เข้าสู่ระบบ</h1>
      <p class="muted">ใช้อีเมลและรหัสผ่านที่สมัครไว้</p>
      <form class="auth-form" data-form="login" novalidate>
        <label><span>อีเมล</span><input type="email" name="email" autocomplete="email" required></label>
        ${pw('password', 'current-password', 'รหัสผ่าน')}
        <div class="auth-row"><span></span><button type="button" class="link-btn" data-go="forgot">ลืมรหัสผ่าน?</button></div>
        <button class="btn primary block" type="submit">เข้าสู่ระบบ</button>
      </form>
      <p class="auth-switch">ยังไม่มีบัญชี? <button type="button" class="link-btn" data-go="register">สมัครสมาชิก</button></p>`,
    register: () => `
      <h1>สมัครสมาชิก</h1>
      <p class="muted">สร้างบัญชีสำหรับใช้งาน ${esc(PM.APP_NAME)}</p>
      <form class="auth-form" data-form="register" novalidate>
        <label><span>ชื่อ-สกุล</span><input name="fullName" autocomplete="name" required></label>
        <label><span>อีเมล</span><input type="email" name="email" autocomplete="email" required></label>
        ${pw('password', 'new-password', 'รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)')}
        ${pw('confirm', 'new-password', 'ยืนยันรหัสผ่าน')}
        <button class="btn primary block" type="submit">สมัครสมาชิก</button>
      </form>
      <p class="auth-switch">มีบัญชีอยู่แล้ว? <button type="button" class="link-btn" data-go="login">เข้าสู่ระบบ</button></p>`,
    forgot: () => `
      <h1>ลืมรหัสผ่าน</h1>
      <p class="muted">กรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้</p>
      <form class="auth-form" data-form="forgot" novalidate>
        <label><span>อีเมล</span><input type="email" name="email" autocomplete="email" required></label>
        <button class="btn primary block" type="submit">ส่งลิงก์ตั้งรหัสผ่านใหม่</button>
      </form>
      ${redirectUrl() ? '' : '<p class="muted small">หมายเหตุ: ตอนนี้เปิดไฟล์โดยตรง (file://) ลิงก์ในอีเมลจะพาไปที่ Site URL ที่ตั้งไว้ใน Supabase — ควรเปิดแอปผ่าน http(s) เพื่อให้ลิงก์กลับมาที่หน้านี้</p>'}
      <p class="auth-switch"><button type="button" class="link-btn" data-go="login">← กลับไปเข้าสู่ระบบ</button></p>`,
    recovery: () => `
      <h1>ตั้งรหัสผ่านใหม่</h1>
      <p class="muted">กรอกรหัสผ่านใหม่สำหรับบัญชีของคุณ</p>
      <form class="auth-form" data-form="recovery" novalidate>
        ${pw('password', 'new-password', 'รหัสผ่านใหม่')}
        ${pw('confirm', 'new-password', 'ยืนยันรหัสผ่านใหม่')}
        <button class="btn primary block" type="submit">บันทึกรหัสผ่านใหม่</button>
      </form>`,
    sent: (o) => `
      <h1>ตรวจสอบอีเมลของคุณ</h1>
      <p>${esc(o.text)}</p>
      <p class="muted small">ไม่พบอีเมล? ลองดูในโฟลเดอร์ Spam / Junk</p>
      <p class="auth-switch"><button type="button" class="link-btn" data-go="login">← กลับไปเข้าสู่ระบบ</button></p>`,
  };

  const bars = [38, 52, 45, 60, 58, 72, 66, 80, 76, 88, 84, 95];
  const PREVIEW = `
    <div class="auth-preview" aria-hidden="true">
      <div><div class="k">Portfolio SPI</div><div class="v">0.97<small>▲ 0.03</small></div></div>
      <svg viewBox="0 0 200 56" preserveAspectRatio="none">
        <path class="spark-plan" d="M0,52 L200,6"/>
        <path class="spark" pathLength="1" d="M0,52 C25,50 40,44 62,38 S100,30 122,22 S160,12 186,9"/>
        <circle class="spark-dot" cx="186" cy="9" r="4.5"/>
      </svg>
      <div><div class="k">Utilization</div><div class="v" style="font-size:20px">82%</div></div>
      <div class="mini-bars">${bars.map((h, i) => `<i style="height:${h}%;animation-delay:${0.5 + i * 0.06}s"></i>`).join('')}</div>
    </div>`;

  const SIDE = `
    <span class="orb"></span><span class="gridlines"></span>
    <div class="auth-side-inner">
      <div class="brand"><div class="brand-mark">BU4</div><div><b>${esc(PM.COMPANY)}</b><small>Bidding · Execution · Resources</small></div></div>
      <h2>ติดตามงานตั้งแต่ประมูลจนส่งมอบ ในที่เดียว</h2>
      <ol class="auth-pillars">
        <li><b>Bidding Performance</b><span>Inquiry → Estimate → Proposal → Submit</span></li>
        <li><b>Execution (EPC)</b><span>Engineering → Procurement → Construction → Closing<br>KPI: Quantity · Time · Cost · Quality (NCR) · Safety</span></li>
        <li><b>Resource Utilization</b><span>Level · Timesheet</span></li>
      </ol>
      ${PREVIEW}
    </div>`;

  function screen(view, o = {}) {
    document.body.classList.remove('authed');
    const root = document.getElementById('auth-root');
    root.innerHTML = `<div class="auth-wrap">
      <main class="auth-main"><div class="auth-card">
        <div class="brand auth-brand-sm"><div class="brand-mark">BU4</div><div><b>BU4 IE/EPC Project Management</b><small>${esc(PM.COMPANY)}</small></div></div>
        ${o.notice ? `<div class="auth-msg ${o.notice.type || 'info'}" role="alert">${esc(o.notice.text)}</div>` : ''}
        ${VIEWS[view](o)}
      </div></main>
      <aside class="auth-side">${SIDE}</aside></div>`;
    const first = root.querySelector('input');
    if (first) first.focus();
  }

  /* one delegated handler for every auth screen */
  function bindRoot() {
    const root = document.getElementById('auth-root');
    root.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      if (go) { screen(go.dataset.go); return; }
      const t = e.target.closest('[data-toggle-pw]');
      if (t) {
        const inp = t.parentElement.querySelector('input');
        inp.type = inp.type === 'password' ? 'text' : 'password';
        t.textContent = inp.type === 'password' ? 'แสดง' : 'ซ่อน';
      }
    });
    root.addEventListener('submit', async (e) => {
      const form = e.target.closest('form[data-form]');
      if (!form) return;
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const f = U.formData(form);
      const kind = form.dataset.form;
      if ((kind === 'register' || kind === 'recovery') && f.password !== f.confirm) {
        showError(form, 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return;
      }
      const btn = form.querySelector('[type=submit]');
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = 'กำลังดำเนินการ…'; btn.classList.add('loading');
      try {
        await ACTIONS[kind](f);
      } catch (err) {
        if (document.body.contains(form)) showError(form, thai(err));
      } finally {
        if (document.body.contains(btn)) { btn.disabled = false; btn.textContent = label; btn.classList.remove('loading'); }
      }
    });
  }

  function showError(form, text) {
    const card = form.closest('.auth-card');
    let box = card.querySelector('.auth-msg');
    if (!box) { box = document.createElement('div'); box.setAttribute('role', 'alert'); card.insertBefore(box, card.children[1]); }
    box.className = 'auth-msg error';
    box.textContent = text;
    box.style.animation = 'none'; void box.offsetWidth; box.style.animation = ''; // replay the shake
  }

  const ACTIONS = {
    async login(f) {
      const { data, error } = await A.client.auth.signInWithPassword({ email: f.email, password: f.password });
      if (error) throw error;
      await enter(data.user);
    },
    async register(f) {
      const { data, error } = await A.client.auth.signUp({
        email: f.email, password: f.password,
        options: { data: { full_name: f.fullName }, emailRedirectTo: redirectUrl() },
      });
      if (error) throw error;
      if (data.session) { await enter(data.user); U.toast('สมัครสมาชิกสำเร็จ'); return; }
      // With "Confirm email" on, Supabase returns a user with no identities when the email is already taken
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('User already registered');
      screen('sent', { text: `เราส่งลิงก์ยืนยันไปที่ ${f.email} แล้ว — คลิกลิงก์ในอีเมลเพื่อยืนยันบัญชี จากนั้นกลับมาเข้าสู่ระบบ` });
    },
    async forgot(f) {
      const { error } = await A.client.auth.resetPasswordForEmail(f.email, { redirectTo: redirectUrl() });
      if (error) throw error;
      screen('sent', { text: `ถ้ามีบัญชีที่ใช้อีเมล ${f.email} ระบบได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปแล้ว` });
    },
    async recovery(f) {
      const { data, error } = await A.client.auth.updateUser({ password: f.password });
      if (error) throw error;
      recovering = false;
      await enter(data.user);
      U.toast('ตั้งรหัสผ่านใหม่เรียบร้อย');
    },
  };

  /* ---------- signed-in state ---------- */
  async function enter(user) {
    A.user = user;
    await A.refreshRole();
    if (A.user !== user) return; // signed out while the role was loading
    document.getElementById('auth-root').innerHTML = '';
    document.body.classList.add('authed');
    renderUserBox();
    PM.boot();
  }

  /* Role comes from Supabase table public.profiles (see roles.js / supabase/roles.sql) */
  A.refreshRole = async function () {
    const { role, error } = await PM.roles.loadMine(A.user);
    A.role = role;
    A.roleError = error;
    renderUserBox();
  };

  function renderUserBox() {
    const box = document.getElementById('user-box');
    if (!box || !A.user) return;
    box.innerHTML = `
      <a class="avatar" href="#/settings" title="บัญชีผู้ใช้">${esc(initials(A.user))}</a>
      <div class="who" title="${esc(A.user.email || '')}"><b>${esc(A.displayName(A.user))}</b><small>${esc(A.role ? PM.roleLabel(A.role) : 'ยังไม่มี Role')} · ${esc(A.user.email || '')}</small></div>
      <button class="icon-btn" type="button" data-logout title="ออกจากระบบ" aria-label="ออกจากระบบ">
        <svg viewBox="0 0 24 24"><path d="M15 17l5-5-5-5M20 12H9M12 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/></svg></button>`;
    box.querySelector('[data-logout]').addEventListener('click', A.signOut);
  }

  A.signOut = async function () {
    if (!confirm('ต้องการออกจากระบบหรือไม่?')) return;
    U.closeModal();
    await PM.cloud.flush(); // send any unsaved edits before the session ends
    signingOut = true;
    const { error } = await A.client.auth.signOut();
    signingOut = false;
    if (error) { U.toast(thai(error)); return; }
    leave({ type: 'success', text: 'ออกจากระบบเรียบร้อย' });
  };

  function leave(notice) {
    A.user = null;
    A.role = null;
    PM.cloud.stop();
    document.getElementById('view').innerHTML = '';
    const box = document.getElementById('user-box');
    if (box) box.innerHTML = '';
    screen('login', { notice });
  }

  A.updateProfile = async function (fullName) {
    const { data, error } = await A.client.auth.updateUser({ data: { full_name: fullName } });
    if (error) throw new Error(thai(error));
    A.user = data.user; renderUserBox();
  };
  A.updatePassword = async function (password) {
    const { error } = await A.client.auth.updateUser({ password });
    if (error) throw new Error(thai(error));
  };

  /* ---------- start ---------- */
  function hashError() {
    const h = location.hash.replace(/^#/, '');
    if (!/(^|&)error(_description)?=/.test(h)) return null;
    const p = new URLSearchParams(h);
    history.replaceState(null, '', location.pathname + location.search);
    return thai({ message: p.get('error_description') || p.get('error') });
  }

  async function start() {
    bindRoot();
    const err = hashError();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) { screen('setup'); return; }
    if (!window.supabase || !window.supabase.createClient) {
      screen('error', { text: 'โหลด Supabase library ไม่สำเร็จ — ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อเข้าสู่ระบบ' });
      return;
    }
    screen('loading');
    try {
      A.client = window.supabase.createClient(cfg.supabaseUrl.trim(), cfg.supabaseAnonKey.trim(), {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    } catch (e) {
      screen('error', { text: 'ค่าใน config.js ไม่ถูกต้อง: ' + e.message });
      return;
    }
    A.client.auth.onAuthStateChange((event, session) => {
      // keep this callback synchronous — Supabase warns against awaiting auth calls inside it
      if (event === 'PASSWORD_RECOVERY') { recovering = true; screen('recovery'); return; }
      if (event === 'SIGNED_OUT' && A.user && !signingOut) { leave({ type: 'info', text: 'Session หมดอายุหรือออกจากระบบจากหน้าต่างอื่น กรุณาเข้าสู่ระบบอีกครั้ง' }); return; }
      if (session && A.user && (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED')) { A.user = session.user; renderUserBox(); }
    });
    const { data, error } = await A.client.auth.getSession();
    if (recovering) return;
    if (data && data.session) await enter(data.session.user);
    else screen('login', err || error ? { notice: { type: 'error', text: err || thai(error) } } : {});
  }

  start();
})();
