-- ============================================================
-- Segregation of Duties & Handover Hard-Lock — REVISI §2.2, PRD §3.2
--
-- Ini bagian dengan risiko tertinggi di seluruh sistem: yang dijaga adalah
-- uang dan perpindahan tanggung jawab data. RLS tidak bisa membatasi kolom,
-- jadi aturannya ditegakkan trigger — dan trigger tidak terlihat dari kode
-- frontend mana pun. Justru karena itu ia perlu diuji.
-- ============================================================

set role authenticated;
select test.bagian('SoD & Hard-Lock');

-- ---------- Sales mencatat Booking Fee ----------
set test.uid = '11111111-1111-1111-1111-111111111111';

-- Sales berhak mencatat setoran yang ia terima. Yang tidak boleh adalah
-- menyatakan setoran itu sah. Nilai status dan proof_url di bawah sengaja
-- diisi curang untuk membuktikan trigger menormalkannya.
insert into payments (id, customer_id, payment_type, amount, status, proof_url)
values ('0aaaaaaa-0000-0000-0000-000000000001', '0f0f0f0f-0000-0000-0000-000000000001',
        'booking', 5000000, 'terverifikasi', 'palsu/kuitansi.jpg');

select test.eq_query(
  'Pembayaran dari Sales dipaksa berstatus menunggu',
  $$select status::text from payments where id = '0aaaaaaa-0000-0000-0000-000000000001'$$,
  'menunggu');

select test.eq_query(
  'Kuitansi palsu dari Sales dibuang',
  $$select coalesce(proof_url, 'NULL') from payments where id = '0aaaaaaa-0000-0000-0000-000000000001'$$,
  'NULL');

select test.raises(
  'Sales tidak dapat memverifikasi pembayaran',
  $$update payments set status = 'terverifikasi' where id = '0aaaaaaa-0000-0000-0000-000000000001'$$,
  'Finance');

select test.raises(
  'Sales tidak dapat mengunggah kuitansi',
  $$update payments set proof_url = 'x/k.jpg' where id = '0aaaaaaa-0000-0000-0000-000000000001'$$,
  'Finance');

select test.raises(
  'Sales tidak dapat mengisi kolom verifikator',
  $$update payments set verified_by = '11111111-1111-1111-1111-111111111111'
      where id = '0aaaaaaa-0000-0000-0000-000000000001'$$,
  'Finance');

-- Nominal masih boleh dikoreksi selama belum tervalidasi.
select test.affects(
  'Sales boleh mengoreksi nominal selagi menunggu',
  $$update payments set amount = 5500000 where id = '0aaaaaaa-0000-0000-0000-000000000001'$$,
  1);

-- ---------- Sebelum handover ----------
select test.eq_query(
  'Konsumen belum terkunci sebelum kuitansi terbit',
  $$select coalesce(locked_at::text, 'NULL') from customers where id = '0f0f0f0f-0000-0000-0000-000000000001'$$,
  'NULL');

select test.affects(
  'Sales masih boleh mengubah konsumennya sebelum handover',
  $$update customers set phone = '0812000112' where id = '0f0f0f0f-0000-0000-0000-000000000001'$$,
  1);

-- ---------- Finance memverifikasi ----------
set test.uid = '33333333-3333-3333-3333-333333333333';

update payments
   set status = 'terverifikasi', proof_url = '0f0f0f0f-0000-0000-0000-000000000001/kuitansi.jpg'
 where id = '0aaaaaaa-0000-0000-0000-000000000001';

select test.eq_query(
  'Finance dapat memverifikasi pembayaran',
  $$select status::text from payments where id = '0aaaaaaa-0000-0000-0000-000000000001'$$,
  'terverifikasi');

select test.eq_query(
  'Verifikator terisi otomatis oleh trigger',
  $$select verified_by::text from payments where id = '0aaaaaaa-0000-0000-0000-000000000001'$$,
  '33333333-3333-3333-3333-333333333333');

