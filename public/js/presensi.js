(function () {
  'use strict';
  const { api, CFG, SATKER, DEMO, validasiNama, pesanError, kodeError, PESAN, rapikanNama, getDeviceId, sidikPerangkat, waktu, isiQR, unduhBlob, toast } = window.App;
  const $ = (id) => document.getElementById(id);
  let DEVICE = null;
  let TIKET = null;

  // ---------- teks dari konfigurasi ----------
  const acara = CFG.NAMA_ACARA || 'Presensi Kegiatan';
  const org = CFG.PENYELENGGARA || 'BPS Provinsi Sulawesi Utara';
  const parts = acara.split(' ');
  $('judul').innerHTML = parts.length > 1
    ? `${window.App.esc(parts.slice(0, -1).join(' '))} <span>${window.App.esc(parts.at(-1))}</span>`
    : `<span>${window.App.esc(acara)}</span>`;
  $('penyelenggara').textContent = org;
  $('tAcara').textContent = acara;
  $('tOrg').textContent = org;
  $('th').textContent = new Date().getFullYear();
  document.title = `${acara} — ${org}`;
  $('demoBanner').hidden = !DEMO;

  const sel = $('satker');
  SATKER.forEach((s) => { const o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });

  function tampil(view) {
    ['viewForm', 'viewTiket', 'viewLoading'].forEach((v) => { $(v).hidden = v !== view; });
  }

  // ---------- validasi ----------
  function setErr(field, errId, msg) {
    $(field).classList.toggle('invalid', !!msg);
    $(errId).textContent = msg || '';
  }
  function cekNama(tampilkan) {
    const k = validasiNama($('nama').value);
    if (tampilkan) setErr('fNama', 'eNama', k ? PESAN[k] : '');
    return !k;
  }
  function kategoriTerpilih() { const r = document.querySelector('input[name="kategori"]:checked'); return r ? r.value : ''; }

  $('nama').addEventListener('blur', () => { if ($('nama').value.trim()) cekNama(true); });
  $('nama').addEventListener('input', () => { if ($('fNama').classList.contains('invalid')) cekNama(true); });
  document.querySelectorAll('input[name="kategori"]').forEach((r) => r.addEventListener('change', () => setErr('fKategori', 'eKategori', '')));
  sel.addEventListener('change', () => setErr('fSatker', 'eSatker', ''));

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('formAlert').hidden = true;
    const okNama = cekNama(true);
    const kat = kategoriTerpilih();
    const sat = sel.value;
    setErr('fKategori', 'eKategori', kat ? '' : PESAN.KATEGORI_KOSONG);
    setErr('fSatker', 'eSatker', sat ? '' : PESAN.SATKER_KOSONG);
    if (!okNama) { $('nama').focus(); return; }
    if (!kat || !sat) return;

    const namaRapi = rapikanNama($('nama').value);
    if (!confirm(`Pastikan data sudah benar:\n\nNama: ${namaRapi}\nKategori: ${kat}\nSatker: ${sat}\n\nPresensi tidak dapat diubah setelah dikirim.`)) return;

    const btn = $('kirim');
    btn.disabled = true;
    const isi = btn.innerHTML;
    btn.innerHTML = '<span class="spin"></span><span>Mengirim…</span>';
    try {
      const fp = await sidikPerangkat();
      const t = await api.daftar({ nama: $('nama').value, kategori: kat, satker: sat, device: DEVICE, fingerprint: fp });
      TIKET = t;
      renderTiket(t);
      toast('Presensi berhasil dicatat.', 'ok');
    } catch (err) {
      const k = kodeError(err);
      if (k === 'PERANGKAT_SUDAH_ABSEN') {
        const t = await api.tiketPerangkat(DEVICE).catch(() => null);
        if (t) { TIKET = t; renderTiket(t); toast(PESAN.PERANGKAT_SUDAH_ABSEN, 'warn'); return; }
      }
      if (k === 'NAMA_SUDAH_TERDAFTAR' || k === 'NAMA_TIDAK_LENGKAP' || k === 'NAMA_TIDAK_VALID') {
        setErr('fNama', 'eNama', PESAN[k]); $('nama').focus();
      } else {
        $('formAlert').textContent = pesanError(err);
        $('formAlert').hidden = false;
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = isi;
    }
  });

  // ---------- QR ----------
  function buatQR(teks) {
    const q = window.qrcode(0, 'M');
    q.addData(teks, 'Byte');
    q.make();
    return q;
  }
  function qrSvg(q) {
    const n = q.getModuleCount();
    const pad = 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + pad * 2} ${n + pad * 2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#061a33"/></svg>`;
  }

  function renderTiket(t) {
    $('qr').innerHTML = qrSvg(buatQR(isiQR(t)));
    $('tNama').textContent = t.nama;
    $('tSatker').textContent = 'BPS ' + t.satker;
    $('tKategori').textContent = t.kategori;
    $('tKode').innerHTML = String(t.kode).split('').map((d) => `<span>${d}</span>`).join('');
    $('tKode').setAttribute('aria-label', 'Kode undian ' + t.kode.split('').join(' '));
    $('tWaktu').textContent = 'Tercatat ' + waktu(t.created_at);
    tampil('viewTiket');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Unduh tiket sebagai PNG ----------
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function wrap(ctx, text, maxW) {
    const words = text.split(' '); const lines = []; let cur = '';
    words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }
  async function unduhTiket() {
    const t = TIKET; if (!t) return;
    try { await document.fonts.ready; } catch (e) { /* abaikan */ }
    const F = "'Plus Jakarta Sans', system-ui, sans-serif";
    const M = "'JetBrains Mono', ui-monospace, monospace";
    const W = 1000, H = 1380;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0b2d57'); g.addColorStop(1, '#061a33');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    for (let y = 20; y < H; y += 30) for (let x = 20; x < W; x += 30) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); }

    const X = 60, Y = 60, CW = W - 120, CH = H - 120;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
    rr(ctx, X, Y, CW, CH, 36); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();

    // kepala
    ctx.save(); rr(ctx, X, Y, CW, CH, 36); ctx.clip();
    const hg = ctx.createLinearGradient(X, Y, X + CW, Y + 230); hg.addColorStop(0, '#12407a'); hg.addColorStop(1, '#061a33');
    ctx.fillStyle = hg; ctx.fillRect(X, Y, CW, 230); ctx.restore();
    ['#2a7de1', '#2ead4a', '#f7931e'].forEach((c, i) => { rr(ctx, X + 50 + i * 38, Y + 52, 30, 10, 5); ctx.fillStyle = c; ctx.fill(); });
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `600 26px ${F}`; ctx.textBaseline = 'alphabetic';
    ctx.fillText(org, X + 50, Y + 110);
    ctx.fillStyle = '#fff'; ctx.font = `800 46px ${F}`;
    ctx.fillText(acara, X + 50, Y + 170, CW - 100);

    // perforasi
    ctx.fillStyle = '#061a33';
    [X, X + CW].forEach((cx) => { ctx.beginPath(); ctx.arc(cx, Y + 230, 26, 0, 7); ctx.fill(); });
    ctx.strokeStyle = '#d6dde8'; ctx.setLineDash([14, 12]); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(X + 44, Y + 230); ctx.lineTo(X + CW - 44, Y + 230); ctx.stroke(); ctx.setLineDash([]);

    // QR
    const q = buatQR(isiQR(t)); const n = q.getModuleCount();
    const qs = 440; const cell = Math.floor(qs / (n + 4)); const real = cell * (n + 4);
    const qx = Math.round((W - real) / 2), qy = Y + 290;
    rr(ctx, qx - 14, qy - 14, real + 28, real + 28, 22); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#061a33';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(qx + (c + 2) * cell, qy + (r + 2) * cell, cell, cell);

    // nama
    ctx.textAlign = 'center'; ctx.fillStyle = '#0d1b2e'; ctx.font = `800 50px ${F}`;
    let ny = qy + real + 100;
    const lines = wrap(ctx, t.nama, CW - 120).slice(0, 2);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, ny + i * 60));
    ny += (lines.length - 1) * 60;

    // chip satker & kategori
    ctx.font = `700 26px ${F}`;
    const c1 = 'BPS ' + t.satker, c2 = t.kategori;
    const w1 = ctx.measureText(c1).width + 44, w2 = ctx.measureText(c2).width + 44, gap = 14;
    let cx0 = W / 2 - (w1 + w2 + gap) / 2; const cy = ny + 36;
    [[c1, w1, '#e8f1fd', '#1450a0'], [c2, w2, '#e6f7ea', '#1b7a33']].forEach(([txt, w, bg, fg]) => {
      rr(ctx, cx0, cy, w, 52, 26); ctx.fillStyle = bg; ctx.fill();
      ctx.fillStyle = fg; ctx.fillText(txt, cx0 + w / 2, cy + 35); cx0 += w + gap;
    });

    // kode
    const ky = cy + 130;
    ctx.fillStyle = '#7a879a'; ctx.font = `800 22px ${F}`;
    ctx.fillText('K O D E   U N D I A N', W / 2, ky);
    const dw = 92, dh = 116, dg = 12, extra = 18;
    const tot = dw * 6 + dg * 5 + extra; let dx = (W - tot) / 2; const dy = ky + 26;
    ctx.font = `800 64px ${M}`;
    t.kode.split('').forEach((d, i) => {
      rr(ctx, dx, dy, dw, dh, 18); ctx.fillStyle = '#0b2d57'; ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(dx + 8, dy + dh - 6, dw - 16, 4);
      ctx.fillStyle = '#fff'; ctx.fillText(d, dx + dw / 2, dy + 82);
      dx += dw + dg + (i === 2 ? extra : 0);
    });

    ctx.fillStyle = '#7a879a'; ctx.font = `500 24px ${F}`;
    ctx.fillText('Tercatat ' + waktu(t.created_at), W / 2, Y + CH - 46);

    cv.toBlob((b) => {
      const slug = t.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      unduhBlob(b, `presensi-${t.kode}-${slug}.png`);
      toast('Barcode diunduh.', 'ok');
    }, 'image/png');
  }
  $('unduh').addEventListener('click', unduhTiket);

  // ---------- mulai ----------
  (async function init() {
    try {
      DEVICE = await getDeviceId();
      const t = await api.tiketPerangkat(DEVICE);
      if (t) { TIKET = t; renderTiket(t); return; }
    } catch (err) {
      console.error(err);
      if (kodeError(err) === 'JARINGAN') toast(PESAN.JARINGAN, 'err');
    }
    tampil('viewForm');
  })();
})();
