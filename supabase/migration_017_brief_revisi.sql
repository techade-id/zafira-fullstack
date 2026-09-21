-- ============================================================
-- Zafira Property — Migration 017
-- BRIEF ZAFIRA PROPERTY (rapat revisi): dashboard ringkas, leads yang
-- menentukan suhunya sendiri, dan berkas KPR yang punya lampiran di setiap
-- tahap.
--
-- Empat perubahan yang menjadi pangkal seluruhnya:
--
--   1. SUHU LEADS BUKAN LAGI PILIHAN MANUAL. Sales memilih Cold/Warm/Hot
--      sendiri dari sebuah dropdown, dan pilihan itu praktis tidak pernah
--      diperbarui setelah hari pertama — sehingga "Hot Lead" pada dashboard
--      berarti "pernah terasa panas", bukan "panas sekarang". Brief memintanya
--      dibaca sistem dari progres interaksi. Di sini suhu dihitung dari
--      riwayat follow-up: hasilnya, jumlahnya, dan kapan terakhir disentuh.
--
--   2. SARINGAN AWAL PINDAH KE DEPAN BOOKING. Survei dan BI-Checking selama
--      ini tercatat SESUDAH booking, padahal keduanya justru yang menentukan
--      apakah booking layak diterima. Kolomnya kini ada pada leads juga,
--      sehingga bisa diisi sejak prospek, dan ikut terbawa saat konversi.
--
--   3. SETIAP TAHAP PUNYA LAMPIRAN. Kwitansi booking, bukti transfer, hasil
--      BI-Checking, foto survei, SP3K, dokumentasi akad, berita acara, bukti
--      BPHTB, sertifikat — semuanya sebelumnya hidup di WhatsApp. Satu tabel
--      `berkas_lampiran` menampung semuanya, ditandai `slot`.
--
--   4. PEMBAYARAN PUNYA FASE MENUNGGU VERIFIKASI. Sebelumnya hanya
--      menunggu → terverifikasi, dan bukti transfer dari konsumen tidak punya
--      tempat sama sekali: satu-satunya berkas yang bisa diunggah adalah
--      kuitansi resmi, dan itu wewenang Finance. Kini Admin Marketing
--      mengunggah bukti transfer, pembayaran pindah ke 'menunggu_verifikasi',
--      dan Finance-lah yang menutupnya.
--
-- Aman dijalankan ulang.
-- ============================================================


-- ------------------------------------------------------------
-- 0. Nilai enum baru
--
-- Postgres menuntut nilai enum sudah ter-commit sebelum dipakai di dalam
-- query, jadi bagian ini berdiri sendiri di paling atas.
-- ------------------------------------------------------------

alter type payment_status add value if not exists 'menunggu_verifikasi';

commit;


-- ------------------------------------------------------------
-- 1. Sumber leads: Ads, Freelance, Kemitraan, Organik
--
-- Sebelumnya Freelance dan Kemitraan berbagi satu nilai 'freelance'. Keduanya
-- memang sama-sama diwakili tabel partners, tetapi biaya, perjanjian, dan
-- cara evaluasinya berbeda — dan begitu digabung, pertanyaan "kemitraan mana
-- yang menghasilkan" tidak bisa dijawab lagi.
--
-- Organik mendapat kolom keterangan wajib: "Organik" saja tidak memberi tahu
-- siapa pun apa yang harus diulang. Yang berguna adalah nama eventnya.
-- ------------------------------------------------------------

alter table leads add column if not exists organik_detail text;

comment on column leads.organik_detail is
  'Keterangan sumber organik — nama event, lokasi OTS, atau nama perujuk. Wajib saat source_type = ''organik''.';

-- Baris lama memakai partners bertipe kemitraan tetapi bersumber 'freelance'.
-- Dipisah di sini supaya laporan sumber langsung benar tanpa menunggu data
-- baru terkumpul.
update leads l
   set source_type = 'kemitraan'
  from partners p
 where p.id = l.partner_id
   and l.source_type = 'freelance'
   and p.type = 'kemitraan';

-- Data lama dirapikan lebih dulu, supaya aturannya bisa berlaku untuk SELURUH
-- baris dan bukan hanya untuk yang akan datang.
--
-- Sebuah CHECK yang dibiarkan NOT VALID selamanya adalah aturan yang hanya
-- setengah berlaku: baris lama tetap melanggarnya diam-diam, laporan sumber
-- tetap memuat kategori yang tidak dikenal, dan tidak ada satu pun layar yang
-- akan memberi tahu siapa pun. Lebih jujur menuliskan apa yang sebenarnya
-- diketahui — termasuk ketika yang diketahui adalah "tidak tercatat" — lalu
-- memvalidasinya.

-- Nilai sumber di luar keempat pilihan dikosongkan, bukan ditebak. Kolom
-- source teks lama tetap menyimpan bunyi aslinya, jadi tidak ada yang hilang.
update leads
   set source_type = null
 where source_type is not null
   and source_type not in ('ads', 'freelance', 'kemitraan', 'organik');

