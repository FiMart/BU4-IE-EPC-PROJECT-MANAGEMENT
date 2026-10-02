/* illus.js — pictures drawn as inline SVG (works offline, no image files):
   page banners, icons for each topic (process steps, KPI tiles, card / section headings), login artwork.
   Colours come from CSS variables (.il / .ic in styles.css) so every picture follows the light / dark theme. */
(function () {
  const I = (PM.illus = {});

  /* ---------- line icons (24 × 24, stroke = currentColor) ---------- */
  const DOTS = 'stroke-width="2.6"';
  const ICONS = {
    inquiry: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7.5l9 6 9-6"/>',
    estimate: `<rect x="5" y="3" width="14" height="18" rx="2"/><rect x="8" y="6" width="8" height="3.5" rx=".6"/><path ${DOTS} d="M8.5 13.5h.01M12 13.5h.01M15.5 13.5h.01M8.5 17h.01M12 17h.01M15.5 17h.01"/>`,
    proposal: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    submit: '<path d="M21 3L3 10.5l7 2.5 2.5 7z"/><path d="M21 3L10 13"/>',
    award: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20.5h8M9.5 17h5"/>',
    lost: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    engineering: '<circle cx="12" cy="6" r="2"/><path d="M12 2.5V4M11 7.8L6 20.5M13 7.8l5 12.7M7.6 16.5h8.8"/>',
    procurement: '<path d="M3 4h2.5l2.2 11h10.6L21 8H6.6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    construction: '<path d="M4 16a8 8 0 0 1 16 0"/><path d="M2.5 16h19v3h-19z"/><path d="M10 8.3V5.5h4v2.8"/>',
    closing: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4 2.5 4H5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    coins: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    quality: '<circle cx="12" cy="9.5" r="6"/><path d="M9.5 9.5l1.8 1.8 3.2-3.4M8.6 14.5L7 21l5-2.5 5 2.5-1.6-6.5"/>',
    safety: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.5l9 5 9-5M3 16.5l9 5 9-5"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    gauge: '<path d="M3.5 17.5a8.5 8.5 0 1 1 17 0"/><path d="M12 17.5l4.5-6M6.5 12.5l1 .6M12 7v1.2M17.5 12.5l-1 .6"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8L16 9.5"/>',
    tasks: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4M8.5 10l1.3 1.3 2.2-2.3M14 10.2h2M8.5 15.5l1.3 1.3 2.2-2.3M14 15.7h2"/>',
    alert: '<path d="M12 3.5l9.5 17h-19z"/><path d="M12 10v4.5"/><path stroke-width="2.6" d="M12 17.5h.01"/>',
    truck: '<path d="M2 6h12v10H2zM14 9.5h4l3.5 3.5v3H14"/><circle cx="6" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
    funnel: '<path d="M3 4h18l-7 8.5v6l-4 2v-8z"/>',
    building: '<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/>',
    sparkle: '<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M19 14.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5a2.1 2.1 0 0 0 3 3l5.8-5.8a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    scurve: '<path d="M3 20.5h18M3.5 3.5v17"/><path d="M6 18c5 0 4.5-11 14-11"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M8 14.5l2.2 2.2L15.5 12"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path stroke-width="2.6" d="M12 15.5h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path stroke-width="2.6" d="M12 7.5h.01"/>',
    cloud: '<path d="M7 19a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1-.5 9.5z"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="3"/><path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
    download: '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4 16.5v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    chart: '<path d="M3.5 20.5h17M6.5 17v-5M11 17V7M15.5 17v-7M20 17V4.5"/>',
    tag: '<path d="M3 12.2V4.5A1.5 1.5 0 0 1 4.5 3h7.7l8.8 8.8a1.5 1.5 0 0 1 0 2.1l-7.1 7.1a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.6"/>',
    book: '<path d="M2.5 5c3-1.6 6.5-1.6 9.5.6 3-2.2 6.5-2.2 9.5-.6v14c-3-1.6-6.5-1.6-9.5.6-3-2.2-6.5-2.2-9.5-.6z"/><path d="M12 5.6v14"/>',
  };
  ICONS.won = ICONS.award;

  /* colour of each icon (CSS class t-*) — EPC phases use the same series colours as the charts */
  const TONE = {
    engineering: 's1', procurement: 's2', construction: 's3', closing: 's4',
    award: 's4', won: 's4', lost: 's8',
    safety: 's4', quality: 's7', alert: 's8', truck: 's2', coins: 's3', check: 's3', sparkle: 's4',
    tag: 's3', wrench: 's2', people: 's5', user: 's5', lock: 's7', gauge: 's7', database: 's7', proposal: 's2', tasks: 's2',
  };

  I.has = (key) => !!ICONS[key];
  I.svg = (key) => (ICONS[key] ? `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg>` : '');
  /* icon in a tinted chip; '' for an unknown key */
  I.icon = (key, cls) => (ICONS[key] ? `<span class="ic t-${TONE[key] || 'a'}${cls ? ' ' + cls : ''}" aria-hidden="true">${I.svg(key)}</span>` : '');

  /* topic text (tile label, card heading …) → icon key. First matching rule wins. */
  const RULES = [
    [/safety|ltifr|trir|\blti\b|first aid|near miss|incident/, 'safety'],
    [/ncr|quality/, 'quality'],
    [/\bwin\b|\bwon\b|ผลงาน/, 'award'],
    [/pipeline/, 'funnel'],
    [/price list|ราคาผู้ขาย|เปรียบเทียบราคา|vendor cost/, 'tag'],
    [/เลยกำหนด|overdue|สาเหตุ|missing|critical|reset/, 'alert'],
    [/ส่งภายใน|ต้องติดตาม|delivery/, 'truck'],
    [/s-curve|สะสม/, 'scurve'],
    [/cpi|cost|\bac\b|จ่าย|มูลค่า|value|committed|labour|ต้นทุน|budget/, 'coins'],
    [/spi|\btime\b|cycle|days|ชั่วโมง|hours|timesheet/, 'clock'],
    [/ppc|plan complete|\bdone\b|เสร็จ|completeness/, 'check'],
    [/util|loading/, 'gauge'],
    [/\btasks\b|งานในแผน|^งานประจำ/, 'tasks'],
    [/ปฏิทิน|calendar|weekly|สัปดาห์/, 'calendar'],
    [/role|สิทธิ์/, 'lock'],
    [/บัญชีผู้ใช้|account|profile/, 'user'],
    [/allocat|team|people|sales|ผู้ใช้|members|person|ภาระงาน/, 'people'],
    [/lead source|ที่มาของงาน/, 'funnel'],
    [/estimat/, 'estimate'],
    [/inquir/, 'inquiry'],
    [/purchase|\bpo\b/, 'procurement'],
    [/proposal|bidding|รายการ|register|board|\blog\b/, 'proposal'],
    [/level|quantity|boq|หมวด|category/, 'layers'],
    [/เวอร์ชัน|version|ฟีเจอร์|changelog|อัปเดต/, 'sparkle'],
    [/ปรับปรุง|แก้ไข/, 'wrench'],
    [/ข้อมูลระบบ|about/, 'info'],
    [/company|project|โครงการ|epc|phase/, 'building'],
    [/cloud/, 'cloud'],
    [/backup|restore/, 'download'],
    [/data summary|ข้อมูล/, 'database'],
    [/\bby\b|per month|ราย|ตาม/, 'chart'],
  ];
  I.pick = (text) => {
    const t = String(text || '').toLowerCase();
    const hit = RULES.find((r) => r[0].test(t));
    return hit ? hit[1] : null;
  };

  /* Card / section headings get an icon after every render (called from app.js's MutationObserver) */
  I.decorate = function (root) {
    root.querySelectorAll('.card-h:not([data-ic]), .section-h:not([data-ic])').forEach((h) => {
      h.setAttribute('data-ic', '');
      const h2 = h.querySelector('h2');
      const key = h2 && I.pick(h2.textContent);
      if (!key) return;
      if (h.classList.contains('section-h')) {
        const idx = h.querySelector('.idx');
        if (idx) idx.insertAdjacentHTML('afterbegin', I.svg(key));
      } else h2.insertAdjacentHTML('beforebegin', I.icon(key, 'ch-ic'));
    });
  };

  /* ---------- illustrations (viewBox 200 × 110) ---------- */
  const ground = (cx = 100, rx = 88) => `<ellipse class="bg" cx="${cx}" cy="103" rx="${rx}" ry="5"/>`;
  const sparkle = (x, y, s, c) => `<path class="${c}" d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}z"/>`;
  const ring = (cx, cy, r, pct, w = 6) => {
    const c = 2 * Math.PI * r;
    return `<circle class="ring-bg" cx="${cx}" cy="${cy}" r="${r}" stroke-width="${w}"/>
      <circle class="ring" cx="${cx}" cy="${cy}" r="${r}" stroke-width="${w}" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
  };
  const tick = (x, y) => `<path class="lw" d="M${x - 3} ${y}l2.2 2.2 4-4.4"/>`;
  const gear = (cx, cy, r, teeth, depth) => {
    const n = teeth * 4;
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = ((i - 0.5) / n) * Math.PI * 2, rr = i % 4 < 2 ? r : r - depth;
      d += (i ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(1) + ' ' + (cy + rr * Math.sin(a)).toFixed(1);
    }
    return d + 'Z';
  };
  const person = (x, y, cls) => `<path class="${cls} ln" d="M${x - 16} ${y + 40}v-6a16 16 0 0 1 32 0v6z"/><circle class="sf ln" cx="${x}" cy="${y}" r="9"/>`;

  const ART = {
    dashboard: () => `${ground()}
      <rect class="sf ln" x="26" y="10" width="128" height="78" rx="8"/>
      <path class="a ln" d="M26 18a8 8 0 0 1 8-8h112a8 8 0 0 1 8 8v6H26z"/>
      <circle class="w" cx="35" cy="17" r="1.8"/><circle class="w" cx="42" cy="17" r="1.8"/><circle class="w" cx="49" cy="17" r="1.8"/>
      <path class="ln nf" d="M36 80h50" opacity=".4"/>
      <rect class="a" x="38" y="60" width="8" height="20" rx="1.5"/><rect class="bg" x="50" y="48" width="8" height="32" rx="1.5"/>
      <rect class="a" x="62" y="54" width="8" height="26" rx="1.5"/><rect class="g" x="74" y="38" width="8" height="42" rx="1.5"/>
      <path class="la" d="M94 72l12-10 12 5 13-18 13-5"/><circle class="a" cx="144" cy="44" r="3.2"/>
      <path class="s2 ln" d="M82 88h16l3 12H79z"/>
      <rect class="sf ln" x="136" y="56" width="56" height="34" rx="6"/>
      ${ring(152, 73, 8, 0.75, 5)}
      <rect class="bg" x="166" y="65" width="18" height="4" rx="2"/><rect class="a" x="166" y="73" width="12" height="4" rx="2"/><rect class="bg" x="166" y="80" width="16" height="3" rx="1.5"/>
      ${sparkle(14, 30, 6, 'y')}${sparkle(170, 30, 4, 'a')}`,

    bidding: () => `${ground()}
      <rect class="y ln" x="18" y="80" width="30" height="9" rx="4.5"/><rect class="y ln" x="20" y="71" width="30" height="9" rx="4.5"/><rect class="y ln" x="17" y="62" width="30" height="9" rx="4.5"/>
      <path class="sf ln" d="M60 12h46l18 18v64a6 6 0 0 1-6 6H60a6 6 0 0 1-6-6V18a6 6 0 0 1 6-6z"/>
      <path class="bg ln" d="M106 12v18h18"/>
      <rect class="a" x="63" y="24" width="30" height="5" rx="2.5"/>
      <rect class="bg" x="63" y="40" width="50" height="4" rx="2"/><rect class="bg" x="63" y="50" width="42" height="4" rx="2"/><rect class="bg" x="63" y="60" width="50" height="4" rx="2"/>
      <path class="la" d="M64 84c5-7 9 3 14-3s8 2 13-1"/>
      <circle class="g" cx="110" cy="84" r="9"/>${tick(110, 84)}
      <path class="y ln" d="M146 30h28v14a14 14 0 0 1-28 0z"/>
      <path class="ln nf" d="M146 34h-6a6 6 0 0 0 6 10M174 34h6a6 6 0 0 1-6 10"/>
      <rect class="y ln" x="157" y="58" width="6" height="9"/><rect class="a2 ln" x="148" y="67" width="24" height="8" rx="2"/>
      <path class="w" d="M160 35l2 4 4.4.6-3.2 3 .8 4.4-4-2.1-4 2.1.8-4.4-3.2-3 4.4-.6z"/>
      ${sparkle(184, 20, 5, 'y')}${sparkle(136, 16, 3.5, 'a')}`,

    projects: () => `${ground(100, 92)}
      <circle class="bg" cx="84" cy="24" r="6"/><circle class="bg" cx="95" cy="15" r="8"/><circle class="bg" cx="109" cy="10" r="5"/>
      <path class="a ln" d="M14 100V62l19 11V62l19 11V62l19 11v27z"/>
      <rect class="w" x="21" y="83" width="7" height="8" rx="1"/><rect class="w" x="40" y="83" width="7" height="8" rx="1"/><rect class="w" x="59" y="83" width="7" height="8" rx="1"/>
      <rect class="s2 ln" x="76" y="32" width="11" height="68" rx="1"/><rect class="o" x="77" y="39" width="9" height="5"/>
      <path class="ln nf" d="M87 76h8"/>
      <rect class="sf ln" x="95" y="58" width="34" height="42" rx="4"/>
      <path class="ln nf" d="M95 68h34M95 90h34"/><rect class="g" x="101" y="75" width="22" height="7" rx="1.5"/>
      <path class="ln nf" d="M165 18V7M165 7l-27 11M165 7l23 11"/>
      <path class="y ln" d="M133 18h58v6h-58z"/><rect class="a2" x="180" y="24" width="10" height="8"/>
      <path class="y ln" d="M161 100V24h8v76z"/>
      <path class="ln nf" d="M161 32l8 8M169 40l-8 8M161 48l8 8M169 56l-8 8M161 64l8 8M169 72l-8 8M161 80l8 8M169 88l-8 8" stroke-width="1.4"/>
      <path class="ln nf" d="M141 24v24"/><rect class="o ln" x="133" y="48" width="16" height="10" rx="1"/>
      <rect class="a2" x="153" y="96" width="24" height="6" rx="1"/>`,

    pos: () => `${ground()}
      <path class="ln nf" d="M4 54h14M0 64h18M6 74h12" opacity=".45"/>
      <rect class="a ln" x="22" y="38" width="86" height="48" rx="4"/>
      <rect class="w" x="30" y="46" width="40" height="6" rx="3" opacity=".35"/><rect class="w" x="30" y="56" width="26" height="4" rx="2" opacity=".25"/>
      <path class="a2 ln" d="M108 52h22l14 16v18h-36z"/><path class="bg" d="M113 57h15l9 11h-24z"/>
      <circle class="s2 ln" cx="44" cy="88" r="9"/><circle class="a2" cx="44" cy="88" r="3"/>
      <circle class="s2 ln" cx="90" cy="88" r="9"/><circle class="a2" cx="90" cy="88" r="3"/>
      <circle class="s2 ln" cx="128" cy="88" r="9"/><circle class="a2" cx="128" cy="88" r="3"/>
      <rect class="y ln" x="152" y="78" width="22" height="22" rx="2"/><path class="ln nf" d="M163 78v8"/>
      <rect class="y ln" x="174" y="84" width="18" height="16" rx="2"/><path class="ln nf" d="M183 84v6"/>
      <rect class="y ln" x="157" y="60" width="18" height="18" rx="2"/><path class="ln nf" d="M166 60v7"/>
      <path class="sf ln" d="M152 6h24l8 8v30h-32z"/><path class="bg ln" d="M176 6v8h8"/>
      <rect class="a" x="157" y="14" width="12" height="4" rx="2"/><rect class="bg" x="157" y="23" width="22" height="3" rx="1.5"/><rect class="bg" x="157" y="29" width="17" height="3" rx="1.5"/><rect class="bg" x="157" y="35" width="22" height="3" rx="1.5"/>`,

    help: () => `${ground()}
      <path class="sf ln" d="M100 30c-22-12-48-12-70-2v66c22-10 48-10 70 2z"/>
      <path class="sf ln" d="M100 30c22-12 48-12 70-2v66c-22-10-48-10-70 2z"/>
      <path class="ln nf" d="M100 30v66"/>
      ${[0, 1, 2, 3].map((r) => `<rect class="bg" x="40" y="${40 + r * 11}" width="${r === 3 ? 30 : 48}" height="4" rx="2"/><rect class="${r === 0 ? 'a' : 'bg'}" x="110" y="${40 + r * 11}" width="${r === 2 ? 34 : 48}" height="4" rx="2"/>`).join('')}
      <circle class="g" cx="54" cy="84" r="6"/>${tick(54, 84)}
      <circle class="a ln" cx="168" cy="22" r="14"/>
      <text class="tx w" x="168" y="27.5" text-anchor="middle" font-size="16">?</text>
      ${sparkle(20, 30, 5, 'y')}${sparkle(138, 12, 3.5, 'y')}`,

    prices: () => `${ground()}
      <rect class="sf ln" x="18" y="12" width="96" height="84" rx="7"/>
      <path class="a ln" d="M18 19a7 7 0 0 1 7-7h82a7 7 0 0 1 7 7v7H18z"/>
      ${[0, 1, 2, 3].map((r) => `<rect class="bg" x="26" y="${36 + r * 14}" width="40" height="5" rx="2.5"/><rect class="${r === 1 ? 'g' : 'bg'}" x="${r === 1 ? 74 : 80}" y="${35 + r * 14}" width="${r === 1 ? 32 : 26}" height="7" rx="2"/>`).join('')}
      <path class="y ln" d="M120 46V30a4 4 0 0 1 4-4h20l26 26a4 4 0 0 1 0 5.7l-18.3 18.3a4 4 0 0 1-5.7 0z"/>
      <circle class="sf ln" cx="133" cy="39" r="4.5"/>
      <path class="lw" d="M146 52h12M146 58h8" stroke-width="2.4"/>
      <rect class="sf ln" x="150" y="74" width="40" height="22" rx="5"/>
      <rect class="g" x="156" y="80" width="16" height="4" rx="2"/><rect class="bg" x="156" y="87" width="26" height="3.5" rx="1.75"/>
      ${sparkle(186, 22, 5, 'y')}${sparkle(12, 40, 4, 'a')}`,

    weekly: () => {
      const st = 'dddddddxdpppeee';
      let cells = '';
      for (let i = 0; i < 15; i++) {
        const x = 46 + (i % 5) * 18, y = 40 + Math.floor(i / 5) * 18, s = st[i];
        cells += `<rect class="${s === 'd' ? 'g' : s === 'x' ? 'o' : s === 'p' ? 'sf ln' : 'bg'}" x="${x}" y="${y}" width="14" height="14" rx="3"${s === 'p' ? ' stroke-dasharray="2 2"' : ''}/>`;
        if (s === 'd') cells += tick(x + 7, y + 7);
        if (s === 'x') cells += `<path class="lw" d="M${x + 4.5} ${y + 4.5}l5 5M${x + 9.5} ${y + 4.5}l-5 5"/>`;
      }
      return `${ground()}
        <rect class="sf ln" x="36" y="16" width="104" height="82" rx="8"/>
        <path class="a ln" d="M36 24a8 8 0 0 1 8-8h88a8 8 0 0 1 8 8v8H36z"/>
        <rect class="a2" x="56" y="9" width="6" height="13" rx="3"/><rect class="a2" x="114" y="9" width="6" height="13" rx="3"/>
        ${cells}
        ${ring(170, 58, 20, 0.8, 7)}
        <text class="tx" x="170" y="62" text-anchor="middle">80%</text>
        ${sparkle(18, 40, 5, 'y')}${sparkle(188, 22, 4, 'a')}`;
    },

    resources: () => `${ground()}
      ${person(36, 44, 'a2')}${person(96, 44, 'g')}${person(66, 32, 'a')}
      <rect class="sf ln" x="124" y="16" width="66" height="78" rx="6"/>
      ${[[30, 30, 'a'], [46, 41, 'o'], [62, 22, 'a'], [78, 28, 'g']].map(([y, w, c]) =>
        `<rect class="bg" x="131" y="${y - 2}" width="10" height="4" rx="2"/><rect class="bg" x="146" y="${y - 3}" width="38" height="6" rx="3"/><rect class="${c}" x="146" y="${y - 3}" width="${w}" height="6" rx="3"/>`).join('')}
      <path class="ln nf" d="M176 22v66" stroke-dasharray="3 3" stroke-width="1.4"/>`,

    timesheet: () => {
      const fill = ['aaaab', 'aabaa', 'baaaa', 'aaa__'];
      let grid = '';
      fill.forEach((row, r) => {
        const y = 34 + r * 15;
        grid += `<rect class="bg" x="30" y="${y}" width="22" height="9" rx="2"/>`;
        row.split('').forEach((c, i) => {
          grid += `<rect class="${c === 'a' ? 'a' : c === 'b' ? 'y' : 'bg'}" x="${58 + i * 13}" y="${y}" width="10" height="9" rx="2"${c === 'a' ? ` opacity="${(0.55 + ((r + i) % 3) * 0.2).toFixed(2)}"` : ''}/>`;
        });
      });
      let ticks = '';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, r1 = i % 3 ? 19 : 17, r2 = 21.5;
        ticks += `M${(154 + r1 * Math.sin(a)).toFixed(1)} ${(62 - r1 * Math.cos(a)).toFixed(1)}L${(154 + r2 * Math.sin(a)).toFixed(1)} ${(62 - r2 * Math.cos(a)).toFixed(1)}`;
      }
      return `${ground()}
        <rect class="sf ln" x="22" y="14" width="104" height="84" rx="6"/>
        <path class="a ln" d="M22 20a6 6 0 0 1 6-6h92a6 6 0 0 1 6 6v8H22z"/>
        ${grid}
        <rect class="a2" x="149" y="25" width="10" height="7" rx="2"/>
        <circle class="sf ln" cx="154" cy="62" r="30"/><circle class="bg" cx="154" cy="62" r="24"/>
        <path class="ln nf" d="${ticks}" stroke-width="1.6"/>
        <path class="ln nf" d="M154 62V47M154 62l10 6" stroke-width="2.6"/><circle class="a" cx="154" cy="62" r="3"/>
        ${sparkle(186, 26, 4, 'y')}`;
    },

    settings: () => `${ground()}
      <path class="a ln" d="${gear(66, 50, 32, 10, 7)}"/><circle class="sf ln" cx="66" cy="50" r="11"/>
      <path class="y ln" d="${gear(113, 78, 20, 8, 5)}"/><circle class="sf ln" cx="113" cy="78" r="6.5"/>
      <rect class="sf ln" x="138" y="12" width="54" height="52" rx="6"/>
      ${[[25, 1], [39, 0], [53, 1]].map(([y, on]) =>
        `<rect class="bg" x="144" y="${y - 2}" width="16" height="4" rx="2"/><rect class="${on ? 'g' : 'bg'}" x="166" y="${y - 5}" width="20" height="10" rx="5"/><circle class="w" cx="${on ? 181 : 171}" cy="${y}" r="3.5"/>`).join('')}
      <path class="a2 ln" d="M165 72l13 5v9c0 7-5.5 12-13 14-7.5-2-13-7-13-14v-9z"/>${tick(165, 86)}`,

    about: () => `${ground()}
      <path class="sf ln" d="M80 10c14 10 20 28 20 46l-6 10H66l-6-10c0-18 6-36 20-46z"/>
      <path class="a ln" d="M71 20c3-4 6-7 9-10 3 3 6 6 9 10z"/>
      <circle class="a ln" cx="80" cy="40" r="8"/><circle class="w" cx="77.5" cy="37.5" r="2" opacity=".7"/>
      <path class="a2 ln" d="M62 54l-12 16 15-3z"/><path class="a2 ln" d="M98 54l12 16-15-3z"/>
      <path class="o" d="M68 68h24l-12 24z"/><path class="y" d="M74 68h12l-6 13z"/>
      <rect class="sf ln" x="124" y="24" width="66" height="70" rx="6"/>
      ${[[38, 'g'], [54, 'a'], [70, 'o']].map(([y, c]) => `<circle class="${c}" cx="134" cy="${y}" r="3.5"/><rect class="bg" x="142" y="${y - 4}" width="40" height="4" rx="2"/><rect class="bg" x="142" y="${y + 3}" width="26" height="3" rx="1.5"/>`).join('')}
      <rect class="a" x="146" y="12" width="40" height="15" rx="7.5"/>
      <text class="tx w" x="166" y="23" text-anchor="middle" font-size="9">v${(PM.VERSION || '').split('.').slice(0, 2).join('.')}</text>
      ${sparkle(34, 28, 6, 'y')}${sparkle(112, 14, 4, 'y')}${sparkle(30, 76, 4, 'a')}`,
  };

  /* bidding step pages: the step's icon drawn large + where it sits on Inquiry → … → Award */
  const STEPS = ['inquiry', 'estimate', 'proposal', 'submit', 'award'];
  const stageArt = (key) => () => {
    const idx = STEPS.indexOf(key), tone = key === 'award' ? 'var(--s4)' : 'var(--il-a)';
    const label = key === 'award' ? 'Award' : PM.bidStageLabel(key);
    const track = STEPS.map((s, j) => {
      const x = 120 + j * 16;
      if (j < idx) return `<circle class="g" cx="${x}" cy="40" r="5.5"/>${tick(x, 40)}`;
      if (j === idx) return `<circle cx="${x}" cy="40" r="8.5" style="fill:${tone}"/><circle class="w" cx="${x}" cy="40" r="3"/>`;
      return `<circle class="sf ln" cx="${x}" cy="40" r="5"/>`;
    }).join('');
    return `${ground()}
      <rect class="sf ln" x="24" y="12" width="80" height="82" rx="18"/><rect class="bg" x="32" y="20" width="64" height="66" rx="13"/>
      <g transform="translate(35 24) scale(2.42)" fill="none" stroke-width=".85" style="stroke:${tone}">${ICONS[key]}</g>
      <path class="ln nf" d="M120 40h64" opacity=".45"/>${track}
      <text class="tx" x="152" y="68" text-anchor="middle" font-size="13">${label}</text>
      <text class="tx2" x="152" y="81" text-anchor="middle">ขั้นที่ ${idx + 1} / 5</text>
      ${sparkle(14, 30, 5, 'y')}${sparkle(188, 18, 4, 'a')}`;
  };
  STEPS.forEach((k) => (ART['bid-' + k] = stageArt(k)));

  I.art = (key) => (ART[key] ? `<svg class="il" viewBox="0 0 200 110" aria-hidden="true" focusable="false">${ART[key]()}</svg>` : '');

  /* ---------- page banner under the top bar ---------- */
  const HERO = {
    dashboard: ['ภาพรวมทุกส่วนงานในหน้าเดียว', 'Bidding · Execution (EPC) · Purchase Orders · Resource — กดที่การ์ดหรือแถวเพื่อดูรายละเอียด'],
    bidding: ['ติดตามงานประมูลจนรู้ผล', 'Inquiry → Estimate → Proposal → Submit → Award · Win rate และผลงาน Sales'],
    'bid-inquiry': ['Inquiry — รับเรื่อง / สอบถาม', 'งานที่ลูกค้าส่งเข้ามา · ที่มาของงาน · Sales และผู้ติดต่อ · กำหนดยื่นราคา'],
    'bid-estimate': ['Estimate — ถอดแบบ / ประมาณราคา', 'ถอดปริมาณ BOQ · Estimator ผู้รับผิดชอบ · ชั่วโมงที่ใช้ประมาณราคา'],
    'bid-proposal': ['Proposal — จัดทำข้อเสนอ', 'มูลค่าและ Margin · เตรียมเอกสารให้ทันกำหนดยื่น'],
    'bid-submit': ['Submit — ยื่นใบเสนอราคา / รอผล', 'ยื่นตรงเวลาหรือไม่ · รอผลมากี่วัน · บันทึกผล Won / Lost / No-bid'],
    'bid-award': ['Award — ผลการประมูล', 'Won / Lost / No-bid · Win rate · สร้างโครงการจากงานที่ได้'],
    projects: ['โครงการ EPC ทั้งหมด', 'Engineering → Procurement → Construction → Closing · Progress, SPI / CPI และสถานะของแต่ละโครงการ'],
    pos: ['สั่งซื้อ · ส่งของ · จ่ายเงิน', 'PO ของทุกโครงการ พร้อมกำหนดส่ง สถานะการจ่าย และไฟล์แนบ'],
    prices: ['ราคาผู้ขาย (Price List / Vendor Cost)', 'ราคาต่อหน่วยของแต่ละผู้ขาย · เปรียบเทียบราคา · ประวัติราคา · วันหมดอายุใบเสนอราคา · Export Excel / PDF'],
    weekly: ['วางแผนงานรายสัปดาห์', 'มอบหมายงานให้แต่ละคน อัปเดตสถานะ และวัด PPC (เป้า ≥ 80%)'],
    resources: ['ภาระงานของทีม', 'Utilization ตาม Level · loading รายสัปดาห์ · ใครงานล้น ใครยังรับงานเพิ่มได้'],
    timesheet: ['บันทึกชั่วโมงทำงาน', 'กรอกชั่วโมงรายสัปดาห์ แยก Project / Bid / Overhead / Leave'],
    settings: ['ตั้งค่าระบบ', 'บัญชีผู้ใช้ · Role และสิทธิ์ · Cloud · Backup & Restore'],
    about: ['เวอร์ชันและประวัติการแก้ไข', 'ดูว่ามีอะไรใหม่และอะไรเปลี่ยนไปในแต่ละเวอร์ชัน'],
    help: ['วิธีใช้งาน', 'คู่มือของทุกหน้า — ขั้นตอนทีละข้อ สิทธิ์ตาม Role และวิธีแก้ปัญหาที่พบบ่อย · ค้นหาได้'],
  };
  /* help = topic of the user guide for this page (help.js) → "วิธีใช้หน้านี้" link */
  I.hero = function (route, help) {
    const el = document.getElementById('page-hero');
    if (!el) return;
    const h = HERO[route];
    if (!h) { el.hidden = true; el.removeAttribute('data-route'); return; }
    el.hidden = false;
    if (el.dataset.route === route) return; // same page (resize / data refresh) — keep it as is
    el.dataset.route = route;
    el.innerHTML = `<div class="hero-text"><b>${PM.ui.esc(h[0])}</b><p>${PM.ui.esc(h[1])}</p>
      ${help ? `<a class="hero-help" href="#/help/${help}">${I.svg('book')}วิธีใช้หน้านี้</a>` : ''}</div><div class="hero-art">${I.art(route)}</div>`;
  };
})();
