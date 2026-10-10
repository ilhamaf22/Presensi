/* Shared: konstanta, validasi, identitas perangkat, backend (Supabase / demo), ekspor XLSX */
(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};

  const SATKER = [
    'Provinsi Sulawesi Utara', 'Bolaang Mongondow', 'Minahasa', 'Sangihe', 'Talaud', 'Minahasa Selatan',
    'Minahasa Utara', 'Bolaang Mongondow Utara', 'Sitaro', 'Bolaang Mongondow Timur',
    'Minahasa Tenggara', 'Bolaang Mongondow Selatan', 'Manado', 'Bitung', 'Tomohon', 'Kotamobagu',
  ];
  const KATEGORI = ['Pegawai', 'Magang', 'Outsourcing'];

  const PESAN = {
    NAMA_KOSONG: 'Nama wajib diisi.',
    NAMA_TIDAK_VALID: 'Nama hanya boleh berisi huruf, spasi, tanda petik (’) atau tanda hubung (-). Tanpa angka, titik, atau gelar.',
    NAMA_TIDAK_LENGKAP: 'Tulis nama lengkap minimal 2 kata, tanpa singkatan (contoh: “Muhammad Ilham”, bukan “M. Ilham”).',
    NAMA_SUDAH_TERDAFTAR: 'Nama ini sudah melakukan presensi. Jika itu Anda, buka dari perangkat yang dipakai sebelumnya atau hubungi panitia.',
    PERANGKAT_SUDAH_ABSEN: 'Perangkat ini sudah dipakai untuk presensi. Satu perangkat hanya untuk satu nomor.',
    PERANGKAT_TIDAK_DIKENALI: 'Perangkat tidak dikenali. Aktifkan cookie/penyimpanan browser lalu muat ulang halaman.',
    KATEGORI_KOSONG: 'Pilih kategori: Pegawai, Magang, atau Outsourcing.',
    SATKER_KOSONG: 'Pilih satuan kerja Anda.',
    GAGAL_MEMBUAT_KODE: 'Gagal membuat kode unik. Silakan coba lagi.',
    BUKAN_ADMIN: 'Akun ini bukan admin.',
    UNDIAN_KOSONG: 'Tidak ada lagi peserta di dalam undian.',
    JUMLAH_TIDAK_VALID: 'Jumlah pemenang tidak valid.',
    DATA_TIDAK_DITEMUKAN: 'Data tidak ditemukan.',
    LOGIN_GAGAL: 'Email atau kata sandi salah.',
    JARINGAN: 'Koneksi bermasalah. Periksa internet lalu coba lagi.',
    KUNCI_SALAH: 'Konfigurasi salah: js/config.js memakai SECRET key. Ganti dengan PUBLISHABLE key (sb_publishable_…) atau anon key dari Supabase.',
  };

  function kodeError(err) {
    if (!err) return null;
    const msg = String(err.message || err.code || err);
    const hit = Object.keys(PESAN).find((k) => msg.includes(k));
    if (hit) return hit;
    if (/fetch|network|Failed to/i.test(msg)) return 'JARINGAN';
    if (/Invalid login/i.test(msg)) return 'LOGIN_GAGAL';
    if (/secret API key|service_role/i.test(msg)) return 'KUNCI_SALAH';
    return null;
  }
  function pesanError(err) {
    const k = kodeError(err);
    return k ? PESAN[k] : 'Terjadi kesalahan: ' + (err && err.message ? err.message : String(err));
  }

  // --- Nama ---------------------------------------------------------
  function rapikanNama(s) {
    return String(s || '').trim().replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(/(^|[\s'\-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  }
  function validasiNama(s) {
    const n = String(s || '').trim().replace(/\s+/g, ' ');
    if (!n) return 'NAMA_KOSONG';
    if (!/^[\p{L}'\- ]+$/u.test(n)) return 'NAMA_TIDAK_VALID';
    const kata = n.split(' ');
    if (kata.length < 2 || n.length > 80) return 'NAMA_TIDAK_LENGKAP';
    if (kata.some((k) => k.replace(/[^\p{L}]/gu, '').length < 2)) return 'NAMA_TIDAK_LENGKAP';
    return null;
  }

  // --- Identitas perangkat (localStorage + cookie + IndexedDB) -------
  const DKEY = 'presensi_bps_sulut_device';
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');
  function lsGet() { try { return localStorage.getItem(DKEY); } catch (e) { return null; } }
  function lsSet(v) { try { localStorage.setItem(DKEY, v); } catch (e) { /* abaikan */ } }
  function ckGet() { const m = document.cookie.match(new RegExp('(?:^|; )' + DKEY + '=([^;]+)')); return m ? decodeURIComponent(m[1]) : null; }
  function ckSet(v) { try { document.cookie = `${DKEY}=${encodeURIComponent(v)}; max-age=${60 * 60 * 24 * 400}; path=/; SameSite=Lax`; } catch (e) { /* abaikan */ } }
  function idb(mode, v) {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open('presensi_bps_sulut', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          try {
            const tx = req.result.transaction('kv', mode === 'get' ? 'readonly' : 'readwrite');
            const st = tx.objectStore('kv');
            const r = mode === 'get' ? st.get(DKEY) : st.put(v, DKEY);
            r.onsuccess = () => resolve(mode === 'get' ? r.result || null : v);
            r.onerror = () => resolve(null);
          } catch (e) { resolve(null); }
        };
      } catch (e) { resolve(null); }
      setTimeout(() => resolve(null), 1500);
    });
  }
  async function getDeviceId() {
    const kandidat = [lsGet(), ckGet(), await idb('get')].filter(isUuid);
    const id = kandidat[0] || uuid();
    lsSet(id); ckSet(id); idb('put', id);
    return id;
  }
  async function sidikPerangkat() {
    const parts = [navigator.userAgent, navigator.language, screen.width + 'x' + screen.height,
      screen.colorDepth, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.hardwareConcurrency || '',
      navigator.maxTouchPoints || ''];
    const s = parts.join('|');
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return 'h' + (h >>> 0).toString(16);
    }
  }

  // --- Format --------------------------------------------------------
  function waktu(iso, opts) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('id-ID', Object.assign({
      timeZone: 'Asia/Makassar', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }, opts || {})).format(new Date(iso)) + ' WITA';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function isiQR(t) { return `NAMA: ${t.nama}\nSATKER: BPS ${t.satker}\nKATEGORI: ${t.kategori}\nKODE: ${t.kode}`; }

  // --- Backend: Supabase --------------------------------------------
  const DEMO = !CFG.SUPABASE_URL || /GANTI/i.test(CFG.SUPABASE_URL + CFG.SUPABASE_ANON_KEY);
  // Tolak secret/service_role key: kunci itu tidak boleh berada di browser.
  const KUNCI_RAHASIA = (function (k) {
    k = String(k || '');
    if (/^sb_secret_/.test(k)) return true;
    try { return JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'; } catch (e) { return false; }
  })(CFG.SUPABASE_ANON_KEY);

  function supabaseBackend() {
    if (KUNCI_RAHASIA) {
      const gagal = async () => { throw new Error('KUNCI_SALAH'); };
      return { demo: false, daftar: gagal, tiketPerangkat: gagal, sesiAdmin: gagal, login: gagal, logout: async () => {}, ambilAcak: gagal, ambilAcakN: gagal, aturUndian: gagal, semuaPresensi: gagal, riwayat: gagal };
    }
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, storageKey: 'presensi_bps_sulut_admin' },
    });
    const satu = (r) => { if (r.error) throw r.error; return Array.isArray(r.data) ? r.data[0] || null : r.data; };
    return {
      demo: false,
      async daftar(d) {
        return satu(await sb.rpc('daftar_presensi', {
          p_nama: d.nama, p_kategori: d.kategori, p_satker: d.satker,
          p_device: d.device, p_fingerprint: d.fingerprint, p_user_agent: navigator.userAgent,
        }));
      },
      async tiketPerangkat(device) { return satu(await sb.rpc('presensi_perangkat', { p_device: device })); },
      async sesiAdmin() {
        const { data } = await sb.auth.getSession();
        if (!data.session) return null;
        const r = await sb.rpc('is_admin');
        if (r.error) throw r.error;
        return r.data ? { email: data.session.user.email } : { email: data.session.user.email, bukanAdmin: true };
      },
      async login(email, password) {
        const r = await sb.auth.signInWithPassword({ email, password });
        if (r.error) throw new Error('LOGIN_GAGAL');
        return this.sesiAdmin();
      },
      async logout() { await sb.auth.signOut(); },
      async ambilAcak() { return satu(await sb.rpc('ambil_acak')); },
      async ambilAcakN(n) { const r = await sb.rpc('ambil_acak_n', { p_jumlah: n }); if (r.error) throw r.error; return r.data || []; },
      async aturUndian(id, dalam) { const r = await sb.rpc('atur_undian', { p_id: id, p_dalam_undian: dalam }); if (r.error) throw r.error; },
      async semuaPresensi() {
        const out = [];
        for (let from = 0; ; from += 1000) {
          const r = await sb.from('presensi')
            .select('id,nama,kategori,satker,kode,dalam_undian,jumlah_terpilih,terakhir_terpilih,dikeluarkan_pada,created_at')
            .order('created_at', { ascending: true }).range(from, from + 999);
          if (r.error) throw r.error;
          out.push(...r.data);
          if (r.data.length < 1000) break;
        }
        return out;
      },
      async riwayat() {
        const r = await sb.from('riwayat_undian')
          .select('id,diambil_pada,presensi:presensi_id(id,nama,satker,kode,dalam_undian)')
          .order('diambil_pada', { ascending: false }).order('id', { ascending: false }).limit(50);
        if (r.error) throw r.error;
        return r.data;
      },
    };
  }

  // --- Backend: demo (localStorage; untuk pratinjau tanpa Supabase) ---
  function demoBackend() {
    const K = 'presensi_bps_sulut_demo_db';
    const load = () => { try { return JSON.parse(localStorage.getItem(K)) || { p: [], r: [], seq: 0 }; } catch (e) { return { p: [], r: [], seq: 0 }; } };
    const save = (db) => { try { localStorage.setItem(K, JSON.stringify(db)); } catch (e) { /* abaikan */ } };
    const tunda = (ms) => new Promise((r) => setTimeout(r, ms));
    const pub = (x) => x && ({ nama: x.nama, kategori: x.kategori, satker: x.satker, kode: x.kode, created_at: x.created_at });
    let admin = sessionStorage.getItem('demo_admin');
    function tambah(db, d) {
      const e = validasiNama(d.nama); if (e) throw new Error(e);
      if (!KATEGORI.includes(d.kategori)) throw new Error('KATEGORI_KOSONG');
      if (!SATKER.includes(d.satker)) throw new Error('SATKER_KOSONG');
      const nama = rapikanNama(d.nama);
      if (db.p.some((x) => x.device_id === d.device)) throw new Error('PERANGKAT_SUDAH_ABSEN');
      if (db.p.some((x) => x.nama.toLowerCase() === nama.toLowerCase())) throw new Error('NAMA_SUDAH_TERDAFTAR');
      let kode;
      do { kode = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0'); }
      while (db.p.some((x) => x.kode === kode));
      const row = { id: ++db.seq, nama, kategori: d.kategori, satker: d.satker, kode, device_id: d.device,
        dalam_undian: true, jumlah_terpilih: 0, terakhir_terpilih: null, dikeluarkan_pada: null,
        created_at: new Date().toISOString() };
      db.p.push(row);
      return row;
    }
    const wajibAdmin = () => { if (!admin) throw new Error('BUKAN_ADMIN'); };
    return {
      demo: true,
      async daftar(d) { await tunda(500); const db = load(); const r = tambah(db, d); save(db); return pub(r); },
      async tiketPerangkat(device) { return pub(load().p.find((x) => x.device_id === device)); },
      async sesiAdmin() { return admin ? { email: admin } : null; },
      async login(email, password) {
        await tunda(300);
        if (password !== 'admin') throw new Error('LOGIN_GAGAL');
        admin = email || 'admin@demo'; sessionStorage.setItem('demo_admin', admin);
        return { email: admin };
      },
      async logout() { admin = null; sessionStorage.removeItem('demo_admin'); },
      async ambilAcak() {
        wajibAdmin(); const db = load();
        const pool = db.p.filter((x) => x.dalam_undian);
        if (!pool.length) throw new Error('UNDIAN_KOSONG');
        const x = pool[crypto.getRandomValues(new Uint32Array(1))[0] % pool.length];
        x.jumlah_terpilih++; x.terakhir_terpilih = new Date().toISOString();
        db.r.push({ id: db.r.length + 1, presensi_id: x.id, diambil_pada: x.terakhir_terpilih });
        save(db);
        return { id: x.id, nama: x.nama, kategori: x.kategori, satker: x.satker, kode: x.kode, jumlah_terpilih: x.jumlah_terpilih };
      },
      async ambilAcakN(n) {
        wajibAdmin(); const db = load();
        const pool = db.p.filter((x) => x.dalam_undian);
        if (!pool.length) throw new Error('UNDIAN_KOSONG');
        for (let i = pool.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        const pilih = pool.slice(0, n); const t = new Date().toISOString();
        pilih.forEach((x) => { x.jumlah_terpilih++; x.terakhir_terpilih = t; });
        pilih.slice().reverse().forEach((x) => db.r.push({ id: db.r.length + 1, presensi_id: x.id, diambil_pada: t }));
        save(db);
        return pilih.map((x, i) => ({ urutan: i + 1, id: x.id, nama: x.nama, kategori: x.kategori, satker: x.satker, kode: x.kode, jumlah_terpilih: x.jumlah_terpilih }));
      },
      async aturUndian(id, dalam) {
        wajibAdmin(); const db = load(); const x = db.p.find((y) => y.id === id);
        if (!x) throw new Error('DATA_TIDAK_DITEMUKAN');
        x.dalam_undian = dalam; x.dikeluarkan_pada = dalam ? null : new Date().toISOString(); save(db);
      },
      async semuaPresensi() { wajibAdmin(); return load().p.map(({ device_id, ...rest }) => rest); },
      async riwayat() {
        wajibAdmin(); const db = load();
        return db.r.slice(-50).reverse().map((r) => {
          const x = db.p.find((y) => y.id === r.presensi_id) || {};
          return { id: r.id, diambil_pada: r.diambil_pada, presensi: { id: x.id, nama: x.nama, satker: x.satker, kode: x.kode, dalam_undian: x.dalam_undian } };
        });
      },
      async isiContoh(n) {
        const depan = ['Andi', 'Rina', 'Johan', 'Meiske', 'Fadli', 'Grace', 'Steven', 'Nurul', 'Yohanis', 'Fitri', 'Rizky', 'Debby', 'Hendra', 'Sartika', 'Kevin', 'Maria', 'Arif', 'Novita', 'Reza', 'Olivia'];
        const belakang = ['Lumowa', 'Mokodompit', 'Rondonuwu', 'Paputungan', 'Tumbelaka', 'Damopolii', 'Sumampouw', 'Mamonto', 'Wenas', 'Pangemanan', 'Gobel', 'Kalalo', 'Manoppo', 'Rumengan', 'Tangkilisan'];
        const db = load(); let ok = 0;
        for (let i = 0; ok < n && i < n * 10; i++) {
          try {
            tambah(db, {
              nama: depan[Math.floor(Math.random() * depan.length)] + ' ' + belakang[Math.floor(Math.random() * belakang.length)],
              kategori: KATEGORI[Math.floor(Math.random() * 3)], satker: SATKER[Math.floor(Math.random() * SATKER.length)], device: uuid(),
            });
            ok++;
          } catch (e) { /* duplikat, coba lagi */ }
        }
        save(db); return ok;
      },
      reset() { localStorage.removeItem(K); },
    };
  }

  // --- Ekspor XLSX (SpreadsheetML minimal, dizip dengan fflate) -------
  function unduhXlsx(namaFile, header, rows, namaSheet) {
    const xe = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    const col = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
    const cell = (v, r, c, st) => {
      const ref = col(c) + r;
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${st ? ` s="${st}"` : ''}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${st ? ` s="${st}"` : ''}><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
    };
    const all = [header, ...rows];
    const widths = header.map((_, c) => Math.min(48, Math.max(8, ...all.map((r) => String(r[c] == null ? '' : r[c]).length + 2))));
    const sheetRows = all.map((r, i) => `<row r="${i + 1}">${r.map((v, c) => cell(v, i + 1, c, i === 0 ? 1 : 0)).join('')}</row>`).join('');
    const last = col(header.length - 1) + all.length;
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
    const sname = xe((namaSheet || 'Presensi').slice(0, 31));
    const files = {
      '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
      '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sname}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sname.replace(/'/g, "''")}'!$A$1:$${col(header.length - 1)}$${all.length}</definedName></definedNames></workbook>`,
      'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B2D57"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
      'xl/worksheets/sheet1.xml': sheet,
    };
    const enc = new TextEncoder();
    const zipIn = {}; Object.keys(files).forEach((k) => { zipIn[k] = enc.encode(files[k]); });
    const data = window.fflate.zipSync(zipIn, { level: 6 });
    const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    unduhBlob(blob, namaFile);
  }
  function unduhBlob(blob, namaFile) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = namaFile;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // --- Toast ----------------------------------------------------------
  function toast(msg, jenis) {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + (jenis || '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3800);
  }

  window.App = {
    CFG, SATKER, KATEGORI, PESAN, DEMO,
    api: DEMO ? demoBackend() : supabaseBackend(),
    kodeError, pesanError, rapikanNama, validasiNama, getDeviceId, sidikPerangkat,
    waktu, esc, isiQR, unduhXlsx, unduhBlob, toast,
  };
})();