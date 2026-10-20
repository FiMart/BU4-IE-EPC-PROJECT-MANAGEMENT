/* daily.js — Daily Site Report (project tab "รายงานประจำวัน")
   One report per project per day: weather (morning / afternoon) · hours lost to weather · manpower (staff / subcontractors)
   · equipment · work done today · plan for tomorrow · problems · safety · visitors · site photos. Printable as a PDF for the client.
   Data: collection 'dailies' = [{ id, projectId, date, weatherAm, weatherPm, lostHours, staff, sub, manpower, equipment,
          work, next, issues, safety, visitors, photos: [files], createdBy, createdByName, updatedAt }]
   Photos: Storage <projectId>/daily/<reportId> (every role may view). No SQL needed (new collections are accepted). */
(function () {
  const U = PM.ui, esc = U.esc;
  const WEATHER = [
    { key: 'sun', label: 'แดด / ปกติ', ic: '☀️' },
    { key: 'cloud', label: 'เมฆมาก', ic: '⛅' },
    { key: 'rain', label: 'ฝนเล็กน้อย', ic: '🌦️' },
    { key: 'storm', label: 'ฝนตกหนัก / หยุดงาน', ic: '⛈️' },
  ];
  const wx = (k) => WEATHER.find((w) => w.key === k) || WEATHER[0];
  const listOf = (p) => (PM.db.dailies || []).filter((d) => d.projectId === p.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const people = (d) => (Number(d.staff) || 0) + (Number(d.sub) || 0);
  /* the last N working days up to today (Mon – Fri, not public holidays) */
  function workdays(n, T) {
    const out = [];
    for (let d = T; out.length < n; d = PM.addDays(d, -1)) if (!PM.isOffDay(d)) out.push(d);
    return out.reverse();
  }
  /* last working day before today without a report — for the notification bell (notify.js) */
  PM.dailyMissing = function (p, T) {
    const list = listOf(p);
    if (!list.length) return null; // the project doesn't use daily reports
    const d = workdays(2, T)[0];
    return list.some((x) => x.date === d) ? null : d;
  };

  /* demo data: the last working days of the projects that are on site (construction), one gap left on purpose */
  PM.buildSampleDailies = function (projects, T) {
    const WORK = ['ติดตั้ง Cable tray Line 100 ระยะ 60 ม.', 'เดินสายไฟ MDB → DB-2 ระยะ 120 ม.', 'ติดตั้งฐานเครื่องจักร Pump P-101 / P-102', 'เชื่อมท่อ 4" Line 200 จำนวน 18 จุด', 'ทดสอบ Insulation resistance สาย Feeder 4 เส้น', 'ติดตั้งโครงสร้างเหล็ก Pipe rack แกน C–D'];
    const out = [];
    projects.filter((p) => p.status !== 'closed' && (p.phases || []).some((ph) => ph.key === 'construction' && (ph.progress || 0) > 0 && (ph.progress || 0) < 100)).forEach((p, pi) => {
      workdays(9, T).slice(0, -1).forEach((d, i) => {
        if (i === 3 && pi === 0) return; // a missing day shows up in the 14-day strip
        const rain = (i + pi) % 4 === 2;
        out.push({ id: `DR-${p.id}-${d}`, projectId: p.id, date: d, weatherAm: 'sun', weatherPm: rain ? 'rain' : 'cloud', lostHours: rain ? 1.5 : 0,
          staff: 4 + (i % 2), sub: 12 + ((i * 3 + pi) % 6), manpower: 'วิศวกร 1 · โฟร์แมน 1 · ช่างไฟ 6 · ช่างเชื่อม 4 · คนงาน 4', equipment: 'รถเครน 25 ตัน 1 · รถกระเช้า 1 · เครื่องเชื่อม 4',
          work: [WORK[(i + pi) % WORK.length], WORK[(i + pi + 2) % WORK.length]].join('\n'), next: WORK[(i + pi + 1) % WORK.length],
          issues: i === 2 ? 'วัสดุ Cable gland ขนาด M40 ยังไม่ส่ง — ตามผู้ขายแล้ว' : '', safety: 'Toolbox talk 08:00 — การทำงานบนที่สูง', visitors: i === 5 ? 'ตัวแทนลูกค้าตรวจงานติดตั้ง' : '',
          photos: [], createdBy: '', createdByName: 'Site Engineer', updatedAt: d + 'T17:30:00.000Z' });
      });
    });
    return out;
  };

  PM.dailyTab = function (el, p, m, rerender) {
    const T = PM.today(), canEdit = PM.can('daily.edit');
    const list = listOf(p);
    const month = T.slice(0, 7);
    const thisMonth = list.filter((d) => d.date.slice(0, 7) === month);
    const monthDays = workdays(31, T).filter((d) => d.slice(0, 7) === month);
    const strip = workdays(14, T);
    const byDate = {}; list.forEach((d) => (byDate[d.date] = d));
    const today = byDate[T];
    el.innerHTML = `
      <div class="row">
        <p class="muted" style="margin:0">บันทึกทุกวันทำงาน — สภาพอากาศ · กำลังคน · งานที่ทำ · ปัญหา · รูปถ่ายหน้างาน · พิมพ์เป็น PDF ส่งลูกค้าได้</p>
        <span class="spacer"></span>
        ${canEdit ? `<button class="btn primary" data-dr="${today ? 'edit' : 'new'}"${today ? ` data-id="${esc(today.id)}"` : ''}>${today ? '✎ แก้รายงานวันนี้' : '+ รายงานวันนี้'}</button>` : ''}
      </div>
      <div class="grid cols-4">
        ${PM.common.tile({ label: 'รายงานเดือนนี้', value: `${thisMonth.length} <small>/ ${monthDays.length} วันทำงาน</small>`, sub: monthDays.length && thisMonth.length >= monthDays.length ? U.badge('good', 'ครบ') : U.badge('warning', `ขาด ${Math.max(0, monthDays.length - monthDays.filter((d) => byDate[d]).length)} วัน`), icon: 'calendar' })}
        ${PM.common.tile({ label: 'กำลังคนเฉลี่ย / วัน', value: thisMonth.length ? U.num(PM.sum(thisMonth, people) / thisMonth.length, 1) : '–', sub: `พนักงาน ${U.num(PM.sum(thisMonth, (d) => Number(d.staff) || 0))} · ผู้รับเหมา ${U.num(PM.sum(thisMonth, (d) => Number(d.sub) || 0))} คน-วัน`, icon: 'people' })}
        ${PM.common.tile({ label: 'ชั่วโมงที่เสียจากสภาพอากาศ', value: `${U.num(PM.sum(thisMonth, (d) => Number(d.lostHours) || 0), 1)} <small>ชม.</small>`, sub: `ฝน ${thisMonth.filter((d) => /rain|storm/.test(d.weatherAm + d.weatherPm)).length} วันในเดือนนี้`, icon: 'clock' })}
        ${PM.common.tile({ label: 'วันที่มีปัญหา', value: thisMonth.filter((d) => (d.issues || '').trim()).length, sub: 'เดือนนี้ — ดูรายละเอียดในตาราง', icon: 'alert' })}
      </div>
      <div class="card"><div class="card-h"><h2>14 วันทำงานล่าสุด</h2><p>✓ = มีรายงาน · กดวันเพื่อเปิด / เขียนรายงานของวันนั้น</p></div>
        <div class="card-b"><div class="dr-strip">${strip.map((d) => {
          const r = byDate[d];
          return `<button type="button" class="dr-day${r ? ' has' : ''}${d === T ? ' today' : ''}" data-dr="${r ? 'edit' : 'new'}" data-date="${d}"${r ? ` data-id="${esc(r.id)}"` : ''}${!r && !canEdit ? ' disabled' : ''}
            title="${esc(U.date(d))}${r ? ` · ${wx(r.weatherAm).label} · ${people(r)} คน` : ' · ยังไม่มีรายงาน'}">
            <small>${['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'][new Date(d + 'T00:00:00').getDay()]}</small><b>${+d.slice(8)}</b><i>${r ? wx(r.weatherAm).ic : '–'}</i></button>`;
        }).join('')}</div></div></div>
      <div class="card"><div class="card-h"><h2>รายงานประจำวัน — ${esc(p.code)}</h2><span class="badge info"><i>i</i>${list.length} รายงาน</span><p>คลิกแถวเพื่อเปิด · 🖨 พิมพ์ / บันทึก PDF ส่งลูกค้า</p></div>
        <div class="card-b flush table-wrap">${list.length ? `<table class="tbl"><thead><tr><th>วันที่</th><th>สภาพอากาศ</th><th class="num">กำลังคน</th><th>งานที่ทำ</th><th>ปัญหา</th><th class="num">รูป</th><th>ผู้บันทึก</th><th></th></tr></thead><tbody>
          ${list.slice(0, 60).map((d) => `<tr class="click" data-dr="edit" data-id="${esc(d.id)}">
            <td class="nowrap"><b>${U.date(d.date)}</b></td>
            <td class="nowrap" title="เช้า: ${esc(wx(d.weatherAm).label)} · บ่าย: ${esc(wx(d.weatherPm).label)}">${wx(d.weatherAm).ic} ${wx(d.weatherPm).ic}${Number(d.lostHours) ? `<small>หยุด ${U.num(d.lostHours, 1)} ชม.</small>` : ''}</td>
            <td class="num">${people(d)}<small>${U.num(d.staff || 0)} + ${U.num(d.sub || 0)}</small></td>
            <td>${esc(String(d.work || '').split('\n')[0].slice(0, 90))}</td>
            <td>${(d.issues || '').trim() ? `<span class="neg">${esc(d.issues.split('\n')[0].slice(0, 60))}</span>` : '<span class="muted">–</span>'}</td>
            <td class="num">${(d.photos || []).length || '–'}</td>
            <td><small>${esc(d.createdByName || '–')}</small></td>
            <td><button type="button" class="btn sm" data-dr="print" data-id="${esc(d.id)}">🖨 พิมพ์</button></td></tr>`).join('')}
          </tbody></table>` : `<p class="empty">ยังไม่มีรายงานประจำวัน${canEdit ? ' — กด "+ รายงานวันนี้"' : ''}</p>`}</div></div>`;

    el.onclick = (e) => {
      const a = e.target.closest('[data-dr]');
      if (!a || a.disabled) return;
      const r = a.dataset.id && (PM.db.dailies || []).find((x) => x.id === a.dataset.id);
      if (a.dataset.dr === 'print') { e.stopPropagation(); if (r) PM.dailyPrint(p, r); return; }
      if (a.dataset.dr === 'edit' && r) dailyForm(p, r, null, rerender);
      if (a.dataset.dr === 'new' && canEdit) dailyForm(p, null, a.dataset.date || T, rerender);
    };
  };

  function dailyForm(p, rep, date, done) {
    const canEdit = PM.can('daily.edit');
    const prev = listOf(p)[0]; // yesterday's numbers are a good start for today
    const u = PM.auth && PM.auth.user;
    const x = rep || {
      id: PM.uid('DR'), projectId: p.id, date, weatherAm: 'sun', weatherPm: 'sun', lostHours: 0,
      staff: prev ? prev.staff : 0, sub: prev ? prev.sub : 0, manpower: prev ? prev.manpower : '', equipment: prev ? prev.equipment : '',
      work: '', next: '', issues: '', safety: '', visitors: '', photos: [],
    };
    const wxOpts = WEATHER.map((w) => ({ value: w.key, label: `${w.ic} ${w.label}` }));
    const form = U.modal({
      title: `${rep ? 'รายงานประจำวัน' : 'รายงานประจำวันใหม่'} — ${p.code} · ${U.date(x.date)}`, wide: true, submitLabel: 'บันทึกรายงาน',
      onDelete: rep && canEdit ? () => {
        PM.poFiles.remove((x.photos || []).map((f) => f.path)).catch(() => { /* already gone */ });
        PM.remove('dailies', x.id); U.toast('ลบรายงานแล้ว'); done();
      } : null,
      body: `
        ${U.field('วันที่', 'date', x.date, { type: 'date', required: true })}
        ${U.field('ชั่วโมงที่หยุดงานเพราะสภาพอากาศ', 'lostHours', x.lostHours, { type: 'number', min: 0, max: 24, step: 0.5 })}
        ${U.field('สภาพอากาศ — เช้า', 'weatherAm', x.weatherAm, { options: wxOpts })}
        ${U.field('สภาพอากาศ — บ่าย', 'weatherPm', x.weatherPm, { options: wxOpts })}
        <div class="sub-h">กำลังคนและเครื่องจักร</div>
        ${U.field('พนักงานบริษัท (คน)', 'staff', x.staff, { type: 'number', min: 0 })}
        ${U.field('ผู้รับเหมาช่วง (คน)', 'sub', x.sub, { type: 'number', min: 0 })}
        ${U.field('รายละเอียดกำลังคน', 'manpower', x.manpower, { type: 'textarea', rows: 2, full: true, placeholder: 'เช่น วิศวกร 1 · โฟร์แมน 1 · ช่างไฟ 6 (บ.ABC) · ช่างเชื่อม 4' })}
        ${U.field('เครื่องจักร / อุปกรณ์ที่ใช้', 'equipment', x.equipment, { type: 'textarea', rows: 2, full: true, placeholder: 'เช่น รถเครน 25 ตัน 1 คัน · รถกระเช้า 1 · เครื่องเชื่อม 4' })}
        <div class="sub-h">งาน</div>
        ${U.field('งานที่ทำวันนี้', 'work', x.work, { type: 'textarea', rows: 4, full: true, placeholder: 'หนึ่งบรรทัดต่อหนึ่งงาน เช่น เดินสาย Tray Line 100 ระยะ 120 ม.' })}
        ${U.field('แผนงานพรุ่งนี้', 'next', x.next, { type: 'textarea', rows: 2, full: true })}
        ${U.field('ปัญหา / อุปสรรค / สิ่งที่ต้องการจากลูกค้า', 'issues', x.issues, { type: 'textarea', rows: 2, full: true })}
        ${U.field('ความปลอดภัย (Toolbox talk · อุบัติเหตุ · เกือบเกิดเหตุ)', 'safety', x.safety, { type: 'textarea', rows: 2, full: true })}
        ${U.field('ผู้เข้าเยี่ยม / ตรวจงาน', 'visitors', x.visitors, { full: true })}
        ${PM.poFiles.boxHtml(canEdit, 'รูปถ่ายหน้างาน', 'รูปภาพ / PDF · ทุกคนในทีมเห็นได้ · แสดงในรายงานที่พิมพ์', 'photos')}
        ${rep ? `<p class="full muted" style="margin:0">บันทึกโดย ${esc(x.createdByName || '–')}${x.updatedAt ? ` · แก้ไขล่าสุด ${U.date(x.updatedAt.slice(0, 10))}` : ''}</p>` : ''}`,
      onSubmit: !canEdit ? null : (f, frm) => {
        if (!f.work) { U.alert('กรุณากรอกงานที่ทำวันนี้'); return false; }
        const dup = (PM.db.dailies || []).find((d) => d.projectId === p.id && d.date === f.date && d.id !== x.id);
        if (dup) { U.alert(`มีรายงานของวันที่ ${U.date(f.date)} อยู่แล้ว — เปิดรายงานเดิมเพื่อแก้ไข`); return false; }
        (async () => {
          const btn = frm.querySelector('[type=submit]'); btn.disabled = true; btn.classList.add('loading');
          const { files: kept, problems } = await files.commit(`${p.id}/daily/${x.id}`, btn);
          Object.assign(x, f, { photos: kept, updatedAt: new Date().toISOString() });
          if (!rep) Object.assign(x, { createdBy: u ? u.id : '', createdByName: u ? PM.auth.displayName(u) : '' });
          PM.upsert('dailies', x);
          U.closeModal();
          U.toast(problems.length ? 'บันทึกแล้ว แต่รูปบางรูปมีปัญหา' : 'บันทึกรายงานแล้ว');
          if (problems.length) U.alert('ไฟล์ที่ไม่สำเร็จ:\n' + problems.join('\n'));
          done();
        })();
        return false;
      },
    });
    const files = PM.poFiles.box(form, x.photos, canEdit, 'photos');
    if (!canEdit) form.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; });
  }

  /* printable daily report (A4) — site photos are shown as pictures when the cloud can hand out their links */
  PM.dailyPrint = async function (p, d) {
    const P = PM.printDoc, win = P.open();
    if (!win) return;
    const isImg = (f) => /\.(png|jpe?g|webp)$/i.test(f.name) || /^image\//.test(f.type || '');
    const photos = [];
    for (const f of (d.photos || []).filter(isImg).slice(0, 12)) {
      try { photos.push({ name: f.name, url: await PM.poFiles.url(f.path) }); } catch (e) { /* not reachable — listed by name below */ }
    }
    const para = (t) => (String(t || '').trim() ? `<p class="dr-p">${esc(t)}</p>` : '<p class="none">–</p>');
    // project progress on the report's own date (progress snapshots), not today's — an old report reprints the same
    const snap = (p.progressLog || []).filter((s) => s.date <= d.date).pop();
    const planVals = {}; (p.phases || []).forEach((ph) => (planVals[ph.key] = PM.plannedPct(ph, d.date) * 100));
    const asOf = { act: snap ? PM.weightedProgress(p, snap.values) / 100 : 0, plan: PM.weightedProgress(p, planVals) / 100 };
    P.write(win, {
      title: `Daily Report ${p.code} ${d.date}`, bar: `รายงานประจำวัน — ${p.code} · ${U.date(d.date)}`,
      head: {
        title: `<h1>รายงานประจำวัน (Daily Site Report)</h1><p><b>${esc(p.code)} · ${esc(p.name)}</b></p><p>ลูกค้า ${esc(p.client || '–')} · PM ${esc(PM.common.pmName(p))}</p>`,
        meta: `${esc(PM.COMPANY)}<br>วันที่ <b>${U.date(d.date)}</b><br>${new Date(d.date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long' })}`,
      },
      body: `
  <style>.dr-p { margin: 2px 0 0; white-space: pre-line; } .dr-photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; } .dr-photos figure { margin: 0; break-inside: avoid; } .dr-photos img { width: 100%; height: 150px; object-fit: cover; border-radius: 4px; border: 1px solid #d5deea; } .dr-photos figcaption { font-size: 9px; color: #6a7a91; }</style>
  <section><div class="kpis">
    ${P.kpi('สภาพอากาศ เช้า', `${wx(d.weatherAm).ic} ${esc(wx(d.weatherAm).label)}`)}
    ${P.kpi('สภาพอากาศ บ่าย', `${wx(d.weatherPm).ic} ${esc(wx(d.weatherPm).label)}`, Number(d.lostHours) ? `หยุดงาน ${U.num(d.lostHours, 1)} ชม.` : '', Number(d.lostHours) ? 'warning' : null)}
    ${P.kpi('กำลังคนรวม', `${people(d)} คน`, `พนักงาน ${U.num(d.staff || 0)} · ผู้รับเหมา ${U.num(d.sub || 0)}`)}
    ${P.kpi(`ความคืบหน้า ณ ${U.date(d.date)}`, U.pct(asOf.act, 1), `แผน ${U.pct(asOf.plan, 1)}`, asOf.act < asOf.plan - 0.1 ? 'critical' : asOf.act < asOf.plan - 0.03 ? 'warning' : 'good')}
  </div></section>
  <section><h2>1. งานที่ทำวันนี้</h2>${para(d.work)}</section>
  <section><h2>2. แผนงานพรุ่งนี้</h2>${para(d.next)}</section>
  <section><div class="two"><div><h2>3. กำลังคน</h2>${para(d.manpower)}</div><div><h2>4. เครื่องจักร / อุปกรณ์</h2>${para(d.equipment)}</div></div></section>
  <section><div class="two"><div><h2>5. ปัญหา / อุปสรรค</h2>${para(d.issues)}</div><div><h2>6. ความปลอดภัย</h2>${para(d.safety)}</div></div></section>
  ${String(d.visitors || '').trim() ? `<section><h2>7. ผู้เข้าเยี่ยม / ตรวจงาน</h2>${para(d.visitors)}</section>` : ''}
  ${(d.photos || []).length ? `<section class="flow"><h2>รูปถ่ายหน้างาน (${d.photos.length})</h2>
    ${photos.length ? `<div class="dr-photos">${photos.map((x) => `<figure><img src="${esc(x.url)}" alt="${esc(x.name)}"><figcaption>${esc(x.name)}</figcaption></figure>`).join('')}</div>` : ''}
    ${d.photos.length > photos.length ? `<p class="none">ไฟล์อื่น: ${esc(d.photos.filter((f) => !photos.some((x) => x.name === f.name)).map((f) => f.name).join(', '))}</p>` : ''}</section>` : ''}
  <div class="sign"><div>ผู้จัดทำ (${esc(d.createdByName || 'Site Engineer')})</div><div>ผู้จัดการโครงการ</div><div>ตัวแทนลูกค้า / ผู้ควบคุมงาน</div></div>`,
    });
  };
})();
