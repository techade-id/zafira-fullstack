-- ============================================================
-- Mengubah catatan follow-up dengan persetujuan Admin — migration_025
--
-- Yang diuji: penulis tidak lagi bisa mengubah catatannya langsung, hanya
-- penulis yang bisa mengajukan, hanya Admin Sistem yang memutuskan, usulan
-- baru berlaku setelah disetujui, dan perubahan jenis ke Survei Lokasi ikut
-- menggerakkan Saringan Awal.
-- ============================================================

reset role;

insert into leads (id, name, phone, status, assigned_to) values
  ('25000000-0000-0000-0000-0000000000b1', 'Ubah Catatan', '0818000000001', 'warm', '11111111-1111-1111-1111-111111111111');

set role authenticated;


-- ============================================================
select test.bagian('Ubah catatan dengan persetujuan');
-- ============================================================

-- Sales A menulis follow-up.
set test.uid = '11111111-1111-1111-1111-111111111111';

select catat_followup('25000000-0000-0000-0000-0000000000b1', (now() at time zone 'Asia/Jakarta')::date - 2,
  'WhatsApp', 'Tertarik', 'Minta brosur',
  '[{"path":"25000000-0000-0000-0000-0000000000b1/followup/chat.jpg","nama":"chat.jpg"}]'::jsonb,
  (now() at time zone 'Asia/Jakarta')::date + 3);

select test.affects(
  'Penulis tidak lagi dapat mengubah catatannya langsung',
  $$update lead_activities set note = 'Diubah diam-diam' where lead_id = '25000000-0000-0000-0000-0000000000b1'$$,
  0);

select test.raises(
  'Pengajuan tanpa alasan ditolak',
  $$select ajukan_ubah_catatan((select id from lead_activities where lead_id = '25000000-0000-0000-0000-0000000000b1'),
      'WhatsApp', (now() at time zone 'Asia/Jakarta')::date - 2, 'Tertarik', 'Minta brosur tipe 45', '  ')$$,
  'Alasan perubahan wajib');

select test.raises(
  'Pengajuan yang tidak mengubah apa pun ditolak',
  $$select ajukan_ubah_catatan((select id from lead_activities where lead_id = '25000000-0000-0000-0000-0000000000b1'),
      'WhatsApp', (now() at time zone 'Asia/Jakarta')::date - 2, 'Tertarik', 'Minta brosur', 'iseng')$$,
  'Tidak ada yang diubah');

select ajukan_ubah_catatan((select id from lead_activities where lead_id = '25000000-0000-0000-0000-0000000000b1'),
  'WhatsApp', (now() at time zone 'Asia/Jakarta')::date - 2, 'Tertarik', 'Minta brosur tipe 45', 'Salah tulis tipe');

select test.eq_query(
  'Usulan belum berlaku sebelum disetujui',
  $$select note from lead_activities where lead_id = '25000000-0000-0000-0000-0000000000b1'$$,
  'Minta brosur');

select test.raises(
  'Satu catatan hanya boleh punya satu pengajuan menunggu',
  $$select ajukan_ubah_catatan((select id from lead_activities where lead_id = '25000000-0000-0000-0000-0000000000b1'),
      'WhatsApp', (now() at time zone 'Asia/Jakarta')::date - 2, 'Tertarik', 'Minta brosur tipe 36', 'Ralat lagi')$$,
  'masih punya pengajuan');

select test.raises(
  'Pengaju tidak dapat menyetujui pengajuannya sendiri',
  $$select putuskan_ubah_catatan((select id from lead_activity_edits where lead_id = '25000000-0000-0000-0000-0000000000b1'), true)$$,
  'Hanya Admin Sistem');

-- Sales B dan Admin Marketing.
set test.uid = '22222222-2222-2222-2222-222222222222';
select test.raises(
  'Selain penulisnya tidak dapat mengajukan perubahan',
  $$select ajukan_ubah_catatan((select id from lead_activities where lead_id = '25000000-0000-0000-0000-0000000000b1' limit 1),
      'WhatsApp', (now() at time zone 'Asia/Jakarta')::date - 2, 'Tertarik', 'Ubahan orang lain', 'coba')$$);

set test.uid = '44444444-4444-4444-4444-444444444444';
select test.raises(
  'Admin Marketing tidak dapat memutuskan pengajuan',
  $$select putuskan_ubah_catatan((select id from lead_activity_edits where lead_id = '25000000-0000-0000-0000-0000000000b1'), true)$$,
  'Hanya Admin Sistem');

-- Admin Sistem.
set test.uid = '77777777-7777-7777-7777-777777777777';

select test.ok(
  'Pengajuan yang menunggu muncul di lonceng Admin',
  (my_notifications()->'per_kategori')::text like '%persetujuan%');

