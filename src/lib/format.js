/**
 * Format dan kamus istilah terpusat.
 *
 * Sebelum berkas ini, nilai enum mentah bocor ke antarmuka: pengguna membaca
 * "dana_talangan", "menunggu", dan "aftersales" apa adanya, sementara nominal
 * tampil sebagai 45000000 tanpa pemisah. Menyebar perbaikannya ke tiap halaman
 * berarti empat belas tempat yang lambat laun akan berbeda satu sama lain.
 */

/* ============================================================
   Uang
   ============================================================ */

/** 45000000 → "Rp45.000.000". Nilai kosong menjadi "-", bukan "Rp0". */
export function rupiah(n, { kosong = "-" } = {}) {
  if (n === null || n === undefined || n === "") return kosong;
  const angka = Number(n);
  if (!Number.isFinite(angka)) return kosong;
  return `Rp${angka.toLocaleString("id-ID")}`;
}

/**
 * Bentuk ringkas untuk kartu statistik dan grafik, tempat angka penuh
 * memaksa pembungkusan baris: 45000000 → "Rp45 jt".
 */
export function rupiahSingkat(n, { kosong = "-" } = {}) {
  if (n === null || n === undefined || n === "") return kosong;
  const angka = Number(n);
  if (!Number.isFinite(angka)) return kosong;
  const abs = Math.abs(angka);
  if (abs >= 1e12) return `Rp${bulat(angka / 1e12)} t`;
  if (abs >= 1e9) return `Rp${bulat(angka / 1e9)} m`;
  if (abs >= 1e6) return `Rp${bulat(angka / 1e6)} jt`;
  if (abs >= 1e3) return `Rp${bulat(angka / 1e3)} rb`;
  return `Rp${angka.toLocaleString("id-ID")}`;
}

function bulat(v) {
  return (Math.round(v * 10) / 10).toLocaleString("id-ID");
}

/** "45.000.000" → 45000000. Untuk input Rupiah berformat. */
export function angkaDariRupiah(teks) {
  const bersih = String(teks ?? "").replace(/[^\d]/g, "");
  return bersih === "" ? "" : Number(bersih);
}

/**
 * Singkatan nominal: "7jt" → 7000000, "350rb" → 350000, "1,5jt" → 1500000.
 *
 * BRIEF §Leads mengeluhkan booking fee yang "harus diinput satu per satu:
 * 7 → 70 → 700 → 7.000.000". Keluhannya bukan soal pemisah ribuan — itu sudah
 * ada — melainkan soal tujuh ketukan untuk sebuah angka yang di kepala orang
 * berbunyi "tujuh juta". Satuan yang dipakai sehari-hari diterima apa adanya,
 * jadi yang diketik sama dengan yang diucapkan.
 *
 * Mengembalikan null bila teksnya bukan singkatan, supaya pemanggil tahu
 * kapan harus jatuh kembali ke pembacaan digit biasa.
 */
export function angkaDariSingkatan(teks) {
  const t = String(teks ?? "").trim().toLowerCase().replace(/\s+/g, "");
  const m = t.match(/^(\d+(?:[.,]\d+)?)(k|rb|ribu|jt|juta|m|milyar|miliar)$/);
  if (!m) return null;
  // Satu titik/koma di dalam singkatan selalu berarti desimal ("1,5jt"):
  // pemisah ribuan tidak pernah dipakai bersama satuan.
  const angka = Number(m[1].replace(",", "."));
  if (!Number.isFinite(angka)) return null;
  const pengali = { k: 1e3, rb: 1e3, ribu: 1e3, jt: 1e6, juta: 1e6, m: 1e9, milyar: 1e9, miliar: 1e9 }[m[2]];
  return Math.round(angka * pengali);
}

const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

