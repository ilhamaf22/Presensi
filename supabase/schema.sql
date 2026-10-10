-- =====================================================================
--  Presensi BPS se-Sulawesi Utara + Fishbowl Undian
--  Jalankan seluruh file ini sekali di Supabase → SQL Editor → Run.
--  Aman dijalankan ulang (idempotent) — data presensi tidak dihapus.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Tabel referensi satuan kerja
-- ---------------------------------------------------------------------
create table if not exists public.satker (
  nama   text primary key,
  urutan int  not null
);

insert into public.satker (nama, urutan) values
  ('Bolaang Mongondow', 1),
  ('Minahasa', 2),
  ('Sangihe', 3),
  ('Talaud', 4),
  ('Minahasa Selatan', 5),
  ('Minahasa Utara', 6),
  ('Bolaang Mongondow Utara', 7),
  ('Sitaro', 8),
  ('Bolaang Mongondow Timur', 9),
  ('Minahasa Tenggara', 10),
  ('Bolaang Mongondow Selatan', 11),
  ('Manado', 12),
  ('Bitung', 13),
  ('Tomohon', 14),
  ('Kotamobagu', 15)
on conflict (nama) do update set urutan = excluded.urutan;

-- ---------------------------------------------------------------------
-- 2. Tabel presensi
--    Tidak ada duplikat: nama (tanpa beda huruf besar/kecil & spasi),
--    kode unik, dan satu perangkat hanya satu nomor.
-- ---------------------------------------------------------------------
create table if not exists public.presensi (
  id                 bigint generated always as identity primary key,
  nama               text        not null,
  nama_norm          text        not null,
  kategori           text        not null,
  satker             text        not null references public.satker(nama),
  kode               char(6)     not null,
  device_id          uuid        not null,
  fingerprint        text,
  user_agent         text,
  dalam_undian       boolean     not null default true,
  jumlah_terpilih    int         not null default 0,
  terakhir_terpilih  timestamptz,
  dikeluarkan_pada   timestamptz,
  created_at         timestamptz not null default now(),
  constraint presensi_nama_unik     unique (nama_norm),
  constraint presensi_kode_unik     unique (kode),
  constraint presensi_perangkat_unik unique (device_id),
  constraint presensi_kategori_cek  check (kategori in ('Pegawai','Magang','Outsourcing')),
  constraint presensi_kode_cek      check (kode ~ '^[0-9]{6}$')
);

create index if not exists presensi_undian_idx on public.presensi (dalam_undian);

-- ---------------------------------------------------------------------
-- 3. Admin & riwayat undian
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text,
  created_at timestamptz not null default now()
);

create table if not exists public.riwayat_undian (
  id           bigint generated always as identity primary key,
  presensi_id  bigint not null references public.presensi(id) on delete cascade,
  diambil_pada timestamptz not null default now(),
  diambil_oleh uuid
);

-- ---------------------------------------------------------------------
-- 4. Row Level Security: publik TIDAK bisa membaca tabel langsung.
--    Semua akses publik lewat fungsi di bawah.
-- ---------------------------------------------------------------------
alter table public.satker          enable row level security;
alter table public.presensi        enable row level security;
alter table public.admins          enable row level security;
alter table public.riwayat_undian  enable row level security;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

drop policy if exists satker_baca on public.satker;
create policy satker_baca on public.satker for select to anon, authenticated using (true);

drop policy if exists presensi_admin_baca on public.presensi;
create policy presensi_admin_baca on public.presensi for select to authenticated using (public.is_admin());

drop policy if exists admins_baca_sendiri on public.admins;
create policy admins_baca_sendiri on public.admins for select to authenticated using (user_id = auth.uid());

drop policy if exists riwayat_admin_baca on public.riwayat_undian;
create policy riwayat_admin_baca on public.riwayat_undian for select to authenticated using (public.is_admin());

revoke all on public.presensi, public.admins, public.riwayat_undian, public.satker from anon, authenticated;
grant select on public.satker to anon, authenticated;
grant select on public.presensi, public.riwayat_undian, public.admins to authenticated;

