-- ============================================================
-- Alur Leads → Follow Up → Booking — migration_027
--
-- Yang diuji: biaya kavling dihitung dari tipe dan luas kavling, konversi
-- booking menulis DP dan biaya kavling ke Total DP, BI Checking tercatat
-- beserta riwayatnya, survei mengisi catatan survei, menghapus catatan dan
-- mengubah status konsumen hanya lewat pengajuan yang diputuskan Admin, dan
-- notifikasi eskalasi serta siapkan berkas sampai ke orang yang tepat.
-- ============================================================

reset role;

insert into projects (id, name, location, tarif_tanah_per_m2, biaya_kavling_strategis) values
  ('27000000-0000-0000-0000-0000000000a1', 'Zafira Uji Kavling', 'Brebes', 1000000, 5000000);

insert into units (id, project_id, unit_code, block, type, price, status, luas_tanah, posisi) values
  ('27000000-0000-0000-0000-0000000000d1', '27000000-0000-0000-0000-0000000000a1', 'K-01', 'K', '36/70', 300000000, 'tersedia', 80, 'standar'),
  ('27000000-0000-0000-0000-0000000000d2', '27000000-0000-0000-0000-0000000000a1', 'K-02', 'K', '30/60', 250000000, 'tersedia', 60, 'hook'),
  ('27000000-0000-0000-0000-0000000000d3', '27000000-0000-0000-0000-0000000000a1', 'K-03', 'K', '36/72', 300000000, 'tersedia', null, 'standar'),
  ('27000000-0000-0000-0000-0000000000d4', '27000000-0000-0000-0000-0000000000a1', 'K-04', 'K', '36/72', 300000000, 'tersedia', 72, 'standar');

