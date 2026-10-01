/* prices.js — Price List / Vendor Cost: vendors' unit prices per item, validity, price history,
   vendor comparison, quotation files; export to Excel / PDF (export.js). Stored in the cloud as collection "prices". */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  const state = U.keep('prices', { cat: '', vendor: '', status: 'all', q: '' }, ['cat', 'vendor', 'status']);
  const FILTERS = [
    { key: 'all', label: 'ทั้งหมด' }, { key: 'valid', label: 'ใช้ได้' }, { key: 'expiring', label: 'ใกล้หมดอายุ' }, { key: 'expired', label: 'หมดอายุ' },
  ];

  const priceText = (p) => `${U.num(p.price, 2)} ${p.currency && p.currency !== 'THB' ? p.currency : '฿'}`;
  /* change against the previous price of the same record (history) */
  const change = (p) => {
    const h = (p.history || [])[(p.history || []).length - 1];
    return h && h.price ? (p.price - h.price) / h.price : null;
  };
  const changeBadge = (p) => {
    const c = change(p);
    if (c == null || Math.abs(c) < 0.0005) return '';
    return `<small class="${c > 0 ? 'up' : 'down'}" title="เทียบราคาก่อนหน้า ${U.num(p.history[p.history.length - 1].price, 2)}">${c > 0 ? '▲' : '▼'} ${U.pct(Math.abs(c), 1)}</small>`;
  };

  /* items quoted by 2+ vendors (same item code, or same name + unit, same currency) */
  function groups(list) {
    const by = {};
    list.forEach((p) => (by[PM.priceItemKey(p)] = by[PM.priceItemKey(p)] || []).push(p));
    return Object.values(by).filter((g) => g.length > 1).map((g) => {
      const s = g.slice().sort((a, b) => a.price - b.price);
      return { items: s, low: s[0], high: s[s.length - 1], spread: s[0].price ? (s[s.length - 1].price - s[0].price) / s[0].price : null };
    }).sort((a, b) => (b.spread || 0) - (a.spread || 0));
  }

  function filtered(T) {
    const q = state.q.toLowerCase();
    return PM.db.prices.filter((p) => {
      if (state.cat && p.category !== state.cat) return false;
      if (state.vendor && p.vendor !== state.vendor) return false;
      const st = PM.priceStatus(p, T).key;
      if (state.status === 'valid' && !(st === 'valid' || st === 'open')) return false;
      if (state.status === 'expiring' && st !== 'expiring') return false;
      if (state.status === 'expired' && st !== 'expired') return false;
      return !q || [p.code, p.name, p.spec, p.vendor, p.quoteRef, p.note].join(' ').toLowerCase().includes(q);
    }).sort((a, b) => String(a.name).localeCompare(String(b.name)) || a.price - b.price);
  }

  PM.views.prices = function (el) {
    const db = PM.db, T = PM.today();
    const canEdit = PM.can('price.edit');
    const vendors = Array.from(new Set(db.prices.map((p) => p.vendor).filter(Boolean))).sort();
    if (state.vendor && !vendors.includes(state.vendor)) state.vendor = '';
    const list = filtered(T);
    const cmp = groups(list);
    const lowest = new Set(cmp.map((g) => g.low.id));
    const all = db.prices;
    const stCount = (k) => all.filter((p) => PM.priceStatus(p, T).key === k).length;
    const avgSpread = cmp.length ? PM.sum(cmp, (g) => g.spread || 0) / cmp.length : null;

    el.innerHTML = `
      <div class="row">
        <select id="pl-cat" aria-label="หมวด" style="width:auto">${U.options(PM.PO_CATEGORIES, state.cat, 'ทุกหมวด')}</select>
        <select id="pl-vendor" aria-label="ผู้ขาย" style="width:auto;max-width:200px">${U.options(vendors, state.vendor, 'ทุกผู้ขาย')}</select>
        ${V.seg('status', FILTERS, state.status)}
        <input type="search" id="pl-q" placeholder="ค้นหา รหัส / รายการ / ผู้ขาย…" value="${esc(state.q)}" style="width:200px">
        <span class="spacer"></span>
        <button class="btn" data-action="xlsx" title="ดาวน์โหลดเป็นไฟล์ Excel (.xlsx) ตามตัวกรองที่เลือก">⬇ Excel</button>
        <button class="btn" data-action="pdf" title="เปิดรายงานสำหรับพิมพ์ / บันทึกเป็น PDF ตามตัวกรองที่เลือก">⬇ PDF</button>
        ${canEdit ? '<button class="btn primary fab" data-action="new" aria-label="เพิ่มราคา"><span class="fab-i">+</span><span class="fab-t">เพิ่มราคา</span></button>' : ''}
      </div>
      <div class="grid cols-5">
        ${V.tile({ label: 'รายการราคา', value: all.length, sub: `${new Set(all.map(PM.priceItemKey)).size} รายการสินค้า / บริการ`, icon: 'tag' })}
        ${V.tile({ label: 'ผู้ขาย', value: vendors.length, sub: 'ที่มีราคาในระบบ', icon: 'truck' })}
        ${V.tile({ label: 'ใกล้หมดอายุ', value: stCount('expiring'), sub: `ภายใน ${PM.PRICE_EXPIRING_DAYS} วัน — ควรขอราคาใหม่`, icon: 'clock' })}
        ${V.tile({ label: 'หมดอายุแล้ว', value: stCount('expired'), sub: stCount('expired') ? U.badge('critical', 'ห้ามใช้อ้างอิงโดยไม่ยืนยัน') : U.badge('good', 'ไม่มี'), icon: 'alert' })}
        ${V.tile({ label: 'มีหลายผู้ขาย', value: cmp.length, sub: `ส่วนต่างราคาเฉลี่ย ${U.pct(avgSpread, 1)}`, icon: 'chart' })}
      </div>
      <div class="card">
        <div class="card-h"><h2>Price List — ราคาผู้ขาย</h2><p>พบ ${list.length} จาก ${all.length} รายการ · ราคาต่อหน่วยไม่รวม VAT · คลิกแถวเพื่อ${canEdit ? 'แก้ไข / ' : ''}ดูประวัติราคาและไฟล์ใบเสนอราคา · <b>ถูกสุด</b> = ราคาต่ำสุดของรายการเดียวกัน</p></div>
        <div class="card-b flush table-wrap">${list.length ? `<table class="tbl price-table"><thead><tr>
          <th>รายการ</th><th>หมวด</th><th>หน่วย</th><th>ผู้ขาย</th><th class="num">ราคา / หน่วย</th><th class="num">Lead time</th>
          <th>ใบเสนอราคา</th><th>ใช้ได้ถึง</th><th class="num">ไฟล์</th></tr></thead><tbody>
          ${list.map((p) => { const st = PM.priceStatus(p, T); return `<tr class="click" data-price="${esc(p.id)}">
            <td><span class="title">${p.code ? `<span class="muted">${esc(p.code)}</span> · ` : ''}${esc(p.name)}</span><small>${esc(p.spec || '')}</small></td>
            <td>${esc(p.category)}</td><td>${esc(p.unit)}</td>
            <td>${esc(p.vendor)}${p.contact ? `<small>${esc(p.contact)}</small>` : ''}</td>
            <td class="num"><b>${priceText(p)}</b>${lowest.has(p.id) ? ' ' + U.badge('good', 'ถูกสุด') : ''}${changeBadge(p)}</td>
            <td class="num">${p.leadTime ? `${U.num(p.leadTime)} วัน` : '–'}${p.moq > 1 ? `<small>MOQ ${U.num(p.moq)} ${esc(p.unit)}</small>` : ''}</td>
            <td>${esc(p.quoteRef || '–')}<small>${U.date(p.quoteDate)}</small></td>
            <td>${U.date(p.validUntil)}<small>${U.badge(st.level, st.th)}</small></td>
            <td class="num">${PM.poFiles.clip(p.files, `data-action="files" data-id="${esc(p.id)}"`) || '–'}</td></tr>`; }).join('')}
          </tbody></table>` : `<p class="empty">${all.length ? 'ไม่พบรายการตามตัวกรอง' : `ยังไม่มีราคาในระบบ${canEdit ? ' — กด "+ เพิ่มราคา"' : ''}`}</p>`}</div>
      </div>
      <div class="card">
        <div class="card-h"><h2>เปรียบเทียบราคาผู้ขาย</h2><p>รายการเดียวกัน (รหัสเดียวกัน หรือชื่อ + หน่วยเดียวกัน) ที่มีราคาจาก 2 ผู้ขายขึ้นไป · เรียงตามส่วนต่างมากไปน้อย</p></div>
        <div class="card-b flush table-wrap">${cmp.length ? `<table class="tbl"><thead><tr><th>รายการ</th><th>หน่วย</th><th class="num">ผู้ขาย</th><th>ถูกสุด</th><th>แพงสุด</th><th class="num">ส่วนต่าง</th><th>ทุกราคา (ต่ำ → สูง)</th></tr></thead><tbody>
          ${cmp.map((g) => `<tr>
            <td><span class="title">${esc(g.low.name)}</span><small>${esc(g.low.code || '')}</small></td><td>${esc(g.low.unit)}</td><td class="num">${g.items.length}</td>
            <td><b>${priceText(g.low)}</b><small>${esc(g.low.vendor)}</small></td>
            <td>${priceText(g.high)}<small>${esc(g.high.vendor)}</small></td>
            <td class="num">${U.badge(g.spread > 0.1 ? 'warning' : 'neutral', '+' + U.pct(g.spread, 1))}</td>
            <td>${g.items.map((p) => `<button type="button" class="chip link-chip" data-open-price="${esc(p.id)}" title="${esc(p.vendor)}">${esc(shortName(p.vendor))} ${U.num(p.price, 0)}</button>`).join(' ')}</td></tr>`).join('')}
          </tbody></table>` : '<p class="empty">ยังไม่มีรายการที่มีราคาจากหลายผู้ขาย (ตามตัวกรอง)</p>'}</div>
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>จำนวนรายการตามหมวด</h2><p>ตามตัวกรองที่เลือก</p></div><div class="card-b"><div class="chart" id="c-pl-cat"></div></div></div>
        <div class="card"><div class="card-h"><h2>ผู้ขายที่มีราคามากที่สุด</h2><p>จำนวนรายการ · ราคาที่ยังใช้ได้ / ทั้งหมด</p></div><div class="card-b"><div class="chart" id="c-pl-vendor"></div></div></div>
      </div>`;

    PM.charts.hbars(document.getElementById('c-pl-cat'), {
      items: PM.PO_CATEGORIES.map((c) => ({ label: c, value: list.filter((p) => p.category === c).length })).filter((x) => x.value)
        .map((x) => Object.assign(x, { display: `${x.value} รายการ`, color: 'var(--s1)' })),
    });
    const vc = {};
    list.forEach((p) => { const v = vc[p.vendor] || (vc[p.vendor] = { n: 0, ok: 0 }); v.n++; if (PM.priceStatus(p, T).key !== 'expired') v.ok++; });
    PM.charts.hbars(document.getElementById('c-pl-vendor'), {
      items: Object.keys(vc).sort((a, b) => vc[b].n - vc[a].n).slice(0, 8)
        .map((k) => ({ label: k, sub: `ใช้ได้ ${vc[k].ok}/${vc[k].n}`, value: vc[k].n, display: `${vc[k].n} รายการ`, color: 'var(--s3)' })),
    });

    /* events */
    const rerender = () => PM.views.prices(el);
    el.querySelector('#pl-q').addEventListener('input', (e) => {
      state.q = e.target.value;
      clearTimeout(state.t);
      state.t = setTimeout(() => { rerender(); const i = el.querySelector('#pl-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
    });
    el.onchange = (e) => {
      if (e.target.id === 'pl-cat') { state.cat = e.target.value; rerender(); }
      if (e.target.id === 'pl-vendor') { state.vendor = e.target.value; rerender(); }
    };
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg]');
      if (seg) { state[seg.dataset.seg] = seg.dataset.val; rerender(); return; }
      const act = e.target.closest('[data-action]');
      if (act) {
        const a = act.dataset.action;
        if (a === 'new') priceForm(null, rerender);
        if (a === 'xlsx') PM.xport.excel(report(filtered(T), T));
        if (a === 'pdf') PM.xport.pdf(report(filtered(T), T));
        if (a === 'files') { const p = PM.find('prices', act.dataset.id); if (p) { if (p.files.length === 1) PM.poFiles.open(p.files[0].path); else PM.poFiles.showList(`ใบเสนอราคา — ${p.vendor}`, p.files); } }
        return;
      }
      const chip = e.target.closest('[data-open-price]');
      if (chip) { priceForm(PM.find('prices', chip.dataset.openPrice), rerender); return; }
      const row = e.target.closest('tr[data-price]');
      if (row) priceForm(PM.find('prices', row.dataset.price), rerender);
    };
  };

  const shortName = (v) => String(v || '').replace(/\s*(Co\.,?\s*Ltd\.?|Company Limited|PCL|Ltd\.?)\s*$/i, '').trim();

  /* ---------- export: the rows on screen (filters applied) + vendor comparison ---------- */
  function report(list, T) {
    const filters = [state.cat && `หมวด: ${state.cat}`, state.vendor && `ผู้ขาย: ${state.vendor}`,
      state.status !== 'all' && `สถานะ: ${FILTERS.find((f) => f.key === state.status).label}`, state.q && `ค้นหา: "${state.q}"`].filter(Boolean);
    const cmp = groups(list);
    const lowest = new Set(cmp.map((g) => g.low.id));
    return {
      filename: `price-list-${T}`,
      title: 'Price List / Vendor Cost — ราคาผู้ขาย',
      subtitle: `ข้อมูล ณ ${U.date(T)} · ${list.length} รายการ${filters.length ? ' · ' + filters.join(' · ') : ''} · ราคาต่อหน่วยไม่รวม VAT`,
      sheets: [
        {
          name: 'Price List', title: 'Price List — ราคาผู้ขาย',
          columns: [
            { header: 'รหัส', width: 13 }, { header: 'รายการ', width: 34 }, { header: 'รายละเอียด / Spec', width: 28 }, { header: 'หมวด', width: 12 },
            { header: 'หน่วย', width: 8 }, { header: 'ผู้ขาย', width: 30 }, { header: 'ผู้ติดต่อ', width: 18 },
            { header: 'ราคา / หน่วย', width: 14, type: 'number' }, { header: 'สกุลเงิน', width: 8 }, { header: 'ถูกสุด', width: 8 },
            { header: 'เปลี่ยนจากราคาก่อน (%)', width: 12, type: 'number' }, { header: 'MOQ', width: 8, type: 'int' }, { header: 'Lead time (วัน)', width: 10, type: 'int' },
            { header: 'เลขที่ใบเสนอราคา', width: 16 }, { header: 'วันที่เสนอราคา', width: 12, type: 'date' }, { header: 'ใช้ได้ถึง', width: 12, type: 'date' },
            { header: 'สถานะ', width: 18 }, { header: 'หมายเหตุ', width: 26 },
          ],
          rows: list.map((p) => {
            const c = change(p);
            return [p.code, p.name, p.spec, p.category, p.unit, p.vendor, p.contact, p.price, p.currency || 'THB', lowest.has(p.id) ? '✓' : '',
              c == null ? '' : Math.round(c * 10000) / 100, p.moq || '', p.leadTime || '', p.quoteRef, p.quoteDate, p.validUntil, PM.priceStatus(p, T).th, p.note];
          }),
        },
        {
          name: 'เปรียบเทียบราคา', title: 'เปรียบเทียบราคาผู้ขาย (รายการที่มี 2 ผู้ขายขึ้นไป)',
          columns: [
            { header: 'รายการ', width: 34 }, { header: 'หน่วย', width: 8 }, { header: 'จำนวนผู้ขาย', width: 10, type: 'int' },
            { header: 'ราคาต่ำสุด', width: 14, type: 'number' }, { header: 'ผู้ขาย (ต่ำสุด)', width: 30 },
            { header: 'ราคาสูงสุด', width: 14, type: 'number' }, { header: 'ผู้ขาย (สูงสุด)', width: 30 }, { header: 'ส่วนต่าง (%)', width: 11, type: 'number' },
          ],
          rows: cmp.map((g) => [g.low.name, g.low.unit, g.items.length, g.low.price, g.low.vendor, g.high.price, g.high.vendor, g.spread == null ? '' : Math.round(g.spread * 10000) / 100]),
        },
      ],
    };
  }

  /* ---------- form ---------- */
  function priceForm(p, done) {
    const T = PM.today();
    const canEdit = PM.can('price.edit');
    const isNew = !p;
    const x = p || {
      id: PM.uid('PL'), code: '', name: '', spec: '', category: 'Material', unit: 'ea', vendor: '', contact: '', price: 0, currency: 'THB',
      moq: 1, leadTime: 14, quoteRef: '', quoteDate: T, validUntil: PM.addDays(T, 90), note: '', files: [], history: [],
    };
    const vendors = Array.from(new Set(PM.db.prices.map((y) => y.vendor).concat(PM.db.pos.map((y) => y.supplier)).filter(Boolean))).sort();
    const items = Array.from(new Set(PM.db.prices.map((y) => y.name).filter(Boolean))).sort();
    const units = PM.PRICE_UNITS.includes(x.unit) ? PM.PRICE_UNITS : PM.PRICE_UNITS.concat(x.unit);
    const hist = (x.history || []).slice().reverse();
    const form = U.modal({
      title: isNew ? 'เพิ่มราคา (Price List)' : `${x.name} · ${x.vendor}`, wide: true, submitLabel: canEdit ? 'บันทึกราคา' : undefined,
      onSubmit: canEdit ? () => false : null, // saving is async (file uploads) — handled below
      onDelete: !isNew && canEdit ? async () => {
        try { await PM.poFiles.remove((x.files || []).map((f) => f.path)); } catch (e) { /* files may already be gone */ }
        PM.remove('prices', x.id); U.toast('ลบราคาแล้ว'); done();
      } : null,
      body: `
        <div class="sub-h">สินค้า / บริการ</div>
        ${U.field('รหัสสินค้า (Item code)', 'code', x.code, { placeholder: 'เช่น EL-CB-240 — ใช้จับคู่เปรียบเทียบผู้ขาย' })}
        ${U.field('หมวด', 'category', x.category, { options: PM.PO_CATEGORIES })}
        <label class="full"><span>รายการ</span><input name="name" list="dl-price-items" value="${esc(x.name)}" required autocomplete="off"><datalist id="dl-price-items">${items.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></label>
        ${U.field('รายละเอียด / Spec / ยี่ห้อ รุ่น', 'spec', x.spec, { full: true })}
        <div class="sub-h">ผู้ขายและราคา</div>
        <label><span>ผู้ขาย (Vendor)</span><input name="vendor" list="dl-price-vendors" value="${esc(x.vendor)}" required autocomplete="off"><datalist id="dl-price-vendors">${vendors.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></label>
        ${U.field('ผู้ติดต่อ / เบอร์โทร', 'contact', x.contact)}
        ${U.field('ราคาต่อหน่วย (ไม่รวม VAT)', 'price', x.price, { type: 'number', min: 0, step: 'any', required: true })}
        ${U.field('สกุลเงิน', 'currency', x.currency || 'THB', { options: PM.CURRENCIES })}
        ${U.field('หน่วย', 'unit', x.unit, { options: units })}
        ${U.field('MOQ (ขั้นต่ำ)', 'moq', x.moq, { type: 'number', min: 0, step: 'any' })}
        ${U.field('Lead time (วัน)', 'leadTime', x.leadTime, { type: 'number', min: 0 })}
        <span></span>
        <div class="sub-h">ใบเสนอราคา</div>
        ${U.field('เลขที่ใบเสนอราคา', 'quoteRef', x.quoteRef)}
        ${U.field('วันที่เสนอราคา', 'quoteDate', x.quoteDate, { type: 'date' })}
        ${U.field('ราคาใช้ได้ถึง (Valid until)', 'validUntil', x.validUntil, { type: 'date', hint: `ระบบเตือนเมื่อเหลือ ≤ ${PM.PRICE_EXPIRING_DAYS} วัน` })}
        <span></span>
        ${U.field('หมายเหตุ', 'note', x.note, { type: 'textarea', full: true, rows: 2, placeholder: 'เงื่อนไขการชำระเงิน, การขนส่ง, การรับประกัน …' })}
        ${PM.poFiles.boxHtml(canEdit, 'ไฟล์ใบเสนอราคา', 'ใบเสนอราคา, Datasheet, Catalogue')}
        ${hist.length ? `<div class="full"><div class="sub-h" style="margin-top:4px">ประวัติราคา</div>
          <table class="tbl"><thead><tr><th>ใช้ถึงวันที่</th><th class="num">ราคา / หน่วย</th><th>ใบเสนอราคา</th><th>แก้ไขโดย</th></tr></thead><tbody>
          <tr><td><b>ปัจจุบัน</b></td><td class="num"><b>${priceText(x)}</b></td><td>${esc(x.quoteRef || '–')}</td><td>${esc(x.updatedByName || '–')}</td></tr>
          ${hist.map((h) => `<tr><td>${U.date(h.date)}</td><td class="num">${U.num(h.price, 2)}</td><td>${esc(h.quoteRef || '–')}</td><td>${esc(h.by || '–')}</td></tr>`).join('')}
          </tbody></table></div>` : ''}
        ${!isNew && x.updatedByName ? `<p class="full muted" style="margin:0">แก้ไขล่าสุด ${U.date((x.updatedAt || '').slice(0, 10))} โดย ${esc(x.updatedByName)}</p>` : ''}`,
    });
    const files = PM.poFiles.box(form, x.files, canEdit);
    if (!canEdit) { form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; }); return; }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) return;
      const f = U.formData(form);
      if (f.validUntil && f.quoteDate && f.validUntil < f.quoteDate) { alert('วันที่ "ใช้ได้ถึง" ต้องไม่ก่อนวันที่เสนอราคา'); return; }
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true; btn.classList.add('loading');
      const me = PM.auth.user, myName = me ? PM.auth.displayName(me) : '';
      // a new price for the same record: keep the old one in the history
      if (!isNew && Number(f.price) !== Number(x.price)) {
        x.history = (x.history || []).concat({ date: T, price: x.price, quoteRef: x.quoteRef || '', by: x.updatedByName || '' });
      }
      Object.assign(x, {
        code: f.code, name: f.name, spec: f.spec, category: f.category, unit: f.unit, vendor: f.vendor.replace(/\s+/g, ' ').trim(), contact: f.contact,
        price: f.price, currency: f.currency, moq: f.moq, leadTime: f.leadTime, quoteRef: f.quoteRef, quoteDate: f.quoteDate, validUntil: f.validUntil, note: f.note,
        updatedAt: new Date().toISOString(), updatedBy: me ? me.id : '', updatedByName: myName,
      });
      if (isNew) { x.createdBy = me ? me.id : ''; x.createdByName = myName; }
      const { files: kept, problems } = await files.commit(`prices/${x.id}`, btn);
      x.files = kept;
      PM.upsert('prices', x);
      U.closeModal();
      U.toast(problems.length ? 'บันทึกราคาแล้ว แต่ไฟล์บางไฟล์มีปัญหา' : 'บันทึกราคาแล้ว');
      if (problems.length) alert('ไฟล์ที่ไม่สำเร็จ:\n' + problems.join('\n'));
      done();
    });
  }
})();
