-- ============================================================
-- Zafira Property — Migration 007
-- REVISI §1.3 / PRD §2.2: fitur Find pada Notes.
--
--   * pg_trgm + index GIN  -> ILIKE '%kata%' tetap cepat di puluhan ribu baris
--   * search_snippet()     -> potongan teks di sekitar kata yang dicari
--   * search_notes()       -> pencarian global lintas modul, RLS tetap berlaku
--
-- Aman dijalankan ulang.
-- ============================================================

create extension if not exists pg_trgm;

-- ------------------------------------------------------------
-- 1. Index trigram
--
-- Index B-tree biasa tidak melayani pola '%kata%' (kata di TENGAH teks), dan
-- full-text search hanya cocok per-kata utuh — sedangkan notula meminta
-- partial string match. GIN trigram adalah satu-satunya yang memenuhi keduanya.
-- ------------------------------------------------------------

create index if not exists idx_leads_notes_trgm       on leads              using gin (notes gin_trgm_ops);
create index if not exists idx_leads_name_trgm        on leads              using gin (name gin_trgm_ops);
create index if not exists idx_leads_phone_trgm       on leads              using gin (phone gin_trgm_ops);
create index if not exists idx_leads_rencana_trgm     on leads              using gin (rencana_selanjutnya gin_trgm_ops);
create index if not exists idx_lead_act_note_trgm     on lead_activities    using gin (note gin_trgm_ops);
create index if not exists idx_lead_act_activity_trgm on lead_activities    using gin (activity gin_trgm_ops);
create index if not exists idx_customers_name_trgm    on customers          using gin (name gin_trgm_ops);
create index if not exists idx_customers_phone_trgm   on customers          using gin (phone gin_trgm_ops);
create index if not exists idx_kpr_kendala_trgm       on customer_kpr       using gin (kendala gin_trgm_ops);
create index if not exists idx_payments_notes_trgm    on payments           using gin (notes gin_trgm_ops);
create index if not exists idx_complaints_desc_trgm   on complaints         using gin (description gin_trgm_ops);
create index if not exists idx_complaints_res_trgm    on complaints         using gin (resolution_notes gin_trgm_ops);
create index if not exists idx_field_reports_kdl_trgm on field_reports      using gin (kendala gin_trgm_ops);
create index if not exists idx_field_reports_sol_trgm on field_reports      using gin (solusi gin_trgm_ops);
create index if not exists idx_cancellations_rsn_trgm on cancellations      using gin (reason gin_trgm_ops);
create index if not exists idx_cancellations_dtl_trgm on cancellations      using gin (detail gin_trgm_ops);
create index if not exists idx_contractors_notes_trgm on contractors        using gin (notes gin_trgm_ops);

-- ------------------------------------------------------------
-- 2. Cuplikan hasil pencarian
--
-- Menampilkan potongan teks di sekitar kata yang dicari, bukan 70 karakter
-- pertama — kalau kata yang dicari ada di karakter ke-400, pengguna harus
-- tetap bisa melihatnya di daftar hasil.
--
-- position()/substr() bekerja per KARAKTER (bukan byte), jadi nama atau
-- catatan yang memuat emoji tidak terpotong di tengah karakter.
-- ------------------------------------------------------------

create or replace function search_snippet(p_text text, p_q text, p_width int default 90)
returns text
language sql
immutable
as $$
  with f as (
    select p_text as t,
           position(lower(p_q) in lower(coalesce(p_text, ''))) as pos
  ), b as (
    select t, pos, greatest(1, pos - 30) as start from f
  )
  select case
    when t is null or t = '' then null
    when pos = 0 then left(t, p_width) || case when length(t) > p_width then '…' else '' end
    else case when start > 1 then '…' else '' end
         || substr(t, start, p_width)
         || case when length(t) > start + p_width - 1 then '…' else '' end
  end
  from b;
$$;

-- ------------------------------------------------------------
-- 3. Pencarian global
--
-- SECURITY INVOKER (default) dipertahankan dengan sengaja: RLS tiap tabel
-- tetap berlaku, sehingga Sales hanya menemukan catatan miliknya sendiri.
-- Mengubahnya jadi SECURITY DEFINER akan membocorkan seluruh basis data
-- lewat kotak pencarian.
--
-- plpgsql (bukan SQL polos) supaya pola LIKE berada di variabel — bentuk yang
-- dikenali planner sebagai konstanta, sehingga index trigram terpakai.
-- ------------------------------------------------------------

drop function if exists search_notes(text, int);

