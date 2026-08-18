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
   Then run **`supabase/migration_003_security_and_integrity.sql`** — this one
   is required on every existing project. It closes a privilege-escalation
   hole (any user could set their own role to `admin`), stops the anon key
   from reading complaint photos, makes cancellation and agent-transfer
   atomic, and adds the `dashboard_stats()` function the dashboard needs.
   Until it's run, the dashboard will show a "Gagal memuat ringkasan" banner.
   Finally run **`supabase/migration_004_project_management.sql`** — it adds
   the construction side from the Project Management spreadsheet: Rencana
   Proyek tasks (4 stages, working-day deadlines, warranty), per-stage
   contractor evaluation, complaint warranty/severity, and the working
   calendar (weekend config + holidays).
   Optional: `supabase/seed_siteplan_kaligangsa.sql` creates the Kaligangsa
   project with all 158 units already positioned on the siteplan, and
   `supabase/seed_demo_data.sql` fills every page with example prospek,
   konsumen, KPR, pembayaran, komplain, evaluasi kontraktor and ads data so
   the app can be demoed. Every demo row's id starts with `5eed` — run
   `supabase/seed_demo_data_remove.sql` to delete all of it before real use.
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

## 2. Domain (zafiraproperty.id)

DNS and the Vercel domain binding have to be done by hand — they are not
part of this repo:

1. Vercel → Project → Settings → Domains → add `zafiraproperty.id` and
   `www.zafiraproperty.id`.
2. At the registrar, point the records Vercel shows you:
   - `A` record for the apex `@` → `76.76.21.21`
   - `CNAME` for `www` → `cname.vercel-dns.com`
   (use whatever Vercel displays — it is authoritative over these values)
3. Wait for propagation; Vercel issues the TLS certificate automatically.
4. Supabase → Authentication → URL Configuration: set **Site URL** to
   `https://zafiraproperty.id` and add it to **Redirect URLs**, otherwise
   password-reset and confirmation links keep pointing at the old
   `*.vercel.app` address.

## 3. Run locally

```bash
npm install
npm run dev
```

## 4. Deploy to Vercel

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

| Role | Reach |
|---|---|
| `admin` | everything, and the only role that can change another user's role |
| `manager` / `supervisor` | everything except changing roles |
| `administrasi` | pemberkasan — every customer's documents, KPR progress and payments, but no writes to the sales pipeline |
| `marketing` / `sales_agent` | only the leads and customers assigned to them |
| `tim_lapangan` | only the field projects/reports they are assigned to |

The role lists live in two helper functions, `is_full_access()` and
`is_berkas_access()` (see `migration_005_roles_and_dashboard.sql`), which every
policy calls — so changing who counts as manager-level is a single edit rather
than a sweep through ~28 policies.
# zafira-fullstack

