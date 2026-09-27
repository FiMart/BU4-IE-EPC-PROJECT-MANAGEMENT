/* version.js — app version + changelog shown on the About page.
   When the website changes: bump PM.VERSION and add a new entry at the TOP of PM.CHANGELOG.
   type: 'feature' (ฟีเจอร์ใหม่) · 'improve' (ปรับปรุง) · 'fix' (แก้ไข) */
(function () {
  PM.VERSION = '1.9.0';

  PM.CHANGELOG = [
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
