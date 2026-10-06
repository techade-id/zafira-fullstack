-- ============================================================
-- Zafira Property — Migration 018
-- Peringatan nomor telepon ganda saat mencatat atau mengubah prospek.
--
-- Pengecekan dari browser tidak cukup, karena dua hal:
--
--   1. RLS leads membatasi Sales pada prospek miliknya sendiri. Nomor yang
--      sudah dipegang agen lain tidak pernah terlihat — padahal justru itu
--      yang ingin dicegah: dua Sales menghubungi calon pembeli yang sama.
--   2. Nomor tersimpan apa adanya ("0812-…", "+62 812…", "62812…"), dan filter
--      PostgREST tidak bisa menyamakan ketiganya.
--
-- Fungsi ini membandingkan nomor yang sudah dirapikan, lintas agen, tetapi
-- nama dan id prospek hanya dibuka kepada yang memang berhak melihatnya.
-- Kepada Sales lain cukup disebut siapa agen pemegangnya.
--
-- Peringatan, bukan larangan: satu nomor kadang memang dipakai bersama,
-- misalnya suami-istri yang sama-sama mencari rumah.
--
-- Aman dijalankan ulang.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Nomor dalam bentuk baku: hanya angka, diawali 0.
--    "+62 812-3456-7890", "62812…", dan "812…" semuanya menjadi "0812…".
-- ------------------------------------------------------------

create or replace function nomor_normal(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when d = '' then null
    when d like '62%' then '0' || substr(d, 3)
    when d like '8%' then '0' || d
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

-- Pengecekan berjalan pada setiap ketikan nomor (dengan jeda), jadi
-- perbandingannya tidak boleh memindai seluruh tabel.
create index if not exists leads_nomor_normal_idx on leads (nomor_normal(phone));


-- ------------------------------------------------------------
-- 2. Prospek lain dengan nomor yang sama.
--
--    p_kecuali: id prospek yang sedang diubah, agar ia tidak memperingatkan
--    dirinya sendiri.
-- ------------------------------------------------------------

create or replace function cek_nomor_prospek(p_phone text, p_kecuali uuid default null)
returns table (lead_id uuid, nama text, tahap text, agen text, milik_saya boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when can_view_all() or l.assigned_to = me() then l.id end,
    case when can_view_all() or l.assigned_to = me() then l.name end,
    case when can_view_all() or l.assigned_to = me() then l.status::text end,
    p.full_name,
    coalesce(l.assigned_to = me(), false)
  from leads l
  left join profiles p on p.id = l.assigned_to
  -- me() bernilai NULL untuk anon dan akun nonaktif: keduanya tidak mendapat
  -- apa pun, termasuk konfirmasi bahwa sebuah nomor ada di sistem.
  where me() is not null
    -- Nomor yang baru setengah diketik tidak dicocokkan.
    and length(nomor_normal(p_phone)) >= 9
    and nomor_normal(l.phone) = nomor_normal(p_phone)
    and (p_kecuali is null or l.id <> p_kecuali)
  order by coalesce(l.assigned_to = me(), false) desc, l.created_at desc
  limit 3;
$$;

grant execute on function nomor_normal(text) to authenticated;
grant execute on function cek_nomor_prospek(text, uuid) to authenticated;
