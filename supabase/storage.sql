-- ============================================================
-- Zafira Property — Storage buckets for file uploads
-- Run this in the Supabase SQL Editor AFTER schema.sql.
--
-- Re-run it after migration_008_roles_sod.sql too: the policies below call the
-- new access helpers instead of the retired ('admin','manager') role list.
-- ============================================================

-- ---------- BUCKETS ----------
insert into storage.buckets (id, name, public)
values
  ('siteplan-images', 'siteplan-images', true),
  ('customer-documents', 'customer-documents', false),
  ('field-report-photos', 'field-report-photos', false),
  ('complaint-photos', 'complaint-photos', false),
  ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;

-- ---------- SITEPLAN IMAGES (public read, config managers write) ----------
drop policy if exists "siteplan_images_read_all" on storage.objects;
create policy "siteplan_images_read_all" on storage.objects for select
  using (bucket_id = 'siteplan-images');

drop policy if exists "siteplan_images_write_admin_manager" on storage.objects;
create policy "siteplan_images_write_admin_manager" on storage.objects for insert
  with check (bucket_id = 'siteplan-images' and (can_manage_config() or can_write_berkas()));

drop policy if exists "siteplan_images_update_admin_manager" on storage.objects;
create policy "siteplan_images_update_admin_manager" on storage.objects for update
  using (bucket_id = 'siteplan-images' and (can_manage_config() or can_write_berkas()));

drop policy if exists "siteplan_images_delete_admin_manager" on storage.objects;
create policy "siteplan_images_delete_admin_manager" on storage.objects for delete
  using (bucket_id = 'siteplan-images' and can_manage_config());

-- ---------- CUSTOMER DOCUMENTS (private — berkas roles or owning sales agent) ----------
-- The first path segment is the customer id, which is what ties an object back
-- to a row (see uploadFile in src/lib/storage.js).
drop policy if exists "customer_documents_read" on storage.objects;
create policy "customer_documents_read" on storage.objects for select
  using (
    bucket_id = 'customer-documents' and (
      can_view_all() or owns_customer(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "customer_documents_write" on storage.objects;
create policy "customer_documents_write" on storage.objects for insert
  with check (
    bucket_id = 'customer-documents' and (
      can_write_berkas() or (
        owns_customer(((storage.foldername(name))[1])::uuid)
        and not customer_locked(((storage.foldername(name))[1])::uuid)
      )
    )
  );

drop policy if exists "customer_documents_delete" on storage.objects;
create policy "customer_documents_delete" on storage.objects for delete
  using (bucket_id = 'customer-documents' and can_write_berkas());

-- ---------- PAYMENT RECEIPTS (kuitansi — Finance writes, the rest only read) ----------
-- Segregation of Duties: the receipt is the artefact that validates a payment,
-- so only Finance may put one in the bucket. Uploading a Booking Fee receipt is
-- what fires the Handover Hard-Lock (PRD §3.2).
drop policy if exists "payment_receipts_read" on storage.objects;
create policy "payment_receipts_read" on storage.objects for select
  using (
    bucket_id = 'payment-receipts' and (
      can_view_all() or owns_customer(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "payment_receipts_write" on storage.objects;
create policy "payment_receipts_write" on storage.objects for insert
  with check (bucket_id = 'payment-receipts' and can_write_finance());

drop policy if exists "payment_receipts_delete" on storage.objects;
create policy "payment_receipts_delete" on storage.objects for delete
  using (bucket_id = 'payment-receipts' and can_write_finance());

-- ---------- FIELD REPORT PHOTOS ----------
drop policy if exists "field_report_photos_read" on storage.objects;
create policy "field_report_photos_read" on storage.objects for select
  using (bucket_id = 'field-report-photos' and (can_view_all() or is_field()));

drop policy if exists "field_report_photos_write" on storage.objects;
create policy "field_report_photos_write" on storage.objects for insert
  with check (bucket_id = 'field-report-photos' and (can_write_berkas() or can_manage_config() or is_field()));

drop policy if exists "field_report_photos_delete" on storage.objects;
create policy "field_report_photos_delete" on storage.objects for delete
  using (bucket_id = 'field-report-photos' and can_manage_config());

-- ---------- COMPLAINT PHOTOS (readable/writable by everyone signed in) ----------
-- The `auth.uid() is not null` check matters: without it the anon role
-- satisfies the policy, and the anon key ships in the frontend bundle — so
-- the bucket would be world-readable despite being marked private.
drop policy if exists "complaint_photos_read" on storage.objects;
create policy "complaint_photos_read" on storage.objects for select
  using (bucket_id = 'complaint-photos' and auth.uid() is not null);

drop policy if exists "complaint_photos_write" on storage.objects;
create policy "complaint_photos_write" on storage.objects for insert
  with check (bucket_id = 'complaint-photos' and auth.uid() is not null and not is_monitor());

drop policy if exists "complaint_photos_delete" on storage.objects;
create policy "complaint_photos_delete" on storage.objects for delete
  using (bucket_id = 'complaint-photos' and (can_manage_config() or can_write_berkas()));
