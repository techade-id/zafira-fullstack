# Penyesuaian CRM Zafira Property — REVISI.md + PRD.md

> **Status: keempat fase sudah diimplementasikan** (9 September 2026).
> Migrasi 007–009 dan `storage.sql` sudah dijalankan pada Postgres lokal sampai
> bersih, lalu diuji perilakunya: Sales tidak bisa memverifikasi pembayarannya
> sendiri, kuitansi Booking Fee dari Finance mengunci konsumen dan menaikkan
> tahap prospek, Sales tetap bisa menulis catatan follow-up setelah terkunci,
> Supervisor/Pengawas benar-benar read-only atas data operasional, Sales tidak
> menemukan catatan agen lain lewat pencarian, dan log audit terisi dengan diff
> per kolom. Pencarian pada 30.000 catatan: 3,8 ms untuk kata selektif
> (Bitmap Index Scan pada indeks trigram), ~95 ms untuk `search_notes` lintas
> sepuluh modul. Yang belum dilakukan adalah menjalankan migrasi pada proyek
> Supabase sungguhan dan menelusuri UI-nya di browser.

## Lanjutan — Monitoring Lapangan (10 September 2026)

**Temuan: `field_projects` dan `field_reports` selama ini menganggur.** Keduanya
ada di `schema.sql` sejak awal, lengkap dengan bucket `field-report-photos`
beserta policy-nya, tetapi tidak ada satu halaman pun yang menulis ke sana —
hanya SiteplanPage yang membaca satu baris untuk menampilkan progres di modal.
README mengklaim modul ini "already working"; klaim itu sudah dikoreksi.

Ditemukan pula **dua model konstruksi yang berjalan paralel**:
`field_projects`/`field_reports` (progres per unit, kendala, foto) dan
`project_tasks`/`task_evaluations` (deadline hari kerja, garansi, evaluasi
kontraktor — punya RencanaProyekPage tetapi tanpa foto). Keputusan yang diambil:
keduanya dipertahankan dengan pembagian yang jelas — `project_tasks` untuk
perencanaan kantor, `field_reports` untuk pelaporan harian lapangan. Keduanya
bertemu di unit yang sama.

Diputuskan pula bentuknya: **tampilan mobile di dalam aplikasi yang sama**, bukan
PWA terpisah. Manifest sudah ada sejak Fase 1, dan berbagi login, RLS, matriks
peran, serta suite uji jauh lebih murah daripada menduplikasi seluruh lapisan
izin ke repo kedua yang sejak hari pertama bisa berbeda diam-diam.

`supabase/migration_012_lapangan.sql` melengkapi bagian yang hilang:

- **Pelapor terisi dari sesi** (`reporter_id` default `auth.uid()`), bukan dari
  frontend — pola yang sama dengan bug `assigned_to` pada leads.
- **Satu tim, satu riwayat.** Sebelumnya anggota hanya bisa membaca laporan yang
  ia tulis sendiri, sehingga rekan satu unit akan melaporkan ulang kendala yang
  kemarin sudah dicatat.
- **Progres dan status ditarik dari laporan terakhir**, diurutkan menurut
  tanggal laporan — bukan waktu input, supaya laporan susulan untuk kemarin
  tidak menimpa kondisi hari ini. Satu sumber angka, jadi siteplan kantor tidak
  bisa menampilkan nilai basi.
- **Pencarian catatan** diperluas ke catatan bebas laporan lapangan.

### Bug yang ditangkap suite

Memberi `reporter_id` sebuah default membuat predikat `reporter_id = me()` pada
policy tulis menjadi **selalu benar untuk siapa pun yang aktif**: cukup
menyisipkan baris tanpa menyebut kolom itu. Supervisor dan Pengawas yang
read-only pun bisa menulis laporan lapangan. Hak tulis kini ditentukan oleh
penugasan pada proyeknya, bukan oleh kolom yang diisi sendiri oleh database.
Uji mutasi mengembalikan predikat itu dan kedua uji peran langsung merah.

Suite kini **125 uji**, bertambah 24 untuk modul lapangan.

---

## Lanjutan — manajemen pengguna (10 September 2026)

**Temuan utama: `is_active` selama ini hiasan.** Kolomnya dijaga sejak awal —
hanya admin/pengawas yang boleh mengubahnya — tetapi tidak pernah dibaca oleh
satu policy pun, tidak oleh helper peran, dan tidak saat login. Tombol
"nonaktifkan agen" di halaman Data Agen tidak melakukan apa-apa: pengguna yang
dinonaktifkan tetap memegang seluruh hak role-nya.

