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
const mostCommon = arr => {
  const m = {}; let best = '', n = 0;
  for (const x of arr) if (x) { m[x] = (m[x] || 0) + 1; if (m[x] > n) { n = m[x]; best = x; } }
  return best;
};
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
  v: 1, cases: [], hearings: [], clients: [], fees: [], courts: [],
  settings: { remind: true, evening: '20:00', morning: '07:00', lastBackup: '', askedPerm: false, about: { name: 'অ্যাডভোকেট আবু ফাহাদ তাউকির', title: '', enroll: '', address: '', mobile: '', email: '' } }
});
const normalize = d => {
  const e = EMPTY();
  return {
    ...e, ...d,
    cases: d.cases || [], hearings: d.hearings || [], clients: d.clients || [], fees: d.fees || [], courts: d.courts || [],
    settings: { ...e.settings, ...(d.settings || {}), about: { ...e.settings.about, ...((d.settings || {}).about || {}) } }
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

/* ---------- ক্লাউড (একাধিক ফোনে একই অ্যাকাউন্ট) ---------- */
const COLLS = ['cases', 'hearings', 'clients', 'fees', 'courts'];
const LEGACY_KEY = 'caseDiary.legacy';
const DATA_COLLS = ['cases', 'hearings', 'clients', 'fees'];
const Cloud = window.Cloud || { configured: false };
const auth = { user: null, profile: null, unsub: null, ready: false, status: 'synced', members: null, legacyAsked: false };
const cloudOn = () => !!(Cloud.configured && auth.profile);
const isClerk = () => cloudOn() && auth.profile.role === 'clerk';     // ক্লার্ক ফি-র হিসাব দেখতে পায় না
const canManage = () => !cloudOn() || auth.profile.role === 'admin';  // আদালতের তালিকা বদলানো ইত্যাদি
const P = (c, o) => ({ c, put: o });
const D = (c, id) => ({ c, del: id });

/* ডেটা বদলের পর এটি ডাকা হয়: ফোনে সংরক্ষণ + (লগইন থাকলে) ক্লাউডে পাঠানো */
function commit(ops) {
  if (cloudOn()) {
    const now = Date.now();
    for (const o of ops) if (o.put) { o.put.updatedAt = now; o.put.updatedBy = auth.profile.name || ''; }
  }
  save();
  if (cloudOn()) {
    setSync('pending');
    Cloud.write(auth.profile.chamberId, ops).catch(e => {
      console.warn('sync', e); setSync('error'); toast('ক্লাউডে পাঠানো যায়নি: ' + cloudErr(e));
    });
  }
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

/* ---------- আদালতের তালিকা ---------- */
const sortedCourts = () => [...db.courts].sort((a, b) => (a.sort ?? 1e9) - (b.sort ?? 1e9) || a.name.localeCompare(b.name, 'bn'));
const courtRank = name => { const i = sortedCourts().findIndex(c => c.name === name); return i < 0 ? 1e6 : i; };
function seedCourts() {
  if (db.courts.length || !Array.isArray(window.DEFAULT_COURTS)) return;
  if (cloudOn() && auth.profile.role !== 'admin') return;   // ক্লাউডে শুধু অ্যাডভোকেট তালিকা বসায়
  const ops = window.DEFAULT_COURTS.map((name, i) => {
    const d = { id: 'dc' + String(i + 1).padStart(3, '0'), name, sort: i + 1 };
    db.courts.push(d); return P('courts', d);
  });
  if (cloudOn()) commit(ops); else save();
}
function addCourts(names) {
  const have = new Set(db.courts.map(c => c.name)), ops = [];
  let sort = Math.max(0, ...db.courts.map(c => c.sort || 0));
  for (let n of names) {
    n = String(n || '').replace(/[\u200b\u200c]/g, '').replace(/^[\s*•\-–]+/, '').replace(/\s+/g, ' ').trim();
    if (!n || have.has(n)) continue;
    have.add(n);
    const d = { id: uid(), name: n, sort: ++sort };
    db.courts.push(d); ops.push(P('courts', d));
  }
  if (ops.length) commit(ops);
  return ops.length;
}

const STATUS = { running: 'চলমান', stayed: 'স্থগিত', disposed: 'নিষ্পত্তি' };
const TYPES = ['দেওয়ানী', 'ফৌজদারী', 'পারিবারিক', 'দেওয়ানী আপিল', 'দেওয়ানী রিভিশন', 'ফৌজদারী আপিল', 'ফৌজদারী রিভিশন', 'রিভিউ', 'মিস কেস', '১০৭ ধারা', '১৪৫ ধারা', 'অন্যান্য'];
const typeClass = t => ({ 'দেওয়ানী': 't-civil', 'দেওয়ানী আপিল': 't-civil', 'দেওয়ানী রিভিশন': 't-civil', 'ফৌজদারী': 't-crim', 'ফৌজদারী আপিল': 't-crim', 'ফৌজদারী রিভিশন': 't-crim', '১০৭ ধারা': 't-crim', '১৪৫ ধারা': 't-crim', 'পারিবারিক': 't-fam' }[t] || 't-other');
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
    <div class="meta">${[c.court, c.subject, client && ('মক্কেল: ' + client.name)].filter(Boolean).map(esc).join(' · ')}</div>
    ${c.oppAdvocate ? `<div class="meta">বিপক্ষের অ্যাডভোকেট: ${esc(c.oppAdvocate)}</div>` : ''}`;
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
    </div>
    <a class="btn block" style="margin:8px 0 4px" href="#/causelist/${t}">🖨️ কজ লিস্ট — প্রিন্ট / শেয়ার</a>`;

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
      const hay = norm([c.caseNo, c.plaintiff, c.defendant, c.court, c.subject, c.notes, c.ourAdvocate, c.oppAdvocate, getClient(c.clientId)?.name].join(' '));
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
    ['আমাদের অ্যাডভোকেট', c.ourAdvocate],
    ['বিপক্ষের অ্যাডভোকেট', c.oppAdvocate],
    ['মক্কেল', client ? `<a href="#/client/${client.id}" style="color:var(--primary-2);font-weight:600">${esc(client.name)}</a>` + (client.phone ? ` · <a href="tel:${esc(client.phone)}">${esc(bn(client.phone))}</a>` : '') : ''],
    ['পূর্ববর্তী তারিখ', p ? fmtDate(p) : '']
  ].filter(([, v]) => v);

  const hist = hs.length ? `<div class="timeline">${hs.map(h => `
    <div class="tl-item ${h.attended === false ? 'absent' : ''}">
      <div class="row wrap"><b>${fmtShort(h.date)}, ${bn(h.date.slice(0, 4))}</b>
        ${h.purpose ? `<span class="chip">${esc(h.purpose)}</span>` : ''}
        <span class="chip ${h.attended === false ? 'late' : 'ok'}">${h.attended === false ? 'অনুপস্থিত' : 'হাজির'}</span></div>
      ${h.order ? `<div class="order">${esc(h.order)}</div>` : ''}
      ${h.updatedBy ? `<div class="tiny muted">লিখেছেন: ${esc(h.updatedBy)}</div>` : ''}
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
    ${isClerk() ? '' : `<div class="section-title">ফি ও হিসাব <button class="btn small" data-action="fee" data-case="${id}">＋ যোগ</button></div>
    <div class="card">${feeHTML}</div>`}
    ${c.notes ? `<div class="section-title">নোট</div><div class="card" style="white-space:pre-wrap">${esc(c.notes)}</div>` : ''}
    ${c.updatedBy ? `<div class="tiny muted" style="text-align:center;margin-top:8px">সর্বশেষ বদল: ${esc(c.updatedBy)}, ${fmtDate(toISO(new Date(c.updatedAt)))}</div>` : ''}
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
    const n = db.cases.filter(c => c.clientId === cl.id && isActive(c)).length, due = isClerk() ? 0 : clientDue(cl.id);
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
    ${isClerk() ? '' : `<div class="section-title">হিসাব</div>
    <div class="card"><div class="money"><div><small>ধার্য</small><b>${money(sum.a)}</b></div><div><small>প্রাপ্ত</small><b>${money(sum.r)}</b></div>
      <div class="${sum.d ? 'due' : 'zero'}"><small>বাকি</small><b>${money(sum.d)}</b></div></div></div>`}
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
   স্ক্রিন: কজ লিস্ট (প্রিন্ট / শেয়ার)
   ====================================================================== */
const shorten = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n).trim() + '…' : s; };
const causeDate = id => (id && /^\d{4}-\d{2}-\d{2}$/.test(id)) ? id : today();

function causeGroups(date) {
  const list = db.cases.filter(c => isActive(c) && c.nextDate === date)
    .sort((a, b) => courtRank(a.court) - courtRank(b.court) || (a.court || '').localeCompare(b.court || '', 'bn') || (a.caseNo || '').localeCompare(b.caseNo || '', 'bn', { numeric: true }));
  const groups = [];
  for (const c of list) {
    let g = groups[groups.length - 1];
    if (!g || g.court !== (c.court || '')) { g = { court: c.court || '', items: [] }; groups.push(g); }
    g.items.push({ c, last: hearingsOf(c.id)[0] });
  }
  return { list, groups };
}

function causeData(date) {
  const { list, groups } = causeGroups(date);
  let n = 0;
  return {
    title: 'কজ লিস্ট', chamber: (auth.profile && auth.profile.chamberName) || '', dateLine: fmtLong(date),
    countLine: list.length ? `মোট ${bn(list.length)}টি মামলা` : 'কোনো মামলা নেই',
    footer: 'Case Diary · App built by Adv Abu Fahad Taukir · ' + fmtDate(today()),
    groups: groups.map(g => ({
      court: g.court,
      items: g.items.map(({ c, last }) => ({
        no: bn(++n), caseNo: c.caseNo, type: c.type || '',
        parties: `${c.plaintiff || '—'} বনাম ${c.defendant || '—'}`,
        purpose: c.nextPurpose || '', ourAdv: c.ourAdvocate || '', oppAdv: c.oppAdvocate || '',
        lastOrder: last && last.order ? `${fmtDate(last.date)} — ${shorten(last.order, 400)}` : ''
      }))
    }))
  };
}

function causeText(date) {
  const d = causeData(date);
  const L = [`📋 ${d.title} — ${d.dateLine}`];
  if (d.chamber) L.push(d.chamber);
  L.push(d.countLine, '');
  for (const g of d.groups) {
    L.push('▌' + (g.court || 'আদালত উল্লেখ নেই'));
    for (const it of g.items) {
      L.push(`${it.no}. ${it.caseNo}`, `   ${it.parties}`);
      if (it.purpose) L.push(`   ধাপ: ${it.purpose}`);
      if (it.ourAdv) L.push(`   আমাদের অ্যাডভোকেট: ${it.ourAdv}`);
      if (it.oppAdv) L.push(`   বিপক্ষের অ্যাডভোকেট: ${it.oppAdv}`);
      if (it.lastOrder) L.push(`   পূর্ব আদেশ: ${it.lastOrder}`);
      L.push('');
    }
  }
  return L.join('\n').trim();
}

