# Zafira Property CRM

React (Vite) + Supabase. Covers the original quotation scope plus the changes
agreed in `REVISI.md` and specified in `PRD.md`: Navy/Deep Orange brand palette,
global Notes search, the five-role access matrix with Segregation of Duties, the
Booking Fee Handover Hard-Lock, an audit trail, and the PRD sales pipeline
(relational lead sources, seven-stage funnel, follow-up tracking).

`PLAN.md` records the full plan these changes were built from.

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
   `supabase/migration_006_delete_behaviour.sql` is needed for the delete
   buttons: without it Postgres refuses to delete a prospek that became a
   konsumen, or a konsumen that has a komplain.

   Then run the three migrations that implement REVISI.md and PRD.md, **in
   order**:

   - **`migration_007_notes_search.sql`** — enables `pg_trgm`, adds the GIN
     trigram indexes, and creates `search_notes()`. Until it runs, the search
     box in the header returns an error.
   - **`migration_008_roles_sod.sql`** — adds the five PRD roles and maps the
     old ones, splits every RLS policy into separate SELECT/INSERT/UPDATE/DELETE
     rules (so read-only roles are actually read-only), stops Sales verifying
     their own payments, adds the Handover Hard-Lock, and starts filling
     `activity_logs`.
   - **`migration_009_pipeline.sql`** — the seven-stage funnel with automatic
     promotion, `ads_campaigns` + `partners` for relational lead sources, the
     social-media username fields, and an updated `dashboard_stats()`.
   - **`migration_010_dashboard_and_ads.sql`** — `lead_stage_bucket()` so every
     aggregate reports the seven PRD stages regardless of which legacy enum
     value a row still carries; the funnel, handover and Finance-queue figures
     on the dashboard; and `campaign_performance()`, which derives cost per lead
     and cost per deal from leads actually tagged to a campaign.

   Re-run `supabase/storage.sql` after 008: it creates the `payment-receipts`
   bucket and re-points every storage policy at the new access helpers.

   Run `supabase/check_setup.sql` afterwards to confirm all of it landed.
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
- **Dashboard**: the seven-stage funnel with stage-to-stage conversion, how many
  customers have been handed over to Admin Marketing, the Finance verification
  queue, and live counts (prospek, konsumen, unit tersedia, komplain aktif)
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
- **Digital Ads**: ad spend recorded against a registered `ads_campaigns` row,
  with cost per lead and cost per deal computed from the prospects actually
  tagged to that campaign rather than a figure typed in by hand. Spend not yet
  linked to a campaign is called out so it cannot quietly skew the average.
- **Pencarian Catatan**: one search box in the header covering lead notes,
  follow-up history, customer names, KPR kendala, payment notes, complaints,
  field reports, cancellations and contractors — partial match anywhere in the
  text, backed by trigram indexes and filtered by RLS so an agent only ever
  finds their own records.
- **Follow Up**: chronological communication log per lead and per customer
  (time, actor, note, outcome). Stays open to Sales after the Hard-Lock.
- **Log Aktivitas**: audit trail for Admin and Pengawas, with a per-column
  before/after diff and date/module filters.
- **Reminder**: prospects with a scheduled follow-up date, sorted by days
  remaining (overdue / today / upcoming).
- **Penetapan Target**: per-agent, per-period sales targets (total prospek,
  closing, per-day rates, deal value).
- **Data Agen**: edit agent role/divisi/daerah/active status, and transfer a
  customer to another agent (logged in `customer_transfers`).
- **Pengaturan Bisnis**: admin-editable dropdown lists (lead sources, banks,
  cancel reasons, follow-up categories, progres berkas) used across the app.

Every list has an **Ubah** and a **Hapus** button on each row. "Ubah" reopens
the same form the row was created with, pre-filled, and saves as an update
rather than a new row; "Batal" leaves edit mode without touching anything. A
handful of fields stay create-only on purpose because a dedicated control
already owns them — a lead's status (the inline funnel select), a customer's
sales agent (the transfer flow on Data Agen, which writes an audit row), and
the status of a customer, complaint or payment. Agent details and the business
dropdown lists edit in place: type over the value and it saves when the field
loses focus.

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
| `sales` | own leads and customers, up to the Booking Fee; locked out of a customer's profile and berkas once Finance verifies that receipt |
| `admin_marketing` | pemberkasan — every customer's documents and KPR progress from Booking to Akad |
| `finance` | the only role that can verify a payment or upload a kuitansi; verifying a Booking Fee receipt is what fires the Handover Hard-Lock |
| `supervisor_marketing` | read-only across every operational module |
| `pengawas` | read-only over the transaction cycle, plus the activity log and business configuration |
| `tim_lapangan` | only the field projects/reports they are assigned to |

Retired names (`manager`, `supervisor`, `marketing`, `administrasi`,
`sales_agent`) stay in the enum because Postgres cannot drop enum values, but
`migration_008` moves every profile off them.

Access rules live in one set of helper functions — `is_admin()`,
`can_view_all()`, `can_write_sales()`, `can_write_berkas()`,
`can_write_finance()`, `can_manage_config()` — which every policy calls, so
changing who counts as what is a single edit rather than a sweep through ~28
policies. `src/lib/permissions.js` mirrors the same matrix in the frontend so a
user is never shown a button the database will reject.

## Segregation of Duties

The rules that are enforced by triggers rather than RLS, because RLS cannot
restrict individual columns:

- `guard_payment_verification()` — only Finance may change a payment's `status`,
  `verified_by` or `proof_url`. Anyone else recording a payment gets it forced
  to `menunggu`.
- `apply_booking_handover()` — a verified `booking` payment carrying a receipt
  stamps `customers.locked_at`, hands the record to Admin Marketing, and
  promotes the lead to the Booking stage.
- `guard_profile_privileged_columns()` — only admin changes a role.
- `log_activity()` — writes a per-column diff to `activity_logs` for leads,
  customers, KPR, documents, payments, cancellations, profiles and units.

Unlocking a handed-over customer is deliberately not a page control; it is the
admin-only `unlock_customer(customer_id, reason)` RPC, and it writes to the
audit log.
