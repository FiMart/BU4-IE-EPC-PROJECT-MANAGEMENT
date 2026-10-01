/* about.js — version and changelog of the website */
(function () {
  const U = PM.ui, V = PM.common, esc = U.esc;
  const TYPES = {
    feature: { label: 'ฟีเจอร์ใหม่', level: 'info' },
    improve: { label: 'ปรับปรุง', level: 'good' },
    fix: { label: 'แก้ไข', level: 'warning' },
  };
  const SEEN_KEY = 'epc-pm-seen-version';

  PM.versionSeen = () => { try { return localStorage.getItem(SEEN_KEY) === PM.VERSION; } catch (e) { return true; } };

  PM.views.about = function (el) {
    const log = PM.CHANGELOG;
    const cur = log[0];
    const host = (() => { try { return new URL((window.PM_CONFIG || {}).supabaseUrl).host; } catch (e) { return '–'; } })();
    const counts = { feature: 0, improve: 0, fix: 0 };
    log.forEach((r) => { counts[r.type] = (counts[r.type] || 0) + 1; });

    el.innerHTML = `
      <div class="card about-hero"><div class="card-b">
        <div class="brand-mark about-mark">BU4</div>
        <div class="about-id">
          <h2>${esc(PM.APP_NAME)}</h2>
          <p>${esc(PM.COMPANY)}</p>
          <div class="row" style="gap:8px;margin-top:8px">
            <span class="ver-badge">v${esc(PM.VERSION)}</span>
            <span class="muted">อัปเดตล่าสุด ${U.date(cur.date)} · ${esc(cur.title)}</span>
          </div>
        </div>
      </div></div>

      <div class="grid cols-4">
        ${V.tile({ label: 'เวอร์ชันปัจจุบัน', value: 'v' + esc(PM.VERSION), sub: U.date(cur.date) })}
        ${V.tile({ label: 'จำนวนการอัปเดต', value: log.length, sub: `ตั้งแต่ v${esc(log[log.length - 1].version)}` })}
        ${V.tile({ label: 'ฟีเจอร์ใหม่', value: counts.feature, sub: 'ครั้ง' })}
        ${V.tile({ label: 'ปรับปรุง / แก้ไข', value: counts.improve + counts.fix, sub: 'ครั้ง' })}
      </div>

      <div class="card">
        <div class="card-h"><h2>ประวัติการแก้ไขเว็บไซต์ (Changelog)</h2><p>เรียงจากเวอร์ชันล่าสุด</p></div>
        <div class="card-b">
          <ol class="changelog">
            ${log.map((r, i) => {
              const t = TYPES[r.type] || TYPES.improve;
              return `<li class="${i === 0 ? 'current' : ''}">
                <div class="cl-head">
                  <span class="cl-ver">v${esc(r.version)}</span>
                  ${U.badge(t.level, t.label)}
                  ${i === 0 ? '<span class="chip">ปัจจุบัน</span>' : ''}
                  <span class="cl-date">${U.date(r.date)}</span>
                </div>
                <div class="cl-title">${esc(r.title)}</div>
                <ul class="cl-items">${r.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
              </li>`;
            }).join('')}
          </ol>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h2>ข้อมูลระบบ</h2></div>
        <div class="card-b">
          <dl class="kv">
            <dt>เวอร์ชัน</dt><dd>v${esc(PM.VERSION)}</dd>
            <dt>บริษัท</dt><dd>${esc(PM.COMPANY)}</dd>
            <dt>ฐานข้อมูล</dt><dd>Supabase · ${esc(host)}</dd>
            <dt>สถานะ Cloud</dt><dd>${esc(PM.cloud.state === 'saved' ? 'เชื่อมต่อแล้ว' : PM.cloud.state)}</dd>
            <dt>Role ของคุณ</dt><dd>${esc(PM.auth.role ? PM.roleLabel(PM.auth.role) : '–')}</dd>
          </dl>
        </div>
      </div>`;

    try { localStorage.setItem(SEEN_KEY, PM.VERSION); } catch (e) { /* ignore */ }
    PM.updateVersionBadge();
  };

  /* menu badge: version number, highlighted as "ใหม่" until the About page has been opened */
  PM.updateVersionBadge = function () {
    const b = document.getElementById('nav-ver');
    if (!b) return;
    const isNew = !PM.versionSeen();
    b.textContent = isNew ? 'ใหม่' : 'v' + PM.VERSION;
    b.classList.toggle('new', isNew);
    b.title = isNew ? `มีอัปเดตใหม่ v${PM.VERSION}` : `เวอร์ชัน ${PM.VERSION}`;
    const more = document.getElementById('tab-more'); // bottom tab bar: About lives under "เพิ่มเติม"
    if (more) more.classList.toggle('has-new', isNew);
  };
})();