function vCauseList(id) {
  const date = causeDate(id), { list, groups } = causeGroups(date), t = today();
  const pick = [[t, 'আজ'], [addDays(t, 1), 'আগামীকাল'], [addDays(t, 2), 'পরশু']];
  let n = 0;
  const html = `
    <div class="filters">${pick.map(([d, l]) => `<button data-goto="#/causelist/${d}" class="${date === d ? 'on' : ''}">${l}</button>`).join('')}</div>
    <label class="field"><span>অন্য তারিখ বাছুন</span><input type="date" id="clDate" value="${date}"></label>
    <div class="card" style="background:var(--soon-bg)"><div class="strong">${fmtLong(date)}</div>
      <div class="small muted">${list.length ? 'মোট ' + bn(list.length) + 'টি মামলা' : 'এই তারিখে কোনো মামলা নেই'}</div></div>
    ${list.length ? `<div class="row" style="margin-bottom:6px">
      <button class="btn primary grow" data-action="cl-pdf" data-date="${date}">PDF বানান</button>
      <button class="btn grow" data-action="cl-share" data-date="${date}">লেখা শেয়ার</button></div>
      <div class="small muted" style="margin-bottom:10px">PDF বানানোর পর যে শেয়ার মেনু আসবে সেখান থেকে WhatsApp-এ পাঠাতে পারবেন, অথবা PDF ভিউয়ারে খুলে প্রিন্ট দিতে পারবেন।</div>` : ''}
    ${groups.map(g => `<div class="section-title">${esc(g.court || 'আদালত উল্লেখ নেই')} (${bn(g.items.length)})</div>` +
      g.items.map(({ c, last }) => { n++; return `<a class="card case-card" href="#/case/${c.id}">
        <div class="row between wrap"><b class="caseno">${bn(n)}. ${esc(c.caseNo)}</b><span class="chip ${typeClass(c.type)}">${esc(c.type || 'অন্যান্য')}</span></div>
        <div class="parties">${esc(c.plaintiff || '—')} <span class="vs">বনাম</span> ${esc(c.defendant || '—')}</div>
        ${c.nextPurpose ? `<div class="mt"><span class="chip soon">${esc(c.nextPurpose)}</span></div>` : ''}
        ${(c.ourAdvocate || c.oppAdvocate) ? `<div class="meta">${[c.ourAdvocate && 'আমাদের অ্যাডভোকেট: ' + c.ourAdvocate, c.oppAdvocate && 'বিপক্ষের অ্যাডভোকেট: ' + c.oppAdvocate].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
        ${last && last.order ? `<div class="meta">পূর্ব আদেশ (${fmtDate(last.date)}): ${esc(shorten(last.order, 140))}</div>` : ''}
      </a>`; }).join('')).join('')}`;
  return {
    title: 'কজ লিস্ট', back: '#/today', html,
    after() { $('#clDate').addEventListener('change', e => { if (e.target.value) location.hash = '#/causelist/' + e.target.value; }); }
  };
}

async function shareText(title, text) {
  const sh = plugin('Share');
  try {
    if (isNative() && sh) { await sh.share({ title, text, dialogTitle: title }); return; }
    if (navigator.share) { await navigator.share({ title, text }); return; }
    await navigator.clipboard.writeText(text);
    toast('লেখাটি কপি হয়েছে — যেখানে খুশি পেস্ট করুন');
  } catch (e) {
    if (!/cancel|abort/i.test(String(e && (e.message || e.name)))) { console.error(e); toast('শেয়ার করা যায়নি'); }
  }
}

async function causePDF(date) {
  if (!window.CausePDF) { toast('PDF তৈরির কোড লোড হয়নি'); return; }
  toast('PDF তৈরি হচ্ছে…');
  const name = `cause-list-${date}.pdf`;
  try {
    const { bytes } = await window.CausePDF.build(causeData(date));
    const fs = plugin('Filesystem'), sh = plugin('Share');
    if (isNative() && fs && sh) {
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      await fs.writeFile({ path: name, data: btoa(bin), directory: 'CACHE' });
      const { uri } = await fs.getUri({ path: name, directory: 'CACHE' });
      await sh.share({ title: 'কজ লিস্ট', url: uri, dialogTitle: 'কজ লিস্ট — শেয়ার বা প্রিন্ট করুন' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
    }
  } catch (e) {
    if (!/cancel|abort/i.test(String(e && (e.message || e.name)))) { console.error(e); toast('PDF বানানো যায়নি'); }
  }
}

/* ======================================================================
   স্ক্রিন: আরও (রিমাইন্ডার, ব্যাকআপ)
   ====================================================================== */
function vMore() {
  const s = db.settings, lb = s.lastBackup;
  const html = `
    ${accountHTML()}
    <div class="section-title">রিমাইন্ডার</div>
    <div class="card">
      <div class="setting"><div><div class="strong">তারিখের নোটিফিকেশন</div><div class="small muted">মামলার আগের দিন ও তারিখের সকালে মনে করিয়ে দেবে</div></div>
        <input type="checkbox" class="switch" id="sRemind" ${s.remind ? 'checked' : ''}></div>
      <div class="setting"><div>আগের দিন সন্ধ্যায়</div><input type="time" id="sEvening" value="${esc(s.evening)}"></div>
      <div class="setting"><div>তারিখের দিন সকালে</div><input type="time" id="sMorning" value="${esc(s.morning)}"></div>
      <div id="notifyBox" class="mt"><div class="small muted">অবস্থা দেখা হচ্ছে…</div></div>
      <button class="btn small mt" data-action="test-notify">পরীক্ষামূলক নোটিফিকেশন (৫ সেকেন্ডে)</button>
    </div>
    <div class="section-title">আদালত</div>
    <a class="card" href="#/courts"><div class="row between"><div><div class="strong">আদালতের তালিকা</div><div class="small muted">মামলা যোগ করার সময় এখান থেকে আদালত বাছা যায়</div></div><b>${bn(db.courts.length)}টি ›</b></div></a>
    <div class="section-title">ব্যাকআপ</div>
    <div class="card">
      <div class="small muted">তথ্য শুধু এই ফোনেই থাকে। নিয়মিত ব্যাকআপ নিয়ে নিজের Gmail/Drive/WhatsApp-এ পাঠিয়ে রাখুন।</div>
      <div class="small mt">সর্বশেষ ব্যাকআপ: <b>${lb ? fmtDate(lb) : 'কখনো নেওয়া হয়নি'}</b></div>
      <div class="row mt"><button class="btn primary grow" data-action="backup">ব্যাকআপ নিন</button>
      <button class="btn grow" data-action="restore">ব্যাকআপ থেকে ফেরান</button></div>
    </div>
    <div class="section-title">তথ্য</div>
    <div class="card small muted">মোট মামলা: ${bn(db.cases.length)} · মক্কেল: ${bn(db.clients.length)} · তারিখের রেকর্ড: ${bn(db.hearings.length)}<br>
      ${cloudOn() ? 'লগইন করা থাকায় তথ্য আপনার নিজের Firebase প্রজেক্টে (Google সার্ভারে) জমা হচ্ছে এবং চেম্বারের সবার ফোনে মিলে যাচ্ছে। ইন্টারনেট না থাকলেও কাজ চলে, নেট এলে নিজে সিঙ্ক হয়।' : 'ইন্টারনেট ছাড়াই সব কাজ করে। লগইন না করলে কোনো তথ্য কোথাও পাঠানো হয় না।'}<br>কেস ডায়েরি v${APP_VERSION} · App built by Adv Abu Fahad Taukir</div>`;
  return {
    title: 'আরও', html,
    after() {
      $('#sRemind').addEventListener('change', async e => {
        db.settings.remind = e.target.checked; save();
        if (e.target.checked) await ensureNotifyPermission(true);
      });
      $('#sEvening').addEventListener('change', e => { db.settings.evening = e.target.value || '20:00'; save(); });
      $('#sMorning').addEventListener('change', e => { db.settings.morning = e.target.value || '07:00'; save(); });
      if (cloudOn() && auth.profile.role === 'admin' && auth.members === null) loadMembers();
      refreshNotifyPanel();
    }
  };
}

/* ======================================================================
   ফর্ম: মামলা
   ====================================================================== */
function caseForm(id) {
  const old = id ? getCase(id) : null;
  const c = old || { type: 'দেওয়ানী', status: 'running', ourSide: 'p' };
  const hasHist = old && hearingsOf(id).length > 0;
  const body = `
    ${field('মামলা নং *', `<input name="caseNo" value="${esc(c.caseNo)}" placeholder="যেমন: পারিবারিক মামলা ১২/২০২৬">`)}
    <div class="two">
      ${field('মামলার ধরন', `<select name="type">${options(TYPES.map(x => [x, x]), c.type)}</select>`)}
      ${field('অবস্থা', `<select name="status">${options(Object.entries(STATUS), c.status)}</select>`)}
    </div>
    ${field('বিষয় / ধারা', `<input name="subject" value="${esc(c.subject)}" placeholder="যেমন: ভরণপোষণ, দেনমোহর, ৪০৬ ধারা">`)}
    <div class="field"><span>আদালত</span>
      <div class="combo"><input name="court" id="courtInput" autocomplete="off" value="${esc(c.court)}" placeholder="তালিকা থেকে বাছুন অথবা লিখুন">
        <button type="button" class="combo-btn" id="courtBtn" aria-label="আদালতের তালিকা">▾</button>
        <div class="combo-list" id="courtPick" hidden></div></div></div>

    <div class="formsec">পক্ষগণ</div>
    ${field('বাদী / আবেদনকারী', `<input name="plaintiff" value="${esc(c.plaintiff)}">`)}
    ${field('বিবাদী / প্রতিপক্ষ', `<input name="defendant" value="${esc(c.defendant)}">`)}
    <div class="field"><span>আমি কোন পক্ষে</span><div class="seg">
      <label><input type="radio" name="ourSide" value="p" ${c.ourSide !== 'd' ? 'checked' : ''}><span>বাদী / আবেদনকারী</span></label>
      <label><input type="radio" name="ourSide" value="d" ${c.ourSide === 'd' ? 'checked' : ''}><span>বিবাদী / প্রতিপক্ষ</span></label></div></div>
    ${field('আমাদের পক্ষের অ্যাডভোকেট', `<input name="ourAdvocate" list="advList" value="${esc(old ? c.ourAdvocate : mostCommon(db.cases.map(x => x.ourAdvocate)))}" placeholder="যেমন: আপনার নাম / জুনিয়রের নাম">`)}
    ${field('বিপক্ষের অ্যাডভোকেট', `<input name="oppAdvocate" list="advList" value="${esc(c.oppAdvocate)}" placeholder="বিপক্ষের উকিলের নাম">`)}
    <datalist id="advList">${uniq(db.cases.flatMap(x => [x.ourAdvocate, x.oppAdvocate]).filter(Boolean)).map(x => `<option value="${esc(x)}">`).join('')}</datalist>
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
    if (old && !db.cases.includes(old)) { toast('এই মামলাটি অন্য কেউ মুছে ফেলেছে'); await closeSheet(); render(); return; }
    let clientId = v.clientId || '', newClient = null;
    if (!clientId && (v.newClient || '').trim()) {
      newClient = { id: uid(), name: v.newClient.trim(), phone: (v.newPhone || '').trim(), address: '', notes: '' };
      db.clients.push(newClient); clientId = newClient.id;
    }
    const data = {
      caseNo, type: v.type, status: v.status, subject: (v.subject || '').trim(), court: (v.court || '').trim(),
      plaintiff: (v.plaintiff || '').trim(), defendant: (v.defendant || '').trim(), ourSide: v.ourSide, clientId,
      ourAdvocate: (v.ourAdvocate || '').trim(), oppAdvocate: (v.oppAdvocate || '').trim(),
      nextDate: v.nextDate || '', nextPurpose: (v.nextPurpose || '').trim(), notes: (v.notes || '').trim()
    };
    if (v.prevManual !== undefined) data.prevManual = v.prevManual || '';
    if (data.court && canManage() && !db.courts.some(x => x.name === data.court)) addCourts([data.court]);
    let target = old;
    if (old) Object.assign(old, data);
    else { target = { id: uid(), createdAt: Date.now(), ...data }; db.cases.push(target); }
    commit([...(newClient ? [P('clients', newClient)] : []), P('cases', target)]);
    await closeSheet();
    toast('মামলা সংরক্ষিত');
    if (old) render(); else location.hash = '#/case/' + target.id;
  });
  bindWeekendHint(f, 'nextDate');
  bindCourtCombo(f);
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
    if (!db.cases.includes(c)) { toast('এই মামলাটি অন্য কেউ মুছে ফেলেছে'); await closeSheet(); location.hash = '#/cases'; return; }
    const rec = {
      date: v.date, attended: v.attended !== '0', purpose: (v.purpose || '').trim(), order: (v.order || '').trim(),
      nextDate: v.nextDate || '', nextPurpose: (v.nextPurpose || '').trim()
    };
    let hr = old;
    if (old) Object.assign(old, rec);
    else { hr = { id: uid(), caseId, createdAt: Date.now(), ...rec }; db.hearings.push(hr); }
    const ops = [P('hearings', hr)];
    // সর্বশেষ রেকর্ড হলে মামলার পরবর্তী তারিখ হালনাগাদ হবে
    const latest = hearingsOf(caseId)[0];
    if (latest && latest.id === hr.id) {
      c.nextDate = rec.nextDate; c.nextPurpose = rec.nextPurpose;
      if (v.disposed) { c.status = 'disposed'; c.nextDate = ''; c.nextPurpose = ''; }
      else if (c.status === 'disposed') c.status = 'running';
      ops.push(P('cases', c));
    }
    commit(ops);
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
    const fee = { id: uid(), caseId, type: v.type, amount, date: v.date || today(), note: (v.note || '').trim() };
    db.fees.push(fee);
    commit([P('fees', fee)]); await closeSheet(); toast('হিসাব সংরক্ষিত'); render();
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
    let target = old;
    if (old) Object.assign(old, data); else { target = { id: uid(), ...data }; db.clients.push(target); }
    commit([P('clients', target)]); await closeSheet(); toast('মক্কেল সংরক্ষিত'); render();
  });
}

/* ======================================================================
   ব্যাকআপ / রিস্টোর
   ====================================================================== */
const plugin = n => window.Capacitor?.Plugins?.[n];
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

async function doBackup() {
  const json = JSON.stringify({ ...db, fees: isClerk() ? [] : db.fees, cloud: undefined }, null, 1), name = `case-diary-backup-${today()}.json`;
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
    if (cloudOn()) {
      // ক্লাউড মোডে এখনকার তথ্য মোছা হয় না; ব্যাকআপের তথ্য যোগ হয়
      const ok = await ask(`এই ব্যাকআপে ${bn(data.cases.length)}টি মামলা আছে।\nএগুলো ক্লাউডে যোগ হবে (এখনকার তথ্য থাকবে; একই মামলা আগে থাকলে ব্যাকআপের ভার্সন বসবে)। এগোবেন?`, 'যোগ করুন');
      if (!ok) return;
      const n = mergeIntoCloud(data);
      toast(`${bn(n)}টি রেকর্ড যোগ হয়েছে`);
      return;
    }
    const ok = await ask(`এই ব্যাকআপে ${bn(data.cases.length)}টি মামলা আছে।\nফেরালে এখনকার সব তথ্য মুছে এই ব্যাকআপের তথ্য বসবে। এগোবেন?`, 'ফেরান', true);
    if (!ok) return;
    const keepSkip = db.settings.skipLogin;
    db = normalize({ ...data, cloud: undefined }); db.settings.skipLogin = keepSkip;
    save(); render(); toast('তথ্য ফিরিয়ে আনা হয়েছে');
  } catch (err) { toast('এটি সঠিক ব্যাকআপ ফাইল নয়'); }
});

/* ======================================================================
   আদালত বাছাই (মামলার ফর্মে) ও আদালতের তালিকা
   ====================================================================== */
