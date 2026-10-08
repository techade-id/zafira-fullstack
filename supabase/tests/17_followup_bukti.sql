-- ============================================================
-- Tanggal dan bukti follow-up — migration_024
--
-- Yang diuji: follow-up tidak bisa tersimpan tanpa bukti, tanggalnya tidak
-- bisa di masa depan, bukti tidak bisa meminjam berkas prospek lain, Survei
-- Lokasi mengisi Saringan Awal, dan catatan yang dicatat mundur tidak
-- menimpa keadaan yang lebih baru.
-- ============================================================

reset role;

insert into leads (id, name, phone, status, assigned_to) values
  ('24000000-0000-0000-0000-0000000000b1', 'Bukti Chat',   '0817000000001', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('24000000-0000-0000-0000-0000000000b2', 'Bukti Survei', '0817000000002', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('24000000-0000-0000-0000-0000000000b3', 'Bukti Mundur', '0817000000003', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('24000000-0000-0000-0000-0000000000b9', 'Bukti Milik B', '0817000000009', 'warm', '22222222-2222-2222-2222-222222222222');

-- Catatan tanpa tanggal yang dicatat mundur: tanggalnya ikut created_at.
insert into lead_activities (lead_id, actor_id, activity, note, created_at) values
  ('24000000-0000-0000-0000-0000000000b9', '22222222-2222-2222-2222-222222222222',
   'WhatsApp', 'Menanyakan lokasi', now() - interval '20 days');

set role authenticated;


-- ============================================================
select test.bagian('Tanggal & bukti follow-up');
-- ============================================================

set test.uid = '22222222-2222-2222-2222-222222222222';

select test.eq_query(
  'Catatan tanpa tanggal follow-up memakai tanggal created_at-nya',
  $$select (tanggal_followup = (now() at time zone 'Asia/Jakarta')::date - 20)::text
      from lead_activities where lead_id = '24000000-0000-0000-0000-0000000000b9'$$,
  'true');

-- Sales A, pemilik.
set test.uid = '11111111-1111-1111-1111-111111111111';

select test.raises(
  'Follow-up tanpa bukti ditolak',
  $$select catat_followup('24000000-0000-0000-0000-0000000000b1', (now() at time zone 'Asia/Jakarta')::date,
      'WhatsApp', 'Tertarik', 'Minta brosur', '[]'::jsonb, (now() at time zone 'Asia/Jakarta')::date + 3)$$,
  'Bukti follow-up wajib');

select test.raises(
  'Tanggal follow-up di masa depan ditolak',
  $$select catat_followup('24000000-0000-0000-0000-0000000000b1', (now() at time zone 'Asia/Jakarta')::date + 1,
      'WhatsApp', 'Tertarik', null, '[{"path":"24000000-0000-0000-0000-0000000000b1/followup/a.jpg"}]'::jsonb,
      (now() at time zone 'Asia/Jakarta')::date + 3)$$,
  'tidak boleh melewati hari ini');

select test.raises(
  'Bukti yang menunjuk berkas prospek lain ditolak',
  $$select catat_followup('24000000-0000-0000-0000-0000000000b1', (now() at time zone 'Asia/Jakarta')::date,
      'WhatsApp', 'Tertarik', null, '[{"path":"24000000-0000-0000-0000-0000000000b9/followup/curian.jpg"}]'::jsonb,
      (now() at time zone 'Asia/Jakarta')::date + 3)$$,
  'Bukti follow-up tidak valid');

select test.eq_query(
  'Penolakan tidak meninggalkan catatan setengah jadi',
  $$select count(*)::text from lead_activities where lead_id = '24000000-0000-0000-0000-0000000000b1'$$,
  '0');

select catat_followup('24000000-0000-0000-0000-0000000000b1', (now() at time zone 'Asia/Jakarta')::date - 3,
  'WhatsApp', 'Tertarik', 'Minta brosur tipe 36',
  '[{"path":"24000000-0000-0000-0000-0000000000b1/followup/chat.jpg","nama":"chat.jpg"}]'::jsonb,
  (now() at time zone 'Asia/Jakarta')::date + 2, 'Kirim simulasi', 'Telepon');

select test.eq_query(
  'Follow-up tersimpan dengan tanggal follow-up yang dipilih, terpisah dari waktu input',
  $$select ((tanggal_followup = (now() at time zone 'Asia/Jakarta')::date - 3)
            and (created_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date)::text
      from lead_activities where lead_id = '24000000-0000-0000-0000-0000000000b1'$$,
  'true');

select test.eq_query(
  'Bukti menempel pada catatan follow-up-nya',
  $$select b.slot || '|' || b.file_name
      from berkas_lampiran b join lead_activities a on a.id = b.activity_id
     where a.lead_id = '24000000-0000-0000-0000-0000000000b1'$$,
  'followup|chat.jpg');

select test.eq_query(
  'Jadwal berikutnya ikut tersimpan dalam transaksi yang sama',
  $$select (tanggal_rencana = (now() at time zone 'Asia/Jakarta')::date + 2)::text || '|' || rencana_selanjutnya
      from leads where id = '24000000-0000-0000-0000-0000000000b1'$$,
  'true|Kirim simulasi');

-- Survei Lokasi.
select catat_followup('24000000-0000-0000-0000-0000000000b2', (now() at time zone 'Asia/Jakarta')::date - 1,
  'Survei Lokasi', 'Survei Lokasi', 'Survei bersama istri, suka posisi hook',
  '[{"path":"24000000-0000-0000-0000-0000000000b2/survei/1.jpg","nama":"1.jpg"},
    {"path":"24000000-0000-0000-0000-0000000000b2/survei/2.jpg","nama":"2.jpg"}]'::jsonb,
  (now() at time zone 'Asia/Jakarta')::date + 2);

select test.eq_query(
  'Survei Lokasi mengisi tanggal survei Saringan Awal',
  $$select (tanggal_survei = (now() at time zone 'Asia/Jakarta')::date - 1)::text
      from leads where id = '24000000-0000-0000-0000-0000000000b2'$$,
  'true');

select test.eq_query(
  'Foto Survei Lokasi masuk lampiran survei Saringan Awal',
  $$select count(*)::text from berkas_lampiran
     where lead_id = '24000000-0000-0000-0000-0000000000b2' and slot = 'survei' and activity_id is not null$$,
  '2');

-- Catatan mundur tidak menimpa keadaan terbaru.
select catat_followup('24000000-0000-0000-0000-0000000000b3', (now() at time zone 'Asia/Jakarta')::date,
  'Telepon', 'Tertarik', 'Siap booking akhir bulan',
  '[{"path":"24000000-0000-0000-0000-0000000000b3/followup/log.jpg"}]'::jsonb,
  (now() at time zone 'Asia/Jakarta')::date + 2);
select catat_followup('24000000-0000-0000-0000-0000000000b3', (now() at time zone 'Asia/Jakarta')::date - 10,
  'WhatsApp', null, 'Dulu sempat bilang kurang minat',
  '[{"path":"24000000-0000-0000-0000-0000000000b3/followup/lama.jpg"}]'::jsonb,
  (now() at time zone 'Asia/Jakarta')::date + 2);

select test.eq_query(
  'Catatan yang dicatat mundur tidak menimpa status dari follow-up terbaru',
  $$select status::text from leads where id = '24000000-0000-0000-0000-0000000000b3'$$,
  'hot');

-- Admin Marketing: hanya melihat (migrasi 023).
set test.uid = '44444444-4444-4444-4444-444444444444';

select test.raises(
  'Admin Marketing tidak dapat mencatat follow-up prospek',
  $$select catat_followup('24000000-0000-0000-0000-0000000000b1', (now() at time zone 'Asia/Jakarta')::date,
      'WhatsApp', 'Tertarik', null, '[{"path":"24000000-0000-0000-0000-0000000000b1/followup/x.jpg"}]'::jsonb,
      (now() at time zone 'Asia/Jakarta')::date + 3)$$,
  'bukan milik Anda');

-- Sales B.
set test.uid = '22222222-2222-2222-2222-222222222222';

select test.raises(
  'Sales lain tidak dapat mencatat follow-up prospek yang bukan miliknya',
  $$select catat_followup('24000000-0000-0000-0000-0000000000b1', (now() at time zone 'Asia/Jakarta')::date,
      'WhatsApp', 'Tertarik', null, '[{"path":"24000000-0000-0000-0000-0000000000b1/followup/x.jpg"}]'::jsonb,
      (now() at time zone 'Asia/Jakarta')::date + 3)$$,
  'bukan milik Anda');

-- Admin menghapus catatan survei: fotonya tetap menjadi lampiran Saringan Awal.
set test.uid = '77777777-7777-7777-7777-777777777777';
delete from lead_activities where lead_id = '24000000-0000-0000-0000-0000000000b2';

select test.eq_query(
  'Menghapus catatan survei tidak ikut menghapus foto survei',
  $$select count(*)::text from berkas_lampiran
     where lead_id = '24000000-0000-0000-0000-0000000000b2' and slot = 'survei'$$,
  '2');

reset role;
