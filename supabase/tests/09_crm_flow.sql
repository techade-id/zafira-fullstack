-- ============================================================
-- Konversi Booking dan notifikasi — migration_013
--
-- Booking adalah satu peristiwa bisnis: konsumen lahir dari prospek, unit
-- ter-reserve, dan booking fee masuk antrean Finance. Sebelum migrasi ini
-- ketiganya adalah tiga pekerjaan manual terpisah, dan tidak ada satu pun
-- yang menjaga agar sebuah unit tidak dibooking dua orang.
--
-- Yang diuji di sini bukan hanya jalur yang berhasil, tetapi terutama
-- penolakan-penolakannya — di situlah letak integritas datanya.
-- ============================================================

-- ---------- fixtures ----------
-- Berkas 02–08 sudah mengubah prospek dan unit bawaan (0e0e…0001 kini
-- aftersales, 0e0e…0002 cancel), jadi berkas ini memakai datanya sendiri.
reset role;

insert into units (id, project_id, unit_code, block, type, price, status) values
  ('09000000-0000-0000-0000-0000000000a1', '0a0a0a0a-0000-0000-0000-000000000001', 'K-01', 'K', '36/72', 300000000, 'tersedia'),
  ('09000000-0000-0000-0000-0000000000a2', '0a0a0a0a-0000-0000-0000-000000000001', 'K-02', 'K', '36/72', 300000000, 'tersedia'),
  ('09000000-0000-0000-0000-0000000000a3', '0a0a0a0a-0000-0000-0000-000000000001', 'K-03', 'K', '45/90', 400000000, 'tersedia');

-- Empat prospek Sales A dan satu milik Sales B.
insert into leads (id, name, phone, email, status, assigned_to, tanggal_rencana, rencana_selanjutnya) values
  ('09000000-0000-0000-0000-0000000000b1', 'Konversi Sukses', '0812111001', 'sukses@contoh.id',
   'hot', '11111111-1111-1111-1111-111111111111', null, null),
  ('09000000-0000-0000-0000-0000000000b2', 'Konversi Tanpa Unit', '0812111002', null,
   'hot', '11111111-1111-1111-1111-111111111111', null, null),
  ('09000000-0000-0000-0000-0000000000b3', 'Konversi Rebutan Unit', '0812111003', null,
   'hot', '11111111-1111-1111-1111-111111111111', null, null),
  ('09000000-0000-0000-0000-0000000000b4', 'Prospek Dibatalkan', '0812111004', null,
   'cancel', '11111111-1111-1111-1111-111111111111', null, null),
  -- Follow-up terlewat, untuk menguji my_notifications().
  ('09000000-0000-0000-0000-0000000000b5', 'Follow Up Terlewat', '0812111005', null,
   'warm', '11111111-1111-1111-1111-111111111111', current_date - 3, 'Telepon ulang'),
  ('09000000-0000-0000-0000-0000000000b9', 'Prospek Sales B', '0813111009', null,
   'hot', '22222222-2222-2222-2222-222222222222', null, null);

set role authenticated;
select test.bagian('Konversi Booking');

set test.uid = '11111111-1111-1111-1111-111111111111';

-- ---------- jalur yang berhasil ----------

select convert_lead_to_customer(
  '09000000-0000-0000-0000-0000000000b1',
  '09000000-0000-0000-0000-0000000000a1',
  15000000, current_date);

select test.eq_query(
  'Konversi membuat konsumen dari prospek',
  $$select name from customers where lead_id = '09000000-0000-0000-0000-0000000000b1'$$,
  'Konversi Sukses');

-- Data prospek ikut terbawa: inilah yang menghapus pengetikan ulang.
select test.eq_query(
  'Telepon prospek terbawa ke konsumen tanpa diketik ulang',
  $$select phone from customers where lead_id = '09000000-0000-0000-0000-0000000000b1'$$,
  '0812111001');

