// =====================================================================
//  KONFIGURASI — isi dua nilai Supabase di bawah, lalu deploy.
//  Ambil dari Supabase → Project Settings → API:
//    • Project URL                  → SUPABASE_URL
//    • anon / publishable key       → SUPABASE_ANON_KEY  (aman untuk publik)
//  Selama masih "GANTI…", situs berjalan dalam MODE DEMO (data hanya di
//  browser masing-masing, tidak tersimpan ke database).
// =====================================================================
window.APP_CONFIG = {
  SUPABASE_URL: 'https://frokoeppeqyzazlfnocd.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_3j0MwQN1mZlzUDJcJTxbwQ_5rLR_BLD',

  NAMA_ACARA: 'Presensi Kegiatan',
  PENYELENGGARA: 'BPS Provinsi Sulawesi Utara',
  JUDUL_UNDIAN: 'Undian Doorprize',
};
