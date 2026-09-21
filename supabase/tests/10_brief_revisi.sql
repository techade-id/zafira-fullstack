-- ============================================================
-- BRIEF ZAFIRA PROPERTY — migration_017
--
-- Yang diuji di sini adalah hal-hal yang, bila salah, salahnya tidak kelihatan
-- di layar mana pun:
--
--   · Suhu prospek kini ditulis sistem. Sebuah aturan yang keliru tidak
--     melempar error — ia hanya menaruh prospek pada kategori yang salah,
--     diam-diam, dan justru itulah kesalahan yang brief minta dihilangkan.
--   · Fase "menunggu verifikasi" berdiri persis di garis pemisahan wewenang.
--     Kalau Admin Marketing bisa melangkahinya, seluruh Segregation of Duties
--     ikut bocor.
--   · Total DP dihitung trigger. Sebuah total yang tidak ikut berubah akan
--     tampak benar sampai seseorang menagih angka yang salah.
-- ============================================================

reset role;

-- ---------- fixtures ----------
insert into units (id, project_id, unit_code, block, type, price, status) values
  ('10000000-0000-0000-0000-0000000000a1', '0a0a0a0a-0000-0000-0000-000000000001', 'L-01', 'L', '36/72', 300000000, 'tersedia'),
  ('10000000-0000-0000-0000-0000000000a2', '0a0a0a0a-0000-0000-0000-000000000001', 'L-02', 'L', '36/72', 300000000, 'tersedia');

insert into partners (id, name, type) values
  ('10000000-0000-0000-0000-0000000000f1', 'Mitra Koperasi', 'kemitraan'),
  ('10000000-0000-0000-0000-0000000000f2', 'Agen Lepas', 'freelance');

set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';


-- ============================================================
select test.bagian('Suhu leads otomatis');
-- ============================================================

-- Prospek baru selalu Warm, meski pemanggil meminta 'leads'. Dua pintu masuk
-- prospek di aplikasi mengirim nilai berbeda; trigger yang menyamakan keduanya.
insert into leads (id, name, phone, status, assigned_to) values
  ('10000000-0000-0000-0000-0000000000b1', 'Suhu Bawaan', '0812333001', 'leads', '11111111-1111-1111-1111-111111111111');

select test.eq_query(
  'Prospek baru masuk sebagai Warm, bukan New Lead',
  $$select status::text from leads where id = '10000000-0000-0000-0000-0000000000b1'$$,
  'warm');

-- BRIEF, kata per kata: catatan "kurang minat" harus membuat status Cold.
insert into lead_activities (lead_id, actor_id, activity, note) values
  ('10000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111',
   'WhatsApp', 'Sepertinya kurang minat, mau cari yang lebih dekat kota');

select test.eq_query(
  'Catatan "kurang minat" menurunkan status ke Cold',
  $$select status::text from leads where id = '10000000-0000-0000-0000-0000000000b1'$$,
  'cold');

-- Dan naik kembali ketika percakapannya berubah: suhu adalah keadaan
-- sekarang, bukan cap permanen.
insert into lead_activities (lead_id, actor_id, activity, hasil, note) values
  ('10000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111',
   'Telepon', 'Siap Booking', 'Berubah pikiran, siap booking minggu depan');

select test.eq_query(
  'Catatan "siap booking" menaikkan status ke Hot',
  $$select status::text from leads where id = '10000000-0000-0000-0000-0000000000b1'$$,
  'hot');

-- "tidak tertarik" memuat kata "tertarik". Urutan pemeriksaan yang terbalik
-- akan membaca penolakan sebagai minat — kesalahan yang mudah sekali lolos.
select test.eq(
  'Penolakan tidak terbaca sebagai minat',
  lead_temperature_from_text('Sudah dihubungi, tidak tertarik'),
  'cold');

select test.eq(
  'Minat sungguhan tetap terbaca',
  lead_temperature_from_text('Tertarik, minta simulasi angsuran'),
  'hot');

