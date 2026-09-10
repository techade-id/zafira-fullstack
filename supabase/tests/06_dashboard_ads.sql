-- ============================================================
-- Agregat dashboard & performa campaign — migration_010
--
-- Agregat adalah tempat kesalahan paling mudah lolos: angkanya tetap tampil
-- meyakinkan meski salah. Karena itu di sini nilainya dicocokkan dengan
-- hitungan yang bisa diperiksa tangan.
--
-- Keadaan setelah berkas 01-04:
--   Prospek Sales A : Budi (aftersales), Citra (cancel), Dedi (hot),
--                     Eka (appointment → Hot Lead), "Uji Kepemilikan" (New)
--   Campaign Ramadan: 3 lead (Budi, Citra, Dedi), belanja Rp4.000.000
--   Campaign OpenHouse: 1 lead (Eka), belanja Rp2.000.000
-- ============================================================

set role authenticated;
select test.bagian('Dashboard & iklan');

set test.uid = '66666666-6666-6666-6666-666666666666';

-- ---------- Funnel ----------
select test.eq_query(
  'Funnel melaporkan tepat tujuh tahap ditambah Cancel',
  $$select jsonb_array_length((dashboard_stats(null,null)::jsonb) -> 'funnel')::text$$,
  '8');

select test.eq_query(
  'Prospek berstatus appointment terhitung sebagai Hot Lead',
  $$select (f ->> 'value') from jsonb_array_elements((dashboard_stats(null,null)::jsonb) -> 'funnel') f
      where f ->> 'stage' = 'hot'$$,
  '2');

select test.eq_query(
  'Prospek yang sudah serah terima kunci terhitung Aftersales',
  $$select (f ->> 'value') from jsonb_array_elements((dashboard_stats(null,null)::jsonb) -> 'funnel') f
      where f ->> 'stage' = 'aftersales'$$,
  '1');

select test.eq_query(
  'Prospek batal terhitung pada tahap Cancel',
  $$select (f ->> 'value') from jsonb_array_elements((dashboard_stats(null,null)::jsonb) -> 'funnel') f
      where f ->> 'stage' = 'cancel'$$,
  '1');

-- ---------- Handover ----------
select test.eq_query(
  'Dashboard menghitung konsumen yang sudah diserahkan',
  $$select (dashboard_stats(null,null)::jsonb) -> 'handover' ->> 'terkunci'$$,
  '1');

-- ---------- Antrean Finance ----------
select test.eq_query(
  'Nominal tervalidasi sesuai pembayaran yang diverifikasi Finance',
  $$select ((dashboard_stats(null,null)::jsonb) -> 'finance' ->> 'terverifikasi_nominal')::numeric::text$$,
  '5500000.00');

-- Setelah migration_008 sebuah pembayaran tidak bisa tervalidasi tanpa
-- kuitansi. Angka ini adalah penanda integritas: begitu ia bukan nol, ada
-- baris lama yang lolos sebelum aturan berlaku.
select test.eq_query(
  'Tidak ada pembayaran tervalidasi tanpa kuitansi',
  $$select (dashboard_stats(null,null)::jsonb) -> 'finance' ->> 'tanpa_kuitansi'$$,
  '0');

-- ---------- Performa campaign ----------
-- Rp4.000.000 untuk 3 lead = Rp1.333.333 per lead.
-- Dari ketiganya hanya Budi yang mencapai Booking ke atas → Rp4.000.000 per deal.
-- Kolom leads_generated pada fixture berisi 999; kalau angka di bawah ini
-- ikut ngawur, berarti perhitungan kembali memakai input manual.
select test.eq_query(
  'Jumlah lead campaign dihitung dari tabel prospek, bukan input manual',
  $$select leads_count::text from campaign_performance(null,null) where nama = 'Promo Ramadan'$$,
  '3');

select test.eq_query(
  'Biaya per lead dihitung dari belanja dan lead sungguhan',
  $$select cost_per_lead::text from campaign_performance(null,null) where nama = 'Promo Ramadan'$$,
  '1333333');

select test.eq_query(
  'Hanya prospek Booking ke atas yang dihitung sebagai deal',
  $$select deals_count::text from campaign_performance(null,null) where nama = 'Promo Ramadan'$$,
  '1');

select test.eq_query(
  'Biaya per deal dihitung benar',
  $$select cost_per_deal::text from campaign_performance(null,null) where nama = 'Promo Ramadan'$$,
  '4000000');

select test.eq_query(
  'Campaign tanpa deal tidak melaporkan biaya per deal',
  $$select coalesce(cost_per_deal::text, 'NULL') from campaign_performance(null,null) where nama = 'Open House Mei'$$,
  'NULL');

-- ---------- RLS pada agregat ----------
-- Agregat memakai SECURITY INVOKER, jadi ia menyempit sendiri mengikuti
-- pembacanya. Kalau suatu saat diubah jadi SECURITY DEFINER demi kecepatan,
-- dua uji berikut akan langsung gagal.
set test.uid = '22222222-2222-2222-2222-222222222222';

select test.eq_query(
  'Sales B tidak melihat lead campaign milik Sales A',
  $$select leads_count::text from campaign_performance(null,null) where nama = 'Promo Ramadan'$$,
  '0');

select test.eq_query(
  'Total prospek dashboard menyempit mengikuti pembacanya',
  $$select (dashboard_stats(null,null)::jsonb) ->> 'total_leads'$$,
  '1');

reset role;
