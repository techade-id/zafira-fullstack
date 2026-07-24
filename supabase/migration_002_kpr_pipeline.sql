-- ============================================================
-- Griya Zafira — Migration 002
-- Aligns the CRM with the team's live sales spreadsheet:
--  - real 9-stage sales funnel
--  - full lead intake fields
--  - KPR customer progress pipeline (booking -> SHM)
--  - per-agent sales targets
--  - admin-editable business reference lists
--  - agent profile fields + customer transfer log
--
-- Run this in the Supabase SQL Editor on an EXISTING project that
-- already has schema.sql applied. A fresh project can just run the
-- updated schema.sql instead (it already includes everything here).
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block that
-- also uses the new value, so the enum additions are committed first.
-- ============================================================

-- ---------- 1. Expand the sales funnel enum ----------
alter type lead_status add value if not exists 'leads';
alter type lead_status add value if not exists 'cold';
alter type lead_status add value if not exists 'warm';
alter type lead_status add value if not exists 'deal';

-- (existing values kept: baru, dihubungi, appointment, closing, cancel)

commit;

-- ---------- 2. Lead intake fields ----------
alter table leads add column if not exists usia int;
alter table leads add column if not exists marital_status text;        -- Nikah / Janda-Duda / Single
alter table leads add column if not exists pekerjaan text;             -- Karyawan Swasta / PNS-ASN / Wirausaha
alter table leads add column if not exists perusahaan_tempat_kerja text;
alter table leads add column if not exists gaji numeric(14,2);
alter table leads add column if not exists domisili text;
alter table leads add column if not exists kabupaten text;
alter table leads add column if not exists kecamatan text;
alter table leads add column if not exists kelurahan text;
alter table leads add column if not exists rencana_selanjutnya text;   -- next planned action
alter table leads add column if not exists kategori_rencana text;      -- Follow Up / Negosiasi / ...
alter table leads add column if not exists tanggal_rencana date;       -- due date for reminders

-- ---------- 3. Agent profile fields ----------
alter table profiles add column if not exists divisi text;
alter table profiles add column if not exists daerah text;
alter table profiles add column if not exists is_active boolean not null default true;

-- allow admin/manager to edit any agent's profile (Data Agen page + transfers)
drop policy if exists "profiles_update_admin_manager" on profiles;
create policy "profiles_update_admin_manager" on profiles for update using (current_role_name() in ('admin','manager'));

-- ---------- 4. KPR customer progress pipeline ----------
create table if not exists customer_kpr (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  tanggal_booking date,
  nominal_booking numeric(14,2),
  tanggal_dp date,
  nominal_dp numeric(14,2),
  biaya_tambahan_tanah numeric(14,2),
  nominal_total_dp numeric(14,2),
  dp_terbayar numeric(14,2),
  nama_bank text,
  tanggal_masuk_bank date,
  progres_berkas text,                 -- Pemberkasan / Menunggu SP3K / SP3K Terbit / Akad / Serah Terima Kunci / Menunggu Bangunan
  tanggal_sp3k_terbit date,
  tanggal_sp3k_expired date,
  tanggal_sp3k_perpanjangan date,
  tanggal_akad date,
  tanggal_serah_terima_kunci date,
  bphtb numeric(14,2),
  shm text,
  kendala text,
  alamat_ktp text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (customer_id)
);

alter table customer_kpr enable row level security;

create policy "customer_kpr_rw" on customer_kpr for all using (
  current_role_name() in ('admin','manager') or
  exists (select 1 from customers c where c.id = customer_id and c.sales_agent_id = auth.uid())
);

-- ---------- 5. Sales targets (Penetapan Target) ----------
create table if not exists sales_targets (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references profiles(id),
  periode_start date not null,
  periode_end date not null,
  target_total_prospek int default 0,
  target_total_closing int default 0,
  target_prospek_per_hari numeric(6,2) default 0,
  target_closing_per_hari numeric(6,2) default 0,
  target_deal_value numeric(16,2) default 0,
  created_at timestamptz not null default now()
);

alter table sales_targets enable row level security;

create policy "sales_targets_read_all" on sales_targets for select using (true);
create policy "sales_targets_write_admin_manager" on sales_targets for all using (current_role_name() in ('admin','manager'));

-- ---------- 6. Admin-editable business reference lists ----------
create table if not exists business_settings (
  id uuid primary key default gen_random_uuid(),
  category text not null,   -- lead_source | bank | cancel_reason | followup_category | progres_berkas | jenis_perusahaan
  value text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (category, value)
);

alter table business_settings enable row level security;

create policy "business_settings_read_all" on business_settings for select using (true);
create policy "business_settings_write_admin_manager" on business_settings for all using (current_role_name() in ('admin','manager'));

-- Seed the values already in use in the spreadsheet
insert into business_settings (category, value, sort_order) values
  ('lead_source', 'Instagram', 1),
  ('lead_source', 'Tiktok', 2),
  ('lead_source', 'Ads', 3),
  ('lead_source', 'Freelance', 4),
  ('bank', 'Bank BTN Brebes', 1),
  ('bank', 'Bank BTN Tegal', 2),
  ('bank', 'Bank BRI Tegal', 3),
  ('bank', 'Bank BRI Brebes', 4),
  ('bank', 'Bank Mandiri', 5),
  ('bank', 'Bank BJB', 6),
  ('bank', 'Bank Jateng', 7),
  ('bank', 'Bank BSN', 8),
  ('bank', 'Cash', 9),
  ('cancel_reason', 'Alasan sepihak', 1),
  ('cancel_reason', 'Tidak lolos BI-Checking', 2),
  ('cancel_reason', 'Ekonomi tidak stabil', 3),
  ('cancel_reason', 'Tidak disetujui keluarga', 4),
  ('cancel_reason', 'Proses bank terlalu lama', 5),
  ('cancel_reason', 'RPC tidak cukup', 6),
  ('cancel_reason', 'Data diri pemohon tidak sesuai', 7),
  ('followup_category', 'Follow Up', 1),
  ('followup_category', 'Negosiasi', 2),
  ('followup_category', 'Pemberkasan', 3),
  ('followup_category', 'Rencana Akad', 4),
  ('followup_category', 'Serah Terima Kunci', 5),
  ('followup_category', 'Done', 6),
  ('progres_berkas', 'Pemberkasan', 1),
  ('progres_berkas', 'Menunggu SP3K', 2),
  ('progres_berkas', 'SP3K Terbit', 3),
  ('progres_berkas', 'Akad', 4),
  ('progres_berkas', 'Serah Terima Kunci', 5),
  ('progres_berkas', 'Menunggu Bangunan', 6)
on conflict (category, value) do nothing;

-- ---------- 7. Customer transfer log (Perpindahan Konsumen Antar Agen) ----------
create table if not exists customer_transfers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  from_agent_id uuid references profiles(id),
  to_agent_id uuid references profiles(id),
  reason text,
  transferred_by uuid references profiles(id),
  transferred_at timestamptz not null default now()
);

alter table customer_transfers enable row level security;

create policy "customer_transfers_read_all" on customer_transfers for select using (true);
create policy "customer_transfers_write_admin_manager" on customer_transfers for all using (current_role_name() in ('admin','manager'));