-- Fakta mengalahkan kata-kata: yang sudah lolos BI-Checking adalah prospek
-- terpanas yang dimiliki perusahaan, apa pun bunyi catatan terakhirnya.
insert into leads (id, name, phone, status, assigned_to, bi_checking_status) values
  ('10000000-0000-0000-0000-0000000000b2', 'Sudah Lolos BI', '0812333002', 'warm',
   '11111111-1111-1111-1111-111111111111', 'lolos');

select test.eq_query(
  'BI-Checking lolos membuat prospek Hot',
  $$select lead_temperature('10000000-0000-0000-0000-0000000000b2')$$,
  'hot');

-- Tahap Booking ke atas ditulis trigger lain. Suhu tidak boleh menariknya
-- mundur, berapa pun dinginnya catatan terakhir.
insert into leads (id, name, phone, status, assigned_to) values
  ('10000000-0000-0000-0000-0000000000b3', 'Sudah Booking', '0812333003', 'booking',
   '11111111-1111-1111-1111-111111111111');

insert into lead_activities (lead_id, actor_id, activity, note) values
  ('10000000-0000-0000-0000-0000000000b3', '11111111-1111-1111-1111-111111111111',
   'WhatsApp', 'kurang minat');

select test.eq_query(
  'Suhu tidak pernah menarik mundur tahap Booking',
  $$select status::text from leads where id = '10000000-0000-0000-0000-0000000000b3'$$,
  'booking');

-- Begitu pula Cancel: itu keputusan manusia yang punya alasan tercatat.
insert into leads (id, name, phone, status, assigned_to) values
  ('10000000-0000-0000-0000-0000000000b4', 'Sudah Batal', '0812333004', 'cancel',
   '11111111-1111-1111-1111-111111111111');

insert into lead_activities (lead_id, actor_id, activity, hasil) values
  ('10000000-0000-0000-0000-0000000000b4', '11111111-1111-1111-1111-111111111111', 'Telepon', 'Siap Booking');

select test.eq_query(
  'Suhu tidak menghidupkan kembali prospek yang dibatalkan',
  $$select status::text from leads where id = '10000000-0000-0000-0000-0000000000b4'$$,
  'cancel');


-- ============================================================
select test.bagian('Sumber leads');
-- ============================================================

select test.raises(
  'Sumber organik tanpa keterangan detail ditolak',
  $$insert into leads (name, phone, status, source_type, assigned_to)
    values ('Organik Tanpa Detail', '0812333005', 'warm', 'organik',
            '11111111-1111-1111-1111-111111111111')$$,
  'organik_detail');

select test.affects(
  'Sumber organik dengan keterangan diterima',
  $$insert into leads (name, phone, status, source_type, organik_detail, assigned_to)
    values ('Organik Lengkap', '0812333006', 'warm', 'organik', 'Pameran Kota Tegal',
            '11111111-1111-1111-1111-111111111111')$$,
  1);

select test.affects(
  'Kemitraan berdiri sebagai sumber tersendiri',
  $$insert into leads (name, phone, status, source_type, partner_id, assigned_to)
    values ('Dari Kemitraan', '0812333007', 'warm', 'kemitraan',
            '10000000-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111')$$,
  1);

select test.raises(
  'Sumber di luar keempat pilihan ditolak',
  $$insert into leads (name, phone, status, source_type, assigned_to)
    values ('Sumber Ngawur', '0812333008', 'warm', 'entah',
            '11111111-1111-1111-1111-111111111111')$$,
  'source_type');


-- ============================================================
select test.bagian('Saringan awal sebelum booking');
-- ============================================================

reset role;
insert into leads (id, name, phone, status, assigned_to, tanggal_survei, catatan_survei,
                   bi_checking_status, bi_checking_tanggal, gaji) values
  ('10000000-0000-0000-0000-0000000000c1', 'Lolos Saringan', '0812444001', 'hot',
   '11111111-1111-1111-1111-111111111111', current_date - 5, 'Lokasi cocok',
   'lolos', current_date - 3, 6000000),
  ('10000000-0000-0000-0000-0000000000c2', 'Gagal Saringan', '0812444002', 'hot',
   '11111111-1111-1111-1111-111111111111', null, null, 'tidak_lolos', current_date - 2, null);
set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';

