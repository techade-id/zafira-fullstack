/**
 * Pesan pembuka WhatsApp per tahap.
 *
 * Di penjualan properti Indonesia, WhatsApp adalah kanalnya — bukan telepon,
 * bukan surel. Sebelum ini nomor telepon hanyalah teks mati di tabel, sehingga
 * setiap kontak berarti menyalin nomor, membuka aplikasi lain, dan mengetik
 * pembuka dari nol.
 *
 * Kalimat di bawah adalah CADANGAN. Sejak migrasi 014, template sesungguhnya
 * disimpan di `business_settings` kategori `wa_template` dan dapat diubah tim
 * lewat halaman Pengaturan Bisnis — pembuka yang terasa seperti template justru
 * menurunkan tingkat balasan, dan yang paling tahu kalimat yang benar adalah
 * tim sales, bukan pengembang.
 *
 * Cadangan ini tetap ada supaya aksi WhatsApp tidak pernah mati: sebelum
 * migrasi 014 dijalankan, atau bila sebuah tahap belum punya template.
 */

const TEMPLATES = {
  leads: "Halo {nama}, saya {agen} dari Zafira Property. Terima kasih sudah menghubungi kami. Boleh saya bantu jelaskan pilihan unit yang tersedia?",
  cold: "Halo {nama}, saya {agen} dari Zafira Property. Apakah rencana mencari huniannya masih berjalan? Ada beberapa unit baru yang mungkin cocok.",
  warm: "Halo {nama}, saya {agen} dari Zafira Property. Kalau berkenan, kami bisa atur jadwal survei lokasi akhir pekan ini. Kira-kira hari apa yang paling nyaman?",
  hot: "Halo {nama}, saya {agen} dari Zafira Property. Menindaklanjuti obrolan kita, apakah jadwal survei dan simulasi angsurannya sudah bisa kita tetapkan?",
  booking: "Halo {nama}, terima kasih atas booking unit {unit}. Berikut kami kirimkan rincian pembayaran booking fee beserta nomor rekening resminya.",
  kpr: "Halo {nama}, untuk melanjutkan proses KPR unit {unit}, kami masih menunggu kelengkapan berkas berikut. Mohon dikirimkan bila sudah siap.",
  akad: "Halo {nama}, jadwal akad untuk unit {unit} sudah dapat kami koordinasikan. Berikut tanggal dan dokumen yang perlu dibawa.",
  aftersales: "Halo {nama}, terima kasih telah mempercayakan hunian Anda kepada Zafira Property. Bila ada kendala pada unit {unit}, silakan sampaikan kepada kami.",
};

const UMUM = "Halo {nama}, saya {agen} dari Zafira Property. Mohon waktunya sebentar untuk menindaklanjuti kebutuhan hunian Anda.";

/** Nilai lama yang masih menempel di baris usang dipetakan ke tahap sekarang. */
const ALIAS = {
  baru: "leads",
  dihubungi: "warm",
  appointment: "hot",
  deal: "booking",
  closing: "booking",
  proses: "booking",
  aktif: "kpr",
  selesai: "aftersales",
};

/**
 * `dariPengaturan` adalah peta {tahap: teks} dari business_settings. Yang
 * tersimpan di sana selalu menang; TEMPLATES hanya dipakai bila tahapnya belum
 * punya template sendiri.
 */
export function templateWa(tahap, { nama, agen, unit, dariPengaturan } = {}) {
  const kunci = ALIAS[tahap] || tahap;
  const teks = dariPengaturan?.[kunci] || TEMPLATES[kunci] || UMUM;
  return isiPenanda(teks, { nama, agen, unit });
}

export function isiPenanda(teks, { nama, agen, unit } = {}) {
  return String(teks || "")
    .replace(/\{nama\}/g, nama || "Bapak/Ibu")
    .replace(/\{agen\}/g, agen || "tim Zafira Property")
    .replace(/\{unit\}/g, unit || "yang dipesan");
}

export const TAHAP_TEMPLATE = Object.keys(TEMPLATES);
export const TEMPLATE_BAWAAN = TEMPLATES;
