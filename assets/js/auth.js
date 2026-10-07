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
    [/email not confirmed/i, 'บัญชีนี้ยังไม่ได้ยืนยันอีเมล — แจ้ง Admin ให้ยืนยันบัญชีใน Supabase (หรือรัน supabase/confirm-users.sql)'],
    // Supabase's built-in mailer only sends to team members' addresses; other domains fail while "Confirm email" is on
    [/not authorized/i, 'สมัครด้วยอีเมลนี้ยังไม่ได้ เพราะระบบยังเปิด "Confirm email" อยู่ — แจ้ง Admin ให้ปิดใน Supabase (Authentication → Email)'],
    [/error sending (confirmation|recovery|magic link)? ?email|sending email/i, 'ระบบส่งอีเมลไม่สำเร็จ — แจ้ง Admin ตรวจสอบการตั้งค่าอีเมลใน Supabase'],
    [/already registered|already been registered|already exists/i, 'อีเมลนี้ถูกใช้สมัครแล้ว — ลองเข้าสู่ระบบ หรือกด "ลืมรหัสผ่าน"'],
    [/password should be at least|password is too short/i, 'รหัสผ่านสั้นเกินไป (อย่างน้อย 6 ตัวอักษร)'],
    [/password.*(weak|pwned|leaked)/i, 'รหัสผ่านนี้คาดเดาง่ายหรือเคยรั่วไหล กรุณาตั้งรหัสผ่านใหม่ที่ปลอดภัยกว่า'],
    [/same.*password|different from the old/i, 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม'],
    [/email rate limit/i, 'ระบบส่งอีเมลครบโควตาแล้ว (ระบบอีเมลพื้นฐานของ Supabase ส่งได้ประมาณ 2 ฉบับ/ชั่วโมง) — รอสักพักแล้วลองใหม่ หรือแจ้ง Admin'],
    [/rate limit|too many requests|security purposes/i, 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'],
    [/failed to fetch|networkerror|load failed/i, 'เชื่อมต่อ Supabase ไม่ได้ — ตรวจสอบอินเทอร์เน็ต หรือ supabaseUrl ใน config.js'],
    [/invalid api key|no api key/i, 'Supabase key ไม่ถูกต้อง — ตรวจสอบ supabaseAnonKey ใน config.js'],
    [/signups? not allowed|signup.*disabled/i, 'ระบบปิดรับสมัครสมาชิก — ติดต่อผู้ดูแลระบบ'],
    [/unable to validate email|invalid format/i, 'รูปแบบอีเมลไม่ถูกต้อง'],
    [/expired|invalid.*(link|token)/i, 'ลิงก์หมดอายุหรือถูกใช้ไปแล้ว — กรุณาขอลิงก์ใหม่'],
  ];
  // The browser already checks the e-mail format before submitting, so when Supabase answers
  // "email_address_invalid" for a well-formed address it is a server policy — almost always
  // "Confirm email" still ON: the built-in mailer can only send to Supabase team members.
  const EMAIL_REJECTED = 'Supabase ไม่รับอีเมลนี้ (รูปแบบอีเมลถูกต้องแล้ว) — สาเหตุ: ระบบยังเปิด "Confirm email" อยู่ จึงส่งอีเมลยืนยันไปอีเมลโดเมนนี้ไม่ได้ · แจ้ง Admin ให้ปิด Confirm email ใน Supabase (Authentication → Sign In / Providers → Email)';
  // Password reset always needs an e-mail, so the fix there is Custom SMTP (not the Confirm-email switch)
  const RECOVERY_REJECTED = 'ส่งอีเมลรีเซ็ตรหัสผ่านไปอีเมลนี้ไม่ได้ — ระบบอีเมลพื้นฐานของ Supabase ส่งได้เฉพาะอีเมลของสมาชิกทีม Supabase · แจ้ง Admin ให้ตั้ง Custom SMTP หรือให้ Admin ตั้งรหัสผ่านใหม่ให้';
  const thai = (err, context) => {
    const code = err && err.code;
    const m = (err && (err.message || err.error_description || err.msg)) || String(err || '');
    const rejected = code === 'email_address_invalid' || code === 'email_address_not_authorized' || /email address .* (is invalid|not authorized)/i.test(m);
    if (rejected) return context === 'forgot' ? RECOVERY_REJECTED : EMAIL_REJECTED;
    if (code === 'over_email_send_rate_limit') return 'ระบบส่งอีเมลครบโควตาแล้ว (ระบบอีเมลพื้นฐานของ Supabase ส่งได้ประมาณ 2 ฉบับ/ชั่วโมง) — รอสักพักแล้วลองใหม่ หรือแจ้ง Admin';
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
  const ICON = {
    mail: '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

  // a labelled input with a leading icon; extra = more <input> attributes · hint = small text under it
  const field = (icon, label, attrs, hint) => `
    <label class="auth-field"><span>${label}</span>
      <div class="auth-input">${svg(icon)}<input ${attrs}></div>${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;
  // password: eye button to show / hide · meter = strength bar (new passwords) · match = must equal the "password" field
  const pw = (name, auto, label, opt = {}) => `
    <label class="auth-field"><span>${label}</span>
      <div class="auth-input pw">${svg('lock')}
        <input type="password" name="${name}" autocomplete="${auto}" required minlength="6"${opt.match ? ' data-match="password"' : ''}>
        <button type="button" class="pw-toggle" data-toggle-pw aria-label="แสดงรหัสผ่าน" aria-pressed="false">${svg('eye')}</button></div>
      ${opt.meter ? '<div class="pw-meter" data-meter aria-live="polite"><i></i><i></i><i></i><i></i><small>อย่างน้อย 6 ตัวอักษร · ผสมตัวพิมพ์ใหญ่ ตัวเลข สัญลักษณ์ จะปลอดภัยขึ้น</small></div>' : ''}
      ${opt.match ? '<small class="pw-match" data-match-hint aria-live="polite"></small>' : ''}</label>`;
  // login ⇄ register switch at the top of the card
  const tabs = (on) => `<div class="auth-tabs" role="tablist">
      <button type="button" role="tab" data-go="login" aria-selected="${on === 'login'}" class="${on === 'login' ? 'on' : ''}">เข้าสู่ระบบ</button>
      <button type="button" role="tab" data-go="register" aria-selected="${on === 'register'}" class="${on === 'register' ? 'on' : ''}">สมัครสมาชิก</button></div>`;

  /* 0–4: length 8+ / 12+, mixed case, a digit, a symbol (under 6 = too short) */
  const STRENGTH = [['สั้นเกินไป', 'critical'], ['อ่อน', 'critical'], ['พอใช้', 'warning'], ['ดี', 'good'], ['แข็งแรง', 'good']];
  const strength = (v) => {
    if (v.length < 6) return 0;
    let s = 1;
    if (v.length >= 8 && /[a-z]/.test(v) && /[A-Z]/.test(v)) s++;
    if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) s++;
    if (v.length >= 12 || (v.length >= 8 && /\d/.test(v) && /[A-Za-z]/.test(v))) s++;
    return Math.min(4, s);
  };

  // the last e-mail that signed in on this browser — saves typing it again (convenience only)
  const LAST_EMAIL = 'epc-pm-last-email';
  const lastEmail = () => { try { return localStorage.getItem(LAST_EMAIL) || ''; } catch (e) { return ''; } };

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
      ${tabs('login')}
      <div class="auth-head"><h1>ยินดีต้อนรับกลับ</h1><p class="muted">เข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่สมัครไว้</p></div>
      <form class="auth-form" data-form="login" novalidate>
        ${field('mail', 'อีเมล', `type="email" name="email" autocomplete="email" placeholder="name@company.com" required value="${esc(lastEmail())}"`)}
        ${pw('password', 'current-password', 'รหัสผ่าน')}
        <div class="auth-row"><span></span><button type="button" class="link-btn" data-go="forgot">ลืมรหัสผ่าน?</button></div>
        <button class="btn primary block" type="submit">เข้าสู่ระบบ</button>
      </form>
      <p class="auth-switch">ยังไม่มีบัญชี? <button type="button" class="link-btn" data-go="register">สมัครสมาชิก</button></p>`,
    register: () => `
      ${tabs('register')}
      <div class="auth-head"><h1>สร้างบัญชีใหม่</h1><p class="muted">สำหรับใช้งาน ${esc(PM.APP_NAME)} · Admin จะกำหนด Role ให้หลังสมัคร</p></div>
      <form class="auth-form" data-form="register" novalidate>
        ${field('user', 'ชื่อ-สกุล', 'name="fullName" autocomplete="name" placeholder="เช่น สมชาย ใจดี" required')}
        ${field('mail', 'อีเมล', 'type="email" name="email" autocomplete="email" placeholder="name@company.com" required', 'ใช้อีเมลโดเมนใดก็ได้ ไม่จำกัดเฉพาะ @flowlabservice.co.th')}
        ${pw('password', 'new-password', 'รหัสผ่าน', { meter: true })}
        ${pw('confirm', 'new-password', 'ยืนยันรหัสผ่าน', { match: true })}
        <button class="btn primary block" type="submit">สมัครสมาชิก</button>
      </form>
      <p class="auth-switch">มีบัญชีอยู่แล้ว? <button type="button" class="link-btn" data-go="login">เข้าสู่ระบบ</button></p>`,
    forgot: () => `
      <div class="auth-head"><h1>ลืมรหัสผ่าน</h1>
      <p class="muted">กรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้</p></div>
      <form class="auth-form" data-form="forgot" novalidate>
        ${field('mail', 'อีเมล', `type="email" name="email" autocomplete="email" placeholder="name@company.com" required value="${esc(lastEmail())}"`)}
        <button class="btn primary block" type="submit">ส่งลิงก์ตั้งรหัสผ่านใหม่</button>
      </form>
      ${redirectUrl() ? '' : '<p class="muted small">หมายเหตุ: ตอนนี้เปิดไฟล์โดยตรง (file://) ลิงก์ในอีเมลจะพาไปที่ Site URL ที่ตั้งไว้ใน Supabase — ควรเปิดแอปผ่าน http(s) เพื่อให้ลิงก์กลับมาที่หน้านี้</p>'}
      <p class="auth-switch"><button type="button" class="link-btn" data-go="login">← กลับไปเข้าสู่ระบบ</button></p>`,
    recovery: () => `
      <div class="auth-head"><h1>ตั้งรหัสผ่านใหม่</h1>
      <p class="muted">กรอกรหัสผ่านใหม่สำหรับบัญชีของคุณ</p></div>
      <form class="auth-form" data-form="recovery" novalidate>
        ${pw('password', 'new-password', 'รหัสผ่านใหม่', { meter: true })}
        ${pw('confirm', 'new-password', 'ยืนยันรหัสผ่านใหม่', { match: true })}
        <button class="btn primary block" type="submit">บันทึกรหัสผ่านใหม่</button>
      </form>`,
    sent: (o) => `
      <div class="auth-head"><span class="auth-badge">${svg('mail')}</span><h1>ตรวจสอบอีเมลของคุณ</h1></div>
      <p>${esc(o.text)}</p>
      ${o.forgot ? `<div class="auth-help">
        <b>ไม่ได้รับอีเมลภายใน 5 นาที?</b>
        <ul>
          <li>ดูในโฟลเดอร์ Spam / Junk / Promotions</li>
          <li>ตรวจว่าอีเมลตรงกับที่ใช้สมัคร — ถ้าไม่มีบัญชีนี้ ระบบจะไม่ส่งอีเมล</li>
          <li>ระบบส่งอีเมลได้จำกัดต่อชั่วโมง ลองใหม่ภายหลัง</li>
          <li>ยังไม่ได้รับ: แจ้ง Admin ให้ตั้งรหัสผ่านใหม่ให้</li>
        </ul>
      </div>` : '<p class="muted small">ไม่พบอีเมล? ลองดูในโฟลเดอร์ Spam / Junk</p>'}
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
    <div class="brand"><div class="brand-mark">BU4</div><div><b>BU4 IE/EPC Project Management</b><small>${esc(PM.COMPANY)}</small></div></div>
    <div class="auth-side-inner">
      <div class="auth-pitch">
        <span class="auth-eyebrow">Bidding · Execution · Resources</span>
        <h2>ติดตามงานตั้งแต่ประมูลจนส่งมอบ ในที่เดียว</h2>
        <p>ภาพรวม KPI ของทุกโครงการ — ประมูล · EPC · ต้นทุน · PO · คน — อัปเดตจากทีมแบบเรียลไทม์</p>
      </div>
      ${PREVIEW}
      <ol class="auth-pillars">
        <li><b>Bidding</b><span>Inquiry → Submit</span></li>
        <li><b>Execution (EPC)</b><span>SPI · CPI · NCR · Safety</span></li>
        <li><b>Resources</b><span>Utilization · Timesheet</span></li>
      </ol>
    </div>
    <div class="auth-side-foot">© ${new Date().getFullYear()} ${esc(PM.COMPANY)} · v${esc(PM.VERSION || '')}</div>`;

  function screen(view, o = {}) {
    // checking the saved session: the loading screen covers it · any real screen (login, register …) takes over
    if (view === 'loading') PM.splash.show('กำลังตรวจสอบการเข้าสู่ระบบ…'); else PM.splash.hide();
    document.body.classList.remove('authed');
    const root = document.getElementById('auth-root');
    const card = `<div class="auth-card auth-${view}">
        <div class="brand auth-brand-sm"><div class="brand-mark">BU4</div><div><b>BU4 IE/EPC Project Management</b><small>${esc(PM.COMPANY)}</small></div></div>
        ${o.notice ? `<div class="auth-msg ${o.notice.type || 'info'}" role="alert">${esc(o.notice.text)}</div>` : ''}
        ${VIEWS[view](o)}
      </div>`;
    // switching login ⇄ register ⇄ forgot swaps only the card — the brand panel stays put (no re-draw / re-fade)
    const main = root.querySelector('.auth-main');
    if (main) main.innerHTML = card;
    else root.innerHTML = `<div class="auth-wrap"><main class="auth-main">${card}</main><aside class="auth-side">${SIDE}</aside></div>`;
    // start where the typing is: the first empty field (login with a remembered e-mail → the password)
    const first = Array.from(root.querySelectorAll('input')).find((i) => !i.value) || root.querySelector('input');
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
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        t.innerHTML = svg(show ? 'eyeOff' : 'eye');
        t.setAttribute('aria-pressed', String(show));
        t.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
      }
    });
    // live feedback on new passwords: strength bar + "matches" under the confirm field
    root.addEventListener('input', (e) => {
      const form = e.target.closest('form[data-form]');
      if (!form || !form.password) return;
      const meter = form.querySelector('[data-meter]');
      if (meter && e.target.name === 'password') {
        const v = form.password.value, s = strength(v), [label, level] = STRENGTH[s];
        meter.className = 'pw-meter' + (v ? ' lv-' + level : '');
        meter.querySelectorAll('i').forEach((i, n) => i.classList.toggle('on', !!v && n < Math.max(1, s)));
        meter.querySelector('small').textContent = v ? `ความปลอดภัย: ${label}` : 'อย่างน้อย 6 ตัวอักษร · ผสมตัวพิมพ์ใหญ่ ตัวเลข สัญลักษณ์ จะปลอดภัยขึ้น';
      }
      const hint = form.querySelector('[data-match-hint]');
      if (hint && form.confirm) {
        const c = form.confirm.value, ok = c && c === form.password.value;
        hint.className = 'pw-match' + (c ? (ok ? ' ok' : ' bad') : '');
        hint.textContent = c ? (ok ? '✓ รหัสผ่านตรงกัน' : 'รหัสผ่านยังไม่ตรงกัน') : '';
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
        if (document.body.contains(form)) showError(form, thai(err, kind));
      } finally {
        if (document.body.contains(btn)) { btn.disabled = false; btn.textContent = label; btn.classList.remove('loading'); }
      }
    });
  }

  function showError(form, text) {
    const card = form.closest('.auth-card');
    let box = card.querySelector('.auth-msg');
    if (!box) { box = document.createElement('div'); box.setAttribute('role', 'alert'); form.parentElement.insertBefore(box, form); }
    box.className = 'auth-msg error';
    box.textContent = text;
    box.style.animation = 'none'; void box.offsetWidth; box.style.animation = ''; // replay the shake
  }

  const ACTIONS = {
    async login(f) {
      const { data, error } = await A.client.auth.signInWithPassword({ email: f.email, password: f.password });
      if (error) throw error;
      try { localStorage.setItem(LAST_EMAIL, f.email); } catch (e) { /* private mode — just not remembered */ }
      await enter(data.user, true);
    },
    async register(f) {
      const { data, error } = await A.client.auth.signUp({
        email: f.email, password: f.password,
        options: { data: { full_name: f.fullName }, emailRedirectTo: redirectUrl() },
      });
      if (error) throw error;
      if (data.session) { await enter(data.user, true); U.toast('สมัครสมาชิกสำเร็จ'); return; }
      // With "Confirm email" on, Supabase returns a user with no identities when the email is already taken
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('User already registered');
      screen('sent', { text: `เราส่งลิงก์ยืนยันไปที่ ${f.email} แล้ว — คลิกลิงก์ในอีเมลเพื่อยืนยันบัญชี จากนั้นกลับมาเข้าสู่ระบบ` });
    },
    async forgot(f) {
      const { error } = await A.client.auth.resetPasswordForEmail(f.email, { redirectTo: redirectUrl() });
      if (error) throw error;
      screen('sent', { forgot: true, text: `ถ้ามีบัญชีที่ใช้อีเมล ${f.email} ระบบได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปแล้ว (ลิงก์ใช้ได้ 1 ชั่วโมง)` });
    },
    async recovery(f) {
      const { data, error } = await A.client.auth.updateUser({ password: f.password });
      if (error) throw error;
      recovering = false;
      await enter(data.user, true);
      U.toast('ตั้งรหัสผ่านใหม่เรียบร้อย');
    },
  };

  /* ---------- signed-in state ---------- */
  /* fresh = just logged in / registered / set a new password → always start on the Dashboard */
  async function enter(user, fresh) {
    A.user = user;
    PM.splash.show(fresh ? 'เข้าสู่ระบบสำเร็จ — กำลังเปิด Dashboard…' : 'กำลังโหลดข้อมูล…');
    if (fresh) PM.goStart();
    await A.refreshRole();
    if (A.user !== user) { PM.splash.hide(); return; } // signed out while the role was loading
    PM.prefs.load(user); // this account's display settings (theme, sidebar) — on every device it signs in on
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
