# BRIEF ZAFIRA PROPERTY

Permintaan perubahan dari rapat revisi, disalin apa adanya dari
`BRIEF_ZAFIRA_PROPERTY.docx`, beserta catatan bagaimana masing-masing
diterjemahkan menjadi perubahan di kode.

Implementasinya ada pada `supabase/migration_017_brief_revisi.sql` dan
perubahan frontend yang menyertainya. Diujikan di
`supabase/tests/10_brief_revisi.sql`.

---

## DASHBOARD

> - Dibuatkan lebih ringkas lagi untuk tampilan mis. Bagian Item di minimize
>   lagi atau yang lain
> - Untuk bagian filter prosedur nya berapa, Lalu bookingnya berapa dll yang
>   berada di dashboard
> - Filter data real time: menginginkan filter yang lebih spesifik berdasarkan
>   bulan berjalan (mis. beberapa prospect bulan ini, berapa booking, berapa
>   akad)

**Yang dikerjakan.** Periode bawaan berubah menjadi **Bulan ini** — itulah
pertanyaan yang ditanyakan setiap pagi, dan "Semua" bukan. Di bawah deretan
kartu utama ada satu strip hitungan per prosedur (prospek baru, follow up,
survei, BI-Checking, booking, masuk bank, SP3K, akad, serah terima, batal),
dihitung `dashboard_stats().periode`.

Hitungannya diambil dari **tanggal peristiwanya**, bukan tanggal prospek
dibuat. Akad bulan ini nyaris tidak pernah berasal dari prospek bulan ini, dan
menghitungnya lewat `created_at` akan membuat kolom Akad hampir selalu nol.

Seluruh laporan sekunder — funnel, durasi tahap, rekap berkas, tabel per agen —
kini dapat dilipat, dengan ringkasannya tetap terbaca pada judul. Yang tidak
pernah dilipat adalah pekerjaan hari ini dan angka periode: menyembunyikannya
berarti dashboard hanya berguna bagi orang yang sudah tahu harus menekan apa.

## LEADS

> - Pemisahan menu Input: Meminta pemisahan menu input antara "Leads" murni
>   dari menu "Follow Up Leads"

**Yang dikerjakan.** `/prospek` menjadi murni pemasukan dan daftar; menu baru
`/follow-up` berisi antreannya. Keduanya dua bentuk pekerjaan yang berbeda —
yang satu mengetik data baru satu orang satu kali, yang lain menyisir puluhan
orang beberapa detik masing-masing — dan satu halaman yang melayani keduanya
akan selalu salah untuk salah satunya.

> - Sumber Leads: Memisahkan opsi sumber leads menjadi: Ads, Freelance,
>   Kemitraan, dan Organik
> - Khusus Organik, Wajib ada kolom isian tambahan untuk keterangan Detail
>   (mis. nama event apa)

**Yang dikerjakan.** `leads.source_type` kini empat nilai, dijaga CHECK
constraint. Kolom `organik_detail` wajib saat sumbernya Organik — dijaga di
formulir dan di database. Baris lama yang memakai mitra bertipe kemitraan
dipindahkan otomatis oleh migrasi.

Aturannya berlaku untuk **seluruh** baris, bukan hanya yang baru. Migrasi
merapikan data lama lebih dulu — keterangan organik diambil dari kategorinya,
lalu label sumber lama, dan baris yang memang tidak pernah punya keterangan
ditandai `(tidak tercatat)`: sebuah penanda yang bisa dicari dan dibereskan,
bukan keterangan karangan yang akan dikira sungguhan. Sumber di luar keempat
pilihan dikosongkan, bukan ditebak. Setelah itu kedua CHECK divalidasi.
Sebuah CHECK yang dibiarkan `NOT VALID` selamanya adalah aturan yang hanya
setengah berlaku: baris lama tetap melanggarnya diam-diam, dan tidak ada satu
pun layar yang akan memberi tahu siapa pun.

