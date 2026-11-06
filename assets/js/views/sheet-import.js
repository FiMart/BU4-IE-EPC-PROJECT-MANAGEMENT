/* sheet-import.js — fill Proposals and Projects from Excel: drop a .xlsx / .csv file, or paste cells copied from Excel.
   The file is read in the browser, with no library: nothing leaves the machine until the user presses import.
   Steps: read → find the header row (files often have a title above it and a summary below) → match columns to fields →
   preview every row with what will happen to it → import → offer to undo that import.
   PM.sheetImport.open(cfg, file?)  cfg = { title, intro, fields, template, note, keyHint, prepare?, evaluate(values, ctx), commit(rows, opts) }
   field: { key, label, type: text | date | number | percent | mb, aliases: [...], required?, rowNo? }
     rowNo: the list's own numbering. A row with text there ends the list ("Total Projects:" under a list numbered 1, 2, 3 …) */
(function () {
  const U = PM.ui, esc = U.esc;
  const S = (PM.sheetImport = {});
  const MAX_FILE_MB = 20, MAX_ROWS = 5000;

  /* ---------- .xlsx: a zip of XML files ---------- */
  async function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('เบราว์เซอร์นี้เปิดไฟล์ .xlsx ไม่ได้ — อัปเดตเบราว์เซอร์ หรือคัดลอกเซลล์จาก Excel แล้ววางแทน');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function zipEntries(buf) {
    const dv = new DataView(buf), td = new TextDecoder();
    let end = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('ไฟล์นี้ไม่ใช่ .xlsx หรือไฟล์เสียหาย');
    const count = dv.getUint16(end + 10, true);
    let p = dv.getUint32(end + 16, true);
    const out = {};
    for (let n = 0; n < count && dv.getUint32(p, true) === 0x02014b50; n++) {
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
      const name = td.decode(new Uint8Array(buf, p + 46, nameLen));
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      out[name] = { method, bytes: new Uint8Array(buf, start, size) };
      p += 46 + nameLen + extra + comment;
    }
    return out;
  }
  const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
  const tags = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
  const colIndex = (ref) => { let n = 0; for (const c of String(ref).replace(/\d+$/, '').toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
  const serialDate = (v, base1904) => {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v + (base1904 ? 1462 : 0)) * 864e5);
    return d.toISOString().slice(0, 10);
  };
  async function readXlsx(buf) {
    const zip = zipEntries(buf), td = new TextDecoder();
    const text = async (name) => { const e = zip[name]; if (!e) return null; return td.decode(e.method === 8 ? await inflate(e.bytes) : e.bytes); };
    const xml = async (name) => { const t = await text(name); return t == null ? null : new DOMParser().parseFromString(t, 'application/xml'); };
    const wb = await xml('xl/workbook.xml');
    if (!wb) throw new Error('ไฟล์นี้ไม่ใช่ .xlsx หรือไฟล์เสียหาย');
    const rels = await xml('xl/_rels/workbook.xml.rels');
    const target = {};
    if (rels) tags(rels, 'Relationship').forEach((r) => { target[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const pr = tags(wb, 'workbookPr')[0], base1904 = !!pr && ['1', 'true'].includes(pr.getAttribute('date1904'));
    const sst = await xml('xl/sharedStrings.xml');
    const strings = sst ? tags(sst, 'si').map((si) => tags(si, 't').filter((t) => !t.parentNode || t.parentNode.localName !== 'rPh').map((t) => t.textContent).join('')) : [];
    // which cell styles are dates and percentages
    const kind = [];
    const st = await xml('xl/styles.xml');
    if (st) {
      const custom = {};
      tags(st, 'numFmt').forEach((f) => { custom[f.getAttribute('numFmtId')] = f.getAttribute('formatCode') || ''; });
      const xfs = tags(st, 'cellXfs')[0];
      if (xfs) Array.from(xfs.children).forEach((xf, i) => {
        const id = Number(xf.getAttribute('numFmtId')), code = (custom[id] || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '').toLowerCase();
        kind[i] = BUILTIN_DATE.has(id) || /[dy]|m{3,}/.test(code) ? 'date' : id === 9 || id === 10 || code.includes('%') ? 'pct' : '';
      });
    }
    const sheets = [];
    for (const s of tags(wb, 'sheet')) {
      if (s.getAttribute('state') && s.getAttribute('state') !== 'visible') continue;
      const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
      const path = String(target[rid] || '').replace(/^\//, '');
      const doc = await xml(path.startsWith('xl/') ? path : 'xl/' + path);
      if (!doc) continue;
      const rows = [];
      tags(doc, 'row').slice(0, MAX_ROWS + 200).forEach((row) => {
        const at = Number(row.getAttribute('r')) - 1 || rows.length, cells = [];
        tags(row, 'c').forEach((c, i) => {
          const type = c.getAttribute('t'), style = kind[Number(c.getAttribute('s'))] || '', ref = c.getAttribute('r');
          const raw = tags(c, 'v')[0] ? tags(c, 'v')[0].textContent : '';
          let v = '';
          if (type === 's') v = strings[Number(raw)] || '';
          else if (type === 'inlineStr') v = tags(c, 't').map((t) => t.textContent).join('');
          else if (type === 'str') v = raw;
          else if (type === 'b') v = raw === '1' ? 'TRUE' : 'FALSE';
          else if (type === 'e') v = '';
          else if (raw !== '') {
            const n = Number(raw);
            v = isNaN(n) ? raw : style === 'date' ? serialDate(n, base1904) : style === 'pct' ? `${+(n * 100).toFixed(2)}%` : n;
          }
          cells[ref ? colIndex(ref) : i] = v;
        });
        rows[at] = Array.from(cells, (x) => (x === undefined ? '' : x));
      });
      sheets.push({ name: s.getAttribute('name') || `Sheet ${sheets.length + 1}`, rows: Array.from(rows, (r) => r || []) });
    }
    return sheets;
  }

  /* ---------- text: a .csv file, or cells pasted from Excel (tab-separated) ---------- */
  function parseDelimited(text) {
    const first = text.split(/\r?\n/, 1)[0] || '';
    const sep = first.includes('\t') ? '\t' : first.split(';').length > first.split(',').length ? ';' : ',';
    const rows = [];
    let row = [], cur = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
      } else if (ch === '"' && cur === '') quoted = true;
      else if (ch === sep) { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  /* Excel saves Thai .csv in the Windows code page unless told otherwise */
  function decodeText(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch (e) { return new TextDecoder('windows-874').decode(buf); }
  }
  S.readFile = async function (file) {
    const name = String(file.name || '').toLowerCase();
    if (file.size > MAX_FILE_MB * 1048576) throw new Error(`ไฟล์ใหญ่เกิน ${MAX_FILE_MB} MB`);
    if (/\.xls$/.test(name)) throw new Error('ไฟล์ .xls รุ่นเก่าเปิดไม่ได้ — เปิดใน Excel แล้วเลือก Save As เป็น .xlsx หรือคัดลอกเซลล์มาวางแทน');
    if (/\.(pdf|docx?|pptx?)$/.test(name)) throw new Error('รับเฉพาะไฟล์ Excel (.xlsx) และ .csv');
    const buf = await file.arrayBuffer();
    const isZip = buf.byteLength > 4 && new DataView(buf).getUint32(0, true) === 0x04034b50;
    if (isZip) return readXlsx(buf);
    if (/\.(xlsx|xlsm)$/.test(name)) throw new Error('ไฟล์นี้ไม่ใช่ .xlsx หรือไฟล์เสียหาย');
    return [{ name: file.name || 'CSV', rows: parseDelimited(decodeText(buf)) }];
  };
  S.parseDelimited = parseDelimited;

  /* ---------- values ---------- */
  const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const TH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const EN_MONTH = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthOf = (w) => {
    const s = w.toLowerCase().replace(/\s/g, '');
    const noDots = s.replace(/\./g, '');
    let m = TH_MONTH.indexOf(s);
    if (m < 0) m = TH_SHORT.findIndex((x) => x.replace(/\./g, '') === noDots);
    return m >= 0 ? { m, thai: true } : EN_MONTH.includes(noDots.slice(0, 3)) ? { m: EN_MONTH.indexOf(noDots.slice(0, 3)), thai: false } : null;
  };
  const toYear = (y, thai) => {
    let n = Number(y);
    if (n < 100) n = thai || n >= 50 ? 2500 + n : 2000 + n; // 69 next to a Thai month, or too far ahead to be a CE year, is B.E. 2569
    return n > 2400 ? n - 543 : n;
  };
  const makeDate = (y, m, d) => {
    const dt = new Date(Date.UTC(y, m, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m && dt.getUTCDate() === d && y > 1950 && y < 2100 ? dt.toISOString().slice(0, 10) : null;
  };
  S.parseDate = function (v) {
    if (typeof v === 'number') return v > 20000 && v < 80000 ? serialDate(v) : null;
    const s = String(v).trim();
    let x = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (x) return makeDate(toYear(x[1]), +x[2] - 1, +x[3]);
    x = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (x) { let d = +x[1], m = +x[2]; if (m > 12 && d <= 12) [d, m] = [m, d]; return makeDate(toYear(x[3]), m - 1, d); }
    x = s.match(/^(\d{1,2})[\s\-/]*([^\d\s\-/][^\d\-/]*?)[\s\-/.,]*(\d{2,4})$/);
    if (x) { const mo = monthOf(x[2]); return mo ? makeDate(toYear(x[3], mo.thai), mo.m, +x[1]) : null; }
    if (/^\d{5}$/.test(s)) return S.parseDate(Number(s));
    return null;
  };
  const toNumber = (v) => {
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[,฿\s]|บาท|THB|MB|ล้าน/gi, '');
    return s !== '' && !isNaN(Number(s)) ? Number(s) : null;
  };
  /* value of a cell for a field → { v } or { err }; blank → {} */
  function convert(raw, f) {
    const s = String(raw == null ? '' : raw).trim();
    if (s === '' || (f.type !== 'text' && /^[-–—]+$/.test(s))) return {};
    if (f.type === 'date') { const d = S.parseDate(raw); return d ? { v: d } : { err: `${f.label} อ่านวันที่ไม่ได้ ("${s}")` }; }
    if (f.type === 'percent') {
      const pct = s.endsWith('%'), n = toNumber(s.replace('%', ''));
      if (n == null) return { err: `${f.label} ไม่ใช่ตัวเลข ("${s}")` };
      return { v: Math.max(0, Math.min(100, Math.round(!pct && n > 0 && n <= 1 ? n * 100 : n))) };
    }
    if (f.type === 'number' || f.type === 'mb') {
      const n = toNumber(raw);
      if (n == null || n < 0) return { err: `${f.label} ไม่ใช่ตัวเลข ("${s}")` };
      return { v: f.type === 'mb' ? Math.round(n * 1e6) : n };
    }
    return { v: s };
  }

  /* ---------- finding the columns ---------- */
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[\s._\-/()%:：#*]/g, '');
  function matchColumns(headers, fields) {
    const map = headers.map(() => '');
    const taken = new Set();
    const tryMatch = (test) => headers.forEach((h, i) => {
      if (map[i] || !norm(h)) return;
      const f = fields.find((x) => !taken.has(x.key) && test(norm(h), x));
      if (f) { map[i] = f.key; taken.add(f.key); }
    });
    tryMatch((h, f) => [f.label].concat(f.aliases || []).some((a) => norm(a) === h));
    tryMatch((h, f) => (f.aliases || []).some((a) => norm(a).length >= 4 && h.includes(norm(a))));
    return map;
  }
  function findHeader(rows, fields) {
    const need = fields.filter((f) => f.required);
    let best = -1, bestScore = 1;
    rows.slice(0, 40).forEach((row, i) => {
      const m = matchColumns(row, fields), score = m.filter(Boolean).length + (need.some((f) => m.includes(f.key)) ? 1 : 0);
      if (score > bestScore) { best = i; bestScore = score; }
    });
    return best;
  }
  const colLetter = (i) => { let s = ''; i++; while (i) { s = String.fromCharCode(65 + ((i - 1) % 26)) + s; i = Math.floor((i - 1) / 26); } return s; };
  const shown = (v) => (typeof v === 'number' ? String(+v.toFixed(4)) : String(v == null ? '' : v));

  /* ---------- the dialog ---------- */
  S.open = async function (cfg, firstFile) {
    if (PM.roles && PM.roles.loadTeam) { try { await PM.roles.loadTeam(); } catch (e) { /* names can still be typed */ } }
    const st = { source: '', sheets: [], sheet: 0, header: 0, map: [], mode: 'skip', opts: Object.assign({}, cfg.defaults) };
    const form = U.modal({
      title: cfg.title, wide: true, submitLabel: 'นำเข้า',
      body: `<p class="full muted" style="margin:0">${esc(cfg.intro)}</p>
        ${cfg.note ? `<p class="full perm-note" style="margin:0">${esc(cfg.note)}</p>` : ''}
        <div class="full imp-drop" data-imp-drop tabindex="0" role="button" aria-label="เลือกไฟล์ Excel">
          <b>ลากไฟล์ Excel มาวางที่นี่</b>
          <span>หรือ <u>เลือกไฟล์</u> (.xlsx, .csv) · คัดลอกเซลล์จาก Excel แล้วกด Ctrl + V ก็ได้</span>
          <input type="file" accept=".xlsx,.xlsm,.csv,.txt" data-imp-file hidden>
        </div>
        <div class="full imp-tools"><button type="button" class="link-btn" data-imp-template>ดาวน์โหลดแบบฟอร์ม Excel</button></div>
        <div class="full" data-imp-work></div>`,
      onSubmit: () => { run(); return false; },
    });
    const work = form.querySelector('[data-imp-work]'), drop = form.querySelector('[data-imp-drop]'), input = form.querySelector('[data-imp-file]');
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;

    const rowsOf = () => (st.sheets[st.sheet] || { rows: [] }).rows;
    /* the rows of the list under the header, each with what would happen to it */
    function evaluate() {
      const all = rowsOf(), out = [];
      const rowNoCol = st.map.findIndex((k) => (cfg.fields.find((f) => f.key === k) || {}).rowNo);
      const ctx = { seen: new Set(), opts: st.opts, rows: out };
      if (cfg.prepare) cfg.prepare(ctx);
      let numbered = false;
      for (let i = st.header; i < all.length && out.length < MAX_ROWS; i++) {
        const row = all[i] || [];
        const used = st.map.some((k, c) => k && String(row[c] == null ? '' : row[c]).trim() !== '');
        if (!used) continue;
        if (rowNoCol >= 0) {
          const no = String(row[rowNoCol] == null ? '' : row[rowNoCol]).trim();
          if (no !== '' && isNaN(Number(no))) { if (numbered) break; continue; } // the summary under a numbered list
          if (no !== '') numbered = true;
        }
        const values = {}, errors = [];
        st.map.forEach((k, c) => {
          const f = cfg.fields.find((x) => x.key === k);
          if (!f || f.rowNo) return;
          const r = convert(row[c], f);
          if (r.err) errors.push(r.err); else if (r.v !== undefined) values[k] = r.v;
        });
        cfg.fields.filter((f) => f.required && values[f.key] === undefined && !errors.some((e) => e.startsWith(f.label))).forEach((f) => errors.push(`ไม่มี${f.label}`));
        const res = errors.length ? { action: 'error', note: errors.join(' · ') } : cfg.evaluate(values, ctx);
        out.push(Object.assign({ line: i + 1, values, cells: row }, res));
      }
      return out;
    }
    function draw() {
      if (!st.sheets.length) { work.innerHTML = ''; submit.disabled = true; drop.classList.remove('slim'); return; }
      drop.classList.add('slim');
      const all = rowsOf(), width = Math.min(40, all.reduce((m, r) => Math.max(m, (r || []).length), 0));
      const head = st.header > 0 ? all[st.header - 1] || [] : [];
      const cols = Array.from({ length: width }, (_, c) => c).filter((c) => st.map[c] || all.some((r) => String((r || [])[c] == null ? '' : r[c]).trim() !== ''));
      const rows = evaluate();
      const count = (a) => rows.filter((r) => r.action === a).length;
      const nNew = count('new'), nExist = count('exists'), nBad = count('error'), nSkip = count('skip');
      const willDo = nNew + (st.mode === 'update' ? nExist : 0);
      const missing = cfg.fields.filter((f) => f.required && !st.map.includes(f.key));
      const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
      const BADGE = { new: ['good', 'เพิ่มใหม่'], exists: st.mode === 'update' ? ['info', 'อัปเดต'] : ['neutral', 'มีอยู่แล้ว · ข้าม'], skip: ['neutral', 'ข้าม'], error: ['critical', 'แก้ก่อน'] };
      work.innerHTML = `
        <div class="imp-bar">
          <b>${esc(st.source)}</b>
          ${st.sheets.length > 1 ? `<label class="imp-inline">ชีต <select data-imp-sheet>${st.sheets.map((s, i) => opt(String(i), s.name, String(st.sheet))).join('')}</select></label>` : ''}
          <label class="imp-inline">หัวตารางอยู่แถวที่ <input type="number" min="0" max="${all.length}" value="${st.header}" data-imp-header style="width:68px"></label>
          <small class="muted">0 = ไม่มีหัวตาราง</small>
        </div>
        <div class="imp-sum">
          ${U.badge('good', `เพิ่มใหม่ ${nNew}`)}
          ${nExist ? U.badge(st.mode === 'update' ? 'info' : 'neutral', `มีอยู่แล้ว ${nExist}`) : ''}
          ${nSkip ? U.badge('neutral', `ข้าม ${nSkip}`) : ''}
          ${nBad ? U.badge('critical', `ต้องแก้ ${nBad}`) : ''}
          ${nExist ? `<div class="seg" role="group"><button type="button" data-imp-mode="skip" class="${st.mode === 'skip' ? 'on' : ''}">ข้ามงานที่มีอยู่แล้ว</button><button type="button" data-imp-mode="update" class="${st.mode === 'update' ? 'on' : ''}">อัปเดตงานเดิม</button></div>` : ''}
          ${cfg.optionsHtml ? cfg.optionsHtml(rows, st.opts) : ''}
        </div>
        ${missing.length ? `<p class="callout imp-warn">ยังไม่ได้เลือกคอลัมน์: <b>${esc(missing.map((f) => f.label).join(', '))}</b> — เลือกจากช่องบนหัวตารางด้านล่าง</p>` : ''}
        ${nExist && st.mode === 'update' ? '<p class="muted imp-note">อัปเดตเฉพาะช่องที่มีข้อมูลในไฟล์ · ช่องว่างในไฟล์ไม่ลบข้อมูลเดิม</p>' : ''}
        <div class="table-wrap imp-table"><table class="tbl"><thead><tr><th class="imp-st">ผล</th><th class="num">แถว</th>${cols.map((c) => `<th>
            <select data-imp-col="${c}" aria-label="คอลัมน์ ${colLetter(c)}" class="${st.map[c] ? 'on' : ''}">${opt('', '— ไม่นำเข้า —', st.map[c] || '')}${cfg.fields.map((f) => opt(f.key, f.label, st.map[c] || '')).join('')}</select>
            <small>${esc(shown(head[c]) || `คอลัมน์ ${colLetter(c)}`)}</small></th>`).join('')}</tr></thead><tbody>
          ${rows.slice(0, 300).map((r) => { const b = BADGE[r.action] || BADGE.skip; return `<tr class="${r.action === 'error' ? 'imp-bad' : ''}"><td class="imp-st">${U.badge(b[0], b[1])}${r.note ? `<small>${esc(r.note)}</small>` : ''}</td><td class="num">${r.line}</td>${cols.map((c) => `<td class="${st.map[c] ? '' : 'imp-off'}">${esc(shown(r.cells[c]))}</td>`).join('')}</tr>`; }).join('')}
        </tbody></table>${rows.length ? '' : '<p class="empty">ไม่พบแถวข้อมูล — ตรวจแถวหัวตาราง หรือเลือกคอลัมน์ด้านบน</p>'}</div>
        ${rows.length > 300 ? `<p class="muted imp-note">แสดงตัวอย่าง 300 แถวแรกจาก ${rows.length} แถว</p>` : ''}`;
      submit.disabled = !willDo || missing.length > 0;
      submit.textContent = willDo ? `นำเข้า ${willDo} รายการ` : 'นำเข้า';
    }
    function load(sheets, source) {
      const usable = sheets.filter((s) => s.rows.some((r) => (r || []).some((c) => String(c == null ? '' : c).trim() !== '')));
      if (!usable.length) { U.alert('ไม่พบข้อมูลในไฟล์นี้'); return; }
      // the sheet whose header matches best
      let bestSheet = 0, bestN = -1;
      usable.forEach((s, i) => { const h = findHeader(s.rows, cfg.fields); const n = h >= 0 ? matchColumns(s.rows[h], cfg.fields).filter(Boolean).length : 0; if (n > bestN) { bestN = n; bestSheet = i; } });
      Object.assign(st, { source, sheets: usable, sheet: bestSheet, mode: 'skip' });
      pickHeader();
      draw();
    }
    function pickHeader() {
      const rows = rowsOf(), h = findHeader(rows, cfg.fields);
      st.header = h >= 0 ? h + 1 : 0;
      st.map = h >= 0 ? matchColumns(rows[h], cfg.fields) : [];
    }
    async function takeFile(file) {
      if (!file) return;
      try { load(await S.readFile(file), file.name || 'ไฟล์'); } catch (e) { U.alert(e.message || 'เปิดไฟล์ไม่สำเร็จ'); }
    }
    async function run() {
      const rows = evaluate().filter((r) => r.action === 'new' || (r.action === 'exists' && st.mode === 'update'));
      if (!rows.length) return;
      submit.disabled = true; submit.classList.add('loading');
      let res;
      try { res = await cfg.commit(rows, st.opts); } catch (e) {
        submit.disabled = false; submit.classList.remove('loading');
        U.alert(`นำเข้าไม่สำเร็จ: ${e.message}`);
        return;
      }
      U.closeModal();
      result(res, cfg);
    }

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', () => { takeFile(input.files[0]); input.value = ''; });
    form.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('hot'); });
    form.addEventListener('dragleave', (e) => { if (!form.contains(e.relatedTarget)) drop.classList.remove('hot'); });
    form.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('hot'); takeFile(e.dataTransfer.files[0]); });
    form.addEventListener('paste', (e) => {
      if (e.target.matches('input[type=number]')) return;
      const file = e.clipboardData.files && e.clipboardData.files[0];
      if (file) { e.preventDefault(); takeFile(file); return; }
      const text = e.clipboardData.getData('text/plain');
      if (text && text.trim()) { e.preventDefault(); load([{ name: 'ข้อมูลที่วาง', rows: parseDelimited(text.replace(/\r?\n$/, '')) }], 'ข้อมูลที่วางจาก Excel'); }
    });
    form.querySelector('[data-imp-template]').addEventListener('click', () => PM.xport.excel(cfg.template()));
    work.addEventListener('click', (e) => {
      const m = e.target.closest('[data-imp-mode]');
      if (m) { st.mode = m.dataset.impMode; draw(); }
    });
    work.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.impCol !== undefined) {
        const c = Number(t.dataset.impCol);
        if (t.value) st.map = st.map.map((k) => (k === t.value ? '' : k)); // a field comes from one column
        st.map[c] = t.value;
        st.map = Array.from(st.map, (k) => k || '');
        draw();
      } else if (t.dataset.impSheet !== undefined) { st.sheet = Number(t.value); pickHeader(); draw(); } else if (t.dataset.impHeader !== undefined) {
        const rows = rowsOf(), h = Math.max(0, Math.min(rows.length, Number(t.value) || 0));
        st.header = h;
        st.map = h > 0 ? matchColumns(rows[h - 1] || [], cfg.fields) : [];
        draw();
      } else if (t.dataset.impOpt) { st.opts[t.dataset.impOpt] = t.checked; draw(); }
    });
    form.addEventListener('input', () => { delete form.dataset.dirty; }); // the choices here are not worth a "leave page?" warning
    if (firstFile) takeFile(firstFile);
    setTimeout(() => drop.focus(), 0);
  };

  function result(res, cfg) {
    const form = U.modal({
      title: 'นำเข้าแล้ว',
      body: `<p class="full" style="margin:0">${esc(res.summary)}</p>
        ${res.notes && res.notes.length ? `<ul class="full imp-notes">${res.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        ${res.undo ? '<div class="full"><button type="button" class="btn danger" data-imp-undo>ยกเลิกการนำเข้ารอบนี้</button></div>' : ''}`,
    });
    const u = form.querySelector('[data-imp-undo]');
    if (u) u.addEventListener('click', () => { res.undo(); U.closeModal(); U.toast('ยกเลิกการนำเข้าแล้ว'); if (cfg.done) cfg.done(); });
    if (cfg.done) cfg.done();
  }

  /* a file dropped on the page itself opens the import */
  S.dropOn = function (el, openFn) {
    const isFile = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    el.ondragover = (e) => { if (!isFile(e)) return; e.preventDefault(); el.classList.add('imp-page-hot'); };
    el.ondragleave = (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('imp-page-hot'); };
    el.ondrop = (e) => { if (!isFile(e)) return; e.preventDefault(); el.classList.remove('imp-page-hot'); openFn(e.dataTransfer.files[0]); };
  };

  /* ---------- people: a name in the list becomes a link; anything else stays as the typed name ---------- */
  const NO_ONE = new Set(['non', 'none', 'n/a', 'na', '-', '–', 'ไม่มี', 'ไม่ระบุ']);
  const noOne = (s) => !s || NO_ONE.has(String(s).trim().toLowerCase());
  function matchPerson(name) {
    const k = PM.normName(name);
    const r = PM.db.resources.find((x) => PM.normName(x.name) === k);
    if (r) return r.id;
    const u = (PM.team || []).find((x) => PM.normName(x.full_name) === k);
    return u ? u.id : '';
  }
  /* names the system did not recognise: told once each, in the result */
  const unknownNames = (rows, key) => Array.from(new Set(rows.map((r) => r.values[key]).filter((n) => n && !noOne(n) && !matchPerson(n))));

  /* ---------- Proposal Status List ---------- */
  const lookup = (table, s) => table[String(s == null ? '' : s).trim().toLowerCase()];
  const P_STATUS = { complete: 'complete', completed: 'complete', เสร็จ: 'complete', เสร็จแล้ว: 'complete', 'complete (win)': 'win', 'complete(win)': 'win', win: 'win', won: 'win', ชนะ: 'win', 'complete (lose)': 'lose', 'complete(lose)': 'lose', lose: 'lose', lost: 'lose', แพ้: 'lose', 'in progress': 'in_progress', inprogress: 'in_progress', กำลังทำ: 'in_progress', 'not started': 'not_started', notstarted: 'not_started', ยังไม่เริ่ม: 'not_started' };
  const P_TYPE = { bidding: 'Bidding', budget: 'Budget', budgetary: 'Budgetary', contract: 'Contract' };
  const P_PRIORITY = { high: 'High', medium: 'Medium', low: 'Low', สูง: 'High', กลาง: 'Medium', ปานกลาง: 'Medium', ต่ำ: 'Low' };
  const BID_FIELDS = (canPrice) => [
    { key: 'no', label: 'No.', type: 'text', rowNo: true, aliases: ['ลำดับ', 'ลำดับที่', 'item'] },
    { key: 'code', label: 'Bid No.', type: 'text', aliases: ['bidno', 'proposalno', 'quotationno', 'เลขที่', 'เลขที่ข้อเสนอ'] },
    { key: 'client', label: 'Customer', type: 'text', required: true, aliases: ['client', 'ลูกค้า', 'ชื่อลูกค้า'] },
    { key: 'name', label: 'Project Name', type: 'text', required: true, aliases: ['project', 'name', 'scope', 'ชื่องาน', 'ชื่อโครงการ', 'โครงการ'] },
    { key: 'type', label: 'Type', type: 'text', aliases: ['ประเภท'] },
  ].concat(canPrice ? [
    { key: 'valueMB', label: 'Value (MB)', type: 'mb', aliases: ['valuemb', 'มูลค่าล้านบาท', 'ล้านบาท'] },
    { key: 'valueTHB', label: 'Value (บาท)', type: 'number', aliases: ['value', 'valuethb', 'มูลค่า', 'มูลค่าบาท', 'ราคา', 'ราคาเสนอ'] },
  ] : []).concat([
    { key: 'priority', label: 'Priority', type: 'text', aliases: ['ความสำคัญ'] },
    { key: 'due', label: 'Due Date', type: 'date', aliases: ['due', 'กำหนดยื่น', 'กำหนดส่ง'] },
    { key: 'start', label: 'Start Date', type: 'date', aliases: ['start', 'วันเริ่ม', 'วันที่เริ่ม'] },
    { key: 'progress', label: 'Progress', type: 'percent', aliases: ['ความคืบหน้า'] },
    { key: 'status', label: 'Status', type: 'text', aliases: ['สถานะ'] },
    { key: 'pm', label: 'PM', type: 'text', aliases: ['projectmanager', 'ผู้จัดการโครงการ', 'ผู้จัดทำ'] },
    { key: 'sales', label: 'Sales', type: 'text', aliases: ['เซลส์', 'ฝ่ายขาย'] },
    { key: 'deliverables', label: 'Deliverables', type: 'text', aliases: ['เอกสาร', 'ขอบเขต', 'scope of work'] },
    { key: 'submit', label: 'Submitted', type: 'date', aliases: ['submitdate', 'วันที่ยื่น', 'ยื่นเมื่อ'] },
    { key: 'sector', label: 'Sector', type: 'text', aliases: ['กลุ่มลูกค้า'] },
  ]);
  const bidKey = (client, name) => `${PM.normName(client)}|${PM.normName(name)}`;

  S.openBids = function (done, file) {
    const V = PM.common, canPrice = PM.seesBidPrices(), T = PM.today();
    const bidValue = (v) => (v.valueMB !== undefined ? v.valueMB : v.valueTHB);
    const findBid = (v) => (v.code && PM.db.bids.find((b) => String(b.code).trim().toUpperCase() === v.code.toUpperCase())) || PM.db.bids.find((b) => bidKey(b.client, b.name) === bidKey(v.client, v.name));
    S.open({
      title: 'นำเข้า Proposal จาก Excel', done, defaults: { completeIsSubmitted: true },
      intro: 'ไฟล์ Proposal Status List ใช้ได้เลย ระบบหาแถวหัวตารางและจับคู่คอลัมน์ให้ ไม่นำตารางสรุปท้ายไฟล์เข้ามา · ไฟล์เปิดในเครื่องนี้เท่านั้น ยังไม่บันทึกจนกว่าจะกดนำเข้า',
      note: canPrice ? '' : '🔒 คุณไม่มีสิทธิ์เห็นมูลค่า คอลัมน์ Value จึงไม่ถูกนำเข้า — Sales เจ้าของงานหรือ Admin เป็นผู้กรอก',
      fields: BID_FIELDS(canPrice),
      template: () => ({
        filename: 'proposal-import-template', title: 'Proposal Status List', subtitle: 'กรอกตั้งแต่แถวใต้หัวตาราง · ลบแถวตัวอย่างก่อนนำเข้า',
        sheets: [{ name: 'Proposal', columns: ['No.', 'Customer', 'Project Name', 'Type', 'Value (MB)', 'Priority', 'Due Date', 'Start Date', 'Progress', 'Status', 'PM', 'Sales', 'Deliverables'].map((h) => ({ header: h, width: h === 'Project Name' ? 42 : 14 })),
          rows: [[1, 'ตัวอย่าง จำกัด', 'Metering Skid FT-503', 'Bidding', 9.1, 'High', '10-Jul-26', '24-Feb-26', '50%', 'In Progress', '', '', 'P&ID, List eq., BOQ']] }],
      }),
      optionsHtml: (rows, opts) => (rows.some((r) => (r.action === 'new' || r.action === 'exists') && ['complete', 'win', 'lose'].includes(lookup(P_STATUS, r.values.status)) && !r.values.submit)
        ? `<label class="imp-inline imp-check" title="ถ้าไม่ติ๊ก งานเหล่านี้จะอยู่ในขั้น Proposal และขึ้นเตือนว่าเลย Due date"><input type="checkbox" data-imp-opt="completeIsSubmitted"${opts.completeIsSubmitted ? ' checked' : ''}> Status Complete = ยื่นแล้ว (ใช้ Due Date เป็นวันที่ยื่น)</label>` : ''),
      evaluate(v, ctx) {
        const k = bidKey(v.client, v.name), codeKey = v.code && `c:${v.code.toUpperCase()}`;
        if (ctx.seen.has(k) || (codeKey && ctx.seen.has(codeKey))) return { action: 'error', note: 'ซ้ำกับแถวก่อนหน้าในไฟล์นี้' };
        ctx.seen.add(k);
        if (codeKey) ctx.seen.add(codeKey);
        const warn = [];
        if (v.type && !lookup(P_TYPE, v.type)) warn.push(`Type "${v.type}" ไม่รู้จัก ใช้ Bidding`);
        if (v.priority && !lookup(P_PRIORITY, v.priority)) warn.push(`Priority "${v.priority}" ไม่รู้จัก เว้นว่าง`);
        if (v.status && !lookup(P_STATUS, v.status)) warn.push(`Status "${v.status}" ไม่รู้จัก ใช้ Not Started`);
        if (v.valueTHB > 0 && v.valueTHB < 1000) warn.push('Value ดูเหมือนหน่วยล้านบาท ตรวจการเลือกคอลัมน์');
        const old = findBid(v);
        if (old && !PM.canEditBid(old)) return { action: 'skip', note: 'มีอยู่แล้ว แต่คุณไม่มีสิทธิ์แก้งานนี้' };
        return { action: old ? 'exists' : 'new', old, note: warn.join(' · ') };
      },
      commit(rows, opts) {
        const created = [], updated = [], before = new Map();
        const nextOrder = PM.db.bids.reduce((m, b) => Math.max(m, Number(((b.proposal || {}).listNo)) || 0), 0);
        const prefix = V.bidNoPrefix();
        const usedCodes = new Set(PM.db.bids.map((b) => String(b.code).trim().toUpperCase()));
        const nextCode = () => { let n = 1; while (usedCodes.has(`${prefix}${n}`.toUpperCase())) n++; const c = `${prefix}${n}`; usedCodes.add(c.toUpperCase()); return c; };
        rows.forEach((r, idx) => {
          const v = r.values, isNew = r.action === 'new';
          if (!isNew) before.set(r.old.id, JSON.parse(JSON.stringify(r.old)));
          const b = isNew ? {
            id: PM.uid('B'), code: v.code || nextCode(), name: v.name, client: v.client, sector: 'Industrial', value: canPrice ? 0 : null, margin: null, estimator: '', boqItems: 0,
            dueDate: '', dates: { inquiry: '', estimate: '', proposal: '', submit: '' }, stage: 'inquiry', result: 'pending', resultDate: '', projectId: null, notes: '',
            sales: '', salesName: '', leadSource: '', contact: '',
          } : r.old;
          const p = Object.assign({}, isNew ? {} : PM.propOf(b), b.proposal || {});
          delete p.work; delete p.checks;
          if (v.name) b.name = v.name;
          if (v.client) b.client = v.client;
          if (v.code && !isNew) b.code = v.code;
          if (v.sector) b.sector = v.sector;
          if (v.due) b.dueDate = v.due;
          if (canPrice && PM.canSeeBidPrice(isNew ? Object.assign(b, { owner: PM.myUid() }) : b)) { const val = bidValue(v); if (val !== undefined) b.value = val; }
          p.type = lookup(P_TYPE, v.type) || p.type || 'Bidding';
          if (v.priority !== undefined) p.priority = lookup(P_PRIORITY, v.priority) || '';
          else if (isNew) p.priority = '';
          if (v.progress !== undefined) p.progress = v.progress;
          else if (isNew) p.progress = 0;
          const st = v.status !== undefined ? lookup(P_STATUS, v.status) || 'not_started' : isNew ? 'not_started' : p.status;
          p.status = st === 'win' || st === 'lose' ? 'complete' : st;
          if (v.deliverables !== undefined) p.deliverables = v.deliverables;
          if (v.pm !== undefined) {
            const id = noOne(v.pm) ? '' : matchPerson(v.pm);
            p.owner = id; p.ownerName = id || noOne(v.pm) ? '' : v.pm;
          }
          p.listNo = (isNew ? nextOrder + idx + 1 : p.listNo) || undefined;
          b.proposal = p;
          if (v.sales !== undefined) Object.assign(b, noOne(v.sales) ? { sales: '', salesName: '' } : V.resolveSales(v.sales, isNew ? null : b));
          // dates in the order the workflow expects; the inquiry cannot come after the work it started
          const d = b.dates;
          if (v.start) d.proposal = !d.estimate || v.start >= d.estimate ? v.start : d.proposal;
          if (isNew || !d.inquiry) d.inquiry = PM.min(T, v.start || v.due || T);
          if (d.proposal && d.inquiry > d.proposal) d.inquiry = d.proposal;
          const finished = ['complete', 'win', 'lose'].includes(st);
          if (v.submit) d.submit = v.submit;
          else if (finished && opts.completeIsSubmitted && !d.submit) d.submit = PM.max(v.due || T, d.proposal || d.inquiry);
          if (d.submit && d.submit < (d.proposal || d.inquiry)) d.submit = d.proposal || d.inquiry;
          if (st === 'win' || st === 'lose') { b.result = st === 'win' ? 'won' : 'lost'; if (!b.resultDate) b.resultDate = d.submit || v.due || T; }
          b.stage = V.stageOf(b);
          if (PM.myRole() === 'sales') b.owner = (isNew ? PM.myUid() : PM.bidOwner(b)) || PM.myUid();
          else b.owner = PM.bidOwnerFor(b.sales, b.salesName);
          if (isNew) { PM.db.bids.push(b); created.push(b); } else updated.push(b);
        });
        PM.save();
        const unknown = unknownNames(rows, 'pm').concat(unknownNames(rows, 'sales').filter((n) => !PM.db.bids.some((b) => PM.normName(V.salesName(b)) === PM.normName(n) && b.sales)));
        const canUndo = created.every(PM.canSeeBidPrice);
        return {
          summary: `เพิ่มใหม่ ${created.length} งาน${updated.length ? ` · อัปเดต ${updated.length} งาน` : ''}`,
          notes: [
            unknown.length ? `ชื่อที่ไม่ตรงกับรายชื่อพนักงาน เก็บเป็นข้อความ: ${Array.from(new Set(unknown)).join(', ')}` : '',
            created.some((b) => !b.dates.proposal && !b.dueDate) ? 'งานที่ไม่มีวันที่ ใช้วันนี้เป็นวันรับเรื่อง' : '',
            canUndo ? '' : 'ยกเลิกรอบนี้ไม่ได้ เพราะงานประมูลลบได้เฉพาะ Admin และ Sales เจ้าของงาน',
          ].filter(Boolean),
          undo: canUndo ? () => {
            const gone = new Set(created.map((b) => b.id));
            PM.db.bids = PM.db.bids.filter((b) => !gone.has(b.id)).map((b) => (before.has(b.id) ? before.get(b.id) : b));
            PM.save();
          } : null,
        };
      },
    }, file);
  };

  /* ---------- Projects ---------- */
  const PJ_STATUS = { active: 'active', ดำเนินการ: 'active', ดำเนินการอยู่: 'active', 'on hold': 'onhold', onhold: 'onhold', hold: 'onhold', พักงาน: 'onhold', closed: 'closed', close: 'closed', ปิด: 'closed', ปิดแล้ว: 'closed', ปิดโครงการ: 'closed' };
  const PJ_FIELDS = [
    { key: 'no', label: 'No.', type: 'text', rowNo: true, aliases: ['ลำดับ', 'ลำดับที่', 'item'] },
    { key: 'code', label: 'Project No.', type: 'text', aliases: ['projectcode', 'code', 'jobno', 'รหัสโครงการ', 'เลขที่โครงการ'] },
    { key: 'name', label: 'ชื่อโครงการ', type: 'text', required: true, aliases: ['projectname', 'name', 'project', 'โครงการ', 'ชื่องาน'] },
    { key: 'client', label: 'ลูกค้า', type: 'text', required: true, aliases: ['customer', 'client', 'ชื่อลูกค้า'] },
    { key: 'pm', label: 'PM', type: 'text', aliases: ['projectmanager', 'ผู้จัดการโครงการ'] },
    { key: 'sales', label: 'Sales', type: 'text', aliases: ['เซลส์', 'ฝ่ายขาย'] },
    { key: 'contractMB', label: 'มูลค่าสัญญา (MB)', type: 'mb', aliases: ['contractmb', 'valuemb', 'มูลค่าล้านบาท'] },
    { key: 'contract', label: 'มูลค่าสัญญา (บาท)', type: 'number', aliases: ['contractvalue', 'contract', 'value', 'มูลค่าสัญญา', 'มูลค่า'] },
    { key: 'budgetMB', label: 'Plan cost (MB)', type: 'mb', aliases: ['budgetmb', 'plancostmb', 'งบล้านบาท'] },
    { key: 'budget', label: 'Plan cost (บาท)', type: 'number', aliases: ['plancost', 'budget', 'งบประมาณ', 'งบต้นทุน', 'ต้นทุนแผน'] },
    { key: 'start', label: 'Start date', type: 'date', required: true, aliases: ['startdate', 'start', 'วันเริ่ม', 'วันที่เริ่ม'] },
    { key: 'end', label: 'Finish date', type: 'date', required: true, aliases: ['finishdate', 'enddate', 'finish', 'end', 'วันจบ', 'วันสิ้นสุด', 'วันที่สิ้นสุด'] },
    { key: 'status', label: 'Status', type: 'text', aliases: ['สถานะ'] },
  ];
  S.openProjects = function (done, file) {
    const V = PM.common;
    const findProject = (v) => (v.code && PM.db.projects.find((p) => String(p.code).toUpperCase() === v.code.toUpperCase())) || PM.db.projects.find((p) => bidKey(p.client, p.name) === bidKey(v.client, v.name));
    S.open({
      title: 'นำเข้าโครงการจาก Excel', done,
      intro: 'ต้องมีชื่อโครงการ ลูกค้า วันเริ่ม และวันจบ ระบบแบ่งงบและสร้างขั้นงาน EPC ให้เหมือนกดเพิ่มโครงการ · ไฟล์เปิดในเครื่องนี้เท่านั้น ยังไม่บันทึกจนกว่าจะกดนำเข้า',
      fields: PJ_FIELDS,
      template: () => ({
        filename: 'project-import-template', title: 'Project list', subtitle: 'กรอกตั้งแต่แถวใต้หัวตาราง · ลบแถวตัวอย่างก่อนนำเข้า',
        sheets: [{ name: 'Projects', columns: ['Project No.', 'ชื่อโครงการ', 'ลูกค้า', 'PM', 'Sales', 'มูลค่าสัญญา (บาท)', 'Plan cost (บาท)', 'Start date', 'Finish date', 'Status'].map((h) => ({ header: h, width: h === 'ชื่อโครงการ' ? 40 : 16 })),
          rows: [['', 'ตัวอย่าง Metering Skid', 'ตัวอย่าง จำกัด', '', '', 9100000, 7800000, '01-Dec-26', '30-Jun-27', 'Active']] }],
      }),
      evaluate(v, ctx) {
        if (v.end <= v.start) return { action: 'error', note: 'Finish date ต้องอยู่หลัง Start date' };
        const k = bidKey(v.client, v.name), codeKey = v.code && `c:${v.code.toUpperCase()}`;
        if (ctx.seen.has(k) || (codeKey && ctx.seen.has(codeKey))) return { action: 'error', note: 'ซ้ำกับแถวก่อนหน้าในไฟล์นี้' };
        ctx.seen.add(k);
        if (codeKey) ctx.seen.add(codeKey);
        const warn = [];
        if (v.status && !lookup(PJ_STATUS, v.status)) warn.push(`Status "${v.status}" ไม่รู้จัก ใช้ Active`);
        if (v.contract > 0 && v.contract < 1000) warn.push('มูลค่าดูเหมือนหน่วยล้านบาท ตรวจการเลือกคอลัมน์');
        const old = findProject(v);
        return { action: old ? 'exists' : 'new', old, note: warn.join(' · ') };
      },
      commit(rows) {
        const created = [], updated = [], before = new Map();
        rows.forEach((r) => {
          const v = r.values, isNew = r.action === 'new';
          const contract = v.contractMB !== undefined ? v.contractMB : v.contract, budget = v.budgetMB !== undefined ? v.budgetMB : v.budget;
          if (!isNew) before.set(r.old.id, JSON.parse(JSON.stringify(r.old)));
          const p = isNew ? { id: PM.uid('P'), code: v.code || V.nextProjectCode(), name: v.name, client: v.client, contractValue: 0, budget: 0, startDate: v.start, endDate: v.end, pm: '', pmName: '', status: 'active', bidId: null, phases: null, progressLog: [], sales: '', salesName: '', costMode: 'ledger' } : r.old;
          if (v.code && !isNew) p.code = v.code;
          p.name = v.name; p.client = v.client; p.startDate = v.start; p.endDate = v.end;
          if (contract !== undefined) p.contractValue = contract;
          if (v.status !== undefined) p.status = lookup(PJ_STATUS, v.status) || 'active';
          if (v.pm !== undefined) { const id = noOne(v.pm) ? '' : matchPerson(v.pm); p.pm = id; p.pmName = noOne(v.pm) ? '' : id ? V.personName(id, v.pm) : v.pm; }
          if (v.sales !== undefined) Object.assign(p, noOne(v.sales) ? { sales: '', salesName: '' } : V.resolveSales(v.sales, isNew ? null : p));
          if (isNew) {
            p.budget = budget || 0;
            p.phases = PM.buildPhases(p.startDate, p.endDate, p.budget);
            Object.assign(p, PM.buildTimeline(p));
            PM.db.projects.push(p);
            created.push(p);
          } else {
            if (budget !== undefined && p.phases) PM.rescaleBudgets(p, budget);
            updated.push(p);
          }
        });
        PM.save();
        const unknown = Array.from(new Set(unknownNames(rows, 'pm').concat(unknownNames(rows, 'sales'))));
        return {
          summary: `เพิ่มใหม่ ${created.length} โครงการ${updated.length ? ` · อัปเดต ${updated.length} โครงการ` : ''}`,
          notes: [
            unknown.length ? `ชื่อที่ไม่ตรงกับรายชื่อพนักงาน เก็บเป็นข้อความ: ${unknown.join(', ')}` : '',
            updated.length ? 'โครงการที่อัปเดตไม่เปลี่ยนแผนของแต่ละขั้นงาน แก้ได้ที่การ์ดขั้นงาน' : '',
          ].filter(Boolean),
          undo: () => {
            const gone = new Set(created.map((p) => p.id));
            PM.db.projects = PM.db.projects.filter((p) => !gone.has(p.id)).map((p) => (before.has(p.id) ? before.get(p.id) : p));
            PM.save();
          },
        };
      },
    }, file);
  };
})();
