-- ============================================================
-- Zafira Property — Migration 027
-- Alur Leads → Follow Up (Chat / Survei / BI Checking) → Booking.
--
-- Permintaan klien, dan yang dikerjakan di sini:
--   · Leads List memuat Unit/Blok yang diminati — leads.unit_diminati.
--   · BI Checking berdiri sendiri, dengan lampiran KTP dan status
--     Lolos/Tidak Lolos — slot lampiran 'ktp' dan catat_bi_checking().
--   · Survei mengisi catatan survei Saringan Awal, bukan hanya tanggalnya —
--     catat_followup() ditulis ulang.
--   · Audit trail: menghapus catatan follow-up dan mengubah status konsumen
--     kini lewat pengajuan yang diputuskan Admin Sistem. Keduanya tetap
--     meninggalkan jejak (siapa, kapan, apa) meski sudah diputuskan, dan
--     lead_activities ikut diaudit di activity_logs.
--   · Booking: Booking Fee bawaan Rp700.000 (app_settings.booking_fee),
--     tambahan tanah dan kavling strategis (hook) dihitung otomatis dari
--     tarif per perumahan, DP diisi manual — convert_lead_to_customer()
--     ditulis ulang, total DP ikut menjumlahkan biaya kavling strategis.
--   · Notifikasi: jadwal follow-up terlewat dieskalasikan ke Supervisor,
--     Pengawas, dan Admin; konsumen yang prosesnya ≥ 14 hari tanpa berkas
--     masuk bank diingatkan ke Admin Marketing.
--
-- Fungsi my_notifications() ditulis ulang utuh — mengulang migrasi yang lebih
-- lama sesudah ini berarti mengulang migrasi ini juga.
--
-- Aman dijalankan ulang.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Unit/Blok yang diminati prospek
--
-- Teks bebas, bukan kunci ke units: saat prospek pertama masuk, yang ia
-- sebut sering "blok depan" atau "C-12 kalau masih ada" — belum tentu satu
-- kavling yang pasti. Formulir menawarkan daftar kode unit sebagai saran.
-- ------------------------------------------------------------

alter table leads add column if not exists unit_diminati text;

comment on column leads.unit_diminati is
  'Unit/Blok yang diminati sejak awal, diketik bebas (formulir menyarankan kode unit). Kavling yang dipesan tetap ditentukan saat booking.';


-- ------------------------------------------------------------
-- 2. Lampiran KTP pada BI Checking
-- ------------------------------------------------------------

alter table berkas_lampiran drop constraint if exists berkas_lampiran_slot_check;
alter table berkas_lampiran add constraint berkas_lampiran_slot_check check (slot in (
  'survei', 'bi_checking', 'ktp',
  'sp3k_terbit', 'sp3k_perpanjangan',
  'akad', 'berita_acara',
  'bphtb', 'shm',
  'followup'
));


-- ------------------------------------------------------------
-- 3. catat_followup(): Survei ikut mengisi catatan survei
--
-- Isi sama dengan migration_024, kecuali satu baris: catatan Survei Lokasi
-- menjadi catatan survei Saringan Awal, sehingga terbawa ke berkas KPR saat
-- booking tanpa diketik ulang.
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
-- 4. catat_bi_checking()
--
-- BI Checking dipisah dari survei karena langkahnya berbeda: pemeriksaan
-- SLIK di bank, dengan KTP calon pembeli dan hasilnya sebagai lampiran.
-- Hasilnya tetap tinggal di kolom leads.bi_checking_* (dibaca Saringan Awal,
-- suhu prospek, dan konversi booking), dan setiap pencatatan menambah satu
-- baris riwayat supaya perubahannya terlihat di Chat Follow Up.
--
-- Lampiran KTP dan hasil BI diunggah langsung ke berkas_lampiran (slot 'ktp'
-- dan 'bi_checking') — keduanya ikut pindah ke konsumen saat booking.
-- ------------------------------------------------------------

