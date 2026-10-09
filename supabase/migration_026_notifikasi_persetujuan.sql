-- ============================================================
-- Zafira Property — Migration 026
-- Pengajuan perubahan catatan yang mudah ditemukan.
--
-- Migration 025 sudah menghitung pengajuan yang menunggu di lonceng Admin,
-- tetapi daftarnya tidak pernah menampilkannya: my_notifications() memotong
-- isi lonceng pada 30 baris teratas dari semua kategori, diurutkan dari yang
-- paling lama. Admin melihat seluruh data — puluhan follow-up terlewat,
-- pembayaran menunggu — jadi pengajuan yang baru masuk selalu tersingkir.
-- Angka di lonceng bertambah, isinya tidak.
--
-- Isinya:
--   · my_notifications(): paling banyak lima baris per kategori, pengajuan
--     perubahan catatan selalu paling atas, kategori baru catatan_disetujui
--     untuk pengaju, dan rute catatan_ditolak yang dibetulkan (025 menulis
--     ?sorot= ganda).
--   · Realtime untuk lead_activity_edits, supaya Admin mendapat pop-up saat
--     pengajuan masuk dan pengaju saat pengajuannya diputuskan. Pop-up bisa
--     dimatikan di Pengaturan Bisnis (app_settings.notif_realtime).
--
-- Fungsi my_notifications() ditulis ulang utuh — mengulang migrasi yang lebih
-- lama sesudah ini berarti mengulang migrasi ini juga.
--
-- Aman dijalankan ulang.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Realtime
--
-- Realtime menghormati RLS: Admin menerima semua pengajuan, pengaju hanya
-- miliknya sendiri (lead_activity_edits_select). Publikasinya hanya ada di
-- Supabase; di Postgres polos (uji lokal) bagian ini dilewati.
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime'
                        and schemaname = 'public' and tablename = 'lead_activity_edits') then
    execute 'alter publication supabase_realtime add table public.lead_activity_edits';
  end if;
end $$;

insert into app_settings (key, value, description)
values ('notif_realtime', 'true',
        'Pop-up langsung saat pengajuan perubahan catatan masuk (Admin) dan saat diputuskan (pengaju).')
on conflict (key) do nothing;


-- ------------------------------------------------------------
-- 2. Notifikasi
--
-- Disalin dari migration_025 apa adanya, kecuali yang disebut di atas.
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
  -- Rute tanpa query string: lonceng sendiri yang menambahkan ?sorot=<id>.
  catatan_ditolak as (
    select 'catatan_ditolak'::text, 'sedang'::text, l.name::text,
           format('Perubahan catatan ditolak: %s', e.alasan_tolak)::text,
           '/follow-up'::text, l.id, (e.diputuskan_at at time zone 'Asia/Jakarta')::date
      from lead_activity_edits e
      join leads l on l.id = e.lead_id
     where e.status = 'ditolak'
       and e.diajukan_oleh = me()
       and e.diputuskan_at > now() - interval '7 days'
  ),
  -- Kabar baik juga kabar: tanpa ini pengaju harus membuka riwayat satu per
  -- satu untuk tahu apakah catatannya sudah berubah. Perubahan Admin atas
  -- catatannya sendiri tidak perlu dikabarkan kepada dirinya.
  catatan_disetujui as (
    select 'catatan_disetujui'::text, 'sedang'::text, l.name::text,
           format('Perubahan catatan %s disetujui', e.aktivitas_baru)::text,
           '/follow-up'::text, l.id, (e.diputuskan_at at time zone 'Asia/Jakarta')::date
      from lead_activity_edits e
      join leads l on l.id = e.lead_id
     where e.status = 'disetujui'
       and e.diajukan_oleh = me()
       and e.diputuskan_oleh is distinct from e.diajukan_oleh
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
    union all select * from catatan_disetujui
  ),
  -- Paling banyak lima per kategori. Sebelumnya daftar dipotong pada tiga
  -- puluh baris teratas dari SEMUA kategori, diurutkan dari yang paling lama
  -- — sehingga bagi Admin, yang melihat seluruh data, kategori yang barisnya
  -- baru (pengajuan perubahan catatan) tidak pernah sampai ke daftar meski
  -- angkanya ikut terhitung. Jumlah sebenarnya tetap ada di per_kategori.
  berperingkat as (
    select s.*,
           row_number() over (partition by kategori
                              order by (urgensi = 'tinggi') desc, tanggal nulls last) as urut
      from semua s
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
        from (select * from berperingkat
               where urut <= 5
               -- Pengajuan perubahan catatan selalu paling atas: seseorang
               -- sedang menunggu keputusan itu untuk melanjutkan kerjanya.
               order by (kategori = 'persetujuan') desc,
                        (urgensi = 'tinggi') desc,
                        tanggal nulls last) t), '[]'::json)
  );
$$;

grant execute on function my_notifications() to authenticated;
