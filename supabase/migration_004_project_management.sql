-- ============================================================
-- Griya Zafira — Migration 004
-- Brings the construction side in line with the team's
-- "Zafira Project Management Dashboard" spreadsheet:
--   * Rencana Proyek — tasks with 4 stages, working-day deadlines, warranty
--   * Contractor evaluation — 3 criteria scored per stage, plus complaints
--   * Complaints — contractor attribution, warranty window, severity weight
--   * Working calendar — weekend config + holiday list
--
-- Additive: nothing is dropped, existing rows are untouched.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Key/value app settings + holiday calendar
-- ------------------------------------------------------------

create table if not exists app_settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

drop policy if exists "app_settings_read_all" on app_settings;
create policy "app_settings_read_all" on app_settings for select using (true);
drop policy if exists "app_settings_write_admin_manager" on app_settings;
create policy "app_settings_write_admin_manager" on app_settings for all
  using (current_role_name() in ('admin','manager'));

-- Spreadsheet "Setting": Sabtu is a working day, Minggu is not.
insert into app_settings (key, value, description) values
  ('sabtu_libur',        'false', 'Hitung Sabtu sebagai hari libur saat menghitung deadline'),
  ('minggu_libur',       'true',  'Hitung Minggu sebagai hari libur saat menghitung deadline'),
  ('hari_garansi_default','100',  'Masa garansi standar (hari) sejak serah terima kunci'),
  ('penalti_per_bobot',  '0.5',   'Pengurang Nilai Akhir kontraktor per 1 poin bobot komplain')
on conflict (key) do nothing;

create table if not exists holidays (
  tanggal date primary key,
  keterangan text
);

alter table holidays enable row level security;

drop policy if exists "holidays_read_all" on holidays;
create policy "holidays_read_all" on holidays for select using (true);
drop policy if exists "holidays_write_admin_manager" on holidays;
create policy "holidays_write_admin_manager" on holidays for all
  using (current_role_name() in ('admin','manager'));

-- ------------------------------------------------------------
-- 2. Working-day deadline — the WORKDAY.INTL equivalent
--    (start + N working days, skipping configured weekends + holidays)
-- ------------------------------------------------------------

create or replace function workday_deadline(p_start date, p_days numeric)
returns date
language plpgsql
stable
as $$
declare
  d date := p_start;
  remaining int := ceil(coalesce(p_days, 0));
  sab_libur boolean;
  min_libur boolean;
  guard int := 0;
begin
  if p_start is null or remaining <= 0 then
    return p_start;
  end if;

  select coalesce((select value = 'true' from app_settings where key = 'sabtu_libur'), false) into sab_libur;
  select coalesce((select value = 'true' from app_settings where key = 'minggu_libur'), true) into min_libur;

  while remaining > 0 and guard < 20000 loop
    guard := guard + 1;
    d := d + 1;
    continue when sab_libur and extract(dow from d) = 6;   -- Saturday
    continue when min_libur and extract(dow from d) = 0;   -- Sunday
    continue when exists (select 1 from holidays h where h.tanggal = d);
    remaining := remaining - 1;
  end loop;

  return d;
end $$;

-- ------------------------------------------------------------
-- 3. Rencana Proyek — one row per task/activity
-- ------------------------------------------------------------

create table if not exists project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  contractor_id uuid references contractors(id),
  -- Either a unit ("… - F - 01") or general work ("Pekerjaan Urugan").
  task_name text not null,
  unit_id uuid references units(id),
  dokumen_kerja_url text,
  pic text,
  tanggal_mulai date,
  working_days numeric(6,1),
  rencana_deadline date,          -- derived, see trigger
  tahap_1 date,
  tahap_2 date,
  tahap_3 date,
  tahap_4 date,
  tanggal_realisasi_selesai date,
  overtime boolean not null default false,   -- derived
  hari_garansi int,
  akhir_masa_garansi date,        -- derived
  created_at timestamptz not null default now()
);

create index if not exists project_tasks_contractor_idx on project_tasks (contractor_id);
create index if not exists project_tasks_project_idx on project_tasks (project_id);

alter table project_tasks enable row level security;

drop policy if exists "project_tasks_read_all" on project_tasks;
create policy "project_tasks_read_all" on project_tasks for select using (true);
drop policy if exists "project_tasks_write_admin_manager" on project_tasks;
create policy "project_tasks_write_admin_manager" on project_tasks for all
  using (current_role_name() in ('admin','manager'));

