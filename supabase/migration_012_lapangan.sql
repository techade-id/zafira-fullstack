-- ============================================================
-- Zafira Property — Migration 012
-- Monitoring Lapangan: mengaktifkan field_projects / field_reports.
--
-- Kedua tabel ini ada sejak schema.sql tetapi tidak pernah punya UI tulis —
-- hanya SiteplanPage yang membacanya untuk menampilkan progres di modal.
-- Migrasi ini melengkapi bagian yang hilang agar tim lapangan bisa melapor:
--
--   1. reporter_id terisi sendiri dari sesi
--   2. Satu tim melihat seluruh laporan pada proyek yang sama
--   3. Progres dan status proyek ditarik dari laporan terakhir
--   4. Indeks untuk riwayat laporan dan pencarian catatan
--
-- Aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Pelapor terisi otomatis
--
-- Policy field_reports menuntut reporter_id = me(). Membiarkannya diisi
-- frontend berarti satu kelalaian kecil membuat laporan tersimpan tanpa
-- pemilik lalu langsung hilang dari pandangan pembuatnya sendiri — pola yang
-- persis sama dengan bug assigned_to pada leads.
-- ------------------------------------------------------------

alter table field_reports alter column reporter_id set default auth.uid();

-- ------------------------------------------------------------
-- 2. Satu tim, satu riwayat
--
-- Sebelumnya anggota tim hanya dapat membaca laporan yang ia tulis sendiri,
-- sehingga rekan satu unit tidak bisa melihat kendala yang sudah dilaporkan
-- kemarin — dan akan melaporkannya lagi.
-- ------------------------------------------------------------

create or replace function on_field_project(p_field_project_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from field_projects fp
    where fp.id = p_field_project_id and me() = any(fp.assigned_team)
  );
$$;
grant execute on function on_field_project(uuid) to authenticated;

drop policy if exists "field_reports_select" on field_reports;
create policy "field_reports_select" on field_reports for select
  using (can_view_all() or reporter_id = me() or on_field_project(field_project_id));

-- Hak TULIS sengaja tidak memakai `reporter_id = me()`.
--
-- Sejak reporter_id punya default auth.uid(), predikat itu selalu benar untuk
-- siapa pun yang aktif: cukup menyisipkan baris tanpa menyebut reporter_id,
-- dan WITH CHECK lolos sendiri. Peran read-only pun bisa menulis laporan.
-- Yang menentukan hak tulis adalah penugasan pada proyeknya.
--
-- Pengawas juga dikeluarkan di sini: mengaudit sistem bukan berarti
-- mengerjakan unit (PRD §3.1 menyebutnya read-only atas operasional).
drop policy if exists "field_reports_write" on field_reports;
create policy "field_reports_write" on field_reports for all
  using (is_admin() or can_write_berkas() or on_field_project(field_project_id))
  with check (is_admin() or can_write_berkas() or on_field_project(field_project_id));

-- Alasan yang sama untuk penugasan tim: itu tindakan operasional, bukan
-- konfigurasi bisnis.
drop policy if exists "field_projects_write" on field_projects;
create policy "field_projects_write" on field_projects for all
  using (is_admin() or can_write_berkas() or me() = any(assigned_team))
  with check (is_admin() or can_write_berkas() or me() = any(assigned_team));

-- ------------------------------------------------------------
-- 3. Progres proyek mengikuti laporan terakhir
--
-- Angka progres diketik di laporan lapangan. Kalau field_projects.progress_percent
-- juga diisi terpisah, keduanya pasti berbeda cepat atau lambat — dan siteplan
-- di kantor akan menampilkan angka yang sudah basi. Satu sumber saja: laporan.
--
-- Status ikut turunan: 100% berarti selesai, lewat target tapi belum selesai
-- berarti terlambat, ada progres berarti berjalan.
-- ------------------------------------------------------------

create or replace function sync_field_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_progress int;
  v_target date;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  -- Laporan terbaru menurut tanggal laporan, bukan waktu input: laporan
  -- susulan untuk kemarin tidak boleh menimpa kondisi hari ini.
  select r.progress_percent into v_progress
  from field_reports r
  where r.field_project_id = new.field_project_id
    and r.progress_percent is not null
  order by r.report_date desc, r.created_at desc
  limit 1;

  if v_progress is null then
    return null;
  end if;

  select fp.target_end_date into v_target from field_projects fp where fp.id = new.field_project_id;

  update field_projects
     set progress_percent = v_progress,
         status = case
           when v_progress >= 100 then 'selesai'
           when v_target is not null and v_today > v_target then 'terlambat'
           when v_progress > 0 then 'berjalan'
           else 'belum_mulai'
         end::field_status,
         actual_end_date = case
           when v_progress >= 100 then coalesce(actual_end_date, v_today)
           else actual_end_date
         end
   where id = new.field_project_id;

  return null;
end $$;

drop trigger if exists field_reports_sync_progress on field_reports;
create trigger field_reports_sync_progress
  after insert or update on field_reports
  for each row execute function sync_field_progress();

-- ------------------------------------------------------------
-- 4. Indeks
-- ------------------------------------------------------------

create index if not exists idx_field_reports_project on field_reports (field_project_id, report_date desc);
create index if not exists idx_field_projects_unit on field_projects (unit_id);
create index if not exists idx_field_projects_team on field_projects using gin (assigned_team);
create index if not exists idx_field_reports_notes_trgm on field_reports using gin (notes gin_trgm_ops);

-- Catatan bebas pada laporan lapangan ikut dicari dari kotak pencarian
-- (migration_007 baru mengindeks kendala dan solusi).
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
  if length(v_raw) < 3 then
    return;
  end if;

  v_pat := '%' || replace(replace(replace(v_raw, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select * from (
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
    -- Laporan lapangan mengarah ke halaman Lapangan, dan catatan bebasnya
    -- ikut tercari sejak migrasi ini.
    select 'Laporan Lapangan', r.field_project_id, '/lapangan',
           coalesce(u.unit_code, to_char(r.report_date, 'DD/MM/YYYY')),
           search_snippet(coalesce(r.kendala, r.solusi, r.notes), v_raw),
           case when r.kendala ilike v_pat then 'Kendala'
                when r.solusi ilike v_pat then 'Solusi'
                else 'Catatan' end,
           r.created_at, p.full_name
    from field_reports r
    left join field_projects fp on fp.id = r.field_project_id
    left join units u on u.id = fp.unit_id
    left join profiles p on p.id = r.reporter_id
    where r.kendala ilike v_pat or r.solusi ilike v_pat or r.notes ilike v_pat

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

grant execute on function search_notes(text, int) to authenticated;

notify pgrst, 'reload schema';