select test.eq_query(
  'Agen pemilik prospek tetap menjadi agen konsumen',
  $$select sales_agent_id::text from customers where lead_id = '09000000-0000-0000-0000-0000000000b1'$$,
  '11111111-1111-1111-1111-111111111111');

select test.eq_query(
  'Unit ter-reserve menjadi booking',
  $$select status::text from units where id = '09000000-0000-0000-0000-0000000000a1'$$,
  'booking');

select test.eq_query(
  'Booking fee masuk antrean Finance sebagai menunggu',
  $$select p.status::text from payments p
      join customers c on c.id = p.customer_id
     where c.lead_id = '09000000-0000-0000-0000-0000000000b1'
       and p.payment_type = 'booking'$$,
  'menunggu');

-- Pemisahan wewenang PRD §3.2 tidak boleh dilewati oleh konversi: sebuah
-- booking yang dicatat Sales tidak mengunci konsumennya sendiri. Yang mengunci
-- tetap kuitansi dari Finance.
select test.eq_query(
  'Konversi TIDAK mengunci konsumen — kunci tetap milik kuitansi Finance',
  $$select (locked_at is null)::text from customers
     where lead_id = '09000000-0000-0000-0000-0000000000b1'$$,
  'true');

select test.eq_query(
  'Baris KPR dibuka dengan tanggal booking terisi',
  $$select (k.tanggal_booking = current_date)::text from customer_kpr k
      join customers c on c.id = k.customer_id
     where c.lead_id = '09000000-0000-0000-0000-0000000000b1'$$,
  'true');

-- Konsekuensi yang disengaja: trigger customer_kpr_sync_lead_stage (migrasi
-- 009) menaikkan tahap begitu tanggal_booking terisi. Aturan itu sudah ada
-- sebelum migrasi 013 dan tidak dilawan di sini — dicatat sebagai uji supaya
-- perubahan perilakunya kelak tidak lolos diam-diam.
select test.eq_query(
  'Tahap prospek naik ke Booking lewat trigger yang sudah ada',
  $$select status::text from leads where id = '09000000-0000-0000-0000-0000000000b1'$$,
  'booking');

select test.eq_query(
  'Konversi meninggalkan jejak di timeline prospek',
  $$select activity from lead_activities
     where lead_id = '09000000-0000-0000-0000-0000000000b1'
       and activity = 'Konversi ke Booking'$$,
  'Konversi ke Booking');

-- Unit boleh belum ditentukan saat booking dicatat.
select convert_lead_to_customer('09000000-0000-0000-0000-0000000000b2', null, 5000000, current_date);
select test.eq_query(
  'Konversi tanpa unit tetap boleh',
  $$select (unit_id is null)::text from customers
     where lead_id = '09000000-0000-0000-0000-0000000000b2'$$,
  'true');

-- ---------- penolakan ----------

select test.raises(
  'Prospek yang sama tidak bisa dikonversi dua kali',
  $$select convert_lead_to_customer('09000000-0000-0000-0000-0000000000b1',
      '09000000-0000-0000-0000-0000000000a2', 15000000, current_date)$$,
  'sudah pernah dikonversi');

-- Invarian terpenting: satu unit, satu pembeli.
select test.raises(
  'Unit yang sudah dibooking tidak bisa dibooking lagi',
  $$select convert_lead_to_customer('09000000-0000-0000-0000-0000000000b3',
      '09000000-0000-0000-0000-0000000000a1', 15000000, current_date)$$,
  'sudah berstatus');

select test.raises(
  'Prospek yang dibatalkan tidak bisa dikonversi',
  $$select convert_lead_to_customer('09000000-0000-0000-0000-0000000000b4',
      '09000000-0000-0000-0000-0000000000a2', 15000000, current_date)$$,
  'dibatalkan');

select test.raises(
  'Sales tidak bisa mengonversi prospek agen lain',
  $$select convert_lead_to_customer('09000000-0000-0000-0000-0000000000b9',
      '09000000-0000-0000-0000-0000000000a2', 15000000, current_date)$$,
  'bukan milik Anda');

