-- ============================================================
-- Zafira Property — Migration 011
-- Siklus hidup akun pengguna.
--
--   1. is_active DITEGAKKAN — sebelumnya kolom itu hanya hiasan
--   2. me() — identitas yang hanya berlaku bila akunnya aktif
--   3. Pendaftaran mandiri: akun baru masuk nonaktif, menunggu persetujuan
--   4. Batas domain email
--   5. approve_user() / deactivate_user() beserta jejak auditnya
--
-- Aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Penegakan is_active
--
-- Sebelum migrasi ini, kolom is_active dijaga (hanya admin/pengawas yang boleh
-- mengubahnya) tetapi tidak pernah dibaca oleh policy mana pun. Akibatnya
-- menonaktifkan seorang agen tidak berpengaruh apa-apa: ia tetap memegang
-- seluruh hak role-nya.
--
-- Semua helper peran bermuara pada current_role_name(), jadi satu perubahan di
-- sini langsung menutup seluruh jalur berbasis peran.
-- ------------------------------------------------------------

create or replace function current_role_name()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid() and is_active;
$$;

/**
 * Identitas pemanggil, tetapi hanya bila akunnya aktif.
 *
 * Jalur berbasis kepemilikan (`assigned_to = auth.uid()`) tidak melewati
 * helper peran sama sekali, sehingga akun nonaktif tetap bisa menyentuh
 * barisnya sendiri. Mengganti auth.uid() dengan me() menutup celah itu:
 * NULL tidak pernah sama dengan apa pun, jadi tidak ada baris yang cocok.
 */
create or replace function me()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles where id = auth.uid() and is_active;
$$;

create or replace function is_aktif()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_active from profiles where id = auth.uid()), false);
$$;

grant execute on function me() to authenticated;
grant execute on function is_aktif() to authenticated;

-- Helper kepemilikan ikut memakai me().
create or replace function owns_lead(p_lead_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from leads l where l.id = p_lead_id and l.assigned_to = me());
$$;

create or replace function owns_customer(p_customer_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from customers c where c.id = p_customer_id and c.sales_agent_id = me());
$$;

-- ------------------------------------------------------------
-- 2. Policy berbasis kepemilikan ditulis ulang memakai me()
-- ------------------------------------------------------------

drop policy if exists "profiles_update_self" on profiles;
create policy "profiles_update_self" on profiles for update
  using (id = me()) with check (id = me());

drop policy if exists "leads_select" on leads;
create policy "leads_select" on leads for select using (can_view_all() or assigned_to = me());
drop policy if exists "leads_update" on leads;
create policy "leads_update" on leads for update
  using (is_admin() or (can_write_sales() and assigned_to = me()))
  with check (is_admin() or (can_write_sales() and assigned_to = me()));
drop policy if exists "leads_delete" on leads;
create policy "leads_delete" on leads for delete using (is_admin() or (is_sales() and assigned_to = me()));

drop policy if exists "lead_activities_update" on lead_activities;
create policy "lead_activities_update" on lead_activities for update
  using (is_admin() or actor_id = me()) with check (is_admin() or actor_id = me());

drop policy if exists "customers_select" on customers;
create policy "customers_select" on customers for select using (can_view_all() or sales_agent_id = me());
drop policy if exists "customers_update" on customers;
create policy "customers_update" on customers for update
  using (can_write_berkas() or (is_sales() and sales_agent_id = me() and locked_at is null))
  with check (can_write_berkas() or (is_sales() and sales_agent_id = me()));

drop policy if exists "field_projects_select" on field_projects;
create policy "field_projects_select" on field_projects for select
  using (can_view_all() or me() = any(assigned_team));
drop policy if exists "field_projects_write" on field_projects;
create policy "field_projects_write" on field_projects for all
  using (can_manage_config() or can_write_berkas() or me() = any(assigned_team))
  with check (can_manage_config() or can_write_berkas() or me() = any(assigned_team));

drop policy if exists "field_reports_select" on field_reports;
create policy "field_reports_select" on field_reports for select
  using (can_view_all() or reporter_id = me());
drop policy if exists "field_reports_write" on field_reports;
create policy "field_reports_write" on field_reports for all
  using (can_manage_config() or can_write_berkas() or reporter_id = me())
  with check (can_manage_config() or can_write_berkas() or reporter_id = me());

