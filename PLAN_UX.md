# Rencana Peningkatan UX — Zafira Property CRM

**Status:** Menunggu persetujuan — belum ada kode yang ditulis
**Tanggal:** 10 September 2026
**Acuan:** PRD.md §2–§4, REVISI.md §1–§2, PLAN.md (fase 1–4 yang sudah selesai)

---

## 0. Ringkasan dan prinsip

Temuan audit: aplikasi ini **mencatat** alur CRM dengan benar tetapi belum
**menggerakkannya**. Tata kelolanya kuat — RBAC, Handover Hard-Lock, verifikasi
berbasis kuitansi, konfirmasi hapus yang menjelaskan cascade — dan tidak ada
satu pun dari itu yang diubah rencana ini. Yang ditambahkan adalah lapisan yang
hilang di atasnya: **alur kerja**.

Tiga prinsip yang memandu seluruh rencana:

1. **Satu peristiwa bisnis = satu aksi.** Booking adalah satu peristiwa;
   sekarang ia tiga pekerjaan manual terpisah. Sistem harus menyatukannya.
2. **Mencatat sebagai efek samping, bukan tugas tambahan.** Setiap kali user
   melakukan sesuatu yang nyata (menelepon, mengubah tahap, mengunggah berkas),
   riwayat terisi sendiri. Timeline yang harus diisi manual akan selalu bolong.
3. **Database tetap otoritas.** Tidak ada aturan izin baru yang hanya hidup di
   frontend. Setiap kemampuan baru yang melewati RLS berjalan lewat RPC
   `security definer` dengan pemeriksaan peran eksplisit di dalamnya —
   pola yang sama dengan `on_field_project()` pada migrasi 012.

Empat fase, dikerjakan berurutan karena masing-masing bertumpu pada yang
sebelumnya:

| Fase | Isi | Bergantung pada |
|---|---|---|
| **A** | Menutup alur: konversi Booking, halaman detail konsumen, perbaikan deep-link | migrasi 013 |
| **B** | Pekerjaan harian: WhatsApp, ubah tahap, antrean Reminder, lonceng | A (halaman detail), migrasi 013 |
| **C** | Dashboard "Fokus Hari Ini" per peran | migrasi 013 (RPC notifikasi) |
| **E/F** | Poles tabel, umpan balik, format, aksesibilitas | tidak ada — bisa paralel |

---

## 1. `supabase/migration_013_crm_flow.sql`

Satu migrasi untuk seluruh rencana. Aman dijalankan ulang, mengikuti gaya
migrasi 008–012.

### 1.1 `convert_lead_to_customer()` — konversi Booking atomik

