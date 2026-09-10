-- ============================================================
-- Zafira Property — Setup check
--
-- Run this in the Supabase SQL Editor and send back the result. It reports
-- what is and isn't installed, so a problem can be pinpointed without
-- guessing which migration is missing.
-- Read-only: it changes nothing.
-- ============================================================

select 'EKSTENSI' as bagian, e.extname as nama, e.extversion as detail
from pg_extension e
where e.extname in ('pg_trgm')

union all
select 'FUNCTIONS', p.proname, '(' || pg_get_function_identity_arguments(p.oid) || ')'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'dashboard_stats', 'contractor_scorecard', 'cancel_customer',
    'transfer_customer', 'workday_deadline', 'current_role_name',
    -- migration_007
    'search_notes', 'search_snippet',
    -- migration_008
    'is_admin', 'is_sales', 'is_admin_marketing', 'is_finance', 'is_pengawas',
    'is_monitor', 'can_view_all', 'can_write_sales', 'can_write_berkas',
    'can_write_finance', 'can_manage_config', 'owns_lead', 'owns_customer',
    'customer_locked', 'unlock_customer', 'guard_payment_verification',
    'apply_booking_handover', 'log_activity',
    -- migration_009
    'lead_stage_rank', 'promote_lead', 'sync_lead_stage_from_kpr', 'sync_lead_stage_from_lock'
  )

union all
select 'TABEL', v.name,
       case when t.tablename is null then 'HILANG' else 'ada' end
from (values ('leads'), ('lead_activities'), ('customers'), ('customer_kpr'), ('customer_documents'),
             ('payments'), ('cancellations'), ('sales_targets'), ('business_settings'),
             ('customer_transfers'), ('app_settings'), ('holidays'), ('project_tasks'),
             ('task_evaluations'), ('units'), ('projects'), ('contractors'),
             ('complaints'), ('ads_analytics'), ('activity_logs'),
             ('ads_campaigns'), ('partners')) v(name)
left join pg_tables t on t.schemaname = 'public' and t.tablename = v.name

union all
-- Kolom yang ditambahkan migration_008/009. Kalau HILANG, migrasinya belum jalan.
select 'KOLOM BARU', v.tbl || '.' || v.col,
       case when c.column_name is null then 'HILANG' else 'ada' end
from (values ('customers', 'locked_at'), ('customers', 'handover_state'),
             ('customers', 'username_sosmed'), ('lead_activities', 'customer_id'),
             ('lead_activities', 'hasil'), ('activity_logs', 'changes'),
             ('leads', 'source_type'), ('leads', 'campaign_id'),
             ('leads', 'partner_id'), ('leads', 'username_sosmed'),
             ('payments', 'proof_url')) v(tbl, col)
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = v.tbl and c.column_name = v.col

union all
select 'ROLE TERSEDIA', string_agg(e.enumlabel, ', ' order by e.enumsortorder), ''
from pg_enum e join pg_type ty on ty.oid = e.enumtypid where ty.typname = 'user_role'

union all
select 'TAHAP LEAD', string_agg(e.enumlabel, ', ' order by e.enumsortorder), ''
from pg_enum e join pg_type ty on ty.oid = e.enumtypid where ty.typname = 'lead_status'

union all
select 'ROLE TERPAKAI', p.role::text, count(*)::text
from profiles p group by p.role

union all
-- Indeks trigram adalah syarat pencarian Notes tetap cepat di puluhan ribu baris.
select 'INDEX TRIGRAM', count(*)::text, 'indeks gin_trgm terpasang'
from pg_indexes
where schemaname = 'public' and indexdef ilike '%gin_trgm_ops%'

union all
select 'BUCKET', b.id, case when b.public then 'publik' else 'privat' end
from storage.buckets b

union all
select 'ISI DATA', x.nama, x.jml::text from (
  select 'leads' nama, count(*) jml from leads
  union all select 'lead_activities', count(*) from lead_activities
  union all select 'customers', count(*) from customers
  union all select 'customers terkunci', count(*) from customers where locked_at is not null
  union all select 'customer_kpr', count(*) from customer_kpr
  union all select 'payments', count(*) from payments
  union all select 'payments terverifikasi', count(*) from payments where status = 'terverifikasi'
  union all select 'units', count(*) from units
  union all select 'projects', count(*) from projects
  union all select 'project_tasks', count(*) from project_tasks
  union all select 'complaints', count(*) from complaints
  union all select 'ads_analytics', count(*) from ads_analytics
  union all select 'activity_logs', count(*) from activity_logs
  union all select 'profiles', count(*) from profiles
) x

union all
select 'DROPDOWN', b.category, count(*)::text
from business_settings b group by b.category

order by 1, 2;