select test.raises(
  'Unit yang tidak ada ditolak',
  $$select convert_lead_to_customer('09000000-0000-0000-0000-0000000000b3',
      '09000000-0000-0000-0000-0000000000aa', 15000000, current_date)$$,
  'Unit tidak ditemukan');

-- Konversi gagal tidak boleh menyisakan konsumen yatim. Ketiga penolakan unit
-- di atas terjadi SETELAH pemeriksaan prospek, jadi ini benar-benar menguji
-- atomisitas, bukan urutan pemeriksaan.
select test.eq_query(
  'Konversi yang gagal tidak menyisakan konsumen',
  $$select count(*)::text from customers where lead_id = '09000000-0000-0000-0000-0000000000b3'$$,
  '0');
select test.eq_query(
  'Konversi yang gagal tidak menyisakan pembayaran',
  $$select count(*)::text from payments p
      join customers c on c.id = p.customer_id
     where c.lead_id = '09000000-0000-0000-0000-0000000000b3'$$,
  '0');

-- Peran monitoring membaca segalanya dan tidak mengubah apa pun (PRD §3.1).
set test.uid = '55555555-5555-5555-5555-555555555555';
select test.raises(
  'Supervisor read-only tidak boleh mengonversi',
  $$select convert_lead_to_customer('09000000-0000-0000-0000-0000000000b3',
      '09000000-0000-0000-0000-0000000000a2', 15000000, current_date)$$,
  'tidak berhak');

set test.uid = '66666666-6666-6666-6666-666666666666';
select test.raises(
  'Pengawas read-only tidak boleh mengonversi',
  $$select convert_lead_to_customer('09000000-0000-0000-0000-0000000000b3',
      '09000000-0000-0000-0000-0000000000a2', 15000000, current_date)$$,
  'tidak berhak');

-- Admin Marketing berhak mengonversi meski bukan pemilik prospek: setelah
-- handover, dialah yang memegang berkasnya.
set test.uid = '44444444-4444-4444-4444-444444444444';
select convert_lead_to_customer('09000000-0000-0000-0000-0000000000b3',
  '09000000-0000-0000-0000-0000000000a3', 20000000, current_date);
select test.eq_query(
  'Admin Marketing boleh mengonversi prospek agen mana pun',
  $$select name from customers where lead_id = '09000000-0000-0000-0000-0000000000b3'$$,
  'Konversi Rebutan Unit');


-- ---------- notifikasi ----------
select test.bagian('Notifikasi');

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.ok(
  'Sales melihat follow-up terlewat pada notifikasinya',
  (select count(*) > 0 from json_array_elements(my_notifications()->'items') i
    where i->>'kategori' = 'followup' and i->>'judul' = 'Follow Up Terlewat'));

select test.eq_query(
  'Follow-up yang terlewat ditandai urgensi tinggi',
  $$select i->>'urgensi' from json_array_elements(my_notifications()->'items') i
     where i->>'judul' = 'Follow Up Terlewat'$$,
  'tinggi');

-- Prospek hangat tanpa aktivitas seminggu adalah kerugian yang paling sering
-- luput; ia harus muncul tanpa diminta.
select test.ok(
  'Prospek hangat tanpa aktivitas 7 hari muncul sebagai peringatan',
  (select count(*) > 0 from json_array_elements(my_notifications()->'items') i
    where i->>'kategori' = 'dingin'));

-- Prospek yang sudah dikonversi keluar dari daftar dingin — ia bukan lagi
-- pekerjaan yang tertunda.
select test.ok(
  'Prospek yang sudah booking tidak lagi dihitung dingin',
  (select count(*) = 0 from json_array_elements(my_notifications()->'items') i
    where i->>'kategori' = 'dingin' and i->>'judul' = 'Konversi Sukses'));

