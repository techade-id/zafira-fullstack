-- ============================================================
-- Zafira Property — Migration 010
-- Menutup celah yang tersisa dari fase 1-4:
--
--   1. lead_stage_bucket() — memetakan nilai enum lama ke 7 tahap PRD
--   2. dashboard_stats()   — funnel, status handover, dan antrean Finance
--   3. campaign_performance() — biaya per lead/deal dihitung dari lead
--      sungguhan yang terkait campaign, bukan angka yang diketik manual
--
-- Aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Bucket tahap
--
-- Nilai enum lama tidak bisa dihapus dari Postgres, jadi baris lama masih bisa
-- membawa 'dihubungi' atau 'deal'. Semua agregat memakai fungsi ini supaya
-- tahap yang ditampilkan selalu tujuh tahap PRD, apa pun isi kolomnya.
-- ------------------------------------------------------------

create or replace function lead_stage_bucket(p_status lead_status)
returns text language sql immutable as $$
  select case p_status::text
    when 'baru' then 'new'
    when 'leads' then 'new'
    when 'cold' then 'new'
    when 'warm' then 'warm'
    when 'dihubungi' then 'warm'
    when 'hot' then 'hot'
    when 'appointment' then 'hot'
    when 'booking' then 'booking'
    when 'deal' then 'booking'
    when 'closing' then 'booking'
    when 'kpr' then 'kpr'
    when 'akad' then 'akad'
    when 'aftersales' then 'aftersales'
    when 'cancel' then 'cancel'
    else 'new'
  end;
$$;

grant execute on function lead_stage_bucket(lead_status) to authenticated;

-- ------------------------------------------------------------
-- 2. Dashboard
-- ------------------------------------------------------------

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
    'appointment_count', (select count(*) from leads where status::text in ('hot','appointment') and (created_at at time zone 'Asia/Jakarta')::date between d_from and d_to),
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
    ),

    -- ---- tambahan migrasi 010 ----

    -- Funnel 7 tahap PRD §4.2, memakai bucket supaya nilai enum lama ikut terhitung.
    'funnel', (
      select coalesce(json_agg(json_build_object('stage', f.stage, 'label', f.label, 'value', f.c) order by f.ord), '[]'::json)
      from (
        select v.ord, v.stage, v.label,
               (select count(*) from leads l
                 where lead_stage_bucket(l.status) = v.stage
                   and (l.created_at at time zone 'Asia/Jakarta')::date between d_from and d_to) as c
        from (values
          (1, 'new', 'New Lead'), (2, 'warm', 'Warm Lead'), (3, 'hot', 'Hot Lead'),
          (4, 'booking', 'Booking'), (5, 'kpr', 'KPR'), (6, 'akad', 'Akad'),
          (7, 'aftersales', 'Aftersales'), (8, 'cancel', 'Cancel')
        ) v(ord, stage, label)
      ) f
    ),

    -- Siapa yang sedang memegang tanggung jawab data (PRD §3.2).
    'handover', (
      select json_build_object(
        'terkunci', count(*) filter (where locked_at is not null),
        'sales',    count(*) filter (where locked_at is null and status <> 'batal')
      ) from customers
    ),

    -- Antrean kerja Finance, plus satu penanda integritas: pembayaran yang
    -- tervalidasi tetapi tidak punya kuitansi seharusnya nol setelah
    -- migration_008 — kalau tidak, itu sisa data lama yang perlu dirapikan.
    'finance', (
      select json_build_object(
        'menunggu_jumlah',       count(*) filter (where status = 'menunggu'),
        'menunggu_nominal',      coalesce(sum(amount) filter (where status = 'menunggu'), 0),
        'terverifikasi_nominal', coalesce(sum(amount) filter (where status = 'terverifikasi'
                                    and payment_date between d_from and d_to), 0),
        'tanpa_kuitansi',        count(*) filter (where status = 'terverifikasi' and proof_url is null)
      ) from payments
    )
  ) into result;

  return result;
end $$;



grant execute on function dashboard_stats(date, date) to authenticated;

-- ------------------------------------------------------------
-- 3. Performa campaign
--
-- IklanPage sebelumnya memakai kolom leads_generated yang diketik tangan.
-- Sekarang jumlah lead dihitung dari baris leads yang benar-benar terkait
-- campaign (leads.campaign_id), sehingga biaya per lead tidak bisa salah
-- karena kesalahan input, dan biaya per deal bisa ikut dihitung.
--
-- SECURITY INVOKER: RLS tetap berlaku. Halaman Digital Ads memang hanya
-- dibuka Admin Marketing, Pengawas dan Admin.
-- ------------------------------------------------------------

drop function if exists campaign_performance(date, date);

create or replace function campaign_performance(
  p_from date default null,
  p_to   date default null
)
returns table (
  campaign_id   uuid,
  platform      text,
  nama          text,
  aktif         boolean,
  spend         numeric,
  leads_count   bigint,
  deals_count   bigint,
  cost_per_lead numeric,
  cost_per_deal numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with rentang as (
    select coalesce(p_from, '1900-01-01'::date) as d_from,
           coalesce(p_to, (now() at time zone 'Asia/Jakarta')::date) as d_to
  ),
  belanja as (
    select a.campaign_id, sum(coalesce(a.spend, 0)) as spend
    from ads_analytics a, rentang r
    where a.campaign_id is not null and a.report_date between r.d_from and r.d_to
    group by a.campaign_id
  ),
  prospek as (
    select l.campaign_id,
           count(*) as leads_count,
           count(*) filter (where lead_stage_bucket(l.status) in ('booking','kpr','akad','aftersales')) as deals_count
    from leads l, rentang r
    where l.campaign_id is not null
      and (l.created_at at time zone 'Asia/Jakarta')::date between r.d_from and r.d_to
    group by l.campaign_id
  )
  select c.id,
         c.platform,
         c.name,
         c.is_active,
         coalesce(b.spend, 0),
         coalesce(p.leads_count, 0),
         coalesce(p.deals_count, 0),
         case when coalesce(p.leads_count, 0) > 0
              then round(coalesce(b.spend, 0) / p.leads_count) end,
         case when coalesce(p.deals_count, 0) > 0
              then round(coalesce(b.spend, 0) / p.deals_count) end
  from ads_campaigns c
  left join belanja b on b.campaign_id = c.id
  left join prospek p on p.campaign_id = c.id
  order by coalesce(b.spend, 0) desc, c.name;
$$;

grant execute on function campaign_performance(date, date) to authenticated;

notify pgrst, 'reload schema';
