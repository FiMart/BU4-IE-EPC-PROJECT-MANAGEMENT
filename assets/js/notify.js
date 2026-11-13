/* notify.js — notification bell (top bar): everything that needs attention, one line per item
   - Built from the data itself (late PO / milestone / invoice, budget overrun, returned documents, my late tasks …),
     so it is always current — recalculated after every page change and every cloud refresh.
   - Read / unread is kept per user in this browser. "ของฉัน" = items where I am the PM, Sales, Estimator,
     owner of the document / task, or on the Weekly Plan task.
   - Optional desktop notification (browser permission) when a new urgent item appears. */
(function () {
  const U = PM.ui, esc = U.esc;
  const N = (PM.notify = {});
  const LEVELS = { critical: { label: 'ด่วน', rank: 0 }, warning: { label: 'ติดตาม', rank: 1 }, info: { label: 'แจ้งให้ทราบ', rank: 2 } };
  /* the panel's sections, in this order. An item's section comes from the first part of its id (or its own `topic`) */
  const TOPICS = [
    { key: 'approval', label: 'รออนุมัติ', icon: 'check' },
    { key: 'schedule', label: 'แผนงาน & เวลา', icon: 'calendar' },
    { key: 'money', label: 'ต้นทุน & การเงิน', icon: 'coins' },
    { key: 'purchase', label: 'จัดซื้อ & AVL', icon: 'truck' },
    { key: 'docs', label: 'เอกสาร', icon: 'proposal' },
    { key: 'quality', label: 'คุณภาพ & ความเสี่ยง', icon: 'quality' },
    { key: 'team', label: 'ประชุม & รายงานทีม', icon: 'people' },
    { key: 'bid', label: 'งานประมูล', icon: 'submit' },
    { key: 'other', label: 'อื่น ๆ', icon: 'info' },
  ];
  const TOPIC_OF = { apr: 'approval', spi: 'schedule', ms: 'schedule', ms7: 'schedule', task: 'schedule', wp: 'schedule', over: 'money', fc: 'money', inv: 'money', vo: 'money',
    po: 'purchase', po7: 'purchase', avl: 'purchase', ret: 'docs', risk: 'quality', riskd: 'quality', ncr: 'quality', pl: 'quality', act: 'team', daily: 'team', ts: 'team', bid: 'bid', bid3: 'bid',
    vd: 'docs', itp: 'quality', itph: 'schedule', sv: 'quality', wty: 'other', retn: 'money', loss: 'bid' };
  const topicOf = (x) => x.topic || TOPIC_OF[String(x.id).split('-')[0]] || 'other';
  const view = { tab: 'all' };
  let items = [], timer = null;

  /* ---------- per-user state: read ids, ids already seen (for desktop alerts), desktop on/off ---------- */
  const key = () => 'epc-pm-notify-' + ((PM.myUid && PM.myUid()) || 'local');
  function load() { try { return Object.assign({ read: {}, seen: null, desktop: false, closed: {} }, JSON.parse(localStorage.getItem(key()) || '{}')); } catch (e) { return { read: {}, seen: null, desktop: false, closed: {} }; } }
  function store(s) { try { localStorage.setItem(key(), JSON.stringify(s)); } catch (e) { /* private mode */ } }

  /* who "I" am in the data: my account id + employee records with my name */
  function me() {
    const u = PM.auth && PM.auth.user;
    const name = u ? PM.normName(PM.auth.displayName(u)) : '';
    const ids = new Set([PM.myUid && PM.myUid()].filter(Boolean));
    (PM.db.resources || []).forEach((r) => { if (name && PM.normName(r.name) === name) ids.add(r.id); });
    return { ids, name };
  }

  /* ---------- the list ---------- */
  function build() {
    const db = PM.db, T = PM.today(), out = [];
    const I = me();
    const mineProject = (p) => !!p && (I.ids.has(p.pm) || I.ids.has(p.sales));
    const add = (o) => out.push(o);
    const active = (db.projects || []).filter((p) => p.status !== 'closed');

    active.forEach((p) => {
      const m = PM.projectMetrics(p), mine = mineProject(p), at = (tab) => `#/projects/${p.id}${tab ? '/' + tab : ''}`;
      const fin = PM.seesProjectFinance(); // overrun amounts and unpaid invoices: the roles that see a project's money
      const o = fin && PM.costOverrun ? PM.costOverrun(m, false) : null;
      if (o && o.status === 'over') add({ id: `over-${p.id}`, level: 'critical', icon: 'coins', title: `${p.code} ต้นทุนเกินงบแล้ว +${U.money(o.amount)}`, sub: `${p.name} · ใช้ไป ${U.pct(o.used)} ของงบ`, href: at('cost'), mine });
      else if (o && o.status === 'forecast') add({ id: `fc-${p.id}`, level: 'warning', icon: 'coins', title: `${p.code} คาดว่าจะเกินงบ +${U.money(o.forecast)}`, sub: `${p.name} · CPI ${U.ratio(m.cpi)}`, href: at('cost'), mine });
      if (p.status !== 'onhold' && m.spi != null && m.spi < 0.9) add({ id: `spi-${p.id}`, level: 'critical', icon: 'clock', title: `${p.code} ช้ากว่าแผน (SPI ${U.ratio(m.spi)})`, sub: `${p.name} · จริง ${U.pct(m.act)} / แผน ${U.pct(m.plan)}`, href: at('timeline'), mine });
      (p.milestones || []).forEach((x) => {
        if (PM.milestoneLate(x, T)) add({ id: `ms-${x.id}`, level: 'critical', icon: 'alert', title: `Milestone เลยกำหนด: ${x.name}`, sub: `${p.code} · กำหนด ${U.date(x.date)} (เลย ${PM.diffDays(x.date, T)} วัน)`, href: at('timeline'), mine, date: x.date });
        else if (!x.actual && x.date >= T && PM.diffDays(T, x.date) <= 7) add({ id: `ms7-${x.id}`, level: 'info', icon: 'calendar', title: `Milestone ใน 7 วัน: ${x.name}`, sub: `${p.code} · ${U.date(x.date)}`, href: at('timeline'), mine, date: x.date });
      });
      (p.tasks || []).forEach((t) => { if (PM.taskLate(t, T)) add({ id: `task-${t.id}`, level: 'warning', icon: 'tasks', title: `กิจกรรมล่าช้า: ${t.name}`, sub: `${p.code} · กำหนดเสร็จ ${U.date(t.end)} · ${U.num(t.progress || 0)}%`, href: at('timeline'), mine: mine || I.ids.has(t.owner), date: t.end }); });
      if (fin) (p.invoices || []).forEach((i) => { if (PM.invOverdue && PM.invOverdue(i, T)) add({ id: `inv-${i.id}`, level: 'critical', icon: 'coins', title: `ลูกค้าค้างชำระ ${i.no} ${U.money(PM.invNet(i))}`, sub: `${p.code} · ครบกำหนด ${U.date(i.dueDate)}`, href: at('billing'), mine, date: i.dueDate }); });
      (p.risks || []).forEach((r) => {
        if (!PM.riskOpen || !PM.riskOpen(r)) return;
        const mineR = mine || (I.name && PM.normName(r.owner || '') === I.name);
        if (PM.riskScore(r) >= 15) add({ id: `risk-${r.id}`, level: 'critical', icon: 'alert', title: `ความเสี่ยงสูงมาก: ${r.title}`, sub: `${p.code} · ${r.no} · คะแนน ${PM.riskScore(r)}`, href: at('risks'), mine: mineR });
        else if (PM.riskOverdue(r, T)) add({ id: `riskd-${r.id}`, level: 'warning', icon: 'alert', title: `ความเสี่ยงเลยกำหนดดำเนินการ: ${r.title}`, sub: `${p.code} · ${r.no} · กำหนด ${U.date(r.dueDate)}`, href: at('risks'), mine: mineR, date: r.dueDate });
      });
      (p.changes || []).forEach((c) => { if (c.status === 'submitted' && c.date && PM.diffDays(c.date, T) > 30) add({ id: `vo-${c.id}`, level: 'info', icon: 'wrench', title: `VO รออนุมัติเกิน 30 วัน: ${c.no}`, sub: `${p.code} · ${c.title || ''}`, href: at('changes'), mine }); });
      (p.phaseItems || []).forEach((x) => {
        const cfg = PM.PHASE_ITEMS && PM.PHASE_ITEMS[x.phase];
        const mineX = mine || I.ids.has(x.owner);
        if (x.status === 'return') add({ id: `ret-${x.id}-${x.rev || ''}`, level: 'warning', icon: 'layers', title: `ลูกค้าส่งกลับแก้ไข: ${x.no} ${x.name}`, sub: `${p.code} · Rev. ${x.rev || '–'}${x.comment ? ' · ' + x.comment : ''}`, href: at(), mine: mineX });
        else if (PM.itemLate && PM.itemLate(x, T)) add({ id: `pil-${x.id}`, level: 'warning', icon: 'layers', title: `${cfg ? cfg.noun : 'รายการ'}เลยกำหนด: ${x.no} ${x.name}`, sub: `${p.code} · กำหนด ${U.date(x.due)} (เลย ${PM.diffDays(x.due, T)} วัน)`, href: at(), mine: mineX, date: x.due, topic: x.phase === 'procurement' ? 'purchase' : x.phase === 'construction' ? 'schedule' : 'docs' });
      });
      // punch list: category A (must be fixed before handover) past its date (punch.js)
      (db.punch || []).filter((x) => x.projectId === p.id && x.category === 'A' && PM.punchLate && PM.punchLate(x, T))
        .forEach((x) => add({ id: `pl-${x.id}`, level: 'warning', icon: 'tasks', title: `Punch A เลยกำหนด: ${x.no} ${x.location}`, sub: `${p.code} · ${x.description} · ${x.owner || '–'}`, href: at('punch'), mine: mine || (I.name && PM.normName(x.owner || '') === I.name), date: x.due }));
      // meeting actions past their date (meetings.js) — mine = my name in "ผู้รับผิดชอบ"
      if (PM.openActions) PM.openActions(p.id).filter(({ a }) => PM.actionLate(a, T)).forEach(({ a, mt }) => {
        const mineA = !!I.name && PM.normName(a.owner || '').includes(I.name);
        add({ id: `act-${a.id}`, level: 'warning', icon: 'people', title: `Action เลยกำหนด: ${a.text}`, sub: `${p.code} · ${mt.no} · ${a.owner || '–'} · กำหนด ${U.date(a.due)}`, href: at('meetings'), mine: mine || mineA, date: a.due });
      });
      // approved vendor list (avl.js): POs placed with a vendor the client has not approved · approvals waiting long
      if (PM.avlStats) {
        const av = PM.avlStats(p, T);
        if (av.off.length) add({ id: `avl-po-${p.id}-${av.off.length}`, level: 'warning', icon: 'truck', title: `${p.code} มี PO นอก AVL ${av.off.length} ใบ`, sub: `มูลค่า ${U.money(av.offValue)} · ${av.off.slice(0, 2).map((x) => x.po.supplier).join(', ')}`, href: at('avl'), mine });
        if (av.waiting) add({ id: `avl-wait-${p.id}-${av.waiting}`, level: 'info', icon: 'check', title: `${p.code} AVL รอลูกค้าอนุมัตินาน ${av.waiting} ราย`, sub: `${p.name} — ส่งขออนุมัติเกิน 14 วัน`, href: at('avl'), mine });
      }
      // vendor documents (vdrl.js): one line per kind per project, with the count
      if (PM.vdrlStats) {
        const vd = PM.vdrlStats(p, T);
        if (vd.latePlan) add({ id: `vd-plan-${p.id}-${vd.latePlan}`, level: 'warning', icon: 'proposal', title: `${p.code} เอกสารผู้ขายเลยกำหนดส่ง ${vd.latePlan} ฉบับ`, sub: vd.all.filter((x) => x.s.key === 'plan' && x.s.late).slice(0, 2).map((x) => x.d.title).join(', '), href: at('vdrl'), mine });
        if (vd.lateResubmit) add({ id: `vd-re-${p.id}-${vd.lateResubmit}`, level: 'warning', icon: 'proposal', title: `${p.code} เอกสารต้องแก้ไขส่งใหม่เลยกำหนด ${vd.lateResubmit} ฉบับ`, sub: vd.all.filter((x) => x.s.key === 'resubmit' && x.s.late).slice(0, 2).map((x) => `${x.d.title} (${x.s.rev.code})`).join(', '), href: at('vdrl'), mine });
        if (vd.lateReview) add({ id: `vd-rv-${p.id}-${vd.lateReview}`, level: 'info', icon: 'proposal', title: `${p.code} ลูกค้ายังไม่ตอบกลับเอกสาร ${vd.lateReview} ฉบับ`, sub: 'เกินกำหนดตอบ — ติดตามลูกค้า', href: at('vdrl'), mine });
      }
      // inspection & test plan (itp.js): Hold / Witness coming (invite the client) · fails not fixed yet
      if (PM.itpStats) {
        const it = PM.itpStats(p, T);
        it.soon.forEach((x) => add({ id: `itph-${x.id}-${x.planDate}`, level: x.point === 'H' ? 'warning' : 'info', icon: 'calendar', title: `${x.point === 'H' ? 'Hold point' : 'Witness'} ใน ${PM.diffDays(T, x.planDate)} วัน: ${x.activity}`, sub: `${p.code} · ${U.date(x.planDate)} — แจ้งลูกค้าให้มาตรวจ`, href: at('itp'), mine, date: x.planDate }));
        if (it.failOpen) add({ id: `itp-fail-${p.id}-${it.failOpen}`, level: 'warning', icon: 'quality', title: `${p.code} ITP ไม่ผ่าน ยังไม่ปิด ${it.failOpen} รายการ`, sub: it.all.filter(PM.itpFailOpen).slice(0, 2).map((x) => x.activity).join(', '), href: at('itp'), mine });
      }
      // daily site report missing for the last working day (projects that keep daily reports — daily.js)
      const dm = PM.dailyMissing && PM.dailyMissing(p, T);
      if (dm) add({ id: `daily-${p.id}-${dm}`, level: 'info', icon: 'calendar', title: `${p.code} ยังไม่มีรายงานประจำวัน ${U.date(dm)}`, sub: `${p.name} — เขียนที่แท็บรายงานประจำวัน`, href: at('daily'), mine, date: dm });
      (db.ncrs || []).filter((n) => n.projectId === p.id && n.status === 'open' && n.severity === 'Critical')
        .forEach((n) => add({ id: `ncr-${n.id}`, level: 'critical', icon: 'quality', title: `NCR ระดับวิกฤต: ${n.no}`, sub: `${p.code} · ${n.description || ''}`, href: at('quality'), mine, date: n.date }));
      (db.ncrs || []).filter((n) => n.projectId === p.id && n.status === 'open' && n.severity !== 'Critical' && n.dueDate && n.dueDate < T)
        .forEach((n) => add({ id: `ncrd-${n.id}`, level: 'warning', icon: 'quality', title: `NCR เลยกำหนด: ${n.no}`, sub: `${p.code} · กำหนด ${U.date(n.dueDate)}`, href: at('quality'), mine, date: n.dueDate, topic: 'quality' }));
    });
    // after handover (warranty.js) — closed projects too: service requests past their time · warranty ending · retention due back
    if (PM.warrantyStats) (db.projects || []).forEach((p) => {
      const mine = mineProject(p), at = `#/projects/${p.id}/warranty`;
      const w = PM.warrantyStats(p, T);
      w.late.forEach((x) => add({ id: `sv-${x.id}`, level: x.priority === 'urgent' ? 'critical' : 'warning', icon: 'wrench', title: `ใบแจ้งซ่อมเกินกำหนด: ${x.no} ${x.description}`, sub: `${p.code} · ${p.client || ''} · รับแจ้ง ${U.date(x.date)}`, href: at, mine: mine || (I.name && PM.normName(x.assignee || '') === I.name), date: x.date }));
      w.soon.forEach(({ w: x, s }) => add({ id: `wty-${x.id}-${s.end}`, level: 'info', icon: 'safety', title: `ประกันใกล้หมด (${s.left} วัน): ${x.item}`, sub: `${p.code} · หมด ${U.date(s.end)} — ตรวจสภาพก่อนหมดประกัน`, href: at, mine, date: s.end }));
      const r = PM.retentionDue && PM.retentionDue(p, T);
      if (r && r.ready) add({ id: `retn-${p.id}-${r.due}`, level: 'warning', icon: 'coins', title: `${p.code} หมดประกันแล้ว — ขอคืน Retention ${U.money(r.held)}`, sub: `${p.name} · หมดประกัน ${U.date(r.due)}`, href: `#/projects/${p.id}/billing`, mine, date: r.due });
    });
    // ISO 9001 records: calibration, CAR, documents to review, complaints … (iso.js)
    if (PM.qmsAlerts) PM.qmsAlerts(T, I.name).forEach(add);

    // approvals (approvals.js): approvers see what waits · the requester sees what was returned
    if (PM.approvalsPending) {
      const pend = PM.approvalsPending();
      const pc = (id) => { const p = PM.find('projects', id); return p ? p.code : ''; };
      if (PM.can('approve.spend')) {
        pend.pos.forEach((x) => add({ id: `apr-po-${x.id}-${x.approval.requestedAt}`, level: 'warning', icon: 'truck', title: `รออนุมัติ PO ${x.poNo} ${U.money(x.amount)}`, sub: `${pc(x.projectId)} · ${x.supplier || ''} · ขอโดย ${x.approval.requestedByName || '–'}`, href: '#/pos', mine: true, date: x.approval.requestedAt }));
        pend.costs.forEach((x) => add({ id: `apr-c-${x.id}-${x.approval.requestedAt}`, level: 'warning', icon: 'coins', title: `รออนุมัติค่าใช้จ่าย ${U.money(x.amount)}`, sub: `${pc(x.projectId)} · ${x.description} · ขอโดย ${x.approval.requestedByName || '–'}`, href: `#/projects/${x.projectId}/cost`, mine: true, date: x.approval.requestedAt }));
      }
      const uid = PM.myUid && PM.myUid();
      (db.pos || []).concat(db.costs || []).filter((x) => x.approval && x.approval.status === 'rejected' && uid && x.approval.requestedBy === uid).forEach((x) => {
        const isPo = !!x.poNo;
        add({ id: `apr-no-${x.id}-${x.approval.at}`, level: 'warning', icon: isPo ? 'truck' : 'coins', title: `ไม่อนุมัติ: ${isPo ? 'PO ' + x.poNo : x.description}`, sub: `${x.approval.byName || ''}${x.approval.note ? ' — ' + x.approval.note : ''} · แก้ไขแล้วบันทึกเพื่อขอใหม่`, href: isPo ? '#/pos' : `#/projects/${x.projectId}/cost`, mine: true, date: x.approval.at });
      });
    }
    // purchase orders
    const po = PM.poStats(db.pos || [], T);
    const poMine = (x) => mineProject(PM.find('projects', x.projectId));
    po.late.forEach((x) => add({ id: `po-${x.id}`, level: 'critical', icon: 'truck', title: `PO เลยกำหนดส่ง: ${x.poNo}`, sub: `${x.supplier || ''} · เลย ${PM.poDaysLate(x, T)} วัน`, href: '#/pos', mine: poMine(x), date: x.deliveryDue }));
    po.soon.filter((x) => PM.diffDays(T, x.deliveryDue) <= 7).forEach((x) => add({ id: `po7-${x.id}`, level: 'warning', icon: 'truck', title: `PO ต้องส่งใน 7 วัน: ${x.poNo}`, sub: `${x.supplier || ''} · ${U.date(x.deliveryDue)}`, href: '#/pos', mine: poMine(x), date: x.deliveryDue }));

    // bids not submitted yet
    (db.bids || []).filter((b) => b.result === 'pending' && !(b.dates && b.dates.submit) && b.dueDate).forEach((b) => {
      const mine = I.ids.has(b.sales) || I.ids.has(b.estimator) || (PM.myUid && b.owner === PM.myUid());
      if (b.dueDate < T) add({ id: `bid-${b.id}`, level: 'critical', icon: 'submit', title: `Bid เลย Due date ยังไม่ยื่น: ${PM.dash(b.code)}`, sub: `${PM.dash(b.name)} · Due ${U.date(b.dueDate)}`, href: '#/bidding', mine, date: b.dueDate });
      else if (PM.diffDays(T, b.dueDate) <= 3) add({ id: `bid3-${b.id}`, level: 'warning', icon: 'submit', title: `Bid ต้องยื่นใน ${PM.diffDays(T, b.dueDate)} วัน: ${PM.dash(b.code)}`, sub: `${PM.dash(b.name)} · Due ${U.date(b.dueDate)}`, href: '#/bidding', mine, date: b.dueDate });
    });

    // my Weekly Plan tasks of this week that are past their date
    const wk = PM.monday(T);
    (db.plans || []).filter((x) => x.week === wk && x.status !== 'done' && x.status !== 'not_done' && x.dueDate && x.dueDate < T).forEach((x) => {
      const mine = Array.from(I.ids).some((id) => PM.planHas && PM.planHas(x, id));
      add({ id: `wp-${x.id}`, level: 'warning', icon: 'tasks', title: `งานเลยกำหนด: ${x.title}`, sub: `Weekly Plan · กำหนด ${U.date(x.dueDate)} — อัปเดตสถานะ`, href: '#/weekly', mine, date: x.dueDate });
    });

    // things to prepare for the tasks ahead (weekly.js)
    if (PM.prepAlerts) PM.prepAlerts(T, I).forEach(add);

    // last week's timesheets (people who fill them in)
    if (PM.can('timesheet.edit')) {
      const ut = PM.utilization(PM.addDays(wk, -7), PM.addDays(wk, -1));
      const missing = ut.people.filter((x) => x.capacity && x.logged < x.capacity * 0.9);
      if (missing.length) add({ id: `ts-${wk}`, level: 'info', icon: 'clock', title: `Timesheet สัปดาห์ก่อนยังไม่ครบ ${missing.length} คน`, sub: missing.slice(0, 4).map((x) => x.r.name).join(', ') + (missing.length > 4 ? ' …' : ''), href: '#/timesheet', mine: true });
    }
    return out.sort((a, b) => LEVELS[a.level].rank - LEVELS[b.level].rank || String(a.date || '').localeCompare(String(b.date || '')));
  }

  /* ---------- recalculate · badge · desktop alert ---------- */
  N.refresh = function () {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!document.body.classList.contains('authed') || !PM.db || !PM.db.projects) return;
      try { items = build(); } catch (e) { console.warn('notifications:', e); return; }
      const s = load(), now = new Set(items.map((x) => x.id));
      Object.keys(s.read).forEach((id) => { if (!now.has(id)) delete s.read[id]; }); // forget what has gone away
      if (s.seen === null) s.seen = {}; // first visit: nothing is "new" yet — no burst of desktop alerts
      else if (s.desktop && 'Notification' in window && Notification.permission === 'granted') {
        const fresh = items.filter((x) => x.level === 'critical' && !s.seen[x.id] && !s.read[x.id]);
        if (fresh.length) {
          try { new Notification(fresh.length === 1 ? fresh[0].title : `เรื่องด่วนใหม่ ${fresh.length} เรื่อง`, { body: fresh.length === 1 ? fresh[0].sub : fresh.slice(0, 3).map((x) => x.title).join('\n'), icon: PM.appIconUrl(), badge: PM.appIconUrl() }); } catch (e) { /* not allowed here */ }
        }
      }
      s.seen = {}; items.forEach((x) => (s.seen[x.id] = 1));
      store(s);
      badge(s);
      const panel = document.getElementById('nt-panel');
      if (panel && !panel.hidden) draw();
    }, 60);
  };
  const unread = (s) => items.filter((x) => !s.read[x.id]);
  function badge(s) {
    const b = document.getElementById('bell-btn');
    if (!b) return;
    const n = unread(s || load()).length, crit = unread(s || load()).some((x) => x.level === 'critical');
    const c = b.querySelector('.bell-n');
    c.hidden = !n; c.textContent = n > 99 ? '99+' : n;
    c.classList.toggle('crit', crit);
    b.title = n ? `การแจ้งเตือน — ยังไม่อ่าน ${n} เรื่อง` : 'การแจ้งเตือน';
    b.setAttribute('aria-label', b.title);
  }

  /* ---------- panel ---------- */
  function draw() {
    const panel = document.getElementById('nt-panel');
    const s = load();
    const mine = items.filter((x) => x.mine), un = unread(s);
    const list = view.tab === 'mine' ? mine : view.tab === 'unread' ? un : items;
    const desktopOk = 'Notification' in window;
    const prev = panel.querySelector('.nt-list'), scroll = prev ? prev.scrollTop : 0; // opening / closing a section keeps your place
    const sections = TOPICS.map((t) => ({ t, rows: list.filter((x) => (TOPICS.some((y) => y.key === topicOf(x)) ? topicOf(x) : 'other') === t.key) })).filter((g) => g.rows.length);
    const allClosed = sections.length && sections.every((g) => s.closed[g.t.key]);
    panel.innerHTML = `
      <header><b>การแจ้งเตือน</b>${un.length ? U.badge('critical', `ใหม่ ${un.length}`) : ''}<span class="spacer"></span>
        ${un.length ? '<button type="button" class="link-btn" data-nt="readall">อ่านทั้งหมด</button>' : ''}
        <button type="button" class="icon-btn" data-nt="close" aria-label="ปิด">✕</button></header>
      <div class="nt-tabs">${[['all', `ทั้งหมด ${items.length}`], ['mine', `ของฉัน ${mine.length}`], ['unread', `ยังไม่อ่าน ${un.length}`]].map(([k, l]) => `<button type="button" data-nt-tab="${k}" class="${view.tab === k ? 'on' : ''}">${l}</button>`).join('')}
        ${sections.length > 1 ? `<button type="button" class="nt-all" data-nt="toggle-all">${allClosed ? 'ขยายทุกหัวข้อ' : 'ยุบทุกหัวข้อ'}</button>` : ''}</div>
      <div class="nt-list">${list.length ? sections.map(({ t, rows }) => {
        const open = !s.closed[t.key], crit = rows.filter((x) => x.level === 'critical').length, fresh = rows.filter((x) => !s.read[x.id]).length;
        return `<section class="nt-sec"><button type="button" class="nt-sec-h" data-nt-sec="${t.key}" aria-expanded="${open}">
            ${PM.illus.svg(t.icon)}<b>${esc(t.label)}</b><span class="nt-sec-n">${rows.length}</span>
            ${crit ? `<span class="nt-sec-crit">ด่วน ${crit}</span>` : ''}${!open && fresh ? `<span class="nt-sec-new">ใหม่ ${fresh}</span>` : ''}<i class="nt-chev" aria-hidden="true"></i></button>
          ${open ? rows.map((x) => `
          <a class="nt-item lv-${x.level}${s.read[x.id] ? '' : ' unread'}" href="${esc(x.href)}" data-nt-id="${esc(x.id)}">
            ${PM.illus.icon(x.icon, 'nt-ic')}
            <span class="nt-t"><b>${esc(x.title)}</b><small>${esc(x.sub || '')}</small></span>
            ${x.level === 'critical' ? `<span class="nt-lv">${LEVELS.critical.label}</span>` : ''}${x.mine ? '<span class="nt-mine" title="เกี่ยวกับฉัน">ฉัน</span>' : ''}<i class="nt-dot" aria-hidden="true"></i></a>`).join('') : ''}</section>`;
      }).join('') : `<p class="nt-empty">${view.tab === 'mine' ? 'ไม่มีเรื่องที่เกี่ยวกับคุณ' : view.tab === 'unread' ? 'อ่านครบทุกเรื่องแล้ว' : 'ไม่มีเรื่องที่ต้องดำเนินการ ณ วันนี้'}</p>`}</div>
      <footer>${desktopOk ? `<label class="nt-desk"><input type="checkbox" data-nt="desktop"${s.desktop && Notification.permission === 'granted' ? ' checked' : ''}> แจ้งเตือนบนเครื่องเมื่อมีเรื่องด่วนใหม่</label>` : ''}
        <a href="#/dashboard" data-nt="dash">ดูภาพรวมที่ Dashboard →</a></footer>`;
    panel.querySelector('.nt-list').scrollTop = scroll;
  }
  function open() {
    let panel = document.getElementById('nt-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'nt-panel'; panel.className = 'nt-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'การแจ้งเตือน');
      document.body.appendChild(panel);
      panel.addEventListener('click', onPanel);
      panel.addEventListener('change', onPanel);
    }
    items = build();
    draw();
    panel.hidden = false;
    document.body.classList.add('nt-open');
    document.getElementById('bell-btn').setAttribute('aria-expanded', 'true');
  }
  N.open = open; // the Dashboard's "ต้องดำเนินการวันนี้" bar opens this panel
  N.list = () => { try { return build(); } catch (e) { return []; } };
  N.close = function () {
    const panel = document.getElementById('nt-panel');
    if (panel) panel.hidden = true;
    document.body.classList.remove('nt-open');
    const b = document.getElementById('bell-btn'); if (b) b.setAttribute('aria-expanded', 'false');
  };
  function onPanel(e) {
    const s = load();
    if (e.type === 'change') {
      const d = e.target.closest('[data-nt="desktop"]');
      if (!d) return;
      if (d.checked && Notification.permission !== 'granted') {
        Notification.requestPermission().then((p) => { const x = load(); x.desktop = p === 'granted'; store(x); if (p !== 'granted') U.toast('เบราว์เซอร์ไม่อนุญาตการแจ้งเตือน — เปิดได้ที่การตั้งค่าเว็บไซต์ของเบราว์เซอร์'); draw(); });
        return;
      }
      s.desktop = d.checked; store(s);
      U.toast(d.checked ? 'เปิดการแจ้งเตือนบนเครื่องแล้ว' : 'ปิดการแจ้งเตือนบนเครื่องแล้ว');
      return;
    }
    const tab = e.target.closest('[data-nt-tab]');
    if (tab) { view.tab = tab.dataset.ntTab; draw(); document.querySelector('#nt-panel .nt-list').scrollTop = 0; return; }
    const sec = e.target.closest('[data-nt-sec]');
    if (sec) { const k = sec.dataset.ntSec; if (s.closed[k]) delete s.closed[k]; else s.closed[k] = 1; store(s); draw(); return; }
    const a = e.target.closest('[data-nt]');
    if (a && a.dataset.nt === 'close') { N.close(); return; }
    if (a && a.dataset.nt === 'toggle-all') {
      const close = !TOPICS.every((t) => s.closed[t.key]);
      s.closed = {};
      if (close) TOPICS.forEach((t) => (s.closed[t.key] = 1));
      store(s); draw(); return;
    }
    if (a && a.dataset.nt === 'readall') { items.forEach((x) => (s.read[x.id] = PM.today())); store(s); badge(s); draw(); return; }
    if (a && a.dataset.nt === 'dash') { N.close(); return; }
    const it = e.target.closest('[data-nt-id]');
    if (it) { s.read[it.dataset.ntId] = PM.today(); store(s); badge(s); N.close(); } // the link itself opens the page
  }

  /* ---------- wiring: bell click, outside click / Esc, refresh after every render and every few minutes ---------- */
  document.addEventListener('click', (e) => {
    if (e.target.closest('#bell-btn')) { const p = document.getElementById('nt-panel'); if (p && !p.hidden) N.close(); else open(); return; }
    // outside the panel → close. The path is taken from when the click happened: a tab click redraws the panel,
    // so by now the clicked button is no longer on the page
    if (document.body.classList.contains('nt-open') && !e.composedPath().some((n) => n.id === 'nt-panel')) N.close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('nt-open')) N.close(); });
  window.addEventListener('hashchange', () => { N.close(); N.refresh(); });
  setInterval(() => N.refresh(), 5 * 60 * 1000);
})();
