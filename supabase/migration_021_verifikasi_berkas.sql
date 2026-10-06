-- ============================================================
-- Zafira Property — Migration 021
-- Verifikasi berkas konsumen: siapa yang boleh, dan jejaknya.
--
-- Sampai migrasi ini, status berkas (menunggu / terverifikasi / ditolak)
-- bisa diubah oleh siapa pun yang boleh mengubah barisnya — termasuk Sales
-- pemilik konsumen yang belum terkunci. Artinya Sales bisa menandai berkas
-- konsumennya sendiri "terverifikasi", dan tidak tercatat siapa yang
-- memutuskannya atau kapan.
--
-- Kini:
--   · Mengubah status hanya Admin dan Admin Marketing (can_write_berkas()).
--     Sales tetap mengunggah; berkas yang ia unggah selalu masuk 'menunggu'.
--   · Penolakan wajib beralasan — alasan itulah yang memberi tahu Sales apa
--     yang harus diperbaiki saat mengunggah ulang.
--   · verified_by dan verified_at mencatat siapa dan kapan memverifikasi
--     atau menolak.
--
-- Pola yang sama dengan guard_payment_verification (migration_017) untuk
-- pembayaran.
--
-- Aman dijalankan ulang.
-- ============================================================

alter table customer_documents add column if not exists verified_by uuid references profiles(id);
alter table customer_documents add column if not exists verified_at timestamptz;
alter table customer_documents add column if not exists alasan_ditolak text;

create or replace function guard_document_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Tanpa JWT = service_role / SQL Editor (seed dan perbaikan data manual).
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Berkas yang diunggah selain Admin/Admin Marketing selalu menunggu.
    if not can_write_berkas() then
      new.status := 'menunggu';
      new.verified_by := null;
      new.verified_at := null;
      new.alasan_ditolak := null;
      return new;
    end if;
  elsif new.status is not distinct from old.status then
    -- Status tidak berubah: alasan dan jejak verifikasi tidak boleh diubah diam-diam.
    new.verified_by := old.verified_by;
    new.verified_at := old.verified_at;
    new.alasan_ditolak := old.alasan_ditolak;
    return new;
  elsif not can_write_berkas() then
    raise exception 'Hanya Admin dan Admin Marketing yang dapat memverifikasi atau menolak berkas.'
      using errcode = '42501';
  end if;

  if new.status = 'ditolak' and coalesce(btrim(new.alasan_ditolak), '') = '' then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;

  if new.status = 'menunggu' then
    new.verified_by := null;
    new.verified_at := null;
    new.alasan_ditolak := null;
  else
    new.verified_by := auth.uid();
    new.verified_at := now();
    if new.status = 'terverifikasi' then
      new.alasan_ditolak := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists customer_documents_guard_verification on customer_documents;
create trigger customer_documents_guard_verification
  before insert or update on customer_documents
  for each row execute function guard_document_verification();