-- Inti desainnya: penyaringan datang dari RLS, bukan dari cabang peran di
-- dalam fungsi. Sales B tidak boleh melihat sepotong pun milik Sales A.
set test.uid = '22222222-2222-2222-2222-222222222222';
select test.ok(
  'Sales B tidak melihat notifikasi milik Sales A',
  (select count(*) = 0 from json_array_elements(my_notifications()->'items') i
    where i->>'judul' in ('Follow Up Terlewat', 'Konversi Sukses')));

set test.uid = '33333333-3333-3333-3333-333333333333';
select test.ok(
  'Finance melihat antrean verifikasi dari konversi',
  (select count(*) > 0 from json_array_elements(my_notifications()->'items') i
    where i->>'kategori' = 'verifikasi' and i->>'judul' = 'Konversi Sukses'));

-- Admin Marketing: berkas yang mengendap di bank dan SP3K yang mau kedaluwarsa.
set test.uid = '44444444-4444-4444-4444-444444444444';
update customer_kpr set tanggal_masuk_bank = current_date - 45, tanggal_sp3k_terbit = null
 where customer_id = (select id from customers where lead_id = '09000000-0000-0000-0000-0000000000b1');
select test.ok(
  'Berkas mengendap lebih dari 30 hari di bank muncul sebagai peringatan',
  (select count(*) > 0 from json_array_elements(my_notifications()->'items') i
    where i->>'kategori' = 'mandek' and i->>'judul' = 'Konversi Sukses'));

update customer_kpr set tanggal_sp3k_terbit = current_date - 10,
                        tanggal_sp3k_expired = current_date + 5,
                        tanggal_akad = null
 where customer_id = (select id from customers where lead_id = '09000000-0000-0000-0000-0000000000b1');
select test.eq_query(
  'SP3K yang kedaluwarsa kurang dari 7 hari ditandai urgensi tinggi',
  $$select i->>'urgensi' from json_array_elements(my_notifications()->'items') i
     where i->>'kategori' = 'sp3k' and i->>'judul' = 'Konversi Sukses'$$,
  'tinggi');

-- Angka pada lonceng harus sama dengan jumlah item yang bisa dibuka, kalau
-- tidak user akan mengejar notifikasi yang tidak ada.
select test.ok(
  'Total pada lonceng konsisten dengan jumlah item',
  (select (my_notifications()->>'total')::int >= json_array_length(my_notifications()->'items')));


-- ---------- template WhatsApp (migration_014) ----------
select test.bagian('Template WhatsApp');

set test.uid = '66666666-6666-6666-6666-666666666666';  -- Pengawas memegang konfigurasi

select test.eq_query(
  'Delapan template bawaan terpasang',
  $$select count(*)::text from business_settings where category = 'wa_template'$$,
  '8');

select test.ok(
  'Setiap template membawa penanda tahapnya',
  (select bool_and(label is not null) from business_settings where category = 'wa_template'));

-- Batasan lama diganti indeks parsial. Keduanya harus tetap berlaku pada
-- bentuk barisnya masing-masing.
select test.raises(
  'Dua tahap tidak boleh memakai penanda yang sama',
  $$insert into business_settings (category, label, value)
    values ('wa_template', 'hot', 'Kalimat lain untuk tahap yang sama')$$,
  'duplicate key');

select test.raises(
  'Daftar pilihan biasa tetap menolak nilai kembar',
  $$insert into business_settings (category, value)
    select 'bank', value from business_settings where category = 'bank' limit 1$$,
  'duplicate key');

-- Inilah yang tidak mungkin dilakukan sebelum migrasi 014: dua tahap berbeda
-- yang kebetulan memakai kalimat sama. Batasan lama (category, value) akan
-- menolaknya, padahal itu sah.
select test.affects(
  'Dua tahap boleh memakai kalimat yang sama persis',
  $$update business_settings set value = (select value from business_settings where category='wa_template' and label='hot')
     where category = 'wa_template' and label = 'warm'$$,
  1);

