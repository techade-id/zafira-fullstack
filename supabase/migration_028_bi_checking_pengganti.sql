-- ============================================================
-- Zafira Property — Migration 028
-- BI Checking dengan pemohon pengganti, dan catatan survei wajib.
--
-- Permintaan klien:
--   · Survei: foto lokasi dan catatan hasil survei wajib.
--   · BI Checking gagal: Sales boleh mengajukan penggantian data pemohon
--     (mis. memakai KTP suami/istri, orang tua, atau saudara) paling banyak
--     3 kali — jadi paling banyak 4 kali pemeriksaan: data asli + 3 pengganti.
--     Setiap penggantian disetujui Admin Sistem dan tercatat jelas sebelum
--     prospek dinyatakan gagal total.
--
-- Isinya:
--   · bi_checking_percobaan: satu baris per pemeriksaan — siapa pemohonnya,
--     hubungannya dengan prospek, NIK, hasil, dan siapa yang mencatat; untuk
--     pengganti juga alasan, pengaju, dan keputusan Admin. Pengajuan yang
--     ditolak tetap tersimpan dan tidak menghabiskan kesempatan.
--   · berkas_lampiran.percobaan_id dan slot 'kk': KTP, KK (bukti hubungan
--     keluarga), dan hasil BI menempel pada percobaannya masing-masing.
--   · catat_bi_checking() kini mencatat ke percobaan yang sedang berjalan;
--     hasil Lolos/Tidak Lolos tidak bisa ditimpa Sales. Percobaan keempat yang
--     tidak lolos membatalkan prospek otomatis (alasan "Tidak lolos
--     BI-Checking").
--   · ajukan_pengganti_bi() / putuskan_pengganti_bi().
--   · convert_lead_to_customer(): menolak booking selama pemohon pengganti
--     belum lolos, dan membuat konsumen atas nama pemohon yang lolos
--     (customers.pemohon_hubungan mencatat hubungannya dengan prospek).
--   · my_notifications(): persetujuan_bi (Admin) dan bi_diputuskan (pengaju).
--
-- leads.bi_checking_* tetap ada sebagai ringkasan percobaan terakhir — dibaca
-- suhu prospek, Saringan Awal, dan berkas KPR seperti sebelumnya.
--
-- Fungsi my_notifications(), catat_followup(), dan convert_lead_to_customer()
-- ditulis ulang utuh: mengulang migrasi yang lebih lama sesudah ini berarti
-- mengulang migrasi ini juga.
--
-- Aman dijalankan ulang.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Catatan survei wajib
--
-- Isi sama dengan migration_027, ditambah satu syarat.
-- ------------------------------------------------------------

create or replace function catat_followup(
  p_lead_id         uuid,
  p_tanggal         date,
  p_aktivitas       text,
  p_hasil           text,
  p_catatan         text,
  p_lampiran        jsonb,   -- [{ "path": "<lead_id>/followup/...", "nama": "chat.jpg" }, ...]
  p_tanggal_rencana date,
  p_rencana         text default null,
  p_kategori        text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_survei  boolean := btrim(coalesce(p_aktivitas, '')) = 'Survei Lokasi';
  v_catatan text    := nullif(btrim(coalesce(p_catatan, '')), '');
  v_id      uuid;
  v_jumlah  int;
begin
  if btrim(coalesce(p_aktivitas, '')) = '' then
    raise exception 'Pilih jenis follow-up.';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal follow-up wajib diisi.';
  end if;
  if btrim(coalesce(p_hasil, '')) = '' and v_catatan is null then
    raise exception 'Isi hasil follow-up atau catatannya.';
  end if;
  -- Dokumentasi survei: foto lokasi (lampiran di bawah) dan catatan hasilnya.
  if v_survei and v_catatan is null then
    raise exception 'Catatan hasil survei wajib diisi.';
  end if;
  if p_tanggal_rencana is null then
    raise exception 'Tentukan kapan prospek ini akan dihubungi lagi.';
  end if;
  if p_lampiran is null or jsonb_typeof(p_lampiran) <> 'array' or jsonb_array_length(p_lampiran) = 0 then
    raise exception 'Bukti follow-up wajib dilampirkan.';
  end if;

  update leads
     set tanggal_rencana     = p_tanggal_rencana,
         rencana_selanjutnya = nullif(btrim(coalesce(p_rencana, '')), ''),
         kategori_rencana    = nullif(btrim(coalesce(p_kategori, '')), ''),
         tanggal_survei      = case when v_survei then greatest(tanggal_survei, p_tanggal) else tanggal_survei end,
         -- Survei terbaru menulis catatannya; survei yang dicatat mundur di
         -- belakang survei lain tidak menimpa catatan yang lebih baru.
         catatan_survei      = case when v_survei and v_catatan is not null
                                     and (tanggal_survei is null or p_tanggal >= tanggal_survei)
                                    then v_catatan else catatan_survei end,
         updated_at          = now()
   where id = p_lead_id;
  if not found then
    raise exception 'Prospek tidak ditemukan atau bukan milik Anda.' using errcode = '42501';
  end if;

  insert into lead_activities (lead_id, tanggal_followup, activity, hasil, note)
  values (
    p_lead_id,
    p_tanggal,
    btrim(p_aktivitas),
    nullif(btrim(coalesce(p_hasil, '')), ''),
    nullif(concat_ws(E'\n', v_catatan, 'Rencana: ' || nullif(btrim(coalesce(p_rencana, '')), '')), '')
  )
  returning id into v_id;

  insert into berkas_lampiran (lead_id, slot, file_url, file_name, activity_id)
  select p_lead_id,
         case when v_survei then 'survei' else 'followup' end,
         e->>'path',
         nullif(btrim(coalesce(e->>'nama', '')), ''),
         v_id
    from jsonb_array_elements(p_lampiran) e
   where coalesce(e->>'path', '') like p_lead_id::text || '/%';
  get diagnostics v_jumlah = row_count;

  if v_jumlah <> jsonb_array_length(p_lampiran) then
    raise exception 'Bukti follow-up tidak valid — unggah ulang berkasnya.';
  end if;

  return v_id;
end $$;

grant execute on function catat_followup(uuid, date, text, text, text, jsonb, date, text, text) to authenticated;


-- ------------------------------------------------------------
-- 2. Percobaan BI Checking
-- ------------------------------------------------------------

/** Hubungan pemohon dengan prospek, untuk teks riwayat dan notifikasi. */
create or replace function label_hubungan(p text)
returns text language sql immutable set search_path = public as $$
  select case p
    when 'diri_sendiri'    then 'data asli'
    when 'suami_istri'     then 'suami/istri'
    when 'orang_tua'       then 'orang tua'
    when 'anak'            then 'anak'
    when 'saudara_kandung' then 'saudara kandung'
    when 'lainnya'         then 'lainnya'
    else coalesce(p, '-')
  end;
$$;

grant execute on function label_hubungan(text) to authenticated;

create table if not exists bi_checking_percobaan (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references leads(id) on delete cascade,
  -- 1 = data asli prospek; 2–4 = pemohon pengganti ke-1 sampai ke-3.
  urutan           int  not null check (urutan between 1 and 4),
  nama_pemohon     text not null,
  nik              text check (nik is null or nik ~ '^[0-9]{16}$'),
  hubungan         text not null default 'diri_sendiri'
                   check (hubungan in ('diri_sendiri', 'suami_istri', 'orang_tua', 'anak', 'saudara_kandung', 'lainnya')),
  alasan           text,
  persetujuan      text not null default 'disetujui'
                   check (persetujuan in ('menunggu', 'disetujui', 'ditolak')),
  diajukan_oleh    uuid default auth.uid()
                   constraint bi_checking_percobaan_diajukan_oleh_fkey references profiles(id),
  diajukan_at      timestamptz not null default now(),
  diputuskan_oleh  uuid constraint bi_checking_percobaan_diputuskan_oleh_fkey references profiles(id),
  diputuskan_at    timestamptz,
  alasan_tolak     text,
  hasil            text check (hasil in ('menunggu', 'lolos', 'tidak_lolos')),
  tanggal_periksa  date,
  catatan_hasil    text,
  hasil_oleh       uuid constraint bi_checking_percobaan_hasil_oleh_fkey references profiles(id),
  hasil_at         timestamptz,
  -- Pemohon pengganti harus jelas siapa dan mengapa.
  constraint bi_checking_percobaan_pengganti_check check (
    urutan = 1 or (nik is not null and hubungan <> 'diri_sendiri' and alasan is not null)
  )
);

-- Pengajuan yang ditolak tidak menghabiskan nomor urut: pengajuan berikutnya
-- memakai nomor yang sama.
create unique index if not exists uq_bi_checking_percobaan_urutan
  on bi_checking_percobaan (lead_id, urutan) where persetujuan <> 'ditolak';
create unique index if not exists uq_bi_checking_percobaan_menunggu
  on bi_checking_percobaan (lead_id) where persetujuan = 'menunggu';
create index if not exists idx_bi_checking_percobaan_lead on bi_checking_percobaan (lead_id, urutan);
create index if not exists idx_bi_checking_percobaan_menunggu on bi_checking_percobaan (persetujuan, diajukan_at desc);

comment on table bi_checking_percobaan is
  'Riwayat BI-Checking per prospek: data asli dan sampai 3 pemohon pengganti yang disetujui Admin Sistem (migration_028).';

alter table bi_checking_percobaan enable row level security;

-- Hanya baca. Menulis lewat catat_bi_checking(), ajukan_pengganti_bi(), dan
-- putuskan_pengganti_bi(), yang menegakkan siapa boleh apa.
drop policy if exists "bi_checking_percobaan_select" on bi_checking_percobaan;
create policy "bi_checking_percobaan_select" on bi_checking_percobaan for select
  using (can_view_all() or owns_lead(lead_id) or diajukan_oleh = me());

alter table berkas_lampiran
  add column if not exists percobaan_id uuid references bi_checking_percobaan(id) on delete set null;
create index if not exists idx_berkas_lampiran_percobaan on berkas_lampiran (percobaan_id);

alter table berkas_lampiran drop constraint if exists berkas_lampiran_slot_check;
alter table berkas_lampiran add constraint berkas_lampiran_slot_check check (slot in (
  'survei', 'bi_checking', 'ktp', 'kk',
  'sp3k_terbit', 'sp3k_perpanjangan',
  'akad', 'berita_acara',
  'bphtb', 'shm',
  'followup'
));

alter table customers add column if not exists pemohon_hubungan text;
comment on column customers.pemohon_hubungan is
  'Diisi bila konsumen adalah pemohon pengganti yang lolos BI-Checking (mis. saudara_kandung dari prospek asal). Null = prospek itu sendiri.';

-- Data lama: hasil BI-Checking yang sudah tercatat menjadi percobaan pertama,
-- lengkap dengan lampirannya.
insert into bi_checking_percobaan (lead_id, urutan, nama_pemohon, hubungan, persetujuan, diajukan_oleh,
                                   hasil, tanggal_periksa, catatan_hasil)
select l.id, 1, l.name, 'diri_sendiri', 'disetujui', l.assigned_to,
       l.bi_checking_status, l.bi_checking_tanggal, l.bi_checking_catatan
  from leads l
 where l.bi_checking_status is not null
   and not exists (select 1 from bi_checking_percobaan b where b.lead_id = l.id);

update berkas_lampiran f
   set percobaan_id = b.id
  from bi_checking_percobaan b
 where b.lead_id = f.lead_id
   and b.urutan = 1
   and f.slot in ('ktp', 'bi_checking')
   and f.percobaan_id is null;


-- ------------------------------------------------------------
-- 3. catat_bi_checking(): mencatat hasil percobaan yang berjalan
--
-- SECURITY DEFINER karena kini juga menulis bi_checking_percobaan (tanpa
-- policy tulis); hak atas prospek diperiksa eksplisit — pemiliknya, atau Admin.
-- ------------------------------------------------------------

drop function if exists catat_bi_checking(uuid, text, date, text);

create or replace function catat_bi_checking(
  p_lead_id uuid,
  p_status  text,
  p_tanggal date,
  p_catatan text default null,
  p_nik     text default null   -- NIK data asli; hanya mengisi yang masih kosong
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_lead  leads;
  p       bi_checking_percobaan;
  v_label text;
  v_nik   text := nullif(regexp_replace(coalesce(p_nik, ''), '\s', '', 'g'), '');
  v_id    uuid;
  v_gagal boolean := false;
begin
  v_label := case p_status
               when 'lolos'       then 'Lolos'
               when 'tidak_lolos' then 'Tidak Lolos'
               when 'menunggu'    then 'Menunggu hasil'
             end;
  if v_label is null then
    raise exception 'Pilih hasil BI-Checking: Lolos, Tidak Lolos, atau Menunggu hasil.';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal BI-Checking wajib diisi.';
  end if;
  if p_tanggal > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal BI-Checking tidak boleh melewati hari ini.';
  end if;
  if v_nik is not null and v_nik !~ '^[0-9]{16}$' then
    raise exception 'NIK harus 16 digit angka.';
  end if;

  select * into v_lead from leads where id = p_lead_id;
  if v_lead.id is null or not (can_write_sales() and (is_admin() or owns_lead(p_lead_id))) then
    raise exception 'Prospek tidak ditemukan atau bukan milik Anda.' using errcode = '42501';
  end if;
  if v_lead.status = 'cancel' then
    raise exception 'Prospek ini sudah dibatalkan.';
  end if;
  if exists (select 1 from customers where lead_id = p_lead_id) then
    raise exception 'Prospek ini sudah dibooking — BI-Checking dilanjutkan di berkas KPR konsumen.';
  end if;
  if exists (select 1 from bi_checking_percobaan where lead_id = p_lead_id and persetujuan = 'menunggu') then
    raise exception 'Penggantian data pemohon masih menunggu persetujuan Admin Sistem.';
  end if;

  select * into p from bi_checking_percobaan
   where lead_id = p_lead_id and persetujuan = 'disetujui'
   order by urutan desc limit 1;

  if p.id is null then
    insert into bi_checking_percobaan (lead_id, urutan, nama_pemohon, nik, hubungan, persetujuan, diajukan_oleh)
    values (p_lead_id, 1, v_lead.name, v_nik, 'diri_sendiri', 'disetujui', me())
    returning * into p;
  elsif p.hasil in ('lolos', 'tidak_lolos') and not is_admin() then
    -- Hasil akhir bank tidak ditimpa: yang gagal diperiksa ulang lewat
    -- pemohon pengganti, bukan dengan mengubah hasilnya.
    raise exception 'Hasil BI-Checking % sudah tercatat %. %', p.nama_pemohon,
      case p.hasil when 'lolos' then 'Lolos' else 'Tidak Lolos' end,
      case when p.hasil = 'tidak_lolos' then 'Ajukan penggantian data pemohon untuk memeriksa ulang.'
           else 'Minta Admin Sistem bila hasilnya perlu dikoreksi.' end;
  end if;

  update bi_checking_percobaan
     set hasil           = p_status,
         tanggal_periksa = p_tanggal,
         catatan_hasil   = nullif(btrim(coalesce(p_catatan, '')), ''),
         hasil_oleh      = me(),
         hasil_at        = now(),
         nik             = coalesce(nik, v_nik)
   where id = p.id;

  update leads
     set bi_checking_status  = p_status,
         bi_checking_tanggal = p_tanggal,
         bi_checking_catatan = nullif(btrim(coalesce(p_catatan, '')), ''),
         updated_at          = now()
   where id = p_lead_id;

  insert into lead_activities (lead_id, actor_id, tanggal_followup, activity, hasil, note)
  values (p_lead_id, me(), p_tanggal, 'BI Checking', v_label,
          nullif(concat_ws(E'\n',
            case when p.urutan > 1
                 then format('Pemohon pengganti ke-%s: %s (%s)', p.urutan - 1, p.nama_pemohon, label_hubungan(p.hubungan)) end,
            nullif(btrim(coalesce(p_catatan, '')), '')), ''))
  returning id into v_id;

  -- Kesempatan habis: data asli dan tiga pemohon pengganti semuanya tidak
  -- lolos. Prospek dibatalkan dengan alasannya, supaya masuk laporan
  -- pembatalan alih-alih tertinggal di antrean.
  if p_status = 'tidak_lolos' and p.urutan >= 4 then
    perform cancel_lead(p_lead_id, 'Tidak lolos BI-Checking',
      format('Gagal total: %s kali BI-Checking tidak lolos (data asli dan 3 pemohon pengganti).', p.urutan));
    v_gagal := true;
  end if;

  return json_build_object('activity_id', v_id, 'percobaan_id', p.id, 'urutan', p.urutan,
                           'sisa_penggantian', greatest(0, 4 - p.urutan), 'gagal_total', v_gagal);
end $$;

grant execute on function catat_bi_checking(uuid, text, date, text, text) to authenticated;

comment on function catat_bi_checking(uuid, text, date, text, text) is
  'Mencatat hasil BI-Checking pada percobaan yang berjalan (data asli atau pemohon pengganti). Percobaan ke-4 yang tidak lolos membatalkan prospek.';


-- ------------------------------------------------------------
-- 4. Pemohon pengganti
-- ------------------------------------------------------------

create or replace function terapkan_pengganti_bi(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  b bi_checking_percobaan;
begin
  select * into b from bi_checking_percobaan where id = p_id for update;
  update bi_checking_percobaan
     set persetujuan = 'disetujui', diputuskan_oleh = me(), diputuskan_at = now()
   where id = b.id;
  -- Ringkasan prospek mengikuti percobaan yang berjalan: belum ada hasil.
  update leads
     set bi_checking_status  = 'menunggu',
         bi_checking_tanggal = null,
         bi_checking_catatan = format('Pemohon pengganti ke-%s: %s (%s) — menunggu pemeriksaan',
                                      b.urutan - 1, b.nama_pemohon, label_hubungan(b.hubungan)),
         updated_at = now()
   where id = b.lead_id;
end $$;

revoke all on function terapkan_pengganti_bi(uuid) from public;
revoke all on function terapkan_pengganti_bi(uuid) from authenticated;


create or replace function ajukan_pengganti_bi(
  p_lead_id   uuid,
  p_nama      text,
  p_nik       text,
  p_hubungan  text,
  p_alasan    text,
  p_lampiran  jsonb   -- [{ "path": "<lead_id>/ktp/...", "nama": "ktp.jpg", "slot": "ktp" | "kk" }, ...]
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_lead   leads;
  p        bi_checking_percobaan;
  v_nik    text := regexp_replace(coalesce(p_nik, ''), '\s', '', 'g');
  v_id     uuid;
  v_jumlah int;
  v_total  int := coalesce(jsonb_array_length(case when jsonb_typeof(p_lampiran) = 'array' then p_lampiran end), 0);
begin
  select * into v_lead from leads where id = p_lead_id;
  if v_lead.id is null or not (can_write_sales() and (is_admin() or owns_lead(p_lead_id))) then
    raise exception 'Prospek tidak ditemukan atau bukan milik Anda.' using errcode = '42501';
  end if;
  if v_lead.status = 'cancel' then
    raise exception 'Prospek ini sudah dibatalkan.';
  end if;
  if exists (select 1 from customers where lead_id = p_lead_id) then
    raise exception 'Prospek ini sudah dibooking.';
  end if;
  if exists (select 1 from bi_checking_percobaan where lead_id = p_lead_id and persetujuan = 'menunggu') then
    raise exception 'Masih ada penggantian data yang menunggu persetujuan Admin Sistem.';
  end if;

  select * into p from bi_checking_percobaan
   where lead_id = p_lead_id and persetujuan = 'disetujui'
   order by urutan desc limit 1;
  if p.id is null or p.hasil is distinct from 'tidak_lolos' then
    raise exception 'Penggantian data hanya bisa diajukan setelah BI-Checking dinyatakan Tidak Lolos.';
  end if;
  if p.urutan >= 4 then
    raise exception 'Kesempatan penggantian data sudah habis (maksimal 3 kali).';
  end if;

  if btrim(coalesce(p_nama, '')) = '' then
    raise exception 'Nama pemohon pengganti wajib diisi.';
  end if;
  if v_nik !~ '^[0-9]{16}$' then
    raise exception 'NIK pemohon pengganti harus 16 digit angka.';
  end if;
  if p_hubungan is null or p_hubungan not in ('suami_istri', 'orang_tua', 'anak', 'saudara_kandung', 'lainnya') then
    raise exception 'Pilih hubungan pemohon pengganti dengan prospek.';
  end if;
  if btrim(coalesce(p_alasan, '')) = '' then
    raise exception 'Alasan penggantian wajib diisi.';
  end if;
  if exists (select 1 from bi_checking_percobaan
              where lead_id = p_lead_id and nik = v_nik and persetujuan <> 'ditolak') then
    raise exception 'NIK ini sudah pernah diperiksa untuk prospek ini.';
  end if;
  if not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_lampiran) = 'array' then p_lampiran else '[]'::jsonb end) e
                  where e->>'slot' = 'ktp') then
    raise exception 'Lampirkan KTP pemohon pengganti.';
  end if;

  insert into bi_checking_percobaan (lead_id, urutan, nama_pemohon, nik, hubungan, alasan, persetujuan, diajukan_oleh)
  values (p_lead_id, p.urutan + 1, btrim(p_nama), v_nik, p_hubungan, btrim(p_alasan), 'menunggu', me())
  returning id into v_id;

  -- Hanya berkas di folder prospek ini (lihat catat_followup).
  insert into berkas_lampiran (lead_id, slot, file_url, file_name, percobaan_id)
  select p_lead_id, e->>'slot', e->>'path', nullif(btrim(coalesce(e->>'nama', '')), ''), v_id
    from jsonb_array_elements(p_lampiran) e
   where e->>'slot' in ('ktp', 'kk')
     and coalesce(e->>'path', '') like p_lead_id::text || '/%';
  get diagnostics v_jumlah = row_count;
  if v_jumlah <> v_total then
    raise exception 'Lampiran pemohon pengganti tidak valid — unggah ulang berkasnya.';
  end if;

  -- Admin Sistem adalah penyetujunya: pengajuannya sendiri langsung berlaku,
  -- tetapi tetap tercatat sebagai pengajuan yang disetujui.
  if is_admin() then
    perform terapkan_pengganti_bi(v_id);
    return json_build_object('id', v_id, 'status', 'disetujui', 'urutan', p.urutan + 1);
  end if;

  return json_build_object('id', v_id, 'status', 'menunggu', 'urutan', p.urutan + 1);
end $$;

grant execute on function ajukan_pengganti_bi(uuid, text, text, text, text, jsonb) to authenticated;


create or replace function putuskan_pengganti_bi(p_id uuid, p_setujui boolean, p_alasan text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  b      bi_checking_percobaan;
  v_lead leads;
begin
  if not is_admin() then
    raise exception 'Hanya Admin Sistem yang dapat memutuskan penggantian data pemohon.' using errcode = '42501';
  end if;

  select * into b from bi_checking_percobaan where id = p_id for update;
  if b.id is null then
    raise exception 'Pengajuan tidak ditemukan.';
  end if;
  if b.persetujuan <> 'menunggu' then
    raise exception 'Pengajuan ini sudah diputuskan.';
  end if;

  if p_setujui then
    select * into v_lead from leads where id = b.lead_id;
    if v_lead.status = 'cancel' or exists (select 1 from customers where lead_id = b.lead_id) then
      raise exception 'Prospek ini sudah dibatalkan atau dibooking — tolak pengajuannya.';
    end if;
    perform terapkan_pengganti_bi(p_id);
    return;
  end if;

  if btrim(coalesce(p_alasan, '')) = '' then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;
  update bi_checking_percobaan
     set persetujuan = 'ditolak', diputuskan_oleh = me(), diputuskan_at = now(), alasan_tolak = btrim(p_alasan)
   where id = p_id;
end $$;

grant execute on function putuskan_pengganti_bi(uuid, boolean, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime'
                        and schemaname = 'public' and tablename = 'bi_checking_percobaan') then
    execute 'alter publication supabase_realtime add table public.bi_checking_percobaan';
  end if;
end $$;


-- ------------------------------------------------------------
-- 5. Koreksi nama konsumen tidak menimpa nama prospek asal
--
-- Isi sama dengan migration_020, kecuali: bila konsumennya pemohon pengganti,
-- namanya memang berbeda dari prospek — mengoreksinya tidak boleh mengganti
-- nama prospek menjadi nama saudaranya. Telepon tetap ikut, karena nomor
-- kontaknya memang nomor prospek.
-- ------------------------------------------------------------

create or replace function customer_sync_prospek_asal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null
     and ((new.name is distinct from old.name and new.pemohon_hubungan is null)
          or new.phone is distinct from old.phone) then
    update leads
       set name  = case when new.name is distinct from old.name and new.pemohon_hubungan is null
                        then new.name else name end,
           phone = case when new.phone is distinct from old.phone then new.phone else phone end,
           updated_at = now()
     where id = new.lead_id;
  end if;
  return null;
end $$;


-- ------------------------------------------------------------
-- 6. convert_lead_to_customer(): atas nama pemohon yang lolos
--
-- Isi sama dengan migration_027, ditambah syarat pemohon pengganti dan nama
-- konsumennya.
-- ------------------------------------------------------------

create or replace function convert_lead_to_customer(
  p_lead_id          uuid,
  p_unit_id          uuid    default null,
  p_nominal_booking  numeric default null,
  p_tanggal_booking  date    default current_date,
  p_nominal_dp       numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lead      leads%rowtype;
  v_unit      units%rowtype;
  v_hold      unit_holds%rowtype;
  v_customer  uuid;
  v_biaya     json;
  v_tanah     numeric;
  v_strategis numeric;
  v_pemohon   bi_checking_percobaan;
  v_pengganti boolean := false;
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

  -- Lebih dulu dari pemeriksaan "tidak lolos": selama penggantian menunggu,
  -- ringkasan prospek masih Tidak Lolos, dan yang perlu diketahui Sales adalah
  -- bahwa jalan keluarnya sedang ditinjau.
  if exists (select 1 from bi_checking_percobaan where lead_id = p_lead_id and persetujuan = 'menunggu') then
    raise exception 'Penggantian data pemohon BI-Checking masih menunggu persetujuan Admin Sistem.';
  end if;

  if v_lead.bi_checking_status = 'tidak_lolos' then
    raise exception 'BI-Checking prospek ini tidak lolos. Ajukan penggantian data pemohon, atau batalkan prospek.';
  end if;

  if exists (select 1 from customers where lead_id = p_lead_id) then
    raise exception 'Prospek ini sudah pernah dikonversi menjadi konsumen.';
  end if;

  -- Pemohon pengganti (migration_028): booking hanya setelah pemohon yang
  -- sedang diperiksa lolos.
  select * into v_pemohon from bi_checking_percobaan
   where lead_id = p_lead_id and persetujuan = 'disetujui'
   order by urutan desc limit 1;
  if v_pemohon.id is not null and v_pemohon.urutan > 1 and v_pemohon.hasil is distinct from 'lolos' then
    raise exception 'BI-Checking pemohon pengganti (%) belum lolos. Booking baru bisa dicatat setelah hasilnya Lolos.',
      v_pemohon.nama_pemohon;
  end if;
  -- Lolos memakai data pengganti: SPR, akad kredit, dan SHM atas nama
  -- debitur — maka konsumennya pun atas nama pemohon itu.
  v_pengganti := v_pemohon.id is not null and v_pemohon.urutan > 1 and v_pemohon.hasil = 'lolos';

  if p_nominal_dp is not null and p_nominal_dp < 0 then
    raise exception 'Nominal DP tidak boleh negatif.';
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

    v_biaya     := hitung_biaya_kavling(p_unit_id);
    v_tanah     := nullif((v_biaya->>'biaya_tanah')::numeric, 0);
    v_strategis := nullif((v_biaya->>'biaya_strategis')::numeric, 0);
  end if;

  update unit_holds
     set dilepas_at = now(), dilepas_by = me(), alasan_lepas = 'booking'
   where lead_id = p_lead_id and dilepas_at is null;

  insert into customers (lead_id, unit_id, sales_agent_id, name, phone, email, status, penghasilan,
                         ktp_number, pemohon_hubungan)
  values (p_lead_id, p_unit_id, coalesce(v_lead.assigned_to, me()),
          case when v_pengganti then v_pemohon.nama_pemohon else v_lead.name end,
          v_lead.phone, v_lead.email, 'proses',
          -- Penghasilan prospek bukan penghasilan pemohon pengganti.
          case when v_pengganti then null else v_lead.gaji end,
          case when v_pemohon.hasil = 'lolos' then v_pemohon.nik end,
          case when v_pengganti then v_pemohon.hubungan end)
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
    nominal_dp, biaya_tambahan_tanah, biaya_kavling_strategis,
    tanggal_survei, catatan_survei,
    bi_checking_status, bi_checking_tanggal, bi_checking_catatan,
    penghasilan_verifikasi
  )
  values (
    v_customer, p_tanggal_booking, p_nominal_booking,
    nullif(p_nominal_dp, 0), v_tanah, v_strategis,
    v_lead.tanggal_survei, v_lead.catatan_survei,
    v_lead.bi_checking_status, v_lead.bi_checking_tanggal, v_lead.bi_checking_catatan,
    case when v_pengganti then null else v_lead.gaji end
  )
  on conflict (customer_id) do nothing;

  update berkas_lampiran
     set customer_id = v_customer
   where lead_id = p_lead_id
     and customer_id is null;

  insert into lead_activities (lead_id, customer_id, actor_id, activity, hasil, note)
  values (p_lead_id, v_customer, me(), 'Konversi ke Booking', 'Booking',
          concat_ws(' · ',
            format('Unit %s', coalesce(v_unit.unit_code, '—')),
            case when v_pengganti then format('Atas nama %s (%s)', v_pemohon.nama_pemohon, label_hubungan(v_pemohon.hubungan)) end,
            format('Booking fee %s', coalesce('Rp' || to_char(p_nominal_booking, 'FM999G999G999G999'), '—')),
            'Tambahan tanah Rp' || to_char(v_tanah, 'FM999G999G999G999'),
            'Kavling strategis Rp' || to_char(v_strategis, 'FM999G999G999G999'),
            'DP Rp' || to_char(nullif(p_nominal_dp, 0), 'FM999G999G999G999')));

  return v_customer;
end;
$$;

grant execute on function convert_lead_to_customer(uuid, uuid, numeric, date, numeric) to authenticated;


-- ------------------------------------------------------------
-- 7. Notifikasi
--
-- Disalin dari migration_027, ditambah:
--   · persetujuan_bi — pemohon pengganti yang menunggu, untuk Admin Sistem.
--   · bi_diputuskan  — keputusannya dalam 7 hari terakhir, untuk pengaju.
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
       and l.status::text in ('leads', 'baru', 'cold', 'warm', 'hot', 'dihubungi', 'appointment')
  ),
  eskalasi as (
    select 'eskalasi'::text, 'tinggi'::text,
           format('%s · %s', l.name, coalesce(p.full_name, 'belum ada Sales'))::text,
           format('Jadwal follow-up terlewat %s hari', current_date - l.tanggal_rencana)::text,
           '/follow-up'::text, l.id, l.tanggal_rencana
      from leads l
      left join profiles p on p.id = l.assigned_to
     where (is_admin() or is_monitor())
       and l.tanggal_rencana is not null
       and l.tanggal_rencana < current_date - app_setting_int('eskalasi_followup_hari', 3)
       and l.status::text in ('leads', 'baru', 'cold', 'warm', 'hot', 'dihubungi', 'appointment')
  ),
  dingin as (
    select 'dingin'::text, 'sedang'::text, l.name::text,
           'Belum ada aktivitas 7 hari'::text, '/follow-up'::text, l.id, null::date
      from leads l
     where l.status in ('warm', 'hot')
       and not exists (
         select 1 from lead_activities a
          where a.lead_id = l.id
            and a.tanggal_followup > (now() at time zone 'Asia/Jakarta')::date - 7)
  ),
  siapkan_berkas as (
    select 'siapkan_berkas'::text,
           (case when c.process_started_at <= now() - make_interval(days => app_setting_int('siapkan_berkas_hari', 14) + 7)
                 then 'tinggi' else 'sedang' end)::text,
           c.name::text,
           format('Proses %s hari — berkas belum masuk bank',
                  ((now() at time zone 'Asia/Jakarta')::date - (c.process_started_at at time zone 'Asia/Jakarta')::date))::text,
           '/konsumen'::text, c.id, (c.process_started_at at time zone 'Asia/Jakarta')::date
      from customers c
      left join customer_kpr k on k.customer_id = c.id
     where can_write_berkas()
       and c.status::text in ('proses', 'aktif')
       and c.process_started_at <= now() - make_interval(days => app_setting_int('siapkan_berkas_hari', 14))
       and k.tanggal_masuk_bank is null
       and k.proses_bank_at is null
       and k.tanggal_sp3k_terbit is null
       and k.tanggal_akad is null
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
  persetujuan as (
    select 'persetujuan'::text, 'tinggi'::text,
           format('%s · %s', l.name, coalesce(p.full_name, 'pengaju'))::text,
           format(case when e.jenis = 'hapus' then 'Penghapusan catatan %s menunggu persetujuan'
                       else 'Perubahan catatan %s menunggu persetujuan' end, e.aktivitas_baru)::text,
           '/persetujuan'::text, e.id, (e.diajukan_at at time zone 'Asia/Jakarta')::date
      from lead_activity_edits e
      join leads l on l.id = e.lead_id
      left join profiles p on p.id = e.diajukan_oleh
     where e.status = 'menunggu'
       and is_admin()
  ),
  persetujuan_status as (
    select 'persetujuan_status'::text, 'tinggi'::text,
           format('%s · %s', c.name, coalesce(p.full_name, 'pengaju'))::text,
           format('Status %s → %s menunggu persetujuan', e.status_lama, e.status_baru)::text,
           '/persetujuan'::text, e.id, (e.diajukan_at at time zone 'Asia/Jakarta')::date
      from customer_status_edits e
      join customers c on c.id = e.customer_id
      left join profiles p on p.id = e.diajukan_oleh
     where e.status = 'menunggu'
       and is_admin()
  ),
  persetujuan_bi as (
    select 'persetujuan_bi'::text, 'tinggi'::text,
           format('%s · %s', l.name, coalesce(p.full_name, 'pengaju'))::text,
           format('Pemohon pengganti BI-Checking ke-%s: %s (%s)', b.urutan - 1, b.nama_pemohon, label_hubungan(b.hubungan))::text,
           '/persetujuan'::text, b.id, (b.diajukan_at at time zone 'Asia/Jakarta')::date
      from bi_checking_percobaan b
      join leads l on l.id = b.lead_id
      left join profiles p on p.id = b.diajukan_oleh
     where b.persetujuan = 'menunggu'
       and is_admin()
  ),
  bi_diputuskan as (
    select 'bi_diputuskan'::text, 'sedang'::text, l.name::text,
           (case when b.persetujuan = 'disetujui'
                 then format('Pemohon pengganti %s disetujui — lanjutkan BI-Checking', b.nama_pemohon)
                 else format('Pemohon pengganti ditolak: %s', b.alasan_tolak) end)::text,
           '/follow-up'::text, l.id, (b.diputuskan_at at time zone 'Asia/Jakarta')::date
      from bi_checking_percobaan b
      join leads l on l.id = b.lead_id
     where b.urutan > 1
       and b.persetujuan <> 'menunggu'
       and b.diajukan_oleh = me()
       and b.diputuskan_oleh is distinct from b.diajukan_oleh
       and b.diputuskan_at > now() - interval '7 days'
  ),
  catatan_ditolak as (
    select 'catatan_ditolak'::text, 'sedang'::text, l.name::text,
           format(case when e.jenis = 'hapus' then 'Penghapusan catatan ditolak: %s'
                       else 'Perubahan catatan ditolak: %s' end, e.alasan_tolak)::text,
           '/follow-up'::text, l.id, (e.diputuskan_at at time zone 'Asia/Jakarta')::date
      from lead_activity_edits e
      join leads l on l.id = e.lead_id
     where e.status = 'ditolak'
       and e.diajukan_oleh = me()
       and e.diputuskan_at > now() - interval '7 days'
  ),
  catatan_disetujui as (
    select 'catatan_disetujui'::text, 'sedang'::text, l.name::text,
           format(case when e.jenis = 'hapus' then 'Penghapusan catatan %s disetujui'
                       else 'Perubahan catatan %s disetujui' end, e.aktivitas_baru)::text,
           '/follow-up'::text, l.id, (e.diputuskan_at at time zone 'Asia/Jakarta')::date
      from lead_activity_edits e
      join leads l on l.id = e.lead_id
     where e.status = 'disetujui'
       and e.diajukan_oleh = me()
       and e.diputuskan_oleh is distinct from e.diajukan_oleh
       and e.diputuskan_at > now() - interval '7 days'
  ),
  status_diputuskan as (
    select 'status_diputuskan'::text, 'sedang'::text, c.name::text,
           (case when e.status = 'disetujui'
                 then format('Status konsumen menjadi %s — disetujui', e.status_baru)
                 else format('Perubahan status ditolak: %s', e.alasan_tolak) end)::text,
           '/konsumen'::text, c.id, (e.diputuskan_at at time zone 'Asia/Jakarta')::date
      from customer_status_edits e
      join customers c on c.id = e.customer_id
     where e.status <> 'menunggu'
       and e.diajukan_oleh = me()
       and e.diputuskan_oleh is distinct from e.diajukan_oleh
       and e.diputuskan_at > now() - interval '7 days'
  ),
  semua as (
    select * from followup
    union all select * from eskalasi
    union all select * from dingin
    union all select * from siapkan_berkas
    union all select * from sp3k
    union all select * from mandek
    union all select * from bi_checking
    union all select * from rpc
    union all select * from berkas
    union all select * from verifikasi
    union all select * from hold
    union all select * from persetujuan
    union all select * from persetujuan_status
    union all select * from persetujuan_bi
    union all select * from bi_diputuskan
    union all select * from catatan_ditolak
    union all select * from catatan_disetujui
    union all select * from status_diputuskan
  ),
  berperingkat as (
    select s.*,
           row_number() over (partition by kategori
                              order by (urgensi = 'tinggi') desc, tanggal nulls last) as urut
      from semua s
  )
  select json_build_object(
    'total',    (select count(*) from semua),
    'tinggi',   (select count(*) from semua where urgensi = 'tinggi'),
    'terlewat', (select count(*) from followup where urgensi = 'tinggi'),
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
        from (select * from berperingkat
               where urut <= 5
               order by (kategori in ('persetujuan', 'persetujuan_status', 'persetujuan_bi')) desc,
                        (urgensi = 'tinggi') desc,
                        tanggal nulls last) t), '[]'::json)
  );
$$;

grant execute on function my_notifications() to authenticated;
