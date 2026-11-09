/* purge.js — deleting for good. A delete removes the record, everything that belongs to it and its files:
   nothing is hidden or kept. Removing them from PM.db is what removes them from the database (cloud.js sends the
   difference); the same cascade also runs on the server (trigger app_records_cascade, supabase/data.sql), so rows this
   role may not write itself — another person's Weekly Plan task, Timesheets, the price of a bid — go as well.
   Files are removed first: the database decides who may list them from rows that are about to go.
     project → NCR · Safety · PO · expenses · AVL · Punch List · MOM · Daily Report · its Timesheet hours · its Weekly Plan tasks · files
     bid     → price row · its Timesheet hours · its Weekly Plan tasks · quotation and working files (the project made from it stays)
     person  → their Timesheets · Weekly Plan tasks only they are on (they leave the shared ones)
     PO      → files (expenses paid against it stay: they are money spent; they only lose the link) */
(function () {
  const U = PM.ui;
  const PROJECT_DATA = [['ncrs', 'NCR'], ['safety', 'Safety'], ['pos', 'PO'], ['costs', 'ค่าใช้จ่าย'], ['avl', 'AVL'], ['punch', 'Punch List'], ['meetings', 'MOM'], ['dailies', 'รายงานประจำวัน']];
  const db = () => PM.db;
  const list = (c) => db()[c] || [];
  const worksOn = (kind, id) => (t) => t.kind === kind && t.refId === id;
  const isFile = (x) => x && typeof x === 'object' && typeof x.path === 'string' && typeof x.name === 'string';
  /* every file a record points to (used if the database cannot list the folder) */
  function filePaths(x, out = []) {
    if (isFile(x)) out.push(x.path);
    else if (Array.isArray(x)) x.forEach((y) => filePaths(y, out));
    else if (x && typeof x === 'object') Object.keys(x).forEach((k) => filePaths(x[k], out));
    return out;
  }
  const n = (a) => U.num(a.length);
  const summary = (rows) => { const t = rows.filter(([, count]) => count).map(([label, count]) => `${label} ${U.num(count)}`); return t.length ? t.join(' · ') : 'ไม่มีข้อมูลอื่น'; };
  const NOTE = 'ลบออกจากฐานข้อมูลถาวร กู้คืนไม่ได้ — แนะนำให้ Export JSON เก็บไว้ก่อน';

  PM.purge = {
    projectText(p) {
      const rows = PROJECT_DATA.map(([c, label]) => [label, list(c).filter((x) => x.projectId === p.id).length]);
      rows.push(['Timesheet', list('timesheets').filter(worksOn('project', p.id)).length], ['งาน Weekly Plan', list('plans').filter(worksOn('project', p.id)).length]);
      return `ลบโครงการ ${p.code} พร้อมข้อมูลทั้งหมดของโครงการ:\n${summary(rows)} · ไฟล์แนบทุกไฟล์\n\nชั่วโมง Timesheet ของโครงการนี้จะหายจาก Utilization ย้อนหลังด้วย\nISO 9001: บันทึกต้องเก็บตามระยะเวลาที่กำหนด — โครงการที่จบแล้วให้เปลี่ยนสถานะเป็น Closed แทนการลบ\n${NOTE}`;
    },
    async project(p) {
      const id = p.id;
      await PM.poFiles.trash(id, filePaths([p].concat(...PROJECT_DATA.map(([c]) => list(c).filter((x) => x.projectId === id)))));
      const d = db();
      PROJECT_DATA.forEach(([c]) => { d[c] = list(c).filter((x) => x.projectId !== id); });
      d.timesheets = list('timesheets').filter((t) => !worksOn('project', id)(t));
      d.plans = list('plans').filter((x) => !worksOn('project', id)(x));
      d.planrules = list('planrules').filter((x) => !worksOn('project', id)(x));
      d.projfin = list('projfin').filter((x) => x.id !== id); // the database removes it too (data.sql cascade)
      list('bids').forEach((b) => { if (b.projectId === id) delete b.projectId; }); // the bid can make a new project
      d.projects = list('projects').filter((x) => x.id !== id);
      PM.save();
    },

    bidText(b) {
      const rows = [['Timesheet', list('timesheets').filter(worksOn('bid', b.id)).length], ['งาน Weekly Plan', list('plans').filter(worksOn('bid', b.id)).length]];
      return `ลบงานประมูล ${PM.dash(b.code)} พร้อมราคา ไฟล์ใบเสนอราคา ไฟล์งานของทีม และ:\n${summary(rows)}\n\n${NOTE}`;
    },
    async bid(b) {
      const id = b.id;
      await PM.poFiles.trash(`bids/${id}`, filePaths(b.files || []));
      await PM.poFiles.trash(`bidwork/${id}`, filePaths(b.workFiles || []));
      const d = db();
      d.timesheets = list('timesheets').filter((t) => !worksOn('bid', id)(t));
      d.plans = list('plans').filter((x) => !worksOn('bid', id)(x));
      d.planrules = list('planrules').filter((x) => !worksOn('bid', id)(x));
      list('projects').forEach((p) => { if (p.bidId === id) p.bidId = null; });
      d.bids = list('bids').filter((x) => x.id !== id);
      PM.save();
    },

    personText(r) {
      const own = list('timesheets').filter((t) => t.resourceId === r.id);
      const plans = list('plans').filter((x) => PM.planHas(x, r.id));
      return `ลบ ${r.name} ออกจากระบบ พร้อม:\n${summary([['Timesheet / OT', own.length], ['ชั่วโมงรวม', Math.round(PM.sum(own, (t) => Number(t.hours) || 0))], ['งาน Weekly Plan', plans.length]])}\n\nชั่วโมงทำงานย้อนหลังของคนนี้จะหายจากทุกโครงการ และงาน Weekly Plan ที่มีคนนี้คนเดียวจะถูกลบ\n${NOTE}`;
    },
    person(r) {
      const id = r.id, d = db();
      d.timesheets = list('timesheets').filter((t) => t.resourceId !== id);
      const stay = [];
      list('plans').forEach((x) => {
        if (!PM.planHas(x, id)) { stay.push(x); return; }
        const left = PM.planPeople(x).filter((y) => y !== id);
        if (!left.length && !PM.planGuests(x).length) return; // only this person on it
        x.resourceIds = left; x.resourceId = left[0] || '';
        stay.push(x);
      });
      d.plans = stay;
      list('planrules').forEach((x) => { x.resourceIds = (x.resourceIds || []).filter((y) => y !== id); });
      // the name stays on what they ran, as plain text; the link to the person goes
      list('projects').forEach((p) => {
        if (p.pm === id) { p.pmName = p.pmName || r.name; p.pm = ''; }
        if (p.sales === id) { p.salesName = p.salesName || r.name; p.sales = ''; }
        (p.tasks || []).forEach((t) => { if (t.owner === id) t.owner = ''; });
        (p.phaseItems || []).forEach((x) => { if (x.owner === id) x.owner = ''; });
      });
      list('bids').forEach((b) => {
        if (b.sales === id) { b.salesName = b.salesName || r.name; b.sales = ''; }
        if (b.estimator === id) b.estimator = '';
        if (b.estimate && b.estimate.reviewer === id) b.estimate.reviewer = '';
        if (b.proposal && b.proposal.owner === id) { b.proposal.ownerName = b.proposal.ownerName || r.name; b.proposal.owner = ''; }
        if (b.proposal && b.proposal.reviewer === id) b.proposal.reviewer = '';
      });
      d.resources = list('resources').filter((x) => x.id !== id);
      PM.save();
    },

    poText(po) {
      const paid = list('costs').filter((c) => c.poId === po.id);
      return `ลบ PO ${po.poNo} พร้อมไฟล์แนบ${paid.length ? `\n\nรายการค่าใช้จ่ายที่อ้างอิง PO นี้ ${n(paid)} รายการยังอยู่ (เป็นเงินที่จ่ายจริง) แต่จะไม่อ้างอิง PO แล้ว` : ''}\n\n${NOTE}`;
    },
    async po(po) {
      await PM.poFiles.trash(`${po.projectId}/${po.id}`, filePaths(po.files || []));
      list('costs').forEach((c) => { if (c.poId === po.id) c.poId = ''; });
      db().pos = list('pos').filter((x) => x.id !== po.id);
      PM.save();
    },
  };
})();
