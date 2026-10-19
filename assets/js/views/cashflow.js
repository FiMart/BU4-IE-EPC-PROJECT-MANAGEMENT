/* cashflow.js — project tab "Cash Flow": BOQ (cost per work package + dates) and assumptions →
   S-curve, monthly Cash In / Cash Out, cumulative cash position, peak funding — for 3 scenarios
   (Conservative / Base / Optimistic). Assumptions can be tried out live; Save keeps them on the project.
   Data: p.cashflow = { boq: [{ id, name, phase, cost, start, end, curve }], a: { … }, sc: { conservative | base | optimistic: { cost, time, recv } } } */
(function () {
  const U = PM.ui, esc = U.esc;
  const drafts = {}; // projectId → working copy (what-if edits, until Save)
  const bases = {};  // projectId → JSON of what the draft started from (to tell "unsaved changes")
  const view = U.keep('cashflow', { sc: 'base' }, ['sc']);

  const SCENARIOS = [
    { key: 'conservative', label: 'Conservative', th: 'กรณีระวัง', color: 'var(--s2)' },
    { key: 'base', label: 'Base', th: 'กรณีปกติ', color: 'var(--s1)' },
    { key: 'optimistic', label: 'Optimistic', th: 'กรณีดี', color: 'var(--s7)' },
  ];
  // how a work package's cost spreads over its dates: cumulative share at time t (0–1)
  const CURVES = [
    { value: 's', label: 'S-curve (ช้า–เร็ว–ช้า)', f: (t) => (1 - Math.cos(Math.PI * t)) / 2 },
    { value: 'linear', label: 'เท่ากันทุกเดือน', f: (t) => t },
    { value: 'front', label: 'หนักช่วงต้น', f: (t) => 1 - (1 - t) * (1 - t) },
    { value: 'back', label: 'หนักช่วงท้าย', f: (t) => t * t },
  ];
  const DEFAULT_A = { contingency: 5, advance: 10, retention: 5, retentionRelease: 12, recvLag: 1, payLag: 1 };
  const DEFAULT_SC = { conservative: { cost: 5, time: 15, recv: 1 }, base: { cost: 0, time: 0, recv: 0 }, optimistic: { cost: -3, time: -5, recv: 0 } };
  const A_FIELDS = [
    { key: 'contingency', label: 'Contingency (%)', hint: 'สำรองต้นทุนเผื่อเหตุไม่คาดคิด — บวกเพิ่มจาก BOQ', min: 0, max: 50 },
    { key: 'advance', label: 'เงินล่วงหน้า (%)', hint: 'รับตอนเริ่มงาน แล้วหักคืนจากทุกงวดตาม % งาน', min: 0, max: 50 },
    { key: 'retention', label: 'Retention (%)', hint: 'หักจากทุกงวด คืนหลังจบงาน', min: 0, max: 20 },
    { key: 'retentionRelease', label: 'คืน Retention หลังจบงาน (เดือน)', hint: 'ระยะประกันผลงาน', min: 0, max: 36 },
    { key: 'recvLag', label: 'รับเงินช้ากว่า progress (เดือน)', hint: 'วางบิลตามงานเสร็จ → ลูกค้าจ่ายหลัง N เดือน', min: 0, max: 12 },
    { key: 'payLag', label: 'จ่ายเงินช้ากว่า progress (เดือน)', hint: 'เครดิตจากผู้ขาย / ผู้รับเหมาช่วง', min: 0, max: 12 },
  ];

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const sm = (v) => (v < 0 ? '−' + U.money(-v) : U.money(v)); // signed money
  const addM = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const curveOf = (k) => CURVES.find((c) => c.value === k) || CURVES[0];

  /* ---------- defaults & the working copy ---------- */
  PM.cashflowBoqFromPhases = (p) => (p.phases || []).map((ph) => {
    const def = PM.PHASES.find((x) => x.key === ph.key) || { label: ph.key, th: '' };
    return { id: PM.uid('B'), name: `${def.label} — ${def.th}`, phase: ph.key, cost: Math.round(ph.budget || 0), start: ph.planStart, end: ph.planEnd, curve: ph.key === 'closing' ? 'linear' : 's' };
  });
  // the project's BOQ tab (boq.js): one work package per section — cost = section total, its dates and curve
  PM.cashflowBoqFromBoq = (p) => (PM.boqSummary ? PM.boqSummary(p).sections : []).filter((x) => x.total > 0)
    .map((x) => ({ id: PM.uid('B'), name: `${x.no}. ${x.s.name}`, phase: x.s.phase, cost: Math.round(x.total), start: x.s.start, end: x.s.end, curve: x.s.curve || 's' }));
  // default work packages: from the BOQ when the project has one, else from the 4 phases
  PM.cashflowDefaultBoq = (p) => { const b = PM.cashflowBoqFromBoq(p); return b.length ? b : PM.cashflowBoqFromPhases(p); };
  const fresh = (p) => ({ boq: PM.cashflowDefaultBoq(p), a: Object.assign({}, DEFAULT_A), sc: clone(DEFAULT_SC) });
  const normalize = (cf, p) => {
    cf.boq = Array.isArray(cf.boq) ? cf.boq : PM.cashflowDefaultBoq(p);
    cf.a = Object.assign({}, DEFAULT_A, cf.a);
    cf.sc = cf.sc || {};
    SCENARIOS.forEach((s) => (cf.sc[s.key] = Object.assign({}, DEFAULT_SC[s.key], cf.sc[s.key])));
    return cf;
  };
  function draftOf(p) {
    const saved = p.cashflow ? JSON.stringify(normalize(clone(p.cashflow), p)) : null;
    const d = drafts[p.id];
    // no draft yet, or an untouched draft while the saved copy changed (e.g. a teammate saved) → start from the saved copy
    if (!d || (saved && saved !== bases[p.id] && JSON.stringify(d) === bases[p.id])) {
      drafts[p.id] = saved ? JSON.parse(saved) : fresh(p);
      bases[p.id] = JSON.stringify(drafts[p.id]);
    }
    return drafts[p.id];
  }
  const isDirty = (p) => !!drafts[p.id] && JSON.stringify(drafts[p.id]) !== bases[p.id];

  /* ---------- the model ----------
     each BOQ line's cost is spread over its dates by its curve → work done per month (Base cost, before contingency)
     Cash Out = work × (1 + contingency) × (1 + scenario cost), paid "payLag" months later
     Billing  = contract × % of work done that month · Cash In = billing − advance recovery − retention, received "recvLag" months later
              + advance at the start month + all retention "retentionRelease" months after the work ends
     scenario time ±% stretches every date away from the project start */
  PM.cashflowModel = function (p, cf, key) {
    const A = cf.a, S = cf.sc[key] || DEFAULT_SC.base;
    const t0 = p.startDate;
    const stretch = Math.max(0.2, 1 + (Number(S.time) || 0) / 100);
    const shift = (d) => PM.addDays(t0, Math.round(PM.diffDays(t0, d) * stretch));
    const lines = cf.boq.filter((l) => Number(l.cost) > 0 && l.start && l.end).map((l) => {
      const s = shift(l.start);
      return { cost: Number(l.cost), s, e: PM.max(shift(l.end), s), f: curveOf(l.curve).f };
    });
    const base = PM.sum(lines, (l) => l.cost);
    if (!lines.length || !base) return null;
    const startYm = lines.map((l) => l.s).concat(t0).sort()[0].slice(0, 7);
    const workEnd = lines.map((l) => l.e).sort().pop().slice(0, 7);
    const recvLag = Math.max(0, Math.round((Number(A.recvLag) || 0) + (Number(S.recv) || 0)));
    const payLag = Math.max(0, Math.round(Number(A.payLag) || 0));
    const advPct = (Number(A.advance) || 0) / 100, retPct = (Number(A.retention) || 0) / 100;
    const relYm = addM(workEnd, Math.max(0, Math.round(Number(A.retentionRelease) || 0)));
    let endYm = addM(workEnd, Math.max(recvLag, payLag));
    if (retPct > 0 && relYm > endYm) endYm = relYm;
    const months = PM.months(startYm, endYm), n = months.length;
    const F = (l, d) => (d < l.s ? 0 : d >= l.e ? 1 : l.f(PM.diffDays(l.s, d) / Math.max(1, PM.diffDays(l.s, l.e))));
    const work = months.map((ym, i) => {
      const to = PM.monthEnd(ym), from = i ? PM.monthEnd(months[i - 1]) : PM.addDays(ym + '-01', -1);
      return PM.sum(lines, (l) => l.cost * (F(l, to) - F(l, from)));
    });
    const factor = (1 + (Number(A.contingency) || 0) / 100) * (1 + (Number(S.cost) || 0) / 100);
    const contract = PM.revisedContract ? PM.revisedContract(p) : Number(p.contractValue) || 0; // + approved VOs (changes.js)
    const cashIn = new Array(n).fill(0), cashOut = new Array(n).fill(0);
    work.forEach((w, i) => {
      cashOut[Math.min(n - 1, i + payLag)] += w * factor;
      cashIn[Math.min(n - 1, i + recvLag)] += contract * (w / base) * (1 - advPct - retPct);
    });
    cashIn[0] += contract * advPct;
    if (retPct > 0) cashIn[Math.max(0, months.indexOf(relYm))] += contract * retPct;
    let c = 0, cp = 0;
    const net = cashIn.map((v, i) => v - cashOut[i]);
    const cum = net.map((v) => (c += v));
    const cumProgress = work.map((w) => (cp += w / base));
    let pk = 0;
    cum.forEach((v, i) => { if (v < cum[pk]) pk = i; });
    const neg = cum.map((v, i) => (v < -0.5 ? i : -1)).filter((i) => i >= 0);
    const totalOut = PM.sum(cashOut), totalIn = PM.sum(cashIn);
    return {
      key, months, work, progress: work.map((w) => w / base), cumProgress, cashIn, cashOut, net, cum, base, factor, contract, recvLag, payLag,
      peak: cum[pk] < 0 ? { value: cum[pk], ym: months[pk], i: pk } : null,
      neg: neg.length ? { from: months[neg[0]], to: months[neg[neg.length - 1]], count: neg.length } : null,
      totalIn, totalOut, margin: totalIn - totalOut, marginPct: totalIn ? (totalIn - totalOut) / totalIn : null,
      workEnd, lastYm: endYm, retentionYm: retPct > 0 ? relYm : null,
    };
  };

  /* ---------------- all projects together (Dashboard · TV) ----------------
     each project's SAVED model (or its phase defaults if nobody saved one) — never someone's unsaved what-if.
     A project's cumulative cash is 0 before its first month and holds its final value after its last. */
  PM.CASHFLOW_SCENARIOS = SCENARIOS;
  const savedCf = (p) => (p.cashflow ? normalize(clone(p.cashflow), p) : fresh(p));
  PM.portfolioCashflow = function (projects, key) {
    const now = PM.today().slice(0, 7);
    const items = projects.map((p) => ({ p, md: PM.cashflowModel(p, savedCf(p), key), saved: !!p.cashflow })).filter((x) => x.md);
    if (!items.length) return null;
    const months = PM.months(items.map((x) => x.md.months[0]).sort()[0], items.map((x) => x.md.lastYm).sort().pop());
    const n = months.length;
    const cashIn = new Array(n).fill(0), cashOut = new Array(n).fill(0);
    items.forEach(({ md }) => md.months.forEach((ym, i) => { const j = months.indexOf(ym); cashIn[j] += md.cashIn[i]; cashOut[j] += md.cashOut[i]; }));
    let c = 0;
    const net = cashIn.map((v, i) => v - cashOut[i]);
    const cum = net.map((v) => (c += v));
    const low = (from) => { let k = -1; cum.forEach((v, i) => { if (i >= from && v < -0.5 && (k < 0 || v < cum[k])) k = i; }); return k < 0 ? null : { value: cum[k], ym: months[k], i: k }; };
    const nowI = Math.max(0, months.indexOf(now) >= 0 ? months.indexOf(now) : now < months[0] ? 0 : n);
    const neg = cum.map((v, i) => (v < -0.5 ? i : -1)).filter((i) => i >= 0);
    const next = months.map((ym, i) => (ym >= now && ym < addM(now, 12) ? i : -1)).filter((i) => i >= 0);
    const cumAt = (md, ym) => { const i = md.months.indexOf(ym); return i >= 0 ? md.cum[i] : ym < md.months[0] ? 0 : md.cum[md.cum.length - 1]; };
    const peak = low(0);
    items.forEach((x) => {
      x.atPeak = peak ? cumAt(x.md, peak.ym) : null; // this project's share of the department's tightest month
      x.next12In = PM.sum(x.md.months.map((ym, i) => (ym >= now && ym < addM(now, 12) ? x.md.cashIn[i] : 0)));
      x.next12Out = PM.sum(x.md.months.map((ym, i) => (ym >= now && ym < addM(now, 12) ? x.md.cashOut[i] : 0)));
    });
    return {
      key, months, cashIn, cashOut, net, cum, items, cumAt,
      peak, futurePeak: low(nowI),
      neg: neg.length ? { from: months[neg[0]], to: months[neg[neg.length - 1]], count: neg.length } : null,
      next12In: PM.sum(next.map((i) => cashIn[i])), next12Out: PM.sum(next.map((i) => cashOut[i])),
      defaults: items.filter((x) => !x.saved).length,
    };
  };
  /* the 3 scenarios on one month axis, cumulative (for line charts) */
  PM.portfolioCashflowLines = function (projects, selected) {
    const all = SCENARIOS.map((s) => ({ s, pc: PM.portfolioCashflow(projects, s.key) })).filter((x) => x.pc);
    if (!all.length) return null;
    const months = PM.months(all.map((x) => x.pc.months[0]).sort()[0], all.map((x) => x.pc.months[x.pc.months.length - 1]).sort().pop());
    return {
      months,
      series: all.map(({ s, pc }) => ({
        name: s.label, color: s.color, dash: selected ? s.key !== selected : false,
        values: months.map((ym) => { const i = pc.months.indexOf(ym); return i >= 0 ? pc.cum[i] : ym < pc.months[0] ? 0 : pc.cum[pc.cum.length - 1]; }),
      })),
    };
  };
  PM.signedMoney = sm;
  PM.cashflowSaved = savedCf; // the project's saved model (or defaults) — Billing compares received money with its plan

  /* ---------------- the tab ---------------- */
  PM.cashflowTab = function (el, p, m, rerender) {
    const cf = draftOf(p);
    const canSave = PM.can('cost.edit');
    if (!SCENARIOS.some((s) => s.key === view.sc)) view.sc = 'base';

    el.innerHTML = `
      <div class="row cf-bar" id="cf-status"></div>
      <div id="cf-kpi"></div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>เงินสดสะสม (Cumulative cash position)</h2><p>Cash In − Cash Out สะสม · ต่ำกว่า 0 = ต้องใช้เงินทุนหมุนเวียน · จุดต่ำสุด = Peak funding</p></div><div class="card-b"><div class="chart" id="c-cf-cum"></div></div></div>
        <div class="card"><div class="card-h"><h2>สมมติฐาน (Assumptions)</h2><p>ปรับแล้วเห็นผลทันที${canSave ? ' · กด "บันทึก" เพื่อเก็บไว้กับโครงการ' : ' · ทดลองปรับได้ แต่บันทึกได้เฉพาะ Admin / Dept Manager / PM'}</p></div>
          <div class="card-b">${assumptionsForm(cf)}</div></div>
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>S-Curve — % งานสะสมตามแผน</h2><p>ถ่วงน้ำหนักด้วยต้นทุน BOQ · 3 scenario เทียบผลงานจริง (Earned value)</p></div><div class="card-b"><div class="chart" id="c-cf-s"></div></div></div>
        <div class="card"><div class="card-h"><h2>Cash In / Cash Out รายเดือน</h2><p id="cf-month-sub"></p></div><div class="card-b"><div class="chart" id="c-cf-month"></div></div></div>
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>เปรียบเทียบ Scenario</h2><p>คลิกหัวคอลัมน์เพื่อดูรายละเอียดของ scenario นั้น</p></div><div class="card-b flush table-wrap" id="cf-compare"></div></div>
        <div class="card"><div class="card-h"><h2>ตรวจสอบตัวเลข</h2><p>เทียบ BOQ กับ Plan cost และมูลค่าสัญญา — ผลลัพธ์ยังต้องให้วิศวกรตรวจ assumption เสมอ</p></div><div class="card-b" id="cf-checks"></div></div>
      </div>
      <div class="card">
        <div class="card-h"><h2>BOQ — ต้นทุนแยกหมวดงาน</h2><p>ต้นทุน · ช่วงเวลา · รูปแบบการกระจายของแต่ละหมวด (คลิกแถวเพื่อแก้ไข)</p><span class="spacer"></span>
          <div class="row cf-tools">
            ${PM.cashflowBoqFromBoq(p).length ? '<button type="button" class="btn sm" data-cf="boq-boq">สร้างจาก BOQ</button>' : ''}
            <button type="button" class="btn sm" data-cf="boq-phases">สร้างจาก Phase</button>
            <button type="button" class="btn sm" data-cf="boq-paste">วางจาก Excel</button>
            <button type="button" class="btn sm primary" data-cf="boq-add">+ หมวดงาน</button></div></div>
        <div class="card-b flush table-wrap">${boqTable(cf, m)}</div>
      </div>
      <div class="card"><div class="card-h"><h2 id="cf-table-h">ตาราง Cash Flow รายเดือน</h2><p>▲ = เดือนที่เงินสดสะสมต่ำสุด (Peak funding) · ตัวเลขสีแดง = ติดลบ</p></div>
        <div class="card-b flush table-wrap" id="cf-table"></div></div>`;

    function refresh() {
      const T = PM.today();
      const models = {};
      SCENARIOS.forEach((s) => (models[s.key] = PM.cashflowModel(p, cf, s.key)));
      const md = models[view.sc];
      const dirty = isDirty(p);
      const saved = p.cashflowSaved;
      el.querySelector('#cf-status').innerHTML = `
        ${V().seg('cfsc', SCENARIOS.map((s) => ({ key: s.key, label: `${s.label} · ${s.th}` })), view.sc)}
        <span class="cf-state">${dirty ? U.badge('warning', p.cashflow ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'ยังไม่ได้บันทึก — ค่าเริ่มต้นจาก Phase') : p.cashflow ? U.badge('good', `บันทึกแล้ว${saved ? ` · ${U.date(saved.at)}${saved.byName ? ' · ' + saved.byName : ''}` : ''}`) : U.badge('neutral', 'ค่าเริ่มต้นจาก Phase (ยังไม่ได้บันทึก)')}</span>
        <span class="spacer"></span>
        ${PM.can('data.export') && md ? '<button type="button" class="btn" data-cf="csv">Export CSV</button>' : ''}
        <button type="button" class="btn" data-cf="defaults">ค่าเริ่มต้น</button>
        ${dirty && p.cashflow ? '<button type="button" class="btn" data-cf="discard">ยกเลิกการแก้ไข</button>' : ''}
        ${canSave ? `<button type="button" class="btn primary" data-cf="save"${dirty || !p.cashflow ? '' : ' disabled'}>บันทึก</button>` : ''}`;
      if (!md) {
        el.querySelector('#cf-kpi').innerHTML = '<div class="callout warn">ยังคำนวณไม่ได้ — BOQ ต้องมีอย่างน้อย 1 หมวดที่มีต้นทุนและวันที่เริ่ม–เสร็จ</div>';
        ['#c-cf-cum', '#c-cf-s', '#c-cf-month', '#cf-compare', '#cf-table'].forEach((s) => (el.querySelector(s).innerHTML = '<p class="empty">ไม่มีข้อมูล</p>'));
        el.querySelector('#cf-checks').innerHTML = checks(p, m, cf, null);
        return;
      }
      const sc = SCENARIOS.find((s) => s.key === view.sc);
      el.querySelector('#cf-kpi').innerHTML = kpis(md, cf);
      el.querySelector('#cf-compare').innerHTML = compare(models);
      el.querySelector('#cf-checks').innerHTML = checks(p, m, cf, md);
      el.querySelector('#cf-table-h').textContent = `ตาราง Cash Flow รายเดือน — ${sc.label} (${sc.th})`;
      el.querySelector('#cf-table').innerHTML = monthTable(md, T);
      el.querySelector('#cf-month-sub').textContent = `${sc.label} · รับเงินช้า ${md.recvLag} เดือน · จ่ายเงินช้า ${md.payLag} เดือน · รวมเงินล่วงหน้าและการคืน Retention`;

      /* charts — one month axis for all scenarios (Conservative runs longest); values hold after a scenario ends */
      const all = SCENARIOS.map((s) => models[s.key]).filter(Boolean);
      const months = PM.months(all.map((x) => x.months[0]).sort()[0], all.map((x) => x.lastYm).sort().pop());
      const along = (x, arr, before, after) => months.map((ym) => { const i = x.months.indexOf(ym); return i >= 0 ? arr[i] : ym < x.months[0] ? before : after(arr); });
      const today = months.indexOf(T.slice(0, 7));
      PM.charts.lines(el.querySelector('#c-cf-cum'), {
        labels: months.map(U.month), marker: today, markerLabel: 'วันนี้', fmt: sm, axisFmt: sm, label: 'Cumulative cash position',
        series: SCENARIOS.filter((s) => models[s.key]).map((s) => ({ name: s.label, color: s.color, dash: s.key !== view.sc, values: along(models[s.key], models[s.key].cum, 0, (a) => a[a.length - 1]) })),
      });
      // actual progress (Earned value ÷ Plan cost) from the project's progress snapshots, up to today
      const ev = PM.costCurve(p, PM.projectCosts(p.id));
      const bac = PM.sum(p.phases, (ph) => ph.budget || 0);
      const evPct = months.map((ym) => { const r = ev.rows.find((x) => x.ym === ym); return r && r.ev != null && bac ? +(r.ev / bac * 100).toFixed(1) : null; });
      PM.charts.lines(el.querySelector('#c-cf-s'), {
        labels: months.map(U.month), marker: today, markerLabel: 'วันนี้', yMax: 100, fmt: (v) => v.toFixed(1) + '%', axisFmt: (v) => v + '%', label: 'S-curve',
        series: SCENARIOS.filter((s) => models[s.key]).map((s) => ({ name: s.label, color: s.color, dash: true, values: along(models[s.key], models[s.key].cumProgress.map((v) => +(v * 100).toFixed(1)), 0, () => 100) }))
          .concat(evPct.some((v) => v != null) ? [{ name: 'ผลงานจริง (EV)', color: 'var(--ink-2)', values: evPct }] : []),
      });
      PM.charts.columns(el.querySelector('#c-cf-month'), {
        categories: md.months.map(U.month), stacked: false, fmt: U.money, axisFmt: U.money, label: 'Monthly cash in and out',
        series: [{ name: 'Cash In (รับ)', color: 'var(--s3)', values: md.cashIn }, { name: 'Cash Out (จ่าย)', color: 'var(--s8)', values: md.cashOut }],
      });
    }
    refresh();

    /* live what-if: assumptions recalc on every keystroke (debounced), without re-drawing the inputs */
    let t = null;
    el.oninput = (e) => {
      const i = e.target;
      if (i.dataset.a) cf.a[i.dataset.a] = clampField(i);
      else if (i.dataset.sc) { const [k, f] = i.dataset.sc.split('.'); cf.sc[k][f] = i.value === '' ? 0 : Number(i.value); }
      else return;
      clearTimeout(t); t = setTimeout(refresh, 150);
    };
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg="cfsc"]');
      if (seg) { view.sc = seg.dataset.val; refresh(); return; }
      const th = e.target.closest('[data-cfsc]');
      if (th) { view.sc = th.dataset.cfsc; refresh(); return; }
      const row = e.target.closest('tr[data-boq]');
      if (row) { boqForm(p, cf, cf.boq.find((l) => l.id === row.dataset.boq), rerender); return; }
      const a = e.target.closest('[data-cf]');
      if (!a) return;
      const act = a.dataset.cf;
      if (act === 'boq-add') boqForm(p, cf, null, rerender);
      if (act === 'boq-paste') pasteForm(p, cf, rerender);
      if (act === 'boq-boq' && confirm('สร้างหมวดงานจากแท็บ BOQ ของโครงการ (1 หมวด BOQ = 1 แถว · ต้นทุน = ยอดรวมของหมวด · วันที่ / การกระจายตามหมวด)? รายการเดิมจะถูกแทนที่')) { cf.boq = PM.cashflowBoqFromBoq(p); rerender(); }
      if (act === 'boq-phases' && confirm('สร้าง BOQ ใหม่จาก 4 Phase (ต้นทุน = Plan cost · วันที่ = แผนของแต่ละ Phase)? รายการ BOQ เดิมจะถูกแทนที่')) { cf.boq = PM.cashflowBoqFromPhases(p); rerender(); }
      if (act === 'defaults' && confirm('คืนค่า Assumption และ Scenario เป็นค่าเริ่มต้น? (BOQ ไม่เปลี่ยน)')) { cf.a = Object.assign({}, DEFAULT_A); cf.sc = clone(DEFAULT_SC); rerender(); }
      if (act === 'discard') { delete drafts[p.id]; rerender(); U.toast('ยกเลิกการแก้ไขแล้ว'); }
      if (act === 'save' && canSave) {
        p.cashflow = clone(cf);
        const u = PM.auth && PM.auth.user;
        p.cashflowSaved = { at: PM.today(), by: u ? u.id : '', byName: u ? PM.auth.displayName(u) : '' };
        bases[p.id] = JSON.stringify(cf);
        PM.upsert('projects', p);
        U.toast('บันทึก Cash Flow แล้ว');
        refresh();
      }
      if (act === 'csv') exportCsv(p, cf, PM.cashflowModel(p, cf, view.sc));
    };
  };
  const V = () => PM.common;
  const clampField = (i) => {
    const f = A_FIELDS.find((x) => x.key === i.dataset.a);
    const v = i.value === '' ? 0 : Number(i.value);
    return f ? Math.max(f.min, Math.min(f.max, v)) : v;
  };

  /* ---------- pieces ---------- */
  function assumptionsForm(cf) {
    return `<div class="cf-a">${A_FIELDS.map((f) => `<label><span>${esc(f.label)}</span>
        <input type="number" step="any" min="${f.min}" max="${f.max}" data-a="${f.key}" value="${esc(cf.a[f.key])}"><small>${esc(f.hint)}</small></label>`).join('')}</div>
      <div class="sub-h">ปรับตาม Scenario (เทียบกับ Base)</div>
      <table class="tbl cf-sc"><thead><tr><th>Scenario</th><th class="num">ต้นทุน ±%</th><th class="num">ระยะเวลา ±%</th><th class="num">รับเงินช้าเพิ่ม (เดือน)</th></tr></thead><tbody>
        ${SCENARIOS.map((s) => `<tr><td><i class="sw" style="background:${s.color}"></i> <b>${esc(s.label)}</b><small>${esc(s.th)}</small></td>
          ${['cost', 'time', 'recv'].map((k) => `<td class="num"><input type="number" step="any" data-sc="${s.key}.${k}" value="${esc(cf.sc[s.key][k])}" aria-label="${esc(s.label)} ${k}"></td>`).join('')}</tr>`).join('')}
      </tbody></table>`;
  }

  function kpis(md, cf) {
    const V_ = V();
    return `<div class="grid cols-5">
      ${V_.tile({ label: 'Peak funding', tag: 'เงินทุนสูงสุดที่ต้องเตรียม', value: md.peak ? U.money(-md.peak.value) : '฿0', sub: md.peak ? `${U.badge('critical', 'เงินสดตึงสุด ' + U.month(md.peak.ym))}` : U.badge('good', 'เงินสดไม่ติดลบ'), tip: 'ยอดเงินสดสะสมต่ำสุด (Cash In − Cash Out) — เงินทุนหมุนเวียนที่ต้องเตรียมไว้', icon: 'coins' })}
      ${V_.tile({ label: 'ช่วงเงินสดติดลบ', value: md.neg ? `${md.neg.count} <small>เดือน</small>` : '0', sub: md.neg ? `${U.month(md.neg.from)} – ${U.month(md.neg.to)}` : 'รับเงินทันจ่ายตลอดโครงการ' })}
      ${V_.tile({ label: 'Cash In รวม', value: U.money(md.totalIn), sub: `เงินล่วงหน้า ${U.num(cf.a.advance)}% · Retention ${U.num(cf.a.retention)}%${md.retentionYm ? ' คืน ' + U.month(md.retentionYm) : ''}` })}
      ${V_.tile({ label: 'Cash Out รวม', value: U.money(md.totalOut), sub: `BOQ ${U.money(md.base)} × ${md.factor.toFixed(3)} (Contingency + scenario)` })}
      ${V_.tile({ label: 'กำไรขั้นต้น', tag: 'Margin', value: `<span class="${md.margin < 0 ? 'neg' : ''}">${sm(md.margin)}</span>`, sub: U.badge(md.margin < 0 ? 'critical' : md.marginPct < 0.05 ? 'warning' : 'good', `${U.pct(md.marginPct, 1)} ของมูลค่าสัญญา`) })}
    </div>`;
  }

  function compare(models) {
    const cols = SCENARIOS.map((s) => ({ s, md: models[s.key] }));
    const row = (label, fn) => `<tr><td>${label}</td>${cols.map(({ s, md }) => `<td class="num${s.key === view.sc ? ' cf-on' : ''}">${md ? fn(md) : '–'}</td>`).join('')}</tr>`;
    return `<table class="tbl cf-compare"><thead><tr><th></th>${cols.map(({ s }) => `<th class="num cf-pick${s.key === view.sc ? ' cf-on' : ''}" data-cfsc="${s.key}"><i class="sw" style="background:${s.color}"></i> ${esc(s.label)}<small>${esc(s.th)}</small></th>`).join('')}</tr></thead><tbody>
      ${row('Peak funding', (md) => (md.peak ? `<span class="neg">${U.money(-md.peak.value)}</span>` : '฿0'))}
      ${row('เดือนที่เงินสดตึงสุด', (md) => (md.peak ? U.month(md.peak.ym) : '–'))}
      ${row('ช่วงเงินสดติดลบ', (md) => (md.neg ? `${md.neg.count} เดือน` : '–'))}
      ${row('Cash Out รวม (ต้นทุน)', (md) => U.money(md.totalOut))}
      ${row('กำไรขั้นต้น', (md) => `<span class="${md.margin < 0 ? 'neg' : ''}">${sm(md.margin)}</span>`)}
      ${row('Margin %', (md) => U.pct(md.marginPct, 1))}
      ${row('งานเสร็จ (เดือน)', (md) => U.month(md.workEnd))}
      ${row('รับเงินครบ', (md) => U.month(md.lastYm))}
    </tbody></table>`;
  }

  function checks(p, m, cf, md) {
    const items = [];
    const ok = (t) => items.push(`<li class="ok">${U.badge('good', 'ผ่าน')} ${t}</li>`);
    const warn = (t, level) => items.push(`<li>${U.badge(level || 'warning', level === 'critical' ? 'ต้องแก้' : 'ตรวจสอบ')} ${t}</li>`);
    const boqTotal = PM.sum(cf.boq, (l) => Number(l.cost) || 0);
    const bac = m.bac;
    if (!bac) warn('โครงการยังไม่มี Plan cost — เทียบ BOQ ไม่ได้');
    else if (Math.abs(boqTotal - bac) < Math.max(1, bac * 0.001)) ok(`ยอดรวม BOQ ${U.money(boqTotal)} ตรงกับ Plan cost ของโครงการ${Math.abs(boqTotal - bac) >= 1 ? ` (ต่างจากการปัดเศษ ${U.money(Math.abs(boqTotal - bac))})` : ''}`);
    else warn(`ยอดรวม BOQ ${U.money(boqTotal)} ${boqTotal > bac ? 'มากกว่า' : 'น้อยกว่า'} Plan cost ${U.money(bac)} อยู่ ${U.money(Math.abs(boqTotal - bac))} (${U.pct(Math.abs(boqTotal - bac) / bac, 1)})`);
    const projBoq = PM.boqSummary ? PM.boqSummary(p).total : 0; // the project's BOQ tab
    if (projBoq) {
      if (Math.abs(boqTotal - projBoq) < 1) ok(`ตรงกับยอดในแท็บ BOQ ของโครงการ (${U.money(projBoq)})`);
      else warn(`ต่างจากยอดในแท็บ BOQ ของโครงการ ${U.money(projBoq)} อยู่ ${U.money(Math.abs(boqTotal - projBoq))} — กด "สร้างจาก BOQ" เพื่อใช้ยอดล่าสุด`);
    }
    if (!(p.contractValue > 0)) warn('ยังไม่มีมูลค่าสัญญา — Cash In = 0 (แก้ได้ที่ "แก้ไขโครงการ")', 'critical');
    else {
      const rc = PM.revisedContract ? PM.revisedContract(p) : p.contractValue;
      ok(`มูลค่าสัญญา${rc !== p.contractValue ? 'ปรับปรุง (รวม VO อนุมัติ)' : ''} ${U.money(rc)} = Cash In รวม${md && Math.abs(md.totalIn - rc) < 1 ? ' ✓' : ''}`);
    }
    if (md) {
      if (md.margin < 0) warn(`ต้นทุนรวม (รวม Contingency) ${U.money(md.totalOut)} เกินมูลค่าสัญญา — ขาดทุน ${U.money(-md.margin)}`, 'critical');
      else ok(`กำไรขั้นต้น ${U.money(md.margin)} (${U.pct(md.marginPct, 1)})`);
    }
    const bad = cf.boq.filter((l) => !(Number(l.cost) > 0) || !l.start || !l.end || l.end < l.start);
    if (bad.length) warn(`${bad.length} หมวดงานไม่ถูกนำมาคำนวณ (ต้นทุน = 0 หรือวันที่ไม่ครบ / เสร็จก่อนเริ่ม): ${bad.map((l) => esc(l.name || '(ไม่มีชื่อ)')).join(', ')}`);
    const out = cf.boq.filter((l) => l.start && l.end && (l.start < p.startDate || l.end > p.endDate));
    if (out.length) warn(`${out.length} หมวดงานมีวันที่อยู่นอกช่วงโครงการ (${U.date(p.startDate)} – ${U.date(p.endDate)}): ${out.map((l) => esc(l.name)).join(', ')}`);
    else if (cf.boq.length) ok('วันที่ของทุกหมวดงานอยู่ในช่วงโครงการ');
    if (Number(cf.a.advance) + Number(cf.a.retention) > 30) warn(`เงินล่วงหน้า + Retention = ${U.num(Number(cf.a.advance) + Number(cf.a.retention))}% ของแต่ละงวด — สูงกว่าปกติ`);
    return `<ul class="cf-checks">${items.join('')}</ul>`;
  }

  function boqTable(cf, m) {
    if (!cf.boq.length) return '<p class="empty">ยังไม่มี BOQ — กด "สร้างจาก Phase", "วางจาก Excel" หรือ "+ หมวดงาน"</p>';
    const total = PM.sum(cf.boq, (l) => Number(l.cost) || 0);
    const off = Math.abs(total - m.bac) >= Math.max(1, m.bac * 0.001); // ≤ 0.1% = rounding, still "matches"
    return `<table class="tbl"><thead><tr><th>หมวดงาน</th><th>Phase</th><th class="num">ต้นทุน</th><th class="num">สัดส่วน</th><th>เริ่ม</th><th>เสร็จ</th><th class="num">เดือน</th><th>การกระจายต้นทุน</th></tr></thead><tbody>
      ${cf.boq.map((l) => `<tr class="click" data-boq="${esc(l.id)}">
        <td><span class="title">${esc(l.name || '(ไม่มีชื่อ)')}</span></td><td>${esc(U.phaseLabel(l.phase))}</td>
        <td class="num">${U.money(Number(l.cost) || 0)}</td><td class="num">${U.pct(total ? (Number(l.cost) || 0) / total : null, 1)}</td>
        <td class="nowrap">${U.date(l.start)}</td><td class="nowrap">${U.date(l.end)}</td>
        <td class="num">${l.start && l.end ? U.num(PM.diffDays(l.start, l.end) / 30.4, 1) : '–'}</td><td>${esc(curveOf(l.curve).label)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>รวม ${cf.boq.length} หมวด</td><td></td><td class="num">${U.money(total)}</td><td class="num">100%</td><td colspan="4" class="${off ? 'neg' : ''}">Plan cost ของโครงการ ${U.money(m.bac)}${off ? ` · ต่างกัน ${sm(total - m.bac)}` : ' · ตรงกัน ✓'}</td></tr></tfoot></table>`;
  }

  function monthTable(md, T) {
    const now = T.slice(0, 7);
    return `<table class="tbl cf-table"><thead><tr><th>เดือน</th><th class="num">งานเสร็จ (เดือนนี้)</th><th class="num">งานสะสม</th><th class="num">Cash Out</th><th class="num">Cash In</th><th class="num">สุทธิ</th><th class="num">เงินสดสะสม</th></tr></thead><tbody>
      ${md.months.map((ym, i) => `<tr class="${md.peak && md.peak.i === i ? 'cf-peak' : ''}${ym === now ? ' cf-now' : ''}">
        <td class="nowrap">${U.month(ym)}${md.peak && md.peak.i === i ? ' <b class="neg">▲ Peak</b>' : ''}${ym === now ? ' <span class="chip">เดือนนี้</span>' : ''}</td>
        <td class="num">${md.work[i] ? U.pct(md.progress[i], 1) : '–'}</td><td class="num">${U.pct(md.cumProgress[i], 1)}</td>
        <td class="num">${md.cashOut[i] ? U.money(md.cashOut[i]) : '–'}</td><td class="num">${md.cashIn[i] ? U.money(md.cashIn[i]) : '–'}</td>
        <td class="num${md.net[i] < 0 ? ' neg' : ''}">${sm(md.net[i])}</td><td class="num${md.cum[i] < 0 ? ' neg' : ''}"><b>${sm(md.cum[i])}</b></td></tr>`).join('')}
      </tbody><tfoot><tr><td>รวม</td><td></td><td class="num">100%</td><td class="num">${U.money(md.totalOut)}</td><td class="num">${U.money(md.totalIn)}</td><td class="num${md.margin < 0 ? ' neg' : ''}">${sm(md.margin)}</td><td></td></tr></tfoot></table>`;
  }

  /* ---------- BOQ: one line ---------- */
  function boqForm(p, cf, line, done) {
    const isNew = !line;
    const l = line || { id: PM.uid('B'), name: '', phase: 'construction', cost: '', start: p.startDate, end: p.endDate, curve: 's' };
    U.modal({
      title: isNew ? 'เพิ่มหมวดงาน (BOQ)' : 'แก้ไขหมวดงาน (BOQ)', wide: true, submitLabel: 'ใช้ค่านี้',
      onDelete: isNew ? null : () => { cf.boq = cf.boq.filter((x) => x.id !== l.id); done(); },
      body: `
        ${U.field('หมวดงาน', 'name', l.name, { required: true, full: true, placeholder: 'เช่น งานโครงสร้างเหล็ก, งานระบบไฟฟ้า, Equipment' })}
        ${U.field('Phase', 'phase', l.phase, { options: PM.PHASES.map((x) => ({ value: x.key, label: x.label })) })}
        ${U.field('ต้นทุน (THB)', 'cost', l.cost, { type: 'number', min: 0, step: 'any', required: true })}
        ${U.field('เริ่ม', 'start', l.start, { type: 'date', required: true })}
        ${U.field('เสร็จ', 'end', l.end, { type: 'date', required: true })}
        ${U.field('การกระจายต้นทุนตามเวลา', 'curve', l.curve, { options: CURVES.map((c) => ({ value: c.value, label: c.label })), full: true })}
        <p class="full muted" style="margin:0">การแก้ไขนี้เป็นการทดลอง — กด "บันทึก" ด้านบนของแท็บเพื่อเก็บไว้กับโครงการ</p>`,
      onSubmit: (f) => {
        if (!f.name) { alert('กรุณากรอกชื่อหมวดงาน'); return false; }
        if (f.end < f.start) { alert('วันเสร็จต้องไม่ก่อนวันเริ่ม'); return false; }
        Object.assign(l, f, { cost: Math.max(0, Number(f.cost) || 0) });
        if (isNew) cf.boq.push(l);
        done();
      },
    });
  }

  /* ---------- BOQ: paste rows copied from Excel ----------
     columns: หมวดงาน | ต้นทุน | เริ่ม | เสร็จ | Phase (optional) | การกระจาย (optional) — a header row is skipped */
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  function parseDate(s) {
    s = String(s || '').trim();
    let y, mo, d, x;
    if ((x = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) { y = +x[1]; mo = +x[2]; d = +x[3]; }
    else if ((x = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) { d = +x[1]; mo = +x[2]; y = +x[3]; }
    else if ((x = s.match(/^(\d{1,2})[- ]([A-Za-z]{3,4})[- ,]+(\d{2,4})$/)) && MON[x[2].toLowerCase()]) { d = +x[1]; mo = MON[x[2].toLowerCase()]; y = +x[3]; }
    else return '';
    if (y < 100) y += 2000;
    if (y > 2400) y -= 543; // Buddhist year
    const dt = new Date(y, mo - 1, d);
    return dt.getMonth() === mo - 1 && dt.getDate() === d ? PM.iso(dt) : '';
  }
  const parseNum = (s) => Number(String(s || '').replace(/[,฿\s]|THB|บาท/gi, ''));
  const parsePhase = (s) => {
    const t = String(s || '').trim().toLowerCase();
    if (!t) return '';
    const hit = PM.PHASES.find((ph) => t === ph.key || t.startsWith(ph.label.toLowerCase().slice(0, 4)) || ph.th.split(/\s*\/\s*/).some((w) => w && t.includes(w)));
    return hit ? hit.key : '';
  };
  const parseCurve = (s) => {
    const t = String(s || '').trim().toLowerCase();
    if (!t) return 's';
    if (/^s|ช้า/.test(t)) return 's';
    if (/lin|เท่า|ตรง/.test(t)) return 'linear';
    if (/front|ต้น/.test(t)) return 'front';
    if (/back|ท้าย/.test(t)) return 'back';
    return 's';
  };
  // no phase given → the phase whose plan dates hold the line's midpoint
  const phaseByDate = (p, start, end) => {
    const mid = PM.addDays(start, Math.round(PM.diffDays(start, end) / 2));
    const ph = (p.phases || []).find((x) => mid >= x.planStart && mid <= x.planEnd);
    return ph ? ph.key : 'construction';
  };
  function pasteForm(p, cf, done) {
    const form = U.modal({
      title: 'วาง BOQ จาก Excel', wide: true, submitLabel: 'นำเข้า',
      body: `
        <p class="full muted" style="margin:0">คัดลอกตารางจาก Excel (หรือ CSV) แล้ววางด้านล่าง — 1 แถว = 1 หมวดงาน · ลำดับคอลัมน์:
          <b>หมวดงาน · ต้นทุน · เริ่ม · เสร็จ</b> · Phase (ถ้ามี) · การกระจาย (ถ้ามี: S / เท่ากัน / ต้น / ท้าย) — แถวหัวตารางข้ามให้อัตโนมัติ · วันที่ใช้ได้ทั้ง 2026-03-01, 01/03/2026, 01/03/2569, 1-Mar-26</p>
        <label class="full"><span>ข้อมูล</span><textarea name="data" rows="9" placeholder="งานโครงสร้างเหล็ก&#9;12,500,000&#9;01/03/2026&#9;31/08/2026&#9;Construction"></textarea></label>
        ${U.field('วิธีนำเข้า', 'mode', 'replace', { options: [{ value: 'replace', label: 'แทนที่ BOQ เดิมทั้งหมด' }, { value: 'append', label: 'เพิ่มต่อท้าย BOQ เดิม' }] })}
        <p class="full" id="paste-preview" aria-live="polite"></p>`,
      onSubmit: (f) => {
        const { rows, skipped } = parse(f.data);
        if (!rows.length) { alert('ไม่พบแถวที่อ่านได้ — ต้องมีอย่างน้อย หมวดงาน · ต้นทุน · เริ่ม · เสร็จ'); return false; }
        cf.boq = f.mode === 'append' ? cf.boq.concat(rows) : rows;
        U.toast(`นำเข้า ${rows.length} หมวดงาน${skipped ? ` · ข้าม ${skipped} แถว` : ''}`);
        done();
      },
    });
    function parse(text) {
      const rows = []; let skipped = 0;
      String(text || '').split(/\r?\n/).map((r) => r.trim()).filter(Boolean).forEach((r) => {
        const c = r.includes('\t') ? r.split('\t') : r.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.replace(/^"|"$/g, ''));
        const cost = parseNum(c[1]), start = parseDate(c[2]), end = parseDate(c[3]);
        if (!c[0] || !(cost > 0) || !start || !end || end < start) { skipped++; return; }
        rows.push({ id: PM.uid('B'), name: c[0].trim(), cost, start, end, phase: parsePhase(c[4]) || phaseByDate(p, start, end), curve: parseCurve(c[5]) });
      });
      return { rows, skipped };
    }
    const prev = form.querySelector('#paste-preview');
    form.data.addEventListener('input', () => {
      const { rows, skipped } = parse(form.data.value);
      prev.innerHTML = form.data.value.trim() ? `อ่านได้ <b>${rows.length}</b> หมวด · รวม <b>${U.money(PM.sum(rows, (x) => x.cost))}</b>${skipped ? ` · <span class="neg">ข้าม ${skipped} แถว</span> (หัวตาราง / ข้อมูลไม่ครบ)` : ''}` : '';
    });
  }

  /* ---------- CSV of the selected scenario ---------- */
  function exportCsv(p, cf, md) {
    if (!md) return;
    const sc = SCENARIOS.find((s) => s.key === md.key);
    const q = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
    const r2 = (v) => Math.round(v * 100) / 100;
    const head = [
      ['Project', q(p.code + ' ' + p.name)], ['Scenario', q(sc.label)], ['Contract value', p.contractValue || 0],
      ...A_FIELDS.map((f) => [q(f.label), cf.a[f.key]]),
      ['Scenario cost %', cf.sc[md.key].cost], ['Scenario time %', cf.sc[md.key].time], ['Scenario extra receive lag', cf.sc[md.key].recv],
      ['Peak funding', md.peak ? r2(-md.peak.value) : 0], ['Peak month', md.peak ? md.peak.ym : ''], [],
    ].map((r) => r.join(','));
    const rows = [['Month', 'Progress %', 'Cumulative %', 'Cash out', 'Cash in', 'Net', 'Cumulative cash'].join(',')]
      .concat(md.months.map((ym, i) => [ym, r2(md.progress[i] * 100), r2(md.cumProgress[i] * 100), r2(md.cashOut[i]), r2(md.cashIn[i]), r2(md.net[i]), r2(md.cum[i])].join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + head.concat(rows).join('\r\n')], { type: 'text/csv' }));
    a.download = `cashflow-${p.code}-${md.key}-${PM.today()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
})();
