-- ============================================================
-- Otomasi funnel — PRD §4.2
--
-- Tahap Booking ke atas tidak boleh bergantung pada seseorang mengingat untuk
-- mengubah dropdown. Ia ditarik dari data yang sudah tercatat di modul lain,
-- dan hanya boleh bergerak maju.
-- ============================================================

set role authenticated;
select test.bagian('Otomasi funnel');

-- Setiap berkas uji adalah sesi psql tersendiri, jadi identitas harus
-- ditetapkan lagi di sini. Tanpa itu auth.uid() bernilai NULL, RLS menutup
-- seluruh baris, dan uji di bawah akan membaca NULL — bukan kegagalan aturan,
-- melainkan kegagalan membaca.
set test.uid = '11111111-1111-1111-1111-111111111111';

-- Berkas 03 sudah memverifikasi kuitansi Booking Fee untuk konsumen ini,
-- yang seharusnya menaikkan prospek asalnya ke tahap Booking.
select test.eq_query(
  'Kuitansi Booking Fee menaikkan prospek ke tahap Booking',
  $$select status::text from leads where id = '0e0e0e0e-0000-0000-0000-000000000001'$$,
  'booking');

set test.uid = '44444444-4444-4444-4444-444444444444';

update customer_kpr set tanggal_masuk_bank = current_date - 5
 where customer_id = '0f0f0f0f-0000-0000-0000-000000000001';
select test.eq_query(
  'Tanggal masuk bank menaikkan tahap ke KPR',
  $$select status::text from leads where id = '0e0e0e0e-0000-0000-0000-000000000001'$$,
  'kpr');

update customer_kpr set tanggal_akad = current_date
 where customer_id = '0f0f0f0f-0000-0000-0000-000000000001';
select test.eq_query(
  'Tanggal akad menaikkan tahap ke Akad',
  $$select status::text from leads where id = '0e0e0e0e-0000-0000-0000-000000000001'$$,
  'akad');

update customer_kpr set tanggal_serah_terima_kunci = current_date
 where customer_id = '0f0f0f0f-0000-0000-0000-000000000001';
select test.eq_query(
  'Serah terima kunci menaikkan tahap ke Aftersales',
  $$select status::text from leads where id = '0e0e0e0e-0000-0000-0000-000000000001'$$,
  'aftersales');

-- Tahap tidak boleh mundur. Tanpa penjagaan ini, satu pembaruan KPR yang
-- terlambat masuk bisa menarik prospek kembali ke tahap sebelumnya.
select promote_lead('0e0e0e0e-0000-0000-0000-000000000001', 'warm');
select test.eq_query(
  'Tahap tidak dapat dimundurkan',
  $$select status::text from leads where id = '0e0e0e0e-0000-0000-0000-000000000001'$$,
  'aftersales');

-- Prospek yang dibatalkan harus tetap dibatalkan, apa pun yang terjadi pada
-- berkasnya — kalau tidak, angka pembatalan akan menyusut sendiri.
set test.uid = '11111111-1111-1111-1111-111111111111';
update leads set status = 'cancel' where id = '0e0e0e0e-0000-0000-0000-000000000002';
select promote_lead('0e0e0e0e-0000-0000-0000-000000000002', 'booking');
select test.eq_query(
  'Prospek batal tidak tertimpa otomasi tahap',
  $$select status::text from leads where id = '0e0e0e0e-0000-0000-0000-000000000002'$$,
  'cancel');

-- Nilai enum lama harus tetap terbaca sebagai salah satu dari tujuh tahap PRD.
select test.eq_query(
  'Status lama "appointment" dipetakan ke Hot Lead',
  $$select lead_stage_bucket('appointment'::lead_status)$$,
  'hot');
select test.eq_query(
  'Status lama "deal" dipetakan ke Booking',
  $$select lead_stage_bucket('deal'::lead_status)$$,
  'booking');
select test.eq_query(
  'Status lama "dihubungi" dipetakan ke Warm Lead',
  $$select lead_stage_bucket('dihubungi'::lead_status)$$,
  'warm');

reset role;
