/* কেস ডায়েরি — ব্যক্তিগত ব্যবহারের জন্য অ্যাডভোকেটের কেস ডায়েরি
   কোনো সার্ভার নেই; সব তথ্য শুধু এই ফোনের ভেতরেই থাকে। */
(() => {
'use strict';

/* ======================================================================
   ছোট সহায়ক ফাংশন
   ====================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const bn = v => String(v).replace(/\d/g, d => BN_DIGITS[+d]);
const unbn = s => String(s ?? '').replace(/[০-৯]/g, d => BN_DIGITS.indexOf(d));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const uniq = a => [...new Set(a)];
const norm = s => unbn(s).toLowerCase();

function groupBD(n) {            // ১,৫০,০০০ ধাঁচে (লাখ-কোটি)
  const s = String(Math.abs(Math.round(n)));
  if (s.length <= 3) return s;
  return s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3);
}
const money = n => (n < 0 ? '-' : '') + '৳' + bn(groupBD(n));
const parseAmount = s => Number(unbn(s).replace(/[^\d.]/g, '')) || 0;

const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => toISO(new Date());
const parts = s => s.split('-').map(Number);
const dayNum = s => { const [y, m, d] = parts(s); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const daysUntil = s => dayNum(s) - dayNum(today());
const addDays = (s, n) => { const [y, m, d] = parts(s); return toISO(new Date(y, m - 1, d + n)); };
const WEEKDAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const weekday = s => { const [y, m, d] = parts(s); return new Date(y, m - 1, d).getDay(); };
const fmtDate = s => s ? s.split('-').reverse().map(bn).join('/') : '—';
const fmtLong = s => { const [y, m, d] = parts(s); return `${WEEKDAYS[weekday(s)]}, ${bn(d)} ${MONTHS[m - 1]} ${bn(y)}`; };
const fmtShort = s => { const [y, m, d] = parts(s); return `${WEEKDAYS[weekday(s)]}, ${bn(d)} ${MONTHS[m - 1]}`; };

function rel(s) {
  const n = daysUntil(s);
  if (n === 0) return { t: 'আজ', c: 'today' };
  if (n === 1) return { t: 'আগামীকাল', c: 'soon' };
  if (n === 2) return { t: 'পরশু', c: 'soon' };
  if (n > 2) return { t: `${bn(n)} দিন পর`, c: n <= 7 ? 'soon' : '' };
  if (n === -1) return { t: 'গতকাল', c: 'late' };
  return { t: `${bn(-n)} দিন আগে`, c: 'late' };
}
const relChip = s => { if (!s) return ''; const r = rel(s); return `<span class="chip ${r.c}">${r.t}</span>`; };

/* ======================================================================
   তথ্য সংরক্ষণ
   ====================================================================== */
const KEY = 'caseDiary.v1';
const EMPTY = () => ({
  v: 1, cases: [], hearings: [], clients: [], fees: [],
  settings: { remind: true, evening: '20:00', morning: '07:00', lastBackup: '', askedPerm: false }
});
const normalize = d => {
  const e = EMPTY();
  return {
    ...e, ...d,
    cases: d.cases || [], hearings: d.hearings || [], clients: d.clients || [], fees: d.fees || [],
    settings: { ...e.settings, ...(d.settings || {}) }
  };
};
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.error(e); }
  return EMPTY();
}
let db = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('সংরক্ষণ করা যায়নি — ফোনের স্টোরেজ ভরে গেছে?'); }
  scheduleReminders();
}

/* ডেটা প্রশ্ন */
const getCase = id => db.cases.find(c => c.id === id);
const getClient = id => db.clients.find(c => c.id === id);
const hearingsOf = id => db.hearings.filter(h => h.caseId === id)
  .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
const prevDate = c => { const h = hearingsOf(c.id)[0]; return h ? h.date : (c.prevManual || ''); };
const feeOf = id => {
  let agreed = 0, received = 0;
  for (const f of db.fees) if (f.caseId === id) { if (f.type === 'agreed') agreed += f.amount; else received += f.amount; }
  return { agreed, received, due: Math.max(0, agreed - received) };
};
const isActive = c => c.status !== 'disposed';

const STATUS = { running: 'চলমান', stayed: 'স্থগিত', disposed: 'নিষ্পত্তি' };
const TYPES = ['দেওয়ানী', 'ফৌজদারী', 'পারিবারিক', 'অন্যান্য'];
const typeClass = t => ({ 'দেওয়ানী': 't-civil', 'ফৌজদারী': 't-crim', 'পারিবারিক': 't-fam' }[t] || 't-other');
const PURPOSES = ['শুনানি', 'সাক্ষ্য', 'জেরা', 'যুক্তিতর্ক', 'আদেশ', 'রায়', 'জবাব দাখিল', 'সমন/নোটিশ জারি', 'আপসের আলোচনা', 'সময়ের আবেদন', 'জামিন শুনানি', 'চার্জ গঠন', 'অন্যান্য'];

/* ======================================================================
   ছোট UI সহায়ক: toast, dialog, sheet
   ====================================================================== */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function ask(msg, okLabel = 'হ্যাঁ', danger = false) {
  return new Promise(res => {
    const d = $('#dialog');
    d.innerHTML = `<div class="box"><p>${esc(msg)}</p><div class="btns">
      <button class="btn" data-d="0">না</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-d="1">${esc(okLabel)}</button></div></div>`;
    d.hidden = false;
    d.onclick = e => {
      const b = e.target.closest('[data-d]'); if (!b) return;
      d.hidden = true; d.onclick = null; res(b.dataset.d === '1');
    };
  });
}

