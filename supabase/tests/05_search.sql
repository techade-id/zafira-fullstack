-- ============================================================
-- Pencarian catatan — REVISI §1.3, PRD §2.2
--
-- Tiga hal yang harus dijaga sekaligus: cocok sebagian di tengah teks,
-- mendukung Unicode, dan tidak pernah membocorkan catatan agen lain.
-- ============================================================

set role authenticated;
select test.bagian('Pencarian catatan');

set test.uid = '11111111-1111-1111-1111-111111111111';

-- Inti permintaan notula: kata yang dicari ada di TENGAH catatan, bukan di
-- awal. Inilah yang tidak bisa dilayani index B-tree maupun full-text search.
select test.eq_query(
  'Kata di tengah catatan ditemukan',
  $$select count(*)::text from search_notes('simulasi kredit') where modul = 'Prospek'$$,
  '1');

select test.eq_query(
  'Pencarian tidak membedakan huruf besar-kecil',
  $$select count(*)::text from search_notes('SIMULASI KREDIT') where modul = 'Prospek'$$,
  '1');

-- Cuplikan harus memuat kata yang dicari, bukan sekadar awal teks.
select test.ok(
  'Cuplikan memuat kata yang dicari',
  (select cuplikan ilike '%simulasi kredit%' from search_notes('simulasi kredit') where modul = 'Prospek' limit 1),
  (select cuplikan from search_notes('simulasi kredit') where modul = 'Prospek' limit 1));

-- PRD §2.2: nama dan username boleh memuat emoji.
select test.ok(
  'Nama dengan emoji dapat dicari',
  (select count(*) > 0 from search_notes('Santoso 🏠')),
  null);

-- Catatan follow-up yang menempel ke KONSUMEN (bukan prospek) harus tetap
-- dapat dibuka. Sebelum diperbaiki, baris seperti ini muncul sebagai
-- "(prospek terhapus)" dengan record_id kosong, sehingga hasil pencariannya
-- tidak bisa diklik.
select test.eq_query(
  'Catatan follow-up konsumen mengarah ke modul Konsumen',
  $$select rute from search_notes('BPHTB') where modul = 'Follow Up' limit 1$$,
  '/konsumen');

select test.ok(
  'Catatan follow-up konsumen membawa id yang dapat dibuka',
  (select record_id is not null from search_notes('BPHTB') where modul = 'Follow Up' limit 1),
  null);

select test.ok(
  'Catatan follow-up konsumen memakai nama konsumen, bukan penanda terhapus',
  (select judul not like '%terhapus%' from search_notes('BPHTB') where modul = 'Follow Up' limit 1),
  (select judul from search_notes('BPHTB') where modul = 'Follow Up' limit 1));

-- Di bawah tiga karakter index trigram tidak terpakai dan setiap tabel akan
-- dipindai berurutan. Lebih baik tidak menjawab sama sekali.
select test.eq_query(
  'Kueri di bawah 3 karakter tidak dijalankan',
  $$select count(*)::text from search_notes('si')$$,
  '0');

-- Tanpa peng-escape-an, satu karakter '%' akan mencocokkan seluruh isi tabel.
select test.eq_query(
  'Karakter % tidak mencocokkan segalanya',
  $$select count(*)::text from search_notes('%%%')$$,
  '0');

-- ---------- Isolasi antar agen ----------
select test.eq_query(
  'Sales A tidak menemukan catatan Sales B',
  $$select count(*)::text from search_notes('diskon khusus')$$,
  '0');

set test.uid = '22222222-2222-2222-2222-222222222222';
select test.eq_query(
  'Sales B menemukan catatannya sendiri',
  $$select count(*)::text from search_notes('diskon khusus') where modul = 'Prospek'$$,
  '1');

select test.eq_query(
  'Sales B tidak menemukan catatan Sales A',
  $$select count(*)::text from search_notes('simulasi kredit')$$,
  '0');

-- Peran pemantau memang harus melihat semuanya. Diuji dengan dua pencarian
-- terpisah — masing-masing mengenai catatan milik agen yang berbeda —
-- karena itulah yang benar-benar membuktikan jangkauan lintas agen.
set test.uid = '66666666-6666-6666-6666-666666666666';

select test.eq_query(
  'Pengawas menemukan catatan Sales A',
  $$select count(*)::text from search_notes('simulasi kredit') where modul = 'Prospek'$$,
  '1');

select test.eq_query(
  'Pengawas menemukan catatan Sales B',
  $$select count(*)::text from search_notes('diskon khusus') where modul = 'Prospek'$$,
  '1');

reset role;