-- Saringan yang bisa dilangkahi bukan saringan. Booking yang diterima setelah
-- BI-Checking gagal adalah booking yang sudah pasti batal, dan uangnya sudah
-- telanjur berpindah tangan.
select test.raises(
  'Konversi ditolak bila BI-Checking tidak lolos',
  $$select convert_lead_to_customer('10000000-0000-0000-0000-0000000000c2',
      '10000000-0000-0000-0000-0000000000a2', 5000000, current_date)$$,
  'BI-Checking');

-- Lampiran survei menempel pada prospek dulu, lalu berpindah kepemilikan.
insert into berkas_lampiran (lead_id, slot, file_url, file_name)
values ('10000000-0000-0000-0000-0000000000c1', 'survei', 'lead/survei-1.jpg', 'survei-1.jpg');

select convert_lead_to_customer('10000000-0000-0000-0000-0000000000c1',
  '10000000-0000-0000-0000-0000000000a1', 5000000, current_date);

select test.eq_query(
  'Tanggal survei terbawa ke berkas KPR',
  $$select k.tanggal_survei::text from customer_kpr k
      join customers c on c.id = k.customer_id
     where c.lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  (current_date - 5)::text);

select test.eq_query(
  'Hasil BI-Checking terbawa ke berkas KPR',
  $$select k.bi_checking_status from customer_kpr k
      join customers c on c.id = k.customer_id
     where c.lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  'lolos');

select test.eq_query(
  'Penghasilan prospek mengisi data diri konsumen',
  $$select c.penghasilan::text from customers c
     where c.lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  '6000000.00');

-- Berpindah, bukan disalin: dua baris untuk satu berkas berarti dua kebenaran
-- yang bisa menyimpang.
select test.eq_query(
  'Lampiran survei berpindah ke konsumen, bukan disalin',
  $$select count(*)::text from berkas_lampiran
     where slot = 'survei'
       and lead_id = '10000000-0000-0000-0000-0000000000c1'
       and customer_id is not null$$,
  '1');


-- ============================================================
select test.bagian('Fase menunggu verifikasi');
-- ============================================================

-- Booking fee dari konversi di atas: dicatat, belum berbukti.
select test.eq_query(
  'Booking fee masuk sebagai menunggu',
  $$select p.status::text from payments p
      join customers c on c.id = p.customer_id
     where c.lead_id = '10000000-0000-0000-0000-0000000000c1' and p.payment_type = 'booking'$$,
  'menunggu');

-- Sales melampirkan bukti transfer: itu permintaan verifikasi, bukan
-- keputusan. Statusnya pindah satu langkah, tidak sampai tervalidasi.
select test.affects(
  'Bukti transfer memindahkan pembayaran ke menunggu verifikasi',
  $$update payments p
       set bukti_transfer_url = 'cust/bukti-1.jpg', status = 'menunggu_verifikasi'
      from customers c
     where c.id = p.customer_id
       and c.lead_id = '10000000-0000-0000-0000-0000000000c1'
       and p.payment_type = 'booking'$$,
  1);

select test.eq_query(
  'Waktu dan pengunggah bukti transfer dicap sistem',
  $$select (bukti_transfer_at is not null and bukti_transfer_by is not null)::text
      from payments p join customers c on c.id = p.customer_id
     where c.lead_id = '10000000-0000-0000-0000-0000000000c1' and p.payment_type = 'booking'$$,
  'true');

-- Admin Marketing adalah peran yang brief sebut sebagai pengunggah bukti
-- transfer, dan ia bukan pemilik konsumen dalam arti owns_customer(). Kalau
-- policy update tidak memuat can_write_berkas(), pembaruan di bawah mengenai
-- NOL baris tanpa melempar galat sama sekali — layar mengatakan "terkirim"
-- untuk sesuatu yang tidak pernah tersimpan.
set test.uid = '44444444-4444-4444-4444-444444444444';

select test.affects(
  'Admin Marketing dapat mengunggah bukti transfer',
  $$update payments p
       set bukti_transfer_url = 'cust/bukti-adminmkt.jpg', status = 'menunggu_verifikasi'
      from customers c
     where c.id = p.customer_id
       and c.lead_id = '10000000-0000-0000-0000-0000000000c1'
       and p.payment_type = 'booking'$$,
  1);

