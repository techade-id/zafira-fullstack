-- ============================================================
-- Beban kerja agen — migration_019
--
-- Hitungannya menembus RLS (security definer), jadi yang diuji: hanya
-- prospek aktif yang dihitung, Sales bisa melihat beban agen lain, dan tanpa
-- sesi login tidak ada jawaban.
-- ============================================================

reset role;

-- Beban Sales B sebelum fixture berkas ini, supaya ujinya tidak bergantung
-- pada prospek yang dibuat berkas uji sebelumnya.
set test.uid = '11111111-1111-1111-1111-111111111111';
select set_config('test.beban_awal',
  coalesce((select aktif from beban_agen() where agen_id = '22222222-2222-2222-2222-222222222222'), 0)::text,
  false);

-- Empat prospek Sales B: dua aktif, satu batal, satu sudah booking.
insert into leads (id, name, phone, status, assigned_to) values
  ('19000000-0000-0000-0000-0000000000b1', 'Beban Aktif 1', '0813000000001', 'warm',    '22222222-2222-2222-2222-222222222222'),
  ('19000000-0000-0000-0000-0000000000b2', 'Beban Aktif 2', '0813000000002', 'hot',     '22222222-2222-2222-2222-222222222222'),
  ('19000000-0000-0000-0000-0000000000b3', 'Beban Batal',   '0813000000003', 'cancel',  '22222222-2222-2222-2222-222222222222'),
  ('19000000-0000-0000-0000-0000000000b4', 'Beban Booking', '0813000000004', 'booking', '22222222-2222-2222-2222-222222222222');

set role authenticated;


-- ============================================================
select test.bagian('Beban kerja agen');
-- ============================================================

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.eq_query(
  'Sales A melihat beban Sales B — hanya dua prospek aktif yang bertambah',
  $$select ((select aktif from beban_agen() where agen_id = '22222222-2222-2222-2222-222222222222')
            - current_setting('test.beban_awal')::int)::text$$,
  '2');

select test.eq_query(
  'Yang keluar hanya angka: Sales A tetap tidak bisa membaca prospek Sales B',
  $$select count(*)::text from leads where id = '19000000-0000-0000-0000-0000000000b1'$$,
  '0');

set test.uid = '';

select test.eq_query(
  'Tanpa sesi login tidak ada jawaban sama sekali',
  $$select count(*)::text from beban_agen()$$,
  '0');

reset role;
