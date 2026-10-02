/* help.js — วิธีใช้งาน: one guide per page (#/help/<topic>), searchable; the role table is built from PM.PERMISSIONS.
   Each page's banner links here ("วิธีใช้หน้านี้") through PM.help.topicFor(route). */
(function () {
  const U = PM.ui, esc = U.esc;
  const H = (PM.help = {});

  /* content: steps = numbered how-to, items = good to know, tip = callout. Strings may hold simple markup. */
  const TOPICS = [
    {
      key: 'start', title: 'เริ่มต้นใช้งาน', icon: 'info',
      intro: 'ภาพรวมการใช้งานเว็บ — เข้าสู่ระบบ เมนู การบันทึกข้อมูล และสิ่งที่ใช้ได้ในทุกหน้า',
      blocks: [
        { h: 'เข้าสู่ระบบครั้งแรก', steps: [
          'กด <b>สมัครสมาชิก</b> กรอกชื่อ อีเมล และรหัสผ่าน แล้วเข้าสู่ระบบได้ทันที',
          'ผู้ใช้คนแรกของระบบเป็น <b>Admin</b> อัตโนมัติ คนต่อ ๆ ไปได้ Role <b>Technician</b>',
          'ให้ Admin, Department Manager (ผู้จัดการแผนก) หรือ Project Manager ตั้ง Role ที่ถูกต้องให้ ที่ <a href="#/settings">Settings</a> → จัดการ Role ผู้ใช้ (ดูสิ่งที่แต่ละ Role ทำได้ที่ <a href="#/help/roles">สิทธิ์ตาม Role</a>)',
          'ลืมรหัสผ่าน: กด <b>ลืมรหัสผ่าน?</b> ที่หน้าเข้าสู่ระบบ ระบบส่งลิงก์ตั้งรหัสใหม่ทางอีเมล',
        ] },
        { h: 'เมนู', items: [
          '<b>คอมพิวเตอร์:</b> เมนูอยู่ด้านซ้าย (จอเตี้ยเลื่อนเมนูขึ้นลงได้) กดปุ่ม ‹ ที่ขอบเมนูเพื่อหุบเหลือเฉพาะไอคอน · เมนูย่อยของขั้น Bidding แสดงเมื่ออยู่หน้า Bidding',
          '<b>มือถือ / แท็บเล็ต:</b> เมนูหลักอยู่แถบด้านล่าง — Dashboard · Bidding · Projects · Weekly · Timesheet · <b>เพิ่มเติม</b> (หน้าที่เหลือ เช่น ขั้น Bidding, PO, Price List, Settings แสดงเป็นปุ่มไอคอน พร้อมบัญชีผู้ใช้และปุ่มออกจากระบบ — แตะนอกกรอบเพื่อปิด)',
          'แต่ละหน้ามีแถบภาพด้านบน กด <b>วิธีใช้หน้านี้</b> เพื่อเปิดคู่มือของหน้านั้น',
        ] },
        { h: 'การบันทึกข้อมูล', items: [
          'ทุกการแก้ไข<b>บันทึกขึ้น Cloud อัตโนมัติ</b>ภายใน ~1 วินาที ไม่ต้องกดบันทึกซ้ำ — ทุกคนในทีมเห็นข้อมูลชุดเดียวกัน',
          'สถานะการบันทึกอยู่มุมขวาบน: ● <b>บันทึกบน Cloud แล้ว</b> · <b>กำลังบันทึก…</b> · <b>ยังส่งขึ้น Cloud ไม่ได้</b> (เก็บไว้ในเครื่องแล้ว ระบบลองใหม่เอง)',
          'อินเทอร์เน็ตหลุดก็ใช้งานต่อได้ ข้อมูลส่งขึ้น Cloud ให้เองเมื่อกลับมาออนไลน์',
          'สลับกลับมาที่แท็บนี้ ระบบดึงข้อมูลที่เพื่อนร่วมทีมแก้ไขให้อัตโนมัติ · บนมือถือ <b>ดึงหน้าลง</b>ที่ด้านบนสุดแล้วปล่อยเพื่อรีเฟรช',
          'ฟอร์มที่กรอกค้างแล้วปิดไป ระบบเก็บเป็นร่างไว้ 3 วัน — เปิดฟอร์มเดิมอีกครั้งจะกู้คืนให้',
        ] },
        { h: 'ใช้ได้ในทุกหน้า', items: [
          'วางเมาส์ (หรือแตะ) ที่กราฟ การ์ด หรือแถบ Progress เพื่อดูตัวเลขละเอียด',
          'ปุ่ม <b>◐</b> มุมขวาบน สลับธีมสว่าง / มืด',
          'ระบบจำหน้าที่เปิดล่าสุดและตัวกรองของแต่ละหน้าไว้ในเบราว์เซอร์นี้',
          'ป้ายสถานะ: <b>On track</b> (SPI / CPI ≥ 0.95) · <b>At risk</b> (0.90–0.95) · <b>Off track</b> (&lt; 0.90)',
        ] },
      ],
    },
    {
      key: 'dashboard', title: 'Dashboard', icon: 'chart', route: '#/dashboard',
      intro: 'สรุปทุกส่วนในหน้าเดียว แบ่ง 4 ส่วน: Bidding (12 เดือนล่าสุด) · Execution (EPC) · Purchase Orders · Resource (4 สัปดาห์ล่าสุด)',
      blocks: [
        { h: 'อ่านและใช้งาน', items: [
          'กดที่<b>ขั้นตอนใน Flow</b> (Inquiry … Award) เพื่อเปิดหน้าของขั้นนั้น · Flow ของ EPC แสดงจำนวนโครงการที่อยู่ในแต่ละ Phase',
          'ตาราง <b>Project status</b>: แถบ = progress จริง เส้นดำ = progress ตามแผน ณ วันนี้ — กดแถวเพื่อเปิดรายละเอียดโครงการ',
          '<b>PO ที่ต้องติดตาม</b>: PO ที่เลยกำหนดส่งหรือต้องส่งภายใน 14 วัน — กดแถวเพื่อเปิด PO',
          'ลิงก์ <b>เปิด … →</b> ที่หัวแต่ละส่วนพาไปหน้าเต็มของส่วนนั้น',
        ] },
      ],
    },
    {
      key: 'bidding', title: 'Bidding (ภาพรวม)', icon: 'proposal', route: '#/bidding',
      intro: 'ติดตามงานประมูลตั้งแต่รับ Inquiry จนรู้ผล: Inquiry → Estimate → Proposal → Submit → Award',
      blocks: [
        { h: 'เพิ่มงานประมูลใหม่', steps: [
          'กด <b>+ New inquiry</b>',
          '<b>Bid No.</b> ขึ้น <b>PROP-ปี-IE EPC-00</b> ให้แล้ว — พิมพ์เลขต่อท้าย (ห้ามซ้ำกับ Bid เดิม) แล้วกรอกลูกค้า · ชื่องาน · <b>Sales</b> (พิมพ์ชื่อหรือเลือกจากรายชื่อ) · ที่มาของงาน · ผู้ติดต่อ',
          'กรอกมูลค่าประมาณการ · Margin · Estimator · จำนวน BOQ และ<b>กำหนดยื่นใบเสนอราคา (Due date)</b>',
          'แนบไฟล์ได้ (ใบเสนอราคา, TOR, แบบ, BOQ) แล้วกด <b>บันทึก</b>',
        ] },
        { h: 'เลื่อนขั้นและบันทึกผล', steps: [
          'ใน <b>Board</b> กดปุ่ม <b>→ Estimate / → Proposal / → Submit</b> บนการ์ด — ระบบบันทึกวันที่เข้าขั้น = วันนี้',
          'งานที่ยื่นแล้วมีปุ่ม <b>✓ Won</b> / <b>✕ Lost</b>',
          'กด Won แล้วระบบถามว่าจะ<b>สร้าง Project</b>เลยหรือไม่ (หรือกด <b>+ Create project</b> ภายหลัง) — ชื่องาน ลูกค้า มูลค่า และ Sales ถูกยกไปให้',
          'ต้องแก้วันที่ย้อนหลัง: กดการ์ดเพื่อเปิดฟอร์ม (วันที่แต่ละขั้นต้องเรียง Inquiry → Estimate → Proposal → Submit)',
        ] },
        { h: 'ดูข้อมูล', items: [
          'แท็บด้านบน: <b>ภาพรวม</b> และหน้าแยกของแต่ละขั้น (ดู <a href="#/help/bidstage">หน้าแต่ละขั้น Bidding</a>)',
          'เลือกช่วงเวลา 90 วัน / 12 เดือน / YTD / ทั้งหมด · กรองตาม Sales · ค้นหา bid / ลูกค้า / Sales',
          'สลับ <b>Board</b> (การ์ดตามขั้น) / <b>Table</b> (ทะเบียน Bid ทั้งหมด)',
          'ตาราง <b>ผลงาน Sales</b>: กดแถวเพื่อกรองเฉพาะ Sales คนนั้น · 📎 บนการ์ด = เปิดไฟล์แนบ',
          'ป้าย Due: <b>Overdue</b> = เลยกำหนดยื่น · <b>Due 5d</b> = เหลือไม่เกิน 5 วัน',
        ] },
      ],
    },
    {
      key: 'bidstage', title: 'หน้าแต่ละขั้น Bidding', icon: 'estimate', route: '#/bidding/inquiry',
      intro: 'Inquiry · Estimate · Proposal · Submit · Award มีหน้าของตัวเอง — เปิดจากแท็บในหน้า Bidding, เมนูย่อยใต้ Bidding, กดขั้นใน Flow, หัวคอลัมน์ใน Bid board หรือ "เพิ่มเติม" บนมือถือ',
      blocks: [
        { h: 'หน้า Inquiry / Estimate / Proposal / Submit', items: [
          '<b>KPI ของขั้น</b>: งานในขั้นตอนนี้ · เข้าขั้นนี้ (conversion จาก Inquiry) · เวลาเฉลี่ย · เลยกำหนดยื่น · ชั่วโมงจาก Timesheet · ตัวเลขเฉพาะขั้น (ยังไม่ระบุ Sales / BOQ items / Margin เฉลี่ย / รอผลเฉลี่ย)',
          '<b>งานที่อยู่ในขั้นนี้ตอนนี้</b> เรียงตาม Due date — ปุ่มท้ายแถวเลื่อนไปขั้นถัดไป (หรือ Won / Lost ที่ขั้น Submit) · กดแถวเพื่อแก้ไข',
          '<b>ผ่านขั้นนี้แล้ว</b>: เข้า–ออกขั้นเมื่อไร ใช้เวลากี่วัน และสถานะตอนนี้',
          'ชั่วโมงของขั้นมาจาก Timesheet แถว Bid ที่เลือกขั้นตอนนั้น (ดู <a href="#/help/timesheet">Timesheet</a>)',
        ] },
        { h: 'หน้า Award', items: [
          '<b>รอผลการประมูล</b>: บันทึก ✓ Won / ✕ Lost / No-bid ได้ในแถว',
          '<b>ได้งาน (Won)</b>: ปุ่ม + Create project / Open project — การ์ด KPI บอกจำนวน Won ที่ยังไม่สร้างโครงการ',
          'ผลรายเดือน และ Win rate แยกตาม Sector',
        ] },
        { tip: 'ช่วงเวลา, Sales และคำค้นหา ใช้ร่วมกับหน้า Bidding ภาพรวม — เปลี่ยนที่หน้าไหนก็มีผลทุกหน้า' },
      ],
    },
    {
      key: 'projects', title: 'Projects (EPC)', icon: 'building', route: '#/projects',
      intro: 'ทุกโครงการพร้อม Phase ปัจจุบัน Progress แผน vs จริง SPI / CPI — กดโครงการเพื่อดูรายละเอียด',
      blocks: [
        { h: 'สร้างโครงการ', steps: [
          'กด <b>+ New project</b> (หรือสร้างจาก Bid ที่ Won) — Project No. รันให้อัตโนมัติ เช่น JB26-PROJ-0001',
          'เลือก <b>Project Manager</b> — รายชื่อมาจาก Resource Utilization พร้อม Utilization 4 สัปดาห์และจำนวนโครงการที่ดูแลอยู่',
          'กรอกมูลค่าสัญญา · <b>Plan cost</b> (ระบบแบ่งให้ E / P / C / Closing อัตโนมัติ) · วันเริ่ม–วันจบ',
        ] },
        { h: 'หน้ารายละเอียดโครงการ (แท็บ)', items: [
          '<b>Overview & EPC</b>: กด <b>Update</b> ที่แต่ละ Phase เพื่ออัปเดต % progress, ปริมาณ และวันที่ · กราฟ S-Curve · ปุ่ม <b>Plan cost</b> แก้งบแต่ละ Phase',
          '<b>ค่าใช้จ่าย · Cost</b>: <b>+ ค่าใช้จ่าย</b> บันทึกทีละรายการ (วันที่ · รายการ · จำนวนเงิน · Phase · หมวด · ผู้ขาย · อ้างอิง PO) · Export CSV — Actual cost = ผลรวมรายการ',
          '<b>Quality · NCR</b>: + New NCR และกด Close เมื่อแก้ไขแล้ว',
          '<b>Safety</b>: + Monthly record (man-hours, LTI, recordable, first aid, near miss) → คำนวณ LTIFR / TRIR',
          '<b>Team & Hours</b>: ชั่วโมงของทีมจาก Timesheet · <b>PO</b>: PO ของโครงการนี้',
        ] },
        { h: 'ค้นหาและกรอง', items: [
          'ค้นหาด้วย Project No. · ชื่อ · ลูกค้า · PM · Sales · เลข Bid (หลายคำได้) · กรอง Phase / สถานะ / PM / Sales · Active / Closed / All',
          'สูตร: SPI = EV ÷ PV (เวลา) · CPI = EV ÷ AC (ต้นทุน) · EAC = BAC ÷ CPI',
        ] },
      ],
    },
    {
      key: 'pos', title: 'Purchase Orders', icon: 'procurement', route: '#/pos',
      intro: 'PO ของทุกโครงการ — ผู้ขาย มูลค่า กำหนดส่ง สถานะ การจ่ายเงิน และไฟล์แนบ',
      blocks: [
        { h: 'ออก PO', steps: [
          'กด <b>+ New PO</b> เลือกโครงการ (PO No. รันให้อัตโนมัติ)',
          'กรอกผู้ขาย · หมวด · รายการ · มูลค่า · วันที่ออก PO · กำหนดส่งของ',
          'แนบไฟล์ได้ (PDF, รูป, Excel, Word, CSV, ZIP ไม่เกิน 20 MB ต่อไฟล์) แล้วกด <b>บันทึก PO</b>',
        ] },
        { h: 'ติดตาม', items: [
          'เปลี่ยน<b>สถานะ</b>จากตารางได้ทันที — Delivered / Closed เติมวันที่ส่งครบให้ · Closed = จ่ายครบ',
          'ตัวกรอง: ยังไม่ส่งครบ · เลยกำหนด · ส่งครบ / ปิด · ทั้งหมด และเลือกเฉพาะโครงการ',
          'ราคาอ้างอิงจากผู้ขายดูได้ที่ <a href="#/help/prices">Price List</a>',
        ] },
      ],
    },
    {
      key: 'prices', title: 'Price List / Vendor Cost', icon: 'tag', route: '#/prices',
      intro: 'ราคาต่อหน่วยของแต่ละผู้ขาย ใช้อ้างอิงตอนประมาณราคาและสั่งซื้อ — เปรียบเทียบผู้ขาย ดูประวัติราคา และ Export เป็น Excel / PDF',
      blocks: [
        { h: 'เพิ่มราคา', steps: [
          'กด <b>+ เพิ่มราคา</b>',
          'กรอก<b>รหัสสินค้า</b> (แนะนำ — ใช้จับคู่เปรียบเทียบผู้ขาย) · รายการ · Spec · หมวด',
          'กรอกผู้ขาย · ราคาต่อหน่วย (<b>ไม่รวม VAT</b>) · สกุลเงิน · หน่วย · MOQ · Lead time',
          'กรอกเลขที่ / วันที่ใบเสนอราคา และ<b>ราคาใช้ได้ถึง</b> แนบไฟล์ใบเสนอราคา แล้วกด <b>บันทึกราคา</b>',
        ] },
        { h: 'อัปเดตราคา', items: [
          'ผู้ขายเดิมส่งราคาใหม่: เปิดรายการเดิมแล้วแก้ราคา — ราคาเดิมถูกเก็บใน<b>ประวัติราคา</b> และตารางแสดง ▲▼ % เทียบราคาก่อน',
          'ผู้ขายใหม่ของสินค้าเดิม: เพิ่มเป็นรายการใหม่โดยใช้<b>รหัสสินค้าเดียวกัน</b> (หรือชื่อ + หน่วยเดียวกัน) เพื่อให้เปรียบเทียบกันได้',
        ] },
        { h: 'อ่านข้อมูล', items: [
          'ป้าย <b>ถูกสุด</b> = ราคาต่ำสุดของรายการเดียวกัน · ตาราง <b>เปรียบเทียบราคาผู้ขาย</b> แสดงต่ำสุด / สูงสุด / ส่วนต่าง %',
          'สถานะราคา: <b>ใช้ได้</b> · <b>เหลือ N วัน</b> (ไม่เกิน 30 วัน — ควรขอราคาใหม่) · <b>หมดอายุแล้ว</b>',
          'กรองตามหมวด · ผู้ขาย · สถานะ · ค้นหารหัส / รายการ / ผู้ขาย',
        ] },
        { h: 'Export Excel / PDF', steps: [
          'ตั้งตัวกรองให้ได้รายการที่ต้องการ (Export ตามตัวกรองที่เลือกอยู่)',
          '<b>⬇ Excel</b>: ดาวน์โหลดไฟล์ .xlsx 2 ชีต — Price List และเปรียบเทียบราคา',
          '<b>⬇ PDF</b>: เปิดรายงานในแท็บใหม่และหน้าต่างพิมพ์ขึ้นมา → เลือกเครื่องพิมพ์ <b>"บันทึกเป็น PDF" / "Save as PDF"</b> → บันทึก',
        ] },
        { tip: 'กด ⬇ PDF แล้วไม่มีอะไรขึ้น: เบราว์เซอร์บล็อก Pop-up — กดอนุญาต Pop-up ของเว็บนี้ (ไอคอนที่แถบที่อยู่) แล้วกดอีกครั้ง' },
      ],
    },
    {
      key: 'weekly', title: 'Weekly Plan', icon: 'calendar', route: '#/weekly',
      intro: 'วางแผนงานรายสัปดาห์ มอบหมายงานรายคน อัปเดตสถานะ และวัด PPC (งานเสร็จ ÷ งานในแผน — เป้า ≥ 80%)',
      blocks: [
        { h: 'วางแผน', steps: [
          'เลือกสัปดาห์ด้วยปุ่ม ‹ › (ปุ่ม <b>สัปดาห์นี้</b> กลับมาสัปดาห์ปัจจุบัน)',
          'กด <b>+ เพิ่มงาน</b> (หรือ ＋ ในช่องวันของปฏิทิน) กรอกงาน · โครงการ / Bid · Phase · ผู้รับผิดชอบ · ชั่วโมง · ปริมาณ · กำหนดเสร็จ',
          'ต้นสัปดาห์กด <b>ยกงานค้างจากสัปดาห์ก่อน</b> เพื่อยกงานที่ยังไม่เสร็จมา',
        ] },
        { h: 'ระหว่างสัปดาห์', items: [
          'อัปเดตสถานะ Planned → In progress → <b>Done</b> / <b>Not done</b> (เลือกสาเหตุ) — ทุก Role อัปเดตสถานะได้',
          'มุมมอง: <b>ปฏิทิน</b> (รายวัน / แยกตามคน) · <b>รายการงาน</b> · <b>ภาระงานรายคน</b> (ชั่วโมงตามแผนเทียบ capacity)',
          'บนคอมพิวเตอร์ <b>ลากการ์ด</b>ไปวันอื่นเพื่อเลื่อนกำหนด หรือไปแถวคนอื่นเพื่อเปลี่ยนผู้รับผิดชอบ',
          'ลบงานได้เฉพาะ<b>คนที่สร้างงานนั้น</b>',
        ] },
      ],
    },
    {
      key: 'resources', title: 'Resource Utilization', icon: 'gauge', route: '#/resources',
      intro: 'ภาระงานของทีมจาก Timesheet — Utilization = (ชั่วโมง Project + Bidding) ÷ (Capacity − Leave)',
      blocks: [
        { h: 'ใช้งาน', items: [
          'เลือกช่วง 4 สัปดาห์ / เดือนนี้ / 12 สัปดาห์',
          '<b>Add person</b>: เพิ่มพนักงาน (ชื่อ · Level · Discipline · Capacity ชั่วโมง/สัปดาห์) — ใส่ชื่อให้ตรงกับบัญชีผู้ใช้เพื่อให้ผูกกัน',
          'Heatmap รายสัปดาห์: กรอบแดง = เกิน 105% (งานล้น) · ตาราง People แสดงสถานะเทียบ Target ของ Level',
          'ตาราง <b>Levels</b>: กดเพื่อแก้อัตราค่าแรง (THB/ชม.) และ Utilization target',
        ] },
      ],
    },
    {
      key: 'timesheet', title: 'Timesheet', icon: 'clock', route: '#/timesheet',
      intro: 'บันทึกชั่วโมงทำงานรายสัปดาห์ต่อคน — ข้อมูลนี้ใช้คำนวณ Utilization ชั่วโมงโครงการ และชั่วโมง Bidding',
      blocks: [
        { h: 'กรอก Timesheet (เฉพาะ Project Manager)', steps: [
          'เลือกพนักงานและสัปดาห์',
          'เพิ่มแถว: เลือกงาน แล้วเลือก<b>ขั้นตอนย่อย</b> — โครงการเลือก Phase · Bid เลือกขั้น Inquiry / Estimate / Proposal / Submit (ค่าเริ่มต้น = ขั้นที่ Bid อยู่) · Overhead / Leave ไม่ต้องเลือก แล้วกด <b>+ Add row</b>',
          'หรือกด <b>+ แถวจาก Weekly Plan</b> / <b>Copy rows จากสัปดาห์ก่อน</b>',
          'กรอกชั่วโมงในแต่ละวัน — <b>บันทึกอัตโนมัติ</b>ขณะพิมพ์',
        ] },
        { h: 'ดูข้อมูล', items: [
          'Role อื่นเปิดดูได้อย่างเดียว (ตัวเลขชั่วโมงไม่มีช่องกรอก)',
          'ป้าย <b>OT</b> ใต้วัน = ชั่วโมงรวมของวันนั้นเกินปกติ',
          '<b>ชั่วโมง Bidding แยกตามขั้นตอน — ทั้งทีม</b>: ทุก Bid ที่มีชั่วโมงในสัปดาห์ แยกตามขั้น พร้อมรายชื่อผู้ลงชั่วโมง',
          '<b>Timesheet status — ทั้งทีม</b>: ใครกรอกครบ / ยังขาด — กด <b>เปิด</b> เพื่อดูของคนนั้น',
        ] },
      ],
    },
    {
      key: 'settings', title: 'Settings', icon: 'wrench', route: '#/settings',
      intro: 'บัญชีผู้ใช้ Role การซิงค์ Cloud และการสำรองข้อมูล',
      blocks: [
        { h: 'เมนูใน Settings', items: [
          '<b>บัญชีผู้ใช้</b>: แก้ชื่อที่แสดง · เปลี่ยนรหัสผ่าน · ออกจากระบบ',
          '<b>จัดการ Role ผู้ใช้</b> (Admin / Department Manager / Project Manager): ตั้ง Role ให้แต่ละคนตามกติกาในหัวข้อ <a href="#/help/roles">สิทธิ์ตาม Role</a> · Admin ลบบัญชีผู้ใช้ได้',
          '<b>Cloud</b>: ดูสถานะ และกด <b>ซิงค์ตอนนี้</b>',
          '<b>Backup & Restore</b>: Export JSON (สำรองทั้งระบบ) · Export Timesheet CSV · Import JSON (Admin / PM — <b>เขียนทับข้อมูลทั้งหมด</b>)',
          '<b>Reset ข้อมูล</b> (เฉพาะ Admin): ล้างทั้งหมด / โหลดข้อมูลตัวอย่าง — <b>Export สำรองก่อนเสมอ</b>',
        ] },
      ],
    },
    {
      key: 'roles', title: 'สิทธิ์ตาม Role', icon: 'lock',
      intro: 'สิ่งที่แต่ละ Role ทำได้ (ตารางนี้ดึงจากการตั้งค่าจริงของระบบ) — ทุก Role เปิดดูข้อมูลได้ทุกหน้า',
      blocks: [{ roles: true }],
    },
    {
      key: 'faq', title: 'คำถามที่พบบ่อย / แก้ปัญหา', icon: 'alert',
      intro: 'ปัญหาที่พบบ่อยและวิธีแก้',
      blocks: [
        { h: 'ข้อมูลไม่ขึ้น / ไม่ตรงกับเพื่อน', items: [
          'มุมขวาบนขึ้น <b>ยังส่งขึ้น Cloud ไม่ได้</b>: ตรวจอินเทอร์เน็ต — ข้อมูลยังอยู่ในเครื่องและส่งให้เองเมื่อออนไลน์ หรือกด <b>ลองใหม่</b>',
          'ไม่เห็นสิ่งที่เพื่อนเพิ่งแก้: สลับแท็บแล้วกลับมา, ดึงหน้าลงบนมือถือ หรือ Settings → <b>ซิงค์ตอนนี้</b>',
          'ถ้าสองคนแก้<b>รายการเดียวกัน</b>พร้อมกัน ค่าที่บันทึกทีหลังจะทับค่าก่อนหน้า',
        ] },
        { h: 'กดแล้วไม่มีปุ่ม / แก้ไขไม่ได้', items: [
          'ปุ่มแก้ไขแสดงตามสิทธิ์ของ Role — ดู <a href="#/help/roles">สิทธิ์ตาม Role</a> และขอให้ Admin / Department Manager / Project Manager ปรับ Role ให้',
          'มุมขวาบนขึ้น <b>ไม่มีสิทธิ์บันทึกข้อมูลบน Cloud</b>: บัญชียังไม่มี Role — ติดต่อ Admin',
        ] },
        { h: 'ไฟล์และการ Export', items: [
          'แนบไฟล์ไม่ได้: ไฟล์ต้องเป็น PDF / รูป / Excel / Word / CSV / ZIP และไม่เกิน 20 MB',
          'Export PDF ไม่ขึ้น: อนุญาต Pop-up ของเว็บนี้ แล้วกดใหม่ · ในหน้าต่างพิมพ์เลือก "บันทึกเป็น PDF"',
          'มีฟอร์มกรอกค้าง: เปิดฟอร์มชื่อเดิมอีกครั้ง ระบบกู้คืนสิ่งที่กรอกไว้ให้',
        ] },
        { h: 'สำหรับผู้ดูแลระบบ', items: [
          'อัปเดตเว็บเวอร์ชันที่บอกให้ "รัน supabase/…sql อีกครั้ง" — ดูในหน้า <a href="#/about">About</a> (Changelog) แล้วรันไฟล์นั้นใน Supabase → SQL Editor',
          'รายละเอียดการติดตั้ง Supabase และการตั้งค่าอีเมล อยู่ในไฟล์ README.md',
        ] },
      ],
    },
  ];

  const ROUTE_TOPIC = { dashboard: 'dashboard', bidding: 'bidding', bidstage: 'bidstage', projects: 'projects', project: 'projects', pos: 'pos', prices: 'prices', weekly: 'weekly', resources: 'resources', timesheet: 'timesheet', settings: 'settings', about: 'start' };
  H.topicFor = (route) => ROUTE_TOPIC[route] || null;

  function rolesTable() {
    const me = PM.auth && PM.auth.role;
    return `<p class="muted" style="margin:0 0 8px">Role ของคุณ: <b>${esc(PM.roleLabel(me))}</b> · กติกาการกำหนด Role: ${esc(PM.ROLE_RULES)}</p>
      <div class="table-wrap"><table class="tbl perm-matrix"><thead><tr><th>สิทธิ์</th>${PM.ROLES.map((r) => `<th class="c${r.key === me ? ' me' : ''}">${esc(r.label)}<small>${esc(r.th)}</small></th>`).join('')}</tr></thead><tbody>
      ${Object.keys(PM.PERMISSIONS).map((k) => `<tr><td>${esc(PM.PERMISSIONS[k].label)}</td>${PM.ROLES.map((r) => `<td class="c${r.key === me ? ' me' : ''}">${PM.PERMISSIONS[k].roles.includes(r.key) ? '<span class="yes">✓</span>' : '<span class="muted">–</span>'}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>`;
  }

  function block(b) {
    if (b.roles) return rolesTable();
    if (b.tip) return `<div class="help-tip">${PM.illus.svg('info')}<div>${b.tip}</div></div>`;
    return `<div class="help-block"><h3>${esc(b.h)}</h3>
      ${b.steps ? `<ol class="help-steps">${b.steps.map((s) => `<li>${s}</li>`).join('')}</ol>` : ''}
      ${b.items ? `<ul class="help-items">${b.items.map((s) => `<li>${s}</li>`).join('')}</ul>` : ''}</div>`;
  }
  const plain = (t) => [t.title, t.intro].concat(...t.blocks.map((b) => [b.h, b.tip].concat(b.steps || [], b.items || []))).join(' ').replace(/<[^>]+>/g, '').toLowerCase();

  let query = '';
  PM.views.help = function (el, args) {
    const active = args && args[0] && TOPICS.some((t) => t.key === args[0]) ? args[0] : null;
    el.innerHTML = `
      <div class="row">
        <input type="search" id="help-q" placeholder="ค้นหาในคู่มือ เช่น Export, PO, Timesheet…" value="${esc(query)}" style="width:320px">
        <span class="muted" id="help-count"></span>
      </div>
      <div class="help-layout">
        <nav class="help-toc" aria-label="หัวข้อคู่มือ">${TOPICS.map((t) => `<a href="#/help/${t.key}" data-topic="${t.key}" class="${t.key === active ? 'active' : ''}">${PM.illus.svg(t.icon)}<span>${esc(t.title)}</span></a>`).join('')}</nav>
        <div class="help-body">${TOPICS.map((t) => `
          <section class="card help-sec${t.key === active ? ' on' : ''}" id="help-${t.key}" data-topic="${t.key}">
            <div class="card-h" data-ic>${PM.illus.icon(t.icon, 'ch-ic')}<h2>${esc(t.title)}</h2>${t.route ? `<span class="spacer"></span><a class="btn sm" href="${t.route}">เปิดหน้านี้ →</a>` : ''}<p>${esc(t.intro)}</p></div>
            <div class="card-b">${t.blocks.map(block).join('')}</div>
          </section>`).join('')}
          <p class="empty" id="help-none" hidden>ไม่พบหัวข้อที่ตรงกับคำค้นหา</p>
        </div>
      </div>`;

    const filter = () => {
      const q = query.trim().toLowerCase();
      let n = 0;
      TOPICS.forEach((t) => {
        const hit = !q || q.split(/\s+/).every((w) => plain(t).includes(w));
        if (hit) n++;
        el.querySelector(`.help-sec[data-topic="${t.key}"]`).hidden = !hit;
        el.querySelector(`.help-toc [data-topic="${t.key}"]`).hidden = !hit;
      });
      el.querySelector('#help-none').hidden = n > 0;
      el.querySelector('#help-count').textContent = q ? `พบ ${n} หัวข้อ` : '';
    };
    filter();
    el.querySelector('#help-q').addEventListener('input', (e) => { query = e.target.value; filter(); });
    // a topic in the address (#/help/prices): bring it into view below the sticky top bar
    if (active) setTimeout(() => {
      const sec = el.querySelector('#help-' + active);
      if (sec && !sec.hidden) window.scrollTo(0, sec.getBoundingClientRect().top + window.scrollY - 84);
    }, 120); // after the page-change animation has laid the sections out
  };
})();