let sheetOpen = false, sheetHandler = null;
function openSheet(title, body, handler, saveLabel = 'সংরক্ষণ') {
  const el = $('#sheet');
  el.innerHTML = `<form id="sheetForm" autocomplete="off" novalidate>
    <div class="sheet-head">
      <button type="button" class="x" data-action="close-sheet" aria-label="বন্ধ">✕</button>
      <h2>${esc(title)}</h2>
      ${handler ? `<button class="save" type="submit">${esc(saveLabel)}</button>` : ''}
    </div>
    <div class="sheet-body">${body}</div></form>`;
  el.hidden = false; el.scrollTop = 0;
  sheetHandler = handler;
  if (!sheetOpen) { sheetOpen = true; history.pushState({ sheet: 1 }, ''); }
  const f = $('#sheetForm');
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (sheetHandler) await sheetHandler(new FormData(f), f);
  });
  return f;
}
function hideSheetNow() { sheetOpen = false; const el = $('#sheet'); el.hidden = true; el.innerHTML = ''; sheetHandler = null; }
function closeSheet() {
  return new Promise(res => {
    if (!sheetOpen) return res();
    hideSheetNow();
    if (history.state && history.state.sheet) {
      const h = () => { window.removeEventListener('popstate', h); res(); };
      window.addEventListener('popstate', h);
      history.back();
    } else res();
  });
}
window.addEventListener('popstate', () => { if (sheetOpen) hideSheetNow(); });

