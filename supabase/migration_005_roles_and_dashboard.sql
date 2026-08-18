-- ============================================================
-- Griya Zafira — Migration 005
-- Follow-up to the client meeting on 14/08/2026:
--   * new roles: marketing, supervisor, administrasi (pemberkasan)
--   * dashboard date-range filter
--   * dashboard recap of customers currently collecting documents
--   * lead-source totals surfaced on the dashboard
--
-- Safe to re-run.
-- ============================================================

-- ---------- 1. New roles ----------
-- Enum values must be committed before anything references them.
alter type user_role add value if not exists 'marketing';
alter type user_role add value if not exists 'supervisor';
alter type user_role add value if not exists 'administrasi';

commit;

-- ---------- 2. Access helpers ----------
-- Role lists were repeated across ~28 policies; centralising them here means a
-- future role change is one edit rather than a sweep through every table.
--
--   marketing    -> same reach as sales_agent (only their own leads/customers)
--   supervisor   -> same reach as manager (everything)
--   administrasi -> pemberkasan: every customer's documents, KPR and payments,
--                   but no write access to the sales pipeline itself

create or replace function is_full_access()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name()::text in ('admin', 'manager', 'supervisor'), false);
$$;

create or replace function is_berkas_access()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name()::text in ('admin', 'manager', 'supervisor', 'administrasi'), false);
$$;

grant execute on function is_full_access() to authenticated;
grant execute on function is_berkas_access() to authenticated;

-- ---------- 3. Re-point policies at the helpers ----------

drop policy if exists "profiles_update_admin_manager" on profiles;
create policy "profiles_update_admin_manager" on profiles for update using (is_full_access());

drop policy if exists "projects_write_admin_manager" on projects;
create policy "projects_write_admin_manager" on projects for all using (is_full_access());

drop policy if exists "units_write_admin_manager" on units;
create policy "units_write_admin_manager" on units for all using (is_full_access());

drop policy if exists "leads_read" on leads;
create policy "leads_read" on leads for select using (is_full_access() or assigned_to = auth.uid());
drop policy if exists "leads_write_own_or_manager" on leads;
create policy "leads_write_own_or_manager" on leads for all using (is_full_access() or assigned_to = auth.uid());

drop policy if exists "lead_activities_rw" on lead_activities;
create policy "lead_activities_rw" on lead_activities for all using (
  is_full_access() or exists (select 1 from leads l where l.id = lead_id and l.assigned_to = auth.uid())
);

-- customers / berkas / payments: administrasi needs these across all agents
drop policy if exists "customers_read" on customers;
create policy "customers_read" on customers for select using (is_berkas_access() or sales_agent_id = auth.uid());
drop policy if exists "customers_write" on customers;
create policy "customers_write" on customers for all using (is_full_access() or sales_agent_id = auth.uid());

drop policy if exists "customer_documents_rw" on customer_documents;
create policy "customer_documents_rw" on customer_documents for all using (
  is_berkas_access() or exists (select 1 from customers c where c.id = customer_id and c.sales_agent_id = auth.uid())
);

drop policy if exists "customer_kpr_rw" on customer_kpr;
create policy "customer_kpr_rw" on customer_kpr for all using (
  is_berkas_access() or exists (select 1 from customers c where c.id = customer_id and c.sales_agent_id = auth.uid())
);

drop policy if exists "payments_rw" on payments;
create policy "payments_rw" on payments for all using (
  is_berkas_access() or exists (select 1 from customers c where c.id = customer_id and c.sales_agent_id = auth.uid())
);

drop policy if exists "cancellations_rw" on cancellations;
create policy "cancellations_rw" on cancellations for all using (
  is_full_access() or exists (select 1 from customers c where c.id = customer_id and c.sales_agent_id = auth.uid())
);

drop policy if exists "sales_targets_write_admin_manager" on sales_targets;
create policy "sales_targets_write_admin_manager" on sales_targets for all using (is_full_access());

drop policy if exists "business_settings_write_admin_manager" on business_settings;
create policy "business_settings_write_admin_manager" on business_settings for all using (is_full_access());

drop policy if exists "customer_transfers_write_admin_manager" on customer_transfers;
create policy "customer_transfers_write_admin_manager" on customer_transfers for all using (is_full_access());

drop policy if exists "contractors_write_admin_manager" on contractors;
create policy "contractors_write_admin_manager" on contractors for all using (is_full_access());

drop policy if exists "contractor_eval_write_admin_manager" on contractor_evaluations;
create policy "contractor_eval_write_admin_manager" on contractor_evaluations for all using (is_full_access());

