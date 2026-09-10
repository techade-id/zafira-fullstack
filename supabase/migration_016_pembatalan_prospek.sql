-- ============================================================
-- Zafira Property — Migration 016
-- Pembatalan prospek dan pengalihan agen.
--
-- Dua hal yang selama ini tidak punya tempat di sistem:
--
--   1. ALASAN PROSPEK HILANG. Tujuh alasan pembatalan sudah dikonfigurasi
--      ("Tidak lolos BI-Checking", "RPC tidak cukup", "Proses bank terlalu
--      lama", dan seterusnya) — tetapi tabel cancellations menuntut
--      customer_id, sehingga hanya konsumen yang bisa dicatat batal. Prospek
--      yang mati sebelum booking hanya berubah status menjadi 'cancel', tanpa
--      sebab. Akibatnya pertanyaan yang paling berguna bagi manajemen —
--      "kenapa kita kehilangan orang, dan di tahap mana?" — tidak terjawab.
--
--   2. PENGALIHAN PROSPEK. leads.assigned_to hanya pernah diisi saat baris
--      dibuat. Tidak ada satu pun jalur untuk memindahkannya. Ketika seorang
--      Sales berhenti atau sebuah prospek salah ditugaskan, prospek itu
--      terkunci pada pemiliknya selamanya — dan karena RLS menyaring dengan
--      assigned_to, ia praktis hilang dari pandangan semua orang.
--
-- Aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Pembatalan boleh menempel pada prospek
--
-- Satu tabel untuk kedua tahap, bukan dua tabel terpisah: yang ingin dibaca
-- manajemen adalah corong kehilangan secara utuh, dan itu mustahil disusun
-- bila separuh datanya ada di tempat lain.
-- ------------------------------------------------------------

alter table cancellations alter column customer_id drop not null;
alter table cancellations add column if not exists lead_id uuid references leads(id) on delete cascade;
alter table cancellations add column if not exists tahap_saat_batal text;

comment on column cancellations.lead_id is
  'Terisi bila yang dibatalkan masih berupa prospek. Tepat satu dari lead_id / customer_id yang terisi.';
comment on column cancellations.tahap_saat_batal is
  'Tahap funnel pada saat pembatalan, disalin agar tetap terbaca meski tahapnya berubah kemudian.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cancellations_satu_pemilik') then
    alter table cancellations add constraint cancellations_satu_pemilik
      check (num_nonnulls(lead_id, customer_id) = 1);
  end if;
end $$;

create index if not exists idx_cancellations_lead on cancellations (lead_id) where lead_id is not null;

-- Policy lama menyaring dengan owns_customer(customer_id). Untuk baris milik
-- prospek, customer_id NULL membuat predikat itu selalu salah — sehingga Sales
-- tidak bisa melihat pembatalan yang ia catat sendiri. Cabang owns_lead
-- ditambahkan, bukan menggantikan.
drop policy if exists "cancellations_select" on cancellations;
create policy "cancellations_select" on cancellations for select
  using (
    can_view_all()
    or (customer_id is not null and owns_customer(customer_id))
    or (lead_id is not null and owns_lead(lead_id))
  );

drop policy if exists "cancellations_insert" on cancellations;
create policy "cancellations_insert" on cancellations for insert
  with check (
    is_admin() or can_write_berkas() or can_write_finance()
    or (customer_id is not null and owns_customer(customer_id))
    or (lead_id is not null and owns_lead(lead_id))
  );

-- ------------------------------------------------------------
-- 2. Membatalkan prospek sebagai satu peristiwa
--
-- Mengubah status dan mencatat alasannya harus terjadi bersama. Dipisah, yang
-- kedua akan sering terlewat — dan sebuah pembatalan tanpa alasan sama tidak
-- bergunanya dengan tidak dicatat sama sekali.
-- ------------------------------------------------------------