create or replace function search_notes(p_q text, p_limit int default 50)
returns table (
  modul       text,
  record_id   uuid,
  rute        text,
  judul       text,
  cuplikan    text,
  field_cocok text,
  tanggal     timestamptz,
  aktor       text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_raw text := btrim(coalesce(p_q, ''));
  v_pat text;
begin
  -- Di bawah 3 karakter index trigram tidak terpakai dan kueri berubah jadi
  -- sequential scan pada setiap tabel. Lebih baik tidak mengembalikan apa pun.
  if length(v_raw) < 3 then
    return;
  end if;

  -- Tanpa ini, mengetik '%' akan cocok dengan seluruh isi tabel.
  v_pat := '%' || replace(replace(replace(v_raw, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select * from (
    -- Prospek: catatan, nama, telepon, rencana
    select 'Prospek'::text, l.id, '/prospek'::text, l.name,
           search_snippet(coalesce(l.notes, l.rencana_selanjutnya), v_raw),
           case when l.notes ilike v_pat then 'Catatan'
                when l.name ilike v_pat then 'Nama'
                when l.phone ilike v_pat then 'Telepon'
                else 'Rencana' end,
           l.created_at, p.full_name
    from leads l
    left join profiles p on p.id = l.assigned_to
    where l.notes ilike v_pat or l.name ilike v_pat
       or l.phone ilike v_pat or l.rencana_selanjutnya ilike v_pat

    union all
    -- Riwayat follow-up — inti dari "riwayat komunikasi" pada notula.
    -- Catatan bisa menempel ke prospek ATAU ke konsumen (catatan pasca-booking
    -- yang tetap boleh ditulis Sales), jadi judul dan rutenya mengikuti mana
    -- pun yang terisi.
    select 'Follow Up',
           coalesce(a.lead_id, a.customer_id),
           case when a.lead_id is not null then '/prospek' else '/konsumen' end,
           coalesce(l.name, c.name, '(data terhapus)'),
           search_snippet(coalesce(a.note, a.activity), v_raw),
           case when a.note ilike v_pat then 'Catatan' else 'Aktivitas' end,
           a.created_at, p.full_name
    from lead_activities a
    left join leads l on l.id = a.lead_id
    left join customers c on c.id = a.customer_id
    left join profiles p on p.id = a.actor_id
    where a.note ilike v_pat or a.activity ilike v_pat

    union all
    select 'Konsumen', c.id, '/konsumen', c.name,
           search_snippet(coalesce(c.address, c.phone), v_raw),
           case when c.name ilike v_pat then 'Nama'
                when c.phone ilike v_pat then 'Telepon' else 'Alamat' end,
           c.created_at, p.full_name
    from customers c
    left join profiles p on p.id = c.sales_agent_id
    where c.name ilike v_pat or c.phone ilike v_pat or c.address ilike v_pat

    union all
    select 'Progres KPR', k.customer_id, '/konsumen', c.name,
           search_snippet(k.kendala, v_raw), 'Kendala',
           k.updated_at, null
    from customer_kpr k
    join customers c on c.id = k.customer_id
    where k.kendala ilike v_pat

    union all
    select 'Pembayaran', pm.id, '/pembayaran', c.name,
           search_snippet(pm.notes, v_raw), 'Catatan',
           pm.created_at, null
    from payments pm
    join customers c on c.id = pm.customer_id
    where pm.notes ilike v_pat

    union all
    select 'Komplain', k.id, '/komplain', coalesce(c.name, k.category, 'Komplain'),
           search_snippet(coalesce(k.description, k.resolution_notes), v_raw),
           case when k.description ilike v_pat then 'Deskripsi' else 'Penyelesaian' end,
           k.created_at, p.full_name
    from complaints k
    left join customers c on c.id = k.customer_id
    left join profiles p on p.id = k.assigned_to
    where k.description ilike v_pat or k.resolution_notes ilike v_pat

    union all
    select 'Laporan Lapangan', r.id, '/rencana-proyek', to_char(r.report_date, 'DD/MM/YYYY'),
           search_snippet(coalesce(r.kendala, r.solusi), v_raw),
           case when r.kendala ilike v_pat then 'Kendala' else 'Solusi' end,
           r.created_at, p.full_name
    from field_reports r
    left join profiles p on p.id = r.reporter_id
    where r.kendala ilike v_pat or r.solusi ilike v_pat

    union all
    select 'Pembatalan', cx.customer_id, '/pembatalan', c.name,
           search_snippet(coalesce(cx.detail, cx.reason), v_raw),
           case when cx.reason ilike v_pat then 'Alasan' else 'Detail' end,
           cx.cancelled_at, p.full_name
    from cancellations cx
    join customers c on c.id = cx.customer_id
    left join profiles p on p.id = cx.cancelled_by
    where cx.reason ilike v_pat or cx.detail ilike v_pat

    union all
    select 'Kontraktor', k.id, '/kontraktor', k.name,
           search_snippet(k.notes, v_raw), 'Catatan',
           k.created_at, null
    from contractors k
    where k.notes ilike v_pat
  ) hits(modul, record_id, rute, judul, cuplikan, field_cocok, tanggal, aktor)
  order by hits.tanggal desc nulls last
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;

grant execute on function search_snippet(text, text, int) to authenticated;
grant execute on function search_notes(text, int) to authenticated;

-- Tanpa ini PostgREST bisa terus menjawab "Could not find the function
-- search_notes in the schema cache" sampai Supabase reload sendiri.
notify pgrst, 'reload schema';
