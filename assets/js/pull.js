/* pull.js — pull down at the top of the page to refresh (phones & tablets)
   Fetches the latest data from the cloud (sending this device's edits first) and redraws the page
   in place — the page, filters and anything typed in the timesheet stay as they are. */
(function () {
  const TRIGGER = 70; // px (after resistance) needed to refresh
  const MAX = 120;
  const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  // the browser's own pull-to-reload would reload the whole page on top of ours
  if (touch) document.documentElement.classList.add('ptr-on');

  const el = document.createElement('div');
  el.className = 'ptr';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<div class="ptr-ball"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg></div><span class="ptr-text"></span>';
  document.body.appendChild(el);
  const text = el.querySelector('.ptr-text');

  let startY = null, startX = 0, dist = 0, active = false, busy = false;
  const blocked = () => busy || !document.body.classList.contains('authed') || document.body.classList.contains('nav-open')
    || !!document.querySelector('.modal-backdrop') || window.scrollY > 0;

  const place = (d) => { el.style.transform = `translate(-50%, ${Math.round(d - 76)}px)`; };
  const reset = () => {
    el.classList.remove('pulling', 'ready', 'refreshing');
    el.style.transform = '';
    el.style.removeProperty('--p');
    dist = 0;
  };

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || blocked()) { startY = null; return; }
    startY = e.touches[0].clientY; startX = e.touches[0].clientX; dist = 0; active = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY, dx = e.touches[0].clientX - startX;
    if (!active) {
      if (dy < 8) { if (dy < -4) startY = null; return; }                 // scrolling down the page
      if (Math.abs(dx) > dy || window.scrollY > 0) { startY = null; return; } // sideways swipe (board, tabs)
      active = true;
      el.classList.add('pulling');
    }
    e.preventDefault(); // no rubber-band / native reload while we pull
    dist = Math.min(MAX, (dy - 8) * 0.55);
    place(dist);
    const ready = dist >= TRIGGER;
    el.classList.toggle('ready', ready);
    el.style.setProperty('--p', Math.min(1, dist / TRIGGER).toFixed(2));
    text.textContent = ready ? 'ปล่อยเพื่ออัปเดตข้อมูล' : 'ดึงลงเพื่อรีเฟรช';
  }, { passive: false });

  const end = (e) => {
    if (startY == null) return;
    startY = null;
    if (!active) return;
    active = false;
    el.classList.remove('pulling');
    if (e.type === 'touchend' && dist >= TRIGGER) refresh(); else reset();
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);

  /* also used by tests / other code */
  const refresh = (PM.pullRefresh = async function () {
    if (busy) return;
    busy = true;
    el.classList.remove('ready');
    el.classList.add('refreshing');
    place(TRIGGER);
    text.textContent = 'กำลังอัปเดต…';
    const t0 = Date.now();
    let ok = true;
    try {
      const C = PM.cloud;
      if (C && C.enabled) {
        await C.sync(false);
        ok = !['offline', 'waiting', 'denied', 'setup', 'forbidden'].includes(C.state);
      }
      if (PM.applyAsOf) PM.applyAsOf();
      if (!document.querySelector('.modal-backdrop')) PM.render();
    } catch (err) {
      ok = false;
    }
    await new Promise((r) => setTimeout(r, Math.max(0, 450 - (Date.now() - t0)))); // let the spinner be seen
    busy = false;
    reset();
    PM.ui.toast(ok ? 'อัปเดตข้อมูลล่าสุดแล้ว' : 'ยังเชื่อมต่อ Cloud ไม่ได้ — แสดงข้อมูลที่เก็บในเครื่อง');
  });
})();
