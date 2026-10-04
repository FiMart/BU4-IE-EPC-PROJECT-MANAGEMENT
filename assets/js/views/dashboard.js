/* dashboard.js — the three whiteboard sections on one page */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;

  PM.views.dashboard = function (el) {
    const db = PM.db, T = PM.today();
    const from12 = PM.addDays(T, -364);
    const bs = PM.bidStats(db.bids, from12, T);
    const allPending = db.bids.filter((b) => b.result === 'pending');

    const active = db.projects.filter((p) => p.status !== 'closed');
    const rows = active.map((p) => ({ p, m: PM.projectMetrics(p) }));
    const sEV = PM.sum(rows, (r) => r.m.ev), sPV = PM.sum(rows, (r) => r.m.pv), sAC = PM.sum(rows, (r) => r.m.ac);
    const pSPI = sPV ? sEV / sPV : null, pCPI = sAC ? sEV / sAC : null;
    const openNcr = PM.sum(rows, (r) => r.m.ncrOpen);
    const saf12 = db.safety.filter((s) => s.month >= from12.slice(0, 7));
    const mh12 = PM.sum(saf12, (s) => s.manhours), lti12 = PM.sum(saf12, (s) => s.lti);
    const ltifr = mh12 ? (lti12 * 1e6) / mh12 : 0;

    const ut = PM.utilization(PM.addDays(T, -27), T);
    const wp = PM.planStats((db.plans || []).filter((p) => p.week === PM.monday(T)));
    const po = PM.poStats(db.pos || [], T);
    const poWatch = po.late.concat(po.soon)
      .sort((a, b) => (PM.poDaysLate(b, T) - PM.poDaysLate(a, T)) || String(a.deliveryDue).localeCompare(String(b.deliveryDue)))
      .slice(0, 8);
    const over = ut.people.filter((p) => p.util > 1.05).length;
    const under = ut.people.filter((p) => p.util != null && p.util < p.target - 0.25).length;

    const phaseCount = {};
    PM.PHASES.forEach((ph) => (phaseCount[ph.key] = rows.filter((r) => r.m.current && r.m.current.key === ph.key)));

    const seesResources = PM.can('resource.view'); // section 4: Admin · Department Manager · Project Manager only
    el.innerHTML = `
      <div class="section-h"><span class="idx">1</span><h2>Bidding Performance</h2><p>Before Award · 12 เดือนล่าสุด</p><span class="spacer"></span><a href="#/bidding">เปิด Bidding →</a></div>
      ${V.flow(PM.BID_STAGES.map((s, i) => {
        const inStage = allPending.filter((b) => b.stage === s.key);
        const sd = bs.stageDays[i];
        return { label: s.label, th: s.th, big: `${inStage.length} <small class="muted" style="font-size:12px">งาน</small>`, meta: `${V.bidSum(inStage) ? V.bidSum(inStage) + ' · ' : ''}avg ${U.days(sd.avg)}`, href: '#/bidding/' + s.key,
          tip: `${s.label}: ${inStage.length} bids in stage now\nAvg time in stage (12m): ${U.days(sd.avg)}` };
      }).concat([{ n: '→', label: 'Award', th: 'ผลการประมูล 12 เดือน', big: `${bs.won} <small class="muted" style="font-size:12px">won / ${bs.won + bs.lost}</small>`, meta: `Win rate ${U.pct(bs.winRate)}`, href: '#/bidding/award' }]))}
      <div class="grid cols-6">
        ${V.tile({ label: 'Inquiries', tag: 'Quantity', value: bs.total, sub: `ยื่นใบเสนอราคาแล้ว ${bs.submitted} งาน` })}
        ${V.tile({ label: 'BOQ items estimated', tag: 'Quantity', value: U.num(PM.sum(bs.list.filter((b) => b.dates.estimate), (b) => b.boqItems)), sub: 'รายการที่ถอดปริมาณ' })}
        ${V.tile({ label: 'Avg cycle time', tag: 'Time', value: `${U.num(bs.avgCycle, 1)} <small>days</small>`, sub: 'Inquiry → Submit' })}
        ${V.tile({ label: 'On-time submission', tag: 'Time', value: U.pct(bs.onTimeRate), sub: U.badge(bs.onTimeRate >= 0.9 ? 'good' : bs.onTimeRate >= 0.75 ? 'warning' : 'critical', 'target 90%') })}
        ${V.tile({ label: 'Win rate', value: U.pct(bs.winRate), sub: PM.myRole() === 'admin' ? `by value ${U.pct(bs.winRateValue)} · won ${U.money(bs.wonValue)}` : `${bs.won} won / ${bs.won + bs.lost} decided` })}
        ${PM.seesBidPrices()
          ? V.tile({ label: 'Pipeline (pending)', value: V.bidSum(allPending), sub: `${allPending.length} bids in progress${PM.myRole() === 'sales' ? ' · มูลค่าเฉพาะงานของคุณ' : ''}` })
          : V.tile({ label: 'Pipeline (pending)', value: allPending.length, sub: 'bids in progress · มูลค่าเห็นได้เฉพาะ Sales / Admin', icon: 'funnel' })}
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>Inquiries per month</h2><p>Quantity — จำนวนงานที่เข้ามาแต่ละเดือน แยกตามผล</p></div><div class="card-b"><div class="chart" id="c-inq"></div></div></div>
        <div class="card"><div class="card-h"><h2>Average days in each stage</h2><p>Time — ระยะเวลาเฉลี่ยของแต่ละขั้นตอน</p></div><div class="card-b"><div class="chart" id="c-stage"></div></div></div>
      </div>
      <div class="card"><div class="card-h"><h2>ผลงาน Sales</h2><p>Inquiry ที่หามาได้ 12 เดือน · Win rate · Pipeline · โครงการที่รับผิดชอบ</p></div>
        <div class="card-b flush table-wrap" id="d-sales">${V.salesTable(PM.salesStats(from12, T))}</div></div>

      <div class="section-h"><span class="idx">2</span><h2>Execution (EPC)</h2><p>KPI: Quantity · Time · Cost · Quality (NCR) · Safety</p><span class="spacer"></span><a href="#/projects">เปิด Projects →</a></div>
      ${V.flow(PM.PHASES.map((ph) => ({
        label: ph.label, th: ph.th, big: `${phaseCount[ph.key].length} <small class="muted" style="font-size:12px">โครงการ</small>`,
        meta: phaseCount[ph.key].map((r) => esc(r.p.code)).join(', ') || '—', href: '#/projects',
      })))}
      <div class="grid cols-6">
        ${V.tile({ label: 'Active projects', value: active.length, sub: `Backlog ${U.money(PM.sum(rows, (r) => r.p.contractValue * (1 - r.m.act)))}` })}
        ${V.tile({ label: 'Portfolio SPI', tag: 'Time', value: U.ratio(pSPI), sub: U.badge(U.health(pSPI), U.healthLabel[U.health(pSPI)]), tip: 'SPI = EV / PV (Earned Value ÷ Planned Value)' })}
        ${V.tile({ label: 'Portfolio CPI', tag: 'Cost', value: U.ratio(pCPI), sub: U.badge(U.health(pCPI), U.healthLabel[U.health(pCPI)]), tip: 'CPI = EV / AC (Earned Value ÷ Actual Cost)' })}
        ${V.tile({ label: 'Quantity progress', tag: 'Quantity', value: U.pct(PM.sum(rows, (r) => r.m.act * r.p.contractValue) / (PM.sum(rows, (r) => r.p.contractValue) || 1)), sub: 'weighted by contract value' })}
        ${V.tile({ label: 'Open NCR', tag: 'Quality', value: openNcr, sub: openNcr ? U.badge(rows.some((r) => r.m.ncrCriticalOpen) ? 'critical' : 'warning', `${PM.sum(rows, (r) => r.m.ncrCriticalOpen)} critical`) : U.badge('good', 'None open') })}
        ${V.tile({ label: 'LTIFR (12m)', tag: 'Safety', value: U.num(ltifr, 2), sub: `${U.num(mh12)} man-hours · LTI ${lti12}`, tip: 'LTIFR = LTI × 1,000,000 / man-hours' })}
      </div>
      <div class="card">
        <div class="card-h"><h2>Project status</h2><p>แท่ง = Actual progress, เส้นดำ = Planned progress ณ วันนี้</p></div>
        <div class="card-b flush table-wrap">${projectTable(rows)}</div>
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>ค่าใช้จ่ายรายเดือน</h2><p>Cost — ผลรวมรายการค่าใช้จ่ายทุกโครงการ 12 เดือน แยกตาม phase</p></div><div class="card-b"><div class="chart" id="c-spend"></div></div></div>
        <div class="card"><div class="card-h"><h2>Actual cost เทียบ Plan cost</h2><p>โครงการ Active · เส้นดำ = Plan cost (งบ)</p></div><div class="card-b"><div class="chart" id="c-actual"></div></div></div>
      </div>

      <div class="section-h"><span class="idx">3</span><h2>Purchase Orders</h2><p>ติดตาม PO ทุกโครงการ · ส่งของ · การจ่ายเงิน</p><span class="spacer"></span><a href="#/pos">เปิด Purchase Orders →</a></div>
      ${PM.poTiles(po)}
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>PO ที่ต้องติดตาม</h2><p>เลยกำหนดส่ง และที่ต้องส่งภายใน 14 วัน</p></div>
          <div class="card-b flush table-wrap" id="d-po-watch">${PM.poTable(poWatch, { compact: true, empty: 'ไม่มี PO ที่ต้องติดตาม' })}</div></div>
        <div class="card"><div class="card-h"><h2>มูลค่า PO ตามโครงการ</h2><p>สั่งแล้ว (Committed) เทียบ Plan cost</p></div><div class="card-b"><div class="chart" id="c-po-proj"></div></div></div>
      </div>

      ${seesResources ? `<div class="section-h"><span class="idx">4</span><h2>Resource Utilization</h2><p>4 สัปดาห์ล่าสุด · Level & Timesheet</p><span class="spacer"></span><a href="#/resources">เปิด Resources →</a></div>
      <div class="grid cols-5">
        ${V.tile({ label: 'Weekly Plan สัปดาห์นี้', tag: 'PPC', value: U.pct(wp.ppc), sub: wp.total ? `${wp.done}/${wp.total} งานเสร็จ · <a href="#/weekly">เปิด Weekly Plan →</a>` : '<a href="#/weekly">ยังไม่มีแผน — วางแผนงาน →</a>' })}
        ${V.tile({ label: 'Utilization', value: U.pct(ut.total.util), sub: 'Billable ÷ Available hours' })}
        ${V.tile({ label: 'Billable hours', value: U.num(ut.total.billable), sub: `Project ${U.num(ut.total.project)} · Bidding ${U.num(ut.total.bid)}` })}
        ${V.tile({ label: 'Over / under allocated', value: `${over} <small>/ ${under}</small>`, sub: `${over ? U.badge('critical', over + ' over 105%') : U.badge('good', 'no overload')}` })}
        ${V.tile({ label: 'Timesheet completeness', value: U.pct(ut.total.capacity ? ut.total.logged / ut.total.capacity : null), sub: `ขาด ${U.num(ut.total.missing)} ชม. จาก capacity`, tip: 'Logged hours ÷ capacity hours' })}
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>Utilization by level</h2><p>เส้นดำ = Target ของแต่ละ level</p></div><div class="card-b"><div class="chart" id="c-level"></div></div></div>
        <div class="card"><div class="card-h"><h2>Hours by category</h2><p>ชั่วโมงจาก Timesheet แยกตามประเภท (4 สัปดาห์)</p></div><div class="card-b"><div class="chart" id="c-hours"></div></div></div>
      </div>` : ''}`;

    V.bindFlowLinks(el);
    el.onclick = (e) => {
      if (e.target.closest('tr[data-sales]') && !e.target.closest('a')) { location.hash = '#/bidding'; return; }
      const poRow = e.target.closest('tr[data-po]');
      if (poRow) { PM.poForm(PM.find('pos', poRow.dataset.po), null, () => PM.views.dashboard(el)); return; }
      const tr = e.target.closest('tr[data-id]');
      if (tr) location.hash = '#/projects/' + tr.dataset.id;
    };

    /* charts */
    const months = PM.months(PM.addDays(T, -334).slice(0, 7), T.slice(0, 7));
    const inMonth = (fn) => months.map((m) => db.bids.filter((b) => b.dates.inquiry.slice(0, 7) === m && fn(b)).length);
    PM.charts.columns(document.getElementById('c-inq'), {
      categories: months.map(U.month), label: 'Inquiries per month',
      series: [
        { name: 'Won', color: 'var(--s1)', values: inMonth((b) => b.result === 'won') },
        { name: 'Lost / No-bid', color: 'var(--s2)', values: inMonth((b) => b.result === 'lost' || b.result === 'nobid') },
        { name: 'In progress', color: 'var(--s-neutral)', values: inMonth((b) => b.result === 'pending') }, // not decided yet → quiet gray
      ],
    });
    PM.charts.hbars(document.getElementById('c-stage'), {
      items: bs.stageDays.map((s) => ({ label: s.label, value: s.avg || 0, display: U.days(s.avg), tip: `${s.label}\nAvg ${U.days(s.avg)} (n=${s.n})` })),
    });
    const spend = (db.costs || []).filter((c) => c.date.slice(0, 7) >= months[0] && c.date <= T);
    PM.charts.columns(document.getElementById('c-spend'), {
      categories: months.map(U.month), fmt: U.money, axisFmt: U.money, label: 'Monthly spend',
      series: PM.PHASES.map((ph, i) => ({ name: ph.label, color: `var(--s${i + 1})`, values: months.map((ym) => PM.sum(spend.filter((c) => c.phase === ph.key && c.date.slice(0, 7) === ym), (c) => Number(c.amount) || 0)) })),
    });
    PM.charts.hbars(document.getElementById('c-actual'), {
      items: rows.map((r) => ({
        label: r.p.code, sub: `${U.pct(r.m.bac ? r.m.ac / r.m.bac : null)} ของงบ · งานเสร็จ ${U.pct(r.m.act)}`, value: r.m.ac, target: r.m.bac, display: U.money(r.m.ac),
        color: r.m.ac > r.m.bac ? 'var(--critical)' : 'var(--s2)',
        tip: `${r.p.code} ${r.p.name}\nActual cost ${U.money(r.m.ac)}\nPlan cost ${U.money(r.m.bac)}\nEarned value ${U.money(r.m.ev)} · CPI ${U.ratio(r.m.cpi)}`,
      })),
    });
    PM.charts.hbars(document.getElementById('c-po-proj'), {
      items: rows.map((r) => {
        const v = PM.sum((db.pos || []).filter((x) => x.projectId === r.p.id && PM.poIsCommitted(x)), (x) => x.amount || 0);
        return { label: r.p.code, sub: U.pct(r.m.bac ? v / r.m.bac : null) + ' ของแผน', value: v, target: r.m.bac, display: U.money(v), color: 'var(--s2)',
          tip: `${r.p.code} ${r.p.name}\nPO committed ${U.money(v)}\nPlan cost ${U.money(r.m.bac)}` };
      }),
    });
    if (!seesResources) return;
    PM.charts.hbars(document.getElementById('c-level'), {
      max: 1.2,
      items: ut.byLevel.map((l) => ({ label: l.level.name, sub: `${l.n} คน`, value: l.util || 0, target: l.target, display: U.pct(l.util), tip: `${l.level.name}\nUtilization ${U.pct(l.util)}\nTarget ${U.pct(l.target)}\nBillable ${U.num(l.billable)} / ${U.num(l.available)} h` })),
    });
    // where the hours went = part of a whole → one share bar (same colours as Resource → Weekly hours)
    PM.charts.share(document.getElementById('c-hours'), {
      label: 'Hours by category', fmt: (v) => U.num(v) + ' h', totalLabel: 'รวมชั่วโมงที่บันทึก',
      segments: [
        { name: 'Project (EPC)', value: ut.total.project, color: 'var(--s1)' },
        { name: 'Bidding', value: ut.total.bid, color: 'var(--s2)' },
        { name: 'Overhead', value: ut.total.overhead, color: 'var(--s3)' },
        { name: 'Leave', value: ut.total.leave, color: 'var(--s4)' },
      ],
    });
  };

  function projectTable(rows) {
    if (!rows.length) return '<p class="empty">ยังไม่มีโครงการ</p>';
    return `<table class="tbl"><thead><tr>
      <th>Project</th><th>Current phase</th><th style="min-width:160px">Progress</th>
      <th class="num">SPI</th><th class="num">CPI</th><th class="num">Open NCR</th><th class="num">LTI</th><th>Finish</th><th>Status</th></tr></thead><tbody>
      ${rows.map(({ p, m }) => {
        const h = U.worst(U.health(m.spi), U.health(m.cpi));
        return `<tr class="click" data-id="${esc(p.id)}">
          <td><span class="title">${esc(p.code)}</span><small>${esc(p.name)}</small></td>
          <td>${m.current ? `<span class="chip">${esc(U.phaseLabel(m.current.key))}</span>` : '–'}</td>
          <td><div class="pbar-wrap">${U.progress(m.act, m.plan)}<span class="num">${U.pct(m.act)}</span></div></td>
          <td class="num">${U.ratio(m.spi)}</td><td class="num">${U.ratio(m.cpi)}</td>
          <td class="num">${m.ncrOpen}</td><td class="num">${m.lti}</td>
          <td>${U.date(p.endDate)}</td>
          <td>${U.badge(h, U.healthLabel[h])}</td></tr>`;
      }).join('')}</tbody></table>`;
  }
  PM.common.projectTable = projectTable;
})();
