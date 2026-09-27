/* app.js — hash router, theme, boot */
(function () {
  const routes = [
    [/^#\/dashboard$/, 'dashboard', 'Dashboard', 'ภาพรวม'],
    [/^#\/bidding$/, 'bidding', 'Bidding Performance', 'Before Award · Inquiry → Estimate → Proposal → Submit'],
    [/^#\/projects$/, 'projects', 'Projects (EPC Execution)', 'Engineering → Procurement → Construction → Closing'],
    [/^#\/projects\/([\w-]+)(?:\/(\w+))?$/, 'project', 'Project', 'Execution'],
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
    document.getElementById('page-title').textContent = route[2];
    document.getElementById('crumb').textContent = route[3];
    document.querySelectorAll('#nav a').forEach((a) => {
      const key = a.dataset.route;
      a.classList.toggle('active', key === route[1] || (key === 'projects' && route[1] === 'project'));
    });
    el.onclick = null; el.onchange = null; el.oninput = null; el.onkeydown = null;
    el.ondragstart = el.ondragend = el.ondragover = el.ondragleave = el.ondrop = null;
    PM.views[route[1]](el, match.slice(1));
    if (hash !== lastAnimated) { // animate on navigation only, not on resize / data refresh
      lastAnimated = hash;
      PM.motion.enter(el);
      PM.motion.countUp(el);
    }
  }
  let lastAnimated = null;
  PM.render = render;

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
  const setNav = (open) => {
    document.body.classList.toggle('nav-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
  };
  menuBtn.addEventListener('click', () => setNav(!document.body.classList.contains('nav-open')));
  document.getElementById('scrim').addEventListener('click', () => setNav(false));
  document.getElementById('sidebar').addEventListener('click', (e) => { if (e.target.closest('a, [data-logout]')) setNav(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNav(false); });
  window.addEventListener('hashchange', () => setNav(false));

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
      }));
    });
  }
  const viewEl = document.getElementById('view');
  new MutationObserver(() => stackTables(viewEl)).observe(viewEl, { childList: true, subtree: true });

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
    const changed = await PM.cloud.start();
    if (!PM.auth.user) return;
    if (waitCloud || changed) {
      if (waitCloud) lastAnimated = null;
      applyAsOf();
      render();
    }
  };
})();
