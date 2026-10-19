/* report.js — monthly project report: one click → a print-ready A4 page (browser "Save as PDF").
   Pulls together everything the system knows about the project as of today: summary + key messages, S-curve,
   phases, cost / EAC, VO, billing, cash flow, milestones, POs, NCR, safety, top risks, next month's plan, sign-off.
   Charts are drawn with the app's own chart code and copied in as SVG; the app's stylesheet gives them their colours. */
(function () {
  const U = PM.ui, esc = U.esc;
  const sm = (v) => (v < 0 ? '−' + U.money(-v) : U.money(v));

  /* draw a chart off-screen at a fixed width and return its markup */
  function chartHtml(draw, width) {
    const box = document.createElement('div');
    box.style.cssText = `position:fixed;left:-10000px;top:0;width:${width || 700}px`;
    document.body.appendChild(box);
    try {
      draw(box);
      // a printed chart needs no hover layers (tooltip hit areas, crosshair)
      box.querySelectorAll('.hit, .crosshair').forEach((x) => x.remove());
      return box.innerHTML;
    } catch (e) { return ''; } finally { box.remove(); }
  }

  PM.projectReport = function (p) {
    const win = window.open('', '_blank');
    if (!win) { alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาต Pop-up ของเว็บนี้แล้วลองอีกครั้ง'); return; }
    const T = PM.today(), ym = T.slice(0, 7);
    const m = PM.projectMetrics(p);
    const st = PM.timelineStats ? PM.timelineStats(p, m, T) : null;
    const ov = PM.costOverrun ? PM.costOverrun(m, p.status === 'closed') : null;
    const vo = PM.voSummary ? PM.voSummary(p) : null;
    const bill = PM.billingSummary ? PM.billingSummary(p, m) : null;
    const cf = PM.cashflowSaved ? PM.cashflowModel(p, PM.cashflowSaved(p), 'base') : null;
    const risks = (p.risks || []).filter((r) => r.status !== 'closed').sort((a, b) => PM.riskScore(b) - PM.riskScore(a));
    const pos = (PM.db.pos || []).filter((x) => x.projectId === p.id);
    const poSt = PM.poStats(pos, T);
    const ncrs = (PM.db.ncrs || []).filter((n) => n.projectId === p.id && n.status === 'open');
    const h = p.status === 'closed' ? 'neutral' : U.worst(U.health(m.spi), U.health(m.cpi));
    const gap = (m.act - m.plan) * 100;
    const next30 = PM.addDays(T, 30);
    const msLate = st ? st.msLate : [], msNext = st ? st.milestones.filter((x) => !x.actual && x.date >= T && x.date <= next30) : [];
    const tasksLate = st ? st.tasksLate : [], tasksNext = (p.tasks || []).filter((t) => (t.progress || 0) < 100 && t.start <= next30 && t.end >= T).sort((a, b) => String(a.end).localeCompare(String(b.end)));

    /* key messages — written from the numbers */
    const msgs = [];
    msgs.push(`งานเสร็จ ${U.pct(m.act, 1)} เทียบแผน ${U.pct(m.plan, 1)} — ${Math.abs(gap) < 1 ? 'ตามแผน' : gap < 0 ? `ช้ากว่าแผน ${Math.abs(gap).toFixed(1)} จุด %` : `เร็วกว่าแผน ${gap.toFixed(1)} จุด %`} (SPI ${U.ratio(m.spi)})`);
    if (st) msgs.push(st.closed ? `ปิดโครงการ — เสร็จจริง ${U.date(st.forecast)}` : `คาดว่าจะเสร็จ ${U.date(st.forecast)}${st.slip > 0 ? ` ช้ากว่าสัญญา ${U.num(st.slip)} วัน` : st.slip < 0 ? ` เร็วกว่าสัญญา ${U.num(-st.slip)} วัน` : ' ตามสัญญา'}`);
    if (ov) msgs.push(ov.status === 'over' ? `ต้นทุนเกินงบแล้ว ${U.money(ov.amount)} (ใช้ไป ${U.pct(ov.used)} ของ Plan cost)` : ov.status === 'forecast' ? `คาดว่าต้นทุนจะเกินงบ ${U.money(ov.forecast)} เมื่อจบโครงการ (CPI ${U.ratio(m.cpi)})` : `ต้นทุนอยู่ในงบ — ใช้ไป ${U.pct(ov.used)} ของ Plan cost (CPI ${U.ratio(m.cpi)})`);
    if (vo && (vo.approved.length || vo.pending.length)) msgs.push(`VO อนุมัติ ${vo.approved.length} รายการ ${sm(vo.amount)}${vo.pending.length ? ` · รออนุมัติ ${vo.pending.length} รายการ ${sm(vo.pendingAmount)}` : ''}`);
    if (bill && bill.list.length) msgs.push(`รับเงินแล้ว ${U.money(bill.received)} · ค้างรับ ${U.money(bill.outstanding)}${bill.overdue.length ? ` (เกินกำหนด ${bill.overdue.length} งวด)` : ''} · ผลงานที่ยังไม่ได้วางบิล ${U.money(bill.unbilled)}`);
    if (msLate.length) msgs.push(`Milestone เลยกำหนด ${msLate.length} รายการ: ${msLate.slice(0, 3).map((x) => x.name).join(', ')}`);
    if (poSt.late.length) msgs.push(`PO เลยกำหนดส่ง ${poSt.late.length} รายการ`);
    if (ncrs.length) msgs.push(`NCR เปิดอยู่ ${ncrs.length} รายการ${ncrs.some((n) => n.severity === 'Critical') ? ' (มีระดับ Critical)' : ''}`);
    const hi = risks.filter((r) => PM.riskScore(r) >= 15);
    if (hi.length) msgs.push(`ความเสี่ยงระดับสูงมาก ${hi.length} เรื่อง: ${hi.slice(0, 2).map((r) => r.title).join(', ')}`);

    /* charts */
    const months = PM.months(p.startDate.slice(0, 7), p.endDate.slice(0, 7));
    const log = p.progressLog || [];
    const planned = months.map((x) => { const d = PM.min(PM.monthEnd(x), p.endDate); const v = {}; p.phases.forEach((ph) => (v[ph.key] = PM.plannedPct(ph, d) * 100)); return +PM.weightedProgress(p, v).toFixed(1); });
    const actual = months.map((x) => { if (x + '-01' > T) return null; const d = PM.min(PM.monthEnd(x), T); const s = log.filter((y) => y.date <= d).pop(); return s ? +PM.weightedProgress(p, s.values).toFixed(1) : 0; });
    const sCurve = chartHtml((el) => PM.charts.lines(el, { labels: months.map(U.month), yMax: 100, fmt: (v) => v.toFixed(1) + '%', axisFmt: (v) => v + '%', marker: months.indexOf(ym), markerLabel: 'เดือนนี้', height: 230, series: [{ name: 'แผน', color: 'var(--s1)', values: planned, dash: true }, { name: 'จริง', color: 'var(--s2)', values: actual }] }), 700);
    const costChart = chartHtml((el) => PM.charts.columns(el, { stacked: false, categories: m.phases.map((ph) => U.phaseLabel(ph.key)), fmt: U.money, axisFmt: U.money, height: 200, series: [{ name: 'Plan cost', color: 'var(--s1)', values: m.phases.map((ph) => ph.budget) }, { name: 'Earned value', color: 'var(--s3)', values: m.phases.map((ph) => ph.ev) }, { name: 'Actual cost', color: 'var(--s2)', values: m.phases.map((ph) => ph.actualCost) }] }), 700);
    const cashChart = cf ? chartHtml((el) => PM.charts.lines(el, { labels: cf.months.map(U.month), marker: cf.months.indexOf(ym), markerLabel: 'เดือนนี้', fmt: sm, axisFmt: sm, height: 200, series: [{ name: 'เงินสดสะสม (แผน Base)', color: 'var(--s1)', values: cf.cum }] }), 700) : '';

    const kpi = (label, value, sub, level) => `<div class="k${level ? ' lv-' + level : ''}"><span>${esc(label)}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const tbl = (head, rows, empty) => (rows.length ? `<table><thead><tr>${head.map((x) => `<th${x.r ? ' class="r"' : ''}>${esc(x.t || x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${head[i] && head[i].r ? ' class="r"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<p class="none">${empty || 'ไม่มีรายการ'}</p>`);
    // the report carries its own chart styles + light-theme colours (no dependency on the app's stylesheet loading in a new window)
    const CHART_CSS = `
  :root { --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100; --s7: #4a3aa7; --s8: #e34948; --grid: #e1e8f2; --axis: #c0ccdc; --muted: #6a7a91; --ink: #0b1b33; --ink-2: #3f5068; --surface: #fff;
    --good: #0ca30c; --warning: #fab219; --critical: #d03b3b; --good-bg: #e5f5e5; --warning-bg: #fdf1d6; --critical-bg: #f9e1e1; --good-text: #006300; --warning-text: #8a5a00; --critical-text: #b02a2a; --surface-2: #edf2f9; }
  .chart-svg { display: block; width: 100%; height: auto; overflow: visible; }
  .chart-svg .grid { stroke: var(--grid); stroke-width: 1; } .chart-svg .axis { stroke: var(--axis); stroke-width: 1; }
  .chart-svg .tick { fill: var(--muted); font-size: 11px; } .chart-svg .tick.strong { fill: var(--ink-2); font-weight: 600; }
  .chart-svg .today { stroke: var(--ink-2); stroke-width: 1; stroke-dasharray: 3 3; }
  .chart-svg .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; } .chart-svg .line.dash { stroke-dasharray: 6 4; }
  .chart-svg .end-dot { stroke: #fff; stroke-width: 2; } .chart-svg .end-label { fill: var(--ink-2); font-size: 12px; font-weight: 600; }
  .chart-svg .ref { stroke: var(--ink-2); stroke-width: 1.5; }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 10.5px; color: var(--ink-2); margin-bottom: 4px; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; } .legend .sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .legend .sw.dash { height: 0; width: 14px; background: transparent !important; border-top: 2px dashed; border-radius: 0; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px 1px 3px; border-radius: 999px; font-size: 10px; font-weight: 700; white-space: nowrap; background: var(--surface-2); color: var(--ink-2); }
  .badge i { font-style: normal; width: 14px; height: 14px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 9px; color: #fff; background: var(--muted); }
  .badge.good { background: var(--good-bg); color: var(--good-text); } .badge.good i { background: var(--good); }
  .badge.warning { background: var(--warning-bg); color: var(--warning-text); } .badge.warning i { background: var(--warning); }
  .badge.critical { background: var(--critical-bg); color: var(--critical-text); } .badge.critical i { background: var(--critical); }`;
    const monthTh = new Date(ym + '-01T00:00:00').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

    win.document.write(`<!doctype html><html lang="th" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>รายงานประจำเดือน ${esc(p.code)} ${esc(ym)}</title>
<style>${CHART_CSS}
  @page { size: A4 portrait; margin: 12mm 11mm; }
  html, body { background: #fff !important; color: #0b1b33; }
  body { margin: 0; font: 11px/1.5 "Sarabun", "Leelawadee UI", "Tahoma", "Noto Sans Thai", sans-serif; }
  .bar { position: sticky; top: 0; z-index: 5; display: flex; gap: 10px; align-items: center; padding: 10px 16px; background: #0b2f6b; color: #fff; font-size: 13px; }
  .bar button { font: inherit; font-weight: 700; padding: 7px 14px; border: 0; border-radius: 6px; background: #fff; color: #0b2f6b; cursor: pointer; }
  main { max-width: 190mm; margin: 0 auto; padding: 14px 4px 40px; }
  header.rh { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; border-bottom: 3px solid #0b2f6b; padding-bottom: 8px; margin-bottom: 12px; }
  header.rh h1 { margin: 0; font-size: 19px; color: #0b2f6b; }
  header.rh p { margin: 2px 0 0; color: #3f5068; font-size: 11.5px; }
  header.rh .meta { text-align: right; font-size: 10.5px; color: #3f5068; }
  header.rh { align-items: center; }
  header.rh .rlogo { height: 58px; width: auto; flex: none; }
  header.rh .rtitle { flex: 1; min-width: 0; }
  h2 { font-size: 13.5px; color: #0b2f6b; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #c0ccdc; }
  section { break-inside: avoid; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .k { border: 1px solid #d5deea; border-left: 4px solid #a3afc0; border-radius: 6px; padding: 6px 8px; }
  .k span { display: block; font-size: 9.5px; color: #6a7a91; text-transform: uppercase; letter-spacing: .03em; }
  .k b { display: block; font-size: 15px; }
  .k small { display: block; font-size: 9.5px; color: #3f5068; }
  .k.lv-good { border-left-color: #0ca30c; } .k.lv-warning { border-left-color: #fab219; } .k.lv-critical { border-left-color: #d03b3b; }
  ul.msg { margin: 6px 0 0; padding-left: 18px; } ul.msg li { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { text-align: left; background: #edf2f9; color: #3f5068; font-weight: 700; padding: 4px 6px; border-bottom: 1px solid #c0ccdc; }
  td { padding: 3.5px 6px; border-bottom: 1px solid #e1e8f2; vertical-align: top; }
  .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .none { color: #6a7a91; margin: 4px 0; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .chartbox { margin-top: 4px; } .chartbox svg { max-width: 100%; height: auto; }
  .neg { color: #b02a2a; font-weight: 700; }
  .badge { font-size: 9.5px; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 30px; text-align: center; font-size: 10.5px; }
  .sign div { border-top: 1px solid #3f5068; padding-top: 4px; margin-top: 34px; }
  footer.rf { margin-top: 18px; font-size: 9.5px; color: #6a7a91; text-align: center; }
  @media print { .bar { display: none; } main { padding-top: 0; } }
</style></head><body>
<div class="bar"><b>รายงานประจำเดือน — ${esc(p.code)}</b><span>กด "พิมพ์ / บันทึก PDF" แล้วเลือกเครื่องพิมพ์ "บันทึกเป็น PDF"</span><span style="flex:1"></span><button onclick="window.print()">🖨 พิมพ์ / บันทึก PDF</button></div>
<main>
  <header class="rh"><img class="rlogo" src="${esc(PM.logoUrl(true))}" alt="${esc(PM.COMPANY)}"><div class="rtitle"><h1>รายงานความคืบหน้าโครงการ — ${esc(monthTh)}</h1><p><b>${esc(p.code)} · ${esc(p.name)}</b></p><p>ลูกค้า ${esc(p.client || '–')} · PM ${esc(PM.common.pmName(p))} · ระยะเวลา ${U.date(p.startDate)} – ${U.date(p.endDate)}</p></div>
    <div class="meta">${esc(PM.COMPANY)}<br>ข้อมูล ณ ${U.date(T)}<br>${U.badge(h, p.status === 'closed' ? 'Closed' : U.healthLabel[h])}</div></header>

  <section><h2>1. สรุปสำหรับผู้บริหาร</h2>
    <div class="kpis">
      ${kpi('ความคืบหน้า', `${U.pct(m.act, 1)}`, `แผน ${U.pct(m.plan, 1)}`, gap < -10 ? 'critical' : gap < -3 ? 'warning' : 'good')}
      ${kpi('SPI (เวลา)', U.ratio(m.spi), U.healthLabel[U.health(m.spi)], U.health(m.spi))}
      ${kpi('CPI (ต้นทุน)', U.ratio(m.cpi), `EAC ${U.money(m.eac)}`, U.health(m.cpi))}
      ${kpi(st && st.closed ? 'เสร็จจริง' : 'คาดว่าจะเสร็จ', st ? U.date(st.forecast) : '–', st ? (st.slip > 0 ? `ช้ากว่าแผน ${U.num(st.slip)} วัน` : 'ตามแผน') : '', st && st.slip > 30 ? 'critical' : st && st.slip > 0 ? 'warning' : 'good')}
      ${kpi('มูลค่าสัญญา', U.money(PM.revisedContract ? PM.revisedContract(p) : p.contractValue), vo && vo.amount ? `รวม VO ${sm(vo.amount)}` : 'ตามสัญญา')}
      ${kpi('Actual cost / Plan cost', U.money(m.ac), `${U.pct(m.bac ? m.ac / m.bac : null)} ของ ${U.money(m.bac)}`, ov ? { over: 'critical', forecast: 'warning', ok: 'good' }[ov.status] : null)}
      ${kpi('รับเงินแล้ว', bill ? U.money(bill.received) : '–', bill ? `ค้างรับ ${U.money(bill.outstanding)}` : '', bill && bill.overdue.length ? 'critical' : null)}
      ${kpi('Peak funding', cf && cf.peak ? U.money(-cf.peak.value) : '฿0', cf && cf.peak ? `เงินสดตึงสุด ${U.month(cf.peak.ym)}` : 'เงินสดไม่ติดลบ')}
    </div>
    <ul class="msg">${msgs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>

  <section><h2>2. ความคืบหน้า — S-Curve และ Phase</h2>
    <div class="chartbox">${sCurve}</div>
    ${tbl([{ t: 'Phase' }, { t: 'น้ำหนัก', r: 1 }, { t: 'แผน' }, { t: 'จริง' }, { t: 'แผน ณ วันนี้', r: 1 }, { t: 'จริง', r: 1 }, { t: 'SPI', r: 1 }],
      m.phases.map((ph) => [esc(U.phaseLabel(ph.key)), `${ph.weight}%`, `${U.date(ph.planStart)} – ${U.date(ph.planEnd)}`, `${U.date(ph.actStart)} – ${ph.actEnd ? U.date(ph.actEnd) : ph.actStart ? 'กำลังทำ' : '–'}`, U.pct(ph.plannedPct), U.pct(ph.actualPct), U.ratio(ph.spi)]))}</section>

  <section><h2>3. ต้นทุน</h2>
    <div class="two"><div>${tbl([{ t: 'รายการ' }, { t: 'มูลค่า', r: 1 }], [
      ['Plan cost (BAC)', U.money(m.bac)], ['Earned value (EV)', U.money(m.ev)], ['Actual cost (AC)', U.money(m.ac)],
      ['คาดว่าจะใช้ทั้งหมด (EAC)', U.money(m.eac)], ['ส่วนต่างเมื่อจบ (BAC − EAC)', `<span class="${m.bac - m.eac < 0 ? 'neg' : ''}">${sm(m.bac - m.eac)}</span>`],
      ...(vo && vo.approved.length ? [['ต้นทุนเพิ่มจาก VO อนุมัติ', sm(vo.cost)]] : []),
    ])}</div><div class="chartbox">${costChart}</div></div>
    ${vo && vo.list.length ? `<h2 style="font-size:12px;border:0;margin-top:8px">งานเพิ่ม-ลด (VO)</h2>${tbl([{ t: 'เลขที่' }, { t: 'รายการ' }, { t: 'มูลค่า', r: 1 }, { t: 'ต้นทุน', r: 1 }, { t: 'วัน', r: 1 }, { t: 'สถานะ' }],
      vo.list.map((c) => [esc(c.no), esc(c.title), sm(Number(c.amount) || 0), sm(Number(c.cost) || 0), U.num(c.days || 0), esc((PM.VO_STATUS.find((s) => s.key === c.status) || {}).label || c.status)]))}` : ''}</section>

  <section><h2>4. การเงิน — งวดเงินและ Cash Flow</h2>
    ${bill ? `<div class="kpis" style="margin-bottom:6px">
      ${kpi('วางบิลแล้ว', U.money(bill.billed), `${U.pct(bill.contract ? bill.billed / bill.contract : null)} ของสัญญา`)}
      ${kpi('รับเงินแล้ว', U.money(bill.received))}
      ${kpi('ค้างรับ', U.money(bill.outstanding), bill.overdue.length ? `เกินกำหนด ${bill.overdue.length} งวด` : '', bill.overdue.length ? 'critical' : null)}
      ${kpi('ยังไม่ได้วางบิล', U.money(bill.unbilled), `Retention ที่ถูกหัก ${U.money(bill.retentionHeld)}`)}
    </div>` : ''}
    ${cashChart ? `<div class="chartbox">${cashChart}</div>` : ''}</section>

  <section><h2>5. Milestone และกิจกรรม</h2>
    <div class="two"><div><b>เลยกำหนด / ล่าช้า</b>${tbl([{ t: 'รายการ' }, { t: 'กำหนด' }], msLate.map((x) => [`◆ ${esc(x.name)}`, U.date(x.date)]).concat(tasksLate.slice(0, 6).map((t) => [esc(t.name), U.date(t.end)])), 'ไม่มีรายการล่าช้า')}</div>
      <div><b>30 วันข้างหน้า</b>${tbl([{ t: 'รายการ' }, { t: 'กำหนด' }], msNext.map((x) => [`◆ ${esc(x.name)}`, U.date(x.date)]).concat(tasksNext.slice(0, 6).map((t) => [`${esc(t.name)} (${U.num(t.progress || 0)}%)`, U.date(t.end)])), 'ไม่มีรายการ')}</div></div></section>

  <section><h2>6. จัดซื้อ (PO)</h2>
    <p style="margin:0 0 4px">PO ทั้งหมด ${poSt.total} · ยังไม่ส่งครบ ${poSt.open} · เลยกำหนด ${poSt.late.length} · จ่ายแล้ว ${U.pct(poSt.paidPct)}</p>
    ${tbl([{ t: 'PO' }, { t: 'ผู้ขาย' }, { t: 'รายการ' }, { t: 'กำหนดส่ง' }, { t: 'สถานะ' }], poSt.late.concat(poSt.soon).slice(0, 8).map((x) => [esc(x.poNo), esc(x.supplier || ''), esc(x.description || ''), U.date(x.deliveryDue), PM.poDaysLate(x, T) ? `<span class="neg">เลย ${PM.poDaysLate(x, T)} วัน</span>` : `อีก ${PM.diffDays(T, x.deliveryDue)} วัน`]), 'ไม่มี PO ที่ต้องติดตาม')}</section>

  <section><h2>7. คุณภาพและความปลอดภัย</h2>
    <div class="two"><div><b>NCR ที่เปิดอยู่ (${ncrs.length})</b>${tbl([{ t: 'NCR' }, { t: 'ความรุนแรง' }, { t: 'รายละเอียด' }], ncrs.slice(0, 6).map((n) => [esc(n.no), esc(n.severity), esc(n.description || '')]), 'ไม่มี NCR ค้าง')}</div>
      <div><b>Safety</b>${tbl([{ t: 'รายการ' }, { t: 'ค่า', r: 1 }], [['Man-hours', U.num(m.manhours)], ['LTI', U.num(m.lti)], ['LTIFR', U.num(m.ltifr, 2)], ['TRIR', U.num(m.trir, 2)], ['First aid / Near miss', `${U.num(m.firstAid)} / ${U.num(m.nearMiss)}`]])}</div></div></section>

  <section><h2>8. ความเสี่ยงและปัญหาสำคัญ</h2>
    ${tbl([{ t: 'เลขที่' }, { t: 'เรื่อง' }, { t: 'คะแนน', r: 1 }, { t: 'ผู้รับผิดชอบ' }, { t: 'แผนรับมือ' }], risks.slice(0, 6).map((r) => [esc(r.no), esc(r.title), `${PM.riskScore(r)} · ${PM.riskLevel(PM.riskScore(r)).label}`, esc(r.owner || '–'), esc(r.response || '–')]), 'ไม่มีความเสี่ยงที่เปิดอยู่')}</section>

  <div class="sign"><div>จัดทำโดย (Project Manager)</div><div>ตรวจสอบโดย</div><div>อนุมัติโดย</div></div>
  <footer class="rf">สร้างจาก BU4 IE/EPC Project Management · ${esc(PM.COMPANY)} · ${U.date(T)} · ตัวเลขทั้งหมดคำนวณ ณ วันที่ออกรายงาน</footer>
</main></body></html>`);
    win.document.close();
  };
})();
