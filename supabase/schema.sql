-- ============================================================
-- Griya Zafira — Integrated Sales & Field Monitoring System
-- Supabase schema (Postgres)
-- ============================================================

-- ---------- ENUMS ----------
create type user_role as enum ('admin', 'manager', 'sales_agent', 'tim_lapangan');
create type lead_status as enum ('baru', 'dihubungi', 'appointment', 'closing', 'cancel');
create type unit_status as enum ('tersedia', 'booking', 'terjual', 'batal');
create type customer_status as enum ('proses', 'aktif', 'selesai', 'batal');
create type doc_status as enum ('menunggu', 'terverifikasi', 'ditolak');
create type payment_type as enum ('booking', 'dp', 'dana_talangan', 'termin', 'pelunasan', 'lainnya');
create type payment_status as enum ('menunggu', 'terverifikasi');
create type field_status as enum ('belum_mulai', 'berjalan', 'terlambat', 'selesai');
create type complaint_status as enum ('baru', 'diproses', 'selesai');
create type complaint_priority as enum ('rendah', 'sedang', 'tinggi');

-- ---------- PROFILES (extends auth.users) ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'sales_agent',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ---------- PROJECTS (perumahan / cluster) ----------
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  description text,
  siteplan_image_url text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- UNITS (for digital siteplan) ----------
create table units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  unit_code text not null,
  block text,
  type text,
  price numeric(14,2),
  status unit_status not null default 'tersedia',
  -- normalized 0-1 coordinates over the siteplan image, for map pins
  pos_x numeric(5,4),
  pos_y numeric(5,4),
  created_at timestamptz not null default now(),
  unique (project_id, unit_code)
);

-- ---------- LEADS ----------
create table leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  source text,
  status lead_status not null default 'baru',
  assigned_to uuid references profiles(id),
  project_id uuid references projects(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  actor_id uuid references profiles(id),
  activity text not null,
  note text,
  created_at timestamptz not null default now()
);

-- ---------- CUSTOMERS ----------
create table customers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  unit_id uuid references units(id),
  sales_agent_id uuid references profiles(id),
  name text not null,
  phone text,
  email text,
  ktp_number text,
  address text,
  status customer_status not null default 'proses',
  process_started_at timestamptz not null default now(),
  process_completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- CUSTOMER DOCUMENTS (admin progress) ----------
create table customer_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  doc_type text not null, -- e.g. KTP, KK, NPWP, Slip Gaji, Akad
  file_url text,
  status doc_status not null default 'menunggu',
  note text,
  uploaded_at timestamptz not null default now()
);

-- ---------- PAYMENTS (billing history) ----------
create table payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  payment_type payment_type not null,
  amount numeric(14,2) not null,
  payment_date date not null default current_date,
  proof_url text,
  status payment_status not null default 'menunggu',
  verified_by uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- CANCELLATIONS ----------
create table cancellations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  reason text not null,
  detail text,
  cancelled_by uuid references profiles(id),
  cancelled_at timestamptz not null default now()
);

-- ---------- CONTRACTORS ----------
create table contractors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  specialization text,
  notes text,
  created_at timestamptz not null default now()
);

create table contractor_evaluations (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  unit_id uuid references units(id),
  score int not null check (score between 1 and 5),
  notes text,
  evaluated_by uuid references profiles(id),
  evaluated_at timestamptz not null default now()
);

-- ---------- FIELD PROJECTS (construction monitoring per unit) ----------
create table field_projects (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  contractor_id uuid references contractors(id),
  assigned_team uuid[] default '{}', -- array of profile ids (tim lapangan)
  start_date date,
  target_end_date date,
  actual_end_date date,
  status field_status not null default 'belum_mulai',
  progress_percent int not null default 0 check (progress_percent between 0 and 100),
  created_at timestamptz not null default now()
);

