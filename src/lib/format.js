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
  if (nilai instanceof Date) return nilai;
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
  menunggu: "Menunggu",
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
