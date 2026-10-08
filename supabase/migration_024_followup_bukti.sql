-- ============================================================
-- Zafira Property — Migration 024
-- Tanggal follow-up dan bukti follow-up.
--
-- Dua hal yang diminta:
--   1. Follow-up punya tanggalnya sendiri. Selama ini satu-satunya waktu
--      yang tersimpan adalah created_at — kapan catatan DIKETIK, bukan kapan
--      prospeknya DIHUBUNGI. Sales yang mencatat kunjungan kemarin sore hari
--      ini membuat "Kontak Terakhir" dan aturan dingin 14 hari bergeser satu
--      hari, dan tidak ada cara mengoreksinya.
--   2. Setiap follow-up prospek wajib berbukti — screenshot chat atau log
--      panggilan, foto survei, foto pertemuan.
--
-- Isinya:
--   · lead_activities.tanggal_followup (date). created_at tetap ada sebagai
--     jejak audit: kapan dicatat, terpisah dari kapan terjadi. Baris lama
--     diisi dari created_at; baris baru yang tidak menyebutkannya juga —
--     termasuk catatan sistem (pembatalan, pengalihan, konversi).
--     Tanggal ke depan ditolak; ke belakang bebas.
--   · berkas_lampiran.activity_id + slot 'followup': bukti menempel pada
--     catatan follow-up yang dibuktikannya.
--   · catat_followup(): satu transaksi untuk catatan, bukti, jadwal
--     berikutnya, dan — untuk Survei Lokasi — tanggal survei Saringan Awal.
--     Sebelumnya catatan dan jadwal adalah dua permintaan terpisah, sehingga
--     yang satu bisa tersimpan sementara yang lain gagal.
--   · lead_temperature() dan refresh_lead_temperature() membaca tanggal
--     follow-up, bukan created_at.
--
-- Aman dijalankan ulang.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Tanggal follow-up
-- ------------------------------------------------------------

alter table lead_activities add column if not exists tanggal_followup date;

update lead_activities
   set tanggal_followup = (created_at at time zone 'Asia/Jakarta')::date
 where tanggal_followup is null;

-- Satu trigger untuk dua aturan: mengisi tanggal yang tidak disebutkan, dan
-- menolak tanggal yang belum terjadi. Diisi dari created_at, bukan dari hari
-- ini, supaya baris yang memang dicatat mundur (data impor, uji) tetap jujur.
create or replace function lead_activities_tanggal()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tanggal_followup is null then
    new.tanggal_followup := (coalesce(new.created_at, now()) at time zone 'Asia/Jakarta')::date;
  end if;
  if new.tanggal_followup > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal follow-up tidak boleh melewati hari ini.';
  end if;
  return new;
end $$;

drop trigger if exists lead_activities_tanggal on lead_activities;
create trigger lead_activities_tanggal
  before insert or update of tanggal_followup on lead_activities
  for each row execute function lead_activities_tanggal();

alter table lead_activities alter column tanggal_followup set not null;

create index if not exists idx_lead_activities_lead_tanggal
  on lead_activities (lead_id, tanggal_followup desc, created_at desc);

comment on column lead_activities.tanggal_followup is
  'Kapan prospek dihubungi. created_at adalah kapan catatannya diketik.';


-- ------------------------------------------------------------
-- 2. Bukti follow-up
-- ------------------------------------------------------------

-- SET NULL, bukan CASCADE: bukti survei juga lampiran Saringan Awal dan ikut
-- ke berkas KPR. Menghapus sebuah catatan tidak boleh ikut menghapus foto
-- survei yang sudah menjadi bagian berkas.
alter table berkas_lampiran
  add column if not exists activity_id uuid references lead_activities(id) on delete set null;

create index if not exists idx_berkas_lampiran_activity on berkas_lampiran (activity_id);

alter table berkas_lampiran drop constraint if exists berkas_lampiran_slot_check;
alter table berkas_lampiran add constraint berkas_lampiran_slot_check check (slot in (
  'survei', 'bi_checking',
  'sp3k_terbit', 'sp3k_perpanjangan',
  'akad', 'berita_acara',
  'bphtb', 'shm',
  'followup'
));


-- ------------------------------------------------------------
-- 3. catat_followup()
-- ------------------------------------------------------------

drop function if exists catat_followup(uuid, date, text, text, text, jsonb, date, text, text);

