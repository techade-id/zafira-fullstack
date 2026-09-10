-- ============================================================
-- Zafira Property — Migration 008
-- REVISI §2 / PRD §3: matriks peran, Segregation of Duties,
-- Handover Hard-Lock, dan audit trail.
--
--   1. Lima peran PRD + pemetaan peran lama
--   2. Helper akses baru (baca dan tulis dipisah)
--   3. Policy dipecah SELECT / INSERT / UPDATE / DELETE per tabel
--   4. Segregation of Duties pada pembayaran (trigger kolom)
--   5. Handover Hard-Lock setelah kuitansi Booking Fee
--   6. Audit trail terisi otomatis
--
-- Aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Peran
--
-- Nilai enum harus di-commit sebelum ada yang merujuknya.
-- ------------------------------------------------------------

alter type user_role add value if not exists 'sales';
alter type user_role add value if not exists 'admin_marketing';
alter type user_role add value if not exists 'finance';
alter type user_role add value if not exists 'supervisor_marketing';
alter type user_role add value if not exists 'pengawas';

commit;

-- Pemetaan peran lama. Tidak ada pengguna yang kehilangan akses saat migrasi;
-- nilai enum lama sengaja tidak dihapus (Postgres tidak bisa membuang nilai
-- enum) tapi tidak lagi dipakai baris mana pun.
update profiles set role = 'sales'                where role::text in ('sales_agent', 'marketing');
update profiles set role = 'admin_marketing'      where role::text = 'administrasi';
update profiles set role = 'supervisor_marketing' where role::text = 'supervisor';
update profiles set role = 'pengawas'             where role::text = 'manager';

-- Pengguna baru masuk sebagai Sales, bukan 'sales_agent' yang sudah pensiun.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'sales');
  return new;
end $$;

-- ------------------------------------------------------------
-- 2. Helper akses
--
-- is_full_access() dan is_berkas_access() yang lama dipakai pada policy
-- "for all", sehingga satu policy melayani baca DAN tulis sekaligus — bentuk
-- itu membuat peran read-only mustahil dibuat. Di bawah ini hak baca dan hak
-- tulis dipisah tegas.
-- ------------------------------------------------------------

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name()::text = 'admin', false);
$$;

create or replace function is_sales() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name()::text in ('sales', 'sales_agent', 'marketing'), false);
$$;

create or replace function is_admin_marketing() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name()::text in ('admin_marketing', 'administrasi'), false);
$$;

create or replace function is_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name()::text = 'finance', false);
$$;

create or replace function is_pengawas() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name()::text in ('pengawas', 'manager'), false);
$$;

-- Peran monitoring: melihat segalanya, tidak menulis apa pun pada data operasional.
create or replace function is_monitor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name()::text in ('supervisor_marketing', 'pengawas', 'supervisor', 'manager'), false);
$$;

create or replace function is_field() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name()::text = 'tim_lapangan', false);
$$;

-- Siapa yang boleh MEMBACA seluruh data lintas agen.
create or replace function can_view_all() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_admin_marketing() or is_finance() or is_monitor();
$$;

create or replace function can_write_sales() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_sales();
$$;

create or replace function can_write_berkas() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_admin_marketing();
$$;

create or replace function can_write_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_finance();
$$;

-- REVISI §2.1 memberi Pengawas "manajemen konfigurasi bisnis", sementara
-- PRD §3.1 menyebutnya read-only. Keduanya didamaikan begini: Pengawas
-- read-only atas data transaksi, tapi berwenang atas data referensi
-- (pengaturan bisnis, kalender kerja, proyek/unit).
create or replace function can_manage_config() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_pengawas();
$$;

-- Kepemilikan. SECURITY DEFINER dipakai supaya evaluasi policy pada
-- customers/leads tidak memanggil policy-nya sendiri secara rekursif.
create or replace function owns_lead(p_lead_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from leads l where l.id = p_lead_id and l.assigned_to = auth.uid());
$$;

create or replace function owns_customer(p_customer_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from customers c where c.id = p_customer_id and c.sales_agent_id = auth.uid());
$$;

-- Helper lama tetap ada supaya migrasi/objek yang belum diperbarui tidak patah.
create or replace function is_full_access() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_pengawas();
$$;