select test.raises(
  'Admin Marketing tetap tidak bisa memvalidasi sendiri',
  $$update payments p set status = 'terverifikasi'
      from customers c
     where c.id = p.customer_id
       and c.lead_id = '10000000-0000-0000-0000-0000000000c1'
       and p.payment_type = 'booking'$$,
  'wewenang Finance');

set test.uid = '11111111-1111-1111-1111-111111111111';

-- Garis pemisahan wewenang: melampirkan bukti tidak sama dengan memvalidasi.
select test.raises(
  'Selain Finance tidak bisa melompat ke terverifikasi',
  $$update payments p set status = 'terverifikasi'
      from customers c
     where c.id = p.customer_id
       and c.lead_id = '10000000-0000-0000-0000-0000000000c1'
       and p.payment_type = 'booking'$$,
  'wewenang Finance');

select test.raises(
  'Selain Finance tidak bisa mengunggah kuitansi resmi',
  $$update payments p set proof_url = 'palsu.pdf'
      from customers c
     where c.id = p.customer_id
       and c.lead_id = '10000000-0000-0000-0000-0000000000c1'
       and p.payment_type = 'booking'$$,
  'Kuitansi resmi');

-- Handover Hard-Lock tetap menunggu kuitansi Finance. Bukti transfer dari
-- Admin Marketing tidak boleh memicunya — kalau bisa, siapa pun dapat
-- memindahkan tanggung jawab berkas dengan mengunggah satu gambar.
select test.eq_query(
  'Bukti transfer tidak memicu Handover Hard-Lock',
  $$select (locked_at is null)::text from customers
     where lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  'true');

set test.uid = '33333333-3333-3333-3333-333333333333';

select test.affects(
  'Finance menutup pembayaran dengan kuitansi resmi',
  $$update payments p set status = 'terverifikasi', proof_url = 'kuitansi-1.pdf'
      from customers c
     where c.id = p.customer_id
       and c.lead_id = '10000000-0000-0000-0000-0000000000c1'
       and p.payment_type = 'booking'$$,
  1);

select test.eq_query(
  'Kuitansi Booking Fee memicu Handover Hard-Lock',
  $$select (locked_at is not null)::text from customers
     where lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  'true');


-- ============================================================
select test.bagian('Total DP dan tahap KPR');
-- ============================================================

set test.uid = '44444444-4444-4444-4444-444444444444';

select test.affects(
  'Nominal DP dan biaya tanah tersimpan',
  $$update customer_kpr k set nominal_dp = 10000000, biaya_tambahan_tanah = 5000000
      from customers c
     where c.id = k.customer_id and c.lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  1);

-- BRIEF §DP: akumulasi otomatis. Dihitung trigger supaya total tidak pernah
-- bisa berbeda dari penyusunnya, apa pun yang dikirim klien.
select test.eq_query(
  'Total DP dihitung otomatis dari DP + biaya tanah',
  $$select k.nominal_total_dp::text from customer_kpr k
      join customers c on c.id = k.customer_id
     where c.lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  '15000000.00');

select test.affects(
  'Total DP yang diketik tangan diabaikan',
  $$update customer_kpr k set nominal_total_dp = 999
      from customers c
     where c.id = k.customer_id and c.lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  1);

select test.eq_query(
  'Total DP tetap mengikuti penyusunnya',
  $$select k.nominal_total_dp::text from customer_kpr k
      join customers c on c.id = k.customer_id
     where c.lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  '15000000.00');

-- Penghasilan pindah ke data diri konsumen, tetapi rasio RPC pada stepper
-- masih membacanya dari customer_kpr — keduanya harus tetap sejalan.
select test.affects(
  'Penghasilan konsumen dapat diperbarui dari kartu konsumen',
  $$update customers set penghasilan = 7000000
     where lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  1);

select test.eq_query(
  'Penghasilan konsumen tersalin ke berkas KPR untuk hitungan RPC',
  $$select k.penghasilan_verifikasi::text from customer_kpr k
      join customers c on c.id = k.customer_id
     where c.lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  '7000000.00');

