-- ============================================================
-- Koreksi data konsumen ke prospek asal — migration_020
--
-- Yang mengoreksi biasanya Admin Marketing, yang oleh RLS tidak boleh
-- mengubah leads sama sekali. Uji ini memastikan koreksinya tetap sampai,
-- dan hanya kolom yang memang dikoreksi yang ikut berpindah.
-- ============================================================

reset role;

insert into leads (id, name, phone, status, assigned_to) values
  ('20000000-0000-0000-0000-0000000000b1', 'Rina Kartka', '0813-0015-0001', 'booking', '22222222-2222-2222-2222-222222222222');
insert into customers (id, lead_id, name, phone, sales_agent_id, status) values
  ('20000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000b1', 'Rina Kartka', '0813-0015-0001',
   '22222222-2222-2222-2222-222222222222', 'proses');

set role authenticated;


-- ============================================================
select test.bagian('Koreksi ke prospek asal');
-- ============================================================

-- Admin Marketing mengoreksi salah ketik nama.
set test.uid = '44444444-4444-4444-4444-444444444444';
update customers set name = 'Rina Kartika' where id = '20000000-0000-0000-0000-0000000000c1';

reset role;
select test.eq_query(
  'Koreksi nama oleh Admin Marketing sampai ke prospek asal, meski ia tidak boleh mengubah leads',
  $$select name || '|' || phone from leads where id = '20000000-0000-0000-0000-0000000000b1'$$,
  'Rina Kartika|0813-0015-0001');

set role authenticated;
set test.uid = '44444444-4444-4444-4444-444444444444';
update customers set phone = '081300159999' where id = '20000000-0000-0000-0000-0000000000c1';
update customers set email = 'rina@mail.com' where id = '20000000-0000-0000-0000-0000000000c1';

reset role;
select test.eq_query(
  'Telepon baru ikut; kolom lain (email) tidak menyentuh prospek',
  $$select name || '|' || phone from leads where id = '20000000-0000-0000-0000-0000000000b1'$$,
  'Rina Kartika|081300159999');

select test.eq_query(
  'Status prospek tidak ikut berubah oleh koreksi data diri',
  $$select status::text from leads where id = '20000000-0000-0000-0000-0000000000b1'$$,
  'booking');
