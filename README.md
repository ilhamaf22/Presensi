# Presensi BPS se-Sulawesi Utara + Fishbowl Undian

Dua halaman:

| Halaman | Untuk | Isi |
|---|---|---|
| `/` | Peserta | Form nama lengkap, kategori (Pegawai/Magang/Outsourcing), satuan kerja → tiket berisi QR (nama, satker, kategori, kode) + kode undian 6 digit, bisa diunduh PNG |
| `/random` | Admin saja (login) | Fishbowl: ambil 1 acak per klik/spasi, **Hapus dari Undian** (data presensi tetap ada), daftar peserta, unduh `.xlsx` |

## Aturan yang dijaga database (bukan cuma di tampilan)

- Nama lengkap: minimal 2 kata, tiap kata minimal 2 huruf, hanya huruf/spasi/`'`/`-` (tanpa singkatan, angka, gelar). Nama dirapikan otomatis jadi Huruf Kapital Awal.
- Kategori dan satuan kerja wajib dan harus dari daftar.
- Tidak ada duplikat: nama (tanpa beda huruf besar/kecil & spasi), kode undian, dan perangkat.
- 1 perangkat 1 nomor: ID perangkat disimpan di localStorage + cookie + IndexedDB. Jika peserta membuka lagi, tiketnya muncul kembali.
- Publik tidak bisa membaca data atau mengundi; semuanya lewat fungsi yang dikunci (RLS).

## Pemasangan (±15 menit)

### 1. Supabase (database + login admin)
1. Buat project di <https://supabase.com> (region Singapore).
2. **SQL Editor → New query**, tempel isi `supabase/schema.sql`, **Run**.
3. **Authentication → Users → Add user → Create new user**: isi email & kata sandi admin, centang *Auto Confirm User*.
4. Jadikan admin — di SQL Editor jalankan (ganti emailnya):
   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'admin@contoh.go.id'
   on conflict do nothing;
   ```
5. **Authentication → Sign In / Providers**: matikan *Allow new users to sign up* agar orang lain tidak bisa membuat akun.
6. **Project Settings → API**: salin *Project URL* dan *anon/publishable key*.

### 2. Konfigurasi
Buka `public/js/config.js`, isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY`. Ubah juga `NAMA_ACARA` / `JUDUL_UNDIAN` sesuai kegiatan.
Selama kunci masih `GANTI…`, situs berjalan dalam **mode demo** (data hanya di browser, kata sandi admin `admin`) — berguna untuk mencoba tampilan.

### 3. Netlify
Cara cepat: <https://app.netlify.com/drop> → seret folder **`public`**. Selesai (rute `/random` sudah diatur oleh `public/_redirects`).
Atau hubungkan repo GitHub; `netlify.toml` sudah menunjuk folder `public`.

Bagikan `https://nama-situs.netlify.app` ke peserta (bisa dijadikan QR di layar), buka `/random` di laptop proyektor.

## Saat acara
- **Ambil Acak**: klik tombol atau tekan **spasi**. Peserta yang terpilih tetap di undian sampai panitia menekan **Hapus dari Undian** (bisa dibatalkan).
- **Peserta**: cari, saring, dan keluarkan/kembalikan siapa pun.
- **Unduh .xlsx**: seluruh data presensi termasuk status undian, jumlah terpilih, dan waktu (WITA).
- **Layar penuh** untuk proyektor.

## Perawatan
- Menambah satker (mis. BPS Provinsi):
  `insert into public.satker values ('Provinsi Sulawesi Utara', 0);` lalu tambahkan juga namanya di `SATKER` pada `public/js/shared.js`.
- Mengosongkan data untuk acara baru:
  `truncate public.riwayat_undian, public.presensi restart identity;`

## Batasan yang perlu diketahui
- "1 perangkat" berbasis penyimpanan browser. Peserta yang sengaja memakai mode penyamaran atau browser lain di HP yang sama bisa mendapat ID baru — tetapi tetap tertahan aturan **nama tidak boleh dobel**. Sidik perangkat (hash) ikut disimpan untuk audit bila ada kecurigaan.
- Orang dengan nama tunggal (satu kata) akan ditolak oleh aturan nama lengkap; arahkan untuk menulis nama sesuai KTP atau tambahkan nama ayah/marga.