create or replace function catat_followup(
  p_lead_id         uuid,
  p_tanggal         date,
  p_aktivitas       text,
  p_hasil           text,
  p_catatan         text,
  p_lampiran        jsonb,   -- [{ "path": "<lead_id>/followup/...", "nama": "chat.jpg" }, ...]
  p_tanggal_rencana date,
  p_rencana         text default null,
  p_kategori        text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_survei  boolean := btrim(coalesce(p_aktivitas, '')) = 'Survei Lokasi';
  v_id      uuid;
  v_jumlah  int;
begin
  if btrim(coalesce(p_aktivitas, '')) = '' then
    raise exception 'Pilih jenis follow-up.';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal follow-up wajib diisi.';
  end if;
  if btrim(coalesce(p_hasil, '')) = '' and btrim(coalesce(p_catatan, '')) = '' then
    raise exception 'Isi hasil follow-up atau catatannya.';
  end if;
  if p_tanggal_rencana is null then
    raise exception 'Tentukan kapan prospek ini akan dihubungi lagi.';
  end if;
  if p_lampiran is null or jsonb_typeof(p_lampiran) <> 'array' or jsonb_array_length(p_lampiran) = 0 then
    raise exception 'Bukti follow-up wajib dilampirkan.';
  end if;

  -- SECURITY INVOKER: setiap tulisan di bawah tunduk pada RLS. Prospek milik
  -- agen lain — atau pemanggil yang hanya boleh melihat — berhenti di sini,
  -- sebelum apa pun tertulis.
  update leads
     set tanggal_rencana     = p_tanggal_rencana,
         rencana_selanjutnya = nullif(btrim(coalesce(p_rencana, '')), ''),
         kategori_rencana    = nullif(btrim(coalesce(p_kategori, '')), ''),
         -- Survei Lokasi mengisi Saringan Awal: tanggal survei terakhir.
         tanggal_survei      = case when v_survei then greatest(tanggal_survei, p_tanggal) else tanggal_survei end,
         updated_at          = now()
   where id = p_lead_id;
  if not found then
    raise exception 'Prospek tidak ditemukan atau bukan milik Anda.' using errcode = '42501';
  end if;

  insert into lead_activities (lead_id, tanggal_followup, activity, hasil, note)
  values (
    p_lead_id,
    p_tanggal,
    btrim(p_aktivitas),
    nullif(btrim(coalesce(p_hasil, '')), ''),
    nullif(concat_ws(E'\n',
      nullif(btrim(coalesce(p_catatan, '')), ''),
      'Rencana: ' || nullif(btrim(coalesce(p_rencana, '')), '')
    ), '')
  )
  returning id into v_id;

  -- Hanya berkas di folder prospek ini. Bucket berkas-lampiran bisa dibaca
  -- siapa pun yang masuk dan aksesnya dijaga lewat baris di tabel ini — jadi
  -- path milik prospek lain akan membuka berkas yang bukan haknya.
  insert into berkas_lampiran (lead_id, slot, file_url, file_name, activity_id)
  select p_lead_id,
         case when v_survei then 'survei' else 'followup' end,
         e->>'path',
         nullif(btrim(coalesce(e->>'nama', '')), ''),
         v_id
    from jsonb_array_elements(p_lampiran) e
   where coalesce(e->>'path', '') like p_lead_id::text || '/%';
  get diagnostics v_jumlah = row_count;

  if v_jumlah <> jsonb_array_length(p_lampiran) then
    raise exception 'Bukti follow-up tidak valid — unggah ulang berkasnya.';
  end if;

  return v_id;
end $$;

grant execute on function catat_followup(uuid, date, text, text, text, jsonb, date, text, text) to authenticated;

comment on function catat_followup(uuid, date, text, text, text, jsonb, date, text, text) is
  'Mencatat follow-up prospek beserta buktinya dan jadwal berikutnya dalam satu transaksi. Survei Lokasi ikut mengisi tanggal survei Saringan Awal.';


-- ------------------------------------------------------------
-- 4. Suhu membaca tanggal follow-up
--
-- Isi kedua fungsi sama dengan migration_017; yang berubah hanya urutan
-- "catatan terakhir" dan ukuran kemandekan — keduanya kini tanggal
-- follow-up. Catatan yang dicatat mundur tidak lagi bisa menimpa keadaan
-- yang lebih baru hanya karena ia diketik belakangan.
-- ------------------------------------------------------------

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
  v_terakhir   date;
  v_survei     date;
  v_bi         text;
begin
  select l.tanggal_survei, l.bi_checking_status into v_survei, v_bi
    from leads l where l.id = p_lead_id;

  if v_bi = 'tidak_lolos' then
    return 'cold';
  end if;

  select a.tanggal_followup, concat_ws(' ', a.hasil, a.activity, a.note)
    into v_terakhir, v_teks
    from lead_activities a
   where a.lead_id = p_lead_id
   order by a.tanggal_followup desc, a.created_at desc
   limit 1;

  if v_terakhir is null then
    if v_bi = 'lolos' or v_survei is not null then
      return 'hot';
    end if;
    return 'warm';
  end if;

  -- Kata pada catatan TERAKHIR menang atas survei dan BI-Checking.
  v_dari_teks := lead_temperature_from_text(v_teks);
  if v_dari_teks is not null then
    return v_dari_teks;
  end if;

  -- Didiamkan dua minggu setelah kontak terakhir: dingin.
  if v_terakhir < (now() at time zone 'Asia/Jakarta')::date - 14 then
    return 'cold';
  end if;

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

create or replace function refresh_lead_temperature()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ubah int;
begin
  with terakhir as (
    select l.id,
           a.tanggal_followup,
           lead_temperature_from_text(concat_ws(' ', a.hasil, a.activity, a.note)) as dari_teks
      from leads l
      join lateral (
        select tanggal_followup, created_at, hasil, activity, note
          from lead_activities
         where lead_id = l.id
         order by tanggal_followup desc, created_at desc
         limit 1
      ) a on true
     where l.status::text in ('leads', 'baru', 'warm', 'hot', 'dihubungi', 'appointment')
       and coalesce(l.bi_checking_status, '') <> 'tidak_lolos'
  ),
  sasaran as (
    select id from terakhir
     where dari_teks is null
       and tanggal_followup < (now() at time zone 'Asia/Jakarta')::date - 14
  )
  update leads
     set status = 'cold', updated_at = now()
   where id in (select id from sasaran);

  get diagnostics v_ubah = row_count;
  return v_ubah;
end $$;
