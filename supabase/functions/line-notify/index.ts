// line-notify — sends the BU4 IE/EPC notifications to LINE (Messaging API push)
//
//   POST { mode: 'urgent' | 'weekly' | 'test', dryRun?: true }
//     · from the schedule (supabase/line.sql): header x-cron-secret = CRON_SECRET
//     · from the app (Settings → แจ้งเตือนผ่าน LINE): the signed-in user's JWT — Admin only (checked here)
//     dryRun returns the text without sending (the preview in the app)
//   POST from LINE (header x-line-signature): the webhook — when the bot joins a group, is added as a friend, or someone
//     types "id", it answers with the chat's id and lists it for the Admin (collection linecfg, row 'line-seen').
//
// Secrets (supabase secrets set …): LINE_CHANNEL_ACCESS_TOKEN · LINE_CHANNEL_SECRET · CRON_SECRET · APP_URL (optional)
// SUPABASE_URL · SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY are given to every Edge Function by Supabase.
// Deploy: supabase functions deploy line-notify --no-verify-jwt   (LINE's webhook carries no JWT; this file checks callers itself)
//
// No money in any message: bid prices (bidprices / bidvalues), project finance (projfin) and PO / cost amounts are never read.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';
const CHANNEL_SECRET = Deno.env.get('LINE_CHANNEL_SECRET') ?? '';
const CRON = Deno.env.get('CRON_SECRET') ?? '';
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '');
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ---------- dates (Bangkok) ----------
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thDate = (d: string) => (d ? `${Number(d.slice(8))} ${TH_M[Number(d.slice(5, 7)) - 1]} ${String(Number(d.slice(0, 4)) + 543).slice(2)}` : '-');
const monday = (d: string) => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return addDays(d, -((w + 6) % 7)); };
function addMonthsIso(d: string, n: number) {
  const [y, m, day] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString().slice(0, 10);
}