Ditutup oleh **`supabase/migration_011_user_management.sql`** dari dua arah,
karena hanya menutup satu arah tidak cukup:

- **Jalur peran** — `current_role_name()` kini hanya mengembalikan peran bila
  akunnya aktif. Karena seluruh helper (`is_admin()`, `can_write_finance()`,
  dan seterusnya) bermuara ke sana, satu perubahan menutup semuanya sekaligus.
- **Jalur kepemilikan** — policy seperti `assigned_to = auth.uid()` tidak
  melewati helper peran sama sekali, jadi akun nonaktif tetap bisa menyentuh
  barisnya sendiri. Diperkenalkan `me()`, yang mengembalikan identitas hanya
  bila akunnya aktif; NULL tidak pernah sama dengan apa pun, sehingga tidak ada
  baris yang cocok. Seluruh policy kepemilikan ditulis ulang memakainya.

Uji mutasi membuktikan kedua arah itu memang perlu: melumpuhkan pemeriksaan di
`me()` saja sudah membuat Sales nonaktif kembali membaca 5 prospek, 1 konsumen,
dan menemukan hasil pencarian.

Di atas fondasi itu, alur akun jadi aman tanpa perlu `service_role` di browser:

- **Pendaftaran mandiri** di `/daftar`. Akun baru masuk nonaktif tanpa akses
  apa pun dan muncul di antrean "Menunggu Persetujuan" pada halaman Pengguna,
  tempat admin menetapkan peran sekaligus mengaktifkan dalam satu tindakan.
- **Batas domain email** ditegakkan trigger `handle_new_user`, bukan di
  formulir — pendaftaran dari domain lain ditolak sebelum akunnya terbuat.
  Diatur di Pengaturan Bisnis; kosong berarti semua domain diizinkan.
- **`approve_user()` / `deactivate_user()`** sebagai RPC, bukan UPDATE langsung,
  supaya peran dan status aktif selalu berubah dalam satu transaksi dan selalu
  meninggalkan jejak audit. Admin tidak dapat menonaktifkan dirinya sendiri —
  admin terakhir yang melakukannya akan mengunci semua orang keluar.
- **Layar "Menunggu Persetujuan"** menggantikan aplikasi kosong yang tampak
  rusak bagi akun yang belum aktif.

Satu jebakan yang perlu diingat: trigger baru membuat **setiap** akun baru
nonaktif, termasuk yang dibuat lewat Supabase Dashboard. Bootstrap admin pertama
karena itu harus menyetel `is_active = true` sekaligus — `seed_test_users.sql`
dan README sudah disesuaikan.

Suite kini **101 uji**, bertambah 23 untuk siklus hidup akun.

---

## Lanjutan — suite pengujian database (10 September 2026)

Aturan paling berisiko di proyek ini — RLS, Segregation of Duties, dan
Handover Hard-Lock — ditegakkan di Postgres lewat policy dan trigger. Tidak ada
satu baris kode React pun yang bisa memberi tahu apakah aturan itu masih
berlaku, dan sebelumnya tidak ada test sama sekali. Kini ada
**`supabase/tests/`**, dijalankan dengan `npm run test:db`.

Suite membangun database sekali pakai, memasang `schema.sql` beserta seluruh
migrasi berurutan, mengisi data uji, lalu menjalankan **78 pemeriksaan** pada
lima area: matriks peran, SoD dan Hard-Lock, otomasi funnel, pencarian catatan
(termasuk isolasi antar agen), serta agregat dashboard dan iklan. Ia keluar
dengan status bukan-nol saat ada yang gagal, sehingga bisa dipakai di CI.

Yang membuatnya bisa dipercaya: **suite ini diuji-mutasi**. Empat aturan
dilanggar satu per satu — penjagaan verifikasi pembayaran dilumpuhkan,
Hard-Lock dilonggarkan, tahap funnel diizinkan mundur, dan `search_notes`
diubah menjadi SECURITY DEFINER — dan keempatnya tertangkap dengan exit 1
(11, 6, 9, dan 7 uji gagal berturut-turut). Suite yang tidak pernah bisa gagal
lebih berbahaya daripada tidak ada suite, jadi sifat ini perlu diperiksa ulang
setiap kali ada penambahan.

Uji mutasi itu juga menemukan cacat pada runner-nya sendiri: langkah ringkasan
tidak memasang `ON_ERROR_STOP`, sehingga kegagalan tetap keluar dengan status 0
dan CI akan menganggapnya lulus. Sudah diperbaiki.

