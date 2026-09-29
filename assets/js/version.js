/* version.js — app version + changelog shown on the About page.
   When the website changes: bump PM.VERSION and add a new entry at the TOP of PM.CHANGELOG.
   type: 'feature' (ฟีเจอร์ใหม่) · 'improve' (ปรับปรุง) · 'fix' (แก้ไข) */
(function () {
  PM.VERSION = '1.14.2';

  PM.CHANGELOG = [
    {
      version: '1.14.2', date: '2026-09-29', type: 'improve', title: 'เพิ่ม Level "Other"',
      items: [
        'Level ของพนักงานมี 3 ระดับ: Engineer · Technician · Other — เลือกได้ใน Add person และแสดงในกราฟ Utilization by level (หน้า Resource Utilization และ Dashboard) และตาราง Levels',
        'Level Other ตั้งต้น Rate 500 บาท/ชม. · Target 80% (แก้ได้ที่ตาราง Levels) · ข้อมูลเดิมไม่เปลี่ยน — พนักงานเดิมยังอยู่ Level เดิม',
      ],
    },
    {
      version: '1.14.1', date: '2026-09-29', type: 'improve', title: 'เลือก Project Manager จาก Resource Utilization',
      items: [
        'ฟอร์ม New / Edit project: รายชื่อ Project Manager มาจาก Resource Utilization เป็นหลัก — พนักงาน Discipline "Project Management" อยู่บนสุด ตามด้วยพนักงานอื่น',
        'แต่ละชื่อแสดง Level · Utilization 4 สัปดาห์ล่าสุด · จำนวนโครงการอื่นที่เป็น PM อยู่ และใต้ช่องแสดงรายละเอียดของคนที่เลือก (เทียบเป้า, งานล้น / ยังรับงานเพิ่มได้, รหัสโครงการ)',
        'บัญชีผู้ใช้ที่มีชื่อตรงกับพนักงานใน Resource Utilization ถูกรวมเป็นคนเดียวกัน (โครงการเดิมที่ผูกกับบัญชีจะเลือกพนักงานคนนั้นให้อัตโนมัติเมื่อเปิดแก้ไข) · บัญชีที่ยังไม่มีใน Resource ยังเลือกได้ในกลุ่มท้ายสุด',
      ],
    },
    {
      version: '1.14.0', date: '2026-09-29', type: 'improve', title: 'ปรับ layout และ animation บนมือถือ · พิมพ์ชื่อ Sales ได้เอง',
      items: [
        'มือถือ: แก้ตารางที่แสดงเป็นการ์ดให้มีระยะขอบถูกต้อง (เดิมตัวหนังสือชิดขอบและมีเส้นดำคั่น)',
        'มือถือ: KPI tile กระชับขึ้น (ตัวเลขเล็กลง ป้าย KPI อยู่บนชื่อ tile ทุกใบสูงเท่ากัน · tile เศษสุดท้ายเต็มแถว) · กราฟเตี้ยลงให้สมสัดส่วน · ตัวกรองวางคู่กัน 2 ช่องต่อแถว',
        'มือถือ: ปุ่มหลักของหน้า (+ New inquiry / project / PO, + เพิ่มงาน, + Add person) เป็นปุ่มลอยมุมขวาล่าง — หุบเหลือ "+" ตอนเลื่อนลง และกางออกตอนเลื่อนขึ้น',
        'Animation บนมือถือ: เนื้อหาเลื่อนขึ้นทีละส่วนตอนเปลี่ยนหน้า · การ์ดด้านล่างค่อยๆ ปรากฏและกราฟวาดตอนเลื่อนมาถึง · ฟอร์มเลื่อนขึ้นจากด้านล่าง · เมนูด้านข้างเลื่อนเข้าทีละรายการ · กดแล้วการ์ดยุบเล็กน้อย · แถบหัวมีเงาเมื่อเลื่อน · แท็บเลื่อนไปยังแท็บที่เลือก',
        'ยังปิด animation ทั้งหมดอัตโนมัติเมื่อเครื่องตั้งค่า "ลดการเคลื่อนไหว" (Reduce motion)',
        'Sales ใน Bid / Project พิมพ์ชื่อได้เอง หรือเลือกจากรายชื่อที่แนะนำ (Sales, บัญชีผู้ใช้, พนักงาน, ชื่อที่เคยกรอก) · ชื่อที่พิมพ์เองนับรวมในตาราง "ผลงาน Sales" และตัวกรองได้',
      ],
    },
    {
      version: '1.13.0', date: '2026-09-29', type: 'feature', title: 'บันทึกค่าใช้จ่ายรายการ และข้อมูล Sales',
      items: [
        'แท็บ "ค่าใช้จ่าย" ในแต่ละโครงการ: บันทึกค่าใช้จ่ายทีละรายการ (วันที่ / รายการ / จำนวนเงิน / phase / หมวด / ผู้ขาย / เลขที่เอกสาร / อ้างอิง PO) · Export CSV',
        'Actual cost คำนวณจากผลรวมรายการอัตโนมัติ (ไม่ต้องกรอกยอดสะสมเอง) — ยอดที่เคยกรอกไว้ถูกยกมาเป็นรายการ "Opening balance" ของแต่ละ phase',
        'กราฟต้นทุนสะสมตามเวลา (PV / EV / AC) · ค่าใช้จ่ายรายเดือน · แยกตามหมวด · สรุปค่าใช้จ่ายรายเดือนและ Actual เทียบ Plan cost บน Dashboard',
        'Bid: เพิ่ม Sales ผู้หาลูกค้า, ที่มาของงาน (Lead source) และผู้ติดต่อฝั่งลูกค้า · Project: เพิ่ม Sales ผู้รับผิดชอบ (ดึงจาก Bid อัตโนมัติ)',
        'ตาราง "ผลงาน Sales" (Inquiry, Win rate, Won value, Pipeline, โครงการที่รับผิดชอบ) บนหน้า Bidding และ Dashboard · กรอง Bid / Project ตาม Sales',
        'สิทธิ์ใหม่ "บันทึก / แก้ไขค่าใช้จ่ายโครงการ" (Admin, Project Manager) · ต้องรัน supabase/data.sql อีกครั้งเพื่อเก็บรายการค่าใช้จ่ายบน Cloud',
      ],
    },
    {
      version: '1.12.0', date: '2026-09-29', type: 'feature', title: 'Purchase Orders (PO)',
      items: [
        'บันทึก PO ในแต่ละโครงการ พร้อมแนบไฟล์ (PDF, รูปภาพ, Excel, Word) เก็บบน Supabase Storage',
        'ติดตามสถานะ PO: ออก PO → ผู้ขายยืนยัน → ส่งของบางส่วน → ส่งครบ → ปิด PO · แจ้งเตือนเลยกำหนดส่ง · ติดตามการจ่ายเงิน',
        'หน้า Purchase Orders รวมทุกโครงการ · แท็บ PO ในแต่ละโครงการ · สรุป PO บน Dashboard',
        'แสดงมูลค่า PO ที่สั่งแล้ว (Committed) เทียบ Plan cost ของโครงการ',
      ],
    },
    {
      version: '1.11.0', date: '2026-09-29', type: 'feature', title: 'Plan cost / Actual cost และ Project Manager',
      items: [
        'แสดง Plan cost, Actual cost, คงเหลือ / เกินงบ และ EAC ของแต่ละโครงการ (หัวโครงการ, ตาราง EPC Phases, รายการโครงการ)',
        'ปุ่ม "ต้นทุน Plan / Actual" แก้ต้นทุนทุก phase ได้ในฟอร์มเดียว · แก้ Plan cost ของโครงการแล้วระบบปรับงบแต่ละ phase ตามสัดส่วน',
        'แก้ปัญหาเลือก Project Manager แล้วไม่ขึ้นชื่อ — รายการแสดงบัญชีผู้ใช้ที่เป็น Project Manager (ต้องรัน supabase/roles.sql อีกครั้ง)',
      ],
    },
    {
      version: '1.10.0', date: '2026-09-28', type: 'feature', title: 'หุบ / ขยายเมนูด้านข้าง',
      items: [
        'ปุ่มหุบ / ขยายเมนูด้านข้าง (จอคอม) — หุบแล้วเหลือแต่ไอคอน พื้นที่ทำงานกว้างขึ้น',
        'ชี้ที่ไอคอนเพื่อดูชื่อเมนู · ระบบจำการตั้งค่าไว้ในเครื่อง',
      ],
    },
    {
      version: '1.9.7', date: '2026-09-28', type: 'improve', title: 'ปุ่มเลือกสัปดาห์',
      items: [
        'ปุ่มเลือกสัปดาห์แบบใหม่ใน Weekly Plan และ Timesheet: ‹ ช่วงวันที่ › พร้อมเลขสัปดาห์และสถานะ (สัปดาห์นี้ / สัปดาห์หน้า / …)',
        'ปุ่ม "สัปดาห์นี้" มีไอคอนปฏิทิน และไฮไลต์เมื่อกำลังดูสัปดาห์ปัจจุบัน',
      ],
    },
    {
      version: '1.9.6', date: '2026-09-28', type: 'improve', title: 'ปรับ Layout บนมือถือ',
      items: [
        'ตารางบนมือถือเป็นการ์ดแบบกระชับ แสดงข้อมูล 2 คอลัมน์ (ชื่อหัวข้ออยู่เหนือค่า) — สั้นลงประมาณครึ่งหนึ่ง',
        'Progress bar, dropdown, ปุ่ม และข้อความยาวแสดงเต็มความกว้างการ์ด',
        'Weekly Plan มุมมอง "แยกตามคน" บนมือถือแสดงเป็นรายการของแต่ละคน แทนตารางที่ต้องเลื่อนด้านข้าง',
      ],
    },
    {
      version: '1.9.5', date: '2026-09-28', type: 'fix', title: 'ลืมรหัสผ่าน',
      items: [
        'ข้อความแจ้งสาเหตุที่ชัดเจนเมื่อส่งอีเมลรีเซ็ตรหัสผ่านไม่ได้ (อีเมลนอกทีม / ครบโควตาอีเมลต่อชั่วโมง)',
        'หน้าจอหลังขอรีเซ็ตรหัสผ่านมีคำแนะนำเมื่อไม่ได้รับอีเมล',
        'เพิ่ม supabase/reset-password.sql ให้ Admin ตั้งรหัสผ่านใหม่ให้ผู้ใช้ได้โดยไม่ต้องใช้อีเมล',
      ],
    },
    {
      version: '1.9.4', date: '2026-09-28', type: 'fix', title: 'ข้อความตอนสมัครด้วย Gmail',
      items: ['แก้ข้อความ "รูปแบบอีเมลไม่ถูกต้อง" ที่ขึ้นผิด เมื่อ Supabase ไม่รับอีเมลเพราะยังเปิด Confirm email — ตอนนี้บอกสาเหตุจริงและวิธีแก้'],
    },
    {
      version: '1.9.3', date: '2026-09-28', type: 'improve', title: 'ลด Animation ให้เหมาะกับการใช้งาน',
      items: [
        'เปลี่ยนหน้าแบบ fade สั้น ๆ แทนการเลื่อนขึ้นทีละส่วน',
        'เอา animation ที่วนไม่หยุด เด้ง และการยกการ์ดตอนชี้เมาส์ออก',
        'กราฟ ตัวเลข และฟอร์มแสดงผลเร็วขึ้น (ไม่เกินครึ่งวินาที)',
      ],
    },
    {
      version: '1.9.2', date: '2026-09-28', type: 'improve', title: 'Levels เหลือ Engineer และ Technician',
      items: [
        'หัวข้อ Levels ใน Resource Utilization แสดงเฉพาะ Engineer และ Technician',
        'ย้ายพนักงานจาก Level เดิมอัตโนมัติ: L1 (Junior) → Technician, L2–L5 → Engineer',
      ],
    },
    {
      version: '1.9.1', date: '2026-09-28', type: 'improve', title: 'สมัครสมาชิกโดยไม่ต้องยืนยันอีเมล',
      items: [
        'สมัครแล้วเข้าใช้งานได้ทันที ไม่ต้องยืนยันอีเมล (ปิด Confirm email ใน Supabase)',
        'สมัครด้วยอีเมลโดเมนใดก็ได้ ไม่จำกัดเฉพาะ @flowlabservice.co.th',
        'ข้อความแจ้งเตือนภาษาไทยที่ชัดเจนขึ้นเมื่อสมัครหรือเข้าสู่ระบบไม่ได้',
      ],
    },
    {
      version: '1.9.0', date: '2026-09-27', type: 'feature', title: 'ไอคอนเว็บ และหน้า About',
      items: [
        'เพิ่มไอคอน BU4 บนแท็บ browser และไอคอนสำหรับเพิ่มลงหน้าจอหลักบนมือถือ',
        'เพิ่มหน้า About แสดงเวอร์ชันปัจจุบันและประวัติการแก้ไขเว็บไซต์',
      ],
    },
    {
      version: '1.8.3', date: '2026-09-27', type: 'improve', title: 'Level ของพนักงาน',
      items: [
        'ช่อง Level ใน Add person เหลือเฉพาะ Engineer และ Technician',
        'แสดงชื่อ Level แทนรหัสในทุกหน้า',
      ],
    },
    {
      version: '1.8.2', date: '2026-09-27', type: 'improve', title: 'ปรับสิทธิ์และเมนู',
      items: [
        'หัวข้อ Reset ข้อมูลแสดงและใช้ได้เฉพาะ Admin',
        'นำข้อความใต้ Account ในเมนูออก',
      ],
    },
    {
      version: '1.8.1', date: '2026-09-27', type: 'improve', title: 'สิทธิ์การลบงานใน Weekly Plan',
      items: [
        'ลบงานใน Weekly Plan ได้เฉพาะคนที่สร้างงานนั้น (งานเดิมที่ไม่มีข้อมูลผู้สร้าง: Admin)',
        'แสดง "สร้างโดย" ในฟอร์มและการ์ดงาน',
      ],
    },
    {
      version: '1.8.0', date: '2026-09-27', type: 'feature', title: 'Weekly Plan แบบปฏิทิน',
      items: [
        'มุมมองปฏิทินรายวัน (จันทร์–อาทิตย์) และแยกตามคน',
        'ลากการ์ดเพื่อเลื่อนวันหรือเปลี่ยนผู้รับผิดชอบ · ปุ่ม ＋ เพิ่มงานในวันนั้น',
      ],
    },
    {
      version: '1.7.0', date: '2026-09-27', type: 'feature', title: 'Weekly Plan',
      items: [
        'วางแผนงานรายสัปดาห์ อัปเดตสถานะ และบันทึกสาเหตุงานไม่เสร็จ',
        'PPC (Percent Plan Complete) ภาระงานรายคน และยกงานค้างไปสัปดาห์ถัดไป',
        'ดึงงานจาก Weekly Plan เป็นแถวใน Timesheet',
      ],
    },
    {
      version: '1.6.0', date: '2026-09-27', type: 'improve', title: 'รองรับมือถือและแท็บเล็ต (Responsive)',
      items: [
        'เมนูแบบลิ้นชักบนมือถือ ตารางเปลี่ยนเป็นการ์ด ฟอร์มแบบ bottom sheet',
        'ปุ่มและช่องกรอกขนาดเหมาะกับการแตะ',
      ],
    },
    {
      version: '1.5.1', date: '2026-09-27', type: 'improve', title: 'เลขที่โครงการ',
      items: ['Project No. อัตโนมัติรูปแบบ JB26-PROJ-xxxx และป้องกันเลขซ้ำ'],
    },
    {
      version: '1.5.0', date: '2026-09-27', type: 'feature', title: 'บันทึกข้อมูลบน Cloud',
      items: [
        'ข้อมูลทั้งหมดบันทึกบน Supabase อัตโนมัติ เปิดเครื่องไหนก็เห็นข้อมูลเดียวกัน',
        'ทำงานออฟไลน์ได้ และส่งข้อมูลขึ้น Cloud เมื่อกลับมาออนไลน์',
      ],
    },
    {
      version: '1.4.0', date: '2026-09-27', type: 'feature', title: 'Role & Permission',
      items: [
        'Role: Admin, Project Manager, Engineer, Technician',
        'กำหนด Role ผู้ใช้ได้เฉพาะ Admin',
      ],
    },
    {
      version: '1.3.0', date: '2026-09-27', type: 'improve', title: 'ชื่อเว็บไซต์และธีม',
      items: [
        'ชื่อเว็บไซต์ BU4 IE/EPC Project Management',
        'ล็อคชื่อบริษัท Flowlab & Service Co.,LTD',
        'ธีมสีฟ้า–น้ำเงิน',
      ],
    },
    {
      version: '1.2.0', date: '2026-09-27', type: 'improve', title: 'ดีไซน์และ Animation',
      items: ['Animation เปลี่ยนหน้า ตัวเลข KPI นับขึ้น กราฟเคลื่อนไหว', 'หน้า Login ใหม่'],
    },
    {
      version: '1.1.0', date: '2026-09-27', type: 'feature', title: 'Login / Register',
      items: ['เข้าสู่ระบบ สมัครสมาชิก และลืมรหัสผ่านด้วย Supabase Auth'],
    },
    {
      version: '1.0.0', date: '2026-09-27', type: 'feature', title: 'เปิดใช้งานระบบ',
      items: [
        'Dashboard · Bidding (Inquiry → Estimate → Proposal → Submit)',
        'Projects EPC (Engineering → Procurement → Construction → Closing) พร้อม KPI Quantity · Time · Cost · Quality (NCR) · Safety',
        'Resource Utilization · Timesheet · Export / Import ข้อมูล',
      ],
    },
  ];
})();
