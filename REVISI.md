# Notula dan Rekapitulasi Hasil Rapat
# Penyesuaian CRM Zafira Property

**Sistem:** CRM Zafira Property  
**Dokumen:** Notula & Rekapitulasi Hasil Rapat  
**Status:** Final  
**Tujuan:** Menjadi acuan penyesuaian dan pengembangan sistem CRM Zafira Property.

---

## 1. Metadata dan Identitas Visual Sistem

Penyelarasan identitas brand ke dalam antarmuka sistem CRM merupakan parameter fundamental untuk menciptakan pengalaman pengguna (*user experience*) yang kohesif.

Sebagai instrumen operasional harian, sistem harus merepresentasikan profesionalisme korporasi guna memastikan kesatuan visi antara staf internal dengan nilai-nilai Zafira Property.

### 1.1 Identitas Sistem

- **Nama sistem:** Zafira Property
- **SSID:** Zafira Property
- **Header sistem:** Zafira Property

### 1.2 Skema Warna UI

Konfigurasi warna antarmuka wajib mengadopsi palet korporat:

- **Primary:** Navy
- **Accent:** Deep Orange

Skema warna hijau yang saat ini digunakan harus digantikan secara menyeluruh dengan palet **Navy dan Deep Orange**.

### 1.3 Optimalisasi Navigasi

Fitur **Search / Find** pada modul **Notes (Catatan)** wajib diaktifkan.

Fitur tersebut digunakan untuk memudahkan pengguna dalam menelusuri riwayat komunikasi yang panjang.

Pencarian harus mendukung:

- Partial string match
- Pencarian kata di tengah catatan
- Pencarian berdasarkan riwayat komunikasi
- Pencarian pada data Notes yang telah tersimpan

### Analisis Signifikansi

Penerapan skema warna yang konsisten serta fungsionalitas pencarian pada catatan akan meningkatkan efisiensi navigasi secara signifikan.

Integrasi fitur **Find** memungkinkan tim menemukan data komunikasi spesifik tanpa harus melakukan penelusuran manual, sehingga:

- Mengurangi *man-hours*.
- Mempercepat proses pencarian informasi.
- Meningkatkan produktivitas operasional.
- Mempermudah tracking riwayat komunikasi konsumen.

> **Transisi:** Konsistensi visual menjadi fondasi bagi struktur hak akses pengguna yang akan mengoperasikan sistem secara hierarkis.

---

# 2. Matriks Peran Pengguna dan Otoritas Akses

Untuk menjamin integritas data dan menegakkan prinsip **Segregation of Duties**, sistem CRM akan menerapkan pembatasan otoritas akses yang ketat.

Arsitektur ini dirancang untuk memisahkan fungsi:

- Operasional lapangan.
- Administrasi dokumen.
- Pengawasan finansial.
- Monitoring.
- Audit sistem.

## 2.1 User Roles

| Peran Pengguna | Personel | Matriks Otoritas dan Tanggung Jawab |
|---|---:|---|
| **Sales** | 3 Orang | Input prospek awal, pengelolaan leads, pengumpulan profil konsumen, hingga tahap Booking Fee |
| **Admin Marketing** | 1 Orang | Manajemen pemberkasan KPR, koordinasi perbankan, dan pemenuhan dokumen legalitas pasca-penjualan |
| **Finance** | 1 Orang | Verifikasi pembayaran melalui unggahan kuitansi, manajemen cicilan DP, dan validasi dana talangan |
| **Supervisor Marketing** | 1 Orang | Monitoring menyeluruh secara read-only terhadap performa tim dan riwayat data tanpa izin intervensi operasional |
| **Pengawas** | 1 Orang | Audit sistem, kontrol integritas data, dan manajemen konfigurasi bisnis |

## 2.2 Prinsip Segregation of Duties

Pembagian tanggung jawab harus memastikan bahwa satu pengguna tidak memiliki kontrol penuh terhadap seluruh siklus transaksi.

Contoh pemisahan:

```text
Sales
  ↓
Input & Kelola Lead
  ↓
Booking
  ↓
Finance
  ↓
Verifikasi Pembayaran
  ↓
Admin Marketing
  ↓
KPR & Administrasi
  ↓
Akad
  ↓
Aftersales