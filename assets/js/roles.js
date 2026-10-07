/* roles.js — roles, permission matrix, and Supabase profile/role calls
   Roles are stored in Supabase table public.profiles (see supabase/roles.sql).
   Who may change a role is enforced by the database (RLS); the checks here only drive the UI. */
(function () {
  /* order = seniority (used by the role pickers and the permission table) */
  PM.ROLES = [
    { key: 'admin', label: 'Admin', th: 'ผู้ดูแลระบบ', level: 'info' },
    { key: 'dept_manager', label: 'Department Manager', th: 'ผู้จัดการแผนก', level: 'info' },
    { key: 'project_manager', label: 'Project Manager', th: 'ผู้จัดการโครงการ', level: 'good' },
    { key: 'engineer', label: 'Engineer', th: 'วิศวกร', level: 'neutral' },
    { key: 'sales', label: 'Sales', th: 'ฝ่ายขาย', level: 'neutral' },
    { key: 'technician', label: 'Technician', th: 'ช่างเทคนิค', level: 'neutral' },
  ];

  /* Permission matrix — change the roles arrays here to adjust who can do what */
  PM.PERMISSIONS = {
    'data.reset': { label: 'Reset ข้อมูล (ล้างทั้งหมด / โหลดข้อมูลตัวอย่าง)', roles: ['admin'] },
    'data.import': { label: 'Import JSON (เขียนทับข้อมูลทั้งหมด)', roles: ['admin', 'dept_manager', 'project_manager'] },
    'data.export': { label: 'Export JSON / Timesheet CSV', roles: ['admin', 'dept_manager', 'project_manager', 'engineer', 'sales', 'technician'] },
    'bid.edit': { label: 'เพิ่ม / แก้ไข Inquiry และเลื่อนขั้น Bidding (Sales: เฉพาะงานของตัวเอง)', roles: ['admin', 'sales'] },
    'bid.result': { label: 'กด Won / Lost / No-bid (Sales: เฉพาะงานของตัวเอง)', roles: ['admin', 'sales'] },
    'bid.price': { label: 'เห็นมูลค่า · Margin · ไฟล์ใบเสนอราคาของ Bid (Sales: เฉพาะงานของตัวเอง — บังคับในฐานข้อมูล)', roles: ['admin', 'sales'] },
    'plan.edit': { label: 'สร้าง / แก้ไขงานใน Weekly Plan', roles: ['admin', 'dept_manager', 'project_manager', 'engineer', 'sales'] },
    'plan.status': { label: 'อัปเดตสถานะงานใน Weekly Plan', roles: ['admin', 'dept_manager', 'project_manager', 'engineer', 'sales', 'technician'] },
    'resource.view': { label: 'เปิดหัวข้อ Resources (Resource Utilization · Timesheet) และส่วน Resource Utilization บน Dashboard', roles: ['admin', 'dept_manager', 'project_manager'] },
    'timesheet.edit': { label: 'กรอก / แก้ไข Timesheet (คนอื่นดูได้อย่างเดียว)', roles: ['project_manager'] },
    'po.edit': { label: 'สร้าง / แก้ไข PO และแนบไฟล์', roles: ['admin', 'dept_manager', 'project_manager', 'engineer'] },
    'price.edit': { label: 'เพิ่ม / แก้ไข Price List (ราคาผู้ขาย) — ทุกคนดูและ Export ได้', roles: ['admin', 'dept_manager', 'project_manager', 'engineer'] },
    'timeline.edit': { label: 'เพิ่ม / แก้ไขกิจกรรมและ Milestone ใน Timeline · Gantt ของโครงการ', roles: ['admin', 'dept_manager', 'project_manager', 'engineer'] },
    'cost.edit': { label: 'บันทึก / แก้ไขค่าใช้จ่ายโครงการ (Actual cost)', roles: ['admin', 'dept_manager', 'project_manager'] },
    'roles.manage': { label: 'กำหนด Role ให้ผู้ใช้ (ยกเว้น Role ของตัวเอง และ Role ที่สูงกว่า — ดูกติกาด้านล่างตาราง)', roles: ['admin', 'dept_manager', 'project_manager'] },
    'users.delete': { label: 'ลบบัญชีผู้ใช้', roles: ['admin'] },
  };

  /* Which roles the current user may give to `target` ({ id, role }) — same rules as supabase/roles.sql:
     Admin              → any role, for anyone
     Department Manager → any role except Admin, for others who are not Admin
     Project Manager    → PM / Engineer / Sales / Technician, for others who are not Admin or Department Manager */
  PM.ROLE_RULES = 'Admin: ตั้งได้ทุก Role ให้ทุกคน · Department Manager: ตั้งได้ทุก Role ยกเว้น Admin ให้คนอื่นที่ไม่ใช่ Admin · Project Manager: ตั้ง Project Manager / Engineer / Sales / Technician ให้คนอื่นที่ไม่ใช่ Admin หรือ Department Manager · เปลี่ยน Role ของตัวเองไม่ได้';
  PM.assignableRoles = function (target) {
    const me = PM.auth && PM.auth.role, myId = PM.auth && PM.auth.user && PM.auth.user.id;
    const all = PM.ROLES.map((r) => r.key);
    if (me === 'admin') return all;
    if (!target || target.id === myId) return [];
    if (me === 'dept_manager' && target.role !== 'admin') return all.filter((k) => k !== 'admin');
    if (me === 'project_manager' && target.role !== 'admin' && target.role !== 'dept_manager') return all.filter((k) => k !== 'admin' && k !== 'dept_manager');
    return [];
  };

  PM.roleInfo = (key) => PM.ROLES.find((r) => r.key === key) || null;
  PM.roleLabel = (key) => { const r = PM.roleInfo(key); return r ? r.label : 'ไม่ทราบ Role'; };
  PM.can = (perm) => {
    const p = PM.PERMISSIONS[perm];
    const role = PM.auth && PM.auth.role;
    return !!(p && role && p.roles.includes(role));
  };
  PM.whoCan = (perm) => PM.PERMISSIONS[perm].roles.map(PM.roleLabel).join(', ');

  const R = (PM.roles = {});

  /* Current user's role. Returns { role, error } — error is set when the table/row is missing */
  R.loadMine = async function (user) {
    try {
      const { data, error } = await PM.auth.client.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (error) return { role: null, error: setupError(error) };
      if (!data) return { role: null, error: 'ยังไม่มีข้อมูล Role ของบัญชีนี้ — ให้ Admin รัน supabase/roles.sql อีกครั้ง' };
      return { role: data.role, error: null };
    } catch (e) {
      return { role: null, error: e.message };
    }
  };

  R.list = async function () {
    const { data, error } = await PM.auth.client.from('profiles')
      .select('id, email, full_name, role, created_at').order('created_at', { ascending: true });
    if (error) throw new Error(setupError(error));
    return data || [];
  };

  /* Team members (accounts) for pickers such as "Project Manager".
     Uses the list_team() function (roles.sql); Admin can fall back to reading profiles directly. */
  PM.team = [];
  R.loadTeam = async function () {
    const client = PM.auth && PM.auth.client;
    if (!client || typeof client.rpc !== 'function') return PM.team;
    try {
      const { data, error } = await client.rpc('list_team');
      if (!error && Array.isArray(data)) { PM.team = data; PM.teamError = null; return PM.team; }
      if (PM.can('roles.manage')) {
        const rows = await R.list();
        PM.team = rows.map((u) => ({ id: u.id, full_name: u.full_name || (u.email || '').split('@')[0], role: u.role }));
        PM.teamError = null;
        return PM.team;
      }
      PM.teamError = 'ยังโหลดรายชื่อบัญชีผู้ใช้ไม่ได้ — ให้ Admin รัน supabase/roles.sql อีกครั้ง';
    } catch (e) {
      PM.teamError = e.message;
    }
    return PM.team;
  };

  R.set = async function (userId, role) {
    const { data, error } = await PM.auth.client.from('profiles').update({ role }).eq('id', userId).select('id, role');
    if (error) {
      if (/last admin/i.test(error.message)) throw new Error('ต้องมี Admin อย่างน้อย 1 คน — ไม่สามารถลด Role ของ Admin คนสุดท้ายได้');
      if (/department manager role/i.test(error.message)) throw new Error('เฉพาะ Admin หรือ Department Manager เท่านั้นที่เปลี่ยน Role ของ Department Manager หรือตั้งใครเป็น Department Manager ได้');
      if (/admin role/i.test(error.message)) throw new Error('เฉพาะ Admin เท่านั้นที่เปลี่ยน Role ของ Admin หรือตั้งใครเป็น Admin ได้');
      if (/invalid input value for enum/i.test(error.message)) throw new Error('ฐานข้อมูลยังไม่รู้จัก Role นี้ — ให้ Admin รัน supabase/roles.sql อีกครั้ง');
      throw new Error(setupError(error));
    }
    if (!data || !data.length) {
      throw new Error(['project_manager', 'dept_manager'].includes(PM.auth.role)
        ? `ไม่มีสิทธิ์เปลี่ยน Role นี้ — ${PM.ROLE_RULES} (ถ้าเพิ่งอัปเดตเว็บ ให้ Admin รัน supabase/roles.sql อีกครั้ง)`
        : 'ไม่มีสิทธิ์เปลี่ยน Role (เฉพาะ Admin, Department Manager และ Project Manager)');
    }
    return data[0];
  };

  /* delete a user account — Admin only (checked again by admin_delete_user() in roles.sql) */
  R.remove = async function (userId) {
    if (!PM.can('users.delete')) throw new Error('เฉพาะ Admin เท่านั้นที่ลบบัญชีผู้ใช้ได้');
    if (PM.auth.user && userId === PM.auth.user.id) throw new Error('ลบบัญชีของตัวเองไม่ได้');
    const { error } = await PM.auth.client.rpc('admin_delete_user', { target: userId });
    if (!error) return;
    const m = error.message || '';
    if (/Only Admin/i.test(m)) throw new Error('เฉพาะ Admin เท่านั้นที่ลบบัญชีผู้ใช้ได้');
    if (/own account/i.test(m)) throw new Error('ลบบัญชีของตัวเองไม่ได้');
    if (/not found/i.test(m) && /user/i.test(m) && !/function/i.test(m)) throw new Error('ไม่พบบัญชีนี้ (อาจถูกลบไปแล้ว)');
    if (/admin_delete_user|could not find the function|schema cache/i.test(m)) throw new Error('ยังไม่ได้ติดตั้งฟังก์ชันลบผู้ใช้ — ให้ Admin รัน supabase/roles.sql อีกครั้ง');
    throw new Error(m);
  };

  function setupError(error) {
    const m = (error && error.message) || String(error);
    if (/relation .*profiles.* does not exist|could not find the table|schema cache/i.test(m)) {
      return 'ยังไม่ได้ติดตั้งระบบ Role ใน Supabase — รันไฟล์ supabase/roles.sql ใน SQL Editor ก่อน';
    }
    if (/permission denied/i.test(m)) return 'ไม่มีสิทธิ์เข้าถึงข้อมูล Role';
    return m;
  }
})();
