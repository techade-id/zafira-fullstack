# Runbook Penerapan — Zafira Property CRM

Seluruh verifikasi selama pengembangan berhenti di lapisan database: rantai
migrasi dijalankan pada Postgres lokal dan 125 uji otomatis lulus. Yang belum
pernah dilakukan adalah menjalankannya pada proyek Supabase sungguhan dan
menelusuri UI di browser. Dokumen ini urutan untuk melakukannya.

Perkiraan waktu: 30–45 menit.

---

## 0. Sebelum mulai

**Gunakan proyek Supabase terpisah dari produksi.** Migrasi 008 menulis ulang
seluruh policy, 009 mengubah nilai `leads.status` yang sudah ada, dan 011
membuat setiap akun baru masuk dalam keadaan nonaktif. Tidak ada satu pun yang
punya jalur mundur otomatis.

Bila Anda memang menerapkan ke proyek yang sudah berisi data, ambil backup
lebih dulu: Supabase Dashboard → Database → Backups.

```bash
git status          # pastikan tidak ada perubahan tertinggal
npm run test:db     # 125 uji harus lulus sebelum menyentuh Supabase
npm run build       # build harus bersih
```

---

## 1. Jalankan migrasi

Supabase Dashboard → SQL Editor. **Urutan wajib**, satu per satu, tunggu setiap
berkas selesai sebelum menjalankan yang berikutnya.

Proyek baru:

```
schema.sql
migration_002_kpr_pipeline.sql
migration_003_security_and_integrity.sql
migration_004_project_management.sql
migration_005_roles_and_dashboard.sql
migration_006_delete_behaviour.sql
migration_007_notes_search.sql
migration_008_roles_sod.sql
migration_009_pipeline.sql
migration_010_dashboard_and_ads.sql
migration_011_user_management.sql
migration_012_lapangan.sql
storage.sql
```

Proyek yang sudah berjalan: mulai dari `migration_007`, lalu **jalankan ulang
`storage.sql`** — isinya berubah (bucket `payment-receipts` dan policy yang
memakai helper baru).

Peringatan `WARNING: there is no transaction in progress` pada migrasi 005, 008
dan 009 normal: itu efek `commit;` yang memang diperlukan sebelum nilai enum
baru bisa dipakai.

## 2. Periksa hasilnya

Jalankan `supabase/check_setup.sql`. Yang harus Anda lihat:

| Baris | Harapan |
|---|---|
| `EKSTENSI pg_trgm` | muncul |
| Baris bertanda `HILANG` | **tidak ada satu pun** |
| `INDEX TRIGRAM` | 21 atau lebih |
| `BUCKET` | 5 bucket, `payment-receipts` termasuk |
| `ROLE TERSEDIA` | memuat sales, admin_marketing, finance, supervisor_marketing, pengawas |
| `TAHAP LEAD` | memuat hot, booking, kpr, akad, aftersales |
| `ROLE TERPAKAI` | tidak ada lagi `sales_agent` / `manager` / `administrasi` |

Bila ada `HILANG`, migrasi yang menambahkannya belum jalan — jangan lanjut.

## 3. Bootstrap admin pertama

**Langkah paling mudah terlewat.** Sejak migrasi 011 setiap akun baru masuk
**nonaktif**, termasuk yang dibuat lewat dashboard. Akun nonaktif tidak punya
peran efektif sama sekali, jadi admin pertama harus diaktifkan lewat SQL —
kalau tidak, tidak ada seorang pun yang bisa menyetujui siapa pun.

1. Authentication → Users → Add user (centang **Auto Confirm User**).
2. SQL Editor:

```sql
update profiles
   set role = 'admin', is_active = true
 where id = 'UUID-PENGGUNA-ANDA';
```

Untuk enam akun uji sekaligus, pakai `supabase/seed_test_users.sql` — skrip itu
menetapkan peran dan mengaktifkan sekaligus, lalu mencetak laporan siapa yang
belum dibuat.

## 4. Sambungkan aplikasi

```bash
cp .env.example .env     # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
npm run dev
```

Tanpa `.env` layarnya putih total, bukan sekadar error: `createClient` melempar
sebelum React sempat render.

Supabase → Authentication → URL Configuration: setel **Site URL** ke domain
produksi, jika tidak tautan reset password akan menunjuk alamat lama.

## 5. Telusuri UI

Urutan ini melewati setiap hal yang dibangun, dan setiap langkahnya bergantung
pada langkah sebelumnya:

1. **Admin** — sidebar navy, tombol CTA oranye, tidak ada sisa hijau.
2. **Pengaturan Bisnis** — tambah satu Ads Campaign dan satu Mitra. Isi
   *Domain email yang boleh mendaftar* dengan domain kantor Anda.
3. **Daftar akun baru** di `/daftar` memakai email di luar domain itu →
   harus ditolak. Ulangi dengan email domain kantor → berhasil, dan muncul
   layar "Menunggu Persetujuan" saat mencoba masuk.
4. **Admin → Pengguna** — akun tadi ada di antrean; tetapkan peran, setujui.
5. **Sales** — buat prospek (hanya 3 kolom), pilih sumber Ads → campaign muncul.
   Tambah catatan follow-up. Cari sepotong kata dari tengah catatan itu di
   kotak pencarian header → ketemu, tersorot, bisa diklik.
6. **Sales** — buat konsumen dari prospek itu, catat Booking Fee. Statusnya
   *menunggu*, dan **tidak ada tombol verifikasi**.
7. **Finance** — Verifikasi + Kuitansi, unggah berkas apa saja.
8. **Sales** — refresh Konsumen: kolom Tanggung Jawab jadi 🔒 Admin Marketing,
   form KPR abu-abu, tetapi catatan follow-up **masih bisa** ditambah.
   Buka Prospek: tahapnya sudah **Booking**.
9. **Admin Marketing** — isi Tanggal Masuk Bank lalu Tanggal Akad; tahap prospek
   naik sendiri ke KPR lalu Akad. Tugaskan satu unit ke akun Tim Lapangan.
10. **Tim Lapangan di HP** — buka Monitoring Lapangan, kirim laporan dengan
    foto dari kamera. Progres unit berubah mengikuti laporan.
11. **Supervisor** — banner "Mode pantau", tidak ada satu pun tombol tulis.
12. **Pengawas** — Log Aktivitas terisi dengan diff per kolom.
13. **Sales** membuka `/log-aktivitas` lewat address bar → dilempar ke Dashboard.

## 6. Deploy

```bash
npx vercel
```

Tambahkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` di Vercel →
Settings → Environment Variables.

---

## Kalau ada yang gagal

| Gejala | Sebab |
|---|---|
| Pencarian error "Could not find the function" | `migration_007` belum jalan, atau cache PostgREST basi — jalankan `notify pgrst, 'reload schema';` |
| Admin pertama tidak bisa berbuat apa-apa | `is_active` belum disetel `true` (langkah 3) |
| Sales tidak bisa membuat prospek | `migration_008` belum jalan (di situ `assigned_to` diberi default) |
| Dashboard menampilkan closing 0 | `migration_009`/`010` belum jalan |
| Menonaktifkan pengguna tidak berefek | `migration_011` belum jalan |
| Tombol muncul lalu ditolak saat diklik | `src/lib/permissions.js` tidak sinkron dengan policy — laporkan pesan errornya |

Console browser menampilkan seluruh error Supabase lengkap; buka saat menelusuri.
