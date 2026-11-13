/* lessons.js — lessons learned (page "บทเรียน" + project tab) and why bids were lost
   Lesson: what went well / what to do differently, from a project, a bid or in general — searchable by client, category, words,
   so the next proposal or project starts from what the team already knows.
   Lost / No-bid: when a bid is marked Lost or No-bid the app asks why (and who won); the reasons add up on this page.
   A lesson keeps the project's / bid's code and client, so it outlives a deleted project.
   Data: collection 'lessons' = [{ id, source: project | bid | general, projectId, bidId, refCode, refName, client, category, kind: good | improve,
          title, detail, recommendation, tags, date, createdBy, createdByName }]
         bid.loss = { reason, competitor, note, at, by } (on the bid itself — no price in it) */
(function () {
  const U = PM.ui, esc = U.esc;
  const CATS = ['การประมูล / ราคา', 'เทคนิค / ออกแบบ', 'จัดซื้อ / ผู้ขาย', 'ผลิต / FAT', 'ติดตั้ง / หน้างาน', 'ทดสอบ / Commissioning', 'เอกสาร', 'ความปลอดภัย', 'สื่อสารกับลูกค้า', 'บริหารโครงการ', 'อื่น ๆ'];
  const KIND = { good: { label: 'ทำได้ดี — ทำต่อ', level: 'good' }, improve: { label: 'ควรปรับปรุง', level: 'warning' } };
  PM.LOSS_REASONS = ['ราคาสูงกว่าคู่แข่ง', 'ข้อเสนอทางเทคนิคไม่ผ่าน', 'ระยะเวลาส่งมอบนานกว่า', 'ส่งข้อเสนอไม่ทัน / ไม่ครบ', 'ไม่มีสินค้าตาม Spec / AVL', 'ลูกค้าเลือกผู้ขายรายเดิม', 'ลูกค้ายกเลิก / เลื่อนโครงการ', 'ไม่ยื่น: งานไม่ตรงความถนัด', 'ไม่ยื่น: ทีมไม่ว่าง / เวลาไม่พอ', 'ไม่ยื่น: เงื่อนไข / ความเสี่ยงสูง', 'อื่น ๆ'];
  const state = U.keep('lessons', { src: '', cat: '', q: '' }, ['src', 'cat']);
  const all = () => PM.db.lessons || [];
  const me = () => { const u = PM.auth && PM.auth.user; return { createdBy: u ? u.id : '', createdByName: u ? PM.auth.displayName(u) : '' }; };

  /* ---------- the form of one lesson ---------- */
  function lessonForm(item, preset, done) {
    const canEdit = PM.can('lesson.edit');
    const x = item || Object.assign({ id: PM.uid('LL'), source: 'general', projectId: '', bidId: '', refCode: '', refName: '', client: '', category: CATS[CATS.length - 1], kind: 'improve',
      title: '', detail: '', recommendation: '', tags: '', date: PM.today() }, preset);
    const projects = (PM.db.projects || []).slice().sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
    const mine = item && (PM.myUid && x.createdBy === PM.myUid());
    const form = U.modal({
      title: item ? x.title : 'บันทึกบทเรียน', wide: true,
      onDelete: item && canEdit && (mine || PM.myRole() === 'admin' || PM.myRole() === 'dept_manager') ? () => { PM.remove('lessons', x.id); U.toast('ลบแล้ว'); done(); } : null,
      body: `
        ${x.source === 'bid' ? `<p class="full muted" style="margin:0">จากงานประมูล <b>${esc(x.refCode)}</b> ${esc(x.refName)}${x.client ? ` · ${esc(x.client)}` : ''}</p>`
          : U.field('โครงการ', 'projectId', x.projectId, { options: [{ value: '', label: '— ทั่วไป ไม่ผูกกับโครงการ —' }].concat(projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))), full: true })}
        ${U.field('เรื่อง', 'title', x.title, { required: true, full: true, placeholder: 'เช่น FAT ล่าช้าเพราะลูกค้าอนุมัติ Procedure ช้า' })}
        ${U.field('ประเภท', 'kind', x.kind, { options: Object.keys(KIND).map((k) => ({ value: k, label: KIND[k].label })) })}
        ${U.field('หมวด', 'category', x.category, { options: CATS })}
        ${U.field('เกิดอะไรขึ้น / ผลกระทบ', 'detail', x.detail, { type: 'textarea', rows: 3, full: true })}
        ${U.field('ครั้งหน้าควรทำอย่างไร', 'recommendation', x.recommendation, { type: 'textarea', rows: 2, full: true, placeholder: 'สิ่งที่อยากให้ทีมทำ (หรือทำต่อ) ในงานถัดไป' })}
        ${U.field('คำค้น', 'tags', x.tags, { placeholder: 'เช่น Metering, Flow Computer, PTT' })}
        ${U.field('วันที่', 'date', x.date, { type: 'date' })}`,
      onSubmit: !canEdit ? null : (f) => {
        if (x.source !== 'bid') {
          const p = f.projectId ? PM.find('projects', f.projectId) : null;
          Object.assign(x, { source: p ? 'project' : 'general', projectId: p ? p.id : '', refCode: p ? p.code : '', refName: p ? p.name : '', client: p ? p.client || '' : x.client });
        }
        delete f.projectId;
        Object.assign(x, f, item ? {} : me());
        PM.upsert('lessons', x);
        U.toast('บันทึกแล้ว');
        done();
      },
    });
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
  }
  PM.lessonForm = lessonForm;

  /* ---------- why a bid was lost (asked when it is marked Lost / No-bid; can be filled in later) ---------- */
  PM.askLoss = function (b, done) {
    const l = b.loss || {};
    U.modal({
      title: `${b.result === 'nobid' ? 'เหตุผลที่ไม่ยื่น' : 'เหตุผลที่ไม่ได้งาน'} — ${PM.dash(b.code)}`, submitLabel: 'บันทึก',
      body: `<p class="full muted" style="margin:0">${esc(PM.dash(b.name))} · ${esc(PM.dash(b.client))} — ใช้ดูสาเหตุที่แพ้บ่อยในหน้า "บทเรียน"</p>
        ${U.field('สาเหตุหลัก', 'reason', l.reason || (b.result === 'nobid' ? PM.LOSS_REASONS[8] : PM.LOSS_REASONS[0]), { options: PM.LOSS_REASONS })}
        ${b.result === 'nobid' ? '' : U.field('ผู้ที่ได้งาน (คู่แข่ง)', 'competitor', l.competitor || '', { placeholder: 'ถ้าทราบ' })}
        ${U.field('รายละเอียด', 'note', l.note || '', { type: 'textarea', rows: 2, full: true, placeholder: 'เช่น ราคาต่างประมาณ 8% · ลูกค้าต้องการส่งของใน 8 สัปดาห์' })}
        ${PM.can('lesson.edit') ? `<div class="full avl-chks"><label class="avl-chk"><input type="checkbox" name="asLesson"${b.loss ? '' : ' checked'}><span>บันทึกเป็นบทเรียนด้วย<small>ทีมค้นเจอตอนทำข้อเสนองานถัดไปของลูกค้ารายนี้</small></span></label></div>` : ''}`,
      onSubmit: (f) => {
        const u = PM.auth && PM.auth.user;
        b.loss = { reason: f.reason, competitor: f.competitor || '', note: f.note || '', at: PM.today(), by: u ? PM.auth.displayName(u) : '' };
        PM.upsert('bids', b);
        if (f.asLesson && !all().some((x) => x.bidId === b.id)) {
          PM.db.lessons.push(Object.assign({ id: PM.uid('LL'), source: 'bid', projectId: '', bidId: b.id, refCode: PM.dash(b.code), refName: b.name || '', client: b.client || '', category: 'การประมูล / ราคา', kind: 'improve',
            title: `${b.result === 'nobid' ? 'ไม่ยื่น' : 'แพ้'}: ${f.reason}${f.competitor ? ` (ได้งาน: ${f.competitor})` : ''}`, detail: f.note || '', recommendation: '', tags: b.client || '', date: PM.today() }, me()));
          PM.save();
        }
        U.toast('บันทึกเหตุผลแล้ว');
        if (done) done();
      },
    });
  };

  /* ---------- a list of lessons (page and project tab) ---------- */
  function table(list, opts) {
    if (!list.length) return `<p class="empty">${opts.empty}</p>`;
    return `<div class="ll-list">${list.map((x) => `<article class="ll-item click" data-ll="${esc(x.id)}" tabindex="0">
      <div class="ll-h">${U.badge(KIND[x.kind] ? KIND[x.kind].level : 'neutral', KIND[x.kind] ? KIND[x.kind].label : '')}<span class="chip">${esc(x.category)}</span>
        ${opts.ref && x.refCode ? `<span class="muted">${x.source === 'bid' ? 'Bid' : 'โครงการ'} ${esc(x.refCode)}${x.client ? ` · ${esc(x.client)}` : ''}</span>` : ''}<span class="spacer"></span><small class="muted">${U.date(x.date)} · ${esc(x.createdByName || '')}</small></div>
      <b class="ll-t">${esc(x.title)}</b>
      ${x.detail ? `<p>${esc(x.detail)}</p>` : ''}${x.recommendation ? `<p class="ll-rec"><b>ครั้งหน้า:</b> ${esc(x.recommendation)}</p>` : ''}
      ${x.tags ? `<small class="muted">คำค้น: ${esc(x.tags)}</small>` : ''}</article>`).join('')}</div>`;
  }
  const text = (x) => `${x.title} ${x.detail} ${x.recommendation} ${x.tags} ${x.refCode} ${x.refName} ${x.client} ${x.category}`.toLowerCase();

  PM.views.lessons = function (el) {
    const canEdit = PM.can('lesson.edit');
    const T = PM.today();
    const decided = (PM.db.bids || []).filter((b) => b.result === 'lost' || b.result === 'nobid');
    const noReason = decided.filter((b) => !b.loss).sort((a, b) => String(b.resultDate).localeCompare(String(a.resultDate)));
    const counts = {};
    decided.filter((b) => b.loss).forEach((b) => { counts[b.loss.reason] = (counts[b.loss.reason] || 0) + 1; });
    const comp = {};
    decided.filter((b) => b.loss && b.loss.competitor).forEach((b) => { const k = b.loss.competitor.trim(); comp[k] = (comp[k] || 0) + 1; });
    const q = String(state.q || '').trim().toLowerCase();
    const list = all().filter((x) => (!state.src || x.source === state.src) && (!state.cat || x.category === state.cat) && (!q || text(x).includes(q)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const nBy = (k) => all().filter((x) => x.kind === k).length;
    el.innerHTML = `
      <div class="row">
        <input type="search" id="ll-q" placeholder="ค้นหา: ลูกค้า · อุปกรณ์ · ปัญหา" aria-label="ค้นหาบทเรียน" value="${esc(state.q)}" style="max-width:300px">
        <select id="ll-cat" aria-label="หมวด">${U.options([{ value: '', label: 'ทุกหมวด' }].concat(CATS.map((c) => ({ value: c, label: c }))), state.cat)}</select>
        ${PM.common.seg('llsrc', [{ key: '', label: `ทั้งหมด (${all().length})` }, { key: 'project', label: 'จากโครงการ' }, { key: 'bid', label: 'จากงานประมูล' }, { key: 'general', label: 'ทั่วไป' }], state.src)}
        <span class="spacer"></span>
        ${canEdit ? '<button class="btn primary" data-ll-new>+ บันทึกบทเรียน</button>' : ''}
      </div>
      <div class="grid cols-4">
        ${PM.common.tile({ label: 'บทเรียนทั้งหมด', value: all().length, sub: `ทำได้ดี ${nBy('good')} · ควรปรับปรุง ${nBy('improve')}`, icon: 'book' })}
        ${PM.common.tile({ label: 'งานที่แพ้ / ไม่ยื่น', value: decided.length, sub: noReason.length ? U.badge('warning', `ยังไม่ระบุเหตุผล ${noReason.length}`) : U.badge('good', 'ระบุเหตุผลครบ'), icon: 'lost' })}
        ${PM.common.tile({ label: 'สาเหตุที่พบบ่อยที่สุด', value: Object.keys(counts).length ? `<small>${esc(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0])}</small>` : '–', sub: Object.keys(counts).length ? `${Math.max(...Object.values(counts))} งาน จาก ${decided.filter((b) => b.loss).length} ที่ระบุ` : 'ยังไม่มีข้อมูล', icon: 'chart' })}
        ${PM.common.tile({ label: 'คู่แข่งที่ได้งานบ่อย', value: Object.keys(comp).length ? `<small>${esc(Object.keys(comp).sort((a, b) => comp[b] - comp[a])[0])}</small>` : '–', sub: Object.keys(comp).length ? `${Math.max(...Object.values(comp))} งาน` : 'กรอกชื่อผู้ได้งานตอนกด Lost', icon: 'people' })}
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-h"><h2>สาเหตุที่ไม่ได้งาน / ไม่ยื่น</h2><p>นับจากงานที่กด Lost / No-bid แล้วระบุเหตุผล</p></div><div class="card-b"><div class="chart" id="c-loss"></div></div></div>
        <div class="card"><div class="card-h"><h2>งานที่ยังไม่ระบุเหตุผล</h2><p>คลิกเพื่อใส่เหตุผล${noReason.length > 8 ? ` · ${noReason.length} งาน แสดง 8 งานล่าสุด` : ''}</p></div>
          <div class="card-b flush table-wrap">${noReason.length ? `<table class="tbl"><tbody>${noReason.slice(0, 8).map((b) => `<tr class="click" data-loss="${esc(b.id)}"><td><span class="title">${esc(PM.dash(b.name))}</span><small>${esc(PM.dash(b.code))} · ${esc(PM.dash(b.client))}</small></td>
            <td>${V().resultBadge(b)}<small>${U.date(b.resultDate)}</small></td><td class="num">${canEdit || PM.canEditBid(b) ? '<span class="link-btn">ใส่เหตุผล</span>' : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">ระบุเหตุผลครบทุกงาน</p>'}</div></div>
      </div>
      <div class="card"><div class="card-h"><h2>บทเรียน</h2><p>${list.length} รายการ · คลิกเพื่อดู / แก้ไข · ใช้ค้นหาก่อนเริ่มทำข้อเสนอหรือเริ่มโครงการกับลูกค้าเดิม</p></div>
        <div class="card-b">${table(list, { ref: true, empty: all().length ? 'ไม่พบบทเรียนที่ตรงกับคำค้นหา' : 'ยังไม่มีบทเรียน — บันทึกเมื่อปิดโครงการ หรือเมื่อแพ้งานประมูล' })}</div></div>`;
    const items = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    if (items.length) PM.charts.hbars(el.querySelector('#c-loss'), { items: items.map((k) => ({ label: k, value: counts[k], display: `${counts[k]} งาน`, tip: `${k}: ${counts[k]} งาน` })) });
    else el.querySelector('#c-loss').innerHTML = '<p class="empty">ยังไม่มีงานที่ระบุเหตุผล</p>';
    const rerender = () => PM.views.lessons(el);
    el.oninput = (e) => { if (e.target.id === 'll-q') { state.q = e.target.value; clearTimeout(el._t); el._t = setTimeout(() => { rerender(); const i = el.querySelector('#ll-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); } };
    el.onchange = (e) => { if (e.target.id === 'll-cat') { state.cat = e.target.value; rerender(); } };
    el.onclick = (e) => {
      const seg = e.target.closest('[data-seg="llsrc"]');
      if (seg) { state.src = seg.dataset.val; rerender(); return; }
      if (e.target.closest('[data-ll-new]')) { lessonForm(null, null, rerender); return; }
      const lo = e.target.closest('[data-loss]');
      if (lo) { const b = PM.find('bids', lo.dataset.loss); if (b && (canEdit || PM.canEditBid(b))) PM.askLoss(b, rerender); return; }
      const it = e.target.closest('[data-ll]');
      if (it) { const x = PM.find('lessons', it.dataset.ll); if (x) lessonForm(x, null, rerender); }
    };
    void T;
  };
  const V = () => PM.common;

  /* ---------- project tab ---------- */
  PM.lessonsTab = function (el, p, m, rerender) {
    const canEdit = PM.can('lesson.edit');
    const list = all().filter((x) => x.projectId === p.id || (p.bidId && x.bidId === p.bidId)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const fromClient = p.client ? all().filter((x) => x.projectId !== p.id && PM.normName(x.client) === PM.normName(p.client)) : [];
    el.innerHTML = `
      <div class="row"><p class="muted" style="margin:0">สิ่งที่ทำได้ดีและสิ่งที่ควรปรับปรุงของโครงการนี้ — บันทึกระหว่างทางหรือตอนปิดโครงการ · ทุกคนในทีมอ่านได้ที่หน้า <a href="#/lessons">บทเรียน</a></p><span class="spacer"></span>
        ${canEdit ? '<button class="btn primary" data-ll-new>+ บันทึกบทเรียน</button>' : ''}</div>
      <div class="card"><div class="card-h"><h2>บทเรียนของ ${esc(p.code)}</h2><p>${list.length} รายการ</p></div><div class="card-b">${table(list, { empty: 'ยังไม่มีบทเรียนของโครงการนี้' })}</div></div>
      ${fromClient.length ? `<div class="card"><div class="card-h"><h2>บทเรียนจากงานอื่นของ ${esc(p.client)}</h2><p>${fromClient.length} รายการ · ควรอ่านก่อนเริ่มงาน</p></div><div class="card-b">${table(fromClient, { ref: true, empty: '' })}</div></div>` : ''}`;
    el.onclick = (e) => {
      if (e.target.closest('[data-ll-new]')) { lessonForm(null, { source: 'project', projectId: p.id, refCode: p.code, refName: p.name, client: p.client || '' }, rerender); return; }
      const it = e.target.closest('[data-ll]');
      if (it) { const x = PM.find('lessons', it.dataset.ll); if (x) lessonForm(x, null, rerender); }
    };
  };

  /* demo: a few lessons and reasons on the lost bids */
  PM.buildSampleLessons = function (db, T) {
    const out = [];
    const reasons = [PM.LOSS_REASONS[0], PM.LOSS_REASONS[2], PM.LOSS_REASONS[0], PM.LOSS_REASONS[1], PM.LOSS_REASONS[5]];
    db.bids.filter((b) => b.result === 'lost').slice(0, 5).forEach((b, i) => { b.loss = { reason: reasons[i % reasons.length], competitor: i % 2 ? 'Yokogawa' : 'Emerson Thailand', note: '', at: b.resultDate || T, by: 'Sales' }; });
    const p = db.projects.find((x) => x.status === 'closed') || db.projects[0];
    if (!p) return out;
    const L = [['improve', 'ผลิต / FAT', 'FAT เลื่อน 2 สัปดาห์ เพราะลูกค้าอนุมัติ FAT Procedure ช้า', 'ส่ง FAT Procedure พร้อมเอกสารชุดแรก และนัดวัน FAT ตั้งแต่ Kick-off'],
      ['good', 'จัดซื้อ / ผู้ขาย', 'สั่ง Flow Computer เร็วตั้งแต่สัปดาห์แรกช่วยให้ส่งของทัน', 'สั่งอุปกรณ์ Long-lead ทันทีที่ได้ PO ลูกค้า'],
      ['improve', 'เอกสาร', 'ลูกค้าตีกลับ Datasheet Rev.A เพราะใช้ Template เก่า', 'เช็ค Template เอกสารล่าสุดของลูกค้าก่อนส่ง Rev แรก']];
    L.forEach(([kind, category, title, recommendation], i) => out.push({ id: `LL-demo-${i + 1}`, source: 'project', projectId: p.id, bidId: '', refCode: p.code, refName: p.name, client: p.client || '', category, kind, title,
      detail: '', recommendation, tags: 'Metering', date: PM.addDays(T, -30 + i * 7), createdBy: '', createdByName: 'Project Manager' }));
    return out;
  };
})();