select test.raises(
  'Hasil BPHTB di luar lolos/tidak lolos ditolak',
  $$update customer_kpr k set bphtb_status = 'mungkin'
      from customers c
     where c.id = k.customer_id and c.lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  'bphtb_status');

select test.raises(
  'Status balik nama SHM di luar sudah/belum ditolak',
  $$update customer_kpr k set shm_balik_nama = 'entah'
      from customers c
     where c.id = k.customer_id and c.lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  'shm_balik_nama');


-- ============================================================
select test.bagian('Kelengkapan berkas & Proses Bank');
-- ============================================================

-- Tanpa bank, tidak ada daftar syarat yang bisa dilanggar — dan tanpa daftar
-- syarat, "lengkap" tidak berarti apa-apa.
select test.raises(
  'Proses Bank ditolak sebelum bank dipilih',
  $$select tandai_proses_bank(
      (select id from customers where lead_id = '10000000-0000-0000-0000-0000000000c1'))$$,
  'Pilih bank');

select test.affects(
  'Bank dipilih',
  $$update customer_kpr k set nama_bank = 'BTN'
      from customers c
     where c.id = k.customer_id and c.lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  1);

select test.raises(
  'Proses Bank ditolak selama dokumen wajib belum lengkap',
  $$select tandai_proses_bank(
      (select id from customers where lead_id = '10000000-0000-0000-0000-0000000000c1'))$$,
  'belum lengkap');

select test.ok(
  'Kelengkapan berkas melaporkan dokumen yang kurang',
  (select json_array_length(
     kelengkapan_berkas((select id from customers where lead_id = '10000000-0000-0000-0000-0000000000c1'))->'kurang') > 0));

-- Seluruh dokumen wajib diunggah sekaligus, supaya yang diuji adalah gerbangnya
-- dan bukan daftar syaratnya.
insert into customer_documents (customer_id, doc_type, file_url, status)
select (select id from customers where lead_id = '10000000-0000-0000-0000-0000000000c1'),
       r.doc_type, 'berkas/' || r.doc_type || '.pdf', 'menunggu'
  from bank_doc_requirements r
 where r.bank = '*' and r.wajib;

select test.eq_query(
  'Berkas dinyatakan lengkap setelah seluruh dokumen wajib diunggah',
  $$select (kelengkapan_berkas(
      (select id from customers where lead_id = '10000000-0000-0000-0000-0000000000c1'))->>'lengkap')$$,
  'true');

-- Dokumen yang ditolak bank memang terunggah, tetapi berkasnya tetap kurang.
-- Menghitungnya sebagai ada akan meloloskan "Proses Bank" untuk berkas yang
-- pasti dikembalikan — sementara daftarnya di layar masih menandainya merah.
select test.affects(
  'Satu dokumen wajib ditolak bank',
  $$update customer_documents set status = 'ditolak'
     where customer_id = (select id from customers where lead_id = '10000000-0000-0000-0000-0000000000c1')
       and doc_type = 'KTP Pemohon'$$,
  1);

select test.eq_query(
  'Dokumen ditolak tidak dihitung sebagai sudah ada',
  $$select (kelengkapan_berkas(
      (select id from customers where lead_id = '10000000-0000-0000-0000-0000000000c1'))->>'lengkap')$$,
  'false');

select test.raises(
  'Proses Bank ditolak selama masih ada dokumen yang ditolak bank',
  $$select tandai_proses_bank(
      (select id from customers where lead_id = '10000000-0000-0000-0000-0000000000c1'))$$,
  'belum lengkap');

select test.affects(
  'Dokumen diunggah ulang',
  $$update customer_documents set status = 'menunggu'
     where customer_id = (select id from customers where lead_id = '10000000-0000-0000-0000-0000000000c1')
       and doc_type = 'KTP Pemohon'$$,
  1);

select test.ok(
  'Proses Bank berhasil setelah berkas lengkap',
  (select tandai_proses_bank(
     (select id from customers where lead_id = '10000000-0000-0000-0000-0000000000c1')) is not null));

