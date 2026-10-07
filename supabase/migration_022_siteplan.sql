-- ============================================================
-- Zafira Property — Migration 022
-- Siteplan sebagai pusat visual penjualan.
--
-- Sebelum migrasi ini siteplan hanyalah satu kolom gambar di `projects`:
-- satu proyek satu gambar, dan peta yang benar-benar bisa diklik per kavling
-- hanya ada untuk Kaligangsa — geometrinya ditulis mati di dalam kode
-- (src/data/siteplanKaligangsa.js). Menambah siteplan baru berarti meminta
-- developer menjalankan skrip Python.
--
-- Kini:
--   1. `siteplans`        — banyak siteplan per proyek (Tahap 1, Cluster A, …)
--   2. `units.bentuk`     — poligon kavling di atas kanvas siteplannya, plus
--                            atribut pemasaran: luas, posisi (hook dsb.), hadap
--   3. `siteplan_fasilitas` — masjid, taman, jalan: digambar, tidak dijual
--   4. `unit_holds`       — kavling ditahan untuk satu prospek, berbatas waktu
--   5. `unit_minat`       — prospek mana meminati kavling mana
--   6. Booking menghormati hold; hold terlepas sendiri saat unit terjual atau
--      prospeknya batal
--   7. RPC peta, laju penjualan, editor, dan halaman publik
--   8. Geometri Kaligangsa dipindah dari kode ke database
--
-- Aman dijalankan ulang.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Siteplan
-- ------------------------------------------------------------

create table if not exists siteplans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  nama text not null,
  keterangan text,
  -- Gambar latar (opsional). Direntang tepat selebar × setinggi kanvas,
  -- sehingga koordinat kavling selalu sejajar dengan gambarnya.
  gambar_url text,
  lebar numeric(8,1) not null default 1000 check (lebar > 0),
  tinggi numeric(8,1) not null default 700 check (tinggi > 0),
  urutan int not null default 0,
  -- Nomor WhatsApp yang dituju tombol "Tanya unit ini" di halaman publik.
  kontak_wa text,
  publik boolean not null default false,
  -- 128 bit acak. Tidak bisa ditebak, dan bisa diganti untuk mematikan
  -- tautan lama yang sudah telanjur tersebar.
  publik_token text not null default replace(gen_random_uuid()::text, '-', ''),
  publik_tampil_harga boolean not null default true,
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (project_id, nama),
  unique (publik_token)
);

alter table siteplans enable row level security;

drop policy if exists "siteplans_select" on siteplans;
create policy "siteplans_select" on siteplans for select to authenticated using (me() is not null);
-- Sama dengan units_write (migrasi 008): data referensi proyek.
drop policy if exists "siteplans_write" on siteplans;
create policy "siteplans_write" on siteplans for all to authenticated
  using (can_manage_config() or can_write_berkas())
  with check (can_manage_config() or can_write_berkas());

create index if not exists idx_siteplans_project on siteplans (project_id, urutan);


-- ------------------------------------------------------------
-- 2. Kavling: bentuk dan atribut pemasaran
--
-- `bentuk` berformat atribut `points` milik <polygon> SVG ("x,y x,y …"),
-- dalam satuan kanvas siteplannya — siap dipakai apa adanya oleh peta.
-- ------------------------------------------------------------

