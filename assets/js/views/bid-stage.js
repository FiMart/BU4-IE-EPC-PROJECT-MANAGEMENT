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
      ['BOQ items', (b) => U.num(b.boqItems), 'num'],
    ],
    proposal: [
      ['Estimator', (b) => esc(U.resourceName(b.estimator))],
      ['Margin', (b) => (!PM.canSeeBidPrice(b) ? V.LOCK_PRICE : b.margin != null ? U.num(b.margin, 1) + '%' : '–'), 'num'],
    ],
    submit: [
      ['ยื่นเมื่อ', (b) => U.date(b.dates.submit)],
      ['ตรงเวลา', (b) => (!b.dueDate ? '–' : b.dates.submit <= b.dueDate ? U.badge('good', 'On time') : U.badge('critical', `Late ${PM.diffDays(b.dueDate, b.dates.submit)}d`))],
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
        ${key === 'inquiry' && PM.can('bid.edit') ? '<button class="btn primary fab" data-action="new" aria-label="New inquiry"><span class="fab-i">+</span><span class="fab-t">New inquiry</span></button>' : ''}
      </div>`;

    if (key === 'award') award(el, { toolbar, bids, bs, match, inPeriod, T });
    else step(el, key, { toolbar, bids, bs, match, inPeriod, bidHours, T });

    /* events */
    const rerender = () => PM.views.bidstage(el, args);
    el.querySelector('#bid-sales').addEventListener('change', (e) => { state.sales = e.target.value; rerender(); });
    el.querySelector('#bid-q').addEventListener('input', (e) => {
      state.q = e.target.value;
      clearTimeout(state.t);
      state.t = setTimeout(() => { rerender(); const i = el.querySelector('#bid-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
    });
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg]');
      if (seg) { state[seg.dataset.seg] = seg.dataset.val; rerender(); return; }
      const act = e.target.closest('[data-action]');
      if (act) {
        if (act.dataset.action === 'new') { V.bidForm(null, rerender); return; }
        V.bidAction(act.dataset.action, act.dataset.id && PM.find('bids', act.dataset.id), rerender);
        return;
      }
      if (e.target.closest('a')) return;
      const row = e.target.closest('[data-bid]');
      if (row) V.bidForm(PM.find('bids', row.dataset.bid), rerender);
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
    const overdue = now.filter((b) => b.dueDate && b.dueDate < T);
    const dueSoon = now.filter((b) => b.dueDate && b.dueDate >= T && PM.diffDays(T, b.dueDate) <= 5);
    // left the step: started the next one, or got a result while still in it (e.g. No-bid during Estimate)
    const leftAt = (b) => (next && b.dates[next.key]) || (b.result !== 'pending' ? b.resultDate : '') || '';

    const special = {
      inquiry: () => { const n = now.filter((b) => !PM.salesKey(b)).length; return V.tile({ label: 'ยังไม่ระบุ Sales', value: n, sub: n ? U.badge('warning', 'ควรระบุผู้รับผิดชอบ') : U.badge('good', 'ครบทุกงาน'), icon: 'people' }); },
      estimate: () => V.tile({ label: 'BOQ items ที่กำลังถอด', value: U.num(PM.sum(now, (b) => b.boqItems)), sub: `ไม่มี Estimator ${now.filter((b) => !b.estimator).length} งาน`, icon: 'layers' }),
      proposal: () => {
        if (!PM.seesBidPrices()) return V.tile({ label: 'Margin เฉลี่ย', value: V.LOCK_PRICE, sub: 'เห็นได้เฉพาะ Sales / Admin', icon: 'coins' });
        const m = now.filter((b) => PM.canSeeBidPrice(b) && b.margin != null);
        return V.tile({ label: 'Margin เฉลี่ย', value: m.length ? U.num(PM.sum(m, (b) => b.margin) / m.length, 1) + '%' : '–', sub: `มูลค่ารวม ${V.bidSum(now)}${PM.myRole() === 'sales' ? ' · เฉพาะงานของคุณ' : ''}`, icon: 'coins' });
      },
      submit: () => {
        const w = now.map((b) => PM.diffDays(b.dates.submit, T));
        return V.tile({ label: 'รอผลเฉลี่ย', tag: 'Time', value: w.length ? `${U.num(PM.sum(w) / w.length, 1)} <small>days</small>` : '–', sub: `นานสุด ${w.length ? Math.max(...w) : 0} วัน`, icon: 'clock' });
      },
    }[key];

    const extra = EXTRA[key];
    el.innerHTML = `${toolbar}
      <div class="grid cols-6">
        ${V.tile({ label: `${st.label} ตอนนี้`, value: now.length, sub: V.bidSum(now) ? `มูลค่า ${V.bidSum(now)}${PM.myRole() === 'sales' ? ' (งานของคุณ)' : ''}` : 'งานที่อยู่ในขั้นนี้', icon: key })}
        ${V.tile({ label: 'เข้าขั้นนี้', tag: 'Quantity', value: bs.reached[key], sub: i ? `Conversion จาก Inquiry ${U.pct(bs.total ? bs.reached[key] / bs.total : null)}` : 'Inquiry ทั้งหมดในช่วงเวลา' })}
        ${V.tile({ label: 'เวลาเฉลี่ย', tag: 'Time', value: U.days(sd.avg), sub: `${esc(sd.label)} · n=${sd.n}` })}
        ${key === 'submit'
          ? V.tile({ label: 'On-time submission', tag: 'Time', value: U.pct(bs.onTimeRate), sub: 'ยื่นก่อน / ตรง due date' })
          : V.tile({ label: 'เลยกำหนดยื่น', value: overdue.length, sub: overdue.length ? U.badge('critical', `${overdue.length} งานเลย Due`) : dueSoon.length ? U.badge('warning', `${dueSoon.length} งาน Due ภายใน 5 วัน`) : U.badge('good', 'ไม่มีงานเลยกำหนด'), icon: 'alert' })}
        ${V.tile({ label: 'ชั่วโมง', tag: 'Hours', value: U.num(PM.sum(hrs, (t) => t.hours), 1), sub: `${new Set(hrs.map((t) => t.resourceId)).size} คน · จาก Timesheet` })}
        ${special()}
      </div>
      <div class="card">
        <div class="card-h"><h2>งานที่อยู่ในขั้น ${esc(st.label)} ตอนนี้</h2><p>${esc(st.th)} · เรียงตาม Due date · คลิกแถวเพื่อแก้ไข · ปุ่ม ${next ? `→ ${esc(next.label)} = เลื่อนไปขั้นถัดไป (บันทึกวันที่ = วันนี้)` : 'Won / Lost = บันทึกผลการประมูล'}</p></div>
        <div class="card-b flush table-wrap">${now.length ? `<table class="tbl"><thead><tr>
          <th>Bid</th><th>Client</th><th>Sales</th><th class="num">Value</th>${extra.map((c) => `<th${c[2] ? ` class="${c[2]}"` : ''}>${esc(c[0])}</th>`).join('')}
          <th>เข้าขั้นเมื่อ</th><th class="num">อยู่มา (วัน)</th><th>Due</th><th class="num">ชม. ขั้นนี้</th><th class="num">ไฟล์</th><th></th></tr></thead><tbody>
          ${now.map((b) => `<tr class="click" data-bid="${esc(b.id)}">
            <td><span class="title">${esc(b.code)}</span><small>${esc(b.name)}</small></td>
            <td>${esc(b.client)}</td><td>${esc(V.salesName(b))}</td><td class="num">${V.bidMoney(b)}</td>
            ${extra.map((c) => `<td${c[2] ? ` class="${c[2]}"` : ''}>${c[1](b)}</td>`).join('')}
            <td>${U.date(b.dates[key])}</td><td class="num">${PM.diffDays(b.dates[key], T)}</td><td>${V.dueBadge(b) || '–'}</td>
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
            <td><span class="title">${esc(b.code)}</span><small>${esc(b.name)}</small></td><td>${esc(b.client)}</td><td class="num">${V.bidMoney(b)}</td>
            <td>${U.date(b.dates[key])}</td><td>${U.date(out)}</td><td class="num">${out ? PM.diffDays(b.dates[key], out) : '–'}</td>
            <td class="num">${hoursBy[b.id] ? U.num(hoursBy[b.id], 1) : '–'}</td><td>${V.resultBadge(b)}</td></tr>`; }).join('')}
          </tbody></table>` : '<p class="empty">ยังไม่มีงานที่ผ่านขั้นนี้ในช่วงเวลาที่เลือก</p>'}</div>
      </div>
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
    const bidCol = ['Bid', (b) => `<span class="title">${esc(b.code)}</span><small>${esc(b.name)}</small>`];
    const clientCol = ['Client', (b) => esc(b.client)];
    const valueCol = ['Value', (b) => V.bidMoney(b), 'num'];
    const yours = PM.myRole() === 'sales' ? ' (งานของคุณ)' : '';

    el.innerHTML = `${toolbar}
      <div class="grid cols-6">
        ${V.tile({ label: 'รอผล (ยื่นแล้ว)', value: waiting.length, sub: V.bidSum(waiting) ? `มูลค่า ${V.bidSum(waiting)}${yours}` : 'ยื่นใบเสนอราคาแล้ว', icon: 'submit' })}
        ${V.tile({ label: 'Won', value: bs.won, sub: PM.seesBidPrices() ? `มูลค่า ${U.money(bs.wonValue)}${yours}` : 'ในช่วงเวลาที่เลือก', icon: 'award' })}
        ${V.tile({ label: 'Lost / No-bid', value: `${bs.lost} <small>/ ${bs.nobid}</small>`, sub: 'ในช่วงเวลาที่เลือก', icon: 'lost' })}
        ${V.tile({ label: 'Win rate', value: U.pct(bs.winRate), sub: PM.myRole() === 'admin' ? `by value ${U.pct(bs.winRateValue)}` : `${bs.won} won / ${bs.won + bs.lost} decided` })}
        ${V.tile({ label: 'Submit → Award', tag: 'Time', value: U.days(sd.avg), sub: `เวลารอผลเฉลี่ย · n=${sd.n}` })}
        ${V.tile({ label: 'Won ที่ยังไม่สร้าง Project', value: noProject.length, sub: noProject.length ? U.badge('warning', 'กด + Create project') : U.badge('good', 'สร้างครบแล้ว'), icon: 'building' })}
      </div>
      <div class="card">
        <div class="card-h"><h2>รอผลการประมูล</h2><p>ยื่นใบเสนอราคาแล้ว ยังไม่ประกาศผล · บันทึกผลได้จากปุ่มในแถว</p></div>
        <div class="card-b flush table-wrap">${waiting.length ? rows(waiting, [bidCol, clientCol, ['Sales', (b) => esc(V.salesName(b))], valueCol,
          ['ยื่นเมื่อ', (b) => U.date(b.dates.submit)], ['รอมา (วัน)', (b) => PM.diffDays(b.dates.submit, T), 'num'], EXTRA.submit[1],
          ['', (b) => (PM.canEditBid(b) ? `${V.bidButtons(b)}<button class="btn sm" data-action="nobid" data-id="${esc(b.id)}">No-bid</button>` : '<span class="muted">รอ Sales บันทึกผล</span>'), 'row-actions']]) : '<p class="empty">ไม่มีงานที่รอผล</p>'}</div>
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
