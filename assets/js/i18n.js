/* i18n.js — Thai-first labels + plain-language glossary (loaded after app.js)
   The views are written with English labels; this layer shows them in Thai.
   Safety: only UI chrome is touched (headings, column headers, tiles, badges, buttons, form labels —
   see SEL), only text that matches a known label EXACTLY (or a pattern in RULES), never input values,
   and <option> elements only when they carry their own value="" (so a saved value can't change).
   Glossary: column headers / tile labels / legends that name a metric (SPI, CPI, EAC …) get an ⓘ
   with what it means and what is good or bad (the shared tooltip shows it — hover, or tap on phones). */
(function () {
  const D = {
    // statuses & results
    'On track': 'ตามแผน', 'At risk': 'เฝ้าระวัง', 'Off track': 'ต้องแก้ไข', 'No data': 'ไม่มีข้อมูล',
    'Slightly behind': 'ช้ากว่าแผนเล็กน้อย', 'Behind': 'ช้ากว่าแผน', 'On plan': 'ตามแผน', 'Complete': 'เสร็จแล้ว', 'Not started': 'ยังไม่เริ่ม', 'In progress': 'กำลังทำ',
    'Done': 'เสร็จ', 'Open': 'เปิดอยู่', 'Closed': 'ปิดแล้ว', 'Active': 'ดำเนินการอยู่', 'All': 'ทั้งหมด',
    'Won': 'ชนะ', 'Lost': 'แพ้', 'No-bid': 'ไม่ยื่น', 'Won / Lost': 'ชนะ / แพ้', 'Lost / No-bid': 'แพ้ / ไม่ยื่น',
    'Won / Lost / No-bid': 'ชนะ / แพ้ / ไม่ยื่น', '✓ Won': '✓ ชนะ', '✕ Lost': '✕ แพ้', 'On time': 'ตรงเวลา',
    'Over-allocated': 'งานล้นมือ', 'Optimal': 'เหมาะสม', 'Below target': 'ต่ำกว่าเป้า', 'Under-utilized': 'งานน้อย',
    'Critical': 'วิกฤต', 'Major': 'ร้ายแรง', 'Minor': 'เล็กน้อย', 'Action required': 'ต้องดำเนินการ', 'Pending close-out': 'รอปิดงาน',
    // pages & sections
    'Dashboard': 'ภาพรวม', 'Bidding': 'งานประมูล', 'Bidding Performance': 'ผลงานประมูล', 'Bids': 'งานประมูล', 'Bid board': 'บอร์ดงานประมูล',
    'Projects': 'โครงการ', 'Project': 'โครงการ', 'Project (EPC)': 'โครงการ (EPC)', 'Projects (EPC Execution)': 'โครงการ EPC',
    'Purchase Orders': 'ใบสั่งซื้อ (PO)', 'Purchase orders': 'ใบสั่งซื้อ (PO)', 'Price List / Vendor Cost': 'ราคาผู้ขาย', 'Price list': 'ราคาผู้ขาย',
    'Weekly Plan': 'แผนงานรายสัปดาห์', 'Resource Utilization': 'ภาระงานบุคลากร', 'Settings': 'ตั้งค่า', 'System': 'ระบบ',
    'Execution': 'งานโครงการ', 'Execution (EPC)': 'งานโครงการ (EPC)', 'EPC execution': 'งานโครงการ EPC', 'Before award': 'ก่อนได้งาน',
    'EPC Phases': 'ขั้นงาน EPC', 'Cost Project Overrun': 'โครงการที่ต้นทุนเกินงบ', 'Data summary': 'สรุปข้อมูล', 'Backup & Restore': 'สำรอง / กู้คืนข้อมูล',
    'Risk Matrix': 'ตารางระดับความเสี่ยง', 'Non-Conformance Report': 'รายงานงานไม่ได้มาตรฐาน (NCR)', 'Safety records': 'บันทึกความปลอดภัย',
    'Monthly safety records': 'บันทึกความปลอดภัยรายเดือน', 'Team': 'ทีม', 'Team members': 'สมาชิกทีม', 'Quality': 'คุณภาพ', 'Quality · NCR': 'คุณภาพ · NCR',
    'Safety': 'ความปลอดภัย', 'Quantity': 'ปริมาณงาน', 'Time': 'เวลา', 'Cost': 'ต้นทุน', 'Milestones': 'Milestone',
    'KPI: Quantity · Time · Cost · Quality (NCR) · Safety': 'KPI: ปริมาณงาน · เวลา · ต้นทุน · คุณภาพ (NCR) · ความปลอดภัย',
    'Level · Utilization · Loading': 'ระดับ · อัตราใช้งาน · ภาระงาน',
    // KPI tiles & chart titles
    'Active projects': 'โครงการที่ดำเนินการอยู่', 'Portfolio SPI': 'SPI รวมทุกโครงการ', 'Portfolio CPI': 'CPI รวมทุกโครงการ',
    'Contract value': 'มูลค่าสัญญา', 'Plan cost': 'ต้นทุนตามแผน', 'Actual cost': 'ต้นทุนจริง', 'Actual cost (AC)': 'ต้นทุนจริง (AC)',
    'Earned value': 'มูลค่างานที่ทำได้', 'Earned value (EV)': 'มูลค่างานที่ทำได้ (EV)', 'Planned value (PV)': 'มูลค่าตามแผน (PV)',
    'Plan cost vs Earned value vs Actual cost': 'ต้นทุนตามแผน · มูลค่างานที่ทำได้ · ต้นทุนจริง', 'Cost by phase': 'ต้นทุนตามขั้นงาน',
    'Cost performance': 'ประสิทธิภาพต้นทุน', 'Committed': 'ผูกพันแล้ว', 'Forecast': 'คาดการณ์', 'Revised': 'หลังปรับ', 'Unbilled': 'ยังไม่วางบิล',
    'Cumulative progress — Planned vs Actual (weighted by phase)': 'ความคืบหน้าสะสม — แผน เทียบ ทำได้จริง (ถ่วงน้ำหนักตามขั้นงาน)',
    'Quantity progress': 'ความคืบหน้าปริมาณงาน', 'Progress': 'ความคืบหน้า', 'Progress (actual vs plan)': 'ความคืบหน้า (จริง เทียบ แผน)',
    'Plan': 'แผน', 'Planned': 'แผน', 'Actual': 'จริง', 'Peak funding': 'เงินทุนสูงสุดที่ต้องใช้', 'Cash In': 'เงินรับ', 'Cash Out': 'เงินจ่าย',
    'Base': 'กรณีปกติ', 'Optimistic': 'กรณีดี', 'Conservative': 'กรณีระวัง', 'Scenario': 'กรณี',
    'Win rate': 'อัตราชนะ', 'Won value': 'มูลค่างานที่ได้', 'Win rate by sector': 'อัตราชนะตามกลุ่มลูกค้า', 'Pipeline (pending)': 'งานที่รอผล',
    'Inquiries': 'Inquiry', 'Inquiries received': 'Inquiry ที่ได้รับ', 'Inquiries per month': 'Inquiry ต่อเดือน', 'Proposals submitted': 'ข้อเสนอที่ยื่นแล้ว',
    'Avg cycle time': 'ระยะเวลาเฉลี่ย', 'On-time submission': 'ยื่นตรงเวลา', 'Average days in each stage': 'จำนวนวันเฉลี่ยในแต่ละขั้น',
    'BOQ items': 'รายการ BOQ', 'BOQ items estimated': 'รายการ BOQ ที่ประมาณราคา', 'Estimator workload': 'ภาระงานผู้ประมาณราคา',
    'Open NCR': 'NCR ที่เปิดอยู่', 'NCR open': 'NCR ที่เปิดอยู่', 'Total NCR': 'NCR ทั้งหมด', 'Critical open': 'วิกฤตที่ยังเปิด',
    'NCR by category': 'NCR ตามหมวด', 'NCR by phase': 'NCR ตามขั้นงาน', 'Avg days to close': 'วันเฉลี่ยที่ใช้ปิด',
    'Man-hours': 'ชั่วโมงทำงาน', 'Man-hours per month': 'ชั่วโมงทำงานต่อเดือน', 'Incidents per month': 'อุบัติเหตุต่อเดือน',
    'Months since LTI': 'เดือนนับจาก LTI ล่าสุด', 'Zero LTI': 'ไม่มี LTI', 'no LTI recorded': 'ไม่มี LTI', 'leading indicators': 'ตัวชี้วัดเชิงป้องกัน',
    'Toolbox talks': 'Toolbox talk', 'First aid': 'ปฐมพยาบาล', 'Near miss': 'เกือบเกิดเหตุ', 'First aid / Near miss': 'ปฐมพยาบาล / เกือบเกิดเหตุ',
    'Recordable': 'ต้องรายงาน', 'per 1,000,000 MH': 'ต่อ 1,000,000 ชม.ทำงาน', 'per 200,000 MH': 'ต่อ 200,000 ชม.ทำงาน',
    'weighted by contract value': 'ถ่วงน้ำหนักตามมูลค่าสัญญา', 'Time elapsed': 'เวลาที่ผ่านไป', 'From bid': 'มาจาก Bid',
    'Plan complete': 'ทำตามแผนได้', 'Tasks': 'งาน', 'Weekly plan tasks': 'งานในแผนรายสัปดาห์',
    'Utilization': 'อัตราใช้งาน', 'Utilization by level': 'อัตราใช้งานตามระดับ', 'Utilization vs target': 'อัตราใช้งานเทียบเป้า',
    'Resource loading (level) — weekly utilization': 'ภาระงานตามระดับ — รายสัปดาห์', 'Over / under allocated': 'งานล้น / งานน้อย',
    'Headcount': 'จำนวนคน', 'Hours': 'ชั่วโมง', 'Hours by category': 'ชั่วโมงตามหมวด', 'Hours by person': 'ชั่วโมงรายคน', 'Hours logged': 'ชั่วโมงที่ลงแล้ว',
    'Weekly hours by category': 'ชั่วโมงรายสัปดาห์ตามหมวด', 'Weekly hours by phase': 'ชั่วโมงรายสัปดาห์ตามขั้นงาน',
    'Available h': 'ชม. ที่มี', 'Available hours': 'ชั่วโมงที่มี', 'Billable h': 'ชม. คิดเงินได้', 'Billable hours': 'ชั่วโมงที่คิดเงินได้',
    'Billable ÷ Available': 'ชม.คิดเงินได้ ÷ ชม.ที่มี', 'Billable ÷ Available hours': 'ชม.คิดเงินได้ ÷ ชม.ที่มี', 'Bidding h': 'ชม. ประมูล',
    'Bidding hours': 'ชั่วโมงงานประมูล', 'Project h': 'ชม. โครงการ', 'Project hours': 'ชั่วโมงโครงการ', 'Overhead h': 'ชม. งานส่วนกลาง',
    'Overhead hours': 'ชั่วโมงงานส่วนกลาง', 'Leave h': 'ชม. ลา', 'Logged h': 'ชม. ที่ลง', 'Expected h': 'ชม. ที่ควรลง', 'Total h': 'รวม ชม.',
    'Timesheet completeness': 'ความครบของ Timesheet', 'Timesheet entries': 'รายการ Timesheet', 'Timesheet missing': 'ยังไม่ลง Timesheet',
    'Expense entries': 'รายการค่าใช้จ่าย', 'Storage used': 'พื้นที่ที่ใช้',
    // column headers & form labels
    'Client': 'ลูกค้า', 'Client / PM / Sales': 'ลูกค้า / PM / Sales', 'Contract / Cost': 'มูลค่าสัญญา / ต้นทุน', 'Health': 'สถานะ',
    'Phase': 'ขั้นงาน', 'Current phase': 'ขั้นงานปัจจุบัน', 'Status': 'สถานะ', 'Project status': 'สถานะโครงการ', 'Start': 'เริ่ม', 'Finish': 'วันจบ',
    'Due': 'กำหนด', 'Date': 'วันที่', 'Month': 'เดือน', 'Name': 'ชื่อ', 'Code': 'รหัส', 'Description': 'รายละเอียด', 'Category': 'หมวด',
    'Value': 'มูลค่า', 'Rate': 'อัตรา', 'Rate (THB/h)': 'อัตรา (บาท/ชม.)', 'Weight': 'น้ำหนัก', 'Target': 'เป้า', 'Remark': 'หมายเหตุ',
    'Responsible': 'ผู้รับผิดชอบ', 'Severity': 'ความรุนแรง', 'Supplier': 'ผู้ขาย', 'PO / Supplier': 'PO / ผู้ขาย', 'Lead time': 'ระยะเวลารอของ',
    'Age (d)': 'อายุ (วัน)', 'Last entry': 'ลงล่าสุด', 'Level': 'ระดับ', 'Levels': 'ระดับ', 'Discipline': 'สายงาน', 'Role': 'บทบาท',
    'Company': 'บริษัท', 'People': 'คน', 'Completeness': 'ความครบถ้วน', 'Retention (%)': 'เงินประกันผลงาน (%)', 'Contingency (%)': 'สำรองเผื่อ (%)',
    'Admin only': 'เฉพาะ Admin', 'Department Manager': 'ผู้จัดการแผนก', 'Project Manager': 'ผู้จัดการโครงการ', 'Project Management': 'บริหารโครงการ',
    'Engineer': 'วิศวกร', 'Technician': 'ช่างเทคนิค', 'Issue': 'ปัญหา',
    // categories & reasons (display only — stored values keep their own value="")
    'Material': 'วัสดุ', 'Labour': 'ค่าแรง', 'Subcontract': 'ผู้รับเหมาช่วง', 'Equipment': 'อุปกรณ์', 'Transport': 'ขนส่ง', 'Rental': 'ค่าเช่า',
    'Site expense': 'ค่าใช้จ่ายหน้างาน', 'Labour cost (in-house)': 'ค่าแรงพนักงาน', 'Overhead': 'งานส่วนกลาง', 'Other': 'อื่น ๆ', 'Leave': 'ลา',
    'Admin / Training': 'งานธุรการ / อบรม', 'Design': 'ออกแบบ', 'Documentation': 'เอกสาร', 'Workmanship': 'ฝีมือการทำงาน', 'Weather': 'สภาพอากาศ',
    'Material not ready': 'วัสดุยังไม่พร้อม', 'Drawing / design not ready': 'แบบ / การออกแบบยังไม่พร้อม', 'Manpower shortage': 'คนไม่พอ',
    'Equipment breakdown': 'เครื่องจักรเสีย', 'Waiting client approval': 'รอลูกค้าอนุมัติ', 'Previous work not finished': 'งานก่อนหน้ายังไม่เสร็จ',
    'Industrial': 'อุตสาหกรรม', 'Energy': 'พลังงาน', 'Infrastructure': 'โครงสร้างพื้นฐาน', 'Building': 'อาคาร', 'Oil & Gas': 'น้ำมันและก๊าซ',
    'Service': 'บริการ', 'Sales visit': 'Sales เข้าพบ', 'Existing customer': 'ลูกค้าเดิม', 'Referral': 'มีคนแนะนำ',
    'Tender invitation': 'ได้รับเชิญประมูล', 'Website / Inbound': 'เว็บไซต์ / ลูกค้าติดต่อเอง',
    // buttons
    'New inquiry': 'เพิ่ม Inquiry', 'New project': 'เพิ่มโครงการ', 'Create project': 'สร้างโครงการ', 'New PO': 'สร้าง PO', 'New NCR': 'เปิด NCR ใหม่',
    'Monthly record': 'บันทึกรายเดือน', 'Add person': 'เพิ่มคน', 'Open project': 'เปิดโครงการ', 'Update': 'อัปเดต', 'Close': 'ปิด',
    'Export CSV': 'ส่งออก CSV', 'Export JSON': 'ส่งออก JSON', 'Import JSON': 'นำเข้า JSON', 'Export Timesheet CSV': 'ส่งออก Timesheet (CSV)',
    'Board': 'บอร์ด', 'Table': 'ตาราง', 'YTD': 'ตั้งแต่ต้นปี', '12 months': '12 เดือน',
    // weekdays (weekly calendar)
    'Mon': 'จ.', 'Tue': 'อ.', 'Wed': 'พ.', 'Thu': 'พฤ.', 'Fri': 'ศ.', 'Sat': 'ส.', 'Sun': 'อา.',
  };

  const n = (s) => s; // numbers stay as written
  const RULES = [
    [/^(Active|Closed|All) \((\d+)\)$/, (m) => `${D[m[1]]} (${m[2]})`],
    [/^(\d+) bids?$/, (m) => `${m[1]} งาน`],
    [/^(\d+) bids in progress$/, (m) => `${m[1]} งานกำลังดำเนินการ`],
    [/^(\d+) critical open$/, (m) => `วิกฤตที่ยังเปิด ${m[1]}`],
    [/^(\d+) critical$/, (m) => `วิกฤต ${m[1]}`],
    [/^(\d+) open$/, (m) => `เปิดอยู่ ${m[1]}`],
    [/^(\d+) closed NCR$/, (m) => `ปิดแล้ว ${m[1]} NCR`],
    [/^(\d+) over 105%$/, (m) => `เกิน 105% อยู่ ${m[1]} คน`],
    [/^(\d+) won \/ (\d+) decided$/, (m) => `ชนะ ${m[1]} จาก ${m[2]} งานที่ประกาศผล`],
    [/^Due 0d$/, () => 'ครบกำหนดวันนี้'],
    [/^Due (\d+)d$/, (m) => `อีก ${m[1]} วัน`],
    [/^Late (\d+)d$/, (m) => `ช้า ${m[1]} วัน`],
    [/^Overdue (\d+)d$/, (m) => `เลยกำหนด ${m[1]} วัน`],
    [/^avg ([\d.]+) d in stage$/, (m) => `เฉลี่ย ${m[1]} วันในขั้นนี้`],
    [/^avg ([\d.]+) d → award$/, (m) => `เฉลี่ย ${m[1]} วันจนประกาศผล`],
    [/^avg progress ([\d.]+%)$/, (m) => `ความคืบหน้าเฉลี่ย ${m[1]}`],
    [/^Plan ([\d.]+%) ·$/, (m) => `แผน ${m[1]} ·`],
    [/^Plan ([\d.]+%) · Act ([\d.]+%)$/, (m) => `แผน ${m[1]} · ทำได้ ${m[2]}`],
    [/^Win ([\d.]+%)$/, (m) => `ชนะ ${m[1]}`],
    [/^Win rate ([\d.]+%)$/, (m) => `อัตราชนะ ${m[1]}`],
    [/^Submit ratio ([\d.]+%)$/, (m) => `ยื่นแล้ว ${m[1]}`],
    [/^target ([\d.]+%)$/, (m) => `เป้า ${m[1]}`],
    [/^by value ([\d.]+%)$/, (m) => `ตามมูลค่า ${m[1]}`],
    [/^([\d,]+) \/ ([\d,]+) PO packages$/, (m) => `${m[1]} / ${m[2]} แพ็กเกจ PO`],
    [/^capacity ([\d,]+) − leave ([\d,]+)$/, (m) => `ชั่วโมงทำงาน ${m[1]} − ลา ${m[2]}`],
    [/^Minor (\d+) · Major (\d+) · Critical (\d+)$/, (m) => `เล็กน้อย ${m[1]} · ร้ายแรง ${m[2]} · วิกฤต ${m[3]}`],
    [/^([\d,]+) man-hours · LTI (\d+)$/, (m) => `${m[1]} ชั่วโมงทำงาน · LTI ${m[2]}`],
    [/^([\d,]+) MH$/, (m) => `${m[1]} ชม.ทำงาน`],
    [/^Project ([\d,]+) · Bidding ([\d,]+)$/, (m) => `โครงการ ${m[1]} · ประมูล ${m[2]}`],
    [/^Phase: (.+)$/, (m) => `ขั้นงาน: ${n(m[1])}`],
    [/^Purchase Orders — (.+)$/, (m) => `ใบสั่งซื้อ (PO) — ${m[1]}`],
    [/^Risk & Issue Register — (.+)$/, (m) => `ทะเบียนความเสี่ยง / ปัญหา — ${m[1]}`],
    [/^(.+) · n=(\d+)$/, (m) => `${tr(m[1]) || m[1]} · ${m[2]} งาน`],
    // "+ New PO", "→ Estimate", "Won →", "⬇ Excel": translate the core, keep the sign
    [/^([+→⬇] )(.+)$/, (m) => { const c = tr(m[2]); return c && m[1] + c; }],
    [/^(.+)( →)$/, (m) => { const c = tr(m[1]); return c && c + m[2]; }],
  ];
  function tr(t) {
    if (Object.prototype.hasOwnProperty.call(D, t)) return D[t];
    for (const [re, f] of RULES) { const m = t.match(re); if (m) { const r = f(m); if (r) return r; } }
    return null;
  }

  /* ---------- glossary: metric → plain Thai (first line is shown bold) ---------- */
  const GL = [
    [/(?<![A-Za-z])SPI(?![A-Za-z])/, 'SPI — ดัชนีความคืบหน้าตามเวลา\nงานที่ทำได้ ÷ งานที่ควรทำได้ตามแผน (EV ÷ PV)\n≥ 0.95 ตามแผน · 0.90–0.95 เฝ้าระวัง · ต่ำกว่า 0.90 ช้ากว่าแผน'],
    [/(?<![A-Za-z])CPI(?![A-Za-z])/, 'CPI — ดัชนีความคุ้มค่าของเงิน\nมูลค่างานที่ทำได้ ÷ เงินที่จ่ายจริง (EV ÷ AC)\n≥ 0.95 ดี · ต่ำกว่า 0.90 จ่ายเงินมากกว่างานที่ได้'],
    [/(?<![A-Za-z])EAC(?![A-Za-z])/, 'EAC — ต้นทุนที่คาดว่าจะใช้ทั้งหมดเมื่อจบโครงการ\nถ้าสูงกว่างบต้นทุน (BAC) = มีแนวโน้มเกินงบ'],
    [/(?<![A-Za-z])BAC(?![A-Za-z])/, 'BAC — งบประมาณต้นทุนทั้งโครงการ (ต้นทุนตามแผน)'],
    [/(?<![A-Za-z])PPC(?![A-Za-z])/, 'PPC — ร้อยละของงานในแผนสัปดาห์ที่ทำเสร็จจริง\nงานที่เสร็จ ÷ งานในแผน · เป้าหมาย 80% ขึ้นไป'],
    [/LTIFR/, 'LTIFR — อัตราอุบัติเหตุถึงขั้นหยุดงาน\nจำนวนครั้ง × 1,000,000 ÷ ชั่วโมงทำงาน · ยิ่งต่ำยิ่งดี (0 = ดีที่สุด)'],
    [/TRIR/, 'TRIR — อัตราอุบัติเหตุที่ต้องรายงานทั้งหมด\nจำนวนครั้ง × 200,000 ÷ ชั่วโมงทำงาน · ยิ่งต่ำยิ่งดี'],
    [/(?<![A-Za-z])LTI(?![A-Za-z])/, 'LTI — อุบัติเหตุที่ทำให้ต้องหยุดงาน (Lost Time Injury)'],
    [/(?<![A-Za-z])NCR(?![A-Za-z])/, 'NCR — รายงานงานที่ไม่ได้มาตรฐาน (Non-Conformance Report)\nต้องแก้ไขและปิดให้ครบ · ระดับวิกฤตควรปิดก่อน'],
    [/(?<![A-Za-z])BOQ(?![A-Za-z])/, 'BOQ — บัญชีแสดงรายการ ปริมาณงาน และราคา (Bill of Quantities)'],
    [/(?<![A-Za-z])VO(?![A-Za-z])/, 'VO — งานเพิ่ม-ลดจากสัญญาเดิม (Variation Order)'],
    [/\(EV\)/, 'EV — มูลค่าของงานที่ทำได้จริง คิดตามงบของงานนั้น (Earned Value)'],
    [/\(PV\)/, 'PV — มูลค่าของงานที่ควรทำได้ตามแผน ณ วันนี้ (Planned Value)'],
    [/\(AC\)/, 'AC — เงินที่จ่ายจริง (Actual Cost)'],
    [/S-Curve/, 'S-Curve — กราฟความคืบหน้าสะสม แผน เทียบ ทำได้จริง\nเส้นจริงอยู่ต่ำกว่าเส้นแผน = ช้ากว่าแผน'],
    [/เงินทุนสูงสุดที่ต้องใช้|Peak funding/i, 'เงินทุนสูงสุดที่ต้องใช้ (Peak funding)\nช่วงที่เงินจ่ายสะสมเกินเงินรับสะสมมากที่สุด = เงินที่ต้องเตรียมไว้'],
    [/ผูกพันแล้ว|Committed/, 'ผูกพันแล้ว (Committed)\nยอด PO ที่สั่งไปแล้ว — ต้องจ่ายแน่นอนแม้ยังไม่ได้จ่าย'],
    [/อัตราใช้งาน/, 'อัตราใช้งาน (Utilization)\nชั่วโมงที่คิดเงินได้ ÷ ชั่วโมงที่มี · เกิน 105% = งานล้นมือ'],
    [/อัตราชนะ/, 'อัตราชนะ (Win rate)\nงานที่ชนะ ÷ งานที่ประกาศผลแล้ว'],
    [/(?<![A-Za-z])Margin(?![A-Za-z])/, 'Margin — กำไรขั้นต้น\n(ราคาขาย − ต้นทุน) ÷ ราคาขาย'],
    [/เงินประกันผลงาน|Retention/, 'เงินประกันผลงาน (Retention)\n% ที่ลูกค้าหักไว้ในแต่ละงวด และคืนเมื่อพ้นระยะประกัน'],
  ];
  const GSEL = 'th, .tile-label, .kv dt, .legend > span, .cost-strip > div > span, .card-h h2';
  function gloss(el) {
    if (el.querySelector('.gl') || el.closest('.qs, #tour-root, .modal')) return;
    const text = el.textContent;
    const tips = GL.filter(([re]) => re.test(text)).map(([, t]) => t);
    if (!tips.length) return;
    el.insertAdjacentHTML('beforeend', `<span class="gl" tabindex="0" role="note" aria-label="คำอธิบาย" data-tip="${PM.ui.esc(tips.join('\n\n'))}">i</span>`);
  }

  /* ---------- apply ---------- */
  const SEL = 'th, .tile-label, .tile-sub, .card-h h2, .card-h p, .section-h h2, .section-h p, .flow-step b, .flow-step .th, .flow-step .meta, ' +
    '.tabs a, .seg button, .badge, .chip, .kv dt, .legend span, .btn, .hero-text b, .cost-strip span, .kcol-h, label > span, .sub-h, ' +
    'option[value], .share-legend li, .phase-card .meta, .empty, h1, .crumb, .cal-h, .cal-day, .wk-label';
  const SKIP = '#tooltip, #tour-root, .qs-list, input, textarea, [contenteditable]';
  function text(el) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = w.nextNode())) {
      const raw = node.nodeValue, t = raw.trim();
      if (!t || !/[A-Za-z]/.test(t) || t.length > 80) continue;
      const th = tr(t);
      if (th) node.nodeValue = raw.replace(t, th);
    }
  }
  function apply(root) {
    if (!root || root.nodeType !== 1 || root.closest(SKIP)) return;
    const own = root.closest(SEL);
    if (own) text(own);
    root.querySelectorAll(SEL).forEach((el) => { if (!el.closest(SKIP)) text(el); });
    root.querySelectorAll('[data-label]').forEach((td) => { const t = tr(td.getAttribute('data-label')); if (t) td.setAttribute('data-label', t); });
    if (root.matches(GSEL)) gloss(root);
    root.querySelectorAll(GSEL).forEach(gloss);
  }
  PM.i18n = { tr, apply, dict: D };

  // after every render (this observer is created after app.js's, so its table labels and heading icons come first)
  new MutationObserver((list) => {
    const seen = new Set();
    list.forEach((m) => { const t = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (t) seen.add(t); });
    seen.forEach(apply);
  }).observe(document.body, { childList: true, subtree: true });
  apply(document.body);
})();