create or replace function is_berkas_access() returns boolean
language sql stable security definer set search_path = public as $$
  select can_view_all();
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'is_admin()', 'is_sales()', 'is_admin_marketing()', 'is_finance()', 'is_pengawas()',
    'is_monitor()', 'is_field()', 'can_view_all()', 'can_write_sales()', 'can_write_berkas()',
    'can_write_finance()', 'can_manage_config()', 'owns_lead(uuid)', 'owns_customer(uuid)',
    'is_full_access()', 'is_berkas_access()'
  ] loop
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. Handover Hard-Lock — kolom penanda
-- ------------------------------------------------------------

alter table customers add column if not exists locked_at timestamptz;
alter table customers add column if not exists handover_state text not null default 'sales';
alter table customers add column if not exists locked_by_payment_id uuid;

comment on column customers.locked_at is
  'Diisi saat kuitansi Booking Fee diverifikasi Finance. Selama terisi, Sales tidak boleh lagi mengubah profil, KPR, atau dokumen konsumen ini (PRD §3.2).';

create or replace function customer_locked(p_customer_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from customers c where c.id = p_customer_id and c.locked_at is not null);
$$;
grant execute on function customer_locked(uuid) to authenticated;

-- Catatan follow-up boleh menempel ke konsumen, bukan hanya ke prospek —
-- inilah jalur yang tetap terbuka untuk Sales setelah handover.
alter table lead_activities add column if not exists customer_id uuid references customers(id) on delete cascade;
alter table lead_activities add column if not exists hasil text;
alter table lead_activities alter column lead_id drop not null;

create index if not exists idx_lead_activities_customer on lead_activities (customer_id);
create index if not exists idx_lead_activities_lead on lead_activities (lead_id);

-- Prospek yang dibuat Sales harus otomatis menjadi miliknya. Tanpa default ini
-- assigned_to tetap NULL dan policy kepemilikan menolak baris yang baru saja
-- dibuat penggunanya sendiri.
alter table leads alter column assigned_to set default auth.uid();

-- ------------------------------------------------------------
-- 4. Policy: SELECT dan WRITE dipisah
-- ------------------------------------------------------------

-- profiles ---------------------------------------------------
drop policy if exists "profiles_select_all" on profiles;
drop policy if exists "profiles_update_self" on profiles;
drop policy if exists "profiles_update_admin_manager" on profiles;
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_update_self" on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_update_admin" on profiles for update using (is_admin()) with check (is_admin());

-- projects / units -------------------------------------------
drop policy if exists "projects_read_all" on projects;
drop policy if exists "projects_write_admin_manager" on projects;
create policy "projects_select" on projects for select using (true);
create policy "projects_write" on projects for all using (can_manage_config()) with check (can_manage_config());

drop policy if exists "units_read_all" on units;
drop policy if exists "units_write_admin_manager" on units;
create policy "units_select" on units for select using (true);
create policy "units_write" on units for all using (can_manage_config() or can_write_berkas()) with check (can_manage_config() or can_write_berkas());

-- leads ------------------------------------------------------
drop policy if exists "leads_read" on leads;
drop policy if exists "leads_write_own_or_manager" on leads;
create policy "leads_select" on leads for select using (can_view_all() or assigned_to = auth.uid());
create policy "leads_insert" on leads for insert with check (can_write_sales());
create policy "leads_update" on leads for update
  using (is_admin() or (can_write_sales() and assigned_to = auth.uid()))
  with check (is_admin() or (can_write_sales() and assigned_to = auth.uid()));
create policy "leads_delete" on leads for delete using (is_admin() or (is_sales() and assigned_to = auth.uid()));

-- lead_activities — jalur follow-up, tetap terbuka setelah hard-lock ---------
drop policy if exists "lead_activities_rw" on lead_activities;
create policy "lead_activities_select" on lead_activities for select
  using (can_view_all() or owns_lead(lead_id) or owns_customer(customer_id));
create policy "lead_activities_insert" on lead_activities for insert
  with check (
    is_admin() or can_write_berkas() or can_write_finance()
    or owns_lead(lead_id) or owns_customer(customer_id)
  );
create policy "lead_activities_update" on lead_activities for update
  using (is_admin() or actor_id = auth.uid()) with check (is_admin() or actor_id = auth.uid());
create policy "lead_activities_delete" on lead_activities for delete using (is_admin());

-- customers --------------------------------------------------
drop policy if exists "customers_read" on customers;
drop policy if exists "customers_write" on customers;
create policy "customers_select" on customers for select using (can_view_all() or sales_agent_id = auth.uid());
create policy "customers_insert" on customers for insert with check (can_write_sales() or can_write_berkas());
-- Hard-Lock: Sales berhenti di sini begitu locked_at terisi.
create policy "customers_update" on customers for update
  using (can_write_berkas() or (is_sales() and sales_agent_id = auth.uid() and locked_at is null))
  with check (can_write_berkas() or (is_sales() and sales_agent_id = auth.uid()));
