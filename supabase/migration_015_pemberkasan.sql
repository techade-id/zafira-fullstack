-- ============================================================
-- Zafira Property — Migration 015
-- Alat kerja Admin Marketing: syarat berkas per bank, BI-Checking, dan RPC.
--
-- Tiga hal yang selama ini menjadi pekerjaan di luar sistem:
--
--   1. SYARAT BERKAS PER BANK. PRD §1.4 meminta "filing dokumen KPR yang
--      adaptif terhadap persyaratan spesifik dari berbagai bank mitra".
--      Sembilan bank terdaftar, tetapi aplikasi hanya mengenal satu daftar
--      lima dokumen yang ditulis mati di frontend — sehingga checklist yang
--      sebenarnya dipakai tetap hidup di kertas dan WhatsApp.
--
--   2. BI-CHECKING. Dua dari tujuh alasan pembatalan yang dikonfigurasi
--      ("Tidak lolos BI-Checking", "RPC tidak cukup") sepenuhnya dapat
--      diketahui SEBELUM berkas dikirim ke bank. Tanpa tempat mencatatnya,
--      berkas yang sudah pasti ditolak tetap dikirim, lalu menunggu 30-60
--      hari untuk mendengar jawaban yang sudah bisa ditebak sejak awal.
--
--   3. RPC (Repayment Capacity). Angsuran terhadap penghasilan. Datanya
--      setengah ada — leads.gaji terisi saat prospek — tetapi angsuran yang
--      akan ditagih bank tidak pernah dicatat, jadi rasionya tak pernah
--      dihitung.
--
-- Aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Daftar induk jenis dokumen
--
-- Disimpan di business_settings supaya dikelola di tempat yang sama dengan
-- daftar pilihan lain, dan tunduk pada policy yang sama (Pengawas/Admin).
-- Lima jenis lama sengaja tidak dihapus: dokumen yang sudah telanjur diunggah
-- memakai nama itu, dan menghapusnya membuat berkas lama kehilangan artinya.
-- ------------------------------------------------------------

insert into business_settings (category, value, sort_order) values
  ('dokumen_kpr', 'KTP Pemohon',                          1),
  ('dokumen_kpr', 'KTP Pasangan',                         2),
  ('dokumen_kpr', 'Kartu Keluarga',                       3),
  ('dokumen_kpr', 'Surat Nikah / Cerai',                  4),
  ('dokumen_kpr', 'NPWP',                                 5),
  ('dokumen_kpr', 'Slip Gaji',                            6),
  ('dokumen_kpr', 'Surat Keterangan Kerja',               7),
  ('dokumen_kpr', 'Rekening Koran 3 Bulan',               8),
  ('dokumen_kpr', 'SPT Tahunan',                          9),
  ('dokumen_kpr', 'Surat Keterangan Belum Memiliki Rumah', 10),
  ('dokumen_kpr', 'Surat Pernyataan Penghasilan',         11),
  ('dokumen_kpr', 'Formulir Aplikasi KPR',                12),
  ('dokumen_kpr', 'Pas Foto Suami Istri',                 13),
  ('dokumen_kpr', 'Akad',                                 14)
on conflict do nothing;

-- ------------------------------------------------------------
-- 2. Syarat berkas per bank
--
-- Baris dengan bank = '*' adalah syarat bawaan yang berlaku untuk bank mana
-- pun yang belum punya daftarnya sendiri. Tanpa itu, menambah satu bank baru
-- berarti mengetik ulang seluruh daftar dokumen — dan sembilan bank dikali
-- empat belas dokumen adalah 126 baris yang harus dirawat tangan.
-- ------------------------------------------------------------

create table if not exists bank_doc_requirements (
  id uuid primary key default gen_random_uuid(),
  bank text not null,
  doc_type text not null,
  wajib boolean not null default true,
  catatan text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (bank, doc_type)
);

comment on table bank_doc_requirements is
  'Syarat dokumen KPR per bank (PRD §1.4). bank = ''*'' berarti syarat bawaan untuk bank yang belum punya daftar sendiri.';

