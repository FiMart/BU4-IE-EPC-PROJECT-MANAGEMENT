/* cloud.js — keep all app data in Supabase (table public.app_records, see supabase/data.sql)
   - Every record (bid, project, NCR, …) is one row: (collection, id) → data.
   - On open: push edits that never reached the cloud, then load everything from the cloud.
   - On every edit (PM.save): send only the records that changed since the last sync.
   - The browser keeps a local copy, so edits made offline are sent automatically later. */
(function () {
  const U = PM.ui;
  const C = (PM.cloud = { enabled: false, state: 'idle', blocking: false });
  const TABLE = 'app_records';
  const COLLS = ['bids', 'projects', 'ncrs', 'safety', 'resources', 'levels', 'timesheets', 'plans', 'pos', 'costs'];
  // collections accepted by every version of data.sql
  const LEGACY = ['bids', 'projects', 'ncrs', 'safety', 'resources', 'levels', 'timesheets'];
  /* Collections the cloud table doesn't accept yet (older data.sql): their records are "parked" as
     meta rows with id "@<collection>/<id>" so they are still saved in the cloud. Every session tries the
     real collection again first; once data.sql has been re-run they move back automatically. */
  const outdated = new Set();
  const PARK = '@';
  const isCheckError = (e) => /app_records_collection_check|violates check constraint/i.test((e && e.message) || '');
  const BASE_KEY = 'epc-pm-sync-base-v1';
  const BACKUP_KEY = 'epc-pm-db-local-backup';
  const PAGE = 1000;

  let base = {}; // "collection|id" → hash of the version known to be in the cloud
  let ords = {}; // "collection|id" → list order
  let timer = null, retryTimer = null, lastPull = 0, ordSeq = 0;
  /* false until this browser has loaded the cloud once (or has a sync base from an earlier visit):
     nothing is pushed before that, so a browser that could not reach the cloud on its first visit
     never uploads its demo data over the real data */
  let synced = false;
  let queue = Promise.resolve();

  const client = () => PM.auth && PM.auth.client;
  C.available = () => { const c = client(); return !!(c && typeof c.from === 'function'); };
  C.hasBase = () => { try { return !!localStorage.getItem(BASE_KEY); } catch (e) { return false; } };

  const hash = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + '.' + s.length.toString(36);
  };
  const key = (c, id) => c + '|' + id;
  const nextOrd = () => Date.now() * 1000 + (ordSeq++ % 1000);
  const enqueue = (fn) => (queue = queue.then(fn, fn)); // cloud operations run one at a time

  function records(db) {
    const map = new Map();
    map.set(key('meta', 'main'), { collection: 'meta', id: 'main', data: db.meta || {} });
    COLLS.forEach((c) => (db[c] || []).forEach((r) => {
      if (r == null || r.id == null) return;
      const rec = outdated.has(c)
        ? { collection: 'meta', id: PARK + c + '/' + r.id, data: r }
        : { collection: c, id: String(r.id), data: r };
      map.set(key(rec.collection, rec.id), rec);
    }));
    return Array.from(map.values());
  }

  function saveBase() { try { localStorage.setItem(BASE_KEY, JSON.stringify({ base, ords })); } catch (e) { /* ignore */ } }
  function loadBase() {
    try {
      const b = JSON.parse(localStorage.getItem(BASE_KEY) || 'null');
      if (b && b.base) { base = b.base; ords = b.ords || {}; return true; }
    } catch (e) { /* ignore */ }
    base = {}; ords = {};
    return false;
  }

  function diff() {
    const cur = {}, ups = [];
    records(PM.db).forEach((r) => {
      const k = key(r.collection, r.id), h = hash(JSON.stringify(r.data));
      cur[k] = 1;
      if (base[k] !== h) {
        if (ords[k] == null) ords[k] = nextOrd();
        ups.push({ row: { collection: r.collection, id: r.id, data: r.data, ord: ords[k] }, k, h });
      }
    });
    return { ups, dels: Object.keys(base).filter((k) => !cur[k]) };
  }
  const hasLocalChanges = () => { const d = diff(); return d.ups.length + d.dels.length > 0; };

  /* ---------- network operations ---------- */
  async function push() {
    if (!synced) return 0; // never upload before the cloud copy has been loaded once
    const { ups, dels } = diff();
    if (!ups.length && !dels.length) return 0;
    setState('saving');
    const groups = {};
    ups.forEach((u) => (groups[u.row.collection] = groups[u.row.collection] || []).push(u));
    for (const coll of Object.keys(groups)) {
      const list = groups[coll];
      for (let i = 0; i < list.length; i += 500) {
        const chunk = list.slice(i, i + 500);
        const { error } = await client().from(TABLE).upsert(chunk.map((u) => u.row), { onConflict: 'collection,id' });
        if (error && isCheckError(error) && coll !== 'meta' && !outdated.has(coll)) {
          // table doesn't accept this collection yet → park its records under meta and start over
          // (before any deletion, so the parked copies already in the cloud are kept)
          outdated.add(coll);
          return push();
        }
        if (error) throw error;
        chunk.forEach((u) => (base[u.k] = u.h));
        saveBase();
      }
    }
    const byColl = {};
    dels.forEach((k) => { const i = k.indexOf('|'), c = k.slice(0, i); (byColl[c] = byColl[c] || []).push(k.slice(i + 1)); });
    for (const c of Object.keys(byColl)) {
      for (let i = 0; i < byColl[c].length; i += 200) {
        const part = byColl[c].slice(i, i + 200);
        const { error } = await client().from(TABLE).delete().eq('collection', c).in('id', part);
        if (error) throw error;
        part.forEach((id) => { delete base[key(c, id)]; delete ords[key(c, id)]; });
        saveBase();
      }
    }
    return ups.length + dels.length;
  }

  async function pull() {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client().from(TABLE).select('collection,id,data,ord')
        .order('collection', { ascending: true }).order('ord', { ascending: true }).order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    lastPull = Date.now();
    return rows;
  }

  /* Replace the local data with the cloud rows. Returns true when something changed. */
  function apply(rows) {
    const db = PM.emptyDb();
    COLLS.forEach((c) => (db[c] = []));
    const nb = {}, no = {};
    const real = new Set(rows.filter((r) => r.collection !== 'meta').map((r) => key(r.collection, r.id)));
    rows.forEach((r) => {
      if (r.collection === 'meta' && String(r.id).startsWith(PARK)) {
        // parked record of a collection the table did not accept (see records())
        const s = String(r.id).slice(PARK.length), i = s.indexOf('/');
        const c = s.slice(0, i), id = s.slice(i + 1);
        if (!db[c]) return;
        if (!real.has(key(c, id))) db[c].push(r.data); // the real row wins if both exist
        // (not marked outdated here: the next push tries the real collection first and moves it back if accepted)
      } else if (r.collection === 'meta') db.meta = r.data || {};
      else if (db[r.collection]) db[r.collection].push(r.data);
      else return;
      const k = key(r.collection, r.id);
      nb[k] = hash(JSON.stringify(r.data));
      no[k] = r.ord;
    });
    const changed = Object.keys(nb).length !== Object.keys(base).length || Object.keys(nb).some((k) => nb[k] !== base[k]);
    base = nb; ords = no; saveBase();
    synced = true;
    PM.db = db;
    PM.ensureShape(); // e.g. adds the Engineer / Technician / Other levels if the cloud data predates them
    PM.lockCompany();
    PM.saveLocal();
    if (hasLocalChanges()) C.schedule(); // send those additions up
    return changed;
  }

  /* ---------- status indicator (topbar) ---------- */
  const LABEL = {
    loading: ['busy', 'กำลังโหลดข้อมูลจาก Cloud…'],
    saving: ['busy', 'กำลังบันทึก…'],
    saved: ['ok', 'บันทึกบน Cloud แล้ว'],
    offline: ['warn', 'ยังส่งขึ้น Cloud ไม่ได้ — เก็บไว้ในเครื่องแล้ว จะลองใหม่อัตโนมัติ'],
    denied: ['warn', 'ไม่มีสิทธิ์บันทึกข้อมูลบน Cloud (บัญชียังไม่มี Role)'],
    forbidden: ['warn', 'Reset / Import บน Cloud ได้เฉพาะ Admin และ Project Manager'],
    outdated: ['ok', 'บันทึกบน Cloud แล้ว (โหมดสำรอง — แนะนำรัน supabase/data.sql อีกครั้ง)'],
    waiting: ['warn', 'ยังเชื่อมต่อ Cloud ไม่ได้ — กำลังลองใหม่'],
    setup: ['warn', 'ยังไม่ได้ติดตั้ง Cloud (รัน supabase/data.sql) — ข้อมูลเก็บเฉพาะเครื่องนี้'],
    local: ['warn', 'ข้อมูลเก็บเฉพาะเครื่องนี้'],
  };
  function setState(s, detail) {
    if (s === 'saved' && outdated.size) { s = 'outdated'; detail = 'Saved in backup mode (parked under meta) — the cloud table does not accept yet: ' + Array.from(outdated).join(', ') + '. Re-run supabase/data.sql.'; }
    C.state = s;
    C.detail = detail || '';
    if (s === 'saved') C.savedAt = new Date();
    const el = document.getElementById('sync-status');
    if (!el) return;
    const [cls, text] = LABEL[s] || ['', ''];
    const time = s === 'saved' && C.savedAt ? ' · ' + C.savedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
    el.hidden = false;
    el.className = 'sync ' + cls;
    el.title = detail || text;
    el.innerHTML = `<i aria-hidden="true"></i><span>${U.esc(text + time)}</span>${s === 'offline' ? '<button type="button" class="link-btn" data-sync-retry>ลองใหม่</button>' : ''}`;
  }

  function fail(e) {
    const m = (e && e.message) || String(e || '');
    console.warn('Cloud sync:', m);
    if (/app_records|app_replace_all/i.test(m) && /schema cache|does not exist|could not find/i.test(m)) {
      C.enabled = false; setState('setup', m); return;
    }
    if (isCheckError(e)) { setState('outdated', m); return; }
    if (/Only Admin/i.test(m)) { setState('forbidden', m); return; }
    if (/row-level security|permission denied/i.test(m)) { setState('denied', m); return; }
    setState(synced ? 'offline' : 'waiting', m);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => C.sync(true), 15000);
  }

  /* ---------- public API ---------- */
  C.schedule = function () {
    if (!C.enabled) return;
    clearTimeout(timer);
    setState('saving');
    timer = setTimeout(C.flush, 700);
  };

  C.flush = function () {
    clearTimeout(timer); timer = null;
    if (!C.enabled) return Promise.resolve();
    return enqueue(() => push().then(() => setState(synced ? 'saved' : 'waiting')).catch(fail));
  };

  /* push local edits, then pull everything; re-render when data changed */
  C.sync = function (rerender) {
    if (!C.enabled) return Promise.resolve(false);
    clearTimeout(retryTimer);
    if (!synced) return firstLoad(); // the first load failed earlier — load now instead of pushing
    return enqueue(async () => {
      try {
        await push();
        const rows = await pull();
        if (hasLocalChanges()) { C.schedule(); return false; } // user edited while loading — keep their edits
        const changed = apply(rows);
        setState('saved');
        if (changed && rerender && PM.auth.user && !document.querySelector('.modal-backdrop')) PM.render();
        return changed;
      } catch (e) { fail(e); return false; }
    });
  };
  /* true while the data on screen would only be this browser's demo copy (cloud not loaded yet) */
  C.waiting = () => C.enabled && !synced;

  async function firstLoad() {
    try {
      setState('loading');
      const rows = await enqueue(() => pull());
      if (rows.length) { backupLocal(); apply(rows); setState('saved'); } else await firstUpload();
      if (PM.auth.user && PM.booted) { if (PM.applyAsOf) PM.applyAsOf(); PM.render(); }
      return true;
    } catch (e) { fail(e); return false; }
  }

  /* Reset / Import — replace everything in the cloud in one transaction (Admin & PM only, checked by the DB) */
  C.replaceAll = function () {
    if (!C.enabled) return Promise.resolve();
    clearTimeout(timer);
    setState('saving');
    return enqueue(async () => {
      try {
        const send = async () => {
          const list = records(PM.db).map((r, i) => ({ collection: r.collection, id: r.id, data: r.data, ord: i }));
          return { list, error: (await client().rpc('app_replace_all', { payload: list })).error };
        };
        let { list: recs, error } = await send();
        if (error && isCheckError(error)) {
          // older table: park every collection it may not know yet, then try again
          COLLS.filter((c) => !LEGACY.includes(c)).forEach((c) => outdated.add(c));
          ({ list: recs, error } = await send());
        }
        if (error) throw error;
        synced = true;
        base = {}; ords = {};
        recs.forEach((r) => { const k = key(r.collection, r.id); base[k] = hash(JSON.stringify(r.data)); ords[k] = r.ord; });
        saveBase();
        setState('saved');
      } catch (e) { fail(e); }
    });
  };

  /* Called after sign-in. Returns true when the data on screen should be re-rendered. */
  C.start = async function () {
    if (!C.available()) { C.enabled = false; setState('local'); return false; }
    const hadBase = loadBase();
    synced = hadBase;
    C.blocking = !hadBase;
    setState('loading');
    try {
      C.enabled = true;
      if (hadBase) await enqueue(() => push()); // edits that never reached the cloud (closed tab / offline)
      const rows = await enqueue(() => pull());
      if (rows.length) {
        if (hadBase && hasLocalChanges()) { C.schedule(); return false; } // edited while loading — send those first
        if (!hadBase) backupLocal();
        const changed = apply(rows);
        setState('saved');
        return changed || !hadBase;
      }
      await firstUpload();
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      C.blocking = false;
    }
  };

  /* Cloud is empty: offer to upload this browser's data (Admin / PM), otherwise start clean */
  async function firstUpload() {
    const db = PM.db;
    const n = (db.projects || []).length + (db.bids || []).length + (db.timesheets || []).length;
    base = {}; ords = {}; saveBase();
    synced = true; // the cloud is known (empty) — from here on this browser's edits go up
    if (n && PM.can('data.import')) {
      const what = PM.freshSeed ? 'ข้อมูลตัวอย่าง (Demo)' : 'ข้อมูลที่อยู่ในเครื่องนี้';
      const ok = confirm(`ฐานข้อมูลบน Cloud ยังว่างอยู่\n\nอัปโหลด${what} ขึ้น Cloud เพื่อใช้งานร่วมกันหรือไม่?\n(${db.projects.length} โครงการ · ${db.bids.length} bids · ${db.timesheets.length} timesheet entries)\n\nOK = อัปโหลด   ·   Cancel = เริ่มจากข้อมูลว่าง`);
      if (ok) { await C.replaceAll(); return; }
    }
    // start clean (keep a copy of real local data first)
    if (n && !PM.freshSeed) backupLocal();
    PM.db = PM.emptyDb();
    PM.lockCompany();
    PM.saveLocal();
    await enqueue(() => push().then(() => setState('saved')));
  }

  /* keep a copy of pre-cloud local data so nothing is lost when the cloud version replaces it */
  function backupLocal() {
    if (PM.freshSeed) return;
    try {
      if (localStorage.getItem(BACKUP_KEY)) return;
      localStorage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), db: PM.db }));
    } catch (e) { /* ignore */ }
  }
  C.localBackup = () => { try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null'); } catch (e) { return null; } };

  C.stop = function () {
    clearTimeout(timer); clearTimeout(retryTimer);
    C.enabled = false;
    const el = document.getElementById('sync-status');
    if (el) el.hidden = true;
  };

  /* refresh when the user comes back to the tab (see teammates' changes) */
  const maybeRefresh = () => {
    if (!C.enabled || document.hidden || Date.now() - lastPull < 30000) return;
    if (document.querySelector('.modal-backdrop')) return;
    C.sync(true);
  };
  window.addEventListener('focus', maybeRefresh);
  document.addEventListener('visibilitychange', maybeRefresh);
  window.addEventListener('online', () => { if (C.enabled) C.sync(true); });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-sync-retry]')) C.sync(true); });
  // best-effort send on close — no "leave page?" prompt: unsent edits stay in this browser and go up next time.
  // Phones & tablets rarely "close" a page: the browser is sent to the background and may be discarded
  // there without warning (timers are paused too), so pending edits are sent the moment the page is hidden.
  const flushNow = () => { if (C.enabled && timer) C.flush(); };
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushNow(); });
  document.addEventListener('freeze', flushNow);
})();