function bindCourtCombo(form) {
  const inp = form.querySelector('#courtInput'), btn = form.querySelector('#courtBtn'), box = form.querySelector('#courtPick');
  if (!inp) return;
  const used = {}; db.cases.forEach(c => { if (c.court) used[c.court] = (used[c.court] || 0) + 1; });
  const all = () => sortedCourts().map(c => c.name)
    .map((n, i) => ({ n, i, u: used[n] || 0 })).sort((a, b) => b.u - a.u || a.i - b.i).map(x => x.n);
  const draw = showAll => {
    const q = norm(inp.value.trim()), list = all();
    const exact = list.includes(inp.value.trim());
    const hit = (showAll || !q || exact) ? list : list.filter(n => norm(n).includes(q));
    box.innerHTML = hit.length
      ? hit.map(n => `<div class="opt${n === inp.value.trim() ? ' on' : ''}" data-court="${esc(n)}">${esc(n)}${used[n] ? `<small>${bn(used[n])}টি মামলা</small>` : ''}</div>`).join('')
      : `<div class="opt none">${list.length ? 'তালিকায় নেই — লিখে রাখলে সেভ করার সময় তালিকায় যোগ হবে' : 'আদালতের তালিকা এখনো খালি (আরও → আদালতের তালিকা)'}</div>`;
    box.hidden = false;
  };
  const hide = () => { box.hidden = true; };
  inp.addEventListener('focus', () => draw(false));
  inp.addEventListener('input', () => draw(false));
  btn.addEventListener('click', () => { if (box.hidden) { draw(true); } else hide(); });
  ['pointerdown', 'mousedown'].forEach(ev => box.addEventListener(ev, e => e.preventDefault()));   // ট্যাপে ফোকাস না হারাতে
  box.addEventListener('click', e => {
    const o = e.target.closest('[data-court]'); if (!o) return;
    inp.value = o.dataset.court; hide(); inp.blur();
  });
  inp.addEventListener('blur', () => setTimeout(hide, 120));
}

const courtUse = name => db.cases.filter(c => c.court === name && isActive(c)).length;
const courtQ = { q: '' };
function courtsListHTML() {
  const q = norm(courtQ.q.trim()), list = sortedCourts().filter(c => !q || norm(c.name).includes(q));
  if (!list.length) return '<div class="empty"><b>কিছু পাওয়া যায়নি</b></div>';
  return `<div class="card" style="padding:4px 14px">${list.map(c => `<div class="pay" style="align-items:center">
      <div class="grow">${esc(c.name)}${courtUse(c.name) ? ` <span class="chip soon">${bn(courtUse(c.name))}টি মামলা</span>` : ''}</div>
      ${canManage() ? `<button class="linkbtn red" data-action="del-court" data-id="${c.id}">মুছুন</button>` : ''}</div>`).join('')}</div>`;
}
function vCourts() {
  const html = `
    <div class="small muted" style="margin:0 4px 10px">মামলা যোগ করার সময় এই তালিকা থেকে আদালত বেছে নেওয়া যায়। কজ লিস্টেও আদালত এই ক্রমে সাজানো হয়।</div>
    ${canManage() ? `<div class="card">
      <label class="field"><span>নতুন আদালত যোগ করুন</span><input id="newCourt" placeholder="আদালতের নাম"></label>
      <button class="btn primary block" data-action="add-court">যোগ করুন</button>
      <details style="margin-top:12px"><summary class="small strong" style="cursor:pointer">একসাথে অনেকগুলো যোগ করুন</summary>
        <label class="field mt"><span>প্রতি লাইনে একটি আদালত</span><textarea id="bulkCourts" placeholder="সিভিল জজ আদালত, জামালপুর&#10;বিশেষ জজ আদালত, জামালপুর"></textarea></label>
        <button class="btn block" data-action="bulk-courts">সব যোগ করুন</button></details>
      <button class="linkbtn mt" data-action="restore-courts">জামালপুরের ডিফল্ট তালিকা থেকে বাদ পড়াগুলো ফেরান</button></div>` : ''}
    <input class="search" id="courtSearch" type="search" placeholder="আদালত খুঁজুন…" value="${esc(courtQ.q)}">
    <div class="section-title">মোট ${bn(db.courts.length)}টি আদালত</div>
    <div id="courtList">${courtsListHTML()}</div>`;
  return {
    title: 'আদালতের তালিকা', back: '#/more', html,
    after() { $('#courtSearch').addEventListener('input', e => { courtQ.q = e.target.value; $('#courtList').innerHTML = courtsListHTML(); }); }
  };
}

/* ======================================================================
   নোটিফিকেশন (শুধু অ্যান্ড্রয়েড অ্যাপে)
   ====================================================================== */
const CHANNEL = 'reminders', TEST_ID = 1999999999;
const lnPlugin = () => (isNative() ? plugin('LocalNotifications') : null);

async function exactAllowed() {                       // Android 12+: "Alarms & reminders" অনুমতি
  const ln = lnPlugin();
  try { if (!ln || !ln.checkExactNotificationSetting) return true; return (await ln.checkExactNotificationSetting()).exact_alarm === 'granted'; }
  catch (e) { return true; }
}
async function ensureNotifyPermission(interactive) {
  const ln = lnPlugin();
  if (!ln) { if (interactive) toast('নোটিফিকেশন শুধু অ্যান্ড্রয়েড অ্যাপে কাজ করবে'); return false; }
  try {
    let p = await ln.checkPermissions();
    if (p.display !== 'granted') p = await ln.requestPermissions();
    if (p.display === 'granted') {
      try { await ln.createChannel({ id: CHANNEL, name: 'মামলার তারিখ', description: 'মামলার তারিখের রিমাইন্ডার', importance: 4, visibility: 1, vibration: true }); } catch (e) { /* ignore */ }
      scheduleReminders();
      return true;
    }
    if (interactive) toast('অনুমতি পাওয়া যায়নি — ফোনের Settings → Apps → Case Diary → Notifications চালু করুন');
  } catch (e) { console.error(e); if (interactive) toast('নোটিফিকেশনের অনুমতি চাওয়া যায়নি'); }
  return false;
}

const at = (iso, hhmm) => { const [y, m, d] = parts(iso); const [hh, mm] = (hhmm || '08:00').split(':').map(Number); return new Date(y, m - 1, d, hh, mm || 0, 0); };
let schedTimer, schedChain = Promise.resolve();
function scheduleReminders() {                         // এক সময়ে একটিই চলবে, যাতে একটি আরেকটির সূচি মুছে না ফেলে
  clearTimeout(schedTimer);
  schedTimer = setTimeout(() => { schedChain = schedChain.then(doSchedule).catch(e => console.warn('reminder', e)); }, 600);
}
async function doSchedule() {
  const ln = lnPlugin(); if (!ln) return;
  const pending = await ln.getPending();
  const old = pending.notifications.filter(n => n.id !== TEST_ID);
  if (old.length) await ln.cancel({ notifications: old.map(n => ({ id: n.id })) });
  if (!db.settings.remind) return;
  const perm = await ln.checkPermissions();
  if (perm.display !== 'granted') return;
  const exact = await exactAllowed();                  // অনুমতি না থাকলে সেটিংস পর্দা না খুলে সাধারণ (কয়েক মিনিট দেরিতে বাজতে পারে) অ্যালার্ম
  try { await ln.createChannel({ id: CHANNEL, name: 'মামলার তারিখ', description: 'মামলার তারিখের রিমাইন্ডার', importance: 4, visibility: 1, vibration: true }); } catch (e) { /* ignore */ }

  const t = today(), now = Date.now();
  const byDate = {};
  for (const c of db.cases) if (isActive(c) && c.nextDate && c.nextDate >= t) (byDate[c.nextDate] ||= []).push(c);
  const dates = Object.keys(byDate).sort().slice(0, 40);
  const list = arr => arr.slice(0, 4).map(c => `• ${c.caseNo}${c.plaintiff || c.defendant ? ' — ' + (c.plaintiff || '…') + ' বনাম ' + (c.defendant || '…') : ''}`).join('\n') + (arr.length > 4 ? `\n…আরও ${bn(arr.length - 4)}টি` : '');
  const notifications = [];
  for (const d of dates) {
    const arr = byDate[d], n = Number(d.replace(/-/g, '')) * 10;
    const eve = at(addDays(d, -1), db.settings.evening), mor = at(d, db.settings.morning);
    if (eve.getTime() > now) notifications.push({ id: n + 1, title: `আগামীকাল ${bn(arr.length)}টি মামলার তারিখ`, body: list(arr), channelId: CHANNEL, isExactNotification: exact, schedule: { at: eve, allowWhileIdle: true } });
    if (mor.getTime() > now) notifications.push({ id: n + 2, title: `আজ ${bn(arr.length)}টি মামলার তারিখ`, body: list(arr), channelId: CHANNEL, isExactNotification: exact, schedule: { at: mor, allowWhileIdle: true } });
  }
  if (notifications.length) await ln.schedule({ notifications });
}