alter table bank_doc_requirements enable row level security;

drop policy if exists "bank_doc_requirements_select" on bank_doc_requirements;
create policy "bank_doc_requirements_select" on bank_doc_requirements for select using (true);

-- Ini data referensi, bukan data transaksi: kewenangannya sama dengan
-- pengaturan bisnis lain (REVISI §2.1 memberikannya kepada Pengawas).
-- Admin Marketing ikut disertakan karena dialah yang paling tahu bank
-- meminta apa, dan dialah yang menanggung akibatnya bila daftarnya salah.
drop policy if exists "bank_doc_requirements_write" on bank_doc_requirements;
create policy "bank_doc_requirements_write" on bank_doc_requirements for all
  using (can_manage_config() or can_write_berkas())
  with check (can_manage_config() or can_write_berkas());

create index if not exists idx_bank_doc_req_bank on bank_doc_requirements (bank);

-- Syarat bawaan. Yang tidak wajib ditandai supaya checklist tidak pernah
-- menyalakan peringatan untuk dokumen yang memang situasional.
insert into bank_doc_requirements (bank, doc_type, wajib, sort_order, catatan) values
  ('*', 'KTP Pemohon',                           true,  1, null),
  ('*', 'KTP Pasangan',                          false, 2, 'Bila sudah menikah'),
  ('*', 'Kartu Keluarga',                        true,  3, null),
  ('*', 'Surat Nikah / Cerai',                   false, 4, 'Bila menikah atau pernah menikah'),
  ('*', 'NPWP',                                  true,  5, null),
  ('*', 'Slip Gaji',                             true,  6, 'Tiga bulan terakhir'),
  ('*', 'Surat Keterangan Kerja',                true,  7, null),
  ('*', 'Rekening Koran 3 Bulan',                true,  8, null),
  ('*', 'SPT Tahunan',                           false, 9, 'Umumnya diminta bila penghasilan di atas PTKP'),
  ('*', 'Surat Keterangan Belum Memiliki Rumah', true, 10, 'Syarat KPR subsidi'),
  ('*', 'Surat Pernyataan Penghasilan',          false, 11, 'Untuk pemohon wirausaha'),
  ('*', 'Formulir Aplikasi KPR',                 true, 12, null),
  ('*', 'Pas Foto Suami Istri',                  true, 13, null)
on conflict do nothing;

-- ------------------------------------------------------------
-- 3. BI-Checking dan RPC
--
-- Diletakkan pada customer_kpr, bukan customers: keduanya bagian dari berkas
-- pengajuan, dan ikut terhapus bila berkasnya dihapus.
-- ------------------------------------------------------------

alter table customer_kpr add column if not exists bi_checking_status text;
alter table customer_kpr add column if not exists bi_checking_tanggal date;
alter table customer_kpr add column if not exists bi_checking_catatan text;
alter table customer_kpr add column if not exists penghasilan_verifikasi numeric(14,2);
alter table customer_kpr add column if not exists angsuran_bulanan numeric(14,2);

comment on column customer_kpr.bi_checking_status is
  'Hasil pemeriksaan SLIK/BI-Checking sebelum berkas dikirim ke bank: menunggu | lolos | tidak_lolos.';
comment on column customer_kpr.penghasilan_verifikasi is
  'Penghasilan bulanan terverifikasi. Terpisah dari leads.gaji, yang hanya keterangan calon pembeli saat masih prospek.';
comment on column customer_kpr.angsuran_bulanan is
  'Perkiraan angsuran bulanan. Bersama penghasilan_verifikasi menghasilkan rasio RPC.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'customer_kpr_bi_checking_status_check') then
    alter table customer_kpr add constraint customer_kpr_bi_checking_status_check
      check (bi_checking_status is null or bi_checking_status in ('menunggu', 'lolos', 'tidak_lolos'));
  end if;
end $$;

