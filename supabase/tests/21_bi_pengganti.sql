-- ============================================================
-- BI Checking dengan pemohon pengganti — migration_028
--
-- Yang diuji: hasil Tidak Lolos tidak bisa ditimpa, penggantian data hanya
-- setelah tidak lolos dan hanya berlaku setelah disetujui Admin Sistem,
-- pengajuan yang ditolak tidak menghabiskan kesempatan, booking menunggu
-- pemohon pengganti lolos dan dibuat atas namanya, percobaan keempat yang
-- tidak lolos membatalkan prospek, dan catatan survei wajib.
-- ============================================================

reset role;

insert into leads (id, name, phone, status, assigned_to) values
  ('28000000-0000-0000-0000-0000000000b1', 'BI Pengganti',   '0818280000001', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('28000000-0000-0000-0000-0000000000b2', 'BI Gagal Total', '0818280000002', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('28000000-0000-0000-0000-0000000000b3', 'Survei Wajib',   '0818280000003', 'warm', '11111111-1111-1111-1111-111111111111');

set role authenticated;


-- ============================================================
select test.bagian('BI Checking pemohon pengganti');
-- ============================================================

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.raises(
  'Penggantian tidak bisa diajukan sebelum ada hasil Tidak Lolos',
  $$select ajukan_pengganti_bi('28000000-0000-0000-0000-0000000000b1', 'Siti', '3329010101900001', 'saudara_kandung', 'x',
      '[{"path":"28000000-0000-0000-0000-0000000000b1/ktp/a.jpg","slot":"ktp"}]'::jsonb)$$,
  'setelah BI-Checking dinyatakan Tidak Lolos');

select catat_bi_checking('28000000-0000-0000-0000-0000000000b1', 'tidak_lolos', current_date, 'Kol 5 di bank lain');

select test.eq_query(
  'Percobaan pertama tercatat atas data asli prospek',
  $$select concat_ws('/', urutan, nama_pemohon, hubungan, hasil) from bi_checking_percobaan
     where lead_id = '28000000-0000-0000-0000-0000000000b1'$$,
  '1/BI Pengganti/diri_sendiri/tidak_lolos');

select test.raises(
  'Hasil Tidak Lolos tidak bisa ditimpa Sales',
  $$select catat_bi_checking('28000000-0000-0000-0000-0000000000b1', 'lolos', current_date)$$,
  'Ajukan penggantian data');

select test.raises(
  'Pemohon pengganti wajib dilampiri KTP',
  $$select ajukan_pengganti_bi('28000000-0000-0000-0000-0000000000b1', 'Siti Kakak', '3329010101900001', 'saudara_kandung',
      'Pemohon asli ada tunggakan', '[{"path":"28000000-0000-0000-0000-0000000000b1/kk/k.jpg","slot":"kk"}]'::jsonb)$$,
  'Lampirkan KTP');

select test.raises(
  'NIK pemohon pengganti harus 16 digit',
  $$select ajukan_pengganti_bi('28000000-0000-0000-0000-0000000000b1', 'Siti Kakak', '33290101', 'saudara_kandung',
      'Pemohon asli ada tunggakan', '[{"path":"28000000-0000-0000-0000-0000000000b1/ktp/a.jpg","slot":"ktp"}]'::jsonb)$$,
  '16 digit');

select ajukan_pengganti_bi('28000000-0000-0000-0000-0000000000b1', 'Siti Kakak', '3329010101900001', 'saudara_kandung',
  'Pemohon asli ada tunggakan',
  '[{"path":"28000000-0000-0000-0000-0000000000b1/ktp/a.jpg","nama":"ktp.jpg","slot":"ktp"},
    {"path":"28000000-0000-0000-0000-0000000000b1/kk/k.jpg","nama":"kk.jpg","slot":"kk"}]'::jsonb);

select test.eq_query(
  'KTP dan KK menempel pada percobaan penggantinya',
  $$select count(*)::text from berkas_lampiran f join bi_checking_percobaan b on b.id = f.percobaan_id
     where b.lead_id = '28000000-0000-0000-0000-0000000000b1' and b.urutan = 2$$,
  '2');

select test.raises(
  'BI-Checking tidak bisa dicatat selama penggantian menunggu persetujuan',
  $$select catat_bi_checking('28000000-0000-0000-0000-0000000000b1', 'lolos', current_date)$$,
  'menunggu persetujuan');

select test.raises(
  'Satu pengajuan pengganti menunggu sekaligus',
  $$select ajukan_pengganti_bi('28000000-0000-0000-0000-0000000000b1', 'Budi Ayah', '3329010101600002', 'orang_tua', 'x',
      '[{"path":"28000000-0000-0000-0000-0000000000b1/ktp/b.jpg","slot":"ktp"}]'::jsonb)$$,
  'Masih ada penggantian');

select test.raises(
  'Booking ditolak selama penggantian menunggu persetujuan',
  $$select convert_lead_to_customer('28000000-0000-0000-0000-0000000000b1', null, 700000, current_date)$$,
  'menunggu persetujuan');

select test.raises(
  'Sales tidak dapat memutuskan penggantian',
  $$select putuskan_pengganti_bi((select id from bi_checking_percobaan
      where lead_id = '28000000-0000-0000-0000-0000000000b1' and persetujuan = 'menunggu'), true)$$,
  'Hanya Admin Sistem');

set test.uid = '77777777-7777-7777-7777-777777777777';

select test.ok(
  'Admin Sistem melihat pengajuan pengganti di lonceng',
  exists (select 1 from json_array_elements(my_notifications()->'items') i
           where i->>'kategori' = 'persetujuan_bi'));

select test.raises(
  'Penolakan wajib beralasan',
  $$select putuskan_pengganti_bi((select id from bi_checking_percobaan
      where lead_id = '28000000-0000-0000-0000-0000000000b1' and persetujuan = 'menunggu'), false, '')$$,
  'Alasan penolakan');

select putuskan_pengganti_bi((select id from bi_checking_percobaan
  where lead_id = '28000000-0000-0000-0000-0000000000b1' and persetujuan = 'menunggu'), false, 'KK belum terbaca');

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.ok(
  'Pengaju diberi tahu keputusannya',
  exists (select 1 from json_array_elements(my_notifications()->'items') i
           where i->>'kategori' = 'bi_diputuskan'));

-- Ditolak tidak menghabiskan kesempatan: diajukan ulang dengan nomor yang sama.
select test.eq_query(
  'Pengajuan ulang setelah ditolak tetap pengganti ke-1',
  $$select ajukan_pengganti_bi('28000000-0000-0000-0000-0000000000b1', 'Siti Kakak', '3329010101900001', 'saudara_kandung',
      'Pemohon asli ada tunggakan, KK diunggah ulang',
      '[{"path":"28000000-0000-0000-0000-0000000000b1/ktp/c.jpg","slot":"ktp"}]'::jsonb)->>'urutan'$$,
  '2');

set test.uid = '77777777-7777-7777-7777-777777777777';

select putuskan_pengganti_bi((select id from bi_checking_percobaan
  where lead_id = '28000000-0000-0000-0000-0000000000b1' and persetujuan = 'menunggu'), true);

select test.eq_query(
  'Setelah disetujui, ringkasan prospek menunggu hasil pemohon pengganti',
  $$select bi_checking_status from leads where id = '28000000-0000-0000-0000-0000000000b1'$$,
  'menunggu');

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.raises(
  'Booking ditolak sebelum pemohon pengganti lolos',
  $$select convert_lead_to_customer('28000000-0000-0000-0000-0000000000b1', null, 700000, current_date)$$,
  'belum lolos');

select catat_bi_checking('28000000-0000-0000-0000-0000000000b1', 'lolos', current_date, 'Kol 1');

select test.eq_query(
  'Riwayat BI menyebut pemohon penggantinya',
  $$select split_part(note, E'\n', 1) from lead_activities
     where lead_id = '28000000-0000-0000-0000-0000000000b1' and activity = 'BI Checking' and hasil = 'Lolos'$$,
  'Pemohon pengganti ke-1: Siti Kakak (saudara kandung)');

select convert_lead_to_customer('28000000-0000-0000-0000-0000000000b1', null, 700000, current_date);

select test.eq_query(
  'Konsumen dibuat atas nama pemohon pengganti yang lolos',
  $$select concat_ws('/', name, ktp_number, pemohon_hubungan) from customers
     where lead_id = '28000000-0000-0000-0000-0000000000b1'$$,
  'Siti Kakak/3329010101900001/saudara_kandung');

reset role;
update customers set name = 'Siti Kakak Rahayu' where lead_id = '28000000-0000-0000-0000-0000000000b1';

select test.eq_query(
  'Koreksi nama pemohon pengganti tidak menimpa nama prospek asal',
  $$select name from leads where id = '28000000-0000-0000-0000-0000000000b1'$$,
  'BI Pengganti');

set role authenticated;


-- ============================================================
select test.bagian('BI Checking gagal total');
-- ============================================================

set test.uid = '11111111-1111-1111-1111-111111111111';
select catat_bi_checking('28000000-0000-0000-0000-0000000000b2', 'tidak_lolos', current_date);

-- Admin Sistem mengajukan sendiri: langsung disetujui, tetap tercatat.
set test.uid = '77777777-7777-7777-7777-777777777777';
select test.eq_query(
  'Pengajuan Admin Sistem langsung disetujui',
  $$select ajukan_pengganti_bi('28000000-0000-0000-0000-0000000000b2', 'Pengganti Satu', '3329020202900001', 'suami_istri', 'Kol 5',
      '[{"path":"28000000-0000-0000-0000-0000000000b2/ktp/1.jpg","slot":"ktp"}]'::jsonb)->>'status'$$,
  'disetujui');
set test.uid = '11111111-1111-1111-1111-111111111111';
select catat_bi_checking('28000000-0000-0000-0000-0000000000b2', 'tidak_lolos', current_date);

set test.uid = '77777777-7777-7777-7777-777777777777';
select test.raises(
  'NIK yang sudah diperiksa tidak bisa diajukan lagi',
  $$select ajukan_pengganti_bi('28000000-0000-0000-0000-0000000000b2', 'Pengganti Satu', '3329020202900001', 'suami_istri', 'Ulang',
      '[{"path":"28000000-0000-0000-0000-0000000000b2/ktp/1b.jpg","slot":"ktp"}]'::jsonb)$$,
  'sudah pernah diperiksa');
select ajukan_pengganti_bi('28000000-0000-0000-0000-0000000000b2', 'Pengganti Dua', '3329020202600002', 'orang_tua', 'Masih kol 5',
  '[{"path":"28000000-0000-0000-0000-0000000000b2/ktp/2.jpg","slot":"ktp"}]'::jsonb);
set test.uid = '11111111-1111-1111-1111-111111111111';

select test.eq_query(
  'Sisa kesempatan berkurang setiap percobaan',
  $$select catat_bi_checking('28000000-0000-0000-0000-0000000000b2', 'tidak_lolos', current_date)->>'sisa_penggantian'$$,
  '1');

set test.uid = '77777777-7777-7777-7777-777777777777';
select ajukan_pengganti_bi('28000000-0000-0000-0000-0000000000b2', 'Pengganti Tiga', '3329020202950003', 'saudara_kandung', 'Terakhir',
  '[{"path":"28000000-0000-0000-0000-0000000000b2/ktp/3.jpg","slot":"ktp"}]'::jsonb);
set test.uid = '11111111-1111-1111-1111-111111111111';

select test.eq_query(
  'Percobaan keempat yang tidak lolos dinyatakan gagal total',
  $$select catat_bi_checking('28000000-0000-0000-0000-0000000000b2', 'tidak_lolos', current_date, 'Kol 4')->>'gagal_total'$$,
  'true');

select test.eq_query(
  'Prospek gagal total dibatalkan otomatis beserta alasannya',
  $$select l.status::text || '/' || c.reason from leads l join cancellations c on c.lead_id = l.id
     where l.id = '28000000-0000-0000-0000-0000000000b2'$$,
  'cancel/Tidak lolos BI-Checking');

select test.eq_query(
  'Keempat pemeriksaan tetap tercatat',
  $$select count(*)::text from bi_checking_percobaan
     where lead_id = '28000000-0000-0000-0000-0000000000b2' and hasil = 'tidak_lolos'$$,
  '4');

select test.raises(
  'Prospek gagal total tidak bisa diajukan pengganti lagi',
  $$select ajukan_pengganti_bi('28000000-0000-0000-0000-0000000000b2', 'Pengganti Empat', '3329020202950004', 'lainnya', 'x',
      '[{"path":"28000000-0000-0000-0000-0000000000b2/ktp/4.jpg","slot":"ktp"}]'::jsonb)$$,
  'sudah dibatalkan');


-- ============================================================
select test.bagian('Catatan survei wajib');
-- ============================================================

select test.raises(
  'Survei tanpa catatan hasil ditolak',
  $$select catat_followup('28000000-0000-0000-0000-0000000000b3', (now() at time zone 'Asia/Jakarta')::date,
      'Survei Lokasi', 'Tertarik', null,
      '[{"path":"28000000-0000-0000-0000-0000000000b3/survei/a.jpg"}]'::jsonb,
      (now() at time zone 'Asia/Jakarta')::date + 2)$$,
  'Catatan hasil survei wajib');

reset role;
set test.uid = '';
