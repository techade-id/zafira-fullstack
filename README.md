# Griya Zafira CRM — Integrated Sales & Field Monitoring System

React (Vite) + Supabase implementation of the Techade.id quotation scope, plus the
extra features requested: payment history, cancellation tracking, contractor
evaluation, digital siteplan, ads analytics, and multi-project support.

## 1. Set up Supabase

1. Create a project at https://supabase.com
2. Open the SQL Editor and run the contents of `supabase/schema.sql`
   — this creates all tables, enums, and Row Level Security policies.
3. Go to Project Settings → API and copy your **Project URL** and **anon public key**.
4. In this repo, copy `.env.example` to `.env` and fill in those two values:
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
  live data. Use this as the reference pattern for other modules.
- **Pembayaran (Payments)**: record payments per customer (booking, DP, dana
  talangan, termin, pelunasan), verify payments — this is the billing-history
  module you flagged as missing from the original quotation.

## What's scaffolded but needs UI (tables + RLS already exist)

Each of these has a placeholder page describing its planned fields — copy the
pattern from `ProspekPage.jsx` or `PembayaranPage.jsx` to build them out:

- **Konsumen** — customer records, linked documents (`customer_documents`)
  with verification status → covers "progres administrasi/berkas konsumen"
- **Pembatalan** — `cancellations` table, reason + who cancelled
- **Proyek** — multi-project support (`projects` table) so you're not locked
  to Griya Zafira only
- **Siteplan Digital** — `units` table has `pos_x`/`pos_y` normalized
  coordinates for pinning units over an uploaded siteplan image; click a pin
  to show customer + construction progress
- **Kontraktor** — `contractors` + `contractor_evaluations` (1–5 score per
  project) for filtering/evaluating contractors
- **Monitoring Lapangan** — `field_projects` (progress %, status, assigned
  team) + `field_reports` (photos, kendala/solusi) — this is also the data
  source for a future mobile PWA for the field team
- **Komplain** — `complaints` table, category/priority/assignment
- **Laporan** — aggregate views/exports over the above tables
- **Digital Ads** — `ads_analytics` table for campaign spend/leads tracking

## Roles

Four roles are baked into RLS: `admin`, `manager`, `sales_agent`,
`tim_lapangan`. Admin/manager see everything; sales agents only see leads and
customers assigned to them; field team only sees field projects/reports they're
assigned to. Adjust the policies in `schema.sql` as your process solidifies.
# zafira-fullstack
# zafira-fullstack