// ---------- data ----------
type Rec = Record<string, any>;
async function rows(collection: string): Promise<Rec[]> {
  const out: Rec[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('app_records').select('id, data').eq('collection', collection).range(from, from + 999);
    if (error) throw error;
    (data ?? []).forEach((r: Rec) => out.push({ ...(r.data ?? {}), id: r.data?.id ?? r.id }));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function cfgRow(id: string): Promise<Rec | null> {
  const { data } = await db.from('app_records').select('data').eq('collection', 'linecfg').eq('id', id).maybeSingle();
  return data ? data.data : null;
}
async function saveCfg(id: string, data: Rec) {
  await db.from('app_records').upsert({ collection: 'linecfg', id, data: { ...data, id } }, { onConflict: 'collection,id' });
}

// ---------- what counts (the same rules as the app's bell, simplified) ----------
const committed = (po: Rec) => po.status !== 'draft' && po.status !== 'cancelled';
const SLA: Rec = { urgent: 2, normal: 7, low: 14 };
function vdrlState(d: Rec, T: string, pos: Rec[]) {
  const revs = (d.revs ?? []).filter((r: Rec) => r.issued || r.returned || r.code || r.planIssue || r.transmittal);
  const r = revs[revs.length - 1];
  if (!r || !r.issued) {
    let due = (r && r.planIssue) || d.planDate || '';
    const m = String(d.planText ?? '').match(/(\d+)\s*(?:days?|วัน)\s*(?:after|หลัง)\s*(?:po|สั่งซื้อ)/i);
    const po = m && d.poId ? pos.find((p) => p.id === d.poId) : null;
    if (!due && po?.poDate) due = addDays(po.poDate, Number(m![1]));
    return { key: 'plan', late: !!due && due < T };
  }
  if (!r.returned && !r.code) return { key: 'review', late: (r.planReturn || addDays(r.issued, 14)) < T };
  const c = String(r.code ?? '').toUpperCase();
  if (!c || /^(A1|AP|1|C1|A4|NR|4|C4|FI|APPROVED)$/.test(c)) return { key: 'done', late: false };
  return { key: 'resubmit', late: addDays(r.returned || r.issued, 14) < T };
}

async function compose(mode: string): Promise<string> {
  const T = today();
  const [bids, projects, pos, ncrs, punch, vdrl, itp, service, warranty] = await Promise.all(['bids', 'projects', 'pos', 'ncrs', 'punch', 'vdrl', 'itp', 'service', 'warranty'].map(rows));
  const code = (id: string) => projects.find((p) => p.id === id)?.code ?? '';
  const active = projects.filter((p) => p.status !== 'closed');
  const dash = (v: unknown) => (v == null || String(v).trim() === '' ? '-' : String(v));
  const link = (path: string) => (APP_URL ? `${APP_URL}/#${path}` : '');
  const poLate = (x: Rec) => committed(x) && !x.deliveredDate && x.deliveryDue && x.deliveryDue < T && x.status !== 'delivered' && x.status !== 'closed';

  if (mode === 'weekly') {
    const to = addDays(monday(T), -1), from = addDays(to, -6), inW = (d?: string) => !!d && d >= from && d <= to;
    const pend = bids.filter((b) => b.result === 'pending');
    const lateMs = active.flatMap((p) => (p.milestones ?? []).filter((m: Rec) => !m.actual && m.date && m.date < T));
    const openNcr = ncrs.filter((n) => n.status === 'open');
    const vd = vdrl.map((d) => vdrlState(d, T, pos));
    const week = itp.filter((x) => x.result === 'pending' && (x.point === 'H' || x.point === 'W') && x.planDate >= T && x.planDate <= addDays(T, 6));
    const lines = [
      `📊 BU4 IE/EPC — สรุปสัปดาห์ ${thDate(from)} – ${thDate(to)}`, '',
      '🔹 งานประมูล',
      `• Inquiry เข้า ${bids.filter((b) => inW(b.dates?.inquiry)).length} · ยื่นใบเสนอราคา ${bids.filter((b) => inW(b.dates?.submit)).length}`,
      `• ชนะ ${bids.filter((b) => b.result === 'won' && inW(b.resultDate)).length} · แพ้ / ไม่ยื่น ${bids.filter((b) => (b.result === 'lost' || b.result === 'nobid') && inW(b.resultDate)).length} · รอผล ${pend.length}`,
      `• ต้องยื่นใน 7 วันนี้ ${pend.filter((b) => !b.dates?.submit && b.dueDate && b.dueDate >= T && b.dueDate <= addDays(T, 6)).length} งาน`, '',
      '🔹 โครงการ',
      `• Active ${active.length} โครงการ · Milestone เลยกำหนด ${lateMs.length}`,
      `• PO ออกสัปดาห์ที่แล้ว ${pos.filter((x) => committed(x) && inW(x.poDate)).length} ใบ · PO เลยกำหนดส่ง ${pos.filter(poLate).length} ใบ`,
      `• NCR เปิดใหม่ ${ncrs.filter((n) => inW(n.date)).length} · ปิด ${ncrs.filter((n) => inW(n.closedDate)).length} · ค้าง ${openNcr.length} (วิกฤต ${openNcr.filter((n) => n.severity === 'Critical').length})`,
      `• เอกสารผู้ขาย: เลยกำหนดส่ง ${vd.filter((x) => x.key === 'plan' && x.late).length} · ต้องแก้ส่งใหม่ ${vd.filter((x) => x.key === 'resubmit').length} · รอลูกค้าตอบ ${vd.filter((x) => x.key === 'review').length}`,
      `• นัด Hold / Witness สัปดาห์นี้ ${week.length}${week.length ? ': ' + week.slice(0, 3).map((x) => `${code(x.projectId)} ${x.activity} (${thDate(x.planDate)})`).join(', ') : ''}`,
      `• ใบแจ้งซ่อมค้าง ${service.filter((x) => x.status !== 'closed').length}`,
    ];
    if (link('/dashboard')) lines.push('', `เปิด Dashboard: ${link('/dashboard')}`);
    return lines.join('\n');
  }

  // urgent: what someone should act on today — empty when there is nothing
  const sec: [string, string[]][] = [];
  const add = (title: string, items: string[]) => { if (items.length) sec.push([title, items]); };
  const pend = bids.filter((b) => b.result === 'pending' && !b.dates?.submit && b.dueDate);
  add('งานประมูล', pend.filter((b) => b.dueDate < T).map((b) => `เลยกำหนดยื่น: ${dash(b.code)} ${dash(b.name)} (${thDate(b.dueDate)})`)
    .concat(pend.filter((b) => b.dueDate >= T && diffDays(T, b.dueDate) <= 3).map((b) => `ต้องยื่นใน ${diffDays(T, b.dueDate)} วัน: ${dash(b.code)} ${dash(b.name)}`)));
  add('PO เลยกำหนดส่ง', pos.filter(poLate).map((x) => `${x.poNo} ${dash(x.supplier)} — ${code(x.projectId)} · เลย ${diffDays(x.deliveryDue, T)} วัน`));
  add('Milestone เลยกำหนด', active.flatMap((p) => (p.milestones ?? []).filter((m: Rec) => !m.actual && m.date && m.date < T).map((m: Rec) => `${p.code} ${m.name} (${thDate(m.date)})`)));
  add('NCR วิกฤต', ncrs.filter((n) => n.status === 'open' && n.severity === 'Critical').map((n) => `${n.no} — ${code(n.projectId)} ${dash(n.description).slice(0, 60)}`));
  add('Punch A เลยกำหนด', punch.filter((x) => x.category === 'A' && x.status === 'open' && x.due && x.due < T).map((x) => `${x.no} ${dash(x.location)} — ${code(x.projectId)}`));
  const vdLate: Rec = {};
  vdrl.forEach((d) => { const s = vdrlState(d, T, pos); if (s.late && s.key !== 'review') vdLate[d.projectId] = (vdLate[d.projectId] ?? 0) + 1; });
  add('เอกสารผู้ขายเลยกำหนด', Object.keys(vdLate).map((id) => `${code(id)}: ${vdLate[id]} ฉบับ`));
  add('นัด Hold / Witness (3 วัน)', itp.filter((x) => x.result === 'pending' && (x.point === 'H' || x.point === 'W') && x.planDate >= T && diffDays(T, x.planDate) <= 3)
    .map((x) => `${code(x.projectId)} ${x.point === 'H' ? 'Hold' : 'Witness'}: ${x.activity} (${thDate(x.planDate)})`));
  add('ใบแจ้งซ่อมเกินกำหนด', service.filter((x) => x.status !== 'closed' && addDays(x.date, SLA[x.priority] ?? 7) < T).map((x) => `${x.no} ${dash(x.description).slice(0, 50)} — ${code(x.projectId)}`));
  add('ประกันใกล้หมด (30 วัน)', warranty.map((w) => ({ w, end: w.end || (w.start && w.months ? addDays(addMonthsIso(w.start, Number(w.months)), -1) : '') }))
    .filter(({ end }) => end && end >= T && diffDays(T, end) <= 30).map(({ w, end }) => `${code(w.projectId)} ${w.item} — หมด ${thDate(end)}`));
  if (!sec.length) return '';
  const MAX = 6;
  const lines = [`🔔 BU4 IE/EPC — เรื่องที่ต้องดำเนินการ ${thDate(T)}`];
  sec.forEach(([title, items]) => {
    lines.push('', `🔸 ${title} (${items.length})`);
    items.slice(0, MAX).forEach((t) => lines.push(`• ${t}`));
    if (items.length > MAX) lines.push(`  และอีก ${items.length - MAX} รายการ`);
  });
  if (link('/dashboard')) lines.push('', `ดูทั้งหมดที่กระดิ่งในเว็บ: ${link('/dashboard')}`);
  return lines.join('\n');
}

// ---------- LINE ----------
const chunks = (text: string, size = 4800) => { const out: string[] = []; let rest = text; while (rest.length > size) { const cut = rest.lastIndexOf('\n', size); const at = cut > size / 2 ? cut : size; out.push(rest.slice(0, at)); rest = rest.slice(at).replace(/^\n/, ''); } if (rest) out.push(rest); return out; };
async function push(to: string, text: string) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ to, messages: chunks(text).slice(0, 5).map((t) => ({ type: 'text', text: t })) }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
}
async function reply(token: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/reply', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ replyToken: token, messages: [{ type: 'text', text }] }) });
}
async function nameOf(src: Rec): Promise<string> {
  try {
    const url = src.groupId ? `https://api.line.me/v2/bot/group/${src.groupId}/summary` : src.userId && !src.roomId ? `https://api.line.me/v2/bot/profile/${src.userId}` : '';
    if (!url) return '';
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const j = await r.json();
    return j.groupName || j.displayName || '';
  } catch { return ''; }
}
async function webhook(raw: string, signature: string) {
  if (!CHANNEL_SECRET) return json({ error: 'LINE_CHANNEL_SECRET not set' }, 500);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(CHANNEL_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  if (btoa(String.fromCharCode(...mac)) !== signature) return json({ error: 'bad signature' }, 401);
  const body = JSON.parse(raw || '{}');
  const seen = ((await cfgRow('line-seen'))?.list ?? []) as Rec[];
  let changed = false;
  for (const e of body.events ?? []) {
    const src = e.source ?? {}, id = src.groupId || src.roomId || src.userId;
    if (!id) continue;
    const ask = e.type === 'message' && e.message?.type === 'text' && /^\s*(id|ไอดี|รหัส)\s*$/i.test(e.message.text ?? '');
    if (e.type === 'join' || e.type === 'follow' || ask) {
      const name = await nameOf(src);
      const i = seen.findIndex((s) => s.id === id);
      const item = { id, name, at: today() };
      if (i >= 0) seen[i] = item; else seen.unshift(item);
      changed = true;
      if (e.replyToken) await reply(e.replyToken, `รหัส LINE ของ${src.groupId ? 'กลุ่ม' : src.roomId ? 'ห้อง' : 'คุณ'}นี้:\n${id}\n\nAdmin เพิ่มเป็นผู้รับได้ที่ ตั้งค่า → แจ้งเตือนผ่าน LINE`);
    }
  }
  if (changed) await saveCfg('line-seen', { list: seen.slice(0, 30) });
  return json({ ok: true });
}

// ---------- who may call ----------
async function isAdmin(auth: string | null): Promise<boolean> {
  if (!auth) return false;
  const user = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await user.auth.getUser();
  if (!data?.user) return false;
  const { data: prof } = await db.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  return prof?.role === 'admin';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const raw = await req.text();
  const sig = req.headers.get('x-line-signature');
  if (sig) return webhook(raw, sig);
  let body: Rec = {};
  try { body = JSON.parse(raw || '{}'); } catch { /* empty */ }
  const fromCron = !!CRON && req.headers.get('x-cron-secret') === CRON;
  if (!fromCron && !(await isAdmin(req.headers.get('Authorization')))) return json({ error: 'เฉพาะ Admin เท่านั้นที่ส่งแจ้งเตือน LINE ได้' }, 403);
  const mode = ['urgent', 'weekly', 'test'].includes(body.mode) ? body.mode : 'urgent';
  try {
    if (body.dryRun && !fromCron) return json({ text: mode === 'test' ? '' : await compose(mode) });
    if (!TOKEN) return json({ error: 'ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN ใน Supabase Secrets' }, 500);
    const cfg = (await cfgRow('line')) ?? { enabled: false, targets: [] };
    if (fromCron && !cfg.enabled) return json({ skipped: 'ปิดส่งอัตโนมัติอยู่' });
    const targets = ((cfg.targets ?? []) as Rec[]).filter((t) => t.id && (mode === 'test' || t[mode]));
    if (!targets.length) return json({ error: 'ยังไม่มีผู้รับสำหรับข้อความนี้' }, 400);
    const text = mode === 'test' ? `✅ ทดสอบการแจ้งเตือนจาก BU4 IE/EPC\nส่งเมื่อ ${thDate(today())} — ถ้าเห็นข้อความนี้ แปลว่าตั้งค่าเรียบร้อย` : await compose(mode);
    if (!text) return json({ skipped: 'วันนี้ไม่มีเรื่องด่วน' });
    let sent = 0;
    const errors: string[] = [];
    for (const t of targets) { try { await push(t.id, text); sent++; } catch (e) { errors.push(`${t.name || t.id}: ${(e as Error).message}`); } }
    await saveCfg('line-sent', { last: { at: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', mode, sent } });
    return json({ sent, failed: errors.length, errors });
  } catch (e) {
    return json({ error: (e as Error).message || 'ส่งไม่สำเร็จ' }, 500);
  }
});
