# Griya Zafira CRM — Integrated Sales & Field Monitoring System

React (Vite) + Supabase implementation of the Techade.id quotation scope, plus the
extra features requested: payment history, cancellation tracking, contractor
evaluation, digital siteplan, ads analytics, and multi-project support.

## 1. Set up Supabase

1. Create a project at https://supabase.com
2. Open the SQL Editor and run the contents of `supabase/schema.sql`
   — this creates all tables, enums, and Row Level Security policies.
   **On a project that was already provisioned before the KPR/CRM
   expansion, run `supabase/migration_002_kpr_pipeline.sql` instead of
   re-running schema.sql** — it adds the new funnel stages, lead intake
   fields, KPR pipeline (`customer_kpr`), sales targets, business
   settings, agent fields, and transfer log without dropping data.
3. Run `supabase/storage.sql` next — it creates the Storage buckets
   (`siteplan-images`, `customer-documents`, `field-report-photos`,
   `complaint-photos`) and their RLS policies, needed by Siteplan Digital,
   Konsumen documents, Monitoring Lapangan photos, and Komplain photos.
4. Go to Project Settings → API and copy your **Project URL** and **anon public key**.
5. In this repo, copy `.env.example` to `.env` and fill in those two values:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=xxxxx
   ```
5. Create your first user: Supabase Dashboard → Authentication → Add user
   (or let people sign up if you wire up a signup page). A `profiles` row is
   auto-created for every new user via the `on_auth_user_created` trigger,
   defaulting to the `sales_agent` role. Promote yourself to `admin` by running
   in the SQL Editor:
   ```sql
   update profiles set role = 'admin' where id = 'YOUR-USER-UUID';
   ```

## 2. Run locally

```bash
npm install
npm run dev
```

## 3. Deploy to Vercel

```bash
npx vercel
```
Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Environment Variables
in the Vercel project settings (Project → Settings → Environment Variables),
matching your `.env`.

## What's already working

- **Auth**: real Supabase email/password login, session persistence, role read
  from `profiles`.
- **Dashboard**: live counts (prospek, konsumen, unit tersedia, komplain aktif)
  pulled from Supabase.
- **Prospek (Leads)**: full CRUD — add lead, change status inline, list with
  live data.
- **Pembayaran (Payments)**: record payments per customer (booking, DP, dana
  talangan, termin, pelunasan), verify payments — this is the billing-history
  module that covers the gap flagged against the original quotation.
- **Proyek**: multi-project CRUD plus per-project unit management (kode unit,
  blok, tipe, harga, status) — unblocks every module below.
- **Konsumen**: customer CRUD linked to lead/unit/sales agent, process
  duration tracking (`process_started_at`/`process_completed_at`), and
  document upload (`customer_documents`) with verification status.
- **Pembatalan**: cancellation history per customer (reason, detail, who
  cancelled, when) — auto-marks the customer as `batal`.
- **Siteplan Digital**: per-project siteplan image upload, click-to-place unit
  pins (`pos_x`/`pos_y`) color-coded by status, click a pin for a modal with
  linked customer + construction progress.
- **Kontraktor**: contractor CRUD plus 1–5 star evaluations per unit, with
  sort/filter by average score.
- **Monitoring Lapangan**: `field_projects` progress tracking (%, status,
  contractor) plus `field_reports` (kendala/solusi, before/after photo
  upload) per unit.
- **Komplain**: complaint CRUD with category/priority, PIC assignment,
  status, and photo upload.
- **Laporan**: aggregate stat cards and breakdowns across prospek/konsumen/
  proyek/komplain, with one-click Excel export (`xlsx`).
- **Digital Ads**: `ads_analytics` CRUD with spend/leads-per-platform bars
  and a blended cost-per-lead figure.
- **Reminder**: prospects with a scheduled follow-up date, sorted by days
  remaining (overdue / today / upcoming).
- **Penetapan Target**: per-agent, per-period sales targets (total prospek,
  closing, per-day rates, deal value).
- **Data Agen**: edit agent role/divisi/daerah/active status, and transfer a
  customer to another agent (logged in `customer_transfers`).
- **Pengaturan Bisnis**: admin-editable dropdown lists (lead sources, banks,
  cancel reasons, follow-up categories, progres berkas) used across the app.

The modules above mirror the team's live sales spreadsheet: the 9-stage
funnel, full lead intake (usia, marital status, pekerjaan, gaji, domisili),
and the KPR customer pipeline (Booking → DP → Bank → SP3K → Akad → Serah
Terima Kunci → BPHTB → SHM) with per-stage duration tracking on the Konsumen
page and the dashboard.

## Not yet built

- **Mobile PWA for the field team** (separate app, per the original
  quotation scope) — `field_projects`/`field_reports` already back it.
- **Signup / user invite flow** — new users are still created manually in the
  Supabase dashboard and promoted to a role via SQL.
- **Automated tests**.

## Roles

Four roles are baked into RLS: `admin`, `manager`, `sales_agent`,
`tim_lapangan`. Admin/manager see everything; sales agents only see leads and
customers assigned to them; field team only sees field projects/reports they're
assigned to. Adjust the policies in `schema.sql` as your process solidifies.
# zafira-fullstack

