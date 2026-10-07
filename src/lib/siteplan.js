/**
 * Geometri, warna, dan teks untuk siteplan (migrasi 022).
 *
 * Kavling disimpan sebagai `units.bentuk` berformat atribut `points` milik
 * <polygon> SVG ("x,y x,y …") dalam satuan kanvas siteplannya. Semua
 * perhitungan di sini bekerja pada larik titik [[x, y], …] dan baru
 * dikembalikan ke teks saat disimpan.
 */

import { rupiah, rupiahSingkat } from "./format";

/* ============================================================
   Geometri
   ============================================================ */

export function titikDari(bentuk) {
  if (!bentuk) return [];
  return String(bentuk)
    .trim()
    .split(/\s+/)
    .map((p) => p.split(",").map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
}

const bulat1 = (v) => Math.round(v * 10) / 10;

export function keBentuk(titik) {
  return titik.map(([x, y]) => `${bulat1(x)},${bulat1(y)}`).join(" ");
}

/** Rata-rata titik sudut — cukup untuk segi empat, yang merupakan hampir semua kavling. */
export function pusatDari(titik) {
  if (!titik.length) return [0, 0];
  const [sx, sy] = titik.reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
  return [sx / titik.length, sy / titik.length];
}

export function batasDari(titik) {
  const xs = titik.map((p) => p[0]);
  const ys = titik.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Panjang dua sisi pertama — lebar dan kedalaman kavling, apa pun sudutnya. */
export function ukuranDari(titik) {
  if (titik.length < 3) return { a: 0, b: 0 };
  const jarak = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  return { a: jarak(titik[0], titik[1]), b: jarak(titik[1], titik[2]) };
}

/** Sudut sisi pertama, derajat — dipakai untuk menyelaraskan baris baru dengan yang sudah ada. */
export function sudutDari(titik) {
  if (titik.length < 2) return 0;
  return (Math.atan2(titik[1][1] - titik[0][1], titik[1][0] - titik[0][0]) * 180) / Math.PI;
}

export function geserTitik(titik, dx, dy) {
  return titik.map(([x, y]) => [x + dx, y + dy]);
}

export function putarTitik(titik, derajat, [cx, cy]) {
  const r = (derajat * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return titik.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

/** Titik di dalam poligon (ray casting). */
export function diDalam([px, py], titik) {
  let hasil = false;
  for (let i = 0, j = titik.length - 1; i < titik.length; j = i++) {
    const [xi, yi] = titik[i];
    const [xj, yj] = titik[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hasil = !hasil;
  }
  return hasil;
}

/**
 * Satu baris kavling dari garis depannya.
 *
 * Pengguna menarik garis SEPANJANG sisi depan baris (p1 → p2) — bukan kotak
 * sejajar layar — sehingga baris pada denah yang diputar 18° tetap tergambar
 * presisi tanpa harus memutar apa pun sesudahnya. `kedalaman` bertanda: positif
 * ke kanan arah tarikan.
 */
export function petakBaris({ p1, p2, kedalaman, jumlah }) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const panjang = Math.hypot(dx, dy);
  const n = Math.max(1, Math.floor(jumlah) || 1);
  if (panjang < 0.5) return [];
  const ux = dx / panjang;
  const uy = dy / panjang;
  // Normal: putar 90° searah jarum jam pada koordinat layar (y ke bawah).
  const nx = -uy * kedalaman;
  const ny = ux * kedalaman;
  const s = panjang / n;
  const hasil = [];
  for (let i = 0; i < n; i++) {
    const a = [p1[0] + ux * s * i, p1[1] + uy * s * i];
    const b = [p1[0] + ux * s * (i + 1), p1[1] + uy * s * (i + 1)];
    hasil.push([a, b, [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]]);
  }
  return hasil;
}

/** Kode berurutan: awalan "A", mulai 1, format "A1" | "A-01" | "A01". */
export function kodeBerurut({ awalan, mulai, jumlah, format = "polos", turun = false }) {
  const n = Math.max(1, Math.floor(jumlah) || 1);
  const awal = Number.isFinite(Number(mulai)) ? Number(mulai) : 1;
  const nomor = Array.from({ length: n }, (_, i) => (turun ? awal + n - 1 - i : awal + i));
  const lebar = Math.max(2, String(awal + n - 1).length);
  return nomor.map((k) => {
    const a = (awalan || "").trim();
    if (format === "strip") return `${a}-${String(k).padStart(lebar, "0")}`;
    if (format === "nol") return `${a}${String(k).padStart(lebar, "0")}`;
    return `${a}${k}`;
  });
}

/** Urutan alami: A2 sebelum A10. */
export function urutKode(a, b) {
  return String(a || "").localeCompare(String(b || ""), "id-ID", { numeric: true, sensitivity: "base" });
}

/* ============================================================
   Kamus atribut
   ============================================================ */

export const POSISI = [
  { value: "standar", label: "Standar" },
  { value: "hook", label: "Hook (sudut)" },
  { value: "dekat_fasum", label: "Dekat fasum" },
  { value: "jalan_utama", label: "Jalan utama" },
];

export const HADAP = [
  { value: "utara", label: "Utara" },
  { value: "timur_laut", label: "Timur Laut" },
  { value: "timur", label: "Timur" },
  { value: "tenggara", label: "Tenggara" },
  { value: "selatan", label: "Selatan" },
  { value: "barat_daya", label: "Barat Daya" },
  { value: "barat", label: "Barat" },
  { value: "barat_laut", label: "Barat Laut" },
];

export const JENIS_FASILITAS = [
  { value: "fasum", label: "Fasum" },
  { value: "taman", label: "Taman / RTH" },
  { value: "ibadah", label: "Tempat ibadah" },
  { value: "jalan", label: "Jalan" },
  { value: "komersial", label: "Komersial" },
  { value: "lainnya", label: "Lainnya" },
];

export const labelPosisi = (v) => POSISI.find((p) => p.value === v)?.label || "";
export const labelHadap = (v) => HADAP.find((p) => p.value === v)?.label || "";

export const TAHAP_KPR = [
  { key: "booking", label: "Booking" },
  { key: "dp", label: "DP" },
  { key: "bank", label: "Masuk Bank" },
  { key: "sp3k", label: "SP3K" },
  { key: "akad", label: "Akad" },
  { key: "serah_terima", label: "Serah Terima" },
];

/* ============================================================
   Status dan hold
   ============================================================ */

/** Hold yang masih berlaku pada saat `sekarang` — RPC sudah menyaring, ini menjaga hitung mundur. */
export function holdAktif(k, sekarang = Date.now()) {
  return k?.hold && new Date(k.hold.berakhir).getTime() > sekarang ? k.hold : null;
}

/** Status jual seperti dilihat tim: tersedia yang ditahan menjadi "ditahan". */
export function statusJual(k, sekarang) {
  if (k.status === "tersedia" && holdAktif(k, sekarang)) return "ditahan";
  return k.status;
}

/** "5 jam 12 mnt" / "38 mnt" / "habis". */
export function sisaWaktu(berakhir, sekarang = Date.now()) {
  const ms = new Date(berakhir).getTime() - sekarang;
  if (!(ms > 0)) return "habis";
  const menit = Math.floor(ms / 60000);
  const jam = Math.floor(menit / 60);
  if (jam >= 24) return `${Math.floor(jam / 24)} hari ${jam % 24} jam`;
  if (jam >= 1) return `${jam} jam ${menit % 60} mnt`;
  return `${Math.max(1, menit)} mnt`;
}

/* ============================================================
   Warna per mode peta
   ============================================================
   Divalidasi dengan validator palet dataviz:
   · Status — kategorikal, SEMUA pasangan (kavling mana pun bisa
     bertetangga) lolos CVD dan normal-vision. Tersedia/ditahan/booking/
     terjual juga berbeda kecerahan, jadi tetap terbaca dalam skala abu.
     Ditahan memakai garis putus-putus sebagai pengode kedua.
   · KPR, pembayaran, progres, minat — ramp ordinal satu warna, terang ke
     gelap, ujung terang ≥ 2:1 terhadap latar.
   Teks di dalam isi memakai putih atau tinta menurut kecerahan isinya. */

const TINTA = "#111B2E";

function luminans(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Putih bila kontrasnya terhadap isi ≥ 4.5:1, selain itu tinta. */
export function tintaUntuk(isi) {
  return 1.05 / (luminans(isi) + 0.05) >= 4.5 ? "#FFFFFF" : TINTA;
}

function g(isi, garis, extra = {}) {
  return { isi, garis, teks: tintaUntuk(isi), ...extra };
}

const NETRAL = g("#F1F4F9", "#C7D3EA", { teks: "#64748B" });

/** Mode peta: kategori berurutan (untuk legenda) dan fungsi penggolongnya. */
export const MODE_PETA = {
  status: {
    label: "Status Jual",
    kategori: [
      { key: "tersedia", label: "Tersedia", gaya: g("#DCF0E3", "#15803D") },
      { key: "ditahan", label: "Ditahan", gaya: g("#C4B0E8", "#6D45B0", { putus: true }) },
      { key: "booking", label: "Booking", gaya: g("#EE7B47", "#B93F0F") },
      { key: "terjual", label: "Terjual", gaya: g("#1F4A8F", "#0F2A5C") },
      { key: "batal", label: "Batal", gaya: g("#F4F6FA", "#C2413B", { putus: true }) },
    ],
    golongkan: (k, t) => statusJual(k, t),
  },
  kpr: {
    label: "Tahap KPR",
    kategori: [
      { key: "belum", label: "Belum terjual", gaya: NETRAL },
      { key: "booking", label: "Booking", gaya: g("#9FB4DD", "#6283C2") },
      { key: "dp", label: "DP", gaya: g("#7F9BD0", "#466BB0") },
      { key: "bank", label: "Masuk Bank", gaya: g("#6283C2", "#2F5596") },
      { key: "sp3k", label: "SP3K", gaya: g("#466BB0", "#1B3F78") },
      { key: "akad", label: "Akad", gaya: g("#2F5596", "#14305C") },
      { key: "serah_terima", label: "Serah Terima", gaya: g("#1B3F78", "#0A1D42") },
      { key: "tertutup", label: "Data tim lain", gaya: g("#E8EDF7", "#9FB4DD", { putus: true, teks: "#64748B" }) },
    ],
    golongkan: (k) => {
      if (k.kpr?.tahap) return k.kpr.tahap;
      if (k.status === "booking" || k.status === "terjual") return "tertutup";
      return "belum";
    },
  },
  bayar: {
    label: "Pembayaran",
    kategori: [
      { key: "belum", label: "Belum terjual", gaya: NETRAL },
      { key: "belum_bayar", label: "Belum ada bayar", gaya: g("#7FC398", "#2E8752") },
      { key: "booking_fee", label: "Booking fee masuk", gaya: g("#52A774", "#196538") },
      { key: "dp_berjalan", label: "DP berjalan", gaya: g("#2E8752", "#124A29") },
      { key: "lunas", label: "DP lunas / akad", gaya: g("#196538", "#0B3A1F") },
      { key: "tertutup", label: "Data tim lain", gaya: g("#E8EDF7", "#9FB4DD", { putus: true, teks: "#64748B" }) },
    ],
    golongkan: (k) => {
      if (!k.konsumen) return k.status === "booking" || k.status === "terjual" ? "tertutup" : "belum";
      const b = k.bayar || {};
      const tahap = k.kpr?.tahap;
      const totalDp = Number(k.kpr?.nominal_total_dp) || 0;
      if (tahap === "akad" || tahap === "serah_terima" || (totalDp > 0 && Number(b.dp_terverifikasi) >= totalDp)) return "lunas";
      if (Number(b.dp_terverifikasi) > 0) return "dp_berjalan";
      if (b.booking_terverifikasi) return "booking_fee";
      return "belum_bayar";
    },
    // Pembayaran yang menunggu Finance ditandai garis aksen, di atas golongan mana pun.
    sorot: (k) => Number(k.bayar?.menunggu_verifikasi) > 0,
    labelSorot: "Menunggu verifikasi Finance",
  },
  progres: {
    label: "Progres Bangun",
    kategori: [
      { key: "belum", label: "Belum ada data", gaya: NETRAL },
      { key: "mulai", label: "Belum mulai", gaya: g("#74C0B8", "#22857C") },
      { key: "awal", label: "Di bawah 50%", gaya: g("#45A59C", "#0E625B") },
      { key: "lanjut", label: "50% ke atas", gaya: g("#22857C", "#0B4A45") },
      { key: "selesai", label: "Selesai", gaya: g("#0E625B", "#073632") },
    ],
    golongkan: (k) => {
      const p = k.progres;
      if (!p) return "belum";
      const n = Number(p.persen) || 0;
      if (p.status === "selesai" || n >= 100) return "selesai";
      if (n >= 50) return "lanjut";
      if (n > 0) return "awal";
      return "mulai";
    },
    sorot: (k) => k.progres?.status === "terlambat",
    labelSorot: "Terlambat dari target",
  },
  minat: {
    label: "Minat Prospek",
    kategori: [
      { key: "tidak", label: "Tidak tersedia", gaya: g("#F4F6FA", "#E3E8F0", { teks: "#94A3B8" }) },
      { key: "nol", label: "Belum ada peminat", gaya: NETRAL },
      { key: "satu", label: "1 peminat", gaya: g("#F29870", "#C9501C") },
      { key: "dua", label: "2 peminat", gaya: g("#E06A35", "#9A3A0E") },
      { key: "banyak", label: "3+ peminat", gaya: g("#B04615", "#6E2A08") },
    ],
    golongkan: (k, t) => {
      if (statusJual(k, t) !== "tersedia" && statusJual(k, t) !== "ditahan") return "tidak";
      const n = Number(k.minat) || 0;
      if (n >= 3) return "banyak";
      if (n === 2) return "dua";
      if (n === 1) return "satu";
      return "nol";
    },
  },
};

export const URUTAN_MODE = ["status", "kpr", "bayar", "progres", "minat"];

export function gayaKategori(mode, key) {
  return MODE_PETA[mode]?.kategori.find((c) => c.key === key)?.gaya || NETRAL;
}

/** Status yang boleh dilihat calon pembeli: tanpa siapa, hanya apa. */
export const STATUS_PUBLIK = [
  { key: "tersedia", label: "Tersedia", gaya: g("#DCF0E3", "#15803D") },
  { key: "dipesan", label: "Sudah dipesan", gaya: g("#EE7B47", "#B93F0F") },
  { key: "terjual", label: "Terjual", gaya: g("#1F4A8F", "#0F2A5C") },
  { key: "tidak_tersedia", label: "Tidak tersedia", gaya: NETRAL },
];

export function statusPublikDari(k, sekarang) {
  const s = statusJual(k, sekarang);
  if (s === "tersedia") return "tersedia";
  if (s === "ditahan" || s === "booking") return "dipesan";
  if (s === "terjual") return "terjual";
  return "tidak_tersedia";
}

/** Gaya fasilitas per jenis — ditulis tenang supaya kavling tetap yang menonjol. */
export const GAYA_FASILITAS = {
  fasum: { isi: "#E8EDF7", garis: "#0F2A5C", teks: "#0F2A5C" },
  taman: { isi: "#E3F1E3", garis: "#4E8A57", teks: "#2F5E36" },
  ibadah: { isi: "#E8EDF7", garis: "#0F2A5C", teks: "#0F2A5C" },
  jalan: { isi: "#EEF0F3", garis: "#A0AABA", teks: "#516079" },
  komersial: { isi: "#F7EEDC", garis: "#A87C10", teks: "#6B4E05" },
  lainnya: { isi: "#F1F4F9", garis: "#94A3B8", teks: "#516079" },
};

/* ============================================================
   Ringkasan
   ============================================================ */

export function ringkasKavling(kavling, sekarang) {
  const r = { total: kavling.length, tersedia: 0, ditahan: 0, booking: 0, terjual: 0, batal: 0, nilaiStok: 0, nilaiTerjual: 0 };
  for (const k of kavling) {
    const s = statusJual(k, sekarang);
    r[s] = (r[s] || 0) + 1;
    const harga = Number(k.price) || 0;
    if (s === "tersedia" || s === "ditahan") r.nilaiStok += harga;
    if (s === "booking" || s === "terjual") r.nilaiTerjual += harga;
  }
  r.laku = r.booking + r.terjual;
  r.terserap = r.total ? r.laku / r.total : 0;
  return r;
}

/** Baris per kelompok (tipe / blok) untuk tabel dan grafik batang bertumpuk. */
export function kelompokkan(kavling, kunci, sekarang) {
  const peta = new Map();
  for (const k of kavling) {
    const nama = (kunci === "tipe" ? k.type : k.block) || "Tanpa " + (kunci === "tipe" ? "tipe" : "blok");
    if (!peta.has(nama)) peta.set(nama, { nama, total: 0, tersedia: 0, ditahan: 0, booking: 0, terjual: 0, batal: 0, hargaMin: null, hargaMaks: null });
    const r = peta.get(nama);
    const s = statusJual(k, sekarang);
    r.total += 1;
    r[s] = (r[s] || 0) + 1;
    const h = Number(k.price);
    if (Number.isFinite(h) && h > 0 && (s === "tersedia" || s === "ditahan")) {
      r.hargaMin = r.hargaMin === null ? h : Math.min(r.hargaMin, h);
      r.hargaMaks = r.hargaMaks === null ? h : Math.max(r.hargaMaks, h);
    }
  }
  return [...peta.values()].sort((a, b) => urutKode(a.nama, b.nama));
}

/* ============================================================
   Teks untuk dibagikan
   ============================================================ */

export function atributRingkas(k) {
  const tipe = k.type || k.tipe;
  const lt = k.luas_tanah;
  const lb = k.luas_bangunan;
  return [
    tipe && `Tipe ${tipe}`,
    lt && `LT ${Number(lt).toLocaleString("id-ID")} m²`,
    lb && `LB ${Number(lb).toLocaleString("id-ID")} m²`,
    k.posisi && k.posisi !== "standar" && labelPosisi(k.posisi),
    k.hadap && `hadap ${labelHadap(k.hadap).toLowerCase()}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Satu kavling, siap dikirim lewat WhatsApp ke calon pembeli. */
export function pesanWaKavling(k, { proyek, siteplan, tautan, tampilHarga = true } = {}) {
  const harga = tampilHarga && k.price ? `\nHarga: ${rupiah(k.price)}` : "";
  const atribut = atributRingkas(k);
  return [
    `Info unit *${k.unit_code || k.kode}* — ${[proyek, siteplan].filter(Boolean).join(", ")}`,
    atribut && `${atribut}${harga}`,
    !atribut && harga.trim(),
    tautan && `\nLihat posisinya di siteplan: ${tautan}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Daftar stok tersedia per tipe — pesan broadcast yang biasa dikirim tim ke grup. */
export function teksStokWa(kavling, { proyek, siteplan, tautan, tampilHarga = true, sekarang } = {}) {
  const tersedia = kavling.filter((k) => statusJual(k, sekarang) === "tersedia");
  const perTipe = new Map();
  for (const k of [...tersedia].sort((a, b) => urutKode(a.unit_code, b.unit_code))) {
    const t = k.type || "Lainnya";
    if (!perTipe.has(t)) perTipe.set(t, []);
    perTipe.get(t).push(k);
  }
  const baris = [`*Unit tersedia — ${[proyek, siteplan].filter(Boolean).join(", ")}*`, `${tersedia.length} dari ${kavling.length} kavling`, ""];
  for (const [tipe, daftar] of perTipe) {
    const harga = daftar.map((k) => Number(k.price)).filter((h) => h > 0);
    const mulai = tampilHarga && harga.length ? ` · mulai ${rupiahSingkat(Math.min(...harga))}` : "";
    baris.push(`*Tipe ${tipe}* (${daftar.length} unit${mulai})`);
    baris.push(daftar.map((k) => k.unit_code + (k.posisi === "hook" ? " (hook)" : "")).join(", "));
    baris.push("");
  }
  if (tautan) baris.push(`Siteplan & ketersediaan langsung: ${tautan}`);
  return baris.join("\n").trim();
}

export function tautanPublik(token) {
  return `${window.location.origin}/s/${token}`;
}

/* ============================================================
   Simulasi KPR
   ============================================================ */

/** Angsuran anuitas per bulan. */
export function angsuranBulanan(pokok, bungaTahunanPersen, tenorTahun) {
  const n = Math.round(tenorTahun * 12);
  const r = bungaTahunanPersen / 100 / 12;
  if (!(pokok > 0) || !(n > 0)) return 0;
  if (r === 0) return pokok / n;
  return (pokok * r) / (1 - (1 + r) ** -n);
}
