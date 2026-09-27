/* config.js — Supabase connection
   คัดลอกค่าจาก Supabase Dashboard → Project Settings → API (หรือ Data API / API Keys)
   - supabaseUrl:     Project URL เช่น 'https://abcdefghijkl.supabase.co'
   - supabaseAnonKey: "anon public" key (หรือ "publishable" key ที่ขึ้นต้นด้วย sb_publishable_)
   ห้ามใส่ service_role / secret key ในไฟล์นี้เด็ดขาด เพราะไฟล์นี้ถูกส่งไปที่ browser ของทุกคน */
window.PM_CONFIG = {
  supabaseUrl: 'https://ypqfxgsreiscxqogazur.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwcWZ4Z3NyZWlzY3hxb2dhenVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NDIwODQsImV4cCI6MjEwNTAxODA4NH0.GMvPv2A6AUpOOU6A4TGGRWr3dCEdc7MfDABlzXZCdIk'
};
