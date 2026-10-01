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
    [/^#\/about$/, 'about', 'About', 'เวอร์ชันและประวัติการแก้ไข'],
  ];

  function render() {
    const hash = location.hash || '#/dashboard';
    let match = null, route = null;
    for (const r of routes) { match = hash.match(r[0]); if (match) { route = r; break; } }
    if (!route) { location.hash = '#/dashboard'; return; }
    const el = document.getElementById('view');
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
    el.onclick = null; el.onchange = null; el.oninput = null; el.onkeydown = null;
    el.ondragstart = el.ondragend = el.ondragover = el.ondragleave = el.ondrop = null;
    try { localStorage.setItem(LAST_ROUTE, hash); } catch (e) { /* ignore */ }
    PM.illus.hero(stage ? 'bid-' + stage : route[1]);
    if (PM.cloud.waiting()) { // never show (or let anyone edit) the local demo copy instead of the real data
      lastAnimated = null;
      el.innerHTML = `<div class="cloud-wait"><span class="spinner" aria-hidden="true"></span><div>ยังโหลดข้อมูลจาก Cloud ไม่ได้ — กำลังลองใหม่อัตโนมัติ<br><button type="button" class="btn sm" data-sync-retry style="margin-top:10px">ลองใหม่ตอนนี้</button></div></div>`;
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

  /* reopening the site (no page in the address) goes back to the page that was open last time */
  const LAST_ROUTE = 'epc-pm-last-route';
  if (!location.hash || location.hash === '#' || location.hash === '#/') {
    try {
      const last = localStorage.getItem(LAST_ROUTE);
      if (last && routes.some((r) => r[0].test(last))) history.replaceState(null, '', last);
    } catch (e) { /* ignore */ }
  }

  function applyAsOf() {
    document.getElementById('asof').textContent = 'Status date: ' + PM.ui.date(PM.today());
    document.getElementById('company-name').textContent = PM.COMPANY;
  }
  PM.applyAsOf = applyAsOf;

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('epc-pm-theme', next); } catch (e) { /* ignore */ }
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
  moreBtn.addEventListener('click', () => setNav(!document.body.classList.contains('nav-open')));
  document.getElementById('scrim').addEventListener('click', () => setNav(false));
  document.getElementById('sidebar').addEventListener('click', (e) => { if (e.target.closest('a, [data-logout]')) setNav(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNav(false); });
  window.addEventListener('hashchange', () => setNav(false));

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
  applyCollapsed(document.documentElement.classList.contains('nav-collapsed'));
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
    applyCollapsed(on);
    try { localStorage.setItem('epc-pm-nav-collapsed', on ? '1' : '0'); } catch (e) { /* ignore */ }
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(redrawAfterResize, 450); // fallback if no transition runs
  });

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
  window.addEventListener('hashchange', () => { if (!PM.booted || !PM.auth.user || PM.cloud.blocking) return; window.scrollTo(0, 0); render(); });

  /* Called by auth.js once a user is signed in */
  PM.boot = async function () {
    if (!PM.booted) { PM.booted = true; PM.load(); }
    lastAnimated = null;
    applyAsOf();
    PM.updateVersionBadge();
    // First time on this browser: wait for the cloud instead of flashing local demo data
    const waitCloud = PM.cloud.available() && !PM.cloud.hasBase();
    if (waitCloud) document.getElementById('view').innerHTML = '<div class="cloud-wait"><span class="spinner" aria-hidden="true"></span>กำลังโหลดข้อมูลจาก Cloud…</div>';
    else render();
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
  };
})();