select test.raises(
  'Penolakan tanpa alasan ditolak',
  $$select putuskan_ubah_catatan((select id from lead_activity_edits where lead_id = '25000000-0000-0000-0000-0000000000b1'), false)$$,
  'Alasan penolakan wajib');

select putuskan_ubah_catatan((select id from lead_activity_edits where lead_id = '25000000-0000-0000-0000-0000000000b1'),
  false, 'Brosur yang dikirim memang tipe 36');

select test.eq_query(
  'Penolakan mencatat alasan dan tidak mengubah catatan',
  $$select e.status || '|' || e.alasan_tolak || '|' || a.note
      from lead_activity_edits e join lead_activities a on a.id = e.activity_id
     where e.lead_id = '25000000-0000-0000-0000-0000000000b1'$$,
  'ditolak|Brosur yang dikirim memang tipe 36|Minta brosur');

-- Sales A tahu pengajuannya ditolak, lalu mengajukan ulang sebagai survei.
set test.uid = '11111111-1111-1111-1111-111111111111';

select test.ok(
  'Pengaju melihat penolakan di loncengnya',
  (my_notifications()->'per_kategori')::text like '%catatan_ditolak%');

select ajukan_ubah_catatan((select id from lead_activities where lead_id = '25000000-0000-0000-0000-0000000000b1'),
  'Survei Lokasi', (now() at time zone 'Asia/Jakarta')::date - 1, 'Survei Lokasi', 'Survei bersama istri',
  'Ternyata survei, bukan chat',
  '[{"path":"25000000-0000-0000-0000-0000000000b1/followup/survei.jpg","nama":"survei.jpg"}]'::jsonb);

select test.eq_query(
  'Bukti tambahan belum menjadi bukti catatan sebelum disetujui',
  $$select count(*)::text from berkas_lampiran
     where lead_id = '25000000-0000-0000-0000-0000000000b1' and activity_id is not null$$,
  '1');

set test.uid = '77777777-7777-7777-7777-777777777777';
select putuskan_ubah_catatan((select id from lead_activity_edits
                               where lead_id = '25000000-0000-0000-0000-0000000000b1' and status = 'menunggu'), true);

select test.eq_query(
  'Persetujuan menerapkan jenis, tanggal, hasil, dan catatan baru',
  $$select activity || '|' || (tanggal_followup = (now() at time zone 'Asia/Jakarta')::date - 1)::text || '|' || hasil || '|' || note
      from lead_activities where lead_id = '25000000-0000-0000-0000-0000000000b1'$$,
  'Survei Lokasi|true|Survei Lokasi|Survei bersama istri');

select test.eq_query(
  'Bukti lama dan tambahan pindah ke lampiran survei Saringan Awal',
  $$select count(*)::text from berkas_lampiran
     where lead_id = '25000000-0000-0000-0000-0000000000b1' and slot = 'survei' and activity_id is not null$$,
  '2');

select test.eq_query(
  'Tanggal survei Saringan Awal ikut terisi',
  $$select (tanggal_survei = (now() at time zone 'Asia/Jakarta')::date - 1)::text
      from leads where id = '25000000-0000-0000-0000-0000000000b1'$$,
  'true');

select test.eq_query(
  'Status prospek dihitung ulang dari catatan yang sudah diubah',
  $$select status::text from leads where id = '25000000-0000-0000-0000-0000000000b1'$$,
  'hot');

-- Admin mengubah catatannya sendiri: langsung berlaku, tetap berjejak.
insert into lead_activities (lead_id, activity, hasil, note)
values ('25000000-0000-0000-0000-0000000000b1', 'Telepon', 'Tertarik', 'Catatan admin');

select ajukan_ubah_catatan((select id from lead_activities where note = 'Catatan admin'),
  'Telepon', (now() at time zone 'Asia/Jakarta')::date, 'Tertarik', 'Catatan admin, diralat', 'Ralat ketik');

select test.eq_query(
  'Perubahan oleh Admin Sistem langsung berlaku dan tercatat disetujui',
  $$select a.note || '|' || e.status
      from lead_activities a join lead_activity_edits e on e.activity_id = a.id
     where a.note like 'Catatan admin%'$$,
  'Catatan admin, diralat|disetujui');

-- Catatan sistem tidak dapat diubah.
reset role;
insert into lead_activities (lead_id, actor_id, activity, note)
values ('25000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 'Prospek dialihkan', 'Dari A ke B');
set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';

select test.raises(
  'Catatan sistem tidak dapat diajukan perubahannya',
  $$select ajukan_ubah_catatan((select id from lead_activities where activity = 'Prospek dialihkan'
                                 and lead_id = '25000000-0000-0000-0000-0000000000b1'),
      'WhatsApp', (now() at time zone 'Asia/Jakarta')::date, null, 'x', 'coba')$$,
  'tidak dapat diubah');

reset role;
