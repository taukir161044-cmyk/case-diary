/* উত্তরাধিকার হিসাব: মুসলিম (হানাফী ফারায়েজ) ও হিন্দু (দায়ভাগা)। বিশুদ্ধ গণিত, UI নেই। */
(function (root) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  const F = (n, d = 1) => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; return { n: n / g, d: d / g }; };
  const add = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d);
  const mul = (a, b) => F(a.n * b.n, a.d * b.d);
  const div = (a, b) => F(a.n * b.d, a.d * b.n);
  const ZERO = F(0), ONE = F(1);
  const gt = (a, b) => a.n * b.d > b.n * a.d;
  const isZero = a => a.n === 0;
  const val = a => a.n / a.d;

  /* ---------------- মুসলিম ---------------- */
  // h: {sex:'m'|'f', husband, wives, son, dau, ss, sd, father, mother, gf, pgm, mgm, fb, fs, cb, cs, ub, us}
  // ss/sd = ছেলের ছেলে/মেয়ে; gf = দাদা (পিতার পিতা); pgm = দাদি (পিতার মা); mgm = নানি (মাতার মা)
  // fb/fs = সহোদর ভাই/বোন; cb/cs = বৈমাত্রেয় (বাবা এক); ub/us = বৈপিত্রেয় (মা এক)
  function muslim(h) {
    const g = k => Math.max(0, Math.floor(+h[k] || 0));
    const husband = h.sex === 'f' ? Math.min(1, g('husband')) : 0, wives = h.sex === 'm' ? g('wives') : 0;
    const son = g('son'), dau = g('dau'), ss = g('ss'), sd = g('sd');
    const father = Math.min(1, g('father')), mother = Math.min(1, g('mother')), gf = Math.min(1, g('gf'));
    const pgm = Math.min(1, g('pgm')), mgm = Math.min(1, g('mgm'));
    const fb = g('fb'), fs = g('fs'), cb = g('cb'), cs = g('cs'), ub = g('ub'), us = g('us');
    const rows = [], notes = [];
    const hasDesc = son + dau + ss + sd > 0;
    const hasMaleDesc = son + ss > 0;
    const sibCount = fb + fs + cb + cs + ub + us;
    const R = (key, label, count, total, kind, why) => ({ key, label, count, total, kind, why });
    const fixed = [], resid = {};   // fixed: rows with total share; resid: group asaba

    const spouseShare = husband ? (hasDesc ? F(1, 4) : F(1, 2)) : wives ? (hasDesc ? F(1, 8) : F(1, 4)) : ZERO;
    if (husband) fixed.push(R('husband', 'স্বামী', 1, spouseShare, 'fixed', hasDesc ? 'সন্তান থাকায় ১/৪' : 'সন্তান না থাকায় ১/২'));
    if (wives) fixed.push(R('wives', wives > 1 ? 'স্ত্রীগণ' : 'স্ত্রী', wives, spouseShare, 'fixed', (hasDesc ? 'সন্তান থাকায় ১/৮' : 'সন্তান না থাকায় ১/৪') + (wives > 1 ? ' (সবাই সমান ভাগ)' : '')));

    // মাতা
    if (mother) {
      let sh, why;
      if (hasDesc) { sh = F(1, 6); why = 'সন্তান থাকায় ১/৬'; }
      else if (sibCount >= 2) { sh = F(1, 6); why = 'দুই বা ততোধিক ভাই-বোন থাকায় ১/৬'; }
      else if (father && (husband || wives)) { sh = mul(F(1, 3), sub(ONE, spouseShare)); why = 'স্বামী/স্ত্রী ও পিতা থাকায় স্বামী/স্ত্রীর অংশ বাদে বাকির ১/৩'; }
      else { sh = F(1, 3); why = 'সন্তান ও একাধিক ভাই-বোন না থাকায় ১/৩'; }
      fixed.push(R('mother', 'মাতা', 1, sh, 'fixed', why));
    }
    // দাদি/নানি
    const pgmOk = pgm && !father && !mother ? 1 : 0;
    const mgmOk = mgm && !mother ? 1 : 0;
    const gmN = pgmOk + mgmOk;
    if (gmN) {
      const each = F(1, 6 * gmN);
      if (pgmOk) fixed.push(R('pgm', 'দাদি (পিতার মা)', 1, each, 'fixed', gmN > 1 ? 'দুই দাদি/নানি মিলে ১/৬ সমান ভাগ' : '১/৬'));
      if (mgmOk) fixed.push(R('mgm', 'নানি (মাতার মা)', 1, each, 'fixed', gmN > 1 ? 'দুই দাদি/নানি মিলে ১/৬ সমান ভাগ' : '১/৬'));
    }
    if (pgm && !pgmOk) notes.push('দাদি পিতা/মাতার কারণে বঞ্চিত।');
    if (mgm && !mgmOk) notes.push('নানি মাতার কারণে বঞ্চিত।');

    // পিতা / দাদা
    const sire = father ? 'father' : (gf ? 'gf' : '');
    if (gf && father) notes.push('দাদা পিতার কারণে বঞ্চিত।');
    const sireLabel = father ? 'পিতা' : 'দাদা (পিতার পিতা)';
    let sireAsaba = false;
    if (sire) {
      if (hasMaleDesc) fixed.push(R(sire, sireLabel, 1, F(1, 6), 'fixed', 'পুত্র/পুত্রের পুত্র থাকায় ১/৬'));
      else if (hasDesc) { fixed.push(R(sire, sireLabel, 1, F(1, 6), 'fixed', 'শুধু কন্যা থাকায় ১/৬ ও পরে অবশিষ্ট (আসাবা)')); sireAsaba = true; }
      else sireAsaba = true;
    }

    // কন্যা
    const sonB = son > 0;
    if (dau && !sonB) fixed.push(R('dau', dau > 1 ? 'কন্যাগণ' : 'কন্যা', dau, dau === 1 ? F(1, 2) : F(2, 3), 'fixed', dau === 1 ? 'একমাত্র কন্যা ১/২' : 'দুই বা ততোধিক কন্যা মিলে ২/৩ (সমান ভাগ)'));
    // ছেলের সন্তান
    let ssLive = !sonB ? ss : 0, sdLive = 0;
    if (sd && !sonB) {
      if (ss > 0) sdLive = sd;
      else if (dau === 0) { sdLive = sd; fixed.push(R('sd', sd > 1 ? 'পুত্রের কন্যাগণ' : 'পুত্রের কন্যা', sd, sd === 1 ? F(1, 2) : F(2, 3), 'fixed', sd === 1 ? 'কন্যা না থাকায় ১/২' : 'কন্যা না থাকায় মিলে ২/৩')); }
      else if (dau === 1) { sdLive = sd; fixed.push(R('sd', sd > 1 ? 'পুত্রের কন্যাগণ' : 'পুত্রের কন্যা', sd, F(1, 6), 'fixed', 'একজন কন্যার সাথে ২/৩ পূর্ণ করতে ১/৬')); }
      else notes.push('পুত্রের কন্যা বঞ্চিত (দুই বা ততোধিক কন্যা ২/৩ পূর্ণ করেছে)।');
    }
    if ((ss || sd) && sonB) notes.push('পুত্র থাকায় পুত্রের সন্তানরা বঞ্চিত।');

    // সহোদর/বৈমাত্রেয়/বৈপিত্রেয়
    const sibBlocked = hasMaleDesc || !!sire;
    if (sibCount && sibBlocked) notes.push(hasMaleDesc ? 'পুত্র/পুত্রের পুত্র থাকায় ভাই-বোনরা (বৈপিত্রেয়সহ) বঞ্চিত।' : (father ? 'পিতা থাকায় ভাই-বোনরা বঞ্চিত।' : 'দাদা থাকায় ভাই-বোনরা বঞ্চিত (হানাফী মত)।'));
    const daughterLine = (dau > 0 && !sonB) || sdLive > 0 && ss === 0;   // কন্যা বা পুত্রের কন্যা আছে (পুত্র নেই)
    let fsAsabaWithDau = false, csAsabaWithDau = false;
    if (!sibBlocked) {
      // বৈপিত্রেয়: সন্তান থাকলে বঞ্চিত
      if (ub + us > 0) {
        if (hasDesc) notes.push('সন্তান থাকায় বৈপিত্রেয় ভাই-বোন বঞ্চিত।');
        else { const n = ub + us; fixed.push(R('u', 'বৈপিত্রেয় ভাই-বোন', n, n === 1 ? F(1, 6) : F(1, 3), 'fixed', n === 1 ? 'একজন হলে ১/৬' : 'একাধিক হলে মিলে ১/৩ (ছেলে-মেয়ে সমান)')); }
      }
      if (fb > 0) {
        resid.fullSib = { b: fb, s: fs };
        if (cb + cs > 0) notes.push('সহোদর ভাই থাকায় বৈমাত্রেয় ভাই-বোন বঞ্চিত।');
      } else if (fs > 0) {
        if (daughterLine) { fsAsabaWithDau = true; resid.fullSib = { b: 0, s: fs }; if (cb + cs > 0) notes.push('সহোদর বোন কন্যার সাথে আসাবা হওয়ায় বৈমাত্রেয় ভাই-বোন বঞ্চিত।'); }
        else {
          fixed.push(R('fs', fs > 1 ? 'সহোদর বোনগণ' : 'সহোদর বোন', fs, fs === 1 ? F(1, 2) : F(2, 3), 'fixed', fs === 1 ? 'একমাত্র সহোদর বোন ১/২' : 'দুই বা ততোধিক সহোদর বোন মিলে ২/৩'));
          if (cb + cs > 0) {
            if (cb > 0) resid.halfSib = { b: cb, s: cs };
            else if (fs === 1) fixed.push(R('cs', cs > 1 ? 'বৈমাত্রেয় বোনগণ' : 'বৈমাত্রেয় বোন', cs, F(1, 6), 'fixed', 'একজন সহোদর বোনের সাথে ২/৩ পূর্ণ করতে ১/৬'));
            else notes.push('দুই বা ততোধিক সহোদর বোন থাকায় বৈমাত্রেয় বোন বঞ্চিত।');
          }
        }
      } else if (cb + cs > 0) {
        if (cb > 0) resid.halfSib = { b: cb, s: cs };
        else if (daughterLine) { csAsabaWithDau = true; resid.halfSib = { b: 0, s: cs }; }
        else fixed.push(R('cs', cs > 1 ? 'বৈমাত্রেয় বোনগণ' : 'বৈমাত্রেয় বোন', cs, cs === 1 ? F(1, 2) : F(2, 3), 'fixed', cs === 1 ? 'একমাত্র বৈমাত্রেয় বোন ১/২' : 'দুই বা ততোধিক বৈমাত্রেয় বোন মিলে ২/৩'));
      }
    }

    // অবশিষ্ট (আসাবা) গ্রুপ — অগ্রাধিকার অনুযায়ী
    let holder = null;
    if (sonB) holder = { type: 'children', b: son, s: dau, bl: 'পুত্র', sl: 'কন্যা', bk: 'son', sk: 'dau', why: 'পুত্র-কন্যা একসাথে: ছেলে মেয়ের দ্বিগুণ' };
    else if (ssLive > 0) holder = { type: 'gchildren', b: ss, s: sdLive, bl: 'পুত্রের পুত্র', sl: 'পুত্রের কন্যা', bk: 'ss', sk: 'sd', why: 'অবশিষ্টাংশ: ছেলে মেয়ের দ্বিগুণ' };
    else if (sireAsaba) holder = { type: 'sire', key: sire, label: sireLabel, why: 'অবশিষ্টাংশ (আসাবা)' };
    else if (resid.fullSib) holder = { type: 'sib', b: resid.fullSib.b, s: resid.fullSib.s, bl: 'সহোদর ভাই', sl: 'সহোদর বোন', bk: 'fb', sk: 'fs', why: resid.fullSib.b ? 'অবশিষ্টাংশ: ভাই বোনের দ্বিগুণ' : 'কন্যার সাথে অবশিষ্টাংশ (আসাবা)' };
    else if (resid.halfSib) holder = { type: 'sib', b: resid.halfSib.b, s: resid.halfSib.s, bl: 'বৈমাত্রেয় ভাই', sl: 'বৈমাত্রেয় বোন', bk: 'cb', sk: 'cs', why: resid.halfSib.b ? 'অবশিষ্টাংশ: ভাই বোনের দ্বিগুণ' : 'কন্যার সাথে অবশিষ্টাংশ (আসাবা)' };

    let fixedSum = fixed.reduce((a, r) => add(a, r.total), ZERO);
    let awl = false, radd = false, raddToSpouse = false;
    const out = [];
    const addTo = (key, label, count, total, kind, why) => out.push({ key, label, count, total, kind, why });
    if (gt(fixedSum, ONE)) {
      awl = true;
      for (const r of fixed) addTo(r.key, r.label, r.count, div(r.total, fixedSum), 'awl', r.why + ' (আউল-এ কমে গেছে)');
      notes.push(`নির্ধারিত অংশের যোগফল ১-এর বেশি (${fracStr(fixedSum)}) হওয়ায় "আউল" প্রয়োগ হয়েছে: সবার অংশ আনুপাতিক হারে কমানো হয়েছে।`);
    } else {
      const rest = sub(ONE, fixedSum);
      for (const r of fixed) addTo(r.key, r.label, r.count, r.total, 'fixed', r.why);
      if (!isZero(rest)) {
        if (holder) {
          if (holder.type === 'sire') {
            const ex = out.find(o => o.key === holder.key);
            if (ex) { ex.total = add(ex.total, rest); ex.kind = 'both'; ex.why = 'নির্ধারিত ১/৬ ও অবশিষ্টাংশ (আসাবা)'; }
            else addTo(holder.key, holder.label, 1, rest, 'asaba', holder.why);
          } else {
            const units = holder.b * 2 + holder.s;
            const bT = holder.b ? mul(rest, F(holder.b * 2, units)) : ZERO, sT = holder.s ? mul(rest, F(holder.s, units)) : ZERO;
            if (holder.b) addTo(holder.bk, holder.bl, holder.b, bT, 'asaba', holder.why);
            if (holder.s) {
              if (holder.type === 'sib' && !holder.b) addTo(holder.sk, holder.sl, holder.s, sT, 'asaba', holder.why);
              else addTo(holder.sk, holder.sl, holder.s, sT, 'asaba', holder.why);
            }
          }
        } else {
          // রদ: স্বামী/স্ত্রী বাদে নির্ধারিত অংশীদারদের মধ্যে আনুপাতিক
          const non = out.filter(o => o.key !== 'husband' && o.key !== 'wives');
          if (non.length) {
            radd = true;
            const s = non.reduce((a, o) => add(a, o.total), ZERO);
            for (const o of non) { o.total = add(o.total, mul(rest, div(o.total, s))); o.kind = 'radd'; o.why += ' + রদ (অবশিষ্ট ফেরত)'; }
            notes.push('অবশিষ্টাংশ নেওয়ার মতো আসাবা না থাকায় স্বামী/স্ত্রী বাদে অন্য অংশীদাররা আনুপাতিক হারে "রদ" হিসেবে বাকিটা পেয়েছেন।');
          } else if (out.length) {
            raddToSpouse = true;
            for (const o of out) { o.total = ONE; o.kind = 'radd'; o.why += ' + অবশিষ্ট (অন্য ওয়ারিস না থাকায়)'; }
            notes.push('অন্য কোনো ওয়ারিস (যাবিল আরহাম/দূরবর্তী আত্মীয়) না থাকলে স্বামী/স্ত্রী অবশিষ্টাংশও পান। দূরবর্তী আত্মীয় (যেমন নাতি-নাতনি কন্যার ঘরের, মামা-খালা-ফুফু) থাকলে আইনজীবীর পরামর্শ নিন।');
          } else notes.push('কোনো ওয়ারিস পাওয়া যায়নি।');
        }
      }
    }
    // মাথাপিছু
    for (const o of out) o.each = o.count > 1 ? split(o) : o.total;
    return { rows: out, awl, radd, notes, total: out.reduce((a, o) => add(a, o.total), ZERO) };
  }
  // একই গ্রুপে ছেলে-মেয়ে মিশে থাকলে (বৈপিত্রেয় ছাড়া) সমান ভাগ ধরা হয়; আসাবা গ্রুপে ইতোমধ্যে আলাদা সারি আছে
  function split(o) {
    if (o.kind === 'asaba' && (o.key === 'son' || o.key === 'ss' || o.key === 'fb' || o.key === 'cb')) return div(o.total, F(o.count));
    return div(o.total, F(o.count));
  }

  /* ---------------- হিন্দু (দায়ভাগা; মৃত পুরুষের সম্পত্তি) ---------------- */
  // h: {sons, branches:[{gs,ggs}], widows, daughters, dsons, father, mother, brothers, bsons, bgsons, ssons, pgf, pgm, uncles, usons}
  // অগ্রাধিকার: (১) পুত্র/পৌত্র/প্রপৌত্র (সাথে বিধবা, ১৯৩৭ আইন) → বিধবা → কন্যা → কন্যার পুত্র → পিতা → মাতা → ভাই → ভাইয়ের পুত্র
  //   → ভাইয়ের পুত্রের পুত্র → বোনের পুত্র → পিতামহ → পিতামহী → পিতৃব্য → পিতৃব্যের পুত্র। প্রথম যে স্তরে কেউ আছে সেই স্তরই সব পায়।
  function hindu(h) {
    const g = k => Math.max(0, Math.floor(+h[k] || 0));
    const sons = g('sons'), widows = g('widows');
    const br = (h.branches || []).map(x => ({ gs: Math.max(0, Math.floor(+x.gs || 0)), ggs: Math.max(0, Math.floor(+x.ggs || 0)) })).filter(x => x.gs + x.ggs > 0);
    const out = [], notes = [];
    const push = (key, label, count, total, why) => out.push({ key, label, count, total, each: count > 1 ? div(total, F(count)) : total, why });
    const units = sons + br.length;
    if (units > 0) {
      const u = F(1, units + (widows ? 1 : 0));
      if (sons) push('sons', sons > 1 ? 'পুত্রগণ' : 'পুত্র', sons, mul(u, F(sons)), 'প্রত্যেক পুত্র সমান অংশ');
      br.forEach((x, i) => {
        if (x.gs) push('br' + i, `মৃত পুত্রের শাখা ${bnl(i + 1)}: পুত্রের পুত্র`, x.gs, u, 'মৃত পুত্রের অংশ তার পুত্ররা সমান ভাগে পায় (শাখা অনুযায়ী)');
        else push('br' + i, `মৃত পুত্রের শাখা ${bnl(i + 1)}: পুত্রের পুত্রের পুত্র`, x.ggs, u, 'পুত্র ও তার পুত্র না থাকায় প্রপৌত্ররা সেই শাখার অংশ সমান ভাগে পায়');
      });
      if (widows) push('widows', widows > 1 ? 'বিধবাগণ' : 'স্ত্রী / বিধবা', widows, u, 'হিন্দু নারীর সম্পত্তির অধিকার আইন ১৯৩৭: বিধবা একজন পুত্রের সমান অংশ পায় (একাধিক হলে ঐ অংশ সমান ভাগ)');
      if (g('daughters') + g('dsons') + g('father') + g('mother') + g('brothers') > 0) notes.push('পুত্র/পৌত্র/প্রপৌত্র থাকলে কন্যা, পিতা-মাতা, ভাই প্রমুখ দায়ভাগা অনুযায়ী উত্তরাধিকারী নন।');
      if (widows) notes.push('বিধবার অংশ সাধারণত জীবনস্বত্ব (limited estate); তার মৃত্যুর পর স্বামীর উত্তরাধিকারীদের কাছে ফেরে।');
      return { rows: out, notes, total: out.reduce((a, o) => add(a, o.total), ZERO) };
    }
    if (widows) {
      push('widows', widows > 1 ? 'বিধবাগণ' : 'স্ত্রী / বিধবা', widows, ONE, 'পুত্র/পৌত্র/প্রপৌত্র না থাকায় বিধবা পুরো সম্পত্তি পায় (একাধিক হলে সমান ভাগ)');
      notes.push('বিধবা জীবনস্বত্ব (limited estate) পান; তার মৃত্যুর পর কন্যা প্রভৃতি পরবর্তী উত্তরাধিকারীরা পায়।');
      return { rows: out, notes, total: ONE };
    }
    const TIERS = [
      ['daughters', 'কন্যা', 'কন্যাগণ', 'পুত্র-বিধবা না থাকায় কন্যারা সমান ভাগে পায়'],
      ['dsons', 'কন্যার পুত্র', 'কন্যার পুত্রগণ', 'কন্যা না থাকায় কন্যার পুত্ররা সমান ভাগে পায়'],
      ['father', 'পিতা', 'পিতা', 'উপরের কেউ না থাকায় পিতা'],
      ['mother', 'মাতা', 'মাতা', 'পিতা না থাকায় মাতা'],
      ['brothers', 'ভাই', 'ভাইগণ', 'উপরের কেউ না থাকায় ভাইয়েরা সমান ভাগে পায়'],
      ['bsons', 'ভাইয়ের পুত্র', 'ভাইয়ের পুত্রগণ', 'ভাই না থাকায় ভাইয়ের পুত্ররা'],
      ['bgsons', 'ভাইয়ের পুত্রের পুত্র', 'ভাইয়ের পুত্রের পুত্রগণ', 'ভাইয়ের পুত্র না থাকায়'],
      ['ssons', 'বোনের পুত্র', 'বোনের পুত্রগণ', 'উপরের কেউ না থাকায় বোনের পুত্ররা'],
      ['pgf', 'পিতামহ (দাদা)', 'পিতামহ (দাদা)', 'উপরের কেউ না থাকায় পিতামহ'],
      ['pgm', 'পিতামহী (দাদি)', 'পিতামহী (দাদি)', 'পিতামহ না থাকায় পিতামহী'],
      ['uncles', 'পিতৃব্য (কাকা/চাচা)', 'পিতৃব্যগণ (কাকা/চাচা)', 'উপরের কেউ না থাকায় পিতৃব্যরা সমান ভাগে'],
      ['usons', 'পিতৃব্যের পুত্র', 'পিতৃব্যের পুত্রগণ', 'পিতৃব্য না থাকায় তার পুত্ররা']
    ];
    for (const [k, one, many, why] of TIERS) {
      const n = g(k);
      if (n > 0) {
        push(k, n > 1 ? many : one, n, ONE, why);
        if (k === 'daughters') notes.push('দায়ভাগায় কন্যা উত্তরাধিকারী হতে সাধারণত শর্ত আছে: পুত্রসন্তান আছে বা হওয়ার সম্ভাবনা আছে (বিধবা/নিঃসন্তান/বন্ধ্যা কন্যা বাদ যেতে পারে)। এই শর্ত আলাদাভাবে যাচাই করুন।');
        if (['brothers', 'bsons', 'bgsons', 'ssons', 'uncles', 'usons'].includes(k)) notes.push('একই স্তরে সবাইকে মাথাপিছু সমান ধরা হয়েছে। মৃত ভাই/কাকার শাখা থাকলে শাখা অনুযায়ী ভাগ আলাদা যাচাই করুন।');
        const lower = TIERS.slice(TIERS.findIndex(t => t[0] === k) + 1).some(t => g(t[0]) > 0);
        if (lower) notes.push('নিচের স্তরের অন্য ওয়ারিসরা (যেমন দূরের আত্মীয়) এই স্তর থাকায় কিছু পাননি।');
        return { rows: out, notes, total: ONE };
      }
    }
    notes.push('ওয়ারিস বাছুন। এই তালিকার বাইরের আরও দূরের সপিণ্ড/সকুল্য/সমানোদক ইত্যাদির জন্য আইনজীবীর পরামর্শ নিন।');
    return { rows: out, notes, total: ZERO };
  }
  const bnl = v => String(v).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[+d]);
  const fracStr = f => (f.d === 1 ? bnl(f.n) : bnl(f.n) + '/' + bnl(f.d));

  root.Inherit = { muslim, hindu, F, fracStr, val, add, sub, mul, ZERO, ONE };
  if (typeof module !== 'undefined') module.exports = root.Inherit;
})(typeof window !== 'undefined' ? window : globalThis);