> - Otomatisasi Status Leads: Saat input leads baru, status default harus
>   langsung masuk ke "Warm" secara otomatis oleh sistem, bukan dipilih manual
>   oleh sales
> - Sistem harus bisa membaca progres interaksi untuk menentukan apakah Leads
>   tersebut masuk kategori (Hot, Cold, atau tetap Warm) — agar mengurangi
>   human error dalam kategorisasi
> - Log Komunikasi: Fitur riwayat komunikasi/log chat harus terintegrasi dengan
>   perubahan status (mis. tertulis "kurang minat" sistem otomatis mengubah
>   status menjadi "Cold")

**Yang dikerjakan.** Tidak ada satu pun kontrol pengubah suhu yang tersisa di
antarmuka. Prospek baru masuk sebagai Warm lewat trigger, dan sesudah itu
`lead_temperature()` membacanya dengan urutan prioritas berikut:

1. **BI-Checking tidak lolos → Cold.** Satu-satunya fakta yang mengalahkan
   segalanya: pengajuannya memang tidak bisa diteruskan, seantusias apa pun
   orangnya.
2. **Kata-kata pada follow-up TERAKHIR.** Pola penolakan diperiksa lebih dulu,
   karena "tidak tertarik" memuat kata "tertarik".
3. **Kemandekan.** Didiamkan lebih dari dua minggu → Cold.
4. **Saringan awal.** Sudah disurvei atau lolos BI-Checking → Hot.
5. **Bentuk interaksinya.** Direspons berulang kali → Hot.

Urutan 2 di atas 4 itu penting, dan sempat terbalik. Ketika survei
didahulukan, prospek yang sudah disurvei lalu berkata "kurang minat" tetap
ditandai **Hot** — persis kebalikan dari aturan yang brief tuliskan sebagai
contohnya sendiri. Survei adalah sesuatu yang terjadi kemarin; catatan
terakhir adalah keadaan hari ini, dan suhu dimaksudkan untuk menjawab yang
kedua.

Kemandekan juga berlaku bagi yang sudah disurvei. Prospek yang hilang setelah
disurvei adalah kehilangan yang paling mahal — menahannya di Hot hanya membuat
ia tidak pernah muncul di daftar yang perlu dikejar.

Trigger pada `lead_activities` menerapkannya setiap kali catatan ditulis.
Aturan yang bergantung pada waktu berjalan tidak punya peristiwa pemicu, jadi
halaman Follow Up memanggil `refresh_lead_temperature()` saat dibuka — sebuah
`SECURITY DEFINER`, karena sebagai `INVOKER` ia akan diam-diam tidak melakukan
apa pun bagi Admin Marketing, yang bukan pemilik prospek mana pun.

Tahap Booking ke atas dan Cancel tidak pernah disentuh: keduanya ditulis
trigger lain dari kuitansi dan tanggal KPR, atau merupakan keputusan manusia
yang punya alasan tercatat.

> - Perbaikan untuk bagian Booking Fee masih menginput satu persatu (misalnya
>   ingin menginput Rp 7.000.000 tetapi harus satu persatu menginputnya seperti
>   angka 7 > 70 > 700 > 7.000.000)

**Yang dikerjakan.** `InputRupiah` menerima singkatan (`7jt`, `350rb`,
`1,5jt`), menawarkan nominal yang berulang setiap hari sebagai pilihan cepat,
dan menuliskan terbilang di bawah kotaknya. Yang terakhir itulah yang
sebenarnya menangkap kesalahan nol: "7.000.000" dan "70.000.000" nyaris sama
dilihat sekilas, "tujuh juta" dan "tujuh puluh juta" tidak mungkin tertukar.

> - Tambahkan Section Upload Bukti Pembayaran
> - Tambahkan Fase Menunggu verifikasi sebelum di Konfirmasi oleh finance (jika
>   ada pembayaran apapun termasuk Booking misalnya kwitansi harus masuk ke
>   tahap verifikasi ke Finance untuk memvalidasi)

