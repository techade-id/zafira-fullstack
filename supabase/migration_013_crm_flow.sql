-- ============================================================
-- Zafira Property — Migration 013
-- Menutup alur CRM: konversi Booking dan sumber notifikasi.
--
-- Dua hal yang selama ini hilang di antara modul-modul yang sudah ada:
--
--   1. convert_lead_to_customer() — Booking sebagai SATU peristiwa.
--      Sebelumnya Sales mengetik ulang seluruh data prospek ke form konsumen,
--      lalu mengaitkannya lewat dropdown opsional. Duplikasi data dan funnel
--      yang putus diam-diam adalah akibat langsungnya.
--
--   2. my_notifications() — satu sumber angka untuk lonceng dan blok
--      "Fokus Hari Ini". Sengaja sebuah fungsi, bukan tabel: semuanya sudah
--      dapat dihitung dari data yang ada, dan RLS-lah yang menyaringnya.
--
-- Aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Konversi prospek menjadi konsumen (Booking)
--
-- Kenapa SECURITY DEFINER.
--
-- Konversi harus mengubah units.status menjadi 'booking'. Policy units_write
-- (migrasi 008) berbunyi `can_manage_config() or can_write_berkas()`, dan
-- can_write_berkas() adalah `is_admin() or is_admin_marketing()` — Sales tidak
-- termasuk. Dijalankan sebagai INVOKER, konversi akan berhasil separuh lalu
-- gagal justru untuk peran yang paling sering memakainya.
--
-- Alternatifnya — melonggarkan units_write untuk Sales — jauh lebih buruk: itu
-- memberi Sales hak mengubah status unit mana pun kapan pun, bukan hanya lewat
-- konversi yang tervalidasi. Karena itu hak akses diperiksa eksplisit di dalam
-- fungsi ini, bukan diwariskan dari policy.
--
-- Catatan tentang tahap prospek: fungsi ini TIDAK menyentuh leads.status.
-- Kenaikan tahap tetap datang dari trigger yang sudah ada —
-- customer_kpr_sync_lead_stage (migrasi 009) menaikkan prospek ke 'booking'
-- begitu tanggal_booking terisi. Itu memang aturan sistem ini: tanggal booking
-- tercatat berarti prospek sudah sampai tahap Booking. Yang tetap menunggu
-- kuitansi Finance adalah Handover Hard-Lock, dan itu tidak berubah di sini.
-- ------------------------------------------------------------