Tiga uji gagal pada putaran pertama, dan ketiganya salah pada ujinya sendiri,
bukan pada kodenya — termasuk satu yang mengira RLS akan melempar error padahal
ia menolak diam-diam dengan nol baris. Perbedaan itu sekarang diuji eksplisit:
mengubah role orang lain terhalang RLS (nol baris), mengangkat diri sendiri
terhalang trigger (melempar error).

---

## Lanjutan — menutup celah fase 1-4 (10 September 2026)

Tiga hal yang dijanjikan rencana ini tetapi belum dikerjakan pada putaran pertama,
kini selesai lewat **`supabase/migration_010_dashboard_and_ads.sql`**:

- **Digital Ads memakai `ads_campaigns`.** Sebelumnya halaman itu masih menyimpan
  nama campaign sebagai teks bebas, sehingga kolom `ads_analytics.campaign_id`
  yang dibuat migrasi 009 menganggur. Sekarang belanja iklan dicatat terhadap
  campaign terdaftar, dan `campaign_performance()` menghitung biaya per lead dan
  per deal dari prospek yang benar-benar bertanda campaign itu — bukan dari kolom
  `leads_generated` yang diketik tangan. Belanja yang belum terkait campaign
  ditandai terpisah agar tidak diam-diam menggeser rata-rata.
- **Dashboard mengenal funnel baru.** Kartu funnel tujuh tahap dengan konversi
  antar tahap, ringkasan berapa konsumen sudah diserahkan ke Admin Marketing, dan
  antrean verifikasi Finance. Donat "Sebaran Status Prospek" dihapus karena
  funnel menyampaikan hal yang sama sekaligus urutannya — mengurutkan ulang
  menurut besaran justru menghilangkan informasi yang dicari.
- **`lead_stage_bucket()`** memetakan nilai enum lama (`dihubungi`, `appointment`,
  `deal`, `closing`) ke tujuh tahap PRD, sehingga agregat tetap benar untuk baris
  yang belum tersentuh migrasi. Ini sekaligus memperbaiki `appointment_count`
  yang setelah migrasi 009 selalu nol.

Diverifikasi ulang di Postgres lokal: rantai migrasi 002→010 bersih, biaya per
lead cocok dengan hitungan manual, dan seluruh aturan fase 2 masih berlaku —
Sales tetap tidak bisa memverifikasi pembayaran, konsumen terkunci tetap tidak
bisa diubah, Supervisor tetap read-only, dan agregat baru ikut tersaring RLS
(Sales B melihat 0 lead pada campaign milik Sales A).

---

## Context

CRM ini dibangun dari scope quotation lama ("Griya Zafira") dan sudah berjalan: 16 halaman React + Vite, Supabase (6 migrasi), RLS di ~28 policy. Notula rapat (`REVISI.md`) dan PRD final (`PRD.md`) menetapkan arah baru yang **belum tercermin sama sekali** di kode:

- Identitas masih "Griya Zafira" dan paletnya **hijau sage/forest** (`PRIMARY = #4b6b4f`), sementara PRD mewajibkan **Navy + Deep Orange**.
- Kotak "Cari catatan" di header adalah **`<div>` hiasan, bukan input** — fitur Find yang jadi poin utama notula belum ada.
- Role `finance` **tidak ada**. Akibatnya Sales bisa mencatat *dan* memverifikasi pembayarannya sendiri (`payments_rw` di `migration_005:80`) — pelanggaran langsung Segregation of Duties.
- `supervisor` justru punya akses tulis penuh lewat `is_full_access()`, padahal PRD menyebutnya **read-only**.
- **Handover Hard-Lock belum ada**: tidak ada kolom kunci, tidak ada trigger, Sales tetap bisa mengubah profil konsumen setelah booking tervalidasi.
- Frontend **tidak punya gating role sama sekali** (`grep profile.role src` → nol hasil): semua orang melihat semua menu dan semua tombol Hapus.
- Tabel `lead_activities` dan `activity_logs` sudah ada di DB tapi **tidak pernah disentuh frontend** — follow-up tracking dan audit trail yang diminta PRD §4.2 dan §1.1 praktis kosong.
- `leads.source` masih teks bebas, belum relasional ke Ads Campaign / mitra seperti PRD §4.1.

