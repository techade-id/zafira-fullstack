-- ============================================================
-- Zafira Property — Migration 025
-- Mengubah catatan follow-up, dengan persetujuan Admin.
--
-- Catatan follow-up adalah jejak: dari situlah status prospek, Kontak
-- Terakhir, dan Saringan Awal dibaca. Salah ketik tetap perlu bisa
-- diperbaiki, tetapi perbaikan yang langsung berlaku sama saja dengan
-- menulis ulang sejarah. Jadi penulisnya mengajukan, Admin Sistem memutuskan.
--
-- Sampai migrasi ini, lead_activities_update (migration_011) justru membuka
-- pintu sebaliknya: penulis boleh mengubah catatannya sendiri langsung, tanpa
-- jejak apa pun. Pintu itu ditutup di sini — perubahan langsung hanya untuk
-- Admin, selebihnya lewat pengajuan.
--
-- Isinya:
--   · lead_activity_edits: satu baris per pengajuan, dengan potret catatan
--     saat diajukan, usulannya, alasannya, dan keputusannya.
--   · berkas_lampiran.edit_id: bukti tambahan yang diajukan. Ia baru menjadi
--     bukti catatan (activity_id) setelah disetujui.
--   · ajukan_ubah_catatan(), putuskan_ubah_catatan().
--   · my_notifications(): pengajuan yang menunggu (untuk Admin) dan pengajuan
--     yang ditolak (untuk pengajunya).
--
-- Yang bisa diubah: jenis, tanggal follow-up, hasil, catatan, dan tambah
-- bukti. Bukti lama tidak bisa dihapus atau diganti lewat jalur ini.
--
-- Aman dijalankan ulang.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Pintu langsung hanya untuk Admin
-- ------------------------------------------------------------

drop policy if exists "lead_activities_update" on lead_activities;
create policy "lead_activities_update" on lead_activities for update
  using (is_admin()) with check (is_admin());


-- ------------------------------------------------------------
-- 2. Pengajuan
-- ------------------------------------------------------------

create table if not exists lead_activity_edits (
  id               uuid primary key default gen_random_uuid(),
  activity_id      uuid not null references lead_activities(id) on delete cascade,
  lead_id          uuid not null references leads(id) on delete cascade,
  diajukan_oleh    uuid not null default auth.uid()
                   constraint lead_activity_edits_diajukan_oleh_fkey references profiles(id),
  diajukan_at      timestamptz not null default now(),
  alasan           text not null,
  -- Potret catatan saat diajukan: { activity, hasil, note, tanggal_followup }.
  -- Itulah "versi lama" yang ditampilkan, dan pembanding saat diputuskan —
  -- kalau catatannya sudah berubah sejak diajukan, usulan ini basi.
  lama             jsonb not null,
  aktivitas_baru   text not null,
  tanggal_baru     date not null,
  hasil_baru       text,
  catatan_baru     text,
  status           text not null default 'menunggu'
                   check (status in ('menunggu', 'disetujui', 'ditolak')),
  diputuskan_oleh  uuid constraint lead_activity_edits_diputuskan_oleh_fkey references profiles(id),
  diputuskan_at    timestamptz,
  alasan_tolak     text
);

-- Satu pengajuan menunggu per catatan: dua usulan yang bersaing atas satu
-- catatan memaksa Admin menebak mana yang dimaksud.
create unique index if not exists uq_lead_activity_edits_menunggu
  on lead_activity_edits (activity_id) where status = 'menunggu';
create index if not exists idx_lead_activity_edits_status on lead_activity_edits (status, diajukan_at desc);
create index if not exists idx_lead_activity_edits_activity on lead_activity_edits (activity_id, diajukan_at desc);

comment on table lead_activity_edits is
  'Pengajuan perubahan catatan follow-up. Diajukan penulisnya, diputuskan Admin Sistem (migration_025).';

alter table lead_activity_edits enable row level security;

-- Hanya baca. Menulis lewat ajukan_ubah_catatan() dan putuskan_ubah_catatan(),
-- yang menegakkan siapa boleh apa.
drop policy if exists "lead_activity_edits_select" on lead_activity_edits;
create policy "lead_activity_edits_select" on lead_activity_edits for select
  using (can_view_all() or diajukan_oleh = me() or owns_lead(lead_id));

alter table berkas_lampiran
  add column if not exists edit_id uuid references lead_activity_edits(id) on delete cascade;
create index if not exists idx_berkas_lampiran_edit on berkas_lampiran (edit_id);


-- ------------------------------------------------------------
-- 3. Menerapkan pengajuan (internal)
-- ------------------------------------------------------------

