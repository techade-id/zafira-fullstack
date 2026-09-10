# Product Requirement Document (PRD)
# Sistem CRM Zafira Property

**Status:** Final  
**Dokumen:** Product Requirement Document  
**Produk:** CRM Zafira Property  
**Tujuan:** Digitalisasi dan integrasi proses penjualan, administrasi, keuangan, dan aftersales properti.

---

## 1. Executive Summary & Objective

Pengembangan **Sistem CRM Zafira Property** merupakan inisiatif strategis untuk mentransformasi manajemen operasional dari metode konvensional berbasis papan tulis menjadi infrastruktur digital yang terintegrasi.

Visi utama proyek ini adalah menciptakan sentralisasi data yang akurat guna meningkatkan efisiensi kerja dan memitigasi risiko **human error** dalam seluruh siklus penjualan properti.

### 1.1 Tujuan Utama

#### 1. Sentralisasi & Integritas Data
Mengonversi data manual menjadi bank data digital yang mendukung pencatatan profil konsumen secara mendalam dan terstruktur.

#### 2. Digitalisasi Alur Kerja Penjualan
Mengotomatisasi proses kualifikasi prospek dari tahap **Warm Lead** hingga **Aftersales**, dengan validasi sistem yang ketat.

#### 3. Transparansi & Akuntabilitas Keuangan
Mengintegrasikan bukti pembayaran dengan sistem kuitansi digital untuk memastikan setiap transaksi tervalidasi oleh tim Finance.

#### 4. Optimalisasi Manajemen Dokumen
Menyediakan sistem filing dokumen KPR yang adaptif terhadap persyaratan spesifik dari berbagai bank mitra.

#### 5. Monitoring Performa Real-Time
Memberikan visibilitas kepada manajemen terhadap progres setiap unit dan performa tim melalui **audit trail** dan **timestamp tracking**.

> Dokumen ini menjadi acuan teknis final bagi tim pengembang dan seluruh pemangku kepentingan. Keberhasilan sistem bertumpu pada antarmuka yang intuitif, alur kerja yang jelas, serta keamanan akses data.

---

# 2. Brand Identity & UI Design Guidelines

Sistem internal harus mencerminkan profesionalisme Zafira Property melalui konsistensi visual yang selaras dengan identitas korporat.

Desain harus mengutamakan **kejelasan data, kemudahan operasional, dan efisiensi kerja** tanpa mengabaikan estetika brand.

## 2.1 Spesifikasi Visual

| Elemen | Spesifikasi | Keterangan |
|---|---|---|
| Primary Color | Navy | Navigasi, header, dan elemen struktural |
| Accent Color | Deep Orange | CTA, progres aktif, dan penekanan visual |
| Status Indicator | Deep Orange | Indikator `Urgent` atau `Due Date` |
| Base Tone | Navy / Deep Orange | Menggantikan skema hijau lama dengan palet warna logo Zafira |

## 2.2 Core UI Requirements

### Advanced Search / Find

Sistem harus menyediakan fitur pencarian pada kolom **Notes**.

Ketentuan:

- Mendukung **Partial String Match**.
- Pengguna dapat mencari kata kunci di tengah riwayat interaksi.
- Pencarian tetap optimal ketika jumlah data mencapai puluhan ribu entri.

### Unicode / Emoji Support

Field berikut wajib mendukung **UTF-8 / Unicode**:

- Nama
- Username
- Username sosial media

Hal ini diperlukan karena username pelanggan dapat mengandung emoji atau karakter Unicode lainnya.

---

# 3. User Roles & Access Control Matrix

Sistem menggunakan prinsip **Least Privilege**, yaitu setiap pengguna hanya mendapatkan akses yang diperlukan sesuai tanggung jawabnya.

## 3.1 Role & Access

| Role | Personel | Deskripsi Akses & Fungsi |
|---|---:|---|
| Sales / Agen | 3 orang | Input prospek, update progres survei, hingga input booking |
| Admin Marketing | 1 orang | Manajemen berkas KPR, pemilihan bank, SP3K hingga Akad |
| Finance | 1 orang | Verifikasi transfer, upload kuitansi resmi, dan manajemen piutang DP/Talangan |
| Supervisor Marketing | 1 orang | Read-only monitoring performa seluruh tim |
| Pengawas | 1 orang | Read-only audit, laporan analitik, dan log aktivitas sistem |

## 3.2 Workflow Logic & Security

### Handover Hard-Lock

Setelah tim **Finance mengunggah kuitansi Booking Fee**, sistem harus:

1. Mengunci akses edit profil konsumen untuk Sales.
2. Mengubah status tanggung jawab data.
3. Mengalihkan proses administrasi kepada Admin Marketing.
4. Memastikan Sales hanya dapat melihat data yang diperlukan.

Tujuan:

> Menjaga integritas data dan dokumen perbankan setelah proses booking tervalidasi.

---

# 4. End-to-End Sales Pipeline — Pre-Booking Stage

Proses prospek dilakukan melalui kualifikasi bertahap dari **Warm Lead** hingga validasi **Booking**.

---

## 4.1 Input Leads & Data Source Integration

### Minimalist Lead Input

Field minimal:

- Nama / Username
- No. Telepon
- Sumber Leads

### Relational Lead Source

#### Ads

Data harus terhubung secara relasional dengan tabel:

`Ads Campaign`

Tabel tersebut dikelola oleh tim digital.

#### Freelance / Kemitraan

Data sumber berasal dari database mitra atau agen yang telah terdaftar pada pengaturan bisnis.

#### Organik

Input manual untuk kategori:

- OTS
- Event
- Brosur

---

## 4.2 Progres & Kualifikasi Logis

### Follow-up Tracking

Sistem harus menyediakan pencatatan komunikasi secara kronologis.

Setiap aktivitas minimal mencatat:

- Tanggal / waktu
- User yang melakukan aktivitas
- Catatan komunikasi
- Hasil follow-up

### Lead Status Automation

Status lead dapat berubah berdasarkan aktivitas:

```text
New Lead
   ↓
Warm Lead
   ↓
Hot Lead
   ↓
Booking
   ↓
KPR
   ↓
Akad
   ↓
Aftersales