**Yang dikerjakan.** `payment_status` mendapat nilai ketiga,
`menunggu_verifikasi`, dan `payments` mendapat `bukti_transfer_url`. Dua berkas
dengan dua pemilik, dan urutannya tidak bisa dibalik:

| berkas | pengunggah | akibat |
| --- | --- | --- |
| bukti transfer | Admin Marketing / Sales | pembayaran masuk antrean Finance |
| kuitansi resmi | Finance | pembayaran ditutup, Handover Hard-Lock menyala |

Trigger `guard_payment_verification()` hanya mengizinkan perpindahan
`menunggu → menunggu_verifikasi` bila buktinya ikut dalam baris yang sama, dan
menolak selain Finance menyentuh `proof_url`, `verified_by`, atau status
`terverifikasi`.

## KONSUMEN

### Progres KPR — saringan awal

> Saringan Awal itu sebelum BI Checking itu sebelum booking. Tahapan awalnya
> (leads > Follow up {jika berminat} > survei {melampirkan foto survei, Tanggal
> Survei} > BI checking > melampirkan hasil BI checking > Booking) dimasukkan
> di area konsumen

**Yang dikerjakan.** Urutan stepper berubah dari
`Booking → DP → Saringan Awal → Bank` menjadi
`Survei → Saringan Awal → Booking → DP → Bank → SP3K → Akad → Serah Terima →
BPHTB → SHM`.

Supaya benar-benar *sebelum* booking, kolom survei dan BI-Checking ditambahkan
pada `leads` juga, dan diisi dari halaman Follow Up. Konversi menyalinnya ke
`customer_kpr` dan **memindahkan** lampirannya — bukan menyalin, karena dua
baris untuk satu berkas berarti dua kebenaran yang bisa menyimpang.

Konversi ditolak bila BI-Checking tidak lolos. Saringan yang bisa dilangkahi
bukan saringan: booking yang diterima setelah BI-Checking gagal adalah booking
yang sudah pasti batal, dan uangnya sudah telanjur berpindah tangan.

> - Hasil BI Checking, Tanggal Pemeriksaan, Catatan ✓
> - Penghasilan Terverifikasi/Bulan (gaji); Dipindahkan ke data konsumen bagian
>   data diri
> - Perkiraan Angsuran/Bulan (Belum diperlukan)
> - Bagian Catatan kalau tidak bisa di kosongkan di strip ( - )

**Yang dikerjakan.** Penghasilan pindah ke `customers.penghasilan` dan tampil
di Ringkasan → Data Diri; sebuah trigger menyalinnya kembali ke
`customer_kpr.penghasilan_verifikasi` supaya peringatan rasio RPC tetap hidup.
Perkiraan angsuran keluar dari antarmuka (kolomnya tetap ada agar berkas
berjalan tidak kehilangan penyebut rasionya). Catatan yang kosong ditulis `-`.

### Booking, DP

> - Booking: Tambahkan lampiran kwitansi per konsumen & Bukti Transfer
> - DP: Tambahkan akumulasi otomatis dari Nominal DP + Biaya Tanah untuk di
>   Total DP (Promo + Tanah)
> - Pada DP terbayar tambahkan opsi Tambahkan/Upload Bukti transfer
> - Tambahkan send Verifikation Instruction, ketika admin marketing menginput
>   bukti transfer pembayaran konsumen "statusnya menunggu verifikasi
>   pembayaran dari keuangannya"

**Yang dikerjakan.** Tahap Booking dan DP masing-masing menampilkan
pembayarannya sendiri beserta jalur verifikasinya — kuitansi, bukti transfer,
dan statusnya — karena sebuah kuitansi melekat pada pembayaran, bukan pada
tahap. Total DP dihitung trigger `kpr_hitung_total_dp()`; nilai yang diketik
tangan diabaikan, sehingga total tidak pernah bisa berbeda dari penyusunnya.

