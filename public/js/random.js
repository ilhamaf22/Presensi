(function () {
  'use strict';
  const { api, CFG, DEMO, pesanError, kodeError, PESAN, waktu, esc, unduhXlsx, toast } = window.App;
  const $ = (id) => document.getElementById(id);

  let DATA = [];          // semua presensi
  let TERPILIH = null;    // hasil undian yang sedang tampil
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

  function renderStat() {
    const n = dalamUndian().length;
    $('sHadir').textContent = DATA.length;
    $('sPool').textContent = n;
    $('sKeluar').textContent = DATA.length - n;
    $('bowlCount').textContent = n;
    $('bAmbil').disabled = n === 0;
    $('bAmbil').querySelector('.draw-sub').textContent = n === 0 ? 'undian kosong' : 'tekan spasi';
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

  async function ambil() {
    if (SIBUK || !dalamUndian().length) return;
    SIBUK = true;
    const btn = $('bAmbil'); btn.disabled = true; btn.classList.add('press');
    const bowl = $('bowl');
    acakGerak(); bowl.classList.add('mixing');
    try {
      const [hasil] = await Promise.all([api.ambilAcak(), jeda(reduceMotion ? 200 : 2200)]);
      bowl.classList.remove('mixing');
      if (!reduceMotion) await terbangkan();
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
  $('bAmbil').addEventListener('click', ambil);

  async function terbangkan() {
    const r = $('bowl').getBoundingClientRect();
    const f = document.createElement('div'); f.className = 'flyer';
    document.body.appendChild(f);
    const sx = r.left + r.width / 2 - 30, sy = r.top + r.height * .55;
    const ex = window.innerWidth / 2 - 30, ey = window.innerHeight / 2 - 17;
    const a = f.animate([
      { transform: `translate(${sx}px, ${sy}px) rotate(-20deg) scale(.6)` },
      { transform: `translate(${sx + 20}px, ${r.top - 60}px) rotate(200deg) scale(1)`, offset: .45 },
      { transform: `translate(${ex}px, ${ey}px) rotate(720deg) scale(4)`, opacity: 1, offset: .9 },
      { transform: `translate(${ex}px, ${ey}px) rotate(720deg) scale(6)`, opacity: 0 },
    ], { duration: 900, easing: 'cubic-bezier(.4,0,.2,1)' });
    await a.finished.catch(() => {});
    f.remove();
  }

  async function tampilkanHasil(h) {
    TERPILIH = h;
    const card = $('revealCard');
    card.classList.remove('shown');
    $('rNama').textContent = h.nama;
    $('rSatker').textContent = 'BPS ' + h.satker;
    $('rKategori').textContent = h.kategori;
    $('rKe').hidden = !(h.jumlah_terpilih > 1);
    $('rKe').textContent = `Terpilih ke-${h.jumlah_terpilih}`;
    $('rStatus').hidden = true; $('rActions').hidden = false; $('rLagi').hidden = true;
    const kode = String(h.kode);
    $('rKode').innerHTML = kode.split('').map(() => '<span class="rolling">0</span>').join('');
    $('rKode').setAttribute('aria-label', 'Kode ' + kode);
    $('reveal').hidden = false;

    const spans = [...$('rKode').children];
    if (reduceMotion) {
      spans.forEach((s, i) => { s.textContent = kode[i]; s.className = ''; });
    } else {
      const roll = setInterval(() => spans.forEach((s) => { if (s.classList.contains('rolling')) s.textContent = Math.floor(Math.random() * 10); }), 50);
      for (let i = 0; i < spans.length; i++) {
        await jeda(i === 0 ? 450 : 230);
        spans[i].textContent = kode[i]; spans[i].className = 'landed';
      }
      clearInterval(roll);
    }
    await jeda(150);
    card.classList.add('shown');
    konfeti();
    $('rHapus').focus();
    // perbarui data lokal & riwayat
    const row = DATA.find((x) => x.id === h.id);
    if (row) { row.jumlah_terpilih = h.jumlah_terpilih; row.terakhir_terpilih = new Date().toISOString(); }
    api.riwayat().then(renderRiwayat).catch(() => {});
  }

  async function atur(id, dalam) {
    await api.aturUndian(id, dalam);
    const row = DATA.find((x) => x.id === id);
    if (row) { row.dalam_undian = dalam; row.dikeluarkan_pada = dalam ? null : new Date().toISOString(); }
    renderStat(); renderSlips();
    api.riwayat().then(renderRiwayat).catch(() => {});
    if (!$('sheet').hidden) renderTabel();
  }

  $('rHapus').addEventListener('click', async () => {
    if (!TERPILIH) return;
    const b = $('rHapus'); b.disabled = true;
    try {
      await atur(TERPILIH.id, false);
      $('rActions').hidden = true; $('rStatus').hidden = false;
      $('rLagi').hidden = dalamUndian().length === 0; $('rLagi').focus();
      if (!dalamUndian().length) toast('Semua peserta sudah dikeluarkan dari undian.', 'warn');
    } catch (err) { toast(pesanError(err), 'err'); } finally { b.disabled = false; }
  });
  $('rUndo').addEventListener('click', async () => {
    if (!TERPILIH) return;
    try {
      await atur(TERPILIH.id, true);
      $('rActions').hidden = false; $('rStatus').hidden = true; $('rLagi').hidden = true;
      toast('Dikembalikan ke undian.', 'ok');
    } catch (err) { toast(pesanError(err), 'err'); }
  });
  function tutupHasil() { $('reveal').hidden = true; TERPILIH = null; stopKonfeti(); $('bAmbil').focus(); }
  $('rTutup').addEventListener('click', tutupHasil);
  $('rLagi').addEventListener('click', () => { tutupHasil(); setTimeout(ambil, 150); });

  // ---------------- Konfeti ----------------
  let rafK = null;
  function konfeti() {
    if (reduceMotion) return;
    const cv = $('confetti'); const ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    const warna = ['#2a7de1', '#2ead4a', '#f7931e', '#ffffff', '#ffd166'];
    const P = Array.from({ length: 180 }, () => ({
      x: innerWidth / 2 + acak(-80, 80), y: innerHeight * .42, vx: acak(-11, 11), vy: acak(-17, -5),
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
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName);
    if (e.key === 'Escape') { if (!$('reveal').hidden) tutupHasil(); else if (!$('sheet').hidden) tutupSheet(); return; }
    if ((e.code === 'Space' || e.key === 'Enter') && !typing && $('reveal').hidden && $('sheet').hidden && !$('viewStage').hidden) {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON' && document.activeElement.id !== 'bAmbil') return;
      e.preventDefault(); ambil();
    }
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
