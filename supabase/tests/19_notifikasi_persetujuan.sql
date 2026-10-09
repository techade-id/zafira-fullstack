-- ============================================================
-- Lonceng untuk pengajuan perubahan catatan — migration_026
--
-- Yang diuji adalah bug yang membuat pengajuan tidak pernah terlihat:
-- lonceng memotong daftarnya pada 30 baris tertua, sehingga kategori yang
-- barisnya baru tersingkir oleh puluhan follow-up terlewat. Kini setiap
-- kategori paling banyak lima baris, dan pengajuan selalu paling atas.
-- ============================================================

reset role;

-- Dua belas follow-up terlewat: lebih dari cukup untuk menenggelamkan
-- pengajuan di bawah aturan lama.
insert into leads (id, name, phone, status, assigned_to, tanggal_rencana)
select ('26000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid,
       'Terlewat ' || g, '08190000' || lpad(g::text, 4, '0'), 'warm',
       '11111111-1111-1111-1111-111111111111', current_date - 30 - g
  from generate_series(1, 12) g;

insert into leads (id, name, phone, status, assigned_to) values
  ('26000000-0000-0000-0000-0000000000b1', 'Notif Pengajuan', '0819100000001', 'warm', '11111111-1111-1111-1111-111111111111');

set role authenticated;


-- ============================================================
select test.bagian('Lonceng pengajuan catatan');
-- ============================================================

set test.uid = '11111111-1111-1111-1111-111111111111';

select catat_followup('26000000-0000-0000-0000-0000000000b1', (now() at time zone 'Asia/Jakarta')::date,
  'WhatsApp', 'Tertarik', 'Catatan satu',
  '[{"path":"26000000-0000-0000-0000-0000000000b1/followup/a.jpg"}]'::jsonb,
  (now() at time zone 'Asia/Jakarta')::date + 3);
select catat_followup('26000000-0000-0000-0000-0000000000b1', (now() at time zone 'Asia/Jakarta')::date,
  'Telepon', 'Tertarik', 'Catatan dua',
  '[{"path":"26000000-0000-0000-0000-0000000000b1/followup/b.jpg"}]'::jsonb,
  (now() at time zone 'Asia/Jakarta')::date + 3);

select ajukan_ubah_catatan((select id from lead_activities where note = 'Catatan satu'),
  'WhatsApp', (now() at time zone 'Asia/Jakarta')::date, 'Tertarik', 'Catatan satu, diralat', 'Salah ketik');
select ajukan_ubah_catatan((select id from lead_activities where note = 'Catatan dua'),
  'Telepon', (now() at time zone 'Asia/Jakarta')::date, 'Tertarik', 'Catatan dua, diralat', 'Salah ketik');

-- Admin Sistem.
set test.uid = '77777777-7777-7777-7777-777777777777';

select test.eq_query(
  'Pengajuan yang menunggu berada paling atas di lonceng Admin',
  $$select my_notifications()->'items'->0->>'kategori'$$,
  'persetujuan');

select test.ok(
  'Setiap kategori paling banyak lima baris di daftar lonceng',
  (select max(n) <= 5 from (
     select count(*) n from json_array_elements(my_notifications()->'items') i
      group by i->>'kategori') t));

select test.ok(
  'Jumlah sebenarnya tetap utuh di per_kategori',
  (select (k->>'jumlah')::int >= 12
     from json_array_elements(my_notifications()->'per_kategori') k
    where k->>'kategori' = 'followup'));

select putuskan_ubah_catatan((select e.id from lead_activity_edits e join lead_activities a on a.id = e.activity_id
                               where a.note = 'Catatan satu'), true);
select putuskan_ubah_catatan((select e.id from lead_activity_edits e join lead_activities a on a.id = e.activity_id
                               where a.note = 'Catatan dua'), false, 'Isinya sudah benar');

-- Sales A, pengaju.
set test.uid = '11111111-1111-1111-1111-111111111111';

select test.ok(
  'Pengaju diberi tahu pengajuannya disetujui',
  exists (select 1 from json_array_elements(my_notifications()->'items') i
           where i->>'kategori' = 'catatan_disetujui'));

select test.eq_query(
  'Notifikasi penolakan menuju alamat yang benar (tanpa ?sorot ganda)',
  $$select i->>'rute' from json_array_elements(my_notifications()->'items') i
     where i->>'kategori' = 'catatan_ditolak' limit 1$$,
  '/follow-up');

reset role;
