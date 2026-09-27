/* roles.js — roles, permission matrix, and Supabase profile/role calls
   Roles are stored in Supabase table public.profiles (see supabase/roles.sql).
   Who may change a role is enforced by the database (RLS); the checks here only drive the UI. */
(function () {
  PM.ROLES = [
    { key: 'admin', label: 'Admin', th: 'ผู้ดูแลระบบ', level: 'info' },
    { key: 'project_manager', label: 'Project Manager', th: 'ผู้จัดการโครงการ', level: 'good' },
    { key: 'engineer', label: 'Engineer', th: 'วิศวกร', level: 'neutral' },
    { key: 'technician', label: 'Technician', th: 'ช่างเทคนิค', level: 'neutral' },
  ];

  /* Permission matrix — change the roles arrays here to adjust who can do what */
  PM.PERMISSIONS = {
    'data.reset': { label: 'Reset ข้อมูล (ล้างทั้งหมด / โหลดข้อมูลตัวอย่าง)', roles: ['admin'] },
    'data.import': { label: 'Import JSON (เขียนทับข้อมูลทั้งหมด)', roles: ['admin', 'project_manager'] },
    'data.export': { label: 'Export JSON / Timesheet CSV', roles: ['admin', 'project_manager', 'engineer', 'technician'] },
    'plan.edit': { label: 'สร้าง / แก้ไขงานใน Weekly Plan', roles: ['admin', 'project_manager', 'engineer'] },
    'plan.status': { label: 'อัปเดตสถานะงานใน Weekly Plan', roles: ['admin', 'project_manager', 'engineer', 'technician'] },
    'roles.manage': { label: 'กำหนด Role ให้ผู้ใช้', roles: ['admin'] },
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

  R.set = async function (userId, role) {
    const { data, error } = await PM.auth.client.from('profiles').update({ role }).eq('id', userId).select('id, role');
    if (error) throw new Error(/last admin/i.test(error.message) ? 'ต้องมี Admin อย่างน้อย 1 คน — ไม่สามารถลด Role ของ Admin คนสุดท้ายได้' : setupError(error));
    if (!data || !data.length) throw new Error('ไม่มีสิทธิ์เปลี่ยน Role (เฉพาะ Admin เท่านั้น)');
    return data[0];
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
