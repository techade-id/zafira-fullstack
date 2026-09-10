-- ============================================================
-- Monitoring Lapangan — migration_012
--
-- Sebelum migrasi ini kedua tabelnya menganggur: ada di skema, punya bucket
-- foto beserta policy, tetapi tidak ada satu pun yang menulis ke sana.
-- ============================================================

set role authenticated;
select test.bagian('Lapangan');

-- ---------- fixtures ----------
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('0aa00000-0000-0000-0000-000000000001', 'lapangan1@zafiraproperty.id', '{"full_name":"Tukang Satu"}'),
  ('0aa00000-0000-0000-0000-000000000002', 'lapangan2@zafiraproperty.id', '{"full_name":"Tukang Dua"}');
update profiles set role = 'tim_lapangan', is_active = true
 where id in ('0aa00000-0000-0000-0000-000000000001', '0aa00000-0000-0000-0000-000000000002');

insert into contractors (id, name, specialization) values
  ('0bb00000-0000-0000-0000-000000000001', 'CV Bangun Jaya', 'Struktur');

-- Unit A-01 dikerjakan Tukang Satu; unit A-02 tidak ditugaskan kepada siapa pun.
insert into field_projects (id, unit_id, contractor_id, assigned_team, start_date, target_end_date, status, progress_percent) values
  ('0cc00000-0000-0000-0000-000000000001', '0b0b0b0b-0000-0000-0000-000000000001',
   '0bb00000-0000-0000-0000-000000000001',
   array['0aa00000-0000-0000-0000-000000000001']::uuid[],
   current_date - 30, current_date + 30, 'belum_mulai', 0),
  ('0cc00000-0000-0000-0000-000000000002', '0b0b0b0b-0000-0000-0000-000000000002',
   '0bb00000-0000-0000-0000-000000000001',
   array[]::uuid[],
   current_date - 60, current_date - 5, 'belum_mulai', 0);
set role authenticated;

-- ---------- Jangkauan tim lapangan ----------
set test.uid = '0aa00000-0000-0000-0000-000000000001';

select test.eq_query(
  'Tim lapangan hanya melihat proyek yang ditugaskan kepadanya',
  $$select count(*)::text from field_projects$$,
  '1');

select test.eq_query(
  'Tim lapangan tidak melihat proyek unit lain',
  $$select count(*)::text from field_projects where id = '0cc00000-0000-0000-0000-000000000002'$$,
  '0');

-- ---------- Melapor ----------
-- reporter_id sengaja tidak diisi: nilainya harus datang dari sesi. Kalau
-- default-nya hilang, laporan tersimpan tanpa pemilik lalu langsung tak
-- terlihat oleh pembuatnya — persis bug assigned_to pada leads.
insert into field_reports (field_project_id, report_date, progress_percent, kendala, solusi, notes)
values ('0cc00000-0000-0000-0000-000000000001', current_date - 1, 40,
        'Pasir datang terlambat dari pemasok', 'Ganti pemasok lokal untuk minggu depan',
        'Cuaca hujan dua hari, pengecoran digeser');

select test.eq_query(
  'Pelapor terisi otomatis dari sesi',
  $$select reporter_id::text from field_reports where field_project_id = '0cc00000-0000-0000-0000-000000000001'$$,
  '0aa00000-0000-0000-0000-000000000001');

select test.eq_query(
  'Progres proyek mengikuti laporan',
  $$select progress_percent::text from field_projects where id = '0cc00000-0000-0000-0000-000000000001'$$,
  '40');

select test.eq_query(
  'Status berubah menjadi berjalan',
  $$select status::text from field_projects where id = '0cc00000-0000-0000-0000-000000000001'$$,
  'berjalan');

-- Laporan susulan bertanggal lebih lama tidak boleh menimpa kondisi terkini.
insert into field_reports (field_project_id, report_date, progress_percent, notes)
values ('0cc00000-0000-0000-0000-000000000001', current_date - 10, 5, 'Laporan susulan minggu lalu');

select test.eq_query(
  'Laporan susulan bertanggal lama tidak menurunkan progres',
  $$select progress_percent::text from field_projects where id = '0cc00000-0000-0000-0000-000000000001'$$,
  '40');

-- ---------- Riwayat satu tim ----------
reset role;
update field_projects
   set assigned_team = array['0aa00000-0000-0000-0000-000000000001',
                             '0aa00000-0000-0000-0000-000000000002']::uuid[]
 where id = '0cc00000-0000-0000-0000-000000000001';
set role authenticated;

set test.uid = '0aa00000-0000-0000-0000-000000000002';
select test.eq_query(
  'Rekan satu tim melihat laporan yang ditulis anggota lain',
  $$select count(*)::text from field_reports
      where field_project_id = '0cc00000-0000-0000-0000-000000000001'$$,
  '2');

-- ---------- Batas peran ----------
set test.uid = '0aa00000-0000-0000-0000-000000000001';
select test.eq_query(
  'Tim lapangan tidak melihat data penjualan',
  $$select count(*)::text from leads$$,
  '0');

select test.affects(
  'Tim lapangan tidak dapat mengubah konsumen',
  $$update customers set name = 'diubah tukang' where id = '0f0f0f0f-0000-0000-0000-000000000001'$$,
  0);

