/* common.js — shared view pieces: tiles, flow strip, bid & project forms */
(function () {
  const U = PM.ui, esc = U.esc;
  const V = (PM.common = {});

  /* icon: a PM.illus key, false = none; default = picked from the label / tag */
  V.tile = ({ label, tag, value, sub, tip, icon }) => {
    const ic = icon === false ? '' : PM.illus.icon(icon || PM.illus.pick(`${label} ${tag || ''}`), 'tile-ic');
    return `<div class="tile${ic ? ' has-ic' : ''}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${ic}
      <div class="tile-label">${esc(label)}${tag ? `<span class="tag">${esc(tag)}</span>` : ''}</div>
      <div class="tile-value">${value}</div>
      <div class="tile-sub">${sub || ''}</div>
    </div>`;
  };

  const ARROW = '<div class="flow-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>';
  // each step shows the picture of its stage / phase (Inquiry … Award, Engineering … Closing)
  V.flow = (steps) =>
    `<div class="flow">${steps.map((s, i) => {
      const ic = PM.illus.icon(s.icon || String(s.label).toLowerCase(), 'flow-ic');
      return `${i ? ARROW : ''}<div class="flow-step${ic ? ' has-ic' : ''}${s.href || s.action ? ' link' : ''}${s.active ? ' active' : ''}"${s.href ? ` data-href="${esc(s.href)}"` : ''}${s.action ? ` data-action="${esc(s.action)}"` : ''}${s.key ? ` data-key="${esc(s.key)}"` : ''}${s.tip ? ` data-tip="${esc(s.tip)}"` : ''}>${ic}
        <div class="n">${esc(s.n || String(i + 1).padStart(2, '0'))}</div>
        <b>${esc(s.label)}</b><div class="th">${esc(s.th || '')}</div>
        <div class="big">${s.big}</div><div class="meta">${s.meta || ''}</div>
      </div>`;
    }).join('')}</div>`;

  V.bindFlowLinks = (el) => el.querySelectorAll('.flow-step[data-href]').forEach((s) => s.addEventListener('click', () => (location.hash = s.dataset.href)));

  V.periods = [
    { key: '90d', label: '90 วัน' },
    { key: '12m', label: '12 เดือน' },
    { key: 'ytd', label: 'YTD' },
    { key: 'all', label: 'ทั้งหมด' },
  ];
  V.periodRange = (key) => {
    const T = PM.today();
    if (key === '90d') return { from: PM.addDays(T, -89), to: T };
    if (key === '12m') return { from: PM.addDays(T, -364), to: T };
    if (key === 'ytd') return { from: T.slice(0, 4) + '-01-01', to: T };
    return { from: null, to: null };
  };
  V.seg = (name, items, value) =>
    `<div class="seg" role="group">${items.map((it) => `<button type="button" data-seg="${name}" data-val="${it.key}" class="${it.key === value ? 'on' : ''}">${esc(it.label)}</button>`).join('')}</div>`;

  /* ---------- week navigator (Weekly Plan, Timesheet) — uses data-action prev / next / this ---------- */
  V.isoWeek = (s) => {
    const d = PM.parse(s);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); // Thursday of this week decides the ISO week
    const w1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  };
  V.weekNav = function (week) {
    const T = PM.today();
    const end = PM.addDays(week, 6);
    const a = PM.parse(week), b = PM.parse(end);
    const fmt = (d, o) => d.toLocaleDateString('en-GB', o);
    const range = a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${fmt(b, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : `${fmt(a, { day: 'numeric', month: 'short' })} – ${fmt(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const diff = Math.round(PM.diffDays(PM.monday(T), week) / 7);
    const rel = diff === 0 ? 'สัปดาห์นี้' : diff === 1 ? 'สัปดาห์หน้า' : diff === -1 ? 'สัปดาห์ที่แล้ว' : diff > 0 ? `อีก ${diff} สัปดาห์` : `${-diff} สัปดาห์ก่อน`;
    const chev = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    return `<div class="week-nav" role="group" aria-label="เลือกสัปดาห์">
        <button class="wk-btn" type="button" data-action="prev" aria-label="สัปดาห์ก่อนหน้า" title="สัปดาห์ก่อนหน้า">${chev('M15 6l-6 6 6 6')}</button>
        <div class="wk-label"><b>${esc(range)}</b><small>สัปดาห์ที่ ${V.isoWeek(week)} · <span class="${diff === 0 ? 'now' : ''}">${esc(rel)}</span></small></div>
        <button class="wk-btn" type="button" data-action="next" aria-label="สัปดาห์ถัดไป" title="สัปดาห์ถัดไป">${chev('M9 6l6 6-6 6')}</button>
      </div>
      <button class="btn wk-today${diff === 0 ? ' is-current' : ''}" type="button" data-action="this" ${diff === 0 ? 'aria-pressed="true" title="กำลังดูสัปดาห์นี้"' : 'title="กลับไปสัปดาห์ปัจจุบัน"'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/></svg>
        สัปดาห์นี้</button>`;
  };

  /* tabs on the Bidding pages: overview + one page per step (count = bids in that step now) */
  V.bidTabs = function (active) {
    const pending = PM.db.bids.filter((b) => b.result === 'pending');
    const tabs = [{ key: '', label: 'ภาพรวม', icon: 'chart', href: '#/bidding' }]
      .concat(PM.BID_STAGES.map((s) => ({ key: s.key, label: s.label, icon: s.key, href: '#/bidding/' + s.key, n: pending.filter((b) => b.stage === s.key).length })))
      .concat([{ key: 'award', label: 'Award', icon: 'award', href: '#/bidding/award' }]);
    return `<nav class="tabs bid-tabs" aria-label="ขั้นตอน Bidding">${tabs.map((t) =>
      `<a href="${t.href}" class="${t.key === active ? 'active' : ''}"${t.key === active ? ' aria-current="page"' : ''}>${PM.illus.svg(t.icon)}<span>${esc(t.label)}</span>${t.n != null ? `<em class="count">${t.n}</em>` : ''}</a>`).join('')}</nav>`;
  };

  /* buttons on a bid (card, row): data-action + data-id. Returns true when handled; done() redraws the page */
  /* the Value of a bid for whoever may see it (Admin · the owning Sales · Dept Manager / PM / Engineer) — everyone else gets a lock */
  V.LOCK_PRICE = '<span class="price-lock" title="ราคาขายเห็นได้เฉพาะ Admin · Dept Manager · PM · Engineer · Sales">🔒</span>';
  V.bidMoney = (b) => (PM.canSeeBidValue(b) ? U.money(b.value) : V.LOCK_PRICE);
  /* sum of bid values for a summary: only the bids this user may see; '' for roles that see no values */
  // none of them open to this user: '' (not ฿0, which would read as "worth nothing")
  V.bidSum = (list) => { const open = PM.seesBidValues() ? list.filter(PM.canSeeBidValue) : []; return open.length ? U.money(PM.sum(open, (b) => b.value || 0)) : ''; };

  /* every proposal on the list — Not Started, In Progress, Complete, Win, Lose, No-bid — as the team's file counts them.
     Not tied to the period: the list is the whole list. rows = PM.proposalList() rows (optionally narrowed by a filter) */
  V.proposalTotalTile = function (rows, opts = {}) {
    const s = PM.proposalSummary(rows);
    const n = (k) => (s.status.find((x) => x.key === k) || { n: 0 }).n;
    const parts = [['Not Started', n('not_started')], ['In Progress', n('in_progress')], ['Complete', n('complete')], ['Win', n('win')], ['Lose', n('lose')]]
      .concat(n('nobid') ? [['No-bid', n('nobid')]] : []);
    const of = opts.of != null && opts.of !== s.total ? ` <small>/ ${opts.of}</small>` : '';
    return V.tile({
      label: 'Proposal ทั้งหมด', icon: 'proposal', value: `${s.total}${of}`,
      sub: parts.map(([l, x]) => `${l} ${x}`).join(' · '),
      tip: `นับทุกงานใน Proposal list ทุกสถานะ (ไม่ขึ้นกับช่วงเวลา)\n${parts.map(([l, x]) => `${l}: ${x}`).join('\n')}${of ? `\nตามตัวกรอง ${s.total} จาก ${opts.of} งาน` : ''}`,
    });
  };

  /* buttons on a bid (card, row): moving on and Won / Lost only for the Sales who owns it (and Admin) */
  V.bidButtons = function (b, o = {}) {
    const i = PM.BID_STAGES.findIndex((s) => s.key === b.stage);
    const id = esc(b.id);
    const mine = PM.canEditBid(b);
    const prev = V.bidPrevStage(b);
    // compact (board card): the arrow alone, so the forward actions fit on one line
    const back = mine && b.result === 'pending' && prev ? `<button class="btn sm ghost${o.compact ? ' kb-back' : ''}" data-action="back" data-id="${id}" title="ย้อนกลับไปขั้น ${esc(prev.label)}" aria-label="ย้อนกลับไปขั้น ${esc(prev.label)}">${o.compact ? '←' : `← ${esc(prev.label)}`}</button>` : '';
    const reopen = mine ? `<button class="btn sm ghost" data-action="reopen" data-id="${id}" title="ยกเลิกผลการประมูล กลับไปรอผล">↩ ยกเลิกผล</button>` : '';
    if (b.result === 'pending' && i < PM.BID_STAGES.length - 1) return mine ? `${back}<button class="btn sm" data-action="next" data-id="${id}">→ ${PM.BID_STAGES[i + 1].label}</button>` : '';
    if (b.result === 'pending') return mine ? `${back}<button class="btn sm good" data-action="won" data-id="${id}">✓ Won</button><button class="btn sm" data-action="lost" data-id="${id}">✕ Lost</button>` : '';
    if (b.result === 'won') return b.projectId && PM.find('projects', b.projectId)
      ? `<button class="btn sm" data-action="open-project" data-id="${id}">Open project →</button>`
      : `${o.compact && mine ? `<button class="btn sm ghost kb-back" data-action="reopen" data-id="${id}" title="ยกเลิกผลการประมูล กลับไปรอผล" aria-label="ยกเลิกผลการประมูล">↩</button>` : reopen}<button class="btn sm primary" data-action="convert" data-id="${id}">+ Create project</button>`;
    return reopen;
  };
  /* the stage a bid goes back to: the latest earlier one it really went through (an imported bid may have skipped Estimate) */
  V.bidPrevStage = (b) => {
    const i = PM.BID_STAGES.findIndex((s) => s.key === b.stage);
    for (let k = i - 1; k > 0; k--) if (b.dates[PM.BID_STAGES[k].key]) return PM.BID_STAGES[k];
    return i > 0 ? PM.BID_STAGES[0] : null;
  };
  V.bidAction = function (a, b, done) {
    if (!b) return false;
    const T = PM.today();
    // same rules as the buttons (and the database for the price): Sales who owns the bid, or Admin
    if (['next', 'back', 'reopen', 'won', 'lost', 'nobid'].includes(a) && !PM.canEditBid(b)) { U.toast('เฉพาะ Admin · Project Manager · Engineer หรือ Sales ผู้รับผิดชอบงานนี้'); return true; }
    if (a === 'bid-files' && !PM.canSeeBidPrice(b)) return true;
    if (a === 'bid-files') { // 📎 on a card / row: open the attachments list (one file → open it directly)
      if ((b.files || []).length === 1) PM.poFiles.open(b.files[0].path);
      else PM.poFiles.showList(`ไฟล์แนบ — ${PM.dash(b.code)}`, b.files);
      return true;
    }
    if (a === 'next') {
      const i = PM.BID_STAGES.findIndex((s) => s.key === b.stage);
      const nx = PM.BID_STAGES[i + 1];
      if (!nx) return true;
      b.dates[nx.key] = PM.max(T, b.dates[b.stage]);
      if (nx.key === 'submit') b.submitAssumed = false;
      b.stage = nx.key;
      PM.upsert('bids', b);
      U.toast(`${PM.dash(b.code)} → ${nx.label}`);
      done();
      return true;
    }
    if (a === 'back') {
      const prev = V.bidPrevStage(b), cur = PM.BID_STAGES.find((s) => s.key === b.stage);
      if (!prev) return true;
      // Complete means handed in, so a job taken back from Submit is no longer Complete
      const reopenWork = b.stage === 'submit' && PM.propOf(b).work === 'complete';
      U.confirm(`ย้อน ${PM.dash(b.code)} จาก ${cur.label} กลับไป ${prev.label}?\n\nวันที่เข้าขั้น ${cur.label} (${U.date(b.dates[b.stage])}) จะถูกล้าง${reopenWork ? ' · Status เปลี่ยนจาก Complete เป็น In Progress' : ''} · ข้อมูลอื่นของงานและชั่วโมง Timesheet ยังอยู่`, { title: 'ย้อนกลับขั้นก่อนหน้า', ok: 'ย้อนกลับ', tone: 'question' }).then((ok) => {
        if (!ok) return;
        if (reopenWork) { b.proposal = Object.assign({}, b.proposal, { status: 'in_progress' }); delete b.submitAssumed; }
        b.dates[b.stage] = '';
        b.stage = V.stageOf(b);
        PM.upsert('bids', b);
        U.toast(`${PM.dash(b.code)} ← ${prev.label}`);
        done();
      });
      return true;
    }
    if (a === 'reopen') {
      if (b.projectId && PM.find('projects', b.projectId)) { U.alert('งานนี้สร้างโครงการแล้ว ยกเลิกผลไม่ได้'); return true; }
      U.confirm(`ยกเลิกผล ${PM.BID_RESULTS[b.result]} ของ ${PM.dash(b.code)}?\n\nงานจะกลับไปอยู่ขั้น ${PM.bidStageLabel(b.stage)} และ Win rate จะคำนวณใหม่`, { title: 'ยกเลิกผลการประมูล', ok: 'ยกเลิกผล', cancel: 'ไม่ยกเลิก', tone: 'question' }).then((ok) => {
        if (!ok) return;
        b.result = 'pending'; b.resultDate = '';
        PM.upsert('bids', b);
        U.toast(`${PM.dash(b.code)} กลับมารอผลแล้ว`);
        done();
      });
      return true;
    }
    if (a === 'won' || a === 'lost' || a === 'nobid') {
      b.result = a; b.resultDate = T; PM.upsert('bids', b);
      U.toast(`${PM.dash(b.code)} → ${PM.BID_RESULTS[a]}`);
      if (a === 'won') {
        U.confirm(`${PM.dash(b.code)} ได้งานแล้ว — สร้าง Project จาก Bid นี้เลยหรือไม่?`, { title: 'ยินดีด้วย! ได้งานแล้ว', ok: 'สร้าง Project', cancel: 'ภายหลัง', tone: 'success' })
          .then((ok) => { if (ok) V.projectForm(null, b, (p) => (location.hash = '#/projects/' + p.id)); });
      }
      done();
      return true;
    }
    if (a === 'convert') { V.projectForm(null, b, (p) => (location.hash = '#/projects/' + p.id)); return true; }
    if (a === 'open-project') { location.hash = '#/projects/' + b.projectId; return true; }
    return false;
  };

  V.stageOf = (b) => { let s = 'inquiry'; PM.BID_STAGES.forEach((x) => { if (b.dates[x.key]) s = x.key; }); return s; };
  V.resultBadge = (b) => {
    if (b.result === 'won') return U.badge('good', 'Won');
    if (b.result === 'lost') return U.badge('critical', 'Lost');
    if (b.result === 'nobid') return U.badge('neutral', 'No-bid');
    return U.badge('info', PM.BID_STAGES.find((s) => s.key === b.stage).label);
  };
  V.dueBadge = (b) => {
    if (!b.dueDate) return '';
    if (b.dates.submit && b.submitAssumed) return U.badge('good', 'ยื่นแล้ว'); // Status Complete: no real date to judge by
    if (b.dates.submit) return b.dates.submit <= b.dueDate ? U.badge('good', 'On time') : U.badge('critical', `Late ${PM.diffDays(b.dueDate, b.dates.submit)}d`);
    if (b.result !== 'pending') return '';
    const left = PM.diffDays(PM.today(), b.dueDate);
    if (left < 0) return U.badge('critical', `Overdue ${-left}d`);
    if (left <= 5) return U.badge('warning', `Due ${left}d`);
    return U.badge('neutral', `Due ${left}d`);
  };

  const people = () => PM.db.resources.filter((r) => r.active !== false).map((r) => ({ value: r.id, label: r.name }));
  /* THB ↔ the list's Value (MB) */
  V.toMB = (v) => (v === '' || v == null ? '' : +(Number(v) / 1e6).toFixed(3));
  V.delivTokens = (s) => String(s || '').split(/\s*[,/]\s*/).map((x) => x.trim()).filter(Boolean);

  /* ---------- bid form ---------- */
  /* Bid No. of a new inquiry starts as this fixed text (current year) — the user types the running number after it */
  V.bidNoPrefix = () => `PROP-${PM.today().slice(0, 4)}-IE EPC-00`;
  /* opts.tab: the part to open on (inquiry · estimate · price · proposal · submit · files) — default: the bid's current stage */
  V.bidForm = async function (bid, onSaved, opts = {}) {
    await PM.roles.loadTeam(); // user accounts for the Sales list
    const T = PM.today();
    const isNew = !bid;
    const canEdit = PM.canEditBid(bid || null); // Admin · PM · Engineer (every bid) · Sales (their own bids; any new inquiry)
    if (isNew && !canEdit) { U.alert('เพิ่ม Inquiry ได้เฉพาะ Admin · Project Manager · Engineer · Sales'); return; }
    // value · margin · quotation files: seen by Admin · Dept Manager · PM · Engineer · Sales; changed by Admin and the
    // owning Sales only (the database enforces both) — a PM / Engineer adding an inquiry leaves the price to its Sales
    const canPrice = PM.seesBidPrices();
    const canEditPrice = PM.canEditBidPrice(bid || null);
    const b = bid || {
      id: PM.uid('B'), code: V.bidNoPrefix(),
      name: '', client: '', sector: 'Industrial', value: 0, margin: 10, estimator: '', boqItems: 0,
      dueDate: PM.addDays(T, 30), dates: { inquiry: T, estimate: '', proposal: '', submit: '' }, stage: 'inquiry',
      result: 'pending', resultDate: '', projectId: null, notes: '', sales: '', salesName: '', leadSource: 'Sales visit', contact: '',
    };
    if (isNew && !canEditPrice) { b.value = null; b.margin = null; } // no price on the shared bid record (cloud.js sends price only via bidprices)
    const est = b.estimate || {}, prop = PM.propOf(b);
    let autoSubmit = ''; // the submit date this form filled in by itself
    // the fields the Proposal Status List shares with other tabs: one value, shown in both places (see "mirror" below)
    const MIRRORS = { m_code: 'code', m_client: 'client', m_name: 'name', m_due: 'dueDate', m_sales: 'salesName' };
    const propStatus0 = prop.status === 'win' || prop.status === 'lose' ? prop.status : prop.work;
    // a salesperson opening "New inquiry" is adding their own lead: they are the Sales (their employee record, else their account)
    if (isNew) {
      const me = PM.auth && PM.auth.user;
      const r = me && PM.db.resources.find((x) => x.discipline === 'Sales' && PM.normName(x.name) === PM.normName(PM.auth.displayName(me)));
      if (r) b.sales = r.id;
      else if (me && PM.myRole() === 'sales') { b.sales = me.id; b.salesName = PM.auth.displayName(me); }
    }
    const sources = PM.LEAD_SOURCES.includes(b.leadSource) || !b.leadSource ? PM.LEAD_SOURCES : PM.LEAD_SOURCES.concat(b.leadSource);
    const lockNote = '<p class="full perm-note">🔒 มูลค่า · Margin · ไฟล์ใบเสนอราคา เห็นได้เฉพาะ Admin · Department Manager · Project Manager · Engineer · Sales</p>';
    const roNum = (v, d) => (v == null || v === '' ? '–' : U.num(Number(v), d));
    // one tab per part of the bid — each team fills its own part; all tabs are one form, saved together
    const TABS = [
      { key: 'inquiry', label: 'Inquiry', n: 1 },
      { key: 'estimate', label: 'Estimate', n: 2 },
      { key: 'price', label: 'ราคาขาย', lock: !canPrice },
      { key: 'proposal', label: 'Proposal', n: 3 },
      { key: 'submit', label: 'Submit · ผล', n: 4 },
      { key: 'files', label: 'ไฟล์ทีม' },
    ];
    const tab0 = TABS.some((t) => t.key === opts.tab) ? opts.tab
      : isNew ? 'inquiry' : b.result && b.result !== 'pending' ? 'submit' : b.stage || 'inquiry';
    const pane = (key, html, cls) => `<div class="full bf-pane${cls ? ' ' + cls : ''}" data-pane="${key}"${key === tab0 ? '' : ' hidden'}>${html}</div>`;
    const body = `
      <div class="full bf-tabs" role="tablist">${TABS.map((t) => `<button type="button" role="tab" data-tab="${t.key}" class="${t.key === tab0 ? 'on' : ''}" aria-selected="${t.key === tab0}">${t.n ? `<i>${t.n}</i>` : ''}${t.lock ? '🔒 ' : ''}${esc(t.label)}<em data-mark="${t.key}"></em></button>`).join('')}</div>
      ${canEdit ? '' : '<p class="full perm-note">ดูได้อย่างเดียว — เพิ่ม / แก้ไข Inquiry, เลื่อนขั้น และบันทึกผล Won / Lost ได้เฉพาะ Admin · Project Manager · Engineer และ Sales ผู้รับผิดชอบงานนี้</p>'}
      ${pane('inquiry', `
      <div class="sub-h">ข้อมูลงานประมูล</div>
      ${U.field('Bid No.', 'code', b.code, { hint: 'ไม่บังคับ — เว้นว่างได้ แสดงเป็น "-"' })}
      ${U.field('ลูกค้า (Client)', 'client', b.client)}
      ${U.field('ชื่องาน / Scope of work', 'name', b.name, { full: true })}
      ${U.field('Inquiry received', 'd_inquiry', b.dates.inquiry, { type: 'date' })}
      <p class="full muted" style="margin:0">ทุกช่องไม่บังคับ — ช่องที่เว้นว่างแสดงเป็น "-" และกลับมากรอกภายหลังได้</p>
      ${U.field('กำหนดยื่นใบเสนอราคา (Due date)', 'dueDate', b.dueDate, { type: 'date' })}
      <div class="sub-h">Sales — ผู้หาลูกค้า / งานนี้มาจากไหน</div>
      <label><span>Sales ผู้รับผิดชอบลูกค้า</span>${V.salesInput(b)}<small class="muted">${PM.teamError ? esc(PM.teamError) : 'พิมพ์ชื่อได้เลย หรือเลือกจากรายชื่อที่ขึ้นมา'}</small></label>
      ${U.field('ที่มาของงาน (Lead source)', 'leadSource', b.leadSource || '', { options: sources, placeholder: '— เลือก —' })}
      ${U.field('ผู้ติดต่อฝั่งลูกค้า (Contact)', 'contact', b.contact || '', { placeholder: 'ชื่อ / ตำแหน่ง / เบอร์โทร', full: true })}
      ${U.field('Sector', 'sector', b.sector, { options: PM.SECTORS })}`)}
      ${pane('estimate', `
      <div class="sub-h">การประมาณราคา (Estimate) — ทีม Engineer / PM กรอกได้</div>
      ${U.field('Estimate started', 'd_estimate', b.dates.estimate, { type: 'date' })}
      ${U.field('สถานะการประมาณราคา', 'est_status', est.status || 'todo', { options: PM.EST_STATUS.map((s) => ({ value: s.key, label: s.label })) })}
      ${U.field('Estimator', 'estimator', b.estimator, { options: people(), placeholder: '— เลือก —' })}
      ${U.field('ผู้ตรวจราคา (Reviewer)', 'est_reviewer', est.reviewer || '', { options: people(), placeholder: '— เลือก —' })}
      ${U.field('จำนวนรายการ BOQ (Quantity)', 'boqItems', b.boqItems, { type: 'number', min: 0 })}
      <span></span>
      <p class="full muted est-note">ต้นทุนประมาณการ (Cost estimate) — ต้นทุนของเรา ไม่ใช่ราคาขาย · ทุก Role ที่ดู Bidding เห็นได้</p>
      ${U.field('ค่าวัสดุ / อุปกรณ์ (THB)', 'est_material', est.material || '', { type: 'number', min: 0, step: 'any' })}
      ${U.field('ค่าแรง / ติดตั้ง (THB)', 'est_labour', est.labour || '', { type: 'number', min: 0, step: 'any' })}
      ${U.field('ผู้รับเหมาช่วง (THB)', 'est_subcon', est.subcon || '', { type: 'number', min: 0, step: 'any' })}
      ${U.field('อื่น ๆ / Overhead / Contingency (THB)', 'est_other', est.other || '', { type: 'number', min: 0, step: 'any' })}
      <div class="full est-total"><span>ต้นทุนประมาณการรวม</span><b id="est-total">–</b><span id="est-margin"></span></div>
      ${U.field('สมมติฐาน / ข้อยกเว้น (Assumptions / Exclusions)', 'est_notes', est.notes || '', { type: 'textarea', full: true, rows: 2 })}`)}
      ${pane('price', `
      <div class="sub-h">ราคาขาย — แก้ได้เฉพาะ Admin / Sales ผู้รับผิดชอบงานนี้</div>
      ${canEditPrice ? `${U.field('มูลค่าประมาณการ / ราคาเสนอ (THB)', 'value', b.value, { type: 'number', min: 0, step: 'any' })}
      ${U.field('Margin (%)', 'margin', b.margin, { type: 'number', step: 0.1 })}
      <div class="full est-total"><span>ต้นทุนประมาณการ (จากแท็บ Estimate)</span><b id="est-total-p">–</b><span id="est-margin-p"></span></div>
      ${PM.poFiles.boxHtml(canEdit, 'ไฟล์แนบ — ใบเสนอราคา / เอกสาร Inquiry', 'ใบเสนอราคาที่ส่งให้ลูกค้า, TOR, แบบ, BOQ')}`
      : canPrice // everyone else who sees prices: the same figures and files, read only (no names: nothing of it is saved from here)
      ? `<label><span>มูลค่าประมาณการ / ราคาเสนอ (THB)</span><input value="${esc(roNum(b.value))}" data-ro-value="${esc(b.value == null ? '' : b.value)}" disabled></label>
      <label><span>Margin (%)</span><input value="${esc(roNum(b.margin, 1))}" disabled></label>
      <div class="full est-total"><span>ต้นทุนประมาณการ (จากแท็บ Estimate)</span><b id="est-total-p">–</b><span id="est-margin-p"></span></div>
      ${PM.poFiles.boxHtml(false, 'ไฟล์แนบ — ใบเสนอราคา / เอกสาร Inquiry', 'ดูและดาวน์โหลดได้ · แนบ / ลบได้เฉพาะ Admin และ Sales ผู้รับผิดชอบงานนี้')}
      <p class="full perm-note">ดูได้อย่างเดียว — มูลค่า · Margin · ไฟล์ใบเสนอราคา แก้ได้เฉพาะ Admin และ Sales ผู้รับผิดชอบงานนี้</p>`
      : lockNote}`)}
      ${pane('proposal', `
      <div class="sub-h">Project Information</div>
      ${U.field('Customer', 'm_client', b.client)}
      ${U.field('Bid No.', 'm_code', b.code)}
      ${U.field('Project Name', 'm_name', b.name, { full: true })}
      ${U.field('Type', 'prop_type', prop.type, { options: PM.PROP_TYPES })}
      ${canEditPrice ? U.field('Value (MB)', 'm_value', V.toMB(b.value), { type: 'number', min: 0, step: 'any', hint: 'ล้านบาท · แก้ได้เฉพาะ Admin และ Sales เจ้าของงาน' })
        : canPrice // read only (no name: never saved from here)
          ? `<label><span>Value (MB)</span><input value="${esc(b.value == null ? '–' : V.toMB(b.value))}" disabled><small class="muted">ดูได้อย่างเดียว · แก้ได้เฉพาะ Sales เจ้าของงาน / Admin</small></label>`
          : '<label><span>Value (MB)</span><input value="🔒" disabled><small class="muted">เห็นได้เฉพาะ Admin · Dept Manager · PM · Engineer · Sales</small></label>'}
      ${U.field('Priority', 'prop_priority', prop.priority, { options: [{ value: '', label: '-' }].concat(PM.PROP_PRIORITY.map((x) => ({ value: x.key, label: x.key }))) })}
      <span></span>
      <div class="sub-h">Schedule</div>
      ${U.field('Due Date', 'm_due', b.dueDate, { type: 'date' })}
      ${U.field('Start Date', 'd_proposal', b.dates.proposal, { type: 'date' })}
      <div class="sub-h">Tracking</div>
      ${U.field('Progress (%)', 'prop_progress', prop.progress, { type: 'number', min: 0, max: 100, step: 1 })}
      ${U.field('Status', 'prop_status', propStatus0, { options: PM.PROP_STATUS.map((s) => ({ value: s.key, label: s.label })) })}
      <div class="sub-h">Team</div>
      <label><span>PM</span>${V.pmSelect('prop_owner', prop.owner, prop.ownerName)}</label>
      <label><span>Sales</span><input name="m_sales" list="dl-sales" value="${esc(V.salesName(b) === '–' ? '' : V.salesName(b))}" placeholder="เว้นว่าง = Non" autocomplete="off"></label>
      <div class="sub-h">Scope</div>
      ${U.field('Deliverables', 'prop_deliv', prop.deliverables, { full: true, placeholder: 'เช่น P&ID, List eq., BOQ', hint: 'กดเลือกจากรายการ หรือพิมพ์เพิ่มเองได้' })}
      <div class="full deliv-chips">${PM.PROP_DELIVERABLES.map((d) => `<button type="button" class="deliv-chip" data-deliv="${esc(d)}">${esc(d)}</button>`).join('')}</div>
      ${U.field('หมายเหตุ', 'prop_notes', prop.notes, { type: 'textarea', full: true, rows: 2 })}`, 'no-i18n')}
      ${pane('submit', `
      <div class="sub-h">ยื่นใบเสนอราคา (Submit)</div>
      ${U.field('Submitted', 'd_submit', b.dates.submit, { type: 'date', hint: 'Status Complete ถือว่ายื่นแล้ว ถ้าไม่มีวันที่ระบบใช้ Due Date · แก้เป็นวันยื่นจริงได้' })}
      <span></span>
      <div class="sub-h">ทบทวนก่อนยื่น (ISO 9001 ข้อ 8.2.3)</div>
      <label><span>ผู้ทบทวนข้อกำหนดลูกค้า</span>${V.pmSelect('prop_reviewer', prop.reviewer, '')}</label>
      ${U.field('วันที่ทบทวน', 'prop_reviewDate', prop.reviewDate, { type: 'date' })}
      <div class="sub-h">ผลการประมูล (Award)</div>
      ${U.field('Result', 'result', b.result, { options: Object.keys(PM.BID_RESULTS).map((k) => ({ value: k, label: PM.BID_RESULTS[k] })) })}
      ${U.field('Result date', 'resultDate', b.resultDate, { type: 'date' })}
      ${U.field('หมายเหตุ', 'notes', b.notes, { type: 'textarea', full: true, rows: 2 })}`)}
      ${pane('files', `
      ${PM.poFiles.boxHtml(canEdit, 'ไฟล์งานของทีม — ถอดปริมาณ / ประมาณราคา / ข้อเสนอทางเทคนิค', 'ทุกคนในทีมเห็นได้ · ใบเสนอราคาที่ส่งลูกค้าอยู่ในแท็บ "ราคาขาย"', 'work')}`)}`;
    let files = null;
    const form = U.modal({
      title: isNew ? (opts.tab === 'proposal' ? 'New proposal' : 'New inquiry') : `${PM.dash(b.code)} · ${PM.dash(b.name)}`, body, wide: true,
      // only who may see this bid's quotation files: deleting has to remove them, and the names stay hidden from everyone else
      deleteText: () => PM.purge.bidText(b),
      onDelete: isNew || !canEdit || !PM.canEditBidPrice(b) ? null : async () => { await PM.purge.bid(b); U.toast('ลบแล้ว'); if (onSaved) onSaved(); },
      onSubmit: !canEdit ? null : (f, frm) => {
        const toCode = () => { showTab('inquiry'); frm.code.focus(); };
        // Bid No. is optional: only the prefix that a new inquiry starts with, or nothing, = no number yet (shown as "-")
        f.code = String(f.code || '').trim();
        if (f.code === V.bidNoPrefix().trim() || f.code === '-') f.code = '';
        ['client', 'name'].forEach((k) => { f[k] = String(f[k] || '').trim(); if (f[k] === '-') f[k] = ''; });
        if (f.code && PM.db.bids.some((x) => x.id !== b.id && String(x.code || '').trim().toUpperCase() === f.code.toUpperCase())) {
          U.alert(`Bid No. ${f.code} ถูกใช้แล้ว`).then(toCode); return false;
        }
        const dates = { inquiry: f.d_inquiry, estimate: f.d_estimate, proposal: f.d_proposal, submit: f.d_submit };
        if (!dates.submit && ['complete', 'win', 'lose'].includes(f.prop_status)) dates.submit = autoSubmit = assumedNow(); // Status Complete = handed in
        const order = PM.BID_STAGES.map((s) => dates[s.key]).filter(Boolean);
        if (order.some((d, i) => i && d < order[i - 1])) { U.alert('วันที่แต่ละขั้นต้องเรียงตามลำดับ Inquiry → Estimate → Proposal → Submit (วันที่อยู่ในแท็บของแต่ละขั้น)'); return false; }
        // nothing to tell the bid by at all: ask once, it may be a slip — but it is allowed
        if (!f.code && !f.client && !f.name) {
          U.confirm('ยังไม่ได้กรอก Bid No. ลูกค้า และชื่องาน — งานนี้จะแสดงเป็น "-" ทั้งหมด\nบันทึกเลยหรือไม่?', { title: 'บันทึกโดยไม่มีชื่องาน', ok: 'บันทึก', cancel: 'กลับไปกรอก', tone: 'question' })
            .then((ok) => { if (ok) save(f, dates, frm); else toCode(); });
          return false;
        }
        save(f, dates, frm);
        return false; // closed by save() once the files are uploaded
      },
    });
    files = canPrice ? PM.poFiles.box(form, b.files, canEdit && canEditPrice) : null;
    const work = PM.poFiles.box(form, b.workFiles, canEdit, 'work'); // the team's working files (bidwork/…)
    // total estimated cost — and, for those who see the price, the margin it leaves
    const n = (x) => Number(x && x.value) || 0;
    // the selling price on screen: the field (who may change it) or the read-only figure (who only sees it)
    const priceNow = () => { if (form.value) return n(form.value); const ro = form.querySelector('[data-ro-value]'); return ro ? Number(ro.dataset.roValue) || 0 : 0; };
    const drawCost = () => {
      const cost = n(form.est_material) + n(form.est_labour) + n(form.est_subcon) + n(form.est_other);
      const v = priceNow();
      const mg = cost && v ? `เทียบราคาเสนอ ${U.money(v)} → Margin จากต้นทุน <b class="${v - cost < 0 ? 'neg' : ''}">${U.pct((v - cost) / v, 1)}</b>` : '';
      ['', '-p'].forEach((sfx) => {
        const t = form.querySelector('#est-total' + sfx);
        if (!t) return;
        t.textContent = cost ? U.money(cost) : '–';
        form.querySelector('#est-margin' + sfx).innerHTML = mg;
      });
    };
    // tabs: show one part at a time; a ✓ marks a part that is done
    const showTab = (key) => {
      form.querySelectorAll('.bf-tabs [data-tab]').forEach((t) => { const on = t.dataset.tab === key; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
      form.querySelectorAll('.bf-pane').forEach((p) => { p.hidden = p.dataset.pane !== key; });
      form.querySelector('.modal-body').scrollTop = 0;
    };
    form.querySelector('.bf-tabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) showTab(t.dataset.tab); });
    const drawMarks = () => {
      const v = (name) => (form.elements[name] && form.elements[name].value) || '';
      const done = {
        inquiry: !!(v('code') && v('client') && v('name') && v('d_inquiry')),
        estimate: ['done', 'reviewed'].includes(v('est_status')),
        price: canPrice && priceNow() > 0,
        proposal: ['complete', 'win', 'lose'].includes(v('prop_status')),
        submit: !!v('d_submit') || v('result') !== 'pending',
        files: form.querySelectorAll('[data-files="work"] .po-file-list li:not(.empty-files)').length > 0,
      };
      form.querySelectorAll('[data-mark]').forEach((m) => { m.textContent = done[m.dataset.mark] ? '✓' : ''; });
    };
    // a required field left empty in another tab: open that tab so the browser can point at it
    form.addEventListener('invalid', (e) => {
      const p = e.target.closest('.bf-pane');
      if (p && p.hidden) { showTab(p.dataset.pane); setTimeout(() => e.target.reportValidity(), 0); }
    }, true);
    /* mirror: Customer · Project Name · Bid No. · Due Date · Sales · Value are also on the tab they started on — one value, both places */
    const el = (name) => form.elements[name];
    const toSource = (name) => {
      if (MIRRORS[name]) el(MIRRORS[name]).value = el(name).value;
      if (name === 'm_value') el('value').value = el(name).value === '' ? '' : Math.round(Number(el(name).value) * 1e6);
    };
    const toMirror = (name) => {
      Object.keys(MIRRORS).filter((m) => MIRRORS[m] === name).forEach((m) => { el(m).value = el(name).value; });
      if (name === 'value' && el('m_value')) el('m_value').value = V.toMB(el('value').value);
    };
    Object.values(MIRRORS).concat(canEditPrice ? ['value'] : []).forEach(toMirror); // a restored draft may have changed the first ones
    /* Status Complete (Win) / (Lose) and the Result on the Submit tab are the same thing */
    const syncResult = (name) => {
      const st = el('prop_status'), res = el('result');
      if (name === 'prop_status') res.value = st.value === 'win' ? 'won' : st.value === 'lose' ? 'lost' : ['won', 'lost'].includes(res.value) ? 'pending' : res.value;
      if (name === 'result') st.value = res.value === 'won' ? 'win' : res.value === 'lost' ? 'lose' : ['win', 'lose'].includes(st.value) ? 'complete' : st.value;
    };
    /* Status Complete = handed in: the date fills in as soon as the status is chosen, and goes again if the choice changes */
    const assumedNow = () => PM.assumedSubmit(el('dueDate').value, [el('d_inquiry').value, el('d_estimate').value, el('d_proposal').value].filter(Boolean).sort().pop());
    const syncSubmit = () => {
      const finished = ['complete', 'win', 'lose'].includes(el('prop_status').value), box = el('d_submit');
      if (finished && !box.value) box.value = autoSubmit = assumedNow();
      else if (!finished && autoSubmit && box.value === autoSubmit) { box.value = ''; autoSubmit = ''; }
    };
    const drawDeliv = () => {
      const has = new Set(V.delivTokens(el('prop_deliv').value).map((x) => x.toLowerCase()));
      form.querySelectorAll('[data-deliv]').forEach((c) => c.classList.toggle('on', has.has(c.dataset.deliv.toLowerCase())));
    };
    form.querySelector('.deliv-chips').addEventListener('click', (e) => {
      const c = e.target.closest('[data-deliv]');
      if (!c || el('prop_deliv').disabled) return;
      const d = c.dataset.deliv, list = V.delivTokens(el('prop_deliv').value);
      const at = list.findIndex((x) => x.toLowerCase() === d.toLowerCase());
      if (at >= 0) list.splice(at, 1); else list.push(d);
      el('prop_deliv').value = list.join(', ');
      el('prop_deliv').dispatchEvent(new Event('input', { bubbles: true }));
    });
    form.addEventListener('input', (e) => {
      const name = e.target.name || '';
      toSource(name); toMirror(name);
      if (name === 'prop_deliv') drawDeliv();
      // a new proposal started before today: the inquiry cannot be later than its start
      if (name === 'd_proposal' && isNew && e.target.value && el('d_inquiry').value > e.target.value) el('d_inquiry').value = e.target.value;
      if (/^est_|^value$|^m_value$/.test(name)) drawCost();
      drawMarks();
    });
    form.addEventListener('change', (e) => { syncResult(e.target.name); syncSubmit(); drawMarks(); });
    drawCost();
    drawMarks();
    drawDeliv();
    if (!canEdit) { // view only
      form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
      if (document.activeElement) document.activeElement.blur();
      return;
    }
    // new inquiry: cursor at the end of the Bid No. text, ready to type the number
    if (isNew) { const c = form.code; c.focus(); c.setSelectionRange(c.value.length, c.value.length); }

    async function save(f, dates, frm) {
      const btn = frm.querySelector('[type=submit]');
      btn.disabled = true; btn.classList.add('loading');
      const { files: kept, problems } = files && canEditPrice ? await files.commit(`bids/${b.id}`, btn) : { files: b.files, problems: [] };
      const w = await work.commit(`bidwork/${b.id}`, btn); // working files: open to every role (not under bids/)
      problems.push(...w.problems);
      b.workFiles = w.files;
      b.estimate = { status: f.est_status, reviewer: f.est_reviewer, material: f.est_material, labour: f.est_labour, subcon: f.est_subcon, other: f.est_other, notes: f.est_notes };
      b.proposal = {
        type: f.prop_type, priority: f.prop_priority, progress: Math.max(0, Math.min(100, Math.round(Number(f.prop_progress) || 0))),
        status: ['win', 'lose'].includes(f.prop_status) ? 'complete' : f.prop_status, // win / lose live in the bid's result
        owner: f.prop_owner, ownerName: f.prop_owner ? '' : prop.ownerName, deliverables: f.prop_deliv, notes: f.prop_notes, listNo: (b.proposal || {}).listNo,
        reviewer: f.prop_reviewer, reviewDate: f.prop_reviewer ? f.prop_reviewDate || T : f.prop_reviewDate,
      };
      // still the date we assumed, or one someone typed in?
      const keptAssumed = b.submitAssumed && b.dates && dates.submit === b.dates.submit;
      b.submitAssumed = !!dates.submit && (dates.submit === autoSubmit || !!keptAssumed);
      Object.assign(b, {
        code: f.code, name: f.name, client: f.client, sector: f.sector,
        estimator: f.estimator, boqItems: f.boqItems, dueDate: f.dueDate, dates, result: f.result,
        resultDate: f.result === 'pending' ? '' : f.resultDate || T, notes: f.notes,
        leadSource: f.leadSource, contact: f.contact,
      }, V.resolveSales(f.salesName, b));
      if (canEditPrice) Object.assign(b, { value: f.value, margin: f.margin, files: kept });
      // owner = the Sales account whose price this is: a Sales adding / editing → themselves; Admin → the Sales chosen
      if (PM.myRole() === 'sales') b.owner = (isNew ? PM.myUid() : PM.bidOwner(b)) || PM.myUid();
      else b.owner = PM.bidOwnerFor(b.sales, b.salesName);
      b.stage = V.stageOf(b);
      PM.upsert('bids', b);
      U.closeModal();
      U.toast(problems.length ? 'บันทึกแล้ว แต่ไฟล์บางไฟล์มีปัญหา' : 'บันทึกแล้ว');
      if (problems.length) U.alert('ไฟล์ที่ไม่สำเร็จ:\n' + problems.join('\n'));
      onSaved && onSaved(b);
    }
  };

  /* Next project number: JB{yy}-PROJ-{running 4 digits}, e.g. JB26-PROJ-0001 (restarts each year) */
  V.nextProjectCode = function () {
    const prefix = `JB${PM.today().slice(2, 4)}-PROJ-`;
    const re = new RegExp('^' + prefix + '(\\d+)$');
    const max = PM.db.projects.reduce((m, x) => { const hit = String(x.code || '').match(re); return hit ? Math.max(m, +hit[1]) : m; }, 0);
    return prefix + String(max + 1).padStart(4, '0');
  };

  /* ---------- people pickers (Project Manager, Sales): user accounts (Supabase) + employees from Resource ---------- */
  const lookupName = (id) => {
    const acc = id && (PM.team || []).find((u) => u.id === id);
    if (acc) return acc.full_name;
    const res = id && PM.find('resources', id);
    return res ? res.name : null;
  };
  V.personName = (id, fallback) => (id && lookupName(id)) || fallback || '–';
  V.pmName = (p) => V.personName(p && p.pm, p && p.pmName);
  V.salesName = (x) => V.personName(x && x.sales, x && x.salesName);
  /* ---------- Project Manager picker — based on Resource Utilization ----------
     Employees come first (discipline "Project Management" on top), each with level, utilization (last 4 weeks)
     and how many active projects they already manage. User accounts are only a fallback for people
     who are not in Resource Utilization yet. */
  V.pmLoad = function (exceptProjectId) {
    const T = PM.today();
    const ut = PM.utilization(PM.addDays(T, -27), T);
    const out = {};
    ut.people.forEach((x) => { out[x.r.id] = { util: x.util, target: x.target, projects: [] }; });
    PM.db.projects.filter((p) => p.status !== 'closed' && p.id !== exceptProjectId && p.pm).forEach((p) => {
      if (out[p.pm]) out[p.pm].projects.push(p);
    });
    return out;
  };
  /* an account id whose name matches an employee → that employee (so old projects pick up the resource data) */
  V.pmResourceId = function (id) {
    if (!id || PM.find('resources', id)) return id;
    const acc = (PM.team || []).find((u) => u.id === id);
    const r = acc && PM.db.resources.find((x) => PM.normName(x.name) === PM.normName(acc.full_name));
    return r ? r.id : id;
  };
  V.pmSelect = function (name, value, storedName, exceptProjectId) {
    value = V.pmResourceId(value);
    const load = V.pmLoad(exceptProjectId);
    const team = PM.team || [];
    const opt = (v, label) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(label)}</option>`;
    const resources = PM.db.resources.filter((r) => (r.active !== false && r.discipline !== 'Sales') || r.id === value);
    const resLabel = (r) => {
      const l = load[r.id];
      const bits = [PM.levelName(r.level)];
      if (r.discipline && r.discipline !== 'Project Management') bits.push(r.discipline);
      if (l && l.util != null) bits.push('Util ' + U.pct(l.util));
      if (l && l.projects.length) bits.push(`PM อีก ${l.projects.length} โครงการ`);
      return `${r.name} — ${bits.join(' · ')}`;
    };
    const resNames = new Set(PM.db.resources.map((r) => PM.normName(r.name)));
    const groups = [
      ['Project Management (Resource Utilization)', resources.filter((r) => r.discipline === 'Project Management').map((r) => [r.id, resLabel(r)])],
      ['พนักงานอื่น (Resource Utilization)', resources.filter((r) => r.discipline !== 'Project Management').map((r) => [r.id, resLabel(r)])],
      ['บัญชีผู้ใช้ที่ยังไม่มีใน Resource Utilization', team.filter((u) => !resNames.has(PM.normName(u.full_name))).map((u) => [u.id, `${u.full_name} · ${PM.roleLabel(u.role)}`])],
    ];
    const known = new Set(groups.flatMap((g) => g[1].map((x) => x[0])));
    return `<select name="${esc(name)}">
      <option value="">— เลือก —</option>
      ${groups.filter((g) => g[1].length).map(([label, items]) => `<optgroup label="${esc(label)}">${items.map(([v, l]) => opt(v, l)).join('')}</optgroup>`).join('')}
      ${value && !known.has(value) ? opt(value, `${lookupName(value) || storedName || 'ไม่พบรายชื่อ'} (เดิม)`) : ''}
    </select>`;
  };
  /* one line about the chosen PM, from Resource Utilization */
  V.pmInfo = function (id, exceptProjectId) {
    const r = id && PM.find('resources', id);
    if (!id) return 'รายชื่อจาก Resource Utilization — Util = ชั่วโมง billable ÷ ชั่วโมงที่ว่าง (4 สัปดาห์ล่าสุด)';
    if (!r) return 'บัญชีผู้ใช้นี้ยังไม่มีใน Resource Utilization — เพิ่มได้ที่ Resource Utilization → Add person (ชื่อเดียวกัน) เพื่อดูภาระงาน';
    const l = V.pmLoad(exceptProjectId)[r.id] || { util: null, target: 0.8, projects: [] };
    const util = l.util == null ? 'ยังไม่มี Timesheet'
      : `Util 4 สัปดาห์ ${U.pct(l.util)} (เป้า ${U.pct(l.target)})${l.util > 1.05 ? ' — งานล้น' : l.util < l.target ? ' — ยังรับงานเพิ่มได้' : ''}`;
    const prj = l.projects.length ? `เป็น PM โครงการอื่นอยู่ ${l.projects.length} โครงการ: ${l.projects.map((p) => p.code).join(', ')}` : 'ยังไม่ได้เป็น PM โครงการอื่น';
    return `${PM.levelName(r.level)} · ${r.discipline || '–'} · ${util} · ${prj}`;
  };
  /* Sales: free text with suggestions (Sales staff, user accounts, other employees, names typed before).
     A name that matches someone on the list is stored with their id; anything else is kept as the typed name. */
  const salesCandidates = () => {
    const team = PM.team || [];
    const res = PM.db.resources.filter((r) => r.active !== false);
    const list = [
      ...res.filter((r) => r.discipline === 'Sales').map((r) => ({ id: r.id, name: r.name, note: 'Sales' })),
      ...team.map((u) => ({ id: u.id, name: u.full_name, note: 'บัญชีผู้ใช้ · ' + PM.roleLabel(u.role) })),
      ...res.filter((r) => r.discipline !== 'Sales').map((r) => ({ id: r.id, name: r.name, note: r.discipline || 'พนักงาน' })),
      ...PM.db.bids.concat(PM.db.projects).filter((x) => !x.sales && x.salesName).map((x) => ({ id: '', name: x.salesName, note: 'เคยกรอกไว้' })),
    ];
    const seen = new Set();
    return list.filter((c) => { const k = PM.normName(c.name); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  };
  V.salesInput = function (x) {
    const opts = salesCandidates();
    return `<input name="salesName" list="dl-sales" value="${esc(V.salesName(x) === '–' ? '' : V.salesName(x))}" placeholder="พิมพ์ชื่อ หรือเลือกจากรายชื่อ" autocomplete="off">
      <datalist id="dl-sales">${opts.map((c) => `<option value="${esc(c.name)}">${esc(c.note)}</option>`).join('')}</datalist>`;
  };
  /* typed name → { sales: id or '', salesName } ; keeps the previous id when the name did not change */
  V.resolveSales = function (typed, prev) {
    const name = String(typed || '').trim().replace(/\s+/g, ' ');
    if (!name) return { sales: '', salesName: '' };
    const k = PM.normName(name);
    if (prev && prev.sales && PM.normName(V.salesName(prev)) === k) return { sales: prev.sales, salesName: lookupName(prev.sales) || name };
    const hit = salesCandidates().find((c) => c.id && PM.normName(c.name) === k);
    return hit ? { sales: hit.id, salesName: hit.name } : { sales: '', salesName: name };
  };

  /* Sales performance table (Bidding page + Dashboard). rows = PM.salesStats(); selected = highlighted id */
  V.salesTable = function (rows, selected) {
    if (!rows.length) return '<p class="empty">ยังไม่มีข้อมูล Sales — เพิ่มพนักงาน Discipline = Sales ที่ Resource Utilization แล้วเลือก Sales ในแต่ละ Bid</p>';
    // money of a Sales row only when every bid in it is one this user may see (Admin: all · Sales: their own row)
    const rowPrices = (x) => x.bids.length > 0 && x.bids.every(PM.canSeeBidPrice);
    rows = rows.slice().sort((a, b) => (b.bs.won - a.bs.won) || (b.bs.total - a.bs.total));
    return `<table class="tbl"><thead><tr><th>Sales</th><th class="num">Inquiries</th><th class="num">ยื่นใบเสนอราคา</th><th class="num">Won / Lost</th><th class="num">Win rate</th>
      <th class="num">Won value</th><th class="num">Pipeline (รอผล)</th><th>โครงการที่รับผิดชอบ</th><th class="num">มูลค่าโครงการ Active</th></tr></thead><tbody>
      ${rows.map((x) => `<tr class="click sales-row${selected != null && selected === x.id ? ' on' : ''}" data-sales="${esc(x.id || '-')}">
        <td><span class="title">${x.id ? esc(V.personName(x.id, x.fallbackName)) : '<span class="muted">ไม่ระบุ Sales</span>'}</span></td>
        <td class="num">${x.bs.total}</td><td class="num">${x.bs.submitted}</td>
        <td class="num">${x.bs.won} / ${x.bs.lost}</td><td class="num">${U.pct(x.bs.winRate)}</td>
        <td class="num">${rowPrices(x) ? U.money(x.bs.wonValue) : V.LOCK_PRICE}</td>
        <td class="num">${rowPrices(x) ? U.money(x.pipelineValue) : V.LOCK_PRICE}<small>${x.pipeline} งาน</small></td>
        <td>${x.active.length ? x.active.map((p) => `<a class="chip" href="#/projects/${esc(p.id)}" title="${esc(p.name)}">${esc(p.code)}</a>`).join(' ') : '<span class="muted">–</span>'}${x.projects.length > x.active.length ? `<small>ปิดแล้ว ${x.projects.length - x.active.length} โครงการ</small>` : ''}</td>
        <td class="num">${U.money(x.activeValue)}</td></tr>`).join('')}
      </tbody></table>`;
  };

  /* name to store next to the id, so it still shows offline / after the account is gone */
  V.personLabel = (id, prevId, prevName) => (!id ? '' : lookupName(id) || (id === prevId ? prevName || '' : ''));

  /* change a project's plan cost and keep the phase split (proportional; default split if no phase budget yet) */
  PM.rescaleBudgets = function (p, total) {
    const current = PM.sum(p.phases, (ph) => ph.budget || 0);
    p.phases.forEach((ph) => {
      const share = current > 0 ? (ph.budget || 0) / current : PM.PHASE_DEFAULTS[ph.key].budget;
      ph.budget = Math.round(total * share);
    });
    p.budget = total;
  };

  /* ---------- project form ---------- */
  V.projectForm = async function (project, fromBid, onSaved) {
    await PM.roles.loadTeam(); // user accounts for the Project Manager list
    const T = PM.today();
    const isNew = !project;
    const p = project || {
      id: PM.uid('P'), code: V.nextProjectCode(),
      name: fromBid ? fromBid.name : '', client: fromBid ? fromBid.client : '',
      // the bid's value only when this user may see it — otherwise the PM types the contract value in
      // the Value is open to Dept Manager / PM / Engineer too; the margin is not (then the usual 10%)
      contractValue: fromBid && PM.canSeeBidValue(fromBid) ? fromBid.value || 0 : 0,
      budget: fromBid && PM.canSeeBidValue(fromBid) ? Math.round((fromBid.value || 0) * (1 - ((PM.canSeeBidPrice(fromBid) && fromBid.margin) || 10) / 100)) : 0,
      startDate: T, endDate: PM.addDays(T, 365), pm: '', status: 'active', bidId: fromBid ? fromBid.id : null, phases: null, progressLog: [],
      sales: fromBid ? fromBid.sales || '' : '', salesName: fromBid ? fromBid.salesName || '' : '', costMode: 'ledger',
    };
    const fin = PM.seesProjectFinance(); // without it the money fields are left out and the figures stay as they are
    const planNow = p.phases ? PM.sum(p.phases, (ph) => ph.budget || 0) : p.budget;
    const actualNow = p.phases ? PM.sum(p.phases, (ph) => ph.actualCost || 0) : 0;
    const body = `
      ${U.field('Project No.', 'code', p.code, { required: true })}
      ${U.field('Status', 'status', p.status, { options: [{ value: 'active', label: 'Active' }, { value: 'onhold', label: 'On hold' }, { value: 'closed', label: 'Closed' }] })}
      ${U.field('ชื่อโครงการ', 'name', p.name, { required: true, full: true })}
      ${U.field('ลูกค้า (Client)', 'client', p.client, { required: true, full: true })}
      <label class="full"><span>Project Manager <small class="muted">— จาก Resource Utilization</small></span>${V.pmSelect('pm', p.pm, p.pmName, p.id)}<small class="muted" id="pm-info">${esc(V.pmInfo(V.pmResourceId(p.pm), p.id))}</small></label>
      <label><span>Sales ผู้รับผิดชอบ</span>${V.salesInput(p)}<small class="muted">${fromBid && PM.salesKey(fromBid) ? `จาก ${esc(fromBid.code)} — Sales ที่หางานนี้มา` : 'พิมพ์ชื่อได้เลย หรือเลือกจากรายชื่อที่ขึ้นมา'}</small></label>
      ${U.field('Job No. (Odoo)', 'jobNo', p.jobNo || '', { placeholder: 'เช่น JB26-PROJ-0002', hint: 'ใช้จับคู่กับไฟล์ Monitor WIP/Accrued' })}
      ${U.field('PO ลูกค้า (PO No.)', 'clientPo', p.clientPo || '', { type: 'textarea', rows: 2, hint: 'มีหลายเลขใส่บรรทัดละเลข' })}
      ${U.field('Plant / Contact', 'plant', p.plant || '', { placeholder: 'เช่น MOC, ROC, TPC', hint: 'โรงงานหรือหน้างานของลูกค้า และผู้ติดต่อ' })}
      ${U.field('Eng / Tech — ทีมงาน', 'engTech', p.engTech || '', { full: true, placeholder: "เช่น P'Pong / Montree / Phet" })}
      ${!fin ? '<p class="full muted" style="margin:0">มูลค่าสัญญา · Plan cost · ต้นทุนจริง กรอกและดูได้เฉพาะ Admin · Department Manager · Project Manager · Engineer</p>' : `
      ${U.field('มูลค่าสัญญา (THB)', 'contractValue', p.contractValue, { type: 'number', min: 0, step: 'any' })}
      ${U.field('Plan cost — งบประมาณต้นทุน (THB)', 'budget', planNow, { type: 'number', min: 0, step: 'any', hint: isNew ? 'ระบบแบ่งให้ E / P / C / Closing อัตโนมัติ (แก้รายละเอียดได้ที่ "ต้นทุน Plan / Actual")' : 'ถ้าเปลี่ยน ระบบปรับงบของแต่ละ phase ตามสัดส่วนเดิม' })}
      ${isNew ? '' : `<label><span>Actual cost — ต้นทุนจริง (THB)</span><input value="${esc(U.num(actualNow))}" disabled><small class="muted">รวมจากรายการในแท็บ "ค่าใช้จ่าย" ของโครงการ</small></label>`}`}
      ${U.field('Start date', 'startDate', p.startDate, { type: 'date', required: true })}
      ${U.field('Finish date', 'endDate', p.endDate, { type: 'date', required: true })}
      ${p.datesEstimated ? '<p class="full neg" style="margin:0">ไฟล์ที่นำเข้าไม่มีวันที่ครบ ระบบตั้งวันที่นี้ชั่วคราว — แก้ให้ถูกแล้วบันทึก</p>' : ''}
      ${isNew ? '' : '<p class="full muted" style="margin:0">หมายเหตุ: การแก้วันที่โครงการไม่เปลี่ยนแผนของแต่ละ phase — แก้ได้ที่การ์ดขั้นงาน → อัปเดตความคืบหน้า</p>'}`;
    const form = U.modal({
      title: isNew ? (fromBid ? `Create project from ${fromBid.code}` : 'New project') : `Edit ${p.code}`, body,
      deleteText: () => PM.purge.projectText(p),
      onDelete: isNew || !PM.can('project.delete') ? null : async () => {
        location.hash = '#/projects'; // off the project's page first: it is about to go
        await PM.purge.project(p);
        U.toast(`ลบโครงการ ${p.code} แล้ว`);
        PM.render();
      },
      onSubmit: (f) => {
        if (f.endDate <= f.startDate) { U.alert('Finish date ต้องอยู่หลัง Start date'); return false; }
        if (PM.db.projects.some((x) => x.id !== p.id && String(x.code).toUpperCase() === f.code.toUpperCase())) {
          U.alert(`Project No. ${f.code} ถูกใช้แล้ว`); return false;
        }
        const planChanged = p.phases && f.budget !== undefined && Math.round(f.budget) !== Math.round(planNow);
        // names are kept next to the ids so they still show offline
        const names = Object.assign({ pmName: V.personLabel(f.pm, p.pm, p.pmName) }, V.resolveSales(f.salesName, p));
        if (p.datesEstimated && (f.startDate !== p.startDate || f.endDate !== p.endDate)) delete p.datesEstimated; // someone has now set the real dates
        Object.assign(p, f, names);
        if (!p.phases) { p.phases = PM.buildPhases(p.startDate, p.endDate, p.budget); Object.assign(p, PM.buildTimeline(p)); }
        else if (planChanged) PM.rescaleBudgets(p, f.budget);
        PM.upsert('projects', p);
        if (fromBid) { fromBid.projectId = p.id; fromBid.result = 'won'; if (!fromBid.resultDate) fromBid.resultDate = T; PM.upsert('bids', fromBid); }
        U.toast('บันทึกแล้ว');
        onSaved && onSaved(p);
      },
    });
    form.pm.addEventListener('change', () => { form.querySelector('#pm-info').textContent = V.pmInfo(form.pm.value, p.id); });
  };
})();
