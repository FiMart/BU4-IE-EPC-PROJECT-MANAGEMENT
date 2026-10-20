/* tour.js — "คลิปสอนการใช้งาน": guided tours that play like a video on the real screens.
   Each step opens its page, scrolls to the part being explained, dims the rest, moves a pointer to it and shows a
   Thai caption; the next step follows on a timer. ▶ / ❚❚ · ‹ › · speed · ✕ (keys: ← → Space Esc).
   Tours only look and point — the forms they open for a demo are closed again without saving.
   Launch: Help page (list of clips) · "▶ คลิปสอน" on a page banner · PM.tour.start(key). */
(function () {
  const U = PM.ui, esc = U.esc;
  const DONE_KEY = 'epc-pm-tours-done', WELCOME_KEY = 'epc-pm-tours-welcome';
  const SPEEDS = [1, 1.5, 0.75];
  const q = (s) => document.querySelector(s);
  const card = (sel) => () => { const e = q(sel); return e && (e.closest('.card') || e); };
  // a project to demo on: an active one that has the most to show (activities, costs)
  const demoProject = () => {
    const list = (PM.db.projects || []).filter((p) => p.status !== 'closed');
    return list.slice().sort((a, b) => ((b.tasks || []).length - (a.tasks || []).length) || String(a.code).localeCompare(String(b.code)))[0] || (PM.db.projects || [])[0] || null;
  };
  const prj = (tab) => () => { const p = demoProject(); return p ? `#/projects/${p.id}${tab ? '/' + tab : ''}` : null; };
  const click = (sel) => () => { const e = typeof sel === 'function' ? sel() : q(sel); if (e) e.click(); };

  /* ---------- the clips ----------
     step: { route, sel (css | [css…] | fn → element), title, text, need (permission), open (fn: opens a demo form), optional (skip if not found) } */
  const TOURS = [
    {
      key: 'start', topic: 'start', route: 'dashboard', title: 'เริ่มต้นใช้งานระบบ', desc: 'เมนู · แถบด้านบน · บัญชีผู้ใช้ · คู่มือและคลิปสอน', steps: [
        { route: '#/dashboard', sel: ['#nav', '#tabbar'], title: 'เมนูหลัก', text: 'เมนูเรียงตามขั้นของงาน: <b>ภาพรวม</b> (Dashboard, โหมดนำเสนอ) → <b>ก่อนได้งาน</b> (งานประมูล) → <b>งานโครงการ</b> (โครงการ, ใบสั่งซื้อ, ราคาผู้ขาย, แผนงานรายสัปดาห์) → <b>บุคลากร</b> → <b>ระบบ</b> · บนมือถือเมนูหลักอยู่แถบด้านล่าง กด "เพิ่มเติม" เพื่อดูทั้งหมด' },
        { sel: '.qs-btn', title: 'ค้นหาด่วน (Ctrl + K)', text: 'พิมพ์เลขโครงการ ชื่อ ลูกค้า เลข Bid หรือเลข PO แล้วกด Enter — ไปถึงหน้านั้นทันที กด <b>Ctrl + K</b> จากหน้าไหนก็ได้' },
        { sel: '.qc-btn', title: '+ สร้างใหม่', text: 'เพิ่ม Inquiry · โครงการ · ค่าใช้จ่าย · PO · งาน Weekly Plan · ราคา ได้จากทุกหน้า — ระบบพาไปหน้าที่ถูกต้องและเปิดฟอร์มให้ (แสดงตามสิทธิ์ของคุณ)' },
        { sel: '#page-hero', title: 'แถบแนะนำของแต่ละหน้า', text: 'บอกว่าหน้านี้ใช้ทำอะไร · <b>วิธีใช้หน้านี้</b> เปิดคู่มือ · <b>▶ คลิปสอน</b> เล่นคลิปของหน้านั้นแบบนี้' },
        { sel: '#asof', optional: true, title: 'Status date', text: 'ตัวเลขทุกหน้า (SPI, CPI, ความคืบหน้าตามแผน, PO เลยกำหนด) คำนวณ ณ วันที่นี้' },
        { sel: '.present-btn', title: 'โหมดนำเสนอ (TV)', text: 'เปิดหน้าจอเต็มสำหรับทีวี / โปรเจกเตอร์ในห้องประชุม — สลับหน้าอัตโนมัติ ตัวเลขใหญ่อ่านได้จากระยะไกล' },
        { sel: '#theme-toggle', title: 'ธีมสว่าง / มืด', text: 'สลับธีมได้ตลอด — บันทึกในบัญชีของคุณ เข้าจากเครื่องไหนก็ได้ธีมเดิม' },
        { sel: '#user-box', optional: true, title: 'บัญชีผู้ใช้และ Role', text: 'ชื่อ · Role · ออกจากระบบ — สิ่งที่แก้ไขได้ขึ้นกับ Role ที่ Admin กำหนด (ดูตารางสิทธิ์ใน Help)' },
        { route: '#/help', sel: '.tour-list', title: 'คู่มือและคลิปสอน', text: 'หน้า Help มีคลิปสอนทุกหัวข้อ และคู่มือที่ค้นหาได้ — กลับมาดูซ้ำได้เสมอ' },
      ],
    },
    {
      key: 'dashboard', topic: 'dashboard', route: 'dashboard', title: 'อ่าน Dashboard', desc: 'Bidding · Execution · Cost overrun · Cash Flow ทั้งแผนก · PO', steps: [
        { route: '#/dashboard', sel: '.att-card', title: 'ต้องดำเนินการวันนี้', text: 'เริ่มวันจากตรงนี้: รวมเรื่องที่ต้องตามจากทุกส่วน — เกินงบ · ช้ากว่าแผน · Milestone / PO / Bid เลยกำหนด · NCR Critical — <b>ด่วน</b> อยู่ก่อน คลิกเพื่อเปิดหน้าที่เกี่ยวข้อง' },
        { sel: '.sec-nav', title: 'ไปยังส่วนที่ต้องการ', text: 'กดเพื่อเลื่อนไปที่ Bidding · Execution · PO · Resource ได้ทันที ไม่ต้องเลื่อนหา' },
        { sel: '.section-h', title: 'ภาพรวมในหน้าเดียว', text: 'Dashboard แบ่งเป็นส่วน ๆ ตามขั้นของงาน: ① Bidding ② Execution (EPC) ③ Purchase Orders ④ Resource — ลิงก์ <b>เปิด … →</b> พาไปหน้าเต็ม' },
        { sel: '.flow', title: 'Flow ของ Bidding', text: 'จำนวนงานที่อยู่ในแต่ละขั้น และเวลาเฉลี่ย — <b>คลิกขั้นไหน</b> ก็เปิดหน้าของขั้นนั้น' },
        { sel: () => document.querySelectorAll('.section-h')[1], title: 'Execution (EPC)', text: 'จำนวนโครงการในแต่ละ Phase · SPI (เวลา) · CPI (ต้นทุน) · NCR · Safety — ตาราง Project status คลิกแถวเพื่อเปิดโครงการ' },
        { sel: '#d-overrun', title: 'Cost Project Overrun', text: 'โครงการไหน <b>เกินงบแล้ว</b> (Actual cost เกิน Plan cost) หรือ <b>คาดว่าจะเกิน</b> (EAC เกินงบ) — กรอง Active / Closed / All ได้' },
        { sel: '#d-cash', title: 'Cash Flow ทั้งแผนก', text: 'รวม Cash Flow ของทุกโครงการ → <b>Peak funding</b> เงินทุนหมุนเวียนที่แผนกต้องเตรียม และเดือนที่เงินสดตึงสุด · สลับ 3 scenario ได้' },
        { sel: '#d-po-watch', title: 'PO ที่ต้องติดตาม', text: 'PO ที่เลยกำหนดส่ง หรือต้องส่งภายใน 14 วัน — คลิกเพื่อเปิด PO' },
        { sel: card('#c-level'), optional: true, title: 'Resource Utilization', text: 'Utilization ของแต่ละ Level เทียบเป้า และชั่วโมงตามประเภทจาก Timesheet (เห็นเฉพาะ Admin / Dept Manager / PM)' },
      ],
    },
    {
      key: 'bidding', topic: 'bidding', route: 'bidding', title: 'Bidding — ตั้งแต่ Inquiry ถึง Award', desc: 'เพิ่ม Inquiry · Bid board · เลื่อนขั้น · ผลการประมูล', steps: [
        { route: '#/bidding', sel: '.flow', title: 'ขั้นตอนการประมูล', text: 'Inquiry → Estimate → Proposal → Submit → Award · ตัวเลขคือจำนวนงานที่ผ่านแต่ละขั้น — คลิกเพื่อเปิดหน้าแยกของขั้นนั้น' },
        { sel: '[data-action="new"]', need: 'bid.edit', title: 'เพิ่ม Inquiry ใหม่', text: 'กด <b>+ New inquiry</b> เมื่อได้รับงานใหม่จากลูกค้า' },
        { sel: '.modal', open: click('[data-action="new"]'), need: 'bid.edit', title: 'กรอกข้อมูลงาน', text: 'ชื่องาน · ลูกค้า · Sales ผู้รับผิดชอบ · วันที่ได้รับ · Due date — กด <b>บันทึก</b> (ในคลิปนี้จะปิดโดยไม่บันทึก)' },
        { sel: '.kanban', optional: true, title: 'Bid board', text: 'การ์ดอยู่ในคอลัมน์ตามขั้น · <b>คลิกการ์ด</b> เพื่อแก้ไข · ปุ่ม <b>→</b> เลื่อนไปขั้นถัดไป (บันทึกวันที่ = วันนี้) · Won / Lost ที่ขั้น Submit' },
        { sel: () => { const s = q('[data-seg="mode"]'); return s && s.parentElement; }, title: 'Board / Table', text: 'สลับเป็นตาราง (Bid register) เพื่อดูทุกงานพร้อมกัน · เลือกช่วงเวลา และกรองตาม Sales ได้' },
        { sel: '#sales-perf', title: 'ผลงาน Sales', text: 'Inquiry ที่แต่ละคนหามาได้ · Win rate · Pipeline · โครงการที่รับผิดชอบ' },
        { route: '#/bidding/award', sel: card('#c-award-month'), optional: true, title: 'ผลการประมูล (Award)', text: 'Won / Lost / No-bid รายเดือน และแยกตามกลุ่มลูกค้า — งานที่ Won สร้างเป็นโครงการได้ทันที' },
      ],
    },
    {
      key: 'projects', topic: 'projects', route: 'projects', title: 'Projects และรายละเอียดโครงการ', desc: 'ค้นหา / กรอง · Health · Timeline รวม · อัปเดต Phase', steps: [
        { route: '#/projects', sel: '#prj-q', title: 'ค้นหาและกรองโครงการ', text: 'ค้นด้วย Project No. ชื่อ ลูกค้า PM Sales · กรอง Phase / สถานะ / PM / Sales · Active / Closed / All' },
        { sel: '.prj-table', title: 'ตารางโครงการ', text: '<b>Health</b> (แย่กว่าของ SPI กับ CPI) · Progress จริงเทียบแผน · มูลค่าสัญญา / Plan / Actual cost — คลิกแถวเพื่อเปิดโครงการ' },
        { sel: '.gantt', title: 'Timeline ทุกโครงการ', text: 'ทุกโครงการบนเส้นเวลาเดียว: 4 Phase · ◆ Milestone · ลายแดง = คาดว่าจะเสร็จช้ากว่าแผน' },
        { sel: card('#c-health'), title: 'สุขภาพโครงการ SPI × CPI', text: 'จุดละ 1 โครงการ — มุมซ้ายล่าง = ช้ากว่าแผนและเกินงบ ต้องดูก่อน' },
        { route: prj(''), sel: '.cost-strip', title: 'หน้ารายละเอียดโครงการ', text: 'ข้อมูลหลัก · Plan cost · Actual cost · คงเหลือ · EAC · PO ที่สั่งแล้ว' },
        { sel: '.flow', title: '4 Phase ของงาน EPC', text: 'Engineering → Procurement → Construction → Closing — % เสร็จจริง เทียบแผน ณ วันนี้ · <b>คลิก Phase</b> เพื่ออัปเดต' },
        { sel: '.modal', open: click('.flow .flow-step.link'), title: 'อัปเดต Phase', text: '% progress · ปริมาณงาน · วันที่แผน / จริง · น้ำหนัก · Plan cost — ระบบเก็บ snapshot สำหรับ S-Curve ให้อัตโนมัติ' },
        { sel: 'nav.tabs', title: 'แท็บของโครงการ', text: 'จัดเป็น 3 กลุ่ม: <b>แผนและความคืบหน้า</b> (ภาพรวม · Timeline) · <b>ต้นทุนและการเงิน</b> (BOQ · ค่าใช้จ่าย · Cash Flow · PO) · <b>หน้างานและทีม</b> (NCR · Safety · ทีม) — แถบแท็บค้างอยู่ด้านบนขณะเลื่อน และแท็บอื่นนอกจากภาพรวมแสดงข้อมูลโครงการแบบย่อบรรทัดเดียว' },
      ],
    },
    {
      key: 'timeline', topic: 'projects', route: 'project', title: 'Timeline · Gantt Chart', desc: 'วันที่คาดว่าจะเสร็จ · Gantt · กิจกรรม · Milestone', steps: [
        { route: prj('timeline'), sel: '#tab .grid', title: 'ข้อมูล Timeline', text: 'ระยะเวลา · เวลาที่ผ่านไป · <b>วันที่คาดว่าจะเสร็จ</b> (Start + ระยะเวลาตามแผน ÷ SPI) · Milestone ถัดไป · กิจกรรมล่าช้า' },
        { sel: '.gantt', title: 'Gantt Chart', text: 'แท่ง = ช่วงเวลาตามแผน สีเข้ม = % เสร็จ · เส้นใต้แท่ง Phase = ช่วงทำจริง · เส้นแดง = วันนี้ · ขอบแดง = ล่าช้า' },
        { sel: '.gantt-row.grp', title: 'Phase และกิจกรรม', text: 'กด ⌄ เพื่อยุบ / ขยาย · <b>คลิกแท่ง Phase</b> เพื่ออัปเดต · คลิกแท่งกิจกรรมเพื่อแก้ไขวันที่และ % ความคืบหน้า' },
        { sel: '.gm', optional: true, title: 'Milestone ◆', text: 'เขียว = สำเร็จแล้ว · แดง = เลยกำหนด · โปร่ง = ยังไม่ถึง — คลิกเพื่อบันทึกวันที่สำเร็จจริง' },
        { sel: '.modal', open: click('[data-tl="new-task"]'), need: 'timeline.edit', title: 'เพิ่มกิจกรรม', text: 'ชื่อ · Phase · ผู้รับผิดชอบ · วันเริ่ม–เสร็จ · % ความคืบหน้า — โครงการที่ยังว่างกด <b>สร้างจากแม่แบบ</b> ได้' },
        { sel: () => { const g = document.querySelectorAll('#tab .grid.cols-2'); return g[g.length - 1]; }, title: 'สิ่งที่ต้องติดตาม', text: 'ตาราง Milestones และกิจกรรมที่ล่าช้าหรือครบกำหนดใน 14 วัน — คลิกแถวเพื่ออัปเดต' },
      ],
    },
    {
      key: 'boq', topic: 'projects', route: 'project', title: 'BOQ — Bill of Quantities', desc: 'วางจาก Excel · หมวดงาน / รายการ · ราคาจาก Price List · เชื่อม Plan cost / Phase / Cash Flow', steps: [
        { route: prj('boq'), sel: '#tab .grid', title: 'สรุป BOQ', text: 'มูลค่า BOQ (ต้นทุน) · สัดส่วนค่าวัสดุ / ค่าแรง · เทียบ Plan cost และมูลค่าสัญญา · <b>ผลงานตาม BOQ</b> จากปริมาณที่ทำแล้ว' },
        { sel: '.boq-docs', title: 'เอกสาร BOQ (PDF)', text: 'อัปโหลดไฟล์ PDF ของ BOQ (ฉบับลงนาม · ปร.4 / ปร.5 · แบบ) เก็บไว้กับโครงการ — ลากไฟล์มาวางได้ · <b>คลิกเพื่อเปิดดูในหน้านี้</b> พร้อมปุ่มดาวน์โหลด' },
        { sel: '.tbl.boq', title: 'ตาราง BOQ (แบบ ปร.4)', text: 'หมวดงาน → รายการ: หน่วย · ปริมาณ · ค่าวัสดุ / ค่าแรงต่อหน่วย · รวมเงิน · ปริมาณที่ทำแล้ว — คลิกหัวหมวดหรือรายการเพื่อแก้ไข · Export Excel / PDF ได้' },
        { sel: '[data-boq="paste"]', need: 'boq.edit', title: 'วางจาก Excel', text: 'คัดลอก BOQ จาก Excel มาวางได้ทั้งตาราง — แถวที่มีแต่ชื่อ = หัวหมวดงาน ระบบเดา Phase ของหมวดให้' },
        { sel: '.modal', open: click('[data-boq="paste"]'), need: 'boq.edit', title: 'ตรวจก่อนนำเข้า', text: 'ระบบบอกจำนวนรายการ หมวดงาน และยอดรวมที่อ่านได้ก่อนกดนำเข้า — เลือกแทนที่ BOQ เดิมหรือเพิ่มต่อท้ายได้' },
        { sel: '.modal', open: click('.tbl.boq tr.boq-item'), title: 'รายการ BOQ และราคาจาก Price List', text: 'พิมพ์ชื่อแล้วเลือกจาก Price List — ระบบเติมหน่วยและราคาล่าสุดของผู้ขายให้ · กรอก <b>ปริมาณที่ทำแล้ว</b> เพื่อติดตามผลงาน' },
        { sel: () => { const b = q('[data-boq="to-phase"]'); return b && b.closest('.tile'); }, need: 'boq.edit', title: 'เชื่อมกับส่วนอื่น', text: 'ใช้ยอด BOQ ตั้ง Plan cost ของแต่ละ Phase · <b>อัปเดต % Phase</b> จากปริมาณที่ทำแล้ว (S-Curve / SPI ตามมาเอง)' },
        { route: prj('cashflow'), sel: '#cf-checks', title: 'BOQ → Cash Flow', text: 'Cash Flow ใช้หมวดงานจาก BOQ (ต้นทุน · วันที่ · การกระจาย) และตรวจว่าตรงกับยอด BOQ — แก้ BOQ ภายหลังให้กด "สร้างจาก BOQ"' },
      ],
    },
    {
      key: 'cost', topic: 'projects', route: 'project', title: 'บันทึกค่าใช้จ่ายและติดตามงบ', desc: 'บันทึก Actual cost · กราฟต้นทุนสะสม · Cost overrun', steps: [
        { route: prj('cost'), sel: '#tab .grid', title: 'สรุปต้นทุนของโครงการ', text: 'Actual cost (ผลรวมทุกรายการ) · ใช้จ่ายเดือนนี้ · งบคงเหลือ / เกินงบ · CPI และ EAC' },
        { sel: '#tab [data-action="new-cost"]', need: 'cost.edit', title: 'บันทึกค่าใช้จ่าย', text: 'บันทึกทีละรายการเมื่อมีการจ่ายเงิน — Actual cost ของโครงการอัปเดตทันที' },
        { sel: '.modal', open: click('#tab [data-action="new-cost"]'), need: 'cost.edit', title: 'กรอกรายการ', text: 'วันที่ · จำนวนเงิน · รายการ · Phase · หมวด · ผู้ขาย · เลขที่เอกสาร · ผูกกับ PO ได้ (เลือก PO แล้วเติมข้อมูลให้)' },
        { sel: card('#c-cum'), title: 'กราฟเปรียบเทียบต้นทุนสะสม', text: 'แผน (PV) · ผลงาน (EV) · จ่ายจริง (AC) สะสมรายเดือน — เส้นจ่ายจริงสูงกว่าผลงาน = ใช้เงินเกินงานที่ได้' },
        { sel: '#cl-q', title: 'รายการค่าใช้จ่าย', text: 'กรอง Phase / หมวด · ค้นหา · คลิกรายการเพื่อแก้ไข · Export CSV' },
        { route: '#/dashboard', sel: '#d-overrun', title: 'ดูทุกโครงการ: Cost Overrun', text: 'บน Dashboard เห็นทันทีว่าโครงการไหนเกินงบแล้ว หรือคาดว่าจะเกิน และเกินเท่าไร' },
      ],
    },
    {
      key: 'cashflow', topic: 'projects', route: 'project', title: 'Cash Flow Model — S-Curve และ Peak funding', desc: 'BOQ · Assumptions · 3 Scenario · ตรวจตัวเลข · รวมทั้งแผนก', steps: [
        { route: prj('cashflow'), sel: '#cf-kpi', title: 'ผลลัพธ์หลัก', text: '<b>Peak funding</b> = เงินทุนสูงสุดที่ต้องเตรียม และเดือนที่เงินสดตึงสุด · ช่วงที่เงินสดติดลบ · Cash In / Out · กำไรขั้นต้น' },
        { sel: '#cf-status .seg', title: '3 Scenario', text: 'Conservative (ระวัง) · Base (ปกติ) · Optimistic (ดี) — สลับเพื่อดูรายละเอียดของแต่ละกรณี' },
        { sel: card('.cf-a'), title: 'สมมติฐาน (Assumptions)', text: 'Contingency · เงินล่วงหน้า · Retention · รับเงิน / จ่ายเงินช้ากว่า progress กี่เดือน · ปรับต่อ scenario — <b>เปลี่ยนแล้วกราฟเปลี่ยนทันที</b>' },
        { sel: card('#c-cf-cum'), title: 'เงินสดสะสม', text: 'Cash In − Cash Out สะสม 3 เส้น — ส่วนที่ต่ำกว่า 0 คือช่วงที่ต้องใช้เงินทุนหมุนเวียน จุดต่ำสุด = Peak funding' },
        { sel: '#cf-compare', title: 'เปรียบเทียบ Scenario', text: 'Peak funding · เดือนที่ตึงสุด · ช่วงติดลบ · ต้นทุน · กำไร · Margin ของทั้ง 3 กรณีในตารางเดียว' },
        { sel: '#cf-checks', title: 'ตรวจสอบตัวเลข', text: 'เทียบยอด BOQ กับ Plan cost และมูลค่าสัญญา · หมวดงานที่วันที่ไม่ครบ — ผลลัพธ์ยังต้องให้วิศวกรตรวจ assumption เสมอ' },
        { sel: '[data-cf="boq-paste"]', title: 'BOQ แยกหมวดงาน', text: 'สร้างจาก 4 Phase อัตโนมัติ หรือ <b>วางจาก Excel</b> — แต่ละหมวดกำหนดวันที่และรูปแบบการกระจายต้นทุน (S-curve / เท่ากัน / หนักต้น / หนักท้าย)' },
        { sel: '.modal', open: click('[data-cf="boq-paste"]'), title: 'วาง BOQ จาก Excel', text: 'คัดลอกตารางจาก Excel มาวาง: หมวดงาน · ต้นทุน · เริ่ม · เสร็จ (Phase และรูปแบบใส่หรือไม่ก็ได้) — วันที่ พ.ศ. ก็ได้' },
        { sel: '[data-cf="save"]', need: 'cost.edit', title: 'บันทึก', text: 'ทดลองปรับได้ทุกคน · กด <b>บันทึก</b> เพื่อเก็บไว้กับโครงการ (Admin / Dept Manager / PM) — ตัวเลขรวมทั้งแผนกใช้ค่าที่บันทึกแล้วเท่านั้น' },
        { route: '#/dashboard', sel: '#d-cash', title: 'Cash Flow ทั้งแผนก', text: 'Dashboard รวมทุกโครงการ → Peak funding ของแผนก · ตารางบอกว่าโครงการไหนดึงเงินมากที่สุด' },
      ],
    },
    {
      key: 'commercial', topic: 'projects', route: 'project', title: 'VO · งวดเงิน · ความเสี่ยง · รายงานประจำเดือน', desc: 'งานเพิ่ม-ลด · วางบิลและรับเงิน · Risk matrix · รายงาน PDF', steps: [
        { route: prj('changes'), sel: '#tab .grid', title: 'VO — งานเพิ่ม-ลด', text: 'บันทึกงานเพิ่ม / ลดจากสัญญา: มูลค่า · ต้นทุน · วันที่ขยาย · สถานะ — VO <b>อนุมัติแล้ว</b> รวมเป็น <b>มูลค่าสัญญาปรับปรุง</b> ใช้ต่อในงวดเงิน Cash Flow และรายงาน' },
        { route: prj('billing'), sel: '#tab .grid', title: 'งวดเงิน — วางบิลและรับเงิน', text: 'วางบิลแล้ว · รับเงินแล้ว · <b>ค้างรับ</b> (เกินกำหนดขึ้นแดง) · <b>ผลงานที่ยังไม่ได้วางบิล</b> · Retention ที่ถูกหัก' },
        { sel: card('#c-bill'), title: 'รับเงินจริง เทียบแผน', text: 'เส้นประ = แผนรับเงินจาก Cash Flow · เส้นทึบ = เงินที่รับจริง — ต่ำกว่าแผนมาก = ต้องตามเก็บเงิน' },
        { sel: '[data-inv="new"]', need: 'billing.edit', title: 'วางบิลงวดใหม่', text: 'ระบบตั้งยอดตาม % งานเสร็จที่ยังไม่ได้เบิก และหักเงินล่วงหน้า / Retention ตามเงื่อนไขใน Cash Flow ให้ — เมื่อลูกค้าจ่ายเปลี่ยนสถานะเป็น "รับเงินแล้ว"' },
        { route: prj('risks'), sel: '.rm', title: 'Risk Matrix', text: 'ความเสี่ยงและปัญหาของโครงการ วางตามโอกาส × ผลกระทบ — มุมขวาบนเสี่ยงที่สุด · คะแนน ≥ 15 ขึ้น "ต้องดำเนินการวันนี้"' },
        { sel: '.risk-watch, #tab .card:last-child', title: 'ต้องติดตาม', text: 'ความเสี่ยงระดับสูงมาก · เลยกำหนดดำเนินการ · ปัญหาที่ยังไม่ปิด — แต่ละเรื่องมีผู้รับผิดชอบและแผนรับมือ' },
        { sel: '[data-action="report"]', title: 'รายงานประจำเดือน (PDF)', text: 'กดครั้งเดียวได้รายงาน A4 พร้อมนำเสนอ: สรุปผู้บริหาร · S-Curve · ต้นทุน · VO · งวดเงิน · Cash Flow · Milestone · PO · NCR · Safety · ความเสี่ยง · ช่องลงนาม → กด "พิมพ์ / บันทึก PDF"' },
      ],
    },
    {
      key: 'pos', topic: 'pos', route: 'pos', title: 'Purchase Orders', desc: 'สร้าง PO · ติดตามส่งของ · การจ่ายเงิน · ไฟล์แนบ', steps: [
        { route: '#/pos', sel: '#po-q', title: 'กรองและค้นหา PO', text: 'เลือกโครงการ · กรองสถานะ (ทั้งหมด / ยังไม่ส่งครบ / เลยกำหนด …) · ค้นหาเลข PO ผู้ขาย รายการ' },
        { sel: '#view .grid', title: 'สรุป PO', text: 'PO ที่ยังไม่ส่งครบ · เลยกำหนดส่ง · ต้องส่งใน 14 วัน · จ่ายเงินแล้วกี่ %' },
        { sel: '[data-action="new-po"]', need: 'po.edit', title: 'สร้าง PO', text: 'กด <b>+ New PO</b> — กรอกผู้ขาย มูลค่า กำหนดส่ง และแนบไฟล์ใบสั่งซื้อ / ใบเสนอราคา' },
        { sel: '.modal', open: click('[data-action="new-po"]'), need: 'po.edit', title: 'ฟอร์ม PO', text: 'เลขที่ PO · โครงการ · Phase · ผู้ขาย · มูลค่า · กำหนดส่ง · การจ่ายเงิน · ไฟล์แนบ' },
        { sel: '.tbl', title: 'ตาราง PO', text: 'เรียง PO ที่เลยกำหนดไว้บนสุด · เปลี่ยนสถานะได้จากตาราง · คลิกแถวเพื่อดูรายละเอียดและไฟล์' },
      ],
    },
    {
      key: 'weekly', topic: 'weekly', route: 'weekly', title: 'Weekly Plan และ PPC', desc: 'วางแผนรายสัปดาห์ · อัปเดตสถานะ · PPC · สาเหตุงานไม่เสร็จ', steps: [
        { route: '#/weekly', sel: () => { const b = q('[data-action="this"]'); return b && b.parentElement; }, title: 'เลือกสัปดาห์', text: 'เลื่อนไปสัปดาห์ก่อน / ถัดไป หรือกลับมาสัปดาห์นี้' },
        { sel: '[data-action="new"]', need: 'plan.edit', title: 'เพิ่มงาน', text: 'กด <b>+ เพิ่มงาน</b> — หรือ "ยกงานค้างจากสัปดาห์ก่อน" มาต่อในสัปดาห์นี้' },
        { sel: '.modal', open: click('[data-action="new"]'), need: 'plan.edit', title: 'รายละเอียดงาน', text: 'ชื่องาน · โครงการ / Bid / Overhead · ผู้รับผิดชอบ · วัน · ชั่วโมง' },
        { sel: ['.cal-wrap', '#view .card .tbl'], title: 'ปฏิทินงาน', text: 'ลากการ์ดไปวันอื่นเพื่อเลื่อนกำหนด · อัปเดตสถานะจากการ์ด · เลือก <b>ไม่เสร็จ</b> → ระบบเปิดฟอร์มสาเหตุ + <b>NCR</b> ของโครงการให้ทันที' },
        { sel: '#view .grid.cols-5', title: 'PPC', text: 'PPC = งานที่เสร็จ ÷ งานในแผน (เป้า ≥ 80%) · ชั่วโมงตามแผนเทียบ capacity ของทีม' },
        { sel: card('#c-reasons'), title: 'สาเหตุที่งานไม่เสร็จ', text: 'สาเหตุที่พบบ่อยใน 8 สัปดาห์ — ใช้แก้ปัญหาในการวางแผนสัปดาห์ถัดไป' },
      ],
    },
    {
      key: 'timesheet', topic: 'timesheet', route: 'timesheet', need: 'resource.view', title: 'Timesheet และ Resource Utilization', desc: 'กรอกชั่วโมง · ทีมกรอกครบไหม · Utilization', steps: [
        { route: '#/timesheet', sel: '#ts-person', title: 'เลือกคนและสัปดาห์', text: 'เลือกพนักงาน แล้วเลื่อนสัปดาห์ที่ต้องการ' },
        { sel: '#ts-grid', title: 'งานมาจาก Weekly Plan', text: 'แถวงานดึงจาก <b>Weekly Plan</b> ของคนนี้อย่างเดียว (ใต้ชื่อแถวคืองานในแผน · คอลัมน์ "แผน" = ชั่วโมงตามแผน) — กรอกชั่วโมงที่ทำจริงรายวัน บันทึกอัตโนมัติ · งานนอกแผนให้เพิ่มที่ Weekly Plan ก่อน' },
        { sel: '#ts-oh', need: 'timesheet.edit', title: 'ลา / ประชุม / อบรม', text: 'สิ่งเดียวที่เพิ่มนอกแผนได้ — เลือกแล้วกด + เพิ่ม (เฉพาะ Admin / Project Manager)' },
        { sel: card('#ts-team'), title: 'สถานะการกรอกของทีม', text: 'ใครกรอกครบ / ขาดกี่ชั่วโมงเทียบ capacity' },
        { route: '#/resources', sel: card('#c-level'), title: 'Resource Utilization', text: 'Utilization = ชั่วโมง Billable ÷ ชั่วโมงที่มี เทียบเป้าของแต่ละ Level · ใครงานล้น / งานน้อย' },
      ],
    },
    {
      key: 'present', topic: 'present', route: 'present', title: 'โหมดนำเสนอขึ้นจอ (TV)', desc: 'เปิดจอเต็ม · สลับหน้าอัตโนมัติ · ปุ่มควบคุม', steps: [
        { route: '#/dashboard', sel: '.present-btn', title: 'เปิดโหมดนำเสนอ', text: 'กดปุ่มจอภาพมุมขวาบน หรือเมนู "โหมดนำเสนอ" ใต้ Dashboard' },
        { route: '#/present', sel: '.pres-stage', title: 'หน้าจอสำหรับทีวี', text: 'ตัวเลขใหญ่ อ่านได้จากระยะไกล · สลับหน้าเอง: Bidding · Projects · สุขภาพโครงการ · Cost Overrun · Cash Flow · PO · Weekly · Resource · Safety' },
        { sel: '.pres-dots', title: 'เลือกหน้า', text: 'คลิกจุดเพื่อไปหน้านั้น · ปุ่ม ← → บนคีย์บอร์ดก็ได้' },
        { sel: '.pres-ctrl', title: 'ปุ่มควบคุม', text: 'หยุด / เล่น (Space) · ความเร็วสลับหน้า 10–60 วินาที · เต็มจอ (F) · ออก (Esc) — ข้อมูลอัปเดตจาก Cloud ทุก 1 นาที' },
      ],
    },
  ];

  /* ---------- watched list (this browser) ---------- */
  const readDone = () => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const markDone = (key) => { try { const d = readDone(); d[key] = PM.today(); localStorage.setItem(DONE_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ } };

  const T = (PM.tour = {});
  T.list = () => TOURS.filter((t) => !t.need || PM.can(t.need));
  T.forRoute = (route) => T.list().find((t) => t.route === route) || null;
  T.forTopic = (topic) => T.list().filter((t) => t.topic === topic);
  T.done = readDone;
  T.minutes = (t) => Math.max(1, Math.round(PM.sum(t.steps, (s) => dur(s, 1)) / 60000));

  /* ---------- player ---------- */
  let S = null; // { tour, steps, i, playing, speed, timer, left, started, stash, alive }
  let root = null, raf = 0;
  function dur(step, speed) {
    const len = String(step.text || '').replace(/<[^>]+>/g, '').length + String(step.title || '').length;
    return Math.round(Math.max(5500, Math.min(14000, 3500 + len * 55)) / (speed || 1));
  }
  function ui() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'tour-root';
    root.innerHTML = `
      <div class="tour-block" data-tour="block"></div>
      <div class="tour-dim"></div>
      <div class="tour-spot"></div>
      <div class="tour-cursor" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 3l14 8-6 1.5L16 20l-3 1.3-3.2-7.3L5 18z"/></svg><i></i></div>
      <div class="tour-card" role="dialog" aria-modal="false" aria-labelledby="tour-h">
        <div class="tour-bar"><i></i></div>
        <div class="tour-top"><span class="tour-name"></span><span class="tour-count"></span></div>
        <h3 id="tour-h"></h3>
        <p class="tour-text" aria-live="polite"></p>
        <div class="tour-ctrl">
          <button type="button" class="btn sm" data-tour="prev" aria-label="ย้อนกลับ (←)">‹</button>
          <button type="button" class="btn sm primary" data-tour="play"></button>
          <button type="button" class="btn sm" data-tour="next" aria-label="ถัดไป (→)">›</button>
          <span class="spacer"></span>
          <button type="button" class="btn sm ghost" data-tour="speed" title="ความเร็ว"></button>
          <button type="button" class="btn sm ghost" data-tour="close" aria-label="ปิดคลิป (Esc)">✕</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-tour]');
      if (!a || !S) return;
      const act = a.dataset.tour;
      if (act === 'block') { setPlaying(!S.playing); return; } // clicking the dimmed page pauses / resumes
      if (act === 'prev') go(S.i - 1);
      if (act === 'next') go(S.i + 1);
      if (act === 'play') setPlaying(!S.playing);
      if (act === 'speed') { S.speed = SPEEDS[(SPEEDS.indexOf(S.speed) + 1) % SPEEDS.length]; renderCtrl(); restartTimer(); }
      if (act === 'close') T.stop();
      if (act === 'again') T.start(S.tour.key);
      if (act === 'nextclip') T.start(a.dataset.key);
    });
    document.addEventListener('keydown', (e) => {
      if (!S) return;
      if (e.key === 'Escape') { e.stopPropagation(); T.stop(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(S.i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(S.i - 1); }
      else if (e.key === ' ' && !e.target.closest('input, textarea, select')) { e.preventDefault(); setPlaying(!S.playing); }
    }, true);
    const follow = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => S && S.el && place(S.el, false)); };
    window.addEventListener('resize', follow);
    document.addEventListener('scroll', follow, true);
    return root;
  }

  T.start = function (key, from) {
    const tour = TOURS.find((t) => t.key === key);
    if (!tour || !document.body.classList.contains('authed')) return;
    if (S) leaveStep();
    document.querySelectorAll('.tour-welcome').forEach((w) => w.remove());
    ui();
    S = { tour, i: -1, playing: true, speed: (S && S.speed) || 1, alive: {} };
    root.className = 'on';
    go(from || 0);
  };
  T.stop = function () {
    if (!S) return;
    leaveStep();
    clearTimeout(S.timer);
    S = null;
    if (root) root.className = '';
  };

  async function go(i) {
    if (!S) return;
    const steps = S.tour.steps;
    if (i < 0) i = 0;
    S.dir = i < S.i ? -1 : 1; // a step with nothing to show is skipped in the direction we were going
    leaveStep();
    if (i >= steps.length) { finish(); return; }
    const token = (S.token = {});
    S.i = i;
    const step = steps[i];
    root.classList.remove('end');
    // the page: this step's route, or the last one set before it (so starting / jumping mid-clip lands on the right page)
    let rs = null;
    for (let k = i; k >= 0 && !rs; k--) if (steps[k].route) rs = steps[k].route;
    const route = typeof rs === 'function' ? rs() : rs;
    if (rs && !route) { go(i + 1); return; } // e.g. no project to demo on
    if (route && location.hash !== route) { location.hash = route; await wait(150); if (!S || S.token !== token) return; }
    if (step.open && !U.pendingDraft()) {
      await wait(250);
      if (S && S.token === token && (!step.need || PM.can(step.need))) {
        try { S.stash = localStorage.getItem('epc-pm-form-draft'); } catch (e) { S.stash = null; }
        step.open();
        S.opened = true;
      }
    }
    const el = await find(step, step.open ? 2500 : 3000);
    if (!S || S.token !== token) return; // moved on meanwhile
    const allowed = !step.need || PM.can(step.need);
    if (!el && (step.optional || step.open)) { if (S.dir === -1 && i > 0) go(i - 1); else go(i + 1); return; }
    S.el = el;
    renderCard(step, allowed && el ? '' : step.need && !allowed ? `ส่วนนี้ใช้ได้เฉพาะ ${PM.whoCan(step.need)}` : '');
    if (el) {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      await wait(420);
      if (!S || S.token !== token) return;
      place(el, true);
    } else place(null, true);
    restartTimer();
  }
  function leaveStep() {
    if (!S) return;
    clearTimeout(S.timer);
    if (S.opened) {
      U.closeModal(); // a demo form — closed without saving
      try { if (S.stash) localStorage.setItem('epc-pm-form-draft', S.stash); } catch (e) { /* ignore */ }
      S.opened = false; S.stash = null;
    }
    S.el = null;
  }
  function finish() {
    markDone(S.tour.key);
    const list = T.list(), k = list.findIndex((t) => t.key === S.tour.key), nxt = list[k + 1];
    clearTimeout(S.timer);
    root.classList.add('end');
    place(null, true);
    const c = root.querySelector('.tour-card');
    c.querySelector('.tour-bar i').style.animation = 'none';
    c.querySelector('.tour-name').textContent = S.tour.title;
    c.querySelector('.tour-count').textContent = 'จบคลิป';
    c.querySelector('#tour-h').textContent = 'ดูจบแล้ว ✓';
    c.querySelector('.tour-text').innerHTML = `ลองทำตามบนหน้าจริงได้เลย — ดูคลิปอื่น ๆ และคู่มือได้ที่หน้า <a href="#/help" data-tour="close">Help</a>`;
    c.querySelector('.tour-ctrl').innerHTML = `<button type="button" class="btn sm" data-tour="again">↺ ดูซ้ำ</button>
      ${nxt ? `<button type="button" class="btn sm primary" data-tour="nextclip" data-key="${nxt.key}">คลิปถัดไป: ${esc(nxt.title)} ▶</button>` : ''}
      <span class="spacer"></span><button type="button" class="btn sm ghost" data-tour="close">ปิด</button>`;
    S.i = S.tour.steps.length;
  }

  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
  const onScreen = (e) => { if (!e || !e.isConnected) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth; };
  function pick(step) {
    const sels = Array.isArray(step.sel) ? step.sel : [step.sel];
    for (const s of sels) {
      const e = typeof s === 'function' ? s() : document.querySelector(s);
      if (onScreen(e)) return e;
    }
    return null;
  }
  async function find(step, ms) {
    const until = Date.now() + ms;
    for (;;) {
      const e = pick(step);
      if (e || Date.now() > until || !S) return e;
      await wait(120);
    }
  }

  /* ---------- drawing ---------- */
  function renderCard(step, note) {
    const c = root.querySelector('.tour-card');
    c.querySelector('.tour-name').textContent = S.tour.title;
    c.querySelector('.tour-count').textContent = `${S.i + 1} / ${S.tour.steps.length}`;
    c.querySelector('#tour-h').textContent = step.title;
    c.querySelector('.tour-text').innerHTML = step.text + (note ? `<small class="tour-note">${esc(note)}</small>` : '');
    c.querySelector('.tour-ctrl').innerHTML = `
      <button type="button" class="btn sm" data-tour="prev" aria-label="ย้อนกลับ (←)"${S.i === 0 ? ' disabled' : ''}>‹</button>
      <button type="button" class="btn sm primary" data-tour="play"></button>
      <button type="button" class="btn sm" data-tour="next" aria-label="ถัดไป (→)">›</button>
      <span class="spacer"></span>
      <button type="button" class="btn sm ghost" data-tour="speed" title="ความเร็ว"></button>
      <button type="button" class="btn sm ghost" data-tour="close" aria-label="ปิดคลิป (Esc)">✕</button>`;
    renderCtrl();
  }
  function renderCtrl() {
    const p = root.querySelector('[data-tour="play"]'), sp = root.querySelector('[data-tour="speed"]');
    if (p) { p.textContent = S.playing ? '❚❚ หยุด' : '▶ เล่น'; p.setAttribute('aria-label', S.playing ? 'หยุด (Space)' : 'เล่น (Space)'); }
    if (sp) sp.textContent = S.speed + '×';
    root.classList.toggle('paused', !S.playing);
  }
  function restartTimer() {
    if (!S) return;
    clearTimeout(S.timer);
    const step = S.tour.steps[S.i];
    if (!step) return;
    S.left = dur(step, S.speed);
    const bar = root.querySelector('.tour-bar i');
    bar.style.animation = 'none'; void bar.offsetWidth;
    bar.style.animation = `tourbar ${S.left}ms linear forwards`;
    bar.style.animationPlayState = S.playing ? 'running' : 'paused';
    S.started = Date.now();
    if (S.playing) S.timer = setTimeout(() => go(S.i + 1), S.left);
  }
  function setPlaying(on) {
    if (!S || S.i >= S.tour.steps.length) return;
    const bar = root.querySelector('.tour-bar i');
    if (!on && S.playing) { clearTimeout(S.timer); S.left = Math.max(400, S.left - (Date.now() - S.started)); }
    if (on && !S.playing) { S.started = Date.now(); S.timer = setTimeout(() => go(S.i + 1), S.left); }
    S.playing = on;
    bar.style.animationPlayState = on ? 'running' : 'paused';
    renderCtrl();
  }

  function place(el, moveCursor) {
    if (!root || !S) return;
    const spot = root.querySelector('.tour-spot'), dim = root.querySelector('.tour-dim'), cur = root.querySelector('.tour-cursor'), c = root.querySelector('.tour-card');
    const W = innerWidth, H = innerHeight, phone = W <= 640;
    if (el && !el.isConnected) { const again = pick(S.tour.steps[S.i] || {}); if (again) { S.el = el = again; } else el = null; }
    if (!el) {
      spot.style.opacity = '0'; dim.style.opacity = '1'; cur.classList.remove('show');
      Object.assign(c.style, phone ? { left: '8px', right: '8px', top: 'auto', bottom: '8px', width: 'auto' } : { left: `${Math.max(12, (W - c.offsetWidth) / 2)}px`, top: `${Math.max(12, (H - c.offsetHeight) / 2)}px`, right: 'auto', bottom: 'auto', width: '' });
      return;
    }
    const r = el.getBoundingClientRect(), pad = 6;
    const box = { l: Math.max(4, r.left - pad), t: Math.max(4, r.top - pad), r: Math.min(W - 4, r.right + pad), b: Math.min(H - 4, r.bottom + pad) };
    Object.assign(spot.style, { opacity: '1', left: box.l + 'px', top: box.t + 'px', width: Math.max(0, box.r - box.l) + 'px', height: Math.max(0, box.b - box.t) + 'px' });
    dim.style.opacity = '0';
    // pointer: to the middle of the part (or its top-left area when it is large)
    const cx = r.width > 360 ? Math.min(r.left + 80, (box.l + box.r) / 2) : (box.l + box.r) / 2;
    const cy = r.height > 220 ? Math.min(r.top + 60, (box.t + box.b) / 2) : (box.t + box.b) / 2;
    cur.classList.add('show');
    cur.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px)`;
    if (moveCursor) { cur.classList.remove('tap'); void cur.offsetWidth; setTimeout(() => cur.classList.add('tap'), 650); }
    // caption: below the part, else above, else beside it — phones: a bar at the bottom
    if (phone) { Object.assign(c.style, { left: '8px', right: '8px', top: 'auto', bottom: '8px', width: 'auto' }); return; }
    const cw = c.offsetWidth || 380, ch = c.offsetHeight || 200, gap = 14;
    let left = Math.min(Math.max(12, box.l), W - cw - 12), top;
    if (H - box.b >= ch + gap + 8) top = box.b + gap;
    else if (box.t >= ch + gap + 8) top = box.t - ch - gap;
    else if (W - box.r >= cw + gap + 8) { left = box.r + gap; top = Math.min(Math.max(12, box.t), H - ch - 12); }
    else if (box.l >= cw + gap + 8) { left = box.l - cw - gap; top = Math.min(Math.max(12, box.t), H - ch - 12); }
    else { top = H - ch - 16; left = W - cw - 16; } // the part fills the screen — bottom-right corner
    Object.assign(c.style, { left: left + 'px', top: top + 'px', right: 'auto', bottom: 'auto', width: '' });
  }

  /* ---------- first visit: offer the getting-started clip once ---------- */
  T.welcome = function () {
    if (S || !document.body.classList.contains('authed')) return; // a clip is already playing
    try { if (localStorage.getItem(WELCOME_KEY) || Object.keys(readDone()).length) return; localStorage.setItem(WELCOME_KEY, PM.today()); } catch (e) { return; }
    const box = document.createElement('div');
    box.className = 'tour-welcome';
    box.setAttribute('role', 'status');
    box.innerHTML = `<b>ใหม่! คลิปสอนการใช้งาน</b><span>ดูทีละขั้นบนหน้าจอจริง ประมาณ ${T.minutes(TOURS[0])} นาที — ดูคลิปอื่นได้ที่หน้า Help</span>
      <div class="row"><button type="button" class="btn sm primary" data-w="play">▶ เริ่มดู</button><button type="button" class="btn sm ghost" data-w="later">ไว้ทีหลัง</button></div>`;
    document.body.appendChild(box);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]');
      if (!b) return;
      box.remove();
      if (b.dataset.w === 'play') T.start('start');
    });
    setTimeout(() => box.isConnected && box.classList.add('fade'), 20000);
    setTimeout(() => box.remove(), 21000);
  };

  /* ---------- the list of clips (Help page) ---------- */
  T.listHtml = function () {
    const done = readDone();
    return `<div class="tour-list">${T.list().map((t) => `
      <button type="button" class="tour-item" data-tour-start="${t.key}">
        <span class="tour-thumb">${PM.illus.art(t.route === 'project' ? 'projects' : t.route)}<i class="tour-play" aria-hidden="true">▶</i></span>
        <span class="tour-meta"><b>${esc(t.title)}</b><small>${esc(t.desc)}</small>
          <em>${t.steps.length} ขั้น · ~${T.minutes(t)} นาที${done[t.key] ? ' · <span class="tour-seen">ดูแล้ว ✓</span>' : ''}</em></span>
      </button>`).join('')}</div>`;
  };
  // any "start a clip" button anywhere in the app
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tour-start]');
    if (!b) return;
    e.preventDefault();
    T.start(b.dataset.tourStart);
  });
})();