-- ---------- Hard-Lock aktif ----------
select test.ok(
  'Konsumen terkunci setelah kuitansi Booking Fee tervalidasi',
  (select locked_at is not null from customers where id = '0f0f0f0f-0000-0000-0000-000000000001'),
  null);

select test.eq_query(
  'Tanggung jawab berpindah ke Admin Marketing',
  $$select handover_state from customers where id = '0f0f0f0f-0000-0000-0000-000000000001'$$,
  'admin_marketing');

select test.eq_query(
  'Pembayaran pemicu kunci tercatat',
  $$select locked_by_payment_id::text from customers where id = '0f0f0f0f-0000-0000-0000-000000000001'$$,
  '0aaaaaaa-0000-0000-0000-000000000001');

-- ---------- Sales setelah handover ----------
set test.uid = '11111111-1111-1111-1111-111111111111';

select test.affects(
  'Sales tidak dapat mengubah profil konsumen terkunci',
  $$update customers set name = 'Diubah Setelah Lock' where id = '0f0f0f0f-0000-0000-0000-000000000001'$$,
  0);

select test.raises(
  'Sales tidak dapat mengisi progres KPR konsumen terkunci',
  $$insert into customer_kpr (customer_id, nama_bank)
      values ('0f0f0f0f-0000-0000-0000-000000000001', 'Bank Diam-diam')$$);

select test.raises(
  'Sales tidak dapat mengunggah dokumen konsumen terkunci',
  $$insert into customer_documents (customer_id, doc_type, file_url)
      values ('0f0f0f0f-0000-0000-0000-000000000001', 'KTP', 'x.jpg')$$);

-- Pengecualian yang disepakati: hubungan dengan konsumen tidak berhenti di
-- booking, hanya pemberkasannya yang berpindah tangan.
insert into lead_activities (customer_id, activity, note, hasil)
values ('0f0f0f0f-0000-0000-0000-000000000001', 'WhatsApp',
        'Konsumen menanyakan jadwal akad dan rincian biaya BPHTB', 'Tertarik');

select test.eq_query(
  'Sales TETAP dapat menambah catatan follow-up setelah handover',
  $$select count(*)::text from lead_activities
      where customer_id = '0f0f0f0f-0000-0000-0000-000000000001'$$,
  '1');

select test.eq_query(
  'Aktor catatan terisi otomatis dari sesi',
  $$select actor_id::text from lead_activities
      where customer_id = '0f0f0f0f-0000-0000-0000-000000000001'$$,
  '11111111-1111-1111-1111-111111111111');

select test.raises(
  'Sales tidak dapat membuka kunci konsumen',
  $$select unlock_customer('0f0f0f0f-0000-0000-0000-000000000001', 'coba-coba')$$,
  'admin');

-- ---------- Admin Marketing mengambil alih ----------
set test.uid = '44444444-4444-4444-4444-444444444444';

insert into customer_kpr (customer_id, tanggal_booking, nama_bank)
values ('0f0f0f0f-0000-0000-0000-000000000001', current_date - 20, 'Bank BTN Tegal');

select test.eq_query(
  'Admin Marketing dapat mengisi progres KPR konsumen terkunci',
  $$select nama_bank from customer_kpr where customer_id = '0f0f0f0f-0000-0000-0000-000000000001'$$,
  'Bank BTN Tegal');

-- ---------- Audit ----------
set test.uid = '66666666-6666-6666-6666-666666666666';

select test.ok(
  'Penguncian tercatat di log aktivitas dengan diff kolom',
  (select count(*) > 0 from activity_logs
     where entity_type = 'customers' and action = 'update'
       and changes ? 'locked_at'),
  null);

select test.ok(
  'Verifikasi pembayaran tercatat di log aktivitas',
  (select count(*) > 0 from activity_logs
     where entity_type = 'payments' and action = 'update'
       and changes ? 'status'),
  null);

reset role;
