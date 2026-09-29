# BU4 IE/EPC Project Management

**Flowlab & Service Co.,LTD** — ชื่อบริษัทถูกกำหนดตายตัวไว้ที่ `PM.COMPANY` ใน `assets/js/data.js` (แก้ในแอปไม่ได้)

Web app สำหรับบริหารโครงการแบบ EPC (Engineering → Procurement → Construction → Closing)
ครอบคลุมตั้งแต่ช่วงประมูลงานจนถึงส่งมอบ และการใช้ทรัพยากรบุคคล

## วิธีใช้งาน

เปิดไฟล์ `index.html` ด้วย Chrome / Edge ได้เลย — ไม่ต้องติดตั้งอะไร ไม่ต้องมี server แล้วเข้าสู่ระบบ

ข้อมูลทั้งหมดบันทึกบน **Supabase** อัตโนมัติ — เปิดเว็บใหม่ เปิดจากเครื่องอื่น หรือเปิดคนละ browser ก็เห็นข้อมูลเดิม และทุกคนในทีมเห็นข้อมูลชุดเดียวกัน
(ดูหัวข้อ "บันทึกข้อมูลบน Cloud" ด้านล่าง)

## Login / Register (Supabase Auth)

ระบบต้องเข้าสู่ระบบก่อนใช้งาน โดยใช้ Supabase Auth แบบอีเมล + รหัสผ่าน มีหน้า สมัครสมาชิก · เข้าสู่ระบบ · ลืมรหัสผ่าน · ตั้งรหัสผ่านใหม่
และในหน้า Settings แก้ชื่อที่แสดง / เปลี่ยนรหัสผ่าน / ออกจากระบบได้

ตั้งค่าครั้งแรก:

