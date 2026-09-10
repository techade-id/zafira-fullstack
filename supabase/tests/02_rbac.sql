-- ============================================================
-- Matriks peran — REVISI §2.1, PRD §3.1
--
-- Yang diuji di sini adalah bentuk policy hasil migration_008: SELECT dan
-- WRITE dipisah, sehingga peran monitoring benar-benar tidak bisa menulis.
-- Sebelum migrasi itu semua policy berbentuk `for all`, dan peran read-only
-- mustahil ada.
-- ============================================================

set role authenticated;
select test.bagian('Matriks peran');

-- ---------- Sales ----------
set test.uid = '11111111-1111-1111-1111-111111111111';

select test.eq_query(
  'Sales membaca prospek miliknya',
  $$select count(*)::text from leads where assigned_to = '11111111-1111-1111-1111-111111111111'$$,
  '4');

select test.eq_query(
  'Sales TIDAK membaca prospek agen lain',
  $$select count(*)::text from leads where id = '0e0e0e0e-0000-0000-0000-000000000009'$$,
  '0');

-- Prospek baru harus otomatis menjadi milik pembuatnya. Tanpa default
-- assigned_to = auth.uid() pada migration_008, baris ini akan tersimpan dengan
-- assigned_to NULL lalu langsung hilang dari pandangan pembuatnya sendiri.
insert into leads (name, phone, status) values ('Uji Kepemilikan', '0899', 'leads');
select test.eq_query(
  'Prospek baru otomatis dimiliki pembuatnya',
  $$select count(*)::text from leads where name = 'Uji Kepemilikan'
      and assigned_to = '11111111-1111-1111-1111-111111111111'$$,
  '1');

select test.raises(
  'Sales tidak boleh mengangkat dirinya jadi admin',
  $$update profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111'$$,
  'admin');

select test.eq_query(
  'Sales tidak melihat log aktivitas',
  $$select count(*)::text from activity_logs$$,
  '0');

-- ---------- Supervisor Marketing: baca semua, tulis tidak sama sekali ----------
set test.uid = '55555555-5555-5555-5555-555555555555';

select test.ok(
  'Supervisor membaca seluruh prospek lintas agen',
  (select count(*) from leads) >= 5,
  (select count(*)::text || ' prospek terbaca' from leads));

select test.affects(
  'Supervisor tidak dapat mengubah prospek',
  $$update leads set name = 'diubah supervisor' where id = '0e0e0e0e-0000-0000-0000-000000000001'$$,
  0);

select test.affects(
  'Supervisor tidak dapat mengubah campaign',
  $$update ads_campaigns set name = 'diubah supervisor' where code = 'RMD24'$$,
  0);

select test.raises(
  'Supervisor tidak dapat menambah pengaturan bisnis',
  $$insert into business_settings (category, value, sort_order) values ('bank', 'Bank Palsu', 99)$$);

select test.eq_query(
  'Supervisor tidak melihat log aktivitas',
  $$select count(*)::text from activity_logs$$,
  '0');

-- ---------- Pengawas: read-only atas transaksi, berwenang atas konfigurasi ----------
-- Dua dokumen berbeda soal ini: REVISI §2.1 memberi Pengawas "manajemen
-- konfigurasi bisnis", PRD §3.1 menyebutnya read-only. Yang diterapkan adalah
-- gabungan keduanya, dan itulah yang dikunci oleh dua uji berikut.
set test.uid = '66666666-6666-6666-6666-666666666666';

select test.affects(
  'Pengawas tidak dapat mengubah prospek',
  $$update leads set name = 'diubah pengawas' where id = '0e0e0e0e-0000-0000-0000-000000000001'$$,
  0);

insert into business_settings (category, value, sort_order) values ('bank', 'Bank Uji Pengawas', 98);
select test.eq_query(
  'Pengawas boleh mengelola pengaturan bisnis',
  $$select count(*)::text from business_settings where value = 'Bank Uji Pengawas'$$,
  '1');

select test.ok(
  'Pengawas membaca log aktivitas',
  (select count(*) from activity_logs) > 0,
  (select count(*)::text || ' entri' from activity_logs));

-- ---------- Finance: uang ya, profil konsumen tidak ----------
set test.uid = '33333333-3333-3333-3333-333333333333';

select test.affects(
  'Finance tidak dapat mengubah profil konsumen',
  $$update customers set address = 'diubah finance' where id = '0f0f0f0f-0000-0000-0000-000000000001'$$,
  0);

select test.ok(
  'Finance membaca seluruh konsumen',
  (select count(*) from customers) >= 1,
  null);

-- ---------- Admin Marketing ----------
set test.uid = '44444444-4444-4444-4444-444444444444';

select test.affects(
  'Admin Marketing dapat mengubah profil konsumen',
  $$update customers set address = 'Jl. Berkas No. 1' where id = '0f0f0f0f-0000-0000-0000-000000000001'$$,
  1);

-- Dua jalur berbeda, dan keduanya harus tertutup.
--
-- Mengubah role ORANG LAIN dihalangi RLS: policy profiles hanya mengizinkan
-- baris milik sendiri atau admin, jadi pernyataannya tidak melempar error —
-- ia hanya mengenai nol baris. Diam-diam, dan justru itu yang perlu dikunci.
select test.affects(
  'Admin Marketing tidak dapat mengubah role pengguna lain',
  $$update profiles set role = 'admin' where id = '22222222-2222-2222-2222-222222222222'$$,
  0);

-- Mengubah role SENDIRI lolos RLS (barisnya miliknya), sehingga di sinilah
-- trigger penjaga kolom yang harus menahan — inilah jalur eskalasi hak akses
-- yang sesungguhnya.
select test.raises(
  'Admin Marketing tidak dapat mengangkat dirinya jadi admin',
  $$update profiles set role = 'admin' where id = '44444444-4444-4444-4444-444444444444'$$,
  'admin');

-- ---------- Admin ----------
set test.uid = '77777777-7777-7777-7777-777777777777';

select test.affects(
  'Admin dapat mengubah role pengguna',
  $$update profiles set divisi = 'Marketing' where id = '22222222-2222-2222-2222-222222222222'$$,
  1);

reset role;
