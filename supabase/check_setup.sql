-- ============================================================
-- Griya Zafira — Setup check
--
-- Run this in the Supabase SQL Editor and send back the result. It reports
-- what is and isn't installed, so a problem can be pinpointed without
-- guessing which migration is missing.
-- Read-only: it changes nothing.
-- ============================================================

select 'FUNCTIONS' as bagian, '' as nama, '' as detail
union all
select
  'FUNCTIONS',
  p.proname,
  '(' || pg_get_function_identity_arguments(p.oid) || ')'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('dashboard_stats', 'contractor_scorecard', 'cancel_customer',
                    'transfer_customer', 'workday_deadline', 'is_full_access',
                    'is_berkas_access', 'current_role_name')

union all
select 'TABEL', t.tablename,
       case when t.tablename is null then 'HILANG' else 'ada' end
from (values ('leads'), ('customers'), ('customer_kpr'), ('customer_documents'),
             ('payments'), ('cancellations'), ('sales_targets'), ('business_settings'),
             ('customer_transfers'), ('app_settings'), ('holidays'), ('project_tasks'),
             ('task_evaluations'), ('units'), ('projects'), ('contractors'),
             ('complaints'), ('ads_analytics')) v(name)
left join pg_tables t on t.schemaname = 'public' and t.tablename = v.name

union all
select 'ROLE TERSEDIA', string_agg(e.enumlabel, ', ' order by e.enumsortorder), ''
from pg_enum e join pg_type ty on ty.oid = e.enumtypid where ty.typname = 'user_role'

union all
select 'ISI DATA', x.nama, x.jml::text from (
  select 'leads' nama, count(*) jml from leads
  union all select 'customers', count(*) from customers
  union all select 'customer_kpr', count(*) from customer_kpr
  union all select 'payments', count(*) from payments
  union all select 'units', count(*) from units
  union all select 'projects', count(*) from projects
  union all select 'project_tasks', count(*) from project_tasks
  union all select 'complaints', count(*) from complaints
  union all select 'ads_analytics', count(*) from ads_analytics
  union all select 'profiles', count(*) from profiles
) x

union all
select 'DROPDOWN', b.category, count(*)::text
from business_settings b group by b.category

order by 1, 2;