create or replace function terapkan_ubah_catatan(p_edit_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  e            lead_activity_edits;
  a            lead_activities;
  v_survei_lama boolean;
  v_survei_baru boolean;
  v_tgl_lama   date;
  v_maks       date;
begin
  select * into e from lead_activity_edits where id = p_edit_id for update;
  select * into a from lead_activities where id = e.activity_id for update;
  if a.id is null then
    raise exception 'Catatan yang diajukan sudah tidak ada.';
  end if;

  -- Usulan dibuat atas versi tertentu. Kalau catatannya sudah berubah sejak
  -- itu, menerapkannya akan diam-diam menimpa perubahan yang lain.
  if a.activity is distinct from (e.lama->>'activity')
     or a.hasil is distinct from (e.lama->>'hasil')
     or a.note is distinct from (e.lama->>'note')
     or a.tanggal_followup is distinct from (e.lama->>'tanggal_followup')::date then
    raise exception 'Catatan ini sudah berubah sejak pengajuan dibuat — tolak, lalu minta diajukan ulang.';
  end if;

  v_survei_lama := a.activity = 'Survei Lokasi';
  v_survei_baru := e.aktivitas_baru = 'Survei Lokasi';
  v_tgl_lama    := a.tanggal_followup;

  update lead_activities
     set activity         = e.aktivitas_baru,
         tanggal_followup = e.tanggal_baru,
         hasil            = e.hasil_baru,
         note             = e.catatan_baru
   where id = a.id;

  -- Bukti tambahan menjadi bukti catatan ini; bukti lama mengikuti jenis
  -- barunya — foto survei tinggal di lampiran survei Saringan Awal.
  update berkas_lampiran
     set activity_id = a.id
   where edit_id = e.id;
  update berkas_lampiran
     set slot = case when v_survei_baru then 'survei' else 'followup' end
   where activity_id = a.id
     and slot in ('survei', 'followup');

  -- Tanggal survei Saringan Awal mengikuti Survei Lokasi yang tersisa.
  -- Tanggal yang memang berasal dari catatan ini dihitung ulang; tanggal
  -- yang diisi lewat Saringan Awal sendiri tidak disentuh, kecuali ada
  -- survei yang lebih baru.
  if v_survei_lama or v_survei_baru then
    select max(tanggal_followup) into v_maks
      from lead_activities
     where lead_id = a.lead_id and activity = 'Survei Lokasi';

    update leads
       set tanggal_survei = case
             when tanggal_survei is null then v_maks
             when v_survei_lama and tanggal_survei = v_tgl_lama then v_maks
             else greatest(tanggal_survei, v_maks)
           end,
           updated_at = now()
     where id = a.lead_id;
  end if;

  update lead_activity_edits
     set status = 'disetujui', diputuskan_oleh = me(), diputuskan_at = now()
   where id = e.id;
  -- Status prospek dihitung ulang oleh trigger lead_activities_apply_temperature.
end $$;

revoke all on function terapkan_ubah_catatan(uuid) from public;
revoke all on function terapkan_ubah_catatan(uuid) from authenticated;


-- ------------------------------------------------------------
-- 4. ajukan_ubah_catatan()
-- ------------------------------------------------------------

drop function if exists ajukan_ubah_catatan(uuid, text, date, text, text, text, jsonb);

create or replace function ajukan_ubah_catatan(
  p_activity_id uuid,
  p_aktivitas   text,
  p_tanggal     date,
  p_hasil       text,
  p_catatan     text,
  p_alasan      text,
  p_lampiran    jsonb default '[]'::jsonb   -- [{ "path": "<lead_id>/followup/...", "nama": "..." }]
) returns json
language plpgsql security definer set search_path = public as $$
declare
  a        lead_activities;
  v_edit   uuid;
  v_hasil  text := nullif(btrim(coalesce(p_hasil, '')), '');
  v_note   text := nullif(btrim(coalesce(p_catatan, '')), '');
  v_akt    text := btrim(coalesce(p_aktivitas, ''));
  v_bukti  int  := coalesce(jsonb_array_length(case when jsonb_typeof(p_lampiran) = 'array' then p_lampiran end), 0);
  v_jumlah int;
begin
  select * into a from lead_activities where id = p_activity_id;
  if a.id is null then
    raise exception 'Catatan tidak ditemukan.';
  end if;

  -- Hanya follow-up prospek yang ditulis manusia. Catatan konsumen punya
  -- jalurnya sendiri, dan catatan sistem adalah cerminan kejadian lain.
  if a.lead_id is null or a.customer_id is not null
     or a.activity in ('Prospek dibatalkan', 'Prospek dialihkan', 'Follow-up dijadwal ulang') then
    raise exception 'Catatan ini tidak dapat diubah.';
  end if;
  if a.actor_id is distinct from me() or not can_write_sales() then
    raise exception 'Hanya penulis catatan ini yang dapat mengajukan perubahannya.' using errcode = '42501';
  end if;
  if exists (select 1 from lead_activity_edits where activity_id = a.id and status = 'menunggu') then
    raise exception 'Catatan ini masih punya pengajuan yang menunggu persetujuan.';
  end if;

  if btrim(coalesce(p_alasan, '')) = '' then
    raise exception 'Alasan perubahan wajib diisi.';
  end if;
  if v_akt = '' then
    raise exception 'Pilih jenis follow-up.';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal follow-up wajib diisi.';
  end if;
  if p_tanggal > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal follow-up tidak boleh melewati hari ini.';
  end if;
  if v_hasil is null and v_note is null then
    raise exception 'Isi hasil follow-up atau catatannya.';
  end if;
  if v_akt = a.activity and p_tanggal = a.tanggal_followup
     and v_hasil is not distinct from a.hasil and v_note is not distinct from a.note
     and v_bukti = 0 then
    raise exception 'Tidak ada yang diubah.';
  end if;

  insert into lead_activity_edits (activity_id, lead_id, diajukan_oleh, alasan, lama,
                                   aktivitas_baru, tanggal_baru, hasil_baru, catatan_baru)
  values (a.id, a.lead_id, me(), btrim(p_alasan),
          jsonb_build_object('activity', a.activity, 'hasil', a.hasil, 'note', a.note,
                             'tanggal_followup', a.tanggal_followup),
          v_akt, p_tanggal, v_hasil, v_note)
  returning id into v_edit;

  -- Bukti tambahan: hanya berkas di folder prospek ini (lihat catat_followup).
  if v_bukti > 0 then
    insert into berkas_lampiran (lead_id, slot, file_url, file_name, edit_id)
    select a.lead_id, 'followup', e->>'path', nullif(btrim(coalesce(e->>'nama', '')), ''), v_edit
      from jsonb_array_elements(p_lampiran) e
     where coalesce(e->>'path', '') like a.lead_id::text || '/%';
    get diagnostics v_jumlah = row_count;
    if v_jumlah <> v_bukti then
      raise exception 'Bukti tambahan tidak valid — unggah ulang berkasnya.';
    end if;
  end if;

  -- Admin Sistem adalah penyetujunya; perubahannya sendiri langsung berlaku,
  -- tetapi tetap meninggalkan baris pengajuan sebagai jejak.
  if is_admin() then
    perform terapkan_ubah_catatan(v_edit);
    return json_build_object('id', v_edit, 'status', 'disetujui');
  end if;

  return json_build_object('id', v_edit, 'status', 'menunggu');
end $$;

grant execute on function ajukan_ubah_catatan(uuid, text, date, text, text, text, jsonb) to authenticated;


-- ------------------------------------------------------------
-- 5. putuskan_ubah_catatan()
-- ------------------------------------------------------------

create or replace function putuskan_ubah_catatan(
  p_edit_id uuid,
  p_setujui boolean,
  p_alasan  text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not is_admin() then
    raise exception 'Hanya Admin Sistem yang dapat memutuskan pengajuan perubahan.' using errcode = '42501';
  end if;

  select status into v_status from lead_activity_edits where id = p_edit_id for update;
  if v_status is null then
    raise exception 'Pengajuan tidak ditemukan.';
  end if;
  if v_status <> 'menunggu' then
    raise exception 'Pengajuan ini sudah diputuskan.';
  end if;

  if p_setujui then
    perform terapkan_ubah_catatan(p_edit_id);
    return;
  end if;

  -- Alasan penolakan memberi tahu pengaju apa yang harus diperbaiki.
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
-- 6. Notifikasi
--
-- Disalin dari migration_022 apa adanya, ditambah dua kategori:
--   · persetujuan     — pengajuan yang menunggu, hanya untuk Admin Sistem.
--   · catatan_ditolak — pengajuan yang ditolak dalam 7 hari terakhir, untuk
--                       pengajunya: tanpa ini ia tidak pernah tahu.
-- Kategori `dingin` kini membaca tanggal follow-up (migration_024), bukan
-- kapan catatannya diketik.
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
            and a.tanggal_followup > (now() at time zone 'Asia/Jakarta')::date - 7)
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
           format('Perubahan catatan %s menunggu persetujuan', e.aktivitas_baru)::text,
           '/persetujuan'::text, e.id, (e.diajukan_at at time zone 'Asia/Jakarta')::date
      from lead_activity_edits e
      join leads l on l.id = e.lead_id
      left join profiles p on p.id = e.diajukan_oleh
     where e.status = 'menunggu'
       and is_admin()
  ),
  catatan_ditolak as (
    select 'catatan_ditolak'::text, 'sedang'::text, l.name::text,
           format('Perubahan catatan ditolak: %s', e.alasan_tolak)::text,
           format('/follow-up?sorot=%s', l.id)::text, l.id, (e.diputuskan_at at time zone 'Asia/Jakarta')::date
      from lead_activity_edits e
      join leads l on l.id = e.lead_id
     where e.status = 'ditolak'
       and e.diajukan_oleh = me()
       and e.diputuskan_at > now() - interval '7 days'
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
    union all select * from persetujuan
    union all select * from catatan_ditolak
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
