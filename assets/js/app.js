/* app.js — hash router, theme, boot */
(function () {
  const routes = [
    [/^#\/dashboard$/, 'dashboard', 'Dashboard', 'ภาพรวม'],
    [/^#\/bidding$/, 'bidding', 'Bidding Performance', 'Before Award · Inquiry → Estimate → Proposal → Submit'],
    // one page per bidding step; title / crumb are worked out from the step (see render)
    [/^#\/bidding\/(inquiry|estimate|proposal|submit|award)$/, 'bidstage', (m) => `Bidding · ${m[1] === 'award' ? 'Award' : PM.bidStageLabel(m[1])}`,
      (m) => (m[1] === 'award' ? 'Before Award · ผลการประมูล' : `Before Award · ขั้นที่ ${PM.BID_STAGES.findIndex((s) => s.key === m[1]) + 1} — ${PM.BID_STAGES.find((s) => s.key === m[1]).th}`)],
    [/^#\/projects$/, 'projects', 'Projects (EPC Execution)', 'Engineering → Procurement → Construction → Closing'],
    [/^#\/projects\/([\w-]+)(?:\/(\w+))?$/, 'project', 'Project', 'Execution'],
    [/^#\/pos$/, 'pos', 'Purchase Orders', 'ติดตาม PO · ส่งของ · การจ่ายเงิน · ไฟล์แนบ'],
    [/^#\/prices$/, 'prices', 'Price List / Vendor Cost', 'ราคาผู้ขาย · เปรียบเทียบราคา · Export Excel / PDF'],
    [/^#\/weekly$/, 'weekly', 'Weekly Plan', 'แผนงานรายสัปดาห์ · PPC · ภาระงาน'],
    [/^#\/resources$/, 'resources', 'Resource Utilization', 'Level · Utilization · Loading'],
    [/^#\/timesheet$/, 'timesheet', 'Timesheet', 'Resource Utilization'],
    [/^#\/settings$/, 'settings', 'Settings', 'System'],
    [/^#\/help(?:\/(\w+))?$/, 'help', 'Help', 'คู่มือการใช้งานทุกหน้า'],
    [/^#\/present$/, 'present', 'โหมดนำเสนอ', 'นำเสนอขึ้นจอ'],
    [/^#\/about$/, 'about', 'About', 'เวอร์ชันและประวัติการแก้ไข'],
  ];

  function render() {
    const hash = location.hash || '#/dashboard';
    let match = null, route = null;
    for (const r of routes) { match = hash.match(r[0]); if (match) { route = r; break; } }
    if (!route) { location.hash = '#/dashboard'; return; }
    const el = document.getElementById('view');
    applyRoleNav();
    // presentation mode: the page takes the whole screen (no sidebar, top bar, banner or tab bar — CSS)
    document.body.classList.toggle('presenting', route[1] === 'present');
    // pages a role may not open (menu items are hidden too) — e.g. Resources: Admin / Department Manager / Project Manager
    const need = PAGE_PERM[route[1]];
    if (need && PM.auth && PM.auth.user && !PM.can(need)) {
      PM.ui.toast('หน้านี้เปิดได้เฉพาะ Admin, Department Manager และ Project Manager');
      PM.goStart();
      if (location.hash !== hash) return render();
    }
    const text = (x) => (typeof x === 'function' ? x(match) : x);
    document.getElementById('page-title').textContent = text(route[2]);
    document.getElementById('crumb').textContent = text(route[3]);
    const stage = route[1] === 'bidstage' ? match[1] : null;
    document.querySelectorAll('#nav a, #tabbar a').forEach((a) => {
      const key = a.dataset.route;
      const on = key === route[1] || (key === 'projects' && route[1] === 'project')
        // step pages: the step's sub-item in the sidebar, "Bidding" on the bottom tab bar
        || (stage && (key === 'bidding/' + stage || (key === 'bidding' && !!a.closest('#tabbar'))));
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    // pages that are not on the bottom tab bar light up "เพิ่มเติม"
    document.getElementById('tab-more').classList.toggle('active', !document.querySelector('#tabbar a.active'));
    // the Bidding step links in the sidebar show only while a Bidding page is open
    document.getElementById('nav').classList.toggle('in-bidding', route[1] === 'bidding' || !!stage);
    el.onclick = null; el.onchange = null; el.oninput = null; el.onkeydown = null;
    el.ondragstart = el.ondragend = el.ondragover = el.ondragleave = el.ondrop = null;
    PM.illus.hero(stage ? 'bid-' + stage : route[1], PM.help.topicFor(route[1]));
    if (PM.cloud.waiting()) { // never show (or let anyone edit) the local demo copy instead of the real data
      lastAnimated = null;
      el.innerHTML = skeleton(`ยังโหลดข้อมูลจาก Cloud ไม่ได้ — กำลังลองใหม่อัตโนมัติ <button type="button" class="btn sm" data-sync-retry>ลองใหม่ตอนนี้</button>`);
      return;
    }
    PM.views[route[1]](el, match.slice(1));
    if (hash !== lastAnimated) { // animate on navigation only, not on resize / data refresh
      lastAnimated = hash;
      PM.motion.enter(el);
      PM.motion.countUp(el);
      PM.motion.reveal(el);
    }
    PM.motion.centerTabs(el);
  }
  let lastAnimated = null;
  PM.render = render;

  /* pages behind a permission (roles.js) — their menu entries (sidebar, bottom bar, "เพิ่มเติม") are hidden as well */
  const PAGE_PERM = { resources: 'resource.view', timesheet: 'resource.view' };
  function applyRoleNav() {
    const signedIn = PM.auth && PM.auth.user;
    document.querySelectorAll('#nav a[data-route], #tabbar a[data-route]').forEach((a) => {
      const need = PAGE_PERM[a.dataset.route];
      a.hidden = !!(need && signedIn && !PM.can(need));
    });
    // a group heading with nothing left under it goes too (e.g. "Resources")
    document.querySelectorAll('#nav .nav-group').forEach((g) => {
      let n = g.nextElementSibling, any = false;
      while (n && !n.classList.contains('nav-group')) { if (n.tagName === 'A' && !n.hidden && !n.classList.contains('sub')) any = true; n = n.nextElementSibling; }
      g.hidden = !any;
    });
  }

  /* opening the site always starts on the Dashboard (login / register do the same — auth.js);
     a refresh or Back / Forward keeps the page that was open. Supabase e-mail links carry tokens in the
     address (#access_token=… / #error=…) — those are left for auth.js to read. */
  PM.startPage = '#/dashboard';
  PM.goStart = () => { if (location.hash !== PM.startPage) history.replaceState(null, '', location.pathname + location.search + PM.startPage); };
  const navEntry = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {};
  if (navEntry.type !== 'reload' && navEntry.type !== 'back_forward' && (!location.hash || location.hash.startsWith('#/'))) PM.goStart();
  try { localStorage.removeItem('epc-pm-last-route'); } catch (e) { /* the old "reopen the last page" key — no longer used */ }

  /* ---------- loading screen (index.html #boot-splash) ---------- */
  const splash = document.getElementById('boot-splash');
  let splashTimer = null;
  PM.splash = {
    show(text) {
      clearTimeout(splashTimer);
      if (text) document.getElementById('boot-text').textContent = text;
      splash.hidden = false;
      splash.classList.remove('out');
      splashTimer = setTimeout(() => PM.splash.hide(), 20000); // never stays up forever (slow network → the page shows its own state)
    },
    text(t) { document.getElementById('boot-text').textContent = t; },
    hide() {
      if (splash.hidden || splash.classList.contains('out')) return; // already going (keep its timer)
      clearTimeout(splashTimer);
      splash.classList.add('out'); // fades out (motion.css), then removed from view
      splashTimer = setTimeout(() => { splash.hidden = true; }, 320);
    },
  };

  /* placeholder page while data is on its way: shimmering tiles + cards, with a message on top */
  function skeleton(message) {
    const block = (cls) => `<div class="sk ${cls}"></div>`;
    return `<div class="skeleton-page" aria-busy="true">
      <div class="sk-msg"><span class="spinner" aria-hidden="true"></span><span>${message}</span></div>
      ${block('sk-hero')}
      <div class="grid cols-6">${block('sk-tile').repeat(6)}</div>
      <div class="grid cols-2">${block('sk-card').repeat(2)}</div>
      ${block('sk-card sk-wide')}
    </div>`;
  }
  PM.skeleton = skeleton;

  function applyAsOf() {
    document.getElementById('asof').textContent = 'Status date: ' + PM.ui.date(PM.today());
    document.getElementById('company-name').textContent = PM.COMPANY;
  }
  PM.applyAsOf = applyAsOf;

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    PM.prefs.set('theme', cur === 'dark' ? 'light' : 'dark'); // saved on the account (see PM.prefs below)
  });

  /* ---------- mobile drawer menu ---------- */
  const menuBtn = document.getElementById('menu-btn');
  const moreBtn = document.getElementById('tab-more');
  const setNav = (open) => {
    document.body.classList.toggle('nav-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
    moreBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.addEventListener('click', () => setNav(!document.body.classList.contains('nav-open')));
  document.getElementById('scrim').addEventListener('click', () => setNav(false));
  document.getElementById('sidebar').addEventListener('click', (e) => { if (e.target.closest('a, [data-logout]')) setNav(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setNav(false); setMore(false); } });
  window.addEventListener('hashchange', () => { setNav(false); setMore(false); });

  /* ---------- "เพิ่มเติม" on the bottom tab bar: a sheet with every page that is not on the tab bar,
     as a grid that always fits above the tab bar (built from the sidebar menu each time it opens) ---------- */
  const moreSheet = document.createElement('div');
  moreSheet.className = 'more-sheet';
  moreSheet.id = 'more-sheet';
  moreSheet.setAttribute('role', 'dialog');
  moreSheet.setAttribute('aria-label', 'เมนูเพิ่มเติม');
  const moreBackdrop = document.createElement('div');
  moreBackdrop.className = 'more-backdrop';
  document.body.append(moreBackdrop, moreSheet);
  function buildMore() {
    const onBar = new Set(Array.from(document.querySelectorAll('#tabbar a')).map((a) => a.getAttribute('href')));
    const groups = [];
    Array.from(document.getElementById('nav').children).forEach((n) => {
      if (n.classList.contains('nav-group')) groups.push({ title: n.textContent, links: [] });
      else if (n.tagName === 'A' && !n.hidden && !onBar.has(n.getAttribute('href')) && groups.length) groups[groups.length - 1].links.push(n);
    });
    const esc = PM.ui.esc, u = PM.auth && PM.auth.user;
    const name = u ? PM.auth.displayName(u) : '';
    moreSheet.innerHTML = `
      ${u ? `<div class="more-head">
        <a class="avatar" href="#/settings" title="บัญชีผู้ใช้">${esc(name.split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase())}</a>
        <div class="who"><b>${esc(name)}</b><small class="muted">${esc(PM.auth.role ? PM.roleLabel(PM.auth.role) : 'ยังไม่มี Role')} · ${esc(u.email || '')}</small></div>
        <button class="icon-btn" type="button" data-more-logout title="ออกจากระบบ" aria-label="ออกจากระบบ"><svg viewBox="0 0 24 24"><path d="M15 17l5-5-5-5M20 12H9M12 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/></svg></button>
      </div>` : ''}
      <div class="more-body">${groups.filter((g) => g.links.length).map((g) => `
        <div class="more-group">${esc(g.title)}</div>
        <div class="more-grid">${g.links.map((a) => `<a href="${esc(a.getAttribute('href'))}" class="${a.classList.contains('active') ? 'active' : ''}">${a.innerHTML}</a>`).join('')}</div>`).join('')}
      </div>`;
  }
  function setMore(open) {
    if (open) buildMore();
    document.body.classList.toggle('more-open', open);
    moreBtn.setAttribute('aria-expanded', String(open));
  }
  moreBtn.addEventListener('click', () => setMore(!document.body.classList.contains('more-open')));
  moreBackdrop.addEventListener('click', () => setMore(false));
  moreSheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-more-logout]')) { setMore(false); PM.auth.signOut(); return; }
    if (e.target.closest('a')) setMore(false); // hashchange also closes it; this covers tapping the page that is already open
  });

  /* ---------- desktop: collapse / expand the sidebar (remembered per browser) ---------- */
  const sideBtn = document.getElementById('sidebar-toggle');
  const applyCollapsed = (on) => {
    document.documentElement.classList.toggle('nav-collapsed', on);
    const label = on ? 'ขยายเมนู' : 'หุบเมนู';
    sideBtn.setAttribute('aria-expanded', String(!on));
    sideBtn.setAttribute('aria-label', label);
    sideBtn.title = label;
    // icons only → show the menu name as a tooltip
    document.querySelectorAll('#nav a').forEach((a) => {
      const name = a.querySelector('span') ? a.querySelector('span').textContent : '';
      if (on) a.setAttribute('data-tip', name); else a.removeAttribute('data-tip');
    });
  };
  /* 901–1100 px (tablet landscape, small laptop): icons-only by default so the content gets the room;
     a choice made at that size is remembered separately from the one on a big screen (same rule in index.html) */
  const compactMq = matchMedia('(min-width: 901px) and (max-width: 1100px)');
  const navKey = () => (compactMq.matches ? 'epc-pm-nav-collapsed-compact' : 'epc-pm-nav-collapsed');
  const wantCollapsed = () => {
    let v = null;
    try { v = localStorage.getItem(navKey()); } catch (e) { /* ignore */ }
    return v === null ? compactMq.matches : v === '1';
  };
  applyCollapsed(wantCollapsed());
  compactMq.addEventListener('change', () => applyCollapsed(wantCollapsed()));
  // content width changes → redraw charts once the sidebar has finished resizing
  const appEl = document.querySelector('.app');
  let collapseTimer = null;
  const redrawAfterResize = () => {
    if (collapseTimer === null) return;
    clearTimeout(collapseTimer);
    collapseTimer = null;
    if (PM.booted && PM.auth.user && !document.querySelector('.modal-backdrop')) render();
  };
  appEl.addEventListener('transitionend', (e) => { if (e.target === appEl && e.propertyName === 'grid-template-columns') redrawAfterResize(); });
  sideBtn.addEventListener('click', () => {
    const on = !document.documentElement.classList.contains('nav-collapsed');
    PM.prefs.set(compactMq.matches ? 'navCompact' : 'nav', on ? '1' : '0'); // saved on the account
  });
  const relayout = () => { clearTimeout(collapseTimer); collapseTimer = setTimeout(redrawAfterResize, 450); }; // fallback if no transition runs

  /* ---------- display settings follow the ACCOUNT ----------
     Theme (light · dark · system) and the sidebar (full · icons) are saved on the user's account
     (Supabase Auth user_metadata.prefs) — every device / browser the person signs in on gets them.
     This browser keeps a copy (localStorage, read by index.html) so the very first paint is already right. */
  const PREF_LS = { theme: 'epc-pm-theme', nav: 'epc-pm-nav-collapsed', navCompact: 'epc-pm-nav-collapsed-compact' };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  const applyTheme = (t) => { const r = document.documentElement; if (t === 'light' || t === 'dark') r.setAttribute('data-theme', t); else r.removeAttribute('data-theme'); };
  let prefTimer = null;
  PM.prefs = {
    state: 'local', // local · saving · saved · error
    get: () => ({ theme: lsGet(PREF_LS.theme) || 'system', nav: lsGet(PREF_LS.nav), navCompact: lsGet(PREF_LS.navCompact) }),
    /* change one setting here, then save it to the account */
    set(key, value) {
      lsSet(PREF_LS[key], key === 'theme' && value === 'system' ? null : value);
      if (key === 'theme') applyTheme(value);
      else { const was = document.documentElement.classList.contains('nav-collapsed'), now = wantCollapsed(); applyCollapsed(now); if (was !== now) relayout(); }
      saveSoon();
    },
    /* signed in: the account's settings win; an account that has none yet takes this browser's */
    fromAccount(user) {
      const p = user && user.user_metadata && user.user_metadata.prefs;
      if (!p) { saveSoon(); return; }
      lsSet(PREF_LS.theme, p.theme === 'light' || p.theme === 'dark' ? p.theme : null);
      lsSet(PREF_LS.nav, p.nav == null ? null : String(p.nav));
      lsSet(PREF_LS.navCompact, p.navCompact == null ? null : String(p.navCompact));
      applyTheme(p.theme);
      const was = document.documentElement.classList.contains('nav-collapsed'), now = wantCollapsed();
      applyCollapsed(now);
      if (was !== now) relayout();
      PM.prefs.state = 'saved';
    },
    /* after sign-in: apply what the session carries at once, then the newest copy from the server (another device may have changed it) */
    async load(user) {
      PM.prefs.fromAccount(user);
      const c = PM.auth && PM.auth.client;
      if (!c || !c.auth || !c.auth.getUser) return;
      try {
        const { data } = await c.auth.getUser();
        if (data && data.user && PM.auth.user && data.user.id === PM.auth.user.id && data.user.user_metadata && data.user.user_metadata.prefs) PM.prefs.fromAccount(data.user);
      } catch (e) { /* offline — the session copy stays */ }
    },
  };
  function saveSoon() { clearTimeout(prefTimer); prefTimer = setTimeout(savePrefs, 600); }
  async function savePrefs() {
    const c = PM.auth && PM.auth.client, u = PM.auth && PM.auth.user;
    if (!c || !c.auth || !u) { PM.prefs.state = 'local'; return; }
    PM.prefs.state = 'saving'; prefsChanged();
    try {
      const { data, error } = await c.auth.updateUser({ data: { prefs: PM.prefs.get() } }); // merges into user_metadata (full_name stays)
      if (error) throw error;
      if (data && data.user) PM.auth.user = data.user;
      PM.prefs.state = 'saved';
    } catch (e) {
      console.warn('Saving display settings to the account failed:', e && e.message);
      PM.prefs.state = 'error';
    }
    prefsChanged();
  }
  // the Settings page shows where the settings live (and refreshes its controls)
  const prefsChanged = () => document.dispatchEvent(new CustomEvent('pm-prefs'));

  /* ---------- tables → cards on phones ----------
     Copies each column header into data-label on its cells so CSS can show "label : value" rows.
     Grids that must stay tabular (timesheet entry, permission matrix) are skipped. */
  function stackTables(root) {
    root.querySelectorAll('table.tbl:not(.ts-grid):not(.perm-matrix):not([data-stacked])').forEach((t) => {
      t.setAttribute('data-stacked', '1');
      t.classList.add('stack');
      const heads = Array.from(t.querySelectorAll('thead th')).map((th) => (th.firstChild ? th.firstChild.textContent : '').trim());
      t.querySelectorAll('tbody tr, tfoot tr').forEach((tr) => Array.from(tr.children).forEach((td, i) => {
        if (td.tagName !== 'TD') return;
        td.setAttribute('data-label', heads[i] || '');
        const cell = document.createElement('div');
        cell.className = 'cell';
        while (td.firstChild) cell.appendChild(td.firstChild);
        td.appendChild(cell);
        // on phones: progress bars, dropdowns, buttons and long text take the full card width
        const text = cell.textContent.trim();
        const onlyButtons = !!cell.querySelector('.btn') &&
          Array.from(cell.childNodes).every((n) => (n.nodeType === 1 && n.matches('.btn')) || !n.textContent.trim());
        if (onlyButtons) td.classList.add('wide', 'actions');
        else if (cell.querySelector('.pbar-wrap, select, textarea') || text.length > 24) td.classList.add('wide');
      }));
    });
  }
  const viewEl = document.getElementById('view');
  new MutationObserver(() => { stackTables(viewEl); PM.illus.decorate(viewEl); }).observe(viewEl, { childList: true, subtree: true });

  let rt;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - lastW) < 40) return;
    lastW = window.innerWidth;
    clearTimeout(rt);
    rt = setTimeout(() => { if (PM.booted && PM.auth.user && !document.querySelector('.modal-backdrop')) render(); }, 200);
  });
  /* page change: the tapped tab pulses, the page dims and the top bar runs (phones / tablets — CSS), and the new
     page is drawn on the next frame so that feedback shows at once even when a page with charts takes a moment */
  let navSeq = 0;
  window.addEventListener('hashchange', () => {
    if (!PM.booted || !PM.auth.user || PM.cloud.blocking) return;
    const seq = ++navSeq, body = document.body, t0 = Date.now();
    body.classList.add('is-navigating', 'nav-progress');
    let done = false;
    const go = () => {
      if (done || seq !== navSeq) return; // drawn already, or tapped again meanwhile — only the last page is drawn
      done = true;
      PM.ui.scrollToY(0); // new page starts at the top (window, or the content area on phones / tablets)
      render();
      body.classList.remove('is-navigating');
      document.querySelectorAll('.is-loading[data-nav-loading]').forEach((a) => { a.classList.remove('is-loading'); a.removeAttribute('data-nav-loading'); });
      setTimeout(() => { if (seq === navSeq) body.classList.remove('nav-progress'); }, Math.max(0, 350 - (Date.now() - t0))); // bar stays long enough to be seen
    };
    requestAnimationFrame(() => setTimeout(go, 0)); // after the feedback has been painted …
    setTimeout(go, 60);                             // … or soon anyway (frames are paused in background tabs)
  });
  // the tab / tile that was tapped shows it is loading (the "เพิ่มเติม" sheet closes, so its tab button carries it)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('#tabbar a[href], #more-sheet a[href]');
    if (!a || a.getAttribute('href') === location.hash) return;
    const mark = a.closest('#more-sheet') ? document.getElementById('tab-more') : a;
    mark.classList.add('is-loading');
    mark.setAttribute('data-nav-loading', '');
  }, true);

  /* Called by auth.js once a user is signed in */
  PM.boot = async function () {
    if (!PM.booted) { PM.booted = true; PM.load(); }
    lastAnimated = null;
    applyAsOf();
    PM.updateVersionBadge();
    // First time on this browser: wait for the cloud instead of flashing local demo data
    const waitCloud = PM.cloud.available() && !PM.cloud.hasBase();
    if (waitCloud) {
      // first time on this browser: the loading screen stays up until the cloud data is here
      PM.splash.show('กำลังโหลดข้อมูลจาก Cloud…');
      document.getElementById('view').innerHTML = skeleton('กำลังโหลดข้อมูลจาก Cloud…');
    } else {
      render();          // this browser's copy right away — the newest cloud data follows (top progress bar)
      PM.splash.hide();
    }
    // ask the browser not to evict this site's saved data when the phone / tablet runs low on space
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* ignore */ }
    const draft = PM.ui.pendingDraft();
    if (draft) setTimeout(() => PM.ui.toast(`มีฟอร์ม "${draft.title}" ที่ยังไม่ได้บันทึก — เปิดฟอร์มเดิมอีกครั้งเพื่อกรอกต่อ`, 6000), 600);
    const changed = await PM.cloud.start();
    if (!PM.auth.user) return;
    if (waitCloud || changed) {
      if (waitCloud) lastAnimated = null;
      applyAsOf();
      render();
    }
    PM.splash.hide();
  };
})();