async function testNotify() {
  const ln = lnPlugin();
  if (!(await ensureNotifyPermission(true))) return;
  try {
    await ln.schedule({ notifications: [{ id: TEST_ID, title: 'কেস ডায়েরি', body: 'রিমাইন্ডার ঠিকভাবে কাজ করছে ✓', channelId: CHANNEL, isExactNotification: await exactAllowed(), schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] });
    toast('৫ সেকেন্ড পরে নোটিফিকেশন আসবে — অ্যাপ থেকে বেরিয়ে দেখুন');
  } catch (e) { console.warn(e); toast('নোটিফিকেশন পাঠানো যায়নি: ' + (e && e.message ? e.message : e)); }
}

async function notifyStatus() {
  const ln = lnPlugin(); if (!ln) return { native: false };
  const st = { native: true, perm: 'unknown', exact: 'unknown', pending: 0 };
  try { st.perm = (await ln.checkPermissions()).display; } catch (e) { /* ignore */ }
  try { st.exact = ln.checkExactNotificationSetting ? (await ln.checkExactNotificationSetting()).exact_alarm : 'granted'; } catch (e) { /* ignore */ }
  try { st.pending = (await ln.getPending()).notifications.filter(n => n.id !== TEST_ID).length; } catch (e) { /* ignore */ }
  return st;
}
function notifyPanelHTML(st) {
  if (!st) return '<div class="small muted">অবস্থা দেখা হচ্ছে…</div>';
  if (!st.native) return '<div class="small muted">নোটিফিকেশন শুধু ফোনের অ্যাপে কাজ করে।</div>';
  const row = (ok, label, fixBtn) => `<div class="setting"><div>${ok ? '✅' : '❌'} ${label}</div>${ok ? '' : fixBtn}</div>`;
  return row(st.perm === 'granted', 'নোটিফিকেশনের অনুমতি', '<button class="btn small" data-action="notify-perm">অনুমতি দিন</button>')
    + row(st.exact === 'granted', 'ঠিক সময়ে বাজার অনুমতি', '<button class="btn small" data-action="notify-exact">চালু করুন</button>')
    + `<div class="setting"><div>🔔 সূচিতে থাকা রিমাইন্ডার</div><b>${bn(st.pending)}টি</b></div>`
    + `<div class="hint" style="margin-top:8px">সব ✅ থাকার পরও না এলে ফোনের <b>Settings → Apps → Case Diary → Battery</b> এ গিয়ে <b>Unrestricted / No restrictions</b> দিন এবং <b>Autostart</b> (Xiaomi/Oppo/Vivo/Realme/Infinix) চালু করুন।</div>`;
}
async function refreshNotifyPanel() {
  const box = $('#notifyBox'); if (!box) return;
  const st = await notifyStatus();
  const b2 = $('#notifyBox'); if (b2) b2.innerHTML = notifyPanelHTML(st);
}

/* ======================================================================
   লগইন, চেম্বার ও সিঙ্ক
   ====================================================================== */
const AUTH_ERR = {
  'auth/invalid-credential': 'ইমেইল বা পাসওয়ার্ড ঠিক নয়',
  'auth/invalid-login-credentials': 'ইমেইল বা পাসওয়ার্ড ঠিক নয়',
  'auth/wrong-password': 'পাসওয়ার্ড ঠিক নয়',
  'auth/user-not-found': 'এই ইমেইলে কোনো অ্যাকাউন্ট নেই',
  'auth/invalid-email': 'ইমেইলটি ঠিকমতো লিখুন',
  'auth/missing-email': 'ইমেইল লিখুন',
  'auth/missing-password': 'পাসওয়ার্ড লিখুন',
  'auth/email-already-in-use': 'এই ইমেইলে অ্যাকাউন্ট আছে — "লগইন" ট্যাবে যান',
  'auth/weak-password': 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন',
  'auth/network-request-failed': 'ইন্টারনেট সংযোগ নেই',
  'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে, একটু পরে আবার চেষ্টা করুন',
  'auth/operation-not-allowed': 'Firebase-এ ইমেইল/পাসওয়ার্ড লগইন চালু করা হয়নি',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'firebase-config.js এর apiKey ঠিক নয়',
  'auth/invalid-api-key': 'firebase-config.js এর apiKey ঠিক নয়',
  'app/bad-code': 'এই কোডটি সঠিক নয়',
  'app/timeout': 'ইন্টারনেট ধীর বা নেই — আবার চেষ্টা করুন',
  'permission-denied': 'অনুমতি নেই (Firestore Rules ঠিকমতো Publish হয়েছে কিনা দেখুন)',
  'unavailable': 'ইন্টারনেট সংযোগ নেই'
};
function cloudErr(e) { const c = e && e.code; return AUTH_ERR[c] || c || String((e && e.message) || e); }

const SYNC_LABEL = { synced: '☁ সিঙ্ক ✓', pending: '☁ পাঠানো হচ্ছে…', offline: '☁ অফলাইন', error: '☁ ত্রুটি' };
const SYNC_TEXT = { synced: 'সব তথ্য সিঙ্ক হয়েছে ✓', pending: 'ক্লাউডে পাঠানো হচ্ছে…', offline: 'অফলাইন — ইন্টারনেট এলে নিজে সিঙ্ক হবে', error: 'সিঙ্কে সমস্যা হয়েছে' };
const syncChipHTML = () => cloudOn() ? `<span class="sync ${auth.status}" id="syncChip">${SYNC_LABEL[auth.status]}</span>` : '';
function setSync(s) {
  if (s !== 'error' && !navigator.onLine) s = 'offline';
  auth.status = s;
  const chip = $('#syncChip'); if (chip) { chip.className = 'sync ' + s; chip.textContent = SYNC_LABEL[s]; }
  const tx = $('#syncText'); if (tx) tx.textContent = SYNC_TEXT[s];
}
window.addEventListener('online', () => { if (cloudOn()) setSync('pending'); });
window.addEventListener('offline', () => { if (cloudOn()) setSync('offline'); });

/* ---------- গেট (লগইন / নতুন অ্যাকাউন্ট / চেম্বার সেটআপ) ---------- */
let gateMode = 'login';
function gateHTML(mode, msg) {
  const logo = '<img class="gate-logo" src="icon-192.png" alt=""><h1>কেস ডায়েরি</h1>';
  const notice = msg ? `<div class="gate-msg">${esc(msg)}</div>` : '';
  const skip = '<button class="linkbtn mt" data-action="gate-skip">লগইন ছাড়া শুধু এই ফোনে চালান</button>';
  if (mode === 'wait') {
    return `<div class="gate-card">${logo}${notice}<div class="small muted">সার্ভারের সাথে সংযোগ করা যায়নি। ইন্টারনেট চালু করে আবার চেষ্টা করুন।</div>
      <button class="btn primary block mt" data-action="gate-retry">আবার চেষ্টা করুন</button>${skip}</div>`;
  }
  if (mode === 'setup') {
    return `<div class="gate-card">${logo}<div class="gate-sub">লগইন: ${esc(auth.user ? auth.user.email : '')}</div>${notice}
      <form id="gateForm" novalidate>
        <div class="field"><span>আপনি কে?</span><div class="seg">
          <label><input type="radio" name="role" value="admin" checked><span>অ্যাডভোকেট (নতুন চেম্বার)</span></label>
          <label><input type="radio" name="role" value="clerk"><span>ক্লার্ক (কোড দিয়ে যোগ)</span></label></div></div>
        <label class="field" id="fAdmin"><span>চেম্বারের নাম</span><input name="chamberName" placeholder="যেমন: অ্যাডভোকেট ফাহাদের চেম্বার"></label>
        <label class="field" id="fClerk" hidden><span>অ্যাডভোকেটের দেওয়া কোড</span><input name="code" placeholder="৮ অক্ষরের কোড" autocapitalize="characters" autocomplete="off" style="letter-spacing:3px;text-transform:uppercase"></label>
        <label class="field"><span>আপনার নাম</span><input name="userName" placeholder="যেমন: ফাহাদ / রহিম (ক্লার্ক)"></label>
        <div class="gate-err" id="gateErr"></div>
        <button class="btn primary block" id="gateSubmit" data-label="এগিয়ে যান" type="submit">এগিয়ে যান</button>
      </form>
      <button class="linkbtn mt" data-action="gate-logout">অন্য অ্যাকাউন্টে লগইন করুন</button></div>`;
  }
  const reg = mode === 'register', label = reg ? 'অ্যাকাউন্ট খুলুন' : 'লগইন';
  return `<div class="gate-card">${logo}<div class="gate-sub">অ্যাডভোকেট ও ক্লার্কদের জন্য</div>
    <div class="gate-tabs"><button type="button" data-action="gate-mode" data-mode="login" class="${reg ? '' : 'on'}">লগইন</button>
      <button type="button" data-action="gate-mode" data-mode="register" class="${reg ? 'on' : ''}">নতুন অ্যাকাউন্ট</button></div>
    ${notice}
    <form id="gateForm" novalidate>
      <label class="field"><span>ইমেইল</span><input type="email" name="email" autocomplete="username" inputmode="email" autocapitalize="none" placeholder="name@example.com"></label>
      <label class="field"><span>পাসওয়ার্ড</span><input type="password" name="password" autocomplete="${reg ? 'new-password' : 'current-password'}" placeholder="কমপক্ষে ৬ অক্ষর"></label>
      ${reg ? '<label class="field"><span>পাসওয়ার্ড আবার দিন</span><input type="password" name="password2" autocomplete="new-password"></label>' : ''}
      <div class="gate-err" id="gateErr"></div>
      <button class="btn primary block" id="gateSubmit" data-label="${label}" type="submit">${label}</button>
    </form>
    ${reg ? '' : '<button type="button" class="btn block mt" data-action="gate-reset">🔑 পাসওয়ার্ড ভুলে গেছেন? রিসেট করুন</button><div class="small muted" style="text-align:center;margin-top:4px">উপরে ইমেইল লিখে চাপুন; লিংক না এলে Spam ফোল্ডার দেখুন</div>'}
    <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:10px">${skip}</div></div>`;
}
function showGate(mode, msg) {
  gateMode = mode;
  let m = msg || '';
  if (!m) { try { m = localStorage.getItem('caseDiary.gateMsg') || ''; } catch (e) { /* ignore */ } }   // গেট বন্ধ হলে তবেই মুছবে
  const g = $('#gate');
  g.innerHTML = gateHTML(mode, m) + '<div class="credit" style="margin-top:20px">App built by <b>Adv Abu Fahad Taukir</b></div>'; g.hidden = false; g.scrollTop = 0;
}
function hideGate() {
  const g = $('#gate'); g.hidden = true; g.innerHTML = '';
  try { localStorage.removeItem('caseDiary.gateMsg'); } catch (e) { /* ignore */ }
}
function gateBusy(b) { const btn = $('#gateSubmit'); if (!btn) return; btn.disabled = b; btn.textContent = b ? 'অপেক্ষা করুন…' : btn.dataset.label; }
function gateErr(t) { const el = $('#gateErr'); if (el) el.textContent = t || ''; }

document.addEventListener('change', e => {
  if (e.target.name === 'role' && e.target.closest('#gateForm')) {
    const clerk = e.target.value === 'clerk';
    $('#fAdmin').hidden = clerk; $('#fClerk').hidden = !clerk;
  }
});

document.addEventListener('submit', async e => {
  if (e.target.id !== 'gateForm') return;
  e.preventDefault();
  const v = Object.fromEntries(new FormData(e.target));
  gateErr('');
  try {
    if (gateMode === 'login' || gateMode === 'register') {
      const email = (v.email || '').trim(), pw = v.password || '';
      if (!email) return gateErr('ইমেইল লিখুন');
      if (!pw) return gateErr('পাসওয়ার্ড লিখুন');
      if (gateMode === 'register') {
        if (pw.length < 6) return gateErr('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন');
        if (pw !== v.password2) return gateErr('দুই জায়গার পাসওয়ার্ড মিলছে না');
      }
      gateBusy(true);
      if (gateMode === 'login') await Cloud.signIn(email, pw); else await Cloud.signUp(email, pw);
      return;                                  // বাকিটা onAuth দেখবে
    }
    if (gateMode === 'setup') {
      const userName = (v.userName || '').trim();
      if (!userName) return gateErr('আপনার নাম লিখুন');
      let p;
      if (v.role === 'clerk') {
        if (!(v.code || '').trim()) return gateErr('অ্যাডভোকেটের দেওয়া কোডটি লিখুন');
        gateBusy(true); p = await Cloud.joinChamber({ code: v.code, userName });
      } else {
        const chamberName = (v.chamberName || '').trim();
        if (!chamberName) return gateErr('চেম্বারের নাম লিখুন');
        gateBusy(true); p = await Cloud.createChamber({ chamberName, userName });
      }
      startCloud(p);
    }
  } catch (err) { console.warn(err); gateErr(cloudErr(err)); gateBusy(false); }
});

async function gateReset() {
  const email = ((document.querySelector('#gateForm [name=email]') || {}).value || '').trim();
  if (!email) return gateErr('উপরে ইমেইল লিখে তারপর চাপুন');
  try { await Cloud.resetPassword(email); gateErr(''); toast('পাসওয়ার্ড বদলানোর লিংক ' + email + ' ঠিকানায় পাঠানো হয়েছে (Spam-ও দেখুন)'); }
  catch (err) { gateErr(cloudErr(err)); }
}

/* ---------- ক্লাউড চালু / বন্ধ ---------- */
const legacyData = () => {
  try { const d = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); return d && DATA_COLLS.some(c => (d[c] || []).length) ? d : null; }
  catch (e) { return null; }
};
const legacyCount = () => { const d = legacyData(); return d ? (d.cases || []).length : 0; };
function stashLegacy() {
  if (!DATA_COLLS.some(c => db[c].length)) return;
  try { localStorage.setItem(LEGACY_KEY, JSON.stringify(Object.fromEntries(DATA_COLLS.map(c => [c, db[c]])))); } catch (e) { /* ignore */ }
}
function loadLegacyIfEmpty() {
  if (DATA_COLLS.some(c => db[c].length)) return;
  const d = legacyData(); if (!d) return;
  DATA_COLLS.forEach(c => { db[c] = d[c] || []; });
  try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* ignore */ }
  save();
}

function applyDoc(c, d) {                       // বিদ্যমান অবজেক্টটিই বদলায়, যাতে খোলা ফর্মের রেফারেন্স ঠিক থাকে
  const cur = db[c].find(x => x.id === d.id);
  if (cur) { for (const k of Object.keys(cur)) if (!(k in d)) delete cur[k]; Object.assign(cur, d); return cur; }
  db[c].push(d); return d;
}
function applyRemote(c, up, rem, meta) {
  if (c === 'fees' && isClerk()) return;
  let changed = false;
  if (meta && meta.reconcile) {
    const keep = new Set(meta.ids), n = db[c].length;
    db[c] = db[c].filter(x => keep.has(x.id));
    if (db[c].length !== n) changed = true;
  }
  for (const d of up) { applyDoc(c, d); changed = true; }
  for (const id of rem) { const i = db[c].findIndex(x => x.id === id); if (i >= 0) { db[c].splice(i, 1); changed = true; } }
  if (changed) scheduleRemoteRender();
  if (c === 'courts' && meta && meta.reconcile) setTimeout(seedCourts, 50);   // সার্ভারের তালিকা খালি হলে অ্যাডভোকেটের ফোন ডিফল্ট বসায়
}
let rrTimer;
function scheduleRemoteRender() { clearTimeout(rrTimer); rrTimer = setTimeout(() => { save(); softRender(); }, 80); }
function softRender() {
  const q = $('#q');
  if (q && document.activeElement === q) { $('#caseList').innerHTML = caseListHTML(); return; }
  render();
}

function startCloud(p) {
  const prof = { uid: auth.user.uid, email: auth.user.email, chamberId: p.chamberId, role: p.role, name: p.name || '', chamberName: p.chamberName || '', code: p.code || '' };
  if (auth.profile && auth.profile.chamberId === p.chamberId) {      // আগে থেকেই চলছে — শুধু তথ্য হালনাগাদ
    auth.profile = prof; db.cloud = prof; save(); hideGate(); render(); return;
  }
  if (auth.unsub) { auth.unsub(); auth.unsub = null; }
  const prev = db.cloud;
  if (!prev) stashLegacy();                                          // লগইনের আগের শুধু-ফোনের তথ্য আলাদা রাখা
  if (!prev || prev.chamberId !== prof.chamberId || prev.uid !== prof.uid) COLLS.forEach(c => { db[c] = []; });
  auth.profile = prof; auth.ready = false; auth.members = null; auth.legacyAsked = false;
  if (prof.role === 'clerk') db.fees = [];
  db.cloud = prof; db.settings.skipLogin = false; save();
  hideGate(); setSync(navigator.onLine ? 'synced' : 'offline');
  auth.unsub = Cloud.subscribe(prof.chamberId, {
    onDocs: applyRemote,
    onReady: () => { auth.ready = true; maybeOfferLegacy(); },
    onStatus: s => setSync(!navigator.onLine ? 'offline' : s.pending ? 'pending' : 'synced'),
    onError: onCloudError
  }, prof.role === 'clerk' ? COLLS.filter(c => c !== 'fees') : COLLS);
  render();
}

async function onCloudError(err) {
  console.warn('cloud', err);
  if (err && err.code === 'permission-denied' && auth.user) {
    try { const p = await Cloud.getProfile(auth.user.uid); if (!p || p.removed) handleRemoved(); else if (p.blocked) handleBlocked(); }
    catch (e) { /* অফলাইন — পরে দেখা হবে */ }
  }
}
async function handleRemoved() {
  try { localStorage.setItem('caseDiary.gateMsg', 'আপনাকে এই চেম্বার থেকে সরিয়ে দেওয়া হয়েছে। অ্যাডভোকেটের কাছ থেকে নতুন কোড নিয়ে আবার যোগ দিন।'); } catch (e) { /* ignore */ }
  await hardLogout();
}
async function handleBlocked() {
  try { localStorage.setItem('caseDiary.gateMsg', 'আপনার অ্যাকাউন্টটি বন্ধ (ব্লক) করা আছে। যোগাযোগ করুন: ' + ABOUT.mobile); } catch (e) { /* ignore */ }
  await hardLogout();
}
async function clearReminders() {
  const ln = plugin('LocalNotifications');
  if (!isNative() || !ln) return;
  try { const p = await ln.getPending(); if (p.notifications.length) await ln.cancel({ notifications: p.notifications.map(n => ({ id: n.id })) }); } catch (e) { /* ignore */ }
}
async function hardLogout() {
  if (auth.unsub) { auth.unsub(); auth.unsub = null; }
  auth.profile = null;
  try { await Cloud.signOut(); } catch (e) { /* ignore */ }
  const settings = db.settings;
  db = { ...EMPTY(), settings: { ...settings, skipLogin: false } };
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
  await clearReminders();
  location.reload();
}
async function doLogout() {
  const ok = await ask('লগআউট করলে এই ফোন থেকে মামলার তথ্য মুছে যাবে (ক্লাউডে তথ্য থাকবে, আবার লগইন করলেই ফিরে আসবে)।\nলগআউট করবেন?', 'লগআউট', true);
  if (!ok) return;
  toast('সিঙ্ক শেষ করা হচ্ছে…');
  try { await Promise.race([Cloud.flush(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))]); }
  catch (e) {
    const go = await ask('ইন্টারনেট নেই বা সিঙ্ক শেষ হয়নি — কিছু নতুন তথ্য ক্লাউডে যায়নি, লগআউট করলে সেগুলো হারাবে।\nতবুও লগআউট করবেন?', 'হ্যাঁ, লগআউট', true);
    if (!go) return;
  }
  await hardLogout();
}

