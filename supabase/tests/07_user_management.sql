-- ============================================================
-- Siklus hidup akun pengguna — migration_011
--
-- Sebelum migrasi ini kolom is_active hanya hiasan: dijaga tetapi tidak pernah
-- dibaca policy mana pun, sehingga menonaktifkan seseorang tidak berpengaruh
-- apa pun. Berkas ini mengunci penegakannya, dari dua arah sekaligus — jalur
-- peran dan jalur kepemilikan.
-- ============================================================

set role authenticated;
select test.bagian('Manajemen pengguna');

-- ---------- Pendaftaran mandiri masuk dalam keadaan menunggu ----------
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('88888888-8888-8888-8888-888888888888', 'pendaftar@zafiraproperty.id', '{"full_name":"Pendaftar Baru"}');
set role authenticated;

select test.eq_query(
  'Akun hasil pendaftaran mandiri masuk dalam keadaan nonaktif',
  $$select is_active::text from profiles where id = '88888888-8888-8888-8888-888888888888'$$,
  'false');

-- ---------- Akun nonaktif tidak punya akses apa pun ----------
set test.uid = '88888888-8888-8888-8888-888888888888';

select test.eq_query(
  'Akun menunggu tidak punya peran efektif',
  $$select coalesce(current_role_name()::text, 'NULL')$$,
  'NULL');

select test.eq_query(
  'Akun menunggu tidak melihat prospek apa pun',
  $$select count(*)::text from leads$$,
  '0');

select test.eq_query(
  'Akun menunggu tidak melihat konsumen apa pun',
  $$select count(*)::text from customers$$,
  '0');

select test.raises(
  'Akun menunggu tidak dapat membuat prospek',
  $$insert into leads (name, status) values ('Prospek Selundupan', 'leads')$$);

select test.eq_query(
  'me() kosong untuk akun nonaktif',
  $$select coalesce(me()::text, 'NULL')$$,
  'NULL');

-- ---------- Menonaktifkan agen yang sedang bekerja ----------
-- Inilah inti celahnya: sebelum migration_011, Sales A yang dinonaktifkan
-- tetap membaca dan mengubah barisnya sendiri, karena policy kepemilikan
-- memakai auth.uid() dan tidak pernah menyentuh helper peran.
set test.uid = '11111111-1111-1111-1111-111111111111';
select test.ok(
  'Sales A aktif masih melihat prospeknya',
  (select count(*) from leads) > 0,
  (select count(*)::text || ' prospek' from leads));

set test.uid = '77777777-7777-7777-7777-777777777777';
select deactivate_user('11111111-1111-1111-1111-111111111111', 'uji penonaktifan');

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.eq_query(
  'Sales nonaktif kehilangan akses ke prospeknya sendiri',
  $$select count(*)::text from leads$$,
  '0');

select test.eq_query(
  'Sales nonaktif kehilangan akses ke konsumennya sendiri',
  $$select count(*)::text from customers$$,
  '0');

select test.eq_query(
  'Sales nonaktif tidak menemukan apa pun lewat pencarian',
  $$select count(*)::text from search_notes('simulasi kredit')$$,
  '0');

select test.affects(
  'Sales nonaktif tidak dapat mengubah prospeknya',
  $$update leads set name = 'diubah saat nonaktif' where id = '0e0e0e0e-0000-0000-0000-000000000003'$$,
  0);

select test.affects(
  'Sales nonaktif tidak dapat mengubah profilnya sendiri',
  $$update profiles set phone = '0800000000' where id = '11111111-1111-1111-1111-111111111111'$$,
  0);

-- Diaktifkan kembali, aksesnya harus utuh seperti semula.
set test.uid = '77777777-7777-7777-7777-777777777777';
select approve_user('11111111-1111-1111-1111-111111111111', 'sales');

set test.uid = '11111111-1111-1111-1111-111111111111';
select test.ok(
  'Akses pulih setelah diaktifkan kembali',
  (select count(*) from leads) > 0,
  (select count(*)::text || ' prospek' from leads));

-- ---------- Wewenang persetujuan ----------
set test.uid = '11111111-1111-1111-1111-111111111111';
select test.raises(
  'Sales tidak dapat menyetujui pengguna',
  $$select approve_user('88888888-8888-8888-8888-888888888888', 'admin')$$,
  'admin');

set test.uid = '44444444-4444-4444-4444-444444444444';
select test.raises(
  'Admin Marketing tidak dapat menyetujui pengguna',
  $$select approve_user('88888888-8888-8888-8888-888888888888', 'finance')$$,
  'admin');

set test.uid = '55555555-5555-5555-5555-555555555555';
select test.raises(
  'Supervisor tidak dapat menonaktifkan pengguna',
  $$select deactivate_user('22222222-2222-2222-2222-222222222222', 'coba')$$,
  'admin');

-- Admin tidak boleh mengunci dirinya sendiri keluar: kalau admin terakhir
-- menonaktifkan diri, tidak ada lagi yang bisa mengaktifkan siapa pun.
set test.uid = '77777777-7777-7777-7777-777777777777';
select test.raises(
  'Admin tidak dapat menonaktifkan akunnya sendiri',
  $$select deactivate_user('77777777-7777-7777-7777-777777777777', 'coba')$$,
  'sendiri');

-- ---------- Persetujuan berhasil ----------
select approve_user('88888888-8888-8888-8888-888888888888', 'finance');

select test.eq_query(
  'Admin dapat menyetujui dan menetapkan peran sekaligus',
  $$select role::text || '/' || is_active::text from profiles
      where id = '88888888-8888-8888-8888-888888888888'$$,
  'finance/true');

set test.uid = '88888888-8888-8888-8888-888888888888';
select test.ok(
  'Pengguna yang disetujui langsung memperoleh haknya',
  (select count(*) from customers) > 0,
  null);

-- ---------- Jejak audit ----------
set test.uid = '66666666-6666-6666-6666-666666666666';
select test.ok(
  'Persetujuan tercatat di log aktivitas',
  (select count(*) > 0 from activity_logs where action = 'approve'),
  null);
select test.ok(
  'Penonaktifan tercatat beserta alasannya',
  (select count(*) > 0 from activity_logs where action = 'deactivate' and note = 'uji penonaktifan'),
  null);

-- ---------- Batas domain email ----------
-- Pendaftaran di Supabase dijalankan layanan GoTrue dengan hak elevated, bukan
-- oleh role `authenticated`. Karena itu bagian ini berjalan sebagai superuser:
-- yang diuji adalah apakah trigger tetap menolak meski pemanggilnya istimewa.
reset role;
update app_settings set value = 'zafiraproperty.id' where key = 'domain_email_diizinkan';

select test.raises(
  'Email di luar domain yang diizinkan ditolak mendaftar',
  $$insert into auth.users (id, email, raw_user_meta_data)
      values ('99999999-9999-9999-9999-999999999999', 'orang.luar@gmail.com', '{"full_name":"Orang Luar"}')$$,
  'tidak diizinkan');

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-9999-9999-999999999999', 'orang.dalam@zafiraproperty.id', '{"full_name":"Orang Dalam"}');
select test.eq_query(
  'Email dalam domain yang diizinkan boleh mendaftar',
  $$select count(*)::text from profiles where id = '99999999-9999-9999-9999-999999999999'$$,
  '1');

update app_settings set value = '' where key = 'domain_email_diizinkan';
