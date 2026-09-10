-- ============================================================
-- Zafira Property — Penetapan role untuk pengujian manual
--
-- CARA PAKAI
--   1. Buat dulu keenam user di Supabase Dashboard →
--      Authentication → Users → Add user (centang "Auto Confirm User"),
--      dengan email persis seperti daftar di bawah.
--      Trigger on_auth_user_created otomatis membuat baris profiles-nya
--      dengan role 'sales'.
--   2. Jalankan file ini di SQL Editor untuk menaikkan role masing-masing.
--   3. Ganti alamat email di bawah bila Anda memakai domain lain.
--
-- Dijalankan lewat SQL Editor = tanpa JWT, sehingga trigger
-- guard_profile_privileged_columns() melewatkannya (jalur bootstrap admin).
--
-- Aman dijalankan ulang.
-- ============================================================

update profiles p
   set role = v.role::user_role,
       -- Sejak migration_011 akun baru masuk NONAKTIF menunggu persetujuan.
       -- Skrip ini adalah jalur bootstrap: ia mengaktifkan sekaligus.
       is_active = true,
       full_name = coalesce(nullif(p.full_name, ''), v.nama),
       divisi = v.divisi
from (values
  ('admin@zafiraproperty.id',      'admin',                'Admin Sistem',         'IT'),
  ('sales1@zafiraproperty.id',     'sales',                'Sales Satu',           'Marketing'),
  ('sales2@zafiraproperty.id',     'sales',                'Sales Dua',            'Marketing'),
  ('adminmkt@zafiraproperty.id',   'admin_marketing',      'Admin Marketing',      'Marketing'),
  ('finance@zafiraproperty.id',    'finance',              'Finance',              'Keuangan'),
  ('spv@zafiraproperty.id',        'supervisor_marketing', 'Supervisor Marketing', 'Marketing'),
  ('pengawas@zafiraproperty.id',   'pengawas',             'Pengawas',             'Audit')
) as v(email, role, nama, divisi)
join auth.users u on u.email = v.email
where p.id = u.id;

-- Laporan hasil: siapa sudah punya role apa, dan siapa yang belum dibuat.
select
  v.email,
  coalesce(p.role::text, '❌ user belum dibuat di Authentication') as role_sekarang,
  coalesce(p.is_active::text, '-') as aktif,
  v.role as role_seharusnya
from (values
  ('admin@zafiraproperty.id',      'admin'),
  ('sales1@zafiraproperty.id',     'sales'),
  ('sales2@zafiraproperty.id',     'sales'),
  ('adminmkt@zafiraproperty.id',   'admin_marketing'),
  ('finance@zafiraproperty.id',    'finance'),
  ('spv@zafiraproperty.id',        'supervisor_marketing'),
  ('pengawas@zafiraproperty.id',   'pengawas')
) as v(email, role)
left join auth.users u on u.email = v.email
left join profiles p on p.id = u.id
order by v.email;