-- Deadline, overtime flag and warranty end are always derived, never typed in,
-- so they cannot drift from the dates they depend on.
create or replace function compute_project_task_dates()
returns trigger
language plpgsql
as $$
begin
  new.rencana_deadline := workday_deadline(new.tanggal_mulai, new.working_days);

  new.overtime := new.tanggal_realisasi_selesai is not null
                  and new.rencana_deadline is not null
                  and new.tanggal_realisasi_selesai > new.rencana_deadline;

  new.akhir_masa_garansi := case
    when new.tanggal_realisasi_selesai is not null and new.hari_garansi is not null
      then new.tanggal_realisasi_selesai + new.hari_garansi
    else null
  end;

  return new;
end $$;

drop trigger if exists project_tasks_compute_dates on project_tasks;
create trigger project_tasks_compute_dates
  before insert or update on project_tasks
  for each row execute function compute_project_task_dates();

-- ------------------------------------------------------------
-- 4. Evaluation — three criteria scored per stage (Tahap 1..4)
-- ------------------------------------------------------------

create table if not exists task_evaluations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references project_tasks(id) on delete cascade,
  tahap int not null check (tahap between 1 and 4),
  kerapian int check (kerapian between 1 and 5),
  spesifikasi int check (spesifikasi between 1 and 5),
  ketepatan_waktu int check (ketepatan_waktu between 1 and 5),
  catatan text,
  evaluated_by uuid references profiles(id),
  evaluated_at timestamptz not null default now(),
  unique (task_id, tahap)
);

alter table task_evaluations enable row level security;

drop policy if exists "task_evaluations_read_all" on task_evaluations;
create policy "task_evaluations_read_all" on task_evaluations for select using (true);
drop policy if exists "task_evaluations_write_admin_manager" on task_evaluations;
create policy "task_evaluations_write_admin_manager" on task_evaluations for all
  using (current_role_name() in ('admin','manager'));

-- ------------------------------------------------------------
-- 5. Complaints — contractor, warranty window, severity weight, repair
-- ------------------------------------------------------------

alter table complaints add column if not exists contractor_id uuid references contractors(id);
alter table complaints add column if not exists tanggal_komplain date default current_date;
alter table complaints add column if not exists tanggal_serah_terima_kunci date;
alter table complaints add column if not exists akhir_masa_garansi date;
alter table complaints add column if not exists jenis_komplain text;          -- Ringan / Sedang / Berat
alter table complaints add column if not exists bobot_nilai numeric(5,2);
alter table complaints add column if not exists selesai_perbaikan boolean not null default false;
alter table complaints add column if not exists tanggal_selesai_perbaikan date;

-- Warranty end follows the handover date; status is derived at read time so it
-- can never go stale.
create or replace function compute_complaint_warranty()
returns trigger
language plpgsql
as $$
declare
  default_garansi int;
begin
  select coalesce((select value::int from app_settings where key = 'hari_garansi_default'), 100)
    into default_garansi;

  if new.tanggal_serah_terima_kunci is not null and new.akhir_masa_garansi is null then
    new.akhir_masa_garansi := new.tanggal_serah_terima_kunci + default_garansi;
  end if;

  -- Severity weight comes from business_settings so the client can retune it
  -- without a code change.
  if new.jenis_komplain is not null and new.bobot_nilai is null then
    select (select nullif(split_part(bs.value, ':', 2), '')::numeric
            from business_settings bs
            where bs.category = 'bobot_komplain'
              and split_part(bs.value, ':', 1) = new.jenis_komplain
            limit 1)
      into new.bobot_nilai;
  end if;

  if new.selesai_perbaikan and new.tanggal_selesai_perbaikan is null then
    new.tanggal_selesai_perbaikan := current_date;
  end if;

  return new;
end $$;

drop trigger if exists complaints_compute_warranty on complaints;
create trigger complaints_compute_warranty
  before insert or update on complaints
  for each row execute function compute_complaint_warranty();

-- ------------------------------------------------------------
-- 6. Contractor scorecard
--
-- Mirrors the spreadsheet: each criterion is summed across every evaluated
-- stage and divided by (4 x number of distinct tasks), so a task that has
-- only been part-evaluated scores proportionally lower.
-- Nilai Akhir = mean of the three criteria, minus the complaint penalty
-- (penalti_per_bobot x average complaint weight per task).
-- ------------------------------------------------------------