drop policy if exists "field_projects_read" on field_projects;
create policy "field_projects_read" on field_projects for select using (is_full_access() or auth.uid() = any(assigned_team));
drop policy if exists "field_projects_write" on field_projects;
create policy "field_projects_write" on field_projects for all using (is_full_access() or auth.uid() = any(assigned_team));

drop policy if exists "field_reports_read" on field_reports;
create policy "field_reports_read" on field_reports for select using (is_full_access() or reporter_id = auth.uid());
drop policy if exists "field_reports_write" on field_reports;
create policy "field_reports_write" on field_reports for all using (is_full_access() or reporter_id = auth.uid());

drop policy if exists "complaints_write" on complaints;
create policy "complaints_write" on complaints for all using (is_full_access() or assigned_to = auth.uid());

drop policy if exists "ads_analytics_write_admin_manager" on ads_analytics;
create policy "ads_analytics_write_admin_manager" on ads_analytics for all using (is_full_access());

drop policy if exists "activity_logs_read_admin_manager" on activity_logs;
create policy "activity_logs_read_admin_manager" on activity_logs for select using (is_full_access());

drop policy if exists "app_settings_write_admin_manager" on app_settings;
create policy "app_settings_write_admin_manager" on app_settings for all using (is_full_access());

drop policy if exists "holidays_write_admin_manager" on holidays;
create policy "holidays_write_admin_manager" on holidays for all using (is_full_access());

drop policy if exists "project_tasks_write_admin_manager" on project_tasks;
create policy "project_tasks_write_admin_manager" on project_tasks for all using (is_full_access());

drop policy if exists "task_evaluations_write_admin_manager" on task_evaluations;
create policy "task_evaluations_write_admin_manager" on task_evaluations for all using (is_full_access());

-- Role changes stay admin-only; supervisor may toggle active status.
create or replace function guard_profile_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_role user_role;
begin
  if auth.uid() is null then
    return new;
  end if;

  select role into actor_role from profiles where id = auth.uid();

  if new.role is distinct from old.role and coalesce(actor_role::text, '') <> 'admin' then
    raise exception 'Hanya admin yang dapat mengubah role pengguna.' using errcode = '42501';
  end if;

  if new.is_active is distinct from old.is_active
     and coalesce(actor_role::text, '') not in ('admin', 'manager', 'supervisor') then
    raise exception 'Hanya admin, manager, atau supervisor yang dapat mengubah status aktif pengguna.' using errcode = '42501';
  end if;

  return new;
end $$;

-- ---------- 4. Dashboard: date range + berkas recap + lead sources ----------
-- The old signature took no arguments, so it has to be dropped before the
-- filtered version can take its place.
drop function if exists dashboard_stats();
drop function if exists dashboard_stats(date, date);

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
    'deal_count',        (select count(*) from leads where status in ('deal','closing') and (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to),
    'appointment_count', (select count(*) from leads where status = 'appointment' and (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to),
    'cancel_count',      (select count(*) from leads where status = 'cancel' and (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to),

    'leads_this_month',  (select count(*) from leads where (created_at at time zone 'Asia/Jakarta')::date >= month_start),
    'leads_prev_month',  (select count(*) from leads
                          where (created_at at time zone 'Asia/Jakarta')::date >= prev_month_start
                            and (created_at at time zone 'Asia/Jakarta')::date <  month_start),
    'deals_this_month',  (select count(*) from leads where status in ('deal','closing')
                          and (created_at at time zone 'Asia/Jakarta')::date >= month_start),
    'deals_prev_month',  (select count(*) from leads where status in ('deal','closing')
                          and (created_at at time zone 'Asia/Jakarta')::date >= prev_month_start
                          and (created_at at time zone 'Asia/Jakarta')::date <  month_start),

    'customers_active',  (select count(*) from customers where status <> 'batal'),
    'units_available',   (select count(*) from units where status = 'tersedia'),
    'units_total',       (select count(*) from units),
    'complaints_active', (select count(*) from complaints where status <> 'selesai'),

    'by_status', (
      select coalesce(json_agg(json_build_object('label', s.status, 'value', s.c) order by s.c desc), '[]'::json)
      from (select status::text as status, count(*) c from leads
            where (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to
            group by status) s
    ),

    'by_source', (
      select coalesce(json_agg(json_build_object('source', x.src, 'leads', x.total, 'deals', x.deals) order by x.total desc), '[]'::json)
      from (
        select coalesce(nullif(source, ''), 'Tidak diketahui') src,
               count(*) total,
               count(*) filter (where status in ('deal','closing')) deals
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
               count(l.id) filter (where l.status in ('deal','closing')) deals
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

    -- Rekap konsumen yang sedang mengumpulkan berkas
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
    )
  ) into result;

  return result;
end $$;

grant execute on function dashboard_stats(date, date) to authenticated;