-- Peran operasional tidak boleh mengubah template: ini konfigurasi, bukan
-- pekerjaan harian (REVISI §2.1 memberi kewenangan itu pada Pengawas).
set test.uid = '11111111-1111-1111-1111-111111111111';
select test.affects(
  'Sales tidak dapat mengubah template',
  $$update business_settings set value = 'Diubah Sales' where category = 'wa_template' and label = 'hot'$$,
  0);


-- ---------- pemberkasan: syarat per bank, BI-Checking, RPC (migration_015) ----------
select test.bagian('Pemberkasan');

set test.uid = '44444444-4444-4444-4444-444444444444';  -- Admin Marketing

select test.ok(
  'Syarat berkas bawaan terpasang',
  (select count(*) >= 12 from bank_doc_requirements where bank = '*'));

select test.ok(
  'Dokumen situasional ditandai tidak wajib',
  (select count(*) > 0 from bank_doc_requirements where bank = '*' and not wajib));

-- Satu bank boleh punya daftarnya sendiri, dan itu menimpa daftar bawaan.
insert into bank_doc_requirements (bank, doc_type, wajib, sort_order)
values ('Bank BTN Brebes', 'KTP Pemohon', true, 1),
       ('Bank BTN Brebes', 'Surat Keterangan Belum Memiliki Rumah', true, 2);
select test.eq_query(
  'Bank boleh punya daftar syarat sendiri',
  $$select count(*)::text from bank_doc_requirements where bank = 'Bank BTN Brebes'$$,
  '2');

select test.raises(
  'Satu dokumen tidak boleh didaftar dua kali untuk bank yang sama',
  $$insert into bank_doc_requirements (bank, doc_type) values ('Bank BTN Brebes', 'KTP Pemohon')$$,
  'duplicate key');

-- Admin Marketing-lah yang tahu bank meminta apa, jadi ia boleh mengubahnya.
select test.affects(
  'Admin Marketing boleh mengubah syarat berkas',
  $$update bank_doc_requirements set wajib = false where bank = 'Bank BTN Brebes' and doc_type = 'KTP Pemohon'$$,
  1);

-- Sales tidak: ini data referensi, bukan pekerjaan hariannya.
set test.uid = '11111111-1111-1111-1111-111111111111';
select test.affects(
  'Sales tidak dapat mengubah syarat berkas',
  $$update bank_doc_requirements set wajib = true where bank = '*' and doc_type = 'NPWP'$$,
  0);

-- BI-Checking hanya menerima nilai yang dikenal; salah ketik harus ditolak
-- sekarang, bukan muncul sebagai status hantu di layar Admin Marketing.
set test.uid = '44444444-4444-4444-4444-444444444444';
select test.raises(
  'Status BI-Checking di luar daftar ditolak',
  $$update customer_kpr set bi_checking_status = 'kira-kira lolos'
     where customer_id = (select id from customers where lead_id = '09000000-0000-0000-0000-0000000000b1')$$,
  'customer_kpr_bi_checking_status_check');

-- Bagian Notifikasi di atas sudah menerbitkan SP3K untuk konsumen ini, dan
-- peringatan BI-Checking memang berhenti berlaku begitu SP3K keluar. Supaya
-- ketiga uji di bawah benar-benar menguji sesuatu — bukan lolos secara hampa —
-- keadaannya dikembalikan ke "berkas di bank, SP3K belum terbit".
update customer_kpr
   set tanggal_sp3k_terbit = null, tanggal_sp3k_expired = null,
       bi_checking_status = 'lolos', bi_checking_tanggal = current_date,
       penghasilan_verifikasi = 4000000, angsuran_bulanan = 1200000
 where customer_id = (select id from customers where lead_id = '09000000-0000-0000-0000-0000000000b1');
select test.eq_query(
  'BI-Checking dan RPC tersimpan',
  $$select bi_checking_status from customer_kpr
     where customer_id = (select id from customers where lead_id = '09000000-0000-0000-0000-0000000000b1')$$,
  'lolos');

