/* bidding.js — Before Award: Inquiry → Estimate → Proposal → Submit */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  const state = U.keep('bidding', { period: '12m', mode: 'kanban', q: '', sales: '' }, ['period', 'mode', 'sales']); // sales: '' = everyone, '-' = no salesperson
  PM.biddingState = state; // the step pages (bid-stage.js) share the period / Sales / search filters

  /* what is still to be handed in: overdue + due within 14 days (not tied to the period — it is today's work) */
  function dueTile(bids, T) {
    const due = PM.bidsDueSoon(bids, T), late = due.filter((b) => b.dueDate < T).length;
    const tip = due.length ? due.slice(0, 8).map((b) => `${U.date(b.dueDate)} · ${PM.dash(b.name)}`).join('\n') + (due.length > 8 ? `\nและอีก ${due.length - 8} งาน` : '') : 'ไม่มีงานที่ต้องยื่นใน 14 วัน';
    return V.tile({
      label: 'ใกล้ถึงกำหนดยื่น', tag: 'Time', icon: 'clock', tip,
      value: `${due.length} <small>งาน</small>`,
      sub: due.length ? `${late ? `<b style="color:var(--critical-text)">เลยกำหนด ${late} งาน</b><br>` : ''}ต้องยื่นใน 14 วัน ${due.length - late} งาน` : 'ไม่มีงานค้างยื่นใน 14 วัน',
    });
  }

  PM.views.bidding = function (el) {
    const db = PM.db, T = PM.today();
    const { from, to } = V.periodRange(state.period);
    const salesRows = PM.salesStats(from, to);
    if (state.sales && !salesRows.some((x) => (x.id || '-') === state.sales)) state.sales = '';
    const bids = db.bids.filter((b) => !state.sales || (PM.salesKey(b) || '-') === state.sales);
    const bs = PM.bidStats(bids, from, to);
    const q = state.q.toLowerCase();
    const match = (b) => !q || [b.code, b.name, b.client, b.contact, V.salesName(b)].join(' ').toLowerCase().includes(q);
    const inPeriod = (d) => d && (!from || d >= from) && (!to || d <= to);
    const hoursBy = {};
    db.timesheets.forEach((t) => { if (t.kind === 'bid') hoursBy[t.refId] = (hoursBy[t.refId] || 0) + t.hours; });

    const pending = bids.filter((b) => b.result === 'pending' && match(b));
    const cols = PM.BID_STAGES.map((s) => ({ key: s.key, label: s.label, th: s.th, items: pending.filter((b) => b.stage === s.key) }));
    cols.push({ key: 'won', label: 'Won', th: 'ได้งาน', items: bids.filter((b) => b.result === 'won' && match(b) && inPeriod(b.resultDate || b.dates.inquiry)) });
    cols.push({ key: 'lost', label: 'Lost / No-bid', th: 'ไม่ได้งาน / ไม่เสนอราคา', items: bids.filter((b) => (b.result === 'lost' || b.result === 'nobid') && match(b) && inPeriod(b.resultDate || b.dates.inquiry)) });
    const salesOpt = (id, label) => `<option value="${esc(id)}"${state.sales === id ? ' selected' : ''}>${esc(label)}</option>`;

    el.innerHTML = `
      ${V.bidTabs('')}
      <div class="row">
        ${V.seg('period', V.periods, state.period)}
        ${V.seg('mode', [{ key: 'kanban', label: 'Board' }, { key: 'table', label: 'Table' }], state.mode)}
        <select id="bid-sales" aria-label="Sales" style="width:auto">${salesOpt('', 'Sales: ทุกคน')}${salesRows.map((x) => salesOpt(x.id || '-', x.id ? 'Sales: ' + V.personName(x.id, x.fallbackName) : 'ไม่ระบุ Sales')).join('')}</select>
        <input type="search" id="bid-q" placeholder="ค้นหา bid / ลูกค้า / Sales…" value="${esc(state.q)}" style="width:220px">
        <span class="spacer"></span>
        ${PM.can('bid.edit') ? '<button class="btn primary fab" data-action="new" aria-label="New inquiry"><span class="fab-i">+</span><span class="fab-t">New inquiry</span></button>' : ''}
      </div>
      ${V.flow(PM.BID_STAGES.map((s, i) => ({
        label: s.label, th: s.th, href: '#/bidding/' + s.key,
        big: `${bs.reached[s.key]} <small class="muted" style="font-size:12px">งาน</small>`,
        meta: `avg ${U.days(bs.stageDays[i].avg)} ${i === 3 ? '→ award' : 'in stage'}`,
        tip: `${s.label}\nBids reaching this stage: ${bs.reached[s.key]}\nConversion from Inquiry: ${U.pct(bs.total ? bs.reached[s.key] / bs.total : null)}\nAvg time: ${U.days(bs.stageDays[i].avg)}\nคลิกเพื่อเปิดหน้า ${s.label}`,
      })).concat([{ n: '→', label: 'Award', th: 'Won / Lost / No-bid', href: '#/bidding/award', big: `${bs.won} <small class="muted" style="font-size:12px">/ ${bs.lost} / ${bs.nobid}</small>`, meta: `Win rate ${U.pct(bs.winRate)}` }]))}
      <div class="grid cols-6">
        ${V.tile({ label: 'Inquiries received', tag: 'Quantity', value: bs.total, sub: `${bs.pipeline} ยังอยู่ระหว่างดำเนินการ` })}
        ${V.tile({ label: 'Proposals submitted', tag: 'Quantity', value: bs.submitted, sub: `Submit ratio ${U.pct(bs.total ? bs.submitted / bs.total : null)}` })}
        ${dueTile(bids.filter(match), T)}
        ${V.tile({ label: 'On-time submission', tag: 'Time', value: U.pct(bs.onTimeRate), sub: `ยื่นก่อน / ตรง due date${bs.assumedSubmit ? ` · ไม่นับ ${bs.assumedSubmit} งานที่ไม่มีวันยื่นจริง` : ''}` })}
        ${V.tile({ label: 'Win rate', value: U.pct(bs.winRate), sub: `${bs.won} won / ${bs.won + bs.lost} decided` })}
        ${PM.seesBidPrices()
          ? V.tile({ label: 'Won value', value: U.money(bs.wonValue), sub: `Pipeline ${U.money(bs.pipelineValue)}${PM.myRole() === 'sales' ? ' · เฉพาะงานของคุณ' : ''}` })
          : V.tile({ label: 'Won / Lost', value: `${bs.won} <small>/ ${bs.lost}</small>`, sub: `No-bid ${bs.nobid} · มูลค่าเห็นได้เฉพาะ Sales / Admin`, icon: 'award' })}
      </div>
      <div class="card">
        <div class="card-h"><h2>${state.mode === 'kanban' ? 'Bid board' : 'Bid register'}</h2><p>${state.mode === 'kanban'
          ? (PM.can('bid.edit') ? `งานเร่งด่วนอยู่บนสุด · คลิกการ์ดเพื่อแก้ไข · ปุ่มท้ายการ์ดเลื่อนขั้น (บันทึกวันที่ = วันนี้) · Status Complete = ยื่นแล้ว${PM.myRole() === 'sales' ? ' · เลื่อนขั้น / Won / Lost ได้เฉพาะงานของคุณ' : ''}` :'คลิกการ์ดเพื่อดูรายละเอียด · เลื่อนขั้นและบันทึกผล Won / Lost ทำได้เฉพาะ Admin · Project Manager · Engineer และ Sales ผู้รับผิดชอบงาน')
          : 'รายการ Bid ทั้งหมดในช่วงเวลาที่เลือก + งานที่ยังดำเนินการ'}</p></div>
        <div class="card-b">${state.mode === 'kanban' ? kanban(cols, hoursBy) : table(bids.filter((b) => match(b) && (b.result === 'pending' || inPeriod(b.dates.inquiry))), hoursBy)}</div>
      </div>
      <div class="card">
        <div class="card-h"><h2>ผลงาน Sales</h2><p>งานที่ Sales แต่ละคนหาลูกค้ามา (Inquiry ในช่วงเวลาที่เลือก) และโครงการที่รับผิดชอบ · คลิกแถวเพื่อกรองเฉพาะคนนั้น</p></div>
        <div class="card-b flush table-wrap" id="sales-perf">${V.salesTable(salesRows, state.sales ? (state.sales === '-' ? '' : state.sales) : null)}</div>
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>Win rate by sector</h2><p>เฉพาะงานที่ประกาศผลแล้ว (Won + Lost)</p></div><div class="card-b"><div class="chart" id="c-sector"></div></div></div>
        <div class="card"><div class="card-h"><h2>Estimator workload</h2><p>จำนวน bid และชั่วโมงจาก Timesheet ในช่วงเวลาที่เลือก</p></div><div class="card-b"><div class="chart" id="c-est"></div></div></div>
      </div>
      <div class="card"><div class="card-h"><h2>ที่มาของงาน (Lead source)</h2><p>จำนวน Inquiry และ Win rate แยกตามช่องทางที่ได้งานมา</p></div><div class="card-b"><div class="chart" id="c-source"></div></div></div>`;

    V.bindFlowLinks(el); // each step opens its own page
    if (state.flash) {
      const moved = el.querySelector('.kcard.flash');
      if (moved) moved.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      state.flash = null;
    }

    /* charts */
    const decided = bs.list.filter((b) => b.result === 'won' || b.result === 'lost');
    PM.charts.hbars(document.getElementById('c-sector'), {
      max: 1,
      items: PM.SECTORS.map((s) => {
        const d = decided.filter((b) => b.sector === s), w = d.filter((b) => b.result === 'won').length;
        return { label: s, sub: `${w}/${d.length}`, value: d.length ? w / d.length : 0, display: d.length ? U.pct(w / d.length) : '–', tip: `${s}\nWon ${w} of ${d.length} decided` };
      }).filter((x) => x.sub !== '0/0'),
    });
    const ts = db.timesheets.filter((t) => t.kind === 'bid' && inPeriod(t.date));
    const est = db.resources.map((r) => ({ r, bids: bs.list.filter((b) => b.estimator === r.id).length, hours: PM.sum(ts.filter((t) => t.resourceId === r.id), (t) => t.hours) })).filter((x) => x.bids || x.hours);
    PM.charts.hbars(document.getElementById('c-est'), {
      items: est.sort((a, b) => b.hours - a.hours).map((x) => ({ label: x.r.name, sub: `${x.bids} bids`, value: x.hours, display: U.num(x.hours) + ' h', color: 'var(--s2)', tip: `${x.r.name}\nBids as estimator: ${x.bids}\nBidding hours: ${U.num(x.hours)}` })),
    });

    const srcs = PM.LEAD_SOURCES.concat(bs.list.some((b) => !b.leadSource) ? [''] : []);
    PM.charts.hbars(document.getElementById('c-source'), {
      items: srcs.map((s) => {
        const mine = bs.list.filter((b) => (b.leadSource || '') === s);
        const w = mine.filter((b) => b.result === 'won').length, d = mine.filter((b) => b.result === 'won' || b.result === 'lost').length;
        const label = s || 'ไม่ระบุ';
        return { label, sub: `Win ${d ? U.pct(w / d) : '–'}`, value: mine.length, display: `${mine.length} งาน`, color: 'var(--s3)', tip: `${label}\nInquiries ${mine.length}${V.bidSum(mine) ? ' · ' + V.bidSum(mine) : ''}\nWon ${w} of ${d} decided` };
      }).filter((x) => x.value).sort((a, b) => b.value - a.value),
    });

    /* events */
    const rerender = () => PM.views.bidding(el);
    el.querySelector('#bid-sales').addEventListener('change', (e) => { state.sales = e.target.value; rerender(); });
    el.querySelector('#bid-q').addEventListener('input', (e) => {
      state.q = e.target.value;
      clearTimeout(state.t);
      state.t = setTimeout(() => { rerender(); const i = el.querySelector('#bid-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
    });
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg]');
      if (seg) { state[seg.dataset.seg] = seg.dataset.val; rerender(); return; }
      const sr = !e.target.closest('a') && e.target.closest('tr[data-sales]');
      if (sr) { state.sales = state.sales === sr.dataset.sales ? '' : sr.dataset.sales; rerender(); return; }
      const act = e.target.closest('[data-action]');
      if (act) {
        const b = act.dataset.id && PM.find('bids', act.dataset.id);
        const a = act.dataset.action;
        if (a === 'new') V.bidForm(null, rerender);
        if (a === 'next' && b) state.flash = b.id; // the moved card is highlighted and scrolled into view
        V.bidAction(a, b, rerender);
        return;
      }
      const card = e.target.closest('[data-bid]');
      if (card) V.bidForm(PM.find('bids', card.dataset.bid), rerender);
    };
  };

  /* what needs attention comes first: open work by due date (none last), results newest first */
  const boardOrder = (a, b) => (a.result === 'pending'
    ? String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))
    : String(b.resultDate || '').localeCompare(String(a.resultDate || '')));
  function kanban(cols, hoursBy) {
    return `<div class="kanban">${cols.map((c) => `
      <section class="kcol${c.items.length ? '' : ' is-empty'}">
        <div class="kcol-h">${PM.illus.icon(c.key, 'kc-ic')}<a class="kcol-link" href="#/bidding/${c.key === 'won' || c.key === 'lost' ? 'award' : c.key}" title="เปิดหน้า ${esc(c.label)}">${esc(c.label)}</a><span class="count">${c.items.length}</span>
          <span class="sum"><span class="th">${esc(c.th)}</span>${c.items.length && V.bidSum(c.items) ? `<b>${V.bidSum(c.items)}</b>` : ''}</span></div>
        <div class="kcol-body">${c.items.slice().sort(boardOrder).map((b, k) => card(b, c.key, hoursBy, k)).join('') || '<p class="empty">ไม่มีงาน</p>'}</div>
      </section>`).join('')}</div>`;
  }

  const initials = (name) => {
    const w = String(name || '').replace(/^(คุณ|นาย|นาง(สาว)?|p['’]?\s)/i, '').trim().split(/\s+/).filter(Boolean);
    return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase();
  };
  function card(b, col, hoursBy, k) {
    const actions = V.bidButtons(b, { compact: true });
    const pending = b.result === 'pending';
    const age = b.dates[b.stage] ? PM.diffDays(b.dates[b.stage], PM.today()) : 0; // no date for the step (Inquiry left empty): no age to show
    const flash = state.flash === b.id ? ' flash' : '';
    // the card's edge says how urgent it is, only while it is still waiting to go out
    const left = pending && !b.dates.submit && b.dueDate ? PM.diffDays(PM.today(), b.dueDate) : null;
    const urgency = left == null ? '' : left < 0 ? ' kc-late' : left <= 5 ? ' kc-soon' : '';
    const sales = V.salesName(b), hasSales = !!PM.salesKey(b);
    const est = b.estimator ? U.resourceName(b.estimator) : '';
    const money = !PM.canSeeBidPrice(b) ? V.LOCK_PRICE : b.value ? U.money(b.value) : '<span class="muted" title="ไม่ระบุมูลค่า">—</span>';
    return `<article class="kcard${urgency}${flash}" style="--k:${k}" data-bid="${b.id}">
      <div class="kc-top"><span class="code" title="${esc(PM.dash(b.code))}${b.sector ? ` · ${esc(b.sector)}` : ''}">${esc(PM.dash(b.code))}</span></div>
      <div class="name" title="${esc(PM.dash(b.name))}">${esc(PM.dash(b.name))}</div>
      <div class="client">${esc(PM.dash(b.client))}</div>
      <div class="kc-meta"><span class="v">${money}</span>${PM.canSeeBidPrice(b) ? PM.poFiles.clip(b.files, `data-action="bid-files" data-id="${esc(b.id)}"`) : ''}${V.dueBadge(b)}</div>
      <div class="kc-people">
        <span class="kc-av${hasSales ? '' : ' none'}" aria-hidden="true">${hasSales ? esc(initials(sales)) : '–'}</span>
        <span class="kc-who" title="Sales ${esc(sales)}${est ? ` · Estimator ${esc(est)}` : ''}${hoursBy[b.id] ? ` · ${U.num(hoursBy[b.id])} ชั่วโมงจาก Timesheet` : ''}">${hasSales ? esc(sales) : 'ไม่ระบุ Sales'}${est ? `<small>Est. ${esc(est)}</small>` : ''}</span>
        ${pending && age > 0 && !b.submitAssumed ? `<span class="kc-tag" title="อยู่ในขั้นนี้มาแล้ว ${age} วัน">ค้าง ${age} วัน</span>` : ''}
      </div>
      ${actions ? `<div class="actions">${actions}</div>` : ''}
    </article>`;
  }

  function table(list, hoursBy) {
    if (!list.length) return '<p class="empty">ไม่พบรายการ</p>';
    list = list.slice().sort((a, b) => (a.dates.inquiry < b.dates.inquiry ? 1 : -1));
    return `<div class="table-wrap"><table class="tbl"><thead><tr>
      <th>Bid</th><th>Client</th><th>Sales</th><th>Sector</th><th class="num">Value</th><th class="num">BOQ items</th>
      <th>Inquiry</th><th>Submitted</th><th>Due</th><th class="num">Cycle (d)</th><th class="num">Hours</th><th>Status</th><th>Timing</th><th class="num">ไฟล์</th></tr></thead><tbody>
      ${list.map((b) => `<tr class="click" data-bid="${b.id}">
        <td><span class="title">${esc(PM.dash(b.code))}</span><small>${esc(PM.dash(b.name))}</small></td>
        <td>${esc(PM.dash(b.client))}${b.contact ? `<small>${esc(b.contact)}</small>` : ''}</td><td>${esc(V.salesName(b))}${b.leadSource ? `<small>${esc(b.leadSource)}</small>` : ''}</td><td>${esc(b.sector)}</td>
        <td class="num">${V.bidMoney(b)}</td><td class="num">${U.num(b.boqItems)}</td>
        <td>${U.date(b.dates.inquiry)}</td><td>${U.date(b.dates.submit)}</td><td>${U.date(b.dueDate)}</td>
        <td class="num">${b.dates.submit && b.dates.inquiry ? PM.diffDays(b.dates.inquiry, b.dates.submit) : '–'}</td>
        <td class="num">${U.num(hoursBy[b.id] || 0)}</td>
        <td>${V.resultBadge(b)}</td><td>${V.dueBadge(b)}</td>
        <td class="num">${PM.canSeeBidPrice(b) ? PM.poFiles.clip(b.files, `data-action="bid-files" data-id="${esc(b.id)}"`) || '–' : V.LOCK_PRICE}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
})();