select test.eq_query(
  'Proses Bank mengisi tanggal masuk bank',
  $$select (k.tanggal_masuk_bank is not null and k.proses_bank_at is not null)::text
      from customer_kpr k join customers c on c.id = k.customer_id
     where c.lead_id = '10000000-0000-0000-0000-0000000000c1'$$,
  'true');


-- ============================================================
select test.bagian('Dashboard per prosedur');
-- ============================================================

select test.ok(
  'Dashboard melaporkan hitungan per prosedur',
  (select dashboard_stats(null, null)->'periode' is not null));

select test.ok(
  'Booking bulan berjalan terhitung dari tanggal bookingnya',
  (select (dashboard_stats(date_trunc('month', current_date)::date, current_date)
             ->'periode'->>'booking')::int > 0));

select test.ok(
  'Survei terhitung dari tanggal surveinya',
  (select (dashboard_stats(current_date - 30, current_date)->'periode'->>'survei')::int > 0));

select test.ok(
  'Antrean Finance memisahkan yang sudah berbukti dari yang belum',
  (select dashboard_stats(null, null)->'finance'->>'siap_verifikasi' is not null));


-- ============================================================
select test.bagian('Penyapuan suhu berbasis waktu');
-- ============================================================

-- Satu-satunya aturan suhu yang tidak punya peristiwa pemicu: prospek yang
-- didiamkan lebih dari dua minggu. Trigger tidak bisa menangkapnya, jadi
-- refresh_lead_temperature() yang memikulnya.
reset role;
insert into leads (id, name, phone, status, assigned_to) values
  ('10000000-0000-0000-0000-0000000000d1', 'Didiamkan Lama', '0812555001', 'warm',
   '11111111-1111-1111-1111-111111111111'),
  ('10000000-0000-0000-0000-0000000000d2', 'Baru Dihubungi', '0812555002', 'warm',
   '11111111-1111-1111-1111-111111111111'),
  ('10000000-0000-0000-0000-0000000000d3', 'Lama Tapi Berminat', '0812555003', 'warm',
   '11111111-1111-1111-1111-111111111111');

insert into lead_activities (lead_id, actor_id, activity, note, created_at) values
  ('10000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111',
   'WhatsApp', 'Menanyakan lokasi', now() - interval '30 days'),
  ('10000000-0000-0000-0000-0000000000d2', '11111111-1111-1111-1111-111111111111',
   'WhatsApp', 'Menanyakan lokasi', now() - interval '2 days'),
  ('10000000-0000-0000-0000-0000000000d3', '11111111-1111-1111-1111-111111111111',
   'WhatsApp', 'Siap booking bulan depan', now() - interval '30 days');

-- Trigger sudah menjalankan aturannya saat baris di atas masuk; dikembalikan
-- ke warm supaya yang diuji benar-benar penyapuannya.
update leads set status = 'warm'
 where id in ('10000000-0000-0000-0000-0000000000d1',
              '10000000-0000-0000-0000-0000000000d2',
              '10000000-0000-0000-0000-0000000000d3');

set role authenticated;
set test.uid = '77777777-7777-7777-7777-777777777777';

select refresh_lead_temperature();

select test.eq_query(
  'Prospek yang didiamkan 30 hari menjadi Cold',
  $$select status::text from leads where id = '10000000-0000-0000-0000-0000000000d1'$$,
  'cold');

select test.eq_query(
  'Prospek yang baru dihubungi tidak ikut mendingin',
  $$select status::text from leads where id = '10000000-0000-0000-0000-0000000000d2'$$,
  'warm');

-- Kata kunci pada catatan terakhir mengalahkan kemandekan: seseorang yang
-- terakhir bilang "siap booking" bukan prospek dingin, ia prospek terlantar.
select test.eq_query(
  'Catatan positif mengalahkan aturan kemandekan',
  $$select status::text from leads where id = '10000000-0000-0000-0000-0000000000d3'$$,
  'warm');

select test.eq_query(
  'Penyapuan tidak menyentuh prospek yang sudah booking',
  $$select status::text from leads where id = '10000000-0000-0000-0000-0000000000b3'$$,
  'booking');