insert into leads (id, name, phone, status, assigned_to) values
  ('27000000-0000-0000-0000-0000000000b1', 'Booking Tanah Lebih', '0817270000001', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('27000000-0000-0000-0000-0000000000b2', 'Booking Hook',        '0817270000002', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('27000000-0000-0000-0000-0000000000b3', 'Cek BI',              '0817270000003', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('27000000-0000-0000-0000-0000000000b4', 'Hapus Catatan',       '0817270000004', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('27000000-0000-0000-0000-0000000000b5', 'Hapus Survei',        '0817270000005', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('27000000-0000-0000-0000-0000000000b8', 'Siapkan Berkas',      '0817270000008', 'warm', '11111111-1111-1111-1111-111111111111');

-- Jadwal lama milik prospek yang sudah booking: bukan lagi pekerjaan follow-up.
insert into leads (id, name, phone, status, assigned_to, tanggal_rencana) values
  ('27000000-0000-0000-0000-0000000000b7', 'Sudah Booking', '0817270000007', 'booking', '11111111-1111-1111-1111-111111111111', current_date - 10),
  ('27000000-0000-0000-0000-0000000000b6', 'Lama Terlewat', '0817270000006', 'warm',    '11111111-1111-1111-1111-111111111111', current_date - 10);

set role authenticated;


-- ============================================================
select test.bagian('Biaya kavling otomatis');
-- ============================================================

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.eq('Luas standar dibaca dari angka tanah pada tipe', luas_tanah_standar('36/72'), 72::numeric);
select test.ok('Tipe tanpa angka tanah tidak punya luas standar', luas_tanah_standar('Ruko') is null);

select test.eq_query(
  'Kelebihan tanah 10 m² dikali tarif perumahan',
  $$select hitung_biaya_kavling('27000000-0000-0000-0000-0000000000d1')->>'biaya_tanah'$$,
  '10000000');

select test.eq_query(
  'Kavling seluas standarnya tidak membayar tambahan tanah',
  $$select hitung_biaya_kavling('27000000-0000-0000-0000-0000000000d2')->>'biaya_tanah'$$,
  '0');

select test.eq_query(
  'Kavling hook membayar biaya kavling strategis perumahannya',
  $$select hitung_biaya_kavling('27000000-0000-0000-0000-0000000000d2')->>'biaya_strategis'$$,
  '5000000');

select test.eq_query(
  'Kavling bukan hook tidak membayar biaya strategis',
  $$select hitung_biaya_kavling('27000000-0000-0000-0000-0000000000d1')->>'biaya_strategis'$$,
  '0');

select test.eq_query(
  'Luas kavling yang belum diisi tidak menimbulkan biaya',
  $$select hitung_biaya_kavling('27000000-0000-0000-0000-0000000000d3')->>'biaya_tanah'$$,
  '0');

select test.eq_query(
  'Booking Fee bawaan Rp700.000',
  $$select value from app_settings where key = 'booking_fee'$$,
  '700000');


-- ============================================================
select test.bagian('Konversi booking dengan DP dan biaya kavling');
-- ============================================================

select convert_lead_to_customer('27000000-0000-0000-0000-0000000000b1',
  '27000000-0000-0000-0000-0000000000d1', 700000, current_date, 25000000);

select test.eq_query(
  'Tambahan tanah tertulis di berkas KPR',
  $$select biaya_tambahan_tanah::bigint::text from customer_kpr k join customers c on c.id = k.customer_id
     where c.lead_id = '27000000-0000-0000-0000-0000000000b1'$$,
  '10000000');

select test.eq_query(
  'Total DP = DP manual + tambahan tanah',
  $$select nominal_total_dp::bigint::text from customer_kpr k join customers c on c.id = k.customer_id
     where c.lead_id = '27000000-0000-0000-0000-0000000000b1'$$,
  '35000000');

select test.eq_query(
  'Booking Fee masuk antrean pembayaran',
  $$select p.amount::bigint::text from payments p join customers c on c.id = p.customer_id
     where c.lead_id = '27000000-0000-0000-0000-0000000000b1' and p.payment_type = 'booking'$$,
  '700000');

select convert_lead_to_customer('27000000-0000-0000-0000-0000000000b2',
  '27000000-0000-0000-0000-0000000000d2', 700000, current_date);

select test.eq_query(
  'Biaya kavling strategis masuk Total DP walau DP belum diisi',
  $$select concat_ws('/', biaya_kavling_strategis::bigint, nominal_total_dp::bigint) from customer_kpr k
      join customers c on c.id = k.customer_id
     where c.lead_id = '27000000-0000-0000-0000-0000000000b2'$$,
  '5000000/5000000');

select test.raises(
  'DP negatif ditolak',
  $$select convert_lead_to_customer('27000000-0000-0000-0000-0000000000b8',
      '27000000-0000-0000-0000-0000000000d4', 700000, current_date, -1)$$,
  'tidak boleh negatif');


-- ============================================================
select test.bagian('BI Checking prospek');
-- ============================================================

select test.raises(
  'Hasil BI-Checking wajib dipilih',
  $$select catat_bi_checking('27000000-0000-0000-0000-0000000000b3', 'mungkin', current_date)$$,
  'Pilih hasil BI-Checking');

select test.raises(
  'Tanggal BI-Checking tidak boleh di masa depan',
  $$select catat_bi_checking('27000000-0000-0000-0000-0000000000b3', 'lolos', (now() at time zone 'Asia/Jakarta')::date + 1)$$,
  'tidak boleh melewati');

select catat_bi_checking('27000000-0000-0000-0000-0000000000b3', 'lolos',
  (now() at time zone 'Asia/Jakarta')::date, 'Kolektibilitas 1');

select test.eq_query(
  'Status BI-Checking tersimpan di prospek',
  $$select concat_ws('/', bi_checking_status, bi_checking_catatan) from leads where id = '27000000-0000-0000-0000-0000000000b3'$$,
  'lolos/Kolektibilitas 1');

select test.eq_query(
  'BI-Checking muncul di riwayat follow-up',
  $$select hasil from lead_activities where lead_id = '27000000-0000-0000-0000-0000000000b3' and activity = 'BI Checking'$$,
  'Lolos');

select test.affects(
  'KTP bisa dilampirkan pada prospek sendiri',
  $$insert into berkas_lampiran (lead_id, slot, file_url, file_name)
    values ('27000000-0000-0000-0000-0000000000b3', 'ktp', '27000000-0000-0000-0000-0000000000b3/ktp/ktp.jpg', 'ktp.jpg')$$,
  1);

set test.uid = '22222222-2222-2222-2222-222222222222';

select test.raises(
  'Sales lain tidak bisa mencatat BI-Checking prospek ini',
  $$select catat_bi_checking('27000000-0000-0000-0000-0000000000b3', 'tidak_lolos', current_date)$$,
  'bukan milik Anda');

set test.uid = '11111111-1111-1111-1111-111111111111';

select catat_followup('27000000-0000-0000-0000-0000000000b3', (now() at time zone 'Asia/Jakarta')::date,
  'Survei Lokasi', null, 'Suka blok C, minta hook',
  '[{"path":"27000000-0000-0000-0000-0000000000b3/survei/foto.jpg"}]'::jsonb,
  (now() at time zone 'Asia/Jakarta')::date + 3);

select test.eq_query(
  'Catatan survei ikut mengisi Saringan Awal',
  $$select catatan_survei from leads where id = '27000000-0000-0000-0000-0000000000b3'$$,
  'Suka blok C, minta hook');


-- ============================================================
select test.bagian('Hapus catatan lewat persetujuan');
-- ============================================================

select catat_followup('27000000-0000-0000-0000-0000000000b4', (now() at time zone 'Asia/Jakarta')::date - 1,
  'Chat', 'Tertarik', 'Catatan yang akan dihapus',
  '[{"path":"27000000-0000-0000-0000-0000000000b4/followup/a.jpg"}]'::jsonb,
  (now() at time zone 'Asia/Jakarta')::date + 3);

select test.affects(
  'Penulis tidak dapat menghapus catatannya langsung',
  $$delete from lead_activities where note = 'Catatan yang akan dihapus'$$,
  0);

select test.raises(
  'Penghapusan tanpa alasan ditolak',
  $$select ajukan_hapus_catatan((select id from lead_activities where note = 'Catatan yang akan dihapus'), ' ')$$,
  'Alasan penghapusan wajib');

set test.uid = '22222222-2222-2222-2222-222222222222';

select test.raises(
  'Hanya penulisnya yang bisa mengajukan penghapusan',
  $$select ajukan_hapus_catatan((select id from lead_activities where note = 'Catatan yang akan dihapus'), 'Iseng')$$,
  null);

set test.uid = '11111111-1111-1111-1111-111111111111';

select ajukan_hapus_catatan((select id from lead_activities where note = 'Catatan yang akan dihapus'), 'Salah prospek');

select test.ok(
  'Catatan belum terhapus sebelum disetujui',
  exists (select 1 from lead_activities where note = 'Catatan yang akan dihapus'));

select test.raises(
  'Penulis tidak dapat memutuskan pengajuannya sendiri',
  $$select putuskan_ubah_catatan((select id from lead_activity_edits where jenis = 'hapus'
                                    and lead_id = '27000000-0000-0000-0000-0000000000b4'), true)$$,
  'Hanya Admin Sistem');

set test.uid = '77777777-7777-7777-7777-777777777777';

select putuskan_ubah_catatan((select id from lead_activity_edits where jenis = 'hapus'
                               and lead_id = '27000000-0000-0000-0000-0000000000b4'), true);

reset role;

select test.ok(
  'Catatan terhapus setelah disetujui Admin',
  not exists (select 1 from lead_activities where note = 'Catatan yang akan dihapus'));

select test.eq_query(
  'Jejak pengajuan tetap ada, lengkap dengan isi catatan yang dihapus',
  $$select concat_ws('/', status, (activity_id is null)::text, lama->>'note') from lead_activity_edits
     where jenis = 'hapus' and lead_id = '27000000-0000-0000-0000-0000000000b4'$$,
  'disetujui/true/Catatan yang akan dihapus');

select test.ok(
  'Penghapusan tercatat di log aktivitas',
  exists (select 1 from activity_logs where entity_type = 'lead_activities' and action = 'delete'
             and changes->'before'->>'note' = 'Catatan yang akan dihapus'));

set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';

select catat_followup('27000000-0000-0000-0000-0000000000b5', (now() at time zone 'Asia/Jakarta')::date - 3,
  'Survei Lokasi', 'Tertarik', 'Survei pertama',
  '[{"path":"27000000-0000-0000-0000-0000000000b5/survei/a.jpg"}]'::jsonb,
  (now() at time zone 'Asia/Jakarta')::date + 3);

-- Admin Sistem menghapus catatan siapa pun, langsung — tetap tercatat.
set test.uid = '77777777-7777-7777-7777-777777777777';

select test.eq_query(
  'Penghapusan oleh Admin langsung berlaku',
  $$select ajukan_hapus_catatan((select id from lead_activities where note = 'Survei pertama'), 'Survei salah prospek')->>'status'$$,
  'disetujui');

select test.ok(
  'Tanggal survei Saringan Awal ikut dihitung ulang',
  (select tanggal_survei is null from leads where id = '27000000-0000-0000-0000-0000000000b5'));


-- ============================================================
select test.bagian('Status konsumen lewat persetujuan');
-- ============================================================

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.raises(
  'Status konsumen tidak bisa diubah langsung',
  $$update customers set status = 'aktif' where lead_id = '27000000-0000-0000-0000-0000000000b1'$$,
  'lewat pengajuan');

select test.raises(
  'Pembatalan tidak diajukan lewat sini',
  $$select ajukan_status_konsumen((select id from customers where lead_id = '27000000-0000-0000-0000-0000000000b1'), 'batal', 'x')$$,
  'menu Pembatalan');

select test.raises(
  'Alasan perubahan status wajib',
  $$select ajukan_status_konsumen((select id from customers where lead_id = '27000000-0000-0000-0000-0000000000b1'), 'aktif', '')$$,
  'Alasan perubahan status');

select ajukan_status_konsumen((select id from customers where lead_id = '27000000-0000-0000-0000-0000000000b1'), 'aktif', 'Berkas lengkap');

select test.eq_query(
  'Status belum berubah sebelum disetujui',
  $$select status::text from customers where lead_id = '27000000-0000-0000-0000-0000000000b1'$$,
  'proses');

select test.raises(
  'Satu konsumen satu pengajuan menunggu',
  $$select ajukan_status_konsumen((select id from customers where lead_id = '27000000-0000-0000-0000-0000000000b1'), 'selesai', 'Ralat')$$,
  'masih punya pengajuan');

select test.raises(
  'Pengaju tidak dapat memutuskan sendiri',
  $$select putuskan_status_konsumen((select e.id from customer_status_edits e join customers c on c.id = e.customer_id
                                      where c.lead_id = '27000000-0000-0000-0000-0000000000b1'), true)$$,
  'Hanya Admin Sistem');

set test.uid = '77777777-7777-7777-7777-777777777777';

select putuskan_status_konsumen((select e.id from customer_status_edits e join customers c on c.id = e.customer_id
                                  where c.lead_id = '27000000-0000-0000-0000-0000000000b1'), true);

select test.eq_query(
  'Status berubah setelah disetujui Admin',
  $$select status::text from customers where lead_id = '27000000-0000-0000-0000-0000000000b1'$$,
  'aktif');

select test.eq_query(
  'Perubahan status oleh Admin langsung berlaku',
  $$select ajukan_status_konsumen((select id from customers where lead_id = '27000000-0000-0000-0000-0000000000b1'), 'selesai', 'Serah terima')->>'status'$$,
  'disetujui');

select test.ok(
  'Status selesai mencap tanggal selesai proses',
  (select process_completed_at is not null from customers where lead_id = '27000000-0000-0000-0000-0000000000b1'));

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.ok(
  'Pengaju diberi tahu keputusannya',
  exists (select 1 from json_array_elements(my_notifications()->'items') i
           where i->>'kategori' = 'status_diputuskan'));

select cancel_customer((select id from customers where lead_id = '27000000-0000-0000-0000-0000000000b2'), 'Tidak lolos BI-Checking');

select test.eq_query(
  'Pembatalan tetap berjalan lewat menu Pembatalan',
  $$select status::text from customers where lead_id = '27000000-0000-0000-0000-0000000000b2'$$,
  'batal');


-- ============================================================
select test.bagian('Eskalasi & siapkan berkas');
-- ============================================================

select test.eq(
  'Prospek yang sudah booking tidak dihitung sebagai jadwal terlewat',
  (my_notifications()->>'terlewat')::int,
  (select count(*)::int from leads
    where tanggal_rencana < current_date
      and status::text in ('leads', 'baru', 'cold', 'warm', 'hot', 'dihubungi', 'appointment')));

select test.ok(
  'Sales tidak menerima eskalasi',
  not exists (select 1 from json_array_elements(my_notifications()->'per_kategori') k
               where k->>'kategori' = 'eskalasi'));

set test.uid = '55555555-5555-5555-5555-555555555555';

select test.eq(
  'Supervisor menerima eskalasi setiap jadwal terlewat lebih dari 3 hari',
  (select (k->>'jumlah')::int from json_array_elements(my_notifications()->'per_kategori') k
    where k->>'kategori' = 'eskalasi'),
  (select count(*)::int from leads
    where tanggal_rencana < current_date - 3
      and status::text in ('leads', 'baru', 'cold', 'warm', 'hot', 'dihubungi', 'appointment')));

set test.uid = '11111111-1111-1111-1111-111111111111';

select convert_lead_to_customer('27000000-0000-0000-0000-0000000000b8', null, 700000, current_date);

reset role;
update customers set process_started_at = now() - interval '20 days'
 where lead_id = '27000000-0000-0000-0000-0000000000b8';
set role authenticated;

set test.uid = '44444444-4444-4444-4444-444444444444';

select test.ok(
  'Admin Marketing diingatkan konsumen 14 hari tanpa berkas masuk bank',
  exists (select 1 from json_array_elements(my_notifications()->'items') i
           where i->>'kategori' = 'siapkan_berkas'
             and i->>'record_id' = (select id::text from customers where lead_id = '27000000-0000-0000-0000-0000000000b8')));

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.ok(
  'Sales tidak menerima pengingat siapkan berkas',
  not exists (select 1 from json_array_elements(my_notifications()->'per_kategori') k
               where k->>'kategori' = 'siapkan_berkas'));

reset role;
update customer_kpr set tanggal_masuk_bank = current_date
 where customer_id = (select id from customers where lead_id = '27000000-0000-0000-0000-0000000000b8');
set role authenticated;

set test.uid = '44444444-4444-4444-4444-444444444444';

select test.ok(
  'Pengingat hilang begitu berkas masuk bank',
  not exists (select 1 from json_array_elements(my_notifications()->'items') i
               where i->>'kategori' = 'siapkan_berkas'
                 and i->>'record_id' = (select id::text from customers where lead_id = '27000000-0000-0000-0000-0000000000b8')));

reset role;
set test.uid = '';
