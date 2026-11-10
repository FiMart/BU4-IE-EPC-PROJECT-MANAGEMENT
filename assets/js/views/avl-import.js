/* avl-import.js — read a client's Vendor List (AVL) from a file and detect its layout, for the AVL tab of a project.
   Sources: PDF (pdf.js, downloaded from cdnjs the first time a PDF is opened) · .xlsx / .ods / .csv (the readers in sheet-import.js) ·
   cells pasted from Excel. The file is read in the browser; nothing is sent anywhere.
   Detected:
     header row: REQ Description · Vendor Name / Vendor Location · Manufacturing Location · Client Approved Vendor (AVL) (Yes/No) · Remarks
                 (+ No. · Discipline · Maker · Model when present) — wherever it is on the sheet / page, repeated on every page or not
     discipline sections: Static · Rotating · Package · Electrical · Instrumentation · Heater · FireFighting · Piping · Process …
                 a row of its own, a Discipline column, or the label above the table on each PDF page
     items (REQ Description) merged over their vendors · group headings with no vendors ("7) Temperature Measurement" › "Primary Element")
     struck-through text: the whole item / vendor = removed from the AVL · a struck part (one country) = taken out
                 Excel: strike-through font · PDF: strike rules in the page and Line / StrikeOut / Ink mark-ups ·
                 a white box drawn over rows (a "whited-out" block) = removed
     "(Commodity not required)" · "(N/A)" = the item is not needed
     fill colours, read through the file's own legend ("Proposed Additional Vendors" · "COO Deviation"), else yellow / pink
     comments typed onto the PDF (FreeText) go to the row or the item they sit on; the others are shown as notes of the file
   PM.avlImport.open(project, done, file?) · .parseGrid(rows, opts) and .readPdf(file) are used by the tests too. */