create or replace function contractor_scorecard(
  p_project_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table (
  contractor_id uuid,
  contractor_name text,
  jumlah_task bigint,
  jumlah_selesai bigint,
  rata_kerapian numeric,
  rata_spesifikasi numeric,
  rata_ketepatan numeric,
  jumlah_komplain bigint,
  total_bobot numeric,
  nilai_akhir numeric
)
language sql
stable
as $$
  with penalti as (
    select coalesce((select value::numeric from app_settings where key = 'penalti_per_bobot'), 0.5) as f
  ),
  tasks as (
    select t.* from project_tasks t
    where (p_project_id is null or t.project_id = p_project_id)
      and (p_from is null or t.tanggal_mulai >= p_from)
      and (p_to   is null or t.tanggal_mulai <= p_to)
  ),
  agg as (
    select
      c.id, c.name,
      count(distinct t.id)                                   as jumlah_task,
      count(distinct t.id) filter (where t.tanggal_realisasi_selesai is not null) as jumlah_selesai,
      coalesce(sum(e.kerapian), 0)::numeric                  as sum_kerapian,
      coalesce(sum(e.spesifikasi), 0)::numeric               as sum_spesifikasi,
      coalesce(sum(e.ketepatan_waktu), 0)::numeric           as sum_ketepatan
    from contractors c
    join tasks t on t.contractor_id = c.id
    left join task_evaluations e on e.task_id = t.id
    group by c.id, c.name
  ),
  kompl as (
    select k.contractor_id, count(*) as jml, coalesce(sum(k.bobot_nilai), 0) as bobot
    from complaints k
    where k.contractor_id is not null
    group by k.contractor_id
  )
  select
    a.id,
    a.name,
    a.jumlah_task,
    a.jumlah_selesai,
    round(a.sum_kerapian    / nullif(4 * a.jumlah_task, 0), 2),
    round(a.sum_spesifikasi / nullif(4 * a.jumlah_task, 0), 2),
    round(a.sum_ketepatan   / nullif(4 * a.jumlah_task, 0), 2),
    coalesce(k.jml, 0),
    coalesce(k.bobot, 0),
    round(
      greatest(
        coalesce((a.sum_kerapian + a.sum_spesifikasi + a.sum_ketepatan)
                 / nullif(3 * 4 * a.jumlah_task, 0), 0)
        - (select f from penalti) * coalesce(k.bobot, 0) / nullif(a.jumlah_task, 0),
        0
      ), 2)
  from agg a
  left join kompl k on k.contractor_id = a.id
  order by 10 desc nulls last;
$$;

grant execute on function workday_deadline(date, numeric) to authenticated;
grant execute on function contractor_scorecard(uuid, date, date) to authenticated;

-- ------------------------------------------------------------
-- 7. Seed the reference lists that appear in the spreadsheet
-- ------------------------------------------------------------

insert into business_settings (category, value, sort_order) values
  ('pic', 'Risman', 1),
  ('pic', 'Naufal', 2),
  ('jenis_pekerjaan', 'Pekerjaan Urugan', 1),
  ('jenis_pekerjaan', 'Pembangunan Taman', 2),
  ('jenis_pekerjaan', 'Pekerjaan Pengerasan Jalan', 3),
  ('jenis_pekerjaan', 'Pekerjaan Drainase', 4),
  ('jenis_pekerjaan', 'Pekerjaan Pembuatan Gate', 5),
  ('jenis_pekerjaan', 'Pekerjaan Pembangunan Pos Satpam', 6),
  -- stored as "<label>:<weight>" so the weight is editable in the UI
  ('bobot_komplain', 'Ringan:1', 1),
  ('bobot_komplain', 'Sedang:2', 2),
  ('bobot_komplain', 'Berat:3', 3)
on conflict (category, value) do nothing;

-- contractors has no unique constraint on name, so ON CONFLICT DO NOTHING would
-- not stop a re-run from duplicating every row (and double-counting scores).
insert into contractors (name)
select v.name
from (values ('Rozikin'), ('Slamet'), ('Deddy Dwi Atmoro'), ('Nasif'), ('Rizqi'), ('Wahidun')) as v(name)
where not exists (select 1 from contractors c where c.name = v.name);
