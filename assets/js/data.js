/* data.js — constants, date utils, store, demo seed, metrics */
(function () {
  const PM = (window.PM = { views: {} });
  const STORAGE_KEY = 'epc-pm-db-v1';

  /* Fixed branding — the company name is locked and not editable in the app */
  PM.APP_NAME = 'BU4 IE/EPC Project Management';
  PM.COMPANY = 'Flowlab & Service Co.,LTD';

  /* ---------- constants ---------- */
  PM.BID_STAGES = [
    { key: 'inquiry', label: 'Inquiry', th: 'รับเรื่อง / สอบถาม' },
    { key: 'estimate', label: 'Estimate', th: 'ถอดแบบ / ประมาณราคา' },
    { key: 'proposal', label: 'Proposal', th: 'จัดทำข้อเสนอ' },
    { key: 'submit', label: 'Submit', th: 'ยื่นใบเสนอราคา / รอผล' },
  ];
  PM.bidStageLabel = (key) => { const s = PM.BID_STAGES.find((x) => x.key === key); return s ? s.label : ''; };
  /* the stage a bid was in on a given date (the last stage that had started by then) */
  PM.bidStageAt = (b, date) => { let s = 'inquiry'; PM.BID_STAGES.forEach((x) => { if (b.dates[x.key] && b.dates[x.key] <= date) s = x.key; }); return s; };
  /* ---------- bid commercial data (value · margin · quotation files) ----------
     Stored apart from the bid in cloud collection "bidprices" (cloud.js splits / merges it). The database sends a
     price row only to Admin and to the Sales who owns the bid (data.sql) — everyone else sees the bid without them.
     bid.owner = user id (auth) of the Sales account responsible for the bid. */
  PM.BID_SECRET = ['value', 'margin', 'files'];
  PM.myUid = () => (PM.auth && PM.auth.user ? PM.auth.user.id : '');
  PM.myRole = () => (PM.auth && PM.auth.role) || '';
  /* the Sales account behind the chosen Sales person (an account id, or an employee whose name matches an account) */
  PM.bidOwnerFor = function (salesId, salesName) {
    const team = PM.team || [];
    if (salesId && team.some((u) => u.id === salesId)) return salesId;
    const r = salesId && PM.db.resources.find((x) => x.id === salesId);
    const name = PM.normName(r ? r.name : salesName);
    const acc = name && team.find((u) => PM.normName(u.full_name) === name);
    return acc ? acc.id : '';
  };
  PM.bidOwner = (b) => (b && (b.owner || PM.bidOwnerFor(b.sales, b.salesName))) || '';
  const isMine = (b) => PM.myRole() === 'sales' && !!PM.myUid() && PM.bidOwner(b) === PM.myUid();
  /* price / margin / quotation files of this bid: Admin all · Sales their own */
  PM.canSeeBidPrice = (b) => PM.myRole() === 'admin' || isMine(b);
  /* add / edit / move a bid and record Won · Lost: Admin all · Sales their own (no bid = a new inquiry) */
  PM.canEditBid = (b) => PM.myRole() === 'admin' || (PM.myRole() === 'sales' && (!b || isMine(b)));
  /* does this role see any bid price at all (Sales: their own)? — decides whether money columns are shown */
  PM.seesBidPrices = () => PM.myRole() === 'admin' || PM.myRole() === 'sales';
  PM.BID_RESULTS = { pending: 'Pending', won: 'Won', lost: 'Lost', nobid: 'No-bid' };
  PM.SECTORS = ['Industrial', 'Energy', 'Oil & Gas', 'Infrastructure', 'Building'];
  PM.SCOPES = ['EPC', 'EP', 'E', 'C', 'Design & Build'];

  PM.PHASES = [
    { key: 'engineering', label: 'Engineering', th: 'วิศวกรรม / ออกแบบ' },
    { key: 'procurement', label: 'Procurement', th: 'จัดซื้อ / จัดหา' },
    { key: 'construction', label: 'Construction', th: 'ก่อสร้าง / ติดตั้ง' },
    { key: 'closing', label: 'Closing', th: 'ทดสอบ / ส่งมอบ / ปิดโครงการ' },
  ];
  PM.PHASE_DEFAULTS = {
    engineering: { range: [0, 0.3], weight: 15, budget: 0.08, unit: 'Drawings / Docs' },
    procurement: { range: [0.15, 0.65], weight: 30, budget: 0.5, unit: 'PO packages' },
    construction: { range: [0.35, 0.92], weight: 50, budget: 0.37, unit: 'Installed units' },
    closing: { range: [0.9, 1], weight: 5, budget: 0.05, unit: 'Handover docs' },
  };

  /* Person levels — "Add person" offers only these three */
  PM.PERSON_LEVELS = [
    { id: 'ENG', name: 'Engineer', rate: 700, target: 85 },
    { id: 'TECH', name: 'Technician', rate: 400, target: 85 },
    { id: 'OTHER', name: 'Other', rate: 500, target: 80 },
  ];
  /* old level → new: junior / technician grades → Technician, everything else → Engineer */
  PM.mapLegacyLevel = (id) => {
    const old = PM.db && PM.db.levels.find((x) => x.id === id);
    const text = `${id || ''} ${old ? old.name : ''}`;
    return /^L1$|junior|technician|ช่าง/i.test(String(id || '')) || /junior|technician|ช่าง/i.test(text) ? 'TECH' : 'ENG';
  };
  PM.levelName = (id) => { const l = PM.db && PM.db.levels.find((x) => x.id === id); return l ? l.name : id || '–'; };
  /* weekly capacity in hours (0 is valid, e.g. Sales who do not log project time) */
  PM.cap = (r) => (r && r.capacity != null && r.capacity !== '' ? Number(r.capacity) : 40);

  PM.PLAN_STATUS = [
    { key: 'planned', label: 'Planned', th: 'วางแผน', level: 'neutral' },
    { key: 'in_progress', label: 'In progress', th: 'กำลังทำ', level: 'info' },
    { key: 'done', label: 'Done', th: 'เสร็จ', level: 'good' },
    { key: 'not_done', label: 'Not done', th: 'ไม่เสร็จ', level: 'critical' },
  ];
  PM.PLAN_REASONS = ['Material not ready', 'Drawing / design not ready', 'Manpower shortage', 'Equipment breakdown', 'Weather', 'Waiting client approval', 'Previous work not finished', 'Other'];

  /* Purchase orders */
  PM.PO_STATUS = [
    { key: 'draft', label: 'Draft', th: 'ร่าง', level: 'neutral' },
    { key: 'issued', label: 'Issued', th: 'ออก PO แล้ว', level: 'info' },
    { key: 'confirmed', label: 'Confirmed', th: 'ผู้ขายยืนยัน', level: 'info' },
    { key: 'partial', label: 'Partially delivered', th: 'ส่งของบางส่วน', level: 'warning' },
    { key: 'delivered', label: 'Delivered', th: 'ส่งของครบ', level: 'good' },
    { key: 'closed', label: 'Closed', th: 'ปิด PO (จ่ายครบ)', level: 'good' },
    { key: 'cancelled', label: 'Cancelled', th: 'ยกเลิก', level: 'neutral' },
  ];
  PM.PO_CATEGORIES = ['Equipment', 'Material', 'Subcontract', 'Service', 'Rental', 'Other'];

  /* Price List / Vendor Cost — one record = one vendor's price for one item (prices.js) */
  PM.PRICE_UNITS = ['ea', 'pcs', 'set', 'lot', 'm', 'm²', 'm³', 'kg', 't', 'roll', 'man-day', 'day', 'month', 'hr'];
  PM.CURRENCIES = ['THB', 'USD', 'EUR', 'CNY', 'JPY'];
  PM.PRICE_EXPIRING_DAYS = 30;
  /* validity of a quoted price on date T: valid · expiring (≤ 30 days left) · expired · open (no end date) */
  PM.priceStatus = function (p, T) {
    if (!p.validUntil) return { key: 'open', level: 'neutral', th: 'ไม่ระบุวันหมดอายุ' };
    const left = PM.diffDays(T, p.validUntil);
    if (left < 0) return { key: 'expired', level: 'critical', th: `หมดอายุแล้ว ${-left} วัน`, left };
    if (left <= PM.PRICE_EXPIRING_DAYS) return { key: 'expiring', level: 'warning', th: `เหลือ ${left} วัน`, left };
    return { key: 'valid', level: 'good', th: 'ใช้ได้', left };
  };
  /* the same item quoted by different vendors: item code if given, otherwise name + unit */
  PM.priceItemKey = (p) => (String(p.code || '').trim() ? 'c:' + String(p.code).trim().toLowerCase() : 'n:' + PM.normName(p.name) + '|' + (p.unit || '')) + '|' + (p.currency || 'THB');
  const PO_OPEN = ['issued', 'confirmed', 'partial'];
  PM.poStatus = (k) => PM.PO_STATUS.find((s) => s.key === k) || PM.PO_STATUS[0];
  PM.poIsCommitted = (po) => po.status !== 'draft' && po.status !== 'cancelled';
  PM.poIsOpen = (po) => PO_OPEN.includes(po.status);
  PM.poDaysLate = (po, asOf) => (PM.poIsOpen(po) && po.deliveryDue && po.deliveryDue < (asOf || PM.today()) ? PM.diffDays(po.deliveryDue, asOf || PM.today()) : 0);
  PM.poStats = function (list, asOf) {
    asOf = asOf || PM.today();
    const committed = list.filter(PM.poIsCommitted);
    const open = list.filter(PM.poIsOpen);
    const late = open.filter((po) => PM.poDaysLate(po, asOf) > 0);
    const soon = open.filter((po) => po.deliveryDue && po.deliveryDue >= asOf && PM.diffDays(asOf, po.deliveryDue) <= 14);
    const value = PM.sum(committed, (po) => po.amount || 0);
    const paid = PM.sum(committed, (po) => po.paidAmount || 0);
    const delivered = committed.filter((po) => po.status === 'delivered' || po.status === 'closed');
    return {
      total: list.length, committed: committed.length, open: open.length, value, paid,
      paidPct: value ? paid / value : null,
      delivered: delivered.length, deliveredValue: PM.sum(delivered, (po) => po.amount || 0),
      late, lateValue: PM.sum(late, (po) => po.amount || 0), soon,
      files: PM.sum(list, (po) => (po.files || []).length),
    };
  };

  PM.NCR_CATEGORIES = ['Material', 'Workmanship', 'Design', 'Documentation', 'Supplier', 'Method'];
  PM.SEVERITY = ['Minor', 'Major', 'Critical'];
  PM.OVERHEAD = [
    { id: 'admin', label: 'Admin / Meeting' },
    { id: 'training', label: 'Training' },
    { id: 'leave', label: 'Leave (ลา)' },
  ];
  PM.DISCIPLINES = ['Project Management', 'Sales', 'Estimation', 'Civil/Structure', 'Mechanical', 'Electrical', 'Instrument', 'Procurement', 'QA/QC', 'Safety'];

  /* Sales — how the customer inquiry was found */
  PM.LEAD_SOURCES = ['Sales visit', 'Existing customer', 'Referral', 'Tender invitation', 'Website / Inbound', 'Exhibition / Event', 'Other'];

  /* Expense ledger — each entry: date / description / amount; a project's Actual cost = sum of its entries */
  PM.COST_CATEGORIES = ['Material', 'Equipment', 'Subcontract', 'Labour', 'Rental', 'Service', 'Transport', 'Site expense', 'Other'];
  PM.COST_OPENING = 'Opening balance'; // actual cost typed in before the ledger existed
  PM.projectCosts = (projectId) => PM.db.costs.filter((c) => c.projectId === projectId);
  /* write the ledger totals into each phase's actualCost (kept on the project so every KPI and screen reads one number) */
  PM.applyLedger = function (p) {
    const mine = PM.projectCosts(p.id);
    p.phases.forEach((ph) => { ph.actualCost = Math.round(PM.sum(mine.filter((c) => c.phase === ph.key), (c) => Number(c.amount) || 0) * 100) / 100; });
    p.costMode = 'ledger';
  };
  /* cumulative actual cost up to a date */
  PM.costToDate = (list, date) => PM.sum(list.filter((c) => c.date <= date), (c) => Number(c.amount) || 0);

  /* ---------- date utils (dates are 'YYYY-MM-DD' strings) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  PM.iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  PM.parse = (s) => (s ? new Date(s + 'T00:00:00') : null);
  PM.today = () => PM.iso(new Date());
  PM.addDays = (s, n) => { const d = PM.parse(s); d.setDate(d.getDate() + n); return PM.iso(d); };
  PM.diffDays = (a, b) => Math.round((PM.parse(b) - PM.parse(a)) / 86400000);
  PM.monday = (s) => { const d = PM.parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return PM.iso(d); };
  PM.isWeekday = (s) => { const g = PM.parse(s).getDay(); return g > 0 && g < 6; };
  PM.workdays = (a, b) => {
    let n = 0;
    for (let s = a; s <= b; s = PM.addDays(s, 1)) if (PM.isWeekday(s)) n++;
    return n;
  };
  PM.monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return PM.iso(new Date(y, m, 0)); };
  PM.months = (fromYm, toYm) => {
    const out = [];
    let [y, m] = fromYm.split('-').map(Number);
    const [ty, tm] = toYm.split('-').map(Number);
    while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${pad(m)}`); m++; if (m > 12) { m = 1; y++; } }
    return out;
  };
  PM.min = (a, b) => (a < b ? a : b);
  PM.max = (a, b) => (a > b ? a : b);
  PM.sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x || 0), 0);

  /* ---------- store ---------- */
  PM.uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  PM.load = function () {
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* storage blocked */ }
    try { PM.db = raw ? JSON.parse(raw) : PM.createSeed(); } catch (e) { PM.db = PM.createSeed(); raw = null; }
    PM.freshSeed = !raw; // demo data generated just now (nothing saved in this browser yet)
    PM.ensureShape();
    PM.lockCompany();
    if (!raw) PM.saveLocal();
  };
  /* Local cache only (used when data arrives from the cloud) */
  PM.saveLocal = function () {
    const json = JSON.stringify(PM.db);
    try { localStorage.setItem(STORAGE_KEY, json); return; } catch (e) { console.warn('Save failed', e); }
    // browser storage full: drop the one-time pre-cloud backup copy and try again
    try { localStorage.removeItem('epc-pm-db-local-backup'); localStorage.setItem(STORAGE_KEY, json); return; } catch (e) { /* still full */ }
    if (!PM.warnedStorage && PM.ui && PM.ui.toast) {
      PM.warnedStorage = true;
      PM.ui.toast(PM.cloud && PM.cloud.enabled ? 'พื้นที่เก็บข้อมูลของเบราว์เซอร์เต็ม — ข้อมูลยังบันทึกบน Cloud ตามปกติ' : 'พื้นที่เก็บข้อมูลของเบราว์เซอร์เต็ม — บันทึกไม่ได้ กรุณา Export ข้อมูลเก็บไว้');
    }
  };
  /* Every edit: write the local cache, then sync the change to Supabase (see cloud.js) */
  PM.save = function () {
    PM.saveLocal();
    if (PM.cloud) PM.cloud.schedule();
  };
  /* data saved by older versions may miss newer collections */
  PM.ensureShape = () => {
    ['bids', 'projects', 'ncrs', 'safety', 'resources', 'levels', 'timesheets', 'plans', 'pos', 'costs', 'prices'].forEach((c) => { if (!Array.isArray(PM.db[c])) PM.db[c] = []; });
    // projects from before the expense ledger: carry the typed-in actual cost over as one "opening balance" entry per phase
    // (fixed ids, so two browsers doing this at the same time create the same records)
    PM.db.projects.forEach((p) => {
      if (p.costMode === 'ledger' || !Array.isArray(p.phases)) return;
      p.phases.forEach((ph) => {
        const id = `CO-${p.id}-${ph.key}`;
        if (!(ph.actualCost > 0) || PM.db.costs.some((c) => c.id === id)) return;
        PM.db.costs.push({
          id, projectId: p.id, date: PM.today(), phase: ph.key, category: PM.COST_OPENING,
          description: 'ยอดยกมา — Actual cost สะสมก่อนเริ่มบันทึกรายการ', vendor: '', ref: '', poId: '', amount: ph.actualCost, note: '',
        });
      });
      p.costMode = 'ledger';
    });
    // fixed person levels: Engineer, Technician & Other
    PM.PERSON_LEVELS.forEach((l) => { if (!PM.db.levels.some((x) => x.id === l.id)) PM.db.levels.push(Object.assign({}, l)); });
    // older data (L1–L5): move people to Engineer / Technician, then drop the old levels
    const allowed = PM.PERSON_LEVELS.map((l) => l.id);
    PM.db.resources.forEach((r) => { if (!allowed.includes(r.level)) r.level = PM.mapLegacyLevel(r.level); });
    PM.db.levels = PM.db.levels.filter((l) => allowed.includes(l.id));
  };
  PM.lockCompany = () => { PM.db.meta = Object.assign({}, PM.db.meta, { company: PM.COMPANY }); };
  PM.find = (coll, id) => PM.db[coll].find((x) => x.id === id);
  PM.upsert = function (coll, obj) {
    const list = PM.db[coll];
    const i = list.findIndex((x) => x.id === obj.id);
    if (i >= 0) list[i] = obj; else list.push(obj);
    PM.save();
    return obj;
  };
  PM.remove = function (coll, id) {
    PM.db[coll] = PM.db[coll].filter((x) => x.id !== id);
    PM.save();
  };
  PM.reset = function (empty) {
    PM.db = empty ? PM.emptyDb() : PM.createSeed();
    PM.saveLocal();
    if (PM.cloud) PM.cloud.replaceAll();
  };
  PM.emptyDb = () => ({
    meta: { version: 1, company: PM.COMPANY, created: PM.today() },
    levels: PM.PERSON_LEVELS.map((l) => Object.assign({}, l)),
    resources: [], bids: [], projects: [], ncrs: [], safety: [], timesheets: [], plans: [], pos: [], costs: [], prices: [],
  });

  /* Build the 4 EPC phases for a new project from its dates and budget */
  PM.buildPhases = function (start, end, budget) {
    const dur = Math.max(1, PM.diffDays(start, end));
    return PM.PHASES.map((ph) => {
      const d = PM.PHASE_DEFAULTS[ph.key];
      return {
        key: ph.key, weight: d.weight,
        planStart: PM.addDays(start, Math.round(dur * d.range[0])),
        planEnd: PM.addDays(start, Math.round(dur * d.range[1])),
        actStart: '', actEnd: '', progress: 0,
        budget: Math.round((budget || 0) * d.budget), actualCost: 0,
        qtyUnit: d.unit, qtyPlan: 0, qtyDone: 0,
      };
    });
  };

  /* Save a progress snapshot (used for the actual S-curve) */
  PM.snapshotProgress = function (p, date) {
    date = date || PM.today();
    const values = {};
    p.phases.forEach((ph) => { values[ph.key] = ph.progress || 0; });
    p.progressLog = (p.progressLog || []).filter((s) => s.date !== date);
    p.progressLog.push({ date, values });
    p.progressLog.sort((a, b) => (a.date < b.date ? -1 : 1));
  };

  /* ---------- metrics ---------- */
  PM.plannedPct = function (ph, date) {
    if (!ph.planStart || !ph.planEnd) return 0;
    const tot = PM.diffDays(ph.planStart, ph.planEnd) || 1;
    return Math.max(0, Math.min(1, PM.diffDays(ph.planStart, date) / tot));
  };

  PM.weightedProgress = function (p, values) {
    const w = PM.sum(p.phases, (ph) => ph.weight) || 1;
    return PM.sum(p.phases, (ph) => ph.weight * (values[ph.key] || 0)) / w;
  };

  PM.projectMetrics = function (p, asOf) {
    asOf = asOf || PM.today();
    let wsum = 0, plan = 0, act = 0, bac = 0, pv = 0, ev = 0, ac = 0;
    const phases = p.phases.map((ph) => {
      const pp = PM.plannedPct(ph, asOf);
      const ap = (ph.progress || 0) / 100;
      wsum += ph.weight; plan += ph.weight * pp; act += ph.weight * ap;
      bac += ph.budget || 0; pv += (ph.budget || 0) * pp; ev += (ph.budget || 0) * ap; ac += ph.actualCost || 0;
      return Object.assign({}, ph, {
        plannedPct: pp, actualPct: ap,
        pv: (ph.budget || 0) * pp, ev: (ph.budget || 0) * ap,
        spi: pp > 0 ? ap / pp : null,
        cpi: ph.actualCost > 0 ? ((ph.budget || 0) * ap) / ph.actualCost : null,
        qtyPct: ph.qtyPlan > 0 ? ph.qtyDone / ph.qtyPlan : null,
      });
    });
    plan = wsum ? plan / wsum : 0;
    act = wsum ? act / wsum : 0;
    const spi = pv > 0 ? ev / pv : null;
    const cpi = ac > 0 ? ev / ac : null;
    const current = p.status === 'closed' ? null : phases.find((ph) => ph.actualPct < 1) || phases[phases.length - 1];

    const ncrs = PM.db.ncrs.filter((n) => n.projectId === p.id);
    const saf = PM.db.safety.filter((s) => s.projectId === p.id);
    const mh = PM.sum(saf, (s) => s.manhours);
    const lti = PM.sum(saf, (s) => s.lti);
    const rec = PM.sum(saf, (s) => s.recordable);
    return {
      phases, plan, act, bac, pv, ev, ac, spi, cpi,
      eac: cpi ? bac / cpi : bac,
      current,
      ncrTotal: ncrs.length,
      ncrOpen: ncrs.filter((n) => n.status === 'open').length,
      ncrCriticalOpen: ncrs.filter((n) => n.status === 'open' && n.severity === 'Critical').length,
      manhours: mh, lti, recordable: rec,
      firstAid: PM.sum(saf, (s) => s.firstAid),
      nearMiss: PM.sum(saf, (s) => s.nearMiss),
      ltifr: mh ? (lti * 1e6) / mh : 0,
      trir: mh ? ((rec + lti) * 2e5) / mh : 0,
      lastLti: saf.filter((s) => s.lti > 0).map((s) => s.month).sort().pop() || null,
    };
  };

  /* Cost overrun status from projectMetrics():
     over = Actual cost already above Plan cost · forecast = EAC (Plan cost ÷ CPI) will end above Plan cost · ok = within budget.
     A closed project has no forecast — its final cost is the Actual cost (eac = ac, forecast = final variance). */
  PM.COST_OVERRUN = {
    over: { level: 'critical', label: 'เกินงบแล้ว', rank: 0 },
    forecast: { level: 'warning', label: 'คาดว่าจะเกิน', rank: 1 },
    ok: { level: 'good', label: 'อยู่ในงบ', rank: 2 },
    nobudget: { level: 'neutral', label: 'ไม่มี Plan cost', rank: 3 },
  };
  PM.costOverrun = function (m, closed) {
    const eac = closed ? m.ac : m.eac;
    if (!(m.bac > 0)) return { status: 'nobudget', amount: 0, forecast: 0, used: null, eac, closed: !!closed };
    const used = m.ac / m.bac;
    const forecast = eac - m.bac; // + = overrun at completion (projected, or final when closed)
    const o = { amount: 0, forecast, used, eac, closed: !!closed };
    if (m.ac > m.bac) return Object.assign(o, { status: 'over', amount: m.ac - m.bac, forecast: Math.max(forecast, m.ac - m.bac) });
    if (!closed && m.cpi != null && forecast > 0) return Object.assign(o, { status: 'forecast' });
    return Object.assign(o, { status: 'ok' });
  };
  /* [{ p, m }] → same rows with .o, worst first: over → forecast → ok; active before closed; biggest overrun first */
  PM.costOverrunRows = function (rows) {
    const R = PM.COST_OVERRUN;
    return rows.map((r) => Object.assign({ o: PM.costOverrun(r.m, r.p.status === 'closed') }, r))
      .sort((a, b) => (R[a.o.status].rank - R[b.o.status].rank) || (a.o.closed - b.o.closed)
        || (b.o.amount - a.o.amount) || (b.o.forecast - a.o.forecast));
  };

  PM.bidStats = function (bids, from, to) {
    const list = bids.filter((b) => (!from || b.dates.inquiry >= from) && (!to || b.dates.inquiry <= to));
    const reached = {};
    PM.BID_STAGES.forEach((s) => { reached[s.key] = list.filter((b) => b.dates[s.key]).length; });
    const avg = (arr) => (arr.length ? PM.sum(arr) / arr.length : null);
    const stageDays = PM.BID_STAGES.map((s, i) => {
      const next = PM.BID_STAGES[i + 1];
      const vals = list
        .map((b) => {
          const a = b.dates[s.key];
          const z = next ? b.dates[next.key] : b.result === 'won' || b.result === 'lost' ? b.resultDate : null;
          return a && z ? PM.diffDays(a, z) : null;
        })
        .filter((v) => v != null);
      return { key: s.key, label: next ? s.label : 'Submit → Award', avg: avg(vals), n: vals.length };
    });
    const submitted = list.filter((b) => b.dates.submit);
    const onTime = submitted.filter((b) => !b.dueDate || b.dates.submit <= b.dueDate).length;
    const cycles = submitted.map((b) => PM.diffDays(b.dates.inquiry, b.dates.submit));
    const won = list.filter((b) => b.result === 'won');
    const lost = list.filter((b) => b.result === 'lost');
    const pending = list.filter((b) => b.result === 'pending');
    const decidedValue = PM.sum(won, (b) => b.value) + PM.sum(lost, (b) => b.value);
    return {
      list, reached, stageDays,
      total: list.length,
      submitted: submitted.length,
      onTimeRate: submitted.length ? onTime / submitted.length : null,
      avgCycle: avg(cycles),
      won: won.length, lost: lost.length,
      nobid: list.filter((b) => b.result === 'nobid').length,
      winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
      winRateValue: decidedValue ? PM.sum(won, (b) => b.value) / decidedValue : null,
      wonValue: PM.sum(won, (b) => b.value),
      pipeline: pending.length,
      pipelineValue: PM.sum(pending, (b) => b.value),
      atStage: (key) => pending.filter((b) => b.stage === key),
    };
  };

  /* Per salesperson: bids they brought in (in the period) + projects they are responsible for.
     id '' = bids / projects with no salesperson yet (listed only when there are some). */
  /* Sales can be a person from the list (id) or a name typed in freely (no id) — group by id, else by name */
  PM.normName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  PM.salesKey = (x) => (!x ? '' : x.sales || (PM.normName(x.salesName) ? 'n:' + PM.normName(x.salesName) : ''));
  PM.salesStats = function (from, to) {
    const db = PM.db;
    const ids = [];
    const add = (id) => { if (!ids.includes(id)) ids.push(id); };
    db.resources.filter((r) => r.discipline === 'Sales' && r.active !== false).forEach((r) => add(r.id));
    db.bids.forEach((b) => add(PM.salesKey(b)));
    db.projects.forEach((p) => add(PM.salesKey(p)));
    return ids.map((id) => {
      const bids = db.bids.filter((b) => PM.salesKey(b) === id);
      const projects = db.projects.filter((p) => PM.salesKey(p) === id);
      const active = projects.filter((p) => p.status !== 'closed');
      const pending = bids.filter((b) => b.result === 'pending');
      const named = bids.find((b) => b.salesName) || projects.find((p) => p.salesName);
      return {
        id, fallbackName: named ? named.salesName : '', bids, projects, active,
        bs: PM.bidStats(bids, from, to),
        pipeline: pending.length, pipelineValue: PM.sum(pending, (b) => b.value || 0),
        activeValue: PM.sum(active, (p) => p.contractValue || 0),
      };
    }).filter((x) => x.id || x.bids.length || x.projects.length);
  };

  PM.utilization = function (from, to) {
    const db = PM.db;
    to = PM.min(to, PM.today());
    const days = from <= to ? PM.workdays(from, to) : 0;
    const ts = db.timesheets.filter((t) => t.date >= from && t.date <= to);
    const people = db.resources.filter((r) => r.active !== false).map((r) => {
      const mine = ts.filter((t) => t.resourceId === r.id);
      const project = PM.sum(mine.filter((t) => t.kind === 'project'), (t) => t.hours);
      const bid = PM.sum(mine.filter((t) => t.kind === 'bid'), (t) => t.hours);
      const leave = PM.sum(mine.filter((t) => t.kind === 'overhead' && t.refId === 'leave'), (t) => t.hours);
      const overhead = PM.sum(mine.filter((t) => t.kind === 'overhead' && t.refId !== 'leave'), (t) => t.hours);
      const capacity = (PM.cap(r) / 5) * days;
      const available = Math.max(0, capacity - leave);
      const billable = project + bid;
      const level = db.levels.find((l) => l.id === r.level);
      return {
        r, level, capacity, available, project, bid, leave, overhead, billable,
        logged: project + bid + leave + overhead,
        util: available ? billable / available : null,
        target: level ? level.target / 100 : 0.8,
      };
    });
    const byLevel = db.levels.map((l) => {
      const ps = people.filter((p) => p.r.level === l.id);
      const av = PM.sum(ps, (p) => p.available);
      const bl = PM.sum(ps, (p) => p.billable);
      return { level: l, n: ps.length, available: av, billable: bl, util: av ? bl / av : null, target: l.target / 100 };
    }).filter((x) => x.n > 0 || PM.PERSON_LEVELS.some((l) => l.id === x.level.id)); // fixed levels always listed
    const total = {
      capacity: PM.sum(people, (p) => p.capacity),
      available: PM.sum(people, (p) => p.available),
      billable: PM.sum(people, (p) => p.billable),
      logged: PM.sum(people, (p) => p.logged),
      project: PM.sum(people, (p) => p.project),
      bid: PM.sum(people, (p) => p.bid),
      overhead: PM.sum(people, (p) => p.overhead),
      leave: PM.sum(people, (p) => p.leave),
    };
    total.util = total.available ? total.billable / total.available : null;
    total.missing = Math.max(0, total.capacity - total.logged);
    return { from, to, days, people, byLevel, total, entries: ts };
  };

  /* ---------- demo seed (relative to today so it always looks current) ---------- */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  PM.createSeed = function () {
    const R = rng(20260927);
    const T = PM.today();
    const rnd = (a, b) => a + R() * (b - a);
    const ri = (a, b) => Math.floor(rnd(a, b + 1));
    const pick = (arr) => arr[Math.floor(R() * arr.length)];
    const db = PM.emptyDb();

    const people = [
      ['สมชาย ใจดี', 'L5', 'Project Management'],
      ['วิภาวดี ศรีสุข', 'L5', 'Project Management'],
      ['ธนากร พงษ์ไทย', 'L4', 'Estimation'],
      ['กมลชนก แก้วมณี', 'L3', 'Estimation'],
      ['ปิยะพงษ์ มั่นคง', 'L4', 'Civil/Structure'],
      ['ณัฐวุฒิ ทองดี', 'L3', 'Mechanical'],
      ['อรอุมา บุญมา', 'L3', 'Electrical'],
      ['จิรายุ สายสุวรรณ', 'L2', 'Civil/Structure'],
      ['พิมพ์ชนก รุ่งเรือง', 'L2', 'Procurement'],
      ['ศุภชัย วงศ์ใหญ่', 'L2', 'QA/QC'],
      ['ชลธิชา อินทร์แก้ว', 'L2', 'Safety'],
      ['กิตติพัฒน์ นาคสุข', 'L1', 'Mechanical'],
      ['นันทนา ปานทอง', 'L1', 'Electrical'],
      ['อนุชา เพชรรัตน์', 'L1', 'Procurement'],
    ];
    // demo people: juniors → Technician, the rest → Engineer
    db.resources = people.map((p, i) => ({ id: 'R' + (i + 1), name: p[0], level: p[1] === 'L1' ? 'TECH' : 'ENG', discipline: p[2], capacity: 40, active: true }));

    /* projects */
    const projDefs = [
      { id: 'P1', code: 'PJ-2501', name: 'Solar Rooftop 5 MWp – โรงงานระยอง', client: 'Siam Auto Parts Co., Ltd.', value: 185e6, start: -330, dur: 450, f: 0.93, cf: 1.05, pm: 'R1',
        qty: { engineering: ['Drawings', 180], procurement: ['PO packages', 38], construction: ['kWp installed', 5000], closing: ['Handover docs', 60] } },
      { id: 'P2', code: 'PJ-2502', name: 'Chemical Tank Farm Expansion – มาบตาพุด', client: 'Eastern Chem Industries PCL', value: 320e6, start: -215, dur: 540, f: 1.03, cf: 0.97, pm: 'R2',
        qty: { engineering: ['Drawings', 420], procurement: ['PO packages', 64], construction: ['t steel erected', 1200], closing: ['Handover docs', 120] } },
      { id: 'P3', code: 'PJ-2503', name: 'Warehouse & Office Building – บางนา', client: 'Nexa Logistics Co., Ltd.', value: 95e6, start: -400, dur: 430, f: 0.97, cf: 1.01, pm: 'R1',
        qty: { engineering: ['Drawings', 150], procurement: ['PO packages', 30], construction: ['m² floor area', 18000], closing: ['Handover docs', 45] } },
      { id: 'P4', code: 'PJ-2504', name: 'Substation 115 kV Upgrade', client: 'Thai Grid Industrial Estate', value: 260e6, start: -80, dur: 480, f: 0.86, cf: 1.02, pm: 'R2',
        qty: { engineering: ['Drawings', 260], procurement: ['PO packages', 42], construction: ['Equipment sets', 48], closing: ['Handover docs', 80] } },
      { id: 'P5', code: 'PJ-2401', name: 'Water Treatment Plant Phase 1', client: 'Chonburi Water Utility Co.', value: 140e6, start: -760, dur: 380, f: 1, cf: 0.98, pm: 'R1', closed: true,
        qty: { engineering: ['Drawings', 200], procurement: ['PO packages', 40], construction: ['m³ concrete', 6500], closing: ['Handover docs', 70] } },
    ];

    const progressAt = (ph, date, def) => {
      if (def.closed) return 100;
      const pp = PM.plannedPct(ph, date);
      if (pp <= 0) return 0;
      if (PM.diffDays(ph.planEnd, date) > 40) return 100;
      return Math.min(100, Math.round(pp * 100 * def.f));
    };

    db.projects = projDefs.map((d) => {
      const start = PM.addDays(T, d.start);
      const end = PM.addDays(start, d.dur);
      const budget = Math.round(d.value * 0.86);
      const p = {
        id: d.id, code: d.code, name: d.name, client: d.client, contractValue: d.value, budget,
        startDate: start, endDate: end, pm: d.pm, status: d.closed ? 'closed' : 'active', bidId: null,
        phases: PM.buildPhases(start, end, budget), progressLog: [],
      };
      p.phases.forEach((ph) => {
        ph.progress = progressAt(ph, T, d);
        if (ph.progress > 0) ph.actStart = PM.addDays(ph.planStart, ri(-2, d.f < 1 ? 12 : 4));
        if (ph.progress >= 100) ph.actEnd = PM.min(T, PM.addDays(ph.planEnd, d.f < 1 ? ri(5, 25) : ri(-6, 3)));
        ph.actualCost = Math.round((ph.budget * ph.progress) / 100 * d.cf * rnd(0.98, 1.03));
        ph.qtyUnit = d.qty[ph.key][0];
        ph.qtyPlan = d.qty[ph.key][1];
        ph.qtyDone = Math.round((ph.qtyPlan * ph.progress) / 100);
      });
      PM.months(start.slice(0, 7), PM.min(end, T).slice(0, 7)).forEach((ym) => {
        const date = PM.min(PM.monthEnd(ym), PM.min(end, T));
        const values = {};
        p.phases.forEach((ph) => { values[ph.key] = d.closed && date >= end ? 100 : progressAt(ph, date, Object.assign({}, d, { closed: false })); });
        p.progressLog.push({ date, values });
      });
      PM.snapshotProgress(p, PM.min(T, end));
      if (d.closed) {
        p.progressLog.forEach((s) => { if (s.date >= PM.addDays(end, -1)) PM.PHASES.forEach((x) => (s.values[x.key] = 100)); });
      }
      return p;
    });

    /* bids */
    let bidNo = 0;
    const mkBid = (name, client, sector, scope, valueM, stage, result, inqDate, estimator, projectId) => {
      bidNo++;
      const d1 = ri(2, 6), d2 = ri(6, 16), d3 = ri(3, 9);
      const idx = PM.BID_STAGES.findIndex((s) => s.key === stage);
      const dates = { inquiry: inqDate, estimate: '', proposal: '', submit: '' };
      if (idx >= 1) dates.estimate = PM.addDays(inqDate, d1);
      if (idx >= 2) dates.proposal = PM.addDays(inqDate, d1 + d2);
      if (idx >= 3) dates.submit = PM.addDays(inqDate, d1 + d2 + d3);
      const due = PM.addDays(inqDate, d1 + d2 + d3 + ri(-3, 8));
      let resultDate = '';
      if (result === 'won' || result === 'lost') resultDate = PM.min(T, PM.addDays(dates.submit, ri(14, 40)));
      if (result === 'nobid') resultDate = dates[stage];
      return {
        id: 'B' + bidNo, code: 'BD-' + inqDate.slice(2, 4) + '-' + String(bidNo).padStart(3, '0'),
        name, client, sector, scope, value: Math.round(valueM * 1e6), margin: ri(8, 16),
        estimator, boqItems: ri(80, 900), dueDate: due, dates, stage, result, resultDate,
        projectId: projectId || null, notes: '',
      };
    };
    db.bids = [];
    // won bids that became projects
    projDefs.forEach((d, i) => {
      const p = db.projects[i];
      const sector = ['Energy', 'Oil & Gas', 'Building', 'Energy', 'Infrastructure'][i];
      const b = mkBid(d.name, d.client, sector, 'EPC', d.value / 1e6, 'submit', 'won', PM.addDays(p.startDate, -ri(75, 105)), i % 2 ? 'R4' : 'R3', p.id);
      b.resultDate = PM.addDays(p.startDate, -ri(10, 20));
      p.bidId = b.id;
      db.bids.push(b);
    });
    const open = [
      ['Cold Storage Warehouse 12,000 m²', 'FreshChain Foods Co., Ltd.', 'Building', 'Design & Build', 'inquiry', 'pending', 3],
      ['Boiler Replacement 40 TPH', 'Eastern Sugar Mill Co., Ltd.', 'Industrial', 'EPC', 'inquiry', 'pending', 6],
      ['Compressed Air System Upgrade', 'Siam Auto Parts Co., Ltd.', 'Industrial', 'EP', 'inquiry', 'pending', 9],
      ['Solar Farm 8 MW – นครราชสีมา', 'Korat Green Power Co., Ltd.', 'Energy', 'EPC', 'estimate', 'pending', 12],
      ['Pipe Rack & Utility Tie-in', 'Eastern Chem Industries PCL', 'Oil & Gas', 'EPC', 'estimate', 'pending', 16],
      ['Data Center Electrical Fit-out', 'CloudNine DC Co., Ltd.', 'Building', 'EP', 'estimate', 'pending', 20],
      ['Wastewater Treatment Upgrade', 'Siam Beverage Co., Ltd.', 'Infrastructure', 'EPC', 'proposal', 'pending', 22],
      ['LPG Storage Sphere 2,000 m³', 'Gulf Coast Energy Co., Ltd.', 'Oil & Gas', 'EPC', 'proposal', 'pending', 27],
      ['Rooftop Solar 2 MWp', 'Nexa Logistics Co., Ltd.', 'Energy', 'EPC', 'submit', 'pending', 40],
      ['Fire Protection System Upgrade', 'Thai Tyre Manufacturing', 'Industrial', 'EPC', 'submit', 'pending', 55],
      ['Cooling Tower Replacement', 'Eastern Sugar Mill Co., Ltd.', 'Industrial', 'EP', 'submit', 'pending', 70],
      ['Factory Extension Phase 2', 'Siam Auto Parts Co., Ltd.', 'Industrial', 'Design & Build', 'submit', 'won', 110],
      ['Biomass Power Plant BOP', 'Northern Bio Energy Co., Ltd.', 'Energy', 'EPC', 'submit', 'lost', 100],
      ['Road & Drainage – Industrial Estate', 'Thai Grid Industrial Estate', 'Infrastructure', 'C', 'submit', 'lost', 160],
      ['Admin Building Renovation', 'Chonburi Water Utility Co.', 'Building', 'C', 'submit', 'lost', 210],
      ['HV Cable Replacement 22 kV', 'Eastern Chem Industries PCL', 'Energy', 'EPC', 'submit', 'won', 250],
      ['Tank Cleaning & Repair', 'Gulf Coast Energy Co., Ltd.', 'Oil & Gas', 'C', 'submit', 'lost', 300],
      ['Chemical Warehouse', 'Thai Tyre Manufacturing', 'Building', 'EPC', 'estimate', 'nobid', 140],
      ['Steam Line Replacement', 'Siam Beverage Co., Ltd.', 'Industrial', 'EP', 'submit', 'won', 330],
    ];
    open.forEach((o, i) => {
      const vm = Math.round(rnd(8, 360));
      db.bids.push(mkBid(o[0], o[1], o[2], o[3], vm, o[4], o[5], PM.addDays(T, -o[6]), i % 2 ? 'R4' : 'R3', null));
    });
    // "Steam Line" and "HV Cable" are won and small — treat as already delivered (no project record needed)
    db.bids.sort((a, b) => (a.dates.inquiry < b.dates.inquiry ? -1 : 1));

    /* NCRs */
    const ncrTexts = [
      ['Weld porosity found on pipe spool (RT reject)', 'Workmanship'],
      ['Concrete cube strength below spec C30', 'Material'],
      ['Cable size delivered not as approved datasheet', 'Supplier'],
      ['Superseded drawing revision used on site', 'Documentation'],
      ['Rebar spacing out of tolerance', 'Workmanship'],
      ['Panel IP rating not as specified', 'Design'],
      ['Missing mill certificate for steel plate', 'Documentation'],
      ['Anchor bolt misalignment > 5 mm', 'Workmanship'],
      ['Painting DFT below minimum', 'Method'],
      ['Transformer delivered with damaged bushing', 'Supplier'],
      ['Clash between cable tray and HVAC duct', 'Design'],
      ['Grouting not cured per procedure', 'Method'],
    ];
    const ncrCount = { P1: 7, P2: 5, P3: 5, P4: 2, P5: 4 };
    let ncrNo = 0;
    db.ncrs = [];
    db.projects.forEach((p) => {
      const upto = PM.min(T, p.endDate);
      const span = PM.diffDays(p.startDate, upto);
      for (let i = 0; i < ncrCount[p.id]; i++) {
        ncrNo++;
        const [desc, cat] = pick(ncrTexts);
        const date = PM.addDays(p.startDate, ri(Math.round(span * 0.2), span));
        const age = PM.diffDays(date, T);
        const closed = p.status === 'closed' || (age > 25 && R() < 0.8);
        const phase = cat === 'Design' || cat === 'Documentation' ? pick(['engineering', 'construction']) : cat === 'Supplier' ? 'procurement' : 'construction';
        db.ncrs.push({
          id: 'N' + ncrNo, projectId: p.id,
          no: `NCR-${p.code.slice(3)}-${String(i + 1).padStart(3, '0')}`,
          date, phase, category: cat, severity: R() < 0.12 ? 'Critical' : R() < 0.45 ? 'Major' : 'Minor',
          description: desc, responsible: pick(['Main Contractor', 'Sub-con (Civil)', 'Sub-con (M&E)', 'Supplier', 'Engineering Dept.']),
          action: closed ? 'Rework completed and re-inspected' : '',
          status: closed ? 'closed' : 'open',
          closedDate: closed ? PM.min(upto, PM.addDays(date, ri(4, 30))) : '',
        });
      }
    });
    db.ncrs.sort((a, b) => (a.date < b.date ? -1 : 1));

    /* safety — monthly statistics per project */
    let sNo = 0;
    db.safety = [];
    db.projects.forEach((p) => {
      const cons = p.phases.find((ph) => ph.key === 'construction');
      PM.months(p.startDate.slice(0, 7), PM.min(p.endDate, T).slice(0, 7)).forEach((ym) => {
        const mid = ym + '-15';
        const active = mid >= cons.planStart && mid <= PM.addDays(cons.planEnd, 30);
        const scale = p.contractValue / 200e6;
        sNo++;
        db.safety.push({
          id: 'S' + sNo, projectId: p.id, month: ym,
          manhours: Math.round((active ? rnd(9000, 21000) : rnd(900, 2600)) * scale),
          nearMiss: active ? ri(0, 4) : ri(0, 1),
          firstAid: active && R() < 0.45 ? ri(1, 2) : 0,
          recordable: active && R() < 0.08 ? 1 : 0,
          lti: 0, toolboxTalks: active ? ri(8, 20) : ri(0, 4), remark: '',
        });
      });
    });
    const p2lti = db.safety.filter((s) => s.projectId === 'P2');
    if (p2lti.length > 4) { const s = p2lti[p2lti.length - 4]; s.lti = 1; s.remark = 'Hand injury during rigging — 3 days lost'; }
    const p5 = db.safety.filter((s) => s.projectId === 'P5');
    if (p5.length > 6) p5[6].lti = 1;

    /* timesheets — last 12 weeks */
    const alloc = {
      R1: [['project', 'P1', 'construction', 0.45], ['project', 'P3', 'closing', 0.15], ['bid', '*', '', 0.1], ['overhead', 'admin', '', 0.3]],
      R2: [['project', 'P2', 'construction', 0.35], ['project', 'P4', 'engineering', 0.3], ['overhead', 'admin', '', 0.35]],
      R3: [['bid', '*', '', 0.82], ['overhead', 'admin', '', 0.18]],
      R4: [['bid', '*', '', 0.85], ['overhead', 'admin', '', 0.1], ['overhead', 'training', '', 0.05]],
      R5: [['project', 'P2', 'construction', 0.5], ['project', 'P4', 'engineering', 0.3], ['overhead', 'admin', '', 0.2]],
      R6: [['project', 'P2', 'construction', 0.6], ['project', 'P1', 'construction', 0.36], ['overhead', 'admin', '', 0.04]],
      R7: [['project', 'P4', 'engineering', 0.6], ['project', 'P1', 'construction', 0.3], ['overhead', 'admin', '', 0.1]],
      R8: [['project', 'P3', 'closing', 0.3], ['project', 'P2', 'construction', 0.5], ['overhead', 'admin', '', 0.2]],
      R9: [['project', 'P2', 'procurement', 0.5], ['project', 'P4', 'procurement', 0.3], ['overhead', 'admin', '', 0.2]],
      R10: [['project', 'P1', 'construction', 0.4], ['project', 'P2', 'construction', 0.4], ['overhead', 'admin', '', 0.2]],
      R11: [['project', 'P1', 'construction', 0.45], ['project', 'P2', 'construction', 0.45], ['overhead', 'training', '', 0.1]],
      R12: [['project', 'P2', 'construction', 0.5], ['overhead', 'training', '', 0.2], ['overhead', 'admin', '', 0.3]],
      R13: [['project', 'P1', 'construction', 0.7], ['overhead', 'admin', '', 0.1], ['overhead', 'training', '', 0.2]],
      R14: [['project', 'P1', 'procurement', 0.4], ['project', 'P4', 'procurement', 0.3], ['overhead', 'admin', '', 0.3]],
    };
    const dayHours = { R3: 8.5, R6: 9.5, R11: 8.5 };
    let tNo = 0;
    db.timesheets = [];
    const from = PM.addDays(PM.monday(T), -7 * 11);
    for (let d = from; d <= T; d = PM.addDays(d, 1)) {
      if (!PM.isWeekday(d)) continue;
      db.resources.forEach((r) => {
        const push = (kind, refId, phase, hours) => { tNo++; db.timesheets.push({ id: 't' + tNo, resourceId: r.id, date: d, kind, refId, phase, hours }); };
        if (R() < 0.04) { push('overhead', 'leave', '', 8); return; }
        const total = Math.round((dayHours[r.id] || 8) + (R() < 0.2 ? 1 : 0));
        const a = alloc[r.id];
        const bucket = {};
        for (let h = 0; h < total; h++) {
          let x = R(), k = 0;
          while (k < a.length - 1 && x > a[k][3]) { x -= a[k][3]; k++; }
          bucket[k] = (bucket[k] || 0) + 1;
        }
        let openBids = db.bids.filter((b) => b.dates.inquiry <= d && (b.dates.submit || b.resultDate || T) >= d);
        if (!openBids.length) openBids = db.bids.filter((b) => b.dates.inquiry <= d).slice(-3); // bids are sorted by inquiry date
        Object.keys(bucket).forEach((k) => {
          const [kind, ref, phase] = a[k];
          if (ref === '*') {
            if (openBids.length) { const b = pick(openBids); push(kind, b.id, kind === 'bid' ? PM.bidStageAt(b, d) : phase, bucket[k]); }
            else push('overhead', 'admin', '', bucket[k]);
          } else push(kind, ref, phase, bucket[k]);
        });
      });
    }

    /* weekly plan — 6 past weeks, this week, next week (built from each person's allocation) */
    const TASKS = {
      engineering: ['Issue IFC drawings', 'Review vendor documents', 'Update P&ID / SLD', 'Cable & load schedule', 'Design review meeting'],
      procurement: ['Issue PO', 'Expedite delivery', 'Factory acceptance test (FAT)', 'Technical bid evaluation', 'Material inspection on site'],
      construction: ['Install equipment', 'Concrete pouring', 'Cable pulling', 'Steel erection', 'Pressure test', 'Punch list walkdown'],
      closing: ['Prepare as-built drawings', 'Commissioning test', 'Handover documents', 'Final inspection with client'],
      bid: ['BOQ take-off', 'Request vendor quotations', 'Prepare technical proposal', 'Site survey'],
    };
    const AREAS = ['Area A', 'Area B', 'Zone 1', 'Zone 2', 'Line 100', 'Building 2', 'Roof', 'MCC room'];
    const UNITS = ['m', 'pcs', 'm³', 't', 'sets'];
    let wNo = 0;
    db.plans = [];
    for (let w = -6; w <= 1; w++) {
      const week = PM.addDays(PM.monday(T), 7 * w);
      const weekEnd = PM.addDays(week, 6);
      db.resources.forEach((r) => {
        const work = alloc[r.id].filter((a) => a[0] !== 'overhead');
        const n = Math.min(work.length + 1, ri(2, 4));
        const hoursEach = Math.max(4, Math.round((34 / n) / 2) * 2);
        for (let i = 0; i < n; i++) {
          const [kind, ref, phase] = work[i % work.length];
          let refId = ref;
          if (ref === '*') {
            const open = db.bids.filter((b) => b.dates.inquiry <= weekEnd && (b.dates.submit || b.resultDate || T) >= week);
            if (!open.length) continue;
            refId = pick(open).id;
          }
          const group = kind === 'bid' ? 'bid' : phase;
          const isSite = group === 'construction';
          const due = PM.addDays(week, ri(1, 4));
          let status = 'planned', reason = '';
          if (weekEnd < T || (w === 0 && due < T)) {
            if (R() < 0.8) status = 'done';
            else { status = 'not_done'; reason = pick(PM.PLAN_REASONS); }
          } else if (w === 0 && R() < 0.4) status = 'in_progress';
          const qtyPlan = isSite ? ri(2, 40) * 5 : 0;
          wNo++;
          db.plans.push({
            id: 'W' + wNo, week, kind, refId, phase: kind === 'project' ? phase : '',
            title: pick(TASKS[group]) + (isSite ? ' – ' + pick(AREAS) : ''),
            resourceId: r.id, plannedHours: hoursEach, dueDate: due,
            qtyPlan, qtyDone: status === 'done' ? qtyPlan : status === 'planned' ? 0 : Math.round(qtyPlan * rnd(0.3, 0.8)),
            unit: isSite ? pick(UNITS) : '', status, reason, note: '', carriedFrom: null,
          });
        }
      });
    }

    /* purchase orders — per project, dated inside the procurement phase (demo has no files) */
    const PO_ITEMS = [
      ['Main equipment package', 'Equipment'], ['Electrical panels (MDB / DB)', 'Equipment'], ['Power cables & accessories', 'Material'],
      ['Structural steel', 'Material'], ['Piping, valves & fittings', 'Material'], ['Instruments & control', 'Equipment'],
      ['Civil materials (rebar, concrete)', 'Material'], ['Installation subcontract', 'Subcontract'], ['Scaffolding rental', 'Rental'],
      ['Testing & commissioning service', 'Service'],
    ];
    const SUPPLIERS = ['EastPower Equipment Co., Ltd.', 'Thai Cable Industry Co., Ltd.', 'Bangkok Steel Trading Co., Ltd.', 'ProTech Instruments Co., Ltd.',
      'Siam Pipe & Valve Co., Ltd.', 'Grand Concrete Co., Ltd.', 'Rayong Scaffold Service', 'Delta Solar Parts Co., Ltd.', 'Unity M&E Contractor Co., Ltd.'];
    db.pos = [];
    db.projects.forEach((p, pi) => {
      const proc = p.phases.find((ph) => ph.key === 'procurement');
      if (!proc || proc.planStart > T) return;
      const until = PM.min(T, proc.planEnd);
      const span = Math.max(1, PM.diffDays(proc.planStart, until));
      const full = Math.max(1, PM.diffDays(proc.planStart, proc.planEnd));
      const n = p.status === 'closed' ? 6 : Math.max(2, Math.round(9 * Math.min(1, span / full)));
      const shares = Array.from({ length: n }, () => rnd(0.5, 1.5));
      const total = PM.sum(shares);
      for (let i = 0; i < n; i++) {
        const [desc, cat] = PO_ITEMS[i % PO_ITEMS.length];
        const poDate = PM.min(T, PM.addDays(proc.planStart, Math.round((span * i) / n) + ri(0, 5)));
        const due = PM.addDays(poDate, ri(30, 90));
        const amount = Math.round((proc.budget * 0.9 * shares[i]) / total / 1000) * 1000;
        let status, delivered = '';
        if (p.status === 'closed') { status = 'closed'; delivered = PM.addDays(due, ri(-5, 5)); }
        else if (due < PM.addDays(T, -10)) {
          if (R() < 0.82) { status = R() < 0.5 ? 'closed' : 'delivered'; delivered = PM.min(T, PM.addDays(due, ri(-6, 12))); }
          else status = 'partial'; // overdue
        } else if (due < T) status = R() < 0.5 ? 'partial' : 'confirmed';
        else status = R() < 0.6 ? 'confirmed' : 'issued';
        const paid = { closed: 1, delivered: 0.9, partial: 0.4, confirmed: 0.1, issued: 0 }[status] || 0;
        db.pos.push({
          id: 'PO' + (db.pos.length + 1), projectId: p.id,
          poNo: `PO-${p.code.replace(/^PJ-/, '')}-${String(i + 1).padStart(3, '0')}`,
          supplier: SUPPLIERS[(i + pi * 3) % SUPPLIERS.length], description: desc, category: cat, phase: 'procurement',
          amount, poDate, deliveryDue: due, deliveredDate: delivered, status,
          paidAmount: Math.round(amount * paid), note: '', files: [],
        });
      }
    });

    /* expense ledger — spending follows progress: every monthly progress step becomes 1–3 dated expense entries */
    const COST_ITEMS = {
      engineering: [['Design consultant fee', 'Service'], ['Soil investigation & survey', 'Service'], ['Engineering manhours (in-house)', 'Labour'], ['Document printing & control', 'Other']],
      construction: [['Subcontract progress payment', 'Subcontract'], ['Site labour wages', 'Labour'], ['Crane & equipment rental', 'Rental'], ['Consumables & small tools', 'Material'], ['Site office & utilities', 'Site expense'], ['Concrete & rebar', 'Material']],
      closing: [['Commissioning service', 'Service'], ['As-built documentation', 'Service'], ['Client training', 'Labour'], ['Final cleaning & demobilisation', 'Site expense']],
      procurement: [['Freight & customs clearance', 'Transport'], ['Vendor inspection trip', 'Transport']],
    };
    const COST_VENDORS = ['Unity M&E Contractor Co., Ltd.', 'Siam Engineering Consultant Co., Ltd.', 'Eastern Crane Service', 'Rayong Scaffold Service', 'Thai Logistics Express', 'Site petty cash'];
    db.costs = [];
    db.projects.forEach((p, pi) => {
      const d = projDefs[pi];
      const pos = db.pos.filter((po) => po.projectId === p.id);
      const prev = {};
      let prevDate = PM.addDays(p.startDate, -1);
      p.progressLog.forEach((snap) => {
        const span = Math.max(0, PM.diffDays(prevDate, snap.date) - 1);
        p.phases.forEach((ph) => {
          const delta = ((snap.values[ph.key] || 0) - (prev[ph.key] || 0)) / 100;
          prev[ph.key] = snap.values[ph.key] || 0;
          if (delta <= 0) return;
          const amount = ph.budget * delta * d.cf * rnd(0.97, 1.04);
          const n = amount > 2e6 ? ri(2, 3) : 1;
          for (let k = 0; k < n; k++) {
            const date = PM.min(snap.date, PM.addDays(prevDate, 1 + ri(0, span)));
            const part = Math.round(amount / n / 100) * 100;
            // procurement spending is paid against a PO while that PO still has value left
            const po = ph.key === 'procurement' ? pick(pos.filter((x) => x.poDate <= date && PM.poIsCommitted(x) && (x.amount - (x.billed || 0)) >= part)) : null;
            if (po) po.billed = (po.billed || 0) + part;
            const [item, cat] = po ? [`Payment — ${po.description}`, po.category] : pick(COST_ITEMS[ph.key]);
            db.costs.push({
              id: 'C' + (db.costs.length + 1), projectId: p.id, date, phase: ph.key, category: cat, description: item,
              vendor: po ? po.supplier : pick(COST_VENDORS), ref: `INV-${date.slice(2, 4)}${date.slice(5, 7)}-${String(db.costs.length + 1).padStart(4, '0')}`,
              poId: po ? po.id : '', amount: part, note: '',
            });
          }
        });
        prevDate = snap.date;
      });
      p.phases.forEach((ph) => { ph.actualCost = PM.sum(db.costs.filter((c) => c.projectId === p.id && c.phase === ph.key), (c) => c.amount); });
      p.costMode = 'ledger';
    });
    db.costs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    db.pos.forEach((po) => { delete po.billed; });

    /* Sales — who found each customer / inquiry, and who looks after each project (capacity 0 = not in utilization) */
    const SALES = [['R15', 'ชัยวัฒน์ ศรีสมบูรณ์'], ['R16', 'ปวีณา วัฒนกุล']];
    SALES.forEach(([id, name]) => db.resources.push({ id, name, level: 'OTHER', discipline: 'Sales', capacity: 0, active: true }));
    const owner = {}, customers = new Set(); // each customer account belongs to one salesperson
    db.bids.forEach((b) => { // oldest inquiry first
      if (!owner[b.client]) owner[b.client] = SALES[Object.keys(owner).length % SALES.length];
      [b.sales, b.salesName] = owner[b.client];
      b.leadSource = customers.has(b.client) ? 'Existing customer' : pick(['Sales visit', 'Sales visit', 'Referral', 'Tender invitation', 'Website / Inbound', 'Exhibition / Event']);
      b.contact = '';
      if (b.result === 'won') customers.add(b.client);
    });
    db.projects.forEach((p) => { const b = db.bids.find((x) => x.id === p.bidId); if (b) { p.sales = b.sales; p.salesName = b.salesName; } });

    /* price list — 2–3 vendors per item, some quotes renewed (price history), some expiring / expired */
    const PRICE_ITEMS = [
      ['EL-TR-1000', 'Transformer 22/0.4 kV 1,000 kVA', 'Oil type, ONAN, Dyn11', 'Equipment', 'set', 1650000, [0, 7]],
      ['EL-CB-240', 'Cable XLPE 0.6/1 kV 1C × 240 mm²', 'Copper, IEC 60502-1', 'Material', 'm', 1180, [1, 7, 3]],
      ['EL-CT-300', 'Cable tray 300 mm HDG', 'Ladder type, 2.0 mm, with cover', 'Material', 'm', 760, [2, 1]],
      ['EL-MCC-01', 'MCC panel 400 V, 12 feeders', 'Form 3b, IP54', 'Equipment', 'set', 980000, [0, 8]],
      ['ST-FAB-01', 'Steel structure — fabricated & painted', 'SS400, epoxy paint system', 'Material', 't', 68000, [2, 8]],
      ['CV-RMC-240', 'Ready-mixed concrete 240 ksc (cube)', 'Slump 10 ± 2.5 cm', 'Material', 'm³', 2350, [5, 2]],
      ['ME-GV-6', 'Gate valve 6" Class 150', 'WCB body, flanged RF', 'Material', 'pcs', 24500, [4, 3]],
      ['SV-SCF-01', 'Scaffolding rental (frame set)', 'Including erection & dismantling', 'Rental', 'month', 450, [6, 8]],
      ['SV-CRN-50', 'Mobile crane 50 t with operator', '8 hours / day', 'Rental', 'day', 18500, [6, 8, 2]],
      ['SC-EL-INS', 'Electrical installation labour', 'Technician team, incl. tools', 'Subcontract', 'man-day', 1450, [8, 0]],
      ['SV-TC-01', 'Testing & commissioning — MV system', 'Incl. test report', 'Service', 'lot', 185000, [3, 8]],
      ['PV-MOD-550', 'Solar PV module 550 Wp', 'Mono PERC, Tier 1', 'Equipment', 'pcs', 3650, [7, 0]],
    ];
    db.prices = [];
    PRICE_ITEMS.forEach(([code, name, spec, category, unit, base, vendors], ii) => {
      vendors.forEach((vi, k) => {
        const quoteDate = PM.addDays(T, -ri(10, 200));
        const validUntil = PM.addDays(quoteDate, pick([90, 180, 270, 365]));
        const price = Math.round(base * rnd(0.92, 1.12) / (base > 10000 ? 100 : 1)) * (base > 10000 ? 100 : 1);
        const history = R() < 0.45 ? [{ date: PM.addDays(quoteDate, -ri(90, 240)), price: Math.round(price * rnd(0.9, 1.05)), quoteRef: '', by: '' }] : [];
        db.prices.push({
          id: 'PL' + (db.prices.length + 1), code, name, spec, category, unit, vendor: SUPPLIERS[vi], contact: '',
          price, currency: 'THB', moq: unit === 'm' ? 100 : 1, leadTime: pick([7, 14, 21, 30, 45, 60]),
          quoteRef: `QT-${quoteDate.slice(2, 4)}${quoteDate.slice(5, 7)}-${String(ii * 3 + k + 1).padStart(3, '0')}`, quoteDate, validUntil,
          note: '', files: [], history, updatedAt: quoteDate, updatedByName: '',
        });
      });
    });
    return db;
  };
})();
