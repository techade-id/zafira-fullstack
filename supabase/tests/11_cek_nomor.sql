-- ============================================================
-- Nomor ganda — migration_018
--
-- Yang diuji: nomor dicocokkan setelah dirapikan, pengecekan menjangkau
-- prospek agen lain, dan isi prospek agen lain tetap tertutup bagi Sales.
-- Kebocoran di sini tidak kelihatan di layar mana pun — fungsinya security
-- definer, jadi RLS tidak ikut menjaga.
-- ============================================================

reset role;

insert into leads (id, name, phone, status, assigned_to) values
  ('18000000-0000-0000-0000-0000000000b1', 'Milik Sales B', '0812-7777-0001', 'warm', '22222222-2222-2222-2222-222222222222'),
  ('18000000-0000-0000-0000-0000000000b2', 'Milik Sales A', '+62 812 7777 0002', 'warm', '11111111-1111-1111-1111-111111111111');

set role authenticated;


-- ============================================================
select test.bagian('Nomor ganda');
-- ============================================================

select test.eq('Nomor dirapikan: +62, spasi, dan tanda hubung menjadi 0…',
  nomor_normal('+62 812-7777 0001'), '081277770001');

select test.eq('Nomor tanpa awalan 0 tetap cocok', nomor_normal('81277770001'), '081277770001');

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.eq_query(
  'Sales A diperingatkan tentang nomor yang dipegang Sales B',
  $$select agen from cek_nomor_prospek('6281277770001')$$,
  'Sales B');

select test.eq_query(
  'Sales A tidak melihat nama prospek milik Sales B',
  $$select coalesce(nama, '<tertutup>') || '|' || coalesce(lead_id::text, '<tertutup>') from cek_nomor_prospek('081277770001')$$,
  '<tertutup>|<tertutup>');

select test.eq_query(
  'Prospek milik sendiri dibuka lengkap dan ditandai milik_saya',
  $$select nama || '|' || milik_saya::text from cek_nomor_prospek('0812-7777-0002')$$,
  'Milik Sales A|true');

select test.eq_query(
  'Prospek yang sedang diubah tidak memperingatkan dirinya sendiri',
  $$select count(*)::text from cek_nomor_prospek('081277770002', '18000000-0000-0000-0000-0000000000b2')$$,
  '0');

select test.eq_query(
  'Nomor yang baru setengah diketik tidak dicocokkan',
  $$select count(*)::text from cek_nomor_prospek('0812')$$,
  '0');

set test.uid = '44444444-4444-4444-4444-444444444444';

select test.eq_query(
  'Admin Marketing (lihat semua) melihat nama prospek agen lain',
  $$select nama from cek_nomor_prospek('081277770001')$$,
  'Milik Sales B');

set test.uid = '';

select test.eq_query(
  'Tanpa sesi login tidak ada jawaban sama sekali',
  $$select count(*)::text from cek_nomor_prospek('081277770001')$$,
  '0');

reset role;