create index if not exists idx_customer_kpr_bi_checking
  on customer_kpr (bi_checking_status) where bi_checking_status is not null;

create index if not exists idx_customer_kpr_progres
  on customer_kpr (progres_berkas) where progres_berkas is not null;

create index if not exists idx_customer_kpr_akad
  on customer_kpr (tanggal_akad) where tanggal_akad is not null;

-- ------------------------------------------------------------
-- 4. Notifikasi: berkas yang dikirim tanpa saringan awal
--
-- Menambah dua kategori pada my_notifications(). Keduanya menyangkut hal yang
-- masih bisa dicegah — berbeda dari kategori lain yang melaporkan keadaan yang
-- sudah terjadi.
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
           '/prospek'::text as rute, l.id as record_id, l.tanggal_rencana as tanggal
      from leads l
     where l.tanggal_rencana is not null
       and l.tanggal_rencana <= current_date
       and l.status not in ('cancel', 'akad', 'aftersales')
  ),
  dingin as (
    select 'dingin'::text, 'sedang'::text, l.name::text,
           'Belum ada aktivitas 7 hari'::text, '/prospek'::text, l.id, null::date
      from leads l
     where l.status in ('warm', 'hot')
       and not exists (select 1 from lead_activities a
                        where a.lead_id = l.id and a.created_at > now() - interval '7 days')
  ),
  sp3k as (
    select 'sp3k'::text,
           (case when k.tanggal_sp3k_expired < current_date + 7 then 'tinggi' else 'sedang' end)::text,
           c.name::text,
           format('SP3K kedaluwarsa %s', to_char(k.tanggal_sp3k_expired, 'DD Mon YYYY'))::text,
           '/konsumen'::text, c.id, k.tanggal_sp3k_expired
      from customer_kpr k join customers c on c.id = k.customer_id
     where k.tanggal_sp3k_expired is not null
       and k.tanggal_akad is null
       and k.tanggal_sp3k_expired <= current_date + 14
  ),
  mandek as (
    select 'mandek'::text, 'tinggi'::text, c.name::text,
           format('%s hari di bank, SP3K belum terbit', current_date - k.tanggal_masuk_bank)::text,
           '/konsumen'::text, c.id, k.tanggal_masuk_bank
      from customer_kpr k join customers c on c.id = k.customer_id
     where k.tanggal_masuk_bank is not null
       and k.tanggal_sp3k_terbit is null
       and current_date - k.tanggal_masuk_bank > 30
  ),
  -- Baru: berkas sudah di bank padahal BI-Checking belum dinyatakan lolos.
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
  -- Baru: angsuran melebihi sepertiga penghasilan — patokan lazim KPR subsidi.
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
  verifikasi as (
    select 'verifikasi'::text, 'tinggi'::text, c.name::text,
           format('%s · Rp%s', replace(p.payment_type::text, '_', ' '),
                  to_char(p.amount, 'FM999G999G999G999'))::text,
           '/pembayaran'::text, p.id, p.payment_date
      from payments p join customers c on c.id = p.customer_id
     where p.status = 'menunggu'
  ),
  semua as (
    select * from followup
    union all select * from dingin
    union all select * from sp3k
    union all select * from mandek
    union all select * from bi_checking
    union all select * from rpc
    union all select * from verifikasi
  )
  select json_build_object(
    'total',  (select count(*) from semua),
    'tinggi', (select count(*) from semua where urgensi = 'tinggi'),
    'per_kategori', coalesce((
      select json_agg(json_build_object('kategori', kategori, 'jumlah', n) order by n desc)
        from (select kategori, count(*) n from semua group by kategori) t), '[]'::json),
    'items', coalesce((
      select json_agg(json_build_object(
               'kategori', kategori, 'urgensi', urgensi, 'judul', judul,
               'detail', detail, 'rute', rute, 'record_id', record_id))
        from (select * from semua
               order by (urgensi = 'tinggi') desc, tanggal nulls last
               limit 30) t), '[]'::json)
  );
$$;

grant execute on function my_notifications() to authenticated;
