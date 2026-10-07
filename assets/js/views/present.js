/* present.js — โหมดนำเสนอขึ้นจอ (#/present): a full-screen, auto-rotating view for a TV / projector in the office
   or a meeting. Big numbers readable from across the room, a clock, data refreshed from the cloud every minute,
   the screen kept awake. Slides follow the viewer's permissions (Resource → resource.view, bid money → canSeeBidPrice).
   Keys: ← → previous / next · Space pause · F full screen · Esc leave. */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  const state = U.keep('present', { slide: 0, playing: true, seconds: 15 }, ['seconds']);
  const SECONDS = [10, 15, 30, 60];
  let tRotate = null, tClock = null, tRefresh = null, wakeLock = null, viewEl = null;

  /* ---------- pieces ---------- */
  const kpi = (label, value, sub, level) => `<div class="pres-kpi${level ? ' lv-' + level : ''}"><span class="k">${esc(label)}</span><b class="v">${value}</b>${sub ? `<span class="s">${sub}</span>` : ''}</div>`;
  const healthBadge = (h) => U.badge(h, U.healthLabel[h] || h);
  // charts on a big screen fill the height their card gives them
  const fillH = (id, min) => { const c = document.getElementById(id); return Math.max(min || 240, (c ? c.clientHeight : 0) - 40); };
  const bar = (actual, plan) => `<div class="pres-bar"><span style="width:${Math.max(0, Math.min(100, actual * 100))}%"></span>${plan != null ? `<i style="left:${Math.max(0, Math.min(100, plan * 100))}%"></i>` : ''}</div>`;

  /* ---------- slides (each: title, sub, html, draw?) ---------- */
  function slides() {
    const db = PM.db, T = PM.today();
    const from12 = PM.addDays(T, -364);
    const out = [];

    // 1 · Bidding
    const bs = PM.bidStats(db.bids, from12, T);
    const pending = db.bids.filter((b) => b.result === 'pending');
    out.push({
      key: 'bidding', title: 'Bidding — งานประมูล', sub: '12 เดือนล่าสุด · งานที่กำลังประมูลตอนนี้',
      html: () => `
        <div class="pres-kpis">
          ${kpi('งานที่กำลังประมูล', pending.length, PM.seesBidPrices() ? `Pipeline ${V.bidSum(pending)}${PM.myRole() === 'sales' ? ' (งานของคุณ)' : ''}` : 'Inquiry → Submit')}
          ${kpi('Win rate', U.pct(bs.winRate), `${bs.won} won / ${bs.won + bs.lost} ประกาศผล`)}
          ${kpi('Inquiry 12 เดือน', bs.total, `ยื่นแล้ว ${bs.submitted} งาน`)}
          ${kpi('ยื่นตรงเวลา', U.pct(bs.onTimeRate), 'เป้า 90%', bs.onTimeRate == null ? null : bs.onTimeRate >= 0.9 ? 'good' : bs.onTimeRate >= 0.75 ? 'warning' : 'critical')}
        </div>
        <div class="pres-funnel">${PM.BID_STAGES.map((s, i) => {
          const n = pending.filter((b) => b.stage === s.key);
          return `${i ? '<span class="arrow">→</span>' : ''}<div class="step"><span class="k">${String(i + 1).padStart(2, '0')} · ${esc(s.label)}</span><b>${n.length}</b><span class="s">${esc(s.th)} · avg ${U.days(bs.stageDays[i].avg)}</span></div>`;
        }).join('')}<span class="arrow">→</span><div class="step award"><span class="k">Award</span><b>${bs.won}<small> / ${bs.lost}</small></b><span class="s">Won / Lost 12 เดือน</span></div></div>`,
    });

    // 2 · Projects
    const active = db.projects.filter((p) => p.status !== 'closed').map((p) => ({ p, m: PM.projectMetrics(p) }));
    const sEV = PM.sum(active, (r) => r.m.ev), sPV = PM.sum(active, (r) => r.m.pv), sAC = PM.sum(active, (r) => r.m.ac);
    const spi = sPV ? sEV / sPV : null, cpi = sAC ? sEV / sAC : null;
    const healthOf = (r) => (r.p.status === 'onhold' ? 'warning' : U.worst(U.health(r.m.spi), U.health(r.m.cpi)));
    out.push({
      key: 'projects', title: 'Projects — โครงการ EPC', sub: 'โครงการที่ดำเนินการอยู่ · แท่ง = งานเสร็จจริง · ขีด = ตามแผน ณ วันนี้',
      html: () => `
        <div class="pres-kpis">
          ${kpi('โครงการ Active', active.length, `มูลค่าสัญญา ${U.money(PM.sum(active, (r) => r.p.contractValue || 0))}`)}
          ${kpi('Portfolio SPI', U.ratio(spi), 'เวลา (≥ 0.95 = On track)', U.health(spi))}
          ${kpi('Portfolio CPI', U.ratio(cpi), 'ต้นทุน (≥ 0.95 = On track)', U.health(cpi))}
          ${kpi('NCR ค้าง', PM.sum(active, (r) => r.m.ncrOpen), `${PM.sum(active, (r) => r.m.ncrCriticalOpen)} critical`, PM.sum(active, (r) => r.m.ncrCriticalOpen) ? 'critical' : 'good')}
        </div>
        <div class="pres-list">${active.slice(0, 8).map((r) => `<div class="row">
          <div class="name"><b>${esc(r.p.code)}</b><span>${esc(r.p.name)}</span></div>
          <span class="chip">${esc(r.m.current ? U.phaseLabel(r.m.current.key) : '–')}</span>
          ${bar(r.m.act, r.m.plan)}<b class="pct">${U.pct(r.m.act)}</b>
          ${r.p.status === 'onhold' ? U.badge('warning', 'On hold') : healthBadge(healthOf(r))}</div>`).join('') || '<p class="empty">ยังไม่มีโครงการ</p>'}</div>`,
    });

    // 3 · Project health (charts)
    if (active.length) out.push({
      key: 'health', title: 'สุขภาพโครงการ', sub: 'SPI × CPI ของแต่ละโครงการ · งานเสร็จจริงเทียบแผน',
      html: () => `<div class="pres-grid2"><div class="pres-card"><h3>SPI × CPI</h3><div class="chart" id="p-quad"></div></div><div class="pres-card"><h3>Progress จริง − แผน (จุด %)</h3><div class="chart" id="p-gap"></div></div></div>`,
      draw: () => {
        PM.charts.quadrant(document.getElementById('p-quad'), {
          label: 'SPI × CPI', xName: 'SPI (เวลา)', yName: 'CPI (ต้นทุน)', height: fillH('p-quad', 320),
          quads: { tr: 'เร็วกว่าแผน · ต่ำกว่างบ', tl: 'ช้ากว่าแผน · ต่ำกว่างบ', br: 'เร็วกว่าแผน · เกินงบ', bl: 'ช้ากว่าแผน · เกินงบ' },
          points: active.map((r) => ({ label: r.p.code, x: r.m.spi, y: r.m.cpi, level: r.p.status === 'onhold' ? 'neutral' : healthOf(r), tip: `${r.p.code}\nSPI ${U.ratio(r.m.spi)} · CPI ${U.ratio(r.m.cpi)}` })),
        });
        PM.charts.diverging(document.getElementById('p-gap'), {
          neg: { label: 'ช้ากว่าแผน', color: 'var(--s2)' }, pos: { label: 'เร็วกว่าแผน', color: 'var(--s1)' },
          items: active.filter((r) => r.m.plan != null).map((r) => { const g = (r.m.act - r.m.plan) * 100; return { label: r.p.code, value: g, display: `${g > 0 ? '+' : ''}${g.toFixed(1)}` }; }).sort((a, b) => a.value - b.value),
        });
      },
    });

    // 3b · Cost overrun (Active + Closed) — worst first; bar = % of Plan cost spent, tick = % work done
    const ov = PM.costOverrunRows(db.projects.map((p) => (p.status === 'closed' ? { p, m: PM.projectMetrics(p) } : active.find((r) => r.p === p))));
    if (ov.length) {
      const of = (s, closed) => ov.filter((r) => r.o.status === s && (closed == null || r.o.closed === closed));
      const overNow = of('over', false), overClosed = of('over', true), fc = of('forecast');
      out.push({
        key: 'overrun', title: 'Cost Project Overrun — โครงการเกินงบ', sub: 'ทุกโครงการ (Active + Closed) · แท่ง = % งบที่ใช้ไป · ขีด = % งานเสร็จ · ตัวเลข = เกินงบ / คาดว่าจะเกินตอนจบ',
        html: () => `
          <div class="pres-kpis">
            ${kpi('เกินงบแล้ว (Active)', overNow.length, overNow.length ? `รวม ${U.money(PM.sum(overNow, (r) => r.o.amount))}` : 'ไม่มี', overNow.length ? 'critical' : 'good')}
            ${kpi('คาดว่าจะเกินงบ', fc.length, fc.length ? `รวม ${U.money(PM.sum(fc, (r) => r.o.forecast))} ตอนจบ` : 'ไม่มี', fc.length ? 'warning' : 'good')}
            ${kpi('อยู่ในงบ', of('ok').length, `จาก ${ov.length} โครงการ`)}
            ${kpi('Closed ที่ปิดเกินงบ', overClosed.length, overClosed.length ? `รวม ${U.money(PM.sum(overClosed, (r) => r.o.amount))}` : 'ไม่มี', overClosed.length ? 'critical' : null)}
          </div>
          <div class="pres-list">${ov.slice(0, 8).map(({ p, m, o }) => {
            const s = PM.COST_OVERRUN[o.status];
            const v = o.status === 'over' ? o.amount : o.forecast;
            return `<div class="row">
              <div class="name"><b>${esc(p.code)}</b><span>${esc(p.name)}</span></div>
              <span class="chip">${o.closed ? 'Closed' : esc(m.current ? U.phaseLabel(m.current.key) : '–')}</span>
              <div class="pres-bar${o.status === 'over' ? ' over' : ''}"><span style="width:${Math.max(0, Math.min(100, (o.used || 0) * 100))}%"></span>${o.closed ? '' : `<i style="left:${Math.max(0, Math.min(100, m.act * 100))}%"></i>`}</div>
              <b class="pct">${U.pct(o.used)}</b>
              <b class="amt${v > 0 ? ' neg' : ''}">${o.status === 'nobudget' ? '–' : `${v > 0 ? '+' : '−'}${U.money(Math.abs(v))}`}</b>
              ${U.badge(s.level, s.label)}</div>`;
          }).join('')}</div>`,
      });
    }

    // 4 · Purchase Orders
    const po = PM.poStats(db.pos || [], T);
    const watch = po.late.concat(po.soon).sort((a, b) => (PM.poDaysLate(b, T) - PM.poDaysLate(a, T)) || String(a.deliveryDue).localeCompare(String(b.deliveryDue))).slice(0, 6);
    out.push({
      key: 'pos', title: 'Purchase Orders — ติดตามการสั่งซื้อ', sub: 'PO ทุกโครงการ · ส่งของ · การจ่ายเงิน',
      html: () => `
        <div class="pres-kpis">
          ${kpi('PO ยังไม่ส่งครบ', po.open, `จาก ${po.total} PO`)}
          ${kpi('เลยกำหนดส่ง', po.late.length, po.late.length ? U.money(po.lateValue) : 'ไม่มี', po.late.length ? 'critical' : 'good')}
          ${kpi('ต้องส่งภายใน 14 วัน', po.soon.length, 'เตรียมรับของ', po.soon.length ? 'warning' : null)}
          ${kpi('จ่ายแล้ว', U.pct(po.paidPct), `${U.money(po.paid)} จาก ${U.money(po.value)}`)}
        </div>
        <div class="pres-list">${watch.map((x) => { const late = PM.poDaysLate(x, T); const pr = PM.find('projects', x.projectId); return `<div class="row">
          <div class="name"><b>${esc(x.poNo)}</b><span>${esc(x.supplier)} · ${esc(x.description || '')}</span></div>
          <span class="chip">${esc(pr ? pr.code : '–')}</span><span class="when">กำหนดส่ง ${U.date(x.deliveryDue)}</span>
          ${late ? U.badge('critical', `เลยกำหนด ${late} วัน`) : U.badge('warning', `อีก ${PM.diffDays(T, x.deliveryDue)} วัน`)}</div>`; }).join('') || '<p class="empty">ไม่มี PO ที่ต้องติดตาม</p>'}</div>`,
    });

    // 5 · Weekly Plan (this week)
    const wk = PM.monday(T);
    const plans = (db.plans || []).filter((p) => p.week === wk);
    const wp = PM.planStats(plans);
    const reasons = {};
    plans.filter((p) => p.status === 'not_done').forEach((p) => { const k = p.reason || 'ไม่ระบุ'; reasons[k] = (reasons[k] || 0) + 1; });
    out.push({
      key: 'weekly', title: 'Weekly Plan — สัปดาห์นี้', sub: `สัปดาห์เริ่ม ${U.date(wk)} · PPC = งานเสร็จ ÷ งานในแผน (เป้า ≥ 80%)`,
      html: () => `
        <div class="pres-kpis">
          ${kpi('PPC', U.pct(wp.ppc), 'เป้า ≥ 80%', wp.ppc == null ? null : wp.ppc >= 0.8 ? 'good' : wp.ppc >= 0.6 ? 'warning' : 'critical')}
          ${kpi('งานในแผน', wp.total, `${U.num(wp.hours, 0)} ชั่วโมง`)}
          ${kpi('เสร็จแล้ว', wp.done, `กำลังทำ ${wp.inProgress}`)}
          ${kpi('ไม่เสร็จ', wp.notDone, Object.keys(reasons).length ? 'สาเหตุด้านล่าง' : '–', wp.notDone ? 'warning' : null)}
        </div>
        <div class="pres-card"><h3>สาเหตุที่งานไม่เสร็จ</h3><div class="chart" id="p-reasons"></div></div>`,
      draw: () => PM.charts.hbars(document.getElementById('p-reasons'), {
        items: Object.keys(reasons).sort((a, b) => reasons[b] - reasons[a]).slice(0, 6).map((k) => ({ label: k, value: reasons[k], display: `${reasons[k]} งาน`, color: 'var(--s2)' })),
      }),
    });

    // 6 · Resource (Admin / Dept Manager / PM only)
    if (PM.can('resource.view')) {
      const ut = PM.utilization(PM.addDays(T, -27), T);
      const over = ut.people.filter((x) => x.util > 1.05).length;
      out.push({
        key: 'resource', title: 'Resource Utilization', sub: '4 สัปดาห์ล่าสุด · จาก Timesheet',
        html: () => `
          <div class="pres-kpis">
            ${kpi('Utilization', U.pct(ut.total.util), 'Billable ÷ Available')}
            ${kpi('ชั่วโมง Billable', U.num(ut.total.billable), `Project ${U.num(ut.total.project)} · Bidding ${U.num(ut.total.bid)}`)}
            ${kpi('งานล้น (> 105%)', over, over ? 'คน' : 'ไม่มี', over ? 'critical' : 'good')}
            ${kpi('กรอก Timesheet', U.pct(ut.total.capacity ? ut.total.logged / ut.total.capacity : null), `ขาด ${U.num(ut.total.missing)} ชม.`)}
          </div>
          <div class="pres-grid2"><div class="pres-card"><h3>Utilization ตาม Level</h3><div class="chart" id="p-level"></div></div><div class="pres-card"><h3>ชั่วโมงตามประเภท</h3><div class="chart" id="p-hours"></div></div></div>`,
        draw: () => {
          PM.charts.hbars(document.getElementById('p-level'), { max: 1.2, items: ut.byLevel.map((l) => ({ label: l.level.name, sub: `${l.n} คน`, value: l.util || 0, target: l.target, display: U.pct(l.util) })) });
          PM.charts.share(document.getElementById('p-hours'), {
            fmt: (v) => U.num(v) + ' h', totalLabel: 'รวม',
            segments: [{ name: 'Project (EPC)', value: ut.total.project, color: 'var(--s1)' }, { name: 'Bidding', value: ut.total.bid, color: 'var(--s2)' }, { name: 'Overhead', value: ut.total.overhead, color: 'var(--s3)' }, { name: 'Leave', value: ut.total.leave, color: 'var(--s4)' }],
          });
        },
      });
    }

    // 7 · Safety
    const saf = (db.safety || []).filter((s) => s.month >= from12.slice(0, 7));
    const mh = PM.sum(saf, (s) => s.manhours), lti = PM.sum(saf, (s) => s.lti);
    const lastLti = (db.safety || []).filter((s) => s.lti > 0).map((s) => s.month).sort().pop();
    const monthsSince = lastLti ? Math.max(0, (+T.slice(0, 4) - +lastLti.slice(0, 4)) * 12 + (+T.slice(5, 7) - +lastLti.slice(5, 7))) : null;
    const months = PM.months(PM.addDays(T, -334).slice(0, 7), T.slice(0, 7));
    out.push({
      key: 'safety', title: 'Safety — ความปลอดภัย', sub: 'ทุกโครงการ · 12 เดือนล่าสุด',
      html: () => `
        <div class="pres-kpis">
          ${kpi('LTIFR', U.num(mh ? (lti * 1e6) / mh : 0, 2), 'LTI × 1,000,000 ÷ man-hours', lti ? 'warning' : 'good')}
          ${kpi('Man-hours', U.num(mh), '12 เดือน')}
          ${kpi('LTI', lti, 'อุบัติเหตุถึงขั้นหยุดงาน', lti ? 'critical' : 'good')}
          ${kpi('ไม่มี LTI ต่อเนื่อง', monthsSince == null ? '–' : `${monthsSince} <small>เดือน</small>`, lastLti ? `ครั้งล่าสุด ${U.month(lastLti)}` : 'ยังไม่เคยมี LTI')}
        </div>
        <div class="pres-card"><h3>เหตุการณ์ต่อเดือน (Near miss → LTI)</h3><div class="chart" id="p-inc"></div></div>`,
      draw: () => {
        const sumBy = (k) => months.map((ym) => PM.sum(saf.filter((s) => s.month === ym), (s) => s[k] || 0));
        PM.charts.columns(document.getElementById('p-inc'), {
          categories: months.map(U.month), label: 'Incidents', height: fillH('p-inc', 240),
          series: [
            { name: 'Near miss', color: 'var(--seq-3)', values: sumBy('nearMiss') }, { name: 'First aid', color: 'var(--seq-4)', values: sumBy('firstAid') },
            { name: 'Recordable', color: 'var(--seq-5)', values: sumBy('recordable') }, { name: 'LTI', color: 'var(--seq-6)', values: sumBy('lti') },
          ],
        });
      },
    });
    return out;
  }

  /* ---------- timers / screen ---------- */
  function stop() {
    clearTimeout(tRotate); clearInterval(tClock); clearInterval(tRefresh);
    tRotate = tClock = tRefresh = null;
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  async function keepAwake() {
    try { if (!wakeLock && navigator.wakeLock && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* not allowed — the screen may dim */ }
  }
  const isOpen = () => location.hash.startsWith('#/present');
  // leaving the page: timers off, out of full screen
  window.addEventListener('hashchange', () => {
    if (isOpen()) return;
    stop();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  });
  document.addEventListener('visibilitychange', () => { if (isOpen() && !document.hidden) { wakeLock = null; keepAwake(); } });
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!isOpen() || (t && t.closest && t.closest('input, select, textarea'))) return; // typing in a control isn't a slide command
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { go(state.slide + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { go(state.slide - 1); e.preventDefault(); }
    else if (e.key === ' ') { togglePlay(); e.preventDefault(); }
    else if (e.key === 'f' || e.key === 'F') fullscreen();
    else if (e.key === 'Escape' && !document.fullscreenElement) location.hash = '#/dashboard';
  });
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => U.toast('เบราว์เซอร์นี้ไม่อนุญาตเต็มจอ — กด F11 แทน'));
  }
  function togglePlay() { state.playing = !state.playing; draw(); }
  function go(i) { state.slide = i; draw(); }

  /* ---------- view ---------- */
  PM.views.present = function (el) {
    viewEl = el;
    stop();
    draw();
    keepAwake();
    tClock = setInterval(() => {
      const c = el.querySelector('#pres-clock');
      if (!c || !isOpen()) return;
      const d = new Date();
      c.textContent = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    }, 1000);
    // newest data from the cloud every minute (a change redraws this page through the app's normal render)
    tRefresh = setInterval(() => { if (isOpen() && PM.cloud && PM.cloud.enabled) PM.cloud.sync(true); }, 60000);
    el.onclick = (e) => {
      const a = e.target.closest('[data-pres]');
      if (!a) return;
      const act = a.dataset.pres;
      if (act === 'prev') go(state.slide - 1);
      if (act === 'next') go(state.slide + 1);
      if (act === 'play') togglePlay();
      if (act === 'full') fullscreen();
      if (act === 'exit') location.hash = '#/dashboard';
      if (act === 'dot') go(+a.dataset.i);
    };
    el.onchange = (e) => { if (e.target.id === 'pres-sec') { state.seconds = +e.target.value; draw(); } };
  };

  function draw() {
    const el = viewEl;
    if (!el || !isOpen()) return;
    const list = slides();
    const n = list.length;
    state.slide = ((state.slide % n) + n) % n;
    const s = list[state.slide];
    const now = new Date();
    el.innerHTML = `<div class="pres${state.playing ? '' : ' paused'}">
      <header class="pres-top">
        <div class="pres-brand"><div class="brand-mark">BU4</div><div><b>${esc(PM.COMPANY)}</b><small>BU4 IE/EPC Project Management</small></div></div>
        <div class="pres-title"><h1>${esc(s.title)}</h1><p>${esc(s.sub)}</p></div>
        <div class="pres-time"><b id="pres-clock">${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</b><small>${esc(U.date(PM.today()))} · ข้อมูล ${PM.cloud && PM.cloud.enabled ? 'Cloud' : 'ในเครื่อง'}</small></div>
      </header>
      <main class="pres-stage" aria-live="polite">${s.html()}</main>
      <footer class="pres-foot">
        <div class="pres-dots">${list.map((x, i) => `<button type="button" data-pres="dot" data-i="${i}" class="${i === state.slide ? 'on' : ''}" title="${esc(x.title)}" aria-label="${esc(x.title)}"></button>`).join('')}<span class="muted">${state.slide + 1} / ${n}</span></div>
        <div class="pres-ctrl">
          <button type="button" class="btn sm" data-pres="prev" title="ก่อนหน้า (←)">‹</button>
          <button type="button" class="btn sm" data-pres="play" title="หยุด / เล่น (Space)">${state.playing ? '❚❚ หยุด' : '▶ เล่น'}</button>
          <button type="button" class="btn sm" data-pres="next" title="ถัดไป (→)">›</button>
          <select id="pres-sec" aria-label="เปลี่ยนหน้าทุก">${SECONDS.map((v) => `<option value="${v}"${v === state.seconds ? ' selected' : ''}>ทุก ${v} วินาที</option>`).join('')}</select>
          <button type="button" class="btn sm" data-pres="full" title="เต็มจอ (F)">⛶ เต็มจอ</button>
          <button type="button" class="btn sm" data-pres="exit" title="ออก (Esc)">✕ ออก</button>
        </div>
      </footer>
      <div class="pres-progress"><i style="animation-duration:${state.seconds}s"></i></div>
    </div>`;
    if (s.draw) s.draw();
    clearTimeout(tRotate);
    if (state.playing) tRotate = setTimeout(() => go(state.slide + 1), state.seconds * 1000);
  }
})();