-- ---------------------------------------------------------------------
-- 5. Fungsi publik: daftar presensi
-- ---------------------------------------------------------------------
create or replace function public.rapikan_nama(p text)
returns text
language sql immutable
as $$
  select initcap(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.daftar_presensi(
  p_nama        text,
  p_kategori    text,
  p_satker      text,
  p_device      uuid,
  p_fingerprint text default null,
  p_user_agent  text default null
)
returns table (nama text, kategori text, satker text, kode text, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  v_nama  text := public.rapikan_nama(p_nama);
  v_norm  text := lower(public.rapikan_nama(p_nama));
  v_kode  text;
  v_kata  text;
  v_jml   int := 0;
  v_con   text;
  v_coba  int := 0;
begin
  if p_device is null then
    raise exception 'PERANGKAT_TIDAK_DIKENALI' using errcode = 'P0001';
  end if;

  -- Nama lengkap: minimal 2 kata, tiap kata minimal 2 huruf, tanpa angka/singkatan
  if v_nama = '' or v_nama !~ '^[[:alpha:]''\- ]+$' then
    raise exception 'NAMA_TIDAK_VALID' using errcode = 'P0001';
  end if;
  foreach v_kata in array string_to_array(v_nama, ' ') loop
    if length(regexp_replace(v_kata, '[^[:alpha:]]', '', 'g')) < 2 then
      raise exception 'NAMA_TIDAK_LENGKAP' using errcode = 'P0001';
    end if;
    v_jml := v_jml + 1;
  end loop;
  if v_jml < 2 or length(v_nama) > 80 then
    raise exception 'NAMA_TIDAK_LENGKAP' using errcode = 'P0001';
  end if;

  if p_kategori is null or p_kategori not in ('Pegawai','Magang','Outsourcing') then
    raise exception 'KATEGORI_KOSONG' using errcode = 'P0001';
  end if;
  if p_satker is null or not exists (select 1 from public.satker s where s.nama = p_satker) then
    raise exception 'SATKER_KOSONG' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.presensi p where p.device_id = p_device) then
    raise exception 'PERANGKAT_SUDAH_ABSEN' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.presensi p where p.nama_norm = v_norm) then
    raise exception 'NAMA_SUDAH_TERDAFTAR' using errcode = 'P0001';
  end if;

  loop
    v_coba := v_coba + 1;
    v_kode := lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    begin
      insert into public.presensi (nama, nama_norm, kategori, satker, kode, device_id, fingerprint, user_agent)
      values (v_nama, v_norm, p_kategori, p_satker, v_kode, p_device, left(p_fingerprint, 128), left(p_user_agent, 300));
      exit;
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      if v_con = 'presensi_kode_unik' and v_coba < 30 then
        continue;
      elsif v_con = 'presensi_perangkat_unik' then
        raise exception 'PERANGKAT_SUDAH_ABSEN' using errcode = 'P0001';
      elsif v_con = 'presensi_nama_unik' then
        raise exception 'NAMA_SUDAH_TERDAFTAR' using errcode = 'P0001';
      else
        raise exception 'GAGAL_MEMBUAT_KODE' using errcode = 'P0001';
      end if;
    end;
  end loop;

  return query
    select p.nama, p.kategori, p.satker, p.kode::text, p.created_at
    from public.presensi p where p.device_id = p_device;
end;
$$;

-- Ambil kembali tiket milik perangkat ini (mis. setelah halaman dimuat ulang)
create or replace function public.presensi_perangkat(p_device uuid)
returns table (nama text, kategori text, satker text, kode text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select p.nama, p.kategori, p.satker, p.kode::text, p.created_at
  from public.presensi p where p.device_id = p_device;
$$;

-- ---------------------------------------------------------------------
-- 6. Fungsi admin: fishbowl
-- ---------------------------------------------------------------------
create or replace function public.wajib_admin()
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'BUKAN_ADMIN' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.ambil_acak()
returns table (id bigint, nama text, kategori text, satker text, kode text, jumlah_terpilih int)
language plpgsql volatile security definer set search_path = public
as $$
declare v_id bigint;
begin
  perform public.wajib_admin();

  select p.id into v_id
  from public.presensi p
  where p.dalam_undian
  order by random()
  limit 1
  for update skip locked;

  if v_id is null then
    raise exception 'UNDIAN_KOSONG' using errcode = 'P0001';
  end if;

  update public.presensi p
     set jumlah_terpilih = p.jumlah_terpilih + 1,
         terakhir_terpilih = now()
   where p.id = v_id;

  insert into public.riwayat_undian (presensi_id, diambil_oleh) values (v_id, auth.uid());

  return query
    select p.id, p.nama, p.kategori, p.satker, p.kode::text, p.jumlah_terpilih
    from public.presensi p where p.id = v_id;
end;
$$;

create or replace function public.atur_undian(p_id bigint, p_dalam_undian boolean)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  perform public.wajib_admin();
  update public.presensi
     set dalam_undian = p_dalam_undian,
         dikeluarkan_pada = case when p_dalam_undian then null else now() end
   where id = p_id;
  if not found then
    raise exception 'DATA_TIDAK_DITEMUKAN' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Hak eksekusi fungsi
-- ---------------------------------------------------------------------
revoke all on function public.daftar_presensi(text,text,text,uuid,text,text) from public;
revoke all on function public.presensi_perangkat(uuid) from public;
revoke all on function public.ambil_acak() from public;
revoke all on function public.atur_undian(bigint,boolean) from public;
revoke all on function public.wajib_admin() from public;

grant execute on function public.daftar_presensi(text,text,text,uuid,text,text) to anon, authenticated;
grant execute on function public.presensi_perangkat(uuid) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.ambil_acak() to authenticated;
grant execute on function public.atur_undian(bigint,boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Menjadikan akun sebagai admin (jalankan setelah membuat user di
--    Authentication → Users). Ganti email di bawah lalu jalankan:
--
--    insert into public.admins (user_id, email)
--    select id, email from auth.users where email = 'admin@contoh.go.id'
--    on conflict do nothing;
-- ---------------------------------------------------------------------