const field = (label, input, extra = '') => `<label class="field"><span>${label}</span>${input}${extra}</label>`;
const options = (list, cur) => list.map(([v, t]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`).join('');

function bindWeekendHint(form, name) {
  const inp = form.querySelector(`[name="${name}"]`), hint = form.querySelector(`#hint-${name}`);
  if (!inp || !hint) return;
  const upd = () => {
    const v = inp.value, w = v ? weekday(v) : -1;
    if (w === 5 || w === 6) { hint.hidden = false; hint.textContent = `${WEEKDAYS[w]} — সাপ্তাহিক ছুটির দিন। তারিখটা ঠিক আছে তো?`; }
    else hint.hidden = true;
  };
  inp.addEventListener('input', upd); upd();
}
const dateField = (label, name, val) =>
  field(label, `<input type="date" name="${name}" value="${esc(val || '')}">`, `<div class="hint" id="hint-${name}" hidden></div>`);

/* ======================================================================
   স্ক্রিন: আজ
   ====================================================================== */
function caseHeadHTML(c) {
  const client = getClient(c.clientId);
  return `<div class="row between wrap"><b class="caseno">${esc(c.caseNo)}</b><span class="chip ${typeClass(c.type)}">${esc(c.type || 'অন্যান্য')}</span></div>
    <div class="parties">${esc(c.plaintiff || '—')} <span class="vs">বনাম</span> ${esc(c.defendant || '—')}</div>
    <div class="meta">${[c.court, c.subject, client && ('মক্কেল: ' + client.name)].filter(Boolean).map(esc).join(' · ')}</div>`;
}

function dueCard(c, mode) {
  const cls = mode === 'today' ? 'is-today' : mode === 'late' ? 'is-late' : '';
  const label = mode === 'late' ? 'তারিখ পার হয়েছে — ফলাফল লিখুন' : mode === 'today' ? 'আজকের ফলাফল লিখুন' : '';
  return `<div class="card due-card ${cls}">
    <a href="#/case/${c.id}" style="display:block">
      ${caseHeadHTML(c)}
      <div class="row wrap mt small">
        <span>📅 ${fmtShort(c.nextDate)}</span>${relChip(c.nextDate)}
        ${c.nextPurpose ? `<span class="chip">${esc(c.nextPurpose)}</span>` : ''}
      </div>
    </a>
    ${label ? `<div class="actions"><button class="btn primary small" data-action="hearing" data-case="${c.id}">${label}</button></div>` : ''}
  </div>`;
}

function vToday() {
  const t = today();
  const act = db.cases.filter(c => isActive(c) && c.nextDate);
  const dueToday = act.filter(c => c.nextDate === t);
  const late = act.filter(c => c.nextDate < t).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const tomorrow = act.filter(c => c.nextDate === addDays(t, 1));
  const later = act.filter(c => c.nextDate > addDays(t, 1) && daysUntil(c.nextDate) <= 7)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const noDate = db.cases.filter(c => c.status === 'running' && !c.nextDate);
  const running = db.cases.filter(isActive).length;

  let h = `<div class="hello"><div class="d">${fmtLong(t)}</div></div>
    <div class="tiles">
      <div class="tile ${dueToday.length ? 'hot' : ''}"><b>${bn(dueToday.length)}</b><span>আজ</span></div>
      <div class="tile"><b>${bn(tomorrow.length)}</b><span>আগামীকাল</span></div>
      <div class="tile ${late.length ? 'bad' : ''}"><b>${bn(late.length)}</b><span>আপডেট বাকি</span></div>
    </div>`;

  const lb = db.settings.lastBackup;
  const stale = db.cases.length >= 3 && (!lb || daysUntil(lb) < -14);
  if (stale) {
    h += `<div class="card" style="background:var(--warn-bg)"><div class="strong">⚠️ ব্যাকআপ নেওয়া হয়নি</div>
      <div class="small muted mt">তথ্য শুধু এই ফোনে আছে। ফোন হারালে বা অ্যাপ মুছে ফেললে সব চলে যাবে।</div>
      <button class="btn small mt" data-action="backup">এখনই ব্যাকআপ নিন</button></div>`;
  }

  if (!db.cases.length) {
    h += `<div class="empty"><b>এখনো কোনো মামলা নেই</b>নিচের ＋ বোতামে চেপে প্রথম মামলাটি যোগ করুন।</div>`;
    return { title: 'কেস ডায়েরি', html: h, fab: { action: 'new-case', label: 'নতুন মামলা' } };
  }

  if (dueToday.length) h += `<div class="section-title">আজকের তারিখ (${bn(dueToday.length)})</div>` + dueToday.map(c => dueCard(c, 'today')).join('');
  else h += `<div class="card muted" style="text-align:center">আজ কোনো মামলার তারিখ নেই 🙂</div>`;

  if (late.length) h += `<div class="section-title" style="color:var(--danger)">ফলাফল লেখা বাকি (${bn(late.length)})</div>` + late.map(c => dueCard(c, 'late')).join('');
  if (tomorrow.length) h += `<div class="section-title">আগামীকাল (${bn(tomorrow.length)})</div>` + tomorrow.map(c => dueCard(c, 'soon')).join('');

  if (later.length) {
    h += `<div class="section-title">আগামী ৭ দিন</div>`;
    let last = '';
    for (const c of later) {
      if (c.nextDate !== last) { h += `<div class="small muted" style="margin:10px 4px 6px">${fmtShort(c.nextDate)} · ${rel(c.nextDate).t}</div>`; last = c.nextDate; }
      h += dueCard(c, 'soon');
    }
  }
  if (noDate.length) {
    h += `<div class="section-title">পরবর্তী তারিখ নেই (${bn(noDate.length)})</div>` +
      noDate.map(c => `<a class="card case-card" href="#/case/${c.id}">${caseHeadHTML(c)}</a>`).join('');
  }
  h += `<div class="small muted" style="text-align:center;margin-top:10px">মোট চলমান মামলা: ${bn(running)}</div>`;
  return { title: 'কেস ডায়েরি', html: h, fab: { action: 'new-case', label: 'নতুন মামলা' } };
}

/* ======================================================================
   স্ক্রিন: মামলার তালিকা
   ====================================================================== */
const ui = { q: '', filter: 'active', type: '' };

function caseCard(c) {
  const p = prevDate(c);
  return `<a class="card case-card" href="#/case/${c.id}">
    ${caseHeadHTML(c)}
    <div class="dates">
      <div><small>পরবর্তী তারিখ</small><strong>${isActive(c) ? fmtDate(c.nextDate) : '—'}</strong>${isActive(c) ? relChip(c.nextDate) : `<span class="chip ok">${STATUS.disposed}</span>`}</div>
      <div><small>পূর্ববর্তী তারিখ</small><strong>${fmtDate(p)}</strong></div>
    </div></a>`;
}

function filteredCases() {
  const q = norm(ui.q.trim());
  return db.cases.filter(c => {
    if (ui.filter === 'active' && !isActive(c)) return false;
    if (ui.filter === 'disposed' && isActive(c)) return false;
    if (ui.type && c.type !== ui.type) return false;
    if (q) {
      const hay = norm([c.caseNo, c.plaintiff, c.defendant, c.court, c.subject, c.notes, getClient(c.clientId)?.name].join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (a.nextDate && b.nextDate) return a.nextDate.localeCompare(b.nextDate);
    if (a.nextDate) return -1; if (b.nextDate) return 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}
function caseListHTML() {
  const list = filteredCases();
  if (!list.length) return `<div class="empty"><b>${db.cases.length ? 'কিছু পাওয়া যায়নি' : 'এখনো কোনো মামলা নেই'}</b>${db.cases.length ? 'অন্য শব্দে খুঁজুন বা ফিল্টার বদলান।' : '＋ বোতামে চেপে মামলা যোগ করুন।'}</div>`;
  return list.map(caseCard).join('');
}

function vCases() {
  const chips = [['active', 'চলমান'], ['disposed', 'নিষ্পত্তি'], ['all', 'সব']].map(([k, t]) => `<button data-filter="${k}" class="${ui.filter === k ? 'on' : ''}">${t}</button>`).join('')
    + '<span style="width:1px;background:var(--line);margin:0 2px"></span>'
    + TYPES.map(t => `<button data-type="${t}" class="${ui.type === t ? 'on' : ''}">${t}</button>`).join('');
  const html = `<input class="search" id="q" type="search" placeholder="মামলা নং, পক্ষ, আদালত দিয়ে খুঁজুন…" value="${esc(ui.q)}">
    <div class="filters" id="filters">${chips}</div><div id="caseList">${caseListHTML()}</div>`;
  return {
    title: 'মামলা', html, fab: { action: 'new-case', label: 'নতুন মামলা' },
    after() {
      $('#q').addEventListener('input', e => { ui.q = e.target.value; $('#caseList').innerHTML = caseListHTML(); });
      $('#filters').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.filter) ui.filter = b.dataset.filter;
        if (b.dataset.type) ui.type = ui.type === b.dataset.type ? '' : b.dataset.type;
        render();
      });
    }
  };
}

/* ======================================================================
   স্ক্রিন: মামলার বিস্তারিত
   ====================================================================== */
function vCase(id) {
  const c = getCase(id);
  if (!c) return { title: 'মামলা', back: '#/cases', html: '<div class="empty"><b>মামলা পাওয়া যায়নি</b></div>' };
  const hs = hearingsOf(id), client = getClient(c.clientId), fee = feeOf(id), p = prevDate(c);
  const t = today();

  let nextBox = '';
  if (isActive(c)) {
    const cls = c.nextDate === t ? 'is-today' : (c.nextDate && c.nextDate < t ? 'is-late' : '');
    nextBox = `<div class="nextbox ${cls}">
      <div><small>পরবর্তী তারিখ${c.nextPurpose ? ' · ' + esc(c.nextPurpose) : ''}</small>
      <div class="big">${c.nextDate ? fmtShort(c.nextDate) : 'নির্ধারিত নেই'}</div>
      ${c.nextDate ? `<small>${fmtDate(c.nextDate)}</small>` : ''}</div>
      ${relChip(c.nextDate)}</div>`;
  }

  const kv = [
    ['আদালত', c.court], ['বিষয়/ধারা', c.subject],
    ['বাদী/আবেদনকারী', c.plaintiff], ['বিবাদী/প্রতিপক্ষ', c.defendant],
    ['আমার পক্ষ', c.ourSide === 'd' ? 'বিবাদী/প্রতিপক্ষ' : 'বাদী/আবেদনকারী'],
    ['মক্কেল', client ? `<a href="#/client/${client.id}" style="color:var(--primary-2);font-weight:600">${esc(client.name)}</a>` + (client.phone ? ` · <a href="tel:${esc(client.phone)}">${esc(bn(client.phone))}</a>` : '') : ''],
    ['পূর্ববর্তী তারিখ', p ? fmtDate(p) : '']
  ].filter(([, v]) => v);

  const hist = hs.length ? `<div class="timeline">${hs.map(h => `
    <div class="tl-item ${h.attended === false ? 'absent' : ''}">
      <div class="row wrap"><b>${fmtShort(h.date)}, ${bn(h.date.slice(0, 4))}</b>
        ${h.purpose ? `<span class="chip">${esc(h.purpose)}</span>` : ''}
        <span class="chip ${h.attended === false ? 'late' : 'ok'}">${h.attended === false ? 'অনুপস্থিত' : 'হাজির'}</span></div>
      ${h.order ? `<div class="order">${esc(h.order)}</div>` : ''}
      ${h.nextDate ? `<div class="small muted mt">➜ পরবর্তী: ${fmtDate(h.nextDate)}${h.nextPurpose ? ' (' + esc(h.nextPurpose) + ')' : ''}</div>` : ''}
      <div class="tl-actions"><button class="linkbtn" data-action="hearing" data-case="${id}" data-id="${h.id}">সম্পাদনা</button>
      <button class="linkbtn red" data-action="del-hearing" data-id="${h.id}">মুছুন</button></div>
    </div>`).join('')}</div>` : `<div class="muted small">এখনো কোনো তারিখের ফলাফল লেখা হয়নি।</div>`;

  const fees = db.fees.filter(f => f.caseId === id).sort((a, b) => b.date.localeCompare(a.date));
  const feeHTML = `<div class="money">
      <div><small>ধার্য ফি</small><b>${money(fee.agreed)}</b></div>
      <div><small>প্রাপ্ত</small><b>${money(fee.received)}</b></div>
      <div class="${fee.due ? 'due' : 'zero'}"><small>বাকি</small><b>${money(fee.due)}</b></div></div>
    ${fees.length ? `<div class="mt">${fees.map(f => `<div class="pay"><div><div>${f.type === 'agreed' ? 'ফি ধার্য' : 'ফি গ্রহণ'} <span class="muted small">· ${fmtDate(f.date)}</span></div>${f.note ? `<div class="muted small">${esc(f.note)}</div>` : ''}
      <button class="linkbtn red" data-action="del-fee" data-id="${f.id}">মুছুন</button></div>
      <div class="amt ${f.type === 'received' ? 'in' : ''}">${f.type === 'received' ? '+' : ''}${money(f.amount)}</div></div>`).join('')}</div>` : ''}`;

  const html = `
    <div class="card hero">
      <div class="row between wrap"><h2>${esc(c.caseNo)}</h2>
        <div class="row"><span class="chip ${typeClass(c.type)}">${esc(c.type || 'অন্যান্য')}</span>
        <span class="chip ${c.status === 'disposed' ? 'ok' : c.status === 'stayed' ? 'warn' : 'soon'}">${STATUS[c.status] || STATUS.running}</span></div></div>
      <dl class="kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${k === 'মক্কেল' ? v : esc(v)}</dd>`).join('')}</dl>
      ${nextBox}
      <div class="row mt">
        ${isActive(c) ? `<button class="btn primary grow" data-action="hearing" data-case="${id}">ফলাফল লিখুন</button>` : ''}
        <button class="btn grow" data-action="edit-case" data-id="${id}">সম্পাদনা</button>
      </div>
    </div>
    <div class="section-title">তারিখের ইতিহাস (${bn(hs.length)})</div>
    <div class="card">${hist}</div>
    <div class="section-title">ফি ও হিসাব <button class="btn small" data-action="fee" data-case="${id}">＋ যোগ</button></div>
    <div class="card">${feeHTML}</div>
    ${c.notes ? `<div class="section-title">নোট</div><div class="card" style="white-space:pre-wrap">${esc(c.notes)}</div>` : ''}
    <button class="btn danger block mt" data-action="del-case" data-id="${id}">এই মামলা মুছে ফেলুন</button>`;
  return { title: c.caseNo, back: '#/cases', html };
}

/* ======================================================================
   স্ক্রিন: মক্কেল
   ====================================================================== */
function clientDue(clientId) {
  return db.cases.filter(c => c.clientId === clientId).reduce((s, c) => s + feeOf(c.id).due, 0);
}
function vClients() {
  const list = [...db.clients].sort((a, b) => a.name.localeCompare(b.name, 'bn'));
  const html = list.length ? list.map(cl => {
    const n = db.cases.filter(c => c.clientId === cl.id && isActive(c)).length, due = clientDue(cl.id);
    return `<a class="card" href="#/client/${cl.id}"><div class="row between"><b>${esc(cl.name)}</b>${due ? `<span class="chip late">বাকি ${money(due)}</span>` : ''}</div>
      <div class="muted small mt">${cl.phone ? '📞 ' + esc(bn(cl.phone)) + ' · ' : ''}চলমান মামলা: ${bn(n)}</div></a>`;
  }).join('') : `<div class="empty"><b>কোনো মক্কেল নেই</b>মামলা যোগ করার সময়ও মক্কেল যোগ করা যায়।</div>`;
  return { title: 'মক্কেল', html, fab: { action: 'new-client', label: 'নতুন মক্কেল' } };
}
function vClient(id) {
  const cl = getClient(id);
  if (!cl) return { title: 'মক্কেল', back: '#/clients', html: '<div class="empty"><b>মক্কেল পাওয়া যায়নি</b></div>' };
  const cs = db.cases.filter(c => c.clientId === id);
  const sum = cs.reduce((s, c) => { const f = feeOf(c.id); s.a += f.agreed; s.r += f.received; s.d += f.due; return s; }, { a: 0, r: 0, d: 0 });
  const html = `<div class="card hero"><h2>${esc(cl.name)}</h2>
    <dl class="kv">${[['ফোন', cl.phone ? `<a href="tel:${esc(cl.phone)}" style="color:var(--primary-2);font-weight:600">${esc(bn(cl.phone))}</a>` : ''], ['ঠিকানা', cl.address ? esc(cl.address) : ''], ['নোট', cl.notes ? esc(cl.notes) : '']]
      .filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <div class="row mt"><button class="btn grow" data-action="edit-client" data-id="${id}">সম্পাদনা</button></div></div>
    <div class="section-title">হিসাব</div>
    <div class="card"><div class="money"><div><small>ধার্য</small><b>${money(sum.a)}</b></div><div><small>প্রাপ্ত</small><b>${money(sum.r)}</b></div>
      <div class="${sum.d ? 'due' : 'zero'}"><small>বাকি</small><b>${money(sum.d)}</b></div></div></div>
    <div class="section-title">মামলা (${bn(cs.length)})</div>
    ${cs.length ? cs.map(caseCard).join('') : '<div class="empty">এই মক্কেলের কোনো মামলা যোগ করা হয়নি।</div>'}
    <button class="btn danger block mt" data-action="del-client" data-id="${id}">মক্কেল মুছুন</button>`;
  return { title: cl.name, back: '#/clients', html };
}

/* ======================================================================
   স্ক্রিন: হিসাব
   ====================================================================== */
function vFees() {
  let A = 0, R = 0;
  const rows = db.cases.map(c => { const f = feeOf(c.id); A += f.agreed; R += f.received; return { c, f }; });
  const owing = rows.filter(r => r.f.due > 0).sort((a, b) => b.f.due - a.f.due);
  const D = owing.reduce((s, r) => s + r.f.due, 0);
  const recent = db.fees.filter(f => f.type === 'received').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const html = `<div class="card"><div class="money"><div><small>মোট ধার্য</small><b>${money(A)}</b></div><div><small>মোট প্রাপ্ত</small><b>${money(R)}</b></div>
      <div class="${D ? 'due' : 'zero'}"><small>মোট বাকি</small><b>${money(D)}</b></div></div></div>
    <div class="section-title">যাদের কাছে ফি বাকি (${bn(owing.length)})</div>
    ${owing.length ? owing.map(({ c, f }) => `<a class="card" href="#/case/${c.id}"><div class="row between"><b>${esc(c.caseNo)}</b><span class="chip late">বাকি ${money(f.due)}</span></div>
      <div class="muted small mt">${esc(getClient(c.clientId)?.name || c.plaintiff || '—')} · ধার্য ${money(f.agreed)}, পেয়েছি ${money(f.received)}</div></a>`).join('')
      : '<div class="empty">কোনো ফি বাকি নেই 🎉<br><span class="small">(মামলার পাতা থেকে ফি যোগ করুন)</span></div>'}
    ${recent.length ? `<div class="section-title">সাম্প্রতিক প্রাপ্তি</div><div class="card">${recent.map(f => {
      const c = getCase(f.caseId);
      return `<div class="pay"><div><div>${esc(c?.caseNo || '—')}</div><div class="muted small">${fmtDate(f.date)}${f.note ? ' · ' + esc(f.note) : ''}</div></div><div class="amt in">+${money(f.amount)}</div></div>`;
    }).join('')}</div>` : ''}`;
  return { title: 'হিসাব', html };
}

/* ======================================================================
   স্ক্রিন: আরও (রিমাইন্ডার, ব্যাকআপ)
   ====================================================================== */
function vMore() {
  const s = db.settings, lb = s.lastBackup;
  const html = `
    <div class="section-title">রিমাইন্ডার</div>
    <div class="card">
      <div class="setting"><div><div class="strong">তারিখের নোটিফিকেশন</div><div class="small muted">মামলার আগের দিন ও তারিখের সকালে মনে করিয়ে দেবে</div></div>
        <input type="checkbox" class="switch" id="sRemind" ${s.remind ? 'checked' : ''}></div>
      <div class="setting"><div>আগের দিন সন্ধ্যায়</div><input type="time" id="sEvening" value="${esc(s.evening)}"></div>
      <div class="setting"><div>তারিখের দিন সকালে</div><input type="time" id="sMorning" value="${esc(s.morning)}"></div>
      <button class="btn small mt" data-action="test-notify">পরীক্ষামূলক নোটিফিকেশন (৫ সেকেন্ডে)</button>
    </div>
    <div class="section-title">ব্যাকআপ</div>
    <div class="card">
      <div class="small muted">তথ্য শুধু এই ফোনেই থাকে। নিয়মিত ব্যাকআপ নিয়ে নিজের Gmail/Drive/WhatsApp-এ পাঠিয়ে রাখুন।</div>
      <div class="small mt">সর্বশেষ ব্যাকআপ: <b>${lb ? fmtDate(lb) : 'কখনো নেওয়া হয়নি'}</b></div>
      <div class="row mt"><button class="btn primary grow" data-action="backup">ব্যাকআপ নিন</button>
      <button class="btn grow" data-action="restore">ব্যাকআপ থেকে ফেরান</button></div>
    </div>
    <div class="section-title">তথ্য</div>
    <div class="card small muted">মোট মামলা: ${bn(db.cases.length)} · মক্কেল: ${bn(db.clients.length)} · তারিখের রেকর্ড: ${bn(db.hearings.length)}<br>
      ইন্টারনেট ছাড়াই সব কাজ করে। কোনো তথ্য কোথাও পাঠানো হয় না।<br>কেস ডায়েরি v1.0</div>`;
  return {
    title: 'আরও', html,
    after() {
      $('#sRemind').addEventListener('change', async e => {
        db.settings.remind = e.target.checked; save();
        if (e.target.checked) await ensureNotifyPermission(true);
      });
      $('#sEvening').addEventListener('change', e => { db.settings.evening = e.target.value || '20:00'; save(); });
      $('#sMorning').addEventListener('change', e => { db.settings.morning = e.target.value || '07:00'; save(); });
    }
  };
}

/* ======================================================================
   ফর্ম: মামলা
   ====================================================================== */
function caseForm(id) {
  const old = id ? getCase(id) : null;
  const c = old || { type: 'দেওয়ানী', status: 'running', ourSide: 'p' };
  const courts = uniq(db.cases.map(x => x.court).filter(Boolean));
  const hasHist = old && hearingsOf(id).length > 0;
  const body = `
    ${field('মামলা নং *', `<input name="caseNo" value="${esc(c.caseNo)}" placeholder="যেমন: পারিবারিক মামলা ১২/২০২৬">`)}
    <div class="two">
      ${field('মামলার ধরন', `<select name="type">${options(TYPES.map(x => [x, x]), c.type)}</select>`)}
      ${field('অবস্থা', `<select name="status">${options(Object.entries(STATUS), c.status)}</select>`)}
    </div>
    ${field('বিষয় / ধারা', `<input name="subject" value="${esc(c.subject)}" placeholder="যেমন: ভরণপোষণ, দেনমোহর, ৪০৬ ধারা">`)}
    ${field('আদালত', `<input name="court" list="courtList" value="${esc(c.court)}" placeholder="যেমন: পারিবারিক আদালত, জামালপুর"><datalist id="courtList">${courts.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`)}

    <div class="formsec">পক্ষগণ</div>
    ${field('বাদী / আবেদনকারী', `<input name="plaintiff" value="${esc(c.plaintiff)}">`)}
    ${field('বিবাদী / প্রতিপক্ষ', `<input name="defendant" value="${esc(c.defendant)}">`)}
    <div class="field"><span>আমি কোন পক্ষে</span><div class="seg">
      <label><input type="radio" name="ourSide" value="p" ${c.ourSide !== 'd' ? 'checked' : ''}><span>বাদী / আবেদনকারী</span></label>
      <label><input type="radio" name="ourSide" value="d" ${c.ourSide === 'd' ? 'checked' : ''}><span>বিবাদী / প্রতিপক্ষ</span></label></div></div>
    ${field('আমার মক্কেল', `<select name="clientId"><option value="">— নির্বাচন করুন —</option>${db.clients.map(cl => `<option value="${cl.id}" ${cl.id === c.clientId ? 'selected' : ''}>${esc(cl.name)}</option>`).join('')}</select>`)}
    <div class="two">
      ${field('নতুন মক্কেলের নাম', `<input name="newClient" placeholder="তালিকায় না থাকলে">`)}
      ${field('ফোন', `<input name="newPhone" inputmode="tel" placeholder="০১৭…">`)}
    </div>

    <div class="formsec">তারিখ</div>
    ${hasHist ? '' : dateField('পূর্ববর্তী তারিখ (পুরনো মামলা হলে)', 'prevManual', c.prevManual)}
    ${dateField('পরবর্তী তারিখ', 'nextDate', c.nextDate)}
    ${field('পরবর্তী তারিখের কারণ', `<input name="nextPurpose" list="purposeList" value="${esc(c.nextPurpose)}" placeholder="যেমন: সাক্ষ্য"><datalist id="purposeList">${PURPOSES.map(x => `<option value="${x}">`).join('')}</datalist>`)}
    ${field('নোট', `<textarea name="notes" placeholder="মামলার সংক্ষিপ্ত তথ্য, গুরুত্বপূর্ণ বিষয়…">${esc(c.notes)}</textarea>`)}`;

  const f = openSheet(old ? 'মামলা সম্পাদনা' : 'নতুন মামলা', body, async fd => {
    const v = Object.fromEntries(fd);
    const caseNo = (v.caseNo || '').trim();
    if (!caseNo) { toast('মামলা নং লিখুন'); return; }
    let clientId = v.clientId || '';
    if (!clientId && (v.newClient || '').trim()) {
      const nc = { id: uid(), name: v.newClient.trim(), phone: (v.newPhone || '').trim(), address: '', notes: '' };
      db.clients.push(nc); clientId = nc.id;
    }
    const data = {
      caseNo, type: v.type, status: v.status, subject: (v.subject || '').trim(), court: (v.court || '').trim(),
      plaintiff: (v.plaintiff || '').trim(), defendant: (v.defendant || '').trim(), ourSide: v.ourSide, clientId,
      nextDate: v.nextDate || '', nextPurpose: (v.nextPurpose || '').trim(), notes: (v.notes || '').trim()
    };
    if (v.prevManual !== undefined) data.prevManual = v.prevManual || '';
    let target = old;
    if (old) Object.assign(old, data);
    else { target = { id: uid(), createdAt: Date.now(), ...data }; db.cases.push(target); }
    save();
    await closeSheet();
    toast('মামলা সংরক্ষিত');
    if (old) render(); else location.hash = '#/case/' + target.id;
  });
  bindWeekendHint(f, 'nextDate');
}

/* ======================================================================
   ফর্ম: তারিখের ফলাফল (হাজিরা + আদেশ + পরবর্তী তারিখ)
   ====================================================================== */
function hearingForm(caseId, hid) {
  const c = getCase(caseId); if (!c) return;
  const old = hid ? db.hearings.find(h => h.id === hid) : null;
  const t = today();
  const h = old || { date: c.nextDate && c.nextDate <= t ? c.nextDate : t, attended: true, purpose: c.nextPurpose || '', order: '', nextDate: '', nextPurpose: '' };
  const body = `
    <div class="card" style="margin-bottom:14px"><b>${esc(c.caseNo)}</b><div class="small muted">${esc(c.plaintiff || '—')} বনাম ${esc(c.defendant || '—')}</div></div>
    ${dateField('তারিখ', 'date', h.date)}
    <div class="field"><span>আমার হাজিরা</span><div class="seg">
      <label><input type="radio" name="attended" value="1" ${h.attended !== false ? 'checked' : ''}><span>হাজির ছিলাম</span></label>
      <label><input type="radio" name="attended" value="0" ${h.attended === false ? 'checked' : ''}><span>হাজির ছিলাম না</span></label></div></div>
    ${field('আজকের ধাপ', `<input name="purpose" list="purposeList2" value="${esc(h.purpose)}" placeholder="যেমন: শুনানি"><datalist id="purposeList2">${PURPOSES.map(x => `<option value="${x}">`).join('')}</datalist>`)}
    ${field('আদেশ / আজকের ফলাফল', `<textarea name="order" placeholder="আদালত কী আদেশ দিলেন, কী হলো…">${esc(h.order)}</textarea>`)}
    <div class="formsec">পরবর্তী ধাপ</div>
    ${dateField('পরবর্তী তারিখ', 'nextDate', h.nextDate)}
    ${field('পরবর্তী তারিখের কারণ', `<input name="nextPurpose" list="purposeList2" value="${esc(h.nextPurpose)}" placeholder="যেমন: সাক্ষ্য">`)}
    <label class="check"><input type="checkbox" name="disposed" value="1" ${c.status === 'disposed' ? 'checked' : ''}><span>মামলা নিষ্পত্তি হয়েছে</span></label>`;

  const f = openSheet(old ? 'ফলাফল সম্পাদনা' : 'তারিখের ফলাফল', body, async fd => {
    const v = Object.fromEntries(fd);
    if (!v.date) { toast('তারিখ দিন'); return; }
    const rec = {
      date: v.date, attended: v.attended !== '0', purpose: (v.purpose || '').trim(), order: (v.order || '').trim(),
      nextDate: v.nextDate || '', nextPurpose: (v.nextPurpose || '').trim()
    };
    let hr = old;
    if (old) Object.assign(old, rec);
    else { hr = { id: uid(), caseId, createdAt: Date.now(), ...rec }; db.hearings.push(hr); }
    // সর্বশেষ রেকর্ড হলে মামলার পরবর্তী তারিখ হালনাগাদ হবে
    const latest = hearingsOf(caseId)[0];
    if (latest && latest.id === hr.id) {
      c.nextDate = rec.nextDate; c.nextPurpose = rec.nextPurpose;
      if (v.disposed) { c.status = 'disposed'; c.nextDate = ''; c.nextPurpose = ''; }
      else if (c.status === 'disposed') c.status = 'running';
    }
    save();
    await closeSheet();
    toast('ফলাফল সংরক্ষিত');
    render();
  });
  bindWeekendHint(f, 'nextDate');
}

/* ======================================================================
   ফর্ম: ফি, মক্কেল
   ====================================================================== */
function feeForm(caseId) {
  const c = getCase(caseId); if (!c) return;
  const body = `
    <div class="card" style="margin-bottom:14px"><b>${esc(c.caseNo)}</b></div>
    <div class="field"><span>ধরন</span><div class="seg">
      <label><input type="radio" name="type" value="received" checked><span>ফি পেলাম</span></label>
      <label><input type="radio" name="type" value="agreed"><span>ফি ধার্য হলো</span></label></div></div>
    ${field('টাকার পরিমাণ', `<input name="amount" inputmode="numeric" placeholder="যেমন: ৫০০০">`)}
    ${field('তারিখ', `<input type="date" name="date" value="${today()}">`)}
    ${field('নোট (ঐচ্ছিক)', `<input name="note" placeholder="যেমন: নগদ / বিকাশ">`)}`;
  openSheet('ফি যোগ করুন', body, async fd => {
    const v = Object.fromEntries(fd), amount = parseAmount(v.amount);
    if (amount <= 0) { toast('টাকার পরিমাণ লিখুন'); return; }
    db.fees.push({ id: uid(), caseId, type: v.type, amount, date: v.date || today(), note: (v.note || '').trim() });
    save(); await closeSheet(); toast('হিসাব সংরক্ষিত'); render();
  });
}

function clientForm(id) {
  const old = id ? getClient(id) : null, c = old || {};
  const body = `
    ${field('নাম *', `<input name="name" value="${esc(c.name)}">`)}
    ${field('ফোন', `<input name="phone" inputmode="tel" value="${esc(c.phone)}">`)}
    ${field('ঠিকানা', `<input name="address" value="${esc(c.address)}">`)}
    ${field('নোট', `<textarea name="notes">${esc(c.notes)}</textarea>`)}`;
  openSheet(old ? 'মক্কেল সম্পাদনা' : 'নতুন মক্কেল', body, async fd => {
    const v = Object.fromEntries(fd), name = (v.name || '').trim();
    if (!name) { toast('নাম লিখুন'); return; }
    const data = { name, phone: (v.phone || '').trim(), address: (v.address || '').trim(), notes: (v.notes || '').trim() };
    if (old) Object.assign(old, data); else db.clients.push({ id: uid(), ...data });
    save(); await closeSheet(); toast('মক্কেল সংরক্ষিত'); render();
  });
}

/* ======================================================================
   ব্যাকআপ / রিস্টোর
   ====================================================================== */
const plugin = n => window.Capacitor?.Plugins?.[n];
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

async function doBackup() {
  const json = JSON.stringify(db, null, 1), name = `case-diary-backup-${today()}.json`;
  try {
    const fs = plugin('Filesystem'), sh = plugin('Share');
    if (isNative() && fs && sh) {
      await fs.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
      const { uri } = await fs.getUri({ path: name, directory: 'CACHE' });
      await sh.share({ title: 'কেস ডায়েরি ব্যাকআপ', url: uri, dialogTitle: 'ব্যাকআপ ফাইলটি কোথায় রাখবেন?' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
    }
    db.settings.lastBackup = today(); save(); render();
    toast('ব্যাকআপ তৈরি হয়েছে');
  } catch (e) {
    if (String(e && e.message || e).toLowerCase().includes('cancel')) return;
    console.error(e); toast('ব্যাকআপ নেওয়া যায়নি');
  }
}

$('#restoreFile').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.cases)) throw new Error('bad');
    const ok = await ask(`এই ব্যাকআপে ${bn(data.cases.length)}টি মামলা আছে।\nফেরালে এখনকার সব তথ্য মুছে এই ব্যাকআপের তথ্য বসবে। এগোবেন?`, 'ফেরান', true);
    if (!ok) return;
    db = normalize(data); save(); render(); toast('তথ্য ফিরিয়ে আনা হয়েছে');
  } catch (err) { toast('এটি সঠিক ব্যাকআপ ফাইল নয়'); }
});

/* ======================================================================
   নোটিফিকেশন (শুধু অ্যান্ড্রয়েড অ্যাপে)
   ====================================================================== */
const CHANNEL = 'reminders';
async function ensureNotifyPermission(interactive) {
  const ln = plugin('LocalNotifications');
  if (!isNative() || !ln) { if (interactive) toast('নোটিফিকেশন শুধু অ্যান্ড্রয়েড অ্যাপে কাজ করবে'); return false; }
  try {
    let p = await ln.checkPermissions();
    if (p.display !== 'granted') p = await ln.requestPermissions();
    if (p.display === 'granted') {
      try { await ln.createChannel({ id: CHANNEL, name: 'মামলার তারিখ', description: 'মামলার তারিখের রিমাইন্ডার', importance: 4, visibility: 1, vibration: true }); } catch (e) { /* ignore */ }
      scheduleReminders();
      return true;
    }
    if (interactive) toast('ফোনের সেটিংস থেকে নোটিফিকেশনের অনুমতি দিন');
  } catch (e) { console.error(e); }
  return false;
}

const at = (iso, hhmm) => { const [y, m, d] = parts(iso); const [hh, mm] = (hhmm || '08:00').split(':').map(Number); return new Date(y, m - 1, d, hh, mm || 0, 0); };
let schedTimer;
function scheduleReminders() {
  clearTimeout(schedTimer);
  schedTimer = setTimeout(async () => {
    const ln = plugin('LocalNotifications');
    if (!isNative() || !ln) return;
    try {
      const pending = await ln.getPending();
      if (pending.notifications.length) await ln.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
      if (!db.settings.remind) return;
      const perm = await ln.checkPermissions();
      if (perm.display !== 'granted') return;

      const t = today(), now = Date.now();
      const byDate = {};
      for (const c of db.cases) if (isActive(c) && c.nextDate && c.nextDate >= t) (byDate[c.nextDate] ||= []).push(c);
      const dates = Object.keys(byDate).sort().slice(0, 40);
      const list = arr => arr.slice(0, 4).map(c => `• ${c.caseNo}${c.plaintiff || c.defendant ? ' — ' + (c.plaintiff || '…') + ' বনাম ' + (c.defendant || '…') : ''}`).join('\n') + (arr.length > 4 ? `\n…আরও ${bn(arr.length - 4)}টি` : '');
      const notifications = [];
      for (const d of dates) {
        const arr = byDate[d], n = Number(d.replace(/-/g, '')) * 10;
        const eve = at(addDays(d, -1), db.settings.evening), mor = at(d, db.settings.morning);
        if (eve.getTime() > now) notifications.push({ id: n + 1, title: `আগামীকাল ${bn(arr.length)}টি মামলার তারিখ`, body: list(arr), channelId: CHANNEL, schedule: { at: eve, allowWhileIdle: true } });
        if (mor.getTime() > now) notifications.push({ id: n + 2, title: `আজ ${bn(arr.length)}টি মামলার তারিখ`, body: list(arr), channelId: CHANNEL, schedule: { at: mor, allowWhileIdle: true } });
      }
      if (notifications.length) await ln.schedule({ notifications });
    } catch (e) { console.warn('reminder', e); }
  }, 500);
}

async function testNotify() {
  const ln = plugin('LocalNotifications');
  if (!(await ensureNotifyPermission(true))) return;
  try {
    await ln.schedule({ notifications: [{ id: 1, title: 'কেস ডায়েরি', body: 'রিমাইন্ডার ঠিকভাবে কাজ করছে ✓', channelId: CHANNEL, schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] });
    toast('৫ সেকেন্ড পরে নোটিফিকেশন আসবে — অ্যাপ থেকে বেরিয়ে দেখুন');
  } catch (e) { toast('নোটিফিকেশন পাঠানো যায়নি'); }
}

/* ======================================================================
   রাউটার ও রেন্ডার
   ====================================================================== */
const route = () => { const [name, id] = (location.hash.replace(/^#\/?/, '') || 'today').split('/'); return { name, id }; };
let lastRoute = '';

function render() {
  const { name, id } = route();
  const views = { today: () => vToday(), cases: () => vCases(), case: () => vCase(id), clients: () => vClients(), client: () => vClient(id), fees: () => vFees(), more: () => vMore() };
  if (!views[name]) { location.replace('#/today'); return; }
  const r = views[name]();
  const bar = $('.appbar');
  bar.innerHTML = `<div class="left">${r.back ? `<button class="back" data-action="back" data-to="${r.back}" aria-label="পেছনে">‹</button>` : ''}<h1>${esc(r.title)}</h1></div><div>${r.actions || ''}</div>`;
  $('#view').innerHTML = r.html;
  const fab = $('#fab');
  if (r.fab) { fab.hidden = false; fab.dataset.action = r.fab.action; fab.setAttribute('aria-label', r.fab.label); } else fab.hidden = true;
  const tab = { case: 'cases', client: 'clients' }[name] || name;
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  const key = name + '/' + (id || '');
  if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
  if (r.after) r.after();
}
window.addEventListener('hashchange', render);

/* ======================================================================
   ক্লিক হ্যান্ডলার
   ====================================================================== */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const a = el.dataset.action, id = el.dataset.id, cid = el.dataset.case;
  switch (a) {
    case 'back': if (history.length > 1) history.back(); else location.hash = el.dataset.to || '#/today'; break;
    case 'close-sheet': closeSheet(); break;
    case 'new-case': caseForm(); break;
    case 'edit-case': caseForm(id); break;
    case 'new-client': clientForm(); break;
    case 'edit-client': clientForm(id); break;
    case 'hearing': hearingForm(cid, id); break;
    case 'fee': feeForm(cid); break;
    case 'backup': doBackup(); break;
    case 'restore': $('#restoreFile').click(); break;
    case 'test-notify': testNotify(); break;
    case 'del-case':
      if (await ask('এই মামলা এবং এর সব তারিখের রেকর্ড ও ফি-র হিসাব মুছে যাবে। নিশ্চিত?', 'মুছুন', true)) {
        db.cases = db.cases.filter(c => c.id !== id); db.hearings = db.hearings.filter(h => h.caseId !== id); db.fees = db.fees.filter(f => f.caseId !== id);
        save(); toast('মামলা মুছে ফেলা হয়েছে'); location.replace('#/cases'); render();
      } break;
    case 'del-hearing':
      if (await ask('এই তারিখের রেকর্ড মুছবেন?', 'মুছুন', true)) { db.hearings = db.hearings.filter(h => h.id !== id); save(); render(); }
      break;
    case 'del-fee':
      if (await ask('এই হিসাবের এন্ট্রি মুছবেন?', 'মুছুন', true)) { db.fees = db.fees.filter(f => f.id !== id); save(); render(); }
      break;
    case 'del-client':
      if (await ask('মক্কেল মুছবেন? তার মামলাগুলো থাকবে, শুধু মক্কেলের সংযোগ সরে যাবে।', 'মুছুন', true)) {
        db.clients = db.clients.filter(c => c.id !== id); db.cases.forEach(c => { if (c.clientId === id) c.clientId = ''; });
        save(); location.replace('#/clients'); render();
      } break;
  }
});

/* ======================================================================
   শুরু
   ====================================================================== */
if (!location.hash) location.replace('#/today');
render();
if (isNative()) { if (db.settings.remind) ensureNotifyPermission(false).then(() => scheduleReminders()); }
if ('serviceWorker' in navigator && !isNative() && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
// তারিখ বদলে গেলে (অ্যাপ খোলা অবস্থায় রাত পেরোলে) স্ক্রিন হালনাগাদ
document.addEventListener('visibilitychange', () => { if (!document.hidden && !sheetOpen) render(); });
})();