create or replace function cancel_lead(
  p_lead_id uuid,
  p_reason  text,
  p_detail  text default null
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_status lead_status;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi.';
  end if;

  -- SECURITY INVOKER: SELECT ini pun tunduk pada RLS. Prospek milik agen lain
  -- karena itu tidak "ditolak" melainkan tidak terlihat sama sekali — dan dari
  -- sudut pandang pemanggil kedua keadaan itu memang tidak dapat dibedakan,
  -- sehingga pesannya menyebut keduanya sekaligus alih-alih menyesatkan.
  select status into v_status from leads where id = p_lead_id;
  if not found then
    raise exception 'Prospek tidak ditemukan atau bukan milik Anda.' using errcode = '42501';
  end if;
  if v_status = 'cancel' then
    raise exception 'Prospek ini sudah dibatalkan.';
  end if;

  update leads set status = 'cancel', tanggal_rencana = null, updated_at = now()
   where id = p_lead_id;

  insert into cancellations (lead_id, reason, detail, tahap_saat_batal, cancelled_by)
  values (p_lead_id, btrim(p_reason), nullif(btrim(coalesce(p_detail, '')), ''), v_status::text, me());

  insert into lead_activities (lead_id, actor_id, activity, hasil, note)
  values (p_lead_id, me(), 'Prospek dibatalkan', 'Tidak Berminat',
          format('Alasan: %s%s', btrim(p_reason),
                 case when coalesce(btrim(p_detail), '') = '' then '' else ' — ' || btrim(p_detail) end));
end;
$$;

grant execute on function cancel_lead(uuid, text, text) to authenticated;

comment on function cancel_lead(uuid, text, text) is
  'Membatalkan prospek beserta alasannya dalam satu langkah, dan mencatatnya ke riwayat.';

-- ------------------------------------------------------------
-- 3. Mengalihkan prospek ke agen lain
--
-- Sengaja SECURITY DEFINER, berbeda dari cancel_lead di atas.
--
-- Policy leads menyaring dengan assigned_to. Begitu kolom itu berpindah, baris
-- tersebut langsung keluar dari jangkauan pemanggil — dan pada UPDATE, Postgres
-- memeriksa WITH CHECK terhadap baris BARU. Seorang Sales karena itu tidak akan
-- pernah bisa menyerahkan prospeknya sendiri, sekalipun itu tindakan yang wajar.
--
-- Hak akses karena itu diperiksa eksplisit: pemilik boleh menyerahkan miliknya,
-- dan penyelia boleh memindahkan milik siapa pun.
-- ------------------------------------------------------------

create or replace function transfer_lead(
  p_lead_id  uuid,
  p_agen_id  uuid,
  p_catatan  text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lama uuid;
  v_nama_lama text;
  v_nama_baru text;
begin
  select assigned_to into v_lama from leads where id = p_lead_id;
  if not found then
    raise exception 'Prospek tidak ditemukan.';
  end if;

  if not (can_view_all() or v_lama = me()) then
    raise exception 'Prospek ini bukan milik Anda.' using errcode = '42501';
  end if;

  if not exists (select 1 from profiles where id = p_agen_id and is_active) then
    raise exception 'Agen tujuan tidak ditemukan atau tidak aktif.';
  end if;
  if p_agen_id = v_lama then
    raise exception 'Prospek sudah dipegang agen tersebut.';
  end if;

  update leads set assigned_to = p_agen_id, updated_at = now() where id = p_lead_id;

  select full_name into v_nama_lama from profiles where id = v_lama;
  select full_name into v_nama_baru from profiles where id = p_agen_id;

  insert into lead_activities (lead_id, actor_id, activity, note)
  values (p_lead_id, me(), 'Prospek dialihkan',
          format('Dari %s ke %s%s', coalesce(v_nama_lama, 'tanpa agen'), v_nama_baru,
                 case when coalesce(btrim(p_catatan), '') = '' then '' else ' — ' || btrim(p_catatan) end));
end;
$$;

grant execute on function transfer_lead(uuid, uuid, text) to authenticated;

comment on function transfer_lead(uuid, uuid, text) is
  'Memindahkan prospek ke agen lain. SECURITY DEFINER karena RLS leads menyaring dengan assigned_to, sehingga pemilik tidak akan pernah lolos WITH CHECK saat menyerahkan miliknya sendiri.';
