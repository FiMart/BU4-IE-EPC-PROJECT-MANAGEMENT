/* export.js — download reports as Excel (.xlsx) or PDF, no external library (works offline)
   PM.xport.excel(): builds a real .xlsx (Office Open XML, zipped here) — header styling, number / date formats,
                     frozen header row and filter buttons.
   PM.xport.pdf():   opens a print-ready A4 report; the browser saves it as PDF ("Save as PDF" / "บันทึกเป็น PDF"),
                     which keeps Thai text correct and selectable.
   Report shape (both): { filename, title, subtitle, sheets: [{ name, title?, columns: [{ header, width?, type? }], rows: [[…]], totals? }] }
   column type: 'text' (default) · 'number' (#,##0.00) · 'int' (#,##0) · 'date' (YYYY-MM-DD string → Excel date) */
(function () {
  const X = (PM.xport = {});

  /* ---------- zip (stored, no compression) ---------- */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = (bytes) => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) { // files: [{ name, data: string }]
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [], central = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
      local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
      cen.setUint16(12, dosTime, true); cen.setUint16(14, dosDate, true); cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true); cen.setUint16(28, name.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const size = central.reduce((s, a) => s + a.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------- xlsx ---------- */
  const xml = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const colName = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const serial = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 864e5 : null; };
  const sheetName = (s, used) => {
    let n = String(s || 'Sheet').replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet', k = 2;
    while (used.has(n.toLowerCase())) n = `${n.slice(0, 28)} ${k++}`;
    used.add(n.toLowerCase());
    return n;
  };
  // cell styles (index into cellXfs below)
  const S = { title: 1, sub: 2, head: 3, text: 4, number: 5, int: 6, date: 7, totalText: 8, totalNumber: 9 };
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="5"><font><sz val="10"/><name val="Tahoma"/></font><font><b/><sz val="14"/><color rgb="FF0B2F6B"/><name val="Tahoma"/></font><font><sz val="9"/><color rgb="FF6A7A91"/><name val="Tahoma"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font><font><b/><sz val="10"/><name val="Tahoma"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B2F6B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDF2F9"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD0D8E4"/></left><right style="thin"><color rgb="FFD0D8E4"/></right><top style="thin"><color rgb="FFD0D8E4"/></top><bottom style="thin"><color rgb="FFD0D8E4"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  function sheetXml(sh, subtitle) {
    const cols = sh.columns;
    const rows = [];
    const cell = (r, c, v, type, style) => {
      const ref = colName(c) + r;
      if (v == null || v === '') return `<c r="${ref}" s="${style}"/>`;
      if (type === 'number' || type === 'int') {
        const n = Number(v);
        if (isFinite(n)) return `<c r="${ref}" s="${style}"><v>${n}</v></c>`;
      }
      if (type === 'date') { const d = serial(v); if (d != null) return `<c r="${ref}" s="${style}"><v>${d}</v></c>`; }
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    };
    rows.push(`<row r="1">${cell(1, 0, sh.title || sh.name, 'text', S.title)}</row>`);
    rows.push(`<row r="2">${cell(2, 0, subtitle, 'text', S.sub)}</row>`);
    const head = 4;
    rows.push(`<row r="${head}" ht="30" customHeight="1">${cols.map((c, i) => cell(head, i, c.header, 'text', S.head)).join('')}</row>`);
    sh.rows.forEach((r, ri) => {
      const n = head + 1 + ri;
      rows.push(`<row r="${n}">${cols.map((c, i) => cell(n, i, r[i], c.type, S[c.type] || S.text)).join('')}</row>`);
    });
    const last = head + sh.rows.length;
    if (sh.totals) {
      const n = last + 1;
      rows.push(`<row r="${n}">${cols.map((c, i) => cell(n, i, sh.totals[i], c.type === 'number' || c.type === 'int' ? 'number' : 'text', c.type === 'number' || c.type === 'int' ? S.totalNumber : S.totalText)).join('')}</row>`);
    }
    const lastCol = colName(cols.length - 1);
    return {
      ref: `$A$${head}:$${lastCol}$${Math.max(last, head)}`,
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${head}" topLeftCell="A${head + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData>
${sh.rows.length ? `<autoFilter ref="A${head}:${lastCol}${last}"/>` : ''}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>
</worksheet>`,
    };
  }

  X.excel = function (rep) {
    const used = new Set();
    const sheets = rep.sheets.map((sh) => Object.assign({}, sh, { name: sheetName(sh.name, used) }));
    const built = sheets.map((sh) => sheetXml(sh, rep.subtitle));
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(rep.title)}</dc:title><dc:creator>${xml(PM.COMPANY)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${xml(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<definedNames>${built.map((b, i) => (sheets[i].rows.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(sheets[i].name.replace(/'/g, "''"))}'!${b.ref}</definedName>` : '')).join('')}</definedNames></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: STYLES },
    ].concat(built.map((b, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: b.xml })));
    download(rep.filename + '.xlsx', zip(files));
  };

  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  /* ---------- PDF (print-ready report → Save as PDF) ---------- */
  const esc = (s) => PM.ui.esc(s);
  const fmt = (v, type) => {
    if (v == null || v === '') return '';
    if (type === 'number') return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (type === 'int') return Number(v).toLocaleString('en-US');
    if (type === 'date') return PM.ui.date(v);
    return esc(v);
  };
  X.pdf = function (rep) {
    const win = window.open('', '_blank');
    if (!win) { alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาต Pop-up ของเว็บนี้แล้วลองอีกครั้ง'); return; }
    const right = (c) => (c.type === 'number' || c.type === 'int' ? ' class="r"' : '');
    const section = (sh) => `<section>
      <h2>${esc(sh.title || sh.name)}</h2>
      ${sh.rows.length ? `<table><thead><tr>${sh.columns.map((c) => `<th${right(c)}>${esc(c.header)}</th>`).join('')}</tr></thead>
      <tbody>${sh.rows.map((r) => `<tr>${sh.columns.map((c, i) => `<td${right(c)}>${fmt(r[i], c.type)}</td>`).join('')}</tr>`).join('')}</tbody>
      ${sh.totals ? `<tfoot><tr>${sh.columns.map((c, i) => `<td${right(c)}>${fmt(sh.totals[i], c.type === 'int' ? 'int' : c.type === 'number' ? 'number' : 'text')}</td>`).join('')}</tr></tfoot>` : ''}</table>`
        : '<p class="none">ไม่มีรายการ</p>'}</section>`;
    win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(rep.filename)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10.5px/1.45 "Sarabun", "Leelawadee UI", "Tahoma", "Noto Sans Thai", sans-serif; color: #0b1b33; background: #fff; }
  .bar { position: sticky; top: 0; display: flex; gap: 10px; align-items: center; padding: 10px 16px; background: #0b2f6b; color: #fff; font-size: 13px; }
  .bar button { font: inherit; font-weight: 700; padding: 7px 14px; border: 0; border-radius: 6px; background: #fff; color: #0b2f6b; cursor: pointer; }
  .bar span { opacity: .85; }
  main { padding: 16px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; border-bottom: 2px solid #0b2f6b; padding-bottom: 8px; margin-bottom: 10px; }
  header h1 { margin: 0; font-size: 18px; color: #0b2f6b; }
  header .co { font-weight: 700; font-size: 12px; }
  header .meta { text-align: right; color: #3f5068; font-size: 10px; }
  h2 { font-size: 13px; margin: 14px 0 6px; color: #0b2f6b; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #0b2f6b; color: #fff; font-weight: 700; text-align: left; padding: 5px 6px; font-size: 9.5px; }
  td { padding: 4px 6px; border-bottom: 1px solid #d0d8e4; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f4f7fb; }
  tfoot td { font-weight: 700; background: #edf2f9; border-top: 1.5px solid #0b2f6b; }
  .r { text-align: right; white-space: nowrap; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  section + section { break-before: page; }
  .none { color: #6a7a91; }
  footer { margin-top: 12px; color: #6a7a91; font-size: 9px; }
  @media print { .bar { display: none; } main { padding: 0; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="bar"><button type="button" onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button><span>เลือกเครื่องพิมพ์ "Save as PDF" / "บันทึกเป็น PDF" เพื่อได้ไฟล์ PDF</span></div>
<main>
  <header><div><div class="co">${esc(PM.COMPANY)}</div><h1>${esc(rep.title)}</h1></div><div class="meta">${esc(rep.subtitle || '')}</div></header>
  ${rep.sheets.map(section).join('')}
  <footer>BU4 IE/EPC Project Management · ${esc(rep.filename)}</footer>
</main>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 300); });<\/script>
</body></html>`);
    win.document.close();
  };
})();
