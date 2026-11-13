/* line.js — Settings → แจ้งเตือนผ่าน LINE (Admin): who gets the LINE messages, and sending now / a test / a preview.
   The messages are built and sent by the Supabase Edge Function supabase/functions/line-notify (the LINE token never reaches
   the browser), on a schedule from supabase/line.sql: urgent items every working day 08:00 · a weekly summary Monday 08:00.
   No money in any message (a LINE group may hold people who must not see prices).
   Recipients: a LINE user, group or room id (U… · C… · R…). Add the bot to the group and type "id" — the bot answers with the
   group's id, and the function lists it here under "ที่บอทพบ".
   Data: collection 'linecfg' = [{ id: 'line', enabled, targets: [{ id, name, urgent, weekly }] },
                                 { id: 'line-seen', list: [{ id, name, at }] }, { id: 'line-sent', last: { at, mode, sent } }] (the last two by the function)
         read and written by Admin only — enforced by the database (data.sql: can_manage_line). */
(function () {
  const U = PM.ui, esc = U.esc;
  const L = (PM.line = {});
  const row = (id) => (PM.db.linecfg || []).find((x) => x.id === id);
  const cfg = () => row('line') || { id: 'line', enabled: false, targets: [] };
  // written by the Edge Function in rows of their own, so saving the settings here never overwrites them
  const seenList = () => (row('line-seen') || {}).list || [];
  const lastSent = () => (row('line-sent') || {}).last || null;
  const save = (c) => { if (!PM.db.linecfg) PM.db.linecfg = []; PM.upsert('linecfg', c); };
  const kindOf = (id) => (/^U/.test(id) ? 'ผู้ใช้' : /^C/.test(id) ? 'กลุ่ม' : /^R/.test(id) ? 'ห้องแชท' : '?');
  const validId = (id) => /^[UCR][0-9a-f]{32}$/i.test(id);

  async function call(body) {
    const c = PM.auth && PM.auth.client;
    if (!c || !c.functions) throw new Error('ยังไม่ได้เชื่อม Cloud — เข้าสู่ระบบก่อน');
    const { data, error } = await c.functions.invoke('line-notify', { body });
    if (error) {
      let msg = error.message || String(error);
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* plain error */ }
      if (/Failed to send|not found|404|FunctionsFetchError/i.test(msg)) msg = 'ยังไม่ได้ Deploy Edge Function "line-notify" — ดูขั้นตอนติดตั้งด้านบน';
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data || {};
  }

  L.render = function (el) {
    if (!el) return;
    const can = PM.can('line.manage');
    const c = cfg();
    const steps = `<details class="card ln-setup"${c.targets.length ? '' : ' open'}><summary><b>ขั้นตอนติดตั้ง (ทำครั้งเดียว)</b> <span class="muted">— Admin หรือผู้ดูแล Supabase</span></summary><div class="card-b"><ol class="ln-steps">
        <li>สร้าง <b>LINE Official Account</b> และเปิด <b>Messaging API</b> ที่ <a href="https://developers.line.biz/console/" target="_blank" rel="noopener">LINE Developers Console</a> → จด <b>Channel secret</b> และออก <b>Channel access token (long-lived)</b></li>
        <li>ใน Supabase → Edge Functions → Secrets ตั้งค่า <code>LINE_CHANNEL_ACCESS_TOKEN</code> · <code>LINE_CHANNEL_SECRET</code> · <code>CRON_SECRET</code> (ข้อความสุ่มยาว ๆ) · <code>APP_URL</code> (ลิงก์เว็บนี้)</li>
        <li>Deploy ฟังก์ชัน: <code>supabase functions deploy line-notify --no-verify-jwt</code> (โค้ดอยู่ที่ <code>supabase/functions/line-notify</code>)</li>
        <li>ที่ LINE Developers ตั้ง <b>Webhook URL</b> = <code>https://&lt;project-ref&gt;.supabase.co/functions/v1/line-notify</code> แล้วเปิด Use webhook</li>
        <li>รัน <code>supabase/data.sql</code> อีกครั้ง แล้วรัน <code>supabase/line.sql</code> (แก้ project-ref และ CRON_SECRET ในไฟล์ก่อน) — ตั้งเวลาส่งอัตโนมัติ</li>
        <li>เชิญบอทเข้ากลุ่ม LINE ของทีม แล้วพิมพ์ <b>id</b> ในกลุ่ม — บอทตอบรหัสกลุ่ม และรหัสขึ้นที่ "ที่บอทพบ" ด้านล่าง กด + เพิ่มเป็นผู้รับ</li>
      </ol></div></details>`;
    if (!can) {
      el.innerHTML = `<div class="card"><div class="card-b"><p class="perm-note">ตั้งค่าได้เฉพาะ ${esc(PM.whoCan('line.manage'))} — บังคับในฐานข้อมูล</p>
        <p class="muted" style="margin:0">ระบบส่งเข้า LINE: <b>เรื่องด่วน</b> ทุกวันทำงาน 08:00 (Bid ใกล้ / เลยกำหนดยื่น · PO เลยกำหนดส่ง · Milestone เลยกำหนด · NCR วิกฤต · Punch A · เอกสารผู้ขายเลยกำหนด · นัด Hold / Witness · ใบแจ้งซ่อมเกินกำหนด · ประกันใกล้หมด)
        และ <b>สรุปรายสัปดาห์</b> ทุกวันจันทร์ 08:00 — ไม่มีตัวเงินในข้อความ</p></div></div>`;
      return;
    }
    const known = new Set(c.targets.map((t) => t.id));
    const seen = seenList().filter((s) => !known.has(s.id));
    const sent = lastSent();
    el.innerHTML = `
      ${steps}
      <div class="card"><div class="card-h"><h2>การส่ง</h2><span class="spacer"></span>
          <label class="avl-chk"><input type="checkbox" data-ln="enabled"${c.enabled ? ' checked' : ''}><span>เปิดส่งอัตโนมัติ<small>เรื่องด่วน จ.–ศ. 08:00 · สรุปทุกวันจันทร์ 08:00 (ตั้งเวลาใน line.sql)</small></span></label>
          <p>ข้อความไม่มีตัวเงิน (ราคา Bid · มูลค่า PO · ต้นทุน) เพราะกลุ่ม LINE อาจมีคนที่ไม่มีสิทธิ์เห็น · ลิงก์ในข้อความเปิดหน้าเว็บ (ต้องเข้าสู่ระบบ)${sent ? ` · ส่งล่าสุด ${esc(sent.at || '')} (${esc(sent.mode || '')} · ${esc(String(sent.sent || 0))} ราย)` : ''}</p></div>
        <div class="card-b ln-actions">
          <button type="button" class="btn" data-ln="preview-urgent">ดูตัวอย่างเรื่องด่วน</button>
          <button type="button" class="btn" data-ln="preview-weekly">ดูตัวอย่างสรุปรายสัปดาห์</button>
          <span class="spacer"></span>
          <button type="button" class="btn" data-ln="test"${c.targets.length ? '' : ' disabled'}>ส่งทดสอบ</button>
          <button type="button" class="btn primary" data-ln="urgent"${c.targets.length ? '' : ' disabled'}>ส่งเรื่องด่วนตอนนี้</button>
          <button type="button" class="btn" data-ln="weekly"${c.targets.length ? '' : ' disabled'}>ส่งสรุปตอนนี้</button>
        </div>
        <pre class="ln-preview" hidden></pre></div>
      <div class="card"><div class="card-h"><h2>ผู้รับ</h2>${U.badge('info', `${c.targets.length} ราย`)}<p>รหัส LINE ของผู้ใช้ (U…) กลุ่ม (C…) หรือห้องแชท (R…) — เลือกได้ว่าจะรับเรื่องด่วน และ / หรือสรุปรายสัปดาห์</p></div>
        <div class="card-b flush table-wrap">${c.targets.length ? `<table class="tbl"><thead><tr><th>ชื่อ</th><th>รหัส LINE</th><th>เรื่องด่วน</th><th>สรุปรายสัปดาห์</th><th></th></tr></thead><tbody>
          ${c.targets.map((t, i) => `<tr><td><b>${esc(t.name || '–')}</b><small>${esc(kindOf(t.id))}</small></td><td><code>${esc(t.id)}</code></td>
            <td><input type="checkbox" data-ln-t="${i}" data-k="urgent"${t.urgent ? ' checked' : ''} aria-label="รับเรื่องด่วน"></td>
            <td><input type="checkbox" data-ln-t="${i}" data-k="weekly"${t.weekly ? ' checked' : ''} aria-label="รับสรุปรายสัปดาห์"></td>
            <td class="num"><button type="button" class="link-btn neg" data-ln-del="${i}">ลบ</button></td></tr>`).join('')}</tbody></table>` : '<p class="empty">ยังไม่มีผู้รับ</p>'}</div>
        <form class="card-b ln-add" data-ln-form>
          <label><span>ชื่อ</span><input name="name" placeholder="เช่น กลุ่ม BU4 Project"></label>
          <label><span>รหัส LINE</span><input name="id" placeholder="C1234… / U1234…" required></label>
          <button class="btn">+ เพิ่มผู้รับ</button></form></div>
      ${seen.length ? `<div class="card"><div class="card-h"><h2>ที่บอทพบ</h2><p>กลุ่ม / ผู้ใช้ที่เพิ่มบอทหรือพิมพ์ "id" — กด + เพื่อเพิ่มเป็นผู้รับ</p></div><div class="card-b flush table-wrap"><table class="tbl"><tbody>
          ${seen.map((s) => `<tr><td><b>${esc(s.name || kindOf(s.id))}</b><small>${esc(kindOf(s.id))} · ${esc(s.at || '')}</small></td><td><code>${esc(s.id)}</code></td><td class="num"><button type="button" class="btn sm" data-ln-seen="${esc(s.id)}" data-name="${esc(s.name || '')}">+ เพิ่ม</button></td></tr>`).join('')}
        </tbody></table></div></div>` : ''}`;

    const rerender = () => L.render(el);
    const pre = el.querySelector('.ln-preview');
    const busy = async (btn, fn) => { btn.disabled = true; btn.classList.add('loading'); try { await fn(); } catch (e) { U.alert(e.message || 'ไม่สำเร็จ'); } finally { btn.disabled = false; btn.classList.remove('loading'); } };
    el.onchange = (e) => {
      const t = e.target;
      if (t.dataset.ln === 'enabled') { const x = cfg(); x.enabled = t.checked; save(x); U.toast(t.checked ? 'เปิดส่งอัตโนมัติแล้ว' : 'ปิดส่งอัตโนมัติแล้ว'); return; }
      if (t.dataset.lnT !== undefined) { const x = cfg(); x.targets[Number(t.dataset.lnT)][t.dataset.k] = t.checked; save(x); }
    };
    el.onsubmit = (e) => {
      if (!e.target.matches('[data-ln-form]')) return;
      e.preventDefault();
      const f = e.target, id = f.id.value.trim();
      if (!validId(id)) { U.alert('รหัส LINE ต้องขึ้นต้นด้วย U (ผู้ใช้) C (กลุ่ม) หรือ R (ห้อง) ตามด้วยตัวอักษร 32 ตัว — ให้บอทบอกรหัส: พิมพ์ "id" ในแชท'); return; }
      const x = cfg();
      if (x.targets.some((t) => t.id === id)) { U.alert('มีผู้รับนี้แล้ว'); return; }
      x.targets.push({ id, name: f.name.value.trim(), urgent: true, weekly: true });
      save(x); rerender();
    };
    el.onclick = (e) => {
      const del = e.target.closest('[data-ln-del]');
      if (del) { const x = cfg(); x.targets.splice(Number(del.dataset.lnDel), 1); save(x); rerender(); return; }
      const sn = e.target.closest('[data-ln-seen]');
      if (sn) { const x = cfg(); x.targets.push({ id: sn.dataset.lnSeen, name: sn.dataset.name, urgent: true, weekly: true }); save(x); rerender(); return; }
      const b = e.target.closest('button[data-ln]');
      if (!b) return;
      const act = b.dataset.ln;
      if (act.startsWith('preview')) {
        busy(b, async () => { const r = await call({ mode: act.slice(8), dryRun: true }); pre.hidden = false; pre.textContent = r.text || '(ไม่มีเรื่องด่วนตอนนี้ — วันนี้ระบบจะไม่ส่งข้อความ)'; });
        return;
      }
      busy(b, async () => {
        const r = await call({ mode: act });
        U.toast(r.skipped ? `ไม่ได้ส่ง: ${r.skipped}` : `ส่งแล้ว ${r.sent || 0} ราย${r.failed ? ` · ไม่สำเร็จ ${r.failed}` : ''}`);
        if (r.failed) U.alert(`ส่งไม่สำเร็จ ${r.failed} ราย:\n${(r.errors || []).join('\n')}`);
      });
    };
  };
})();