-- ---------- FIELD REPORTS (laporan lapangan via mobile) ----------
create table field_reports (
  id uuid primary key default gen_random_uuid(),
  field_project_id uuid not null references field_projects(id) on delete cascade,
  reporter_id uuid references profiles(id),
  report_date date not null default current_date,
  progress_percent int check (progress_percent between 0 and 100),
  kendala text,
  solusi text,
  photo_before_url text,
  photo_after_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- COMPLAINTS ----------
create table complaints (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  unit_id uuid references units(id),
  category text,
  priority complaint_priority not null default 'sedang',
  description text not null,
  photo_url text,
  status complaint_status not null default 'baru',
  assigned_to uuid references profiles(id),
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- ADS / DIGITAL CONTENT ANALYTICS ----------
create table ads_analytics (
  id uuid primary key default gen_random_uuid(),
  platform text not null, -- Instagram, Facebook Ads, TikTok, Google Ads, etc
  campaign_name text,
  report_date date not null,
  spend numeric(12,2) default 0,
  impressions int default 0,
  clicks int default 0,
  leads_generated int default 0,
  created_at timestamptz not null default now()
);

-- ---------- ACTIVITY LOG (audit trail, generic) ----------
create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  actor_id uuid references profiles(id),
  action text not null,
  note text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table projects enable row level security;
alter table units enable row level security;
alter table leads enable row level security;
alter table lead_activities enable row level security;
alter table customers enable row level security;
alter table customer_documents enable row level security;
alter table payments enable row level security;
alter table cancellations enable row level security;
alter table contractors enable row level security;
alter table contractor_evaluations enable row level security;
alter table field_projects enable row level security;
alter table field_reports enable row level security;
alter table complaints enable row level security;
alter table ads_analytics enable row level security;
alter table activity_logs enable row level security;

-- helper: current user's role
create or replace function current_role_name()
returns user_role
language sql
security definer
stable
as $$
  select role from profiles where id = auth.uid();
$$;

-- profiles: everyone can read all profiles (needed for assignment dropdowns); only self can update own row
create policy "profiles_select_all" on profiles for select using (true);
create policy "profiles_update_self" on profiles for update using (id = auth.uid());

-- admin/manager: full access everywhere. sales_agent: own leads/customers/payments.
-- tim_lapangan: own field_projects/field_reports.
-- Pattern repeated per table below (simplified — tighten further per your needs).

create policy "projects_read_all" on projects for select using (true);
create policy "projects_write_admin_manager" on projects for all using (current_role_name() in ('admin','manager'));

create policy "units_read_all" on units for select using (true);
create policy "units_write_admin_manager" on units for all using (current_role_name() in ('admin','manager'));

create policy "leads_read" on leads for select using (
  current_role_name() in ('admin','manager') or assigned_to = auth.uid()
);
create policy "leads_write_own_or_manager" on leads for all using (
  current_role_name() in ('admin','manager') or assigned_to = auth.uid()
);

create policy "lead_activities_rw" on lead_activities for all using (
  current_role_name() in ('admin','manager') or
  exists (select 1 from leads l where l.id = lead_id and l.assigned_to = auth.uid())
);

create policy "customers_read" on customers for select using (
  current_role_name() in ('admin','manager') or sales_agent_id = auth.uid()
);
create policy "customers_write" on customers for all using (
  current_role_name() in ('admin','manager') or sales_agent_id = auth.uid()
);

create policy "customer_documents_rw" on customer_documents for all using (
  current_role_name() in ('admin','manager') or
  exists (select 1 from customers c where c.id = customer_id and c.sales_agent_id = auth.uid())
);

create policy "payments_rw" on payments for all using (
  current_role_name() in ('admin','manager') or
  exists (select 1 from customers c where c.id = customer_id and c.sales_agent_id = auth.uid())
);

create policy "cancellations_rw" on cancellations for all using (
  current_role_name() in ('admin','manager') or
  exists (select 1 from customers c where c.id = customer_id and c.sales_agent_id = auth.uid())
);

create policy "contractors_read_all" on contractors for select using (true);
create policy "contractors_write_admin_manager" on contractors for all using (current_role_name() in ('admin','manager'));

create policy "contractor_eval_read_all" on contractor_evaluations for select using (true);
create policy "contractor_eval_write_admin_manager" on contractor_evaluations for all using (current_role_name() in ('admin','manager'));

create policy "field_projects_read" on field_projects for select using (
  current_role_name() in ('admin','manager') or auth.uid() = any(assigned_team)
);
create policy "field_projects_write" on field_projects for all using (
  current_role_name() in ('admin','manager') or auth.uid() = any(assigned_team)
);

create policy "field_reports_read" on field_reports for select using (
  current_role_name() in ('admin','manager') or reporter_id = auth.uid()
);
create policy "field_reports_write" on field_reports for all using (
  current_role_name() in ('admin','manager') or reporter_id = auth.uid()
);

create policy "complaints_read_all" on complaints for select using (true);
create policy "complaints_write" on complaints for all using (
  current_role_name() in ('admin','manager') or assigned_to = auth.uid()
);

create policy "ads_analytics_read_all" on ads_analytics for select using (true);
create policy "ads_analytics_write_admin_manager" on ads_analytics for all using (current_role_name() in ('admin','manager'));

create policy "activity_logs_read_admin_manager" on activity_logs for select using (current_role_name() in ('admin','manager'));
create policy "activity_logs_insert_all" on activity_logs for insert with check (true);

-- ---------- Auto-create profile row when a new auth user signs up ----------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'sales_agent');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