-- Berkas ini sudah di bank dan BI-Checking-nya lolos, jadi tidak boleh muncul
-- sebagai peringatan; rasio angsurannya 30% — masih di bawah sepertiga.
select test.ok(
  'Berkas dengan BI-Checking lolos tidak diperingatkan',
  (select count(*) = 0 from json_array_elements(my_notifications()->'items') i
    where i->>'kategori' = 'bi_checking' and i->>'judul' = 'Konversi Sukses'));
select test.ok(
  'Angsuran 30% dari penghasilan tidak diperingatkan',
  (select count(*) = 0 from json_array_elements(my_notifications()->'items') i
    where i->>'kategori' = 'rpc' and i->>'judul' = 'Konversi Sukses'));

-- Dinaikkan melewati sepertiga: sekarang harus muncul.
update customer_kpr set angsuran_bulanan = 1600000
 where customer_id = (select id from customers where lead_id = '09000000-0000-0000-0000-0000000000b1');
select test.ok(
  'Angsuran di atas sepertiga penghasilan diperingatkan',
  (select count(*) > 0 from json_array_elements(my_notifications()->'items') i
    where i->>'kategori' = 'rpc' and i->>'judul' = 'Konversi Sukses'));

-- BI-Checking dicabut: berkas sudah di bank tanpa hasil, itu yang paling mahal.
update customer_kpr set bi_checking_status = null
 where customer_id = (select id from customers where lead_id = '09000000-0000-0000-0000-0000000000b1');
select test.ok(
  'Berkas di bank tanpa BI-Checking diperingatkan',
  (select count(*) > 0 from json_array_elements(my_notifications()->'items') i
    where i->>'kategori' = 'bi_checking' and i->>'judul' = 'Konversi Sukses'));


-- ---------- pembatalan prospek & pengalihan agen (migration_016) ----------
select test.bagian('Pembatalan Prospek');

