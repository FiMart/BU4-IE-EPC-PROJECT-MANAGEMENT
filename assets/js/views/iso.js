/* iso.js — ระบบคุณภาพ ISO 9001 (#/settings/iso/<tab>): the records a QMS needs that the rest of the system does not already keep.
   The system keeps records and reminds people; it does not make the company compliant, and only a certification body certifies.
   Clause numbers follow ISO 9001:2015, whose certificates stay valid during the transition to ISO 9001:2026.
   One collection "qms", one row per record: { id, kind, files?, …fields of that kind }. Each kind below is one register:
     fields  [name, label, type, options]   type: text · textarea · date · number · select · person · vendor · project · clause · form
     cols    [header, x → plain text]       the table, the printed register and the Excel file
     state   (x, T) → { level, label }      the status badge
     alert   (x, T) → { level, title, sub, date } | null   a line in the bell (notify.js)
     check   (f, x) → what is missing       stops a save
     before  (x, f, old)                    worked-out fields, just before saving
   Audit trail (clause 7.5.3): table app_audit, written by the database on every change (supabase/data.sql). */
(function () {
  const U = PM.ui, esc = U.esc;
  const d = (s) => (s ? U.date(s) : '–');
  const ok = (label) => ({ level: 'good', label });
  const warn = (label) => ({ level: 'warning', label });
  const bad = (label) => ({ level: 'critical', label });
  const idle = (label) => ({ level: 'neutral', label });
  const addMonths = (s, n) => { const x = PM.parse(s); return PM.iso(new Date(x.getFullYear(), x.getMonth() + Number(n), x.getDate())); };
  const within = (s, T, days) => s && s >= T && PM.diffDays(T, s) <= days;
  const projCode = (id) => { const p = id && PM.find('projects', id); return p ? p.code : ''; };

  const CLAUSES = [
    ['4.1', 'บริบทขององค์กร'], ['4.2', 'ผู้มีส่วนได้ส่วนเสีย'], ['4.3', 'ขอบเขตระบบ'], ['4.4', 'กระบวนการ'], ['5.1', 'ภาวะผู้นำ'], ['5.2', 'นโยบายคุณภาพ'], ['5.3', 'บทบาทและอำนาจหน้าที่'],
    ['6.1', 'ความเสี่ยงและโอกาส'], ['6.2', 'วัตถุประสงค์คุณภาพ'], ['6.3', 'การเปลี่ยนแปลง'], ['7.1', 'ทรัพยากร'], ['7.2', 'ความสามารถ'], ['7.3', 'ความตระหนัก'], ['7.4', 'การสื่อสาร'], ['7.5', 'เอกสาร'],
    ['8.1', 'การวางแผนงาน'], ['8.2', 'ข้อกำหนดลูกค้า'], ['8.3', 'การออกแบบ'], ['8.4', 'ผู้ให้บริการภายนอก'], ['8.5', 'การดำเนินงาน'], ['8.6', 'การส่งมอบ'], ['8.7', 'งานไม่เป็นไปตามข้อกำหนด'],
    ['9.1', 'การติดตามและวัดผล'], ['9.2', 'การตรวจติดตามภายใน'], ['9.3', 'การทบทวนโดยฝ่ายบริหาร'], ['10.2', 'การปฏิบัติการแก้ไข'], ['10.3', 'การปรับปรุงต่อเนื่อง'],
    ['culture', 'ฉบับ 2026: วัฒนธรรมคุณภาพและจริยธรรม'],
  ];
  const clauseLabel = (c) => { const x = CLAUSES.find((y) => y[0] === c); return x ? (c === 'culture' ? x[1] : `${c} ${x[1]}`) : c || '–'; };

  /* printed forms that can carry a controlled number; the first keeps the number on the paper form it replaced */
  const FORMS = [['proposal-list', 'Proposal Status List'], ['ncr', 'ใบ NCR'], ['mom', 'บันทึกการประชุม (MOM)'], ['daily', 'รายงานประจำวัน'], ['avl', 'AVL'], ['transmittal', 'Transmittal'], ['punch', 'Punch List'], ['weekly', 'แผนงานรายสัปดาห์']];
  const FORM_DEFAULT = { 'proposal-list': { no: 'PS-IE-2026-001', rev: '01', issueDate: '2026-06-25', preparedBy: 'Engineering Department' } };
  const rows = (kind) => (PM.db.qms || []).filter((x) => x.kind === kind);
  PM.docInfo = (key) => {
    const x = rows('doc').find((r) => r.formKey === key && r.status === 'active');
    return x ? { no: x.no, rev: x.rev, issueDate: x.issueDate, preparedBy: x.preparedBy || '' } : FORM_DEFAULT[key] || null;
  };

  const opts = (o) => Object.keys(o).map((k) => ({ value: k, label: o[k] }));
  const SCORE = [{ value: '', label: '—' }, { value: '1', label: '1 — ต้องปรับปรุงมาก' }, { value: '2', label: '2 — ต่ำกว่าที่คาด' }, { value: '3', label: '3 — ตามที่คาด' }, { value: '4', label: '4 — ดี' }, { value: '5', label: '5 — ดีมาก' }];
  const LEVEL5 = ['1', '2', '3', '4', '5'];
  const DOC_STATUS = { draft: 'ร่าง', active: 'ใช้งาน', obsolete: 'ยกเลิกแล้ว' };
  const OPEN_CLOSED = { open: 'เปิดอยู่', closed: 'ปิดแล้ว' };
  const EFFECT = { '': '— ยังไม่ตรวจ —', yes: 'ได้ผล', no: 'ไม่ได้ผล — ต้องแก้ไขเพิ่ม' };
  const RTYPE = { risk: 'ความเสี่ยง', opportunity: 'โอกาส' };
  const FTYPE = { complaint: 'ข้อร้องเรียน', survey: 'แบบสำรวจความพึงพอใจ', compliment: 'คำชม' };
  const SRC = { audit: 'Internal audit', complaint: 'ข้อร้องเรียนลูกค้า', ncr: 'NCR ที่เกิดซ้ำ', review: 'ทบทวนโดยฝ่ายบริหาร', supplier: 'ผู้ขาย', other: 'อื่น ๆ' };
  const DECISION = { continue: 'ใช้ต่อ', watch: 'ใช้ต่อแบบเฝ้าระวัง', stop: 'หยุดใช้' };
  const supplierScore = (x) => { const v = ['quality', 'delivery', 'price', 'service'].map((k) => Number(x[k]) || 0); return v.every(Boolean) ? Math.round((PM.sum(v) / 20) * 100) : null; };
  const grade = (s) => (s == null ? '–' : s >= 80 ? 'A' : s >= 60 ? 'B' : 'C');
  const poOf = (vendor) => { const k = PM.normName(vendor); return (PM.db.pos || []).filter((p) => PM.normName(p.supplier || '') === k); };
  const closeNeeds = (f) => [!f.rootCause && 'สาเหตุ', !f.action && 'การแก้ไขไม่ให้เกิดซ้ำ', !f.verifiedBy && 'ผู้ตรวจสอบผล', f.effective !== 'yes' && 'ผลการแก้ไข = ได้ผล'].filter(Boolean);
  const objectiveMet = (x) => { if (x.actual === '' || x.actual == null || isNaN(Number(x.actual))) return null; return x.direction === '<=' ? Number(x.actual) <= Number(x.target) : Number(x.actual) >= Number(x.target); };

  const KINDS = {
    doc: {
      tab: 'เอกสาร', clause: '7.5', title: 'ทะเบียนเอกสารควบคุม', sub: 'นโยบาย คู่มือ ขั้นตอน แบบฟอร์ม และเอกสารภายนอก · เอกสารเลิกใช้ให้เปลี่ยนสถานะเป็น "ยกเลิกแล้ว" แทนการลบ', add: 'เพิ่มเอกสาร', files: true,
      name: (x) => `${x.no} ${x.title}`, defaults: { status: 'draft', rev: '00', docType: 'Procedure', retention: '' },
      fields: [['no', 'เลขที่เอกสาร', 'text', { required: true }], ['docType', 'ประเภท', 'select', { options: ['Policy', 'Manual', 'Procedure', 'Work Instruction', 'Form', 'External'] }], ['title', 'ชื่อเอกสาร', 'text', { required: true, full: true }],
        ['clause', 'ข้อกำหนดที่เกี่ยวข้อง', 'clause'], ['formKey', 'ใช้กับแบบฟอร์มที่พิมพ์จากระบบ', 'form'], ['rev', 'Revision', 'text', { required: true }], ['issueDate', 'วันที่ออก', 'date'], ['reviewDue', 'ทบทวนครั้งถัดไป', 'date'], ['retention', 'ระยะเวลาจัดเก็บ', 'text', { placeholder: 'เช่น 5 ปี' }],
        ['preparedBy', 'ผู้จัดทำ', 'text', { placeholder: 'ชื่อ หรือแผนก' }], ['approvedBy', 'ผู้อนุมัติ', 'person'], ['approvedDate', 'วันที่อนุมัติ', 'date'], ['status', 'สถานะ', 'select', { options: opts(DOC_STATUS) }], ['changeNote', 'สิ่งที่เปลี่ยนใน Revision นี้', 'textarea', { full: true, rows: 2 }]],
      cols: [['เลขที่', (x) => x.no], ['ชื่อเอกสาร', (x) => x.title], ['ประเภท', (x) => x.docType], ['ข้อกำหนด', (x) => clauseLabel(x.clause)], ['Rev.', (x) => x.rev], ['วันที่ออก', (x) => d(x.issueDate)], ['ทบทวนครั้งถัดไป', (x) => d(x.reviewDue)], ['ผู้อนุมัติ', (x) => x.approvedBy || '–'], ['จัดเก็บ', (x) => x.retention || '–']],
      state: (x, T) => (x.status === 'obsolete' ? idle('ยกเลิกแล้ว') : x.status === 'draft' ? warn('ร่าง') : x.reviewDue && x.reviewDue < T ? bad('เลยกำหนดทบทวน') : within(x.reviewDue, T, 30) ? warn('ใกล้ทบทวน') : ok('ใช้งาน')),
      alert: (x, T) => (x.status === 'active' && x.reviewDue && x.reviewDue < T ? { level: 'warning', title: `เอกสารเลยกำหนดทบทวน: ${x.no}`, sub: `${x.title} · กำหนด ${d(x.reviewDue)}`, date: x.reviewDue } : null),
      check: (f) => (f.status === 'active' && (!f.approvedBy || !f.issueDate) ? ['เอกสารที่ใช้งานต้องมีผู้อนุมัติและวันที่ออก'] : []),
      before: (x, f, old) => { if (old.rev !== undefined && old.rev !== f.rev) x.revLog = (x.revLog || []).concat({ rev: old.rev, date: old.issueDate || '', note: old.changeNote || '' }); },
      extra: (x) => ((x.revLog || []).length ? `<div class="full iso-log"><b>Revision ก่อนหน้า</b>${x.revLog.slice().reverse().map((r) => `<small>Rev. ${esc(r.rev)} · ${d(r.date)}${r.note ? ' · ' + esc(r.note) : ''}</small>`).join('')}</div>` : ''),
    },
    risk: {
      tab: 'ความเสี่ยง & โอกาส', clause: '6.1', title: 'ความเสี่ยงและโอกาสระดับองค์กร', sub: 'แยกความเสี่ยงกับโอกาส แต่ละรายการมีแผนและผู้รับผิดชอบ · ความเสี่ยงของแต่ละโครงการอยู่ที่แท็บความเสี่ยงของโครงการ', add: 'เพิ่มรายการ',
      name: (x) => x.title, defaults: { rtype: 'risk', likelihood: '3', impact: '3', status: 'open' },
      fields: [['rtype', 'ประเภท', 'select', { options: opts(RTYPE) }], ['process', 'กระบวนการ', 'text', { placeholder: 'เช่น จัดซื้อ, ออกแบบ' }], ['title', 'รายการ', 'text', { required: true, full: true }], ['likelihood', 'โอกาสเกิด (1–5)', 'select', { options: LEVEL5 }], ['impact', 'ผลกระทบ (1–5)', 'select', { options: LEVEL5 }],
        ['action', 'แผนจัดการ', 'textarea', { full: true, rows: 2 }], ['owner', 'ผู้รับผิดชอบ', 'person'], ['due', 'กำหนดเสร็จ', 'date'], ['effect', 'ผลของการจัดการ (ประเมินเมื่อทำแล้ว)', 'textarea', { full: true, rows: 2 }], ['status', 'สถานะ', 'select', { options: opts(OPEN_CLOSED) }]],
      cols: [['ประเภท', (x) => RTYPE[x.rtype]], ['รายการ', (x) => x.title], ['กระบวนการ', (x) => x.process || '–'], ['คะแนน', (x) => String(Number(x.likelihood) * Number(x.impact))], ['แผนจัดการ', (x) => x.action || '–'], ['ผู้รับผิดชอบ', (x) => x.owner || '–'], ['กำหนด', (x) => d(x.due)]],
      state: (x, T) => (x.status === 'closed' ? ok('ปิดแล้ว') : x.due && x.due < T ? bad('เลยกำหนด') : warn('เปิดอยู่')),
      alert: (x, T) => (x.status !== 'closed' && x.due && x.due < T ? { level: 'warning', title: `${RTYPE[x.rtype]}เลยกำหนด: ${x.title}`, sub: `ISO 6.1 · กำหนด ${d(x.due)}`, date: x.due, owner: x.owner } : null),
      check: (f) => (f.status === 'closed' && !f.effect ? ['ผลของการจัดการ'] : []),
    },
    objective: {
      tab: 'วัตถุประสงค์', clause: '6.2', title: 'วัตถุประสงค์คุณภาพ', sub: 'เป้าหมายที่วัดได้ ค่าจริงล่าสุด และแผนเพื่อให้ถึงเป้า', add: 'เพิ่มวัตถุประสงค์',
      name: (x) => x.title, defaults: { direction: '>=', unit: '%' },
      fields: [['title', 'วัตถุประสงค์', 'text', { required: true, full: true }], ['process', 'กระบวนการ', 'text'], ['owner', 'ผู้รับผิดชอบ', 'person'], ['direction', 'เกณฑ์', 'select', { options: [{ value: '>=', label: 'ไม่น้อยกว่า (≥)' }, { value: '<=', label: 'ไม่เกิน (≤)' }] }], ['target', 'เป้าหมาย', 'text', { required: true }], ['actual', 'ค่าจริงล่าสุด', 'text', { hint: 'เว้นว่าง = ยังไม่ได้วัด' }], ['unit', 'หน่วย', 'text'], ['measuredDate', 'วันที่วัดล่าสุด', 'date'], ['due', 'กำหนด', 'date'], ['plan', 'แผนเพื่อให้ถึงเป้า', 'textarea', { full: true, rows: 2 }]],
      cols: [['วัตถุประสงค์', (x) => x.title], ['กระบวนการ', (x) => x.process || '–'], ['เป้าหมาย', (x) => `${x.direction === '<=' ? '≤' : '≥'} ${x.target} ${x.unit || ''}`], ['ค่าจริง', (x) => (x.actual === '' || x.actual == null ? '–' : `${x.actual} ${x.unit || ''}`)], ['วัดล่าสุด', (x) => d(x.measuredDate)], ['ผู้รับผิดชอบ', (x) => x.owner || '–'], ['กำหนด', (x) => d(x.due)]],
      state: (x, T) => { const m = objectiveMet(x); return m === null ? idle('ยังไม่วัด') : m ? ok('ถึงเป้า') : x.due && x.due < T ? bad('ไม่ถึงเป้า') : warn('ยังไม่ถึงเป้า'); },
      check: (f) => [isNaN(Number(f.target)) && 'เป้าหมายต้องเป็นตัวเลข', f.actual !== '' && isNaN(Number(f.actual)) && 'ค่าจริงต้องเป็นตัวเลข'].filter(Boolean),
    },
    change: {
      tab: 'การเปลี่ยนแปลง', clause: '6.3', title: 'การเปลี่ยนแปลงระบบคุณภาพ', sub: 'วางแผน แจ้งผู้เกี่ยวข้อง ติดตาม และทบทวนผล · VO ของโครงการอยู่ที่แท็บ VO', add: 'เพิ่มการเปลี่ยนแปลง',
      name: (x) => x.title, defaults: { status: 'planned' },
      fields: [['title', 'การเปลี่ยนแปลง', 'text', { required: true, full: true }], ['reason', 'เหตุผล', 'textarea', { full: true, rows: 2 }], ['impact', 'ผลกระทบต่อระบบ', 'textarea', { full: true, rows: 2 }], ['plan', 'แผนและทรัพยากร', 'textarea', { full: true, rows: 2 }], ['communicated', 'แจ้งใคร / เมื่อไร', 'text', { full: true }], ['owner', 'ผู้รับผิดชอบ', 'person'], ['due', 'กำหนดเสร็จ', 'date'], ['reviewNote', 'ผลการทบทวนหลังเปลี่ยน', 'textarea', { full: true, rows: 2 }], ['status', 'สถานะ', 'select', { options: [{ value: 'planned', label: 'วางแผน' }, { value: 'doing', label: 'กำลังทำ' }, { value: 'done', label: 'เสร็จแล้ว' }] }]],
      cols: [['การเปลี่ยนแปลง', (x) => x.title], ['เหตุผล', (x) => x.reason || '–'], ['แจ้งแล้ว', (x) => x.communicated || '–'], ['ผู้รับผิดชอบ', (x) => x.owner || '–'], ['กำหนด', (x) => d(x.due)]],
      state: (x, T) => (x.status === 'done' ? ok('เสร็จแล้ว') : x.due && x.due < T ? bad('เลยกำหนด') : x.status === 'doing' ? warn('กำลังทำ') : idle('วางแผน')),
      alert: (x, T) => (x.status !== 'done' && x.due && x.due < T ? { level: 'warning', title: `การเปลี่ยนแปลงเลยกำหนด: ${x.title}`, sub: `ISO 6.3 · กำหนด ${d(x.due)}`, date: x.due, owner: x.owner } : null),
      check: (f) => (f.status === 'done' && !f.reviewNote ? ['ผลการทบทวนหลังเปลี่ยน'] : []),
    },
    training: {
      tab: 'อบรม', clause: '7.2', title: 'ความสามารถและการอบรม', sub: 'ประวัติอบรม ใบอนุญาต และวันหมดอายุของแต่ละคน พร้อมแนบใบรับรอง', add: 'เพิ่มประวัติ', files: true,
      name: (x) => `${x.person} · ${x.course}`, defaults: { ttype: 'อบรมภายนอก', result: 'pass' },
      fields: [['person', 'ชื่อพนักงาน', 'person', { required: true }], ['ttype', 'ประเภท', 'select', { options: ['อบรมภายใน', 'อบรมภายนอก', 'ใบอนุญาต / ใบรับรอง', 'สอนงาน (OJT)'] }], ['course', 'หลักสูตร / ความสามารถ', 'text', { required: true, full: true }], ['date', 'วันที่', 'date', { required: true }], ['expires', 'วันหมดอายุ', 'date'], ['provider', 'ผู้จัดอบรม', 'text'], ['result', 'ผล', 'select', { options: [{ value: 'pass', label: 'ผ่าน' }, { value: 'fail', label: 'ไม่ผ่าน' }] }], ['evaluation', 'การประเมินผลหลังอบรม', 'textarea', { full: true, rows: 2 }]],
      cols: [['ชื่อ', (x) => x.person], ['หลักสูตร', (x) => x.course], ['ประเภท', (x) => x.ttype], ['วันที่', (x) => d(x.date)], ['หมดอายุ', (x) => d(x.expires)], ['ผู้จัด', (x) => x.provider || '–']],
      state: (x, T) => (x.result === 'fail' ? bad('ไม่ผ่าน') : x.expires && x.expires < T ? bad('หมดอายุ') : within(x.expires, T, 60) ? warn('ใกล้หมดอายุ') : ok('ใช้ได้')),
      alert: (x, T) => (x.expires && x.expires < T ? { level: 'warning', title: `ใบรับรองหมดอายุ: ${x.person}`, sub: `${x.course} · ${d(x.expires)}`, date: x.expires, owner: x.person } : within(x.expires, T, 30) ? { level: 'info', title: `ใบรับรองใกล้หมดอายุ: ${x.person}`, sub: `${x.course} · ${d(x.expires)}`, date: x.expires, owner: x.person } : null),
    },
    cal: {
      tab: 'สอบเทียบ', clause: '7.1.5', title: 'เครื่องมือวัดและการสอบเทียบ', sub: 'กำหนดสอบเทียบครั้งถัดไปคำนวณจากรอบที่ตั้ง · ผลไม่ผ่าน: ระบุการประเมินผลวัดที่ผ่านมา', add: 'เพิ่มเครื่องมือ', files: true,
      name: (x) => `${x.no} ${x.equipment}`, defaults: { interval: 12, result: 'pass' },
      fields: [['no', 'รหัสเครื่องมือ (Tag)', 'text', { required: true }], ['serial', 'Serial No.', 'text'], ['equipment', 'เครื่องมือ', 'text', { required: true, full: true }], ['location', 'ที่อยู่ / ผู้ถือ', 'text'], ['range', 'ย่านวัด / ความละเอียด', 'text'], ['lastCal', 'สอบเทียบล่าสุด', 'date', { required: true }], ['interval', 'รอบสอบเทียบ (เดือน)', 'number', { min: 1, required: true }], ['provider', 'ห้องปฏิบัติการ', 'text'], ['certNo', 'เลขที่ใบรับรอง', 'text'], ['result', 'ผล', 'select', { options: [{ value: 'pass', label: 'ผ่าน' }, { value: 'fail', label: 'ไม่ผ่าน — ห้ามใช้' }] }], ['owner', 'ผู้รับผิดชอบ', 'person'], ['note', 'หมายเหตุ / การประเมินผลวัดที่ผ่านมา', 'textarea', { full: true, rows: 2 }]],
      cols: [['รหัส', (x) => x.no], ['เครื่องมือ', (x) => x.equipment], ['ที่อยู่', (x) => x.location || '–'], ['สอบเทียบล่าสุด', (x) => d(x.lastCal)], ['ครั้งถัดไป', (x) => d(x.nextDue)], ['ใบรับรอง', (x) => x.certNo || '–'], ['ผู้รับผิดชอบ', (x) => x.owner || '–']],
      state: (x, T) => (x.result === 'fail' ? bad('ไม่ผ่าน — ห้ามใช้') : x.nextDue && x.nextDue < T ? bad('เลยกำหนด') : within(x.nextDue, T, 30) ? warn('ใกล้ถึงกำหนด') : ok('ใช้ได้')),
      alert: (x, T) => (x.result === 'fail' ? { level: 'critical', title: `เครื่องมือไม่ผ่านสอบเทียบ: ${x.no}`, sub: `${x.equipment} — ห้ามใช้`, owner: x.owner } : x.nextDue && x.nextDue < T ? { level: 'critical', title: `เลยกำหนดสอบเทียบ: ${x.no}`, sub: `${x.equipment} · กำหนด ${d(x.nextDue)}`, date: x.nextDue, owner: x.owner } : within(x.nextDue, T, 30) ? { level: 'warning', title: `ต้องสอบเทียบใน 30 วัน: ${x.no}`, sub: `${x.equipment} · ${d(x.nextDue)}`, date: x.nextDue, owner: x.owner } : null),
      check: (f) => (f.result === 'fail' && !f.note ? ['การประเมินผลวัดที่ผ่านมา (เมื่อผลไม่ผ่าน)'] : []),
      before: (x, f) => { x.nextDue = addMonths(f.lastCal, f.interval); },
    },
    supplier: {
      tab: 'ประเมินผู้ขาย', clause: '8.4', title: 'การประเมินผู้ขาย', sub: 'คะแนนคุณภาพ · การส่งมอบ · ราคา · บริการ (เกรด A ≥ 80 · B ≥ 60 · C ต่ำกว่า 60) · AVL ที่ลูกค้าอนุมัติอยู่ที่แท็บ AVL ของโครงการ', add: 'เพิ่มผลประเมิน',
      name: (x) => `${x.vendor} ${d(x.date)}`, defaults: { decision: 'continue' },
      fields: [['vendor', 'ผู้ขาย', 'vendor', { required: true, full: true }], ['date', 'วันที่ประเมิน', 'date', { required: true }], ['evaluator', 'ผู้ประเมิน', 'person', { required: true }], ['quality', 'คุณภาพ', 'select', { options: SCORE, required: true }], ['delivery', 'การส่งมอบ', 'select', { options: SCORE, required: true }], ['price', 'ราคา', 'select', { options: SCORE, required: true }], ['service', 'บริการ', 'select', { options: SCORE, required: true }], ['decision', 'ผลการตัดสินใจ', 'select', { options: opts(DECISION) }], ['note', 'หมายเหตุ', 'textarea', { full: true, rows: 2 }]],
      cols: [['ผู้ขาย', (x) => x.vendor], ['วันที่', (x) => d(x.date)], ['คะแนน', (x) => { const s = supplierScore(x); return s == null ? '–' : `${s} (${grade(s)})`; }], ['PO ทั้งหมด / ส่งช้า', (x) => { const p = poOf(x.vendor); return `${p.length} / ${p.filter((y) => PM.poDaysLate(y, PM.today())).length}`; }], ['ผู้ประเมิน', (x) => x.evaluator || '–']],
      state: (x) => (x.decision === 'stop' ? bad(DECISION.stop) : x.decision === 'watch' ? warn(DECISION.watch) : ok(DECISION.continue)),
    },
    feedback: {
      tab: 'เสียงลูกค้า', clause: '9.1.2', title: 'ความพึงพอใจและข้อร้องเรียนของลูกค้า', sub: 'ผลสำรวจ ข้อร้องเรียน และการตอบกลับ · ข้อร้องเรียนร้ายแรงเปิด CAR ได้จากฟอร์ม', add: 'เพิ่มรายการ',
      name: (x) => `${x.customer} ${d(x.date)}`, defaults: { ftype: 'survey', status: 'open' }, openCar: (x) => ({ source: 'complaint', ref: x.customer, finding: x.detail }),
      fields: [['ftype', 'ประเภท', 'select', { options: opts(FTYPE) }], ['date', 'วันที่', 'date', { required: true }], ['customer', 'ลูกค้า', 'text', { required: true }], ['projectId', 'โครงการ', 'project'], ['score', 'คะแนนความพึงพอใจ', 'select', { options: SCORE }], ['owner', 'ผู้รับผิดชอบ', 'person'], ['detail', 'รายละเอียด', 'textarea', { full: true, rows: 2 }], ['response', 'การตอบกลับ / การแก้ไข', 'textarea', { full: true, rows: 2 }], ['due', 'กำหนดตอบกลับ', 'date'], ['status', 'สถานะ', 'select', { options: opts(OPEN_CLOSED) }]],
      cols: [['ประเภท', (x) => FTYPE[x.ftype]], ['วันที่', (x) => d(x.date)], ['ลูกค้า', (x) => x.customer], ['โครงการ', (x) => projCode(x.projectId) || '–'], ['คะแนน', (x) => x.score || '–'], ['รายละเอียด', (x) => x.detail || '–']],
      state: (x, T) => (x.status === 'closed' ? ok('ปิดแล้ว') : x.due && x.due < T ? bad('เลยกำหนดตอบกลับ') : warn('เปิดอยู่')),
      alert: (x, T) => (x.status !== 'closed' && x.ftype === 'complaint' ? { level: x.due && x.due < T ? 'critical' : 'warning', title: `ข้อร้องเรียนลูกค้า: ${x.customer}`, sub: `${x.detail || ''}${x.due ? ' · กำหนด ' + d(x.due) : ''}`, date: x.due, owner: x.owner } : null),
      check: (f) => (f.status === 'closed' && !f.response ? ['การตอบกลับ / การแก้ไข'] : []),
    },
    audit: {
      tab: 'ตรวจติดตามภายใน', clause: '9.2', title: 'การตรวจติดตามภายใน (Internal audit)', sub: 'แผนและผลการตรวจ · ผู้ตรวจต้องไม่ตรวจงานของตนเอง · สิ่งที่พบเปิด CAR ได้จากฟอร์ม', add: 'เพิ่มแผนตรวจ', files: true, auto: 'IA',
      name: (x) => `${x.no} ${x.scope}`, defaults: { status: 'planned' }, openCar: (x) => ({ source: 'audit', ref: x.no, finding: '' }),
      fields: [['no', 'เลขที่', 'text', { required: true }], ['clause', 'ข้อกำหนด', 'clause'], ['scope', 'ขอบเขต / กระบวนการที่ตรวจ', 'text', { required: true, full: true }], ['planDate', 'วันที่ตามแผน', 'date', { required: true }], ['doneDate', 'วันที่ตรวจจริง', 'date'], ['auditor', 'ผู้ตรวจ', 'person', { required: true }], ['auditee', 'ผู้รับการตรวจ', 'person', { required: true }], ['findings', 'จำนวนสิ่งที่ไม่เป็นไปตามข้อกำหนด', 'number', { min: 0 }], ['observations', 'จำนวนข้อสังเกต', 'number', { min: 0 }], ['result', 'สรุปผลการตรวจ', 'textarea', { full: true, rows: 3 }], ['status', 'สถานะ', 'select', { options: [{ value: 'planned', label: 'ตามแผน' }, { value: 'done', label: 'ตรวจแล้ว' }] }]],
      cols: [['เลขที่', (x) => x.no], ['ขอบเขต', (x) => x.scope], ['ข้อกำหนด', (x) => clauseLabel(x.clause)], ['ตามแผน', (x) => d(x.planDate)], ['ตรวจจริง', (x) => d(x.doneDate)], ['ผู้ตรวจ', (x) => x.auditor], ['ผู้รับการตรวจ', (x) => x.auditee], ['สิ่งที่พบ', (x) => String(x.findings || 0)]],
      state: (x, T) => (x.status === 'done' ? ok('ตรวจแล้ว') : x.planDate < T ? bad('เลยกำหนด') : idle('ตามแผน')),
      alert: (x, T) => (x.status !== 'done' && x.planDate < T ? { level: 'warning', title: `Internal audit เลยกำหนด: ${x.no}`, sub: `${x.scope} · แผน ${d(x.planDate)}`, date: x.planDate, owner: x.auditor } : null),
      check: (f) => [PM.normName(f.auditor) === PM.normName(f.auditee) && 'ผู้ตรวจต้องไม่ตรวจงานของตนเอง (ข้อ 9.2.2)', f.status === 'done' && !f.doneDate && 'วันที่ตรวจจริง', f.status === 'done' && !f.result && 'สรุปผลการตรวจ'].filter(Boolean),
    },
    car: {
      tab: 'CAR', clause: '10.2', title: 'การปฏิบัติการแก้ไข (CAR)', sub: 'ปัญหาระดับระบบจาก Audit ข้อร้องเรียน หรือแหล่งอื่น · ปิดได้เมื่อมีสาเหตุ การแก้ไข และผู้ตรวจสอบว่าได้ผล · NCR ของโครงการอยู่ที่แท็บ Quality', add: 'เปิด CAR', files: true, auto: 'CAR',
      name: (x) => `${x.no} ${x.finding || ''}`, defaults: { status: 'open', source: 'audit' },
      fields: [['no', 'เลขที่', 'text', { required: true }], ['date', 'วันที่เปิด', 'date', { required: true }], ['source', 'ที่มา', 'select', { options: opts(SRC) }], ['ref', 'อ้างอิง', 'text', { placeholder: 'เลข Audit / ลูกค้า / NCR' }], ['finding', 'สิ่งที่พบ', 'textarea', { required: true, full: true, rows: 2 }], ['correction', 'แก้ไขเฉพาะหน้า', 'textarea', { full: true, rows: 2 }], ['rootCause', 'สาเหตุ', 'textarea', { full: true, rows: 2 }], ['action', 'การแก้ไขไม่ให้เกิดซ้ำ', 'textarea', { full: true, rows: 2 }], ['owner', 'ผู้รับผิดชอบ', 'person'], ['due', 'กำหนดเสร็จ', 'date'], ['verifiedBy', 'ผู้ตรวจสอบผล', 'person'], ['verifiedDate', 'วันที่ตรวจสอบผล', 'date'], ['effective', 'ผลการแก้ไข', 'select', { options: opts(EFFECT) }], ['status', 'สถานะ', 'select', { options: opts(OPEN_CLOSED) }]],
      cols: [['เลขที่', (x) => x.no], ['เปิดเมื่อ', (x) => d(x.date)], ['ที่มา', (x) => `${SRC[x.source] || ''}${x.ref ? ' · ' + x.ref : ''}`], ['สิ่งที่พบ', (x) => x.finding], ['ผู้รับผิดชอบ', (x) => x.owner || '–'], ['กำหนด', (x) => d(x.due)], ['ตรวจสอบผล', (x) => (x.verifiedBy ? `${x.verifiedBy} ${d(x.verifiedDate)}` : '–')]],
      state: (x, T) => (x.status === 'closed' ? ok('ปิดแล้ว') : x.due && x.due < T ? bad('เลยกำหนด') : warn('เปิดอยู่')),
      alert: (x, T) => (x.status !== 'closed' && x.due && x.due < T ? { level: 'critical', title: `CAR เลยกำหนด: ${x.no}`, sub: `${x.finding || ''} · กำหนด ${d(x.due)}`, date: x.due, owner: x.owner } : null),
      check: (f, x) => (f.status === 'closed' && x.status !== 'closed' ? closeNeeds(f) : []),
      before: (x, f) => { if (f.status === 'closed' && !f.verifiedDate) x.verifiedDate = PM.today(); },
    },
    review: {
      tab: 'ทบทวนโดยฝ่ายบริหาร', clause: '9.3', title: 'การทบทวนโดยฝ่ายบริหาร', sub: 'วาระตามข้อ 9.3.2 และผลตามข้อ 9.3.3 · ใบที่พิมพ์มีตัวเลขสรุปจากระบบให้ด้วย', add: 'เพิ่มการประชุม', files: true, auto: 'MR',
      name: (x) => `${x.no} ${d(x.date)}`, defaults: { status: 'planned' },
      fields: [['no', 'เลขที่', 'text', { required: true }], ['date', 'วันที่ประชุม', 'date', { required: true }], ['chair', 'ประธาน', 'person', { required: true }], ['attendees', 'ผู้เข้าร่วม', 'text'], ['prevActions', 'สถานะ Action จากครั้งก่อน', 'textarea', { full: true, rows: 2 }], ['changes', 'ประเด็นภายในและภายนอกที่เปลี่ยนไป', 'textarea', { full: true, rows: 2 }], ['performance', 'ผลการดำเนินงาน (ลูกค้า วัตถุประสงค์ NCR Audit ผู้ขาย)', 'textarea', { full: true, rows: 2 }], ['resources', 'ความเพียงพอของทรัพยากร', 'textarea', { full: true, rows: 2 }], ['riskEffect', 'ประสิทธิผลของการจัดการความเสี่ยงและโอกาส', 'textarea', { full: true, rows: 2 }], ['opportunities', 'โอกาสในการปรับปรุง', 'textarea', { full: true, rows: 2 }], ['decisions', 'มติและ Action (ผลการทบทวน)', 'textarea', { full: true, rows: 3 }], ['nextDate', 'ประชุมครั้งถัดไป', 'date'], ['status', 'สถานะ', 'select', { options: [{ value: 'planned', label: 'ตามแผน' }, { value: 'done', label: 'ประชุมแล้ว' }] }]],
      cols: [['เลขที่', (x) => x.no], ['วันที่', (x) => d(x.date)], ['ประธาน', (x) => x.chair], ['มติ', (x) => x.decisions || '–'], ['ครั้งถัดไป', (x) => d(x.nextDate)]],
      state: (x, T) => (x.status === 'done' ? ok('ประชุมแล้ว') : x.date < T ? bad('เลยกำหนด') : idle('ตามแผน')),
      alert: (x, T) => (x.status !== 'done' && x.date < T ? { level: 'warning', title: `ทบทวนโดยฝ่ายบริหารเลยกำหนด: ${x.no}`, sub: `กำหนด ${d(x.date)}`, date: x.date, owner: x.chair } : null),
      check: (f) => (f.status === 'done' && !f.decisions ? ['มติและ Action'] : []),
    },
  };
  const TAB_ORDER = ['doc', 'risk', 'objective', 'change', 'training', 'cal', 'supplier', 'feedback', 'audit', 'review', 'car'];
  const nextNo = (prefix) => {
    const yy = PM.today().slice(2, 4), head = `${prefix}-${yy}-`;
    const max = (PM.db.qms || []).reduce((m, x) => (String(x.no || '').startsWith(head) ? Math.max(m, parseInt(String(x.no).slice(head.length), 10) || 0) : m), 0);
    return head + String(max + 1).padStart(3, '0');
  };

  /* ---------- bell ---------- */
  PM.qmsAlerts = function (T, myName) {
    const out = [];
    (PM.db.qms || []).forEach((x) => {
      const c = KINDS[x.kind], a = c && c.alert && c.alert(x, T);
      if (a) out.push({ id: `iso-${x.id}-${a.level}`, level: a.level, icon: 'quality', title: a.title, sub: a.sub, date: a.date, href: `#/settings/iso/${x.kind}`, topic: 'quality', mine: !!myName && !!a.owner && PM.normName(a.owner).includes(myName) });
    });
    return out;
  };

  /* ---------- clause by clause: what the system holds as evidence (it says "there are records", never "this conforms") ---------- */
  function matrix(T) {
    const db = PM.db, q = rows;
    const docs = (c) => q('doc').filter((x) => x.status === 'active' && x.clause === c).length;
    const docRow = (c, t) => ({ c, t, where: 'เอกสาร', href: '#/settings/iso/doc', n: docs(c), text: `เอกสาร ${docs(c)} ฉบับ` });
    const late = (k) => q(k).filter((x) => KINDS[k].state(x, T).level === 'critical').length;
    const reg = (k, t, c) => ({ c: c || KINDS[k].clause, t, where: KINDS[k].tab, href: `#/settings/iso/${k}`, n: q(k).length, text: `${q(k).length} รายการ${late(k) ? ` · ต้องแก้ ${late(k)}` : ''}`, level: late(k) ? 'critical' : null });
    const allItems = db.projects.flatMap((p) => p.phaseItems || []);
    const prjRisks = PM.sum(db.projects, (p) => (p.risks || []).length);
    const handed = db.bids.filter((b) => b.dates && b.dates.submit);
    const reviewed = handed.filter((b) => PM.propOf(b).reviewer).length;
    const noCause = db.ncrs.filter((n) => n.status === 'closed' && (!n.rootCause || !n.action)).length;
    const lastReview = q('review').filter((x) => x.status === 'done').map((x) => x.date).sort().pop();
    return [
      docRow('4.1', 'บริบทขององค์กร'), docRow('4.2', 'ผู้มีส่วนได้ส่วนเสีย'), docRow('4.3', 'ขอบเขตระบบคุณภาพ'), docRow('4.4', 'กระบวนการและการเชื่อมโยง'),
      docRow('5.1', 'ภาวะผู้นำ'), docRow('5.2', 'นโยบายคุณภาพ'),
      { c: '5.3', t: 'บทบาทและอำนาจหน้าที่', where: 'สิทธิ์ตาม Role', href: '#/help/roles', n: PM.ROLES.length, text: `${PM.ROLES.length} Role · ${Object.keys(PM.PERMISSIONS).length} สิทธิ์` },
      Object.assign(reg('risk', 'ความเสี่ยงและโอกาส'), { text: `องค์กร ${q('risk').length} · โครงการ ${prjRisks}`, n: q('risk').length + prjRisks }),
      reg('objective', 'วัตถุประสงค์คุณภาพ'), reg('change', 'การเปลี่ยนแปลง'), reg('cal', 'เครื่องมือวัด'), reg('training', 'ความสามารถ'),
      { c: '7.3', t: 'ความตระหนัก', where: 'เอกสาร · อบรม', href: '#/settings/iso/training', n: docs('7.3') + q('training').length, text: `เอกสาร ${docs('7.3')} · อบรม ${q('training').length}` },
      { c: '7.4', t: 'การสื่อสาร', where: 'MOM ของโครงการ', href: '#/projects', n: (db.meetings || []).length, text: `MOM ${(db.meetings || []).length} ฉบับ` },
      reg('doc', 'เอกสารควบคุม', '7.5'),
      { c: '7.5.3', t: 'ประวัติการแก้ไขข้อมูล', where: 'ประวัติการแก้ไข', href: '#/settings/iso/log', n: 1, text: 'บันทึกโดยฐานข้อมูล (ต้องรัน data.sql)', level: 'neutral', label: 'ตรวจที่แท็บประวัติ' },
      { c: '8.1', t: 'การวางแผนงาน', where: 'โครงการ · Weekly Plan', href: '#/projects', n: db.projects.length, text: `โครงการ ${db.projects.length} · แผนสัปดาห์ ${(db.plans || []).length}` },
      { c: '8.2', t: 'ทบทวนข้อกำหนดลูกค้าก่อนยื่น', where: 'ฟอร์ม Bid → Submit', href: '#/bidding/submit', n: handed.length, text: `ยื่นแล้ว ${handed.length} · มีการทบทวน ${reviewed}`, level: reviewed < handed.length ? 'warning' : null, label: reviewed < handed.length ? 'บางงานไม่มีการทบทวน' : null },
      { c: '8.3', t: 'การออกแบบ', where: 'ทะเบียนเอกสารออกแบบ', href: '#/projects', n: allItems.filter((x) => x.phase === 'engineering').length, text: `เอกสารออกแบบ ${allItems.filter((x) => x.phase === 'engineering').length}` },
      Object.assign(reg('supplier', 'ผู้ให้บริการภายนอก'), { text: `AVL ${(db.avl || []).length} · PO ${(db.pos || []).length} · ผลประเมิน ${q('supplier').length}` }),
      { c: '8.5', t: 'การดำเนินงาน', where: 'รายงานประจำวัน · Timeline', href: '#/projects', n: (db.dailies || []).length, text: `รายงานประจำวัน ${(db.dailies || []).length}` },
      { c: '8.6', t: 'การส่งมอบ', where: 'Punch List · เอกสารส่งมอบ', href: '#/projects', n: (db.punch || []).length + allItems.filter((x) => x.phase === 'closing').length, text: `Punch ${(db.punch || []).length} · เอกสารส่งมอบ ${allItems.filter((x) => x.phase === 'closing').length}` },
      { c: '8.7', t: 'งานไม่เป็นไปตามข้อกำหนด', where: 'Quality · NCR ของโครงการ', href: '#/projects', n: db.ncrs.length, text: `NCR ${db.ncrs.length} · เปิดอยู่ ${db.ncrs.filter((n) => n.status === 'open').length}${noCause ? ` · ปิดโดยไม่มีสาเหตุ ${noCause}` : ''}`, level: noCause ? 'warning' : null, label: noCause ? 'NCR เก่าขาดสาเหตุ' : null },
      { c: '9.1', t: 'การติดตามและวัดผล', where: 'Dashboard', href: '#/dashboard', n: 1, text: 'SPI · CPI · PPC · NCR · Win rate' },
      reg('feedback', 'ความพึงพอใจของลูกค้า'), reg('audit', 'การตรวจติดตามภายใน'),
      Object.assign(reg('review', 'การทบทวนโดยฝ่ายบริหาร'), { text: lastReview ? `ครั้งล่าสุด ${d(lastReview)}` : 'ยังไม่มีการประชุม', n: lastReview ? 1 : 0, level: lastReview && PM.diffDays(lastReview, T) > 365 ? 'warning' : null, label: lastReview && PM.diffDays(lastReview, T) > 365 ? 'เกิน 12 เดือน' : null }),
      Object.assign(reg('car', 'การปฏิบัติการแก้ไข'), { text: `CAR ${q('car').length} · เปิดอยู่ ${q('car').filter((x) => x.status !== 'closed').length}` }),
      { c: '10.3', t: 'การปรับปรุงต่อเนื่อง', where: 'CAR · มติที่ประชุม', href: '#/settings/iso/car', n: q('car').filter((x) => x.status === 'closed').length + q('review').filter((x) => x.decisions).length, text: `CAR ที่ปิด ${q('car').filter((x) => x.status === 'closed').length} · มติ ${q('review').filter((x) => x.decisions).length}` },
      { c: '2026', t: 'วัฒนธรรมคุณภาพและจริยธรรม', where: 'เอกสาร', href: '#/settings/iso/doc', n: docs('culture'), text: `เอกสาร ${docs('culture')} ฉบับ · หัวข้อใหม่ของฉบับ 2026` },
    ].map((r) => {
      const level = r.level || (r.n ? 'good' : 'warning');
      return Object.assign(r, { level, label: r.label || (level === 'critical' ? 'ต้องดำเนินการ' : r.n ? 'มีบันทึก' : 'ยังไม่มีบันทึก') });
    });
  }

  function overview(T) {
    const M = matrix(T), V = PM.common, count = (lv) => M.filter((r) => r.level === lv).length;
    const att = (k) => rows(k).filter((x) => KINDS[k].state(x, T).level === 'critical').length;
    const openCar = rows('car').filter((x) => x.status !== 'closed');
    const yr = T.slice(0, 4);
    return `<div class="callout">ระบบนี้เก็บบันทึกและเตือนงาน แต่ไม่ได้ทำให้บริษัทผ่านมาตรฐานโดยอัตโนมัติ · ใบรับรองออกโดยหน่วยรับรอง (Certification Body) เท่านั้น · เลขข้อตาม ISO 9001:2015 ซึ่งใบรับรองเดิมยังใช้ได้ระหว่างเปลี่ยนผ่านไปฉบับ 2026 — เลขข้อของฉบับใหม่ให้ตรวจกับตัวมาตรฐาน</div>
      <div class="grid cols-3">
        ${V.tile({ label: 'ข้อกำหนดที่มีบันทึก', value: `${count('good')} <small>/ ${M.length}</small>`, sub: `ยังไม่มีบันทึก ${M.filter((r) => !r.n).length} ข้อ`, icon: 'check' })}
        ${V.tile({ label: 'เอกสารที่ใช้งาน', value: rows('doc').filter((x) => x.status === 'active').length, sub: att('doc') ? U.badge('critical', `เลยกำหนด ${att('doc')}`) : 'ไม่มีเอกสารเลยกำหนด', icon: 'proposal' })}
        ${V.tile({ label: 'CAR เปิดอยู่', value: openCar.length, sub: att('car') ? U.badge('critical', `เลยกำหนด ${att('car')}`) : U.badge('good', 'ตามกำหนด'), icon: 'alert' })}
        ${V.tile({ label: 'สอบเทียบ', value: rows('cal').length, sub: att('cal') ? U.badge('critical', `ต้องแก้ ${att('cal')} เครื่อง`) : U.badge('good', 'ตามกำหนด'), icon: 'gauge' })}
        ${V.tile({ label: `Internal audit ปี ${yr}`, value: `${rows('audit').filter((x) => x.status === 'done' && String(x.doneDate).startsWith(yr)).length} <small>/ ${rows('audit').filter((x) => String(x.planDate).startsWith(yr)).length}</small>`, sub: 'ตรวจแล้ว / ตามแผน', icon: 'tasks' })}
        ${V.tile({ label: 'ข้อร้องเรียนที่เปิดอยู่', value: rows('feedback').filter((x) => x.ftype === 'complaint' && x.status !== 'closed').length, sub: 'จากเสียงลูกค้า', icon: 'people' })}
      </div>
      <div class="card"><div class="card-h"><h2>หลักฐานตามข้อกำหนด</h2><p>นับจากข้อมูลจริงในระบบ · "มีบันทึก" ไม่ได้แปลว่าผ่านข้อกำหนด ผู้ตรวจต้องดูเนื้อหาอีกครั้ง · คลิกแถวเพื่อเปิดหน้านั้น</p></div>
        <div class="card-b flush table-wrap"><table class="tbl iso-matrix"><thead><tr><th>ข้อ</th><th>หัวข้อ</th><th>อยู่ที่</th><th>หลักฐานในระบบ</th><th>สถานะ</th></tr></thead><tbody>
          ${M.map((r) => `<tr class="click" data-href="${esc(r.href)}"><td class="nowrap"><b>${esc(r.c)}</b></td><td>${esc(r.t)}</td><td>${esc(r.where)}</td><td>${esc(r.text)}</td><td>${U.badge(r.level, r.label)}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="card"><div class="card-h"><h2>สิ่งที่ระบบทำแทนไม่ได้</h2></div><div class="card-b"><ul class="iso-list">
        <li>กำหนดนโยบาย ขอบเขต และบริบทองค์กร แล้วอนุมัติโดยผู้บริหาร จากนั้นลงทะเบียนในแท็บเอกสาร</li>
        <li>ตรวจติดตามภายในจริงโดยผู้ตรวจที่ผ่านการอบรมและไม่ตรวจงานของตนเอง</li>
        <li>ประชุมทบทวนโดยฝ่ายบริหารจริง และตัดสินใจตามผลที่ได้</li>
        <li>เทียบเนื้อหาเอกสารกับตัวมาตรฐานฉบับที่บริษัทจะขอการรับรอง</li>
      </ul></div></div>`;
  }

  /* ---------- one register ---------- */
  const state = { q: '', logQ: '', logColl: '' };
  const matches = (c, x, T) => !state.q || c.cols.map((col) => col[1](x)).concat(c.state(x, T).label).join(' ').toLowerCase().includes(state.q.toLowerCase());
  const SORT = { cal: 'nextDue', doc: 'no', audit: 'planDate', review: 'date', training: 'date', car: 'date', feedback: 'date', supplier: 'date', risk: 'due', objective: 'title', change: 'due' };
  const sorted = (kind) => rows(kind).slice().sort((a, b) => {
    const k = SORT[kind], c = String(a[k] || '').localeCompare(String(b[k] || ''));
    return ['date', 'planDate'].includes(k) ? -c : c;
  });

  function register(kind, T) {
    const c = KINDS[kind], list = sorted(kind).filter((x) => matches(c, x, T));
    const need = rows(kind).filter((x) => c.state(x, T).level === 'critical').length;
    return `<div class="row">
        <input type="search" id="iso-q" placeholder="ค้นหา…" value="${esc(state.q)}" style="width:220px">
        <span class="muted">${list.length} รายการ${need ? ` · ต้องแก้ ${need}` : ''}</span>
        <span class="spacer"></span>
        <button class="btn" data-iso="print">🖨 พิมพ์ / PDF</button><button class="btn" data-iso="xlsx">Excel</button>
        ${PM.can('qms.edit') ? `<button class="btn primary fab" data-iso="new" aria-label="${esc(c.add)}"><span class="fab-i">+</span><span class="fab-t">${esc(c.add)}</span></button>` : ''}
      </div>
      <div class="card"><div class="card-h"><h2>${esc(c.title)}</h2><p>ISO 9001 ข้อ ${esc(c.clause)} · ${esc(c.sub)}</p></div>
        <div class="card-b flush table-wrap">${list.length ? `<table class="tbl iso-reg"><thead><tr>${c.cols.map((x) => `<th>${esc(x[0])}</th>`).join('')}<th>สถานะ</th>${c.files ? '<th class="num">ไฟล์</th>' : ''}</tr></thead><tbody>
          ${list.map((x) => { const s = c.state(x, T); return `<tr class="click" data-qms="${esc(x.id)}">${c.cols.map((col, i) => { const v = col[1](x); return `<td${!i && c.auto || /^\d{2} \S+ \d{2}$/.test(v) ? ' class="nowrap"' : ''}>${i ? esc(v) : `<span class="title">${esc(v)}</span>`}</td>`; }).join('')}<td>${U.badge(s.level, s.label)}</td>${c.files ? `<td class="num">${(x.files || []).length || '–'}</td>` : ''}</tr>`; }).join('')}
        </tbody></table>` : `<p class="empty">${rows(kind).length ? 'ไม่พบรายการ' : 'ยังไม่มีรายการ'}</p>`}</div></div>`;
  }

  /* ---------- form ---------- */
  const peopleList = () => `<datalist id="dl-iso-people">${PM.db.resources.filter((r) => r.active !== false).map((r) => `<option value="${esc(r.name)}">`).join('')}</datalist>`;
  const vendorList = () => { const names = new Set(); (PM.db.pos || []).forEach((p) => p.supplier && names.add(p.supplier)); (PM.db.avl || []).forEach((a) => a.vendor && names.add(a.vendor)); return `<datalist id="dl-iso-vendors">${Array.from(names).sort().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`; };
  function fieldHtml([name, label, type, o = {}], x) {
    const v = x[name] == null ? '' : x[name];
    if (type === 'person' || type === 'vendor') return `<label${o.full ? ' class="full"' : ''}><span>${esc(label)}</span><input name="${name}" list="${type === 'person' ? 'dl-iso-people' : 'dl-iso-vendors'}" value="${esc(v)}"${o.required ? ' required' : ''} autocomplete="off"></label>`;
    if (type === 'clause') return U.field(label, name, v, { options: CLAUSES.map(([c]) => ({ value: c, label: clauseLabel(c) })), placeholder: '—' });
    if (type === 'form') return U.field(label, name, v, { options: FORMS.map(([k, t]) => ({ value: k, label: t })), placeholder: '— ไม่ใช้ —' });
    if (type === 'project') return U.field(label, name, v, { options: PM.db.projects.map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })), placeholder: '—' });
    if (type === 'select') return U.field(label, name, v, Object.assign({}, o));
    return U.field(label, name, v, Object.assign({ type: type === 'text' ? undefined : type }, o));
  }

  function recordForm(kind, rec, done, prefill) {
    const c = KINDS[kind], isNew = !rec, T = PM.today(), canEdit = PM.can('qms.edit');
    const x = rec || Object.assign({ id: PM.uid('Q'), kind }, c.defaults, c.auto ? { no: nextNo(c.auto) } : {}, c.fields.some((f) => f[0] === 'date') ? { date: T } : {}, prefill || {});
    const form = U.modal({
      title: isNew ? c.add : c.name(x), wide: true,
      body: `${c.fields.map((f) => fieldHtml(f, x)).join('')}
        ${c.files ? PM.poFiles.boxHtml(canEdit, 'ไฟล์แนบ', 'หลักฐาน เช่น เอกสารฉบับที่อนุมัติ ใบรับรอง รายงาน') : ''}
        ${c.extra ? c.extra(x) : ''}
        ${isNew ? '' : `<div class="full row"><button type="button" class="btn sm" data-iso-print>🖨 พิมพ์รายการนี้</button>${c.openCar && canEdit ? '<button type="button" class="btn sm" data-iso-car>เปิด CAR จากรายการนี้</button>' : ''}</div>`}
        ${peopleList()}${c.fields.some((f) => f[2] === 'vendor') ? vendorList() : ''}`,
      deleteText: () => `ลบ "${c.name(x)}" และไฟล์แนบออกจากฐานข้อมูลถาวร\n\nISO 9001 ข้อ 7.5.3 กำหนดให้เก็บบันทึกตามระยะเวลา — ถ้าเลิกใช้แล้วควรเปลี่ยนสถานะแทนการลบ\nประวัติการแก้ไขยังบันทึกว่าใครลบรายการนี้เมื่อไร`,
      onDelete: !isNew && PM.can('qms.delete') ? async () => {
        await PM.poFiles.trash(`qms/${x.id}`, (x.files || []).map((f) => f.path));
        PM.remove('qms', x.id); U.toast('ลบแล้ว'); done();
      } : null,
      onSubmit: !canEdit ? null : (f, frm) => {
        const miss = c.check ? c.check(f, x) : [];
        if (miss.length) { U.alert(`บันทึกไม่ได้ — ${miss.join(' · ')}\n(ISO 9001 ข้อ ${c.clause})`); return false; }
        save(f, frm);
        return false;
      },
    });
    const files = c.files ? PM.poFiles.box(form, x.files, canEdit) : null;
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
    const pr = form.querySelector('[data-iso-print]');
    if (pr) pr.addEventListener('click', () => printRecord(kind, x));
    const car = form.querySelector('[data-iso-car]');
    if (car) car.addEventListener('click', () => { U.closeModal(); recordForm('car', null, done, c.openCar(x)); });

    async function save(f, frm) {
      const btn = frm.querySelector('[type=submit]');
      btn.disabled = true; btn.classList.add('loading');
      let problems = [];
      if (files) { const r = await files.commit(`qms/${x.id}`, btn); x.files = r.files; problems = r.problems; }
      const old = Object.assign({}, x);
      c.fields.forEach(([name]) => { x[name] = f[name]; });
      if (c.before) c.before(x, f, isNew ? {} : old);
      if (isNew) { x.createdAt = T; x.createdByName = PM.auth && PM.auth.user ? PM.auth.displayName(PM.auth.user) : ''; }
      PM.upsert('qms', x);
      U.closeModal();
      U.toast(problems.length ? 'บันทึกแล้ว แต่ไฟล์บางไฟล์มีปัญหา' : 'บันทึกแล้ว');
      if (problems.length) U.alert('ไฟล์ที่ไม่สำเร็จ:\n' + problems.join('\n'));
      done();
    }
  }

  /* ---------- printing ---------- */
  function printRegister(kind, T) {
    const c = KINDS[kind], P = PM.printDoc, win = P.open();
    if (!win) return;
    const list = sorted(kind).filter((x) => matches(c, x, T));
    P.write(win, {
      title: `${c.title} ${T}`, bar: c.title,
      head: { title: `<h1>${esc(c.title)}</h1><p>ISO 9001 ข้อ ${esc(c.clause)}</p>`, meta: `${esc(PM.COMPANY)}<br>ข้อมูล ณ ${d(T)}<br>${list.length} รายการ` },
      body: `<style>@page { size: A4 landscape; } main { max-width: 275mm; }</style><section class="flow">${P.tbl(c.cols.map((x) => x[0]).concat('สถานะ'), list.map((x) => c.cols.map((col) => esc(col[1](x))).concat(esc(c.state(x, T).label))), 'ยังไม่มีรายการ')}</section><div class="sign"><div>จัดทำโดย</div><div>ตรวจสอบโดย</div><div>อนุมัติโดย</div></div>`,
    });
  }
  function excelRegister(kind, T) {
    const c = KINDS[kind], list = sorted(kind).filter((x) => matches(c, x, T));
    PM.xport.excel({ filename: `iso-${kind}-${T}`, title: c.title, subtitle: `ISO 9001 ข้อ ${c.clause} · ${PM.COMPANY} · ${d(T)}`, sheets: [{ name: c.tab, columns: c.cols.map((x) => ({ header: x[0], width: 24 })).concat({ header: 'สถานะ', width: 18 }), rows: list.map((x) => c.cols.map((col) => col[1](x)).concat(c.state(x, T).label)) }] });
  }
  /* figures for management review (clause 9.3.2) as of the day it is printed */
  function reviewFigures(T) {
    const n = PM.db.ncrs, fb = rows('feedback').filter((x) => x.score), obj = rows('objective');
    const met = obj.filter((x) => objectiveMet(x) === true).length;
    return [['ความพึงพอใจลูกค้า (เฉลี่ย)', fb.length ? `${U.num(PM.sum(fb, (x) => Number(x.score)) / fb.length, 1)} / 5 จาก ${fb.length} รายการ` : 'ยังไม่มีข้อมูล'], ['ข้อร้องเรียนที่เปิดอยู่', String(rows('feedback').filter((x) => x.ftype === 'complaint' && x.status !== 'closed').length)],
      ['วัตถุประสงค์ที่ถึงเป้า', `${met} / ${obj.length}`], ['NCR ทั้งหมด / เปิดอยู่', `${n.length} / ${n.filter((x) => x.status === 'open').length}`], ['CAR ทั้งหมด / เปิดอยู่', `${rows('car').length} / ${rows('car').filter((x) => x.status !== 'closed').length}`],
      ['Internal audit ตรวจแล้ว / ทั้งหมด', `${rows('audit').filter((x) => x.status === 'done').length} / ${rows('audit').length}`], ['ผู้ขายเกรด C', String(rows('supplier').filter((x) => grade(supplierScore(x)) === 'C').length)], ['เครื่องมือเลยกำหนดสอบเทียบ', String(rows('cal').filter((x) => x.nextDue && x.nextDue < T).length)]];
  }
  function printRecord(kind, x) {
    const c = KINDS[kind], P = PM.printDoc, win = P.open(), T = PM.today();
    if (!win) return;
    const show = (f) => {
      const v = x[f[0]];
      if (f[2] === 'date') return d(v);
      if (f[2] === 'clause') return clauseLabel(v);
      if (f[2] === 'project') return projCode(v) || '–';
      if (f[2] === 'form') { const m = FORMS.find((y) => y[0] === v); return m ? m[1] : '–'; }
      if (f[2] === 'select' && f[3] && f[3].options) { const m = f[3].options.find((o) => (o.value !== undefined ? o.value : o) === v); return m ? m.label || m : v || '–'; }
      return v === '' || v == null ? '–' : String(v);
    };
    P.write(win, {
      title: c.name(x), bar: c.title,
      head: { title: `<h1>${esc(c.title)}</h1><p>ISO 9001 ข้อ ${esc(c.clause)}</p>`, meta: `${esc(PM.COMPANY)}<br>พิมพ์เมื่อ ${d(T)}<br>สถานะ: ${esc(c.state(x, T).label)}` },
      body: `<section><table><tbody>${c.fields.map((f) => `<tr><th style="width:30%">${esc(f[1])}</th><td>${esc(show(f)).replace(/\n/g, '<br>')}</td></tr>`).join('')}</tbody></table></section>
        ${kind === 'review' ? `<h2>ตัวเลขจากระบบ ณ วันที่พิมพ์</h2><section>${P.tbl(['รายการ', 'ค่า'], reviewFigures(T).map((r) => r.map(esc)))}</section>` : ''}
        ${(x.files || []).length ? `<h2>ไฟล์แนบ</h2><section><ul class="msg">${x.files.map((f) => `<li>${esc(f.name)}</li>`).join('')}</ul></section>` : ''}
        <div class="sign"><div>ผู้จัดทำ</div><div>ผู้ตรวจสอบ</div><div>ผู้อนุมัติ</div></div>`,
    });
  }
  function printMatrix(T) {
    const P = PM.printDoc, win = P.open();
    if (!win) return;
    const M = matrix(T);
    P.write(win, {
      title: `ISO 9001 Evidence ${T}`, bar: 'หลักฐานตามข้อกำหนด ISO 9001',
      head: { title: '<h1>หลักฐานตามข้อกำหนด ISO 9001</h1><p>เลขข้อตาม ISO 9001:2015 · นับจากข้อมูลในระบบ ไม่ใช่ผลการตรวจรับรอง</p>', meta: `${esc(PM.COMPANY)}<br>ข้อมูล ณ ${d(T)}` },
      body: `<section class="flow">${P.tbl(['ข้อ', 'หัวข้อ', 'อยู่ที่', 'หลักฐานในระบบ', 'สถานะ'], M.map((r) => [esc(r.c), esc(r.t), esc(r.where), esc(r.text), esc(r.label)]))}</section>`,
    });
  }

  /* ---------- audit trail (clause 7.5.3) — read from the database, never from this browser ---------- */
  const COLL_LABEL = { bids: 'งานประมูล', bidprices: 'ราคา Bid', projects: 'โครงการ', ncrs: 'NCR', safety: 'Safety', resources: 'บุคลากร', levels: 'Level', timesheets: 'Timesheet', plans: 'Weekly Plan', planrules: 'งานประจำ', pos: 'PO', costs: 'ค่าใช้จ่าย', prices: 'ราคาผู้ขาย', settings: 'ตั้งค่า', dailies: 'รายงานประจำวัน', punch: 'Punch List', meetings: 'MOM', avl: 'AVL', qms: 'ISO' };
  const ACT_LABEL = { insert: 'เพิ่ม', update: 'แก้ไข', delete: 'ลบ', replace_all: 'Reset / Import' };
  const ACT_LEVEL = { insert: 'good', update: 'info', delete: 'critical', replace_all: 'critical' };
  let logRows = null, logError = '';
  const logMatch = (r) => (!state.logColl || r.collection === state.logColl) && (!state.logQ || [r.actor_name, r.label, r.record_id, (r.fields || []).join(' ')].join(' ').toLowerCase().includes(state.logQ.toLowerCase()));
  const atText = (s) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  async function loadLog(redraw) {
    const client = PM.auth && PM.auth.client;
    if (!client || typeof client.from !== 'function') { logRows = []; logError = 'ดูประวัติได้เมื่อเชื่อมต่อ Cloud (Supabase)'; redraw(); return; }
    const { data, error } = await client.from('app_audit').select('at, actor_name, action, collection, record_id, label, fields').order('at', { ascending: false }).limit(1000);
    logRows = data || []; logError = error ? 'อ่านประวัติไม่ได้ — ให้ Admin รัน supabase/data.sql อีกครั้ง 1 ครั้ง' : '';
    redraw();
  }
  function logTab() {
    if (!PM.can('qms.audit')) return `<p class="perm-note">ประวัติการแก้ไขดูได้เฉพาะ ${esc(PM.whoCan('qms.audit'))}</p>`;
    if (logRows === null) return '<p class="empty">กำลังโหลดประวัติ…</p>';
    if (logError) return `<div class="callout">${esc(logError)}</div>`;
    const list = logRows.filter(logMatch), colls = Array.from(new Set(logRows.map((r) => r.collection).filter(Boolean))).sort();
    return `<div class="row">
        <input type="search" id="iso-log-q" placeholder="ค้นหาชื่อ / รายการ…" value="${esc(state.logQ)}" style="width:220px">
        <select id="iso-log-coll" style="width:auto"><option value="">ทุกชนิดข้อมูล</option>${colls.map((c) => `<option value="${esc(c)}"${state.logColl === c ? ' selected' : ''}>${esc(COLL_LABEL[c] || c)}</option>`).join('')}</select>
        <span class="muted">${list.length} รายการล่าสุด</span><span class="spacer"></span>
        <button class="btn" data-iso="log-xlsx">Excel</button>
      </div>
      <div class="card"><div class="card-h"><h2>ประวัติการแก้ไขข้อมูล</h2><p>ISO 9001 ข้อ 7.5.3 · ฐานข้อมูลบันทึกเองทุกครั้ง ผู้ใช้แก้หรือลบประวัตินี้ไม่ได้ · เก็บเฉพาะชื่อช่องที่เปลี่ยน ไม่เก็บค่า และไม่บันทึกราคา</p></div>
        <div class="card-b flush table-wrap">${list.length ? `<table class="tbl"><thead><tr><th>เวลา</th><th>ผู้ทำ</th><th>การกระทำ</th><th>ชนิด</th><th>รายการ</th><th>ช่องที่เปลี่ยน</th></tr></thead><tbody>
          ${list.slice(0, 300).map((r) => `<tr><td class="nowrap">${esc(atText(r.at))}</td><td>${esc(r.actor_name || 'ระบบ / SQL')}</td><td>${U.badge(ACT_LEVEL[r.action] || 'neutral', ACT_LABEL[r.action] || r.action)}</td><td>${esc(COLL_LABEL[r.collection] || r.collection || '–')}</td><td>${esc(r.label || r.record_id || '–')}</td><td>${esc((r.fields || []).slice(0, 8).join(', '))}${(r.fields || []).length > 8 ? ' …' : ''}</td></tr>`).join('')}
        </tbody></table>` : '<p class="empty">ยังไม่มีประวัติ</p>'}</div></div>`;
  }

  /* ---------- the Settings section (settings.js): el = its box, sub = the tab in the address ---------- */
  PM.isoSection = function (el, sub) {
    const key = KINDS[sub] || sub === 'log' ? sub : 'overview', T = PM.today();
    const need = (k) => rows(k).filter((x) => KINDS[k].state(x, T).level === 'critical').length;
    const tabs = [{ key: 'overview', label: 'ภาพรวม', href: '#/settings/iso' }]
      .concat(TAB_ORDER.map((k) => ({ key: k, label: KINDS[k].tab, href: `#/settings/iso/${k}`, n: need(k) })))
      .concat(PM.can('qms.audit') ? [{ key: 'log', label: 'ประวัติการแก้ไข', href: '#/settings/iso/log' }] : []);
    const draw = () => {
      el.innerHTML = `<nav class="tabs bid-tabs iso-tabs" aria-label="ISO 9001">${tabs.map((t) => `<a href="${t.href}" class="${t.key === key ? 'active' : ''}"${t.key === key ? ' aria-current="page"' : ''}><span>${esc(t.label)}</span>${t.n ? `<em class="count">${t.n}</em>` : ''}</a>`).join('')}</nav>
        ${key === 'overview' ? `<div class="row"><a class="btn" href="#/help/iso">คู่มือ ISO 9001</a><span class="spacer"></span><button class="btn" data-iso="matrix-print">🖨 พิมพ์สรุปหลักฐาน</button></div>${overview(T)}` : key === 'log' ? logTab() : register(key, T)}`;
      bindInputs();
    };
    const keepFocus = (id) => { const i = el.querySelector(id); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
    const bindInputs = () => {
      const q = el.querySelector('#iso-q');
      if (q) q.addEventListener('input', () => { state.q = q.value; clearTimeout(state.t); state.t = setTimeout(() => { draw(); keepFocus('#iso-q'); }, 250); });
      const lq = el.querySelector('#iso-log-q');
      if (lq) lq.addEventListener('input', () => { state.logQ = lq.value; clearTimeout(state.t); state.t = setTimeout(() => { draw(); keepFocus('#iso-log-q'); }, 250); });
      const lc = el.querySelector('#iso-log-coll');
      if (lc) lc.addEventListener('change', () => { state.logColl = lc.value; draw(); });
    };
    if (key === 'log' && PM.can('qms.audit')) { logRows = null; loadLog(() => { if (location.hash === '#/settings/iso/log') draw(); }); }
    draw();
    el.onclick = (e) => {
      const act = e.target.closest('[data-iso]');
      if (act) {
        const a = act.dataset.iso;
        if (a === 'new') recordForm(key, null, () => PM.render());
        if (a === 'print') printRegister(key, T);
        if (a === 'xlsx') excelRegister(key, T);
        if (a === 'matrix-print') printMatrix(T);
        if (a === 'log-xlsx') PM.xport.excel({ filename: `audit-trail-${T}`, title: 'ประวัติการแก้ไขข้อมูล', subtitle: `${PM.COMPANY} · ${d(T)}`, sheets: [{ name: 'Audit trail', columns: [{ header: 'เวลา', width: 20 }, { header: 'ผู้ทำ', width: 22 }, { header: 'การกระทำ', width: 12 }, { header: 'ชนิด', width: 16 }, { header: 'รหัส', width: 18 }, { header: 'รายการ', width: 40 }, { header: 'ช่องที่เปลี่ยน', width: 40 }], rows: logRows.filter(logMatch).map((r) => [atText(r.at), r.actor_name || 'ระบบ / SQL', ACT_LABEL[r.action] || r.action, COLL_LABEL[r.collection] || r.collection, r.record_id, r.label, (r.fields || []).join(', ')]) }] });
        return;
      }
      const hr = e.target.closest('tr[data-href]');
      if (hr) { location.hash = hr.dataset.href; return; }
      const row = e.target.closest('tr[data-qms]');
      if (row) recordForm(key, PM.find('qms', row.dataset.qms), () => PM.render());
    };
  };

  /* ---------- demo data ---------- */
  PM.buildSampleQms = function (db, T) {
    const name = (i) => (db.resources[i % db.resources.length] || {}).name || 'พนักงาน';
    const vendor = (i) => { const v = Array.from(new Set((db.pos || []).map((p) => p.supplier).filter(Boolean))); return v[i % Math.max(1, v.length)] || 'Thai Cable Industry Co., Ltd.'; };
    const y = T.slice(2, 4);
    let n = 0;
    const mk = (kind, o) => Object.assign({ id: `Q${++n}`, kind, createdAt: T }, o);
    const doc = (no, title, docType, clause, rev, formKey, ago) => mk('doc', { no, title, docType, clause, rev, formKey: formKey || '', issueDate: PM.addDays(T, -ago), reviewDue: PM.addDays(T, 365 - ago), retention: '5 ปี', preparedBy: 'Engineering Department', approvedBy: name(0), approvedDate: PM.addDays(T, -ago), status: 'active', changeNote: '' });
    return [
      doc('QM-01', 'คู่มือคุณภาพและขอบเขตระบบ', 'Manual', '4.3', '02', '', 200), doc('QP-01', 'นโยบายคุณภาพ', 'Policy', '5.2', '01', '', 200), doc('QP-02', 'ขั้นตอนการควบคุมเอกสาร', 'Procedure', '7.5', '01', '', 400),
      doc('QP-07', 'ขั้นตอนการจัดการงานไม่เป็นไปตามข้อกำหนด', 'Procedure', '8.7', '00', '', 120), doc('FM-07-01', 'ใบ NCR', 'Form', '8.7', '00', 'ncr', 120), Object.assign(doc('PS-IE-2026-001', 'Proposal Status List', 'Form', '8.2', '01', 'proposal-list', 130), { issueDate: FORM_DEFAULT['proposal-list'].issueDate }),
      mk('risk', { rtype: 'risk', process: 'จัดซื้อ', title: 'ผู้ขายเครื่องมือวัดหลักมีรายเดียว ส่งของล่าช้าอาจกระทบหลายโครงการ', likelihood: '3', impact: '4', action: 'หาผู้ขายสำรองและขออนุมัติเข้า AVL', owner: name(1), due: PM.addDays(T, 45), status: 'open' }),
      mk('risk', { rtype: 'opportunity', process: 'ออกแบบ', title: 'ใช้แบบมาตรฐาน Metering Skid ลดเวลาทำ Proposal', likelihood: '4', impact: '3', action: 'จัดทำชุดแบบมาตรฐาน 3 ขนาด', owner: name(2), due: PM.addDays(T, 90), status: 'open' }),
      mk('objective', { title: 'ยื่นข้อเสนอตรงเวลา', process: 'Bidding', direction: '>=', target: '95', actual: '92', unit: '%', measuredDate: PM.addDays(T, -6), due: PM.addDays(T, 60), owner: name(3), plan: 'ทบทวนงานที่ Due ภายใน 5 วันทุกสัปดาห์' }),
      mk('objective', { title: 'ปิด NCR ภายใน 30 วัน', process: 'ก่อสร้าง', direction: '>=', target: '90', actual: '94', unit: '%', measuredDate: PM.addDays(T, -6), due: PM.addDays(T, 60), owner: name(4), plan: 'ติดตาม NCR ในประชุมประจำสัปดาห์' }),
      mk('change', { title: 'ย้ายทะเบียน Proposal จาก Excel มาไว้ในระบบ', reason: 'ลดการมีหลายฉบับ', impact: 'แบบฟอร์ม PS-IE-2026-001', plan: 'อบรมทีมและใช้คู่กัน 1 เดือน', communicated: 'ทีม Engineering และ Sales ในที่ประชุม', owner: name(1), due: PM.addDays(T, 30), status: 'doing' }),
      mk('training', { person: name(2), ttype: 'อบรมภายนอก', course: 'ผู้ตรวจติดตามภายใน ISO 9001', date: PM.addDays(T, -150), expires: '', provider: 'สถาบันฝึกอบรม', result: 'pass', evaluation: 'ตรวจติดตามภายในได้ 1 รอบ' }),
      mk('training', { person: name(4), ttype: 'ใบอนุญาต / ใบรับรอง', course: 'ความปลอดภัยการทำงานในที่อับอากาศ', date: PM.addDays(T, -700), expires: PM.addDays(T, 25), provider: 'สถาบันความปลอดภัย', result: 'pass', evaluation: '' }),
      mk('cal', { no: 'CAL-PG-01', equipment: 'Pressure Calibrator', serial: 'PC-2211', location: 'ห้องเครื่องมือ', range: '0–100 bar', lastCal: PM.addDays(T, -360), interval: 12, nextDue: addMonths(PM.addDays(T, -360), 12), provider: 'ห้องปฏิบัติการสอบเทียบ', certNo: `C-${y}-0412`, result: 'pass', owner: name(3) }),
      mk('cal', { no: 'CAL-MM-03', equipment: 'Digital Multimeter', serial: 'DM-8841', location: 'ทีมหน้างาน', range: '1000 V', lastCal: PM.addDays(T, -390), interval: 12, nextDue: addMonths(PM.addDays(T, -390), 12), provider: 'ห้องปฏิบัติการสอบเทียบ', certNo: `C-${y}-0188`, result: 'pass', owner: name(4) }),
      mk('cal', { no: 'CAL-TT-02', equipment: 'Temperature Calibrator', serial: 'TC-1190', location: 'ห้องเครื่องมือ', range: '-20–150 °C', lastCal: PM.addDays(T, -90), interval: 12, nextDue: addMonths(PM.addDays(T, -90), 12), provider: 'ห้องปฏิบัติการสอบเทียบ', certNo: `C-${y}-0733`, result: 'pass', owner: name(3) }),
      mk('supplier', { vendor: vendor(0), date: PM.addDays(T, -60), evaluator: name(1), quality: '4', delivery: '4', price: '3', service: '4', decision: 'continue' }),
      mk('supplier', { vendor: vendor(1), date: PM.addDays(T, -60), evaluator: name(1), quality: '3', delivery: '2', price: '3', service: '2', decision: 'watch', note: 'ส่งของล่าช้าหลายครั้ง' }),
      mk('feedback', { ftype: 'survey', date: PM.addDays(T, -40), customer: db.projects[0] ? db.projects[0].client : 'ลูกค้า', projectId: db.projects[0] ? db.projects[0].id : '', score: '4', detail: 'พึงพอใจการประสานงาน', response: 'แจ้งทีมแล้ว', status: 'closed', owner: name(1) }),
      mk('feedback', { ftype: 'complaint', date: PM.addDays(T, -5), customer: db.projects[1] ? db.projects[1].client : 'ลูกค้า', projectId: db.projects[1] ? db.projects[1].id : '', score: '2', detail: 'เอกสารส่งมอบล่าช้ากว่าที่ตกลง', response: '', due: PM.addDays(T, 9), status: 'open', owner: name(1) }),
      mk('audit', { no: `IA-${y}-001`, clause: '7.5', scope: 'การควบคุมเอกสารโครงการ', planDate: PM.addDays(T, -50), doneDate: PM.addDays(T, -48), auditor: name(2), auditee: name(5), findings: 1, observations: 2, result: 'พบเอกสารหน้างานใช้ Revision เก่า 1 รายการ', status: 'done' }),
      mk('audit', { no: `IA-${y}-002`, clause: '8.4', scope: 'การจัดซื้อและการประเมินผู้ขาย', planDate: PM.addDays(T, 40), doneDate: '', auditor: name(2), auditee: name(1), findings: 0, observations: 0, result: '', status: 'planned' }),
      mk('car', { no: `CAR-${y}-001`, date: PM.addDays(T, -47), source: 'audit', ref: `IA-${y}-001`, finding: 'เอกสารหน้างานใช้ Revision เก่า', correction: 'เปลี่ยนเอกสารเป็น Revision ล่าสุด', rootCause: 'ไม่มีขั้นตอนเรียกคืนเอกสารเก่าจากหน้างาน', action: 'เพิ่มขั้นตอนเรียกคืนใน QP-02 และอบรมทีม', owner: name(5), due: PM.addDays(T, -10), verifiedBy: name(2), verifiedDate: PM.addDays(T, -12), effective: 'yes', status: 'closed' }),
      mk('car', { no: `CAR-${y}-002`, date: PM.addDays(T, -5), source: 'complaint', ref: db.projects[1] ? db.projects[1].client : '', finding: 'เอกสารส่งมอบล่าช้ากว่าที่ตกลง', owner: name(1), due: PM.addDays(T, 25), effective: '', status: 'open' }),
      mk('review', { no: `MR-${y}-001`, date: PM.addDays(T, -120), chair: name(0), attendees: `${name(1)}, ${name(2)}, ${name(3)}`, prevActions: 'ปิดครบทุกข้อ', changes: 'ISO 9001 ฉบับ 2026 ออกใหม่ ต้องวางแผนเปลี่ยนผ่าน', performance: 'ดูตัวเลขจากระบบในใบที่พิมพ์', resources: 'เพียงพอ', riskEffect: 'แผนจัดการเป็นไปตามกำหนด', opportunities: 'แบบมาตรฐาน Metering Skid', decisions: 'จัดตั้งทีมเปลี่ยนผ่านและรายงานในการประชุมครั้งถัดไป', nextDate: PM.addDays(T, 60), status: 'done' }),
    ];
  };
})();