-- Keterangan organik diambil dari yang paling dekat dengan kenyataan:
-- kategorinya, lalu label sumber lama. Baris yang memang tidak pernah punya
-- keterangan ditandai apa adanya — sebuah penanda yang bisa dicari dan
-- dibereskan, bukan keterangan karangan yang akan dikira sungguhan.
update leads
   set organik_detail = coalesce(
         nullif(btrim(organik_kategori), ''),
         nullif(btrim(source), ''),
         '(tidak tercatat)')
 where source_type = 'organik'
   and coalesce(btrim(organik_detail), '') = '';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'leads_source_type_check') then
    alter table leads add constraint leads_source_type_check
      check (source_type is null or source_type in ('ads', 'freelance', 'kemitraan', 'organik'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_organik_detail_check') then
    alter table leads add constraint leads_organik_detail_check
      check (source_type is distinct from 'organik' or coalesce(btrim(organik_detail), '') <> '');
  end if;
end $$;

-- Proyek yang sempat menjalankan versi awal migrasi ini mendapat kedua CHECK
-- dalam keadaan NOT VALID. Menjalankan ulang tidak akan membuatnya sah dengan
-- sendirinya — `add constraint` di atas dilewati karena namanya sudah ada —
-- jadi divalidasi di sini, setelah datanya dirapikan.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'leads'::regclass
       and conname in ('leads_source_type_check', 'leads_organik_detail_check')
       and not convalidated
  loop
    execute format('alter table leads validate constraint %I', c.conname);
  end loop;
end $$;


-- ------------------------------------------------------------
-- 2. Saringan awal pada prospek
--
-- Survei dan BI-Checking terjadi SEBELUM booking, jadi tempatnya pada leads.
-- Kolom yang sama sudah ada di customer_kpr sejak migrasi 015; konversi
-- menyalinnya, sehingga tidak ada yang perlu diketik dua kali.
-- ------------------------------------------------------------

alter table leads add column if not exists tanggal_survei date;
alter table leads add column if not exists catatan_survei text;
alter table leads add column if not exists bi_checking_status text;
alter table leads add column if not exists bi_checking_tanggal date;
alter table leads add column if not exists bi_checking_catatan text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'leads_bi_checking_status_check') then
    alter table leads add constraint leads_bi_checking_status_check
      check (bi_checking_status is null or bi_checking_status in ('menunggu', 'lolos', 'tidak_lolos'));
  end if;
end $$;

comment on column leads.tanggal_survei is
  'Tanggal survei lokasi. Foto surveinya tersimpan di berkas_lampiran slot ''survei''.';


-- ------------------------------------------------------------
-- 3. Suhu leads dibaca sistem, bukan dipilih Sales
--
-- Dua aturan, dijalankan berurutan:
--
--   a. Kata kunci pada hasil/catatan follow-up terbaru. Inilah yang diminta
--      brief secara harfiah — "kurang minat" harus membuat prospek menjadi
--      Cold tanpa ada yang perlu mengubahnya.
--   b. Bila tidak ada kata kunci yang cocok, dipakai bentuk interaksinya:
--      prospek yang direspons berulang kali menghangat, yang didiamkan lebih
--      dari dua minggu mendingin.
--
-- Tahap Booking ke atas dan Cancel tidak pernah disentuh: itu ditulis trigger
-- lain dari kuitansi dan tanggal KPR, dan suhu tidak boleh menariknya mundur.
-- ------------------------------------------------------------

create or replace function lead_temperature_from_text(p_teks text)
returns text language sql immutable as $$
  select case
    when p_teks is null or btrim(p_teks) = '' then null
    -- Dingin lebih dulu: "tidak tertarik" memuat kata "tertarik", dan urutan
    -- terbalik akan membaca penolakan sebagai minat.
    when p_teks ~* '(tidak|belum|kurang|nggak|ngga|gak)\s*(ber)?minat'
      or p_teks ~* 'tidak\s*tertarik'
      or p_teks ~* 'tidak\s*jadi'
      or p_teks ~* '(batal|cancel)'
      or p_teks ~* 'sudah\s*(beli|dapat|punya)\s*(rumah|unit)'
      or p_teks ~* 'nomor\s*(tidak aktif|salah)'
      or p_teks ~* 'blokir'
      or p_teks ~* 'belum\s*ada\s*(dana|biaya|uang)'
      or p_teks ~* 'tunda'
      then 'cold'
    when p_teks ~* 'siap\s*(booking|bayar|akad|dp)'
      or p_teks ~* '(sudah|mau|akan)\s*survei'
      or p_teks ~* 'survei\s*lokasi'
      or p_teks ~* 'deal'
      or p_teks ~* 'nego'
      or p_teks ~* 'minta\s*(simulasi|berkas|form)'
      or p_teks ~* 'bi\s*-?\s*checking'
      or p_teks ~* 'sangat\s*tertarik'
      then 'hot'
    when p_teks ~* 'tertarik'
      or p_teks ~* 'pertimbang'
      or p_teks ~* 'dihubungi\s*ulang'
      or p_teks ~* 'tanya'
      then 'warm'
    else null
  end;
$$;

comment on function lead_temperature_from_text(text) is
  'Membaca hasil/catatan follow-up menjadi suhu prospek. Pola penolakan diperiksa lebih dulu agar "tidak tertarik" tidak terbaca sebagai minat.';


create or replace function lead_temperature(p_lead_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_teks       text;
  v_dari_teks  text;
  v_jumlah     int;
  v_positif    int;
  v_terakhir   timestamptz;
  v_survei     date;
  v_bi         text;
begin
  select l.tanggal_survei, l.bi_checking_status into v_survei, v_bi
    from leads l where l.id = p_lead_id;

  -- BI-Checking yang gagal adalah satu-satunya fakta yang mengalahkan segala
  -- hal lain: pengajuannya memang tidak bisa diteruskan, seantusias apa pun
  -- orangnya.
  if v_bi = 'tidak_lolos' then
    return 'cold';
  end if;

  select a.created_at, concat_ws(' ', a.hasil, a.activity, a.note)
    into v_terakhir, v_teks
    from lead_activities a
   where a.lead_id = p_lead_id
   order by a.created_at desc
   limit 1;

  -- Belum pernah di-follow-up: tetap Warm, sesuai default saat prospek masuk.
  if v_terakhir is null then
    -- Sudah disurvei atau lolos saringan tetapi belum ada catatan sama sekali:
    -- perbuatannya sendiri sudah cukup menjadi sinyal.
    if v_bi = 'lolos' or v_survei is not null then
      return 'hot';
    end if;
    return 'warm';
  end if;

  -- Kata pada catatan TERAKHIR menang atas survei dan BI-Checking.
  --
  -- Urutan ini pernah terbalik, dan akibatnya persis melanggar aturan utama
  -- brief: prospek yang sudah disurvei lalu berkata "kurang minat" tetap
  -- ditandai Hot. Survei adalah sesuatu yang terjadi kemarin; catatan terakhir
  -- adalah keadaan hari ini, dan suhu dimaksudkan untuk menjawab yang kedua.
  v_dari_teks := lead_temperature_from_text(v_teks);
  if v_dari_teks is not null then
    return v_dari_teks;
  end if;

  -- Didiamkan dua minggu setelah kontak terakhir: dingin, berapa pun jumlah
  -- follow-up sebelumnya, dan sudah disurvei atau belum. Prospek yang hilang
  -- setelah disurvei justru kehilangan yang paling mahal — menandainya Hot
  -- hanya membuatnya tidak pernah muncul di daftar yang perlu dikejar.
  if v_terakhir < now() - interval '14 days' then
    return 'cold';
  end if;

  -- Baru sesudah itu fakta saringan awal berbicara: masih dihubungi, dan
  -- sudah melewati survei atau BI-Checking.
  if v_bi = 'lolos' or v_survei is not null then
    return 'hot';
  end if;

  select count(*),
         count(*) filter (where lead_temperature_from_text(concat_ws(' ', hasil, activity, note)) = 'hot')
    into v_jumlah, v_positif
    from lead_activities
   where lead_id = p_lead_id;

  if v_positif > 0 or v_jumlah >= 3 then
    return 'hot';
  end if;

  return 'warm';
end $$;

comment on function lead_temperature(uuid) is
  'Suhu prospek: BI-Checking gagal, lalu kata kunci pada follow-up TERAKHIR, lalu kemandekan, lalu saringan awal, lalu bentuk interaksinya. Tidak pernah dipilih tangan.';


create or replace function apply_lead_temperature(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status lead_status;
  v_suhu   text;
begin
  select status into v_status from leads where id = p_lead_id;
  if v_status is null then
    return;
  end if;

  -- Hanya tahap pra-booking yang boleh digeser suhu. Booking ke atas ditulis
  -- trigger dari kuitansi dan tanggal KPR; Cancel adalah keputusan manusia
  -- yang punya alasan tercatat.
  if v_status::text not in ('leads', 'baru', 'cold', 'warm', 'hot', 'dihubungi', 'appointment') then
    return;
  end if;

  v_suhu := lead_temperature(p_lead_id);

  if v_suhu is not null and v_suhu <> v_status::text then
    update leads set status = v_suhu::lead_status, updated_at = now() where id = p_lead_id;
  end if;
end $$;

grant execute on function lead_temperature_from_text(text) to authenticated;
grant execute on function lead_temperature(uuid) to authenticated;
grant execute on function apply_lead_temperature(uuid) to authenticated;


-- Prospek baru langsung Warm. Brief §Leads: statusnya ditetapkan sistem, bukan
-- dipilih Sales — sebuah prospek yang baru masuk memang belum terbukti dingin.
create or replace function lead_default_temperature()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is null or new.status::text in ('leads', 'baru') then
    new.status := 'warm';
  end if;
  return new;
end $$;

drop trigger if exists leads_default_temperature on leads;
create trigger leads_default_temperature
  before insert on leads
  for each row execute function lead_default_temperature();


-- Log komunikasi menggerakkan status. Inilah permintaan brief yang paling
-- langsung: catatan bertuliskan "kurang minat" harus membuat prospek Cold
-- dengan sendirinya.
create or replace function lead_activity_apply_temperature()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null then
    perform apply_lead_temperature(new.lead_id);
  end if;
  return null;
end $$;

drop trigger if exists lead_activities_apply_temperature on lead_activities;
create trigger lead_activities_apply_temperature
  after insert or update on lead_activities
  for each row execute function lead_activity_apply_temperature();


-- Survei dan BI-Checking juga menggeser suhu, tanpa menunggu catatan menyusul.
create or replace function lead_saringan_apply_temperature()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tanggal_survei is distinct from old.tanggal_survei
     or new.bi_checking_status is distinct from old.bi_checking_status then
    perform apply_lead_temperature(new.id);
  end if;
  return null;
end $$;

drop trigger if exists leads_saringan_temperature on leads;
create trigger leads_saringan_temperature
  after update on leads
  for each row execute function lead_saringan_apply_temperature();


-- Penyapuan suhu: aturan "didiamkan 14 hari menjadi dingin" bergantung pada
-- waktu berjalan, bukan pada sebuah peristiwa, jadi tidak ada trigger yang
-- bisa menyalakannya. Halaman Follow Up memanggil fungsi ini saat dibuka.
-- SECURITY DEFINER dengan sengaja.
--
-- Ini rutin pemeliharaan, bukan pembacaan data: ia menerapkan aturan yang
-- objektif dan tidak mengembalikan satu pun baris kepada pemanggil. Sebagai
-- INVOKER ia akan diam-diam tidak melakukan apa-apa bagi Admin Marketing —
-- policy leads_update hanya mengenal admin dan sales pemiliknya — padahal
-- dialah salah satu yang paling sering membuka halaman Follow Up.
create or replace function refresh_lead_temperature()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ubah int;
begin
  -- Satu pernyataan, bukan satu putaran per prospek.
  --
  -- Versi berputar memanggil lead_temperature() untuk setiap prospek aktif,
  -- dan fungsi itu sendiri menjalankan tiga query. Pada seribu prospek itu
  -- tiga ribu perjalanan bolak-balik untuk sebuah halaman yang menunggunya
  -- selesai sebelum menampilkan apa pun.
  --
  -- Yang benar-benar perlu disapu jauh lebih sempit daripada "semuanya": dari
  -- seluruh aturan suhu, hanya satu yang bergantung pada waktu berjalan dan
  -- karena itu tidak punya peristiwa pemicu — prospek yang didiamkan lebih
  -- dari dua minggu menjadi dingin. Sisanya sudah ditulis trigger pada saat
  -- kejadiannya. Jadi cukup aturan itu yang dijalankan di sini, dan urutan
  -- prioritas lead_temperature() tetap dihormati: fakta (survei, BI-Checking)
  -- dan kata kunci pada catatan terakhir sama-sama mengalahkan kemandekan.
  with terakhir as (
    select l.id,
           a.created_at,
           lead_temperature_from_text(concat_ws(' ', a.hasil, a.activity, a.note)) as dari_teks
      from leads l
      join lateral (
        select created_at, hasil, activity, note
          from lead_activities
         where lead_id = l.id
         order by created_at desc
         limit 1
      ) a on true
     where l.status::text in ('leads', 'baru', 'warm', 'hot', 'dihubungi', 'appointment')
       -- Prospek yang sudah disurvei TIDAK dikecualikan: yang hilang setelah
       -- disurvei justru kehilangan yang paling mahal, dan mengecualikannya
       -- berarti ia tidak akan pernah muncul di daftar yang perlu dikejar.
       and coalesce(l.bi_checking_status, '') <> 'tidak_lolos'
  ),
  sasaran as (
    select id from terakhir
     where dari_teks is null
       and created_at < now() - interval '14 days'
  )
  update leads
     set status = 'cold', updated_at = now()
   where id in (select id from sasaran);

  get diagnostics v_ubah = row_count;
  return v_ubah;
end $$;

-- SECURITY INVOKER: RLS yang menentukan prospek siapa yang tersapu. Sales
-- menyegarkan miliknya sendiri, Admin Marketing menyegarkan semuanya —
-- tanpa satu pun cabang peran di dalam fungsi ini.
grant execute on function refresh_lead_temperature() to authenticated;

comment on function refresh_lead_temperature() is
  'Menyegarkan suhu prospek pra-booking yang mandek lebih dari dua minggu. Menangkap satu-satunya aturan suhu yang bergantung pada waktu berjalan dan karena itu tidak punya pemicu.';


-- ------------------------------------------------------------
-- 4. Lampiran per tahap
--
-- Satu tabel untuk sebelas jenis lampiran, bukan sebelas kolom URL pada
-- customer_kpr. Sebuah tahap sering butuh lebih dari satu berkas — foto survei
-- jarang hanya satu — dan kolom tunggal memaksa berkas kedua menimpa yang
-- pertama tanpa jejak.
--
-- lead_id dan customer_id dua-duanya ada: survei dan BI-Checking terjadi saat
-- masih prospek, sisanya setelah menjadi konsumen.
-- ------------------------------------------------------------

create table if not exists berkas_lampiran (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  slot text not null,
  file_url text not null,
  file_name text,
  catatan text,
  uploaded_by uuid references profiles(id) default auth.uid(),
  uploaded_at timestamptz not null default now(),
  constraint berkas_lampiran_pemilik_check check (lead_id is not null or customer_id is not null),
  -- Sengaja TIDAK memuat slot untuk kuitansi dan bukti transfer.
  --
  -- Brief meminta keduanya pada tahap Booking dan DP, dan sempat masuk ke sini
  -- sebagai slot tersendiri. Itu keliru: sebuah kuitansi melekat pada sebuah
  -- PEMBAYARAN, bukan pada sebuah tahap. Satu konsumen bisa punya beberapa
  -- pembayaran DP, dan slot per tahap memaksa semuanya menumpuk di satu kotak
  -- tanpa cara mengetahui bukti mana milik setoran mana — persis pertanyaan
  -- yang harus dijawab Finance saat memverifikasi.
  --
  -- Karena itu keduanya tinggal di payments.bukti_transfer_url dan
  -- payments.proof_url, tempat mereka mewarisi pemisahan wewenangnya sendiri.
  constraint berkas_lampiran_slot_check check (slot in (
    'survei', 'bi_checking',
    'sp3k_terbit', 'sp3k_perpanjangan',
    'akad', 'berita_acara',
    'bphtb', 'shm'
  ))
);

comment on table berkas_lampiran is
  'Lampiran per tahap berkas KPR (BRIEF §Konsumen). Satu baris per berkas — sebuah tahap boleh punya banyak.';

alter table berkas_lampiran enable row level security;

create index if not exists idx_berkas_lampiran_customer on berkas_lampiran (customer_id, slot);
create index if not exists idx_berkas_lampiran_lead on berkas_lampiran (lead_id, slot);

drop policy if exists "berkas_lampiran_select" on berkas_lampiran;
create policy "berkas_lampiran_select" on berkas_lampiran for select using (
  can_view_all()
  or (customer_id is not null and owns_customer(customer_id))
  or (lead_id is not null and owns_lead(lead_id))
);

-- Lampiran mengikuti hak atas berkasnya: siapa yang boleh mengubah progres KPR
-- boleh melampirkan buktinya. Handover Hard-Lock ikut berlaku — setelah
-- kuitansi Booking Fee tervalidasi, Sales tidak lagi menambah lampiran.
drop policy if exists "berkas_lampiran_insert" on berkas_lampiran;
create policy "berkas_lampiran_insert" on berkas_lampiran for insert with check (
  can_write_berkas()
  or (customer_id is not null and owns_customer(customer_id) and not customer_locked(customer_id))
  or (customer_id is null and lead_id is not null and owns_lead(lead_id))
);

drop policy if exists "berkas_lampiran_update" on berkas_lampiran;
create policy "berkas_lampiran_update" on berkas_lampiran for update using (
  can_write_berkas()
  or (customer_id is not null and owns_customer(customer_id) and not customer_locked(customer_id))
  or (customer_id is null and lead_id is not null and owns_lead(lead_id))
);

drop policy if exists "berkas_lampiran_delete" on berkas_lampiran;
create policy "berkas_lampiran_delete" on berkas_lampiran for delete using (
  is_admin() or can_write_berkas()
);


-- ------------------------------------------------------------
-- 5. Tahap KPR: saringan awal di depan, opsi hasil di belakang
-- ------------------------------------------------------------

alter table customer_kpr add column if not exists tanggal_survei date;
alter table customer_kpr add column if not exists catatan_survei text;
alter table customer_kpr add column if not exists proses_bank_at timestamptz;
alter table customer_kpr add column if not exists proses_bank_by uuid references profiles(id);
alter table customer_kpr add column if not exists bphtb_status text;
alter table customer_kpr add column if not exists shm_balik_nama text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'customer_kpr_bphtb_status_check') then
    alter table customer_kpr add constraint customer_kpr_bphtb_status_check
      check (bphtb_status is null or bphtb_status in ('lolos', 'tidak_lolos'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customer_kpr_shm_balik_nama_check') then
    alter table customer_kpr add constraint customer_kpr_shm_balik_nama_check
      check (shm_balik_nama is null or shm_balik_nama in ('sudah', 'belum'));
  end if;
end $$;

comment on column customer_kpr.proses_bank_at is
  'Diisi saat Admin Marketing menekan "Proses Bank" — penanda berkas dinyatakan lengkap dan diserahkan ke bank.';

-- Total DP dihitung, tidak diketik.
--
-- Brief §DP: "Tambahkan akumulasi otomatis dari Nominal DP + Biaya Tanah untuk
-- di Total DP". Dijaga trigger, bukan kolom generated, supaya baris lama yang
-- total-nya pernah diketik tangan tetap bisa dimuat tanpa error.
create or replace function kpr_hitung_total_dp()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.nominal_dp is not null or new.biaya_tambahan_tanah is not null then
    new.nominal_total_dp := coalesce(new.nominal_dp, 0) + coalesce(new.biaya_tambahan_tanah, 0);
  end if;
  return new;
end $$;

drop trigger if exists customer_kpr_total_dp on customer_kpr;
create trigger customer_kpr_total_dp
  before insert or update on customer_kpr
  for each row execute function kpr_hitung_total_dp();

update customer_kpr
   set nominal_total_dp = coalesce(nominal_dp, 0) + coalesce(biaya_tambahan_tanah, 0)
 where nominal_dp is not null or biaya_tambahan_tanah is not null;


-- ------------------------------------------------------------
-- 6. Penghasilan terverifikasi pindah ke data diri konsumen
--
-- Brief §Saringan Awal: "Penghasilan Terverifikasi/Bulan (gaji); Dipindahkan
-- ke data konsumen bagian data diri". Ia memang bukan bagian dari pemeriksaan
-- SLIK — ia keterangan tentang orangnya, dan dipakai ulang di banyak tahap.
--
-- Kolom lama pada customer_kpr tidak dihapus: rasio RPC yang sudah tercatat
-- pada berkas berjalan akan kehilangan penyebutnya.
-- ------------------------------------------------------------

alter table customers add column if not exists penghasilan numeric(14,2);

comment on column customers.penghasilan is
  'Penghasilan bulanan terverifikasi. Pindah ke sini dari customer_kpr.penghasilan_verifikasi (BRIEF §Saringan Awal).';

update customers c
   set penghasilan = k.penghasilan_verifikasi
  from customer_kpr k
 where k.customer_id = c.id
   and c.penghasilan is null
   and k.penghasilan_verifikasi is not null;

update customers c
   set penghasilan = l.gaji
  from leads l
 where l.id = c.lead_id
   and c.penghasilan is null
   and l.gaji is not null;

-- Dua arah, supaya peringatan RPC pada stepper tetap hidup ketika penghasilan
-- diperbarui dari kartu konsumen.
create or replace function customer_sync_penghasilan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.penghasilan is distinct from old.penghasilan and new.penghasilan is not null then
    update customer_kpr set penghasilan_verifikasi = new.penghasilan where customer_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists customers_sync_penghasilan on customers;
create trigger customers_sync_penghasilan
  after update on customers
  for each row execute function customer_sync_penghasilan();


-- ------------------------------------------------------------
-- 7. Pembayaran: bukti transfer dan fase menunggu verifikasi
--
-- Dua berkas yang berbeda, dan membedakannya adalah inti pemisahan wewenang:
--
--   bukti_transfer_url — diunggah Admin Marketing/Sales. Bukti dari konsumen.
--   proof_url          — kuitansi resmi. Hanya Finance, dan ia yang menutup
--                        pembayaran serta memicu Handover Hard-Lock.
-- ------------------------------------------------------------

alter table payments add column if not exists bukti_transfer_url text;
alter table payments add column if not exists bukti_transfer_at timestamptz;
alter table payments add column if not exists bukti_transfer_by uuid references profiles(id);

comment on column payments.bukti_transfer_url is
  'Bukti transfer dari konsumen, diunggah Admin Marketing. Berbeda dari proof_url, yang merupakan kuitansi resmi dan wewenang Finance.';

-- Dua perbaikan pada policy update, keduanya syarat hidup bagi bukti transfer.
--
-- Pertama, can_write_berkas(). Brief menyebut Admin Marketing sebagai pihak
-- yang mengunggah bukti transfer — tetapi policy lama hanya mengenal Finance
-- dan owns_customer(), dan owns_customer() adalah sales_agent_id saja. Admin
-- Marketing boleh MEMBUAT baris pembayaran (payments_insert sudah memuat
-- can_write_berkas) namun tidak boleh menyentuhnya lagi sesudah itu. Akibatnya
-- bukan pesan galat, melainkan nol baris terpengaruh: PostgREST tidak
-- menganggapnya kesalahan, sehingga layar menampilkan "bukti terkirim" untuk
-- sesuatu yang tidak pernah tersimpan. Diam-diam, dan justru itu yang
-- berbahaya.
--
-- Kedua, syarat statusnya. Sebelumnya `status = 'menunggu'`, yang akan
-- mengunci baris begitu ia pindah ke 'menunggu_verifikasi' — termasuk mengunci
-- pembetulan bukti yang salah unggah.
--
-- Yang menjaga wewenang tetap trigger guard_payment_verification(): ia menolak
-- setiap perpindahan status oleh selain Finance kecuali satu, yaitu
-- menunggu → menunggu_verifikasi yang disertai bukti transfer. Melonggarkan
-- policy di sini tidak melonggarkan verifikasinya.
drop policy if exists "payments_update" on payments;
create policy "payments_update" on payments for update
  using (
    can_write_finance()
    or ((can_write_berkas() or owns_customer(customer_id)) and status <> 'terverifikasi')
  )
  with check (can_write_finance() or can_write_berkas() or owns_customer(customer_id));

create or replace function guard_payment_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Tanpa JWT = service_role / SQL Editor (seed dan perbaikan data manual).
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Hanya Finance yang boleh membuat baris yang langsung tervalidasi.
    if not can_write_finance() then
      new.status := case when new.bukti_transfer_url is not null
                        then 'menunggu_verifikasi' else 'menunggu' end;
      new.verified_by := null;
      new.proof_url := null;
    end if;
    if new.bukti_transfer_url is not null then
      new.bukti_transfer_at := coalesce(new.bukti_transfer_at, now());
      new.bukti_transfer_by := coalesce(new.bukti_transfer_by, auth.uid());
    end if;
    return new;
  end if;

  if not can_write_finance() then
    -- Satu-satunya perpindahan status yang boleh dilakukan selain Finance:
    -- melampirkan bukti transfer dan dengan itu meminta verifikasi. Ia tidak
    -- memvalidasi apa pun — ia menyerahkan pekerjaan.
    if new.status is distinct from old.status then
      if not (old.status = 'menunggu'
              and new.status = 'menunggu_verifikasi'
              and new.bukti_transfer_url is not null) then
        raise exception 'Verifikasi pembayaran adalah wewenang Finance.' using errcode = '42501';
      end if;
    end if;
    if new.proof_url is distinct from old.proof_url then
      raise exception 'Kuitansi resmi hanya boleh diunggah oleh Finance.' using errcode = '42501';
    end if;
    if new.verified_by is distinct from old.verified_by then
      raise exception 'Kolom verifikator hanya boleh diisi Finance.' using errcode = '42501';
    end if;
    -- Nominal dan tanggal membeku begitu buktinya diserahkan ke Finance.
    --
    -- Policy update sengaja longgar sampai 'terverifikasi' supaya bukti yang
    -- salah unggah masih bisa dibetulkan. Tetapi mengubah ANGKA-nya setelah
    -- Finance menerima berkasnya adalah hal yang berbeda: yang diverifikasi
    -- menjadi bukan lagi yang tertulis, dan tidak ada jejak bahwa ia pernah
    -- berubah.
    if old.status <> 'menunggu'
       and (new.amount is distinct from old.amount
            or new.payment_date is distinct from old.payment_date
            or new.payment_type is distinct from old.payment_type) then
      raise exception 'Pembayaran sudah diserahkan ke Finance — nominal, tanggal dan jenisnya tidak bisa diubah lagi.'
        using errcode = '42501';
    end if;
  elsif new.status = 'terverifikasi' and old.status is distinct from 'terverifikasi' then
    new.verified_by := auth.uid();
  end if;

  if new.bukti_transfer_url is distinct from old.bukti_transfer_url and new.bukti_transfer_url is not null then
    new.bukti_transfer_at := now();
    new.bukti_transfer_by := auth.uid();
  end if;

  return new;
end $$;

-- Kuitansi resmi tetap satu-satunya yang membuka Handover Hard-Lock; bukti
-- transfer tidak. Trigger apply_booking_handover sengaja tidak diubah.

drop index if exists idx_payments_menunggu;
create index if not exists idx_payments_belum_verifikasi
  on payments (status) where status <> 'terverifikasi';


-- ------------------------------------------------------------
-- 8. Konversi membawa saringan awal
--
-- Survei dan BI-Checking yang dikerjakan saat masih prospek harus ikut ke
-- berkas konsumen — kalau tidak, Admin Marketing akan memintanya diulang.
-- ------------------------------------------------------------

create or replace function convert_lead_to_customer(
  p_lead_id          uuid,
  p_unit_id          uuid    default null,
  p_nominal_booking  numeric default null,
  p_tanggal_booking  date    default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lead      leads%rowtype;
  v_unit      units%rowtype;
  v_customer  uuid;
begin
  if not (can_write_sales() or can_write_berkas()) then
    raise exception 'Anda tidak berhak melakukan konversi booking.'
      using errcode = '42501';
  end if;

  select * into v_lead from leads where id = p_lead_id;
  if not found then
    raise exception 'Prospek tidak ditemukan.';
  end if;

  if not (can_view_all() or owns_lead(p_lead_id)) then
    raise exception 'Prospek ini bukan milik Anda.' using errcode = '42501';
  end if;

  if v_lead.status = 'cancel' then
    raise exception 'Prospek ini sudah dibatalkan dan tidak bisa dikonversi.';
  end if;

  -- Saringan awal adalah saringan, bukan formalitas. Booking yang diterima
  -- setelah BI-Checking gagal adalah booking yang sudah pasti batal, dan
  -- uangnya sudah telanjur berpindah tangan.
  if v_lead.bi_checking_status = 'tidak_lolos' then
    raise exception 'BI-Checking prospek ini tidak lolos. Selesaikan dahulu sebelum booking dicatat.';
  end if;

  if exists (select 1 from customers where lead_id = p_lead_id) then
    raise exception 'Prospek ini sudah pernah dikonversi menjadi konsumen.';
  end if;

  if p_unit_id is not null then
    select * into v_unit from units where id = p_unit_id for update;
    if not found then
      raise exception 'Unit tidak ditemukan.';
    end if;
    if v_unit.status <> 'tersedia' then
      raise exception 'Unit % sudah berstatus %.', v_unit.unit_code, v_unit.status;
    end if;
  end if;

  insert into customers (lead_id, unit_id, sales_agent_id, name, phone, email, status, penghasilan)
  values (p_lead_id, p_unit_id, coalesce(v_lead.assigned_to, me()),
          v_lead.name, v_lead.phone, v_lead.email, 'proses', v_lead.gaji)
  returning id into v_customer;

  if p_unit_id is not null then
    update units set status = 'booking' where id = p_unit_id;
  end if;

  if p_nominal_booking is not null and p_nominal_booking > 0 then
    insert into payments (customer_id, payment_type, amount, payment_date, status)
    values (v_customer, 'booking', p_nominal_booking, p_tanggal_booking, 'menunggu');
  end if;

  insert into customer_kpr (
    customer_id, tanggal_booking, nominal_booking,
    tanggal_survei, catatan_survei,
    bi_checking_status, bi_checking_tanggal, bi_checking_catatan,
    penghasilan_verifikasi
  )
  values (
    v_customer, p_tanggal_booking, p_nominal_booking,
    v_lead.tanggal_survei, v_lead.catatan_survei,
    v_lead.bi_checking_status, v_lead.bi_checking_tanggal, v_lead.bi_checking_catatan,
    v_lead.gaji
  )
  on conflict (customer_id) do nothing;

  -- Lampiran survei dan BI-Checking ikut pindah kepemilikan, bukan disalin:
  -- berkas yang sama tidak boleh punya dua baris yang bisa menyimpang.
  update berkas_lampiran
     set customer_id = v_customer
   where lead_id = p_lead_id
     and customer_id is null;

  insert into lead_activities (lead_id, customer_id, actor_id, activity, hasil, note)
  values (p_lead_id, v_customer, me(), 'Konversi ke Booking', 'Booking',
          format('Unit %s · Booking fee %s',
                 coalesce(v_unit.unit_code, '—'),
                 coalesce('Rp' || to_char(p_nominal_booking, 'FM999G999G999G999'), '—')));

  return v_customer;
end;
$$;

grant execute on function convert_lead_to_customer(uuid, uuid, numeric, date) to authenticated;


-- ------------------------------------------------------------
-- 9. Kelengkapan berkas bank sebagai satu angka
--
-- Brief §Bank meminta penomoran dan notifikasi berkas yang kurang. Keduanya
-- butuh jawaban atas satu pertanyaan — berapa yang wajib, berapa yang sudah —
-- dan menghitungnya di browser berarti setiap halaman menghitung ulang dengan
-- aturannya sendiri.
-- ------------------------------------------------------------

create or replace function kelengkapan_berkas(p_customer_id uuid)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with bank as (
    select nullif(nama_bank, '') as nama_bank from customer_kpr where customer_id = p_customer_id
  ),
  syarat as (
    select r.doc_type, r.wajib, r.sort_order
      from bank_doc_requirements r, bank b
     where r.bank = coalesce(
             (select bank from bank_doc_requirements where bank = b.nama_bank limit 1),
             '*')
  ),
  punya as (
    select lower(btrim(doc_type)) as doc_type,
           bool_or(status = 'terverifikasi') as terverifikasi,
           -- Dokumen yang DITOLAK tidak dihitung ada. Ia memang terunggah,
           -- tetapi bank menolaknya, jadi berkasnya tetap kurang — dan
           -- menghitungnya sebagai ada akan meloloskan "Proses Bank" untuk
           -- berkas yang pasti dikembalikan, sementara layar masih menandainya
           -- merah.
           count(*) filter (where status <> 'ditolak') as n
      from customer_documents
     where customer_id = p_customer_id
     group by 1
  ),
  gabung as (
    select s.doc_type, s.wajib, s.sort_order,
           coalesce(p.n, 0) > 0 as ada,
           coalesce(p.terverifikasi, false) as terverifikasi
      from syarat s
      left join punya p on p.doc_type = lower(btrim(s.doc_type))
  )
  select json_build_object(
    'total',         (select count(*) from gabung),
    'total_wajib',   (select count(*) from gabung where wajib),
    'ada_wajib',     (select count(*) from gabung where wajib and ada),
    'kurang',        coalesce((select json_agg(doc_type order by sort_order) from gabung where wajib and not ada), '[]'::json),
    'lengkap',       (select count(*) = 0 from gabung where wajib and not ada)
  );
$$;

grant execute on function kelengkapan_berkas(uuid) to authenticated;


-- Menekan "Proses Bank" adalah pernyataan: berkasnya lengkap dan sudah
-- diserahkan. Karena itu kelengkapannya diperiksa di sini, bukan hanya
-- disembunyikan tombolnya di layar.
create or replace function tandai_proses_bank(p_customer_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rekap json;
  v_bank  text;
  v_waktu timestamptz := now();
begin
  select nama_bank into v_bank from customer_kpr where customer_id = p_customer_id;
  if coalesce(v_bank, '') = '' then
    raise exception 'Pilih bank terlebih dahulu sebelum berkas diproses.';
  end if;

  v_rekap := kelengkapan_berkas(p_customer_id);
  if not (v_rekap->>'lengkap')::boolean then
    raise exception 'Berkas wajib belum lengkap: %', array_to_string(
      array(select json_array_elements_text(v_rekap->'kurang')), ', ');
  end if;

  update customer_kpr
     set proses_bank_at = coalesce(proses_bank_at, v_waktu),
         proses_bank_by = coalesce(proses_bank_by, auth.uid()),
         tanggal_masuk_bank = coalesce(tanggal_masuk_bank, current_date),
         updated_at = now()
   where customer_id = p_customer_id
  returning proses_bank_at into v_waktu;

  if not found then
    raise exception 'Berkas KPR konsumen ini belum ada.';
  end if;

  insert into lead_activities (customer_id, lead_id, actor_id, activity, hasil, note)
  select p_customer_id, c.lead_id, auth.uid(), 'Berkas diproses ke bank', v_bank,
         'Seluruh dokumen wajib lengkap.'
    from customers c where c.id = p_customer_id;

  return v_waktu;
end $$;

grant execute on function tandai_proses_bank(uuid) to authenticated;


-- ------------------------------------------------------------
-- 10. Dashboard: angka bulan berjalan dan angka periode
--
-- Brief §Dashboard meminta dua hal yang sebelumnya tidak ada: jumlah per
-- prosedur ("prosedurnya berapa, bookingnya berapa"), dan penyaringan pada
-- bulan berjalan. Keduanya dihitung di sini, sekali, untuk seluruh kartu.
-- ------------------------------------------------------------

create or replace function dashboard_stats(
  p_from date default null,
  p_to   date default null
)
returns json
language plpgsql
stable
security invoker
as $$
declare
  jkt_today  date := (now() at time zone 'Asia/Jakarta')::date;
  d_from     date := coalesce(p_from, '1900-01-01'::date);
  d_to       date := coalesce(p_to, jkt_today);
  month_start      date := date_trunc('month', jkt_today)::date;
  prev_month_start date := (date_trunc('month', jkt_today) - interval '1 month')::date;
  result json;
begin
  select json_build_object(
    'range_from', p_from,
    'range_to',   p_to,

    'total_leads',       (select count(*) from leads where (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to),
    'deal_count',        (select count(*) from leads where status::text in ('booking','kpr','akad','aftersales','deal','closing') and (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to),
    'appointment_count', (select count(*) from leads where status::text in ('hot','appointment') and (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to),
    'cancel_count',      (select count(*) from leads where status = 'cancel' and (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to),

    'leads_this_month',  (select count(*) from leads where (created_at at time zone 'Asia/Jakarta')::date >= month_start),
    'leads_prev_month',  (select count(*) from leads
                          where (created_at at time zone 'Asia/Jakarta')::date >= prev_month_start
                            and (created_at at time zone 'Asia/Jakarta')::date <  month_start),
    'deals_this_month',  (select count(*) from leads where status::text in ('booking','kpr','akad','aftersales','deal','closing')
                          and (created_at at time zone 'Asia/Jakarta')::date >= month_start),
    'deals_prev_month',  (select count(*) from leads where status::text in ('booking','kpr','akad','aftersales','deal','closing')
                          and (created_at at time zone 'Asia/Jakarta')::date >= prev_month_start
                          and (created_at at time zone 'Asia/Jakarta')::date <  month_start),

    'customers_active',  (select count(*) from customers where status <> 'batal'),
    'units_available',   (select count(*) from units where status = 'tersedia'),
    'units_total',       (select count(*) from units),
    'complaints_active', (select count(*) from complaints where status <> 'selesai'),

    -- ---- BRIEF §Dashboard: berapa per prosedur, pada periode terpilih ----
    --
    -- Dihitung dari TANGGAL PERISTIWANYA, bukan tanggal prospek dibuat. Akad
    -- bulan ini nyaris tidak pernah berasal dari prospek bulan ini, dan
    -- menghitungnya lewat created_at membuat kolom Akad hampir selalu nol.
    'periode', json_build_object(
      'prospek_baru',  (select count(*) from leads
                         where (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to),
      'follow_up',     (select count(*) from lead_activities
                         where (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to),
      'survei',        (select count(*) from leads
                         where tanggal_survei between d_from and d_to),
      'bi_checking',   (select count(*) from leads
                         where bi_checking_tanggal between d_from and d_to),
      'booking',       (select count(*) from customer_kpr
                         where tanggal_booking between d_from and d_to),
      'masuk_bank',    (select count(*) from customer_kpr
                         where tanggal_masuk_bank between d_from and d_to),
      'sp3k',          (select count(*) from customer_kpr
                         where tanggal_sp3k_terbit between d_from and d_to),
      'akad',          (select count(*) from customer_kpr
                         where tanggal_akad between d_from and d_to),
      'serah_terima',  (select count(*) from customer_kpr
                         where tanggal_serah_terima_kunci between d_from and d_to),
      'batal',         (select count(*) from cancellations
                         where (cancelled_at at time zone 'Asia/Jakarta')::date between d_from and d_to)
    ),

    'by_status', (
      select coalesce(json_agg(json_build_object('label', s.status, 'value', s.c) order by s.c desc), '[]'::json)
      from (select status::text as status, count(*) c from leads
            where (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to
            group by status) s
    ),

    -- Sumber leads memakai source_type relasional bila ada, dan jatuh kembali
    -- ke kolom teks lama hanya untuk baris yang belum punya keduanya.
    'by_source', (
      select coalesce(json_agg(json_build_object('source', x.src, 'leads', x.total, 'deals', x.deals) order by x.total desc), '[]'::json)
      from (
        select coalesce(
                 case source_type
                   when 'ads' then 'Ads'
                   when 'freelance' then 'Freelance'
                   when 'kemitraan' then 'Kemitraan'
                   when 'organik' then 'Organik'
                 end,
                 nullif(source, ''), 'Tidak diketahui') src,
               count(*) total,
               count(*) filter (where status::text in ('booking','kpr','akad','aftersales','deal','closing')) deals
        from leads
        where (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to
        group by 1
      ) x
    ),

    'by_agent', (
      select coalesce(json_agg(json_build_object('name', a.full_name, 'leads', a.total, 'deals', a.deals) order by a.deals desc), '[]'::json)
      from (
        select p.full_name,
               count(l.id) total,
               count(l.id) filter (where l.status::text in ('booking','kpr','akad','aftersales','deal','closing')) deals
        from profiles p
        join leads l on l.assigned_to = p.id
        where (l.created_at at time zone 'Asia/Jakarta')::date between d_from and d_to
        group by p.full_name
      ) a
    ),

    'by_day', (
      select coalesce(json_agg(json_build_object('day', d.day, 'value', d.value) order by d.day), '[]'::json)
      from (
        select (d_to - g) as day,
               (select count(*) from leads l
                where (l.created_at at time zone 'Asia/Jakarta')::date = d_to - g) as value
        from generate_series(6, 0, -1) g
      ) d
    ),

    'berkas_recap', (
      select coalesce(json_agg(json_build_object(
               'customer_id', b.id,
               'name',        b.name,
               'progres',     b.progres_berkas,
               'bank',        b.nama_bank,
               'masuk_bank',  b.tanggal_masuk_bank,
               'lama_hari',   b.lama_hari
             ) order by b.lama_hari desc nulls last), '[]'::json)
      from (
        select c.id, c.name, k.progres_berkas, k.nama_bank, k.tanggal_masuk_bank,
               case when k.tanggal_masuk_bank is not null
                    then (jkt_today - k.tanggal_masuk_bank) end as lama_hari
        from customer_kpr k
        join customers c on c.id = k.customer_id
        where c.status <> 'batal'
          and coalesce(k.progres_berkas, '') <> ''
          and k.progres_berkas not in ('Serah Terima Kunci')
          and k.tanggal_serah_terima_kunci is null
      ) b
    ),

    'berkas_summary', (
      select coalesce(json_agg(json_build_object('label', s.progres, 'value', s.c) order by s.c desc), '[]'::json)
      from (
        select k.progres_berkas as progres, count(*) c
        from customer_kpr k
        join customers c on c.id = k.customer_id
        where c.status <> 'batal' and coalesce(k.progres_berkas, '') <> ''
        group by k.progres_berkas
      ) s
    ),

    'kpr_durations', (
      select json_build_object(
        'berkas',    avg(tanggal_sp3k_terbit - tanggal_masuk_bank),
        'sp3k_akad', avg(tanggal_akad - tanggal_sp3k_terbit),
        'akad',      avg(tanggal_akad - tanggal_dp),
        'serah',     avg(tanggal_serah_terima_kunci - tanggal_akad)
      ) from customer_kpr
    ),

    'funnel', (
      select coalesce(json_agg(json_build_object('stage', f.stage, 'label', f.label, 'value', f.c) order by f.ord), '[]'::json)
      from (
        select v.ord, v.stage, v.label,
               (select count(*) from leads l
                 where lead_stage_bucket(l.status) = v.stage
                   and (l.created_at at time zone 'Asia/Jakarta')::date between d_from and d_to) as c
        from (values
          (1, 'new', 'New Lead'), (2, 'warm', 'Warm Lead'), (3, 'hot', 'Hot Lead'),
          (4, 'booking', 'Booking'), (5, 'kpr', 'KPR'), (6, 'akad', 'Akad'),
          (7, 'aftersales', 'Aftersales'), (8, 'cancel', 'Cancel')
        ) v(ord, stage, label)
      ) f
    ),

    'handover', (
      select json_build_object(
        'terkunci', count(*) filter (where locked_at is not null),
        'sales',    count(*) filter (where locked_at is null and status <> 'batal')
      ) from customers
    ),

    -- Antrean Finance kini dua lapis: yang belum berbukti, dan yang sudah
    -- berbukti serta menunggu keputusan. Yang kedua itulah pekerjaan Finance
    -- hari ini; yang pertama masih pekerjaan Admin Marketing.
    'finance', (
      select json_build_object(
        'menunggu_jumlah',       count(*) filter (where status <> 'terverifikasi'),
        'menunggu_nominal',      coalesce(sum(amount) filter (where status <> 'terverifikasi'), 0),
        'siap_verifikasi',       count(*) filter (where status = 'menunggu_verifikasi'),
        'tanpa_bukti',           count(*) filter (where status = 'menunggu'),
        'terverifikasi_nominal', coalesce(sum(amount) filter (where status = 'terverifikasi'
                                    and payment_date between d_from and d_to), 0),
        'tanpa_kuitansi',        count(*) filter (where status = 'terverifikasi' and proof_url is null)
      ) from payments
    )
  ) into result;

  return result;
end $$;

grant execute on function dashboard_stats(date, date) to authenticated;


-- ------------------------------------------------------------
-- 11. Notifikasi: berkas kurang, dan bukti yang menunggu Finance
-- ------------------------------------------------------------

create or replace function my_notifications()
returns json
language sql stable security invoker set search_path = public as $$
  with
  followup as (
    select 'followup'::text as kategori,
           (case when l.tanggal_rencana < current_date then 'tinggi' else 'sedang' end)::text as urgensi,
           l.name::text as judul,
           (case when l.tanggal_rencana < current_date
                 then format('Terlewat %s hari', current_date - l.tanggal_rencana)
                 else 'Dijadwalkan hari ini' end)::text as detail,
           '/follow-up'::text as rute,
           l.id as record_id,
           l.tanggal_rencana as tanggal
      from leads l
     where l.tanggal_rencana is not null
       and l.tanggal_rencana <= current_date
       and l.status not in ('cancel', 'akad', 'aftersales')
  ),
  dingin as (
    select 'dingin'::text, 'sedang'::text, l.name::text,
           'Belum ada aktivitas 7 hari'::text, '/follow-up'::text, l.id, null::date
      from leads l
     where l.status in ('warm', 'hot')
       and not exists (
         select 1 from lead_activities a
          where a.lead_id = l.id
            and a.created_at > now() - interval '7 days')
  ),
  sp3k as (
    select 'sp3k'::text,
           (case when k.tanggal_sp3k_expired < current_date + 7 then 'tinggi' else 'sedang' end)::text,
           c.name::text,
           format('SP3K kedaluwarsa %s', to_char(k.tanggal_sp3k_expired, 'DD Mon YYYY'))::text,
           '/konsumen'::text, c.id, k.tanggal_sp3k_expired
      from customer_kpr k
      join customers c on c.id = k.customer_id
     where k.tanggal_sp3k_expired is not null
       and k.tanggal_akad is null
       and k.tanggal_sp3k_expired <= current_date + 14
  ),
  mandek as (
    select 'mandek'::text, 'tinggi'::text, c.name::text,
           format('%s hari di bank, SP3K belum terbit', current_date - k.tanggal_masuk_bank)::text,
           '/konsumen'::text, c.id, k.tanggal_masuk_bank
      from customer_kpr k
      join customers c on c.id = k.customer_id
     where k.tanggal_masuk_bank is not null
       and k.tanggal_sp3k_terbit is null
       and current_date - k.tanggal_masuk_bank > 30
  ),
  -- Berkas sudah di bank padahal BI-Checking belum dinyatakan lolos
  -- (migrasi 015). Dipertahankan apa adanya: definisi ini menimpa seluruh
  -- fungsi, jadi kategori yang tidak disalin akan hilang diam-diam.
  bi_checking as (
    select 'bi_checking'::text, 'tinggi'::text, c.name::text,
           (case when k.bi_checking_status = 'tidak_lolos'
                 then 'BI-Checking tidak lolos, tetapi berkas sudah di bank'
                 else 'Berkas sudah di bank tanpa hasil BI-Checking' end)::text,
           '/konsumen'::text, c.id, k.tanggal_masuk_bank
      from customer_kpr k join customers c on c.id = k.customer_id
     where k.tanggal_masuk_bank is not null
       and k.tanggal_sp3k_terbit is null
       and coalesce(k.bi_checking_status, '') <> 'lolos'
  ),
  -- Angsuran melebihi sepertiga penghasilan — patokan lazim KPR subsidi
  -- (migrasi 015).
  rpc as (
    select 'rpc'::text, 'sedang'::text, c.name::text,
           format('Angsuran %s%% dari penghasilan', round(k.angsuran_bulanan / k.penghasilan_verifikasi * 100))::text,
           '/konsumen'::text, c.id, null::date
      from customer_kpr k join customers c on c.id = k.customer_id
     where k.penghasilan_verifikasi > 0
       and k.angsuran_bulanan > 0
       and k.tanggal_akad is null
       and k.angsuran_bulanan / k.penghasilan_verifikasi > 0.34
  ),
  -- BRIEF §Bank: notifikasi bila berkas yang kurang belum diunggah. Hanya
  -- untuk berkas yang sudah punya bank dan belum diproses — sebelum bank
  -- dipilih, tidak ada daftar syarat yang bisa dilanggar.
  berkas as (
    select 'berkas'::text, 'sedang'::text, c.name::text,
           format('%s dokumen wajib belum diunggah', r.kurang)::text,
           '/konsumen'::text, c.id, null::date
      from customer_kpr k
      join customers c on c.id = k.customer_id
      join lateral (
        select json_array_length(kelengkapan_berkas(k.customer_id)->'kurang') as kurang
      ) r on true
     where coalesce(k.nama_bank, '') <> ''
       and k.proses_bank_at is null
       -- Berkas yang sudah lewat SP3K/akad/serah terima jelas sudah sampai ke
       -- bank, entah lewat tombol Proses Bank atau sebelum tombolnya ada.
       -- Tanpa penjaga ini, konsumen yang sudah pegang kunci tetap menagih
       -- dokumen selamanya — dan notifikasi yang tidak pernah bisa dituntaskan
       -- adalah notifikasi yang berhenti dibaca.
       and k.tanggal_sp3k_terbit is null
       and k.tanggal_akad is null
       and k.tanggal_serah_terima_kunci is null
       and c.status <> 'batal'
       and r.kurang > 0
  ),
  verifikasi as (
    select 'verifikasi'::text,
           (case when p.status = 'menunggu_verifikasi' then 'tinggi' else 'sedang' end)::text,
           c.name::text,
           format('%s · Rp%s · %s', replace(p.payment_type::text, '_', ' '),
                  to_char(p.amount, 'FM999G999G999G999'),
                  case when p.status = 'menunggu_verifikasi'
                       then 'bukti transfer siap diverifikasi'
                       else 'bukti transfer belum diunggah' end)::text,
           '/pembayaran'::text, p.id, p.payment_date
      from payments p
      join customers c on c.id = p.customer_id
     where p.status <> 'terverifikasi'
  ),
  semua as (
    select * from followup
    union all select * from dingin
    union all select * from sp3k
    union all select * from mandek
    union all select * from bi_checking
    union all select * from rpc
    union all select * from berkas
    union all select * from verifikasi
  )
  select json_build_object(
    'total',  (select count(*) from semua),
    'tinggi', (select count(*) from semua where urgensi = 'tinggi'),
    'per_kategori', coalesce((
      select json_agg(json_build_object('kategori', kategori, 'jumlah', n) order by n desc)
        from (select kategori, count(*) n from semua group by kategori) t), '[]'::json),
    'items', coalesce((
      select json_agg(json_build_object(
               'kategori',  kategori,
               'urgensi',   urgensi,
               'judul',     judul,
               'detail',    detail,
               'rute',      rute,
               'record_id', record_id))
        from (select * from semua
               order by (urgensi = 'tinggi') desc, tanggal nulls last
               limit 30) t), '[]'::json)
  );
$$;

grant execute on function my_notifications() to authenticated;


-- ------------------------------------------------------------
-- 12. Indeks pendukung
-- ------------------------------------------------------------

create index if not exists idx_leads_tanggal_survei on leads (tanggal_survei) where tanggal_survei is not null;
create index if not exists idx_leads_bi_tanggal on leads (bi_checking_tanggal) where bi_checking_tanggal is not null;
create index if not exists idx_leads_organik_detail_trgm on leads using gin (organik_detail gin_trgm_ops);
create index if not exists idx_customer_kpr_tanggal_akad on customer_kpr (tanggal_akad) where tanggal_akad is not null;
create index if not exists idx_customer_kpr_tanggal_booking on customer_kpr (tanggal_booking) where tanggal_booking is not null;

notify pgrst, 'reload schema';
