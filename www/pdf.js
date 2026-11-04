/* কজ লিস্ট থেকে PDF বানানোর কোড।
   বাংলা অক্ষর ঠিকমতো দেখানোর জন্য ফোনের নিজের ফন্ট দিয়ে canvas-এ লিখে, সেই ছবি PDF-এ বসানো হয়।
   কোনো ইন্টারনেট বা বাইরের লাইব্রেরি লাগে না। */
(function () {
  'use strict';
  const FONT = '"Noto Sans Bengali","Kalpurush","SolaimanLipi","Shonar Bangla","Lohit Bengali",system-ui,sans-serif';
  const W = 1240, H = 1754, M = 76, PAD = 22;            // A4, ~150dpi
  const BN = '০১২৩৪৫৬৭৮৯';
  const bn = v => String(v).replace(/\d/g, d => BN[+d]);

  function wrap(ctx, text, maxW) {
    const out = [];
    for (const para of String(text == null ? '' : text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const t = line ? line + ' ' + word : word;
        if (ctx.measureText(t).width <= maxW) { line = t; continue; }
        if (line) out.push(line);
        if (ctx.measureText(word).width > maxW) {
          let part = '';
          for (const ch of Array.from(word)) {
            if (ctx.measureText(part + ch).width > maxW) { out.push(part); part = ch; } else part += ch;
          }
          line = part;
        } else line = word;
      }
      out.push(line);
    }
    return out;
  }

  function b64ToBytes(b64) {
    const bin = atob(b64), a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }

  function makePDF(pages) {
    const enc = new TextEncoder(), chunks = [], offsets = [];
    let off = 0;
    const push = b => { chunks.push(b); off += b.length; };
    const str = s => push(enc.encode(s));
    const n = pages.length;
    str('%PDF-1.4\n');
    const begin = id => { offsets[id] = off; str(id + ' 0 obj\n'); };
    begin(1); str('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    begin(2);
    str('<< /Type /Pages /Count ' + n + ' /Kids [' + pages.map((_, i) => (3 + 3 * i) + ' 0 R').join(' ') + '] >>\nendobj\n');
    pages.forEach((p, i) => {
      const pg = 3 + 3 * i, ct = pg + 1, im = pg + 2;
      begin(pg);
      str('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>\nendobj\n');
      const content = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
      begin(ct); str('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n');
      begin(im);
      str('<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.bytes.length + ' >>\nstream\n');
      push(p.bytes); str('\nendstream\nendobj\n');
    });
    const total = 3 + 3 * n, xref = off;
    str('xref\n0 ' + total + '\n0000000000 65535 f \n');
    for (let id = 1; id < total; id++) str(String(offsets[id]).padStart(10, '0') + ' 00000 n \n');
    str('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    const outArr = new Uint8Array(off);
    let pos = 0;
    for (const c of chunks) { outArr.set(c, pos); pos += c.length; }
    return outArr;
  }

  /* data = { title, chamber, dateLine, countLine, groups:[{court, items:[{no, caseNo, type, parties, purpose, ourAdv, oppAdv, lastOrder}]}], footer } */
  async function build(data) {
    const canvases = [];
    let cv, ctx, y;

    const font = (size, weight) => { ctx.font = (weight || 400) + ' ' + size + 'px ' + FONT; };
    const text = (s, x, yy, size, weight, color, align) => {
      font(size, weight); ctx.fillStyle = color || '#1d2b32'; ctx.textAlign = align || 'left'; ctx.fillText(s, x, yy);
    };
    const lh = size => Math.round(size * 1.55);

    function newPage() {
      cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = 'top';
      canvases.push(cv);
      y = M;
      if (canvases.length > 1) {
        text(data.title + ' — ' + data.dateLine, M, y, 24, 600, '#66767d');
        y += 40;
        ctx.strokeStyle = '#d9d4c7'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
        y += 22;
      }
    }

    newPage();
    text(data.title, M, y, 56, 700, '#0f4c5c'); y += lh(56);
    if (data.chamber) { text(data.chamber, M, y, 28, 500, '#66767d'); y += lh(28); }
    text(data.dateLine, M, y, 36, 700, '#1d2b32'); y += lh(36);
    text(data.countLine, M, y, 28, 500, '#66767d'); y += lh(28) + 6;
    ctx.strokeStyle = '#0f4c5c'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
    y += 26;

    const innerW = W - 2 * M - 2 * PAD;
    const bottom = H - M - 50;

    if (!data.groups.length) {
      text('এই তারিখে কোনো মামলা নেই।', M, y + 20, 32, 500, '#66767d');
    }

    for (const g of data.groups) {
      // কোর্টের শিরোনাম (পরের কিছু অংশ সহ এক পাতায় রাখতে জায়গা দেখা)
      if (y + 140 > bottom) newPage();
      ctx.fillStyle = '#e3f0f4';
      ctx.fillRect(M, y, W - 2 * M, 52);
      font(28, 700);
      const gl = wrap(ctx, g.court || 'আদালত উল্লেখ নেই', W - 2 * M - 30)[0];
      text(gl, M + 16, y + 8, 28, 700, '#0f4c5c');
      y += 52 + 14;

      for (const it of g.items) {
        // উচ্চতা মাপা
        const rows = [];
        font(28, 400);
        rows.push({ t: wrap(ctx, it.parties, innerW), size: 28, w: 400, c: '#1d2b32' });
        if (it.purpose) { font(26, 400); rows.push({ t: wrap(ctx, 'ধাপ: ' + it.purpose, innerW), size: 26, w: 600, c: '#0f4c5c' }); }
        if (it.ourAdv) { font(26, 400); rows.push({ t: wrap(ctx, 'আমাদের অ্যাডভোকেট: ' + it.ourAdv, innerW), size: 26, w: 400, c: '#1d2b32' }); }
        if (it.oppAdv) { font(26, 400); rows.push({ t: wrap(ctx, 'বিপক্ষের অ্যাডভোকেট: ' + it.oppAdv, innerW), size: 26, w: 400, c: '#1d2b32' }); }
        if (it.lastOrder) {
          font(24, 400);
          let ls = wrap(ctx, 'পূর্ব আদেশ: ' + it.lastOrder, innerW);
          if (ls.length > 3) { ls = ls.slice(0, 3); ls[2] = ls[2].replace(/\s*\S*$/, '') + ' …'; }
          rows.push({ t: ls, size: 24, w: 400, c: '#66767d' });
        }
        let h = PAD + lh(30) + 4;
        for (const r of rows) h += lh(r.size) * r.t.length;
        h += 52 + PAD;                           // ফলাফলের জন্য ফাঁকা লাইন
        if (y + h > bottom) newPage();

        ctx.strokeStyle = '#b9b3a3'; ctx.lineWidth = 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(M, y, W - 2 * M, h, 12); else ctx.rect(M, y, W - 2 * M, h);
        ctx.stroke();

        let cy = y + PAD;
        text(it.no + '. ' + it.caseNo, M + PAD, cy, 30, 700, '#1d2b32');
        if (it.type) text(it.type, W - M - PAD, cy + 4, 24, 600, '#66767d', 'right');
        cy += lh(30) + 4;
        for (const r of rows) for (const ln of r.t) { text(ln, M + PAD, cy, r.size, r.w, r.c); cy += lh(r.size); }
        text('ফলাফল:', M + PAD, cy + 6, 24, 600, '#66767d');
        ctx.strokeStyle = '#c9c4b6'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(M + PAD + 120, cy + 40); ctx.lineTo(W - M - PAD, cy + 40); ctx.stroke();
        y += h + 16;
      }
      y += 6;
    }

    // ফুটার: পৃষ্ঠা নম্বর
    canvases.forEach((c, i) => {
      const cx = c.getContext('2d');
      cx.textBaseline = 'top';
      cx.font = '400 22px ' + FONT; cx.fillStyle = '#8a969b';
      cx.textAlign = 'left'; cx.fillText(data.footer || '', M, H - M + 8);
      cx.textAlign = 'right'; cx.fillText('পৃষ্ঠা ' + bn(i + 1) + ' / ' + bn(canvases.length), W - M, H - M + 8);
    });

    const pages = canvases.map(c => ({ w: c.width, h: c.height, bytes: b64ToBytes(c.toDataURL('image/jpeg', 0.92).split(',')[1]) }));
    return { bytes: makePDF(pages), pages: pages.length };
  }

  window.CausePDF = { build };
})();
