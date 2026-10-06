-- ============================================================
-- Zafira Property — Migration 020
-- Koreksi nama dan telepon konsumen ikut ke prospek asalnya.
--
-- Data diri konsumen kini bisa diubah dari kartu konsumen. Tanpa trigger ini,
-- sebuah koreksi — salah ketik nama, nomor yang diganti — hanya berlaku di
-- satu sisi: halaman Leads tetap menampilkan nama lama, dan peringatan nomor
-- ganda (migration_018) membandingkan nomor yang sudah usang.
--
-- SECURITY DEFINER karena yang mengoreksi data konsumen biasanya Admin
-- Marketing, sedangkan RLS leads_update hanya mengenal admin dan Sales
-- pemiliknya. Yang disalin hanya dua kolom itu, dan hanya bila berubah.
--
-- Perubahannya tetap tercatat di Log Aktivitas: trigger audit pada leads
-- (migration_008) ikut menangkap pembaruan ini.
--
-- Aman dijalankan ulang.
-- ============================================================

create or replace function customer_sync_prospek_asal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null
     and (new.name is distinct from old.name or new.phone is distinct from old.phone) then
    update leads
       set name  = case when new.name  is distinct from old.name  then new.name  else name  end,
           phone = case when new.phone is distinct from old.phone then new.phone else phone end,
           updated_at = now()
     where id = new.lead_id;
  end if;
  return null;
end $$;

drop trigger if exists customers_sync_prospek_asal on customers;
create trigger customers_sync_prospek_asal
  after update of name, phone on customers
  for each row execute function customer_sync_prospek_asal();