create policy "customers_delete" on customers for delete using (is_admin());

-- customer_documents / customer_kpr — domain pemberkasan ------
drop policy if exists "customer_documents_rw" on customer_documents;
create policy "customer_documents_select" on customer_documents for select
  using (can_view_all() or owns_customer(customer_id));
create policy "customer_documents_insert" on customer_documents for insert
  with check (can_write_berkas() or (owns_customer(customer_id) and not customer_locked(customer_id)));
create policy "customer_documents_update" on customer_documents for update
  using (can_write_berkas() or (owns_customer(customer_id) and not customer_locked(customer_id)))
  with check (can_write_berkas() or owns_customer(customer_id));
create policy "customer_documents_delete" on customer_documents for delete using (is_admin() or can_write_berkas());

drop policy if exists "customer_kpr_rw" on customer_kpr;
create policy "customer_kpr_select" on customer_kpr for select
  using (can_view_all() or owns_customer(customer_id));
create policy "customer_kpr_insert" on customer_kpr for insert
  with check (can_write_berkas() or (owns_customer(customer_id) and not customer_locked(customer_id)));
create policy "customer_kpr_update" on customer_kpr for update
  using (can_write_berkas() or (owns_customer(customer_id) and not customer_locked(customer_id)))
  with check (can_write_berkas() or owns_customer(customer_id));
create policy "customer_kpr_delete" on customer_kpr for delete using (is_admin() or can_write_berkas());

-- payments — Segregation of Duties ---------------------------
drop policy if exists "payments_rw" on payments;
create policy "payments_select" on payments for select using (can_view_all() or owns_customer(customer_id));
-- Sales boleh MENCATAT setoran yang diterimanya; yang tidak boleh adalah
-- memvalidasinya sendiri. Kolom status/proof_url dijaga trigger di bawah.
create policy "payments_insert" on payments for insert
  with check (can_write_finance() or can_write_berkas() or owns_customer(customer_id));
create policy "payments_update" on payments for update
  using (can_write_finance() or (owns_customer(customer_id) and status = 'menunggu'))
  with check (can_write_finance() or owns_customer(customer_id));
create policy "payments_delete" on payments for delete using (is_admin() or can_write_finance());

-- cancellations ----------------------------------------------
drop policy if exists "cancellations_rw" on cancellations;
create policy "cancellations_select" on cancellations for select using (can_view_all() or owns_customer(customer_id));
create policy "cancellations_insert" on cancellations for insert
  with check (can_write_berkas() or can_write_finance() or owns_customer(customer_id));
create policy "cancellations_delete" on cancellations for delete using (is_admin());

-- referensi & konfigurasi ------------------------------------
drop policy if exists "sales_targets_read_all" on sales_targets;
drop policy if exists "sales_targets_write_admin_manager" on sales_targets;
create policy "sales_targets_select" on sales_targets for select using (true);
create policy "sales_targets_write" on sales_targets for all using (can_manage_config()) with check (can_manage_config());

drop policy if exists "business_settings_read_all" on business_settings;
drop policy if exists "business_settings_write_admin_manager" on business_settings;
create policy "business_settings_select" on business_settings for select using (true);
create policy "business_settings_write" on business_settings for all using (can_manage_config()) with check (can_manage_config());

drop policy if exists "app_settings_read_all" on app_settings;
drop policy if exists "app_settings_write_admin_manager" on app_settings;
create policy "app_settings_select" on app_settings for select using (true);
create policy "app_settings_write" on app_settings for all using (can_manage_config()) with check (can_manage_config());

drop policy if exists "holidays_read_all" on holidays;
drop policy if exists "holidays_write_admin_manager" on holidays;
create policy "holidays_select" on holidays for select using (true);
create policy "holidays_write" on holidays for all using (can_manage_config()) with check (can_manage_config());

drop policy if exists "customer_transfers_read_all" on customer_transfers;
drop policy if exists "customer_transfers_write_admin_manager" on customer_transfers;
create policy "customer_transfers_select" on customer_transfers for select using (true);
create policy "customer_transfers_write" on customer_transfers for all
  using (is_admin() or is_pengawas() or can_write_berkas()) with check (is_admin() or is_pengawas() or can_write_berkas());

