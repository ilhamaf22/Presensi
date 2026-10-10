(function () {
  'use strict';
  const { api, CFG, DEMO, pesanError, kodeError, PESAN, waktu, esc, unduhXlsx, toast } = window.App;
  const $ = (id) => document.getElementById(id);

  let DATA = [];          // semua presensi
  let SIBUK = false;
  let filter = 'all';

  document.querySelectorAll('.org-name').forEach((e) => { e.textContent = CFG.PENYELENGGARA || 'BPS Provinsi Sulawesi Utara'; });
  $('judulUndian').textContent = CFG.JUDUL_UNDIAN || 'Undian Doorprize';
  $('demoLoginHint').hidden = !DEMO;
  $('demoTools').hidden = !DEMO;

  function tampil(view) { $('viewLogin').hidden = view !== 'login'; $('viewStage').hidden = view !== 'stage'; }

  // ---------------- Login ----------------
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginAlert').hidden = true;
    const b = $('loginBtn'); b.disabled = true; b.textContent = 'Memeriksa…';
    try {
      const s = await api.login($('email').value.trim(), $('password').value);
      if (!s || s.bukanAdmin) { await api.logout(); throw new Error('BUKAN_ADMIN'); }
      await masuk();
    } catch (err) {
      $('loginAlert').textContent = pesanError(err); $('loginAlert').hidden = false;
    } finally { b.disabled = false; b.textContent = 'Masuk'; }
  });
  $('bKeluar').addEventListener('click', async () => { await api.logout(); location.reload(); });

  async function masuk() {
    tampil('stage');
    await muat();
    setInterval(() => { if (!SIBUK && $('reveal').hidden) muat(true); }, 15000);
  }

  // ---------------- Data ----------------
  async function muat(diam) {
    try {
      const [rows, riw] = await Promise.all([api.semuaPresensi(), api.riwayat()]);
      DATA = rows;
      renderStat(); renderSlips(); renderRiwayat(riw);
      if (!$('sheet').hidden) renderTabel();
    } catch (err) {
      if (!diam) toast(pesanError(err), 'err');
      if (kodeError(err) === 'BUKAN_ADMIN') { await api.logout(); tampil('login'); }
    }
  }
  const dalamUndian = () => DATA.filter((x) => x.dalam_undian);

  const TOMBOL = [['bAmbil', 1], ['bAmbil3', 3], ['bAmbil5', 5]];
  function renderStat() {
    const n = dalamUndian().length;
    $('sHadir').textContent = DATA.length;
    $('sPool').textContent = n;
    $('sKeluar').textContent = DATA.length - n;
    $('bowlCount').textContent = n;
    TOMBOL.forEach(([id, k]) => {
      const b = $(id); b.disabled = SIBUK || n === 0;
      b.querySelector('.draw-sub').textContent = n === 0 ? 'undian kosong' : (k === 1 ? 'tekan spasi' : `tombol ${k}`);
    });
  }

  // Kertas di dalam fishbowl (maks 70 agar tetap ringan)
  function acak(a, b) { return a + Math.random() * (b - a); }
  function renderSlips() {
    const box = $('slips');
    const target = Math.min(70, dalamUndian().length);
    while (box.children.length > target) box.lastElementChild.remove();
    while (box.children.length < target) {
      const s = document.createElement('i');
      s.className = 'slip c' + Math.floor(Math.random() * 4);
      // menumpuk di bagian bawah mangkuk
      const ang = acak(0, Math.PI * 2), rad = Math.sqrt(Math.random()) * 40;
      const x = 50 + Math.cos(ang) * rad, y = Math.min(88, 62 + Math.abs(Math.sin(ang)) * rad * .55 + acak(-12, 10));
      s.style.cssText = `--x:${x}%;--y:${y}%;--r:${acak(-80, 80)}deg;--d:${acak(1.8, 3.6)}s;--dl:${acak(-3, 0)}s`;
      box.appendChild(s);
    }
  }
  function acakGerak() {
    $('slips').querySelectorAll('.slip').forEach((s) => {
      s.style.setProperty('--mx1', acak(-140, 140) + 'px'); s.style.setProperty('--my1', acak(-170, 40) + 'px');
      s.style.setProperty('--mx2', acak(-140, 140) + 'px'); s.style.setProperty('--my2', acak(-150, 40) + 'px');
      s.style.setProperty('--sd', acak(.55, 1.1) + 's');
    });
  }

  function renderRiwayat(riw) {
    const ol = $('riwayat');
    if (!riw || !riw.length) { ol.innerHTML = '<li class="empty">Belum ada yang diundi.</li>'; return; }
    ol.innerHTML = riw.map((r) => {
      const p = r.presensi || {};
      return `<li class="${p.dalam_undian ? '' : 'removed'}" title="${esc(waktu(r.diambil_pada))}">
        <span class="k">${esc(p.kode)}</span><span class="n">${esc(p.nama)}</span><span class="s">BPS ${esc(p.satker)}</span></li>`;
    }).join('');
  }

  // ---------------- Undian ----------------
  const jeda = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IKON_HAPUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
  const IKON_OK = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';

  let HASIL = [];          // pemenang yang sedang tampil
  let MEMBUKA = false;     // sedang "Buka Semua"

  async function ambil(n) {
    n = n || 1;
    if (SIBUK || !dalamUndian().length) return;
    SIBUK = true; renderStat();
    const btn = $(TOMBOL.find((t) => t[1] === n)[0]); btn.classList.add('press');
    const bowl = $('bowl');
    acakGerak(); bowl.classList.add('mixing');
    try {
      const [hasil] = await Promise.all([api.ambilAcakN(n), jeda(reduceMotion ? 200 : 2200)]);
      bowl.classList.remove('mixing');
      if (!reduceMotion) await terbangkan(hasil.length);
      if (hasil.length < n) toast(`Peserta tersisa hanya ${hasil.length}, jadi yang terambil ${hasil.length}.`, 'warn');
      tampilkanHasil(hasil);
    } catch (err) {
      bowl.classList.remove('mixing');
      toast(pesanError(err), 'err');
      if (kodeError(err) === 'UNDIAN_KOSONG') muat(true);
    } finally {
      btn.classList.remove('press');
      SIBUK = false; renderStat();
    }
  }
  TOMBOL.forEach(([id, k]) => $(id).addEventListener('click', () => ambil(k)));

  async function terbangkan(jumlah) {
    const r = $('bowl').getBoundingClientRect();
    const sx = r.left + r.width / 2 - 30, sy = r.top + r.height * .55;
    const ex = window.innerWidth / 2 - 30, ey = window.innerHeight / 2 - 17;
    const anim = Array.from({ length: jumlah }, (_, i) => {
      const f = document.createElement('div'); f.className = 'flyer';
      document.body.appendChild(f);
      const dx = (i - (jumlah - 1) / 2) * 70;
      const a = f.animate([
        { transform: `translate(${sx}px, ${sy}px) rotate(-20deg) scale(.6)`, opacity: 1 },
        { transform: `translate(${sx + 20 + dx}px, ${r.top - 60}px) rotate(200deg) scale(1)`, offset: .45 },
        { transform: `translate(${ex + dx}px, ${ey}px) rotate(720deg) scale(3.5)`, opacity: 1, offset: .9 },
        { transform: `translate(${ex + dx}px, ${ey}px) rotate(720deg) scale(5)`, opacity: 0 },
      ], { duration: 900, delay: i * 110, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' });
      return a.finished.catch(() => {}).then(() => f.remove());
    });
    await Promise.all(anim);
  }

  // ----- tampilan hasil (kotak tertutup) -----
  const elW = (i) => $('rList').querySelector(`.w[data-i="${i}"]`);
  const terbukaSemua = (h) => h.buka.every(Boolean);

  function tampilkanHasil(list) {
    HASIL = list.map((h) => ({ ...h, kode: String(h.kode).padStart(6, '0'), buka: [false, false, false, false, false, false], keluar: false }));
    const multi = HASIL.length > 1;
    $('revealCard').classList.toggle('multi', multi);
    $('rJudul').textContent = multi ? `${HASIL.length} Terpilih` : 'Terpilih';
    $('rList').innerHTML = HASIL.map((h, i) => `
      <article class="w" data-i="${i}">
        ${multi ? `<div class="w-no" aria-hidden="true">${i + 1}</div>` : ''}
        <div class="r-digits" role="group" aria-label="Kode${multi ? ' pemenang ' + (i + 1) : ''}">
          ${[0, 1, 2, 3, 4, 5].map((d) => `<button type="button" class="dg covered" data-d="${d}" aria-label="Buka angka ke-${d + 1}${multi ? ' pemenang ' + (i + 1) : ''}"><span>?</span></button>`).join('')}
        </div>
        <div class="w-info">
          <div class="r-nama"><span class="ph"></span></div>
          <div class="r-meta"><span class="ph sm"></span>${multi ? '' : '<span class="ph sm"></span>'}</div>
        </div>
        <div class="w-act"></div>
      </article>`).join('');
    perbaruiKaki();
    $('reveal').hidden = false;
    const pertama = $('rList').querySelector('.dg.covered'); if (pertama) pertama.focus({ preventScroll: true });

    // perbarui data lokal & riwayat
    const t = new Date().toISOString();
    HASIL.forEach((h) => { const row = DATA.find((x) => x.id === h.id); if (row) { row.jumlah_terpilih = h.jumlah_terpilih; row.terakhir_terpilih = t; } });
    api.riwayat().then(renderRiwayat).catch(() => {});
  }

  function bukaDigit(i, d, diam) {
    const h = HASIL[i]; if (!h || h.buka[d]) return false;
    h.buka[d] = true;
    const b = elW(i).querySelector(`.dg[data-d="${d}"]`);
    b.classList.remove('covered'); b.classList.add('open');
    b.innerHTML = `<span>${esc(h.kode[d])}</span>`;
    b.setAttribute('aria-label', `Angka ke-${d + 1}: ${h.kode[d]}`);
    b.tabIndex = -1;
    if (terbukaSemua(h)) selesaiPemenang(i, diam);
    perbaruiKaki();
    return true;
  }

  function selesaiPemenang(i, diam) {
    const h = HASIL[i], el = elW(i);
    el.classList.add('shown');
    el.querySelector('.r-nama').textContent = h.nama;
    el.querySelector('.r-meta').innerHTML = `<span class="chip blue">BPS ${esc(h.satker)}</span><span class="chip green">${esc(h.kategori)}</span>` +
      (h.jumlah_terpilih > 1 ? `<span class="chip">Terpilih ke-${h.jumlah_terpilih}</span>` : '');
    renderAksi(i);
    if (!diam) {
      const r = el.getBoundingClientRect();
      konfeti(HASIL.length > 1 ? { x: r.left + r.width * .3, y: r.top + r.height / 2, jumlah: 90 } : null);
    }
  }

  function renderAksi(i) {
    const h = HASIL[i], el = elW(i), act = el.querySelector('.w-act');
    el.classList.toggle('keluar', h.keluar);
    act.innerHTML = h.keluar
      ? `<div class="r-status">${IKON_OK}<span>Dikeluarkan dari undian</span><button type="button" class="link" data-act="undo">Batalkan</button></div>`
      : `<button class="btn btn-danger" type="button" data-act="hapus">${IKON_HAPUS} Hapus dari Undian</button>`;
  }

  function perbaruiKaki() {
    const masihTertutup = HASIL.some((h) => !terbukaSemua(h));
    const multi = HASIL.length > 1;
    $('rBukaSemua').hidden = !masihTertutup;
    $('rBukaSemua').disabled = MEMBUKA;
    $('rHint').hidden = !masihTertutup;
    $('rHint').textContent = multi ? 'Klik kotak untuk membuka angka tiap pemenang' : 'Klik kotak untuk membuka angka';
    $('rHapusSemua').hidden = !(multi && !masihTertutup && HASIL.some((h) => !h.keluar));
  }

  async function bukaSemua() {
    if (MEMBUKA) return;
    MEMBUKA = true; perbaruiKaki();
    for (let i = 0; i < HASIL.length; i++) {
      for (let d = 0; d < 6; d++) {
        if (bukaDigit(i, d, true) && !reduceMotion) await jeda(HASIL.length > 1 ? 60 : 160);
        if ($('reveal').hidden) { MEMBUKA = false; return; }
      }
    }
    MEMBUKA = false; perbaruiKaki();
    konfeti();
    const b = $('rList').querySelector('[data-act="hapus"]'); if (b) b.focus({ preventScroll: true });
  }
  function bukaBerikutnya() {
    for (let i = 0; i < HASIL.length; i++) for (let d = 0; d < 6; d++) if (!HASIL[i].buka[d]) { bukaDigit(i, d); return; }
  }

  async function atur(id, dalam) {
    await api.aturUndian(id, dalam);
    const row = DATA.find((x) => x.id === id);
    if (row) { row.dalam_undian = dalam; row.dikeluarkan_pada = dalam ? null : new Date().toISOString(); }
    renderStat(); renderSlips();
    if (!$('sheet').hidden) renderTabel();
  }

  $('rList').addEventListener('click', async (e) => {
    const w = e.target.closest('.w'); if (!w) return;
    const i = Number(w.dataset.i);
    const dg = e.target.closest('.dg.covered');
    if (dg) { bukaDigit(i, Number(dg.dataset.d)); return; }
    const aksi = e.target.closest('[data-act]'); if (!aksi) return;
    aksi.disabled = true;
    try {
      const keluar = aksi.dataset.act === 'hapus';
      await atur(HASIL[i].id, !keluar);
      HASIL[i].keluar = keluar; renderAksi(i); perbaruiKaki();
      if (!keluar) toast('Dikembalikan ke undian.', 'ok');
      api.riwayat().then(renderRiwayat).catch(() => {});
    } catch (err) { toast(pesanError(err), 'err'); aksi.disabled = false; }
  });

  $('rBukaSemua').addEventListener('click', bukaSemua);
  $('rHapusSemua').addEventListener('click', async () => {
    const b = $('rHapusSemua'); b.disabled = true;
    try {
      for (let i = 0; i < HASIL.length; i++) {
        if (HASIL[i].keluar) continue;
        await atur(HASIL[i].id, false);
        HASIL[i].keluar = true; renderAksi(i);
      }
      toast('Semua pemenang dikeluarkan dari undian.', 'ok');
      api.riwayat().then(renderRiwayat).catch(() => {});
    } catch (err) { toast(pesanError(err), 'err'); }
    finally { b.disabled = false; perbaruiKaki(); }
  });

  function tutupHasil() { $('reveal').hidden = true; HASIL = []; MEMBUKA = false; stopKonfeti(); $('bAmbil').focus(); }
  $('rTutup').addEventListener('click', tutupHasil);
  $('rX').addEventListener('click', tutupHasil);
  $('reveal').addEventListener('click', (e) => { if (e.target === $('reveal') || e.target.id === 'confetti') tutupHasil(); });

  // ---------------- Konfeti ----------------
  let rafK = null;
  function konfeti(asal) {
    if (reduceMotion) return;
    const ox = asal ? asal.x : innerWidth / 2, oy = asal ? asal.y : innerHeight * .42;
    const cv = $('confetti'); const ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    const warna = ['#2a7de1', '#2ead4a', '#f7931e', '#ffffff', '#ffd166'];
    const P = Array.from({ length: (asal && asal.jumlah) || 180 }, () => ({
      x: ox + acak(-80, 80), y: oy, vx: acak(-11, 11), vy: acak(-17, -5),
      w: acak(6, 12), h: acak(8, 16), r: acak(0, 6), vr: acak(-.3, .3), c: warna[Math.floor(Math.random() * warna.length)], life: 0,
    }));
    const t0 = performance.now();
    cancelAnimationFrame(rafK);
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      P.forEach((p) => {
        p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2))); ctx.restore();
      });
      if (t - t0 < 3500) rafK = requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(t0);
  }
  function stopKonfeti() { cancelAnimationFrame(rafK); const cv = $('confetti'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }

  // ---------------- Tabel peserta ----------------
  function bukaSheet() { $('sheet').hidden = false; renderTabel(); setTimeout(() => $('cari').focus(), 50); }
  function tutupSheet() { $('sheet').hidden = true; }
  $('bPeserta').addEventListener('click', async () => { bukaSheet(); muat(true); });
  $('sheetClose').addEventListener('click', tutupSheet);
  $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) tutupSheet(); });
  $('cari').addEventListener('input', renderTabel);
  document.querySelectorAll('.fbtn').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.fbtn').forEach((x) => x.classList.toggle('on', x === b));
    filter = b.dataset.f; renderTabel();
  }));

  function renderTabel() {
    const q = $('cari').value.trim().toLowerCase();
    const rows = DATA.filter((x) => (filter === 'all' || (filter === 'in') === x.dalam_undian) &&
      (!q || `${x.nama} ${x.satker} ${x.kode} ${x.kategori}`.toLowerCase().includes(q)));
    $('tbody').innerHTML = rows.map((x) => `<tr class="${x.dalam_undian ? '' : 'out'}">
      <td class="dim">${DATA.indexOf(x) + 1}</td>
      <td><b>${esc(x.nama)}</b></td><td>${esc(x.kategori)}</td><td>${esc(x.satker)}</td>
      <td class="mono">${esc(x.kode)}</td><td class="dim">${esc(waktu(x.created_at, { second: undefined, year: undefined }))}</td>
      <td><button type="button" class="pill ${x.dalam_undian ? 'in' : 'out'}" data-id="${x.id}" data-in="${x.dalam_undian ? 1 : 0}"
        title="${x.dalam_undian ? 'Klik untuk mengeluarkan dari undian' : 'Klik untuk mengembalikan ke undian'}">
        ${x.dalam_undian ? '● Dalam undian' : '○ Dikeluarkan'}</button></td></tr>`).join('') ||
      '<tr><td colspan="7" style="text-align:center;color:var(--ink-3);padding:30px">Tidak ada data.</td></tr>';
    $('sheetInfo').textContent = `${rows.length} dari ${DATA.length} peserta`;
  }
  $('tbody').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-id]'); if (!b) return;
    const id = Number(b.dataset.id), dalam = b.dataset.in === '1';
    const x = DATA.find((y) => y.id === id);
    if (dalam && !confirm(`Keluarkan ${x ? x.nama : 'peserta ini'} dari undian?\nData presensinya tetap tersimpan.`)) return;
    b.disabled = true;
    try { await atur(id, !dalam); } catch (err) { toast(pesanError(err), 'err'); b.disabled = false; }
  });

  // ---------------- Unduh ----------------
  async function unduh() {
    try {
      const rows = await api.semuaPresensi();
      DATA = rows; renderStat();
      const header = ['No', 'Waktu Presensi (WITA)', 'Nama', 'Kategori', 'Satuan Kerja', 'Kode Undian', 'Status Undian', 'Jumlah Terpilih', 'Terakhir Terpilih (WITA)', 'Dikeluarkan Pada (WITA)'];
      const fmt = (iso) => iso ? waktu(iso).replace(' WITA', '') : '';
      const data = rows.map((x, i) => [i + 1, fmt(x.created_at), x.nama, x.kategori, x.satker, String(x.kode),
        x.dalam_undian ? 'Dalam undian' : 'Dikeluarkan', x.jumlah_terpilih || 0, fmt(x.terakhir_terpilih), fmt(x.dikeluarkan_pada)]);
      const tgl = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Makassar', dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replace(/[: ]/g, (c) => (c === ' ' ? '_' : ''));
      unduhXlsx(`presensi-bps-sulut_${tgl}.xlsx`, header, data, 'Presensi');
      toast(`${rows.length} data presensi diunduh.`, 'ok');
    } catch (err) { toast(pesanError(err), 'err'); }
  }
  $('bUnduh').addEventListener('click', unduh);
  $('bUnduh2').addEventListener('click', unduh);

  // ---------------- Lain-lain ----------------
  $('bFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
  });
  document.addEventListener('keydown', (e) => {
    const el = document.activeElement;
    const typing = /INPUT|TEXTAREA|SELECT/.test(el && el.tagName);
    const diTombol = el && el.tagName === 'BUTTON';
    if (e.key === 'Escape') { if (!$('reveal').hidden) tutupHasil(); else if (!$('sheet').hidden) tutupSheet(); return; }
    if (!$('reveal').hidden) {
      // Spasi = buka kotak berikutnya (kalau fokus sedang di kotak, spasi membuka kotak itu)
      if (e.code === 'Space' && !(diTombol && !el.classList.contains('open'))) { e.preventDefault(); bukaBerikutnya(); }
      return;
    }
    if (typing || !$('sheet').hidden || $('viewStage').hidden) return;
    if ((e.code === 'Space' || e.key === 'Enter') && !(diTombol && !el.id.startsWith('bAmbil'))) { e.preventDefault(); ambil(1); }
    else if (e.key === '3') { e.preventDefault(); ambil(3); }
    else if (e.key === '5') { e.preventDefault(); ambil(5); }
  });
  if (DEMO) {
    $('bContoh').addEventListener('click', async () => { const n = await api.isiContoh(30); toast(`${n} peserta contoh ditambahkan.`, 'ok'); muat(); });
    $('bReset').addEventListener('click', () => { if (confirm('Hapus semua data demo?')) { api.reset(); location.reload(); } });
  }

  // ---------------- Mulai ----------------
  (async function init() {
    try {
      const s = await api.sesiAdmin();
      if (s && !s.bukanAdmin) { await masuk(); return; }
      if (s && s.bukanAdmin) { await api.logout(); }
    } catch (err) { console.error(err); }
    tampil('login');
  })();
})();