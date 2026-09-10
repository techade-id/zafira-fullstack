-- ============================================================
-- Zafira Property — Migration 009
-- PRD §4: pipeline penjualan pra-booking.
--
--   1. Sumber leads relasional — ads_campaigns, partners, kategori organik
--   2. Funnel 7 tahap PRD, tahap Booking ke atas terisi otomatis
--   3. Follow-up tracking (hasil follow-up + aktor + waktu)
--   4. Field Unicode: username sosial media
--
-- Aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tahap funnel
--
-- Nilai enum harus di-commit sebelum dipakai UPDATE di bawahnya.
-- ------------------------------------------------------------

alter type lead_status add value if not exists 'hot';
alter type lead_status add value if not exists 'booking';
alter type lead_status add value if not exists 'kpr';
alter type lead_status add value if not exists 'akad';
alter type lead_status add value if not exists 'aftersales';

commit;

-- Pemetaan tahap lama ke diagram PRD.
update leads set status = 'warm'    where status::text = 'dihubungi';
update leads set status = 'hot'     where status::text = 'appointment';
update leads set status = 'booking' where status::text in ('deal', 'closing');

-- ------------------------------------------------------------
-- 2. Sumber leads relasional
-- ------------------------------------------------------------

create table if not exists ads_campaigns (
  id uuid primary key default gen_random_uuid(),
  platform text not null,             -- Instagram, TikTok, Meta Ads, Google Ads
  name text not null,
  code text unique,                   -- kode yang dipakai tim digital di UTM
  start_date date,
  end_date date,
  budget numeric(14,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'freelance',   -- freelance | kemitraan
  phone text,
  komisi_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table ads_campaigns enable row level security;
alter table partners enable row level security;

drop policy if exists "ads_campaigns_select" on ads_campaigns;
create policy "ads_campaigns_select" on ads_campaigns for select using (true);
drop policy if exists "ads_campaigns_write" on ads_campaigns;
create policy "ads_campaigns_write" on ads_campaigns for all
  using (can_manage_config() or can_write_berkas()) with check (can_manage_config() or can_write_berkas());

drop policy if exists "partners_select" on partners;
create policy "partners_select" on partners for select using (true);
drop policy if exists "partners_write" on partners;
create policy "partners_write" on partners for all
  using (can_manage_config() or can_write_berkas()) with check (can_manage_config() or can_write_berkas());

alter table ads_analytics  add column if not exists campaign_id uuid references ads_campaigns(id) on delete set null;

alter table leads add column if not exists source_type text;              -- ads | freelance | organik
alter table leads add column if not exists campaign_id uuid references ads_campaigns(id) on delete set null;
alter table leads add column if not exists partner_id uuid references partners(id) on delete set null;
alter table leads add column if not exists organik_kategori text;         -- OTS | Event | Brosur
alter table leads add column if not exists username_sosmed text;

alter table customers add column if not exists username_sosmed text;

comment on column leads.source is
  'Teks sumber versi lama. Dipertahankan agar laporan historis tidak putus; data baru memakai source_type + campaign_id/partner_id/organik_kategori.';

-- Backfill dari teks bebas yang sudah ada, supaya laporan lama tetap utuh.
update leads
   set source_type = case
     when source ilike '%ads%' or source ilike '%instagram%' or source ilike '%tiktok%'
       or source ilike '%facebook%' or source ilike '%google%' then 'ads'
     when source ilike '%freelance%' or source ilike '%mitra%' or source ilike '%kemitraan%' then 'freelance'
     when source is null or source = '' then null
     else 'organik'
   end
 where source_type is null;

create index if not exists idx_leads_source_type on leads (source_type);
create index if not exists idx_leads_campaign on leads (campaign_id);
create index if not exists idx_leads_partner on leads (partner_id);

-- Nama dan username boleh memuat emoji (PRD §2.2), jadi indeks pencariannya
-- ikut disiapkan seperti kolom teks lain.
create index if not exists idx_leads_sosmed_trgm on leads using gin (username_sosmed gin_trgm_ops);
create index if not exists idx_customers_sosmed_trgm on customers using gin (username_sosmed gin_trgm_ops);

insert into business_settings (category, value, sort_order) values
  ('organik_kategori', 'OTS', 1),
  ('organik_kategori', 'Event', 2),
  ('organik_kategori', 'Brosur', 3),
  ('organik_kategori', 'Referensi Konsumen', 4),
  ('hasil_followup', 'Tertarik', 1),
  ('hasil_followup', 'Masih Pertimbangan', 2),
  ('hasil_followup', 'Minta Dihubungi Ulang', 3),
  ('hasil_followup', 'Tidak Menjawab', 4),
  ('hasil_followup', 'Survei Lokasi', 5),
  ('hasil_followup', 'Siap Booking', 6),
  ('hasil_followup', 'Tidak Berminat', 7)
on conflict (category, value) do nothing;

-- ------------------------------------------------------------
-- 3. Otomasi tahap funnel
--
-- Booking ke atas ditarik dari data yang sudah tercatat di modul lain, supaya
-- status prospek tidak pernah berbeda dari kenyataan berkas dan pembayaran.
-- ------------------------------------------------------------

create or replace function lead_stage_rank(p_status lead_status)
returns int language sql immutable as $$
  select case p_status::text
    when 'baru' then 1
    when 'leads' then 1
    when 'cold' then 1
    when 'warm' then 2
    when 'dihubungi' then 2
    when 'hot' then 3
    when 'appointment' then 3
    when 'booking' then 4
    when 'deal' then 4
    when 'closing' then 4
    when 'kpr' then 5
    when 'akad' then 6
    when 'aftersales' then 7
    else 0
  end;
$$;

-- Hanya menaikkan, tidak pernah menurunkan, dan tidak pernah menimpa 'cancel'.
create or replace function promote_lead(p_lead_id uuid, p_stage lead_status)
returns void language sql security definer set search_path = public as $$
  update leads
     set status = p_stage, updated_at = now()
   where id = p_lead_id
     and status <> 'cancel'
     and lead_stage_rank(p_stage) > lead_stage_rank(status);
$$;

create or replace function sync_lead_stage_from_kpr()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_lead uuid;
  v_stage lead_status;
begin
  select c.lead_id into v_lead from customers c where c.id = new.customer_id;
  if v_lead is null then
    return null;
  end if;

  v_stage := case
    when new.tanggal_serah_terima_kunci is not null then 'aftersales'
    when new.tanggal_akad is not null then 'akad'
    when new.tanggal_masuk_bank is not null then 'kpr'
    when new.tanggal_booking is not null then 'booking'
  end;

  if v_stage is not null then
    perform promote_lead(v_lead, v_stage);
  end if;

  return null;
end $$;

drop trigger if exists customer_kpr_sync_lead_stage on customer_kpr;
create trigger customer_kpr_sync_lead_stage
  after insert or update on customer_kpr
  for each row execute function sync_lead_stage_from_kpr();

-- Kuitansi Booking Fee terverifikasi (migration_008) mengisi locked_at —
-- momen itulah yang menaikkan prospek ke tahap Booking.
create or replace function sync_lead_stage_from_lock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.locked_at is not null and old.locked_at is null and new.lead_id is not null then
    perform promote_lead(new.lead_id, 'booking');
  end if;
  return null;
end $$;

drop trigger if exists customers_sync_lead_stage on customers;
create trigger customers_sync_lead_stage
  after update on customers
  for each row execute function sync_lead_stage_from_lock();

grant execute on function lead_stage_rank(lead_status) to authenticated;
grant execute on function promote_lead(uuid, lead_status) to authenticated;

-- ------------------------------------------------------------
-- 4. Follow-up tracking
--
-- Kolom hasil dan customer_id ditambahkan di migration_008; di sini hanya
-- indeks urutan kronologis dan default aktor.
-- ------------------------------------------------------------

alter table lead_activities alter column actor_id set default auth.uid();
create index if not exists idx_lead_activities_created on lead_activities (created_at desc);
create index if not exists idx_lead_act_hasil_trgm on lead_activities using gin (hasil gin_trgm_ops);

-- ------------------------------------------------------------
-- 5. Dashboard mengikuti tahap funnel baru
--
-- dashboard_stats() menghitung "deal" lewat status 'deal'/'closing'. Setelah
-- pemetaan di atas tidak ada lagi baris dengan status itu, jadi tanpa
-- pembaruan ini seluruh angka closing pada dashboard akan menjadi nol.
-- ------------------------------------------------------------

drop function if exists dashboard_stats();
drop function if exists dashboard_stats(date, date);

create or replace function dashboard_stats(
  p_from date default null,
  p_to   date default null
)
returns json
language plpgsql
stable
security invoker
as $$
declare
  jkt_today  date := (now() at time zone 'Asia/Jakarta')::date;
  d_from     date := coalesce(p_from, '1900-01-01'::date);
  d_to       date := coalesce(p_to, jkt_today);
  month_start      date := date_trunc('month', jkt_today)::date;
  prev_month_start date := (date_trunc('month', jkt_today) - interval '1 month')::date;
  result json;
begin
  select json_build_object(
    'range_from', p_from,
    'range_to',   p_to,

    'total_leads',       (select count(*) from leads where (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to),
    'deal_count',        (select count(*) from leads where status::text in ('booking','kpr','akad','aftersales','deal','closing') and (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to),
    'appointment_count', (select count(*) from leads where status = 'appointment' and (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to),
    'cancel_count',      (select count(*) from leads where status = 'cancel' and (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to),

    'leads_this_month',  (select count(*) from leads where (created_at at time zone 'Asia/Jakarta')::date >= month_start),
    'leads_prev_month',  (select count(*) from leads
                          where (created_at at time zone 'Asia/Jakarta')::date >= prev_month_start
                            and (created_at at time zone 'Asia/Jakarta')::date <  month_start),
    'deals_this_month',  (select count(*) from leads where status::text in ('booking','kpr','akad','aftersales','deal','closing')
                          and (created_at at time zone 'Asia/Jakarta')::date >= month_start),
    'deals_prev_month',  (select count(*) from leads where status::text in ('booking','kpr','akad','aftersales','deal','closing')
                          and (created_at at time zone 'Asia/Jakarta')::date >= prev_month_start
                          and (created_at at time zone 'Asia/Jakarta')::date <  month_start),

    'customers_active',  (select count(*) from customers where status <> 'batal'),
    'units_available',   (select count(*) from units where status = 'tersedia'),
    'units_total',       (select count(*) from units),
    'complaints_active', (select count(*) from complaints where status <> 'selesai'),

    'by_status', (
      select coalesce(json_agg(json_build_object('label', s.status, 'value', s.c) order by s.c desc), '[]'::json)
      from (select status::text as status, count(*) c from leads
            where (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to
            group by status) s
    ),

    'by_source', (
      select coalesce(json_agg(json_build_object('source', x.src, 'leads', x.total, 'deals', x.deals) order by x.total desc), '[]'::json)
      from (
        select coalesce(nullif(source, ''), 'Tidak diketahui') src,
               count(*) total,
               count(*) filter (where status::text in ('booking','kpr','akad','aftersales','deal','closing')) deals
        from leads
        where (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to
        group by 1
      ) x
    ),

    'by_agent', (
      select coalesce(json_agg(json_build_object('name', a.full_name, 'leads', a.total, 'deals', a.deals) order by a.deals desc), '[]'::json)
      from (
        select p.full_name,
               count(l.id) total,
               count(l.id) filter (where l.status::text in ('booking','kpr','akad','aftersales','deal','closing')) deals
        from profiles p
        join leads l on l.assigned_to = p.id
        where (l.created_at at time zone 'Asia/Jakarta')::date between d_from and d_to
        group by p.full_name
      ) a
    ),

    'by_day', (
      select coalesce(json_agg(json_build_object('day', d.day, 'value', d.value) order by d.day), '[]'::json)
      from (
        select (d_to - g) as day,
               (select count(*) from leads l
                where (l.created_at at time zone 'Asia/Jakarta')::date = d_to - g) as value
        from generate_series(6, 0, -1) g
      ) d
    ),

    -- Rekap konsumen yang sedang mengumpulkan berkas
    'berkas_recap', (
      select coalesce(json_agg(json_build_object(
               'customer_id', b.id,
               'name',        b.name,
               'progres',     b.progres_berkas,
               'bank',        b.nama_bank,
               'masuk_bank',  b.tanggal_masuk_bank,
               'lama_hari',   b.lama_hari
             ) order by b.lama_hari desc nulls last), '[]'::json)
      from (
        select c.id, c.name, k.progres_berkas, k.nama_bank, k.tanggal_masuk_bank,
               case when k.tanggal_masuk_bank is not null
                    then (jkt_today - k.tanggal_masuk_bank) end as lama_hari
        from customer_kpr k
        join customers c on c.id = k.customer_id
        where c.status <> 'batal'
          and coalesce(k.progres_berkas, '') <> ''
          and k.progres_berkas not in ('Serah Terima Kunci')
          and k.tanggal_serah_terima_kunci is null
      ) b
    ),

    'berkas_summary', (
      select coalesce(json_agg(json_build_object('label', s.progres, 'value', s.c) order by s.c desc), '[]'::json)
      from (
        select k.progres_berkas as progres, count(*) c
        from customer_kpr k
        join customers c on c.id = k.customer_id
        where c.status <> 'batal' and coalesce(k.progres_berkas, '') <> ''
        group by k.progres_berkas
      ) s
    ),

    'kpr_durations', (
      select json_build_object(
        'berkas',    avg(tanggal_sp3k_terbit - tanggal_masuk_bank),
        'sp3k_akad', avg(tanggal_akad - tanggal_sp3k_terbit),
        'akad',      avg(tanggal_akad - tanggal_dp),
        'serah',     avg(tanggal_serah_terima_kunci - tanggal_akad)
      ) from customer_kpr
    )
  ) into result;

  return result;
end $$;

grant execute on function dashboard_stats(date, date) to authenticated;

notify pgrst, 'reload schema';
