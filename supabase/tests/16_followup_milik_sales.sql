-- ============================================================
-- Follow-up prospek milik Sales — migration_023
--
-- Yang diuji adalah garis yang memisahkan dua pekerjaan: Sales
-- menindaklanjuti prospek, Admin Marketing dan Finance memegang konsumen.
-- Catatan follow-up yang ditulis orang yang salah tidak terlihat salah di
-- layar — ia tampak seperti riwayat biasa, dan diam-diam ikut menggerakkan
-- status prospek.
-- ============================================================

reset role;

insert into leads (id, name, phone, status, assigned_to) values
  ('23000000-0000-0000-0000-0000000000b1', 'FU Milik A', '0816000000001', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('23000000-0000-0000-0000-0000000000b2', 'FU Dipegang Admin Mkt', '0816000000002', 'warm', '44444444-4444-4444-4444-444444444444');
insert into customers (id, lead_id, name, phone, sales_agent_id, status) values
  ('23000000-0000-0000-0000-0000000000c1', null, 'FU Konsumen', '0816000000009',
   '11111111-1111-1111-1111-111111111111', 'proses');

set role authenticated;


-- ============================================================
select test.bagian('Follow-up prospek milik Sales');
-- ============================================================

-- Admin Marketing: hanya melihat prospek.
set test.uid = '44444444-4444-4444-4444-444444444444';

select test.raises(
  'Admin Marketing tidak dapat mencatat follow-up pada prospek',
  $$insert into lead_activities (lead_id, activity, note)
      values ('23000000-0000-0000-0000-0000000000b1', 'WhatsApp', 'Coba dari admin')$$);

select test.raises(
  'Admin Marketing tetap tidak dapat mencatat meski prospeknya dialihkan kepadanya',
  $$insert into lead_activities (lead_id, activity, note)
      values ('23000000-0000-0000-0000-0000000000b2', 'WhatsApp', 'Coba dari admin')$$);

insert into lead_activities (customer_id, activity, note)
values ('23000000-0000-0000-0000-0000000000c1', 'Telepon', 'Mengingatkan berkas slip gaji');

select test.eq_query(
  'Admin Marketing TETAP dapat mencatat komunikasi dengan konsumen',
  $$select count(*)::text from lead_activities
      where customer_id = '23000000-0000-0000-0000-0000000000c1'
        and actor_id = '44444444-4444-4444-4444-444444444444'$$,
  '1');

-- Finance.
set test.uid = '33333333-3333-3333-3333-333333333333';

select test.raises(
  'Finance tidak dapat mencatat follow-up pada prospek',
  $$insert into lead_activities (lead_id, activity, note)
      values ('23000000-0000-0000-0000-0000000000b1', 'WhatsApp', 'Coba dari finance')$$);

-- Sales B, bukan pemilik.
set test.uid = '22222222-2222-2222-2222-222222222222';

select test.raises(
  'Sales lain tidak dapat mencatat follow-up pada prospek yang bukan miliknya',
  $$insert into lead_activities (lead_id, activity, note)
      values ('23000000-0000-0000-0000-0000000000b1', 'WhatsApp', 'Menyerobot')$$);

-- Sales A, pemilik.
set test.uid = '11111111-1111-1111-1111-111111111111';

insert into lead_activities (lead_id, activity, hasil, note)
values ('23000000-0000-0000-0000-0000000000b1', 'WhatsApp', 'Tertarik', 'Minta brosur tipe 36');

select test.eq_query(
  'Sales pemilik dapat mencatat follow-up prospeknya',
  $$select count(*)::text from lead_activities
      where lead_id = '23000000-0000-0000-0000-0000000000b1'$$,
  '1');

-- Admin Sistem.
set test.uid = '77777777-7777-7777-7777-777777777777';

insert into lead_activities (lead_id, activity, note)
values ('23000000-0000-0000-0000-0000000000b2', 'Telepon', 'Diambil alih admin');

select test.eq_query(
  'Admin Sistem tetap dapat mencatat follow-up prospek mana pun',
  $$select count(*)::text from lead_activities
      where lead_id = '23000000-0000-0000-0000-0000000000b2'$$,
  '1');

reset role;