reset role;
insert into leads (id, name, phone, status, assigned_to) values
  ('09000000-0000-0000-0000-0000000000c1', 'Prospek Dibatalkan A', '0812222001', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('09000000-0000-0000-0000-0000000000c2', 'Prospek Dialihkan',    '0812222002', 'hot',  '11111111-1111-1111-1111-111111111111'),
  ('09000000-0000-0000-0000-0000000000c3', 'Milik Sales B',        '0813222003', 'warm', '22222222-2222-2222-2222-222222222222');
set role authenticated;

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.raises(
  'Pembatalan tanpa alasan ditolak',
  $$select cancel_lead('09000000-0000-0000-0000-0000000000c1', '   ')$$,
  'wajib diisi');

select cancel_lead('09000000-0000-0000-0000-0000000000c1', 'Tidak lolos BI-Checking', 'SLIK menunjukkan tunggakan aktif');

select test.eq_query(
  'Prospek berubah menjadi cancel',
  $$select status::text from leads where id = '09000000-0000-0000-0000-0000000000c1'$$,
  'cancel');

-- Inilah yang selama ini hilang: alasannya, bukan hanya statusnya.
select test.eq_query(
  'Alasan pembatalan tercatat',
  $$select reason from cancellations where lead_id = '09000000-0000-0000-0000-0000000000c1'$$,
  'Tidak lolos BI-Checking');

select test.eq_query(
  'Tahap saat batal ikut disalin',
  $$select tahap_saat_batal from cancellations where lead_id = '09000000-0000-0000-0000-0000000000c1'$$,
  'warm');

select test.eq_query(
  'Jadwal follow-up ikut dikosongkan',
  $$select (tanggal_rencana is null)::text from leads where id = '09000000-0000-0000-0000-0000000000c1'$$,
  'true');

select test.eq_query(
  'Pembatalan meninggalkan jejak di riwayat',
  $$select activity from lead_activities
     where lead_id = '09000000-0000-0000-0000-0000000000c1' and activity = 'Prospek dibatalkan'$$,
  'Prospek dibatalkan');

select test.raises(
  'Prospek yang sudah batal tidak bisa dibatalkan lagi',
  $$select cancel_lead('09000000-0000-0000-0000-0000000000c1', 'Alasan sepihak')$$,
  'sudah dibatalkan');

-- Satu baris pembatalan hanya boleh menunjuk salah satu, bukan keduanya.
select test.raises(
  'Pembatalan tidak boleh menunjuk prospek dan konsumen sekaligus',
  $$insert into cancellations (lead_id, customer_id, reason)
    values ('09000000-0000-0000-0000-0000000000c2',
            (select id from customers where lead_id = '09000000-0000-0000-0000-0000000000b1'), 'Ganda')$$,
  'cancellations_satu_pemilik');

-- RLS yang menahannya, bukan pemeriksaan peran di dalam fungsi.
-- Prospek milik agen lain tidak "ditolak" melainkan tidak terlihat: SELECT di
-- dalam cancel_lead tunduk pada RLS yang sama. Pesannya menyebut kedua
-- kemungkinan, karena dari sisi pemanggil keduanya memang tak terbedakan.
select test.raises(
  'Sales tidak dapat membatalkan prospek agen lain',
  $$select cancel_lead('09000000-0000-0000-0000-0000000000c3', 'Alasan sepihak')$$,
  'bukan milik Anda');

-- ---------- pengalihan agen ----------
select test.bagian('Pengalihan Prospek');

set test.uid = '11111111-1111-1111-1111-111111111111';
select transfer_lead('09000000-0000-0000-0000-0000000000c2', '22222222-2222-2222-2222-222222222222', 'Sales A cuti panjang');

-- Diperiksa sebagai peran yang boleh melihat lintas agen. Sebagai Sales A,
-- barisnya justru sudah hilang dari pandangan begitu diserahkan — dan
-- kehilangan itu sendiri adalah bukti pengalihannya berhasil.
set test.uid = '44444444-4444-4444-4444-444444444444';
select test.eq_query(
  'Prospek berpindah ke agen tujuan',
  $$select assigned_to::text from leads where id = '09000000-0000-0000-0000-0000000000c2'$$,
  '22222222-2222-2222-2222-222222222222');

select test.eq_query(
  'Pengalihan tercatat di riwayat',
  $$select activity from lead_activities
     where lead_id = '09000000-0000-0000-0000-0000000000c2' and activity = 'Prospek dialihkan'$$,
  'Prospek dialihkan');

set test.uid = '11111111-1111-1111-1111-111111111111';
-- Setelah diserahkan, pemilik lama kehilangan jangkauannya — itu memang RLS
-- bekerja, dan karena itu pula transfer_lead harus SECURITY DEFINER.
select test.raises(
  'Pemilik lama tidak bisa menarik kembali prospeknya',
  $$select transfer_lead('09000000-0000-0000-0000-0000000000c2', '11111111-1111-1111-1111-111111111111')$$,
  'bukan milik Anda');

set test.uid = '22222222-2222-2222-2222-222222222222';
select test.raises(
  'Mengalihkan ke agen yang sama ditolak',
  $$select transfer_lead('09000000-0000-0000-0000-0000000000c2', '22222222-2222-2222-2222-222222222222')$$,
  'sudah dipegang');

select test.raises(
  'Agen tujuan yang tidak ada ditolak',
  $$select transfer_lead('09000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000')$$,
  'tidak ditemukan');

-- Penyelia boleh memindahkan milik siapa pun — itulah gunanya saat seorang
-- Sales berhenti dan prospeknya harus diselamatkan.
set test.uid = '44444444-4444-4444-4444-444444444444';
select transfer_lead('09000000-0000-0000-0000-0000000000c2', '11111111-1111-1111-1111-111111111111');
select test.eq_query(
  'Admin Marketing boleh memindahkan prospek milik siapa pun',
  $$select assigned_to::text from leads where id = '09000000-0000-0000-0000-0000000000c2'$$,
  '11111111-1111-1111-1111-111111111111');