-- kontraktor & proyek lapangan -------------------------------
drop policy if exists "contractors_read_all" on contractors;
drop policy if exists "contractors_write_admin_manager" on contractors;
create policy "contractors_select" on contractors for select using (true);
create policy "contractors_write" on contractors for all using (can_manage_config() or can_write_berkas()) with check (can_manage_config() or can_write_berkas());

drop policy if exists "contractor_eval_read_all" on contractor_evaluations;
drop policy if exists "contractor_eval_write_admin_manager" on contractor_evaluations;
create policy "contractor_eval_select" on contractor_evaluations for select using (true);
create policy "contractor_eval_write" on contractor_evaluations for all using (can_manage_config() or can_write_berkas()) with check (can_manage_config() or can_write_berkas());

drop policy if exists "project_tasks_read_all" on project_tasks;
drop policy if exists "project_tasks_write_admin_manager" on project_tasks;
create policy "project_tasks_select" on project_tasks for select using (true);
create policy "project_tasks_write" on project_tasks for all using (can_manage_config() or can_write_berkas() or is_field()) with check (can_manage_config() or can_write_berkas() or is_field());

drop policy if exists "task_evaluations_read_all" on task_evaluations;
drop policy if exists "task_evaluations_write_admin_manager" on task_evaluations;
create policy "task_evaluations_select" on task_evaluations for select using (true);
create policy "task_evaluations_write" on task_evaluations for all using (can_manage_config() or can_write_berkas()) with check (can_manage_config() or can_write_berkas());

drop policy if exists "field_projects_read" on field_projects;
drop policy if exists "field_projects_write" on field_projects;
create policy "field_projects_select" on field_projects for select using (can_view_all() or auth.uid() = any(assigned_team));
create policy "field_projects_write" on field_projects for all
  using (can_manage_config() or can_write_berkas() or auth.uid() = any(assigned_team))
  with check (can_manage_config() or can_write_berkas() or auth.uid() = any(assigned_team));

drop policy if exists "field_reports_read" on field_reports;
drop policy if exists "field_reports_write" on field_reports;
create policy "field_reports_select" on field_reports for select using (can_view_all() or reporter_id = auth.uid());
create policy "field_reports_write" on field_reports for all
  using (can_manage_config() or can_write_berkas() or reporter_id = auth.uid())
  with check (can_manage_config() or can_write_berkas() or reporter_id = auth.uid());

-- komplain ---------------------------------------------------
drop policy if exists "complaints_read_all" on complaints;
drop policy if exists "complaints_write" on complaints;
create policy "complaints_select" on complaints for select using (true);
create policy "complaints_insert" on complaints for insert
  with check (not is_monitor() and auth.uid() is not null);
create policy "complaints_update" on complaints for update
  using (can_manage_config() or can_write_berkas() or assigned_to = auth.uid())
  with check (can_manage_config() or can_write_berkas() or assigned_to = auth.uid());
create policy "complaints_delete" on complaints for delete using (is_admin() or can_write_berkas());

-- iklan ------------------------------------------------------
drop policy if exists "ads_analytics_read_all" on ads_analytics;
drop policy if exists "ads_analytics_write_admin_manager" on ads_analytics;
create policy "ads_analytics_select" on ads_analytics for select using (true);
create policy "ads_analytics_write" on ads_analytics for all using (can_manage_config() or can_write_berkas()) with check (can_manage_config() or can_write_berkas());

-- ------------------------------------------------------------
-- 5. Segregation of Duties: verifikasi pembayaran
--
-- RLS tidak bisa membatasi per kolom, jadi seperti guard pada profiles,
-- pemisahan wewenang ini ditegakkan trigger.
-- ------------------------------------------------------------

create or replace function guard_payment_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Tanpa JWT = service_role / SQL Editor (seed dan perbaikan data manual).
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Hanya Finance yang boleh membuat baris yang langsung tervalidasi.
    if not can_write_finance() then
      new.status := 'menunggu';
      new.verified_by := null;
      new.proof_url := null;
    end if;
    return new;
  end if;

  if not can_write_finance() then
    if new.status is distinct from old.status then
      raise exception 'Verifikasi pembayaran adalah wewenang Finance.' using errcode = '42501';
    end if;
    if new.proof_url is distinct from old.proof_url then
      raise exception 'Kuitansi hanya boleh diunggah oleh Finance.' using errcode = '42501';
    end if;
    if new.verified_by is distinct from old.verified_by then
      raise exception 'Kolom verifikator hanya boleh diisi Finance.' using errcode = '42501';
    end if;
  elsif new.status = 'terverifikasi' and old.status is distinct from 'terverifikasi' then
    new.verified_by := auth.uid();
  end if;

  return new;