(function () {
  const U = PM.ui, esc = U.esc;
  const ON = '', OFF = ''; // struck-through text, as sheet-import.js marks it
  const A = (PM.avlImport = {});
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/';
  const MAX_MB = 30;

  const unmark = (v) => String(v == null ? '' : v).replace(/[]/g, '');
  const norm = (v) => unmark(v).toLowerCase().replace(/\s+/g, ' ').trim();
  const tidy = (s) => String(s || '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').replace(/\(\s*\)/g, '')
    .replace(/^[\s/,;:&+-]+|[\s/,;:&+(-]+$/g, '').replace(/\s*\/\s*(?:\/\s*)+/g, ' / ').trim();
  /* a cell with struck parts → share struck (0–1) · keep (the text without them) · full (all of it) · cut (what was struck) */
  function marks(v) {
    // letters and whether each is struck; a word counts as struck when most of its letters are (a strike that misses a letter)
    const ch = [], hit = [];
    let on = false;
    for (const c of String(v == null ? '' : v)) { if (c === ON) on = true; else if (c === OFF) on = false; else { ch.push(c); hit.push(on); } }
    for (let i = 0; i < ch.length;) {
      if (/[\s/,]/.test(ch[i])) { i++; continue; }
      let j = i;
      while (j < ch.length && !/[\s/,]/.test(ch[j])) j++;
      const k = hit.slice(i, j).filter(Boolean).length;
      if (k && k < j - i) for (let x = i; x < j; x++) hit[x] = k * 2 >= j - i;
      i = j;
    }
    let all = 0, n = 0, keep = '', cut = '', now = '';
    ch.forEach((c, i) => {
      if (!/\s/.test(c)) { all++; if (hit[i]) n++; }
      if (hit[i]) now += c;
      else { if (now.trim() && !/^[\s/,]+$/.test(now)) cut += (cut ? ' ' : '') + now.trim(); now = ''; keep += c; }
    });
    if (now.trim()) cut += (cut ? ' ' : '') + now.trim();
    return { share: all ? n / all : 0, keep: tidy(keep), full: tidy(ch.join('')), cut: tidy(cut) };
  }

  /* ---------------- what the columns are ---------------- */
  const HEAD = [
    ['approved', /approv|\(avl\)|^avl\b|yes\s*\/\s*no|อนุมัติ/, 3],
    ['country', /manufacturing|country|origin|\bmfg\b|\bcoo\b|ประเทศ|แหล่งผลิต/, 3],
    ['remarks', /remark|comment|\bnotes?\b|หมายเหตุ/, 3],
    ['discipline', /^(?:discipline|section)\b|^(?:หมวดงาน|งาน|สาขา)/, 3],
    ['no', /^(?:no\.?|item\s*no\.?|req\.?\s*no\.?|s\/?n|#|ลำดับ|ที่)$/, 3],
    ['item', /req\.?\s*desc|description|commodity|equipment|รายการ/, 3],
    ['item', /^item$|material|product/, 1],
    ['vendor', /vendor|supplier|ผู้ขาย|ผู้จำหน่าย|contractor/, 2],
    ['maker', /maker|brand|manufacturer\b|ยี่ห้อ|ผู้ผลิต/, 2],
    ['model', /model|รุ่น/, 2],
  ];
  const headField = (v) => {
    const t = norm(v);
    if (!t || t.length > 80) return null;
    const hit = HEAD.find(([, re]) => re.test(t));
    return hit ? { k: hit[0], sc: hit[2] } : null;
  };
  function mapColumns(row) {
    const best = {};
    (row || []).forEach((c, i) => { const f = headField(c); if (f && (!best[f.k] || f.sc > best[f.k].sc)) best[f.k] = { i, sc: f.sc }; });
    const col = {};
    Object.keys(best).forEach((k) => { col[k] = best[k].i; });
    return col;
  }

  /* ---------------- words with a meaning ---------------- */
  const SECTION = /^(?:(?:[ivx]+|\d+|[a-h])\s*[.)\-:]\s*)?(?:discipline\s*[:-]?\s*)?(static|rotating|packages?|electrical|instrument(?:ation)?s?|heaters?|fire\s*-?\s*fighting|piping|process|mechanical|civil|architectur(?:e|al)|hvac|telecom(?:munications?)?|machinery|structural)(?:\s+(?:equipments?|items?|works?|materials?|discipline|systems?|packages?))*\s*$/i;
  const LEG_ADDL = /proposed\s+additional|additional\s+vendors?/i;
  const LEG_COO = /\bc\.?\s*o\.?\s*o\.?\s*d[ae]v[ie]?ation|country\s+of\s+origin\s+d[ae]v/i;
  const NOT_REQ_NOTE = /\(\s*(?:commodity\s+)?not\s+required\s*\)|\(\s*n\s*\/?\s*a\s*\)/gi;
  const NOT_REQ = /commodity\s+not\s+required|^\(?\s*not\s+required\s*\)?$|\(\s*n\s*\/?\s*a\s*\)|^\s*n\s*\/?\s*a\s*$|ไม่ต้องใช้/i;
  const COUNTRY = /^(?:thailand|thai|japan|korea|south korea|china|prc|taiwan|singapore|malaysia|indonesia|india|vietnam|philippines|usa|u\.s\.a\.?|us|united states|america|uk|u\.k\.|united kingdom|england|germany|ger|france|italy|spain|netherlands|holland|belgium|switzerland|austria|sweden|norway|denmark|finland|canada|mexico|brazil|australia|aus|new zealand|uae|saudi arabia|qatar|kuwait|oman|turkey|poland|czech(?: republic)?|hungary|romania|slovakia|hong kong|israel|ireland|portugal|russia|south africa|europe|eu|international|global|various|local|ไทย|ประเทศไทย|ญี่ปุ่น|เกาหลี|จีน|ไต้หวัน|สิงคโปร์|มาเลเซีย|อินเดีย|เยอรมนี|อเมริกา|สหรัฐ(?:อเมริกา)?)$/i;
  const isPlace = (s) => { const parts = String(s).split(/\s*[/,&]\s*|\s+and\s+/i).map((x) => x.trim()).filter(Boolean); return parts.length > 0 && parts.every((x) => COUNTRY.test(x)); };
  /* "Yangzhou Qiuyuan (China)" · "ABB / Thailand" · a name with its location on the next line → name + location */
  function splitVendor(t) {
    let s = String(t || '').replace(/^\s*\*+\s*/, '').trim(); // "*WIKA": a footnote mark
    let loc = '';
    const paren = s.match(/^([\s\S]*\S)\s*\(([^()]+)\)\s*$/);
    const lines = s.split('\n');
    if (paren && isPlace(paren[2])) { s = paren[1]; loc = paren[2]; } else if (lines.length > 1 && isPlace(lines[lines.length - 1])) { loc = lines.pop(); s = lines.join(' '); } else {
      const m = s.match(/^(.*\S)\s*(?:\/|,|-\s)\s*([^/,]+)$/);
      if (m && isPlace(m[2])) { s = m[1]; loc = m[2]; }
    }
    return { name: s.replace(/\s+/g, ' ').trim(), loc: loc.trim() };
  }
  const yesNo = (v) => {
    const s = norm(v);
    if (/^(?:yes|y|approved|ok|✓|✔|อนุมัติ)\b/.test(s) || /^(?:✓|✔)/.test(s)) return 'yes';
    if (/^(?:no|n|not approved|✗|✘|x|ไม่)\b/.test(s) || /^(?:✗|✘)/.test(s)) return 'no';
    return '';
  };
  /* REQ Description cell → number · text · not needed? */
  function parseItem(raw, noCell) {
    const m = marks(raw);
    const struck = m.share >= 0.6;
    let text = struck ? m.full : m.keep, no = unmark(noCell).trim().replace(/[.)]$/, '');
    const lead = text.match(/^\s*(\d+(?:\.\d+)*)\s*[.)]\s*/);
    if (lead) { no = no || lead[1]; text = text.slice(lead[0].length); }
    const na = NOT_REQ.test(text);
    text = tidy(text.replace(NOT_REQ_NOTE, ' ').replace(/\s+/g, ' '));
    return { no, text: text || unmark(raw).trim(), off: struck || na, why: struck ? 'รายการถูกขีดฆ่าในไฟล์' : na ? 'รายการไม่ต้องใช้ (N/A / not required)' : '' };
  }

  /* ---------------- colours ---------------- */
  const rgbOf = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); return m ? [0, 2, 4].map((i) => parseInt(m[1].substr(i, 2), 16)) : null; };
  const hsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
    return [h, s, l];
  };
  const colored = (hex) => { const c = rgbOf(hex); if (!c) return false; const [, s, l] = hsl(c); return s >= 0.2 && l > 0.2 && l < 0.97; };
  /* a fill → 'addl' (proposed additional vendor) · 'coo' (country-of-origin deviation) · '' */
  function colorKind(hex, legend) {
    const c = rgbOf(hex);
    if (!c) return '';
    const near = (k) => { const d = rgbOf(legend[k]); return !!d && Math.hypot(c[0] - d[0], c[1] - d[1], c[2] - d[2]) < 48; };
    if (near('addl')) return 'addl';
    if (near('coo')) return 'coo';
    const [h, s, l] = hsl(c);
    if (s < 0.25 || l < 0.35 || l > 0.97) return '';
    if (!legend.addl && h >= 42 && h <= 72) return 'addl';
    if (!legend.coo && (h >= 300 || h <= 20) && l >= 0.6) return 'coo';
    return '';
  }
  A.colorKind = colorKind;

  /* ---------------- rows of cells → vendor records ----------------
     rows: arrays of cells (struck text marked) · o.fills: the same shape, '#rrggbb' · o.legend {addl, coo} · o.where(i) → "แถว 12" / "หน้า 3"
     a row may carry .section (the discipline label above a PDF table) · .cover (whited out) · .comment · .itemComment */
  A.parseGrid = function (rows, o) {
    o = o || {};
    const fills = o.fills || [], where = o.where || ((i) => `แถว ${i + 1}`);
    let h = -1, col = {}, best = 0;
    for (let i = 0; i < Math.min(rows.length, 150); i++) {
      const c = mapColumns(rows[i]), n = Object.keys(c).length;
      if (c.vendor !== undefined && (n >= 3 || c.item !== undefined) && n > best) { best = n; h = i; col = c; }
    }
    const noHeader = h < 0;
    if (noHeader) col = { item: 0, vendor: 1, maker: 2, model: 3, country: 4, discipline: 5 }; // the order of the old "paste from Excel"
    // the file's own colour legend
    const legend = Object.assign({}, o.legend);
    rows.forEach((r, i) => (r || []).forEach((v, c) => {
      const t = unmark(v).trim();
      if (!t || t.length > 60) return;
      const k = LEG_ADDL.test(t) ? 'addl' : LEG_COO.test(t) ? 'coo' : '';
      const f = fills[i] || [];
      const hex = k && !legend[k] && [f[c], f[c - 1], f[c + 1]].find(colored);
      if (hex) legend[k] = hex;
    }));
    const headV = h >= 0 ? norm(rows[h][col.vendor]) : '';
    const at = (row, k) => (col[k] === undefined ? '' : row[col[k]]);
    const out = [], items = [];
    let disc = '', group = [], item = null;
    const setDisc = (t) => { const d = PM.avlDiscipline(t); if (d && d !== disc) { disc = d; group = []; } item = null; };
    for (let i = h + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      if (row.section) { setDisc(row.section); continue; }
      const texts = row.map((c) => unmark(c).trim()).filter(Boolean);
      if (!texts.length) continue;
      const joined = texts.join(' ');
      if (texts.length <= 2 && (LEG_ADDL.test(joined) || LEG_COO.test(joined) || /vendor\s+list$/i.test(joined))) continue; // the legend
      if (headV && norm(at(row, 'vendor')) === headV) continue; // the header again (every page)
      const dv = unmark(at(row, 'discipline')).trim();
      if (dv && PM.avlDiscipline(dv) !== disc) setDisc(dv);
      const vRaw = at(row, 'vendor'), hasV = unmark(vRaw).trim() !== '';
      const ap = yesNo(marks(at(row, 'approved')).full);
      if (!hasV && !ap && texts.length === 1 && SECTION.test(texts[0])) { setDisc(texts[0]); continue; }
      const itRaw = at(row, 'item');
      if (unmark(itRaw).trim()) {
        // the item before had no vendors and was not struck: it was a heading over the next items
        if (item && !item.vendors && !item.off && !item.heading) {
          item.heading = true;
          const label = (item.no ? `${item.no}) ` : '') + item.text;
          group = item.no ? [label] : group.slice(0, 1).concat(label);
        }
        const it = parseItem(itRaw, at(row, 'no'));
        if (it.no) group = [];
        item = Object.assign(it, { disc, group: group.join(' › '), vendors: 0, seq: i, line: where(i), comment: row.itemComment || '' });
        items.push(item);
      } else if (item && row.itemComment) item.comment = [item.comment, row.itemComment].filter(Boolean).join(' · ');
      if (!hasV) continue;
      const vm = marks(vRaw);
      const vText = vm.share >= 0.6 ? vm.full : vm.keep;
      if (NOT_REQ.test(vText) && vText.length < 40) { // "(Commodity not required)" written where a vendor would be
        if (item) { item.off = true; item.why = item.why || 'รายการไม่ต้องใช้ (N/A / not required)'; }
        continue;
      }
      if (!item) { item = { no: '', text: 'ไม่ระบุรายการ', off: false, why: '', disc, group: '', vendors: 0, seq: i, line: where(i), comment: '' }; items.push(item); }
      item.vendors++;
      const v = splitVendor(vText);
      const oneLine = (m) => ({ share: m.share, keep: m.keep.replace(/\s*\n\s*/g, ' '), full: m.full.replace(/\s*\n\s*/g, ' '), cut: m.cut.replace(/\s*\n\s*/g, ' ') });
      const cm = oneLine(marks(at(row, 'country'))), rm = oneLine(marks(at(row, 'remarks')));
      const f = fills[i] || [];
      const kinds = ['vendor', 'country', 'approved', 'remarks', 'maker', 'model'].filter((k) => col[k] !== undefined).map((k) => colorKind(f[col[k]], legend));
      const remarks = rm.share >= 0.6 ? '' : rm.keep;
      const vStruck = vm.share >= 0.6;
      out.push({
        seq: i, line: where(i), item: item.text, itemNo: item.no, group: item.group, discipline: item.disc || disc, _item: item,
        vendor: v.name, vendorLocation: v.loc, maker: marks(at(row, 'maker')).keep, model: marks(at(row, 'model')).keep,
        country: vStruck ? cm.full : cm.keep, countryCut: vStruck ? '' : cm.cut, approved: ap, remarks, comment: row.comment || '',
        removed: vStruck || !!row.cover, why: vStruck ? 'ผู้ขายถูกขีดฆ่าในไฟล์' : row.cover ? 'ถูกปิดทับในไฟล์' : '',
        addl: kinds.includes('addl') || /proposed|additional\s+vendor|เสนอเพิ่ม/i.test(remarks),
        coo: kinds.includes('coo') || /c\w{2,4}try\s+added|\bcoo\b|country\s+of\s+origin|deviation/i.test(remarks),
      });
    }
    // an item struck as a whole takes its vendors with it · an item with no vendors and not a heading is kept as a line of its own
    out.forEach((r) => {
      const it = r._item;
      if (it.off) { r.removed = true; r.why = it.why; }
      r.itemNote = it.comment || '';
      delete r._item;
    });
    items.filter((it) => !it.vendors && !it.heading).forEach((it) => out.push({
      seq: it.seq, line: it.line, item: it.text, itemNo: it.no, group: it.group, discipline: it.disc, vendor: '', vendorLocation: '', maker: '', model: '', country: '', countryCut: '',
      approved: '', remarks: '', comment: '', itemNote: it.comment || '', removed: it.off, why: it.why, addl: false, coo: false,
    }));
    out.sort((a, b) => a.seq - b.seq);
    return { records: out, header: h, col, legend, noHeader };
  };

  /* ---------------- PDF ---------------- */
  /* pdf.js runs in the page itself (its worker module loaded as globalThis.pdfjsWorker): no cross-origin worker to fail —
     a 27-page vendor list reads in about a second */
  let pdfLib = null;
  function loadPdf() {
    if (!pdfLib) {
      pdfLib = Promise.all([import(PDFJS + 'pdf.min.mjs'), import(PDFJS + 'pdf.worker.min.mjs')]).then(([lib, worker]) => {
        globalThis.pdfjsWorker = worker;
        lib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
        return lib;
      }).catch(() => { pdfLib = null; throw new Error('โหลดตัวอ่าน PDF ไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ต แล้วลองอีกครั้ง'); });
    }
    return pdfLib;
  }
  const mapPt = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const boxOf = (pts) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) }; };
  const flatPts = (list) => {
    if (!list) return [];
    const a = Array.from(list);
    if (a.length && Array.isArray(a[0])) return flatPts(a.flat());
    if (a.length && typeof a[0] === 'object') return a.map((p) => [p.x, p.y]);
    const o = [];
    for (let i = 0; i + 1 < a.length; i += 2) o.push([a[i], a[i + 1]]);
    return o;
  };

  const markText = (ch, hit) => {
    let txt = '', on = false;
    ch.forEach((c, i) => {
      if (hit[i] && !on) { txt += ON; on = true; } else if (!hit[i] && on && /\S/.test(c)) { txt += OFF; on = false; }
      txt += c;
    });
    return on ? txt + OFF : txt;
  };
  /* a piece of text that runs over a column border ("…by Owner. Vendor Standard") → two pieces, cut at the space nearest the border */
  function splitAt(t, borders) {
    const ch = Array.from(t.s), n = ch.length;
    const b = borders.find((x) => x > t.x + 3 && x < t.x2 - 3);
    if (b === undefined || n < 2) return [t];
    const want = Math.round(((b - t.x) / t.w) * n);
    let k = -1;
    for (let d = 0; d <= n; d++) { if (ch[want - d] === ' ') { k = want - d; break; } if (ch[want + d] === ' ') { k = want + d; break; } }
    if (k <= 0 || k >= n - 1) return [t];
    const part = (from, to) => {
      const s = ch.slice(from, to), x = t.x + (t.w * from) / n, w = (t.w * (to - from)) / n;
      return Object.assign({}, t, { s: s.join(''), x, x2: x + w, w, cx: x + w / 2, hit: t.hit.slice(from, to), text: markText(s, t.hit.slice(from, to)) });
    };
    return [part(0, k)].concat(splitAt(part(k + 1, n), borders));
  }
  /* one page → text pieces (top-down coordinates) with what is drawn on them, the table rules, coloured boxes, mark-ups */
  async function readPage(lib, page) {
    const vp = page.getViewport({ scale: 1 }), VT = vp.transform, X = lib.Util.transform;
    const items = [];
    (await page.getTextContent()).items.forEach((t) => {
      if (!t.str || !t.str.trim()) return;
      const m = X(VT, t.transform), len = Math.hypot(m[0], m[1]) || 1;
      if (Math.abs(m[1] / len) > 0.3) return; // turned text is not part of the table
      const h = Math.hypot(m[2], m[3]) || 8, w = Math.max(Number(t.width) || 0, 1), x = m[4], base = m[5];
      items.push({ s: t.str, x, x2: x + w, w, base, h, top: base - h, cy: base - h * 0.35, cx: x + w / 2, fill: '', cover: false, cuts: [] });
    });
    // mark-ups: strike lines · comments
    const strikes = [], comments = [];
    (await page.getAnnotations()).forEach((a) => {
      if (a.subtype === 'Line' && a.lineCoordinates) {
        const [x1, y1, x2, y2] = a.lineCoordinates, p = mapPt(VT, x1, y1), q = mapPt(VT, x2, y2);
        if (Math.abs(p[1] - q[1]) <= Math.max(3, Math.abs(p[0] - q[0]) * 0.08)) strikes.push({ x1: Math.min(p[0], q[0]), x2: Math.max(p[0], q[0]), y: (p[1] + q[1]) / 2 });
      } else if (a.subtype === 'StrikeOut' && a.quadPoints) {
        const p = flatPts(a.quadPoints).map(([x, y]) => mapPt(VT, x, y));
        for (let i = 0; i + 3 < p.length; i += 4) { const b = boxOf(p.slice(i, i + 4)); strikes.push({ x1: b.x1, x2: b.x2, y: b.y1 + (b.y2 - b.y1) * 0.55 }); }
      } else if (a.subtype === 'Ink' && a.inkLists) {
        Array.from(a.inkLists).forEach((l) => {
          const p = flatPts(l).map(([x, y]) => mapPt(VT, x, y));
          if (p.length < 2) return;
          const b = boxOf(p);
          if (b.x2 - b.x1 > 8 && b.y2 - b.y1 < Math.max(4, (b.x2 - b.x1) * 0.1)) strikes.push({ x1: b.x1, x2: b.x2, y: (b.y1 + b.y2) / 2 });
        });
      } else if (a.subtype === 'FreeText' && a.rect) {
        const text = String((a.contentsObj && a.contentsObj.str) || a.contents || '').replace(/\s+/g, ' ').trim();
        if (text) comments.push(Object.assign({ text }, boxOf([mapPt(VT, a.rect[0], a.rect[1]), mapPt(VT, a.rect[2], a.rect[3])])));
      }
    });
    // what is drawn: table rules (thin boxes and strokes) · coloured cell fills · white boxes laid over rows by a mark-up
    const ol = await page.getOperatorList(), O = lib.OPS;
    const fills = [], rules = [], vrules = [], covers = [];
    let ctm = [1, 0, 0, 1, 0, 0], fc = '#000000', ca = 1, ann = 0, path = [];
    const stack = [];
    const hex = (a) => (typeof a[0] === 'string' ? a[0] : '#' + [0, 1, 2].map((i) => Math.max(0, Math.min(255, Math.round(a[i]))).toString(16).padStart(2, '0')).join('')).toLowerCase();
    const dev = (x, y) => { const p = mapPt(ctm, x, y); return mapPt(VT, p[0], p[1]); };
    const addPath = (a) => {
      const ops = a[0] || [], c = a[1] || [];
      let j = 0, cur = null, start = null, poly = null;
      for (const op of ops) {
        if (op === O.rectangle) { const [x, y, w, hh] = [c[j], c[j + 1], c[j + 2], c[j + 3]]; j += 4; path.push({ rect: boxOf([dev(x, y), dev(x + w, y + hh)]) }); poly = null; } else if (op === O.moveTo) { cur = start = dev(c[j], c[j + 1]); j += 2; poly = [cur]; path.push({ poly }); } else if (op === O.lineTo) { const p = dev(c[j], c[j + 1]); j += 2; if (cur) path.push({ seg: [cur, p] }); if (poly) poly.push(p); cur = p; } else if (op === O.curveTo) { j += 6; cur = dev(c[j - 2], c[j - 1]); if (poly) poly.push(cur); } else if (op === O.curveTo2 || op === O.curveTo3) { j += 4; cur = dev(c[j - 2], c[j - 1]); if (poly) poly.push(cur); } else if (op === O.closePath) { if (cur && start) path.push({ seg: [cur, start] }); cur = start; }
      }
    };
    const rule = (x1, x2, y1, y2) => {
      const w = x2 - x1, hh = y2 - y1;
      if (hh <= 2.5 && w > 3) rules.push({ x1, x2, y: (y1 + y2) / 2 });
      else if (w <= 2.5 && hh > 3) vrules.push({ x: (x1 + x2) / 2, y1, y2 });
      else return false;
      return true;
    };
    const paint = (doFill, doStroke) => {
      path.forEach((p) => {
        const b = p.rect || (p.poly && p.poly.length > 2 ? boxOf(p.poly) : null);
        if (doFill && b) {
          if (ann) { if (fc === '#ffffff' && ca >= 0.5 && b.x2 - b.x1 > 20 && b.y2 - b.y1 > 6) covers.push(b); } else if (!rule(b.x1, b.x2, b.y1, b.y2) && b.x2 - b.x1 > 2 && b.y2 - b.y1 > 2) fills.push(Object.assign({ color: fc }, b));
        }
        if (doStroke && !ann) {
          const segs = p.seg ? [p.seg] : p.rect ? [[[p.rect.x1, p.rect.y1], [p.rect.x2, p.rect.y1]], [[p.rect.x1, p.rect.y2], [p.rect.x2, p.rect.y2]], [[p.rect.x1, p.rect.y1], [p.rect.x1, p.rect.y2]], [[p.rect.x2, p.rect.y1], [p.rect.x2, p.rect.y2]]] : [];
          segs.forEach(([s, e]) => { const bb = boxOf([s, e]); rule(bb.x1, bb.x2, bb.y1, bb.y2); });
        }
      });
      path = [];
    };
    const save = () => stack.push([ctm, fc, ca]);
    const restore = () => { if (stack.length) [ctm, fc, ca] = stack.pop(); };
    for (let i = 0; i < ol.fnArray.length; i++) {
      const f = ol.fnArray[i], a = ol.argsArray[i] || [];
      if (f === O.save) save();
      else if (f === O.restore) restore();
      else if (f === O.transform) ctm = X(ctm, a);
      else if (f === O.paintFormXObjectBegin) { save(); if (Array.isArray(a[0]) || ArrayBuffer.isView(a[0])) ctm = X(ctm, Array.from(a[0])); } else if (f === O.paintFormXObjectEnd) restore();
      else if (f === O.beginAnnotation) { save(); ann++; if (a[2]) ctm = X(ctm, Array.from(a[2])); if (a[3]) ctm = X(ctm, Array.from(a[3])); } else if (f === O.endAnnotation) { ann = Math.max(0, ann - 1); restore(); } else if (f === O.setFillRGBColor) fc = hex(a);
      else if (f === O.setGState) (a[0] || []).forEach((kv) => { if (kv && kv[0] === 'ca') ca = Number(kv[1]); });
      else if (f === O.constructPath) addPath(a);
      else if (f === O.fill || f === O.eoFill) paint(true, false);
      else if (f === O.stroke || f === O.closeStroke) paint(false, true);
      else if (f === O.fillStroke || f === O.eoFillStroke || f === O.closeFillStroke || f === O.closeEOFillStroke) paint(true, true);
      else if (f === O.endPath) path = [];
    }
    // on each piece of text: struck letters · the fill under it · a white box over it
    const through = (t, l) => l.y >= t.base - t.h * 0.75 && l.y <= t.base - t.h * 0.1 && l.x2 > t.x + 0.5 && l.x1 < t.x2 - 0.5;
    items.forEach((t) => {
      const hits = strikes.filter((l) => through(t, l)).concat(rules.filter((l) => { const on = through(t, l); if (on) l.strike = true; return on; }));
      t.cuts = hits.map((l) => [l.x1, l.x2]);
      for (let k = fills.length - 1; k >= 0; k--) { const r = fills[k]; if (t.cx >= r.x1 && t.cx <= r.x2 && t.cy >= r.y1 && t.cy <= r.y2) { if (r.color !== '#ffffff') t.fill = r.color; break; } }
      t.cover = covers.some((b) => t.cx >= b.x1 && t.cx <= b.x2 && t.cy >= b.y1 && t.cy <= b.y2);
      const ch = Array.from(t.s), n = ch.length;
      // letters under a strike (their place is estimated from the width), then whole words: "India International" with only India struck
      t.hit = ch.map((c, i) => { const x = t.x + (t.w * (i + 0.5)) / n; return /\S/.test(c) && t.cuts.some(([a, b]) => x >= a - 0.5 && x <= b + 0.5); });
      if (t.cuts.length) {
        let i = 0;
        for (const word of t.s.match(/[^\s/]+|[\s/]+/g) || []) {
          const len = Array.from(word).length;
          if (/\S/.test(word) && !/^[\s/]+$/.test(word)) { const k = t.hit.slice(i, i + len).filter(Boolean).length; for (let j = i; j < i + len; j++) t.hit[j] = k * 2 >= len; }
          i += len;
        }
      }
      t.text = markText(ch, t.hit);
    });
    // a comment that is itself struck through was withdrawn
    const live = comments.filter((c) => !strikes.some((l) => l.y > c.y1 + (c.y2 - c.y1) * 0.2 && l.y < c.y2 - (c.y2 - c.y1) * 0.2 && Math.min(l.x2, c.x2) - Math.max(l.x1, c.x1) > (c.x2 - c.x1) * 0.4));
    return { items, rules: rules.filter((l) => !l.strike), vrules, fills, comments: live, width: vp.width, height: vp.height };
  }

  const FIELDS = ['discipline', 'no', 'item', 'vendor', 'maker', 'model', 'country', 'approved', 'remarks'];
  const LABEL = { discipline: 'Discipline', no: 'No.', item: 'REQ Description', vendor: 'Vendor Name / Vendor Location', maker: 'Maker', model: 'Model', country: 'Manufacturing Location', approved: 'Client Approved Vendor (AVL) (Yes/No)', remarks: 'Remarks' };
  const joinText = (list) => {
    const s = list.slice().sort((a, b) => a.base - b.base || a.x - b.x);
    let out = '', last = null;
    s.forEach((t) => {
      if (!last) out = t.text;
      else if (Math.abs(t.base - last.base) > t.h * 0.5) out += '\n' + t.text;
      else out += t.x - last.x2 > t.h * 0.15 && !/\s$/.test(out) && !/^\s/.test(t.text) ? ' ' + t.text : t.text;
      last = t;
    });
    return out;
  };

  /* the tables on a page: one per header row (a page may hold a header part-way down), or the layout of the page before */
  function tablesOf(pg, prev) {
    const anchors = [];
    // the "Vendor Name" heading, with at least two other headings beside it (item · manufacturing location · Yes/No · remarks) —
    // a vendor called "All other … Suppliers" next to "Vendor Standard" and "No" is a row, not a header
    pg.items.filter((t) => /^\s*vendors?\s*name|^\s*vendors?\s*(?:\/|$)|^\s*suppliers?\s*(?:name)?\s*$|^\s*ผู้ขาย/i.test(t.s)).sort((a, b) => a.cy - b.cy).forEach((t) => {
      const kinds = new Set(pg.items.filter((o) => o !== t && Math.abs(o.cy - t.cy) < t.h * 3).map((o) => (headField(o.s) || {}).k).filter((k) => ['item', 'country', 'approved', 'remarks', 'discipline'].includes(k)));
      if (kinds.size >= 2 && !anchors.some((a) => Math.abs(a.cy - t.cy) < t.h * 4)) anchors.push(t);
    });
    const tables = [];
    anchors.forEach((an, k) => {
      const cross = pg.rules.filter((l) => l.x1 <= an.cx && l.x2 >= an.cx);
      const above = cross.filter((l) => l.y < an.top + 1 && l.y > an.top - an.h * 4).sort((a, b) => b.y - a.y)[0];
      const below = cross.filter((l) => l.y > an.base - 1 && l.y < an.base + an.h * 4).sort((a, b) => a.y - b.y)[0];
      const top = above ? above.y : an.top - an.h * 1.6, bottom = below ? below.y : an.base + an.h * 1.6;
      const head = pg.items.filter((t) => t.cy > top && t.cy < bottom && !LEG_ADDL.test(t.s) && !LEG_COO.test(t.s));
      const vBetween = (x1, x2) => pg.vrules.some((v) => v.x > x1 - 0.5 && v.x < x2 + 0.5 && v.y1 < bottom && v.y2 > top);
      const groups = [];
      head.slice().sort((a, b) => a.x - b.x).forEach((t) => {
        const g = groups.find((gg) => !vBetween(Math.min(gg.x2, t.x), Math.max(gg.x2, t.x)) && ((t.x < gg.x2 - 0.5 && t.x2 > gg.x1 + 0.5) || gg.items.some((o) => Math.abs(o.base - t.base) < t.h * 0.3 && t.x - o.x2 < t.h * 0.35 && t.x - o.x2 > -1)));
        if (g) { g.items.push(t); g.x1 = Math.min(g.x1, t.x); g.x2 = Math.max(g.x2, t.x2); } else groups.push({ x1: t.x, x2: t.x2, items: [t] });
      });
      groups.sort((a, b) => a.x1 - b.x1);
      const cols = groups.map((g) => ({ field: (headField(joinText(g.items)) || {}).k || '', x1: g.x1, x2: g.x2, label: joinText(g.items) }));
      if (!cols.some((c) => c.field === 'vendor')) return;
      // borders: the vertical rule between two headings, else half-way
      const vs = pg.vrules.filter((v) => v.y1 < bottom && v.y2 > top).map((v) => v.x).sort((a, b) => a - b);
      const edges = [];
      for (let i = 1; i < cols.length; i++) {
        const a = cols[i - 1].x2, b = cols[i].x1, mid = (a + b) / 2;
        const v = vs.filter((x) => x > a - 1 && x < b + 1).sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid))[0];
        edges.push(v !== undefined ? v : mid);
      }
      const left = vs.filter((x) => x < cols[0].x1 + 1).pop(), right = vs.filter((x) => x > cols[cols.length - 1].x2 - 1)[0];
      cols.forEach((c, i) => { c.x1 = i ? edges[i - 1] : left !== undefined ? left : c.x1 - 60; c.x2 = i < edges.length ? edges[i] : right !== undefined ? right : c.x2 + 60; });
      const next = anchors[k + 1];
      tables.push({ cols, top: bottom, end: next ? next.top - next.h * 4 : pg.height, headTop: top });
    });
    if (!tables.length && prev) tables.push({ cols: prev, top: 0, end: pg.height, headTop: 0, continued: true });
    // where each table ends: its last rule across the vendor column, so a footer under it is left out
    tables.forEach((t) => {
      const v = t.cols.find((c) => c.field === 'vendor'), cx = (v.x1 + v.x2) / 2;
      const ys = pg.rules.filter((l) => l.x1 <= cx && l.x2 >= cx && l.y > t.top + 1 && l.y < t.end).map((l) => l.y);
      t.bottom = ys.length ? Math.max(...ys) + 0.5 : t.end;
      if (t.continued && ys.length) t.top = Math.min(...ys) - 0.5;
    });
    return tables;
  }

  /* bands between the rules that cross x, inside [top, bottom] */
  function bandsAt(pg, x, top, bottom) {
    const ys = pg.rules.filter((l) => l.x1 <= x && l.x2 >= x && l.y > top - 1 && l.y < bottom + 1).map((l) => l.y).concat([top, bottom]).sort((a, b) => a - b);
    const u = [];
    ys.forEach((y) => { if (!u.length || y - u[u.length - 1] > 2) u.push(y); });
    const out = [];
    for (let i = 1; i < u.length; i++) out.push([u[i - 1], u[i]]);
    return out;
  }

  /* a table on a page → rows of cells in the FIELDS order */
  function rowsOf(pg, t) {
    const cols = t.cols, left = cols[0].x1, right = cols[cols.length - 1].x2;
    const colOf = (x) => { for (let i = cols.length - 1; i >= 0; i--) if (x >= cols[i].x1 - 1) return i; return 0; };
    // only where a real cell border is drawn at that height — a heading in a merged cell runs across columns on purpose
    const borders = cols.slice(1).map((c) => c.x1);
    const ruled = (it) => borders.filter((b) => pg.vrules.some((v) => Math.abs(v.x - b) < 2.5 && v.y1 <= it.cy + 1 && v.y2 >= it.cy - 1));
    const inT = pg.items.filter((it) => it.cy > t.top && it.cy < t.bottom && it.x2 > left - 2 && it.x < right + 2).flatMap((it) => splitAt(it, ruled(it)));
    const vi = cols.findIndex((c) => c.field === 'vendor'), vcx = (cols[vi].x1 + cols[vi].x2) / 2;
    let base = bandsAt(pg, vcx, t.top, t.bottom).filter(([a, b]) => b - a > 3);
    const grid = base.length > 1;
    if (!grid) { // no rules: one row per line of text
      base = [];
      inT.slice().sort((a, b) => a.base - b.base).forEach((it) => {
        const last = base[base.length - 1];
        if (last && it.base - last.base < it.h * 0.6) { last[1] = Math.max(last[1], it.base + 1); last.base = it.base; } else { const b = [it.top - 1, it.base + 1]; b.base = it.base; base.push(b); }
      });
    }
    const cells = base.map(() => cols.map(() => []));
    const own = cols.map((c) => (grid ? bandsAt(pg, (c.x1 + c.x2) / 2, t.top, t.bottom) : null));
    const rowFor = (ci, y) => {
      const inBand = (b) => y >= b[0] - 0.5 && y <= b[1] + 0.5;
      if (own[ci]) { // a merged cell (the item over its vendors) belongs to the first row it spans
        const ob = own[ci].find(inBand);
        if (ob) { const r = base.findIndex((b) => (b[0] + b[1]) / 2 > ob[0] && (b[0] + b[1]) / 2 < ob[1]); if (r >= 0) return r; }
      }
      let r = base.findIndex(inBand);
      if (r < 0) { let d = Infinity; base.forEach((b, i) => { const dd = Math.min(Math.abs(y - b[0]), Math.abs(y - b[1])); if (dd < d) { d = dd; r = i; } }); }
      return r;
    };
    inT.forEach((it) => { const ci = colOf(it.x + Math.min(2, it.w / 2)), r = rowFor(ci, it.cy); if (r >= 0) cells[r][ci].push(it); });
    const out = [];
    base.forEach((b, r) => {
      if (!cells[r].some((c) => c.length)) return;
      const row = FIELDS.map(() => ''), fill = [];
      cols.forEach((c, ci) => {
        const k = FIELDS.indexOf(c.field);
        if (k < 0 || !cells[r][ci].length) return;
        row[k] = joinText(cells[r][ci]);
        fill[k] = (cells[r][ci].find((it) => it.fill) || {}).fill || '';
      });
      row.cover = cols.some((c, ci) => ['vendor', 'country', 'approved'].includes(c.field) && cells[r][ci].length && cells[r][ci].every((it) => it.cover));
      row.band = b;
      out.push({ row, fill });
    });
    // without rules a long name wraps onto a line of its own: join it to the row above
    if (!grid) {
      const ai = FIELDS.indexOf('approved'), ii = FIELDS.indexOf('item');
      for (let i = out.length - 1; i > 0; i--) {
        const r = out[i].row, up = out[i - 1].row;
        if (!r[ai] && !r[ii] && up[FIELDS.indexOf('vendor')]) { r.forEach((v, k) => { if (v) up[k] = up[k] ? `${up[k]}\n${v}` : v; }); up.band = [up.band[0], r.band[1]]; out.splice(i, 1); }
      }
    }
    // comments typed onto the page: to the row they sit beside (in the item column: to the item)
    const used = new Set();
    pg.comments.forEach((c, n) => {
      const cy = (c.y1 + c.y2) / 2, cx = (c.x1 + c.x2) / 2;
      if (cy < t.top || cy > t.bottom) return;
      let best = -1, d = Infinity;
      out.forEach((o, i) => { const b = o.row.band, dd = cy >= b[0] && cy <= b[1] ? 0 : Math.min(Math.abs(cy - b[0]), Math.abs(cy - b[1])); if (dd < d) { d = dd; best = i; } });
      if (best < 0) return;
      const f = cx >= left && cx <= right ? cols[colOf(cx)].field : 'remarks';
      const key = f === 'item' || f === 'no' || f === 'discipline' ? 'itemComment' : 'comment';
      let target = out[best].row;
      if (key === 'itemComment') { for (let i = best; i >= 0; i--) if (out[i].row[FIELDS.indexOf('item')]) { target = out[i].row; break; } }
      target[key] = [target[key], c.text].filter(Boolean).join(' · ');
      used.add(n);
    });
    return { rows: out, used };
  }

  A.readPdf = async function (file, progress) {
    if (file.size > MAX_MB * 1048576) throw new Error(`ไฟล์ใหญ่เกิน ${MAX_MB} MB`);
    const lib = await loadPdf();
    let doc;
    try {
      doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
    } catch (e) {
      throw new Error(e && e.name === 'PasswordException' ? 'PDF นี้ตั้งรหัสผ่านไว้ — เปิดแล้วบันทึกเป็นไฟล์ที่ไม่มีรหัสผ่านก่อน' : 'เปิด PDF นี้ไม่ได้ ไฟล์อาจเสียหาย');
    }
    const rows = [FIELDS.map((k) => LABEL[k])], fills = [[]], where = ['หัวตาราง'], notes = [], legend = {};
    let layout = null, section = '', textless = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      if (progress) progress(n, doc.numPages);
      const pg = await readPage(lib, await doc.getPage(n));
      if (!pg.items.length) { textless++; continue; }
      pg.items.forEach((t) => {
        const k = LEG_ADDL.test(t.s) ? 'addl' : LEG_COO.test(t.s) ? 'coo' : '';
        if (!k || legend[k]) return;
        const box = pg.fills.filter((r) => colored(r.color) && t.cy >= r.y1 && t.cy <= r.y2 && r.x2 <= t.x2 + 2 && t.x - r.x2 < 60).pop();
        const hex = colored(t.fill) ? t.fill : box && box.color;
        if (hex) legend[k] = hex;
      });
      const tables = tablesOf(pg, layout);
      const usedComments = new Set();
      tables.forEach((t) => {
        // the discipline label just above the table ("Static", "Instrumentation" …)
        if (!t.continued) {
          const above = pg.items.filter((it) => it.base <= t.headTop + 1 && it.base > t.headTop - it.h * 3.5 && it.x < (t.cols[0].x1 + t.cols[t.cols.length - 1].x2) / 2 && !LEG_ADDL.test(it.s) && !LEG_COO.test(it.s) && !/vendor\s+list/i.test(it.s));
          const label = unmark(joinText(above)).replace(/\s+/g, ' ').trim();
          if (label && label.split(' ').length <= 5 && label !== section) {
            section = label;
            rows.push(Object.assign([], { section: label })); fills.push([]); where.push(`หน้า ${n}`);
          }
        }
        layout = t.cols;
        const got = rowsOf(pg, t);
        got.used.forEach((i) => usedComments.add(i));
        got.rows.forEach((o) => { rows.push(o.row); fills.push(o.fill); where.push(`หน้า ${n}`); });
      });
      pg.comments.forEach((c, i) => { if (!usedComments.has(i)) notes.push(`หน้า ${n}: ${c.text}`); });
    }
    if (textless === doc.numPages) throw new Error('PDF นี้เป็นภาพสแกน ไม่มีข้อความให้อ่าน — ขอไฟล์ Excel จากลูกค้า หรือพิมพ์เป็น PDF จาก Excel');
    if (rows.length < 2) throw new Error('ไม่พบตาราง Vendor List ใน PDF นี้ — ต้องมีหัวตาราง "Vendor Name" และคอลัมน์อื่นอย่างน้อย 2 คอลัมน์');
    return { name: file.name || 'PDF', rows, fills, where, legend, notes, pages: doc.numPages };
  };

  /* any file → sheets [{ name, rows, fills, where?, legend?, notes? }] */
  A.readFile = async function (file, progress) {
    const name = String(file.name || '').toLowerCase();
    if (/\.pdf$/.test(name) || file.type === 'application/pdf') return [await A.readPdf(file, progress)];
    return PM.sheetImport.readFile(file);
  };

  /* ---------------- the dialog ---------------- */
  const KEEP = { all: () => true, live: (r) => !r.removed, off: (r) => r.removed, flag: (r) => r.addl || r.coo };
  A.open = function (p, done, firstFile) {
    const st = { source: '', sheets: [], sheet: 0, res: null, plan: null, skip: new Set(), show: 'live', noAs: 'submitted', blankAs: 'proposed', keepOff: true, dropMissing: false };
    const form = U.modal({
      title: `นำเข้า AVL จากไฟล์ — ${p.code}`, wide: true, submitLabel: 'นำเข้า',
      body: `<p class="full muted" style="margin:0">รับ Vendor List ของลูกค้า — <b>PDF</b> หรือ <b>Excel</b> (.xlsx · .ods · .csv) หรือคัดลอกตารางจาก Excel มาวาง ·
          ระบบหาหัวตาราง หมวดงาน (Static · Rotating · Electrical …) รายการ (REQ Description) ผู้ขาย ประเทศที่ผลิต Yes/No และ Remarks ให้เอง ·
          ข้อความที่ถูกขีดฆ่า = ตัดออก · สีตามคำอธิบายในไฟล์ (Proposed Additional Vendors · COO Deviation) · นำเข้ารอบหน้าด้วยไฟล์ฉบับใหม่ = อัปเดตของเดิม</p>
        <div class="full imp-drop" data-imp-drop tabindex="0" role="button" aria-label="เลือกไฟล์ Vendor List">
          <b>ลากไฟล์ Vendor List มาวางที่นี่</b>
          <span>หรือ <u>เลือกไฟล์</u> (.pdf, .xlsx, .ods, .csv) · คัดลอกตารางจาก Excel แล้วกด Ctrl + V ก็ได้</span>
          <input type="file" accept=".pdf,.xlsx,.xlsm,.ods,.csv,.txt,application/pdf" data-imp-file hidden>
        </div>
        <div class="full" data-imp-work></div>`,
      onSubmit: () => { run(); return false; },
    });
    const work = form.querySelector('[data-imp-work]'), drop = form.querySelector('[data-imp-drop]'), input = form.querySelector('[data-imp-file]');
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;

    const opts = () => ({ noAs: st.noAs, blankAs: st.blankAs, keepOff: st.keepOff, dropMissing: st.dropMissing, skip: st.skip, source: st.source });
    // redrawing the preview keeps where the reader was in the list
    const scrollers = () => { const out = []; for (let n = work; n; n = n.parentElement) if (n.scrollHeight > n.clientHeight + 4) out.push(n); const t = work.querySelector('.imp-table'); if (t) out.push(t); return out; };
    function parse() {
      const s = st.sheets[st.sheet];
      st.res = A.parseGrid(s.rows, { fills: s.fills, legend: s.legend, where: s.where ? (i) => s.where[i] || '' : (i) => `แถว ${i + 1}` });
      st.skip = new Set();
    }
    function draw() {
      if (!st.res) { work.innerHTML = ''; submit.disabled = true; return; }
      drop.classList.add('slim');
      const keep = scrollers().map((n) => [n, n.scrollTop, n.scrollLeft]);
      const s = st.sheets[st.sheet], recs = st.res.records;
      const plan = (st.plan = PM.avlPlan(p, recs, opts()));
      const n = (fn) => recs.filter(fn).length, c = (a) => plan.rows.filter((x) => x.act === a).length;
      const vend = recs.filter((r) => r.vendor), items = new Set(recs.map((r) => PM.normName(r.item)));
      const lg = st.res.legend, sw = (hex, label) => (hex ? `<span class="avl-sw" style="background:${esc(hex)}"></span>${esc(label)}` : '');
      const shown = plan.rows.filter((x) => (KEEP[st.show] || KEEP.all)(x.r));
      const ACT = { new: ['good', 'เพิ่มใหม่'], update: ['info', 'อัปเดต'], same: ['neutral', 'เหมือนเดิม'], dup: ['neutral', 'ซ้ำในไฟล์ · ข้าม'], skip: ['neutral', 'ไม่นำเข้า'] };
      let lastDisc = null, lastItem = null;
      const body = shown.map((x) => {
        const r = x.r, i = recs.indexOf(r);
        let head = '';
        if (r.discipline !== lastDisc) { lastDisc = r.discipline; lastItem = null; head += `<tr class="avl-imp-d"><td colspan="7">${esc(r.discipline || 'ไม่ระบุหมวดงาน')}</td></tr>`; }
        const ik = `${r.group}|${r.itemNo}|${r.item}`;
        if (ik !== lastItem) {
          lastItem = ik;
          head += `<tr class="avl-g${r.removed && !r.vendor ? ' avl-off' : ''}"><td colspan="7"><b class="avl-v">${esc(r.itemNo ? `${r.itemNo}) ` : '')}${esc(r.item)}</b>${r.group ? `<small>${esc(r.group)}</small>` : ''}${r.itemNote ? `<small>💬 ${esc(r.itemNote)}</small>` : ''}</td></tr>`;
        }
        const b = ACT[x.act] || ACT.same;
        return `${head}<tr class="${r.removed ? 'avl-off' : ''}">
          <td><input type="checkbox" data-avl-pick="${i}"${st.skip.has(i) || x.act === 'dup' ? '' : ' checked'}${x.act === 'dup' ? ' disabled' : ''} aria-label="นำเข้าแถวนี้"></td>
          <td>${r.vendor ? `<b class="avl-v">${esc(r.vendor)}</b>` : '<span class="muted">ยังไม่มีผู้ขาย</span>'}${r.vendorLocation ? `<small>${esc(r.vendorLocation)}</small>` : ''}${PM.avlFlags(r)}</td>
          <td>${esc(r.country || '–')}${r.countryCut ? `<small class="neg">ตัด ${esc(r.countryCut)}</small>` : ''}</td>
          <td>${r.approved === 'yes' ? U.badge('good', 'Yes') : r.approved === 'no' ? U.badge('warning', 'No') : '–'}</td>
          <td>${esc(r.remarks || '')}${r.comment ? `<small>💬 ${esc(r.comment)}</small>` : ''}${r.removed ? `<small class="neg">${esc(r.why)}</small>` : ''}</td>
          <td class="nowrap">${U.badge(b[0], b[1])}${x.changes && x.changes.length ? `<small>${esc(x.changes.join(', '))}</small>` : ''}</td>
          <td class="num muted">${esc(r.line || '')}</td></tr>`;
      }).join('');
      const willDo = c('new') + c('update') + plan.missing.length * (st.dropMissing ? 1 : 0);
      work.innerHTML = `
        <div class="imp-bar">
          <b>${esc(st.source)}</b>${s.pages ? `<small class="muted">${s.pages} หน้า</small>` : ''}
          ${st.sheets.length > 1 ? `<label class="imp-inline">ชีต <select data-avl-sheet>${st.sheets.map((x, i) => `<option value="${i}"${i === st.sheet ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
        </div>
        ${st.res.noHeader ? '<p class="callout imp-warn">ไม่พบหัวตาราง (Vendor Name · Manufacturing Location · Yes/No …) — อ่านตามลำดับคอลัมน์: รายการ · ผู้ขาย · ผู้ผลิต · รุ่น · ประเทศ · งาน</p>' : ''}
        <div class="imp-sum">
          ${U.badge('neutral', `อ่านได้ ${vend.length} แถว · ${items.size} รายการ`)}
          ${U.badge('good', `Yes ${n((r) => r.approved === 'yes' && !r.removed)}`)}
          ${n((r) => r.approved === 'no' && !r.removed) ? U.badge('warning', `No ${n((r) => r.approved === 'no' && !r.removed)}`) : ''}
          ${n((r) => r.addl && !r.removed) ? `<span class="avl-flag addl">เสนอเพิ่ม ${n((r) => r.addl && !r.removed)}</span>` : ''}
          ${n((r) => r.coo && !r.removed) ? `<span class="avl-flag coo">COO Deviation ${n((r) => r.coo && !r.removed)}</span>` : ''}
          ${n((r) => r.removed) ? U.badge('critical', `ตัดออก ${n((r) => r.removed)}`) : ''}
        </div>
        ${lg.addl || lg.coo ? `<p class="imp-over">คำอธิบายสีในไฟล์: ${[sw(lg.addl, 'Proposed Additional Vendors → เสนอเพิ่ม'), sw(lg.coo, 'COO Deviation')].filter(Boolean).join(' · ')}</p>` : ''}
        ${(s.notes || []).length ? `<details class="imp-over"${s.notes.length <= 3 ? ' open' : ''}><summary>หมายเหตุที่เขียนไว้ในไฟล์ ${s.notes.length} รายการ</summary><ul class="imp-notes">${s.notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}
        <div class="avl-imp-opts">
          <label class="imp-inline">"No" ในไฟล์ = <select data-avl-opt="noAs">${['submitted', 'proposed', 'rejected'].map((k) => `<option value="${k}"${k === st.noAs ? ' selected' : ''}>${esc(PM.AVL_STATUS[k].label)}</option>`).join('')}</select></label>
          ${n((r) => r.vendor && !r.approved) ? `<label class="imp-inline">ไม่ระบุ Yes/No = <select data-avl-opt="blankAs">${['proposed', 'submitted', 'approved'].map((k) => `<option value="${k}"${k === st.blankAs ? ' selected' : ''}>${esc(PM.AVL_STATUS[k].label)}</option>`).join('')}</select></label>` : ''}
          <label class="imp-inline"><input type="checkbox" data-avl-opt="keepOff"${st.keepOff ? ' checked' : ''}> เก็บรายการที่ถูกตัดออกไว้ด้วย (ซ่อนไว้ในแท็บ "ตัดออก")</label>
          ${plan.missing.length ? `<label class="imp-inline"><input type="checkbox" data-avl-opt="dropMissing"${st.dropMissing ? ' checked' : ''}> ตัดออก ${plan.missing.length} รายการเดิมที่ไม่มีในไฟล์นี้</label>` : ''}
        </div>
        <div class="imp-sum">
          ${U.badge('good', `เพิ่มใหม่ ${c('new')}`)} ${c('update') ? U.badge('info', `อัปเดต ${c('update')}`) : ''} ${c('same') ? U.badge('neutral', `เหมือนเดิม ${c('same')}`) : ''}
          ${c('dup') ? U.badge('neutral', `ซ้ำในไฟล์ ${c('dup')}`) : ''} ${c('skip') ? U.badge('neutral', `ไม่นำเข้า ${c('skip')}`) : ''}
          ${PM.common.seg('avlimp', [{ key: 'live', label: `ใช้ได้ (${n((r) => !r.removed)})` }, { key: 'flag', label: `มีสี (${n((r) => r.addl || r.coo)})` }, { key: 'off', label: `ตัดออก (${n((r) => r.removed)})` }, { key: 'all', label: `ทั้งหมด (${recs.length})` }], st.show)}
        </div>
        <div class="table-wrap imp-table"><table class="tbl avl-table avl-imp"><thead><tr><th></th><th>ผู้ขาย / ที่ตั้ง</th><th>ประเทศที่ผลิต</th><th>AVL</th><th>Remarks</th><th>ผล</th><th class="num">ที่มา</th></tr></thead><tbody>${body}</tbody></table>
          ${shown.length ? '' : '<p class="empty">ไม่มีรายการในมุมมองนี้</p>'}</div>`;
      keep.forEach(([el, top, left]) => { const t = el.classList && el.classList.contains('imp-table') ? work.querySelector('.imp-table') : el; if (t) { t.scrollTop = top; t.scrollLeft = left; } });
      submit.disabled = !willDo;
      submit.textContent = willDo ? `นำเข้า ${c('new') + c('update')} รายการ${st.dropMissing && plan.missing.length ? ` · ตัดออก ${plan.missing.length}` : ''}` : 'ไม่มีอะไรเปลี่ยน';
    }
    function load(sheets, source) {
      const usable = sheets.filter((s) => s.rows.some((r) => (r || []).some((v) => unmark(v).trim() !== '')));
      if (!usable.length) { U.alert('ไม่พบข้อมูลในไฟล์นี้'); return; }
      let best = 0, bestN = -1;
      usable.forEach((s, i) => { const r = A.parseGrid(s.rows, { fills: s.fills }); const k = (r.noHeader ? 0 : 1000) + r.records.length; if (k > bestN) { bestN = k; best = i; } });
      Object.assign(st, { source, sheets: usable, sheet: best });
      parse();
      draw();
    }
    async function takeFile(file) {
      if (!file) return;
      const isPdf = /\.pdf$/i.test(file.name || '') || file.type === 'application/pdf';
      work.innerHTML = `<p class="muted imp-note" aria-live="polite">${isPdf ? 'กำลังอ่าน PDF …' : 'กำลังอ่านไฟล์ …'}</p>`;
      const say = (i, total) => { const el = work.querySelector('.imp-note'); if (el) el.textContent = `กำลังอ่าน PDF หน้า ${i} / ${total} …`; };
      try { load(await A.readFile(file, say), file.name || 'ไฟล์'); } catch (e) { work.innerHTML = ''; U.alert(e.message || 'เปิดไฟล์ไม่สำเร็จ'); }
    }
    function run() {
      const plan = st.plan;
      if (!plan) return;
      const res = PM.avlApply(p, plan, opts());
      U.closeModal();
      const bits = [res.added ? `เพิ่ม ${res.added}` : '', res.updated ? `อัปเดต ${res.updated}` : '', res.dropped ? `ตัดออก ${res.dropped}` : ''].filter(Boolean);
      const m = U.modal({
        title: 'นำเข้า AVL แล้ว',
        body: `<p class="full" style="margin:0">${esc(bits.join(' · ') || 'ไม่มีอะไรเปลี่ยน')} — จาก ${esc(st.source)}</p>
          ${res.notes.length ? `<ul class="full imp-notes">${res.notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
          <div class="full"><button type="button" class="btn danger" data-imp-undo>ยกเลิกการนำเข้ารอบนี้</button></div>`,
      });
      m.querySelector('[data-imp-undo]').addEventListener('click', () => { res.undo(); U.closeModal(); U.toast('ยกเลิกการนำเข้าแล้ว'); done(); });
      done();
    }

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', () => { takeFile(input.files[0]); input.value = ''; });
    form.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('hot'); });
    form.addEventListener('dragleave', (e) => { if (!form.contains(e.relatedTarget)) drop.classList.remove('hot'); });
    form.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('hot'); takeFile(e.dataTransfer.files[0]); });
    form.addEventListener('paste', (e) => {
      if (e.target.matches('input, select, textarea')) return;
      const file = e.clipboardData.files && e.clipboardData.files[0];
      if (file) { e.preventDefault(); takeFile(file); return; }
      const text = e.clipboardData.getData('text/plain');
      if (text && text.trim()) { e.preventDefault(); load([{ name: 'ข้อมูลที่วาง', rows: PM.sheetImport.parseDelimited(text.replace(/\r?\n$/, '')) }], 'ข้อมูลที่วางจาก Excel'); }
    });
    work.addEventListener('click', (e) => {
      const seg = e.target.closest('[data-seg="avlimp"]');
      if (seg) { st.show = seg.dataset.val; draw(); }
    });
    work.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.avlSheet !== undefined) { st.sheet = Number(t.value); parse(); draw(); return; }
      if (t.dataset.avlPick !== undefined) { const i = Number(t.dataset.avlPick); if (t.checked) st.skip.delete(i); else st.skip.add(i); draw(); return; }
      const k = t.dataset.avlOpt;
      if (k) { st[k] = t.type === 'checkbox' ? t.checked : t.value; draw(); }
    });
    form.addEventListener('input', () => { delete form.dataset.dirty; });
    if (firstFile) takeFile(firstFile);
    setTimeout(() => drop.focus(), 0);
  };
})();
