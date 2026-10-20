/* billing.js — project tab "งวดเงิน" (progress billing & collection)
   Invoices to the client: advance · progress claims (by % work done) · retention release · other.
   Net = amount − advance recovery − retention. Status: draft → issued (วางบิลแล้ว) → paid (รับเงินแล้ว); issued past its due date = overdue.
   Compares money received with the Cash Flow plan, shows work done but not billed yet, outstanding and retention held.
   Data: p.invoices = [{ id, no, type, title, date, dueDate, progress, amount, advance, retention, status, paidDate, paidAmount, note }] */
(function () {
  const U = PM.ui, esc = U.esc;
  PM.INV_TYPES = [
    { key: 'progress', label: 'งวดงานตามผลงาน' },
    { key: 'advance', label: 'เงินล่วงหน้า (Advance)' },
    { key: 'retention', label: 'คืนเงินประกันผลงาน (Retention)' },
    { key: 'other', label: 'อื่น ๆ' },
  ];
  PM.INV_STATUS = [
    { key: 'draft', label: 'ร่าง', level: 'neutral' },
    { key: 'issued', label: 'วางบิลแล้ว', level: 'warning' },
    { key: 'paid', label: 'รับเงินแล้ว', level: 'good' },
  ];
  const num = (v) => Number(v) || 0;
  const typeLabel = (k) => (PM.INV_TYPES.find((t) => t.key === k) || PM.INV_TYPES[3]).label;
  PM.invNet = (i) => num(i.amount) - num(i.advance) - num(i.retention);
  PM.invOverdue = (i, T) => i.status === 'issued' && i.dueDate && i.dueDate < (T || PM.today());

  /* billing totals of a project */
  PM.billingSummary = function (p, m) {
    const T = PM.today();
    const list = (p.invoices || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const live = list.filter((i) => i.status !== 'draft');
    const contract = PM.revisedContract ? PM.revisedContract(p) : num(p.contractValue);
    const paid = live.filter((i) => i.status === 'paid'), open = live.filter((i) => i.status === 'issued');
    const prog = live.filter((i) => i.type === 'progress');
    const act = m ? m.act : PM.projectMetrics(p).act;
    const progressBilled = PM.sum(prog, (i) => num(i.amount));
    return {
      list, contract,
      billed: PM.sum(live, (i) => num(i.amount)),
      received: PM.sum(paid, (i) => num(i.paidAmount) || PM.invNet(i)),
      outstanding: PM.sum(open, PM.invNet), open,
      overdue: open.filter((i) => PM.invOverdue(i, T)),
      retentionHeld: Math.max(0, PM.sum(prog, (i) => num(i.retention)) - PM.sum(live.filter((i) => i.type === 'retention'), (i) => num(i.amount))),
      advanceLeft: Math.max(0, PM.sum(live.filter((i) => i.type === 'advance'), (i) => num(i.amount)) - PM.sum(prog, (i) => num(i.advance))),
      claimed: prog.length ? Math.max(...prog.map((i) => num(i.progress))) : 0, // highest % claimed so far
      earned: contract * act, progressBilled,
      unbilled: Math.max(0, contract * act - progressBilled),
    };
  };
  const nextNo = (p) => {
    const max = (p.invoices || []).reduce((mx, i) => { const n = parseInt(String(i.no || '').replace(/^.*?(\d+)$/, '$1'), 10); return isNaN(n) ? mx : Math.max(mx, n); }, 0);
    return `INV-${String(p.code).replace(/^PJ-/, '')}-${String(max + 1).padStart(2, '0')}`;
  };
  const terms = (p) => { const cf = PM.cashflowSaved ? PM.cashflowSaved(p) : null; return cf ? cf.a : { advance: 10, retention: 5, recvLag: 1 }; };

  PM.billingTab = function (el, p, m, rerender) {
    const canEdit = PM.can('billing.edit');
    const T = PM.today();
    const s = PM.billingSummary(p, m);
    const V = PM.common;
    const st = (i) => (PM.invOverdue(i, T) ? { level: 'critical', label: `เกินกำหนด ${PM.diffDays(i.dueDate, T)} วัน` } : PM.INV_STATUS.find((x) => x.key === i.status) || PM.INV_STATUS[0]);
    el.innerHTML = `
      <div class="row"><p class="muted" style="margin:0">ฐานคิด: มูลค่าสัญญา${s.contract !== num(p.contractValue) ? 'ปรับปรุง (รวม VO อนุมัติ)' : ''} ${U.money(s.contract)} · ไม่รวม VAT · เงื่อนไข: เงินล่วงหน้า ${U.num(terms(p).advance)}% · Retention ${U.num(terms(p).retention)}% (ตั้งได้ที่แท็บ Cash Flow)</p>
        <span class="spacer"></span>${canEdit ? '<button class="btn primary" data-inv="new">+ วางบิลงวดใหม่</button>' : ''}</div>
      <div class="grid cols-5">
        ${V.tile({ label: 'วางบิลแล้ว', value: U.money(s.billed), sub: `${U.pct(s.contract ? s.billed / s.contract : null)} ของสัญญา · เบิกผลงานถึง ${U.num(s.claimed, 1)}%`, icon: 'proposal' })}
        ${V.tile({ label: 'รับเงินแล้ว', value: U.money(s.received), sub: `${U.pct(s.contract ? s.received / s.contract : null)} ของสัญญา` })}
        ${V.tile({ label: 'ค้างรับ', value: `<span class="${s.overdue.length ? 'neg' : ''}">${U.money(s.outstanding)}</span>`, sub: s.overdue.length ? U.badge('critical', `เกินกำหนด ${s.overdue.length} งวด · ${U.money(PM.sum(s.overdue, PM.invNet))}`) : s.open.length ? `${s.open.length} งวดรอชำระ` : U.badge('good', 'ไม่มียอดค้าง') })}
        ${V.tile({ label: 'ผลงานที่ยังไม่ได้วางบิล', tag: 'Unbilled', value: U.money(s.unbilled), sub: `ผลงาน ${U.pct(m.act)} = ${U.money(s.earned)} · เบิกแล้ว ${U.money(s.progressBilled)}`, tip: 'มูลค่าสัญญา × % งานเสร็จ − ยอดวางบิลงวดผลงาน' })}
        ${V.tile({ label: 'Retention ที่ถูกหักไว้', value: U.money(s.retentionHeld), sub: `เงินล่วงหน้าคงเหลือที่ต้องหักคืน ${U.money(s.advanceLeft)}` })}
      </div>
      <div class="card"><div class="card-h"><h2>เงินรับสะสม — จริง เทียบแผน Cash Flow</h2><p>เส้นประ = แผนรับเงิน (Cash Flow · Base) · เส้นทึบ = รับเงินจริงตามวันที่รับ</p></div><div class="card-b"><div class="chart" id="c-bill"></div></div></div>
      <div class="card"><div class="card-h"><h2>งวดเงิน — ${esc(p.code)}</h2><p>${canEdit ? 'คลิกงวดเพื่อแก้ไข · บันทึกวันที่รับเงินเมื่อลูกค้าจ่าย · ' : ''}สุทธิ = ยอดวางบิล − หักเงินล่วงหน้า − หัก Retention</p></div>
        <div class="card-b flush table-wrap">${s.list.length ? `<table class="tbl"><thead><tr><th>เลขที่</th><th>งวด</th><th>วางบิล</th><th>ครบกำหนด</th><th class="num">ยอดวางบิล</th><th class="num">หักล่วงหน้า</th><th class="num">หัก Retention</th><th class="num">สุทธิ</th><th>สถานะ</th></tr></thead><tbody>
          ${s.list.slice().reverse().map((i) => { const x = st(i); return `<tr class="click" data-inv="edit" data-id="${esc(i.id)}">
            <td><span class="title">${esc(i.no)}</span></td>
            <td><span class="title">${esc(i.title || typeLabel(i.type))}</span><small>${esc(typeLabel(i.type))}${i.type === 'progress' && i.progress ? ` · ผลงานสะสม ${U.num(i.progress, 1)}%` : ''}</small></td>
            <td class="nowrap">${U.date(i.date)}</td><td class="nowrap">${U.date(i.dueDate)}</td>
            <td class="num">${U.money(num(i.amount))}</td><td class="num">${num(i.advance) ? '−' + U.money(num(i.advance)) : '–'}</td><td class="num">${num(i.retention) ? '−' + U.money(num(i.retention)) : '–'}</td>
            <td class="num"><b>${U.money(PM.invNet(i))}</b></td>
            <td>${U.badge(x.level, x.label)}${i.status === 'paid' && i.paidDate ? `<small>รับ ${U.date(i.paidDate)}</small>` : ''}</td></tr>`; }).join('')}
          </tbody><tfoot><tr><td></td><td>รวม (ไม่นับร่าง)</td><td></td><td></td><td class="num">${U.money(s.billed)}</td><td></td><td></td><td class="num">${U.money(PM.sum(s.list.filter((i) => i.status !== 'draft'), PM.invNet))}</td><td></td></tr></tfoot></table>`
          : `<p class="empty">ยังไม่มีงวดเงิน${canEdit ? ' — กด "+ วางบิลงวดใหม่" (เริ่มจากเงินล่วงหน้า หรืองวดผลงาน)' : ''}</p>`}</div></div>`;

    // received vs plan
    const cf = PM.cashflowSaved && PM.cashflowModel(p, PM.cashflowSaved(p), 'base');
    const paid = s.list.filter((i) => i.status === 'paid' && i.paidDate);
    const first = [cf && cf.months[0], ...paid.map((i) => i.paidDate.slice(0, 7))].filter(Boolean).sort()[0] || T.slice(0, 7);
    const last = [cf && cf.lastYm, T.slice(0, 7)].filter(Boolean).sort().pop();
    const months = PM.months(first, last);
    let acc = 0, pc = 0;
    const planCum = cf ? months.map((ym) => { const k = cf.months.indexOf(ym); if (k >= 0) pc += cf.cashIn[k]; return pc; }) : null;
    const actCum = months.map((ym) => { if (ym > T.slice(0, 7)) return null; acc += PM.sum(paid.filter((i) => i.paidDate.slice(0, 7) === ym), (i) => num(i.paidAmount) || PM.invNet(i)); return acc; });
    PM.charts.lines(el.querySelector('#c-bill'), {
      labels: months.map(U.month), marker: months.indexOf(T.slice(0, 7)), markerLabel: 'วันนี้', fmt: U.money, axisFmt: U.money, label: 'Cumulative cash received',
      series: (planCum ? [{ name: 'แผน (Cash Flow)', color: 'var(--s1)', dash: true, values: planCum }] : []).concat([{ name: 'รับจริง', color: 'var(--s3)', values: actCum }]),
    });

    el.onclick = (e) => {
      const a = e.target.closest('[data-inv]');
      if (!a) return;
      if (a.dataset.inv === 'new') invForm(p, m, null, rerender);
      if (a.dataset.inv === 'edit') invForm(p, m, (p.invoices || []).find((i) => i.id === a.dataset.id), rerender);
    };
  };

  function invForm(p, m, inv, done) {
    const canEdit = PM.can('billing.edit');
    if (!inv && !canEdit) return;
    const T = PM.today(), t = terms(p), s = PM.billingSummary(p, m);
    const lag = Math.max(30, Math.round(num(t.recvLag) * 30));
    // a new claim starts as "progress up to today's % done", sized from what was claimed before
    const prog = Math.round(m.act * 1000) / 10;
    const gross = Math.max(0, Math.round(s.contract * (prog - s.claimed) / 100));
    const i = inv || { id: PM.uid('INV'), no: nextNo(p), type: 'progress', title: `งวดผลงาน ${U.month(T.slice(0, 7))}`, date: T, dueDate: PM.addDays(T, lag), progress: prog, amount: gross,
      advance: Math.round(gross * num(t.advance) / 100), retention: Math.round(gross * num(t.retention) / 100), status: 'draft', paidDate: '', paidAmount: '', note: '' };
    const form = U.modal({
      title: inv ? `${i.no} · ${i.title || typeLabel(i.type)}` : `วางบิลงวดใหม่ — ${p.code}`, wide: true,
      onDelete: inv && canEdit ? () => { p.invoices = (p.invoices || []).filter((x) => x.id !== i.id); PM.upsert('projects', p); U.toast('ลบงวดแล้ว'); done(); } : null,
      body: `
        ${U.field('ประเภท', 'type', i.type, { options: PM.INV_TYPES.map((x) => ({ value: x.key, label: x.label })) })}
        ${U.field('เลขที่ใบแจ้งหนี้', 'no', i.no, { required: true })}
        ${U.field('ชื่องวด', 'title', i.title, { full: true, placeholder: 'เช่น งวดที่ 3 — งานติดตั้งโครงสร้าง' })}
        ${U.field('วันที่วางบิล', 'date', i.date, { type: 'date', required: true })}
        ${U.field('ครบกำหนดชำระ', 'dueDate', i.dueDate, { type: 'date', required: true, hint: `เครดิตลูกค้าตาม Cash Flow ≈ ${lag} วัน` })}
        ${U.field('ผลงานสะสมที่เบิก (%)', 'progress', i.progress, { type: 'number', min: 0, max: 100, step: 0.1, hint: `งานเสร็จจริงตอนนี้ ${U.pct(m.act, 1)} · เบิกไปแล้วถึง ${U.num(s.claimed, 1)}%` })}
        ${U.field('ยอดวางบิล (THB)', 'amount', i.amount, { type: 'number', min: 0, step: 'any', required: true })}
        ${U.field('หักคืนเงินล่วงหน้า (THB)', 'advance', i.advance, { type: 'number', min: 0, step: 'any', hint: `${U.num(t.advance)}% ของยอดวางบิล` })}
        ${U.field('หัก Retention (THB)', 'retention', i.retention, { type: 'number', min: 0, step: 'any', hint: `${U.num(t.retention)}% ของยอดวางบิล` })}
        <div><span class="muted" style="font-size:12px">ยอดสุทธิที่จะได้รับ</span><b id="inv-net" style="display:block;font-size:20px"></b></div>
        ${U.field('สถานะ', 'status', i.status, { options: PM.INV_STATUS.map((x) => ({ value: x.key, label: x.label })) })}
        ${U.field('วันที่รับเงิน', 'paidDate', i.paidDate, { type: 'date', hint: 'ใส่เมื่อรับเงินแล้ว' })}
        ${U.field('ยอดที่รับจริง (THB)', 'paidAmount', i.paidAmount, { type: 'number', min: 0, step: 'any', hint: 'เว้นว่าง = เท่ากับยอดสุทธิ' })}
        ${U.field('หมายเหตุ', 'note', i.note, { type: 'textarea', full: true, rows: 2 })}`,
      onSubmit: canEdit ? (f) => {
        if (f.status === 'paid' && !f.paidDate) f.paidDate = T;
        if (f.status !== 'paid') { f.paidDate = ''; f.paidAmount = ''; }
        if (PM.invNet(f) < 0) { U.alert('ยอดหักมากกว่ายอดวางบิล'); return false; }
        Object.assign(i, f);
        p.invoices = p.invoices || [];
        if (!p.invoices.includes(i)) p.invoices.push(i);
        PM.upsert('projects', p);
        U.toast(inv ? 'บันทึกงวดแล้ว' : 'เพิ่มงวดแล้ว');
        done();
      } : null,
    });
    if (!canEdit) { form.querySelectorAll('input, select, textarea').forEach((x) => { x.disabled = true; }); }
    const net = form.querySelector('#inv-net');
    const upd = () => { const v = num(form.amount.value) - num(form.advance.value) - num(form.retention.value); net.textContent = U.money(v); net.className = v < 0 ? 'neg' : ''; };
    // changing the claimed % or the amount re-sizes the deductions; a new type fills its own defaults
    let auto = !inv;
    form.addEventListener('input', (e) => {
      if (e.target.name === 'progress' && auto) form.amount.value = Math.max(0, Math.round(s.contract * (num(form.progress.value) - s.claimed) / 100));
      if ((e.target.name === 'progress' || e.target.name === 'amount') && form.type.value === 'progress' && auto) {
        form.advance.value = Math.round(num(form.amount.value) * num(t.advance) / 100);
        form.retention.value = Math.round(num(form.amount.value) * num(t.retention) / 100);
      }
      if (e.target.name === 'advance' || e.target.name === 'retention') auto = false;
      upd();
    });
    form.type.addEventListener('change', () => {
      const k = form.type.value;
      if (k === 'advance') { form.amount.value = Math.round(s.contract * num(t.advance) / 100); form.title.value = 'เงินล่วงหน้า'; }
      if (k === 'retention') { form.amount.value = Math.round(s.retentionHeld); form.title.value = 'คืนเงินประกันผลงาน (Retention)'; }
      if (k !== 'progress') { form.advance.value = 0; form.retention.value = 0; form.progress.value = ''; }
      upd();
    });
    upd();
  }

  /* demo data: advance at the start, then a progress claim about every 2 months from the progress snapshots */
  PM.buildSampleBilling = function (p) {
    const T = PM.today(), v = num(p.contractValue);
    if (!v || !p.progressLog || !p.progressLog.length) return [];
    const out = [];
    let n = 0, claimed = 0;
    const add = (o) => { n++; out.push(Object.assign({ id: PM.uid('INV'), no: `INV-${String(p.code).replace(/^PJ-/, '')}-${String(n).padStart(2, '0')}`, note: '', paidAmount: '' }, o)); };
    const settle = (date) => { const due = PM.addDays(date, 30); return due < PM.addDays(T, -6) ? { status: 'paid', paidDate: PM.addDays(due, n % 3 === 0 ? 9 : 2) } : { status: 'issued', paidDate: '' }; };
    add(Object.assign({ type: 'advance', title: 'เงินล่วงหน้า', date: PM.addDays(p.startDate, 5), dueDate: PM.addDays(p.startDate, 35), progress: '', amount: Math.round(v * 0.1), advance: 0, retention: 0 }, settle(PM.addDays(p.startDate, 5))));
    p.progressLog.forEach((snap, k) => {
      if (k % 2 !== 1 || snap.date > T) return;
      const cum = Math.round(PM.weightedProgress(p, snap.values) * 10) / 10;
      if (cum - claimed < 3) return;
      const gross = Math.round(v * (cum - claimed) / 100);
      add(Object.assign({ type: 'progress', title: `งวดผลงาน ${U.month(snap.date.slice(0, 7))}`, date: snap.date, dueDate: PM.addDays(snap.date, 30), progress: cum, amount: gross, advance: Math.round(gross * 0.1), retention: Math.round(gross * 0.05) }, settle(snap.date)));
      claimed = cum;
    });
    return out;
  };
})();