end $$;

drop trigger if exists payments_guard_verification on payments;
create trigger payments_guard_verification
  before insert or update on payments
  for each row execute function guard_payment_verification();

-- ------------------------------------------------------------
-- 6. Handover Hard-Lock — pemicu
--
-- PRD §3.2: begitu Finance mengunggah kuitansi Booking Fee, tanggung jawab
-- data berpindah ke Admin Marketing dan Sales kehilangan hak ubah.
-- ------------------------------------------------------------

create or replace function apply_booking_handover()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_type = 'booking'
     and new.status = 'terverifikasi'
     and new.proof_url is not null then

    update customers
       set locked_at = coalesce(locked_at, now()),
           handover_state = 'admin_marketing',
           locked_by_payment_id = coalesce(locked_by_payment_id, new.id)
     where id = new.customer_id
       and locked_at is null;
  end if;

  return null;
end $$;

drop trigger if exists payments_apply_handover on payments;
create trigger payments_apply_handover
  after insert or update on payments
  for each row execute function apply_booking_handover();

-- Membuka kunci adalah tindakan administratif, bukan sesuatu yang bisa
-- dilakukan lewat halaman biasa — karena itu berupa RPC khusus admin.
create or replace function unlock_customer(p_customer_id uuid, p_reason text default null)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Hanya admin yang dapat membuka kunci konsumen.' using errcode = '42501';
  end if;

  update customers
     set locked_at = null, handover_state = 'sales', locked_by_payment_id = null
   where id = p_customer_id;

  insert into activity_logs (entity_type, entity_id, actor_id, action, note)
  values ('customers', p_customer_id, auth.uid(), 'unlock', p_reason);
end $$;
grant execute on function unlock_customer(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 7. Audit trail
--
-- Tabelnya sudah ada sejak schema.sql tapi tidak pernah terisi. Pengawas
-- membutuhkannya sebagai "log aktivitas sistem" (PRD §3.1).
-- ------------------------------------------------------------

alter table activity_logs add column if not exists changes jsonb;
create index if not exists idx_activity_logs_created on activity_logs (created_at desc);
create index if not exists idx_activity_logs_entity on activity_logs (entity_type, entity_id);

create or replace function log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_changes jsonb;
  v_old jsonb;
  v_new jsonb;
  k text;
begin
  if tg_op = 'DELETE' then
    v_id := old.id;
    v_changes := jsonb_build_object('before', to_jsonb(old));
  elsif tg_op = 'INSERT' then
    v_id := new.id;
    v_changes := jsonb_build_object('after', to_jsonb(new));
  else
    v_id := new.id;
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_changes := '{}'::jsonb;
    -- Hanya kolom yang benar-benar berubah — log yang memuat seluruh baris
    -- pada setiap update akan tidak terbaca dalam hitungan minggu.
    for k in select jsonb_object_keys(v_new) loop
      if v_new -> k is distinct from v_old -> k then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('dari', v_old -> k, 'jadi', v_new -> k));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  end if;

  insert into activity_logs (entity_type, entity_id, actor_id, action, changes)
  values (tg_table_name, v_id, auth.uid(), lower(tg_op), v_changes);

  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'leads', 'customers', 'customer_kpr', 'customer_documents',
    'payments', 'cancellations', 'profiles', 'units'
  ] loop
    execute format('drop trigger if exists %I on %I', 'audit_' || t, t);
    execute format(
      'create trigger %I after insert or update or delete on %I for each row execute function log_activity()',
      'audit_' || t, t
    );
  end loop;
end $$;

drop policy if exists "activity_logs_read_admin_manager" on activity_logs;
drop policy if exists "activity_logs_insert_all" on activity_logs;
create policy "activity_logs_select" on activity_logs for select using (is_admin() or is_pengawas());
create policy "activity_logs_insert" on activity_logs for insert with check (auth.uid() is not null);

-- ------------------------------------------------------------
-- 8. Guard profil disesuaikan ke peran baru
-- ------------------------------------------------------------

create or replace function guard_profile_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role and not is_admin() then
    raise exception 'Hanya admin yang dapat mengubah role pengguna.' using errcode = '42501';
  end if;

  if new.is_active is distinct from old.is_active and not (is_admin() or is_pengawas()) then
    raise exception 'Hanya admin atau pengawas yang dapat mengubah status aktif pengguna.' using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard_privileged on profiles;
create trigger profiles_guard_privileged
  before update on profiles
  for each row execute function guard_profile_privileged_columns();

notify pgrst, 'reload schema';