### Bank

> - Attach Dokumen di samping progress KPR di pindahkan ke dalam Section Bank
> - Tambahkan list dokumen yang perlu di upload & penomoran … dokumen yang
>   belum di upload itu berada di atas section dokumen yang sudah kita upload …
>   terletak di bawahnya nama bank, dan juga berikan "Notifikasi" jika belum
>   mengupload berkas yang kurang
> - Setelah Proses Dokumen sudah lengkap Tambahkan pilihan Klik proses bank

**Yang dikerjakan.** Tab "Dokumen" dihapus; isinya pindah ke dalam tahap Bank,
di bawah nama banknya. Daftarnya bernomor mengikuti nomor syarat aslinya —
bukan urutan tampilan, supaya nomor yang disebut di telepon dengan pihak bank
tidak berubah tergantung berapa yang sudah diunggah — dan yang belum ada
diletakkan di atas yang sudah ada.

Tombol **Proses Bank** memanggil `tandai_proses_bank()`, yang memeriksa ulang
kelengkapannya di database dan menyebutkan dokumen mana yang kurang bila
menolak. Kekurangan berkas juga muncul di lonceng lewat `my_notifications()`.

### SP3K, Akad, Serah Terima, BPHTB, SHM

> - SP3K: Tambahkan atthatch dokumen untuk menginput dokumen per section
>   (Tanggal SP3K terbit & Tanggal SP3K Perpanjangan)
> - AKAD: Tanggal akad disertai dokumentasi akad
> - Serah Terima: Tambahkan Berita Acara Serah terima, Tambahkan input Dokumen
>   pdf
> - BPHTB: Tambahkan Opsi (Lolos/tidak lolos), Tambahkan Atthatch Dokumen
> - SHM: Opsi (Sudah Balik nama/Belum Balik nama), Tambahkan Input dokumen

**Yang dikerjakan.** Tabel `berkas_lampiran` menampung delapan jenis lampiran
tahap, ditandai `slot`. Satu tabel, bukan delapan kolom URL: sebuah tahap sering
butuh lebih dari satu berkas — foto survei jarang hanya satu — dan kolom tunggal
memaksa berkas kedua menimpa yang pertama tanpa jejak. SP3K terbit dan SP3K
perpanjangan mendapat slot terpisah, karena keduanya surat yang berbeda.

Kuitansi dan bukti transfer sengaja **tidak** ada di sini. Keduanya sempat
dibuatkan slot, dan itu keliru: sebuah kuitansi melekat pada sebuah pembayaran,
bukan pada sebuah tahap. Satu konsumen bisa punya beberapa setoran DP, dan slot
per tahap membuat buktinya menumpuk tanpa cara mengetahui mana milik setoran
mana — persis pertanyaan yang harus dijawab Finance saat memverifikasi. Jadi
keduanya tinggal di `payments.bukti_transfer_url` dan `payments.proof_url`.

`bphtb_status` dan `shm_balik_nama` ditambahkan beserta CHECK constraint-nya.

### Konsumen berasal dari leads

> Setiap section itu diambil dari section sebelumnya jadi dikatakan konsumen
> jika sudah booking maka akan masuk ke dalam konsumen … Untuk konsumen sendiri
> kalau bisa itu diambil dari leads yang sudah ada

**Yang dikerjakan.** Sudah berlaku sejak `migration_013` lewat
`convert_lead_to_customer()`: booking adalah satu peristiwa yang membuat
konsumen dari prospek, me-*reserve* unit, mencatat booking fee ke antrean
Finance, dan membuka baris KPR — semuanya atomik. Migrasi 017 menambahkan
bahwa saringan awal dan lampirannya ikut terbawa, dan penghasilan prospek
mengisi data diri konsumen.