1. สร้างโปรเจกต์ที่ [supabase.com](https://supabase.com)
2. **Project Settings → API** คัดลอก **Project URL** และ **anon public key** (หรือ publishable key)
   ไปวางใน `assets/js/config.js` — ห้ามใช้ `service_role` / secret key
3. **Authentication → Sign In / Providers → Email** ต้องเปิดอยู่ และ **ปิด "Confirm email"** (ระบบนี้ใช้แบบไม่ยืนยันอีเมล)
   - สมัครแล้วเข้าใช้งานได้ทันที ใช้อีเมลโดเมนใดก็ได้
   - เหตุผล: ระบบส่งอีเมลในตัวของ Supabase ส่งได้เฉพาะอีเมลของสมาชิกทีม Supabase — ถ้าเปิด Confirm email ไว้ คนที่ใช้อีเมลโดเมนอื่นจะสมัครไม่ได้
   - คนที่สมัครไว้ก่อนปิด Confirm email: รัน [`supabase/confirm-users.sql`](supabase/confirm-users.sql) ใน SQL Editor เพื่อยืนยันให้
   - "ลืมรหัสผ่าน" ยังต้องส่งอีเมล — ดูหัวข้อ "ลืมรหัสผ่าน / ส่งอีเมล" ด้านล่าง

### ลืมรหัสผ่าน / ส่งอีเมล

ระบบส่งอีเมลในตัวของ Supabase **ส่งได้เฉพาะอีเมลสมาชิกทีม Supabase** และ **ประมาณ 2 ฉบับต่อชั่วโมง** — ใช้งานจริงต้องตั้ง Custom SMTP:

1. **Project Settings → Authentication → SMTP Settings → Enable Custom SMTP**
   - Google Workspace / Gmail: Host `smtp.gmail.com` · Port `587` · Username = อีเมลเต็ม · Password = **App Password** (ต้องเปิด 2-Step Verification)
   - Microsoft 365: Host `smtp.office365.com` · Port `587` · ต้องเปิด SMTP AUTH ให้ mailbox นั้น
   - Sender email เช่น `noreply@flowlabservice.co.th` · Sender name `BU4 IE/EPC Project Management`
2. **Authentication → Rate Limits** เพิ่มจำนวนอีเมลต่อชั่วโมง (เช่น 30)
3. **Authentication → URL Configuration** ตั้ง **Site URL** และ **Redirect URLs** เป็นที่อยู่เว็บจริง — ลิงก์ในอีเมลจะพากลับมาที่นี่ (เปิดแบบ `file://` จะกดลิงก์ไม่ได้)

ระหว่างยังไม่ได้ตั้ง SMTP: Admin ตั้งรหัสผ่านใหม่ให้ผู้ใช้ได้ด้วย [`supabase/reset-password.sql`](supabase/reset-password.sql) (แก้อีเมลและรหัสผ่านในไฟล์แล้ว Run ใน SQL Editor)
4. **Authentication → URL Configuration** ตั้ง **Site URL** เป็นที่อยู่ที่เปิดแอป และเพิ่มไว้ใน **Redirect URLs**
   ลิงก์ยืนยันอีเมลและลิงก์รีเซ็ตรหัสผ่านจะพากลับมาที่ URL นี้

> ลิงก์ในอีเมลกลับมาหาไฟล์ที่เปิดแบบ `file://` ไม่ได้ ถ้าต้องใช้ยืนยันอีเมล / ลืมรหัสผ่าน ให้เปิดแอปผ่าน http(s) เช่น
> ติดตั้ง extension **Live Server** ใน VS Code แล้วคลิกขวา `index.html` → *Open with Live Server* (ได้ `http://127.0.0.1:5500/index.html`)
> หรือ deploy ขึ้น Netlify / Vercel / GitHub Pages แล้วใช้ URL นั้นเป็น Site URL

## Role & Permission

มี 4 Role: **Admin · Project Manager · Engineer · Technician** เก็บในตาราง `public.profiles` ของ Supabase

ติดตั้งครั้งเดียว: เปิด **Supabase Dashboard → SQL Editor → New query** วางเนื้อหาไฟล์ [`supabase/roles.sql`](supabase/roles.sql) แล้วกด **Run** (รันซ้ำได้)

- ผู้ใช้คนแรกของระบบ (สมัครก่อนสุด) จะเป็น **Admin** อัตโนมัติ — คนที่สมัครหลังจากนั้นได้ **Technician**
- **เฉพาะ Admin** เปลี่ยน Role ได้ที่ Settings → จัดการ Role ผู้ใช้ (บังคับด้วย Row Level Security ในฐานข้อมูล ผู้ใช้แก้ Role ตัวเองไม่ได้)
- ลด Role ของ Admin คนสุดท้ายไม่ได้ (กันระบบไม่มี Admin)

| สิทธิ์ | Admin | Project Manager | Engineer | Technician |
| --- | --- | --- | --- | --- |
| Reset ข้อมูล (ล้างทั้งหมด / โหลด Demo) — หัวข้อนี้แสดงเฉพาะ Admin | ✓ | – | – | – |
| Import JSON | ✓ | ✓ | – | – |
| Export JSON / CSV | ✓ | ✓ | ✓ | ✓ |
| สร้าง / แก้ไขงานใน Weekly Plan | ✓ | ✓ | ✓ | – |
| ลบงานใน Weekly Plan | เฉพาะ **คนที่สร้างงานนั้น** (งานเดิมที่ไม่มีข้อมูลผู้สร้าง: Admin) — บังคับในฐานข้อมูลด้วย | | | |
| อัปเดตสถานะงานใน Weekly Plan | ✓ | ✓ | ✓ | ✓ |
| สร้าง / แก้ไข PO และแนบไฟล์ (ทุกคนดู / ดาวน์โหลดได้) | ✓ | ✓ | ✓ | – |
| บันทึก / แก้ไขค่าใช้จ่ายโครงการ (ทุกคนดูได้) | ✓ | ✓ | – | – |
| กำหนด Role ให้ผู้ใช้ | ✓ | – | – | – |

ปรับตารางสิทธิ์ได้ที่ `PM.PERMISSIONS` ใน `assets/js/roles.js`

## บันทึกข้อมูลบน Cloud

ติดตั้งครั้งเดียว (หลังรัน `roles.sql`): วางเนื้อหาไฟล์ [`supabase/data.sql`](supabase/data.sql) ใน **SQL Editor** แล้วกด **Run**
(ถ้าเคยรัน `data.sql` มาก่อน ให้รันไฟล์นี้ **อีกครั้ง** ทุกครั้งที่มีฟีเจอร์ใหม่ เช่น Weekly Plan, Purchase Orders, รายการค่าใช้จ่าย (v1.13) — ข้อมูลเดิมไม่หาย)
ไฟล์นี้สร้างที่เก็บไฟล์ PO (Storage bucket `po-files` แบบ private) ด้วย — ดูไฟล์ได้เฉพาะผู้ใช้ที่ login และมี Role

- ทุกการแก้ไขถูกส่งขึ้น Supabase อัตโนมัติภายใน ~1 วินาที — ดูสถานะได้ที่มุมขวาบน (● บันทึกบน Cloud แล้ว)
- เปิดเว็บใหม่: โหลดข้อมูลล่าสุดจาก Cloud เสมอ · กลับมาที่แท็บหลังจากไปทำอย่างอื่น ระบบดึงข้อมูลที่เพื่อนร่วมทีมแก้ไขให้อัตโนมัติ
- เน็ตหลุด: ข้อมูลยังเก็บในเครื่อง และส่งขึ้น Cloud ให้เองเมื่อกลับมาออนไลน์ (หรือเปิดเว็บครั้งถัดไป)
- ครั้งแรกที่ Cloud ยังว่าง: Admin / Project Manager จะถูกถามว่าจะอัปโหลดข้อมูลในเครื่องขึ้นไปหรือเริ่มจากข้อมูลว่าง
- Reset / Import บน Cloud ทำได้เฉพาะ Admin และ Project Manager (ตรวจสอบในฐานข้อมูลด้วย)
- ข้อมูลเก็บในตาราง `public.app_records` — 1 แถวต่อ 1 รายการ (bid, project, NCR, timesheet …) พร้อมเวลาและผู้แก้ไขล่าสุด

ข้อจำกัด: ถ้าสองคนแก้ **รายการเดียวกัน** พร้อมกัน ค่าที่บันทึกทีหลังจะทับค่าก่อนหน้า (แก้คนละรายการได้ตามปกติ)

## โมดูล

| เมนู | เนื้อหา | KPI |
| --- | --- | --- |
| **Dashboard** | สรุป 3 ส่วน: Bidding · Execution · Resource | ทั้งหมดในหน้าเดียว |
| **Bidding** (Before Award) | Board / Table: Inquiry → Estimate → Proposal → Submit → Won/Lost, สร้าง Project จาก bid ที่ชนะได้ทันที · แต่ละ bid มี **Sales ผู้หาลูกค้า** (พิมพ์ชื่อเองหรือเลือกจากรายชื่อ — ถ้าชื่อตรงกับพนักงาน/บัญชีผู้ใช้จะผูกกับคนนั้น ถ้าไม่ตรงจะเก็บเป็นชื่อที่พิมพ์), ที่มาของงาน (Lead source), ผู้ติดต่อฝั่งลูกค้า · กรองตาม Sales | **Quantity**: จำนวน inquiry, proposal, BOQ items · **Time**: วันเฉลี่ยในแต่ละ stage, cycle time, on-time submission · Win rate · **ผลงาน Sales** (inquiry, win rate, won value, pipeline, โครงการที่รับผิดชอบ) |
| **Projects (EPC)** | ทุกโครงการพร้อม phase ปัจจุบัน, progress plan vs actual, SPI/CPI, PM / Sales ผู้รับผิดชอบ (กรองตาม Sales ได้) | Portfolio health |
| **Project detail** | EPC phases (update progress / quantity / plan cost), S-Curve, **ค่าใช้จ่าย** (บันทึกทีละรายการ: วันที่ · รายการ · จำนวนเงิน · phase · หมวด · ผู้ขาย · เลขที่เอกสาร · อ้างอิง PO, Export CSV, กราฟต้นทุนสะสม PV / EV / AC), NCR log, Safety รายเดือน, ชั่วโมงทีมงาน | **Quantity** · **Time** (SPI) · **Cost** (CPI, EAC — Actual cost = ผลรวมรายการค่าใช้จ่าย) · **Quality** (NCR) · **Safety** (LTIFR, TRIR) |
| **Purchase Orders** | PO ของทุกโครงการ (หน้า Purchase Orders + แท็บ PO ในแต่ละโครงการ): ผู้ขาย · รายการ · มูลค่า · วันที่ PO · กำหนดส่ง · สถานะ · จ่ายแล้ว · **ไฟล์แนบ** (PDF/รูป/Excel/Word ≤ 20 MB, เก็บใน Supabase Storage) | มูลค่า PO (Committed) เทียบ Plan cost · เลยกำหนดส่ง · ส่งภายใน 14 วัน · % จ่ายแล้ว — สรุปบน Dashboard |
| **Weekly Plan** | วางแผนงานรายสัปดาห์ (งาน · โครงการ/bid · phase · ผู้รับผิดชอบ · ชั่วโมง · ปริมาณ · กำหนดเสร็จ), อัปเดตสถานะ Planned → In progress → Done / Not done + สาเหตุ, ยกงานค้างไปสัปดาห์ถัดไป, ดูภาระงานรายคน, ดึงเป็นแถวใน Timesheet | **PPC** = งานเสร็จ ÷ งานในแผน (เป้า ≥ 80%), สาเหตุงานไม่เสร็จ, ชั่วโมงตามแผน vs capacity |
| **Resource Utilization** | Utilization ตาม **Level**, heatmap loading รายสัปดาห์, รายคน, ตั้งค่า level (rate, target) | Utilization vs target, over/under allocation |
| **Timesheet** | กรอกชั่วโมงรายสัปดาห์ต่อคน (Project+Phase / Bid / Overhead / Leave), สถานะการกรอกของทั้งทีม | Timesheet completeness |

## สูตรที่ใช้

- Progress รวม = Σ(weight × progress ของ phase)
- PV = Σ(budget × planned%) · EV = Σ(budget × actual%) · AC = Σ(รายการค่าใช้จ่าย) · SPI = EV/PV · CPI = EV/AC · EAC = BAC/CPI
- โครงการที่มีจากก่อน v1.13: Actual cost ที่เคยกรอกไว้ถูกยกมาเป็นรายการ "Opening balance" (1 รายการต่อ phase, ลงวันที่วันที่อัปเดต)
- สถานะ: ≥ 0.95 On track · 0.90–0.95 At risk · < 0.90 Off track
- LTIFR = LTI × 1,000,000 / man-hours · TRIR = (Recordable + LTI) × 200,000 / man-hours
- Utilization = (Project + Bidding hours) / (Capacity − Leave)

## เวอร์ชันและ Changelog

หน้า **About** (เมนูล่างสุด) แสดงเวอร์ชันปัจจุบันและประวัติการแก้ไขเว็บไซต์ทั้งหมด
เมื่อแก้ไขเว็บไซต์ ให้เปิด `assets/js/version.js` แล้ว

1. เปลี่ยน `PM.VERSION` เป็นเลขใหม่ (เช่น `1.9.1` แก้ไขเล็กน้อย · `1.10.0` ฟีเจอร์ใหม่)
2. เพิ่มรายการใหม่ไว้**บนสุด**ของ `PM.CHANGELOG` (version · date · type · title · items)

ผู้ใช้จะเห็นป้าย **"ใหม่"** ที่เมนู About จนกว่าจะเปิดดูหน้านั้น

## โครงสร้างไฟล์

```text
index.html
assets/css/styles.css        theme สว่าง/มืด, responsive
assets/css/motion.css        animation + visual polish (ปิดอัตโนมัติเมื่อ OS ตั้ง "reduce motion")
assets/js/motion.js          page entrance + ตัวเลข KPI นับขึ้น
assets/js/data.js            ข้อมูล, demo seed, สูตร KPI
assets/js/ui.js              format, badge, modal, tooltip
assets/js/charts.js          กราฟ SVG (ไม่ใช้ library ภายนอก)
assets/js/app.js             router
assets/js/version.js         เวอร์ชัน + ประวัติการแก้ไข (หน้า About)
assets/js/config.js          Supabase URL + anon key (ต้องกรอก)
assets/js/auth.js            login / register / reset password (Supabase Auth)
assets/js/roles.js           Role + ตารางสิทธิ์ + เรียก Supabase profiles
assets/js/cloud.js           ซิงค์ข้อมูลทั้งหมดกับ Supabase (บันทึกอัตโนมัติ / โหลดเมื่อเปิดเว็บ)
supabase/roles.sql           SQL สร้างตาราง profiles, RLS, trigger (รันใน Supabase ก่อน)
supabase/data.sql            SQL สร้างตาราง app_records สำหรับเก็บข้อมูลทั้งหมด (รันต่อจาก roles.sql)
assets/js/views/*.js         แต่ละหน้า (weekly.js = Weekly Plan, costs.js = รายการค่าใช้จ่ายโครงการ)
```
