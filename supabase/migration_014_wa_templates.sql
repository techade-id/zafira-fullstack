-- ============================================================
-- Zafira Property — Migration 014
-- Template pesan WhatsApp yang dapat diubah tanpa deploy.
--
-- Latar belakang: aksi WhatsApp (migrasi 013 + KontakAksi) membuka percakapan
-- dengan kalimat pembuka sesuai tahap prospek. Kalimat itu semula tertanam di
-- lib/waTemplates.js, artinya setiap penyesuaian nada bicara menuntut seorang
-- pengembang — padahal pembuka yang terasa seperti template justru menurunkan
-- tingkat balasan, dan yang paling tahu kalimat yang benar adalah tim sales.
--
-- Kenapa business_settings, bukan tabel baru: RLS, halaman pengelolaan, dan
-- kebiasaan pengguna sudah ada di sana. Yang kurang hanya satu hal — tabel itu
-- menyimpan DAFTAR NILAI (category + value), bukan pasangan KUNCI→TEKS. Sebuah
-- template butuh penanda tahap miliknya.
--
-- Aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Kolom penanda
-- ------------------------------------------------------------

alter table business_settings add column if not exists label text;

comment on column business_settings.label is
  'Penanda baris dalam kategorinya, untuk kategori yang berbentuk kunci→teks (mis. wa_template: label = tahap prospek). NULL untuk kategori berbentuk daftar biasa.';

-- ------------------------------------------------------------
-- 2. Keunikan
--
-- Batasan lama `unique (category, value)` cocok untuk daftar pilihan — dua
-- "Bank BTN" dalam satu kategori memang tidak masuk akal. Tetapi untuk
-- template, yang harus unik adalah TAHAPNYA, bukan teksnya: dua tahap yang
-- kebetulan memakai kalimat sama akan ditolak, padahal itu sah.
--
-- Batasan dipecah menurut bentuk barisnya, sehingga aturan lama tetap berlaku
-- persis seperti sebelumnya untuk seluruh kategori yang sudah ada.
-- ------------------------------------------------------------

alter table business_settings drop constraint if exists business_settings_category_value_key;

create unique index if not exists business_settings_daftar_uniq
  on business_settings (category, value) where label is null;

create unique index if not exists business_settings_kunci_uniq
  on business_settings (category, label) where label is not null;

-- ------------------------------------------------------------
-- 3. Template bawaan
--
-- Sengaja netral dan agak formal sebagai titik awal yang aman. Tim diharapkan
-- menggantinya dengan kalimat yang benar-benar dipakai sehari-hari.
--
-- Penanda yang dikenali: {nama}, {agen}, {unit}.
-- ------------------------------------------------------------

insert into business_settings (category, label, value, sort_order) values
  ('wa_template', 'leads',
   'Halo {nama}, saya {agen} dari Zafira Property. Terima kasih sudah menghubungi kami. Boleh saya bantu jelaskan pilihan unit yang tersedia?', 1),
  ('wa_template', 'cold',
   'Halo {nama}, saya {agen} dari Zafira Property. Apakah rencana mencari huniannya masih berjalan? Ada beberapa unit baru yang mungkin cocok.', 2),
  ('wa_template', 'warm',
   'Halo {nama}, saya {agen} dari Zafira Property. Kalau berkenan, kami bisa atur jadwal survei lokasi akhir pekan ini. Kira-kira hari apa yang paling nyaman?', 3),
  ('wa_template', 'hot',
   'Halo {nama}, saya {agen} dari Zafira Property. Menindaklanjuti obrolan kita, apakah jadwal survei dan simulasi angsurannya sudah bisa kita tetapkan?', 4),
  ('wa_template', 'booking',
   'Halo {nama}, terima kasih atas booking unit {unit}. Berikut kami kirimkan rincian pembayaran booking fee beserta nomor rekening resminya.', 5),
  ('wa_template', 'kpr',
   'Halo {nama}, untuk melanjutkan proses KPR unit {unit}, kami masih menunggu kelengkapan berkas berikut. Mohon dikirimkan bila sudah siap.', 6),
  ('wa_template', 'akad',
   'Halo {nama}, jadwal akad untuk unit {unit} sudah dapat kami koordinasikan. Berikut tanggal dan dokumen yang perlu dibawa.', 7),
  ('wa_template', 'aftersales',
   'Halo {nama}, terima kasih telah mempercayakan hunian Anda kepada Zafira Property. Bila ada kendala pada unit {unit}, silakan sampaikan kepada kami.', 8)
on conflict do nothing;
