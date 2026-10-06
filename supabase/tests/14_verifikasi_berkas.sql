-- ============================================================
-- Verifikasi berkas — migration_021
--
-- Yang diuji adalah garis wewenangnya: Sales mengunggah, Admin dan Admin
-- Marketing memutuskan. Kebocoran di sini tidak kelihatan di layar mana pun
-- — sebuah berkas yang "terverifikasi" oleh pengunggahnya sendiri tampak sama
-- persis dengan yang benar-benar diperiksa.
-- ============================================================

reset role;

insert into leads (id, name, phone, status, assigned_to) values
  ('21000000-0000-0000-0000-0000000000b1', 'Verif Berkas', '0814000000001', 'booking', '11111111-1111-1111-1111-111111111111');
insert into customers (id, lead_id, name, phone, sales_agent_id, status) values
  ('21000000-0000-0000-0000-0000000000c1', '21000000-0000-0000-0000-0000000000b1', 'Verif Berkas', '0814000000001',
   '11111111-1111-1111-1111-111111111111', 'proses');

set role authenticated;


-- ============================================================
select test.bagian('Verifikasi berkas');
-- ============================================================

-- Sales A, pemilik konsumen yang belum terkunci.
set test.uid = '11111111-1111-1111-1111-111111111111';

insert into customer_documents (id, customer_id, doc_type, file_url, status)
values ('21000000-0000-0000-0000-0000000000d1', '21000000-0000-0000-0000-0000000000c1', 'KTP Pemohon', 'x/ktp.jpg', 'terverifikasi');

select test.eq_query(
  'Berkas yang diunggah Sales selalu masuk menunggu, meski dikirim sebagai terverifikasi',
  $$select status::text from customer_documents where id = '21000000-0000-0000-0000-0000000000d1'$$,
  'menunggu');

select test.raises(
  'Sales tidak dapat memverifikasi berkas konsumennya sendiri',
  $$update customer_documents set status = 'terverifikasi' where id = '21000000-0000-0000-0000-0000000000d1'$$,
  'Hanya Admin dan Admin Marketing');

-- Admin Marketing.
set test.uid = '44444444-4444-4444-4444-444444444444';

select test.raises(
  'Penolakan tanpa alasan ditolak',
  $$update customer_documents set status = 'ditolak' where id = '21000000-0000-0000-0000-0000000000d1'$$,
  'Alasan penolakan wajib diisi');

update customer_documents set status = 'ditolak', alasan_ditolak = 'Foto buram'
 where id = '21000000-0000-0000-0000-0000000000d1';

select test.eq_query(
  'Penolakan mencatat alasan dan siapa yang menolak',
  $$select status::text || '|' || alasan_ditolak || '|' || verified_by::text
      from customer_documents where id = '21000000-0000-0000-0000-0000000000d1'$$,
  'ditolak|Foto buram|44444444-4444-4444-4444-444444444444');

-- Admin.
set test.uid = '77777777-7777-7777-7777-777777777777';
update customer_documents set status = 'terverifikasi' where id = '21000000-0000-0000-0000-0000000000d1';

select test.eq_query(
  'Admin dapat memverifikasi; alasan penolakan lama terhapus',
  $$select status::text || '|' || coalesce(alasan_ditolak, '<kosong>') || '|' || verified_by::text || '|' || (verified_at is not null)::text
      from customer_documents where id = '21000000-0000-0000-0000-0000000000d1'$$,
  'terverifikasi|<kosong>|77777777-7777-7777-7777-777777777777|true');

reset role;