alter table units add column if not exists siteplan_id uuid references siteplans(id) on delete set null;
alter table units add column if not exists bentuk text;
alter table units add column if not exists luas_tanah numeric(8,2);
alter table units add column if not exists luas_bangunan numeric(8,2);
alter table units add column if not exists posisi text;
alter table units add column if not exists hadap text;
alter table units add column if not exists catatan text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'units_bentuk_check') then
    alter table units add constraint units_bentuk_check check (
      bentuk is null
      or bentuk ~ '^\s*-?[0-9]+(\.[0-9]+)?,-?[0-9]+(\.[0-9]+)?(\s+-?[0-9]+(\.[0-9]+)?,-?[0-9]+(\.[0-9]+)?){2,}\s*$'
    );
  end if;
  -- Bentuk tanpa siteplan tidak punya kanvas untuk digambar.
  if not exists (select 1 from pg_constraint where conname = 'units_bentuk_siteplan_check') then
    alter table units add constraint units_bentuk_siteplan_check check (bentuk is null or siteplan_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'units_posisi_check') then
    alter table units add constraint units_posisi_check
      check (posisi is null or posisi in ('standar', 'hook', 'dekat_fasum', 'jalan_utama'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'units_hadap_check') then
    alter table units add constraint units_hadap_check
      check (hadap is null or hadap in ('utara', 'timur_laut', 'timur', 'tenggara', 'selatan', 'barat_daya', 'barat', 'barat_laut'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'units_luas_check') then
    alter table units add constraint units_luas_check
      check ((luas_tanah is null or luas_tanah > 0) and (luas_bangunan is null or luas_bangunan >= 0));
  end if;
end $$;

create index if not exists idx_units_siteplan on units (siteplan_id);

-- Kavling dan siteplannya harus satu proyek. Tanpa penjaga ini, kavling
-- proyek A bisa tergambar di siteplan proyek B dan dihitung dua kali.
create or replace function units_cek_siteplan()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.siteplan_id is not null
     and not exists (select 1 from siteplans s where s.id = new.siteplan_id and s.project_id = new.project_id) then
    raise exception 'Kavling % dan siteplannya berasal dari proyek yang berbeda.', new.unit_code;
  end if;
  return new;
end $$;

drop trigger if exists units_cek_siteplan on units;
create trigger units_cek_siteplan
  before insert or update of siteplan_id, project_id on units
  for each row execute function units_cek_siteplan();

-- Menghapus siteplan melepas kavlingnya dari peta, bukan menghapus unitnya:
-- booking, KPR, dan pembayaran tetap menempel pada unit. Bentuknya dikosongkan
-- lebih dulu — tanpa itu ON DELETE SET NULL menabrak units_bentuk_siteplan_check.
create or replace function siteplans_lepas_kavling()
returns trigger language plpgsql set search_path = public as $$
begin
  update units set bentuk = null where siteplan_id = old.id and bentuk is not null;
  return old;
end $$;

drop trigger if exists siteplans_lepas_kavling on siteplans;
create trigger siteplans_lepas_kavling
  before delete on siteplans
  for each row execute function siteplans_lepas_kavling();


-- ------------------------------------------------------------
-- 3. Fasilitas — digambar, tidak dijual
-- ------------------------------------------------------------

create table if not exists siteplan_fasilitas (
  id uuid primary key default gen_random_uuid(),
  siteplan_id uuid not null references siteplans(id) on delete cascade,
  label text not null,
  jenis text not null default 'fasum'
    check (jenis in ('fasum', 'taman', 'ibadah', 'jalan', 'komersial', 'lainnya')),
  bentuk text not null
    check (bentuk ~ '^\s*-?[0-9]+(\.[0-9]+)?,-?[0-9]+(\.[0-9]+)?(\s+-?[0-9]+(\.[0-9]+)?,-?[0-9]+(\.[0-9]+)?){2,}\s*$'),
  created_at timestamptz not null default now()
);

alter table siteplan_fasilitas enable row level security;

drop policy if exists "siteplan_fasilitas_select" on siteplan_fasilitas;
create policy "siteplan_fasilitas_select" on siteplan_fasilitas for select to authenticated using (me() is not null);
drop policy if exists "siteplan_fasilitas_write" on siteplan_fasilitas;
create policy "siteplan_fasilitas_write" on siteplan_fasilitas for all to authenticated
  using (can_manage_config() or can_write_berkas())
  with check (can_manage_config() or can_write_berkas());

create index if not exists idx_siteplan_fasilitas on siteplan_fasilitas (siteplan_id);


-- ------------------------------------------------------------
-- 4. Hold kavling
--
-- Di lapangan, dua sales yang sama-sama menjanjikan kavling hook terakhir
-- kepada dua prospek berbeda adalah masalah yang baru ketahuan saat kedua
-- prospek datang membawa booking fee. Hold membuat janji itu tercatat dan
-- terlihat oleh semua orang, dengan batas waktu supaya kavling tidak
-- tertahan selamanya oleh prospek yang menghilang.
--
-- Hold aktif = dilepas_at kosong DAN berakhir di masa depan. Hold yang lewat
-- waktunya tidak perlu cron untuk berhenti berlaku: setiap pembaca memeriksa
-- `berakhir`, dan baris yang kedaluwarsa ditutup saat kavling ditahan lagi.
--
-- Tidak ada policy tulis: hold hanya berubah lewat tahan_kavling,
-- lepas_hold, dan perpanjang_hold, yang menegakkan seluruh aturannya.
-- ------------------------------------------------------------

create table if not exists unit_holds (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  held_by uuid references profiles(id),
  mulai timestamptz not null default now(),
  berakhir timestamptz not null,
  diperpanjang int not null default 0,
  catatan text,
  dilepas_at timestamptz,
  dilepas_by uuid references profiles(id),
  alasan_lepas text,
  created_at timestamptz not null default now()
);

alter table unit_holds enable row level security;

-- Semua orang melihat kavling mana yang ditahan — itulah gunanya. Nama
-- prospeknya tetap terlindung RLS pada leads.
drop policy if exists "unit_holds_select" on unit_holds;
create policy "unit_holds_select" on unit_holds for select to authenticated using (me() is not null);

-- Satu hold terbuka per kavling, dan satu per prospek.
create unique index if not exists uq_unit_holds_unit_terbuka on unit_holds (unit_id) where dilepas_at is null;
create unique index if not exists uq_unit_holds_lead_terbuka on unit_holds (lead_id) where dilepas_at is null;
create index if not exists idx_unit_holds_penahan on unit_holds (held_by) where dilepas_at is null;

insert into app_settings (key, value, description) values
  ('hold_jam',            '24', 'Lama hold kavling (jam) sebelum terlepas otomatis'),
  ('hold_maks_per_sales', '3',  'Jumlah hold aktif maksimal per orang (0 = tanpa batas)')
on conflict (key) do nothing;

/** Angka dari app_settings; nilai rusak jatuh ke bawaan, bukan error. */
create or replace function app_setting_int(p_key text, p_bawaan int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value::int from app_settings where key = p_key and value ~ '^\s*[0-9]+\s*$'),
    p_bawaan);
$$;

create or replace function tahan_kavling(p_unit_id uuid, p_lead_id uuid, p_catatan text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_unit  units%rowtype;
  v_lead  leads%rowtype;
  v_ada   unit_holds%rowtype;
  v_jam   int := greatest(1, app_setting_int('hold_jam', 24));
  v_maks  int := app_setting_int('hold_maks_per_sales', 3);
  v_id    uuid;
begin
  if not (can_write_sales() or can_write_berkas()) then
    raise exception 'Anda tidak berhak menahan kavling.' using errcode = '42501';
  end if;

  select * into v_lead from leads where id = p_lead_id;
  if not found then
    raise exception 'Prospek tidak ditemukan.';
  end if;
  if not (can_view_all() or owns_lead(p_lead_id)) then
    raise exception 'Prospek ini bukan milik Anda.' using errcode = '42501';
  end if;
  if v_lead.status = 'cancel' then
    raise exception 'Prospek ini sudah dibatalkan.';
  end if;
  if exists (select 1 from customers where lead_id = p_lead_id) then
    raise exception 'Prospek ini sudah booking — hold tidak diperlukan lagi.';
  end if;

  -- Dikunci supaya dua sales yang menekan Tahan bersamaan tidak sama-sama lolos.
  select * into v_unit from units where id = p_unit_id for update;
  if not found then
    raise exception 'Kavling tidak ditemukan.';
  end if;
  if v_unit.status <> 'tersedia' then
    raise exception 'Kavling % sudah berstatus %.', v_unit.unit_code, v_unit.status;
  end if;

  update unit_holds
     set dilepas_at = berakhir, alasan_lepas = 'kedaluwarsa'
   where (unit_id = p_unit_id or lead_id = p_lead_id)
     and dilepas_at is null
     and berakhir <= now();

  select * into v_ada from unit_holds where unit_id = p_unit_id and dilepas_at is null;
  if found then
    raise exception 'Kavling % sedang ditahan sampai %.', v_unit.unit_code,
      to_char(v_ada.berakhir at time zone 'Asia/Jakarta', 'DD/MM HH24:MI');
  end if;

  select * into v_ada from unit_holds where lead_id = p_lead_id and dilepas_at is null;
  if found then
    raise exception 'Prospek ini sudah menahan kavling %. Lepaskan dahulu sebelum menahan kavling lain.',
      (select unit_code from units where id = v_ada.unit_id);
  end if;

  if not is_admin() and v_maks > 0
     and (select count(*) from unit_holds
           where held_by = me() and dilepas_at is null and berakhir > now()) >= v_maks then
    raise exception 'Batas % hold aktif per orang sudah tercapai. Lepaskan salah satu dahulu.', v_maks;
  end if;

  insert into unit_holds (unit_id, lead_id, held_by, berakhir, catatan)
  values (p_unit_id, p_lead_id, me(), now() + make_interval(hours => v_jam), nullif(btrim(p_catatan), ''))
  returning id into v_id;

  return v_id;
end $$;

-- REVISI §2.1: Supervisor Marketing memantau tanpa intervensi operasional,
-- jadi melepas hold orang lain hanya Admin dan Admin Marketing.
create or replace function lepas_hold(p_hold_id uuid, p_alasan text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v unit_holds%rowtype;
begin
  select * into v from unit_holds where id = p_hold_id for update;
  if not found then
    raise exception 'Hold tidak ditemukan.';
  end if;
  if v.dilepas_at is not null then
    return;
  end if;
  if not (v.held_by = me() or is_admin() or is_admin_marketing()) then
    raise exception 'Hanya penahan, Admin, atau Admin Marketing yang dapat melepas hold ini.'
      using errcode = '42501';
  end if;

  update unit_holds
     set dilepas_at = now(),
         dilepas_by = me(),
         alasan_lepas = coalesce(nullif(btrim(p_alasan), ''), 'dilepas manual')
   where id = p_hold_id;
end $$;

-- Penahan tidak bisa memperpanjang holdnya sendiri — kalau bisa, batas
-- waktunya tidak pernah benar-benar berlaku.
create or replace function perpanjang_hold(p_hold_id uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v       unit_holds%rowtype;
  v_baru  timestamptz;
begin
  if not (is_admin() or is_admin_marketing()) then
    raise exception 'Perpanjangan hold hanya oleh Admin atau Admin Marketing.' using errcode = '42501';
  end if;

  select * into v from unit_holds where id = p_hold_id for update;
  if not found then
    raise exception 'Hold tidak ditemukan.';
  end if;
  if v.dilepas_at is not null or v.berakhir <= now() then
    raise exception 'Hold ini sudah tidak aktif.';
  end if;

  update unit_holds
     set berakhir = berakhir + make_interval(hours => greatest(1, app_setting_int('hold_jam', 24))),
         diperpanjang = diperpanjang + 1
   where id = p_hold_id
  returning berakhir into v_baru;

  return v_baru;
end $$;

-- Unit yang tidak lagi tersedia tidak bisa ditahan siapa pun.
create or replace function units_lepas_hold()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'tersedia' and old.status = 'tersedia' then
    update unit_holds
       set dilepas_at = now(), dilepas_by = auth.uid(), alasan_lepas = 'unit ' || new.status::text
     where unit_id = new.id and dilepas_at is null;
  end if;
  return null;
end $$;

drop trigger if exists units_lepas_hold on units;
create trigger units_lepas_hold
  after update of status on units
  for each row execute function units_lepas_hold();

create or replace function leads_lepas_hold()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancel' and old.status is distinct from 'cancel' then
    update unit_holds
       set dilepas_at = now(), dilepas_by = auth.uid(), alasan_lepas = 'prospek dibatalkan'
     where lead_id = new.id and dilepas_at is null;
  end if;
  return null;
end $$;

drop trigger if exists leads_lepas_hold on leads;
create trigger leads_lepas_hold
  after update of status on leads
  for each row execute function leads_lepas_hold();


-- ------------------------------------------------------------
-- 5. Minat prospek per kavling
-- ------------------------------------------------------------

create table if not exists unit_minat (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  dicatat_oleh uuid references profiles(id) default auth.uid(),
  catatan text,
  created_at timestamptz not null default now(),
  unique (unit_id, lead_id)
);

alter table unit_minat enable row level security;

-- Barisnya (siapa meminati apa) mengikuti hak baca prospeknya. Jumlah per
-- kavling tetap terlihat semua orang lewat siteplan_minat_hitung().
drop policy if exists "unit_minat_select" on unit_minat;
create policy "unit_minat_select" on unit_minat for select to authenticated
  using (can_view_all() or owns_lead(lead_id));
drop policy if exists "unit_minat_insert" on unit_minat;
create policy "unit_minat_insert" on unit_minat for insert to authenticated
  with check (can_write_berkas() or (can_write_sales() and owns_lead(lead_id)));
drop policy if exists "unit_minat_delete" on unit_minat;
create policy "unit_minat_delete" on unit_minat for delete to authenticated
  using (can_write_berkas() or (can_write_sales() and owns_lead(lead_id)));

create index if not exists idx_unit_minat_lead on unit_minat (lead_id);


-- ------------------------------------------------------------
-- 6. Booking menghormati hold
--
-- Disalin dari migration_017 apa adanya, ditambah dua hal: kavling yang
-- ditahan untuk prospek LAIN ditolak, dan hold milik prospek ini ditutup
-- dengan alasan 'booking'.
-- ------------------------------------------------------------

create or replace function convert_lead_to_customer(
  p_lead_id          uuid,
  p_unit_id          uuid    default null,
  p_nominal_booking  numeric default null,
  p_tanggal_booking  date    default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lead      leads%rowtype;
  v_unit      units%rowtype;
  v_hold      unit_holds%rowtype;
  v_customer  uuid;
begin
  if not (can_write_sales() or can_write_berkas()) then
    raise exception 'Anda tidak berhak melakukan konversi booking.'
      using errcode = '42501';
  end if;

  select * into v_lead from leads where id = p_lead_id;
  if not found then
    raise exception 'Prospek tidak ditemukan.';
  end if;

  if not (can_view_all() or owns_lead(p_lead_id)) then
    raise exception 'Prospek ini bukan milik Anda.' using errcode = '42501';
  end if;

  if v_lead.status = 'cancel' then
    raise exception 'Prospek ini sudah dibatalkan dan tidak bisa dikonversi.';
  end if;

  -- Saringan awal adalah saringan, bukan formalitas. Booking yang diterima
  -- setelah BI-Checking gagal adalah booking yang sudah pasti batal, dan
  -- uangnya sudah telanjur berpindah tangan.
  if v_lead.bi_checking_status = 'tidak_lolos' then
    raise exception 'BI-Checking prospek ini tidak lolos. Selesaikan dahulu sebelum booking dicatat.';
  end if;

  if exists (select 1 from customers where lead_id = p_lead_id) then
    raise exception 'Prospek ini sudah pernah dikonversi menjadi konsumen.';
  end if;

  if p_unit_id is not null then
    select * into v_unit from units where id = p_unit_id for update;
    if not found then
      raise exception 'Unit tidak ditemukan.';
    end if;
    if v_unit.status <> 'tersedia' then
      raise exception 'Unit % sudah berstatus %.', v_unit.unit_code, v_unit.status;
    end if;

    select * into v_hold from unit_holds
     where unit_id = p_unit_id and dilepas_at is null and berakhir > now();
    if found and v_hold.lead_id <> p_lead_id then
      raise exception 'Kavling % sedang ditahan untuk prospek lain sampai %.', v_unit.unit_code,
        to_char(v_hold.berakhir at time zone 'Asia/Jakarta', 'DD/MM HH24:MI');
    end if;
  end if;

  -- Hold prospek ini — di kavling mana pun — selesai karena ia sudah booking.
  update unit_holds
     set dilepas_at = now(), dilepas_by = me(), alasan_lepas = 'booking'
   where lead_id = p_lead_id and dilepas_at is null;

  insert into customers (lead_id, unit_id, sales_agent_id, name, phone, email, status, penghasilan)
  values (p_lead_id, p_unit_id, coalesce(v_lead.assigned_to, me()),
          v_lead.name, v_lead.phone, v_lead.email, 'proses', v_lead.gaji)
  returning id into v_customer;

  if p_unit_id is not null then
    update units set status = 'booking' where id = p_unit_id;
  end if;

  if p_nominal_booking is not null and p_nominal_booking > 0 then
    insert into payments (customer_id, payment_type, amount, payment_date, status)
    values (v_customer, 'booking', p_nominal_booking, p_tanggal_booking, 'menunggu');
  end if;

  insert into customer_kpr (
    customer_id, tanggal_booking, nominal_booking,
    tanggal_survei, catatan_survei,
    bi_checking_status, bi_checking_tanggal, bi_checking_catatan,
    penghasilan_verifikasi
  )
  values (
    v_customer, p_tanggal_booking, p_nominal_booking,
    v_lead.tanggal_survei, v_lead.catatan_survei,
    v_lead.bi_checking_status, v_lead.bi_checking_tanggal, v_lead.bi_checking_catatan,
    v_lead.gaji
  )
  on conflict (customer_id) do nothing;

  -- Lampiran survei dan BI-Checking ikut pindah kepemilikan, bukan disalin:
  -- berkas yang sama tidak boleh punya dua baris yang bisa menyimpang.
  update berkas_lampiran
     set customer_id = v_customer
   where lead_id = p_lead_id
     and customer_id is null;

  insert into lead_activities (lead_id, customer_id, actor_id, activity, hasil, note)
  values (p_lead_id, v_customer, me(), 'Konversi ke Booking', 'Booking',
          format('Unit %s · Booking fee %s',
                 coalesce(v_unit.unit_code, '—'),
                 coalesce('Rp' || to_char(p_nominal_booking, 'FM999G999G999G999'), '—')));

  return v_customer;
end;
$$;

grant execute on function convert_lead_to_customer(uuid, uuid, numeric, date) to authenticated;


-- ------------------------------------------------------------
-- 7. RPC
-- ------------------------------------------------------------

/**
 * Jumlah prospek aktif yang meminati tiap kavling.
 *
 * SECURITY DEFINER karena angka inilah yang membuat peta "Minat" berguna
 * bagi Sales: kavling yang diminati empat prospek tim lain adalah kavling
 * yang harus segera ditawarkan. Yang keluar hanya hitungan, tanpa nama.
 * Prospek batal atau yang sudah booking tidak lagi dihitung.
 */
create or replace function siteplan_minat_hitung(p_siteplan_id uuid)
returns table (unit_id uuid, jumlah int)
language sql stable security definer set search_path = public as $$
  select m.unit_id, count(*)::int
    from unit_minat m
    join units u on u.id = m.unit_id
    join leads l on l.id = m.lead_id
   where u.siteplan_id = p_siteplan_id
     and me() is not null
     and l.status <> 'cancel'
     and not exists (select 1 from customers c where c.lead_id = l.id)
   group by m.unit_id;
$$;

/**
 * Satu baris per kavling pada siteplan, lengkap dengan konsumen, tahap KPR,
 * pembayaran, progres bangun, hold, dan minat — sumber seluruh mode peta.
 *
 * SECURITY INVOKER: konsumen, KPR, dan pembayaran mengikuti RLS-nya
 * masing-masing. Sales melihat kavling terjual milik rekannya sebagai
 * "terjual" tanpa nama pembelinya.
 *
 * Tahap KPR diturunkan dari tanggal yang sudah terisi, sama seperti
 * KprStepper — tidak ada kolom status kedua yang bisa menyimpang.
 */
create or replace function siteplan_peta(p_siteplan_id uuid)
returns json
language sql stable security invoker set search_path = public as $$
  with
  u as (select * from units where siteplan_id = p_siteplan_id),
  hold as (
    select h.unit_id, h.id, h.lead_id, h.held_by, h.mulai, h.berakhir, h.diperpanjang, h.catatan,
           l.name as lead_nama, p.full_name as penahan
      from unit_holds h
      left join leads l on l.id = h.lead_id
      left join profiles p on p.id = h.held_by
     where h.dilepas_at is null and h.berakhir > now()
       and h.unit_id in (select id from u)
  ),
  minat as (select * from siteplan_minat_hitung(p_siteplan_id)),
  cust as (
    select distinct on (c.unit_id)
           c.unit_id, c.id, c.lead_id, c.name, c.phone, c.status, c.locked_at, c.sales_agent_id,
           p.full_name as sales_nama
      from customers c
      left join profiles p on p.id = c.sales_agent_id
     where c.unit_id in (select id from u) and c.status <> 'batal'
     order by c.unit_id, c.created_at desc
  ),
  bayar as (
    select py.customer_id,
           coalesce(sum(py.amount) filter (where py.status = 'terverifikasi'), 0) as terverifikasi,
           count(*) filter (where py.status = 'menunggu_verifikasi') as menunggu_verifikasi,
           count(*) filter (where py.status = 'menunggu') as menunggu,
           bool_or(py.payment_type = 'booking' and py.status = 'terverifikasi') as booking_terverifikasi,
           coalesce(sum(py.amount) filter (where py.status = 'terverifikasi' and py.payment_type = 'dp'), 0) as dp_terverifikasi
      from payments py
     where py.customer_id in (select id from cust)
     group by py.customer_id
  ),
  fp as (
    select distinct on (f.unit_id) f.unit_id, f.progress_percent, f.status, f.target_end_date
      from field_projects f
     where f.unit_id in (select id from u)
     order by f.unit_id, f.created_at desc
  )
  select coalesce(json_agg(json_build_object(
    'id', u.id,
    'unit_code', u.unit_code,
    'block', u.block,
    'type', u.type,
    'price', u.price,
    'status', u.status,
    'luas_tanah', u.luas_tanah,
    'luas_bangunan', u.luas_bangunan,
    'posisi', u.posisi,
    'hadap', u.hadap,
    'catatan', u.catatan,
    'bentuk', u.bentuk,
    'minat', coalesce(m.jumlah, 0),
    'hold', case when h.id is null then null else json_build_object(
      'id', h.id, 'lead_id', h.lead_id, 'lead_nama', h.lead_nama, 'held_by', h.held_by,
      'penahan', h.penahan, 'mulai', h.mulai, 'berakhir', h.berakhir,
      'diperpanjang', h.diperpanjang, 'catatan', h.catatan) end,
    'konsumen', case when c.id is null then null else json_build_object(
      'id', c.id, 'lead_id', c.lead_id, 'nama', c.name, 'telepon', c.phone, 'status', c.status,
      'terkunci', c.locked_at is not null, 'sales_id', c.sales_agent_id, 'sales_nama', c.sales_nama) end,
    'kpr', case when k.id is null then null else json_build_object(
      'tahap', case
                 when k.tanggal_serah_terima_kunci is not null then 'serah_terima'
                 when k.tanggal_akad is not null then 'akad'
                 when k.tanggal_sp3k_terbit is not null then 'sp3k'
                 when k.tanggal_masuk_bank is not null then 'bank'
                 when k.tanggal_dp is not null then 'dp'
                 else 'booking'
               end,
      'nama_bank', k.nama_bank,
      'tanggal_booking', k.tanggal_booking,
      'tanggal_masuk_bank', k.tanggal_masuk_bank,
      'tanggal_sp3k_terbit', k.tanggal_sp3k_terbit,
      'tanggal_sp3k_expired', k.tanggal_sp3k_expired,
      'tanggal_akad', k.tanggal_akad,
      'tanggal_serah_terima', k.tanggal_serah_terima_kunci,
      'nominal_total_dp', k.nominal_total_dp) end,
    'bayar', case when c.id is null then null else json_build_object(
      'terverifikasi', coalesce(b.terverifikasi, 0),
      'dp_terverifikasi', coalesce(b.dp_terverifikasi, 0),
      'menunggu_verifikasi', coalesce(b.menunggu_verifikasi, 0),
      'menunggu', coalesce(b.menunggu, 0),
      'booking_terverifikasi', coalesce(b.booking_terverifikasi, false)) end,
    'progres', case when f.unit_id is null then null else json_build_object(
      'persen', f.progress_percent, 'status', f.status, 'target', f.target_end_date) end
  ) order by u.block nulls last, length(u.unit_code), u.unit_code), '[]'::json)
  from u
  left join hold h on h.unit_id = u.id
  left join minat m on m.unit_id = u.id
  left join cust c on c.unit_id = u.id
  left join customer_kpr k on k.customer_id = c.id
  left join bayar b on b.customer_id = c.id
  left join fp f on f.unit_id = u.id;
$$;

/**
 * Laju penjualan per siteplan: booking per bulan dan rata-rata 90 hari
 * terakhir. Dihitung dari tanggal booking, bukan tanggal prospek dibuat.
 *
 * SECURITY DEFINER karena laju penjualan adalah angka perusahaan, bukan
 * angka per agen — Sales yang hanya melihat konsumennya sendiri akan
 * mendapat laju yang keliru. Yang keluar hanya hitungan.
 */
create or replace function siteplan_penjualan_bulanan(p_siteplan_id uuid, p_bulan int default 6)
returns json
language sql stable security definer set search_path = public as $$
  with
  hari_ini as (select (now() at time zone 'Asia/Jakarta')::date as d),
  jual as (
    select coalesce(k.tanggal_booking, (c.created_at at time zone 'Asia/Jakarta')::date) as tgl
      from customers c
      join units u on u.id = c.unit_id
      left join customer_kpr k on k.customer_id = c.id
     where u.siteplan_id = p_siteplan_id
       and c.status <> 'batal'
  ),
  bulan as (
    select generate_series(
             date_trunc('month', (select d from hari_ini)::timestamp) - make_interval(months => greatest(1, least(p_bulan, 24)) - 1),
             date_trunc('month', (select d from hari_ini)::timestamp),
             interval '1 month')::date as awal
  )
  select case when me() is null then null else json_build_object(
    'per_bulan', (
      select coalesce(json_agg(json_build_object(
               'bulan', b.awal,
               'jumlah', (select count(*) from jual j where date_trunc('month', j.tgl::timestamp)::date = b.awal))
             order by b.awal), '[]'::json)
        from bulan b),
    'terjual_90_hari', (select count(*) from jual j where j.tgl > (select d from hari_ini) - 90),
    'rata_per_bulan', (select round(count(*)::numeric / 3, 1) from jual j where j.tgl > (select d from hari_ini) - 90)
  ) end;
$$;

/**
 * Menyimpan kavling hasil editor dalam satu transaksi.
 *
 * Tiap butir:
 *   · punya `id`      → kavling itu diperbarui (hanya kunci yang dikirim)
 *   · tanpa `id`      → dicari lewat kode pada proyek yang sama; bila ada
 *                       dan belum digambar, kavlingnya disambungkan ke peta
 *                       — riwayat booking dan pembayarannya tetap utuh;
 *                       bila belum ada, unit baru dibuat berstatus tersedia.
 *
 * SECURITY INVOKER: RLS units_write tetap berlaku.
 */
create or replace function simpan_kavling(p_siteplan_id uuid, p_kavling jsonb)
returns json
language plpgsql security invoker set search_path = public as $$
declare
  v_sp           siteplans%rowtype;
  v_item         jsonb;
  v_unit         units%rowtype;
  v_kode         text;
  v_ganda        text;
  v_dibuat       int := 0;
  v_disambung    int := 0;
  v_diubah       int := 0;
begin
  if not (can_manage_config() or can_write_berkas()) then
    raise exception 'Anda tidak berhak mengubah siteplan.' using errcode = '42501';
  end if;

  select * into v_sp from siteplans where id = p_siteplan_id;
  if not found then
    raise exception 'Siteplan tidak ditemukan.';
  end if;
  if jsonb_typeof(p_kavling) is distinct from 'array' then
    raise exception 'Format kavling tidak dikenali.';
  end if;

  select k into v_ganda
    from (select upper(btrim(x->>'unit_code')) k
            from jsonb_array_elements(p_kavling) x
           where nullif(btrim(x->>'unit_code'), '') is not null) t
   group by k having count(*) > 1
   limit 1;
  if v_ganda is not null then
    raise exception 'Kode % muncul lebih dari sekali.', v_ganda;
  end if;

  for v_item in select * from jsonb_array_elements(p_kavling) loop
    v_kode := nullif(btrim(v_item->>'unit_code'), '');

    if nullif(v_item->>'id', '') is not null then
      select * into v_unit from units where id = (v_item->>'id')::uuid for update;
      if not found or v_unit.project_id <> v_sp.project_id then
        raise exception 'Kavling tidak ditemukan pada proyek ini.';
      end if;
      v_diubah := v_diubah + 1;
    else
      if v_kode is null then
        raise exception 'Kode kavling wajib diisi.';
      end if;

      select * into v_unit from units
       where project_id = v_sp.project_id and upper(btrim(unit_code)) = upper(v_kode)
       for update;

      if not found then
        insert into units (project_id, siteplan_id, unit_code, block, type, price,
                           luas_tanah, luas_bangunan, posisi, hadap, catatan, bentuk)
        values (v_sp.project_id, p_siteplan_id, v_kode,
                nullif(btrim(v_item->>'block'), ''),
                nullif(btrim(v_item->>'type'), ''),
                nullif(v_item->>'price', '')::numeric,
                nullif(v_item->>'luas_tanah', '')::numeric,
                nullif(v_item->>'luas_bangunan', '')::numeric,
                nullif(v_item->>'posisi', ''),
                nullif(v_item->>'hadap', ''),
                nullif(btrim(v_item->>'catatan'), ''),
                nullif(btrim(v_item->>'bentuk'), ''));
        v_dibuat := v_dibuat + 1;
        continue;
      end if;

      if v_unit.bentuk is not null then
        raise exception 'Kavling % sudah digambar di %.', v_unit.unit_code,
          case when v_unit.siteplan_id = p_siteplan_id then 'siteplan ini'
               else 'siteplan lain pada proyek ini' end;
      end if;
      -- Disambung, bukan diganti nama: "a12" yang diketik di editor tetap
      -- menunjuk "A12" yang sudah tercetak di berkas KPR.
      v_kode := v_unit.unit_code;
      v_disambung := v_disambung + 1;
    end if;

    if v_kode is not null and upper(v_kode) <> upper(btrim(v_unit.unit_code))
       and exists (select 1 from units
                    where project_id = v_sp.project_id
                      and upper(btrim(unit_code)) = upper(v_kode)
                      and id <> v_unit.id) then
      raise exception 'Kode % sudah dipakai kavling lain pada proyek ini.', v_kode;
    end if;

    update units set
      siteplan_id   = p_siteplan_id,
      unit_code     = coalesce(v_kode, unit_code),
      block         = case when v_item ? 'block'         then nullif(btrim(v_item->>'block'), '')          else block end,
      type          = case when v_item ? 'type'          then nullif(btrim(v_item->>'type'), '')           else type end,
      price         = case when v_item ? 'price'         then nullif(v_item->>'price', '')::numeric        else price end,
      luas_tanah    = case when v_item ? 'luas_tanah'    then nullif(v_item->>'luas_tanah', '')::numeric   else luas_tanah end,
      luas_bangunan = case when v_item ? 'luas_bangunan' then nullif(v_item->>'luas_bangunan', '')::numeric else luas_bangunan end,
      posisi        = case when v_item ? 'posisi'        then nullif(v_item->>'posisi', '')                else posisi end,
      hadap         = case when v_item ? 'hadap'         then nullif(v_item->>'hadap', '')                 else hadap end,
      catatan       = case when v_item ? 'catatan'       then nullif(btrim(v_item->>'catatan'), '')        else catatan end,
      bentuk        = case when v_item ? 'bentuk'        then nullif(btrim(v_item->>'bentuk'), '')         else bentuk end
    where id = v_unit.id;
  end loop;

  return json_build_object('dibuat', v_dibuat, 'disambung', v_disambung, 'diubah', v_diubah);
end $$;

/**
 * Halaman publik untuk calon pembeli — tanpa login.
 *
 * Hanya siteplan yang dinyalakan publiknya, lewat token acaknya. Tidak ada
 * nama konsumen, sales, atau hold siapa pun: status disederhanakan menjadi
 * tersedia / dipesan / terjual, dan harga hanya untuk kavling yang masih
 * tersedia bila diizinkan.
 */
create or replace function siteplan_publik(p_token text)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'nama', s.nama,
    'keterangan', s.keterangan,
    'proyek', p.name,
    'lokasi', p.location,
    'lebar', s.lebar,
    'tinggi', s.tinggi,
    'gambar_url', s.gambar_url,
    'kontak_wa', s.kontak_wa,
    'tampil_harga', s.publik_tampil_harga,
    'fasilitas', (
      select coalesce(json_agg(json_build_object('label', f.label, 'jenis', f.jenis, 'bentuk', f.bentuk)), '[]'::json)
        from siteplan_fasilitas f where f.siteplan_id = s.id),
    'kavling', (
      select coalesce(json_agg(json_build_object(
               'kode', x.unit_code,
               'blok', x.block,
               'tipe', x.type,
               'status', x.status_publik,
               'harga', case when s.publik_tampil_harga and x.status_publik = 'tersedia' then x.price end,
               'luas_tanah', x.luas_tanah,
               'luas_bangunan', x.luas_bangunan,
               'posisi', x.posisi,
               'hadap', x.hadap,
               'bentuk', x.bentuk)
             order by x.block nulls last, length(x.unit_code), x.unit_code), '[]'::json)
        from (
          select u.*,
                 case
                   when u.status = 'tersedia' and exists (
                     select 1 from unit_holds h
                      where h.unit_id = u.id and h.dilepas_at is null and h.berakhir > now()) then 'dipesan'
                   when u.status = 'tersedia' then 'tersedia'
                   when u.status = 'booking'  then 'dipesan'
                   when u.status = 'terjual'  then 'terjual'
                   else 'tidak_tersedia'
                 end as status_publik
            from units u
           where u.siteplan_id = s.id and u.bentuk is not null
        ) x)
  )
  from siteplans s
  join projects p on p.id = s.project_id
  where s.publik
    and p_token is not null
    and s.publik_token = p_token;
$$;

-- Fungsi SECURITY DEFINER tidak boleh terpanggil anon kecuali yang memang
-- untuk publik. Supabase memberi EXECUTE ke anon secara bawaan.
do $$
declare fn text;
begin
  foreach fn in array array[
    'app_setting_int(text, integer)',
    'tahan_kavling(uuid, uuid, text)',
    'lepas_hold(uuid, text)',
    'perpanjang_hold(uuid)',
    'siteplan_minat_hitung(uuid)',
    'siteplan_peta(uuid)',
    'siteplan_penjualan_bulanan(uuid, integer)',
    'simpan_kavling(uuid, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

revoke all on function siteplan_publik(text) from public;
grant execute on function siteplan_publik(text) to anon, authenticated;


-- ------------------------------------------------------------
-- 8. Notifikasi: hold milik saya yang segera berakhir
--
-- Disalin dari migration_017 apa adanya, ditambah kategori `hold`. Definisi
-- ini menimpa seluruh fungsi, jadi kategori yang tidak disalin akan hilang
-- diam-diam.
-- ------------------------------------------------------------

create or replace function my_notifications()
returns json
language sql stable security invoker set search_path = public as $$
  with
  followup as (
    select 'followup'::text as kategori,
           (case when l.tanggal_rencana < current_date then 'tinggi' else 'sedang' end)::text as urgensi,
           l.name::text as judul,
           (case when l.tanggal_rencana < current_date
                 then format('Terlewat %s hari', current_date - l.tanggal_rencana)
                 else 'Dijadwalkan hari ini' end)::text as detail,
           '/follow-up'::text as rute,
           l.id as record_id,
           l.tanggal_rencana as tanggal
      from leads l
     where l.tanggal_rencana is not null
       and l.tanggal_rencana <= current_date
       and l.status not in ('cancel', 'akad', 'aftersales')
  ),
  dingin as (
    select 'dingin'::text, 'sedang'::text, l.name::text,
           'Belum ada aktivitas 7 hari'::text, '/follow-up'::text, l.id, null::date
      from leads l
     where l.status in ('warm', 'hot')
       and not exists (
         select 1 from lead_activities a
          where a.lead_id = l.id
            and a.created_at > now() - interval '7 days')
  ),
  sp3k as (
    select 'sp3k'::text,
           (case when k.tanggal_sp3k_expired < current_date + 7 then 'tinggi' else 'sedang' end)::text,
           c.name::text,
           format('SP3K kedaluwarsa %s', to_char(k.tanggal_sp3k_expired, 'DD Mon YYYY'))::text,
           '/konsumen'::text, c.id, k.tanggal_sp3k_expired
      from customer_kpr k
      join customers c on c.id = k.customer_id
     where k.tanggal_sp3k_expired is not null
       and k.tanggal_akad is null
       and k.tanggal_sp3k_expired <= current_date + 14
  ),
  mandek as (
    select 'mandek'::text, 'tinggi'::text, c.name::text,
           format('%s hari di bank, SP3K belum terbit', current_date - k.tanggal_masuk_bank)::text,
           '/konsumen'::text, c.id, k.tanggal_masuk_bank
      from customer_kpr k
      join customers c on c.id = k.customer_id
     where k.tanggal_masuk_bank is not null
       and k.tanggal_sp3k_terbit is null
       and current_date - k.tanggal_masuk_bank > 30
  ),
  bi_checking as (
    select 'bi_checking'::text, 'tinggi'::text, c.name::text,
           (case when k.bi_checking_status = 'tidak_lolos'
                 then 'BI-Checking tidak lolos, tetapi berkas sudah di bank'
                 else 'Berkas sudah di bank tanpa hasil BI-Checking' end)::text,
           '/konsumen'::text, c.id, k.tanggal_masuk_bank
      from customer_kpr k join customers c on c.id = k.customer_id
     where k.tanggal_masuk_bank is not null
       and k.tanggal_sp3k_terbit is null
       and coalesce(k.bi_checking_status, '') <> 'lolos'
  ),
  rpc as (
    select 'rpc'::text, 'sedang'::text, c.name::text,
           format('Angsuran %s%% dari penghasilan', round(k.angsuran_bulanan / k.penghasilan_verifikasi * 100))::text,
           '/konsumen'::text, c.id, null::date
      from customer_kpr k join customers c on c.id = k.customer_id
     where k.penghasilan_verifikasi > 0
       and k.angsuran_bulanan > 0
       and k.tanggal_akad is null
       and k.angsuran_bulanan / k.penghasilan_verifikasi > 0.34
  ),
  berkas as (
    select 'berkas'::text, 'sedang'::text, c.name::text,
           format('%s dokumen wajib belum diunggah', r.kurang)::text,
           '/konsumen'::text, c.id, null::date
      from customer_kpr k
      join customers c on c.id = k.customer_id
      join lateral (
        select json_array_length(kelengkapan_berkas(k.customer_id)->'kurang') as kurang
      ) r on true
     where coalesce(k.nama_bank, '') <> ''
       and k.proses_bank_at is null
       and k.tanggal_sp3k_terbit is null
       and k.tanggal_akad is null
       and k.tanggal_serah_terima_kunci is null
       and c.status <> 'batal'
       and r.kurang > 0
  ),
  verifikasi as (
    select 'verifikasi'::text,
           (case when p.status = 'menunggu_verifikasi' then 'tinggi' else 'sedang' end)::text,
           c.name::text,
           format('%s · Rp%s · %s', replace(p.payment_type::text, '_', ' '),
                  to_char(p.amount, 'FM999G999G999G999'),
                  case when p.status = 'menunggu_verifikasi'
                       then 'bukti transfer siap diverifikasi'
                       else 'bukti transfer belum diunggah' end)::text,
           '/pembayaran'::text, p.id, p.payment_date
      from payments p
      join customers c on c.id = p.customer_id
     where p.status <> 'terverifikasi'
  ),
  -- Hold yang berakhir dalam 12 jam: kesempatan terakhir menagih booking fee
  -- sebelum kavlingnya kembali ke pasar. Hanya milik penahannya sendiri.
  hold as (
    select 'hold'::text,
           (case when h.berakhir < now() + interval '3 hours' then 'tinggi' else 'sedang' end)::text,
           format('%s · %s', u.unit_code, coalesce(l.name, 'prospek'))::text,
           format('Hold berakhir %s', to_char(h.berakhir at time zone 'Asia/Jakarta', 'DD/MM HH24:MI'))::text,
           '/siteplan'::text, u.id, (h.berakhir at time zone 'Asia/Jakarta')::date
      from unit_holds h
      join units u on u.id = h.unit_id
      left join leads l on l.id = h.lead_id
     where h.dilepas_at is null
       and h.berakhir > now()
       and h.berakhir <= now() + interval '12 hours'
       and h.held_by = me()
  ),
  semua as (
    select * from followup
    union all select * from dingin
    union all select * from sp3k
    union all select * from mandek
    union all select * from bi_checking
    union all select * from rpc
    union all select * from berkas
    union all select * from verifikasi
    union all select * from hold
  )
  select json_build_object(
    'total',  (select count(*) from semua),
    'tinggi', (select count(*) from semua where urgensi = 'tinggi'),
    'per_kategori', coalesce((
      select json_agg(json_build_object('kategori', kategori, 'jumlah', n) order by n desc)
        from (select kategori, count(*) n from semua group by kategori) t), '[]'::json),
    'items', coalesce((
      select json_agg(json_build_object(
               'kategori',  kategori,
               'urgensi',   urgensi,
               'judul',     judul,
               'detail',    detail,
               'rute',      rute,
               'record_id', record_id))
        from (select * from semua
               order by (urgensi = 'tinggi') desc, tanggal nulls last
               limit 30) t), '[]'::json)
  );
$$;

grant execute on function my_notifications() to authenticated;


-- ------------------------------------------------------------
-- 9. Jejak audit
-- ------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['siteplans', 'unit_holds'] loop
    execute format('drop trigger if exists %I on %I', 'audit_' || t, t);
    execute format(
      'create trigger %I after insert or update or delete on %I for each row execute function log_activity()',
      'audit_' || t, t
    );
  end loop;
end $$;


-- ------------------------------------------------------------
-- 10. Data lama
--
-- a. Kaligangsa: geometri yang dulu ditulis mati di
--    src/data/siteplanKaligangsa.js (hasil tools/siteplan_ke_vektor.py)
--    dipindah ke sini. Proyek yang kode unitnya ≥ 80% cocok — ambang yang
--    sama dengan SiteplanPage lama — mendapat satu siteplan vektor.
-- b. Proyek lain yang punya gambar siteplan: pin lama (pos_x/pos_y) menjadi
--    kotak kecil di tempat yang sama, supaya tetap bisa diklik dan dirapikan
--    lewat editor.
-- ------------------------------------------------------------

do $$
declare
  v_proj uuid;
  v_sp   uuid;
begin
  drop table if exists pg_temp.geometri_kaligangsa;
  create temp table geometri_kaligangsa (kode text, blok text, bentuk text);
  insert into geometri_kaligangsa (kode, blok, bentuk) values
    ('A1', 'A', '93.7,14.0 113.2,20.5 101.6,55.3 82.1,48.8'),
    ('A2', 'A', '116.8,21.7 136.6,28.3 125.0,63.1 105.2,56.5'),
    ('A3', 'A', '139.9,29.4 159.7,36.0 148.1,70.8 128.3,64.2'),
    ('A4', 'A', '163.0,37.1 182.5,43.6 170.9,78.4 151.4,71.9'),
    ('A5', 'A', '186.1,44.8 205.9,51.4 194.3,86.2 174.5,79.6'),
    ('A6', 'A', '209.2,52.5 229.0,59.1 217.4,93.9 197.6,87.3'),
    ('A7', 'A', '232.3,60.2 252.1,66.8 240.5,101.6 220.7,95.0'),
    ('A8', 'A', '255.4,67.9 275.2,74.5 263.6,109.3 243.8,102.7'),
    ('A9', 'A', '278.8,75.7 298.3,82.2 286.6,117.3 267.1,110.8'),
    ('A10', 'A', '301.6,83.3 321.4,89.9 309.7,125.0 289.9,118.4'),
    ('A11', 'A', '325.0,91.1 344.5,97.6 332.8,132.7 313.3,126.2'),
    ('A12', 'A', '348.1,98.8 367.6,105.3 355.9,140.4 336.4,133.9'),
    ('A13', 'A', '371.2,106.5 390.7,113.0 379.0,148.1 359.5,141.6'),
    ('A14', 'A', '394.3,114.2 413.8,120.7 402.1,155.8 382.6,149.3'),
    ('A15', 'A', '417.4,121.9 436.9,128.4 425.2,163.5 405.7,157.0'),
    ('A16', 'A', '440.5,129.6 460.3,136.2 448.6,171.3 428.8,164.7'),
    ('A17', 'A', '508.0,152.1 527.5,158.6 515.8,193.7 496.3,187.2'),
    ('A18', 'A', '531.1,159.8 550.6,166.3 538.9,201.4 519.4,194.9'),
    ('A19', 'A', '554.2,167.5 574.0,174.1 562.3,209.2 542.5,202.6'),
    ('A20', 'A', '577.3,175.2 596.8,181.7 585.1,216.8 565.6,210.3'),
    ('A21', 'A', '600.4,182.9 620.2,189.5 608.5,224.6 588.7,218.0'),
    ('A22', 'A', '623.5,190.6 643.3,197.2 631.6,232.3 611.8,225.7'),
    ('A23', 'A', '646.6,198.3 666.4,204.9 654.7,240.0 634.9,233.4'),
    ('A24', 'A', '669.7,206.0 689.5,212.6 677.8,247.7 658.0,241.1'),
    ('A25', 'A', '692.8,213.7 712.6,220.3 700.9,255.4 681.1,248.8'),
    ('A26', 'A', '715.9,221.4 735.7,228.0 724.0,263.1 704.2,256.5'),
    ('A27', 'A', '739.3,229.2 758.8,235.7 747.1,270.8 727.6,264.3'),
    ('A28', 'A', '762.4,236.9 781.9,243.4 770.2,278.5 750.7,272.0'),
    ('A29', 'A', '785.5,244.6 805.0,251.1 793.3,286.2 773.8,279.7'),
    ('A30', 'A', '808.6,252.3 828.1,258.8 816.4,293.9 796.9,287.4'),
    ('A31', 'A', '831.7,260.0 851.2,266.5 839.5,301.6 820.0,295.1'),
    ('A32', 'A', '854.8,267.7 874.6,274.3 862.9,309.4 843.1,302.8'),
    ('B1', 'B', '65.5,102.6 102.7,115.0 96.2,134.5 59.0,122.1'),
    ('B2', 'B', '57.9,125.4 95.1,137.8 88.5,157.6 51.3,145.2'),
    ('B3', 'B', '50.4,148.9 87.3,161.2 80.8,180.7 43.9,168.4'),
    ('B4', 'B', '43.1,171.8 79.7,184.0 73.1,203.8 36.5,191.6'),
    ('B5', 'B', '35.4,194.9 72.0,207.1 65.4,226.9 28.8,214.7'),
    ('B6', 'B', '27.9,218.4 64.2,230.5 57.6,250.3 21.3,238.2'),
    ('B7', 'B', '20.5,241.6 56.5,253.6 50.0,273.1 14.0,261.1'),
    ('B8', 'B', '127.7,123.0 162.5,134.6 155.9,154.4 121.1,142.8'),
    ('B9', 'B', '119.7,146.0 154.8,157.7 148.2,177.5 113.1,165.8'),
    ('B10', 'B', '112.3,169.2 147.1,180.8 140.5,200.6 105.7,189.0'),
    ('B11', 'B', '104.2,192.5 139.3,204.2 132.7,224.0 97.6,212.3'),
    ('B12', 'B', '96.5,215.6 131.6,227.3 125.1,246.8 90.0,235.1'),
    ('B13', 'B', '88.8,238.7 123.9,250.4 117.4,269.9 82.3,258.2'),
    ('B14', 'B', '81.1,261.8 116.2,273.5 109.7,293.0 74.6,281.3'),
    ('B15', 'B', '166.0,136.1 201.1,147.8 194.6,167.3 159.5,155.6'),
    ('B16', 'B', '158.4,158.9 193.5,170.6 186.9,190.4 151.8,178.7'),
    ('B17', 'B', '150.6,182.3 185.7,194.0 179.2,213.5 144.1,201.8'),
    ('B18', 'B', '142.6,205.3 178.0,217.1 171.5,236.6 136.1,224.8'),
    ('B19', 'B', '135.2,228.5 170.3,240.2 163.8,259.7 128.7,248.0'),
    ('B20', 'B', '127.5,251.6 162.3,263.2 155.7,283.0 120.9,271.4'),
    ('B21', 'B', '119.8,274.7 154.6,286.3 148.1,305.8 113.3,294.2'),
    ('C1', 'C', '233.5,132.6 268.6,144.3 262.0,164.1 226.9,152.4'),
    ('C2', 'C', '225.7,156.0 260.8,167.7 254.3,187.2 219.2,175.5'),
    ('C3', 'C', '218.1,178.8 253.2,190.5 246.6,210.3 211.5,198.6'),
    ('C4', 'C', '210.4,201.9 245.5,213.6 238.9,233.4 203.8,221.7'),
    ('C5', 'C', '202.6,225.3 237.4,236.9 230.9,256.4 196.1,244.8'),
    ('C6', 'C', '194.9,248.4 229.7,260.0 223.2,279.5 188.4,267.9'),
    ('C7', 'C', '187.2,271.5 222.3,283.2 215.8,302.7 180.7,291.0'),
    ('C8', 'C', '179.5,294.6 214.6,306.3 208.1,325.8 173.0,314.1'),
    ('C9', 'C', '272.2,145.5 307.0,157.1 300.4,176.9 265.6,165.3'),
    ('C10', 'C', '264.1,168.8 299.2,180.5 292.7,200.0 257.6,188.3'),
    ('C11', 'C', '256.5,191.6 291.6,203.3 285.0,223.1 249.9,211.4'),
    ('C12', 'C', '248.7,215.0 284.1,226.8 277.6,246.3 242.2,234.5'),
    ('C13', 'C', '241.0,238.1 276.1,249.8 269.6,269.3 234.5,257.6'),
    ('C14', 'C', '233.3,261.2 268.4,272.9 261.9,292.4 226.8,280.7'),
    ('C15', 'C', '225.6,284.3 260.7,296.0 254.1,315.8 219.0,304.1'),
    ('C16', 'C', '218.2,307.5 253.0,319.1 246.5,338.6 211.7,327.0'),
    ('D1', 'D', '331.6,165.3 366.7,177.0 360.1,196.8 325.0,185.1'),
    ('D2', 'D', '324.1,188.8 358.9,200.4 352.4,219.9 317.6,208.3'),
    ('D3', 'D', '316.4,211.9 351.2,223.5 344.7,243.0 309.9,231.4'),
    ('D4', 'D', '308.8,234.7 343.6,246.3 337.0,266.1 302.2,254.5'),
    ('D5', 'D', '301.0,258.1 335.8,269.7 329.2,289.5 294.4,277.9'),
    ('D6', 'D', '293.3,281.2 328.1,292.8 321.6,312.3 286.8,300.7'),
    ('D7', 'D', '285.3,304.2 320.4,315.9 313.8,335.7 278.7,324.0'),
    ('D8', 'D', '277.6,327.3 313.0,339.1 306.5,358.6 271.1,346.8'),
    ('D9', 'D', '370.3,178.2 405.4,189.9 398.8,209.7 363.7,198.0'),
    ('D10', 'D', '362.5,201.6 397.3,213.2 390.8,232.7 356.0,221.1'),
    ('D11', 'D', '354.8,224.7 389.9,236.4 383.4,255.9 348.3,244.2'),
    ('D12', 'D', '347.1,247.8 382.2,259.5 375.7,279.0 340.6,267.3'),
    ('D13', 'D', '339.4,270.9 374.5,282.6 368.0,302.1 332.9,290.4'),
    ('D14', 'D', '331.7,294.0 366.8,305.7 360.3,325.2 325.2,313.5'),
    ('D15', 'D', '324.0,317.1 359.1,328.8 352.5,348.6 317.4,336.9'),
    ('D16', 'D', '316.3,340.2 351.4,351.9 344.9,371.4 309.8,359.7'),
    ('D17', 'D', '414.8,244.7 449.6,256.3 443.1,275.8 408.3,264.2'),
    ('D18', 'D', '406.9,267.4 442.0,279.1 435.4,298.9 400.3,287.2'),
    ('D19', 'D', '399.1,290.8 434.2,302.5 427.6,322.3 392.5,310.6'),
    ('D20', 'D', '391.4,313.9 426.5,325.6 420.0,345.1 384.9,333.4'),
    ('D21', 'D', '383.7,337.0 418.8,348.7 412.3,368.2 377.2,356.5'),
    ('D22', 'D', '376.0,360.1 411.1,371.8 404.5,391.6 369.4,379.9'),
    ('D23', 'D', '452.9,257.4 488.0,269.1 481.5,288.6 446.4,276.9'),
    ('D24', 'D', '445.2,280.5 480.6,292.3 474.1,311.8 438.7,300.0'),
    ('D25', 'D', '437.5,303.6 472.9,315.4 466.4,334.9 431.0,323.1'),
    ('D26', 'D', '430.1,326.8 464.9,338.4 458.4,357.9 423.6,346.3'),
    ('D27', 'D', '422.4,349.9 457.2,361.5 450.6,381.3 415.8,369.7'),
    ('D28', 'D', '414.7,373.0 449.8,384.7 443.2,404.5 408.1,392.8'),
    ('E1', 'E', '528.4,230.9 563.5,242.6 556.9,262.4 521.8,250.7'),
    ('E2', 'E', '520.6,254.3 555.7,266.0 549.2,285.5 514.1,273.8'),
    ('E3', 'E', '512.9,277.4 548.0,289.1 541.5,308.6 506.4,296.9'),
    ('E4', 'E', '505.2,300.5 540.0,312.1 533.5,331.6 498.7,320.0'),
    ('E5', 'E', '497.5,323.6 532.3,335.2 525.7,355.0 490.9,343.4'),
    ('E6', 'E', '489.8,346.7 524.6,358.3 518.1,377.8 483.3,366.2'),
    ('E7', 'E', '482.1,369.8 516.9,381.4 510.3,401.2 475.5,389.6'),
    ('E8', 'E', '474.4,392.9 509.5,404.6 503.0,424.1 467.9,412.4'),
    ('E9', 'E', '567.1,243.8 601.9,255.4 595.3,275.2 560.5,263.6'),
    ('E10', 'E', '559.0,267.1 594.1,278.8 587.5,298.6 552.4,286.9'),
    ('E11', 'E', '551.3,290.2 586.4,301.9 579.9,321.4 544.8,309.7'),
    ('E12', 'E', '543.6,313.3 578.7,325.0 572.2,344.5 537.1,332.8'),
    ('E13', 'E', '535.9,336.4 571.0,348.1 564.5,367.6 529.4,355.9'),
    ('E14', 'E', '528.2,359.5 563.3,371.2 556.8,390.7 521.7,379.0'),
    ('E15', 'E', '520.5,382.6 555.6,394.3 549.0,414.1 513.9,402.4'),
    ('E16', 'E', '512.8,405.7 547.9,417.4 541.3,437.2 506.2,425.5'),
    ('F1', 'F', '626.4,263.9 661.5,275.6 655.0,295.1 619.9,283.4'),
    ('F2', 'F', '618.7,287.0 653.8,298.7 647.3,318.2 612.2,306.5'),
    ('F3', 'F', '611.3,310.2 646.1,321.8 639.6,341.3 604.8,329.7'),
    ('F4', 'F', '603.6,333.3 638.4,344.9 631.9,364.4 597.1,352.8'),
    ('F5', 'F', '595.6,356.3 630.7,368.0 624.1,387.8 589.0,376.1'),
    ('F6', 'F', '587.9,379.4 623.0,391.1 616.4,410.9 581.3,399.2'),
    ('F7', 'F', '580.2,402.5 615.3,414.2 608.7,434.0 573.6,422.3'),
    ('F8', 'F', '572.5,425.6 607.6,437.3 601.0,457.1 565.9,445.4'),
    ('F9', 'F', '665.2,276.5 700.0,288.1 693.4,307.9 658.6,296.3'),
    ('F10', 'F', '657.4,299.9 692.5,311.6 685.9,331.4 650.8,319.7'),
    ('F11', 'F', '649.7,323.0 684.5,334.6 678.0,354.1 643.2,342.5'),
    ('F12', 'F', '642.0,346.1 677.1,357.8 670.6,377.3 635.5,365.6'),
    ('F13', 'F', '634.3,369.2 669.4,380.9 662.8,400.7 627.7,389.0'),
    ('F14', 'F', '626.6,392.3 661.7,404.0 655.2,423.5 620.1,411.8'),
    ('F15', 'F', '618.6,415.3 654.0,427.1 647.4,446.9 612.0,435.1'),
    ('F16', 'F', '611.2,438.5 646.3,450.2 639.7,470.0 604.6,458.3'),
    ('G1', 'G', '724.8,296.7 759.9,308.4 753.4,327.9 718.3,316.2'),
    ('G2', 'G', '717.1,319.8 752.2,331.5 745.7,351.0 710.6,339.3'),
    ('G3', 'G', '709.4,342.9 744.5,354.6 737.9,374.4 702.8,362.7'),
    ('G4', 'G', '701.7,366.0 736.8,377.7 730.3,397.2 695.2,385.5'),
    ('G5', 'G', '694.0,389.1 729.1,400.8 722.5,420.6 687.4,408.9'),
    ('G6', 'G', '686.3,412.2 721.1,423.8 714.5,443.6 679.7,432.0'),
    ('G7', 'G', '678.6,435.3 713.4,446.9 706.9,466.4 672.1,454.8'),
    ('G8', 'G', '670.9,458.4 705.7,470.0 699.1,489.8 664.3,478.2'),
    ('G9', 'G', '763.6,309.3 798.4,320.9 791.8,340.7 757.0,329.1'),
    ('G10', 'G', '755.8,332.7 790.6,344.3 784.0,364.1 749.2,352.5'),
    ('G11', 'G', '748.1,355.8 782.9,367.4 776.3,387.2 741.5,375.6'),
    ('G12', 'G', '740.1,378.8 775.2,390.5 768.7,410.0 733.6,398.3'),
    ('G13', 'G', '732.4,401.9 767.5,413.6 760.9,433.4 725.8,421.7'),
    ('G14', 'G', '724.7,425.0 760.1,436.8 753.6,456.3 718.2,444.5'),
    ('G15', 'G', '717.0,448.1 752.1,459.8 745.5,479.6 710.4,467.9'),
    ('G16', 'G', '709.3,471.2 744.4,482.9 737.8,502.7 702.7,491.0'),
    ('H1', 'H', '822.9,329.4 859.5,341.6 853.0,361.1 816.4,348.9'),
    ('H2', 'H', '815.2,352.5 853.6,365.3 847.1,384.8 808.7,372.0'),
    ('H3', 'H', '807.5,375.6 842.6,387.3 836.1,406.8 801.0,395.1'),
    ('H4', 'H', '800.1,398.8 834.9,410.4 828.4,429.9 793.6,418.3'),
    ('H5', 'H', '792.4,421.9 827.2,433.5 820.7,453.0 785.9,441.4'),
    ('H6', 'H', '784.7,445.0 819.5,456.6 812.9,476.4 778.1,464.8'),
    ('H7', 'H', '776.7,468.0 811.8,479.7 805.2,499.5 770.1,487.8'),
    ('H8', 'H', '769.0,491.1 804.1,502.8 797.5,522.6 762.4,510.9'),
    ('H9', 'H', '688.9,528.4 709.3,535.2 696.2,574.5 675.8,567.7'),
    ('H10', 'H', '712.2,535.5 732.6,542.3 719.7,581.0 699.3,574.2'),
    ('H11', 'H', '735.4,542.9 755.8,549.7 743.2,587.5 722.8,580.7'),
    ('H12', 'H', '758.8,549.7 779.2,556.5 766.7,594.0 746.3,587.2'),
    ('H13', 'H', '782.0,557.1 802.1,563.8 789.9,600.4 769.8,593.7');

  for v_proj in
    select u.project_id
      from units u
      left join geometri_kaligangsa g on upper(g.kode) = upper(btrim(u.unit_code))
     group by u.project_id
    having count(g.kode)::numeric / count(*) >= 0.8
  loop
    if exists (select 1 from siteplans where project_id = v_proj) then
      continue;
    end if;

    insert into siteplans (project_id, nama, keterangan, lebar, tinggi, created_by)
    values (v_proj, 'Siteplan Utama', 'Blok A–H, dari gambar kerja', 888.6, 614.4, null)
    returning id into v_sp;

    update units u
       set siteplan_id = v_sp, bentuk = g.bentuk, block = coalesce(u.block, g.blok)
      from geometri_kaligangsa g
     where u.project_id = v_proj
       and upper(btrim(u.unit_code)) = upper(g.kode)
       and u.bentuk is null;

    insert into siteplan_fasilitas (siteplan_id, label, jenis, bentuk) values
    (v_sp, 'Masjid', 'ibadah', '430.0,198.1 503.5,222.6 489.2,265.5 415.7,241.0'),
    (v_sp, 'T.7', 'fasum', '463.6,137.3 504.4,150.9 492.7,186.0 451.9,172.4'),
    (v_sp, 'T.3', 'fasum', '135.8,98.7 209.3,123.2 202.3,144.2 128.8,119.7');
  end loop;

  drop table if exists pg_temp.geometri_kaligangsa;
end $$;

insert into siteplans (project_id, nama, gambar_url, lebar, tinggi, created_by)
select p.id, 'Siteplan Utama', p.siteplan_image_url, 1000, 700, null
  from projects p
 where p.siteplan_image_url is not null
   and not exists (select 1 from siteplans s where s.project_id = p.id)
on conflict (project_id, nama) do nothing;

update units u
   set siteplan_id = s.id,
       bentuk = format('%s,%s %s,%s %s,%s %s,%s',
                       round(u.pos_x * 1000 - 9, 1), round(u.pos_y * 700 - 9, 1),
                       round(u.pos_x * 1000 + 9, 1), round(u.pos_y * 700 - 9, 1),
                       round(u.pos_x * 1000 + 9, 1), round(u.pos_y * 700 + 9, 1),
                       round(u.pos_x * 1000 - 9, 1), round(u.pos_y * 700 + 9, 1))
  from siteplans s
 where s.project_id = u.project_id
   and s.nama = 'Siteplan Utama'
   and s.gambar_url is not null
   and u.bentuk is null
   and u.siteplan_id is null
   and u.pos_x is not null
   and u.pos_y is not null;

notify pgrst, 'reload schema';
