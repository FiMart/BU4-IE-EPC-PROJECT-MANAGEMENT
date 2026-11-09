/* project-update.js — what the team's form FLS-F-IE-EPC-004 ("Project list for IE_EPC PROJECT") keeps for each project:
   customer PO · Plant / Contact · Eng / Tech · Activity / Next / Remark · Payment Term by milestone.
   Its day-by-day columns are left out on purpose: the Gantt and the Weekly Plan calendar already do that job.
   Data on the project:
     p.clientPo, p.plant, p.engTech (text)
     p.update = { activity, next, remark, date, by }
     p.payTerms = [{ id, pct, text, done, invoiceId }]   p.payNote = lines of the payment cell that are not a milestone
   In text from Excel, \uE000 … \uE001 marks struck-through words: on the form a struck payment line is one already billed. */
(function () {
  const U = PM.ui, esc = U.esc;
  const ON = '\uE000', OFF = '\uE001';
  const num = (v) => Number(v) || 0;
  const text = (s) => esc(String(s == null ? '' : s).trim());

  /* ---------- reading the form's cells ---------- */
  /* one payment cell → milestones + the lines that are not milestones. Accepts what people really type:
     "- 30% Upon Order" · "1 ST PAYMENT: 30% ENGINEERING …" · "30% Payment :" with the condition on the next lines · "Payment Term : 100%" · "Completed 100%" · "Credit 30 Days" */
  PM.parsePayTerms = function (raw) {
    const out = { terms: [], note: [], creditDays: null };
    let cur = null, on = false;
    String(raw == null ? '' : raw).split(/\r?\n/).forEach((line) => {
      let s = '', struck = false;
      for (const ch of line) {
        if (ch === ON) on = true; else if (ch === OFF) on = false;
        else { s += ch; if (on && ch.trim()) struck = true; }
      }
      s = s.trim();
      const bullet = /^[-–•*>]/.test(s);
      s = s.replace(/^[-–•*>]+\s*/, '');
      if (!s || /^payment\s*terms?\s*:?\s*$/i.test(s) || /^completed\.?$/i.test(s)) return;
      s = s.replace(/^payment\s*terms?\s*:\s*/i, '');
      const credit = s.match(/credit\s*(\d+)\s*days?/i);
      if (credit) { out.creditDays = Number(credit[1]); cur = null; return; }
      const pc = /^progress\b/i.test(s) ? null : s.match(/(\d+(?:\.\d+)?)\s*%/);
      if (pc && Number(pc[1]) > 0 && Number(pc[1]) <= 100) {
        const rest = s.replace(pc[0], ' ').replace(/^\s*\d+\s*(?:st|nd|rd|th)\s*payment\s*:?/i, '').replace(/^\s*payment\s*:?/i, '').replace(/^[\s:;,\-–]+/, '').replace(/\s+/g, ' ').trim();
        cur = { pct: Number(pc[1]), text: /^completed\.?$/i.test(rest) ? '' : rest, done: struck || /^completed\b/i.test(rest) };
        out.terms.push(cur);
      } else if (cur && !bullet) cur.text = `${cur.text} ${s}`.trim();
      else { out.note.push(s); cur = null; }
    });
    return out;
  };
  /* a re-import or an edit keeps what the system already knows about a milestone: its id, the tick and its invoice */
  const termKey = (t) => `${t.pct}|${String(t.text || '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
  PM.mergePayTerms = function (old, next) {
    const pool = (old || []).slice();
    return next.map((t) => {
      const i = pool.findIndex((x) => termKey(x) === termKey(t));
      const was = i >= 0 ? pool.splice(i, 1)[0] : null;
      return { id: was ? was.id : PM.uid('PT'), pct: t.pct, text: t.text || '', done: !!(t.done || (was && was.done)), invoiceId: was ? was.invoiceId || '' : '' };
    });
  };
  PM.payTermState = function (p, t) {
    const inv = t.invoiceId ? (p.invoices || []).find((i) => i.id === t.invoiceId) : null;
    return { inv, done: !!t.done || !!(inv && inv.status !== 'draft') };
  };
  PM.payProgress = function (p) {
    const list = p.payTerms || [], done = list.filter((t) => PM.payTermState(p, t).done);
    return { n: list.length, done: done.length, pct: PM.sum(list, (t) => num(t.pct)), donePct: PM.sum(done, (t) => num(t.pct)) };
  };
  /* the form's "DAILY ACTIVITY & PROGRESS" cell: headings Activity / Next / Noted / Follow Up split it; "Completed" alone means the job is finished */
  PM.splitActivity = function (raw) {
    const out = { activity: [], next: [], noted: [], completed: false };
    let sec = 'activity';
    String(raw == null ? '' : raw).replace(/[\uE000\uE001]/g, '').split(/\r?\n/).forEach((line) => {
      const s = line.trim();
      if (!s) return;
      if (/^completed\.?$/i.test(s)) { out.completed = true; return; }
      const h = s.match(/^(activity(?:\s*&\s*next(?:\s*plan)?)?|next(?:\s*plan)?|noted?|follow\s*up)\s*:?\s*$/i);
      if (h) { const k = h[1].toLowerCase(); sec = k.startsWith('next') ? 'next' : k.startsWith('act') ? 'activity' : 'noted'; return; }
      out[sec].push(s);
    });
    return { activity: out.activity.join('\n'), next: out.next.join('\n'), noted: out.noted.join('\n'), completed: out.completed };
  };

  /* ---------- Progress Update ---------- */
  const author = () => (PM.auth && PM.auth.displayName ? PM.auth.displayName() : '') || '';
  PM.stampUpdate = function (p, fields) {
    p.update = Object.assign({}, p.update, fields, { date: PM.today(), by: author() });
  };
  PM.projectUpdateForm = function (p, done) {
    const u = p.update || {};
    U.modal({
      title: `Progress Update — ${p.code}`, wide: true, submitLabel: 'บันทึกการอัปเดต',
      body: `
        ${U.field('Activity — งานที่กำลังทำ', 'activity', u.activity || '', { type: 'textarea', rows: 6, full: true, placeholder: 'บรรทัดละเรื่อง เช่น - Commissioning >> E&I' })}
        ${U.field('Next — งานถัดไป', 'next', u.next || '', { type: 'textarea', rows: 4, full: true })}
        ${U.field('Remark — หมายเหตุ', 'remark', u.remark || '', { type: 'textarea', rows: 4, full: true })}`,
      onSubmit: (f) => {
        PM.stampUpdate(p, { activity: f.activity.trim(), next: f.next.trim(), remark: f.remark.trim() });
        PM.upsert('projects', p);
        U.toast('บันทึกการอัปเดตแล้ว');
        done();
      },
    });
  };
  const STALE_DAYS = 14;
  const stamp = (p) => {
    const u = p.update;
    if (!u || !u.date) return 'ยังไม่เคยอัปเดต';
    const age = PM.diffDays(u.date, PM.today());
    return `อัปเดต ${U.date(u.date)}${u.by ? ` โดย ${esc(u.by)}` : ''}${p.status !== 'closed' && age > STALE_DAYS ? ` · <b class="neg">ผ่านมา ${age} วัน</b>` : ''}`;
  };
  PM.projectUpdateCard = function (p) {
    const u = p.update || {}, can = PM.can('project.update');
    const col = (title, v) => `<section><h3>${title}</h3>${String(v || '').trim() ? `<div class="pu-text">${text(v)}</div>` : '<p class="muted pu-none">–</p>'}</section>`;
    return `<div class="card pu-card"><div class="card-h"><h2>Progress Update</h2><span class="spacer"></span>${can ? '<button class="btn sm" data-action="pu-edit">อัปเดต</button>' : ''}<p>${stamp(p)}</p></div>
      <div class="card-b pu-cols">${col('Activity', u.activity)}${col('Next', u.next)}${col('Remark', u.remark)}</div></div>`;
  };

  /* ---------- Payment Term (billing tab) ---------- */
  const paySummary = (p) => { const s = PM.payProgress(p); return s.n ? `วางบิลแล้ว ${s.done}/${s.n} งวด · ${U.num(s.donePct)}%` : ''; };
  PM.paySummary = paySummary;
  PM.payTermsForm = function (p, done) {
    const lines = (p.payTerms || []).map((t) => `${U.num(t.pct)}% ${t.text || ''}`.trim()).join('\n');
    U.modal({
      title: `Payment Term — ${p.code}`, submitLabel: 'บันทึก Payment Term',
      body: `<p class="full muted" style="margin:0">พิมพ์หรือวางจากเอกสารสัญญา บรรทัดละงวด เริ่มด้วย % ของงวด · บรรทัดที่ไม่มี % เก็บเป็นหมายเหตุ · งวดที่ติ๊กไว้แล้วยังคงเดิมถ้าไม่แก้ข้อความ</p>
        ${U.field('งวดการชำระเงิน', 'terms', lines + (p.payNote ? `${lines ? '\n' : ''}${p.payNote}` : ''), { type: 'textarea', rows: 9, full: true, placeholder: '30% Upon Placement of Order\n30% Upon Completion of FAT\n40% After SAT Completion' })}`,
      onSubmit: (f) => {
        const r = PM.parsePayTerms(f.terms);
        const sum = PM.sum(r.terms, (t) => t.pct);
        const save = () => {
          p.payTerms = PM.mergePayTerms(p.payTerms, r.terms);
          p.payNote = r.note.join('\n');
          if (r.creditDays != null) p.billingTerms = Object.assign({ advance: 0, retention: 0 }, p.billingTerms, { creditDays: r.creditDays });
          PM.upsert('projects', p);
          U.toast('บันทึก Payment Term แล้ว');
          done();
        };
        if (r.terms.length && sum !== 100) {
          U.confirm(`งวดทั้งหมดรวมกันได้ ${U.num(sum, sum % 1 ? 1 : 0)}% ไม่ใช่ 100% — บันทึกตามนี้ไหม?`).then((ok) => { if (ok) { U.closeModal(); save(); } });
          return false;
        }
        save();
      },
    });
  };
  PM.payTermsCard = function (p, contract, canEdit) {
    const list = p.payTerms || [];
    let cum = 0;
    const rows = list.map((t, i) => {
      cum += num(t.pct);
      const st = PM.payTermState(p, t);
      const badge = st.inv && st.done ? U.badge(st.inv.status === 'paid' ? 'good' : 'warning', `${st.inv.no} · ${(PM.INV_STATUS.find((x) => x.key === st.inv.status) || {}).label || ''}`)
        : st.inv ? U.badge('neutral', `${st.inv.no} · ร่าง`) : st.done ? U.badge('good', 'วางบิลแล้ว') : U.badge('neutral', 'ยังไม่ถึงงวด');
      return `<tr class="${st.done ? 'pt-done' : ''}">
        <td class="num">${i + 1}</td>
        <td class="num"><b>${U.num(t.pct, t.pct % 1 ? 1 : 0)}%</b></td>
        <td class="pt-text">${esc(t.text || '–')}</td>
        <td class="num">${contract ? U.money(contract * num(t.pct) / 100) : '–'}</td>
        <td>${badge}</td>
        <td class="nowrap">${canEdit && !st.inv ? `<label class="pt-tick"><input type="checkbox" data-pt-done="${esc(t.id)}"${t.done ? ' checked' : ''}> วางบิลแล้ว</label>` : ''}
          ${canEdit && !st.done && !st.inv ? `<button class="btn sm" data-inv="pt-bill" data-id="${esc(t.id)}" data-cum="${cum}">วางบิลงวดนี้</button>` : ''}</td></tr>`;
    }).join('');
    const s = PM.payProgress(p);
    return `<div class="card"><div class="card-h pu-head"><h2>Payment Term ตามสัญญา</h2>${s.n ? `<span class="chip">${esc(paySummary(p))}</span>` : ''}<span class="spacer"></span>${canEdit ? `<button class="btn sm" data-inv="pt-edit">${s.n ? 'แก้ไข Payment Term' : '+ ตั้ง Payment Term'}</button>` : ''}
        <p>เงื่อนไขการจ่ายเงินแต่ละงวดตามเอกสารสัญญา · ติ๊กเมื่อวางบิลแล้ว หรือกดวางบิลงวดนี้เพื่อสร้างงวดเงินจากเงื่อนไขนั้น</p></div>
      <div class="card-b flush table-wrap">${s.n ? `<table class="tbl pt-table"><thead><tr><th class="num">งวด</th><th class="num">%</th><th>เงื่อนไข</th><th class="num">มูลค่า</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><td></td><td class="num"><b class="${s.pct !== 100 ? 'neg' : ''}">${U.num(s.pct, s.pct % 1 ? 1 : 0)}%</b></td><td>${s.pct !== 100 ? '<span class="neg">รวมแล้วไม่ครบ 100% — ตรวจกับเอกสารสัญญา</span>' : 'รวม'}</td><td class="num">${contract ? U.money(contract * s.pct / 100) : '–'}</td><td></td><td></td></tr></tfoot></table>`
        : `<p class="empty">ยังไม่ได้ตั้ง Payment Term${canEdit ? ' — กด "+ ตั้ง Payment Term" แล้ววางเงื่อนไขจากเอกสารสัญญา' : ''}</p>`}
        ${p.payNote ? `<p class="muted pt-note">หมายเหตุ: <span class="pu-text">${text(p.payNote)}</span></p>` : ''}</div></div>`;
  };

  /* ---------- the whole list, in the form's columns ---------- */
  // the form's "Cost in Project" is the plan cost (it equals Plan Cost-VC on the accounting file), not the contract value
  const planCost = (p) => PM.sum(p.phases || [], (ph) => ph.budget || 0);
  PM.projectListSort = (rows) => rows.slice().sort((a, b) => (a.p.listNo || 1e9) - (b.p.listNo || 1e9) || String(a.p.code).localeCompare(String(b.p.code)));
  const lines = (s) => String(s == null ? '' : s).trim();
  const payHtml = (p) => {
    const terms = (p.payTerms || []).map((t) => {
      const line = `${U.num(t.pct, t.pct % 1 ? 1 : 0)}% ${esc(t.text || '')}`.trim();
      return `<div>${PM.payTermState(p, t).done ? `<s>${line}</s>` : line}</div>`;
    }).join('');
    return terms + (p.payNote ? `<div class="pu-text muted">${text(p.payNote)}</div>` : '');
  };
  const activityHtml = (p) => {
    const u = p.update || {};
    const part = (h, v) => (lines(v) ? `<b>${h}</b><div class="pu-text">${text(v)}</div>` : '');
    return part('Activity', u.activity) + part('Next', u.next);
  };
  PM.projectListTable = function (rows, filtered) {
    if (!rows.length) return filtered
      ? '<p class="empty">ไม่พบโครงการที่ตรงกับคำค้นหา / ตัวกรอง — <button type="button" class="link-btn" data-action="clear-filters">ล้างตัวกรอง</button></p>'
      : '<p class="empty">ไม่มีโครงการในมุมมองนี้</p>';
    const can = PM.can('project.update'), fin = PM.seesProjectFinance();
    return `<table class="tbl pu-table"><thead><tr><th class="num">No.</th><th>Project</th><th>PO ลูกค้า</th>${fin ? '<th class="num">Cost in Project</th>' : ''}<th>Start – End</th><th>Plant / Contact</th><th>Eng / Tech</th><th>Activity &amp; Progress</th><th>Remark</th><th>Payment / Invoice</th></tr></thead><tbody>
      ${PM.projectListSort(rows).map(({ p }, i) => `<tr class="click${p.status === 'closed' ? ' pu-closed' : ''}" data-id="${esc(p.id)}">
        <td class="num">${i + 1}</td>
        <td class="pu-name"><span class="title">${esc(p.code)}</span><small>${esc(p.name)}</small>${p.status === 'closed' ? U.badge('good', 'Completed') : p.status === 'onhold' ? U.badge('warning', 'On hold') : ''}</td>
        <td class="pu-po">${text(p.clientPo) || '–'}</td>
        ${fin ? `<td class="num">${planCost(p) ? U.num(planCost(p)) : '–'}</td>` : ''}
        <td class="nowrap">${U.date(p.startDate)}<small>${U.date(p.endDate)}</small>${p.datesEstimated ? '<small class="neg" title="ไฟล์ที่นำเข้าไม่มีวันที่ ระบบตั้งชั่วคราว แก้ได้ที่แก้ไขโครงการ">วันที่ชั่วคราว</small>' : ''}</td>
        <td>${esc(p.plant || '–')}</td>
        <td class="pu-team">${esc(p.engTech || '–')}</td>
        <td class="pu-long"><div class="pu-scroll">${activityHtml(p) || `<span class="muted">${p.status === 'closed' ? 'Completed' : '–'}</span>`}</div>${p.status === 'closed' ? '' : `<small>${stamp(p)}</small>${can ? `<button class="btn sm pu-btn" data-action="pu-edit" data-id="${esc(p.id)}">อัปเดต</button>` : ''}`}</td>
        <td class="pu-long"><div class="pu-scroll"><div class="pu-text">${text((p.update || {}).remark) || '<span class="muted">–</span>'}</div></div></td>
        <td class="pu-long"><div class="pu-scroll">${payHtml(p) || '<span class="muted">–</span>'}</div>${(p.payTerms || []).length ? `<small>${esc(paySummary(p))}</small>` : ''}</td>
      </tr>`).join('')}</tbody></table>`;
  };
  PM.projectListPrint = function (rows) {
    const P = PM.printDoc, win = P.open();
    if (!win) return;
    const list = PM.projectListSort(rows), nl = (s) => esc(lines(s)).replace(/\n/g, '<br>'), fin = PM.seesProjectFinance();
    const part = (h, v) => (lines(v) ? `<b>${h}</b><br>${nl(v)}<br>` : '');
    const body = list.map(({ p }, i) => {
      const u = p.update || {};
      const pay = (p.payTerms || []).map((t) => { const l = `${U.num(t.pct, t.pct % 1 ? 1 : 0)}% ${esc(t.text || '')}`; return PM.payTermState(p, t).done ? `<s>${l}</s>` : l; }).concat(lines(p.payNote) ? [nl(p.payNote)] : []).join('<br>');
      return `<tr class="${p.status === 'closed' ? 'done' : ''}"><td class="r">${i + 1}</td><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${nl(p.clientPo)}</td>${fin ? `<td class="r">${planCost(p) ? U.num(planCost(p), 2) : ''}</td>` : ''}<td class="n">${U.date(p.startDate)}</td><td class="n">${U.date(p.endDate)}</td><td>${esc(p.plant || '')}</td><td>${esc(p.engTech || '')}</td><td>${p.status === 'closed' && !lines(u.activity) ? 'Completed' : part('Activity', u.activity) + part('Next', u.next)}</td><td>${nl(u.remark)}</td><td>${pay}</td></tr>`;
    }).join('');
    P.write(win, {
      title: `Project list ${PM.today()}`, bar: 'Project list for IE_EPC PROJECT', doc: 'project-list',
      head: { title: '<h1>Project list for IE_EPC PROJECT</h1><p>Operation and Execution — Progress Update</p>', meta: `${esc(PM.COMPANY)}<br>ข้อมูล ณ ${U.date(PM.today())}<br>${list.length} โครงการ` },
      body: `<style>@page { size: A3 landscape; margin: 8mm; } main { max-width: 404mm; }
          table.pl { font-size: 8.5px; table-layout: fixed; } table.pl th, table.pl td { padding: 3px 4px; border: 1px solid #c0ccdc; overflow-wrap: anywhere; }
          table.pl th { background: #f8cbad; color: #0b1b33; text-align: center; } table.pl .n { white-space: nowrap; } table.pl tr.done td { background: #c6efce; }</style>
        <section class="flow"><table class="pl"><colgroup><col style="width:2.2%"><col style="width:6.4%"><col style="width:11%"><col style="width:6%">${fin ? '<col style="width:5.4%">' : ''}<col style="width:4%"><col style="width:4%"><col style="width:4%"><col style="width:5.6%"><col style="width:21%"><col style="width:15%"><col style="width:15.4%"></colgroup>
        <thead><tr><th>NO.</th><th>PROJECT NO.</th><th>PROJECT NAME</th><th>PO NO.</th>${fin ? '<th>COST IN PROJECT</th>' : ''}<th>WORK START</th><th>END</th><th>PLANT / CONTACT</th><th>ENG / TECH</th><th>DAILY ACTIVITY &amp; PROGRESS</th><th>REMARK</th><th>PAYMENT / INVOICE</th></tr></thead><tbody>${body}</tbody></table></section>`,
    });
  };
  PM.projectListExcel = function (rows) {
    const fin = PM.seesProjectFinance();
    const cell = (p) => {
      const u = p.update || {};
      const activity = [p.status === 'closed' ? 'Completed' : '', lines(u.activity) ? `Activity\n${lines(u.activity)}` : '', lines(u.next) ? `Next\n${lines(u.next)}` : ''].filter(Boolean).join('\n');
      const pay = (p.payTerms || []).map((t) => { const l = `${U.num(t.pct, t.pct % 1 ? 1 : 0)}% ${t.text || ''}`.trim(); return PM.payTermState(p, t).done ? `${ON}${l}${OFF}` : l; }).concat(lines(p.payNote) ? [lines(p.payNote)] : []).join('\n');
      return { activity, pay, remark: lines(u.remark) };
    };
    PM.xport.excel({
      filename: `project-list-${PM.today()}`, title: 'Project list for IE_EPC PROJECT', subtitle: `${PM.COMPANY} · ${U.date(PM.today())} · FLS-F-IE-EPC-004`,
      sheets: [{
        name: 'Project list',
        // the money columns only for the roles that see a project's money: the file may be passed on
        columns: [{ header: 'NO.', type: 'int', width: 6 }, { header: 'PROJECT NO.', width: 17 }, { header: 'PROJECT NAME', width: 40 }, { header: 'PO NO.', width: 14 }]
          .concat(fin ? [{ header: 'COST IN PROJECT', type: 'number', width: 15 }, { header: 'PLAN REVENUE', type: 'number', width: 15 }] : [])
          .concat([{ header: 'WORK START', type: 'date', width: 12 }, { header: 'END START', type: 'date', width: 12 },
            { header: 'CUSTOMER', width: 20 }, { header: 'PLANT / CONTACT', width: 14 }, { header: 'ENG / TECH', width: 20 }, { header: 'DAILY ACTIVITY & PROGRESS', width: 60 }, { header: 'REMARK', width: 44 }, { header: 'PAYMENT / INVOICE', width: 48 }]),
        rows: PM.projectListSort(rows).map(({ p }, i) => { const c = cell(p); return [i + 1, p.code, p.name, lines(p.clientPo)].concat(fin ? [planCost(p) || '', p.contractValue || ''] : []).concat([p.startDate, p.endDate, p.client, p.plant || '', p.engTech || '', c.activity, c.remark, c.pay]); }),
      }],
    });
  };

  /* ---------- Monitor view: the accounting file's columns ----------
     Plan Revenue = contract value · Plan Cost-VC = plan cost · POC = progress · Accum. Cost = actual cost — on the project.
     Accum. Revenue · WIP/Accrued · Margin come from the Monitor file into 'projfin' (PM.projFin): the database sends them to
     Admin · Dept Manager · PM · Engineer only — the same roles that see this view at all (PM.seesProjectFinance). */
  const jobOf = (p) => p.jobNo || (/^JB\d/i.test(p.code) ? p.code : '');
  const orderOf = (p) => (p.code && p.code !== jobOf(p) ? p.code : '');
  const ledgerStatus = (p) => (p.status === 'closed' ? 'Closed' : p.status === 'onhold' ? 'On hold' : 'Released');
  const monitorSort = (rows) => rows.slice().sort((a, b) => (jobOf(a.p) ? 0 : 1) - (jobOf(b.p) ? 0 : 1) || String(jobOf(a.p) || a.p.code).localeCompare(String(jobOf(b.p) || b.p.code)));
  const numOr = (v) => (v == null || v === '' || !isFinite(Number(v)) ? null : Number(v));
  const monitorRow = (r) => {
    const p = r.p, m = r.m || PM.projectMetrics(p), plan = planCost(p), rev = Number(p.contractValue) || 0, f = PM.projFin(p) || {};
    const accRev = numOr(f.accRevenue), margin = numOr(f.margin);
    const marginPct = numOr(f.marginPct) != null ? numOr(f.marginPct) / 100 : margin != null && accRev ? margin / accRev : null;
    return { p, job: jobOf(p), order: orderOf(p), rev, plan, cMargin: rev && plan ? (rev - plan) / rev : null, poc: m.act, ac: m.ac, left: plan - m.ac,
      accRev, wip: numOr(f.wip), margin, marginPct, asOf: f.asOf || '' };
  };
  const signed = (v) => (v == null ? '–' : `<span class="${v < 0 ? 'neg' : ''}">${v < 0 ? '−' : ''}${U.num(Math.abs(Math.round(v)))}</span>`);
  PM.monitorTable = function (rows, filtered) {
    if (!PM.seesProjectFinance()) return '<p class="empty">ตัวเลขของโครงการเห็นเฉพาะ Admin · Department Manager · Project Manager · Engineer</p>';
    if (!rows.length) return filtered
      ? '<p class="empty">ไม่พบโครงการที่ตรงกับคำค้นหา / ตัวกรอง — <button type="button" class="link-btn" data-action="clear-filters">ล้างตัวกรอง</button></p>'
      : '<p class="empty">ไม่มีโครงการในมุมมองนี้</p>';
    const list = monitorSort(rows).map(monitorRow);
    const sum = (k) => PM.sum(list, (x) => x[k] || 0);
    const has = (k) => list.some((x) => x[k] != null);
    const money = (v) => (v ? U.num(Math.round(v)) : '–');
    const sumMarginPct = sum('accRev') && has('margin') ? sum('margin') / sum('accRev') : null;
    return `<table class="tbl mon-table"><thead><tr><th class="num">No.</th><th>Job (Odoo)</th><th>Order</th><th>Customer</th><th>Description</th><th>Work Start</th><th>Work End</th><th>Status</th>
      <th class="num">Plan Revenue</th><th class="num">Plan Cost-VC</th><th class="num" title="(Plan Revenue − Plan Cost) ÷ Plan Revenue">cMargin (Plan)</th><th class="num">POC</th><th class="num">Accum. Cost</th><th class="num" title="Plan Cost − Accum. Cost">คงเหลือจาก Plan</th>
      <th class="num mon-fin" title="จากไฟล์ Monitor">Accum. Revenue</th><th class="num mon-fin" title="จากไฟล์ Monitor">WIP / Accrued</th><th class="num mon-fin" title="จากไฟล์ Monitor">Margin</th><th class="num mon-fin" title="Margin ÷ Accum. Revenue (หรือ % จากไฟล์)">Margin %</th></tr></thead><tbody>
      ${list.map((x, i) => `<tr class="click${x.p.status === 'closed' ? ' pu-closed' : ''}" data-id="${esc(x.p.id)}">
        <td class="num">${i + 1}</td><td class="nowrap">${esc(x.job || '–')}</td><td class="nowrap">${esc(x.order || '–')}</td>
        <td class="mon-cust">${esc(x.p.client || '–')}</td><td class="mon-desc">${esc(x.p.name)}</td>
        <td class="nowrap">${U.date(x.p.startDate)}</td><td class="nowrap">${U.date(x.p.endDate)}</td>
        <td>${x.p.status === 'closed' ? U.badge('neutral', 'Closed') : x.p.status === 'onhold' ? U.badge('warning', 'On hold') : U.badge('info', 'Released')}</td>
        <td class="num">${money(x.rev)}</td><td class="num">${money(x.plan)}</td><td class="num">${x.cMargin == null ? '–' : U.pct(x.cMargin)}</td>
        <td class="num">${U.pct(x.poc)}</td><td class="num">${money(x.ac)}</td>
        <td class="num${x.left < 0 ? ' neg' : ''}">${x.plan || x.ac ? (x.left < 0 ? '−' : '') + U.num(Math.abs(Math.round(x.left))) : '–'}</td>
        <td class="num mon-fin">${signed(x.accRev)}</td><td class="num mon-fin">${signed(x.wip)}</td><td class="num mon-fin">${signed(x.margin)}</td>
        <td class="num mon-fin${x.marginPct != null && x.marginPct < 0 ? ' neg' : ''}">${x.marginPct == null ? '–' : U.pct(x.marginPct)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td colspan="7">รวม ${list.length} โครงการ</td><td class="num">${money(sum('rev'))}</td><td class="num">${money(sum('plan'))}</td><td class="num">${sum('rev') ? U.pct((sum('rev') - sum('plan')) / sum('rev')) : '–'}</td><td></td><td class="num">${money(sum('ac'))}</td><td class="num${sum('left') < 0 ? ' neg' : ''}">${money(sum('left'))}</td>
        <td class="num mon-fin">${has('accRev') ? signed(sum('accRev')) : '–'}</td><td class="num mon-fin">${has('wip') ? signed(sum('wip')) : '–'}</td><td class="num mon-fin">${has('margin') ? signed(sum('margin')) : '–'}</td><td class="num mon-fin">${sumMarginPct == null ? '–' : U.pct(sumMarginPct)}</td></tr></tfoot></table>`;
  };
  /* the same columns to Excel; dropped back on the import it updates the projects again */
  PM.monitorExcel = function (rows) {
    if (!PM.seesProjectFinance()) return;
    const list = monitorSort(rows).map(monitorRow);
    const cols = [{ header: 'No.', type: 'int', width: 6 }, { header: 'Job (Odoo)', width: 17 }, { header: 'Order', width: 15 }, { header: 'Customer name', width: 34 }, { header: 'Description', width: 44 },
      { header: 'Work Start', type: 'date', width: 12 }, { header: 'Work End', type: 'date', width: 12 }, { header: 'Status', width: 10 }, { header: 'Plan Revenue', type: 'number', width: 15 }, { header: 'Plan Cost-VC', type: 'number', width: 15 },
      { header: 'cMargin (Plan) %', type: 'number', width: 12 }, { header: 'POC', width: 8 }, { header: 'Accum. Cost', type: 'number', width: 15 }, { header: 'Plan − Accum. Cost', type: 'number', width: 16 },
      { header: 'Accum. Revenue', type: 'number', width: 15 }, { header: 'WIP / Accrued', type: 'number', width: 15 }, { header: 'Margin', type: 'number', width: 15 }, { header: 'Margin %', type: 'number', width: 10 }];
    const r2 = (v) => (v == null ? '' : Math.round(v * 100) / 100);
    PM.xport.excel({
      filename: `monitor-${PM.today()}`, title: 'Monitor — Plan vs Accum. Cost · WIP / Accrued', subtitle: `${PM.COMPANY} · ${U.date(PM.today())} · ข้อมูลลับ: Admin · Dept Manager · PM · Engineer`,
      sheets: [{
        name: 'Monitor', columns: cols,
        rows: list.map((x, i) => [i + 1, x.job, x.order, x.p.client || '', x.p.name, x.p.startDate, x.p.endDate, ledgerStatus(x.p), x.rev || '', x.plan || '',
          x.cMargin == null ? '' : Math.round(x.cMargin * 1000) / 10, `${Math.round(x.poc * 100)}%`, Math.round(x.ac * 100) / 100 || '', Math.round(x.left * 100) / 100,
          r2(x.accRev), r2(x.wip), r2(x.margin), x.marginPct == null ? '' : Math.round(x.marginPct * 1000) / 10]),
      }],
    });
  };

  /* ---------- demo data ---------- */
  PM.buildSampleProjectInfo = function (p, i) {
    const short = String(p.client || '').split(/\s+/)[0];
    p.clientPo = `50022${String(54000 + i * 137)}`;
    p.plant = short;
    p.engTech = ['P\'Pong / Montree / Phet', 'P\'Keng / Tawan / Smart', 'P\'Jame / Art / Tawan'][i % 3];
    p.listNo = i + 1;
    const closed = p.status === 'closed';
    p.update = closed ? { activity: '', next: '', remark: 'ส่งมอบงานครบแล้ว', date: p.endDate, by: '' } : {
      activity: '- ตรวจ Loop Wiring E&I\n- ติดตาม Material ที่ค้างส่ง\n- ประชุมกับทีมควบคุมงาน',
      next: '- ส่งเอกสาร As-built ให้ลูกค้า Approve\n- นัดหมาย SAT',
      remark: 'รอยืนยันแผน Shutdown จากลูกค้า', date: PM.addDays(PM.today(), -((i % 4) * 7)), by: '',
    };
    const values = {};
    p.phases.forEach((ph) => { values[ph.key] = ph.progress || 0; });
    const act = PM.weightedProgress(p, values); // % done; projectMetrics needs PM.db, which is still being built here
    let cum = 0;
    p.billingTerms = p.billingTerms || { advance: 10, retention: 5, creditDays: 30 };
    p.payTerms = PM.mergePayTerms([], [[10, 'After PO Receipt'], [30, 'After FAT Complete'], [40, 'After Delivery at Site'], [10, 'After SAT and Commissioning Complete'], [10, 'After Final Document']].map(([pct, t]) => {
      cum += pct;
      return { pct, text: t, done: closed || cum <= act };
    }));
  };
})();