/* ফোনে জমে থাকা (লগইনের আগের) তথ্য ক্লাউডে তোলা */
function mergeIntoCloud(src) {
  const ops = [];
  for (const c of COLLS) {
    if ((c === 'fees' && isClerk()) || (c === 'courts' && !canManage())) continue;
    for (const d of (src[c] || [])) { if (d && d.id) ops.push(P(c, applyDoc(c, { ...d }))); }
  }
  if (ops.length) commit(ops);
  return ops.length;
}
function maybeOfferLegacy() {
  if (auth.legacyAsked || !auth.ready || !cloudOn()) return;
  const n = legacyCount(); if (!n) return;
  auth.legacyAsked = true;
  ask(`এই ফোনে লগইনের আগের ${bn(n)}টি মামলার তথ্য আছে।\nএগুলো ক্লাউডে তুলে ${auth.profile.role === 'admin' ? 'ক্লার্কদের সাথে ' : ''}শেয়ার করবেন?`, 'হ্যাঁ, তুলুন').then(ok => { if (ok) uploadLegacy(); });
}
function uploadLegacy() {
  const d = legacyData(); if (!d) return;
  const n = mergeIntoCloud(d);
  try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* ignore */ }
  toast(`${bn(n)}টি রেকর্ড ক্লাউডে তোলা হচ্ছে`); render();
}

/* ---------- শুরুতে লগইনের অবস্থা দেখা ---------- */
function initCloud() {
  if (!Cloud.configured) return;
  const cached = db.cloud;
  Cloud.onAuth(async user => {
    auth.user = user;
    if (!user) {
      if (auth.profile) { if (auth.unsub) auth.unsub(); auth.unsub = null; auth.profile = null; }
      if (db.settings.skipLogin) { seedCourts(); render(); return; }
      showGate('login'); return;
    }
    if (cached && cached.uid === user.uid && !auth.profile) startCloud(cached);   // অফলাইনেও সাথে সাথে খুলবে
    try {
      const p = await Cloud.getProfile(user.uid);
      if (!p) { if (!auth.profile) showGate('setup'); return; }
      if (p.removed) { handleRemoved(); return; }
      if (p.blocked) { handleBlocked(); return; }
      startCloud(p);
    } catch (e) {
      console.warn('profile', e);
      if (!auth.profile) showGate('wait', cloudErr(e));
    }
  });
}

/* ---------- "আরও" পাতার অ্যাকাউন্ট অংশ ---------- */
function membersHTML() {
  if (!auth.members) return '<div class="small muted">লোড হচ্ছে…</div>';
  if (!auth.members.length) return '<div class="small muted">কোনো সদস্য নেই</div>';
  return auth.members.map(m => `<div class="pay"><div><div>${esc(m.name || '—')} ${m.role === 'admin' ? '<span class="chip soon">অ্যাডভোকেট</span>' : ''}</div><div class="muted small">${esc(m.email || '')}</div></div>
    ${m.role !== 'admin' && m.uid !== auth.profile.uid ? `<button class="linkbtn red" data-action="del-member" data-uid="${esc(m.uid)}">সরান</button>` : ''}</div>`).join('');
}
async function loadMembers() {
  if (!cloudOn() || auth.profile.role !== 'admin') return;
  try { auth.members = await Cloud.members(auth.profile.chamberId); }
  catch (e) { auth.members = []; toast('সদস্যের তালিকা আনা যায়নি'); }
  const box = $('#membersBox'); if (box) box.innerHTML = membersHTML();
}
function accountHTML() {
  if (!Cloud.configured) return '';
  if (!cloudOn()) {
    return `<div class="section-title">অ্যাকাউন্ট</div><div class="card"><div class="small muted">লগইন করলে একই তথ্য একাধিক ফোনে (আপনার ও ক্লার্কদের) ব্যবহার করা যাবে।</div>
      <button class="btn primary block mt" data-action="open-gate">লগইন / নতুন অ্যাকাউন্ট</button></div>`;
  }
  const p = auth.profile, admin = p.role === 'admin', legacy = legacyCount();
  return `<div class="section-title">অ্যাকাউন্ট ও সিঙ্ক</div>
    <div class="card">
      <div class="row between"><div class="grow"><div class="strong">${esc(p.name)}</div><div class="small muted">${esc(p.email)}</div></div>
        <span class="chip ${admin ? 'soon' : ''}">${admin ? 'অ্যাডভোকেট' : 'ক্লার্ক'}</span></div>
      <div class="small mt">চেম্বার: <b>${esc(p.chamberName)}</b></div>
      <div class="small muted">অবস্থা: <span id="syncText">${SYNC_TEXT[auth.status]}</span></div>
      ${legacy ? `<div class="hint">এই ফোনে লগইনের আগের ${bn(legacy)}টি মামলা আছে যা ক্লাউডে নেই।</div><button class="btn small mt" data-action="upload-legacy">ক্লাউডে তুলুন</button>` : ''}
      <button class="btn block mt" data-action="my-reset">🔑 পাসওয়ার্ড বদলান (ইমেইলে লিংক যাবে)</button>
      <button class="btn danger block mt" data-action="logout">লগআউট</button>
    </div>
    ${isSuper() ? '<a class="card" href="#/admin" style="display:block;border:2px solid var(--accent)"><div class="row between"><div><div class="strong">🛠 অ্যাডমিন প্যানেল</div><div class="small muted">ব্যবহারকারী, পপআপ বার্তা, আপডেট নোটিশ</div></div><b>›</b></div></a>' : ''}
    ${admin ? `<div class="section-title">ক্লার্ক যোগ করুন</div><div class="card">
      <div class="small muted">ক্লার্ক একই অ্যাপ ইনস্টল করে "নতুন অ্যাকাউন্ট" খুলবে, তারপর "ক্লার্ক" বেছে এই কোডটি দেবে।</div>
      <div class="code mt" id="joinCode">${esc(p.code || '—')}</div>
      <div class="row mt"><button class="btn grow" data-action="copy-code">কোড কপি</button><button class="btn grow" data-action="share-code">পাঠান</button></div>
      <button class="btn small mt" data-action="new-code">নতুন কোড তৈরি</button>
      <div class="section-title" style="margin-left:0">সদস্য <button class="linkbtn" data-action="reload-members">রিফ্রেশ</button></div>
      <div id="membersBox">${membersHTML()}</div></div>` : ''}`;
}

/* ======================================================================
   রাউটার ও রেন্ডার
   ====================================================================== */
