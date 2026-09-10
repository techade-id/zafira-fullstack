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
