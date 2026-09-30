/* ui.js — formatting, badges, modal, toast, tooltip */
(function () {
  const U = (PM.ui = {});

  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.num = (n, d = 0) => (n == null || !isFinite(n) ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  U.money = (n) => {
    if (n == null || !isFinite(n)) return '–';
    const a = Math.abs(n);
    if (a >= 1e9) return '฿' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '฿' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '฿' + (n / 1e3).toFixed(0) + 'K';
    return '฿' + Math.round(n);
  };
  U.pct = (x, d = 0) => (x == null || !isFinite(x) ? '–' : (x * 100).toFixed(d) + '%');
  U.ratio = (x) => (x == null || !isFinite(x) ? '–' : x.toFixed(2));
  U.date = (s) => (s ? PM.parse(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '–');
  U.month = (ym) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  U.days = (n) => (n == null || !isFinite(n) ? '–' : n.toFixed(1) + ' d');

  const ICON = { good: '✓', warning: '!', serious: '▲', critical: '✕', neutral: '•', info: 'i' };
  U.badge = (level, text) => `<span class="badge ${level}"><i aria-hidden="true">${ICON[level] || '•'}</i>${U.esc(text)}</span>`;

  /* SPI / CPI → status level */
  U.health = (v) => (v == null ? 'neutral' : v >= 0.95 ? 'good' : v >= 0.9 ? 'warning' : 'critical');
  U.healthLabel = { good: 'On track', warning: 'At risk', critical: 'Off track', neutral: 'No data' };
  U.worst = (...levels) => ['critical', 'serious', 'warning', 'good', 'neutral'].find((l) => levels.includes(l)) || 'neutral';
  U.healthBadge = (v) => { const h = U.health(v); return U.badge(h, U.ratio(v)); };

  U.utilLevel = (u, target) => (u == null ? 'neutral' : u > 1.05 ? 'critical' : u >= target - 0.1 ? 'good' : u >= target - 0.25 ? 'warning' : 'serious');
  U.utilLabel = (u, target) => (u == null ? 'No data' : u > 1.05 ? 'Over-allocated' : u >= target - 0.1 ? 'Optimal' : u >= target - 0.25 ? 'Below target' : 'Under-utilized');

  /* progress bar: actual fill + planned marker */
  U.progress = (actual, planned, tip) => {
    const a = Math.max(0, Math.min(100, actual * 100));
    const p = planned == null ? null : Math.max(0, Math.min(100, planned * 100));
    return `<div class="pbar" data-tip="${U.esc(tip || `Actual ${U.pct(actual, 1)}${p != null ? `\nPlanned ${U.pct(planned, 1)}` : ''}`)}">
      <span style="width:${a}%"></span>${p != null ? `<i style="left:${p}%"></i>` : ''}</div>`;
  };

  U.resourceName = (id) => { const r = PM.find('resources', id); return r ? r.name : '–'; };
  U.phaseLabel = (key) => { const ph = PM.PHASES.find((p) => p.key === key); return ph ? ph.label : key || '–'; };

  U.options = (items, selected, placeholder) =>
    (placeholder != null ? `<option value="">${U.esc(placeholder)}</option>` : '') +
    items.map((it) => {
      const v = typeof it === 'object' ? it.value : it;
      const l = typeof it === 'object' ? it.label : it;
      return `<option value="${U.esc(v)}"${String(v) === String(selected == null ? '' : selected) ? ' selected' : ''}>${U.esc(l)}</option>`;
    }).join('');

  /* form field */
  U.field = (label, name, value, o = {}) => {
    const cls = o.full ? ' class="full"' : '';
    let input;
    if (o.options) input = `<select name="${name}"${o.required ? ' required' : ''}>${U.options(o.options, value, o.placeholder)}</select>`;
    else if (o.type === 'textarea') input = `<textarea name="${name}" rows="${o.rows || 3}">${U.esc(value)}</textarea>`;
    else input = `<input name="${name}" type="${o.type || 'text'}" value="${U.esc(value)}"${o.required ? ' required' : ''}${o.step ? ` step="${o.step}"` : ''}${o.min != null ? ` min="${o.min}"` : ''}${o.max != null ? ` max="${o.max}"` : ''}${o.placeholder ? ` placeholder="${U.esc(o.placeholder)}"` : ''}>`;
    return `<label${cls}><span>${U.esc(label)}</span>${input}${o.hint ? `<small>${U.esc(o.hint)}</small>` : ''}</label>`;
  };

  /* A view's filter state that survives closing the site: the listed keys are saved in this browser
     whenever they change and restored next time (ids that no longer exist are reset by the view). */
  U.keep = function (name, obj, keys) {
    const K = 'epc-pm-view-' + name;
    try {
      const saved = JSON.parse(localStorage.getItem(K) || 'null');
      if (saved) keys.forEach((k) => { if (k in saved && (obj[k] == null || typeof saved[k] === typeof obj[k])) obj[k] = saved[k]; });
    } catch (e) { /* ignore */ }
    return new Proxy(obj, {
      set(t, k, v) {
        t[k] = v;
        if (keys.includes(k)) {
          try { const o = {}; keys.forEach((x) => (o[x] = t[x])); localStorage.setItem(K, JSON.stringify(o)); } catch (e) { /* ignore */ }
        }
        return true;
      },
    });
  };

  U.formData = (form) => {
    const out = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      out[el.name] = el.type === 'number' ? (el.value === '' ? 0 : Number(el.value)) : el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    return out;
  };

  /* modal */
  U.modal = function ({ title, body, submitLabel = 'บันทึก', onSubmit, onDelete, wide }) {
    const draft = readDraft(title); // a form of the same name left unsaved when the page was closed / discarded
    U.closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<form class="modal${wide ? ' wide' : ''}" novalidate>
      <header><h2>${U.esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
      <div class="modal-body">${body}</div>
      <footer>
        ${onDelete ? '<button type="button" class="btn danger" data-delete>ลบ</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-close>ยกเลิก</button>
        ${onSubmit ? `<button type="submit" class="btn primary">${U.esc(submitLabel)}</button>` : ''}
      </footer></form>`;
    document.body.appendChild(wrap);
    const form = wrap.querySelector('form');
    // typed into but not saved yet → the browser asks before the page is closed (see beforeunload below)
    // phones / tablets don't ask before closing, so what was typed is also kept as a draft in this browser
    let draftTimer = null;
    const markDirty = () => { form.dataset.dirty = '1'; clearTimeout(draftTimer); draftTimer = setTimeout(() => writeDraft(form, title), 300); };
    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);
    form.dataset.title = title;
    if (draft) {
      Object.keys(draft.values).forEach((n) => {
        const el = form.elements[n];
        if (!el || !el.tagName || el.disabled || el.type === 'file') return;
        if (el.type === 'checkbox') el.checked = !!draft.values[n]; else el.value = draft.values[n];
      });
      form.dataset.dirty = '1';
      writeDraft(form, title);
      setTimeout(() => U.toast('กู้คืนข้อมูลที่กรอกค้างไว้แล้ว'), 250);
    }
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) U.closeModal(); });
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', U.closeModal));
    const del = wrap.querySelector('[data-delete]');
    if (del) del.addEventListener('click', () => { if (confirm('ยืนยันการลบรายการนี้?')) { onDelete(); U.closeModal(); } });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (onSubmit && onSubmit(U.formData(form), form) !== false) U.closeModal();
    });
    const first = form.querySelector('input,select,textarea');
    if (first) first.focus();
    return form;
  };
  U.closeModal = () => document.querySelectorAll('.modal-backdrop:not(.closing)').forEach((m) => {
    clearDraft(); // saved, cancelled or deleted on purpose — no draft to bring back
    m.classList.add('closing'); // plays the exit animation, then removes
    setTimeout(() => m.remove(), 180);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') U.closeModal(); });

  /* ---------- form drafts (one at a time, kept 3 days) ---------- */
  const DRAFT_KEY = 'epc-pm-form-draft';
  function writeDraft(form, title) {
    if (!form.isConnected || !form.dataset.dirty) return;
    const values = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name || el.disabled || el.type === 'file' || el.type === 'submit' || el.type === 'button') return;
      values[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, at: Date.now(), values })); } catch (e) { /* ignore */ }
  }
  function readDraft(title) {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d && d.title === title && Date.now() - d.at < 3 * 864e5 && d.values) return d;
    } catch (e) { /* ignore */ }
    return null;
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ } }
  U.pendingDraft = () => { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return d && Date.now() - d.at < 3 * 864e5 ? d : null; } catch (e) { return null; } };
  // going to the background / closing: write the draft right away (debounce timers stop in the background)
  const saveOpenDraft = () => {
    const f = document.querySelector('.modal-backdrop:not(.closing) form[data-dirty]');
    if (f) writeDraft(f, f.dataset.title);
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveOpenDraft(); });
  window.addEventListener('pagehide', saveOpenDraft);
  window.addEventListener('beforeunload', (e) => {
    if (!document.querySelector('.modal-backdrop:not(.closing) form[data-dirty]')) return; // everything else is already saved
    e.preventDefault();
    e.returnValue = '';
  });

  /* toast */
  U.toast = function (msg, ms = 2200) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  };

  /* tooltip — any element with data-tip; charts may add data-cx for a crosshair */
  const tip = document.createElement('div');
  tip.id = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(tip));
  let tipEl = null;
  const place = (e) => {
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  };
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el === tipEl) return;
    if (tipEl) tipEl.classList.remove('hot');
    tipEl = el;
    if (!el) { tip.classList.remove('show'); return; }
    el.classList.add('hot');
    tip.textContent = el.getAttribute('data-tip');
    tip.classList.add('show');
    place(e);
    const svg = el.closest('svg');
    const cross = svg && svg.querySelector('.crosshair');
    if (cross) {
      if (el.hasAttribute('data-cx')) { const x = el.getAttribute('data-cx'); cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.style.opacity = 1; }
      svg.querySelectorAll('.hover-dot').forEach((d) => d.remove());
      if (el.hasAttribute('data-dots')) {
        JSON.parse(el.getAttribute('data-dots')).forEach((d) => {
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('class', 'hover-dot'); c.setAttribute('cx', d[0]); c.setAttribute('cy', d[1]); c.setAttribute('r', 4.5);
          c.style.fill = d[2];
          svg.appendChild(c);
        });
      }
    }
  });
  document.addEventListener('mousemove', (e) => { if (tipEl) place(e); });
  // touch screens: a tap shows the tooltip; scrolling hides it again
  window.addEventListener('scroll', () => {
    if (!tipEl) return;
    tipEl.classList.remove('hot'); tipEl = null; tip.classList.remove('show');
  }, { passive: true, capture: true });
  document.addEventListener('mouseleave', () => tip.classList.remove('show'));
  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget || !(e.relatedTarget.closest && e.relatedTarget.closest('svg'))) {
      document.querySelectorAll('.crosshair').forEach((c) => (c.style.opacity = 0));
      document.querySelectorAll('.hover-dot').forEach((d) => d.remove());
    }
  });
})();
