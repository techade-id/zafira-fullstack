-- ============================================================
-- Zafira Property — Migration 023
-- Follow-up prospek adalah pekerjaan Sales.
--
-- Alur yang disepakati: Leads adalah data mentah; seluruh proses — mencatat
-- follow-up, survei, BI-Checking, booking, mengalihkan, membatalkan — terjadi
-- di menu Follow Up Leads dan dikerjakan Sales. Admin Marketing hanya
-- memeriksa dan memverifikasi pemberkasan; ia tidak menambahkan apa pun pada
-- prospek.
--
-- Sampai migrasi ini, lead_activities_insert (migration_008) membuka pintu
-- bagi can_write_berkas() dan can_write_finance() pada baris APA PUN —
-- termasuk catatan yang hanya menempel pada prospek. Akibatnya Admin
-- Marketing dan Finance bisa menulis follow-up atas prospek yang bukan
-- tanggung jawabnya, dan karena trigger penentu status membaca setiap catatan
-- baru, tulisan itu ikut menggerakkan status prospek.
--
-- Kini:
--   · Catatan yang menempel pada konsumen (customer_id terisi) tetap terbuka
--     untuk Admin Marketing dan Finance — hubungan dengan konsumen tidak
--     berhenti di booking, dan merekalah yang memegangnya sesudah itu.
--   · Catatan yang hanya menempel pada prospek ditulis oleh Admin, atau oleh
--     Sales pemilik prospek. Pemilik yang bukan Sales (mis. prospek pernah
--     dialihkan ke peran lain) tidak lagi cukup.
--
-- Fungsi SECURITY DEFINER (convert_lead_to_customer, transfer_lead, trigger
-- KPR) tidak terpengaruh. cancel_lead berjalan sebagai pemanggil, tetapi
-- yang boleh memanggilnya memang hanya Admin dan Sales pemilik (leads_update).
--
-- Aman dijalankan ulang.
-- ============================================================

drop policy if exists "lead_activities_insert" on lead_activities;
create policy "lead_activities_insert" on lead_activities for insert
  with check (
    is_admin()
    or (can_write_sales() and owns_lead(lead_id))
    or owns_customer(customer_id)
    or (customer_id is not null and (can_write_berkas() or can_write_finance()))
  );
