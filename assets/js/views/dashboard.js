/* dashboard.js — the department at a glance, told in charts: a row of headline numbers, then the charts of each section.
   Every chart's rows are also there as a table behind "ดูเป็นตาราง" (exact figures, keyboard and screen-reader friendly).
   Charts show counts to everyone; bid money only in the tiles and tooltips of those who may see it. */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  // Cost overrun filter: active | closed | all
  const state = U.keep('dashboard', { overrun: 'active' }, ['overrun']);

  const chartCard = (id, title, sub) => `<div class="card"><div class="card-h"><h2>${esc(title)}</h2><p>${esc(sub)}</p></div><div class="card-b"><div class="chart" id="${id}"></div></div></div>`;
  const tableBox = (title, html, id) => `<details class="dash-table"><summary>ดูเป็นตาราง — ${esc(title)}</summary><div class="card-b flush table-wrap"${id ? ` id="${id}"` : ''}>${html}</div></details>`;

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
    // bids still to be handed in: overdue, or due within two weeks — what someone can act on today
    const dueList = PM.bidsDueSoon(db.bids, T);
    const dueTable = dueList.length ? `<table class="tbl"><thead><tr><th>งาน</th><th>ลูกค้า</th><th>Type</th><th>Priority</th><th>กำหนดยื่น</th><th class="num">Progress</th><th>Status</th></tr></thead><tbody>
      ${dueList.slice(0, 10).map((b) => { const p = PM.propOf(b), st = PM.propStatusInfo(p.status), lv = (PM.PROP_PRIORITY.find((x) => x.key === p.priority) || {}).level; return `<tr class="click" data-bid-link>
        <td><span class="title">${esc(PM.dash(b.name))}</span><small>${esc(PM.dash(b.code))}</small></td><td>${esc(PM.dash(b.client))}</td><td>${esc(p.type)}</td><td>${lv ? U.badge(lv, p.priority) : '-'}</td>
        <td class="nowrap">${V.dueBadge(b)}<small>${U.date(b.dueDate)}</small></td><td class="num">${U.num(p.progress)}%</td><td>${U.badge(st.level, st.label)}</td></tr>`; }).join('')}
      </tbody></table>${dueList.length > 10 ? `<p class="muted dash-more">และอีก ${dueList.length - 10} งาน · <a href="#/bidding/proposal">เปิดหน้า Proposal →</a></p>` : ''}` : '<p class="empty">ไม่มีงานที่ต้องยื่นใน 14 วัน</p>';

    const overrun = PM.costOverrunRows(db.projects.map((p) => (p.status === 'closed' ? { p, m: PM.projectMetrics(p) } : rows.find((r) => r.p === p))));

    const seesResources = PM.can('resource.view'); // section 4: Admin · Department Manager · Project Manager only
    const fin = PM.seesProjectFinance(); // contract value · plan cost · actual cost: Admin · Dept Manager · PM · Engineer
    // "ต้องดำเนินการวันนี้": one bar with the counts and the most urgent items — the full list is the bell (notify.js)
    const nt = PM.notify ? PM.notify.list() : [];
    const nBy = (lv) => nt.filter((x) => x.level === lv).length;
    const top = nt.filter((x) => x.level === 'critical').slice(0, 3);
    el.innerHTML = `
      <div class="row dash-tools"><span class="muted">ข้อมูลทุกส่วน ณ ${U.date(T)}</span><span class="spacer"></span>
        ${fin ? '<button class="btn" data-action="dash-report" title="รายงานภาพรวมแผนกขนาด A4 — พิมพ์ หรือบันทึกเป็น PDF">📄 พิมพ์รายงาน PDF</button>' : ''}</div>
      <button type="button" class="att-bar${nBy('critical') ? ' crit' : ''}" data-open-bell title="เปิดรายการทั้งหมดที่กระดิ่ง">
        <span class="att-bar-h"><b>ต้องดำเนินการวันนี้</b>${nt.length
          ? `${nBy('critical') ? U.badge('critical', `ด่วน ${nBy('critical')}`) : ''}${nBy('warning') ? U.badge('warning', `ติดตาม ${nBy('warning')}`) : ''}${nBy('info') ? U.badge('info', `แจ้งให้ทราบ ${nBy('info')}`) : ''}`
          : U.badge('good', 'เรียบร้อย — ไม่มีเรื่องค้าง')}</span>
        ${top.length ? `<span class="att-bar-top">${top.map((x) => `<span>${esc(x.title)}<small class="muted"> · ${esc(String(x.sub || '').split(' · ')[0])}</small></span>`).join('')}${nt.length > top.length ? `<span class="muted">และอีก ${nt.length - top.length} เรื่อง</span>` : ''}</span>` : ''}
        <span class="att-bar-go">ดูทั้งหมด 🔔 →</span>
      </button>
      <nav class="sec-nav" aria-label="ไปยังส่วนของ Dashboard">
        <a href="#/dashboard" data-jump="#sec-bid"><span class="idx">1</span>Bidding</a>
        <a href="#/dashboard" data-jump="#sec-exec"><span class="idx">2</span>Execution · ต้นทุน</a>
        <a href="#/dashboard" data-jump="#sec-po"><span class="idx">3</span>Purchase Orders</a>
        ${seesResources ? '<a href="#/dashboard" data-jump="#sec-res"><span class="idx">4</span>Resource</a>' : ''}
      </nav>

      <div class="section-h" id="sec-bid"><span class="idx">1</span><h2>Bidding Performance</h2><p>Before Award · 12 เดือนล่าสุด</p><span class="spacer"></span><a href="#/bidding">เปิด Bidding →</a></div>
      <div class="grid cols-4">
        ${V.tile({ label: 'Inquiries', tag: 'Quantity', value: bs.total, sub: `ยื่นใบเสนอราคาแล้ว ${bs.submitted} งาน` })}
        ${V.tile({ label: 'Win rate', value: U.pct(bs.winRate), sub: PM.myRole() === 'admin' ? `by value ${U.pct(bs.winRateValue)} · won ${U.money(bs.wonValue)}` : `${bs.won} won / ${bs.won + bs.lost} decided` })}
        ${V.tile({ label: 'On-time submission', tag: 'Time', value: U.pct(bs.onTimeRate), sub: U.badge(bs.onTimeRate >= 0.9 ? 'good' : bs.onTimeRate >= 0.75 ? 'warning' : 'critical', 'target 90%') })}
        ${PM.seesBidPrices()
          ? V.tile({ label: 'Pipeline (pending)', value: V.bidSum(allPending), sub: `${allPending.length} bids in progress${PM.myRole() === 'sales' ? ' · มูลค่าเฉพาะงานของคุณ' : ''}` })
          : V.tile({ label: 'Pipeline (pending)', value: allPending.length, sub: 'bids in progress', icon: 'funnel' })}
      </div>
      <div class="grid cols-2">
        ${chartCard('c-stages', 'งานประมูลในแต่ละขั้นตอนตอนนี้', 'จำนวนงานที่ยังไม่รู้ผล · คลิกแถบเพื่อเปิดขั้นนั้น')}
        ${chartCard('c-inq', 'Inquiries per month', 'จำนวนงานที่เข้ามาแต่ละเดือน แยกตามผล')}
        ${chartCard('c-stage', 'Average days in each stage', 'ระยะเวลาเฉลี่ยของแต่ละขั้นตอน')}
        ${chartCard('c-prop-status', 'สถานะ Proposal', 'ทุกงานตาม Proposal Status List · คลิกแถบเพื่อเปิดหน้า Proposal')}
      </div>
      <div class="card"><div class="card-h"><h2>งานที่ใกล้ถึงกำหนดยื่น</h2><p>เลยกำหนด หรือต้องยื่นใน 14 วัน · ยังไม่เสร็จ · ${dueList.length} งาน · คลิกแถวเพื่อเปิดหน้า Proposal</p></div>
        <div class="card-b flush table-wrap">${dueTable}</div></div>

      <div class="section-h" id="sec-exec"><span class="idx">2</span><h2>Execution (EPC)</h2><p>KPI: Quantity · Time · Cost · Quality (NCR) · Safety</p><span class="spacer"></span><a href="#/projects">เปิด Projects →</a></div>
      <div class="grid cols-6">
        ${V.tile({ label: 'Active projects', value: active.length, sub: fin ? `Backlog ${U.money(PM.sum(rows, (r) => r.p.contractValue * (1 - r.m.act)))}` : `ปิดแล้ว ${db.projects.length - active.length} โครงการ` })}
        ${V.tile({ label: 'Portfolio SPI', tag: 'Time', value: U.ratio(pSPI), sub: U.badge(U.health(pSPI), U.healthLabel[U.health(pSPI)]), tip: 'SPI = EV / PV (Earned Value ÷ Planned Value)' })}
        ${V.tile({ label: 'Portfolio CPI', tag: 'Cost', value: U.ratio(pCPI), sub: U.badge(U.health(pCPI), U.healthLabel[U.health(pCPI)]), tip: 'CPI = EV / AC (Earned Value ÷ Actual Cost)' })}
        ${V.tile({ label: 'Quantity progress', tag: 'Quantity', value: U.pct(PM.sum(rows, (r) => r.m.act * r.p.contractValue) / (PM.sum(rows, (r) => r.p.contractValue) || 1)), sub: 'weighted by contract value' })}
        ${V.tile({ label: 'Open NCR', tag: 'Quality', value: openNcr, sub: openNcr ? U.badge(rows.some((r) => r.m.ncrCriticalOpen) ? 'critical' : 'warning', `${PM.sum(rows, (r) => r.m.ncrCriticalOpen)} critical`) : U.badge('good', 'None open') })}
        ${V.tile({ label: 'LTIFR (12m)', tag: 'Safety', value: U.num(ltifr, 2), sub: `${U.num(mh12)} man-hours · LTI ${lti12}`, tip: 'LTIFR = LTI × 1,000,000 / man-hours' })}
      </div>
      <div class="grid cols-2">
        ${chartCard('c-progress', 'ความคืบหน้าแต่ละโครงการ', 'แท่ง = ทำได้จริง · เส้นดำ = ตามแผน ณ วันนี้ · คลิกเพื่อเปิดโครงการ')}
        ${chartCard('c-health', 'สุขภาพโครงการ SPI × CPI', 'จุดละ 1 โครงการ · ขวาบน = ตามแผนและในงบ · ซ้ายล่างสีแดง = ช้าและเกินงบ ต้องดูก่อน · คลิกจุดเพื่อเปิดโครงการ')}
        ${fin ? `${chartCard('c-scurve', 'ต้นทุนสะสมทุกโครงการ Active', 'PV ตามแผน · EV มูลค่างานที่ทำได้ · AC จ่ายจริง')}
        ${chartCard('c-spend', 'ค่าใช้จ่ายรายเดือน', 'ผลรวมรายการค่าใช้จ่ายทุกโครงการ 12 เดือน แยกตาม phase')}
        ${chartCard('c-actual', 'Actual cost เทียบ Plan cost', 'โครงการ Active · เส้นดำ = Plan cost (งบ) · คลิกเพื่อเปิดค่าใช้จ่าย')}
        <div class="card" id="d-overrun">${overrunCard(overrun)}</div>` : ''}
        ${chartCard('c-ncr', 'NCR ของแต่ละโครงการ', 'เปิดอยู่ / ปิดแล้ว')}
        ${chartCard('c-safety', 'เหตุการณ์ความปลอดภัยต่อเดือน', 'ทุกโครงการ 12 เดือน · สีเข้มขึ้น = รุนแรงขึ้น')}
      </div>
      ${tableBox('สถานะโครงการ', projectTable(rows))}
      ${fin ? `<div id="d-overrun-table">${tableBox('ต้นทุนเกินงบ', overrunTable(overrunList(overrun)))}</div>` : ''}

      <div class="section-h" id="sec-po"><span class="idx">3</span><h2>Purchase Orders</h2><p>ติดตาม PO ทุกโครงการ · ส่งของ · การจ่ายเงิน</p><span class="spacer"></span><a href="#/pos">เปิด Purchase Orders →</a></div>
      ${PM.poTiles(po)}
      <div class="grid cols-2">
        ${chartCard('c-po-proj', 'มูลค่า PO ตามโครงการ', fin ? 'สั่งแล้ว (Committed) · เส้นดำ = Plan cost' : 'สั่งแล้ว (Committed)')}
        ${chartCard('c-po-due', 'มูลค่า PO ที่รอส่งของ', 'PO ที่ยังส่งไม่ครบ ตามเดือนที่กำหนดส่ง')}
        ${chartCard('c-po-status', 'สถานะ PO', 'จำนวน PO ทุกโครงการ ไม่รวมที่ยกเลิก')}
        ${chartCard('c-po-supplier', 'ผู้ขายรายใหญ่', 'มูลค่า PO ที่สั่งแล้ว 6 อันดับแรก')}
      </div>
      ${tableBox('PO ที่ต้องติดตาม (เลยกำหนด / ต้องส่งใน 14 วัน)', PM.poTable(poWatch, { compact: true, empty: 'ไม่มี PO ที่ต้องติดตาม' }), 'd-po-watch')}

      ${seesResources ? `<div class="section-h" id="sec-res"><span class="idx">4</span><h2>Resource Utilization</h2><p>4 สัปดาห์ล่าสุด · Level & Timesheet</p><span class="spacer"></span><a href="#/resources">เปิด Resources →</a></div>
      <div class="grid cols-5">
        ${V.tile({ label: 'Weekly Plan สัปดาห์นี้', tag: 'PPC', value: U.pct(wp.ppc), sub: wp.total ? `${wp.done}/${wp.total} งานเสร็จ · <a href="#/weekly">เปิด Weekly Plan →</a>` : '<a href="#/weekly">ยังไม่มีแผน — วางแผนงาน →</a>' })}
        ${V.tile({ label: 'Utilization', value: U.pct(ut.total.util), sub: 'Billable ÷ Available hours' })}
        ${V.tile({ label: 'Billable hours', value: U.num(ut.total.billable), sub: `Project ${U.num(ut.total.project)} · Bidding ${U.num(ut.total.bid)}` })}
        ${V.tile({ label: 'Over / under allocated', value: `${over} <small>/ ${under}</small>`, sub: `${over ? U.badge('critical', over + ' over 105%') : U.badge('good', 'no overload')}` })}
        ${V.tile({ label: 'Timesheet completeness', value: U.pct(ut.total.capacity ? ut.total.logged / ut.total.capacity : null), sub: `ขาด ${U.num(ut.total.missing)} ชม. จาก capacity`, tip: 'Logged hours ÷ capacity hours' })}
      </div>
      <div class="grid cols-2">
        ${chartCard('c-level', 'Utilization by level', 'เส้นดำ = Target ของแต่ละ level')}
        ${chartCard('c-hours', 'Hours by category', 'ชั่วโมงจาก Timesheet แยกตามประเภท (4 สัปดาห์)')}
        ${chartCard('c-ppc', 'PPC — 8 สัปดาห์ล่าสุด', 'งานที่เสร็จ ÷ งานในแผน · เป้า ≥ 80%')}
        ${chartCard('c-people', 'ภาระงานสูงสุด 8 คน', 'Utilization 4 สัปดาห์ · เส้นดำ = เป้า · สีแดง = เกิน 105%')}
      </div>` : ''}`;

    el.onclick = (e) => {
      if (e.target.closest('[data-action="dash-report"]')) { PM.dashboardReport(); return; } // report.js
      if (e.target.closest('[data-open-bell]')) { e.stopPropagation(); if (PM.notify) PM.notify.open(); return; } // stop: the page click would close it again
      const seg = e.target.closest('[data-seg="overrun"]');
      if (seg) {
        state.overrun = seg.dataset.val;
        el.querySelector('#d-overrun').innerHTML = overrunCard(overrun);
        el.querySelector('#d-overrun-table').innerHTML = tableBox('ต้นทุนเกินงบ', overrunTable(overrunList(overrun)));
        drawOverrun(el, overrun);
        return;
      }
      const bar = e.target.closest('.hbar[data-href]');
      if (bar) { location.hash = bar.dataset.href; return; }
      if (e.target.closest('tr[data-bid-link]') && !e.target.closest('a')) { location.hash = '#/bidding/proposal'; return; }
      const poRow = e.target.closest('tr[data-po]');
      if (poRow) { PM.poForm(PM.find('pos', poRow.dataset.po), null, () => PM.views.dashboard(el)); return; }
      const tr = e.target.closest('tr[data-id]');
      if (tr) location.hash = '#/projects/' + tr.dataset.id;
    };

    /* ---------- 1 · bidding ---------- */
    const months = PM.months(PM.addDays(T, -334).slice(0, 7), T.slice(0, 7));
    const inMonth = (fn) => months.map((m) => db.bids.filter((b) => b.dates.inquiry.slice(0, 7) === m && fn(b)).length);
    PM.charts.hbars(document.getElementById('c-stages'), {
      items: PM.BID_STAGES.map((s, i) => {
        const inStage = allPending.filter((b) => b.stage === s.key), money = V.bidSum(inStage);
        return { label: s.label, sub: s.th, value: inStage.length, display: `${inStage.length} งาน`, href: '#/bidding/' + s.key, tip: `${s.label}: ${inStage.length} งาน${money ? ` · ${money}` : ''}\nเฉลี่ยในขั้นนี้ ${U.days(bs.stageDays[i].avg)}` };
      }).concat([{ label: 'Award', sub: 'ชนะ 12 เดือน', value: bs.won, display: `${bs.won} งาน`, href: '#/bidding/award', tip: `ชนะ ${bs.won} จาก ${bs.won + bs.lost} งานที่ประกาศผล\nWin rate ${U.pct(bs.winRate)}` }]),
    });
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
    const propSum = PM.proposalSummary(PM.proposalList());
    const STATUS_COLOR = { good: 'var(--good)', warning: 'var(--warning)', critical: 'var(--critical)', neutral: 'var(--s-neutral)' };
    PM.charts.hbars(document.getElementById('c-prop-status'), {
      items: propSum.status.map((s) => ({ label: s.label, value: s.n, display: `${s.n} งาน`, sub: propSum.total ? U.pct(s.n / propSum.total) : '', color: STATUS_COLOR[s.level], href: '#/bidding/proposal', tip: `${s.label}: ${s.n} จาก ${propSum.total} งาน` })),
    });

    /* ---------- 2 · execution & cost ---------- */
    PM.charts.hbars(document.getElementById('c-progress'), {
      max: 1,
      items: rows.map((r) => ({
        label: r.p.code, sub: r.m.current ? U.phaseLabel(r.m.current.key) : '–', value: r.m.act, target: r.m.plan, display: U.pct(r.m.act), href: '#/projects/' + r.p.id,
        tip: `${r.p.code} ${r.p.name}\nจริง ${U.pct(r.m.act)} · แผน ${U.pct(r.m.plan)}\nSPI ${U.ratio(r.m.spi)} · CPI ${U.ratio(r.m.cpi)}`,
      })),
    });
    PM.charts.quadrant(document.getElementById('c-health'), Object.assign(PM.healthQuadrant(rows), { height: 280 }));
    if (fin) drawCostCharts();
    function drawCostCharts() {
    drawPortfolioCurve(rows, T);
    const spend = (db.costs || []).filter((c) => c.date.slice(0, 7) >= months[0] && c.date <= T && PM.costCounts(c));
    PM.charts.columns(document.getElementById('c-spend'), {
      categories: months.map(U.month), fmt: U.money, axisFmt: U.money, label: 'Monthly spend',
      series: PM.PHASES.map((ph, i) => ({ name: ph.label, color: `var(--s${i + 1})`, values: months.map((ym) => PM.sum(spend.filter((c) => c.phase === ph.key && c.date.slice(0, 7) === ym), (c) => Number(c.amount) || 0)) })),
    });
    PM.charts.hbars(document.getElementById('c-actual'), {
      items: rows.map((r) => ({
        label: r.p.code, sub: `${U.pct(r.m.bac ? r.m.ac / r.m.bac : null)} ของงบ`, value: r.m.ac, target: r.m.bac, display: U.money(r.m.ac), href: `#/projects/${r.p.id}/cost`,
        color: r.m.ac > r.m.bac ? 'var(--critical)' : 'var(--s1)',
        tip: `${r.p.code} ${r.p.name}\nActual cost ${U.money(r.m.ac)}\nPlan cost ${U.money(r.m.bac)}\nEarned value ${U.money(r.m.ev)} · CPI ${U.ratio(r.m.cpi)}`,
      })),
    });
    drawOverrun(el, overrun);
    }
    if (rows.length) PM.charts.columns(document.getElementById('c-ncr'), {
      categories: rows.map((r) => r.p.code), label: 'NCR by project',
      series: [
        { name: 'เปิดอยู่ (วิกฤต)', color: 'var(--critical)', values: rows.map((r) => r.m.ncrCriticalOpen) },
        { name: 'เปิดอยู่', color: 'var(--s2)', values: rows.map((r) => r.m.ncrOpen - r.m.ncrCriticalOpen) },
        { name: 'ปิดแล้ว', color: 'var(--s-neutral)', values: rows.map((r) => r.m.ncrTotal - r.m.ncrOpen) },
      ],
    }); else document.getElementById('c-ncr').innerHTML = '<p class="empty">ยังไม่มีโครงการ</p>';
    const sumBy = (k) => months.map((ym) => PM.sum(saf12.filter((s) => s.month === ym), (s) => s[k] || 0));
    PM.charts.columns(document.getElementById('c-safety'), {
      categories: months.map(U.month), label: 'Safety incidents',
      series: [
        { name: 'Near miss', color: 'var(--seq-3)', values: sumBy('nearMiss') }, { name: 'First aid', color: 'var(--seq-4)', values: sumBy('firstAid') },
        { name: 'Recordable', color: 'var(--seq-5)', values: sumBy('recordable') }, { name: 'LTI', color: 'var(--seq-6)', values: sumBy('lti') },
      ],
    });

    /* ---------- 3 · purchase orders ---------- */
    const committed = (db.pos || []).filter(PM.poIsCommitted);
    PM.charts.hbars(document.getElementById('c-po-proj'), {
      items: rows.map((r) => {
        const v = PM.sum(committed.filter((x) => x.projectId === r.p.id), (x) => x.amount || 0);
        if (!fin) return { label: r.p.code, value: v, display: U.money(v), href: `#/projects/${r.p.id}/po`, tip: `${r.p.code} ${r.p.name}\nPO committed ${U.money(v)}` };
        return { label: r.p.code, sub: U.pct(r.m.bac ? v / r.m.bac : null) + ' ของแผน', value: v, target: r.m.bac, display: U.money(v), href: `#/projects/${r.p.id}/po`,
          tip: `${r.p.code} ${r.p.name}\nPO committed ${U.money(v)}\nPlan cost ${U.money(r.m.bac)}` };
      }),
    });
    const waiting = committed.filter((x) => !x.deliveredDate && x.deliveryDue && x.status !== 'delivered' && x.status !== 'closed');
    const dueMonths = PM.months(T.slice(0, 7), PM.addDays(T, 150).slice(0, 7));
    const lateValue = PM.sum(waiting.filter((x) => x.deliveryDue < T), (x) => x.amount || 0);
    PM.charts.columns(document.getElementById('c-po-due'), {
      categories: ['เลยกำหนด'].concat(dueMonths.map(U.month)), fmt: U.money, axisFmt: U.money, label: 'PO value waiting for delivery',
      series: [
        { name: 'เลยกำหนดส่ง', color: 'var(--critical)', values: [lateValue].concat(dueMonths.map(() => 0)) },
        { name: 'ต้องส่ง', color: 'var(--s1)', values: [0].concat(dueMonths.map((ym) => PM.sum(waiting.filter((x) => x.deliveryDue >= T && x.deliveryDue.slice(0, 7) === ym), (x) => x.amount || 0))) },
      ],
    });
    // ordered steps from draft to closed: one hue, darker = further along
    const stepColor = ['var(--s-neutral)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)', 'var(--seq-6)'];
    const steps = PM.PO_STATUS.filter((s) => s.key !== 'cancelled').slice(0, 6);
    PM.charts.share(document.getElementById('c-po-status'), {
      label: 'PO status', fmt: (v) => `${U.num(v)} ใบ`, totalLabel: 'รวม',
      segments: steps.map((s, i) => ({ name: s.th, color: stepColor[i], value: (db.pos || []).filter((x) => x.status === s.key).length })),
    });
    const bySupplier = {};
    committed.forEach((x) => { bySupplier[x.supplier] = (bySupplier[x.supplier] || 0) + (x.amount || 0); });
    PM.charts.hbars(document.getElementById('c-po-supplier'), {
      items: Object.keys(bySupplier).sort((a, b) => bySupplier[b] - bySupplier[a]).slice(0, 6).map((k) => ({ label: k, value: bySupplier[k], display: U.money(bySupplier[k]) })),
    });

    if (!seesResources) return;
    /* ---------- 4 · resource ---------- */
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
    const weeks = Array.from({ length: 8 }, (_, i) => PM.addDays(PM.monday(T), (i - 7) * 7));
    const ppc = weeks.map((w) => { const s = PM.planStats((db.plans || []).filter((x) => x.week === w)); return s.total && s.ppc != null ? Math.round(s.ppc * 100) : null; });
    PM.charts.lines(document.getElementById('c-ppc'), {
      labels: weeks.map((w) => `${w.slice(8)}/${w.slice(5, 7)}`), tipTitle: weeks.map((w) => `สัปดาห์ ${U.date(w)}`), yMax: 100, height: 230, ref: { value: 80, label: 'เป้า 80%' },
      fmt: (v) => v + '%', axisFmt: (v) => v + '%', label: 'PPC by week',
      series: [{ name: 'PPC', color: 'var(--s1)', values: ppc }],
    });
    PM.charts.hbars(document.getElementById('c-people'), {
      max: 1.2,
      items: ut.people.filter((x) => x.util != null).sort((a, b) => b.util - a.util).slice(0, 8).map((x) => ({
        label: x.r.name, sub: PM.levelName(x.r.level), value: x.util, target: x.target, display: U.pct(x.util), color: x.util > 1.05 ? 'var(--critical)' : 'var(--s1)',
        tip: `${x.r.name}\nUtilization ${U.pct(x.util)} · เป้า ${U.pct(x.target)}`,
      })),
    });
  };

  /* every active project's cumulative PV / EV / AC added up, month by month (a project holds its last value after it ends) */
  function drawPortfolioCurve(rows, T) {
    const box = document.getElementById('c-scurve');
    const curves = rows.map((r) => PM.costCurve(r.p, PM.projectCosts(r.p.id)));
    const yms = curves.flatMap((c) => c.months).sort();
    if (!yms.length) { box.innerHTML = '<p class="empty">ยังไม่มีโครงการ</p>'; return; }
    const months = PM.months(yms[0], yms[yms.length - 1]);
    const now = T.slice(0, 7);
    const at = (c, ym, k) => {
      const hit = c.rows.find((x) => x.ym === ym);
      if (hit && hit[k] != null) return hit[k];
      if (ym < c.months[0]) return 0;
      const known = c.rows.filter((x) => x[k] != null);
      return known.length ? known[known.length - 1][k] : 0;
    };
    const line = (k, future) => months.map((ym) => (!future && ym > now ? null : PM.sum(curves, (c) => at(c, ym, k))));
    PM.charts.lines(box, {
      labels: months.map(U.month), marker: months.indexOf(now), markerLabel: 'วันนี้', fmt: U.money, axisFmt: U.money, height: 230, label: 'Cumulative cost, all active projects',
      series: [{ name: 'PV ตามแผน', color: 'var(--s1)', dash: true, values: line('pv', true) }, { name: 'EV ทำได้', color: 'var(--s3)', values: line('ev') }, { name: 'AC จ่ายจริง', color: 'var(--s2)', values: line('ac') }],
    });
  }

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

  /* Cost overrun — which projects are already over Plan cost, and which are heading there (rows from PM.costOverrunRows) */
  const OVERRUN_VIEW = {
    active: 'โครงการ Active',
    closed: 'โครงการ Closed · ใช้ต้นทุนจริงสุดท้าย',
    all: 'ทุกโครงการ · โครงการ Closed ใช้ต้นทุนจริงสุดท้าย',
  };
  function overrunList(all) {
    if (!OVERRUN_VIEW[state.overrun]) state.overrun = 'active';
    return state.overrun === 'all' ? all : all.filter((r) => r.o.closed === (state.overrun === 'closed'));
  }
  function overrunCard(all) {
    const list = overrunList(all), nClosed = all.filter((r) => r.o.closed).length;
    return `<div class="card-h"><h2>Cost Project Overrun</h2>${overrunChips(list)}<span class="spacer"></span>
        ${V.seg('overrun', [{ key: 'active', label: `Active (${all.length - nClosed})` }, { key: 'closed', label: `Closed (${nClosed})` }, { key: 'all', label: `All (${all.length})` }], state.overrun)}
        <p>${OVERRUN_VIEW[state.overrun]} · ส่วนต่างจากงบตอนจบโครงการ (EAC − Plan cost) · คลิกเพื่อเปิดโครงการ</p></div>
      <div class="card-b"><div class="chart" id="c-overrun"></div></div>`;
  }
  /* above / below budget at the end of each project, worst first */
  function drawOverrun(el, all) {
    const box = el.querySelector('#c-overrun');
    const list = overrunList(all).filter((r) => r.o.status !== 'nobudget').sort((a, b) => b.o.forecast - a.o.forecast);
    if (!list.length) { box.innerHTML = '<p class="empty">ไม่มีโครงการในมุมมองนี้</p>'; return; }
    PM.charts.diverging(box, {
      neg: { label: 'ต่ำกว่างบ', color: 'var(--s1)' }, pos: { label: 'เกินงบ', color: 'var(--s2)' },
      items: list.map(({ p, m, o }) => ({
        label: p.code, sub: PM.COST_OVERRUN[o.status].label, value: o.forecast, display: `${o.forecast > 0 ? '+' : '−'}${U.money(Math.abs(o.forecast))}`, href: '#/projects/' + p.id,
        tip: `${p.code} ${p.name}\nPlan cost ${U.money(m.bac)} · ใช้ไป ${U.money(m.ac)} (${U.pct(o.used)})\n${o.closed ? 'ต้นทุนสุดท้าย' : 'EAC'} ${U.money(o.eac)}`,
      })),
    });
  }

  function overrunChips(list) {
    const n = (s, closed) => list.filter((r) => r.o.status === s && (closed == null || r.o.closed === closed)).length;
    const closedOver = n('over', true);
    return `${U.badge(n('over') ? 'critical' : 'good', `เกินงบแล้ว ${n('over')}${closedOver ? ` (Closed ${closedOver})` : ''}`)} ${U.badge(n('forecast') ? 'warning' : 'good', `คาดว่าจะเกิน ${n('forecast')}`)}`;
  }

  function overrunTable(list) {
    if (!list.length) return '<p class="empty">ไม่มีโครงการในมุมมองนี้</p>';
    return `<table class="tbl"><thead><tr>
      <th>Project</th><th>สถานะงบ</th><th class="num">Plan cost</th><th class="num">Actual cost</th><th class="num">งานเสร็จ</th>
      <th class="num">CPI</th><th class="num">EAC</th><th class="num">เกินงบแล้ว</th><th class="num">คาดว่าจะเกิน / เหลือ ตอนจบ</th></tr></thead><tbody>
      ${list.map(({ p, m, o }) => {
        const s = PM.COST_OVERRUN[o.status];
        const fc = o.status === 'nobudget' ? '–' : `<span class="${o.forecast > 0 ? 'neg' : ''}">${o.forecast > 0 ? '+' : '−'}${U.money(Math.abs(o.forecast))}</span>`;
        const tip = o.closed ? `โครงการปิดแล้ว — ต้นทุนสุดท้าย ${U.money(m.ac)} − Plan cost ${U.money(m.bac)}\n+ = ปิดโครงการเกินงบ · − = ปิดโครงการต่ำกว่างบ`
          : `EAC ${U.money(m.eac)} − Plan cost ${U.money(m.bac)}\n+ = คาดว่าจะเกินงบเมื่อจบโครงการ · − = คาดว่าเหลืองบ`;
        return `<tr class="click" data-id="${esc(p.id)}">
          <td><span class="title">${esc(p.code)}${o.closed ? ' <span class="chip">Closed</span>' : ''}</span><small>${esc(p.name)}</small></td>
          <td>${U.badge(s.level, s.label)}</td>
          <td class="num">${U.money(m.bac)}</td>
          <td class="num"><span class="${o.status === 'over' ? 'neg' : ''}">${U.money(m.ac)}</span><small>${U.pct(o.used)} ของงบ</small></td>
          <td class="num">${U.pct(m.act)}</td>
          <td class="num"><span class="hm-${U.health(m.cpi)}">${U.ratio(m.cpi)}</span></td>
          <td class="num">${U.money(o.eac)}${o.closed ? '<small>ต้นทุนสุดท้าย</small>' : ''}</td>
          <td class="num">${o.amount > 0 ? `<span class="neg">+${U.money(o.amount)}</span>` : '–'}</td>
          <td class="num" data-tip="${esc(tip)}">${fc}</td></tr>`;
      }).join('')}</tbody></table>`;
  }
})();