drop policy if exists "complaints_update" on complaints;
create policy "complaints_update" on complaints for update
  using (can_manage_config() or can_write_berkas() or assigned_to = me())
  with check (can_manage_config() or can_write_berkas() or assigned_to = me());
drop policy if exists "complaints_insert" on complaints;
create policy "complaints_insert" on complaints for insert
  with check (me() is not null and not is_monitor());

drop policy if exists "activity_logs_insert" on activity_logs;
create policy "activity_logs_insert" on activity_logs for insert with check (me() is not null);

-- Konsumen hanya boleh dibaca pemiliknya yang aktif; SELECT profiles tetap
-- terbuka karena dropdown penugasan membutuhkannya.

-- ------------------------------------------------------------
-- 3. Batas domain email
--
-- Halaman pendaftaran memakai anon key yang ikut terkirim ke browser, jadi
-- siapa pun yang menemukan alamatnya bisa mencoba mendaftar. Daftar domain di
-- bawah menutup itu di level database — bukan di formulir, yang bisa dilewati.
-- Kosong = semua domain diizinkan (perilaku lama tetap jalan).
-- ------------------------------------------------------------

insert into app_settings (key, value, description) values
  ('domain_email_diizinkan', '',
   'Daftar domain email yang boleh mendaftar, dipisah koma (mis. zafiraproperty.id). Kosongkan untuk mengizinkan semua.')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 4. Pendaftaran mandiri: masuk dalam keadaan nonaktif
--
-- Akun baru tidak boleh langsung bisa apa-apa. Ia tercatat, tetapi
-- current_role_name() mengembalikan NULL selama is_active masih false,
-- sehingga seluruh policy menolaknya sampai admin menyetujui.
-- ------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domains text;
  v_ok boolean;
begin
  v_domains := coalesce((select value from app_settings where key = 'domain_email_diizinkan'), '');

  if btrim(v_domains) <> '' then
    select bool_or(lower(new.email) like '%@' || lower(btrim(d)))
      into v_ok
      from unnest(string_to_array(v_domains, ',')) d;

    if not coalesce(v_ok, false) then
      raise exception 'Email % tidak diizinkan mendaftar. Gunakan email kantor.', new.email
        using errcode = '42501';
    end if;
  end if;

  insert into public.profiles (id, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'sales',
    false   -- menunggu persetujuan admin
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 5. Persetujuan & penonaktifan
--
-- Dibuat sebagai RPC, bukan UPDATE langsung dari halaman, supaya perubahan
-- role dan status aktif selalu terjadi bersamaan dalam satu transaksi dan
-- selalu meninggalkan jejak audit dengan alasannya.
-- ------------------------------------------------------------

create or replace function approve_user(p_user_id uuid, p_role user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Hanya admin yang dapat menyetujui pengguna.' using errcode = '42501';
  end if;

  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'Pengguna tidak ditemukan.' using errcode = 'P0002';
  end if;

  update profiles set role = p_role, is_active = true where id = p_user_id;

  insert into activity_logs (entity_type, entity_id, actor_id, action, note)
  values ('profiles', p_user_id, auth.uid(), 'approve', 'Disetujui sebagai ' || p_role::text);
end;
$$;

create or replace function deactivate_user(p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_admin() or is_pengawas()) then
    raise exception 'Hanya admin atau pengawas yang dapat menonaktifkan pengguna.' using errcode = '42501';
  end if;

  -- Menonaktifkan diri sendiri akan mengunci orang terakhir yang bisa
  -- mengaktifkan kembali siapa pun.
  if p_user_id = auth.uid() then
    raise exception 'Anda tidak dapat menonaktifkan akun Anda sendiri.' using errcode = '42501';
  end if;

  update profiles set is_active = false where id = p_user_id;

  insert into activity_logs (entity_type, entity_id, actor_id, action, note)
  values ('profiles', p_user_id, auth.uid(), 'deactivate', p_reason);
end;
$$;

grant execute on function approve_user(uuid, user_role) to authenticated;
grant execute on function deactivate_user(uuid, text) to authenticated;

-- Guard kolom istimewa: approve_user/deactivate_user berjalan SECURITY DEFINER
-- sehingga auth.uid() tetap milik pemanggil dan pemeriksaan di bawah tetap
-- berlaku untuk mereka.
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
