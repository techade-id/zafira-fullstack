-- ============================================================
-- Data uji.
--
-- Dijalankan sebagai superuser (RLS dilewati), sehingga berkas ini murni
-- menyiapkan keadaan awal. Semua pemeriksaan aturan ada di berkas 02 ke atas,
-- yang berjalan sebagai role `authenticated`.
--
-- UUID sengaja dibuat mudah dikenali:
--   1… Sales A   2… Sales B   3… Finance
--   4… Admin Marketing   5… Supervisor   6… Pengawas   7… Admin
-- ============================================================

-- Supabase memberikan hak tabel kepada role `authenticated` secara bawaan.
-- Di Postgres polos hal itu harus dilakukan sendiri, dan baru bisa setelah
-- seluruh migrasi membuat tabelnya — karena itu letaknya di sini, bukan di
-- kerangka uji. Yang membatasi akses tetap RLS, bukan GRANT.
grant usage on schema public, auth, storage to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema storage to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

-- Pengguna. Trigger on_auth_user_created ikut teruji di sini: ia yang membuat
-- baris profiles, sehingga setiap pengguna baru bermula sebagai Sales.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'sales.a@zafiraproperty.id',  '{"full_name":"Sales A"}'),
  ('22222222-2222-2222-2222-222222222222', 'sales.b@zafiraproperty.id',  '{"full_name":"Sales B"}'),
  ('33333333-3333-3333-3333-333333333333', 'finance@zafiraproperty.id',  '{"full_name":"Fina Finance"}'),
  ('44444444-4444-4444-4444-444444444444', 'adminmkt@zafiraproperty.id', '{"full_name":"Ratna Admin"}'),
  ('55555555-5555-5555-5555-555555555555', 'spv@zafiraproperty.id',      '{"full_name":"Supervisor"}'),
  ('66666666-6666-6666-6666-666666666666', 'pengawas@zafiraproperty.id', '{"full_name":"Pengawas"}'),
  ('77777777-7777-7777-7777-777777777777', 'admin@zafiraproperty.id',    '{"full_name":"Admin Sistem"}');

update profiles set role = 'finance'              where id = '33333333-3333-3333-3333-333333333333';
update profiles set role = 'admin_marketing'      where id = '44444444-4444-4444-4444-444444444444';
update profiles set role = 'supervisor_marketing' where id = '55555555-5555-5555-5555-555555555555';
update profiles set role = 'pengawas'             where id = '66666666-6666-6666-6666-666666666666';
update profiles set role = 'admin'                where id = '77777777-7777-7777-7777-777777777777';

-- Sejak migration_011 setiap akun baru masuk dalam keadaan nonaktif menunggu
-- persetujuan. Ketujuh pengguna di atas adalah tim yang sudah berjalan, jadi
-- di sini mereka diaktifkan langsung — persis seperti langkah bootstrap admin
-- pertama yang didokumentasikan di README.
update profiles set is_active = true
 where id in (
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
   '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666',
   '77777777-7777-7777-7777-777777777777');

-- Proyek & unit
insert into projects (id, name, location) values
  ('0a0a0a0a-0000-0000-0000-000000000001', 'Zafira Kaligangsa', 'Brebes');

insert into units (id, project_id, unit_code, block, type, price, status) values
  ('0b0b0b0b-0000-0000-0000-000000000001', '0a0a0a0a-0000-0000-0000-000000000001', 'A-01', 'A', '36/72', 250000000, 'tersedia'),
  ('0b0b0b0b-0000-0000-0000-000000000002', '0a0a0a0a-0000-0000-0000-000000000001', 'A-02', 'A', '36/72', 250000000, 'tersedia');

-- Sumber leads relasional
insert into ads_campaigns (id, platform, name, code, budget) values
  ('0c0c0c0c-0000-0000-0000-000000000001', 'Instagram', 'Promo Ramadan', 'RMD24', 5000000),
  ('0c0c0c0c-0000-0000-0000-000000000002', 'TikTok',    'Open House Mei', 'OHM24', 3000000);

insert into partners (id, name, type, phone) values
  ('0d0d0d0d-0000-0000-0000-000000000001', 'Mitra Sejahtera', 'kemitraan', '0812999888');

-- Belanja iklan: Rp4jt untuk Ramadan, Rp2jt untuk Open House.
-- leads_generated sengaja diisi angka ngawur untuk membuktikan bahwa biaya per
-- lead dihitung dari tabel leads, bukan dari kolom yang diketik tangan ini.
insert into ads_analytics (platform, campaign_id, report_date, spend, impressions, clicks, leads_generated) values
  ('Instagram', '0c0c0c0c-0000-0000-0000-000000000001', current_date, 4000000, 100000, 900, 999),
  ('TikTok',    '0c0c0c0c-0000-0000-0000-000000000002', current_date, 2000000,  50000, 400, 999);

-- Prospek milik Sales A. Emoji disengaja: PRD §2.2 mewajibkan nama dan username
-- mendukung Unicode, dan pencarian harus tetap menemukannya.
insert into leads (id, name, phone, notes, status, source_type, campaign_id, assigned_to) values
  ('0e0e0e0e-0000-0000-0000-000000000001', 'Budi Santoso 🏠', '0812000111',
   'Tertarik unit hook, minta simulasi kredit BTN bulan depan', 'leads',
   'ads', '0c0c0c0c-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('0e0e0e0e-0000-0000-0000-000000000002', 'Citra Dewi', '0812000222',
   'Masih membandingkan dengan perumahan sebelah', 'warm',
   'ads', '0c0c0c0c-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('0e0e0e0e-0000-0000-0000-000000000003', 'Dedi Kurnia', '0812000333',
   'Sudah survei lokasi, menunggu persetujuan istri', 'hot',
   'ads', '0c0c0c0c-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  -- Nilai enum lama, untuk membuktikan lead_stage_bucket() memetakannya benar.
  ('0e0e0e0e-0000-0000-0000-000000000004', 'Eka Legacy', '0812000444',
   'Baris lama dengan status appointment', 'appointment',
   'ads', '0c0c0c0c-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111');

-- Prospek milik Sales B — dipakai menguji isolasi antar agen.
insert into leads (id, name, phone, notes, status, assigned_to) values
  ('0e0e0e0e-0000-0000-0000-000000000009', 'Prospek Milik Sales B', '0813000999',
   'Catatan rahasia milik Sales B mengenai diskon khusus', 'leads',
   '22222222-2222-2222-2222-222222222222');

-- Konsumen milik Sales A, belum terkunci.
insert into customers (id, lead_id, unit_id, name, phone, sales_agent_id, status) values
  ('0f0f0f0f-0000-0000-0000-000000000001', '0e0e0e0e-0000-0000-0000-000000000001',
   '0b0b0b0b-0000-0000-0000-000000000001', 'Budi Santoso 🏠', '0812000111',
   '11111111-1111-1111-1111-111111111111', 'proses');