const route = () => { const [name, id] = (location.hash.replace(/^#\/?/, '') || 'today').split('/'); return { name, id }; };
let lastRoute = '';

function render() {
  const { name, id } = route();
  const views = { today: () => vToday(), cases: () => vCases(), case: () => vCase(id), clients: () => vClients(), client: () => vClient(id), fees: () => isClerk() ? vToday() : vFees(), more: () => vMore(), causelist: () => vCauseList(id), courts: () => vCourts(), faraiz: () => vFaraiz(), hindu: () => vHindu(), about: () => vAbout(), admin: () => isSuper() ? vAdmin() : vToday(), cs: () => vCS() };
  if (!views[name]) { location.replace('#/today'); return; }
  const r = views[name]();
  const bar = $('.appbar');
  bar.innerHTML = `<div class="left">${r.back ? `<button class="back" data-action="back" data-to="${r.back}" aria-label="পেছনে">‹</button>` : `<button class="back menu" data-action="menu" aria-label="মেনু">☰</button>`}<h1>${esc(r.title)}</h1></div><div>${r.actions || ''}${syncChipHTML()}</div>`;
  $('#view').innerHTML = r.html;
  const fab = $('#fab');
  if (r.fab) { fab.hidden = false; fab.dataset.action = r.fab.action; fab.setAttribute('aria-label', r.fab.label); } else fab.hidden = true;
  const tab = { case: 'cases', client: 'clients', causelist: 'today', courts: 'more', faraiz: 'more', hindu: 'more', about: 'more', admin: 'more', cs: 'more' }[name] || name;
  const feeTab = document.querySelector('#tabs a[data-tab=fees]'); if (feeTab) feeTab.hidden = isClerk();
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  const key = name + '/' + (id || '');
  if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
  if (r.after) r.after();
}


/* ======================================================================
   সুপার অ্যাডমিন প্যানেল + সবার জন্য পপআপ বার্তা / আপডেট নোটিশ
   ====================================================================== */
const SUPER_EMAIL = 'fahadtaukir@gmail.com';
const isSuper = () => !!(cloudOn() && auth.user && String(auth.user.email || '').toLowerCase() === SUPER_EMAIL);
const admin = { data: null, loading: false, err: '' };
const verCmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };
async function admLoad() {
  if (admin.loading) return; admin.loading = true; admin.err = '';
  try { admin.data = await Cloud.adminList(); } catch (e) { admin.err = cloudErr(e); admin.data = []; }
  admin.loading = false; if (route().name === 'admin') render();
}
async function admBlock(cid, uid, b) {
  if (!await ask(b ? 'এই ব্যবহারকারীকে ব্লক করবেন? সে আর অ্যাপে ঢুকতে বা তথ্য দেখতে পারবে না।' : 'ব্লক তুলে নেবেন?', b ? 'ব্লক করুন' : 'আনব্লক', b)) return;
  try { await Cloud.setBlocked(cid, uid, b); admin.data = null; render(); toast(b ? 'ব্লক করা হয়েছে' : 'আনব্লক হয়েছে'); } catch (e) { toast(cloudErr(e)); }
}
async function admDelete(cid, uid) {
  if (!await ask('এই ব্যবহারকারীকে চেম্বার থেকে সরাবেন?', 'সরান', true)) return;
  try { await Cloud.removeMember(cid, uid); admin.data = null; render(); toast('সরানো হয়েছে'); } catch (e) { toast(cloudErr(e)); }
}
async function admPublish(kind) {
  const v = n => ($('#' + n) || {}).value || '';
  let data;
  if (kind === 'announcement') {
    if (!v('annMsg').trim()) return toast('বার্তা লিখুন');
    data = { active: true, id: String(Date.now()), title: v('annTitle').trim(), message: v('annMsg').trim(), linkText: v('annLinkText').trim(), url: v('annUrl').trim() };
  } else {
    if (!/^\d+(\.\d+)*$/.test(v('updVer').trim())) return toast('ভার্সন লিখুন, যেমন 2.4');
    data = { active: true, version: v('updVer').trim(), message: v('updMsg').trim(), url: v('updUrl').trim(), force: !!($('#updForce') || {}).checked };
  }
  try { await Cloud.setConfig(kind, data); toast('প্রকাশিত হয়েছে — ব্যবহারকারীরা অ্যাপ খুললে দেখবে'); noticeCache = null; } catch (e) { toast(cloudErr(e)); }
}
async function admOff(kind) {
  try { await Cloud.setConfig(kind, { active: false }); toast('বন্ধ করা হয়েছে'); } catch (e) { toast(cloudErr(e)); }
}
function vAdmin() {
  if (!admin.data && !admin.loading) admLoad();
  const list = admin.data;
  const users = !list ? '<div class="small muted">লোড হচ্ছে…</div>' : admin.err ? `<div class="gate-err">${esc(admin.err)}</div>` : !list.length ? '<div class="small muted">কেউ নেই</div>' :
    list.map(ch => `<div class="card"><div class="strong">${esc(ch.name || 'চেম্বার')}</div><div class="small muted">কোড: ${esc(ch.code)} · সদস্য ${bn(ch.members.length)}</div>
      ${ch.members.map(m => `<div class="pay"><div><div>${esc(m.name || '—')} <span class="chip ${m.role === 'admin' ? 'soon' : ''}">${m.role === 'admin' ? 'অ্যাডভোকেট' : 'ক্লার্ক'}</span>${m.blocked ? ' <span class="chip late">ব্লক</span>' : ''}</div><div class="muted small">${esc(m.email || '')}</div></div>
        ${m.uid === auth.user.uid ? '' : `<div class="col-end"><button class="linkbtn ${m.blocked ? '' : 'red'}" data-action="adm-block" data-cid="${esc(ch.chamberId)}" data-uid="${esc(m.uid)}" data-b="${m.blocked ? 0 : 1}">${m.blocked ? 'আনব্লক' : 'ব্লক'}</button><button class="linkbtn red" data-action="adm-del" data-cid="${esc(ch.chamberId)}" data-uid="${esc(m.uid)}">সরান</button></div>`}</div>`).join('')}</div>`).join('');
  const html = `
    <div class="section-title">ব্যবহারকারী <button class="linkbtn" data-action="adm-refresh">রিফ্রেশ</button></div>${users}
    <div class="section-title">সবার অ্যাপে পপআপ বার্তা</div>
    <div class="card"><label class="field"><span>শিরোনাম</span><input id="annTitle" placeholder="যেমন: জরুরি নোটিশ"></label>
      <label class="field"><span>বার্তা</span><textarea id="annMsg" style="min-height:90px"></textarea></label>
      <div class="grid2"><label class="field"><span>বোতামের লেখা (ঐচ্ছিক)</span><input id="annLinkText" placeholder="বিস্তারিত দেখুন"></label>
      <label class="field"><span>লিংক (ঐচ্ছিক)</span><input id="annUrl" type="url" inputmode="url" placeholder="https://"></label></div>
      <div class="row"><button class="btn primary grow" data-action="adm-pub-ann">প্রকাশ করুন</button><button class="btn grow" data-action="adm-off-ann">বন্ধ করুন</button></div>
      <div class="small muted mt">প্রতিটি নতুন বার্তা প্রত্যেক ব্যবহারকারী একবার দেখবে।</div></div>
    <div class="section-title">অ্যাপ আপডেট নোটিশ</div>
    <div class="card"><div class="small muted">বর্তমান ভার্সন: <b>${APP_VERSION}</b>। নতুন APK বানানোর পর এখানে নতুন ভার্সন ও ডাউনলোড লিংক দিলে পুরনো ভার্সনের ব্যবহারকারীরা পপআপ পাবে।</div>
      <div class="grid2 mt"><label class="field"><span>নতুন ভার্সন</span><input id="updVer" placeholder="2.4" inputmode="decimal"></label>
      <label class="field"><span>ডাউনলোড লিংক</span><input id="updUrl" type="url" inputmode="url" placeholder="https://"></label></div>
      <label class="field"><span>কী নতুন (ঐচ্ছিক)</span><textarea id="updMsg" style="min-height:70px"></textarea></label>
      <label class="row" style="gap:8px;margin-bottom:12px"><input type="checkbox" id="updForce"><span class="small">বাধ্যতামূলক (বন্ধ করা যাবে না)</span></label>
      <div class="row"><button class="btn primary grow" data-action="adm-pub-upd">প্রকাশ করুন</button><button class="btn grow" data-action="adm-off-upd">বন্ধ করুন</button></div></div>`;
  return { title: 'অ্যাডমিন প্যানেল', html, back: '#/more' };
}

let noticeCache = null, noticeBusy = false;
function noticeShown(html) {
  let n = $('#notice');
  if (!n) { n = document.createElement('div'); n.id = 'notice'; n.className = 'dialog'; n.style.zIndex = 95; document.body.appendChild(n); }
  n.innerHTML = html; n.hidden = false;
}
function closeNotice() { const n = $('#notice'); if (n) { n.hidden = true; n.innerHTML = ''; } }
const seenKey = 'caseDiary.seenNotice';
const seen = () => { try { return JSON.parse(localStorage.getItem(seenKey) || '{}'); } catch (e) { return {}; } };
const markSeen = (k, v) => { try { const s = seen(); s[k] = v; localStorage.setItem(seenKey, JSON.stringify(s)); } catch (e) { /* ignore */ } };
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '';
async function checkNotices() {
  if (!Cloud.configured || noticeBusy) return; noticeBusy = true;
  try {
    let cfg;
    try { cfg = await Cloud.getConfig(); if (cfg.announcement !== undefined || cfg.update !== undefined) localStorage.setItem('caseDiary.notices', JSON.stringify(cfg)); } catch (e) { /* ignore */ }
    if (!cfg) { try { cfg = JSON.parse(localStorage.getItem('caseDiary.notices') || '{}'); } catch (e) { cfg = {}; } }
    const u = cfg.update, a = cfg.announcement, sn = seen();
    if (u && u.active && verCmp(u.version, APP_VERSION) > 0 && (u.force || sn.upd !== u.version)) {
      const link = safeUrl(u.url);
      noticeShown(`<div class="box"><h3 style="margin:0 0 8px">🔔 নতুন আপডেট এসেছে (v${esc(u.version)})</h3><p>${esc(u.message || 'অ্যাপের নতুন সংস্করণ পাওয়া যাচ্ছে।').replace(/\n/g, '<br>')}</p><div class="small muted">আপনার ভার্সন: ${APP_VERSION}</div>
        <div class="btns">${u.force ? '' : '<button class="btn" data-action="notice-ok">পরে</button>'}${link ? `<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener">ডাউনলোড</a>` : ''}</div></div>`);
      if (!u.force) markSeen('upd', u.version);
    } else if (a && a.active && a.message && sn.ann !== a.id) {
      const link = safeUrl(a.url);
      noticeShown(`<div class="box">${a.title ? `<h3 style="margin:0 0 8px">${esc(a.title)}</h3>` : ''}<p>${esc(a.message).replace(/\n/g, '<br>')}</p>
        <div class="btns"><button class="btn ${link ? '' : 'primary'}" data-action="notice-ok">ঠিক আছে</button>${link ? `<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener">${esc(a.linkText || 'বিস্তারিত')}</a>` : ''}</div></div>`);
      markSeen('ann', a.id);
    }
  } finally { noticeBusy = false; }
}


/* ======================================================================
   সিএস খতিয়ান অংশ হিসাব (আনা-গণ্ডা-কড়া-ক্রান্তি-তিল ↔ জমির পরিমাণ)
   ====================================================================== */
const cs = { total: { acre: '', bigha: '', katha: '', chhatak: '', dec: '' }, owners: [{ name: '', ana: '', gonda: '', kora: '', kranti: '', til: '' }], rev: { acre: '', bigha: '', katha: '', chhatak: '', dec: '' } };
const toShat = o => num(o.acre) * 100 + num(o.bigha) * 33 + num(o.katha) * 1.65 + num(o.chhatak) * 1.65 / 16 + num(o.dec);
const shareFrac = o => (num(o.ana) * 4800 + num(o.gonda) * 240 + num(o.kora) * 60 + num(o.kranti) * 20 + num(o.til)) / 76800;
const landInputsHTML = (pfx, o) => `<div class="grid3">${[['acre', 'একর'], ['dec', 'শতাংশ'], ['bigha', 'বিঘা'], ['katha', 'কাঠা'], ['chhatak', 'ছটাক']].map(([k, l]) => `<label class="field"><span>${l}</span><input data-cs="${pfx}.${k}" inputmode="decimal" value="${esc(o[k])}"></label>`).join('')}</div>`;
function landFull(sh) { return `<b>${landStr(sh)}</b><div class="small muted">${landStr2(sh)}</div>`; }
function csOwnersHTML() {
  return cs.owners.map((o, i) => `<div class="card"><div class="row between"><b>মালিক ${bn(i + 1)}</b>${cs.owners.length > 1 ? `<button class="linkbtn red" data-cs-del="${i}">বাদ</button>` : ''}</div>
    <label class="field"><span>নাম (ঐচ্ছিক)</span><input data-cs="o${i}.name" value="${esc(o.name)}"></label>
    <div class="grid5">${[['ana', 'আনা'], ['gonda', 'গণ্ডা'], ['kora', 'কড়া'], ['kranti', 'ক্রান্তি'], ['til', 'তিল']].map(([k, l]) => `<label class="field"><span>${l}</span><input data-cs="o${i}.${k}" inputmode="decimal" value="${esc(o[k])}"></label>`).join('')}</div>
    <div id="csR${i}" class="cs-res"></div></div>`).join('');
}
function csCalc() {
  const T = toShat(cs.total); let sum = 0;
  cs.owners.forEach((o, i) => {
    const f = shareFrac(o); sum += f;
    const el = $('#csR' + i); if (!el) return;
    el.innerHTML = f <= 0 ? '' : `<div class="small muted">অংশ: ${pct(f)}% (${window.Inherit.fracStr(window.Inherit.F(Math.round(f * 76800), 76800))})</div>` + (T > 0 ? `<div class="mt">${landFull(f * T)}</div>` : '<div class="small muted">উপরে মোট জমি লিখলে জমির পরিমাণ দেখাবে</div>');
  });
  const rest = Math.max(0, 1 - sum);
  $('#csSum').innerHTML = sum > 0 ? `<div class="card ${sum > 1.00001 ? 'note' : ''}"><div class="small muted">সব মালিকের মোট অংশ</div><div class="strong">${anaStr(Math.min(sum, 99))} (${pct(sum)}%)</div>
    ${sum > 1.00001 ? '<div class="small">⚠ মোট অংশ ১৬ আনার বেশি হয়ে গেছে — খতিয়ান আবার মিলিয়ে দেখুন।</div>' : rest > 0.00001 ? `<div class="small muted">বাকি অংশ: ${anaStr(rest)}${T > 0 ? ' = ' + landStr(rest * T) : ''}</div>` : '<div class="small" style="color:var(--ok)">✓ পুরো ১৬ আনা মিলেছে</div>'}</div>` : '';
  const R = toShat(cs.rev);
  $('#csRev').innerHTML = R > 0 && T > 0 ? (R > T ? '<div class="gate-err">মালিকের জমি মোট জমির চেয়ে বেশি হতে পারে না</div>' : `<div class="strong">${anaStr(R / T)}</div><div class="small muted">${pct(R / T)}% · ${window.Inherit.fracStr(window.Inherit.F(Math.round(R / T * 76800), 76800))}</div>`) : '<div class="small muted">মোট জমি ও মালিকের জমি লিখুন</div>';
}
function vCS() {
  const html = `<div class="card note"><div class="small">সিএস/এসএ খতিয়ানে মালিকের অংশ লেখা থাকে ১৬ আনার হিসাবে: ১৬ আনা = পূর্ণ, ১ আনা = ২০ গণ্ডা, ১ গণ্ডা = ৪ কড়া, ১ কড়া = ৩ ক্রান্তি, ১ ক্রান্তি = ২০ তিল।</div></div>
    <div class="section-title">১) দাগের মোট জমি</div><div class="card">${landInputsHTML('total', cs.total)}</div>
    <div class="section-title">২) খতিয়ানের অংশ → জমির পরিমাণ</div>
    <div id="csOwners">${csOwnersHTML()}</div>
    <button class="btn block" data-cs-add="1">＋ আরেকজন মালিক</button><div id="csSum" class="mt"></div>
    <div class="section-title">৩) জমি → খতিয়ানের অংশ</div>
    <div class="card"><div class="small muted">মালিকের জমির পরিমাণ লিখলে উপরের মোট জমির তুলনায় তার অংশ আনা-গণ্ডা-কড়া-ক্রান্তি-তিলে দেখাবে</div><div class="mt">${landInputsHTML('rev', cs.rev)}</div><div id="csRev"></div></div>
    <div class="small muted mt" style="text-align:center">ধরা হয়েছে: ১ একর = ১০০ শতাংশ, ১ বিঘা = ৩৩ শতাংশ, ১ কাঠা = ১.৬৫ শতাংশ। অঞ্চলভেদে বিঘা ভিন্ন হতে পারে।</div>`;
  return {
    title: 'সিএস খতিয়ান অংশ', html, back: '#/today',
    after() {
      csCalc();
      const v = $('#view');
      v.oninput = e => {
        const k = e.target.dataset.cs; if (!k) return;
        const [g, f] = k.split('.');
        if (g === 'total' || g === 'rev') cs[g][f] = e.target.value; else cs.owners[+g.slice(1)][f] = e.target.value;
        csCalc();
      };
      v.onclick = e => {
        if (e.target.dataset.csAdd) { cs.owners.push({ name: '', ana: '', gonda: '', kora: '', kranti: '', til: '' }); $('#csOwners').innerHTML = csOwnersHTML(); csCalc(); }
        else if (e.target.dataset.csDel !== undefined) { cs.owners.splice(+e.target.dataset.csDel, 1); $('#csOwners').innerHTML = csOwnersHTML(); csCalc(); }
      };
    }
  };
}
/* ======================================================================
   বাম পাশের মেনু, উত্তরাধিকার হিসাব (মুসলিম/হিন্দু), আমার পরিচয়
   ====================================================================== */
function openDrawer() {
  let d = $('#drawer');
  if (!d) { d = document.createElement('div'); d.id = 'drawer'; d.className = 'drawer'; document.body.appendChild(d); }
  const here = route().name;
  const item = (href, ico, t, sub = '') => `<a class="d-item ${here === href.slice(2) ? 'on' : ''}" href="${href}" data-action="close-drawer"><span class="d-ico">${ico}</span><span><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</span></a>`;
  d.innerHTML = `<div class="d-back" data-action="close-drawer"></div><aside class="d-panel">
    <div class="d-head"><div class="d-title">কেস ডায়েরি</div><div class="small">${esc(ABOUT.name)}</div></div>
    <div class="d-sec">উত্তরাধিকার হিসাব</div>
    ${item('#/faraiz', '☪', 'মুসলিম ফারায়েজ', 'হানাফী মত — ওয়ারিসদের অংশ')}
    ${item('#/hindu', 'ॐ', 'হিন্দু উত্তরাধিকার', 'দায়ভাগা — পুরুষের সম্পত্তি')}
    ${item('#/cs', '📜', 'সিএস খতিয়ান অংশ', 'আনা-গণ্ডা ↔ জমির পরিমাণ')}
    <div class="d-sec">অ্যাপ</div>
    ${item('#/today', '📅', 'আজ')}
    ${item('#/cases', '📁', 'মামলা')}
    ${item('#/clients', '👥', 'মক্কেল')}
    ${isClerk() ? '' : item('#/fees', '💰', 'ফি ও হিসাব')}
    ${item('#/courts', '🏛', 'আদালতের তালিকা')}
    ${item('#/more', '⚙', 'আরও (ব্যাকআপ, রিমাইন্ডার)')}
    ${item('#/about', 'ℹ', 'আমার পরিচয় (About)')}
    ${isSuper() ? item('#/admin', '🛠', 'অ্যাডমিন প্যানেল', 'ব্যবহারকারী · বার্তা · আপডেট') : ''}
  </aside>`;
  d.hidden = false; requestAnimationFrame(() => d.classList.add('open'));
}
function closeDrawer() { const d = $('#drawer'); if (!d) return; d.classList.remove('open'); setTimeout(() => { d.hidden = true; }, 180); }

/* ---- আমার পরিচয় (স্থির; কেউ বদলাতে পারে না) ---- */
const ABOUT = { name: 'অ্যাডভোকেট মোঃ আবু ফাহাদ তাউকির', en: 'Advocate Md. Abu Fahad Taukir', place: 'জামালপুর, বাংলাদেশ', mobile: '01999891729', email: 'fahadtaukir@gmail.com' };
const APP_VERSION = '2.3';
function aboutText() { return `${ABOUT.name}\n${ABOUT.en}\nমোবাইল: ${ABOUT.mobile}\nইমেইল: ${ABOUT.email}`; }
function vAbout() {
  const html = `<div class="card about">
      <div class="ab-av">⚖</div>
      <div class="ab-name">${esc(ABOUT.name)}</div>
      <div class="muted">${esc(ABOUT.en)}</div>
      <div class="ab-row"><span>কর্মক্ষেত্র</span><b>${esc(ABOUT.place)}</b></div>
      <div class="ab-row"><span>মোবাইল</span><a href="tel:${ABOUT.mobile}">${ABOUT.mobile}</a></div>
      <div class="ab-row"><span>ইমেইল</span><a href="mailto:${ABOUT.email}">${ABOUT.email}</a></div>
      <div class="row mt"><a class="btn primary grow" href="tel:${ABOUT.mobile}">কল করুন</a><a class="btn grow" href="mailto:${ABOUT.email}">ইমেইল</a></div>
      <button class="btn block mt" data-action="share-about">শেয়ার</button>
    </div>
    <div class="card"><div class="strong">কেস ডায়েরি v${APP_VERSION}</div><div class="small muted">App built by Adv Abu Fahad Taukir</div></div>`;
  return { title: 'আমার পরিচয়', html, back: '#/today' };
}

/* ---- উত্তরাধিকার ---- */
const inh = {
  mus: { sex: 'm', wives: 0, husband: 0, son: 0, dau: 0, ss: 0, sd: 0, father: 0, mother: 0, gf: 0, pgm: 0, mgm: 0, fb: 0, fs: 0, cb: 0, cs: 0, ub: 0, us: 0 },
  hin: { sons: 0, branches: [], widows: 0, daughters: 0, dsons: 0, father: 0, mother: 0, brothers: 0, bsons: 0, bgsons: 0, ssons: 0, pgf: 0, pgm: 0, uncles: 0, usons: 0 },
  est: { total: '', funeral: '', debts: '', will: '', acre: '', bigha: '', katha: '', chhatak: '', dec: '', lwill: '' }
};
const MUS_FIELDS = [
  ['son', 'পুত্র', 99], ['dau', 'কন্যা', 99], ['ss', 'পুত্রের পুত্র (নাতি)', 99], ['sd', 'পুত্রের কন্যা (নাতনি)', 99],
  ['father', 'পিতা', 1], ['mother', 'মাতা', 1], ['gf', 'দাদা (পিতার পিতা)', 1], ['pgm', 'দাদি (পিতার মা)', 1], ['mgm', 'নানি (মাতার মা)', 1],
  ['fb', 'সহোদর ভাই', 99], ['fs', 'সহোদর বোন', 99], ['cb', 'বৈমাত্রেয় ভাই (বাবা এক)', 99], ['cs', 'বৈমাত্রেয় বোন (বাবা এক)', 99],
  ['ub', 'বৈপিত্রেয় ভাই (মা এক)', 99], ['us', 'বৈপিত্রেয় বোন (মা এক)', 99]
];
const stepper = (grp, key, label, max, val) => `<div class="stp"><span>${label}</span><div class="stp-c"><button type="button" data-step="${grp}.${key}" data-d="-1" ${val <= 0 ? 'disabled' : ''}>−</button><b>${bn(val)}</b><button type="button" data-step="${grp}.${key}" data-d="1" ${val >= max ? 'disabled' : ''}>＋</button></div></div>`;
const num = v => Math.max(0, parseFloat(String(v).replace(/[,\s]/g, '').replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d))) || 0);
function estateHTML() {
  return `<div class="card"><div class="strong">💰 টাকা-পয়সা (ঐচ্ছিক)</div><div class="small muted">টাকা লিখলে প্রত্যেকের টাকার অংকও দেখাবে</div>
    <div class="grid2 mt">
      <label class="field"><span>মোট টাকা (৳)</span><input id="eTotal" inputmode="decimal" value="${esc(inh.est.total)}"></label>
      <label class="field"><span>দাফন/সৎকার খরচ</span><input id="eFuneral" inputmode="decimal" value="${esc(inh.est.funeral)}"></label>
      <label class="field"><span>ঋণ/দেনমোহর</span><input id="eDebts" inputmode="decimal" value="${esc(inh.est.debts)}"></label>
      <label class="field"><span>উইল/ওসিয়ত (টাকা)</span><input id="eWill" inputmode="decimal" value="${esc(inh.est.will)}"></label>
    </div></div>
    <div class="card"><div class="strong">🏞️ ভূমি / জমি (ঐচ্ছিক)</div><div class="small muted">যে এককে আছে সেটিতেই লিখুন (সব ঘর যোগ হবে)। ধরা হয়েছে: ১ একর = ১০০ শতাংশ, ১ বিঘা = ৩৩ শতাংশ, ১ কাঠা = ১.৬৫ শতাংশ (২০ কাঠা = ১ বিঘা), ১ ছটাক = ১/১৬ কাঠা। অঞ্চলভেদে বিঘা ভিন্ন হতে পারে।</div>
    <div class="grid2 mt">
      <label class="field"><span>একর</span><input id="eAcre" inputmode="decimal" value="${esc(inh.est.acre)}"></label>
      <label class="field"><span>শতাংশ</span><input id="eDec" inputmode="decimal" value="${esc(inh.est.dec)}"></label>
      <label class="field"><span>বিঘা</span><input id="eBigha" inputmode="decimal" value="${esc(inh.est.bigha)}"></label>
      <label class="field"><span>কাঠা</span><input id="eKatha" inputmode="decimal" value="${esc(inh.est.katha)}"></label>
      <label class="field"><span>ছটাক</span><input id="eChhatak" inputmode="decimal" value="${esc(inh.est.chhatak)}"></label>
    </div>
    <label class="field"><span>উইল/ওসিয়তকৃত জমি (শতাংশ, ঐচ্ছিক)</span><input id="eLWill" inputmode="decimal" value="${esc(inh.est.lwill)}"></label>
    <div class="small muted">মুসলিম আইনে ওসিয়ত সর্বোচ্চ ঋণ-খরচ বাদে সম্পত্তির ১/৩ পর্যন্ত কার্যকর (ওয়ারিসদের সম্মতি ছাড়া)।</div></div>`;
}
function estateNet(muslim) {
  const t = num(inh.est.total), fu = num(inh.est.funeral), de = num(inh.est.debts); let wi = num(inh.est.will);
  const after = Math.max(0, t - fu - de);
  if (muslim) wi = Math.min(wi, after / 3);
  const land = num(inh.est.acre) * 100 + num(inh.est.bigha) * 33 + num(inh.est.katha) * 1.65 + num(inh.est.chhatak) * 1.65 / 16 + num(inh.est.dec); let lw = num(inh.est.lwill);
  if (muslim) lw = Math.min(lw, land / 3);
  return { total: t, funeral: fu, debts: de, will: wi, net: Math.max(0, after - wi), land, lwill: lw, landNet: Math.max(0, land - lw) };
}
// শতাংশ → "২ একর ৩৫.৫ শতাংশ"
function landStr(sh) {
  sh = Math.round(sh * 100) / 100;
  const ac = Math.floor(sh / 100 + 1e-9), r = Math.round((sh - ac * 100) * 100) / 100;
  const rs = bn(String(r));
  return (ac ? bn(ac) + ' একর ' : '') + (r || !ac ? rs + ' শতাংশ' : '').trim();
}
// বিঘা-কাঠা-ছটাক (১ বিঘা=৩৩ শতাংশ, ১ কাঠা=১.৬৫ শতাংশ) ও বর্গফুট
function landStr2(sh) {
  const ch = Math.round(sh / (1.65 / 16)); const bi = Math.floor(ch / 320), ka = Math.floor((ch % 320) / 16), c = ch % 16;
  const p = [bi && bn(bi) + ' বিঘা', ka && bn(ka) + ' কাঠা', c && bn(c) + ' ছটাক'].filter(Boolean);
  return (p.join(' ') || '০') + ` (≈ ${bn(Math.round(sh * 435.6).toLocaleString('en-US'))} বর্গফুট)`;
}
// সিএস অংশ: ১৬ আনা = পূর্ণ; ১ আনা = ২০ গণ্ডা; ১ গণ্ডা = ৪ কড়া; ১ কড়া = ৩ ক্রান্তি; ১ ক্রান্তি = ২০ তিল
function anaStr(v) {
  let t = Math.round(v * 76800); if (t <= 0) return '০';
  const U = [['আনা', 4800], ['গণ্ডা', 240], ['কড়া', 60], ['ক্রান্তি', 20], ['তিল', 1]], p = [];
  for (const [n, k] of U) { const q = Math.floor(t / k); t -= q * k; if (q) p.push(bn(q) + ' ' + n); }
  return p.join(' ');
}
const pct = v => bn((v * 100).toFixed(2).replace(/\.?0+$/, ''));
function resultHTML(res, muslim, title) {
  const e = estateNet(muslim), has = e.total > 0, hasL = e.land > 0, I = window.Inherit;
  const rows = res.rows.map(r => {
    const v = I.val(r.total), each = I.val(r.each);
    return `<div class="rs-row"><div class="rs-top"><div><b>${esc(r.label)}</b>${r.count > 1 ? ` <span class="muted">(${bn(r.count)} জন)</span>` : ''}</div><div class="rs-frac">${I.fracStr(r.total)}</div></div>
      <div class="small muted">${esc(r.why || '')}</div>
      <div class="rs-bar"><i style="width:${Math.min(100, v * 100)}%"></i></div>
      <div class="small">${pct(v)}%${has ? ` · 💰 <b>${money(Math.round(v * e.net))}</b>` : ''}${hasL ? ` · 🏞️ <b>${landStr(v * e.landNet)}</b>` : ''}</div>
      ${hasL ? `<div class="small muted">${landStr2(v * e.landNet)}</div>` : ''}
      ${r.count > 1 ? `<div class="small muted">প্রত্যেকে ${I.fracStr(r.each)} (${pct(each)}%)${has ? ' · ' + money(Math.round(each * e.net)) : ''}${hasL ? ' · ' + landStr(each * e.landNet) : ''}</div>` : ''}</div>`;
  }).join('');
  let text = `${title}\n`;
  if (hasL) text += `মোট জমি: ${landStr(e.land)}${e.lwill ? `, ওসিয়ত: ${landStr(e.lwill)}` : ''}\nবণ্টনযোগ্য জমি: ${landStr(e.landNet)}\n`;
  if (has) text += `মোট টাকা: ${money(e.total)}${e.funeral ? `, খরচ: ${money(e.funeral)}` : ''}${e.debts ? `, ঋণ: ${money(e.debts)}` : ''}${e.will ? `, উইল: ${money(Math.round(e.will))}` : ''}\nবণ্টনযোগ্য: ${money(Math.round(e.net))}\n`;
  text += '\n' + res.rows.map(r => `• ${r.label}${r.count > 1 ? ` (${bn(r.count)} জন)` : ''}: ${I.fracStr(r.total)} (${pct(I.val(r.total))}%)${has ? ' = ' + money(Math.round(I.val(r.total) * e.net)) : ''}${hasL ? ' | জমি ' + landStr(I.val(r.total) * e.landNet) + ' = ' + landStr2(I.val(r.total) * e.landNet).replace(/ \(.*$/, '') : ''}${r.count > 1 ? `; প্রত্যেকে ${I.fracStr(r.each)}${has ? ' = ' + money(Math.round(I.val(r.each) * e.net)) : ''}${hasL ? ' | জমি ' + landStr(I.val(r.each) * e.landNet) : ''}` : ''}`).join('\n');
  if (res.notes.length) text += '\n\nমন্তব্য:\n' + res.notes.map(n => '- ' + n).join('\n');
  text += '\n\n(সহায়ক হিসাব; চূড়ান্ত সিদ্ধান্তের আগে আইনগত যাচাই করুন) — কেস ডায়েরি';
  return (res.rows.length ? `${has ? `<div class="card"><div class="small muted">বণ্টনযোগ্য টাকা</div><div class="amt-big">${money(Math.round(e.net))}</div>${e.will ? `<div class="small muted">ওসিয়ত ${money(Math.round(e.will))} আগেই বাদ</div>` : ''}</div>` : ''}${hasL ? `<div class="card"><div class="small muted">বণ্টনযোগ্য জমি</div><div class="amt-big">${landStr(e.landNet)}</div>${e.lwill ? `<div class="small muted">ওসিয়ত ${landStr(e.lwill)} আগেই বাদ</div>` : ''}</div>` : ''}<div class="card">${rows}</div>` : '<div class="empty"><b>ওয়ারিস বাছুন</b>উপরে থেকে যাদের আছে তাদের সংখ্যা দিন।</div>')
    + (res.notes.length ? `<div class="card note">${res.notes.map(n => `<div class="small">• ${esc(n)}</div>`).join('')}</div>` : '')
    + (res.rows.length ? `<textarea id="inhText" hidden>${esc(text)}</textarea><button class="btn primary block" data-action="share-inherit" data-title="${esc(title)}">ফলাফল শেয়ার করুন</button>` : '');
}
const DISCLAIMER = '<div class="small muted mt" style="text-align:center">সহায়ক হিসাব মাত্র। জটিল ক্ষেত্রে (দূরবর্তী ওয়ারিস, মৃত ওয়ারিসের সন্তান ইত্যাদি) আইনগত যাচাই করুন।</div>';
function musFormHTML() {
  const m = inh.mus, spouse = m.sex === 'm' ? stepper('mus', 'wives', 'স্ত্রী (সংখ্যা)', 4, m.wives) : stepper('mus', 'husband', 'স্বামী', 1, m.husband);
  return `<div class="seg2"><button data-sex="m" class="${m.sex === 'm' ? 'on' : ''}">মৃত ব্যক্তি পুরুষ</button><button data-sex="f" class="${m.sex === 'f' ? 'on' : ''}">মৃত ব্যক্তি মহিলা</button></div>
    <div class="card">${spouse}${MUS_FIELDS.map(([k, l, mx]) => stepper('mus', k, l, mx, m[k])).join('')}</div>`;
}
const HIN_FIELDS = [   // [key, নাম, সর্বোচ্চ] — ক্রম দায়ভাগার অগ্রাধিকার অনুযায়ী
  ['widows', '৪) স্ত্রী / বিধবা', 9], ['daughters', '৫) কন্যা', 99], ['dsons', '৬) কন্যার পুত্র', 99], ['father', '৭) পিতা', 1], ['mother', '৮) মাতা', 1],
  ['brothers', '৯) ভাই', 99], ['bsons', '১০) ভাইয়ের পুত্র', 99], ['bgsons', '১১) ভাইয়ের পুত্রের পুত্র', 99], ['ssons', '১২) বোনের পুত্র', 99],
  ['pgf', '১৩) পিতামহ (দাদা)', 1], ['pgm', '১৪) পিতামহী (দাদি)', 1], ['uncles', '১৫) পিতৃব্য (কাকা/চাচা)', 99], ['usons', '১৬) পিতৃব্যের পুত্র (চাচাতো ভাই)', 99]
];
function hinFormHTML() {
  const h = inh.hin;
  const br = h.branches.map((x, i) => `<div class="branch"><div class="small strong">মৃত পুত্রের শাখা ${bn(i + 1)}</div>
    ${stepper('br.' + i, 'gs', '২) পুত্রের পুত্র', 99, x.gs)}${stepper('br.' + i, 'ggs', '৩) পুত্রের পুত্রের পুত্র', 99, x.ggs)}</div>`).join('');
  return `<div class="card">
    ${stepper('hin', 'sons', '১) পুত্র (জীবিত)', 99, h.sons)}
    ${br || '<div class="small muted" style="padding:8px 0;border-bottom:1px solid var(--line)">২) পুত্রের পুত্র · ৩) পুত্রের পুত্রের পুত্র — কোনো পুত্র মারা গেলে নিচের বোতামে চেপে তার শাখা যোগ করুন</div>'}
    <div class="row mt"><button class="btn small grow" data-step="br.add" type="button">＋ মৃত পুত্রের শাখা (২-৩ নং)</button>${h.branches.length ? '<button class="btn small" data-step="br.del" type="button">− শেষটি বাদ</button>' : ''}</div>
    <div class="small muted">যে পুত্র মারা গেছেন তার জীবিত পুত্র (২) অথবা, তারাও না থাকলে তাদের পুত্র (৩) এখানে দিন। প্রতি শাখা একজন পুত্রের সমান অংশ পায়।</div>
    ${HIN_FIELDS.map(([k, l, mx]) => stepper('hin', k, l, mx, h[k])).join('')}</div>`;
}
function inheritView(kind) {
  const muslim = kind === 'mus', title = muslim ? 'মুসলিম ফারায়েজ' : 'হিন্দু উত্তরাধিকার';
  const intro = muslim ? 'হানাফী মত (বাংলাদেশে প্রযোজ্য)। যে ওয়ারিসরা জীবিত আছেন শুধু তাদের সংখ্যা দিন।' : 'দায়ভাগা মত (বাংলাদেশ); মৃত পুরুষের সম্পত্তি। হিন্দু নারীর সম্পত্তির অধিকার আইন ১৯৩৭ ধরা হয়েছে। মৃত নারীর স্ত্রীধন এই হিসাবে নেই।';
  const html = `<div class="card note"><div class="small">${intro}</div></div><div id="inhForm">${muslim ? musFormHTML() : hinFormHTML()}</div>${estateHTML()}<div id="inhRes"></div>${DISCLAIMER}`;
  const draw = () => {
    const res = muslim ? Inherit.muslim(inh.mus) : Inherit.hindu(inh.hin);
    const t = muslim ? 'মুসলিম ফারায়েজ হিসাব' : 'হিন্দু উত্তরাধিকার হিসাব';
    $('#inhRes').innerHTML = resultHTML(res, muslim, t);
  };
  return {
    title, html, back: '#/today',
    after() {
      draw();
      const form = $('#inhForm');
      form.onclick = e => {
        const sx = e.target.closest('[data-sex]');
        if (sx) { inh.mus.sex = sx.dataset.sex; if (sx.dataset.sex === 'm') inh.mus.husband = 0; else inh.mus.wives = 0; form.innerHTML = musFormHTML(); draw(); return; }
        const b = e.target.closest('[data-step]'); if (!b) return;
        const sp = b.dataset.step.split('.'), grp = sp[0], key = sp[1], d = +b.dataset.d || 0;
        if (grp === 'br' && sp.length === 3) { const x = inh.hin.branches[+key]; x[sp[2]] = Math.max(0, Math.min(99, x[sp[2]] + d)); form.innerHTML = hinFormHTML(); draw(); return; }
        if (grp === 'br') {
          const L = inh.hin.branches;
          if (key === 'add') L.push({ gs: 1, ggs: 0 }); else if (key === 'del') L.pop();
          form.innerHTML = hinFormHTML(); draw(); return;
        }
        const o = grp === 'mus' ? inh.mus : inh.hin;
        const mx = muslim ? (MUS_FIELDS.find(f => f[0] === key) || [0, 0, key === 'wives' ? 4 : 1])[2] : (key === 'sons' ? 99 : (HIN_FIELDS.find(f => f[0] === key) || [0, 0, 99])[2]);
        o[key] = Math.max(0, Math.min(mx, (o[key] || 0) + d));
        form.innerHTML = muslim ? musFormHTML() : hinFormHTML(); draw();
      };
      [['eTotal', 'total'], ['eFuneral', 'funeral'], ['eDebts', 'debts'], ['eWill', 'will'], ['eAcre', 'acre'], ['eBigha', 'bigha'], ['eKatha', 'katha'], ['eChhatak', 'chhatak'], ['eDec', 'dec'], ['eLWill', 'lwill']].forEach(([id, k]) => $('#' + id).addEventListener('input', e => { inh.est[k] = e.target.value; draw(); }));
    }
  };
}
const vFaraiz = () => inheritView('mus');
const vHindu = () => inheritView('hin');

window.addEventListener('hashchange', render);

/* ======================================================================
   ক্লিক হ্যান্ডলার
   ====================================================================== */
document.addEventListener('click', async e => {
  const go = e.target.closest('[data-goto]');
  if (go) { location.hash = go.dataset.goto; return; }
  const el = e.target.closest('[data-action]'); if (!el) return;
  const a = el.dataset.action, id = el.dataset.id, cid = el.dataset.case;
  switch (a) {
    case 'back': if (history.length > 1) history.back(); else location.hash = el.dataset.to || '#/today'; break;
    case 'close-sheet': closeSheet(); break;
    case 'menu': openDrawer(); break;
    case 'close-drawer': closeDrawer(); break;
    case 'my-reset': try { await Cloud.resetPassword(auth.user.email); toast('লিংক পাঠানো হয়েছে: ' + auth.user.email); } catch (err) { toast(cloudErr(err)); } break;
    case 'adm-refresh': admin.data = null; render(); break;
    case 'adm-block': admBlock(el.dataset.cid, el.dataset.uid, el.dataset.b === '1'); break;
    case 'adm-del': admDelete(el.dataset.cid, el.dataset.uid); break;
    case 'adm-pub-ann': admPublish('announcement'); break;
    case 'adm-off-ann': admOff('announcement'); break;
    case 'adm-pub-upd': admPublish('update'); break;
    case 'adm-off-upd': admOff('update'); break;
    case 'notice-ok': closeNotice(); break;
    case 'share-about': shareText('আমার পরিচয়', aboutText()); break;
    case 'share-inherit': shareText(el.dataset.title, $('#inhText').value); break;
    case 'new-case': caseForm(); break;
    case 'edit-case': caseForm(id); break;
    case 'new-client': clientForm(); break;
    case 'edit-client': clientForm(id); break;
    case 'hearing': hearingForm(cid, id); break;
    case 'fee': feeForm(cid); break;
    case 'gate-mode': showGate(el.dataset.mode); break;
    case 'gate-reset': gateReset(); break;
    case 'gate-skip': db.settings.skipLogin = true; save(); loadLegacyIfEmpty(); seedCourts(); hideGate(); render(); break;
    case 'gate-retry': location.reload(); break;
    case 'gate-logout': hardLogout(); break;
    case 'open-gate': db.settings.skipLogin = false; save(); showGate('login'); break;
    case 'logout': doLogout(); break;
    case 'upload-legacy': uploadLegacy(); break;
    case 'reload-members': auth.members = null; render(); break;
    case 'copy-code':
      try { await navigator.clipboard.writeText(auth.profile.code); toast('কোড কপি হয়েছে'); } catch (err) { toast('কপি করা যায়নি — কোডটি দেখে লিখে দিন'); }
      break;
    case 'share-code':
      shareText('কেস ডায়েরি — চেম্বারে যোগ দিন', `কেস ডায়েরি অ্যাপে "নতুন অ্যাকাউন্ট" খুলে "ক্লার্ক" বেছে এই কোডটি দিন: ${auth.profile.code}`);
      break;
    case 'new-code':
      if (await ask('নতুন কোড তৈরি করলে পুরনো কোড আর কাজ করবে না। (যারা আগেই যোগ দিয়েছে তাদের কোনো সমস্যা হবে না।) এগোবেন?', 'তৈরি করুন')) {
        try {
          const code = await Cloud.newCode(auth.profile.chamberId, auth.profile.code);
          auth.profile.code = code; db.cloud = auth.profile; save(); render(); toast('নতুন কোড তৈরি হয়েছে');
        } catch (err) { toast('কোড বদলানো যায়নি: ' + cloudErr(err)); }
      } break;
    case 'del-member':
      if (await ask('এই ক্লার্ককে চেম্বার থেকে সরাবেন? সে আর কোনো তথ্য দেখতে পারবে না।', 'সরান', true)) {
        try {
          await Cloud.removeMember(auth.profile.chamberId, el.dataset.uid);
          const code = await Cloud.newCode(auth.profile.chamberId, auth.profile.code);   // সরানোর পর পুরনো কোড বন্ধ
          auth.profile.code = code; db.cloud = auth.profile; auth.members = null; save(); render();
          toast('সরানো হয়েছে; নিরাপত্তার জন্য নতুন কোড তৈরি হয়েছে');
        } catch (err) { toast('সরানো যায়নি: ' + cloudErr(err)); }
      } break;
    case 'cl-share': shareText('কজ লিস্ট', causeText(el.dataset.date)); break;
    case 'cl-pdf': causePDF(el.dataset.date); break;
    case 'backup': doBackup(); break;
    case 'restore': $('#restoreFile').click(); break;
    case 'test-notify': await testNotify(); refreshNotifyPanel(); break;
    case 'notify-perm': await ensureNotifyPermission(true); refreshNotifyPanel(); break;
    case 'notify-exact': {
      const ln = lnPlugin();
      try { if (ln && ln.changeExactNotificationSetting) await ln.changeExactNotificationSetting(); } catch (err) { toast('সেটিংস খোলা যায়নি'); }
      scheduleReminders(); refreshNotifyPanel(); break;
    }
    case 'add-court': {
      const inp = $('#newCourt'), n = addCourts([inp.value]);
      if (n) { inp.value = ''; toast('আদালত যোগ হয়েছে'); render(); } else toast(inp.value.trim() ? 'এই আদালত আগেই আছে' : 'আদালতের নাম লিখুন');
      break;
    }
    case 'bulk-courts': {
      const n = addCourts($('#bulkCourts').value.split('\n'));
      toast(n ? `${bn(n)}টি আদালত যোগ হয়েছে` : 'নতুন কিছু পাওয়া যায়নি'); if (n) render(); break;
    }
    case 'restore-courts': {
      const n = addCourts(window.DEFAULT_COURTS || []);
      toast(n ? `${bn(n)}টি আদালত ফেরানো হয়েছে` : 'ডিফল্ট সব আদালত তালিকায় আছে'); if (n) render(); break;
    }
    case 'del-court': {
      const c = db.courts.find(x => x.id === id); if (!c) break;
      const u = courtUse(c.name);
      if (await ask(`"${c.name}" তালিকা থেকে মুছবেন?${u ? `\n(${bn(u)}টি মামলায় এই আদালতের নাম থেকে যাবে, শুধু তালিকা থেকে সরবে)` : ''}`, 'মুছুন', true)) {
        db.courts = db.courts.filter(x => x.id !== id); commit([D('courts', id)]); render();
      } break;
    }
    case 'del-case':
      if (await ask('এই মামলা এবং এর সব তারিখের রেকর্ড ও ফি-র হিসাব মুছে যাবে। নিশ্চিত?', 'মুছুন', true)) {
        const ops = [D('cases', id), ...db.hearings.filter(h => h.caseId === id).map(h => D('hearings', h.id)), ...db.fees.filter(f => f.caseId === id).map(f => D('fees', f.id))];
        db.cases = db.cases.filter(c => c.id !== id); db.hearings = db.hearings.filter(h => h.caseId !== id); db.fees = db.fees.filter(f => f.caseId !== id);
        commit(ops); toast('মামলা মুছে ফেলা হয়েছে'); location.replace('#/cases'); render();
      } break;
    case 'del-hearing':
      if (await ask('এই তারিখের রেকর্ড মুছবেন?', 'মুছুন', true)) { db.hearings = db.hearings.filter(h => h.id !== id); commit([D('hearings', id)]); render(); }
      break;
    case 'del-fee':
      if (await ask('এই হিসাবের এন্ট্রি মুছবেন?', 'মুছুন', true)) { db.fees = db.fees.filter(f => f.id !== id); commit([D('fees', id)]); render(); }
      break;
    case 'del-client':
      if (await ask('মক্কেল মুছবেন? তার মামলাগুলো থাকবে, শুধু মক্কেলের সংযোগ সরে যাবে।', 'মুছুন', true)) {
        const ops = [D('clients', id)];
        db.clients = db.clients.filter(c => c.id !== id);
        db.cases.forEach(c => { if (c.clientId === id) { c.clientId = ''; ops.push(P('cases', c)); } });
        commit(ops); location.replace('#/clients'); render();
      } break;
  }
});

/* ======================================================================
   শুরু
   ====================================================================== */
if (!location.hash) location.replace('#/today');
render();
initCloud();
if (!Cloud.configured || db.settings.skipLogin) seedCourts();
if (isNative()) { if (db.settings.remind) ensureNotifyPermission(false).then(() => scheduleReminders()); }
if ('serviceWorker' in navigator && !isNative() && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
// তারিখ বদলে গেলে (অ্যাপ খোলা অবস্থায় রাত পেরোলে) স্ক্রিন হালনাগাদ
document.addEventListener('visibilitychange', () => { if (!document.hidden && !sheetOpen) { render(); checkNotices(); } });
setTimeout(checkNotices, 1200);
})();
