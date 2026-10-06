-- ============================================================
-- Zafira Property — Migration 019
-- Beban kerja per agen, untuk dialog "Alihkan Prospek".
--
-- Memilih agen tujuan dari daftar nama saja membuat pengalihan menumpuk pada
-- nama yang paling diingat, bukan pada agen yang paling longgar. Dialognya
-- kini menampilkan jumlah prospek aktif setiap agen.
--
-- RLS leads membatasi Sales pada prospek miliknya sendiri, jadi hitungannya
-- dibuat di sini. Yang keluar hanya angka per agen — bukan satu pun baris
-- prospek.
--
-- "Aktif" = prospek yang masih dikejar Sales: belum booking dan belum batal.
-- Booking ke atas sudah diserahkan ke Admin Marketing.
--
-- Aman dijalankan ulang.
-- ============================================================

create or replace function beban_agen()
returns table (agen_id uuid, aktif int)
language sql
stable
security definer
set search_path = public
as $$
  select l.assigned_to, count(*)::int
  from leads l
  -- me() bernilai NULL untuk anon dan akun nonaktif: keduanya tidak mendapat apa pun.
  where me() is not null
    and l.assigned_to is not null
    and l.status::text in ('leads', 'baru', 'cold', 'warm', 'hot', 'dihubungi', 'appointment')
  group by l.assigned_to;
$$;

grant execute on function beban_agen() to authenticated;