/**
 * 7000000 → "tujuh juta rupiah".
 *
 * Dipakai sebagai konfirmasi di bawah kotak isian nominal. Satu nol yang
 * terlewat pada booking fee adalah kesalahan yang mahal, dan pemisah ribuan
 * saja tidak cukup untuk menangkapnya — "7.000.000" dan "70.000.000" terlihat
 * nyaris sama pada pandangan sekilas, sementara "tujuh juta" dan "tujuh puluh
 * juta" tidak mungkin tertukar.
 */
export function terbilang(n) {
  const angka = Math.floor(Math.abs(Number(n)));
  if (!Number.isFinite(angka)) return "";
  if (angka === 0) return "nol rupiah";
  return `${susun(angka).replace(/\s+/g, " ").trim()} rupiah`;
}

function susun(n) {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${susun(n - 10)} belas`;
  if (n < 100) return `${susun(Math.floor(n / 10))} puluh ${susun(n % 10)}`;
  if (n < 200) return `seratus ${susun(n - 100)}`;
  if (n < 1000) return `${susun(Math.floor(n / 100))} ratus ${susun(n % 100)}`;
  if (n < 2000) return `seribu ${susun(n - 1000)}`;
  if (n < 1e6) return `${susun(Math.floor(n / 1000))} ribu ${susun(n % 1000)}`;
  if (n < 1e9) return `${susun(Math.floor(n / 1e6))} juta ${susun(n % 1e6)}`;
  if (n < 1e12) return `${susun(Math.floor(n / 1e9))} miliar ${susun(n % 1e9)}`;
  return `${susun(Math.floor(n / 1e12))} triliun ${susun(n % 1e12)}`;
}

/** 45000000 → "45.000.000" — tanpa awalan Rp, untuk isi kotak input. */
export function rupiahInput(n) {
  if (n === null || n === undefined || n === "") return "";
  const angka = Number(String(n).replace(/[^\d]/g, ""));
  if (!Number.isFinite(angka)) return "";
  return angka.toLocaleString("id-ID");
}

/* ============================================================
   Tanggal
   ============================================================ */

/**
 * Tanggal-saja ("2026-01-12") sengaja diurai sebagai waktu lokal.
 * `new Date("2026-01-12")` diurai sebagai UTC, yang di WIB menggeser
 * tampilannya mundur satu hari.
 */
function keTanggal(nilai) {
  if (!nilai) return null;
  // Selalu salinan baru. `selisihHari` memanggil setHours() pada hasilnya, dan
  // mengembalikan instans milik pemanggil berarti memutasi datanya sendiri —
  // sebuah Date yang dipegang komponen lain akan diam-diam bergeser ke tengah
  // malam hanya karena tanggalnya pernah diformat.
  if (nilai instanceof Date) return new Date(nilai.getTime());
  const teks = String(nilai);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(teks) ? new Date(`${teks}T00:00:00`) : new Date(teks);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2026-01-12" → "12 Jan 2026" */
export function tanggal(nilai, { kosong = "-" } = {}) {
  const d = keTanggal(nilai);
  if (!d) return kosong;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/** "12 Januari 2026" — untuk kalimat, bukan tabel. */
export function tanggalPanjang(nilai, { kosong = "-" } = {}) {
  const d = keTanggal(nilai);
  if (!d) return kosong;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/** "12 Jan 2026, 14:30" */
export function tanggalWaktu(nilai, { kosong = "-" } = {}) {
  const d = keTanggal(nilai);
  if (!d) return kosong;
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Selisih hari kalender, mengabaikan jam. Positif berarti di masa depan. */
export function selisihHari(nilai, dari = new Date()) {
  const d = keTanggal(nilai);
  if (!d) return null;
  const a = new Date(dari);
  a.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - a) / 86400000);
}

/** "3 hari lagi" / "Hari ini" / "Terlewat 2 hari" */
export function tanggalRelatif(nilai, { kosong = "-" } = {}) {
  const n = selisihHari(nilai);
  if (n === null) return kosong;
  if (n < 0) return `Terlewat ${Math.abs(n)} hari`;
  if (n === 0) return "Hari ini";
  if (n === 1) return "Besok";
  return `${n} hari lagi`;
}

/** Lama sebuah proses berjalan, untuk kolom "Lama Proses". */
export function durasiHari(mulai, selesai) {
  const n = selisihHari(selesai || new Date(), keTanggal(mulai) || new Date());
  if (n === null) return "-";
  return selesai ? `${n} hari (selesai)` : `${n} hari (berjalan)`;
}

/* ============================================================
   Telepon
   ============================================================ */

/** "08123456789" → "0812-3456-789" */
export function telepon(nomor, { kosong = "-" } = {}) {
  const angka = String(nomor ?? "").replace(/[^\d+]/g, "");
  if (!angka) return kosong;
  const inti = angka.startsWith("+62") ? `0${angka.slice(3)}` : angka;
  return inti.replace(/(\d{4})(\d{4})(\d+)/, "$1-$2-$3");
}

/**
 * Bentuk yang diterima wa.me: "08123456789" → "628123456789".
 * Mengembalikan null bila nomornya tidak masuk akal, supaya pemanggil bisa
 * menyembunyikan tombolnya alih-alih membuka tautan yang pasti gagal.
 */
export function nomorWa(nomor) {
  const angka = String(nomor ?? "").replace(/[^\d]/g, "");
  if (angka.length < 8) return null;
  if (angka.startsWith("62")) return angka;
  if (angka.startsWith("0")) return `62${angka.slice(1)}`;
  if (angka.startsWith("8")) return `62${angka}`;
  return angka;
}

/* ============================================================
   Kamus istilah
   ============================================================ */

/** Tahap funnel PRD §4.2, termasuk nilai lama yang masih menempel di baris usang. */
const TAHAP = {
  leads: "New Lead",
  baru: "New Lead",
  cold: "Cold Lead",
  warm: "Warm Lead",
  dihubungi: "Warm Lead",
  hot: "Hot Lead",
  appointment: "Hot Lead",
  booking: "Booking",
  deal: "Booking",
  closing: "Booking",
  kpr: "KPR",
  akad: "Akad",
  aftersales: "Aftersales",
  cancel: "Batal",
};

const STATUS = {
  // konsumen
  proses: "Proses",
  aktif: "Aktif",
  selesai: "Selesai",
  batal: "Batal",
  // pembayaran & dokumen
  menunggu: "Menunggu Bukti",
  menunggu_verifikasi: "Menunggu Verifikasi",
  terverifikasi: "Terverifikasi",
  ditolak: "Ditolak",
  // unit
  tersedia: "Tersedia",
  terjual: "Terjual",
  // lapangan
  belum_mulai: "Belum Mulai",
  berjalan: "Berjalan",
  terlambat: "Terlambat",
  diproses: "Diproses",
  // prioritas
  rendah: "Rendah",
  sedang: "Sedang",
  tinggi: "Tinggi",
};

const JENIS_BAYAR = {
  booking: "Booking Fee",
  dp: "DP",
  dana_talangan: "Dana Talangan",
  termin: "Termin",
  pelunasan: "Pelunasan",
  lainnya: "Lainnya",
};

/** Cadangan untuk nilai yang belum masuk kamus: "dana_talangan" → "Dana Talangan". */
function dariEnum(nilai) {
  return String(nilai)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function labelTahap(nilai) {
  if (!nilai) return "-";
  return TAHAP[nilai] || dariEnum(nilai);
}

export function labelStatus(nilai) {
  if (!nilai) return "-";
  return STATUS[nilai] || dariEnum(nilai);
}

export function labelJenisBayar(nilai) {
  if (!nilai) return "-";
  return JENIS_BAYAR[nilai] || dariEnum(nilai);
}

/** Dipakai Badge: satu pintu untuk ketiga kamus di atas. */
export function labelUmum(nilai) {
  if (!nilai) return "-";
  return TAHAP[nilai] || STATUS[nilai] || JENIS_BAYAR[nilai] || dariEnum(nilai);
}