**Masalah yang diselesaikan.** Saat ini Sales harus mengetik ulang seluruh data
prospek ke form konsumen ([KonsumenPage.jsx:278-283](src/pages/KonsumenPage.jsx#L278-L283)),
lalu mengaitkannya lewat dropdown *opsional* yang hanya menampilkan nama.
Duplikasi dan funnel yang putus diam-diam adalah akibat langsungnya.

**Kenapa `security definer`.** Konversi harus mengubah `units.status` menjadi
`booking`. Policy `units_write` (migrasi 008 baris 210) berbunyi
`can_manage_config() or can_write_berkas()` — dan `can_write_berkas()` adalah
`is_admin() or is_admin_marketing()`. **Sales tidak termasuk.** Menjalankan
konversi sebagai `security invoker` akan gagal di tengah jalan untuk peran yang
justru paling sering memakainya. Alternatifnya — melonggarkan `units_write`
untuk Sales — jauh lebih buruk: itu memberi Sales hak mengubah status unit mana
pun kapan pun, bukan hanya lewat konversi yang tervalidasi.

```sql
create or replace function convert_lead_to_customer(
  p_lead_id          uuid,
  p_unit_id          uuid,
  p_nominal_booking  numeric,
  p_tanggal_booking  date default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lead      leads%rowtype;
  v_unit      units%rowtype;
  v_customer  uuid;
begin
  -- Otorisasi eksplisit: security definer mem-bypass RLS, jadi hak akses
  -- diperiksa di sini, bukan diwariskan.
  if not (can_write_sales() or can_write_berkas()) then
    raise exception 'Anda tidak berhak melakukan konversi booking.'
      using errcode = '42501';
  end if;

  select * into v_lead from leads where id = p_lead_id;
  if not found then
    raise exception 'Prospek tidak ditemukan.';
  end if;

  -- Sales hanya boleh mengonversi prospeknya sendiri; owns_lead() sudah ada
  -- sejak migrasi 008 dan dipakai policy leads.
  if not (can_view_all() or can_write_berkas() or owns_lead(p_lead_id)) then
    raise exception 'Prospek ini bukan milik Anda.' using errcode = '42501';
  end if;

  if exists (select 1 from customers where lead_id = p_lead_id) then
    raise exception 'Prospek ini sudah pernah dikonversi menjadi konsumen.';
  end if;

  -- Invarian properti yang saat ini tidak dijaga di mana pun: satu unit tidak
  -- boleh dibooking dua orang. Tanpa ini, dua Sales bisa menjual unit yang sama.
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

  -- Booking fee masuk sebagai `menunggu`. Yang mengubahnya menjadi
  -- `terverifikasi` tetap hanya Finance lewat unggah kuitansi — SoD PRD §3.2
  -- tidak boleh dilewati oleh konversi ini.
  if p_nominal_booking is not null and p_nominal_booking > 0 then
    insert into payments (customer_id, payment_type, amount, payment_date, status)
    values (v_customer, 'booking', p_nominal_booking, p_tanggal_booking, 'menunggu');
  end if;

  insert into customer_kpr (customer_id, tanggal_booking, nominal_booking)
  values (v_customer, p_tanggal_booking, p_nominal_booking)
  on conflict (customer_id) do nothing;

  -- Jejak di timeline prospek, supaya riwayat pra-booking tidak berhenti
  -- mendadak di titik konversi.
  insert into lead_activities (lead_id, customer_id, actor_id, activity, hasil, note)
  values (p_lead_id, v_customer, me(), 'Konversi ke Booking', 'Booking',
          format('Unit %s · Booking fee %s',
                 coalesce(v_unit.unit_code, '-'),
                 coalesce(to_char(p_nominal_booking, 'FM999G999G999G999'), '-')));

  return v_customer;
end;
$$;

grant execute on function convert_lead_to_customer(uuid, uuid, numeric, date) to authenticated;
```

**Koreksi atas rancangan awal (ditemukan saat implementasi).** Draf pertama
rencana ini menyatakan `leads.status` tetap di tahap semula sampai Finance
memverifikasi kuitansi. Itu didasarkan pada pembacaan yang belum lengkap:
sistem ini punya **dua** jalur promosi ke tahap `booking`, bukan satu.

- `customers_sync_lead_stage` — naik saat `locked_at` terisi (kuitansi Finance)
- `customer_kpr_sync_lead_stage` — naik saat `customer_kpr.tanggal_booking` terisi

Karena RPC ini membuka baris KPR dengan `tanggal_booking`, jalur kedua ikut
menyala. Melawannya berarti menambah aturan yang bertentangan dengan aturan
sistem sendiri; aturan itu — *tanggal booking tercatat berarti prospek sudah
sampai tahap Booking* — sudah ada sejak migrasi 009 dan masuk akal.

Jadi `leads.status` **memang** naik ke `booking` saat konversi, lewat trigger
yang sudah ada, bukan lewat `update` di dalam RPC. Yang tetap menunggu kuitansi
Finance adalah **Handover Hard-Lock**, dan itulah pengamanan yang sebenarnya
penting: konsumen hasil konversi tidak terkunci, `locked_at` tetap `null`, dan
Sales masih memegang berkasnya. Keduanya diuji eksplisit di
`tests/09_crm_flow.sql` supaya perubahan perilakunya kelak tidak lolos diam-diam.

### 1.2 `my_notifications()` — sumber lonceng dan "Fokus Hari Ini"

**Kenapa RPC, bukan tabel `notifications`.** Tabel notifikasi menuntut trigger di
delapan tempat, policy tulis sendiri, dan pembersihan baris basi — lalu tetap
bisa tidak sinkron dengan kenyataan. Semua yang perlu diberitahukan di sini
**sudah dapat dihitung** dari data yang ada. `security invoker` membuat RLS
menyaringnya secara alami: Sales hanya melihat prospeknya sendiri tanpa satu
baris kode izin tambahan.

```sql
create or replace function my_notifications()
returns json
language sql stable security invoker set search_path = public as $$
  with
  -- Sales: follow-up jatuh tempo
  followup as (
    select 'followup' as kategori,
           case when tanggal_rencana < current_date then 'tinggi' else 'sedang' end as urgensi,
           name as judul,
           case when tanggal_rencana < current_date
                then format('Terlewat %s hari', current_date - tanggal_rencana)
                else 'Jadwal hari ini' end as detail,
           '/prospek' as rute, id as record_id, tanggal_rencana as tanggal
      from leads
     where tanggal_rencana is not null
       and tanggal_rencana <= current_date
       and status not in ('cancel', 'akad', 'aftersales')
  ),
  -- Sales: prospek panas yang tidak disentuh seminggu
  dingin as (
    select 'dingin', 'sedang', l.name, 'Belum ada aktivitas 7 hari',
           '/prospek', l.id, null::date
      from leads l
     where l.status in ('warm', 'hot')
       and not exists (
         select 1 from lead_activities a
          where a.lead_id = l.id and a.created_at > now() - interval '7 days')
  ),
  -- Admin Marketing: SP3K mendekati kedaluwarsa
  sp3k as (
    select 'sp3k',
           case when k.tanggal_sp3k_expired < current_date + 7 then 'tinggi' else 'sedang' end,
           c.name,
           format('SP3K kedaluwarsa %s', to_char(k.tanggal_sp3k_expired, 'DD Mon YYYY')),
           '/konsumen', c.id, k.tanggal_sp3k_expired
      from customer_kpr k join customers c on c.id = k.customer_id
     where k.tanggal_sp3k_expired is not null
       and k.tanggal_akad is null
       and k.tanggal_sp3k_expired <= current_date + 14
  ),
  -- Admin Marketing: berkas mengendap di bank
  mandek as (
    select 'mandek', 'tinggi', c.name,
           format('%s hari di bank tanpa SP3K', current_date - k.tanggal_masuk_bank),
           '/konsumen', c.id, k.tanggal_masuk_bank
      from customer_kpr k join customers c on c.id = k.customer_id
     where k.tanggal_masuk_bank is not null
       and k.tanggal_sp3k_terbit is null
       and current_date - k.tanggal_masuk_bank > 30
  ),
  -- Finance: antrean verifikasi
  verifikasi as (
    select 'verifikasi', 'tinggi', c.name,
           format('%s · Rp%s', p.payment_type, to_char(p.amount, 'FM999G999G999G999')),
           '/pembayaran', p.id, p.payment_date
      from payments p join customers c on c.id = p.customer_id
     where p.status = 'menunggu'
  ),
  semua as (
    select * from followup union all select * from dingin union all
    select * from sp3k     union all select * from mandek union all
    select * from verifikasi
  )
  select json_build_object(
    'total', (select count(*) from semua),
    'tinggi', (select count(*) from semua where urgensi = 'tinggi'),
    'per_kategori', coalesce((
      select json_agg(json_build_object('kategori', kategori, 'jumlah', n))
        from (select kategori, count(*) n from semua group by kategori) t), '[]'::json),
    'items', coalesce((
      select json_agg(json_build_object(
               'kategori', kategori, 'urgensi', urgensi, 'judul', judul,
               'detail', detail, 'rute', rute, 'record_id', record_id))
        from (select * from semua
               order by (urgensi = 'tinggi') desc, tanggal nulls last
               limit 30) t), '[]'::json)
  );
$$;

grant execute on function my_notifications() to authenticated;
```

**Efek RLS yang diandalkan** (dan yang harus diuji): Sales melihat notifikasi
`verifikasi` **kosong**, bukan karena disaring peran, tetapi karena baris
`payments` milik konsumen orang lain memang tidak lolos policy `payments_select`.
Peran monitoring melihat semuanya. Ini yang membuat fungsinya cukup satu untuk
tujuh peran.

### 1.3 Indeks pendukung

```sql
create index if not exists idx_leads_tanggal_rencana
  on leads (tanggal_rencana) where tanggal_rencana is not null;

create index if not exists idx_lead_activities_lead_created
  on lead_activities (lead_id, created_at desc);

create index if not exists idx_customer_kpr_sp3k_expired
  on customer_kpr (tanggal_sp3k_expired) where tanggal_sp3k_expired is not null;

create index if not exists idx_payments_status
  on payments (status) where status = 'menunggu';

create index if not exists idx_customers_lead on customers (lead_id);
```

### 1.4 `supabase/tests/09_crm_flow.sql`

Mengikuti pola `08_lapangan.sql`. Yang diuji:

| # | Uji | Harapan |
|---|---|---|
| 1 | Sales mengonversi prospeknya sendiri | berhasil, unit jadi `booking`, payment `menunggu` tercipta |
| 2 | Sales mengonversi prospek agen lain | ditolak `42501` |
| 3 | Konversi kedua atas prospek yang sama | ditolak, pesan "sudah pernah dikonversi" |
| 4 | Dua konversi ke unit yang sama | yang kedua ditolak |
| 5 | Konversi gagal di tengah | tidak menyisakan konsumen yatim (atomisitas) |
| 6 | Konversi **tidak** menaikkan `leads.status` | tetap tahap semula sampai kuitansi terverifikasi |
| 7 | `my_notifications()` sebagai Sales | tidak memuat kategori `verifikasi` milik konsumen agen lain |
| 8 | `my_notifications()` sebagai Finance | memuat seluruh antrean `menunggu` |
| 9 | Peran read-only memanggil konversi | ditolak `42501` |

---

## 2. Fase A — Menutup alur

### A1. `src/components/KonversiBookingModal.jsx` *(baru)*

Modal yang dipanggil dari baris prospek. Isinya:

- Ringkasan prospek (nama, telepon, sumber) — **tidak bisa diedit**, ini bukan form entri
- **Pemilih unit visual**: daftar unit `tersedia` dikelompokkan per blok, menampilkan `unit_code`, tipe, harga. Tombol "Pilih dari siteplan" membuka [SiteplanPage](src/pages/SiteplanPage.jsx) dalam mode pilih
- Nominal booking fee (input Rupiah berformat) + tanggal booking
- Pratinjau konsekuensi sebelum konfirmasi — pola yang sama dengan `DeleteButton`:

  > Konsumen **{nama}** akan dibuat · Unit **{kode}** ter-*reserve* · Booking fee **Rp{n}** masuk antrean verifikasi Finance

- Setelah sukses: toast + navigasi langsung ke `/konsumen/{id}`

Memanggil `supabase.rpc('convert_lead_to_customer', {...})`. Error dari RPC
sudah berbahasa Indonesia dan bisa ditampilkan apa adanya.

### A2. `src/pages/KonsumenDetailPage.jsx` *(baru)* — kartu konsumen 360°

Rute baru `/konsumen/:id`. Struktur:

```
┌─ Header lengket ───────────────────────────────────────────┐
│ Nama          [Tahap]  [🔒 Tanggung Jawab]                 │
│ 📞 telepon (→WA)  🏠 unit  👤 agen  ⏱ lama proses          │
├─ Tab ──────────────────────────────────────────────────────┤
│ Ringkasan │ Progres KPR │ Dokumen │ Pembayaran │ Riwayat    │
└────────────────────────────────────────────────────────────┘
```

- **Ringkasan** — data diri, unit, ringkasan KPR satu baris per tahap, tiga
  aktivitas terakhir, tombol aksi utama sesuai tahap
- **Progres KPR** — `KprStepper` (§D di bawah), menggantikan grid 17 input datar
- **Dokumen** — yang sekarang ada, ditambah indikator kelengkapan (KTP · KK ·
  NPWP · Slip Gaji · Akad) dan penanda dokumen ditolak
- **Pembayaran** — riwayat milik konsumen ini, tidak perlu ke `/pembayaran`
- **Riwayat** — `FollowUpTimeline` yang diperluas (§B1)

`LockBanner` dan `ReadOnlyBanner` naik ke header supaya berlaku untuk seluruh
tab, bukan hanya panel KPR seperti sekarang.

### A3. `src/pages/KonsumenPage.jsx` *(diubah)*

Menjadi **daftar murni**. Seluruh panel KPR, tabel dokumen, dan timeline
(baris 392–498, sekitar 110 baris) pindah ke halaman detail. Yang tersisa:
tabel + form tambah + kotak cari baru. Kolom "Progres KPR" yang sekarang berisi
tombol "Kelola" diganti: **seluruh baris bisa diklik** menuju detail.

### A4. Deep-link pencarian — `GlobalSearch.jsx` + `permissions.js`

Dua perbaikan:

1. **Pembangun rute di frontend.** [GlobalSearch.jsx:92](src/components/GlobalSearch.jsx#L92)
   sekarang selalu memakai `?cari=&sorot=`, padahal hanya
   [ProspekPage](src/pages/ProspekPage.jsx#L105) yang membacanya. Hasil
   *Konsumen*, *Progres KPR*, dan *Komplain* mendarat di daftar polos. Perbaikannya
   di frontend, bukan SQL — `rute` dari `search_notes` tetap jadi petunjuk modul:

   ```js
   function targetUrl(row, q) {
     if (row.rute === "/konsumen") return `/konsumen/${row.record_id}`;
     return `${row.rute}?cari=${encodeURIComponent(q)}&sorot=${row.record_id}`;
   }
   ```
   Ditambah penanganan `?sorot=` di `KomplainPage`.

2. **`canVisit` harus mengenali rute bersarang.** [permissions.js:185-187](src/lib/permissions.js#L185-L187)
   membandingkan `pathname` persis dengan daftar. `/konsumen/abc-123` **tidak
   akan cocok**, sehingga `RoleRoute` melempar setiap orang kembali ke dashboard.
   Ini pemblokir Fase A dan harus diperbaiki lebih dulu:

   ```js
   export function canVisit(profile, path) {
     const allowed = allowedRoutes(profile);
     if (allowed.includes(path)) return true;
     return allowed.some((r) => r !== "/" && path.startsWith(`${r}/`));
   }
   ```

### A5. `src/pages/ProspekPage.jsx` *(diubah)*

Tombol **"Konversi ke Booking"** di setiap baris berstatus `hot` (dan `warm`,
dengan konfirmasi tambahan). Disembunyikan untuk baris yang sudah punya konsumen
— perlu satu query kecil `customers.select('lead_id')` saat memuat daftar.

---

## 3. Fase B — Pekerjaan harian

### B1. Aksi kontak — `src/components/KontakAksi.jsx` + `src/lib/waTemplates.js` *(baru)*

Mengganti nomor telepon yang selama ini teks mati di seluruh tabel:

```
0812-3456-7890   →   0812-3456-7890  [💬 WA]  [📞]
```

- `wa.me/{62…}?text={template}` — normalisasi `08…` → `628…`
- Template per tahap, dari `waTemplates.js`:
  - `warm` → perkenalan + tawaran survei
  - `hot` → konfirmasi jadwal survei
  - `booking` → instruksi pembayaran booking fee
  - `kpr` → permintaan kelengkapan berkas
  - `akad` → konfirmasi jadwal akad
- **Setelah jendela WhatsApp terbuka**, muncul prompt kecil: *"Catat percakapan ini?"*
  → satu klik menyisipkan baris `lead_activities`. Inilah penerapan prinsip
  "mencatat sebagai efek samping": timeline terisi tanpa user merasa sedang
  mengisi formulir.

Template disimpan di `business_settings` (memakai `useBusinessSettings` yang
sudah ada) supaya bisa diubah tanpa deploy.

### B2. `src/components/UbahTahapModal.jsx` *(baru)*

Mengganti `<select>` telanjang di [ProspekPage.jsx:410-420](src/pages/ProspekPage.jsx#L410-L420).
Mengubah tahap sekarang membuka modal yang meminta:

- Tahap tujuan
- Hasil follow-up (dari `business_settings.hasil_followup`)
- Catatan singkat
- **Tanggal follow-up berikutnya** — wajib untuk tahap maju, opsional untuk `cancel`

Satu transaksi: `leads.update({status, tanggal_rencana, rencana_selanjutnya})`
\+ `lead_activities.insert(...)`. **Ini perubahan paling menentukan dalam
rencana ini** — inilah mekanisme yang membuat pipeline tidak pernah berhenti,
dan sekaligus yang membuat Reminder punya isi.

### B3. `src/pages/ReminderPage.jsx` *(diubah)*

Dari daftar pasif menjadi antrean kerja. Dikelompokkan **Terlewat · Hari Ini ·
Minggu Ini**, dengan empat aksi per baris:

| Aksi | Efek |
|---|---|
| ✓ Selesai | modal catat hasil → `lead_activities` + kosongkan `tanggal_rencana` |
| ↻ Jadwal ulang | pilih tanggal baru, alasan tercatat |
| 💬 WA | `KontakAksi` |
| → Buka | ke prospek/konsumen |

"Hapus jadwal" yang sekarang satu-satunya aksi tetap ada, tetapi turun jadi menu
sekunder — ia menghapus pekerjaan, bukan menyelesaikannya.

### B4. Lonceng hidup — `src/components/NotifBell.jsx` + `src/lib/useNotifications.js` *(baru)*

[AppLayout.jsx:297](src/components/AppLayout.jsx#L297) sekarang merender
`<IconButton icon={Bell} title="Notifikasi" />` **tanpa `onClick`** — kontrol mati
yang terlihat. Diganti dengan:

- Badge angka (merah bila ada `urgensi: tinggi`)
- Dropdown dikelompokkan per kategori, tiap item menuju rutenya
- `useNotifications()` memanggil `my_notifications()`, di-*poll* tiap 60 detik
  dan disegarkan saat tab kembali fokus

### B5. `src/components/FollowUpTimeline.jsx` *(diubah)*

Timeline sekarang hanya berisi catatan manual. Diperluas menjadi **riwayat
gabungan**: catatan + perubahan tahap + pembayaran terverifikasi + dokumen
diunggah/ditolak + tanggal KPR terisi. Peristiwa sistem dibedakan visual (ikon
navy, tidak bisa dihapus) dari catatan manusia.

> **Catatan:** [FollowUpTimeline.jsx:159-164](src/components/FollowUpTimeline.jsx#L159-L164)
> memakai `subject="agent_role"` untuk tombol hapus catatan — artinya **hanya
> Admin** yang bisa menghapus catatannya sendiri. Kemungkinan besar ini salah
> salin; akan dikonfirmasi terpisah sebelum diubah.

---

## 4. Fase C — Dashboard per peran

### `src/components/FokusHariIni.jsx` *(baru)* + `DashboardPage.jsx` *(diubah)*

Satu blok di **paling atas** dashboard, di atas pemilih periode. Laporan yang
sekarang ada tidak dihapus — hanya turun ke bawah, karena memang berguna, hanya
saja bukan hal pertama yang dibutuhkan seseorang saat membuka aplikasi.

| Peran | Isi blok fokus |
|---|---|
| **Sales** | Follow-up hari ini · Terlewat · Prospek dingin 7 hari · Booking menunggu kuitansi |
| **Admin Marketing** | SP3K < 14 hari · Berkas mandek > 30 hari · Dokumen ditolak · Akad pekan ini |
| **Finance** | Antrean verifikasi (jumlah + nominal) · DP menunggak · Tervalidasi hari ini |
| **Tim Lapangan** | Tugas terlambat · Laporan belum dikirim hari ini |
| **Supervisor / Pengawas** | Tetap seperti sekarang — mereka memang membaca laporan |

Sumbernya `my_notifications()`, jadi tidak ada query baru per peran dan angkanya
dijamin sama dengan yang di lonceng.

Selain itu, kartu-kartu yang tidak relevan **disembunyikan per peran**: Sales
tidak lagi melihat "Antrean Finance" dan "Rata-rata Durasi Tahap KPR".

---

## 5. Fase D — Layar KPR sebagai *stepper*

### `src/components/KprStepper.jsx` *(baru)*

Menggantikan grid 17 input datar di [KonsumenPage.jsx:398-423](src/pages/KonsumenPage.jsx#L398-L423).
Delapan tahap sesuai subjudul yang sudah dijanjikan halaman itu:

```
Booking ─● DP ─● Bank ─◐ SP3K ─○ Akad ─○ Serah Terima ─○ BPHTB ─○ SHM
                        ▲ tahap aktif
```

- Tahap **selesai** ter-*collapse* jadi satu baris ringkasan (`✓ DP · 12 Jan 2026 · Rp45.000.000`)
- Tahap **aktif** terbuka penuh dengan bidangnya saja
- Tahap **mendatang** terkunci abu-abu dengan keterangan prasyarat
- **Auto-save per bidang** dengan indikator "Tersimpan" — menghapus risiko
  kehilangan isian saat berpindah konsumen
- **Peringatan otomatis**: SP3K kedaluwarsa < 14 hari (oranye) / lewat (merah);
  berkas di bank > 60 hari (merah)

Tahap aktif ditentukan dari tanggal yang sudah terisi, bukan dari kolom baru —
tidak butuh perubahan skema.

---

## 6. Fase E/F — Poles dan aksesibilitas

### E1. `src/components/ui.jsx` — `DataTable`

Satu komponen dipakai 14 halaman, jadi setiap perbaikan di sini berlaku
menyeluruh. Ditambahkan, semuanya opsional agar pemanggil lama tidak berubah:

- `sortable` — klik judul kolom untuk mengurutkan
- `searchable` — kotak cari bawaan (menghapus duplikasi manual di ProspekPage)
- `filters` — filter dropdown per kolom (dipakai Pembayaran: status)
- `pageSize` — paginasi bila baris > 25
- `onRowClick` — baris bisa diklik
- Judul kolom lengket saat menggulir
- **Mode kartu di layar < 700px** — tabel 8 kolom yang harus digulir ke samping
  adalah masalah terbesar di HP, dan Sales bekerja dari HP

### E2. `src/lib/format.js` *(baru)* — kamus istilah dan format

Nilai enum mentah sekarang bocor ke UI: `proses`, `menunggu`, `dana_talangan`.
Satu kamus terpusat:

```js
rupiah(45000000)              → "Rp45.000.000"
rupiahSingkat(45000000)       → "Rp45 jt"
labelStatus("dana_talangan")  → "Dana Talangan"
labelTahap("hot")             → "Hot Lead"
tanggal("2026-01-12")         → "12 Jan 2026"
tanggalRelatif(...)           → "3 hari lagi" / "Terlewat 2 hari"
telepon("08123456789")        → "0812-3456-789"
```

Semua input Rupiah memakai pemisah ribuan hidup (`type="text"` + `inputMode="numeric"`,
bukan `type="number"` seperti sekarang yang menampilkan `45000000` polos).

### E3. Umpan balik — `src/context/ToastContext.jsx` + `src/components/Toast.jsx` *(baru)*

Saat ini simpan berhasil = form menutup diam-diam. Toast di pojok kanan bawah:
sukses (navy), gagal (merah, tidak hilang sendiri).

**Error yang sekarang hilang diam-diam** dan akan dimunculkan:

| Lokasi | Masalah |
|---|---|
| [KonsumenPage.jsx:165](src/pages/KonsumenPage.jsx#L165) | `updateStatus` — hasil `update()` dibuang |
| [KonsumenPage.jsx:212](src/pages/KonsumenPage.jsx#L212) | `updateDocStatus` — sama |
| [ProspekPage.jsx:202-206](src/pages/ProspekPage.jsx#L202-L206) | error ditulis ke state tetapi form tertutup, jadi tak pernah terlihat |

Bila RLS menolak, user saat ini melihat nilai lama kembali **tanpa penjelasan
apa pun** — pola kegagalan paling membingungkan yang ada di aplikasi ini.

### E4. Form dan label

`Field` sebagai pembungkus: `<label>` sungguhan di atas input, bukan placeholder
sebagai label. Saat ini begitu user mengetik, konteks bidangnya hilang — dan
form Prospek punya 17 bidang seperti itu.

### F1. Aksesibilitas

| Perbaikan | Sekarang |
|---|---|
| `:focus-visible` ring terlihat | hanya `border-color` diubah lewat `!important` di [index.css:24-26](src/index.css#L24-L26) |
| Focus trap + Escape + `role="dialog"` | `ConfirmDialog` tidak punya ketiganya |
| `aria-label` pada tombol ikon | hanya `title` |
| Status tidak hanya lewat warna | `sisaColor` di ReminderPage hanya warna |
| ⌘K / Ctrl+K buka pencarian | tidak ada |
| Navigasi panah di hasil pencarian | hanya klik |

### F2. Keadaan kosong

14 tabel memakai satu baris abu-abu (*"Belum ada prospek."*). Diganti dengan
keadaan kosong yang mengarahkan: ikon, kalimat penjelas, dan tombol aksi utama.
Ini pengalaman hari pertama seorang pengguna baru.

---

## 7. Urutan eksekusi

Berurutan, karena tiap langkah dipakai langkah berikutnya:

| # | Langkah | Titik uji |
|---|---|---|
| 1 | `canVisit` prefix + `migration_013` + `tests/09` | `npm run test:db` hijau |
| 2 | `format.js`, `ToastContext`, `Field`, `DataTable` | halaman lama tidak berubah perilaku |
| 3 | A2/A3 — `/konsumen/:id` + daftar dirampingkan | detail konsumen bisa di-*share* lewat link |
| 4 | A1/A5 — modal konversi | Sales melakukan booking tanpa mengetik ulang |
| 5 | A4 — deep-link pencarian | lima jenis hasil pencarian mendarat dengan benar |
| 6 | B1/B2 — WhatsApp + ubah tahap | timeline terisi sendiri dari aktivitas nyata |
| 7 | B3/B4/B5 — Reminder, lonceng, riwayat gabungan | lonceng menunjukkan angka yang sama dengan Reminder |
| 8 | C — Fokus Hari Ini | tiap peran melihat pekerjaannya di layar pertama |
| 9 | D — `KprStepper` | Admin Marketing tahu tahap aktif tanpa membaca 17 bidang |
| 10 | E/F — poles, mobile, aksesibilitas | tabel terbaca di HP; navigasi keyboard penuh |

**Perkiraan:** 4 berkas SQL/uji, 11 berkas baru, 12 berkas diubah.

---

## 8. Yang perlu Anda putuskan sebelum saya mulai

1. ~~**Tahap prospek saat konversi.**~~ **Terjawab saat implementasi** — lihat
   koreksi di §1.1. Tahap naik ke `booking` lewat trigger yang sudah ada;
   Hard-Lock tetap menunggu kuitansi Finance.

2. **Unit wajib atau opsional saat konversi.** Diputuskan **opsional**
   (`p_unit_id` boleh `null`) supaya booking bisa dicatat sebelum unit
   ditentukan. Sudah diuji. Beri tahu bila di lapangan booking selalu menyebut
   unit — tinggal dijadikan wajib di sisi modal.

3. **Hapus catatan follow-up.** `subject="agent_role"` di `FollowUpTimeline`
   berarti hanya Admin yang bisa menghapus catatan. Disengaja, atau salah salin?
   *Belum diubah — menunggu jawaban.*

4. **Template WhatsApp.** Saya butuh contoh kalimat yang tim Anda pakai sekarang
   agar templatenya terasa wajar, bukan karangan saya. *Sementara memakai
   kalimat netral yang bisa diedit lewat Pengaturan Bisnis.*

---

## 9. Catatan pelaksanaan

**Seluruh langkah 1–10 selesai (10 September 2026).**
Suite database: **154/154 uji lulus** (29 baru). `vite build` bersih, dan
seluruh 22 modul yang disentuh diverifikasi ter-*transform* lewat dev server.

### Temuan yang mengubah rencana

**1. Dua jalur promosi tahap, bukan satu** — lihat koreksi §1.1. Rancangan awal
saya salah baca.

**2. `subject="agent_role"` pada hapus catatan ternyata BENAR.** Rencana ini
menduganya salah salin. Policy `lead_activities_delete` (migrasi 008) berbunyi
`is_admin()`, jadi hanya Admin yang boleh menghapus catatan — riwayat
komunikasi adalah jejak audit. Yang diubah hanya namanya menjadi
`followup_delete` agar cerminnya jujur; perilakunya persis sama. **Pertanyaan
nomor 3 di §8 terjawab sendiri: itu disengaja.**

**3. `canVisit` adalah pemblokir yang lebih besar dari dugaan.** Perbandingan
persis membuat `/konsumen/<id>` gagal untuk *semua* peran, bukan sebagian.

### Bug yang tertangkap saat menelaah sendiri

- **`KprStepper` menutup akordeon setiap kali menyimpan.** `kpr` ikut menjadi
  dependensi `useEffect`, dan penyimpanan per kolom mengabarkan objek baru ke
  induk — sehingga tahap yang sedang diisi menutup tepat setelah satu kolom
  diketik. Diperbaiki: hanya `customerId` yang mengatur ulang keadaan.
- **Nilai yang diubah lalu dikembalikan tidak tersimpan.** Perbandingan
  memakai prop `kpr` yang bisa basi. Diganti `tersimpanRef` yang mencerminkan
  isi database sebenarnya.
- **Modal terpotong di dalam sel tabel.** `DataTable` membungkus tabelnya dalam
  `overflow-x: auto`, dan `KontakAksi` memanggil modal dari dalam sel. Modal
  kini di-*portal* ke `<body>` — sekaligus menghapus `<div>` yang bersarang di
  dalam `<span>`.
- **Cache notifikasi bertahan lintas sesi.** Ringkasan disimpan di tingkat
  modul agar lonceng dan dashboard berbagi satu hasil; tanpa pembersihan saat
  ganti sesi, pengguna berikutnya di komputer yang sama sempat melihat antrean
  milik pengguna sebelumnya — persis yang RLS dirancang untuk mencegah.

### Berkas

**Baru (13):** `migration_013_crm_flow.sql` · `tests/09_crm_flow.sql` ·
`lib/format.js` · `lib/waTemplates.js` · `lib/useNotifications.js` ·
`context/ToastContext.jsx` · `components/KontakAksi.jsx` ·
`components/KprStepper.jsx` · `components/KonversiBookingModal.jsx` ·
`components/UbahTahapModal.jsx` · `components/NotifBell.jsx` ·
`components/FokusHariIni.jsx` · `pages/KonsumenDetailPage.jsx`

**Diubah (13):** `App.jsx` · `index.css` · `components/ui.jsx` ·
`components/AppLayout.jsx` · `components/GlobalSearch.jsx` ·
`components/FollowUpTimeline.jsx` · `context/AuthContext.jsx` ·
`lib/permissions.js` · `pages/ProspekPage.jsx` · `pages/KonsumenPage.jsx` ·
`pages/PembayaranPage.jsx` · `pages/ReminderPage.jsx` ·
`pages/DashboardPage.jsx` · `pages/KomplainPage.jsx` · `pages/PencarianPage.jsx`

---

## 10. Lanjutan — setelah migrasi 013 dipasang ke Supabase

Migrasi 013 diverifikasi langsung pada proyek Supabase: `my_notifications()`
mengembalikan bentuk yang benar, dan `convert_lead_to_customer()` menolak
pemanggil tak terautentikasi dengan `42501` beserta pesan Indonesianya.

Ketiga sisa pekerjaan dari daftar sebelumnya diselesaikan.

### 10.1 Pemilih unit visual — `components/SiteplanPicker.jsx`

Modal konversi kini membuka **peta lebih dulu**, dengan daftar sebagai pilihan
kedua. Alasannya: yang ada di kepala pembeli adalah *letak* unit — hook, dekat
jalan masuk, sebelah mana — bukan kodenya. Memaksa Sales menerjemahkan itu
menjadi "A-14" sebelum bisa mencatat booking adalah sumber salah pilih unit.

- Hanya unit `tersedia` yang bisa diklik; sisanya tetap digambar tetapi redup,
  karena melihat unit sebelah sudah terjual adalah konteks yang berguna
- Proyek yang dibuka pertama adalah yang **masih punya unit tersedia**
- Unit tersedia yang belum ditandai di peta muncul sebagai daftar pil di bawah —
  tanpa itu, beralih ke peta justru menyembunyikan sebagian barang dagangan
- Modal melebar ke 720px saat mode peta

### 10.2 Template WhatsApp dapat diubah — `migration_014_wa_templates.sql`

Pertanyaan nomor 4 di §8 terjawab dengan memindahkan keputusannya ke tim:
template kini diubah lewat **Pengaturan Bisnis**, bukan lewat deploy.

**Keputusan skema.** `business_settings` menyimpan *daftar nilai*
(`category` + `value`), sedangkan template butuh *kunci→teks* — satu kalimat
per tahap. Ditambahkan kolom `label`, dan batasan keunikannya dipecah menurut
bentuk barisnya:

| Bentuk | Indeks | Alasan |
|---|---|---|
| Daftar biasa (`label IS NULL`) | unik `(category, value)` | persis seperti sebelumnya — dua "Bank BTN" memang tidak masuk akal |
| Kunci→teks (`label IS NOT NULL`) | unik `(category, label)` | yang harus unik adalah tahapnya, bukan teksnya |

Batasan lama `(category, value)` akan menolak dua tahap yang kebetulan memakai
kalimat sama — padahal itu sah. Pemecahan ini membuat aturan lama tetap
berlaku persis untuk seluruh kategori yang sudah ada.

Panel di Pengaturan Bisnis menampilkan kedelapan tahap, menandai mana yang
sudah **disesuaikan** dan mana yang masih **bawaan**, serta memberi pratinjau
kalimat jadi — penanda yang salah ketik baru ketahuan setelah pesan terkirim,
dan saat itu sudah terlambat. Mengosongkan sebuah kolom mengembalikannya ke
kalimat bawaan, bukan menghapus pesannya: aksi WhatsApp tidak boleh mati.
`lib/waTemplates.js` tetap ada sebagai cadangan.

### 10.3 Sorotan baris untuk `?sorot=`

`DataTable` menerima `highlightId`: baris yang dituju digulir ke tengah
pandangan dan disorot, lalu sorotannya memudar setelah empat detik — ia
menjawab "yang mana" saat tiba, lalu berhenti bersaing dengan isi tabel.
Dihormati `prefers-reduced-motion`. Dipasang di Prospek, Komplain, dan
Pembayaran (tempat lonceng menautkan antrean verifikasi).

### 10.4 Uji

**160/160 lulus** — 6 uji baru untuk migrasi 014, termasuk yang membuktikan
kedua bentuk keunikan berlaku pada barisnya masing-masing, dan bahwa Sales
tidak dapat mengubah template (itu kewenangan konfigurasi, REVISI §2.1).

### 10.5 Yang masih tersisa

- **Migrasi 014 belum dijalankan ke Supabase.** Sampai itu dilakukan, panel
  template menampilkan kalimat bawaan dan penyimpanan akan memberi pesan yang
  menyebutkan berkas migrasinya.

---

## 11. Siteplan vektor

Gambar kerja diubah menjadi geometri vektor per kavling, sehingga **kavlingnya
sendiri** yang dapat diklik.

### 11.1 Kenapa bukan penelusuran kurva

Penelusuran vektor biasa (potrace dan sejenisnya) mengubah garis gambar menjadi
ribuan kurva **tanpa identitas**: hasilnya gambar yang tampak sama tetapi tetap
tidak bisa diklik, karena tidak ada yang tahu kurva mana milik kavling mana.
Tepinya pun bergerigi mengikuti artefak JPEG.

Sifat gambar sumbernya dimanfaatkan: ia gambar CAD — garis hitam bersih di atas
putih, satu grid yang diputar pada **satu** sudut. Maka:

1. Sudut putar dicari dari ketajaman proyeksi piksel gelap (**−18,44°**) — pada
   sudut yang benar, garis-garis sejajar menumpuk jadi puncak tinggi dan sempit
2. Tiap kavling adalah **daerah putih tertutup**; dilabeli sebagai komponen
   terhubung
3. Setelah sumbunya diluruskan, tiap daerah menjadi segi empat sejajar sumbu →
   diukur presisi → diputar balik menjadi empat titik

Hasilnya segi empat presisi dengan kode unit, bukan kurva bergerigi anonim.

### 11.2 Pemeriksaan yang membuktikan penomorannya benar

Skripnya **berhenti dengan galat** bila salah satu tidak terpenuhi — lebih baik
gagal terang-terangan daripada menghasilkan kode unit yang salah diam-diam:

| Pemeriksaan | Hasil |
|---|---|
| Jumlah daerah seukuran kavling | **158** — sama dengan legenda gambar dan isi tabel `units` |
| Susunan kolom blok tengah | `[7,7,7, 8,8, 8,8,6,6, 8,8, 8,8, 8,8, 8]` — **cocok persis** |
| Jumlah per blok | A32 · B21 · C16 · D28 · E16 · F16 · G16 · H13 |

Selain itu geometrinya dirender ulang dengan kode terpasang dan dibandingkan
mata-ke-mata dengan `assets/siteplan-with-number.jpeg`: celah T.7 antara A16 dan
A17, letak Masjid di antara kolom D, dan baris H9–H13 di bawah — semuanya cocok.

### 11.3 Berkas

| Berkas | Isi |
|---|---|
| `tools/siteplan_ke_vektor.py` | pembangkit, dapat dijalankan ulang |
| `public/siteplan-kaligangsa.svg` | SVG mandiri, tiap kavling `id="kav-<kode>"` |
| `src/data/siteplanKaligangsa.js` | geometri untuk peta React (**dihasilkan otomatis, jangan disunting tangan**) |
| `src/components/SiteplanVektor.jsx` | peta interaktif |

Menjalankan ulang:

```bash
python3 -m venv .venv && .venv/bin/pip install pillow numpy scipy
.venv/bin/python tools/siteplan_ke_vektor.py
```

### 11.4 Yang berubah di antarmuka

- **Siteplan Digital** memakai peta vektor; klik kavling membuka konsumen dan
  progres pembangunannya. Warna kavling mengikuti status dari database
  (`unit_code` menjadi kuncinya), jadi tidak ada penempatan pin manual sama
  sekali — dulu 158 kali klik.
- **Modal konversi Booking** memakai peta yang sama, dengan hanya unit
  `tersedia` yang dapat diklik. Kavling berstatus lain tetap digambar dengan
  warna statusnya: melihat kavling sebelah sudah terjual adalah konteks yang
  berguna, sedangkan membiarkannya diklik lalu ditolak server hanya
  membingungkan.
- Geser untuk menggeser, ⌘/Ctrl + gulir untuk memperbesar. Kode kavling baru
  muncul pada perbesaran ≥2× — 158 label sekaligus justru menutupi petanya.
- **Proyek lain tidak terganggu**: halaman jatuh ke cara lama (gambar + pin)
  bila kurang dari 80% kode unitnya cocok dengan geometri vektor.

### 11.5 Yang tidak disertakan

Jaringan jalan dan area berarsir **tidak** ikut divektorkan — hanya kavling,
Masjid, dan dua kotak fasilitas. Celah antarblok terbaca sebagai jalan tanpa
perlu menggambarnya, dan menyalin garis jalan berarti menelusuri kurva bebas
yang justru dihindari di §11.1.

Penanda T.4–T.6 dan T.8–T.13 hanya berupa label di atas jalan pada gambar
bernomor; pada gambar bersih ia tidak membentuk daerah tertutup, jadi tidak ada
yang bisa dikenali. Begitu pula TPS dan IPAL.

---

## 12. Penutup — verifikasi terhadap sistem yang berjalan

Setelah kedua migrasi terpasang di Supabase, seluruhnya diperiksa terhadap
proyek yang sebenarnya, bukan hanya terhadap Postgres lokal.

### 12.1 Migrasi hidup

| Yang diperiksa | Hasil |
|---|---|
| `my_notifications()` | mengembalikan bentuk yang benar |
| `convert_lead_to_customer()` | menolak pemanggil tak terautentikasi dengan `42501` beserta pesan Indonesianya |
| `business_settings` kategori `wa_template` | delapan template bawaan terpasang, kolom `label` terisi |

### 12.2 Data hidup cocok dengan peta vektor

158 unit di database, kode `A1`–`H13`, status nyata: 148 tersedia · 5 terjual ·
4 booking · 1 batal. Perbandingan kode database dengan kode pada geometri:
**cocok sempurna, tidak ada yatim di kedua sisi.** Peta langsung mewarnai
dirinya dari status sebenarnya.

### 12.3 Sebelas bentuk kueri diuji terhadap skema hidup

Seluruh kueri baru dijalankan apa adanya ke PostgREST untuk menangkap kesalahan
sintaks yang hanya muncul saat dijalankan — termasuk dua yang paling rawan:
embed yang harus didisambiguasi (`profiles:sales_agent_id(full_name)`) dan
filter `.or(lead_id.eq.…,customer_id.eq.…)` pada riwayat gabungan. **Semua
mengembalikan 200**, tidak ada `400`.

### 12.4 Bug yang tertangkap pada telaah terakhir

- **`keTanggal()` mengembalikan objek `Date` milik pemanggil**, lalu
  `selisihHari()` memanggil `setHours(0,0,0,0)` di atasnya — memutasi data
  pemanggil. Sebuah `Date` yang dipegang komponen lain akan diam-diam bergeser
  ke tengah malam hanya karena tanggalnya pernah diformat. Kini selalu salinan.
- `FokusHariIni` merender `undefined →` untuk kategori notifikasi yang belum
  punya kalimat ajakan. Diberi cadangan.
- Beberapa impor yang tidak terpakai dibersihkan.

### 12.5 Keadaan akhir

- `npm run test:db` — **160/160 lulus**
- `vite build` — bersih
- Seluruh modul yang disentuh diverifikasi ter-*transform* lewat dev server

---

### 12.6 Catatan untuk nanti

Peta memakai `touch-action: none` supaya seluruh gerakan jari menjadi geseran
peta. Konsekuensinya, di ponsel halaman tidak dapat digulir selama jari berada
di atas peta — tingginya sengaja dibatasi 380–520px agar selalu ada ruang di
atas dan bawahnya. Cubit-untuk-memperbesar belum ada; perbesaran di ponsel
lewat tombol + / −.

---

## 13. Alat kerja Admin Marketing

Ditemukan dengan menelusuri satu hari kerja Admin Marketing, bukan dengan
membaca daftar fitur.

### 13.1 Yang ditemukan

| Temuan | Bukti |
|---|---|
| Enam tahap pemberkasan **sudah ada** di `business_settings`, tetapi hanya hidup sebagai dropdown di dalam satu konsumen | `progres_berkas` hanya dipakai di `KprStepper.jsx` dan halaman pengaturan |
| Syarat berkas per bank **belum ada sama sekali**, padahal diminta PRD §1.4 | 9 bank terdaftar, 5 jenis dokumen ditulis mati di satu berkas |
| Dua dari tujuh alasan pembatalan **bisa dicegah** | "Tidak lolos BI-Checking" dan "RPC tidak cukup" — keduanya diketahui sebelum berkas dikirim, tetapi tak ada tempat mencatatnya |
| Tak ada jawaban untuk "akad minggu ini siapa" | `tanggal_akad` hanya ada di dalam KPR per konsumen |

### 13.2 `migration_015_pemberkasan.sql`

- **`bank_doc_requirements`** — syarat dokumen per bank. Baris `bank = '*'`
  adalah bawaan yang berlaku untuk bank yang belum punya daftar sendiri; tanpa
  itu, menambah satu bank berarti mengetik ulang 14 baris. Hak tulisnya
  diberikan kepada Pengawas **dan** Admin Marketing — dialah yang paling tahu
  bank meminta apa, dan dia pula yang menanggung akibatnya bila daftarnya salah.
- **Daftar induk dokumen KPR subsidi** di `business_settings` — 14 jenis yang
  lazim, menggantikan lima yang ditulis mati. Lima nama lama tidak dihapus:
  dokumen yang telanjur diunggah memakai nama itu.
- **BI-Checking & RPC** pada `customer_kpr`, dengan `check` constraint agar
  status yang salah ketik ditolak di database, bukan muncul sebagai status
  hantu di layar.
- **Dua kategori notifikasi baru**: berkas yang sudah di bank tanpa hasil
  BI-Checking, dan angsuran di atas sepertiga penghasilan.

### 13.3 Yang berubah di antarmuka

**Papan Berkas** (`/pemberkasan`) — membalik sudut pandang: yang menjadi objek
bukan konsumen, melainkan berkas. Enam kolom sesuai tahap, kartu memuat
kelengkapan berkas dan ringkasan masalah, pindah tahap satu klik, saring per
bank. Tahap yang tidak dikenal tetap ditampilkan sebagai kolomnya sendiri agar
tidak ada berkas yang lenyap dari papan.

**Tampilan Jadwal** pada halaman yang sama — akad dan serah terima
dikelompokkan Lewat / Tujuh Hari / Mendatang.

**Kejar berkas massal** — pilih beberapa kartu, satu tombol. Percakapan tetap
dibuka satu per satu (WhatsApp memang tidak bisa dikirim borongan, dan pesan
identik menurunkan tingkat balasan); yang dihemat adalah menyusun pesannya —
daftar dokumen yang kurang diisikan otomatis per konsumen, dan setiap yang
dihubungi tercatat sendiri di riwayatnya.

**Checklist berkas dinamis** pada kartu konsumen, mengikuti bank yang dipilih.
Pilihan jenis dokumen saat mengunggah langsung menunjuk ke yang paling
dibutuhkan: wajib tetapi belum ada. Dokumen di luar daftar syarat tetap
ditampilkan — bank kadang meminta tambahan mendadak.

**Tahap "Saringan Awal"** pada Progres KPR, sebelum tahap Bank: hasil
BI-Checking, penghasilan terverifikasi, dan perkiraan angsuran. Peringatannya
adalah satu-satunya di layar itu yang masih bisa **dicegah**; sisanya
melaporkan keadaan yang sudah terjadi.

**Tombol prospek kilat** di header — tiga bidang, "Simpan & tambah lagi" untuk
pameran, dan tetap terlihat di ponsel.

### 13.4 Uji

**172/172 lulus**, 12 baru. Satu di antaranya sempat gagal dan ternyata **uji
saya yang keliru**, bukan migrasinya: konsumen ujinya sudah punya SP3K terbit
dari bagian sebelumnya, sehingga peringatan BI-Checking memang berhenti berlaku
— dan dua asersi "tidak diperingatkan" di dekatnya lolos secara hampa.
Keadaannya kini dikembalikan lebih dulu agar ketiganya benar-benar menguji
sesuatu.

### 13.5 Yang perlu Anda lakukan

**Jalankan `migration_015_pemberkasan.sql`.** Sampai itu dilakukan: Papan
Berkas tetap tampil (kolomnya dari `progres_berkas` yang sudah ada) tetapi tanpa
kelengkapan berkas, checklist konsumen menampilkan pesan yang menyebut nama
berkas migrasinya, dan tahap Saringan Awal gagal menyimpan.

**Periksa daftar dokumennya.** 14 jenis itu daftar umum KPR subsidi dari saya —
Anda yang tahu apa yang sebenarnya diminta BTN Brebes, BRI Tegal, dan
seterusnya. Semuanya dapat diubah dari Pengaturan Bisnis tanpa deploy.

---

## 14. Operasi per baris pada daftar Prospek

### 14.1 Masalah pada layar itu

| | |
|---|---|
| **60 tombol** | Empat aksi × lima belas baris. Mata berhenti bisa menemukan aksi utama |
| **"Hapus" sebobot "Ubah"** | Tindakan permanen, di setiap baris, tanpa hierarki apa pun |
| **Baris tidak bisa diklik** | Hal yang paling wajar dilakukan pengguna justru tidak melakukan apa-apa |
| **Dua operasi tidak ada di mana pun** | Membatalkan prospek beserta alasannya, dan mengalihkannya ke agen lain |

### 14.2 Dua temuan dari kode

**Tujuh alasan pembatalan hanya terpakai untuk konsumen.** Tabel
`cancellations` menuntut `customer_id`, sehingga prospek yang mati sebelum
booking hanya berubah status menjadi `cancel` — tanpa sebab. Pertanyaan yang
paling berguna bagi manajemen, *"kenapa kita kehilangan orang, dan di tahap
mana"*, karena itu tidak terjawab.

**`leads.assigned_to` hanya pernah diisi saat baris dibuat.** Tidak ada satu
pun jalur untuk memindahkannya. Ketika seorang Sales berhenti, prospeknya
terkunci padanya — dan karena RLS menyaring dengan kolom yang sama, prospek itu
praktis lenyap dari pandangan semua orang.

### 14.3 Keputusan: panel geser, bukan halaman

Konsumen memakai halaman penuh (`/konsumen/:id`); prospek memakai panel geser.
Perbedaannya bukan selera melainkan sifat pekerjaannya:

- **Prospek** — rentetan cepat lintas banyak baris ("telepon dua belas orang").
  Pindah halaman memaksa bolak-balik dan membuang posisi gulir serta saringan.
  Panel membiarkan daftarnya tetap terlihat di belakang.
- **Konsumen** — pekerjaan mendalam pada satu catatan, berhari-hari, dan sering
  perlu dikirimkan ke rekan kerja. Itu menuntut URL sendiri.

### 14.4 `migration_016_pembatalan_prospek.sql`

- `cancellations` menerima `lead_id`, `customer_id` menjadi nullable, dengan
  `check (num_nonnulls(lead_id, customer_id) = 1)`. **Satu tabel untuk kedua
  tahap** — corong kehilangan mustahil disusun bila separuh datanya di tempat
  lain. Kolom `tahap_saat_batal` menyalin tahap funnel saat itu agar tetap
  terbaca meski tahapnya berubah kemudian.
- Policy `cancellations_select`/`insert` mendapat cabang `owns_lead`. Tanpa itu
  `owns_customer(NULL)` selalu salah, dan Sales tidak bisa melihat pembatalan
  yang ia catat sendiri.
- `cancel_lead()` — **SECURITY INVOKER**. RLS yang menahan, tanpa satu pun
  pemeriksaan peran di dalam fungsi.
- `transfer_lead()` — **SECURITY DEFINER**, dan alasannya halus: policy `leads`
  menyaring dengan `assigned_to`, sedangkan pada UPDATE Postgres memeriksa
  `WITH CHECK` terhadap baris **baru**. Seorang Sales karena itu tidak akan
  pernah bisa menyerahkan prospeknya sendiri — padahal itu tindakan yang wajar.

### 14.5 Antarmuka

- **Klik baris → panel.** Kepala menempel (identitas, kontak, tahap), jadwal
  follow-up naik ke atas sebagai satu-satunya hal yang menuntut tindakan hari
  ini, lalu aksi berjenjang, rincian, dan riwayat.
- **Kolom aksi: satu tombol + `⋯`.** Enam puluh tombol menjadi lima belas
  tombol dan lima belas pemicu menu. "Hapus permanen" turun ke dasar menu,
  dipisah garis, merah — dan peringatannya kini menunjuk ke jalan yang benar:
  *untuk menutup prospek tanpa kehilangan jejaknya, pakai Batalkan Prospek.*
- **`Drawer` dan `MenuAksi`** ditambahkan ke `ui.jsx`; perangkap fokus
  diekstrak menjadi `usePerangkapFokus` yang dipakai bersama `Modal`. Menu
  membuka ke atas bila baris berada di dekat tepi bawah layar.

### 14.6 Uji

**187/187 lulus**, 15 baru. Tiga sempat gagal, dan **dua di antaranya uji saya
yang keliru** — keduanya karena lupa bahwa RLS juga berlaku pada `SELECT`
pemeriksa:

1. Prospek milik agen lain bukan "ditolak" melainkan **tidak terlihat**, jadi
   `cancel_lead` berhenti di "tidak ditemukan", bukan "tidak berhak". Pesannya
   diperbaiki menjadi *"Prospek tidak ditemukan atau bukan milik Anda"* — dari
   sisi pemanggil kedua keadaan itu memang tak terbedakan, dan menyebut hanya
   salah satunya menyesatkan.
2. Setelah pengalihan berhasil, pemilik lama **tidak bisa lagi membaca barisnya**
   — asersinya membaca `NULL` dan dikira gagal. Pemeriksaannya dipindahkan ke
   peran yang boleh melihat lintas agen.

### 14.7 Yang perlu Anda lakukan

**Jalankan `migration_016_pembatalan_prospek.sql`.** Sebelum itu: panel, menu,
dan klik baris sudah berfungsi, tetapi Batalkan Prospek dan Alihkan Agen akan
menampilkan galat dari database. Sudah diperiksa langsung ke Supabase Anda —
kedua RPC-nya memang belum ada di sana.
