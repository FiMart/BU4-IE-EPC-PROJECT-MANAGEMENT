/* bid-stage.js — one page per bidding step: Inquiry · Estimate · Proposal · Submit · Award
   Shares the period / Sales / search filters with the Bidding overview (PM.biddingState). */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;

  /* columns that only make sense on one step (header, cell, css class) */
  const EXTRA = {
    inquiry: [
      ['ที่มาของงาน', (b) => esc(b.leadSource || '–')],
      ['ผู้ติดต่อ', (b) => esc(b.contact || '–')],
    ],
    estimate: [
      ['Estimator', (b) => esc(U.resourceName(b.estimator))],
      ['สถานะประมาณราคา', (b) => { const s = PM.EST_STATUS.find((x) => x.key === ((b.estimate || {}).status || 'todo')); return U.badge(s.level, s.label); }],
      ['BOQ items', (b) => U.num(b.boqItems), 'num'],
      ['ต้นทุนประมาณการ', (b) => (PM.bidCost(b) ? U.money(PM.bidCost(b)) : '–'), 'num'],
    ],
    submit: [
      ['ยื่นเมื่อ', (b) => U.date(b.dates.submit)],
      ['ตรงเวลา', (b) => (!b.dueDate || b.submitAssumed ? '–' : b.dates.submit <= b.dueDate ? U.badge('good', 'On time') : U.badge('critical', `Late ${PM.diffDays(b.dueDate, b.dates.submit)}d`))],
    ],
  };

  PM.views.bidstage = function (el, args) {
    const key = args[0];
    const state = PM.biddingState;
    const db = PM.db, T = PM.today();
    const { from, to } = V.periodRange(state.period);
    const inPeriod = (d) => d && (!from || d >= from) && (!to || d <= to);
    const salesRows = PM.salesStats(from, to);
    if (state.sales && !salesRows.some((x) => (x.id || '-') === state.sales)) state.sales = '';
    const bids = db.bids.filter((b) => !state.sales || (PM.salesKey(b) || '-') === state.sales);
    const q = state.q.toLowerCase();
    const match = (b) => !q || [b.code, b.name, b.client, b.contact, V.salesName(b)].join(' ').toLowerCase().includes(q);
    const bs = PM.bidStats(bids, from, to);
    const bidHours = db.timesheets.filter((t) => t.kind === 'bid' && inPeriod(t.date));
    const salesOpt = (id, label) => `<option value="${esc(id)}"${state.sales === id ? ' selected' : ''}>${esc(label)}</option>`;

    const toolbar = `
      ${V.bidTabs(key)}
      <div class="row">
        ${V.seg('period', V.periods, state.period)}
        <select id="bid-sales" aria-label="Sales" style="width:auto">${salesOpt('', 'Sales: ทุกคน')}${salesRows.map((x) => salesOpt(x.id || '-', x.id ? 'Sales: ' + V.personName(x.id, x.fallbackName) : 'ไม่ระบุ Sales')).join('')}</select>
        <input type="search" id="bid-q" placeholder="ค้นหา bid / ลูกค้า / Sales…" value="${esc(state.q)}" style="width:220px">
        <span class="spacer"></span>
        ${key === 'proposal' ? `${PM.can('bid.edit') ? '<button class="btn" data-action="prop-import" title="ลากไฟล์ Excel มาวาง หรือวางเซลล์ที่คัดลอกจาก Excel">⬆ นำเข้า Excel</button>' : ''}<button class="btn" data-action="prop-print">🖨 พิมพ์ / PDF</button><button class="btn" data-action="prop-xlsx">Excel</button>` : ''}
        ${key === 'inquiry' && PM.can('bid.edit') ? '<button class="btn primary fab" data-action="new" aria-label="New inquiry"><span class="fab-i">+</span><span class="fab-t">New inquiry</span></button>' : ''}
        ${key === 'proposal' && PM.can('bid.edit') ? '<button class="btn primary fab" data-action="new" aria-label="New proposal"><span class="fab-i">+</span><span class="fab-t">New proposal</span></button>' : ''}
      </div>`;

    if (key === 'award') award(el, { toolbar, bids, bs, match, inPeriod, T });
    else step(el, key, { toolbar, bids, bs, match, inPeriod, bidHours, T });

    /* events */
    const rerender = () => PM.views.bidstage(el, args);
    el.querySelector('#bid-sales').addEventListener('change', (e) => { state.sales = e.target.value; rerender(); });
    el.querySelectorAll('[data-prop-filter]').forEach((s) => s.addEventListener('change', () => { state[s.dataset.propFilter] = s.value; rerender(); }));
    el.querySelector('#bid-q').addEventListener('input', (e) => {
      state.q = e.target.value;
      clearTimeout(state.t);
      state.t = setTimeout(() => { rerender(); const i = el.querySelector('#bid-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
    });
    if (key === 'proposal' && PM.can('bid.edit')) PM.sheetImport.dropOn(el, (file) => PM.sheetImport.openBids(rerender, file));
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg]');
      if (seg) { state[seg.dataset.seg] = seg.dataset.val; rerender(); return; }
      const act = e.target.closest('[data-action]');
      if (act) {
        if (act.dataset.action === 'new') { V.bidForm(null, rerender, key === 'proposal' ? { tab: 'proposal' } : {}); return; }
        if (act.dataset.action === 'prop-import') { PM.sheetImport.openBids(rerender); return; }
        if (act.dataset.action === 'prop-print') { proposalPrint(proposalRows(bids, match, inPeriod)); return; }
        if (act.dataset.action === 'prop-xlsx') { proposalExcel(proposalRows(bids, match, inPeriod)); return; }
        V.bidAction(act.dataset.action, act.dataset.id && PM.find('bids', act.dataset.id), rerender);
        return;
      }
      if (e.target.closest('a')) return;
      const row = e.target.closest('[data-bid]');
      if (row) V.bidForm(PM.find('bids', row.dataset.bid), rerender, { tab: key === 'award' ? 'submit' : key }); // open on this page's part
    };
  };

  /* ---------- Inquiry / Estimate / Proposal / Submit ---------- */
  function step(el, key, { toolbar, bids, bs, match, inPeriod, bidHours, T }) {
    const i = PM.BID_STAGES.findIndex((s) => s.key === key);
    const st = PM.BID_STAGES[i], next = PM.BID_STAGES[i + 1];
    const sd = bs.stageDays[i];
    const now = bids.filter((b) => b.result === 'pending' && b.stage === key && match(b))
      .sort((a, b) => String(a.dueDate || '9').localeCompare(String(b.dueDate || '9')));
    // went through this step (entered it in the selected period) and moved on
    const passed = bids.filter((b) => inPeriod(b.dates[key]) && match(b) && !(b.result === 'pending' && b.stage === key))
      .sort((a, b) => (a.dates[key] < b.dates[key] ? 1 : -1));
    const hrs = bidHours.filter((t) => t.phase === key);
    const hoursBy = {};
    hrs.forEach((t) => (hoursBy[t.refId] = (hoursBy[t.refId] || 0) + t.hours));
    const isProp = key === 'proposal';
    const overdue = now.filter((b) => b.dueDate && b.dueDate < T);
    const dueSoon = now.filter((b) => b.dueDate && b.dueDate >= T && PM.diffDays(T, b.dueDate) <= 5);
    // left the step: started the next one, or got a result while still in it (e.g. No-bid during Estimate)
    const leftAt = (b) => (next && b.dates[next.key]) || (b.result !== 'pending' ? b.resultDate : '') || '';

    const special = {
      inquiry: () => { const n = now.filter((b) => !PM.salesKey(b)).length; return V.tile({ label: 'ยังไม่ระบุ Sales', value: n, sub: n ? U.badge('warning', 'ควรระบุผู้รับผิดชอบ') : U.badge('good', 'ครบทุกงาน'), icon: 'people' }); },
      estimate: () => V.tile({ label: 'ประมาณราคาเสร็จ / ตรวจแล้ว', value: `${now.filter((b) => ['done', 'reviewed'].includes((b.estimate || {}).status)).length} <small>/ ${now.length}</small>`, sub: `BOQ ${U.num(PM.sum(now, (b) => b.boqItems))} รายการ · ไม่มี Estimator ${now.filter((b) => !b.estimator).length} งาน`, icon: 'layers' }),
      proposal: () => {
        if (!PM.seesBidPrices()) return V.tile({ label: 'Status: In Progress', value: `${now.filter((b) => PM.propOf(b).work === 'in_progress').length} <small>/ ${now.length}</small>`, sub: 'งานในขั้นนี้ที่กำลังทำ · งาน Complete ย้ายไป Submit แล้ว', icon: 'proposal' });
        const m = now.filter((b) => PM.canSeeBidPrice(b) && b.margin != null);
        return V.tile({ label: 'Margin เฉลี่ย', value: m.length ? U.num(PM.sum(m, (b) => b.margin) / m.length, 1) + '%' : '–', sub: `มูลค่ารวม ${V.bidSum(now) || '–'}`, icon: 'coins' });
      },
      submit: () => {
        const w = now.map((b) => PM.diffDays(b.dates.submit, T));
        return V.tile({ label: 'รอผลเฉลี่ย', tag: 'Time', value: w.length ? `${U.num(PM.sum(w) / w.length, 1)} <small>days</small>` : '–', sub: `นานสุด ${w.length ? Math.max(...w) : 0} วัน`, icon: 'clock' });
      },
    }[key];

    const extra = EXTRA[key] || [];
    el.innerHTML = `${toolbar}
      <div class="grid cols-6">
        ${isProp // the Proposal page: the whole list first, every status counted (as in the team's file)
          ? V.proposalTotalTile(PM.proposalList().filter(({ b }) => bids.includes(b) && match(b)), { of: PM.db.bids.length })
          : ''}
        ${V.tile({ label: isProp ? 'อยู่ขั้น Proposal ตอนนี้' : `${st.label} ตอนนี้`, value: now.length, sub: V.bidSum(now) ? `มูลค่า ${V.bidSum(now)}` : 'งานที่อยู่ในขั้นนี้', icon: key })}
        ${isProp ? '' : V.tile({ label: 'เข้าขั้นนี้', tag: 'Quantity', value: bs.reached[key], sub: i ? `Conversion จาก Inquiry ${U.pct(bs.total ? bs.reached[key] / bs.total : null)}` : 'Inquiry ทั้งหมดในช่วงเวลา' })}
        ${V.tile({ label: 'เวลาเฉลี่ย', tag: 'Time', value: U.days(sd.avg), sub: `${esc(sd.label)} · n=${sd.n}` })}
        ${key === 'submit'
          ? V.tile({ label: 'On-time submission', tag: 'Time', value: U.pct(bs.onTimeRate), sub: 'ยื่นก่อน / ตรง due date' })
          : V.tile({ label: 'เลยกำหนดยื่น', value: overdue.length, sub: overdue.length ? U.badge('critical', `${overdue.length} งานเลย Due`) : dueSoon.length ? U.badge('warning', `${dueSoon.length} งาน Due ภายใน 5 วัน`) : U.badge('good', 'ไม่มีงานเลยกำหนด'), icon: 'alert' })}
        ${V.tile({ label: 'ชั่วโมง', tag: 'Hours', value: U.num(PM.sum(hrs, (t) => t.hours), 1), sub: `${new Set(hrs.map((t) => t.resourceId)).size} คน · จาก Timesheet` })}
        ${special()}
      </div>
      ${isProp ? proposalList(proposalRows(bids, match, inPeriod)) : `<div class="card">
        <div class="card-h"><h2>งานที่อยู่ในขั้น ${esc(st.label)} ตอนนี้</h2><p>${esc(st.th)} · เรียงตาม Due date · คลิกแถวเพื่อแก้ไข · ปุ่ม ${next ? `→ ${esc(next.label)} = เลื่อนไปขั้นถัดไป (บันทึกวันที่ = วันนี้)` : 'Won / Lost = บันทึกผลการประมูล'}</p></div>
        <div class="card-b flush table-wrap">${now.length ? `<table class="tbl"><thead><tr>
          <th>Bid</th><th>Client</th><th>Sales</th><th class="num">Value</th>${extra.map((c) => `<th${c[2] ? ` class="${c[2]}"` : ''}>${esc(c[0])}</th>`).join('')}
          <th>เข้าขั้นเมื่อ</th><th class="num">อยู่มา (วัน)</th><th>Due</th><th class="num">ชม. ขั้นนี้</th><th class="num">ไฟล์</th><th></th></tr></thead><tbody>
          ${now.map((b) => `<tr class="click" data-bid="${esc(b.id)}">
            <td><span class="title">${esc(PM.dash(b.code))}</span><small>${esc(PM.dash(b.name))}</small></td>
            <td>${esc(PM.dash(b.client))}</td><td>${esc(V.salesName(b))}</td><td class="num">${V.bidMoney(b)}</td>
            ${extra.map((c) => `<td${c[2] ? ` class="${c[2]}"` : ''}>${c[1](b)}</td>`).join('')}
            <td>${U.date(b.dates[key])}</td><td class="num">${b.dates[key] ? PM.diffDays(b.dates[key], T) : '-'}</td><td>${V.dueBadge(b) || '–'}</td>
            <td class="num">${hoursBy[b.id] ? U.num(hoursBy[b.id], 1) : '–'}</td>
            <td class="num">${PM.canSeeBidPrice(b) ? PM.poFiles.clip(b.files, `data-action="bid-files" data-id="${esc(b.id)}"`) || '–' : V.LOCK_PRICE}</td>
            <td class="row-actions">${V.bidButtons(b)}</td></tr>`).join('')}
          </tbody></table>` : `<p class="empty">ไม่มีงานในขั้น ${esc(st.label)} ตอนนี้</p>`}</div>
      </div>
      <div class="card">
        <div class="card-h"><h2>ผ่านขั้น ${esc(st.label)} แล้ว</h2><p>งานที่เข้าขั้นนี้ในช่วงเวลาที่เลือกและไปต่อแล้ว · ใช้เวลาในขั้นนี้กี่วัน · สถานะตอนนี้</p></div>
        <div class="card-b flush table-wrap">${passed.length ? `<table class="tbl"><thead><tr>
          <th>Bid</th><th>Client</th><th class="num">Value</th><th>เข้าขั้น</th><th>ออกจากขั้น</th><th class="num">ใช้เวลา (วัน)</th><th class="num">ชม. ขั้นนี้</th><th>ตอนนี้</th></tr></thead><tbody>
          ${passed.map((b) => { const out = leftAt(b); return `<tr class="click" data-bid="${esc(b.id)}">
            <td><span class="title">${esc(PM.dash(b.code))}</span><small>${esc(PM.dash(b.name))}</small></td><td>${esc(PM.dash(b.client))}</td><td class="num">${V.bidMoney(b)}</td>
            <td>${U.date(b.dates[key])}</td><td>${U.date(out)}</td><td class="num">${out && b.dates[key] ? PM.diffDays(b.dates[key], out) : '–'}</td>
            <td class="num">${hoursBy[b.id] ? U.num(hoursBy[b.id], 1) : '–'}</td><td>${V.resultBadge(b)}</td></tr>`; }).join('')}
          </tbody></table>` : '<p class="empty">ยังไม่มีงานที่ผ่านขั้นนี้ในช่วงเวลาที่เลือก</p>'}</div>
      </div>`}
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>งานที่เข้าขั้น ${esc(st.label)} รายเดือน</h2><p>12 เดือนล่าสุด · แยกตามผลการประมูลตอนนี้</p></div><div class="card-b"><div class="chart" id="c-step-month"></div></div></div>
        <div class="card"><div class="card-h"><h2>ชั่วโมงในขั้น ${esc(st.label)} แยกตามคน</h2><p>จาก Timesheet ในช่วงเวลาที่เลือก (แถว Bid ที่เลือกขั้นตอน = ${esc(st.label)})</p></div><div class="card-b"><div class="chart" id="c-step-hours"></div></div></div>
      </div>`;

    const months = PM.months(PM.addDays(T, -334).slice(0, 7), T.slice(0, 7));
    const inMonth = (fn) => months.map((m) => bids.filter((b) => b.dates[key] && b.dates[key].slice(0, 7) === m && fn(b)).length);
    PM.charts.columns(document.getElementById('c-step-month'), {
      categories: months.map(U.month), label: `${st.label} per month`,
      series: [
        { name: 'Won', color: 'var(--s1)', values: inMonth((b) => b.result === 'won') },
        { name: 'Lost / No-bid', color: 'var(--s2)', values: inMonth((b) => b.result === 'lost' || b.result === 'nobid') },
        { name: 'In progress', color: 'var(--s-neutral)', values: inMonth((b) => b.result === 'pending') },
      ],
    });
    const people = {};
    hrs.forEach((t) => (people[t.resourceId] = (people[t.resourceId] || 0) + t.hours));
    PM.charts.hbars(document.getElementById('c-step-hours'), {
      items: Object.keys(people).sort((a, b) => people[b] - people[a]).map((id) => ({
        label: U.resourceName(id), value: people[id], display: U.num(people[id], 1) + ' h', color: 'var(--s2)',
        sub: `${new Set(hrs.filter((t) => t.resourceId === id).map((t) => t.refId)).size} bids`,
      })),
    });
  }

  /* ---------- Proposal Status List — same columns, words and colours as document PS-IE-2026-001 ---------- */
  const dmy = (d) => (d ? U.date(d).replace(/ /g, '-') : '');
  const mb = (v) => (Number(v) ? U.num(Number(v) / 1e6, 1) : ''); // blank until someone fills it in, as on the paper list
  const pmOf = (x) => { const n = V.personName(x.p.owner, x.p.ownerName); return n === '–' ? '' : n; };
  const salesOf = (x) => { const n = V.salesName(x.b); return n === '–' ? 'Non' : n; };
  const priLevel = (p) => (PM.PROP_PRIORITY.find((x) => x.key === p) || {}).level;

  function proposalRows(bids, match, inPeriod) {
    const state = PM.biddingState;
    const ids = new Set(bids.map((b) => b.id));
    // the whole list, as in the team's file — the period only picks the figures above it
    return PM.proposalList().filter(({ b, p }) => ids.has(b.id) && match(b)
      && (!state.pStatus || p.status === state.pStatus) && (!state.pType || p.type === state.pType) && (!state.pPriority || p.priority === state.pPriority));
  }
  const filterSel = (name, label, items) => `<select data-prop-filter="${name}" aria-label="${esc(label)}" style="width:auto"><option value="">${esc(label)}: ทั้งหมด</option>${items.map((x) => `<option value="${esc(x.v)}"${PM.biddingState[name] === x.v ? ' selected' : ''}>${esc(x.t)}</option>`).join('')}</select>`;

  function proposalList(rows) {
    const s = PM.proposalSummary(rows), prices = PM.seesBidValues(), T = PM.today();
    const pct = (n) => (s.total ? U.num((n / s.total) * 100, 1) + '%' : '–');
    const yours = '';
    return `<div class="card no-i18n">
        <div class="card-h"><h2>Proposal Status List</h2><p>คลิกแถวเพื่อกรอก / แก้ไข · มูลค่าเห็นได้ตั้งแต่ Admin ถึง Engineer และ Sales เจ้าของงาน · แก้มูลค่าได้เฉพาะ Admin และ Sales เจ้าของงาน</p></div>
        <div class="card-b row pl-filters">
          ${filterSel('pStatus', 'Status', PM.PROP_STATUS.map((x) => ({ v: x.key, t: x.label })))}
          ${filterSel('pType', 'Type', PM.PROP_TYPES.map((x) => ({ v: x, t: x })))}
          ${filterSel('pPriority', 'Priority', PM.PROP_PRIORITY.map((x) => ({ v: x.key, t: x.key })))}
          <span class="muted">${rows.length} รายการ</span>
        </div>
        <div class="card-b flush table-wrap">${rows.length ? `<table class="tbl pl-table"><thead>
          <tr class="pl-bands"><td colspan="6">PROJECT INFORMATION</td><td colspan="2">SCHEDULE</td><td colspan="2">TRACKING</td><td colspan="2">TEAM</td><td>SCOPE</td><td></td></tr>
          <tr><th class="num">No.</th><th>Customer</th><th>Project Name</th><th>Type</th><th class="num">Value (MB)</th><th>Priority</th><th>Due Date</th><th>Start Date</th><th class="num">Progress</th><th>Status</th><th>PM</th><th>Sales</th><th>Deliverables</th><th></th></tr></thead><tbody>
          ${rows.map((x) => {
            const st = PM.propStatusInfo(x.p.status), lv = priLevel(x.p.priority);
            const late = x.b.result === 'pending' && !x.b.dates.submit && x.b.dueDate && x.b.dueDate < T;
            return `<tr class="click" data-bid="${esc(x.b.id)}">
            <td class="num">${x.no}</td><td>${esc(PM.dash(x.b.client))}</td><td><span class="title">${esc(PM.dash(x.b.name))}</span><small>${esc(PM.dash(x.b.code))}</small></td><td>${esc(x.p.type)}</td>
            <td class="num">${PM.canSeeBidValue(x.b) ? mb(x.b.value) : V.LOCK_PRICE}</td><td>${lv ? U.badge(lv, x.p.priority) : '-'}</td>
            <td class="nowrap${late ? ' neg' : ''}">${dmy(x.b.dueDate)}</td><td class="nowrap">${dmy(x.b.dates.proposal)}</td>
            <td class="num">${U.num(x.p.progress)}%</td><td>${U.badge(st.level, st.label)}</td><td>${esc(pmOf(x))}</td><td>${esc(salesOf(x))}</td><td>${esc(x.p.deliverables)}</td>
            <td class="row-actions">${V.bidButtons(x.b)}</td></tr>`;
          }).join('')}</tbody></table>` : '<p class="empty">ไม่พบรายการ</p>'}</div>
      </div>
      <div class="grid cols-3 no-i18n">
        <div class="card"><div class="card-h"><h2>Status</h2>${yours && prices ? `<p>Value${yours}</p>` : ''}</div><div class="card-b flush table-wrap"><table class="tbl"><thead><tr><th>Status</th><th class="num">Count</th><th class="num">% of Total</th>${prices ? '<th class="num">Value (MB)</th>' : ''}</tr></thead><tbody>
          <tr><td><b>Total Projects</b></td><td class="num"><b>${s.total}</b></td><td class="num">${s.total ? '100.0%' : '–'}</td>${prices ? `<td class="num"><b>${U.num(s.value, 1)}</b></td>` : ''}</tr>
          ${s.status.map((x) => `<tr><td>${U.badge(x.level, x.label)}</td><td class="num">${x.n}</td><td class="num">${pct(x.n)}</td>${prices ? `<td class="num">${U.num(x.value, 1)}</td>` : ''}</tr>`).join('')}</tbody></table></div></div>
        <div class="card"><div class="card-h"><h2>By Type</h2></div><div class="card-b flush table-wrap"><table class="tbl"><thead><tr><th>Type</th><th class="num">Count</th><th class="num">%</th></tr></thead><tbody>
          ${s.type.map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${x.n}</td><td class="num">${s.total ? U.num((x.n / s.total) * 100) + '%' : '–'}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card"><div class="card-h"><h2>By Priority</h2></div><div class="card-b flush table-wrap"><table class="tbl"><thead><tr><th>Priority</th><th class="num">Count</th></tr></thead><tbody>
          ${s.priority.map((x) => `<tr><td>${U.badge(x.level, x.label)}</td><td class="num">${x.n}</td></tr>`).join('')}</tbody></table></div></div>
      </div>`;
  }

  function proposalPrint(rows) {
    const P = PM.printDoc, win = P.open();
    if (!win) return;
    const s = PM.proposalSummary(rows), prices = PM.seesBidValues();
    const cellCls = (lv) => (lv ? ` class="c-${lv}"` : '');
    const statusRow = (label, n, value, cls) => `<tr><td${cls || ''}><b>${esc(label)}</b></td><td class="r">${n}</td><td class="r">${s.total ? U.num((n / s.total) * 100, 1) : '0.0'}%</td>${prices ? `<td class="r">${U.num(value, 1)}</td>` : ''}</tr>`;
    P.write(win, {
      title: `Proposal Status List ${PM.today()}`, bar: 'Proposal Status List', doc: 'proposal-list',
      head: { title: '<h1>PROPOSAL STATUS LIST</h1><p>EPC Instrumentation Projects</p>', meta: `${esc(PM.COMPANY)}<br>ข้อมูล ณ ${U.date(PM.today())}<br>${rows.length} รายการ` },
      body: `<style>@page { size: A4 landscape; margin: 8mm; } main { max-width: 281mm; }
        table.pl { font-size: 8.5px; } table.pl td, table.pl th { padding: 2.5px 4px; border: 1px solid #d5deea; }
        table.pl tr.band th { background: #1f4e79; color: #fff; text-align: center; } table.pl tr.head th { background: #4472c4; color: #fff; text-align: center; }
        .c-good { background: #c6efce; } .c-warning { background: #ffeb9c; } .c-critical { background: #ffc7ce; } .c-neutral { background: #d9d9d9; }
        .pl-sum { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; margin-top: 10px; break-inside: avoid; }</style>
  <section class="flow"><table class="pl"><thead>
    <tr class="band"><th colspan="6">PROJECT INFORMATION</th><th colspan="2">SCHEDULE</th><th colspan="2">TRACKING</th><th colspan="2">TEAM</th><th>SCOPE</th></tr>
    <tr class="head"><th>No.</th><th>Customer</th><th>Project Name</th><th>Type</th><th>Value (MB)</th><th>Priority</th><th>Due Date</th><th>Start Date</th><th>Progress</th><th>Status</th><th>PM</th><th>Sales</th><th>Deliverables</th></tr></thead><tbody>
    ${rows.map((x) => { const st = PM.propStatusInfo(x.p.status); return `<tr><td class="r">${x.no}</td><td>${esc(PM.dash(x.b.client))}</td><td>${esc(PM.dash(x.b.name))}</td><td>${esc(x.p.type)}</td>
      <td class="r">${PM.canSeeBidValue(x.b) ? mb(x.b.value) : '🔒'}</td><td${cellCls(priLevel(x.p.priority))}>${esc(x.p.priority || '-')}</td><td>${dmy(x.b.dueDate)}</td><td>${dmy(x.b.dates.proposal)}</td>
      <td class="r">${U.num(x.p.progress)}%</td><td${cellCls(st.level)}>${esc(st.label)}</td><td>${esc(pmOf(x))}</td><td>${esc(salesOf(x))}</td><td>${esc(x.p.deliverables)}</td></tr>`; }).join('')}
  </tbody></table></section>
  <div class="pl-sum">
    <table class="pl"><thead><tr class="band"><th>Status</th><th>Count</th><th>% of Total</th>${prices ? '<th>Value (MB)</th>' : ''}</tr></thead><tbody>
      ${statusRow('Total Projects:', s.total, s.value)}${s.status.map((x) => statusRow(x.label + ':', x.n, x.value, cellCls(x.level))).join('')}</tbody></table>
    <table class="pl"><thead><tr class="band"><th>BY TYPE</th><th>Count</th><th>%</th></tr></thead><tbody>${s.type.map((x) => `<tr><td>${esc(x.label)}</td><td class="r">${x.n}</td><td class="r">${s.total ? U.num((x.n / s.total) * 100) : 0}%</td></tr>`).join('')}</tbody></table>
    <table class="pl"><thead><tr class="band"><th>BY PRIORITY</th><th>Count</th></tr></thead><tbody>${s.priority.map((x) => `<tr><td${cellCls(x.level)}>${esc(x.label)}</td><td class="r">${x.n}</td></tr>`).join('')}</tbody></table>
  </div>`,
    });
  }

  function proposalExcel(rows) {
    PM.xport.excel({
      filename: `proposal-status-list-${PM.today()}`, title: 'Proposal Status List', subtitle: `${PM.COMPANY} · ${U.date(PM.today())}`,
      sheets: [{
        name: 'Proposal Status List',
        columns: [{ header: 'No.', type: 'int', width: 6 }, { header: 'Bid No.', width: 22 }, { header: 'Customer', width: 18 }, { header: 'Project Name', width: 48 }, { header: 'Type', width: 11 },
          { header: 'Value (MB)', type: 'number', width: 11 }, { header: 'Priority', width: 9 }, { header: 'Due Date', type: 'date', width: 11 }, { header: 'Start Date', type: 'date', width: 11 },
          { header: 'Progress (%)', type: 'int', width: 10 }, { header: 'Status', width: 15 }, { header: 'PM', width: 14 }, { header: 'Sales', width: 14 }, { header: 'Deliverables', width: 36 }],
        rows: rows.map((x) => [x.no, x.b.code, x.b.client, x.b.name, x.p.type, PM.canSeeBidValue(x.b) && x.b.value != null ? Number(x.b.value) / 1e6 : '', x.p.priority || '-', x.b.dueDate || '', x.b.dates.proposal || '', x.p.progress, PM.propStatusInfo(x.p.status).label, pmOf(x), salesOf(x), x.p.deliverables]),
      }],
    });
  }

  /* ---------- Award ---------- */
  function award(el, { toolbar, bids, bs, match, inPeriod, T }) {
    const waiting = bids.filter((b) => b.result === 'pending' && b.dates.submit && match(b)).sort((a, b) => (a.dates.submit < b.dates.submit ? -1 : 1));
    const decided = bids.filter((b) => b.result !== 'pending' && match(b) && inPeriod(b.resultDate || b.dates.inquiry))
      .sort((a, b) => String(b.resultDate).localeCompare(String(a.resultDate)));
    const won = decided.filter((b) => b.result === 'won'), notWon = decided.filter((b) => b.result !== 'won');
    const sd = bs.stageDays[PM.BID_STAGES.length - 1];
    const noProject = won.filter((b) => !(b.projectId && PM.find('projects', b.projectId)));
    const rows = (list, cols) => `<table class="tbl"><thead><tr>${cols.map((c) => `<th${c[2] ? ` class="${c[2]}"` : ''}>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>
      ${list.map((b) => `<tr class="click" data-bid="${esc(b.id)}">${cols.map((c) => `<td${c[2] ? ` class="${c[2]}"` : ''}>${c[1](b)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const bidCol = ['Bid', (b) => `<span class="title">${esc(PM.dash(b.code))}</span><small>${esc(PM.dash(b.name))}</small>`];
    const clientCol = ['Client', (b) => esc(PM.dash(b.client))];
    const valueCol = ['Value', (b) => V.bidMoney(b), 'num'];
    const yours = '';

    el.innerHTML = `${toolbar}
      <div class="grid cols-6">
        ${V.tile({ label: 'รอผล (ยื่นแล้ว)', value: waiting.length, sub: V.bidSum(waiting) ? `มูลค่า ${V.bidSum(waiting)}${yours}` : 'ยื่นใบเสนอราคาแล้ว', icon: 'submit' })}
        ${V.tile({ label: 'Won', value: bs.won, sub: PM.seesBidValues() ? `มูลค่า ${U.money(bs.wonValue)}${yours}` : 'ในช่วงเวลาที่เลือก', icon: 'award' })}
        ${V.tile({ label: 'Lost / No-bid', value: `${bs.lost} <small>/ ${bs.nobid}</small>`, sub: 'ในช่วงเวลาที่เลือก', icon: 'lost' })}
        ${V.tile({ label: 'Win rate', value: U.pct(bs.winRate), sub: PM.myRole() === 'admin' ? `by value ${U.pct(bs.winRateValue)}` : `${bs.won} won / ${bs.won + bs.lost} decided` })}
        ${V.tile({ label: 'Submit → Award', tag: 'Time', value: U.days(sd.avg), sub: `เวลารอผลเฉลี่ย · n=${sd.n}` })}
        ${V.tile({ label: 'Won ที่ยังไม่สร้าง Project', value: noProject.length, sub: noProject.length ? U.badge('warning', 'กด + Create project') : U.badge('good', 'สร้างครบแล้ว'), icon: 'building' })}
      </div>
      <div class="card">
        <div class="card-h"><h2>รอผลการประมูล</h2><p>ยื่นใบเสนอราคาแล้ว ยังไม่ประกาศผล · บันทึกผลได้จากปุ่มในแถว</p></div>
        <div class="card-b flush table-wrap">${waiting.length ? rows(waiting, [bidCol, clientCol, ['Sales', (b) => esc(V.salesName(b))], valueCol,
          ['ยื่นเมื่อ', (b) => U.date(b.dates.submit)], ['รอมา (วัน)', (b) => PM.diffDays(b.dates.submit, T), 'num'], EXTRA.submit[1],
          ['', (b) => (PM.canEditBid(b) ? `${V.bidButtons(b)}<button class="btn sm" data-action="nobid" data-id="${esc(b.id)}">No-bid</button>` : '<span class="muted">รอผู้รับผิดชอบบันทึกผล</span>'), 'row-actions']]) : '<p class="empty">ไม่มีงานที่รอผล</p>'}</div>
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>ได้งาน (Won)</h2><p>ในช่วงเวลาที่เลือก · สร้าง / เปิดโครงการจากงานที่ได้</p></div>
          <div class="card-b flush table-wrap">${won.length ? rows(won, [bidCol, valueCol, ['วันที่ได้งาน', (b) => U.date(b.resultDate)], ['', (b) => V.bidButtons(b), 'row-actions']]) : '<p class="empty">ยังไม่มีงานที่ได้ในช่วงเวลานี้</p>'}</div></div>
        <div class="card"><div class="card-h"><h2>ไม่ได้งาน / ไม่เสนอราคา</h2><p>Lost และ No-bid ในช่วงเวลาที่เลือก</p></div>
          <div class="card-b flush table-wrap">${notWon.length ? rows(notWon, [bidCol, valueCol, ['ผล', (b) => V.resultBadge(b)], ['วันที่', (b) => U.date(b.resultDate)]]) : '<p class="empty">ไม่มีรายการ</p>'}</div></div>
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>ผลการประมูลรายเดือน</h2><p>12 เดือนล่าสุด · ตามวันที่ประกาศผล</p></div><div class="card-b"><div class="chart" id="c-award-month"></div></div></div>
        <div class="card"><div class="card-h"><h2>Win rate by sector</h2><p>เฉพาะงานที่ประกาศผลแล้ว (Won + Lost) ในช่วงเวลาที่เลือก</p></div><div class="card-b"><div class="chart" id="c-award-sector"></div></div></div>
      </div>`;

    const months = PM.months(PM.addDays(T, -334).slice(0, 7), T.slice(0, 7));
    const inMonth = (r) => months.map((m) => bids.filter((b) => b.result === r && String(b.resultDate).slice(0, 7) === m).length);
    PM.charts.columns(document.getElementById('c-award-month'), {
      categories: months.map(U.month), label: 'Results per month',
      series: [
        { name: 'Won', color: 'var(--s1)', values: inMonth('won') },
        { name: 'Lost', color: 'var(--s2)', values: inMonth('lost') },
        { name: 'No-bid', color: 'var(--s4)', values: inMonth('nobid') },
      ],
    });
    const dec = bs.list.filter((b) => b.result === 'won' || b.result === 'lost');
    PM.charts.hbars(document.getElementById('c-award-sector'), {
      max: 1,
      items: PM.SECTORS.map((s) => {
        const d = dec.filter((b) => b.sector === s), w = d.filter((b) => b.result === 'won').length;
        return { label: s, sub: `${w}/${d.length}`, value: d.length ? w / d.length : 0, display: d.length ? U.pct(w / d.length) : '–', tip: `${s}\nWon ${w} of ${d.length} decided` };
      }).filter((x) => x.sub !== '0/0'),
    });
  }
})();