set test.uid = '55555555-5555-5555-5555-555555555555';
select test.ok(
  'Supervisor melihat seluruh proyek lapangan',
  (select count(*) from field_projects) = 2,
  (select count(*)::text || ' proyek' from field_projects));

-- reporter_id punya default auth.uid(), jadi menyisipkan tanpa menyebut kolom
-- itu adalah bentuk serangan yang paling mungkin: kalau policy tulis pernah
-- memakai `reporter_id = me()`, baris ini akan lolos untuk siapa pun.
select test.raises(
  'Supervisor tidak dapat menulis laporan lapangan',
  $$insert into field_reports (field_project_id, report_date, progress_percent)
      values ('0cc00000-0000-0000-0000-000000000001', current_date, 90)$$);

-- UPDATE yang dihalangi RLS tidak melempar error; ia mengenai nol baris.
select test.affects(
  'Supervisor tidak dapat menugaskan tim lapangan',
  $$update field_projects set assigned_team = array['55555555-5555-5555-5555-555555555555']::uuid[]
      where id = '0cc00000-0000-0000-0000-000000000001'$$,
  0);

-- Pengawas mengaudit sistem, bukan mengerjakan unit.
set test.uid = '66666666-6666-6666-6666-666666666666';
select test.raises(
  'Pengawas tidak dapat menulis laporan lapangan',
  $$insert into field_reports (field_project_id, report_date, progress_percent)
      values ('0cc00000-0000-0000-0000-000000000001', current_date, 95)$$);

select test.ok(
  'Pengawas tetap dapat membaca laporan lapangan',
  (select count(*) > 0 from field_reports),
  null);

-- Admin Marketing memang mengurus pelaksanaan proyek.
set test.uid = '44444444-4444-4444-4444-444444444444';
select test.affects(
  'Admin Marketing dapat menugaskan tim lapangan',
  $$update field_projects set contractor_id = '0bb00000-0000-0000-0000-000000000001'
      where id = '0cc00000-0000-0000-0000-000000000001'$$,
  1);

-- ---------- Penyelesaian ----------
set test.uid = '0aa00000-0000-0000-0000-000000000001';
insert into field_reports (field_project_id, report_date, progress_percent, notes)
values ('0cc00000-0000-0000-0000-000000000001', current_date, 100, 'Pekerjaan selesai, siap serah terima');

select test.eq_query(
  'Progres 100 persen menutup proyek',
  $$select status::text from field_projects where id = '0cc00000-0000-0000-0000-000000000001'$$,
  'selesai');

select test.ok(
  'Tanggal selesai tercatat',
  (select actual_end_date is not null from field_projects where id = '0cc00000-0000-0000-0000-000000000001'),
  null);

-- ---------- Keterlambatan ----------
-- Unit A-02 target akhirnya sudah lewat lima hari.
reset role;
update field_projects set assigned_team = array['0aa00000-0000-0000-0000-000000000001']::uuid[]
 where id = '0cc00000-0000-0000-0000-000000000002';
set role authenticated;
set test.uid = '0aa00000-0000-0000-0000-000000000001';

insert into field_reports (field_project_id, report_date, progress_percent, kendala)
values ('0cc00000-0000-0000-0000-000000000002', current_date, 60, 'Kekurangan tenaga tukang');

select test.eq_query(
  'Proyek yang lewat target ditandai terlambat',
  $$select status::text from field_projects where id = '0cc00000-0000-0000-0000-000000000002'$$,
  'terlambat');

-- ---------- Pencarian ----------
select test.eq_query(
  'Kendala lapangan dapat ditemukan lewat pencarian',
  $$select count(*)::text from search_notes('pemasok') where modul = 'Laporan Lapangan'$$,
  '1');

select test.eq_query(
  'Catatan bebas laporan lapangan ikut tercari',
  $$select count(*)::text from search_notes('pengecoran digeser') where modul = 'Laporan Lapangan'$$,
  '1');

select test.eq_query(
  'Hasil laporan lapangan mengarah ke halaman Lapangan',
  $$select rute from search_notes('pemasok') where modul = 'Laporan Lapangan' limit 1$$,
  '/lapangan');

select test.ok(
  'Hasil laporan lapangan memakai kode unit sebagai judul',
  (select judul = 'A-01' from search_notes('pemasok') where modul = 'Laporan Lapangan' limit 1),
  (select judul from search_notes('pemasok') where modul = 'Laporan Lapangan' limit 1));

-- ---------- Akun nonaktif ----------
set test.uid = '77777777-7777-7777-7777-777777777777';
select deactivate_user('0aa00000-0000-0000-0000-000000000001', 'uji lapangan');

set test.uid = '0aa00000-0000-0000-0000-000000000001';
select test.eq_query(
  'Tim lapangan nonaktif kehilangan akses proyeknya',
  $$select count(*)::text from field_projects$$,
  '0');

select test.raises(
  'Tim lapangan nonaktif tidak dapat melapor',
  $$insert into field_reports (field_project_id, report_date, progress_percent)
      values ('0cc00000-0000-0000-0000-000000000002', current_date, 70)$$);

reset role;