create or replace function convert_lead_to_customer(
  p_lead_id          uuid,
  p_unit_id          uuid    default null,
  p_nominal_booking  numeric default null,
  p_tanggal_booking  date    default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lead      leads%rowtype;
  v_unit      units%rowtype;
  v_customer  uuid;
begin
  if not (can_write_sales() or can_write_berkas()) then
    raise exception 'Anda tidak berhak melakukan konversi booking.'
      using errcode = '42501';
  end if;

  select * into v_lead from leads where id = p_lead_id;
  if not found then
    raise exception 'Prospek tidak ditemukan.';
  end if;

  -- Sales hanya boleh mengonversi prospeknya sendiri. owns_lead() sudah dipakai
  -- policy leads sejak migrasi 008, jadi aturannya sama persis dengan yang
  -- berlaku ketika Sales membuka daftar prospeknya.
  if not (can_view_all() or owns_lead(p_lead_id)) then
    raise exception 'Prospek ini bukan milik Anda.' using errcode = '42501';
  end if;

  if v_lead.status = 'cancel' then
    raise exception 'Prospek ini sudah dibatalkan dan tidak bisa dikonversi.';
  end if;

  if exists (select 1 from customers where lead_id = p_lead_id) then
    raise exception 'Prospek ini sudah pernah dikonversi menjadi konsumen.';
  end if;

  -- Invarian properti yang selama ini tidak dijaga di mana pun: satu unit tidak
  -- boleh dibooking dua orang. FOR UPDATE menahan baris unit sampai transaksi
  -- selesai, sehingga dua konversi bersamaan ke unit yang sama tidak bisa
  -- sama-sama lolos pemeriksaan ini.
  if p_unit_id is not null then
    select * into v_unit from units where id = p_unit_id for update;
    if not found then
      raise exception 'Unit tidak ditemukan.';
    end if;
    if v_unit.status <> 'tersedia' then
      raise exception 'Unit % sudah berstatus %.', v_unit.unit_code, v_unit.status;
    end if;
  end if;

  insert into customers (lead_id, unit_id, sales_agent_id, name, phone, email, status)
  values (p_lead_id, p_unit_id, coalesce(v_lead.assigned_to, me()),
          v_lead.name, v_lead.phone, v_lead.email, 'proses')
  returning id into v_customer;

  if p_unit_id is not null then
    update units set status = 'booking' where id = p_unit_id;
  end if;

  -- Booking fee masuk sebagai 'menunggu'. Yang mengubahnya menjadi
  -- 'terverifikasi' tetap hanya Finance lewat unggah kuitansi — pemisahan
  -- wewenang PRD §3.2 tidak boleh dilewati oleh konversi ini.
  if p_nominal_booking is not null and p_nominal_booking > 0 then
    insert into payments (customer_id, payment_type, amount, payment_date, status)
    values (v_customer, 'booking', p_nominal_booking, p_tanggal_booking, 'menunggu');
  end if;

  -- Baris KPR dibuat di sini supaya Admin Marketing menemukan tanggal dan
  -- nominal booking sudah terisi, bukan halaman kosong. Trigger
  -- customer_kpr_sync_lead_stage yang menaikkan tahap prospek dari sini.
  insert into customer_kpr (customer_id, tanggal_booking, nominal_booking)
  values (v_customer, p_tanggal_booking, p_nominal_booking)
  on conflict (customer_id) do nothing;

  -- Jejak di timeline prospek, supaya riwayat pra-booking tidak berhenti
  -- mendadak di titik konversi.
  insert into lead_activities (lead_id, customer_id, actor_id, activity, hasil, note)
  values (p_lead_id, v_customer, me(), 'Konversi ke Booking', 'Booking',
          format('Unit %s · Booking fee %s',
                 coalesce(v_unit.unit_code, '—'),
                 coalesce('Rp' || to_char(p_nominal_booking, 'FM999G999G999G999'), '—')));

  return v_customer;
end;
$$;

grant execute on function convert_lead_to_customer(uuid, uuid, numeric, date) to authenticated;

comment on function convert_lead_to_customer(uuid, uuid, numeric, date) is
  'Booking sebagai satu peristiwa: membuat konsumen dari prospek, me-reserve unit, mencatat booking fee ke antrean Finance, dan membuka baris KPR — semuanya atomik.';


-- ------------------------------------------------------------
-- 2. Sumber notifikasi
--
-- Kenapa fungsi, bukan tabel `notifications`.
--
-- Tabel notifikasi menuntut trigger di delapan tempat, policy tulisnya sendiri,
-- dan pembersihan baris basi — lalu tetap bisa tidak sinkron dengan kenyataan.
-- Semua yang perlu diberitahukan di sini SUDAH dapat dihitung dari data yang
-- ada, jadi tidak ada yang perlu disimpan.
--
-- SECURITY INVOKER dipakai dengan sengaja: RLS menyaringnya secara alami.
-- Sales melihat kategori 'verifikasi' kosong bukan karena disaring peran di
-- dalam fungsi ini, melainkan karena baris payments milik konsumen agen lain
-- memang tidak lolos policy payments_select. Satu fungsi melayani tujuh peran
-- tanpa satu baris pun aturan izin tambahan.
-- ------------------------------------------------------------

create or replace function my_notifications()
returns json
language sql stable security invoker set search_path = public as $$
  with
  -- Sales: follow-up yang jatuh tempo hari ini atau terlewat.
  followup as (
    select 'followup'::text as kategori,
           (case when l.tanggal_rencana < current_date then 'tinggi' else 'sedang' end)::text as urgensi,
           l.name::text as judul,
           (case when l.tanggal_rencana < current_date
                 then format('Terlewat %s hari', current_date - l.tanggal_rencana)
                 else 'Dijadwalkan hari ini' end)::text as detail,
           '/prospek'::text as rute,
           l.id as record_id,
           l.tanggal_rencana as tanggal
      from leads l
     where l.tanggal_rencana is not null
       and l.tanggal_rencana <= current_date
       and l.status not in ('cancel', 'akad', 'aftersales')
  ),
  -- Sales: prospek hangat/panas yang tidak disentuh seminggu. Inilah yang
  -- diam-diam menjadi kerugian terbesar di CRM mana pun.
  dingin as (
    select 'dingin'::text, 'sedang'::text, l.name::text,
           'Belum ada aktivitas 7 hari'::text, '/prospek'::text, l.id, null::date
      from leads l
     where l.status in ('warm', 'hot')
       and not exists (
         select 1 from lead_activities a
          where a.lead_id = l.id
            and a.created_at > now() - interval '7 days')
  ),
  -- Admin Marketing: SP3K mendekati kedaluwarsa sementara akad belum terjadi.
  sp3k as (
    select 'sp3k'::text,
           (case when k.tanggal_sp3k_expired < current_date + 7 then 'tinggi' else 'sedang' end)::text,
           c.name::text,
           format('SP3K kedaluwarsa %s', to_char(k.tanggal_sp3k_expired, 'DD Mon YYYY'))::text,
           '/konsumen'::text, c.id, k.tanggal_sp3k_expired
      from customer_kpr k
      join customers c on c.id = k.customer_id
     where k.tanggal_sp3k_expired is not null
       and k.tanggal_akad is null
       and k.tanggal_sp3k_expired <= current_date + 14
  ),
  -- Admin Marketing: berkas mengendap di bank tanpa SP3K terbit.
  mandek as (
    select 'mandek'::text, 'tinggi'::text, c.name::text,
           format('%s hari di bank, SP3K belum terbit', current_date - k.tanggal_masuk_bank)::text,
           '/konsumen'::text, c.id, k.tanggal_masuk_bank
      from customer_kpr k
      join customers c on c.id = k.customer_id
     where k.tanggal_masuk_bank is not null
       and k.tanggal_sp3k_terbit is null
       and current_date - k.tanggal_masuk_bank > 30
  ),
  -- Finance: antrean verifikasi pembayaran.
  verifikasi as (
    select 'verifikasi'::text, 'tinggi'::text, c.name::text,
           format('%s · Rp%s', replace(p.payment_type::text, '_', ' '),
                  to_char(p.amount, 'FM999G999G999G999'))::text,
           '/pembayaran'::text, p.id, p.payment_date
      from payments p
      join customers c on c.id = p.customer_id
     where p.status = 'menunggu'
  ),
  semua as (
    select * from followup
    union all select * from dingin
    union all select * from sp3k
    union all select * from mandek
    union all select * from verifikasi
  )
  select json_build_object(
    'total',  (select count(*) from semua),
    'tinggi', (select count(*) from semua where urgensi = 'tinggi'),
    'per_kategori', coalesce((
      select json_agg(json_build_object('kategori', kategori, 'jumlah', n) order by n desc)
        from (select kategori, count(*) n from semua group by kategori) t), '[]'::json),
    'items', coalesce((
      select json_agg(json_build_object(
               'kategori',  kategori,
               'urgensi',   urgensi,
               'judul',     judul,
               'detail',    detail,
               'rute',      rute,
               'record_id', record_id))
        from (select * from semua
               order by (urgensi = 'tinggi') desc, tanggal nulls last
               limit 30) t), '[]'::json)
  );
$$;

grant execute on function my_notifications() to authenticated;

comment on function my_notifications() is
  'Satu sumber angka untuk lonceng dan blok Fokus Hari Ini. SECURITY INVOKER — RLS yang menentukan siapa melihat apa, bukan cabang peran di dalam fungsi.';


-- ------------------------------------------------------------
-- 3. Indeks pendukung
--
-- Kelimanya menopang query yang dipanggil di setiap pemuatan halaman
-- (my_notifications tiap 60 detik), jadi bukan optimasi prematur.
-- ------------------------------------------------------------

create index if not exists idx_leads_tanggal_rencana
  on leads (tanggal_rencana) where tanggal_rencana is not null;

create index if not exists idx_lead_activities_lead_created
  on lead_activities (lead_id, created_at desc);

create index if not exists idx_lead_activities_customer_created
  on lead_activities (customer_id, created_at desc);

create index if not exists idx_customer_kpr_sp3k_expired
  on customer_kpr (tanggal_sp3k_expired) where tanggal_sp3k_expired is not null;

create index if not exists idx_payments_menunggu
  on payments (status) where status = 'menunggu';

create index if not exists idx_customers_lead on customers (lead_id);