create or replace function catat_bi_checking(
  p_lead_id uuid,
  p_status  text,
  p_tanggal date,
  p_catatan text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id    uuid;
  v_label text;
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

  -- SECURITY INVOKER: prospek milik agen lain berhenti di sini (leads_update).
  update leads
     set bi_checking_status  = p_status,
         bi_checking_tanggal = p_tanggal,
         bi_checking_catatan = nullif(btrim(coalesce(p_catatan, '')), ''),
         updated_at          = now()
   where id = p_lead_id;
  if not found then
    raise exception 'Prospek tidak ditemukan atau bukan milik Anda.' using errcode = '42501';
  end if;

  insert into lead_activities (lead_id, tanggal_followup, activity, hasil, note)
  values (p_lead_id, p_tanggal, 'BI Checking', v_label, nullif(btrim(coalesce(p_catatan, '')), ''))
  returning id into v_id;

  return v_id;
end $$;

grant execute on function catat_bi_checking(uuid, text, date, text) to authenticated;

comment on function catat_bi_checking(uuid, text, date, text) is
  'Mencatat hasil BI-Checking (SLIK) prospek: menulis leads.bi_checking_* dan satu baris riwayat follow-up.';


-- ------------------------------------------------------------
-- 5. Audit trail catatan follow-up
--
-- lead_activities belum pernah masuk daftar tabel yang diaudit (migration_008)
-- — padahal justru riwayat inilah yang paling mudah dimanipulasi. Insert
-- tidak dicatat: setiap catatan baru sudah bertanggal dan berpenulis.
-- ------------------------------------------------------------

drop trigger if exists audit_lead_activities on lead_activities;
create trigger audit_lead_activities
  after update or delete on lead_activities
  for each row execute function log_activity();


-- ------------------------------------------------------------
-- 6. Menghapus catatan follow-up lewat pengajuan
--
-- Sampai migrasi ini hanya Admin Sistem yang bisa menghapus, langsung dan
-- tanpa jejak apa pun. Kini penghapusan diajukan seperti perubahan: penulis
-- mengajukan beserta alasannya, Admin memutuskan. Penghapusan oleh Admin
-- sendiri langsung berlaku, tetapi tetap tercatat sebagai pengajuan yang
-- disetujui.
--
-- Supaya jejaknya tidak ikut hilang, pengajuan tidak lagi terhapus bersama
-- catatannya (on delete set null): potret di kolom `lama` itulah bukti
-- tentang apa yang pernah tertulis.
-- ------------------------------------------------------------

alter table lead_activity_edits add column if not exists jenis text not null default 'ubah';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lead_activity_edits_jenis_check') then
    alter table lead_activity_edits add constraint lead_activity_edits_jenis_check check (jenis in ('ubah', 'hapus'));
  end if;
end $$;

alter table lead_activity_edits alter column activity_id drop not null;
alter table lead_activity_edits drop constraint if exists lead_activity_edits_activity_id_fkey;
alter table lead_activity_edits
  add constraint lead_activity_edits_activity_id_fkey
  foreign key (activity_id) references lead_activities(id) on delete set null;

comment on column lead_activity_edits.jenis is
  'ubah = usulan perubahan isi catatan; hapus = usulan menghapus catatan. Setelah catatan terhapus, activity_id menjadi null dan potretnya tetap di kolom lama.';


create or replace function terapkan_hapus_catatan(p_edit_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  e       lead_activity_edits;
  a       lead_activities;
  v_maks  date;
begin
  select * into e from lead_activity_edits where id = p_edit_id for update;
  select * into a from lead_activities where id = e.activity_id for update;
  if a.id is null then
    raise exception 'Catatan yang diajukan sudah tidak ada.';
  end if;

  if a.activity is distinct from (e.lama->>'activity')
     or a.hasil is distinct from (e.lama->>'hasil')
     or a.note is distinct from (e.lama->>'note')
     or a.tanggal_followup is distinct from (e.lama->>'tanggal_followup')::date then
    raise exception 'Catatan ini sudah berubah sejak pengajuan dibuat — tolak, lalu minta diajukan ulang.';
  end if;

  -- Diputuskan lebih dulu: begitu catatannya terhapus, activity_id pengajuan
  -- ini menjadi null dan barisnya tinggal sebagai jejak.
  update lead_activity_edits
     set status = 'disetujui', diputuskan_oleh = me(), diputuskan_at = now()
   where id = e.id;

  delete from lead_activities where id = a.id;

  -- Tanggal survei Saringan Awal yang berasal dari catatan ini dihitung ulang
  -- dari Survei Lokasi yang tersisa.
  if a.activity = 'Survei Lokasi' then
    select max(tanggal_followup) into v_maks
      from lead_activities
     where lead_id = a.lead_id and activity = 'Survei Lokasi';

    update leads
       set tanggal_survei = case when tanggal_survei = a.tanggal_followup then v_maks else tanggal_survei end,
           updated_at = now()
     where id = a.lead_id;
  end if;

  -- Trigger suhu hanya mendengar insert dan update; penghapusan harus
  -- menghitung ulang sendiri.
  perform apply_lead_temperature(a.lead_id);
end $$;

revoke all on function terapkan_hapus_catatan(uuid) from public;
revoke all on function terapkan_hapus_catatan(uuid) from authenticated;


create or replace function ajukan_hapus_catatan(p_activity_id uuid, p_alasan text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  a      lead_activities;
  v_edit uuid;
begin
  select * into a from lead_activities where id = p_activity_id;
  if a.id is null then
    raise exception 'Catatan tidak ditemukan.';
  end if;

  if a.lead_id is null or a.customer_id is not null
     or a.activity in ('Prospek dibatalkan', 'Prospek dialihkan', 'Follow-up dijadwal ulang', 'Konversi ke Booking') then
    raise exception 'Catatan ini tidak dapat dihapus.';
  end if;
  -- Penulisnya sendiri, atau Admin Sistem untuk catatan siapa pun.
  if not (is_admin() or (a.actor_id = me() and can_write_sales())) then
    raise exception 'Hanya penulis catatan ini yang dapat mengajukan penghapusannya.' using errcode = '42501';
  end if;
  if exists (select 1 from lead_activity_edits where activity_id = a.id and status = 'menunggu') then
    raise exception 'Catatan ini masih punya pengajuan yang menunggu persetujuan.';
  end if;
  if btrim(coalesce(p_alasan, '')) = '' then
    raise exception 'Alasan penghapusan wajib diisi.';
  end if;

  insert into lead_activity_edits (activity_id, lead_id, diajukan_oleh, alasan, lama, jenis,
                                   aktivitas_baru, tanggal_baru, hasil_baru, catatan_baru)
  values (a.id, a.lead_id, me(), btrim(p_alasan),
          jsonb_build_object('activity', a.activity, 'hasil', a.hasil, 'note', a.note,
                             'tanggal_followup', a.tanggal_followup),
          'hapus', a.activity, a.tanggal_followup, a.hasil, a.note)
  returning id into v_edit;

  if is_admin() then
    perform terapkan_hapus_catatan(v_edit);
    return json_build_object('id', v_edit, 'status', 'disetujui');
  end if;

  return json_build_object('id', v_edit, 'status', 'menunggu');
end $$;

grant execute on function ajukan_hapus_catatan(uuid, text) to authenticated;


create or replace function putuskan_ubah_catatan(
  p_edit_id uuid,
  p_setujui boolean,
  p_alasan  text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_jenis  text;
begin
  if not is_admin() then
    raise exception 'Hanya Admin Sistem yang dapat memutuskan pengajuan perubahan.' using errcode = '42501';
  end if;

  select status, jenis into v_status, v_jenis from lead_activity_edits where id = p_edit_id for update;
  if v_status is null then
    raise exception 'Pengajuan tidak ditemukan.';
  end if;
  if v_status <> 'menunggu' then
    raise exception 'Pengajuan ini sudah diputuskan.';
  end if;

  if p_setujui then
    if v_jenis = 'hapus' then
      perform terapkan_hapus_catatan(p_edit_id);
    else
      perform terapkan_ubah_catatan(p_edit_id);
    end if;
    return;
  end if;

  if btrim(coalesce(p_alasan, '')) = '' then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;
  update lead_activity_edits
     set status = 'ditolak', diputuskan_oleh = me(), diputuskan_at = now(),
         alasan_tolak = btrim(p_alasan)
   where id = p_edit_id;
end $$;

grant execute on function putuskan_ubah_catatan(uuid, boolean, text) to authenticated;


-- ------------------------------------------------------------
-- 7. Status konsumen lewat pengajuan
--
-- Status konsumen (proses / aktif / selesai) dulu diubah dari sebuah dropdown
-- di daftar Konsumen, oleh siapa pun yang boleh menyunting konsumennya, dan
-- langsung berlaku. Kini perubahan diajukan beserta alasannya dan baru
-- berlaku setelah Admin Sistem menyetujui. Admin sendiri tetap lewat jalur
-- yang sama — langsung disetujui, tetapi tercatat.
--
-- Pembatalan (status 'batal') tidak lewat sini: ia punya prosesnya sendiri di
-- menu Pembatalan, lengkap dengan alasan dan pencatatnya di tabel
-- cancellations.
--
-- Trigger customers_guard_status menolak setiap perubahan status di luar dua
-- jalur itu. Fungsi yang sah menandai transaksinya lewat
-- set_config('zafira.ubah_status', 'ya', true); PostgREST tidak membuka
-- set_config bagi klien, jadi penanda itu tidak bisa dipalsukan dari aplikasi.
-- ------------------------------------------------------------

create table if not exists customer_status_edits (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references customers(id) on delete cascade,
  status_lama      text not null,
  status_baru      text not null check (status_baru in ('proses', 'aktif', 'selesai')),
  alasan           text not null,
  diajukan_oleh    uuid not null default auth.uid()
                   constraint customer_status_edits_diajukan_oleh_fkey references profiles(id),
  diajukan_at      timestamptz not null default now(),
  status           text not null default 'menunggu'
                   check (status in ('menunggu', 'disetujui', 'ditolak')),
  diputuskan_oleh  uuid constraint customer_status_edits_diputuskan_oleh_fkey references profiles(id),
  diputuskan_at    timestamptz,
  alasan_tolak     text
);

create unique index if not exists uq_customer_status_edits_menunggu
  on customer_status_edits (customer_id) where status = 'menunggu';
create index if not exists idx_customer_status_edits_status on customer_status_edits (status, diajukan_at desc);

comment on table customer_status_edits is
  'Pengajuan perubahan status konsumen. Diajukan pemegang konsumen, diputuskan Admin Sistem (migration_027).';

alter table customer_status_edits enable row level security;

drop policy if exists "customer_status_edits_select" on customer_status_edits;
create policy "customer_status_edits_select" on customer_status_edits for select
  using (can_view_all() or diajukan_oleh = me() or owns_customer(customer_id));


create or replace function customers_guard_status()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Tanpa JWT = service_role / SQL Editor (seed dan perbaikan data manual).
  if auth.uid() is null then
    return new;
  end if;
  if new.status is distinct from old.status
     and coalesce(current_setting('zafira.ubah_status', true), '') <> 'ya' then
    raise exception 'Status konsumen hanya bisa diubah lewat pengajuan yang disetujui Admin Sistem.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists customers_guard_status on customers;
create trigger customers_guard_status
  before update of status on customers
  for each row execute function customers_guard_status();


-- Pembatalan tetap jalurnya sendiri. Isi sama dengan migration_003,
-- ditambah penanda yang dibaca customers_guard_status.
create or replace function cancel_customer(
  p_customer_id uuid,
  p_reason text,
  p_detail text default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
begin
  perform set_config('zafira.ubah_status', 'ya', true);
  update customers set status = 'batal' where id = p_customer_id;
  if not found then
    raise exception 'Konsumen tidak ditemukan atau Anda tidak punya akses.' using errcode = '42501';
  end if;
  perform set_config('zafira.ubah_status', '', true);

  insert into cancellations (customer_id, reason, detail, cancelled_by)
  values (p_customer_id, p_reason, p_detail, auth.uid())
  returning id into v_id;

  return v_id;
end $$;

grant execute on function cancel_customer(uuid, text, text) to authenticated;


create or replace function terapkan_status_konsumen(p_edit_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  e customer_status_edits;
  c customers;
begin
  select * into e from customer_status_edits where id = p_edit_id for update;
  select * into c from customers where id = e.customer_id for update;
  if c.id is null then
    raise exception 'Konsumen tidak ditemukan.';
  end if;
  if c.status::text <> e.status_lama then
    raise exception 'Status konsumen sudah berubah sejak pengajuan dibuat — tolak, lalu minta diajukan ulang.';
  end if;

  perform set_config('zafira.ubah_status', 'ya', true);
  update customers
     set status = e.status_baru::customer_status,
         -- Tanggal selesai dicap sekali dan tidak pernah dihapus: dari
         -- situlah laporan lama proses dihitung.
         process_completed_at = case when e.status_baru = 'selesai' and process_completed_at is null
                                     then now() else process_completed_at end
   where id = c.id;
  perform set_config('zafira.ubah_status', '', true);

  update customer_status_edits
     set status = 'disetujui', diputuskan_oleh = me(), diputuskan_at = now()
   where id = e.id;
end $$;

revoke all on function terapkan_status_konsumen(uuid) from public;
revoke all on function terapkan_status_konsumen(uuid) from authenticated;


create or replace function ajukan_status_konsumen(p_customer_id uuid, p_status text, p_alasan text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  c      customers;
  v_edit uuid;
begin
  select * into c from customers where id = p_customer_id;
  if c.id is null then
    raise exception 'Konsumen tidak ditemukan.';
  end if;
  -- Cerminan customers_update (migration_011): siapa yang boleh menyunting
  -- konsumen boleh mengajukan perubahan statusnya.
  if not (can_write_berkas() or (is_sales() and c.sales_agent_id = me() and c.locked_at is null)) then
    raise exception 'Anda tidak berhak mengajukan perubahan status konsumen ini.' using errcode = '42501';
  end if;
  if p_status = 'batal' then
    raise exception 'Pembatalan dilakukan lewat menu Pembatalan, lengkap dengan alasannya.';
  end if;
  if p_status is null or p_status not in ('proses', 'aktif', 'selesai') then
    raise exception 'Pilih status baru: proses, aktif, atau selesai.';
  end if;
  if c.status::text = 'batal' then
    raise exception 'Konsumen ini sudah dibatalkan.';
  end if;
  if c.status::text = p_status then
    raise exception 'Status konsumen sudah %.', p_status;
  end if;
  if btrim(coalesce(p_alasan, '')) = '' then
    raise exception 'Alasan perubahan status wajib diisi.';
  end if;
  if exists (select 1 from customer_status_edits where customer_id = c.id and status = 'menunggu') then
    raise exception 'Konsumen ini masih punya pengajuan status yang menunggu persetujuan.';
  end if;

  insert into customer_status_edits (customer_id, status_lama, status_baru, alasan, diajukan_oleh)
  values (c.id, c.status::text, p_status, btrim(p_alasan), me())
  returning id into v_edit;

  if is_admin() then
    perform terapkan_status_konsumen(v_edit);
    return json_build_object('id', v_edit, 'status', 'disetujui');
  end if;

  return json_build_object('id', v_edit, 'status', 'menunggu');
end $$;

grant execute on function ajukan_status_konsumen(uuid, text, text) to authenticated;


create or replace function putuskan_status_konsumen(p_edit_id uuid, p_setujui boolean, p_alasan text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not is_admin() then
    raise exception 'Hanya Admin Sistem yang dapat memutuskan pengajuan status konsumen.' using errcode = '42501';
  end if;

  select status into v_status from customer_status_edits where id = p_edit_id for update;
  if v_status is null then
    raise exception 'Pengajuan tidak ditemukan.';
  end if;
  if v_status <> 'menunggu' then
    raise exception 'Pengajuan ini sudah diputuskan.';
  end if;

  if p_setujui then
    perform terapkan_status_konsumen(p_edit_id);
    return;
  end if;

  if btrim(coalesce(p_alasan, '')) = '' then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;
  update customer_status_edits
     set status = 'ditolak', diputuskan_oleh = me(), diputuskan_at = now(),
         alasan_tolak = btrim(p_alasan)
   where id = p_edit_id;
end $$;

grant execute on function putuskan_status_konsumen(uuid, boolean, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime'
                        and schemaname = 'public' and tablename = 'customer_status_edits') then
    execute 'alter publication supabase_realtime add table public.customer_status_edits';
  end if;
end $$;


-- ------------------------------------------------------------
-- 8. Biaya kavling: tambahan tanah dan kavling strategis
--
-- Luas standar dibaca dari tipe unit — "30/60" berarti bangunan 30 m² di atas
-- tanah 60 m². Kavling yang luas tanahnya (units.luas_tanah, diisi di editor
-- siteplan) melebihi angka itu membayar kelebihannya per m² menurut tarif
-- perumahannya; kavling yang lebih kecil tidak mendapat potongan. Kavling
-- hook membayar biaya kavling strategis perumahannya. Keduanya masuk Total DP.
-- ------------------------------------------------------------

alter table projects add column if not exists tarif_tanah_per_m2 numeric(14,2) not null default 1000000;
alter table projects add column if not exists biaya_kavling_strategis numeric(14,2) not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'projects_biaya_kavling_check') then
    alter table projects add constraint projects_biaya_kavling_check
      check (tarif_tanah_per_m2 >= 0 and biaya_kavling_strategis >= 0);
  end if;
end $$;

comment on column projects.tarif_tanah_per_m2 is
  'Harga per m² kelebihan tanah di atas luas standar tipe unit (mis. tipe 36/72 berdiri di kavling 80 m² → 8 m² × tarif).';
comment on column projects.biaya_kavling_strategis is
  'Biaya tambahan kavling strategis (posisi hook) di perumahan ini.';

alter table customer_kpr add column if not exists biaya_kavling_strategis numeric(14,2);

create or replace function kpr_hitung_total_dp()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.nominal_dp is not null or new.biaya_tambahan_tanah is not null or new.biaya_kavling_strategis is not null then
    new.nominal_total_dp := coalesce(new.nominal_dp, 0)
                          + coalesce(new.biaya_tambahan_tanah, 0)
                          + coalesce(new.biaya_kavling_strategis, 0);
  end if;
  return new;
end $$;


/** Angka luas tanah pada tipe "36/72" → 72. Null bila tipenya tidak berformat itu. */
create or replace function luas_tanah_standar(p_type text)
returns numeric language sql immutable set search_path = public as $$
  select nullif(replace(substring(coalesce(p_type, '') from '/\s*([0-9]+(?:[.,][0-9]+)?)'), ',', '.'), '')::numeric;
$$;

grant execute on function luas_tanah_standar(text) to authenticated;


/**
 * Rincian biaya kavling — satu sumber untuk pratinjau di formulir booking
 * dan untuk yang benar-benar ditulis convert_lead_to_customer().
 */
create or replace function hitung_biaya_kavling(p_unit_id uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  u          units;
  p          projects;
  v_standar  numeric;
  v_lebih    numeric := 0;
  v_hook     boolean;
begin
  if me() is null then
    return null;
  end if;
  select * into u from units where id = p_unit_id;
  if u.id is null then
    return null;
  end if;
  select * into p from projects where id = u.project_id;

  v_standar := luas_tanah_standar(u.type);
  if u.luas_tanah is not null and v_standar is not null then
    v_lebih := greatest(0, u.luas_tanah - v_standar);
  end if;
  v_hook := coalesce(u.posisi, 'standar') = 'hook';

  return json_build_object(
    'luas_tanah',       u.luas_tanah,
    'luas_standar',     v_standar,
    'kelebihan_m2',     v_lebih,
    'tarif_per_m2',     round(coalesce(p.tarif_tanah_per_m2, 0)),
    'biaya_tanah',      round(v_lebih * coalesce(p.tarif_tanah_per_m2, 0)),
    'posisi',           coalesce(u.posisi, 'standar'),
    'strategis',        v_hook,
    'biaya_strategis',  case when v_hook then round(coalesce(p.biaya_kavling_strategis, 0)) else 0 end
  );
end $$;

grant execute on function hitung_biaya_kavling(uuid) to authenticated;


insert into app_settings (key, value, description) values
  ('booking_fee', '700000', 'Booking Fee yang otomatis terisi saat Konversi ke Booking (Rupiah).'),
  ('eskalasi_followup_hari', '3', 'Jadwal follow-up yang terlewat lebih dari sekian hari dikabarkan ke Supervisor, Pengawas, dan Admin.'),
  ('siapkan_berkas_hari', '14', 'Konsumen yang prosesnya sudah sekian hari tanpa berkas masuk bank diingatkan ke Admin Marketing.')
on conflict (key) do nothing;


-- ------------------------------------------------------------
-- 9. convert_lead_to_customer(): DP dan biaya kavling
--
-- Isi sama dengan migration_022, ditambah:
--   · p_nominal_dp — DP yang disepakati, diketik manual.
--   · tambahan tanah dan biaya kavling strategis dihitung di sini dari unit
--     yang dipilih (hitung_biaya_kavling), bukan dikirim dari layar: angka
--     yang menentukan uang tidak boleh bisa diubah dari peramban.
-- Bukti transfer Booking Fee diunggah sesudahnya oleh aplikasi ke folder
-- konsumen baru (bucket payment-proofs berpemilik konsumen, bukan prospek).
-- ------------------------------------------------------------

drop function if exists convert_lead_to_customer(uuid, uuid, numeric, date);

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

  if v_lead.bi_checking_status = 'tidak_lolos' then
    raise exception 'BI-Checking prospek ini tidak lolos. Selesaikan dahulu sebelum booking dicatat.';
  end if;

  if exists (select 1 from customers where lead_id = p_lead_id) then
    raise exception 'Prospek ini sudah pernah dikonversi menjadi konsumen.';
  end if;

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
    v_lead.gaji
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
            format('Booking fee %s', coalesce('Rp' || to_char(p_nominal_booking, 'FM999G999G999G999'), '—')),
            'Tambahan tanah Rp' || to_char(v_tanah, 'FM999G999G999G999'),
            'Kavling strategis Rp' || to_char(v_strategis, 'FM999G999G999G999'),
            'DP Rp' || to_char(nullif(p_nominal_dp, 0), 'FM999G999G999G999')));

  return v_customer;
end;
$$;

grant execute on function convert_lead_to_customer(uuid, uuid, numeric, date, numeric) to authenticated;

comment on function convert_lead_to_customer(uuid, uuid, numeric, date, numeric) is
  'Booking sebagai satu peristiwa: konsumen, unit, Booking Fee, DP, tambahan tanah, dan kavling strategis dalam satu transaksi.';


-- ------------------------------------------------------------
-- 10. Notifikasi
--
-- Disalin dari migration_026, dengan perubahan:
--   · followup     — hanya prospek yang masih diproses (tahap yang sama
--                    dengan antrean Follow Up Leads). Prospek yang sudah
--                    booking tidak lagi "terlewat" karena jadwal lamanya.
--   · eskalasi     — jadwal yang terlewat lebih dari app_settings
--                    .eskalasi_followup_hari, untuk Supervisor, Pengawas, Admin.
--   · siapkan_berkas — konsumen yang prosesnya ≥ app_settings
--                    .siapkan_berkas_hari tanpa berkas masuk bank, untuk
--                    Admin Marketing dan Admin.
--   · persetujuan  — kini juga pengajuan hapus catatan.
--   · persetujuan_status / status_diputuskan — pengajuan status konsumen.
--   · 'terlewat'   — jumlah jadwal terlewat, untuk pengingat saat masuk.
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
               order by (kategori in ('persetujuan', 'persetujuan_status')) desc,
                        (urgensi = 'tinggi') desc,
                        tanggal nulls last) t), '[]'::json)
  );
$$;

grant execute on function my_notifications() to authenticated;