Hasil yang dituju: CRM yang identitas visualnya sesuai brand, punya pencarian catatan yang benar-benar bekerja, dan menegakkan pemisahan wewenang 5 role beserta hard-lock handover di level database — bukan hanya di tampilan.

## Keputusan yang sudah dikonfirmasi

| Topik | Keputusan |
|---|---|
| Model role | Tambah 5 role PRD, petakan role lama otomatis; `admin` tetap super-user teknis, `tim_lapangan` tetap dipakai modul lapangan |
| Hard-lock | Profil & KPR terkunci untuk Sales; Sales tetap boleh menambah catatan follow-up |
| Warna | Sidebar navy solid, tombol CTA deep orange |
| Cakupan | Semua gap, 4 fase berurutan |
| Funnel | 7 tahap PRD; Booking ke atas terisi otomatis oleh trigger |
| Search | Global lintas modul, ditopang `pg_trgm` |
| Sumber leads | Penuh — tabel `ads_campaigns` + `partners` + kategori organik |

---

## Fase 1 — Identitas visual, palet, dan pencarian Notes
*(REVISI §1.1–1.3, PRD §2.1–2.2)*

### 1.1 Rebrand "Griya Zafira" → "Zafira Property"

Empat titik hardcode, semuanya sudah dipetakan:

- [index.html:6](index.html#L6) — `<title>` → `Zafira Property`
- [AppLayout.jsx:164](src/components/AppLayout.jsx#L164) — teks sidebar
- [LoginPage.jsx:73](src/pages/LoginPage.jsx#L73) — judul kartu login
- [LaporanPage.jsx:86](src/pages/LaporanPage.jsx#L86) — header PDF export
- `package.json` — `name: "zafira-property-crm"`

Tambahan: favicon + `public/manifest.webmanifest` (`name`/`short_name`: **Zafira Property**) dan `<meta name="application-name">` — ini yang dimaksud "SSID: Zafira Property" pada notula, yaitu identitas aplikasi saat di-*install*/di-*bookmark*.

### 1.2 Palet Navy + Deep Orange

Semua token terpusat di [ui.jsx:7-33](src/components/ui.jsx#L7-L33), jadi penggantiannya satu tempat. Ganti isinya, **pertahankan nama ekspornya** supaya 16 halaman tidak perlu disentuh:

```js
export const PRIMARY      = "#0F2A5C";  // navy — nav, header, elemen struktural
export const PRIMARY_DARK = "#0A1D42";  // sidebar solid
export const PRIMARY_SOFT = "#E8EDF7";  // chip ikon, garis tabel
export const PRIMARY_MUTED= "#C7D3EA";

export const ACCENT       = "#F4511E";  // deep orange — CTA, progres aktif, urgent
export const ACCENT_DARK  = "#C2410C";
export const ACCENT_SOFT  = "#FDECE4";

export const PAGE_BG   = "#F4F6FA";
export const BORDER    = "#E3E8F0";
export const TEXT_DARK = "#111B2E";
export const TEXT_MID  = "#64748B";
```

Alias legacy `ORANGE / ORANGE_DARK / ORANGE_LIGHT / ORANGE_PALE` sekarang di-*point* ke `ACCENT*` (bukan `PRIMARY` seperti [ui.jsx:30-33](src/components/ui.jsx#L30-L33)). Ini justru **memperbaiki** 4 halaman yang memakainya sebagai warna sorot: progress bar Siteplan ([SiteplanPage.jsx:272](src/pages/SiteplanPage.jsx#L272)), bar spend Iklan ([IklanPage.jsx:157](src/pages/IklanPage.jsx#L157)), kartu statistik Laporan ([LaporanPage.jsx:157-159](src/pages/LaporanPage.jsx#L157-L159)), dan pilihan proyek aktif ([ProyekPage.jsx:164](src/pages/ProyekPage.jsx#L164)) — semuanya memang seharusnya deep orange menurut PRD.

- `PrimaryButton` ([ui.jsx:68](src/components/ui.jsx#L68)) → background `ACCENT` (CTA = accent per PRD §2.1).
- `badgeColors` ([ui.jsx:89-121](src/components/ui.jsx#L89-L121)) → warna netral direbase ke slate; status `terlambat`/`tinggi`/`menunggu` memakai `ACCENT_SOFT`/`ACCENT_DARK` sebagai indikator *Urgent/Due Date*.
- `CHART_COLORS` → keluarga navy→orange. **Muat skill `dataviz` sebelum menetapkan palet chart ini** dan sebelum menyentuh `BarChart`/`DonutChart`.

**Sidebar navy solid** — perubahan di [AppLayout.jsx:134-220](src/components/AppLayout.jsx#L134-L220): background `PRIMARY_DARK`, teks `rgba(255,255,255,.72)`, item aktif `rgba(255,255,255,.10)` + garis kiri 3px `ACCENT`, judul seksi `rgba(255,255,255,.45)`.

Hex hijau yang lolos dari token (harus disapu manual):
- [index.css:8](src/index.css#L8) `#eceee9`, [:25](src/index.css#L25) `#4b6b4f` (focus ring), [:51](src/index.css#L51) `#f3f5f1` + [:54](src/index.css#L54) `#4b6b4f` (nav hover), [:76](src/index.css#L76) overlay hijau
- [ProspekPage.jsx:142,163,171](src/pages/ProspekPage.jsx#L142) label `#79837a` → pakai `TEXT_MID`
- [ProtectedRoute.jsx:10](src/routes/ProtectedRoute.jsx#L10) `#79837a`
- `#c25b5b` (24 kemunculan) tetap sebagai warna error — hanya diselaraskan nilainya

### 1.3 Pencarian Notes global

**`supabase/migration_007_notes_search.sql`** (baru):

```sql
create extension if not exists pg_trgm;
-- GIN trigram: satu-satunya index yang melayani ILIKE '%kata%' di tengah teks.
create index if not exists idx_leads_notes_trgm      on leads      using gin (notes gin_trgm_ops);
create index if not exists idx_leads_name_trgm       on leads      using gin (name  gin_trgm_ops);
create index if not exists idx_lead_act_note_trgm    on lead_activities   using gin (note gin_trgm_ops);
create index if not exists idx_kpr_kendala_trgm      on customer_kpr      using gin (kendala gin_trgm_ops);
create index if not exists idx_payments_notes_trgm   on payments          using gin (notes gin_trgm_ops);
create index if not exists idx_complaints_desc_trgm  on complaints        using gin (description gin_trgm_ops);
create index if not exists idx_field_reports_trgm    on field_reports     using gin (kendala gin_trgm_ops);
```

Lalu fungsi `search_notes(p_q text, p_limit int default 50)` — `security invoker` supaya **RLS tetap berlaku** (Sales hanya menemukan catatan miliknya). Mengembalikan `union all` bernormalisasi: `modul, record_id, judul, cuplikan, field_cocok, tanggal, aktor`. Cuplikan memakai `ts_headline`-style manual: potong 60 karakter di sekitar posisi `strpos(lower(teks), lower(q))` agar kata yang dicari terlihat.

Frontend:
- Ganti `<div className="topbar-search">` hiasan di [AppLayout.jsx:252-283](src/components/AppLayout.jsx#L252-L283) dengan `<input>` sungguhan + dropdown hasil (debounce 250 ms, minimal 3 karakter — di bawah itu index trigram tidak terpakai dan query jadi seq-scan). Hasil dikelompokkan per modul, klik → navigasi ke halaman + `?highlight=<id>`.
- Halaman `/cari` (`src/pages/PencarianPage.jsx`) untuk hasil lengkap saat Enter ditekan.
- `src/lib/useDebouncedSearch.js` — hook kecil yang dipakai ulang oleh kotak cari per-modul di Prospek/Konsumen/Komplain.
- Media query [index.css:85-87](src/index.css#L85-L87) menyembunyikan `.topbar-search` di layar <980px — ganti jadi tombol ikon yang membuka overlay pencarian, jangan dihilangkan (fitur ini justru paling dipakai di lapangan).

---

## Fase 2 — Role, RLS, Segregation of Duties, Hard-Lock, Audit
*(REVISI §2.1–2.2, PRD §3.1–3.2)*

### 2.1 Lima role PRD

**`supabase/migration_008_roles_sod.sql`** (baru). Enum value harus di-*commit* sebelum dipakai — ikuti pola [migration_005:14-18](supabase/migration_005_roles_and_dashboard.sql#L14-L18):

```sql
alter type user_role add value if not exists 'sales';
alter type user_role add value if not exists 'admin_marketing';
alter type user_role add value if not exists 'finance';
alter type user_role add value if not exists 'supervisor_marketing';
alter type user_role add value if not exists 'pengawas';
commit;

update profiles set role = 'sales'                where role in ('sales_agent','marketing');
update profiles set role = 'admin_marketing'      where role = 'administrasi';
update profiles set role = 'supervisor_marketing' where role = 'supervisor';
update profiles set role = 'pengawas'             where role = 'manager';
```

Helper baru menggantikan pasangan `is_full_access()` / `is_berkas_access()` yang sekarang mencampur baca dan tulis:

| Helper | Isi | Dipakai untuk |
|---|---|---|
| `is_admin()` | `admin` | perubahan role, konfigurasi bisnis |
| `can_view_all()` | admin, supervisor_marketing, pengawas, admin_marketing, finance | policy **SELECT** |
| `is_sales_stage()` | admin, sales | tulis leads |
| `is_berkas_access()` | admin, admin_marketing | tulis dokumen/KPR |
| `is_finance()` | admin, finance | verifikasi pembayaran, kuitansi |
| `is_readonly()` | supervisor_marketing, pengawas | dipakai frontend |

**Perubahan struktural penting:** policy sekarang berbentuk `for all using (...)` — satu policy melayani SELECT dan WRITE sekaligus, sehingga role read-only mustahil dibuat. Setiap tabel dipecah jadi:

```sql
create policy "<t>_select" on <t> for select using (can_view_all() or <kepemilikan>);
create policy "<t>_ins"    on <t> for insert with check (<penulis yang berhak>);
create policy "<t>_upd"    on <t> for update using (<penulis yang berhak>) with check (<sama>);
create policy "<t>_del"    on <t> for delete using (is_admin() or <penulis yang berhak>);
```

Ini menyentuh ~28 policy di [schema.sql:380-463](supabase/schema.sql#L380-L463) dan [migration_005:44-133](supabase/migration_005_roles_and_dashboard.sql#L44-L133). Ditulis ulang seluruhnya di migration_008 dengan `drop policy if exists` di depan setiap definisi (pola yang sudah dipakai repo ini) supaya idempoten.

Policy Storage juga masih hardcode `current_role_name() in ('admin','manager')` di [storage.sql:22-96](supabase/storage.sql#L22-L96) — ikut diperbarui ke helper baru.

### 2.2 Segregation of Duties pada pembayaran

Masalah nyata: `payments_rw` mengizinkan pemilik konsumen (Sales) meng-`update` `status = 'terverifikasi'`. RLS tidak bisa membatasi kolom, jadi seperti pola `guard_profile_privileged_columns()` yang sudah ada ([schema.sql:344](supabase/schema.sql#L344)), pakai trigger:

```sql
create function guard_payment_verification() returns trigger ...
-- Hanya finance/admin yang boleh mengubah status, verified_by, atau proof_url.
-- Sales boleh INSERT pembayaran baru (status dipaksa 'menunggu') dan mengubah
-- nominal/tanggal selama status masih 'menunggu'.
```

Bucket kuitansi belum ada — `payments.proof_url` sudah ada kolomnya tapi [PembayaranPage.jsx](src/pages/PembayaranPage.jsx) tidak pernah mengunggah apa pun. Tambah bucket `payment-receipts` (private) + policy: tulis oleh finance/admin, baca oleh `can_view_all()` dan agen pemilik konsumen. UI upload memakai `uploadFile`/`getSignedUrl` yang sudah ada di [storage.js](src/lib/storage.js) — pola persis seperti dokumen konsumen di [KonsumenPage.jsx:186-221](src/pages/KonsumenPage.jsx#L186-L221).

### 2.3 Handover Hard-Lock

Kolom baru pada `customers`: `locked_at timestamptz`, `handover_state text default 'sales'`, `locked_by_payment_id uuid`.

Trigger `apply_booking_handover()` pada `payments` (AFTER INSERT OR UPDATE): ketika `payment_type = 'booking' AND status = 'terverifikasi' AND proof_url is not null` → set `locked_at = now()`, `handover_state = 'admin_marketing'`, dan naikkan `leads.status` ke `'booking'` (menyambung ke otomasi funnel Fase 3).

Penegakan di RLS:
- `customers_upd` — Sales lolos hanya bila `locked_at is null`.
- `customer_kpr_*` dan `customer_documents_*` — setelah terkunci, tulis hanya untuk `is_berkas_access()`.
- **Pengecualian yang disepakati:** `lead_activities` tetap terbuka untuk Sales pemilik. Tambah kolom `lead_activities.customer_id uuid references customers(id)` agar catatan pasca-booking menempel ke konsumen, bukan hanya ke prospek.

UI [KonsumenPage.jsx](src/pages/KonsumenPage.jsx): banner kunci ("Diserahkan ke Admin Marketing pada …"), semua input profil & KPR jadi `disabled` untuk Sales, panel catatan follow-up tetap aktif.

### 2.4 Audit trail

`activity_logs` sudah ada tapi kosong. Tambah kolom `changes jsonb`, lalu fungsi generik `log_activity()` yang mencatat `old`→`new` per kolom, dipasang sebagai trigger AFTER INSERT/UPDATE/DELETE pada: `leads`, `customers`, `customer_kpr`, `customer_documents`, `payments`, `cancellations`, `profiles`.

Halaman baru `src/pages/LogAktivitasPage.jsx` (`/log-aktivitas`, hanya `pengawas`/`admin`): tabel entitas, aksi, aktor, waktu, diff, plus filter tanggal & modul.

### 2.5 Gating role di frontend

`src/lib/permissions.js` (baru) — satu sumber kebenaran, mencerminkan RLS:

```js
export const NAV_BY_ROLE = { sales: [...], admin_marketing: [...], finance: [...], ... };
export function can(profile, action, subject) { ... }   // 'create'|'edit'|'delete'|'verify'
export function isReadOnly(profile) { ... }              // supervisor_marketing, pengawas
```

- `navSections` di [AppLayout.jsx:29-69](src/components/AppLayout.jsx#L29-L69) difilter lewat `NAV_BY_ROLE`.
- `ProtectedRoute` menerima prop `roles` opsional untuk mengunci rute (`/log-aktivitas`, `/pengaturan-bisnis`, `/data-agen`).
- `PrimaryButton`, `EditButton`, `DeleteButton` di [ui.jsx](src/components/ui.jsx) menerima cek `isReadOnly` terpusat sehingga role monitoring tidak melihat tombol yang pasti ditolak RLS.
- `ROLE_OPTIONS` di [DataAgenPage.jsx:5](src/pages/DataAgenPage.jsx#L5) diganti ke 5 role baru + label Indonesia.

---

## Fase 3 — Pipeline penjualan
*(PRD §4.1–4.2)*

**`supabase/migration_009_pipeline.sql`** (baru).

### 3.1 Sumber leads relasional

```sql
create table ads_campaigns (id, platform, name, code unique, start_date, end_date, budget, is_active);
create table partners      (id, name, type, phone, komisi_note, is_active);  -- freelance | kemitraan
alter table ads_analytics add column campaign_id uuid references ads_campaigns(id);
alter table leads
  add column source_type text,          -- ads | freelance | organik
  add column campaign_id uuid references ads_campaigns(id),
  add column partner_id  uuid references partners(id),
  add column organik_kategori text;     -- OTS | Event | Brosur (business_settings)
```

`leads.source` yang lama **dipertahankan** dan di-*backfill* ke `source_type` (Ads/Instagram/Tiktok→`ads`, Freelance→`freelance`, sisanya→`organik`) supaya laporan historis tidak putus. Seed `business_settings` kategori baru `organik_kategori`: OTS, Event, Brosur — mengikuti pola seed di [migration_002:127-160](supabase/migration_002_kpr_pipeline.sql#L127-L160).

Manfaat sampingan: `IklanPage` bisa menghitung cost-per-lead **per campaign** dari data lead sungguhan, bukan dari kolom `leads_generated` yang diketik manual.

### 3.2 Funnel 7 tahap + otomasi

```sql
alter type lead_status add value if not exists 'hot';
alter type lead_status add value if not exists 'booking';
alter type lead_status add value if not exists 'kpr';
alter type lead_status add value if not exists 'akad';
alter type lead_status add value if not exists 'aftersales';
commit;
update leads set status='warm'    where status='dihubungi';
update leads set status='hot'     where status='appointment';
update leads set status='booking' where status in ('deal','closing');
```

Trigger `sync_lead_stage()` menaikkan status (tidak pernah menurunkan, dan tidak pernah menimpa `cancel`):

| Pemicu | Status |
|---|---|
| kuitansi booking terverifikasi (trigger §2.3) | `booking` |
| `customer_kpr.tanggal_masuk_bank` terisi | `kpr` |
| `customer_kpr.tanggal_akad` terisi | `akad` |
| `customer_kpr.tanggal_serah_terima_kunci` terisi | `aftersales` |

`New Lead → Warm → Hot` tetap manual di dropdown Prospek. `STATUS_OPTIONS` di [ProspekPage.jsx:7](src/pages/ProspekPage.jsx#L7) diperbarui, dan tahap otomatis dirender sebagai `Badge` read-only, bukan `<select>` — kalau tetap bisa dipilih manual, orang akan memundurkan status yang baru saja di-*set* trigger.

### 3.3 Input lead minimalis + follow-up tracking

Form Prospek sekarang menampilkan ~16 field sekaligus ([ProspekPage.jsx:140-201](src/pages/ProspekPage.jsx#L140-L201)). PRD §4.1 meminta yang minimal: **Nama/Username, No. Telepon, Sumber Leads**. Sisanya masuk seksi "Lengkapi Data" yang tertutup secara default (dan tetap wajib sebelum lead naik ke Hot).

Komponen baru `src/components/FollowUpTimeline.jsx` — dipakai ulang di Prospek dan Konsumen, membaca/menulis `lead_activities`: tanggal-waktu, aktor (dari `profiles`), catatan komunikasi, hasil follow-up (`hasil` — kolom baru, opsi dari `business_settings`). Inilah "Notes" yang dicari fitur Find di Fase 1, jadi indeks trigram-nya sudah disiapkan lebih dulu.

---

## Fase 4 — Unicode, ekspor, dan perapian
*(PRD §2.2)*

- **Field username sosmed** belum ada sama sekali: tambah `leads.username_sosmed` dan `customers.username_sosmed` + input di kedua form.
- Postgres Supabase sudah UTF-8, jadi penyimpanan emoji aman. Yang **tidak** aman adalah ekspor PDF: jsPDF memakai Helvetica standar yang merusak emoji dan karakter non-latin di [LaporanPage.jsx:86](src/pages/LaporanPage.jsx#L86). Perbaikan: sematkan TTF Unicode (Noto Sans) atau arahkan nama non-ASCII ke ekspor XLSX yang sudah aman.
- Pencarian dibuat *case-insensitive* via `lower()` pada kedua sisi; **jangan** pakai `unaccent` pada kolom yang mungkin berisi emoji.
- Bersihkan `fetchDocumentsFor` yang terdefinisi dua kali di [KonsumenPage.jsx:202-210](src/pages/KonsumenPage.jsx#L202-L210).
- Perbarui `supabase/check_setup.sql` (cek migrasi 007–009 + ekstensi `pg_trgm`) dan `README.md` (urutan migrasi, tabel role baru menggantikan tabel di README:154-167).

---

## Verifikasi

**Database** — jalankan berurutan di Supabase SQL Editor pada proyek staging, lalu `supabase/check_setup.sql`:
```
migration_007_notes_search.sql → 008_roles_sod.sql → 009_pipeline.sql → storage.sql (idempoten)
```
Setiap migrasi diakhiri `notify pgrst, 'reload schema';` seperti [migration_005:300](supabase/migration_005_roles_and_dashboard.sql#L300).

**Matriks role** — buat 5 user uji (satu per role) dan konfirmasi tiap baris:

| Uji | Harapan |
|---|---|
| Sales membuat pembayaran, lalu menekan Verifikasi | Ditolak trigger (`42501`), tombol tidak muncul |
| Finance mengunggah kuitansi Booking Fee | Sukses; `customers.locked_at` terisi; `leads.status` = `booking` |
| Sales mengubah profil konsumen yang sudah terkunci | Ditolak; banner kunci tampil; form nonaktif |
| Sales menambah catatan follow-up pada konsumen terkunci | **Berhasil** |
| Supervisor Marketing membuka Prospek | Data tampil lengkap, semua tombol tulis hilang, `update` via API ditolak |
| Pengawas membuka `/log-aktivitas` | Log tampil; Sales yang membuka URL sama diarahkan keluar |
| Sales A mencari catatan milik Sales B | Nol hasil (RLS pada `search_notes`) |

**Pencarian** — sisipkan ±20.000 baris `lead_activities` sintetis, lalu `explain analyze select * from search_notes('kredit')`: pastikan *Bitmap Index Scan* pada indeks trigram, bukan *Seq Scan*, dan waktu di bawah ~200 ms. Uji juga kata di tengah kalimat dan kueri yang mengandung emoji.

**Frontend** — `npm run dev`, lalu telusuri: login → sidebar navy, tombol CTA oranye, tidak ada sisa hijau (`grep -rn '4b6b4f\|eceee9\|f3f5f1' src` harus nihil) → ketik di kotak cari header → hasil terkelompok dan bisa diklik → buka Prospek dengan form minimal → tambah follow-up → lihat status naik otomatis setelah Finance memverifikasi booking. Periksa juga tampilan <980px: sidebar geser, pencarian tetap dapat diakses.
