-- ============================================================
-- Zafira Property — Kerangka pengujian
--
-- Berisi dua hal:
--   1. Pengganti minimal bagian yang dikelola Supabase (auth, storage),
--      supaya seluruh migrasi bisa dijalankan di Postgres lokal biasa.
--   2. Fungsi assert sederhana. pgTAP sengaja tidak dipakai agar suite ini
--      berjalan pada Postgres apa adanya, tanpa ekstensi tambahan.
--
-- HANYA untuk pengujian. Jangan pernah dijalankan pada proyek Supabase.
-- ============================================================

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. Pengganti auth & storage
-- ------------------------------------------------------------

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb
);

-- auth.uid() sungguhan membaca JWT permintaan. Di sini ia membaca sebuah GUC
-- sesi, sehingga sebuah uji dapat berpura-pura menjadi pengguna tertentu
-- lewat: set test.uid = '<uuid>';
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean default false
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(p_name text) returns text[]
language sql immutable as $$
  select (string_to_array(p_name, '/'))[1:array_length(string_to_array(p_name, '/'), 1) - 1];
$$;

-- ------------------------------------------------------------
-- 2. Assert
-- ------------------------------------------------------------

create schema if not exists test;

drop table if exists test.results;
create table test.results (
  urut    serial primary key,
  bagian  text,
  label   text,
  lulus   boolean,
  detail  text
);

-- Boleh ditulis oleh role apa pun yang sedang diuji.
grant usage on schema test to authenticated;
grant select, insert on test.results to authenticated;
grant usage, select on sequence test.results_urut_seq to authenticated;

-- Bagian aktif disimpan di GUC supaya tiap berkas uji cukup memanggil
-- test.bagian('...') sekali di awal.
create or replace function test.bagian(p_nama text) returns void
language sql as $$ select set_config('test.bagian', p_nama, false); $$;

-- SECURITY DEFINER: hanya pencatatan hasil yang berjalan sebagai pemilik.
-- Fungsi assert lain sengaja INVOKER agar RLS dan trigger tetap berlaku
-- pada pernyataan yang diuji.
create or replace function test.record(p_label text, p_lulus boolean, p_detail text default null)
returns void language plpgsql security definer set search_path = test, public as $$
begin
  insert into test.results (bagian, label, lulus, detail)
  values (coalesce(current_setting('test.bagian', true), '-'), p_label, p_lulus, p_detail);
end $$;

grant execute on function test.record(text, boolean, text) to authenticated;

/** Benar bila kondisinya benar. */
create or replace function test.ok(p_label text, p_kondisi boolean, p_detail text default null)
returns void language plpgsql security invoker as $$
begin
  perform test.record(p_label, coalesce(p_kondisi, false), p_detail);
end $$;

/** Membandingkan dua nilai sebagai teks, sehingga tipe apa pun bisa diuji. */
create or replace function test.eq(p_label text, p_aktual anyelement, p_harapan anyelement)
returns void language plpgsql security invoker as $$
begin
  perform test.record(
    p_label,
    p_aktual::text is not distinct from p_harapan::text,
    format('dapat %L, harap %L', p_aktual::text, p_harapan::text)
  );
end $$;

/** Menjalankan satu query skalar dan membandingkan hasilnya. */
create or replace function test.eq_query(p_label text, p_sql text, p_harapan text)
returns void language plpgsql security invoker as $$
declare v text;
begin
  execute p_sql into v;
  perform test.record(p_label, v is not distinct from p_harapan, format('dapat %L, harap %L', v, p_harapan));
exception when others then
  perform test.record(p_label, false, 'query gagal: ' || sqlerrm);
end $$;

/**
 * Pernyataan HARUS ditolak.
 *
 * Blok BEGIN/EXCEPTION membentuk subtransaksi, sehingga kegagalan yang
 * ditangkap di sini tidak membatalkan sisa suite.
 */
create or replace function test.raises(p_label text, p_sql text, p_pesan text default null)
returns void language plpgsql security invoker as $$
begin
  begin
    execute p_sql;
    perform test.record(p_label, false, 'berhasil, padahal seharusnya ditolak');
  exception when others then
    if p_pesan is null or position(lower(p_pesan) in lower(sqlerrm)) > 0 then
      perform test.record(p_label, true, sqlerrm);
    else
      perform test.record(p_label, false, 'ditolak dengan pesan lain: ' || sqlerrm);
    end if;
  end;
end $$;

/**
 * Jumlah baris yang terpengaruh harus sesuai.
 *
 * Dipakai untuk kasus RLS: sebuah UPDATE yang dihalangi policy tidak melempar
 * error, ia hanya mengenai nol baris — diam-diam, dan itulah yang perlu diuji.
 */
create or replace function test.affects(p_label text, p_sql text, p_harapan int)
returns void language plpgsql security invoker as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  perform test.record(p_label, n = p_harapan, format('%s baris terpengaruh, harap %s', n, p_harapan));
exception when others then
  perform test.record(p_label, false, 'error tak terduga: ' || sqlerrm);
end $$;

grant execute on function test.bagian(text) to authenticated;
grant execute on function test.ok(text, boolean, text) to authenticated;
grant execute on function test.eq(text, anyelement, anyelement) to authenticated;
grant execute on function test.eq_query(text, text, text) to authenticated;
grant execute on function test.raises(text, text, text) to authenticated;
grant execute on function test.affects(text, text, int) to authenticated;
