-- ============================================================
-- Griya Zafira — Storage buckets for file uploads
-- Run this in the Supabase SQL Editor AFTER schema.sql.
-- ============================================================

-- ---------- BUCKETS ----------
insert into storage.buckets (id, name, public)
values
  ('siteplan-images', 'siteplan-images', true),
  ('customer-documents', 'customer-documents', false),
  ('field-report-photos', 'field-report-photos', false),
  ('complaint-photos', 'complaint-photos', false)
on conflict (id) do nothing;

-- ---------- SITEPLAN IMAGES (public read, admin/manager write) ----------
drop policy if exists "siteplan_images_read_all" on storage.objects;
create policy "siteplan_images_read_all" on storage.objects for select
  using (bucket_id = 'siteplan-images');

drop policy if exists "siteplan_images_write_admin_manager" on storage.objects;
create policy "siteplan_images_write_admin_manager" on storage.objects for insert
  with check (bucket_id = 'siteplan-images' and current_role_name() in ('admin', 'manager'));

drop policy if exists "siteplan_images_update_admin_manager" on storage.objects;
create policy "siteplan_images_update_admin_manager" on storage.objects for update
  using (bucket_id = 'siteplan-images' and current_role_name() in ('admin', 'manager'));

drop policy if exists "siteplan_images_delete_admin_manager" on storage.objects;
create policy "siteplan_images_delete_admin_manager" on storage.objects for delete
  using (bucket_id = 'siteplan-images' and current_role_name() in ('admin', 'manager'));

-- ---------- CUSTOMER DOCUMENTS (private — admin/manager or owning sales agent) ----------
drop policy if exists "customer_documents_read" on storage.objects;
create policy "customer_documents_read" on storage.objects for select
  using (
    bucket_id = 'customer-documents' and (
      current_role_name() in ('admin', 'manager') or
      exists (
        select 1 from customers c
        where c.id::text = (storage.foldername(name))[1] and c.sales_agent_id = auth.uid()
      )
    )
  );

drop policy if exists "customer_documents_write" on storage.objects;
create policy "customer_documents_write" on storage.objects for insert
  with check (
    bucket_id = 'customer-documents' and (
      current_role_name() in ('admin', 'manager') or
      exists (
        select 1 from customers c
        where c.id::text = (storage.foldername(name))[1] and c.sales_agent_id = auth.uid()
      )
    )
  );

drop policy if exists "customer_documents_delete" on storage.objects;
create policy "customer_documents_delete" on storage.objects for delete
  using (
    bucket_id = 'customer-documents' and (
      current_role_name() in ('admin', 'manager') or
      exists (
        select 1 from customers c
        where c.id::text = (storage.foldername(name))[1] and c.sales_agent_id = auth.uid()
      )
    )
  );

-- ---------- FIELD REPORT PHOTOS (admin/manager or assigned tim lapangan) ----------
drop policy if exists "field_report_photos_read" on storage.objects;
create policy "field_report_photos_read" on storage.objects for select
  using (bucket_id = 'field-report-photos' and current_role_name() in ('admin', 'manager', 'tim_lapangan'));

drop policy if exists "field_report_photos_write" on storage.objects;
create policy "field_report_photos_write" on storage.objects for insert
  with check (bucket_id = 'field-report-photos' and current_role_name() in ('admin', 'manager', 'tim_lapangan'));

drop policy if exists "field_report_photos_delete" on storage.objects;
create policy "field_report_photos_delete" on storage.objects for delete
  using (bucket_id = 'field-report-photos' and current_role_name() in ('admin', 'manager'));

-- ---------- COMPLAINT PHOTOS (readable/writable by everyone signed in, delete admin/manager) ----------
-- The `auth.uid() is not null` check matters: without it the anon role
-- satisfies the policy, and the anon key ships in the frontend bundle — so
-- the bucket would be world-readable despite being marked private.
drop policy if exists "complaint_photos_read" on storage.objects;
create policy "complaint_photos_read" on storage.objects for select
  using (bucket_id = 'complaint-photos' and auth.uid() is not null);

drop policy if exists "complaint_photos_write" on storage.objects;
create policy "complaint_photos_write" on storage.objects for insert
  with check (bucket_id = 'complaint-photos' and auth.uid() is not null);

drop policy if exists "complaint_photos_delete" on storage.objects;
create policy "complaint_photos_delete" on storage.objects for delete
  using (bucket_id = 'complaint-photos' and current_role_name() in ('admin', 'manager'));
