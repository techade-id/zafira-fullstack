-- ============================================================
-- Griya Zafira — Migration 003
-- Security + data-integrity fixes found in the audit:
--   1. Users could promote themselves to admin (privilege escalation)
--   2. Complaint photos were readable with the public anon key
--   3. Dashboard totals silently capped at the 1000-row API limit
--   4. Cancellation / agent-transfer wrote two tables with no transaction
--
-- Safe to run on an existing project; idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Block self-service privilege escalation
--
-- "profiles_update_self" lets a user update their own row, and because the
-- policy has no WITH CHECK and RLS cannot restrict columns, any signed-in
-- user could set their own role to 'admin' straight from the browser.
-- A trigger is the only way to guard specific columns.
-- ------------------------------------------------------------

create or replace function guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role user_role;
begin
  -- No JWT = service_role / SQL Editor. Needed so the documented bootstrap
  -- ("promote the first user to admin") still works.
  if auth.uid() is null then
    return new;
  end if;

  select role into actor_role from profiles where id = auth.uid();

  if new.role is distinct from old.role and coalesce(actor_role::text, '') <> 'admin' then
    raise exception 'Hanya admin yang dapat mengubah role pengguna.' using errcode = '42501';
  end if;

  if new.is_active is distinct from old.is_active
     and coalesce(actor_role::text, '') not in ('admin', 'manager') then
    raise exception 'Hanya admin atau manager yang dapat mengubah status aktif pengguna.' using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard_privileged on profiles;
create trigger profiles_guard_privileged
  before update on profiles
  for each row execute function guard_profile_privileged_columns();

-- ------------------------------------------------------------
-- 2. Complaint photos required no authentication
--
-- The old policy was `using (bucket_id = 'complaint-photos')`, which the
-- anon role satisfies — and the anon key ships in the frontend bundle.
-- ------------------------------------------------------------

drop policy if exists "complaint_photos_read" on storage.objects;
create policy "complaint_photos_read" on storage.objects for select
  using (bucket_id = 'complaint-photos' and auth.uid() is not null);

drop policy if exists "complaint_photos_write" on storage.objects;
create policy "complaint_photos_write" on storage.objects for insert
  with check (bucket_id = 'complaint-photos' and auth.uid() is not null);

-- ------------------------------------------------------------
-- 3. Atomic cancellation
--
-- Previously: insert into cancellations, then a separate update on
-- customers. If the second call failed you got a cancellation record
-- against a still-active customer. One function = one transaction.
-- SECURITY INVOKER keeps RLS enforcement intact.
-- ------------------------------------------------------------

create or replace function cancel_customer(
  p_customer_id uuid,
  p_reason text,
  p_detail text default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
begin
  update customers set status = 'batal' where id = p_customer_id;
  if not found then
    raise exception 'Konsumen tidak ditemukan atau Anda tidak punya akses.' using errcode = '42501';
  end if;

  insert into cancellations (customer_id, reason, detail, cancelled_by)
  values (p_customer_id, p_reason, p_detail, auth.uid())
  returning id into v_id;

  return v_id;
end $$;

-- ------------------------------------------------------------
-- 4. Atomic agent transfer
-- ------------------------------------------------------------

create or replace function transfer_customer(
  p_customer_id uuid,
  p_to_agent_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_from uuid;
  v_id uuid;
begin
  select sales_agent_id into v_from from customers where id = p_customer_id;
  if not found then
    raise exception 'Konsumen tidak ditemukan atau Anda tidak punya akses.' using errcode = '42501';
  end if;

  update customers set sales_agent_id = p_to_agent_id where id = p_customer_id;

  insert into customer_transfers (customer_id, from_agent_id, to_agent_id, reason, transferred_by)
  values (p_customer_id, v_from, p_to_agent_id, p_reason, auth.uid())
  returning id into v_id;

  return v_id;
end $$;

-- ------------------------------------------------------------
-- 5. Server-side dashboard aggregates
--
-- The dashboard used to fetch every lead/customer/kpr row and count them in
-- the browser, so past 1000 rows the API silently truncated and every total
-- was quietly wrong. Aggregating in Postgres removes the row ceiling.
-- Dates are anchored to Asia/Jakarta, not the server's UTC.
-- ------------------------------------------------------------

create or replace function dashboard_stats()
returns json
language plpgsql
stable
security invoker
as $$
declare
  jkt_today date := (now() at time zone 'Asia/Jakarta')::date;
  month_start date := date_trunc('month', jkt_today)::date;
  prev_month_start date := (date_trunc('month', jkt_today) - interval '1 month')::date;
  result json;
begin
  select json_build_object(
    'total_leads',        (select count(*) from leads),
    'deal_count',         (select count(*) from leads where status in ('deal','closing')),
    'appointment_count',  (select count(*) from leads where status = 'appointment'),
    'cancel_count',       (select count(*) from leads where status = 'cancel'),

    'leads_this_month',   (select count(*) from leads
                           where (created_at at time zone 'Asia/Jakarta')::date >= month_start),
    'leads_prev_month',   (select count(*) from leads
                           where (created_at at time zone 'Asia/Jakarta')::date >= prev_month_start
                             and (created_at at time zone 'Asia/Jakarta')::date <  month_start),
    'deals_this_month',   (select count(*) from leads where status in ('deal','closing')
                           and (created_at at time zone 'Asia/Jakarta')::date >= month_start),
    'deals_prev_month',   (select count(*) from leads where status in ('deal','closing')
                           and (created_at at time zone 'Asia/Jakarta')::date >= prev_month_start
                           and (created_at at time zone 'Asia/Jakarta')::date <  month_start),

    'customers_active',   (select count(*) from customers where status <> 'batal'),
    'units_available',    (select count(*) from units where status = 'tersedia'),
    'units_total',        (select count(*) from units),
    'complaints_active',  (select count(*) from complaints where status <> 'selesai'),

    'by_status', (
      select coalesce(json_agg(json_build_object('label', s.status, 'value', s.c) order by s.c desc), '[]'::json)
      from (select status::text as status, count(*) c from leads group by status) s
    ),

    'by_source', (
      select coalesce(json_agg(json_build_object('source', x.src, 'leads', x.total, 'deals', x.deals) order by x.total desc), '[]'::json)
      from (
        select coalesce(source, 'Tidak diketahui') src,
               count(*) total,
               count(*) filter (where status in ('deal','closing')) deals
        from leads group by 1
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
        group by p.full_name
      ) a
    ),

    'by_day', (
      select coalesce(json_agg(json_build_object('day', d.day, 'value', d.value) order by d.day), '[]'::json)
      from (
        select (jkt_today - g) as day,
               (select count(*) from leads l
                where (l.created_at at time zone 'Asia/Jakarta')::date = jkt_today - g) as value
        from generate_series(6, 0, -1) g
      ) d
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

grant execute on function dashboard_stats() to authenticated;
grant execute on function cancel_customer(uuid, text, text) to authenticated;
grant execute on function transfer_customer(uuid, uuid, text) to authenticated;
