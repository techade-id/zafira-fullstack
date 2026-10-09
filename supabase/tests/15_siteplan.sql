-- ============================================================
-- Siteplan — migration_022
--
-- Yang diuji adalah aturan yang tidak terlihat di peta: siapa yang boleh
-- menggambar, bahwa hold benar-benar mengikat booking, bahwa hold terlepas
-- sendiri, dan bahwa halaman publik tidak membocorkan siapa pembelinya.
-- ============================================================

reset role;

insert into projects (id, name) values
  ('22000000-0000-0000-0000-0000000000a1', 'Proyek Uji Siteplan'),
  ('22000000-0000-0000-0000-0000000000a2', 'Proyek Lain');

-- K-00 sudah ada sebelum siteplannya digambar, seperti unit hasil impor lama.
insert into units (id, project_id, unit_code, status) values
  ('22000000-0000-0000-0000-0000000000e0', '22000000-0000-0000-0000-0000000000a1', 'K-00', 'tersedia'),
  ('22000000-0000-0000-0000-0000000000e9', '22000000-0000-0000-0000-0000000000a2', 'Z-01', 'tersedia');

insert into leads (id, name, phone, status, assigned_to) values
  ('22000000-0000-0000-0000-0000000000b1', 'Uji Satu',  '0815000000001', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('22000000-0000-0000-0000-0000000000b2', 'Uji Dua',   '0815000000002', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('22000000-0000-0000-0000-0000000000b3', 'Uji Tiga',  '0815000000003', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('22000000-0000-0000-0000-0000000000b4', 'Uji Empat', '0815000000004', 'warm', '11111111-1111-1111-1111-111111111111'),
  ('22000000-0000-0000-0000-0000000000b9', 'Uji Milik B', '0815000000009', 'warm', '22222222-2222-2222-2222-222222222222');

-- Supabase memberi anon akses skema; di Postgres polos harus diberikan sendiri.
-- Fungsi assert juga, karena bagian halaman publik berjalan sebagai anon.
grant usage on schema public, test to anon;
grant execute on all functions in schema test to anon;

set role authenticated;


-- ============================================================
select test.bagian('Siteplan & editor');
-- ============================================================

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.raises(
  'Sales tidak dapat membuat siteplan',
  $$insert into siteplans (project_id, nama) values ('22000000-0000-0000-0000-0000000000a1', 'Tahap Sales')$$,
  'row-level security');

-- Admin Marketing
set test.uid = '44444444-4444-4444-4444-444444444444';

insert into siteplans (id, project_id, nama, lebar, tinggi) values
  ('22000000-0000-0000-0000-0000000000c1', '22000000-0000-0000-0000-0000000000a1', 'Tahap 1', 400, 300),
  ('22000000-0000-0000-0000-0000000000c2', '22000000-0000-0000-0000-0000000000a2', 'Tahap 1', 400, 300);

select test.eq_query(
  'Editor membuat kavling baru dan menyambungkan unit lama lewat kodenya',
  $$select (r->>'dibuat') || '/' || (r->>'disambung') from (select simpan_kavling(
      '22000000-0000-0000-0000-0000000000c1',
      '[{"unit_code":"K-01","block":"K","type":"36/72","price":"200000000","posisi":"hook","bentuk":"0,0 10,0 10,10 0,10"},
        {"unit_code":"K-02","block":"K","bentuk":"10,0 20,0 20,10 10,10"},
        {"unit_code":"K-03","block":"K","bentuk":"20,0 30,0 30,10 20,10"},
        {"unit_code":"k-00","price":"185000000","bentuk":"30,0 40,0 40,10 30,10"}]'::jsonb) r) t$$,
  '3/1');

select test.eq_query(
  'Unit lama yang disambung tetap memakai kodenya sendiri',
  $$select unit_code || '|' || siteplan_id::text from units where id = '22000000-0000-0000-0000-0000000000e0'$$,
  'K-00|22000000-0000-0000-0000-0000000000c1');

select test.raises(
  'Kode ganda dalam satu kiriman ditolak',
  $$select simpan_kavling('22000000-0000-0000-0000-0000000000c1',
      '[{"unit_code":"K-09","bentuk":"0,20 10,20 10,30"},{"unit_code":"k-09","bentuk":"0,40 10,40 10,50"}]'::jsonb)$$,
  'lebih dari sekali');

select test.raises(
  'Kavling yang sudah digambar tidak bisa digambar dua kali',
  $$select simpan_kavling('22000000-0000-0000-0000-0000000000c1',
      '[{"unit_code":"K-01","bentuk":"0,20 10,20 10,30"}]'::jsonb)$$,
  'sudah digambar');

select test.raises(
  'Mengganti kode menjadi kode kavling lain ditolak',
  $$select simpan_kavling('22000000-0000-0000-0000-0000000000c1', jsonb_build_array(jsonb_build_object(
      'id', (select id from units where unit_code = 'K-02' and project_id = '22000000-0000-0000-0000-0000000000a1'),
      'unit_code', 'K-03')))$$,
  'sudah dipakai');

select test.raises(
  'Bentuk yang bukan poligon ditolak',
  $$select simpan_kavling('22000000-0000-0000-0000-0000000000c1', '[{"unit_code":"K-05","bentuk":"0,0 10,0"}]'::jsonb)$$,
  'units_bentuk_check');

select simpan_kavling('22000000-0000-0000-0000-0000000000c1', jsonb_build_array(jsonb_build_object(
  'id', (select id from units where unit_code = 'K-01' and project_id = '22000000-0000-0000-0000-0000000000a1'),
  'bentuk', '1,0 11,0 11,10 1,10')));

select test.eq_query(
  'Menggeser kavling hanya mengubah bentuknya — atribut lain utuh',
  $$select bentuk || '|' || type || '|' || posisi from units where unit_code = 'K-01' and project_id = '22000000-0000-0000-0000-0000000000a1'$$,
  '1,0 11,0 11,10 1,10|36/72|hook');

select test.raises(
  'Kavling tidak bisa ditempatkan di siteplan proyek lain',
  $$update units set siteplan_id = '22000000-0000-0000-0000-0000000000c1' where id = '22000000-0000-0000-0000-0000000000e9'$$,
  'proyek yang berbeda');

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.raises(
  'Sales tidak dapat menyimpan kavling',
  $$select simpan_kavling('22000000-0000-0000-0000-0000000000c1', '[{"unit_code":"K-07","bentuk":"0,0 1,0 1,1"}]'::jsonb)$$,
  'tidak berhak');


-- ============================================================
select test.bagian('Hold kavling');
-- ============================================================

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.eq_query(
  'Sales menahan kavling untuk prospeknya',
  $$select (tahan_kavling((select id from units where unit_code = 'K-01' and project_id = '22000000-0000-0000-0000-0000000000a1'),
                          '22000000-0000-0000-0000-0000000000b1') is not null)::text$$,
  'true');

select test.eq_query(
  'Lama hold mengikuti pengaturan bisnis (bawaan 24 jam)',
  $$select round(extract(epoch from berakhir - mulai) / 3600)::text from unit_holds
     where lead_id = '22000000-0000-0000-0000-0000000000b1' and dilepas_at is null$$,
  '24');

select test.raises(
  'Prospek yang sama tidak bisa menahan dua kavling',
  $$select tahan_kavling((select id from units where unit_code = 'K-02' and project_id = '22000000-0000-0000-0000-0000000000a1'),
                         '22000000-0000-0000-0000-0000000000b1')$$,
  'sudah menahan kavling K-01');

set test.uid = '22222222-2222-2222-2222-222222222222';

select test.raises(
  'Kavling yang ditahan tidak bisa ditahan sales lain',
  $$select tahan_kavling((select id from units where unit_code = 'K-01' and project_id = '22000000-0000-0000-0000-0000000000a1'),
                         '22000000-0000-0000-0000-0000000000b9')$$,
  'sedang ditahan');

select test.raises(
  'Sales tidak bisa menahan atas nama prospek agen lain',
  $$select tahan_kavling((select id from units where unit_code = 'K-02' and project_id = '22000000-0000-0000-0000-0000000000a1'),
                         '22000000-0000-0000-0000-0000000000b2')$$,
  'bukan milik Anda');

set test.uid = '55555555-5555-5555-5555-555555555555';

select test.raises(
  'Supervisor (read-only) tidak dapat menahan kavling',
  $$select tahan_kavling((select id from units where unit_code = 'K-02' and project_id = '22000000-0000-0000-0000-0000000000a1'),
                         '22000000-0000-0000-0000-0000000000b2')$$,
  'tidak berhak');

reset role;
update app_settings set value = '1' where key = 'hold_maks_per_sales';
set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';

select test.raises(
  'Batas hold aktif per orang ditegakkan',
  $$select tahan_kavling((select id from units where unit_code = 'K-02' and project_id = '22000000-0000-0000-0000-0000000000a1'),
                         '22000000-0000-0000-0000-0000000000b2')$$,
  'Batas 1 hold');

reset role;
update app_settings set value = '3' where key = 'hold_maks_per_sales';
set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';

select tahan_kavling((select id from units where unit_code = 'K-02' and project_id = '22000000-0000-0000-0000-0000000000a1'),
                     '22000000-0000-0000-0000-0000000000b2');

select test.raises(
  'Penahan tidak bisa memperpanjang holdnya sendiri',
  $$select perpanjang_hold((select id from unit_holds where lead_id = '22000000-0000-0000-0000-0000000000b1' and dilepas_at is null))$$,
  'hanya oleh Admin');

set test.uid = '22222222-2222-2222-2222-222222222222';

select test.raises(
  'Sales lain tidak bisa melepas hold yang bukan miliknya',
  $$select lepas_hold((select id from unit_holds where lead_id = '22000000-0000-0000-0000-0000000000b1' and dilepas_at is null))$$,
  'Hanya penahan');

set test.uid = '44444444-4444-4444-4444-444444444444';
select perpanjang_hold((select id from unit_holds where lead_id = '22000000-0000-0000-0000-0000000000b1' and dilepas_at is null));

select test.eq_query(
  'Admin Marketing memperpanjang hold satu periode lagi',
  $$select diperpanjang || '|' || round(extract(epoch from berakhir - mulai) / 3600) from unit_holds
     where lead_id = '22000000-0000-0000-0000-0000000000b1' and dilepas_at is null$$,
  '1|48');

set test.uid = '22222222-2222-2222-2222-222222222222';

select test.raises(
  'Booking atas kavling yang ditahan untuk prospek lain ditolak',
  $$select convert_lead_to_customer('22000000-0000-0000-0000-0000000000b9',
      (select id from units where unit_code = 'K-01' and project_id = '22000000-0000-0000-0000-0000000000a1'), 5000000)$$,
  'ditahan untuk prospek lain');

set test.uid = '11111111-1111-1111-1111-111111111111';

select convert_lead_to_customer('22000000-0000-0000-0000-0000000000b1',
  (select id from units where unit_code = 'K-01' and project_id = '22000000-0000-0000-0000-0000000000a1'), 5000000);

select test.eq_query(
  'Booking oleh prospek yang menahan menutup holdnya',
  $$select alasan_lepas || '|' || (select status::text from units where unit_code = 'K-01' and project_id = '22000000-0000-0000-0000-0000000000a1')
      from unit_holds where lead_id = '22000000-0000-0000-0000-0000000000b1'$$,
  'booking|booking');

set test.uid = '44444444-4444-4444-4444-444444444444';
update units set status = 'terjual' where unit_code = 'K-02' and project_id = '22000000-0000-0000-0000-0000000000a1';

select test.eq_query(
  'Hold terlepas sendiri saat unitnya tidak lagi tersedia',
  $$select coalesce(alasan_lepas, '<terbuka>') from unit_holds where lead_id = '22000000-0000-0000-0000-0000000000b2'$$,
  'unit terjual');

set test.uid = '11111111-1111-1111-1111-111111111111';
select tahan_kavling((select id from units where unit_code = 'K-03' and project_id = '22000000-0000-0000-0000-0000000000a1'),
                     '22000000-0000-0000-0000-0000000000b3');

reset role;
update leads set status = 'cancel' where id = '22000000-0000-0000-0000-0000000000b3';

-- Hold kedaluwarsa yang belum ditutup siapa pun.
insert into unit_holds (unit_id, lead_id, held_by, mulai, berakhir)
select id, '22000000-0000-0000-0000-0000000000b4', '11111111-1111-1111-1111-111111111111',
       now() - interval '2 days', now() - interval '1 day'
  from units where unit_code = 'K-00' and project_id = '22000000-0000-0000-0000-0000000000a1';
set role authenticated;

select test.eq_query(
  'Hold terlepas sendiri saat prospeknya dibatalkan',
  $$select coalesce(alasan_lepas, '<terbuka>') from unit_holds where lead_id = '22000000-0000-0000-0000-0000000000b3'$$,
  'prospek dibatalkan');

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.eq_query(
  'Hold kedaluwarsa tidak menghalangi hold baru',
  $$select (tahan_kavling((select id from units where unit_code = 'K-03' and project_id = '22000000-0000-0000-0000-0000000000a1'),
                          '22000000-0000-0000-0000-0000000000b4') is not null)::text$$,
  'true');

select test.eq_query(
  'Hold kedaluwarsa ditutup dengan alasannya',
  $$select string_agg(coalesce(alasan_lepas, '<terbuka>'), ',' order by mulai)
      from unit_holds where lead_id = '22000000-0000-0000-0000-0000000000b4'$$,
  'kedaluwarsa,<terbuka>');


-- ============================================================
select test.bagian('Minat prospek');
-- ============================================================

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.affects(
  'Sales mencatat minat prospeknya pada kavling',
  $$insert into unit_minat (unit_id, lead_id)
    select id, '22000000-0000-0000-0000-0000000000b4' from units
     where unit_code = 'K-03' and project_id = '22000000-0000-0000-0000-0000000000a1'$$,
  1);

set test.uid = '22222222-2222-2222-2222-222222222222';

select test.raises(
  'Sales tidak dapat mencatat minat untuk prospek agen lain',
  $$insert into unit_minat (unit_id, lead_id)
    select id, '22000000-0000-0000-0000-0000000000b2' from units
     where unit_code = 'K-03' and project_id = '22000000-0000-0000-0000-0000000000a1'$$,
  'row-level security');

select test.affects(
  'Sales B mencatat minat prospeknya sendiri',
  $$insert into unit_minat (unit_id, lead_id)
    select id, '22000000-0000-0000-0000-0000000000b9' from units
     where unit_code = 'K-03' and project_id = '22000000-0000-0000-0000-0000000000a1'$$,
  1);

set test.uid = '44444444-4444-4444-4444-444444444444';
-- Prospek yang sudah booking kavling lain tidak lagi dihitung sebagai peminat.
insert into unit_minat (unit_id, lead_id)
select id, '22000000-0000-0000-0000-0000000000b1' from units
 where unit_code = 'K-03' and project_id = '22000000-0000-0000-0000-0000000000a1';

set test.uid = '22222222-2222-2222-2222-222222222222';

select test.eq_query(
  'Jumlah peminat terlihat semua orang, tanpa yang sudah booking',
  $$select jumlah::text from siteplan_minat_hitung('22000000-0000-0000-0000-0000000000c1') m
      join units u on u.id = m.unit_id where u.unit_code = 'K-03'$$,
  '2');

select test.eq_query(
  'Baris minatnya tetap hanya milik sendiri',
  $$select count(*)::text from unit_minat m join units u on u.id = m.unit_id
     where u.unit_code = 'K-03' and u.project_id = '22000000-0000-0000-0000-0000000000a1'$$,
  '1');


-- ============================================================
select test.bagian('Peta siteplan');
-- ============================================================

set test.uid = '11111111-1111-1111-1111-111111111111';

select test.eq_query(
  'Peta memuat seluruh kavling siteplan',
  $$select json_array_length(siteplan_peta('22000000-0000-0000-0000-0000000000c1'))::text$$,
  '4');

select test.eq_query(
  'Pemilik konsumen melihat nama pembeli dan tahap KPR-nya',
  $$select (x->'konsumen'->>'nama') || '|' || (x->'kpr'->>'tahap')
      from json_array_elements(siteplan_peta('22000000-0000-0000-0000-0000000000c1')) x
     where x->>'unit_code' = 'K-01'$$,
  'Uji Satu|booking');

set test.uid = '22222222-2222-2222-2222-222222222222';

select test.eq_query(
  'Sales lain melihat kavlingnya terjual tanpa nama pembeli',
  $$select (x->>'status') || '|' || coalesce(x->'konsumen'->>'nama', '<tersembunyi>')
      from json_array_elements(siteplan_peta('22000000-0000-0000-0000-0000000000c1')) x
     where x->>'unit_code' = 'K-01'$$,
  'booking|<tersembunyi>');

select test.eq_query(
  'Hold terlihat semua orang, nama prospeknya tidak',
  $$select (x->'hold'->>'penahan') || '|' || coalesce(x->'hold'->>'lead_nama', '<tersembunyi>') || '|' || (x->>'minat')
      from json_array_elements(siteplan_peta('22000000-0000-0000-0000-0000000000c1')) x
     where x->>'unit_code' = 'K-03'$$,
  'Sales A|<tersembunyi>|2');


-- ============================================================
select test.bagian('Laju penjualan');
-- ============================================================

set test.uid = '22222222-2222-2222-2222-222222222222';

select test.eq_query(
  'Laju penjualan menghitung seluruh booking, termasuk milik agen lain',
  $$select (r->>'terjual_90_hari') || '|' || json_array_length(r->'per_bulan')
      from (select siteplan_penjualan_bulanan('22000000-0000-0000-0000-0000000000c1') r) t$$,
  '1|6');


-- ============================================================
select test.bagian('Halaman publik');
-- ============================================================

reset role;
select set_config('test.token', publik_token, false) from siteplans where id = '22000000-0000-0000-0000-0000000000c1';
set role anon;

select test.eq_query(
  'Siteplan yang belum dipublikasikan tidak terbaca lewat tokennya',
  $$select siteplan_publik(current_setting('test.token'))::text$$,
  null);

reset role;
set role authenticated;
set test.uid = '44444444-4444-4444-4444-444444444444';
update siteplans set publik = true where id = '22000000-0000-0000-0000-0000000000c1';
set role anon;

select test.eq_query(
  'Status publik: tersedia, dipesan (booking atau hold), terjual',
  $$select string_agg((x->>'kode') || ':' || (x->>'status'), ',' order by x->>'kode')
      from json_array_elements(siteplan_publik(current_setting('test.token'))->'kavling') x$$,
  'K-00:tersedia,K-01:dipesan,K-02:terjual,K-03:dipesan');

select test.eq_query(
  'Harga hanya tampil untuk kavling yang masih tersedia',
  $$select string_agg((x->>'kode') || ':' || coalesce((x->>'harga')::numeric::bigint::text, '-'), ',' order by x->>'kode')
      from json_array_elements(siteplan_publik(current_setting('test.token'))->'kavling') x
     where x->>'kode' in ('K-00', 'K-01')$$,
  'K-00:185000000,K-01:-');

select test.ok(
  'Halaman publik tidak memuat nama konsumen, prospek, maupun sales',
  position('Uji Satu' in siteplan_publik(current_setting('test.token'))::text) = 0
  and position('Uji Empat' in siteplan_publik(current_setting('test.token'))::text) = 0
  and position('Sales A' in siteplan_publik(current_setting('test.token'))::text) = 0);

select test.eq_query(
  'Token yang salah tidak membuka apa pun',
  $$select siteplan_publik('bukan-token')::text$$,
  null);

select test.raises(
  'Anon tidak dapat memanggil peta internal',
  $$select siteplan_peta('22000000-0000-0000-0000-0000000000c1')$$,
  'permission denied');

reset role;
set role authenticated;
set test.uid = '44444444-4444-4444-4444-444444444444';
update siteplans set publik_tampil_harga = false where id = '22000000-0000-0000-0000-0000000000c1';
set role anon;

select test.eq_query(
  'Harga bisa disembunyikan dari halaman publik',
  $$select count(*)::text from json_array_elements(siteplan_publik(current_setting('test.token'))->'kavling') x
     where x->>'harga' is not null$$,
  '0');

reset role;


-- ============================================================
select test.bagian('Notifikasi hold');
-- ============================================================

update unit_holds set berakhir = now() + interval '2 hours'
 where lead_id = '22000000-0000-0000-0000-0000000000b4' and dilepas_at is null;

set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';

select test.eq_query(
  'Penahan diingatkan saat holdnya hampir berakhir',
  $$select count(*)::text from json_array_elements(my_notifications()->'items') i
     where i->>'kategori' = 'hold' and i->>'urgensi' = 'tinggi' and i->>'judul' like 'K-03%'$$,
  '1');

set test.uid = '22222222-2222-2222-2222-222222222222';

select test.eq_query(
  'Hold milik orang lain tidak muncul di notifikasi',
  $$select count(*)::text from json_array_elements(my_notifications()->'items') i where i->>'kategori' = 'hold'$$,
  '0');

set test.uid = '11111111-1111-1111-1111-111111111111';
select lepas_hold((select id from unit_holds where lead_id = '22000000-0000-0000-0000-0000000000b4' and dilepas_at is null));

select test.eq_query(
  'Penahan dapat melepas holdnya sendiri',
  $$select count(*)::text from unit_holds
     where lead_id = '22000000-0000-0000-0000-0000000000b4' and alasan_lepas = 'dilepas manual'$$,
  '1');

reset role;


-- ============================================================
select test.bagian('Hapus siteplan');
-- ============================================================

set role authenticated;
set test.uid = '44444444-4444-4444-4444-444444444444';

select simpan_kavling('22000000-0000-0000-0000-0000000000c2', '[{"unit_code":"Z-01","bentuk":"0,0 10,0 10,10 0,10"}]'::jsonb);
delete from siteplans where id = '22000000-0000-0000-0000-0000000000c2';

select test.eq_query(
  'Menghapus siteplan melepas kavlingnya dari peta, unitnya tetap ada',
  $$select unit_code || '|' || coalesce(siteplan_id::text, '<lepas>') || '|' || coalesce(bentuk, '<kosong>')
      from units where id = '22000000-0000-0000-0000-0000000000e9'$$,
  'Z-01|<lepas>|<kosong>');

reset role;


-- ============================================================
select test.bagian('Data siteplan lama');
-- ============================================================

-- Proyek dengan kode unit Kaligangsa: lima dari enam cocok (83% ≥ 80%).
insert into projects (id, name) values ('22000000-0000-0000-0000-0000000000a3', 'Kaligangsa Uji');
insert into units (project_id, unit_code, status) values
  ('22000000-0000-0000-0000-0000000000a3', 'A1', 'tersedia'),
  ('22000000-0000-0000-0000-0000000000a3', 'A2', 'tersedia'),
  ('22000000-0000-0000-0000-0000000000a3', 'A3', 'tersedia'),
  ('22000000-0000-0000-0000-0000000000a3', 'H13', 'tersedia'),
  ('22000000-0000-0000-0000-0000000000a3', 'B1', 'terjual'),
  ('22000000-0000-0000-0000-0000000000a3', 'X-99', 'tersedia');

\ir ../migration_022_siteplan.sql
\ir ../migration_022_siteplan.sql
-- Menjalankan ulang 022 juga mengembalikan fungsi yang ditimpa migrasi
-- sesudahnya (my_notifications) ke versi 022. Sama seperti di produksi:
-- setelah mengulang sebuah migrasi, migrasi sesudahnya ikut diulang.
\ir ../migration_023_followup_milik_sales.sql
\ir ../migration_024_followup_bukti.sql
\ir ../migration_025_ubah_catatan.sql
\ir ../migration_026_notifikasi_persetujuan.sql

select test.eq_query(
  'Geometri Kaligangsa pindah dari kode ke database, sekali saja meski migrasi diulang',
  $$select (select count(*) from siteplans where project_id = '22000000-0000-0000-0000-0000000000a3')
           || '|' || (select count(*) from units where project_id = '22000000-0000-0000-0000-0000000000a3' and bentuk is not null)
           || '|' || (select count(*) from siteplan_fasilitas f join siteplans s on s.id = f.siteplan_id
                       where s.project_id = '22000000-0000-0000-0000-0000000000a3')$$,
  '1|5|3');

select test.eq_query(
  'Unit di luar gambar kerja tetap ada, hanya belum digambar',
  $$select coalesce(bentuk, '<belum>') from units where project_id = '22000000-0000-0000-0000-0000000000a3' and unit_code = 'X-99'$$,
  '<belum>');

select test.eq_query(
  'Proyek uji lain tidak ikut mendapat geometri Kaligangsa',
  $$select count(*)::text from siteplans where project_id = '0a0a0a0a-0000-0000-0000-000000000001'$$,
  '0');
